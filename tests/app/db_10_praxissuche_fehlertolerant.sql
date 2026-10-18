begin;
do $$
declare a uuid := gen_random_uuid(); n int; r text := ''; p1 uuid; v text; rec record;
begin
  insert into auth.users(id,email,raw_user_meta_data) values (a,'a@x','{}');
  insert into public.postal_codes values ('65428','Rüsselsheim am Main',49.992,8.413),('55116','Mainz',49.999,8.271),('60311','Frankfurt am Main',50.11,8.68),('65439','Flörsheim am Main',50.01,8.43);
  insert into public.practices(osm_type,osm_id,name,lat,lon) values
    ('node',101,'Tierarztpraxis Dr. Müller',50.000,8.420),
    ('node',102,'Pferdeklinik am Rhein',49.999,8.300),
    ('node',103,'Exotenpraxis Süd',49.985,8.410),
    ('node',104,'Kleintierpraxis Weiß',49.990,8.415);
  select id into p1 from public.practices where osm_id=103;
  insert into public.practice_profiles(practice_id,species,services,titles) values (p1,'{reptile}','{hibernation}','{reptiles}');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);

  select count(*) into n from public.search_practices(49.992,8.413,25,null,'{}','{}','Müller'); r:=r||'01 Name mit Umlaut: '||(n=1)||E'\n';
  select count(*) into n from public.search_practices(49.992,8.413,25,null,'{}','{}','Mueller'); r:=r||'02 ue statt ü: '||(n=1)||E'\n';
  select count(*) into n from public.search_practices(49.992,8.413,25,null,'{}','{}','muller'); r:=r||'03 ohne Umlaut: '||(n=1)||E'\n';
  select count(*) into n from public.search_practices(49.992,8.413,25,null,'{}','{}','Tierarztpraxis Dr. Müller'); r:=r||'04 Füllwörter werden ignoriert: '||(n=1)||E'\n';
  select count(*) into n from public.search_practices(49.992,8.413,25,null,'{}','{}','Pferdklinik'); r:=r||'05 Tippfehler Pferdklinik: '||(n=1)||E'\n';
  select count(*) into n from public.search_practices(49.992,8.413,25,null,'{}','{}','pferde'); r:=r||'06 Wortteil pferde: '||(n=1)||E'\n';
  select count(*) into n from public.search_practices(49.992,8.413,25,null,'{}','{}','Weiss'); r:=r||'07 ss statt ß: '||(n=1)||E'\n';
  select count(*) into n from public.search_practices(49.992,8.413,25,null,'{}','{}','Praxis'); r:=r||'08 Nur Füllwort → alle: '||(n=4)||E'\n';
  select count(*) into n from public.search_practices(49.992,8.413,25,null,'{}','{}','Zahnarzt'); r:=r||'09 Unpassender Name → nichts: '||(n=0)||E'\n';
  select count(*) into n from public.search_practices(49.992,8.413,25,null,'{}','{}','%'); r:=r||'10 Platzhalter allein → alle (wie leer): '||(n=4)||E'\n';

  select place into v from public.geocode_place('Rüsselsheim') limit 1; r:=r||'11 Ort mit Umlaut: '||(v='Rüsselsheim am Main')||E'\n';
  select place into v from public.geocode_place('Ruesselsheim') limit 1; r:=r||'12 Ort mit ue: '||(v='Rüsselsheim am Main')||E'\n';
  select place into v from public.geocode_place('Rüselsheim') limit 1; r:=r||'13 Ort mit Tippfehler: '||(coalesce(v,'')='Rüsselsheim am Main')||E'\n';
  select place into v from public.geocode_place('Flörsheim') limit 1; r:=r||'14 Flörsheim: '||(v='Flörsheim am Main')||E'\n';
  select count(*) into n from public.geocode_place('654'); r:=r||'15 PLZ-Anfang: '||(n=2)||E'\n';
  select count(*) into n from public.geocode_place('Main'); r:=r||'16 Wort im Ortsnamen (am Main): '||(n>=2)||E'\n';
  select count(*) into n from public.geocode_place('x'); r:=r||'17 Ein Buchstabe → nichts: '||(n=0)||E'\n';

  select total, matches into rec from public.count_practices_by_radius(49.992,8.413,'reptile','{hibernation}','{reptiles}') where radius_km=5;
  r:=r||'18 Zähler 5 km: Praxen und 1 Treffer: '||(rec.total=3 and rec.matches=1)||E'\n';
  select total, with_profile into rec from public.count_practices_by_radius(49.992,8.413) where radius_km=25;
  r:=r||'19 Zähler 25 km: 4 Praxen, 1 mit Profil: '||(rec.total=4 and rec.with_profile=1)||E'\n';
  select count(*) into n from public.count_practices_by_radius(49.992,8.413); r:=r||'20 Vier Umkreisstufen: '||(n=4)||E'\n';

  execute 'set local role anon';
  begin perform * from public.count_practices_by_radius(49.992,8.413); r:=r||'21 Zähler ohne Anmeldung gesperrt: false'||E'\n';
  exception when others then r:=r||'21 Zähler ohne Anmeldung gesperrt: true'||E'\n'; end;
  execute 'reset role';
  raise notice E'\n%', r;
end $$;
rollback;
