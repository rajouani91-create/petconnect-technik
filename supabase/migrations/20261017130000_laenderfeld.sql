-- Vorbereitung für weitere Länder: Länderfeld (ISO 3166-1 alpha-2) an Praxen und Postleitzahlen.
-- Postleitzahlen sind nur je Land eindeutig (z. B. 75001 gibt es in DE und FR) → Primärschlüssel (country, postcode).
-- Signaturen der Such-Funktionen bleiben unverändert; bis weitere Länder kommen, ist alles 'DE'.

alter table public.practices add column if not exists country char(2) not null default 'DE' check (country ~ '^[A-Z]{2}$');
alter table public.postal_codes add column if not exists country char(2) not null default 'DE' check (country ~ '^[A-Z]{2}$');

alter table public.postal_codes drop constraint if exists postal_codes_pkey;
alter table public.postal_codes add primary key (country, postcode);
create index if not exists practices_country_idx on public.practices(country);

-- Import: Land mitschreiben (bisher nur Deutschland)
create or replace function private.import_osm_state(p_iso text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare j jsonb; n_pr int; n_pc int; v_country text := split_part(p_iso, '-', 1);
begin
  if p_iso !~ '^[A-Z]{2}-[A-Z0-9]{1,3}$' then raise exception 'bad_state'; end if;
  j := private.overpass(format('[out:json][timeout:200];area["ISO3166-2"="%s"]->.a;nwr["amenity"="veterinary"](area.a);out tags center;', p_iso));
  with e as (select jsonb_array_elements(j->'elements') x),
  p as (
    select x->>'type' as t, (x->>'id')::bigint as oid,
           coalesce((x->>'lat')::float8, (x->'center'->>'lat')::float8) as lat,
           coalesce((x->>'lon')::float8, (x->'center'->>'lon')::float8) as lon,
           x->'tags' as g from e)
  insert into public.practices as pr (source, osm_type, osm_id, country, name, street, housenumber, postcode, city, lat, lon, phone, website, email, opening_hours, active, last_seen_at, updated_at)
  select 'osm', t, oid, v_country, left(g->>'name', 200),
         left(g->>'addr:street',200), left(g->>'addr:housenumber',20), left(g->>'addr:postcode',10), left(coalesce(g->>'addr:city', g->>'addr:suburb'),120),
         lat, lon,
         left(coalesce(g->>'phone', g->>'contact:phone'),60), left(coalesce(g->>'website', g->>'contact:website'),300),
         left(coalesce(g->>'email', g->>'contact:email'),200), left(g->>'opening_hours',500), true, now(), now()
  from p where lat is not null and lon is not null and coalesce(btrim(g->>'name'),'') <> ''
  on conflict (osm_type, osm_id) do update set
    country = excluded.country,
    name = excluded.name, street = excluded.street, housenumber = excluded.housenumber, postcode = excluded.postcode,
    city = excluded.city, lat = excluded.lat, lon = excluded.lon, phone = excluded.phone, website = excluded.website,
    email = excluded.email, opening_hours = excluded.opening_hours, active = true, last_seen_at = now(), updated_at = now()
  where not pr.registered;
  get diagnostics n_pr = row_count;
  perform pg_sleep(5);
  j := private.overpass(format('[out:json][timeout:200];area["ISO3166-2"="%s"]->.a;relation["boundary"="postal_code"]["postal_code"](area.a);out tags center;', p_iso));
  insert into public.postal_codes as pc (country, postcode, place, lat, lon)
  select distinct on (x->'tags'->>'postal_code')
         v_country, x->'tags'->>'postal_code', left(btrim(regexp_replace(coalesce(x->'tags'->>'note', x->'tags'->>'name',''), '^[0-9]{5}\s*', '')), 120),
         (x->'center'->>'lat')::float8, (x->'center'->>'lon')::float8
  from jsonb_array_elements(j->'elements') x
  where x->'tags'->>'postal_code' ~ '^[0-9]{5}$' and x->'center' is not null
  on conflict (country, postcode) do update set place = excluded.place, lat = excluded.lat, lon = excluded.lon;
  get diagnostics n_pc = row_count;
  return jsonb_build_object('state', p_iso, 'practices', n_pr, 'postcodes', n_pc);
end; $$;
revoke all on function private.import_osm_state(text) from public, anon, authenticated;
