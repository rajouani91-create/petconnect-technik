begin;
do $$
declare a uuid := gen_random_uuid(); k uuid := gen_random_uuid(); o uuid := gen_random_uuid(); f uuid := gen_random_uuid();
  luna uuid; bello uuid; tk text; n int; r text := ''; ins uuid; ins2 uuid; cl uuid; doc uuid; doc2 uuid; sa uuid; st text; st2 text; j jsonb;
begin
  insert into auth.users(id,email,raw_user_meta_data) values (a,'a@x','{"display_name":"Ahmed"}'),(k,'k@x','{}'),(o,'o@x','{}'),(f,'f@x','{}');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  insert into public.pets(name,species,allergies) values ('Luna','dog','Hühnereiweiß') returning id into luna;
  insert into public.pets(name,species) values ('Bello','dog') returning id into bello;

  -- Notfallkarte
  update public.pets set vet_name='Praxis am Markt', vet_phone='06142 1234', owner_phone='0170 555' where id=luna; get diagnostics n=row_count;
  r:=r||'01 Besitzer pflegt Notfallkarte: '||(n=1)||E'\n';
  begin update public.pets set vet_phone=repeat('1',41) where id=luna; r:=r||'02 Telefonnummer zu lang abgelehnt: false'||E'\n';
  exception when others then r:=r||'02 Telefonnummer zu lang abgelehnt: true'||E'\n'; end;

  -- Versicherung
  insert into public.pet_insurances(pet_id,insurer,policy_no,deductible,reimbursement_pct,submission) values (luna,'Beispiel-Versicherung','AB-123',250,80,'portal') returning id into ins;
  r:=r||'03 Besitzer legt Versicherung an: true'||E'\n';
  begin insert into public.pet_insurances(pet_id,insurer,policy_no,reimbursement_pct) values (luna,'X','1',120); r:=r||'04 Quote über 100 % abgelehnt: false'||E'\n';
  exception when others then r:=r||'04 Quote über 100 % abgelehnt: true'||E'\n'; end;
  insert into public.pet_insurances(pet_id,insurer,policy_no) values (bello,'Andere','B-9') returning id into ins2;
  insert into public.insurance_claims(insurance_id,pet_id,title,amount) values (ins,luna,'Zahnbehandlung',420.50) returning id into cl;
  r:=r||'05 Einreichung eintragen: true'||E'\n';
  begin insert into public.insurance_claims(insurance_id,pet_id,title,amount) values (ins2,luna,'falsch',10); r:=r||'06 Einreichung mit Versicherung eines anderen Tiers abgelehnt: false'||E'\n';
  exception when others then r:=r||'06 Einreichung mit Versicherung eines anderen Tiers abgelehnt: true'||E'\n'; end;
  begin update public.insurance_claims set reimbursed_amount=500 where id=cl; r:=r||'07 Erstattung über Rechnungsbetrag abgelehnt: false'||E'\n';
  exception when others then r:=r||'07 Erstattung über Rechnungsbetrag abgelehnt: true'||E'\n'; end;
  insert into storage.objects(bucket_id,name) values ('pet-documents', luna||'/rechnung.pdf'), ('pet-documents', bello||'/b.pdf');
  insert into public.pet_documents(pet_id,title,category,storage_path,mime_type,size_bytes) values (luna,'Rechnung','invoice',luna||'/rechnung.pdf','application/pdf',1000) returning id into doc;
  insert into public.pet_documents(pet_id,title,category,storage_path,mime_type,size_bytes) values (bello,'Bello','invoice',bello||'/b.pdf','application/pdf',1000) returning id into doc2;
  update public.insurance_claims set document_id=doc, status='partial', reimbursed_amount=200 where id=cl; get diagnostics n=row_count;
  r:=r||'08 Rechnung als Dokument verknüpfen: '||(n=1)||E'\n';
  begin update public.insurance_claims set document_id=doc2 where id=cl; r:=r||'09 Dokument eines anderen Tiers abgelehnt: false'||E'\n';
  exception when others then r:=r||'09 Dokument eines anderen Tiers abgelehnt: true'||E'\n'; end;
  delete from public.pet_documents where id=doc;
  select count(*) into n from public.insurance_claims where id=cl and document_id is null; r:=r||'10 Dokument gelöscht → Verknüpfung leer, Einreichung bleibt: '||(n=1)||E'\n';

  -- Sitter-Zugang
  insert into public.sitter_access(pet_id,sitter_name,valid_from,valid_to,feeding) values (luna,'Sara',current_date,current_date+7,'2x täglich 150 g') returning id, token into sa, st;
  r:=r||'11 Besitzer erstellt Sitter-Zugang: '||(char_length(st)=64)||E'\n';
  begin insert into public.sitter_access(pet_id,sitter_name,valid_from,valid_to) values (luna,'x',current_date,current_date-1); r:=r||'12 Ende vor Beginn abgelehnt: false'||E'\n';
  exception when others then r:=r||'12 Ende vor Beginn abgelehnt: true'||E'\n'; end;
  begin insert into public.sitter_access(pet_id,sitter_name,valid_from,valid_to) values (luna,'x',current_date,current_date+120); r:=r||'13 Zugang länger als 92 Tage abgelehnt: false'||E'\n';
  exception when others then r:=r||'13 Zugang länger als 92 Tage abgelehnt: true'||E'\n'; end;
  insert into public.sitter_access(pet_id,sitter_name,valid_from,valid_to) values (luna,'Später',current_date+3,current_date+5) returning token into st2;

  -- Kyra (Mithalterin), Oma (nur ansehen)
  select token into tk from public.create_pet_invite('Kyra','carer',array[luna]);
  perform set_config('request.jwt.claims', json_build_object('sub',k)::text, true); perform public.accept_pet_invite(tk);
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  select token into tk from public.create_pet_invite('Oma','viewer',array[luna]);
  perform set_config('request.jwt.claims', json_build_object('sub',o)::text, true); perform public.accept_pet_invite(tk);

  perform set_config('request.jwt.claims', json_build_object('sub',k)::text, true);
  select count(*) into n from public.sitter_access; r:=r||'14 Mithalterin sieht Sitter-Zugänge: '||(n=2)||E'\n';
  update public.pet_insurances set note='geprüft' where id=ins; get diagnostics n=row_count; r:=r||'15 Mithalterin ändert Versicherung: '||(n=1)||E'\n';
  select count(*) into n from public.pet_insurances; r:=r||'16 Mithalterin sieht nur Versicherung von Luna: '||(n=1)||E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',o)::text, true);
  select count(*) into n from public.pet_insurances; r:=r||'17 Nur-ansehen sieht Versicherung: '||(n=1)||E'\n';
  select count(*) into n from public.sitter_access; r:=r||'18 Nur-ansehen sieht keine Sitter-Links: '||(n=0)||E'\n';
  update public.pet_insurances set note='x'; get diagnostics n=row_count; r:=r||'19 Nur-ansehen kann Versicherung nicht ändern: '||(n=0)||E'\n';
  begin insert into public.sitter_access(pet_id,sitter_name,valid_from,valid_to) values (luna,'x',current_date,current_date); r:=r||'20 Nur-ansehen kann keinen Sitter-Zugang anlegen: false'||E'\n';
  exception when others then r:=r||'20 Nur-ansehen kann keinen Sitter-Zugang anlegen: true'||E'\n'; end;
  update public.pets set vet_phone='x' where id=luna; get diagnostics n=row_count; r:=r||'21 Nur-ansehen kann Notfallkarte nicht ändern: '||(n=0)||E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',f)::text, true);
  select count(*) into n from public.pet_insurances; r:=r||'22 Fremde sieht keine Versicherung: '||(n=0)||E'\n';
  select count(*) into n from public.insurance_claims; r:=r||'23 Fremde sieht keine Einreichungen: '||(n=0)||E'\n';
  select count(*) into n from public.sitter_access; r:=r||'24 Fremde sieht keine Sitter-Zugänge: '||(n=0)||E'\n';

  -- Öffentliche Sitter-Ansicht ohne Anmeldung
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{}', true);
  j := public.sitter_view(st);
  r:=r||'25 Sitter-Link zeigt Betreuungsinfos: '||(j->>'status'='ok' and j->'pet'->>'name'='Luna' and j->>'feeding'='2x täglich 150 g' and j->>'vet_phone'='06142 1234' and j->'pet'->>'allergies'='Hühnereiweiß')||E'\n';
  r:=r||'26 Sitter-Ansicht ohne Versicherung/Dokumente/Notizen: '||(not (j ? 'insurance') and not (j ? 'documents') and not (j::text like '%AB-123%'))||E'\n';
  j := public.sitter_view(st2); r:=r||'27 Zukünftiger Zugang zeigt nur Startdatum: '||(j->>'status'='not_yet' and not (j ? 'feeding'))||E'\n';
  j := public.sitter_view(repeat('0',64)); r:=r||'28 Unbekannter Link: '||(j->>'status'='not_found')||E'\n';
  j := public.sitter_view('kurz'); r:=r||'29 Kaputter Link: '||(j->>'status'='not_found')||E'\n';
  begin select count(*) into n from public.sitter_access; r:=r||'30 Anonym kein Tabellenzugriff: '||(n=0)||E'\n';
  exception when others then r:=r||'30 Anonym kein Tabellenzugriff: true'||E'\n'; end;
  begin select count(*) into n from public.pet_insurances; r:=r||'31 Anonym keine Versicherungen: '||(n=0)||E'\n';
  exception when others then r:=r||'31 Anonym keine Versicherungen: true'||E'\n'; end;

  -- Widerrufen
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub',k)::text, true);
  update public.sitter_access set revoked_at=now() where id=sa;
  execute 'set local role anon'; perform set_config('request.jwt.claims', '{}', true);
  j := public.sitter_view(st); r:=r||'32 Widerrufener Link zeigt nichts mehr: '||(j->>'status'='revoked' and not (j ? 'pet'))||E'\n';

  -- Abgelaufen
  execute 'reset role';
  update public.sitter_access set valid_from=current_date-10, valid_to=current_date-1 where token=st2;
  execute 'set local role anon';
  j := public.sitter_view(st2); r:=r||'33 Abgelaufener Link zeigt nichts mehr: '||(j->>'status'='expired')||E'\n';

  -- Token nicht änderbar
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  begin update public.sitter_access set token=repeat('a',64) where id=sa; r:=r||'34 Link-Token nicht änderbar: false'||E'\n';
  exception when others then r:=r||'34 Link-Token nicht änderbar: true'||E'\n'; end;

  execute 'reset role';
  raise notice E'\n%', r;
end $$;
rollback;
