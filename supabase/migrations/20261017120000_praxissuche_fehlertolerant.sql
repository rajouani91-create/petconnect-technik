-- Teil 8: Praxissuche fehlertolerant (Umlaute, ae/oe/ue, ß, Tippfehler) + Zähler je Umkreis.
-- Signaturen von search_practices und geocode_place bleiben unverändert.

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Text vereinheitlichen: klein, ohne Akzente, ae/oe/ue/ß → a/o/u/s, nur Buchstaben/Ziffern/Leerzeichen
create or replace function private.norm_text(t text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select btrim(regexp_replace(
           replace(replace(replace(replace(replace(
             extensions.unaccent('extensions.unaccent'::regdictionary, lower(coalesce(t,''))),
             'ae','a'),'oe','o'),'ue','u'),'ß','s'),'ss','s'),
           '[^a-z0-9 ]+', ' ', 'g'));
$$;
grant execute on function private.norm_text(text) to authenticated;

-- Suchbegriff für Praxisnamen: Füllwörter entfernen
create or replace function private.norm_query(t text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select btrim(regexp_replace(
    ' ' || private.norm_text(t) || ' ',
    '( (dr|med|vet|prof|praxis|tierarztpraxis|tierarzt|tierarztin|tierarzte|tierarztliche|tierarztlicher|und|fur|am|im|der|die|das|gmbh|mvz) )+', ' ', 'g'));
$$;
grant execute on function private.norm_query(text) to authenticated;

create index if not exists practices_name_trgm_idx on public.practices using gin (private.norm_text(name) extensions.gin_trgm_ops);
create index if not exists postal_codes_place_trgm_idx on public.postal_codes using gin (private.norm_text(place) extensions.gin_trgm_ops);

-- Ort oder PLZ → Mittelpunkt (exakt, Wortanfang oder ähnlich geschrieben)
create or replace function public.geocode_place(p_q text)
returns table (postcode text, place text, lat double precision, lon double precision)
language sql stable security invoker set search_path = '' as $$
  with q as (select btrim(coalesce(p_q,'')) as raw, private.norm_text(p_q) as s)
  select pc.postcode, pc.place, pc.lat, pc.lon
  from public.postal_codes pc, q
  where q.raw <> '' and (
        (q.raw ~ '^[0-9]{5}$' and pc.postcode = q.raw)
     or (q.raw ~ '^[0-9]{2,4}$' and pc.postcode like q.raw || '%')
     or (q.raw !~ '^[0-9]+$' and char_length(q.s) >= 2 and (
            private.norm_text(pc.place) like q.s || '%'
         or private.norm_text(pc.place) like '% ' || q.s || '%'
         or (char_length(q.s) >= 4 and extensions.similarity(private.norm_text(pc.place), q.s) >= 0.45))))
  order by (private.norm_text(pc.place) = q.s) desc,
           (private.norm_text(pc.place) like q.s || '%') desc,
           extensions.similarity(private.norm_text(pc.place), q.s) desc,
           pc.place, pc.postcode
  limit 10;
$$;

-- Praxen im Umkreis – Namenssuche jetzt fehlertolerant, sonst unverändert
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
           p_lat as la, p_lon as lo,
           private.norm_query(p_q) as q
  ), c as (
    select p.*, pp.practice_id is not null as hp, pp.species sp, pp.services sv, pp.titles ti, pp.focus fo, coalesce(pp.titles_verified,false) tv,
           private.km(b.la, b.lo, p.lat, p.lon) as d, b.r
    from public.practices p
    cross join box b
    left join public.practice_profiles pp on pp.practice_id = p.id
    where p.active
      and p.lat between b.la - b.r / 111.0 and b.la + b.r / 111.0
      and p.lon between b.lo - b.r / (111.0 * cos(radians(b.la))) and b.lo + b.r / (111.0 * cos(radians(b.la)))
      and (b.q = '' or private.norm_text(p.name) like '%' || b.q || '%'
           or (char_length(b.q) >= 4 and extensions.word_similarity(b.q, private.norm_text(p.name)) >= 0.6))
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

-- Zähler je Umkreisstufe: wie viele Praxen insgesamt, mit Profil, und echte Treffer
create or replace function public.count_practices_by_radius(
  p_lat double precision, p_lon double precision,
  p_species text default null, p_services text[] default '{}', p_titles text[] default '{}', p_q text default null)
returns table (radius_km integer, total integer, with_profile integer, matches integer)
language sql stable security invoker set search_path = '' as $$
  with r(k) as (values (5),(10),(25),(50)),
  s as (select * from public.search_practices(p_lat, p_lon, 50, p_species, p_services, p_titles, p_q, 300))
  select r.k, count(s.id)::int, count(s.id) filter (where s.has_profile)::int, count(s.id) filter (where s.matches)::int
  from r left join s on s.distance_km <= r.k
  group by r.k order by r.k;
$$;
revoke all on function public.count_practices_by_radius(double precision,double precision,text,text[],text[],text) from public, anon;
grant execute on function public.count_practices_by_radius(double precision,double precision,text,text[],text[],text) to authenticated;
