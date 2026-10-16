begin;
do $$
declare
  a uuid := gen_random_uuid(); k uuid := gen_random_uuid(); o uuid := gen_random_uuid(); f uuid := gen_random_uuid();
  luna uuid; mio uuid; fremd uuid; it uuid; tk text; to2 text; n int; r text := ''; j jsonb; arr uuid[];
  today date := (now() at time zone 'Europe/Berlin')::date;
begin
  insert into auth.users(id,email,raw_user_meta_data) values
   (a,'a@x.invalid','{"display_name":"Ahmed"}'),(k,'k@x.invalid','{"display_name":"Kyra"}'),(o,'o@x.invalid','{"display_name":"Oma Erika"}'),(f,'f@x.invalid','{"display_name":"Fremd"}');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub',f)::text, true);
  insert into public.pets(name,species) values ('FremdTier','cat') returning id into fremd;

  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  insert into public.pets(name,species) values ('Luna','dog') returning id into luna;
  insert into public.pets(name,species) values ('Mio','cat') returning id into mio;
  insert into public.routine_items(pet_id,kind,time_of_day) values (luna,'walk','07:00') returning id into it;

  -- Fehlerfälle beim Anlegen
  begin perform public.create_pet_invite('', 'carer', array[luna]); r:=r||'01 Name fehlt abgelehnt: false'||E'\n';
  exception when others then r:=r||'01 Name fehlt abgelehnt: '||(sqlerrm='invite_name')||E'\n'; end;
  begin perform public.create_pet_invite('Kyra', 'carer', array[]::uuid[]); r:=r||'02 Kein Tier abgelehnt: false'||E'\n';
  exception when others then r:=r||'02 Kein Tier abgelehnt: '||(sqlerrm='invite_no_pets')||E'\n'; end;
  begin perform public.create_pet_invite('Kyra', 'admin', array[luna]); r:=r||'03 Falsche Stufe abgelehnt: false'||E'\n';
  exception when others then r:=r||'03 Falsche Stufe abgelehnt: '||(sqlerrm='invite_role')||E'\n'; end;
  begin perform public.create_pet_invite('Kyra', 'carer', array[fremd]); r:=r||'04 Fremdes Tier abgelehnt: false'||E'\n';
  exception when others then r:=r||'04 Fremdes Tier abgelehnt: '||(sqlerrm='invite_not_owner')||E'\n'; end;
  begin insert into public.pet_invites(invitee_name) values ('X'); r:=r||'05 Direktes Anlegen gesperrt: false'||E'\n';
  exception when others then r:=r||'05 Direktes Anlegen gesperrt: true'||E'\n'; end;

  -- Kyra: Mithalterin für Luna und Mio
  select token into tk from public.create_pet_invite('Kyra', 'carer', array[luna,mio]);
  r:=r||'06 Einladung Kyra (2 Tiere): '||(length(tk)=64 and (select count(*) from public.pet_invite_pets)=2)||E'\n';
  begin perform public.create_pet_invite('kyra', 'viewer', array[luna]); r:=r||'07 Doppelte Einladung abgelehnt: false'||E'\n';
  exception when others then r:=r||'07 Doppelte Einladung abgelehnt: '||(sqlerrm='invite_duplicate')||E'\n'; end;
  -- Oma: nur ansehen, nur Luna
  select token into to2 from public.create_pet_invite('Oma Erika', 'viewer', array[luna]);
  select count(*) into n from public.pet_invites; r:=r||'08 Ahmed sieht 2 offene Einladungen mit Stufe: '||(n=2 and exists(select 1 from public.pet_invites where invitee_name='Oma Erika' and role='viewer'))||E'\n';
  begin perform public.accept_pet_invite(tk); r:=r||'09 Eigene Einladung annehmen gesperrt: false'||E'\n';
  exception when others then r:=r||'09 Eigene Einladung annehmen gesperrt: '||(sqlerrm='invite_own')||E'\n'; end;

  -- Kyra nimmt an
  perform set_config('request.jwt.claims', json_build_object('sub',k)::text, true);
  j := public.invite_preview(tk);
  r:=r||'10 Vorschau: '||(j->>'status')||', '||(j->>'role')||', '||(j->>'inviter_name')||', Tiere='||jsonb_array_length(j->'pets')||E'\n';
  arr := public.accept_pet_invite(tk);
  r:=r||'11 Kyra bekommt 2 Tiere: '||(cardinality(arr)=2 and (select count(*) from public.pets)=2)||E'\n';
  insert into public.routine_done(routine_item_id,done_on) values (it,today); r:=r||'12 Mithalterin hakt ab: true'||E'\n';
  update public.pets set breed='Labrador' where id=luna; get diagnostics n=row_count; r:=r||'13 Mithalterin ändert Stammdaten: '||(n=1)||E'\n';
  select count(*) into n from public.pet_invites; r:=r||'14 Kyra sieht Ahmeds Einladungen nicht: '||(n=0)||E'\n';
  begin perform public.create_pet_invite('Jemand', 'carer', array[luna]); r:=r||'15 Mithalterin kann nicht einladen: false'||E'\n';
  exception when others then r:=r||'15 Mithalterin kann nicht einladen: '||(sqlerrm='invite_not_owner')||E'\n'; end;
  j := public.invite_preview(tk); r:=r||'16 Vorschau danach "member": '||(j->>'status'='member')||E'\n';

  -- Oma nimmt an: nur ansehen
  perform set_config('request.jwt.claims', json_build_object('sub',o)::text, true);
  arr := public.accept_pet_invite(to2);
  select count(*) into n from public.pets; r:=r||'17 Oma sieht nur Luna: '||(n=1)||E'\n';
  select count(*) into n from public.routine_items; r:=r||'18 Oma sieht Tagesplan: '||(n=1)||E'\n';
  select count(*) into n from public.routine_done; r:=r||'19 Oma sieht Kyras Häkchen: '||(n=1)||E'\n';
  begin insert into public.routine_done(routine_item_id,done_on) values (it,today+1); r:=r||'20 Oma kann nicht abhaken: false'||E'\n';
  exception when others then r:=r||'20 Oma kann nicht abhaken: true'||E'\n'; end;
  update public.routine_items set reminder_on=false where id=it; get diagnostics n=row_count; r:=r||'21 Oma kann Erinnerung nicht schalten: '||(n=0)||E'\n';
  update public.pets set name='X' where id=luna; get diagnostics n=row_count; r:=r||'22 Oma kann Stammdaten nicht ändern: '||(n=0)||E'\n';
  delete from public.routine_done where routine_item_id=it; get diagnostics n=row_count; r:=r||'23 Oma kann Häkchen nicht löschen: '||(n=0)||E'\n';
  begin insert into public.routine_items(pet_id,kind,time_of_day) values (luna,'feed','09:00'); r:=r||'24 Oma kann keinen Eintrag anlegen: false'||E'\n';
  exception when others then r:=r||'24 Oma kann keinen Eintrag anlegen: true'||E'\n'; end;
  begin insert into public.weights(pet_id,kg) values (luna,30); r:=r||'25 Oma kann kein Gewicht eintragen: false'||E'\n';
  exception when others then r:=r||'25 Oma kann kein Gewicht eintragen: true'||E'\n'; end;
  update public.pet_members set role='carer' where user_id=o; get diagnostics n=row_count; r:=r||'26 Oma kann sich nicht hochstufen: '||(n=0)||E'\n';
  select count(*) into n from public.pet_members where pet_id=luna; r:=r||'27 Oma sieht alle 3 Betreuer von Luna: '||(n=3)||E'\n';
  select count(*) into n from public.profiles; r:=r||'28 Oma sieht Namen von Ahmed und Kyra: '||(n=3)||E'\n';

  -- Ahmed ändert Rechte
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  update public.pet_members set role='carer' where user_id=o and pet_id=luna; get diagnostics n=row_count; r:=r||'29 Ahmed stuft Oma hoch: '||(n=1)||E'\n';
  begin update public.pet_members set role='owner' where user_id=k and pet_id=luna; get diagnostics n=row_count; r:=r||'30 Niemand wird zweiter Besitzer: '||(n=0)||E'\n';
  exception when others then r:=r||'30 Niemand wird zweiter Besitzer: true'||E'\n'; end;
  perform set_config('request.jwt.claims', json_build_object('sub',o)::text, true);
  insert into public.routine_done(routine_item_id,done_on) values (it,today+1); r:=r||'31 Oma darf danach abhaken: true'||E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  update public.pet_members set role='viewer' where user_id=k and pet_id=mio; get diagnostics n=row_count; r:=r||'32 Ahmed stuft Kyra bei Mio auf Nur ansehen: '||(n=1)||E'\n';
  update public.pet_members set role='viewer' where user_id=a; get diagnostics n=row_count; r:=r||'33 Besitzer-Rolle bleibt: '||(n=0)||E'\n';

  -- Grenze 5 Personen: Kyra + Oma = 2, 3 weitere offen erlaubt, die 6. nicht
  perform public.create_pet_invite('P3','viewer',array[luna]);
  perform public.create_pet_invite('P4','viewer',array[luna]);
  perform public.create_pet_invite('P5','viewer',array[luna]);
  begin perform public.create_pet_invite('P6','viewer',array[luna]); r:=r||'34 Mehr als 5 Personen abgelehnt: false'||E'\n';
  exception when others then r:=r||'34 Mehr als 5 Personen abgelehnt: '||(sqlerrm='invite_max')||E'\n'; end;
  delete from public.pet_invites where invitee_name='P5'; get diagnostics n=row_count; r:=r||'35 Einladung zurückziehen: '||(n=1)||E'\n';
  perform public.create_pet_invite('P6','viewer',array[luna]); r:=r||'36 Danach wieder Platz: true'||E'\n';

  -- Fremde
  perform set_config('request.jwt.claims', json_build_object('sub',f)::text, true);
  select count(*) into n from public.pets where id in (luna,mio); r:=r||'37 Fremde sieht nichts: '||(n=0)||E'\n';
  begin perform public.accept_pet_invite(tk); r:=r||'38 Benutzte Einladung gesperrt: false'||E'\n';
  exception when others then r:=r||'38 Benutzte Einladung gesperrt: '||(sqlerrm='invite_used')||E'\n'; end;
  select count(*) into n from public.pet_invite_pets; r:=r||'39 Fremde sieht keine Einladungstiere: '||(n=0)||E'\n';

  -- Tier gelöscht: Einladung ohne Tiere
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  delete from public.pet_invites where invitee_name='P6';
  select token into to2 from public.create_pet_invite('NurMio','carer',array[mio]);
  perform set_config('request.jwt.claims', json_build_object('sub',k)::text, true);
  delete from public.pets where id=mio; get diagnostics n=row_count; r:=r||'40 Mithalterin kann Mio nicht löschen: '||(n=0)||E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  delete from public.pets where id=mio;
  perform set_config('request.jwt.claims', json_build_object('sub',f)::text, true);
  j := public.invite_preview(to2); r:=r||'41 Einladung ohne Tiere zeigt "empty": '||(j->>'status'='empty')||E'\n';
  begin perform public.accept_pet_invite(to2); r:=r||'42 Und lässt sich nicht annehmen: false'||E'\n';
  exception when others then r:=r||'42 Und lässt sich nicht annehmen: '||(sqlerrm='invite_not_found')||E'\n'; end;
  raise notice E'\n%', r;
end $$;
rollback;
