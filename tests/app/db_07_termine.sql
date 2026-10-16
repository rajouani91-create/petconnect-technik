begin;
do $$
declare a uuid := gen_random_uuid(); k uuid := gen_random_uuid(); o uuid := gen_random_uuid(); f uuid := gen_random_uuid();
  luna uuid; tk text; n int; r text := ''; ap uuid; rm uuid; rm1 uuid; v public.reminders%rowtype;
begin
  insert into auth.users(id,email,raw_user_meta_data) values (a,'a@x','{"display_name":"Ahmed"}'),(k,'k@x','{}'),(o,'o@x','{}'),(f,'f@x','{}');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  insert into public.pets(name,species) values ('Luna','dog') returning id into luna;

  insert into public.appointments(pet_id,title,starts_at,location) values (luna,'Kontrolle','2026-11-03 10:00+01','Praxis am Markt') returning id into ap;
  r:=r||'01 Besitzer legt Termin an: true'||E'\n';
  begin insert into public.appointments(pet_id,title,starts_at,ends_at) values (luna,'x','2026-11-03 10:00+01','2026-11-03 09:00+01'); r:=r||'02 Ende vor Beginn abgelehnt: false'||E'\n';
  exception when others then r:=r||'02 Ende vor Beginn abgelehnt: true'||E'\n'; end;
  begin insert into public.appointments(pet_id,title,starts_at,kind) values (luna,'x',now(),'party'); r:=r||'03 Unbekannte Art abgelehnt: false'||E'\n';
  exception when others then r:=r||'03 Unbekannte Art abgelehnt: true'||E'\n'; end;
  begin insert into public.appointments(pet_id,title,starts_at) values (luna,'   ',now()); r:=r||'04 Leerer Titel abgelehnt: false'||E'\n';
  exception when others then r:=r||'04 Leerer Titel abgelehnt: true'||E'\n'; end;
  begin update public.appointments set pet_id = gen_random_uuid() where id=ap; r:=r||'05 Tier eines Termins nicht änderbar: false'||E'\n';
  exception when others then r:=r||'05 Tier eines Termins nicht änderbar: true'||E'\n'; end;

  insert into public.reminders(pet_id,title,kind,due_on,repeat_days) values (luna,'Entwurmung','deworming','2026-10-10',90) returning id into rm;
  insert into public.reminders(pet_id,title,kind,due_on) values (luna,'Tablette','medication','2026-10-20') returning id into rm1;
  r:=r||'06 Besitzer legt Erinnerungen an: true'||E'\n';
  begin insert into public.reminders(pet_id,title,due_on,repeat_days) values (luna,'x',current_date,0); r:=r||'07 Wiederholung 0 Tage abgelehnt: false'||E'\n';
  exception when others then r:=r||'07 Wiederholung 0 Tage abgelehnt: true'||E'\n'; end;
  v := public.complete_reminder(rm, current_date - 1);
  r:=r||'08 Wiederkehrende Erinnerung erledigt → neu fällig in 90 Tagen: '||(v.due_on=current_date+89 and v.last_done_on=current_date-1 and v.done_at is null)||E'\n';
  v := public.complete_reminder(rm1, current_date);
  r:=r||'09 Einmalige Erinnerung erledigt → abgeschlossen: '||(v.done_at is not null and v.due_on='2026-10-20')||E'\n';
  begin v := public.complete_reminder(rm, current_date + 10); r:=r||'10 Erledigt-Datum in der Zukunft abgelehnt: false'||E'\n';
  exception when others then r:=r||'10 Erledigt-Datum in der Zukunft abgelehnt: true'||E'\n'; end;

  -- Kyra (Mithalterin), Oma (nur ansehen)
  select token into tk from public.create_pet_invite('Kyra','carer',array[luna]);
  perform set_config('request.jwt.claims', json_build_object('sub',k)::text, true);
  perform public.accept_pet_invite(tk);
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  select token into tk from public.create_pet_invite('Oma','viewer',array[luna]);
  perform set_config('request.jwt.claims', json_build_object('sub',o)::text, true);
  perform public.accept_pet_invite(tk);

  perform set_config('request.jwt.claims', json_build_object('sub',k)::text, true);
  select count(*) into n from public.appointments; r:=r||'11 Mithalterin sieht Termin: '||(n=1)||E'\n';
  update public.appointments set status='done' where id=ap; get diagnostics n=row_count; r:=r||'12 Mithalterin ändert Termin: '||(n=1)||E'\n';
  insert into public.appointments(pet_id,title,starts_at) values (luna,'Friseur','2026-12-01 14:00+01'); r:=r||'13 Mithalterin legt Termin an: true'||E'\n';
  v := public.complete_reminder(rm, current_date); r:=r||'14 Mithalterin hakt Erinnerung ab: '||(v.due_on=current_date+90)||E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',o)::text, true);
  select count(*) into n from public.appointments; r:=r||'15 Nur-ansehen sieht Termine: '||(n=2)||E'\n';
  select count(*) into n from public.reminders; r:=r||'16 Nur-ansehen sieht Erinnerungen: '||(n=2)||E'\n';
  begin insert into public.appointments(pet_id,title,starts_at) values (luna,'Oma',now()); r:=r||'17 Nur-ansehen kann keinen Termin anlegen: false'||E'\n';
  exception when others then r:=r||'17 Nur-ansehen kann keinen Termin anlegen: true'||E'\n'; end;
  update public.appointments set title='x'; get diagnostics n=row_count; r:=r||'18 Nur-ansehen kann keinen Termin ändern: '||(n=0)||E'\n';
  delete from public.appointments; get diagnostics n=row_count; r:=r||'19 Nur-ansehen kann keinen Termin löschen: '||(n=0)||E'\n';
  begin v := public.complete_reminder(rm, current_date); r:=r||'20 Nur-ansehen kann nicht abhaken: false'||E'\n';
  exception when others then r:=r||'20 Nur-ansehen kann nicht abhaken: true'||E'\n'; end;
  delete from public.reminders; get diagnostics n=row_count; r:=r||'21 Nur-ansehen kann keine Erinnerung löschen: '||(n=0)||E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',f)::text, true);
  select count(*) into n from public.appointments; r:=r||'22 Fremde sieht keine Termine: '||(n=0)||E'\n';
  select count(*) into n from public.reminders; r:=r||'23 Fremde sieht keine Erinnerungen: '||(n=0)||E'\n';
  begin v := public.complete_reminder(rm, current_date); r:=r||'24 Fremde kann nicht abhaken: false'||E'\n';
  exception when others then r:=r||'24 Fremde kann nicht abhaken: true'||E'\n'; end;
  begin insert into public.reminders(pet_id,title,due_on) values (luna,'x',current_date); r:=r||'25 Fremde kann keine Erinnerung anlegen: false'||E'\n';
  exception when others then r:=r||'25 Fremde kann keine Erinnerung anlegen: true'||E'\n'; end;

  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  delete from public.appointments where id=ap; get diagnostics n=row_count; r:=r||'26 Besitzer löscht Termin: '||(n=1)||E'\n';
  delete from public.pets where id=luna;
  execute 'reset role';
  select count(*) into n from public.reminders where pet_id=luna; r:=r||'27 Tier gelöscht → Erinnerungen weg: '||(n=0)||E'\n';
  raise notice E'\n%', r;
end $$;
rollback;
