begin;
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  pa uuid; it uuid; tok text; tok2 text; n int; r text := ''; x uuid; st text;
  today date := (now() at time zone 'Europe/Berlin')::date;
  procedure_ok boolean;
begin
  insert into auth.users(id,email,raw_user_meta_data) values
   (a,'a@x.invalid','{"display_name":"Ahmed"}'),(b,'b@x.invalid','{"display_name":"Kyra"}'),(c,'c@x.invalid','{"display_name":"Fremd"}');
  execute 'set local role authenticated';

  -- Ahmed legt Tier an (wie die App: insert ... returning)
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  insert into public.pets(name,species) values ('Luna','dog') returning id into pa;
  r := r || '01 Tier anlegen mit Rückgabe: ' || (pa is not null) || E'\n';
  select count(*) into n from public.pet_members where pet_id=pa and user_id=a and role='owner';
  r := r || '02 Ahmed automatisch Besitzer: ' || (n=1) || E'\n';
  insert into public.routine_items(pet_id,kind,time_of_day) values (pa,'walk','07:00') returning id into it;
  insert into public.routine_items(pet_id,kind,time_of_day) values (pa,'feed','07:30');

  -- Kyra vor der Einladung
  perform set_config('request.jwt.claims', json_build_object('sub',b)::text, true);
  select count(*) into n from public.pets; r := r || '03 Kyra sieht Luna vor Einladung nicht: ' || (n=0) || E'\n';
  begin insert into public.pet_invites(pet_id) values (pa); r := r || '04 Kyra kann für Luna nicht einladen: false' || E'\n';
  exception when others then r := r || '04 Kyra kann für Luna nicht einladen: true' || E'\n'; end;

  -- Ahmed lädt ein
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  insert into public.pet_invites(pet_id) values (pa) returning token into tok;
  r := r || '05 Einladung erzeugt, Code 64 Zeichen: ' || (length(tok)=64) || E'\n';

  -- Kyra: Vorschau, annehmen
  perform set_config('request.jwt.claims', json_build_object('sub',b)::text, true);
  select count(*) into n from public.pet_invites; r := r || '06 Kyra sieht Einladungsliste nicht: ' || (n=0) || E'\n';
  select status into st from public.invite_preview(tok);
  r := r || '07 Vorschau zeigt offen: ' || (st='open') || ' / Name: ' || (select pet_name||' von '||inviter_name from public.invite_preview(tok)) || E'\n';
  x := public.accept_pet_invite(tok);
  r := r || '08 Annehmen liefert Luna: ' || (x=pa) || E'\n';
  select count(*) into n from public.pets where id=pa; r := r || '09 Kyra sieht Luna: ' || (n=1) || E'\n';
  select count(*) into n from public.routine_items where pet_id=pa; r := r || '10 Kyra sieht Tagesplan (2): ' || (n=2) || E'\n';
  insert into public.routine_done(routine_item_id,done_on) values (it,today);
  r := r || '11 Kyra hakt Gassirunde ab: true' || E'\n';
  update public.routine_items set reminder_on=false where id=it; get diagnostics n=row_count;
  r := r || '12 Kyra schaltet Erinnerung: ' || (n=1) || E'\n';
  insert into public.routine_items(pet_id,kind,time_of_day,label) values (pa,'own','20:00','Bürsten');
  r := r || '13 Kyra ergänzt Eintrag: true' || E'\n';
  update public.pets set breed='Labrador' where id=pa; get diagnostics n=row_count;
  r := r || '14 Kyra darf Stammdaten ergänzen: ' || (n=1) || E'\n';
  select count(*) into n from public.profiles; r := r || '15 Kyra sieht Profile von sich und Ahmed (2): ' || (n=2) || E'\n';
  x := public.accept_pet_invite(tok); r := r || '16 Erneut annehmen ohne Fehler: ' || (x=pa) || E'\n';
  delete from public.pets where id=pa; get diagnostics n=row_count;
  r := r || '17 Kyra kann Luna nicht löschen: ' || (n=0) || E'\n';
  begin update public.pets set owner_id=b where id=pa; r := r || '18 Kyra kann Besitz nicht übernehmen: false' || E'\n';
  exception when others then r := r || '18 Kyra kann Besitz nicht übernehmen: true' || E'\n'; end;
  delete from public.pet_members where pet_id=pa and user_id=a; get diagnostics n=row_count;
  r := r || '19 Kyra kann Ahmed nicht entfernen: ' || (n=0) || E'\n';
  begin insert into public.pet_members(pet_id,user_id,role) values (pa,c,'carer'); r := r || '20 Kyra kann niemanden direkt hinzufügen: false' || E'\n';
  exception when others then r := r || '20 Kyra kann niemanden direkt hinzufügen: true' || E'\n'; end;

  -- Ahmed sieht Kyras Häkchen
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  select count(*) into n from public.routine_done where routine_item_id=it and owner_id=b;
  r := r || '21 Ahmed sieht Kyras Häkchen: ' || (n=1) || E'\n';
  select count(*) into n from public.routine_items where pet_id=pa; r := r || '22 Ahmed sieht Kyras neuen Eintrag (3): ' || (n=3) || E'\n';
  select count(*) into n from public.profiles where id=b; r := r || '23 Ahmed sieht Kyras Namen: ' || (n=1) || E'\n';

  -- Fremde Person
  perform set_config('request.jwt.claims', json_build_object('sub',c)::text, true);
  select count(*) into n from public.pets; r := r || '24 Fremde sieht kein Tier: ' || (n=0) || E'\n';
  select count(*) into n from public.routine_done; r := r || '25 Fremde sieht keine Häkchen: ' || (n=0) || E'\n';
  select count(*) into n from public.profiles; r := r || '26 Fremde sieht nur eigenes Profil: ' || (n=1) || E'\n';
  select count(*) into n from public.pet_members; r := r || '27 Fremde sieht keine Betreuer: ' || (n=0) || E'\n';
  begin perform public.accept_pet_invite(tok); r := r || '28 Benutzte Einladung für Fremde gesperrt: false' || E'\n';
  exception when others then r := r || '28 Benutzte Einladung für Fremde gesperrt: ' || (sqlerrm='invite_used') || E'\n'; end;
  begin perform public.accept_pet_invite('falsch'); r := r || '29 Falscher Code abgelehnt: false' || E'\n';
  exception when others then r := r || '29 Falscher Code abgelehnt: ' || (sqlerrm='invite_not_found') || E'\n'; end;
  begin insert into public.routine_done(routine_item_id) values (it); r := r || '30 Fremde kann nicht abhaken: false' || E'\n';
  exception when others then r := r || '30 Fremde kann nicht abhaken: true' || E'\n'; end;

  -- Abgelaufene Einladung
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  insert into public.pet_invites(pet_id,expires_at) values (pa, now()-interval '1 minute') returning token into tok2;
  perform set_config('request.jwt.claims', json_build_object('sub',c)::text, true);
  select status into st from public.invite_preview(tok2); r := r || '31 Vorschau zeigt abgelaufen: ' || (st='expired') || E'\n';
  begin perform public.accept_pet_invite(tok2); r := r || '32 Abgelaufene Einladung abgelehnt: false' || E'\n';
  exception when others then r := r || '32 Abgelaufene Einladung abgelehnt: ' || (sqlerrm='invite_expired') || E'\n'; end;

  -- Ahmed entfernt Kyra
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  select count(*) into n from public.pet_invites where pet_id=pa; r := r || '33 Ahmed sieht seine Einladungen (2): ' || (n=2) || E'\n';
  delete from public.pet_members where pet_id=pa and user_id=b; get diagnostics n=row_count;
  r := r || '34 Ahmed entfernt Kyra: ' || (n=1) || E'\n';
  delete from public.pet_members where pet_id=pa and user_id=a; get diagnostics n=row_count;
  r := r || '35 Besitzer-Eintrag bleibt geschützt: ' || (n=0) || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub',b)::text, true);
  select count(*) into n from public.pets; r := r || '36 Kyra sieht Luna danach nicht mehr: ' || (n=0) || E'\n';
  select count(*) into n from public.profiles; r := r || '37 Kyra sieht Ahmeds Profil nicht mehr: ' || (n=1) || E'\n';

  -- Kyra tritt neu bei und geht selbst
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  insert into public.pet_invites(pet_id) values (pa) returning token into tok2;
  perform set_config('request.jwt.claims', json_build_object('sub',b)::text, true);
  perform public.accept_pet_invite(tok2);
  delete from public.pet_members where pet_id=pa and user_id=b; get diagnostics n=row_count;
  r := r || '38 Kyra kann selbst austreten: ' || (n=1) || E'\n';

  -- Ahmed löscht Luna
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  delete from public.pets where id=pa; get diagnostics n=row_count;
  r := r || '39 Besitzer löscht Tier: ' || (n=1) || E'\n';
  execute 'reset role';
  select count(*) into n from public.pet_members where pet_id=pa; r := r || '40 Betreuer mitgelöscht: ' || (n=0) || E'\n';
  select count(*) into n from public.pet_invites where pet_id=pa; r := r || '41 Einladungen mitgelöscht: ' || (n=0) || E'\n';

  execute 'set local role anon';
  begin perform public.invite_preview(tok); r := r || '42 Ohne Anmeldung keine Vorschau: false' || E'\n';
  exception when others then r := r || '42 Ohne Anmeldung keine Vorschau: true' || E'\n'; end;
  raise notice E'\n%', r;
end $$;
rollback;
