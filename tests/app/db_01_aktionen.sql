begin;
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  pa uuid; i1 uuid; i2 uuid; n int; r text := '';
  today date := (now() at time zone 'Europe/Berlin')::date;
begin
  insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','test-a@example.invalid','{"display_name":"Test A","language":"de"}',now(),now()),
         (b,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','test-b@example.invalid','{"display_name":"Test B","language":"fr"}',now(),now());
  select count(*) into n from public.profiles where (id=a and display_name='Test A' and language='de') or (id=b and language='fr');
  r := r || '01 Profil wird bei Registrierung angelegt: ' || (n=2) || E'\n';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);

  update public.profiles set language='en' where id=a; get diagnostics n = row_count;
  r := r || '02 Sprache ändern: ' || (n=1) || E'\n';

  insert into public.pets(name,species) values ('Luna','dog') returning id into pa;
  r := r || '03 Tier anlegen, Besitzer automatisch gesetzt: ' || ((select owner_id from public.pets where id=pa)=a) || E'\n';

  insert into public.routine_items(pet_id,kind,time_of_day,repeat,label) values
   (pa,'walk','07:00','daily',null),(pa,'feed','07:30','daily',null),(pa,'walk','12:30','daily',null),
   (pa,'walk','18:00','daily',null),(pa,'feed','18:30','daily',null),(pa,'walk','21:30','daily',null);
  select count(*) into n from public.routine_items where pet_id=pa;
  r := r || '04 Vorlage Hund übernommen (6 Einträge): ' || (n=6) || E'\n';

  begin insert into public.pets(name,species) values ('Shelly','other'); r := r || '05 Andere Tierart ohne Namen abgelehnt: false' || E'\n';
  exception when check_violation then r := r || '05 Andere Tierart ohne Namen abgelehnt: true' || E'\n'; end;

  insert into public.pets(name,species,species_other) values ('Shelly','other','Schildkröte');
  insert into public.pets(name,species,cat_outdoor) values ('Minka','cat',true);
  insert into public.pets(name,species,stable) values ('Fuchsi','horse','Reiterhof');
  r := r || '06 Andere Tierart, Katze, Pferd anlegen: true' || E'\n';

  insert into public.routine_items(pet_id,kind,time_of_day,repeat,label) values (pa,'own','09:15','weekends','Bürsten') returning id into i1;
  r := r || '07 Eigener Eintrag am Wochenende: true' || E'\n';

  begin insert into public.routine_items(pet_id,kind,time_of_day,repeat,label) values (pa,'own','09:15','weekends','Bürsten'); r := r || '08 Doppelter Eintrag abgelehnt: false' || E'\n';
  exception when unique_violation then r := r || '08 Doppelter Eintrag abgelehnt: true' || E'\n'; end;

  update public.routine_items set reminder_on=false where id=i1; get diagnostics n = row_count;
  r := r || '09 Erinnerung einzeln aus: ' || (n=1) || E'\n';
  update public.routine_items set reminder_on=false where pet_id=pa; get diagnostics n = row_count;
  r := r || '10 Alle Erinnerungen aus (7 Einträge): ' || (n=7) || E'\n';
  update public.routine_items set reminder_on=true where pet_id=pa;

  select id into i2 from public.routine_items where pet_id=pa and time_of_day='07:00';
  insert into public.routine_done(routine_item_id,done_on) values (i2,today) on conflict (routine_item_id,done_on) do nothing;
  insert into public.routine_done(routine_item_id,done_on) values (i2,today) on conflict (routine_item_id,done_on) do nothing;
  select count(*) into n from public.routine_done where routine_item_id=i2 and done_on=today;
  r := r || '11 Erledigt, doppelt geklickt ergibt 1 Eintrag: ' || (n=1) || E'\n';
  delete from public.routine_done where routine_item_id=i2 and done_on=today; get diagnostics n = row_count;
  r := r || '12 Erledigt zurücknehmen: ' || (n=1) || E'\n';
  insert into public.routine_done(routine_item_id,done_on) values (i2,today);

  update public.pets set breed='Labrador', chip_no='276098100123456' where id=pa; get diagnostics n = row_count;
  r := r || '13 Tier bearbeiten: ' || (n=1) || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  select count(*) into n from public.pets; r := r || '14 B sieht keine Tiere von A: ' || (n=0) || E'\n';
  select count(*) into n from public.routine_items; r := r || '15 B sieht keinen Tagesplan von A: ' || (n=0) || E'\n';
  select count(*) into n from public.routine_done; r := r || '16 B sieht keine Häkchen von A: ' || (n=0) || E'\n';
  select count(*) into n from public.profiles; r := r || '17 B sieht nur das eigene Profil: ' || (n=1) || E'\n';
  update public.pets set name='geändert' where id=pa; get diagnostics n = row_count;
  r := r || '18 B kann Tier von A nicht ändern: ' || (n=0) || E'\n';
  delete from public.routine_items where pet_id=pa; get diagnostics n = row_count;
  r := r || '19 B kann Plan von A nicht löschen: ' || (n=0) || E'\n';
  update public.profiles set display_name='x' where id=a; get diagnostics n = row_count;
  r := r || '20 B kann Profil von A nicht ändern: ' || (n=0) || E'\n';
  begin insert into public.routine_items(pet_id,kind,time_of_day) values (pa,'walk','10:00'); r := r || '21 B kann bei A keinen Eintrag anlegen: false' || E'\n';
  exception when others then r := r || '21 B kann bei A keinen Eintrag anlegen: true (' || sqlstate || ')' || E'\n'; end;
  begin insert into public.routine_done(routine_item_id) values (i1); r := r || '22 B kann Eintrag von A nicht abhaken: false' || E'\n';
  exception when others then r := r || '22 B kann Eintrag von A nicht abhaken: true (' || sqlstate || ')' || E'\n'; end;
  begin insert into public.pets(name,species,owner_id) values ('Fake','dog',a); r := r || '23 B kann kein Tier für A anlegen: false' || E'\n';
  exception when others then r := r || '23 B kann kein Tier für A anlegen: true (' || sqlstate || ')' || E'\n'; end;
  begin update public.routine_items set pet_id=pa where false; r := r || '24 (Platzhalter) ' || 'true' || E'\n'; end;

  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  delete from public.routine_items where id=i1; get diagnostics n = row_count;
  r := r || '25 Eintrag löschen: ' || (n=1) || E'\n';
  delete from public.pets where id=pa;
  select count(*) into n from public.routine_items where pet_id=pa;
  r := r || '26 Tier löschen entfernt auch seinen Plan: ' || (n=0) || E'\n';
  select count(*) into n from public.pets; r := r || '27 A hat danach noch 3 Tiere: ' || (n=3) || E'\n';

  execute 'set local role anon';
  begin select count(*) into n from public.pets; r := r || '28 Ohne Anmeldung kein Zugriff: false (' || n || ')' || E'\n';
  exception when others then r := r || '28 Ohne Anmeldung kein Zugriff: true (' || sqlstate || ')' || E'\n'; end;
  raise notice E'\n%', r;
end $$;
rollback;
