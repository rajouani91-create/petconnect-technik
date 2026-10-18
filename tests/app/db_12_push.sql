begin;
do $$
declare a uuid := gen_random_uuid(); k uuid := gen_random_uuid(); o uuid := gen_random_uuid(); f uuid := gen_random_uuid();
  luna uuid; tk text; n int; r text := ''; m1 uuid; j jsonb; tok text; d date := (now() at time zone 'Europe/Berlin')::date;
  t0 timestamptz := ((d + time '08:00') at time zone 'Europe/Berlin');
begin
  insert into auth.users(id,email,raw_user_meta_data) values (a,'a@x','{"display_name":"Ahmed"}'),(k,'k@x','{"display_name":"Kyra"}'),(o,'o@x','{}'),(f,'f@x','{}');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  insert into public.pets(name,species) values ('Luna','dog') returning id into luna;
  insert into public.pet_medications(pet_id,name,amount,unit,times,intake_hint,starts_on) values (luna,'Meloxicam',0.5,'ml','{08:00,20:00}','with_food',d-1) returning id into m1;
  insert into public.reminders(pet_id,title,kind,due_on) values (luna,'Entwurmung','deworming',d);
  insert into public.appointments(pet_id,title,starts_at) values (luna,'Kontrolle',t0 + interval '3 hours');

  perform public.register_push('https://push.example/a1','BAbcdefghijklmnopqrstuvwxyz0123456789','authsecret12');
  select count(*) into n from public.push_subscriptions; r:=r||'01 Gerät anmelden: '||(n=1)||E'\n';
  begin perform public.register_push('http://unsicher/a','BAbcdefghijklmnopqrstuvwxyz0123456789','authsecret12'); r:=r||'02 Nur https-Adressen: false'||E'\n';
  exception when others then r:=r||'02 Nur https-Adressen: true'||E'\n'; end;
  begin perform public.push_claim('x'); r:=r||'03 Halter:in kann push_claim nicht aufrufen: false'||E'\n';
  exception when others then r:=r||'03 Halter:in kann push_claim nicht aufrufen: true'||E'\n'; end;
  begin select public.push_token() into tok; r:=r||'04 Halter:in kann Token nicht lesen: false'||E'\n';
  exception when others then r:=r||'04 Halter:in kann Token nicht lesen: true'||E'\n'; end;
  begin perform 1 from private.push_config; r:=r||'05 Interne Konfiguration nicht lesbar: false'||E'\n';
  exception when others then r:=r||'05 Interne Konfiguration nicht lesbar: true'||E'\n'; end;
  insert into public.notification_prefs(appointments) values (true);
  update public.notification_prefs set reminder_time='09:30'; get diagnostics n=row_count; r:=r||'06 Eigene Einstellungen ändern: '||(n=1)||E'\n';

  -- Kyra Mithalterin mit eigenem Gerät, Oma nur ansehen mit Gerät, Fremde mit Gerät
  select token into tk from public.create_pet_invite('Kyra','carer',array[luna]);
  perform set_config('request.jwt.claims', json_build_object('sub',k)::text, true);
  perform public.accept_pet_invite(tk);
  perform public.register_push('https://push.example/k1','BAbcdefghijklmnopqrstuvwxyz0123456789','authsecret12');
  select count(*) into n from public.push_subscriptions; r:=r||'07 Jede Person sieht nur eigene Geräte: '||(n=1)||E'\n';
  insert into public.notification_prefs(medication) values (true);
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  select token into tk from public.create_pet_invite('Oma','viewer',array[luna]);
  perform set_config('request.jwt.claims', json_build_object('sub',o)::text, true);
  perform public.accept_pet_invite(tk);
  perform public.register_push('https://push.example/o1','BAbcdefghijklmnopqrstuvwxyz0123456789','authsecret12');
  perform set_config('request.jwt.claims', json_build_object('sub',f)::text, true);
  perform public.register_push('https://push.example/f1','BAbcdefghijklmnopqrstuvwxyz0123456789','authsecret12');
  update public.notification_prefs set medication=false; -- keine Zeile → nichts
  execute 'reset role';

  select cron_token into tok from private.push_config;
  -- 08:03: Medikament 08:00 fällig für Ahmed und Kyra, nicht für Oma/Fremde
  j := public.push_claim(tok, t0 + interval '3 minutes');
  r:=r||'08 08:03 → Medikament an Besitzer und Mithalterin (2): '||(jsonb_array_length(j)=2 and j->0->>'kind'='medication')||E'\n';
  r:=r||'09 Nachricht enthält Menge, Einheit, Hinweis, Gerät: '||((j->0->'info'->>'unit')='ml' and (j->0->'info'->>'hint')='with_food' and jsonb_array_length(j->0->'subs')=1)||E'\n';
  j := public.push_claim(tok, t0 + interval '4 minutes');
  r:=r||'10 Gleiche Gabe nicht doppelt: '||(jsonb_array_length(j)=0)||E'\n';
  -- Abgehakt → keine Benachrichtigung für 20:00
  insert into public.medication_doses(medication_id,pet_id,scheduled_on,scheduled_time,given_by) values (m1,luna,d,'20:00',a);
  j := public.push_claim(tok, t0 + interval '12 hours 2 minutes');
  r:=r||'11 Schon gegeben → keine Erinnerung: '||(jsonb_array_length(j)=0)||E'\n';
  -- Erinnerung: Kyra 09:00 (Standard), Ahmed 09:30
  j := public.push_claim(tok, t0 + interval '1 hour 1 minute');
  r:=r||'12 09:01 Erinnerung nur an Kyra (Standardzeit): '||(jsonb_array_length(j)=1 and j->0->>'kind'='reminder')||E'\n';
  j := public.push_claim(tok, t0 + interval '1 hour 31 minutes');
  r:=r||'13 09:31 Erinnerung an Ahmed (eigene Zeit 09:30): '||(jsonb_array_length(j)=1)||E'\n';
  -- Termin 11:00 → 10:00 Benachrichtigung
  j := public.push_claim(tok, t0 + interval '2 hours 5 minutes');
  r:=r||'14 Termin 60 Min. vorher an beide: '||(jsonb_array_length(j)=2 and j->0->>'kind'='appointment' and j->0->'info'->>'time'='11:00')||E'\n';
  -- Ahmed schaltet Termine aus
  update public.notification_prefs set appointments=false where user_id=a;
  update public.appointments set starts_at=t0 + interval '5 hours' where pet_id=luna;
  j := public.push_claim(tok, t0 + interval '4 hours 1 minute');
  r:=r||'15 Termine ausgeschaltet → nur Kyra: '||(jsonb_array_length(j)=1)||E'\n';
  begin j := public.push_claim('falsch', now()); r:=r||'16 Falscher Token abgelehnt: false'||E'\n';
  exception when others then r:=r||'16 Falscher Token abgelehnt: true'||E'\n'; end;

  -- Ergebnis zurückmelden: abgelaufenes Gerät wird entfernt
  perform public.push_result(tok, '{}', array(select id from public.push_subscriptions where endpoint='https://push.example/k1'), '{}');
  select count(*) into n from public.push_subscriptions where endpoint='https://push.example/k1' and failures<10; r:=r||'17 Abgelaufenes Gerät wird nicht mehr angeschrieben: '||(n=0)||E'\n';
  -- Gerät wechselt Konto
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub',k)::text, true);
  perform public.register_push('https://push.example/a1','BAbcdefghijklmnopqrstuvwxyz0123456789','authsecret99');
  execute 'reset role';
  select count(*) into n from public.push_subscriptions where endpoint='https://push.example/a1' and user_id=k; r:=r||'18 Gerät gehört nach neuer Anmeldung dem neuen Konto: '||(n=1)||E'\n';
  -- Tick ruft Edge Function mit Token auf
  perform private.push_tick();
  select count(*) into n from net.calls where headers->>'x-push-token' = tok; r:=r||'19 Minütlicher Anstoß mit Token: '||(n>=1)||E'\n';
  raise notice E'\n%', r;
end $$;
rollback;
