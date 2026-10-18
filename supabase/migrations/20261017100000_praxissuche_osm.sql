-- Teil 7: Praxissuche mit Praxisdaten aus OpenStreetMap (ODbL, © OpenStreetMap-Mitwirkende).
-- Grunddaten (Name, Adresse, Lage, Telefon, Web, Öffnungszeiten) für alle Praxen aus OSM.
-- Angebot (Tierarten, Leistungen, Fachtitel) nur für Praxen mit Profil – später von den Praxen selbst gepflegt.
-- Lesen: angemeldete Nutzer:innen. Schreiben: nur Server (Import-Job) bzw. später Praxis-Konten.

create extension if not exists http with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- ---------- Praxen ----------
create table public.practices (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'osm' check (source in ('osm','petconnect')),
  osm_type text check (osm_type in ('node','way','relation')),
  osm_id bigint,
  name text not null,
  street text, housenumber text, postcode text, city text,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  phone text, website text, email text,
  opening_hours text,                       -- OSM-Syntax, Auswertung in der App
  registered boolean not null default false, -- Praxis ist bei PetConnect
  active boolean not null default true,      -- false: in OSM nicht mehr vorhanden
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (osm_type, osm_id)
);
create index practices_geo_idx on public.practices(lat, lon) where active;
create index practices_postcode_idx on public.practices(postcode);

-- Angebot einer Praxis (Schlüssel siehe Auftrag 08)
create table public.practice_profiles (
  practice_id uuid primary key references public.practices(id) on delete cascade,
  species text[] not null default '{}',
  services text[] not null default '{}',
  titles text[] not null default '{}',
  focus text[] not null default '{}',
  titles_verified boolean not null default false,  -- erst nach Abgleich mit der Tierärztekammer
  updated_at timestamptz not null default now()
);

-- Postleitzahlen (Mittelpunkt) für die Ortssuche, ebenfalls aus OSM
create table public.postal_codes (
  postcode text primary key,
  place text,
  lat double precision not null,
  lon double precision not null
);
create index postal_codes_place_idx on public.postal_codes(lower(place));

-- Favoriten je Person
create table public.practice_favorites (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  practice_id uuid not null references public.practices(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, practice_id)
);
create index practice_favorites_practice_idx on public.practice_favorites(practice_id);

-- „Praxis einladen“: Wunsch von Halter:innen, wird NICHT automatisch versendet
create table public.practice_invite_requests (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  practice_id uuid not null references public.practices(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, practice_id)
);
create index practice_invite_requests_practice_idx on public.practice_invite_requests(practice_id);

alter table public.practices enable row level security;
alter table public.practice_profiles enable row level security;
alter table public.postal_codes enable row level security;
alter table public.practice_favorites enable row level security;
alter table public.practice_invite_requests enable row level security;

create policy "praxen lesen" on public.practices for select to authenticated using (active);
create policy "praxisprofile lesen" on public.practice_profiles for select to authenticated using (true);
create policy "plz lesen" on public.postal_codes for select to authenticated using (true);
create policy "favoriten lesen" on public.practice_favorites for select to authenticated using (user_id = (select auth.uid()));
create policy "favoriten anlegen" on public.practice_favorites for insert to authenticated with check (user_id = (select auth.uid()));
create policy "favoriten loeschen" on public.practice_favorites for delete to authenticated using (user_id = (select auth.uid()));
create policy "einladungswunsch lesen" on public.practice_invite_requests for select to authenticated using (user_id = (select auth.uid()));
create policy "einladungswunsch anlegen" on public.practice_invite_requests for insert to authenticated with check (user_id = (select auth.uid()));
create policy "einladungswunsch loeschen" on public.practice_invite_requests for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.practices, public.practice_profiles, public.postal_codes, public.practice_favorites, public.practice_invite_requests from anon, authenticated;
grant select on public.practices, public.practice_profiles, public.postal_codes to authenticated;
grant select, insert, delete on public.practice_favorites, public.practice_invite_requests to authenticated;

-- ---------- Suche ----------
-- Entfernung in km (Haversine)
create or replace function private.km(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision language sql immutable parallel safe set search_path = '' as $$
  select 6371.0 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)));
$$;
grant execute on function private.km(double precision, double precision, double precision, double precision) to authenticated;

