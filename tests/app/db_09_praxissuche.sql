begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); n int; r text := ''; p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; rec record; ids text;
begin
  -- Testdaten wie vom Import (als Superuser)
  insert into auth.users(id,email,raw_user_meta_data) values (a,'a@x','{}'),(b,'b@x','{}');
  insert into public.postal_codes values ('65428','Rüsselsheim am Main',49.992,8.413),('55116','Mainz',49.999,8.271);
  insert into public.practices(osm_type,osm_id,name,city,postcode,lat,lon,phone) values ('node',1,'Kleintierpraxis Nord','Rüsselsheim am Main','65428',50.000,8.420,'06142 1') returning id into p1;
  insert into public.practices(osm_type,osm_id,name,city,lat,lon) values ('node',2,'Exotenpraxis Süd','Rüsselsheim am Main',49.985,8.410) returning id into p2;
  insert into public.practices(osm_type,osm_id,name,city,lat,lon) values ('way',3,'Pferdeklinik Mainz','Mainz',49.999,8.271) returning id into p3;
  insert into public.practices(osm_type,osm_id,name,city,lat,lon) values ('node',4,'Praxis ohne Angaben','Rüsselsheim am Main',49.995,8.400) returning id into p4;
  insert into public.practices(osm_type,osm_id,name,city,lat,lon,active) values ('node',5,'Geschlossene Praxis','Rüsselsheim am Main',49.993,8.414,false) returning id into p5;
  insert into public.practice_profiles(practice_id,species,services,titles) values
    (p1, '{dog,cat,rabbit}', '{surgery,imaging}', '{small_animals}'),
    (p2, '{dog,cat,reptile,bird}', '{surgery,imaging,blood_bank,hibernation}', '{reptiles,surgery}'),
    (p3, '{horse,dog}', '{equine_mobile,physio}', '{horses}');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);

  select count(*) into n from public.search_practices(49.992,8.413,5); r:=r||'01 Umkreis 5 km: 3 aktive Praxen: '||(n=3)||E'\n';
  select count(*) into n from public.search_practices(49.992,8.413,25); r:=r||'02 Umkreis 25 km mit Mainz: 4: '||(n=4)||E'\n';
  select string_agg(name, '|' order by distance_km) into ids from public.search_practices(49.992,8.413,25);
  r:=r||'03 Sortiert nach Entfernung, Mainz zuletzt: '||(ids like '%|Pferdeklinik Mainz')||E'\n';
  select count(*) into n from public.search_practices(49.992,8.413,25) where name='Geschlossene Praxis'; r:=r||'04 Inaktive Praxis nicht gelistet: '||(n=0)||E'\n';
  select count(*) into n from public.search_practices(49.992,8.413,25,'reptile','{hibernation}','{reptiles}') where matches; r:=r||'05 Reptil+Überwinterung+Fachtitel → nur Exotenpraxis: '||(n=1)||E'\n';
  select count(*) into n from public.search_practices(49.992,8.413,25,'reptile','{hibernation}','{reptiles}') where matches and name='Exotenpraxis Süd'; r:=r||'06 Treffer ist die richtige Praxis: '||(n=1)||E'\n';
  select count(*) into n from public.search_practices(49.992,8.413,25,'dog','{surgery}','{}') where matches; r:=r||'07 Hund+Operationen → 2 Praxen: '||(n=2)||E'\n';
  select count(*) into n from public.search_practices(49.992,8.413,25,'dog','{}','{}') where not has_profile; r:=r||'08 Praxen ohne Angaben werden mitgeliefert (ohne Treffer): '||(n=1)||E'\n';
  select count(*) into n from public.search_practices(49.992,8.413,25,'dog','{}','{}') where not has_profile and matches; r:=r||'09 Praxis ohne Angaben ist nie Treffer: '||(n=0)||E'\n';
  select count(*) into n from public.search_practices(49.992,8.413,25,null,'{}','{}','pferd'); r:=r||'10 Namenssuche: '||(n=1)||E'\n';
  select count(*) into n from public.search_practices(49.992,8.413,500); r:=r||'11 Umkreis auf 100 km begrenzt, kein Fehler: '||(n=4)||E'\n';
  select round(distance_km) into n from public.search_practices(49.992,8.413,25) where name='Pferdeklinik Mainz'; r:=r||'12 Entfernung Rüsselsheim–Mainz ca. 10 km: '||(n between 9 and 11)||E'\n';

  select count(*) into n from public.geocode_place('65428'); r:=r||'13 PLZ gefunden: '||(n=1)||E'\n';
  select count(*) into n from public.geocode_place('rüssels'); r:=r||'14 Ortsanfang gefunden: '||(n=1)||E'\n';
  select count(*) into n from public.geocode_place(''); r:=r||'15 Leere Eingabe → nichts: '||(n=0)||E'\n';
  select count(*) into n from public.geocode_place('%'); r:=r||'16 Platzhalter allein findet nicht alles: '||(n<=1)||E'\n';

  insert into public.practice_favorites(practice_id) values (p1);
  select count(*) into n from public.search_practices(49.992,8.413,5) where is_favorite; r:=r||'17 Favorit markiert: '||(n=1)||E'\n';
  insert into public.practice_invite_requests(practice_id) values (p4); r:=r||'18 Einladungswunsch speichern: true'||E'\n';

  begin insert into public.practices(name,lat,lon) values ('Fake',1,1); r:=r||'19 Nutzer kann keine Praxis anlegen: false'||E'\n';
  exception when others then r:=r||'19 Nutzer kann keine Praxis anlegen: true'||E'\n'; end;
  begin update public.practices set name='x' where id=p1; get diagnostics n=row_count; r:=r||'20 Nutzer kann Praxis nicht ändern: '||(n=0)||E'\n';
  exception when others then r:=r||'20 Nutzer kann Praxis nicht ändern: true'||E'\n'; end;
  begin insert into public.practice_profiles(practice_id) values (p4); r:=r||'21 Nutzer kann kein Angebot eintragen: false'||E'\n';
  exception when others then r:=r||'21 Nutzer kann kein Angebot eintragen: true'||E'\n'; end;
  begin insert into public.practice_favorites(user_id,practice_id) values (b,p2); r:=r||'22 Kein Favorit für andere Person: false'||E'\n';
  exception when others then r:=r||'22 Kein Favorit für andere Person: true'||E'\n'; end;

  perform set_config('request.jwt.claims', json_build_object('sub',b)::text, true);
  select count(*) into n from public.practice_favorites; r:=r||'23 Favoriten anderer unsichtbar: '||(n=0)||E'\n';
  select count(*) into n from public.practice_invite_requests; r:=r||'24 Einladungswünsche anderer unsichtbar: '||(n=0)||E'\n';
  select count(*) into n from public.search_practices(49.992,8.413,5) where is_favorite; r:=r||'25 Favorit gilt nur für die eigene Person: '||(n=0)||E'\n';

  execute 'set local role anon';
  begin select count(*) into n from public.search_practices(49.992,8.413,5); r:=r||'26 Ohne Anmeldung keine Suche: '||(n=0)||E'\n';
  exception when others then r:=r||'26 Ohne Anmeldung keine Suche: true'||E'\n'; end;
  execute 'reset role';
  raise notice E'\n%', r;
end $$;
rollback;
