-- OSM-Import robuster: pro Bundesland abfragen (kleinere Anfragen), Fehler je Land protokollieren,
-- Deaktivieren verschwundener Praxen nur, wenn alle Länder erfolgreich waren.

create table if not exists private.import_log (id bigserial primary key, at timestamptz default now(), job text, result jsonb, error text);

create or replace function private.overpass(p_query text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_ep text; v_res extensions.http_response; v_try int;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '240');
  for v_try in 1..2 loop
    foreach v_ep in array array['https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter','https://overpass.kumi.systems/api/interpreter'] loop
      begin
        v_res := extensions.http_get(v_ep || '?data=' || extensions.urlencode(p_query));
        if v_res.status = 200 and left(ltrim(v_res.content), 1) = '{' then
          return v_res.content::jsonb;
        end if;
      exception when others then null;
      end;
    end loop;
    perform pg_sleep(20);
  end loop;
  raise exception 'overpass_unavailable';
end; $$;

create or replace function private.import_osm_state(p_iso text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare j jsonb; n_pr int; n_pc int;
begin
  if p_iso !~ '^DE-[A-Z]{2}$' then raise exception 'bad_state'; end if;
  -- Praxen
  j := private.overpass(format('[out:json][timeout:200];area["ISO3166-2"="%s"]->.a;nwr["amenity"="veterinary"](area.a);out tags center;', p_iso));
  with e as (select jsonb_array_elements(j->'elements') x),
  p as (
    select x->>'type' as t, (x->>'id')::bigint as oid,
           coalesce((x->>'lat')::float8, (x->'center'->>'lat')::float8) as lat,
           coalesce((x->>'lon')::float8, (x->'center'->>'lon')::float8) as lon,
           x->'tags' as g from e)
  insert into public.practices as pr (source, osm_type, osm_id, name, street, housenumber, postcode, city, lat, lon, phone, website, email, opening_hours, active, last_seen_at, updated_at)
  select 'osm', t, oid, left(g->>'name', 200),
         left(g->>'addr:street',200), left(g->>'addr:housenumber',20), left(g->>'addr:postcode',10), left(coalesce(g->>'addr:city', g->>'addr:suburb'),120),
         lat, lon,
         left(coalesce(g->>'phone', g->>'contact:phone'),60), left(coalesce(g->>'website', g->>'contact:website'),300),
         left(coalesce(g->>'email', g->>'contact:email'),200), left(g->>'opening_hours',500), true, now(), now()
  from p where lat is not null and lon is not null and coalesce(btrim(g->>'name'),'') <> ''
  on conflict (osm_type, osm_id) do update set
    name = excluded.name, street = excluded.street, housenumber = excluded.housenumber, postcode = excluded.postcode,
    city = excluded.city, lat = excluded.lat, lon = excluded.lon, phone = excluded.phone, website = excluded.website,
    email = excluded.email, opening_hours = excluded.opening_hours, active = true, last_seen_at = now(), updated_at = now()
  where not pr.registered;
  get diagnostics n_pr = row_count;
  perform pg_sleep(5);
  -- Postleitzahlen
  j := private.overpass(format('[out:json][timeout:200];area["ISO3166-2"="%s"]->.a;relation["boundary"="postal_code"]["postal_code"](area.a);out tags center;', p_iso));
  insert into public.postal_codes as pc (postcode, place, lat, lon)
  select distinct on (x->'tags'->>'postal_code')
         x->'tags'->>'postal_code', left(btrim(regexp_replace(coalesce(x->'tags'->>'note', x->'tags'->>'name',''), '^[0-9]{5}\s*', '')), 120),
         (x->'center'->>'lat')::float8, (x->'center'->>'lon')::float8
  from jsonb_array_elements(j->'elements') x
  where x->'tags'->>'postal_code' ~ '^[0-9]{5}$' and x->'center' is not null
  on conflict (postcode) do update set place = excluded.place, lat = excluded.lat, lon = excluded.lon;
  get diagnostics n_pc = row_count;
  return jsonb_build_object('state', p_iso, 'practices', n_pr, 'postcodes', n_pc);
end; $$;

-- Alle Länder nacheinander; jedes Land in eigenem Unterblock, Fehler werden protokolliert.
create or replace function private.import_osm_all() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_start timestamptz := now(); v_iso text; v_ok int := 0; v_err int := 0; n_off int := 0; r jsonb;
begin
  foreach v_iso in array array['DE-BW','DE-BY','DE-BE','DE-BB','DE-HB','DE-HH','DE-HE','DE-MV','DE-NI','DE-NW','DE-RP','DE-SL','DE-SN','DE-ST','DE-SH','DE-TH'] loop
    begin
      r := private.import_osm_state(v_iso);
      insert into private.import_log(job, result) values ('osm '||v_iso, r);
      v_ok := v_ok + 1;
    exception when others then
      insert into private.import_log(job, error) values ('osm '||v_iso, sqlerrm);
      v_err := v_err + 1;
    end;
    perform pg_sleep(10);
  end loop;
  if v_err = 0 then
    update public.practices set active = false, updated_at = now()
     where source = 'osm' and not registered and active and last_seen_at < v_start;
    get diagnostics n_off = row_count;
  end if;
  r := jsonb_build_object('ok', v_ok, 'errors', v_err, 'deactivated', n_off);
  insert into private.import_log(job, result) values ('osm gesamt', r);
  return r;
end; $$;

revoke all on function private.overpass(text), private.import_osm_state(text), private.import_osm_all() from public, anon, authenticated;

revoke all on function private.import_osm_practices(), private.import_osm_postcodes() from public, anon, authenticated;

select cron.unschedule(jobname) from cron.job where jobname in ('osm-praxen-import','osm-plz-import');
-- Monatlich am 1. um 03:17 UTC; eigener Zeitrahmen, da der Import mehrere Minuten dauert
select cron.schedule('osm-import', '17 3 1 * *', $$set statement_timeout = '60min'; select private.import_osm_all();$$);
