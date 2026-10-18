begin;
do $$
declare a uuid := gen_random_uuid(); k uuid := gen_random_uuid(); o uuid := gen_random_uuid(); f uuid := gen_random_uuid();
  luna uuid; mio uuid; tk text; n int; r text := ''; m1 uuid; m2 uuid; mp uuid; d1 uuid; j jsonb; v text;
begin
  insert into auth.users(id,email,raw_user_meta_data) values (a,'a@x','{"display_name":"Ahmed"}'),(k,'k@x','{"display_name":"Kyra"}'),(o,'o@x','{}'),(f,'f@x','{}');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  insert into public.pets(name,species) values ('Luna','dog') returning id into luna;
  insert into public.pets(name,species) values ('Mio','cat') returning id into mio;

  insert into public.pet_medications(pet_id,name,amount,unit,frequency,times,intake_hint,prescribed_by)
    values (luna,'Meloxicam',0.5,'ml','daily','{08:00,19:30}','with_food','Praxis am Ostpark') returning id into m1;
  r:=r||'01 Besitzer legt Medikament mit 2 Uhrzeiten an: '||(m1 is not null)||E'\n';
  insert into public.pet_medications(pet_id,name,amount,unit,frequency) values (luna,'Gabapentin',1,'capsule','as_needed') returning id into m2;
  r:=r||'02 „Bei Bedarf“ ohne Uhrzeit: true'||E'\n';
  begin insert into public.pet_medications(pet_id,name,amount,unit,frequency,times) values (luna,'x',1,'tablet','daily','{}'); r:=r||'03 Täglich ohne Uhrzeit abgelehnt: false'||E'\n';
  exception when others then r:=r||'03 Täglich ohne Uhrzeit abgelehnt: true'||E'\n'; end;
  begin insert into public.pet_medications(pet_id,name,amount,unit,frequency,times) values (luna,'x',1,'tablet','daily','{08:00,08:00}'); r:=r||'04 Doppelte Uhrzeit abgelehnt: false'||E'\n';
  exception when others then r:=r||'04 Doppelte Uhrzeit abgelehnt: true'||E'\n'; end;
  begin insert into public.pet_medications(pet_id,name,amount,unit,frequency,times) values (luna,'x',1,'tablet','daily','{06:00,08:00,10:00,12:00,14:00}'); r:=r||'05 Mehr als 4 Uhrzeiten abgelehnt: false'||E'\n';
  exception when others then r:=r||'05 Mehr als 4 Uhrzeiten abgelehnt: true'||E'\n'; end;
  begin insert into public.pet_medications(pet_id,name,amount,unit,frequency,times) values (luna,'x',1,'tablet','as_needed','{08:00}'); r:=r||'06 Bei Bedarf mit Uhrzeit abgelehnt: false'||E'\n';
  exception when others then r:=r||'06 Bei Bedarf mit Uhrzeit abgelehnt: true'||E'\n'; end;
  begin insert into public.pet_medications(pet_id,name,amount,unit,times) values (luna,'x',0,'tablet','{08:00}'); r:=r||'07 Menge 0 abgelehnt: false'||E'\n';
  exception when others then r:=r||'07 Menge 0 abgelehnt: true'||E'\n'; end;
  begin insert into public.pet_medications(pet_id,name,amount,unit,times) values (luna,'x',1,'spoon','{08:00}'); r:=r||'08 Unbekannte Einheit abgelehnt: false'||E'\n';
  exception when others then r:=r||'08 Unbekannte Einheit abgelehnt: true'||E'\n'; end;
  begin insert into public.pet_medications(pet_id,name,amount,unit,times,starts_on,ends_on) values (luna,'x',1,'tablet','{08:00}',current_date,current_date-1); r:=r||'09 Ende vor Beginn abgelehnt: false'||E'\n';
  exception when others then r:=r||'09 Ende vor Beginn abgelehnt: true'||E'\n'; end;
  begin insert into public.pet_medications(pet_id,name,amount,unit,times,source) values (luna,'x',1,'tablet','{08:00}','practice'); r:=r||'10 Halter kann keinen Praxis-Eintrag anlegen: false'||E'\n';
  exception when others then r:=r||'10 Halter kann keinen Praxis-Eintrag anlegen: true'||E'\n'; end;
  begin update public.pet_medications set pet_id = mio where id=m1; r:=r||'11 Tier eines Medikaments nicht änderbar: false'||E'\n';
  exception when others then r:=r||'11 Tier eines Medikaments nicht änderbar: true'||E'\n'; end;
  begin update public.pet_medications set source='practice' where id=m1; r:=r||'12 Herkunft nicht änderbar: false'||E'\n';
  exception when others then r:=r||'12 Herkunft nicht änderbar: true'||E'\n'; end;

  -- Praxis-Eintrag (simuliert, später über Praxis-Zugang)
  execute 'reset role';
  insert into public.pet_medications(pet_id,owner_id,source,name,amount,unit,times) values (luna,a,'practice','Prednisolon',1,'tablet','{09:00}') returning id into mp;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  update public.pet_medications set amount=2 where id=mp; get diagnostics n=row_count; r:=r||'13 Praxis-Eintrag: Halter kann nicht ändern: '||(n=0)||E'\n';
  delete from public.pet_medications where id=mp; get diagnostics n=row_count; r:=r||'14 Praxis-Eintrag: Halter kann nicht löschen: '||(n=0)||E'\n';

  -- Gaben abhaken
  insert into public.medication_doses(medication_id,pet_id,scheduled_on,scheduled_time) values (m1,luna,current_date,'08:00') returning id into d1;
  r:=r||'15 Gabe 08:00 abgehakt: '||(d1 is not null)||E'\n';
  begin insert into public.medication_doses(medication_id,pet_id,scheduled_on,scheduled_time) values (m1,luna,current_date,'08:00'); r:=r||'16 Doppelt abhaken abgelehnt: false'||E'\n';
  exception when others then r:=r||'16 Doppelt abhaken abgelehnt: true'||E'\n'; end;
  begin insert into public.medication_doses(medication_id,pet_id,scheduled_on,scheduled_time) values (m1,luna,current_date,'12:00'); r:=r||'17 Nicht geplante Uhrzeit abgelehnt: false'||E'\n';
  exception when others then r:=r||'17 Nicht geplante Uhrzeit abgelehnt: true'||E'\n'; end;
  begin insert into public.medication_doses(medication_id,pet_id,scheduled_on,scheduled_time) values (m1,luna,current_date+1,'08:00'); r:=r||'18 Gabe in der Zukunft abgelehnt: false'||E'\n';
  exception when others then r:=r||'18 Gabe in der Zukunft abgelehnt: true'||E'\n'; end;
  begin insert into public.medication_doses(medication_id,pet_id,scheduled_on,scheduled_time) values (m1,luna,current_date-1,'08:00'); r:=r||'19 Gabe vor Beginn abgelehnt: false'||E'\n';
  exception when others then r:=r||'19 Gabe vor Beginn abgelehnt: true'||E'\n'; end;
  begin insert into public.medication_doses(medication_id,pet_id,scheduled_on,scheduled_time) values (m1,mio,current_date,'19:30'); r:=r||'20 Gabe mit falschem Tier abgelehnt: false'||E'\n';
  exception when others then r:=r||'20 Gabe mit falschem Tier abgelehnt: true'||E'\n'; end;
  begin insert into public.medication_doses(medication_id,pet_id,scheduled_on,scheduled_time,given_by) values (m1,luna,current_date,'19:30',k); r:=r||'21 Gabe im Namen anderer abgelehnt: false'||E'\n';
  exception when others then r:=r||'21 Gabe im Namen anderer abgelehnt: true'||E'\n'; end;

  -- Familie: Kyra Mithalterin, Oma nur ansehen
  select token into tk from public.create_pet_invite('Kyra','carer',array[luna]);
  perform set_config('request.jwt.claims', json_build_object('sub',k)::text, true);
  perform public.accept_pet_invite(tk);
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  select token into tk from public.create_pet_invite('Oma','viewer',array[luna]);
  perform set_config('request.jwt.claims', json_build_object('sub',o)::text, true);
  perform public.accept_pet_invite(tk);

  perform set_config('request.jwt.claims', json_build_object('sub',k)::text, true);
  insert into public.medication_doses(medication_id,pet_id,scheduled_on,scheduled_time) values (m1,luna,current_date,'19:30');
  select pr.display_name into v from public.medication_doses d join public.profiles pr on pr.id=d.given_by where d.medication_id=m1 and d.scheduled_time='19:30';
  r:=r||'22 Mithalterin hakt ab, Name sichtbar („gegeben von“): '||(v='Kyra')||E'\n';
  update public.pet_medications set ends_on=current_date+7 where id=m1; get diagnostics n=row_count; r:=r||'23 Mithalterin ändert Medikament: '||(n=1)||E'\n';
  select count(*) into n from public.pet_medications where pet_id=mio; r:=r||'24 Mithalterin sieht nur geteilte Tiere: '||(n=0)||E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',o)::text, true);
  select count(*) into n from public.pet_medications; r:=r||'25 Nur-ansehen sieht Medikation: '||(n=3)||E'\n';
  select count(*) into n from public.medication_doses; r:=r||'26 Nur-ansehen sieht Gaben: '||(n=2)||E'\n';
  begin insert into public.pet_medications(pet_id,name,amount,unit,times) values (luna,'x',1,'tablet','{08:00}'); r:=r||'27 Nur-ansehen kann nichts anlegen: false'||E'\n';
  exception when others then r:=r||'27 Nur-ansehen kann nichts anlegen: true'||E'\n'; end;
  begin insert into public.medication_doses(medication_id,pet_id,scheduled_on,scheduled_time) values (m1,luna,current_date-0,'08:00'); r:=r||'28 Nur-ansehen kann nicht abhaken: false'||E'\n';
  exception when others then r:=r||'28 Nur-ansehen kann nicht abhaken: true'||E'\n'; end;
  delete from public.medication_doses; get diagnostics n=row_count; r:=r||'29 Nur-ansehen kann Gabe nicht zurücknehmen: '||(n=0)||E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',f)::text, true);
  select count(*) into n from public.pet_medications; r:=r||'30 Fremde sieht keine Medikation: '||(n=0)||E'\n';
  select count(*) into n from public.medication_doses; r:=r||'31 Fremde sieht keine Gaben: '||(n=0)||E'\n';

  -- Sitter-Ansicht
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  insert into public.sitter_access(pet_id,sitter_name,valid_from,valid_to) values (luna,'Sitter',current_date,current_date+3) returning token into tk;
  update public.pet_medications set stopped_on=current_date-1 where id=m2;
  execute 'set local role anon';
  j := public.sitter_view(tk);
  r:=r||'32 Sitter sieht laufende Medikamente mit Uhrzeiten: '||(jsonb_array_length(j->'active_medications')=2 and (j->'active_medications'->0->>'name')='Meloxicam' and (j->'active_medications'->0->'times')='["08:00","19:30"]'::jsonb)||E'\n';
  r:=r||'33 Beendetes Medikament nicht in Sitter-Ansicht: '||(not (j->'active_medications')::text like '%Gabapentin%')||E'\n';
  execute 'reset role';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  delete from public.medication_doses where id=d1; get diagnostics n=row_count; r:=r||'34 Besitzer nimmt Gabe zurück: '||(n=1)||E'\n';
  delete from public.pet_medications where id=m1; get diagnostics n=row_count;
  execute 'reset role';
  select count(*) into n from public.medication_doses where medication_id=m1; r:=r||'35 Medikament gelöscht → Gaben weg: '||(n=0)||E'\n';
  delete from public.pets where id=luna;
  select count(*) into n from public.pet_medications where pet_id=luna; r:=r||'36 Tier gelöscht → Medikation weg: '||(n=0)||E'\n';
  raise notice E'\n%', r;
end $$;
rollback;
