begin;
do $$
declare a uuid := gen_random_uuid(); luna uuid; n int; r text := ''; j jsonb; tok text; ri uuid; ri2 uuid; dmed uuid;
  d date := (now() at time zone 'Europe/Berlin')::date;
  t0 timestamptz := ((d + time '07:00') at time zone 'Europe/Berlin');
  wd boolean := extract(isodow from d) between 1 and 5;
begin
  insert into auth.users(id,email,raw_user_meta_data) values (a,'a@x','{"display_name":"Ahmed"}');
  execute 'reset role';
  -- Altbestand: ein Medikament im Tagesplan (vor dieser Regel angelegt)
  alter table public.routine_items disable trigger routine_items_no_med;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  insert into public.pets(name,species) values ('Luna','dog') returning id into luna;
  insert into public.routine_items(pet_id,kind,label,time_of_day) values (luna,'med','Tablette','08:00') returning id into dmed;
  execute 'reset role';
  alter table public.routine_items enable trigger routine_items_no_med;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);

  begin insert into public.routine_items(pet_id,kind,time_of_day) values (luna,'med','09:00'); r:=r||'01 Neues Medikament im Tagesplan abgelehnt: false'||E'\n';
  exception when others then r:=r||'01 Neues Medikament im Tagesplan abgelehnt: '||(sqlerrm='routine_use_medication')||E'\n'; end;
  insert into public.routine_items(pet_id,kind,time_of_day) values (luna,'litter','06:00');
  begin update public.routine_items set kind='med' where pet_id=luna and kind='litter'; r:=r||'02 Umstellen auf Medikament abgelehnt: false'||E'\n';
  exception when others then r:=r||'02 Umstellen auf Medikament abgelehnt: '||(sqlerrm='routine_use_medication')||E'\n'; end;
  update public.routine_items set time_of_day='08:30' where id=dmed; get diagnostics n=row_count; r:=r||'03 Alter Medikamenten-Eintrag bleibt änderbar/löschbar: '||(n=1)||E'\n';

  insert into public.routine_items(pet_id,kind,time_of_day,repeat) values (luna,'walk','07:00','daily') returning id into ri;
  insert into public.routine_items(pet_id,kind,label,time_of_day,repeat) values (luna,'own','Bürsten','07:00','weekends') returning id into ri2;
  insert into public.routine_items(pet_id,kind,time_of_day,reminder_on) values (luna,'feed','07:00',false);
  r:=r||'04 Gassi/Füttern/Eigenes weiter anlegbar: true'||E'\n';
  perform public.register_push('https://push.example/a1','BAbcdefghijklmnopqrstuvwxyz0123456789','authsecret12');
  execute 'reset role';
  select cron_token into tok from private.push_config;

  j := public.push_claim(tok, t0 + interval '2 minutes');
  r:=r||'05 07:02 Gassi-Push (mit Art und Uhrzeit), Füttern ohne Erinnerung nicht: '||(
     exists(select 1 from jsonb_array_elements(j) e where e->>'kind'='routine' and e->'info'->>'rkind'='walk' and e->'info'->>'time'='07:00')
     and not exists(select 1 from jsonb_array_elements(j) e where e->'info'->>'rkind'='feed'))||E'\n';
  r:=r||'06 Bürsten nur am Wochenende: '||(exists(select 1 from jsonb_array_elements(j) e where e->'info'->>'label'='Bürsten') = not wd)||E'\n';
  j := public.push_claim(tok, t0 + interval '3 minutes');
  r:=r||'07 Nicht doppelt: '||(jsonb_array_length(j)=0)||E'\n';
  j := public.push_claim(tok, t0 + interval '92 minutes');
  r:=r||'08 Alter Medikamenten-Eintrag im Tagesplan löst keinen Push aus: '||(jsonb_array_length(j)=0)||E'\n';
  -- erledigt → kein Push
  update public.routine_items set time_of_day='12:00' where id=ri;
  insert into public.routine_done(routine_item_id,owner_id,done_on) values (ri,a,d);
  j := public.push_claim(tok, t0 + interval '5 hours 1 minute');
  r:=r||'09 Heute schon erledigt → kein Push: '||(jsonb_array_length(j)=0)||E'\n';
  delete from public.routine_done where routine_item_id=ri;
  update public.notification_prefs set routine=false where user_id=a;
  insert into public.notification_prefs(user_id,routine) select a,false where not exists (select 1 from public.notification_prefs where user_id=a);
  update public.routine_items set time_of_day='13:00' where id=ri;
  j := public.push_claim(tok, t0 + interval '6 hours 1 minute');
  r:=r||'10 Tagesplan-Erinnerungen ausgeschaltet → kein Push: '||(jsonb_array_length(j)=0)||E'\n';
  raise notice E'\n%', r;
end $$;
rollback;