-- Ort oder PLZ → Mittelpunkt
create or replace function public.geocode_place(p_q text)
returns table (postcode text, place text, lat double precision, lon double precision)
language sql stable security invoker set search_path = '' as $$
  with q as (select btrim(coalesce(p_q,'')) as s)
  select pc.postcode, pc.place, pc.lat, pc.lon from public.postal_codes pc, q
  where q.s <> '' and (
        (q.s ~ '^[0-9]{5}$' and pc.postcode = q.s)
     or (q.s !~ '^[0-9]+$' and lower(pc.place) like lower(replace(replace(replace(q.s,'\','\\'),'%','\%'),'_','\_')) || '%'))
  order by (lower(pc.place) = lower((select s from q))) desc, pc.place, pc.postcode
  limit 10;
$$;

-- Praxen im Umkreis, mit Angebot und Trefferkennzeichen
create or replace function public.search_practices(
  p_lat double precision, p_lon double precision, p_radius_km integer default 10,
  p_species text default null, p_services text[] default '{}', p_titles text[] default '{}',
  p_q text default null, p_limit integer default 100)
returns table (
  id uuid, name text, street text, housenumber text, postcode text, city text,
  lat double precision, lon double precision, distance_km double precision,
  phone text, website text, opening_hours text, registered boolean,
  has_profile boolean, species text[], services text[], titles text[], focus text[], titles_verified boolean,
  matches boolean, is_favorite boolean)
language sql stable security invoker set search_path = '' as $$
  with box as (
    select greatest(1, least(coalesce(p_radius_km,10), 100))::double precision as r,
           p_lat as la, p_lon as lo
  ), c as (
    select p.*, pp.practice_id is not null as hp, pp.species sp, pp.services sv, pp.titles ti, pp.focus fo, coalesce(pp.titles_verified,false) tv,
           private.km(b.la, b.lo, p.lat, p.lon) as d, b.r
    from public.practices p
    cross join box b
    left join public.practice_profiles pp on pp.practice_id = p.id
    where p.active
      and p.lat between b.la - b.r / 111.0 and b.la + b.r / 111.0
      and p.lon between b.lo - b.r / (111.0 * cos(radians(b.la))) and b.lo + b.r / (111.0 * cos(radians(b.la)))
      and (coalesce(btrim(p_q),'') = '' or p.name ilike '%' || replace(replace(replace(btrim(p_q),'\','\\'),'%','\%'),'_','\_') || '%')
  )
  select c.id, c.name, c.street, c.housenumber, c.postcode, c.city, c.lat, c.lon, round(c.d::numeric, 1)::double precision,
         c.phone, c.website, c.opening_hours, c.registered,
         c.hp, coalesce(c.sp,'{}'), coalesce(c.sv,'{}'), coalesce(c.ti,'{}'), coalesce(c.fo,'{}'), c.tv,
         (c.hp
           and (p_species is null or p_species = '' or p_species = any(c.sp))
           and coalesce(p_services,'{}') <@ coalesce(c.sv,'{}')
           and coalesce(p_titles,'{}') <@ coalesce(c.ti,'{}')) as matches,
         exists (select 1 from public.practice_favorites f where f.practice_id = c.id and f.user_id = (select auth.uid()))
  from c
  where c.d <= c.r
  order by c.d
  limit greatest(1, least(coalesce(p_limit,100), 300));
$$;
revoke all on function public.geocode_place(text), public.search_practices(double precision,double precision,integer,text,text[],text[],text,integer) from public, anon;
grant execute on function public.geocode_place(text), public.search_practices(double precision,double precision,integer,text,text[],text[],text,integer) to authenticated;

-- ---------- Import aus OpenStreetMap (Overpass) ----------
create or replace function private.overpass(p_query text) returns jsonb
language plpgsql volatile security definer set search_path = '' set statement_timeout = '600s' as $$
declare v_ep text; v_res extensions.http_response;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '300');
  foreach v_ep in array array['https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter','https://overpass.kumi.systems/api/interpreter'] loop
    begin
      v_res := extensions.http_get(v_ep || '?data=' || extensions.urlencode(p_query));
      if v_res.status = 200 and left(ltrim(v_res.content), 1) = '{' then
        return v_res.content::jsonb;
      end if;
    exception when others then null;
    end;
  end loop;
  raise exception 'overpass_unavailable';
end; $$;

create or replace function private.import_osm_practices() returns jsonb
language plpgsql volatile security definer set search_path = '' set statement_timeout = '900s' as $$
declare j jsonb; v_start timestamptz := now(); n_up int; n_off int;
begin
  j := private.overpass('[out:json][timeout:600];area["ISO3166-1"="DE"][admin_level=2]->.de;nwr["amenity"="veterinary"](area.de);out tags center;');
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
  where not pr.registered;   -- registrierte Praxen pflegen ihre Daten selbst
  get diagnostics n_up = row_count;
  update public.practices set active = false, updated_at = now()
   where source = 'osm' and not registered and active and last_seen_at < v_start;
  get diagnostics n_off = row_count;
  return jsonb_build_object('upserted', n_up, 'deactivated', n_off, 'at', now());
end; $$;

create or replace function private.import_osm_postcodes() returns jsonb
language plpgsql volatile security definer set search_path = '' set statement_timeout = '900s' as $$
declare j jsonb; n int;
begin
  j := private.overpass('[out:json][timeout:600];area["ISO3166-1"="DE"][admin_level=2]->.de;relation["boundary"="postal_code"]["postal_code"](area.de);out tags center;');
  insert into public.postal_codes as pc (postcode, place, lat, lon)
  select distinct on (x->'tags'->>'postal_code')
         x->'tags'->>'postal_code', left(btrim(regexp_replace(coalesce(x->'tags'->>'note', x->'tags'->>'name',''), '^[0-9]{5}\s*', '')), 120),
         (x->'center'->>'lat')::float8, (x->'center'->>'lon')::float8
  from jsonb_array_elements(j->'elements') x
  where x->'tags'->>'postal_code' ~ '^[0-9]{5}$' and x->'center' is not null
  on conflict (postcode) do update set place = excluded.place, lat = excluded.lat, lon = excluded.lon;
  get diagnostics n = row_count;
  return jsonb_build_object('postcodes', n, 'at', now());
end; $$;

revoke all on function private.overpass(text), private.import_osm_practices(), private.import_osm_postcodes() from public, anon, authenticated;

-- Monatlich aktualisieren (1. des Monats, 03:17 UTC bzw. 03:47 UTC)
select cron.schedule('osm-praxen-import', '17 3 1 * *', $$select private.import_osm_practices()$$);
select cron.schedule('osm-plz-import', '47 3 1 * *', $$select private.import_osm_postcodes()$$);
