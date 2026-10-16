begin;
do $$
declare a uuid := gen_random_uuid(); k uuid := gen_random_uuid(); o uuid := gen_random_uuid(); f uuid := gen_random_uuid();
  luna uuid; bello uuid; tk text; n int; r text := ''; d uuid;
begin
  insert into auth.users(id,email,raw_user_meta_data) values (a,'a@x','{"display_name":"Ahmed"}'),(k,'k@x','{}'),(o,'o@x','{}'),(f,'f@x','{}');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  insert into public.pets(name,species) values ('Luna','dog') returning id into luna;
  insert into public.pets(name,species) values ('Bello','dog') returning id into bello;

  -- Besitzer: Gewicht, Impfung, Dokument
  insert into public.weights(pet_id,kg) values (luna,12.4); r:=r||'01 Besitzer trägt Gewicht ein: true'||E'\n';
  begin insert into public.weights(pet_id,kg) values (luna,0); r:=r||'02 Gewicht 0 abgelehnt: false'||E'\n';
  exception when others then r:=r||'02 Gewicht 0 abgelehnt: true'||E'\n'; end;
  begin insert into public.weights(pet_id,kg) values (luna,2000); r:=r||'03 Gewicht 2000 abgelehnt: false'||E'\n';
  exception when others then r:=r||'03 Gewicht 2000 abgelehnt: true'||E'\n'; end;
  insert into public.vaccinations(pet_id,name,given_on,valid_until) values (luna,'Tollwut','2026-01-10','2029-01-10'); r:=r||'04 Besitzer trägt Impfung ein: true'||E'\n';
  begin insert into public.vaccinations(pet_id,name,source) values (luna,'Staupe','practice'); r:=r||'05 App kann keine Praxis-Impfung anlegen: false'||E'\n';
  exception when others then r:=r||'05 App kann keine Praxis-Impfung anlegen: true'||E'\n'; end;

  insert into storage.objects(bucket_id,name) values ('pet-documents', luna||'/befund.pdf');
  insert into public.pet_documents(pet_id,title,category,storage_path,mime_type,size_bytes)
    values (luna,'Blutbild','finding',luna||'/befund.pdf','application/pdf',120000) returning id into d;
  r:=r||'06 Besitzer lädt Dokument hoch: true'||E'\n';
  begin insert into public.pet_documents(pet_id,title,storage_path,mime_type,size_bytes)
    values (luna,'Falsch',bello||'/x.pdf','application/pdf',100); r:=r||'07 Dokument im fremden Tier-Ordner abgelehnt: false'||E'\n';
  exception when others then r:=r||'07 Dokument im fremden Tier-Ordner abgelehnt: true'||E'\n'; end;
  begin insert into public.pet_documents(pet_id,title,storage_path,mime_type,size_bytes)
    values (luna,'Zu groß',luna||'/gross.pdf','application/pdf',10485761); r:=r||'08 Dokument über 10 MB abgelehnt: false'||E'\n';
  exception when others then r:=r||'08 Dokument über 10 MB abgelehnt: true'||E'\n'; end;
  begin insert into public.pet_documents(pet_id,title,storage_path,mime_type,size_bytes)
    values (luna,'Word',luna||'/a.docx','application/msword',100); r:=r||'09 Falscher Dateityp abgelehnt: false'||E'\n';
  exception when others then r:=r||'09 Falscher Dateityp abgelehnt: true'||E'\n'; end;
  begin update public.pet_documents set storage_path = luna||'/anders.pdf' where id=d; r:=r||'10 Dateipfad nicht änderbar: false'||E'\n';
  exception when others then r:=r||'10 Dateipfad nicht änderbar: true'||E'\n'; end;
  update public.pet_documents set title='Blutbild Oktober' where id=d; get diagnostics n=row_count; r:=r||'11 Besitzer ändert Titel: '||(n=1)||E'\n';

  -- Mithalterin Kyra (nur Luna) und Oma (nur ansehen)
  select token into tk from public.create_pet_invite('Kyra','carer',array[luna]);
  perform set_config('request.jwt.claims', json_build_object('sub',k)::text, true);
  perform public.accept_pet_invite(tk);
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  select token into tk from public.create_pet_invite('Oma','viewer',array[luna]);
  perform set_config('request.jwt.claims', json_build_object('sub',o)::text, true);
  perform public.accept_pet_invite(tk);

  perform set_config('request.jwt.claims', json_build_object('sub',k)::text, true);
  insert into public.weights(pet_id,kg) values (luna,12.6); r:=r||'12 Mithalterin trägt Gewicht ein: true'||E'\n';
  insert into storage.objects(bucket_id,name) values ('pet-documents', luna||'/impfpass.jpg');
  insert into public.pet_documents(pet_id,title,category,storage_path,mime_type,size_bytes)
    values (luna,'Impfpass','vaccination',luna||'/impfpass.jpg','image/jpeg',300000);
  r:=r||'13 Mithalterin lädt Dokument hoch: true'||E'\n';
  select count(*) into n from public.pet_documents; r:=r||'14 Mithalterin sieht beide Dokumente: '||(n=2)||E'\n';
  begin insert into public.weights(pet_id,kg) values (bello,30); r:=r||'15 Mithalterin nicht bei fremdem Tier: false'||E'\n';
  exception when others then r:=r||'15 Mithalterin nicht bei fremdem Tier: true'||E'\n'; end;

  perform set_config('request.jwt.claims', json_build_object('sub',o)::text, true);
  select count(*) into n from public.weights; r:=r||'16 Nur-ansehen sieht Gewichte: '||(n=2)||E'\n';
  select count(*) into n from public.pet_documents; r:=r||'17 Nur-ansehen sieht Dokumente: '||(n=2)||E'\n';
  select count(*) into n from storage.objects where bucket_id='pet-documents'; r:=r||'18 Nur-ansehen kann Dateien öffnen: '||(n=2)||E'\n';
  begin insert into public.weights(pet_id,kg) values (luna,13); r:=r||'19 Nur-ansehen kann kein Gewicht eintragen: false'||E'\n';
  exception when others then r:=r||'19 Nur-ansehen kann kein Gewicht eintragen: true'||E'\n'; end;
  begin insert into storage.objects(bucket_id,name) values ('pet-documents', luna||'/oma.pdf'); r:=r||'20 Nur-ansehen kann nichts hochladen: false'||E'\n';
  exception when others then r:=r||'20 Nur-ansehen kann nichts hochladen: true'||E'\n'; end;
  update public.pet_documents set title='x'; get diagnostics n=row_count; r:=r||'21 Nur-ansehen kann nichts umbenennen: '||(n=0)||E'\n';
  delete from public.pet_documents; get diagnostics n=row_count; r:=r||'22 Nur-ansehen kann nichts löschen: '||(n=0)||E'\n';
  delete from storage.objects where bucket_id='pet-documents'; get diagnostics n=row_count; r:=r||'23 Nur-ansehen kann keine Datei löschen: '||(n=0)||E'\n';
  delete from public.vaccinations; get diagnostics n=row_count; r:=r||'24 Nur-ansehen kann keine Impfung löschen: '||(n=0)||E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',f)::text, true);
  select count(*) into n from public.pet_documents; r:=r||'25 Fremde sieht keine Dokumente: '||(n=0)||E'\n';
  select count(*) into n from storage.objects where bucket_id='pet-documents'; r:=r||'26 Fremde sieht keine Dateien: '||(n=0)||E'\n';
  select count(*) into n from public.weights; r:=r||'27 Fremde sieht kein Gewicht: '||(n=0)||E'\n';

  -- Praxis-Impfung (wie von der Praxis angelegt) ist in der App unveränderbar
  execute 'reset role';
  insert into public.vaccinations(pet_id,owner_id,name,source) values (luna,a,'Staupe','practice');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  update public.vaccinations set name='x' where source='practice'; get diagnostics n=row_count; r:=r||'28 Praxis-Impfung nicht änderbar: '||(n=0)||E'\n';
  delete from public.vaccinations where source='practice'; get diagnostics n=row_count; r:=r||'29 Praxis-Impfung nicht löschbar: '||(n=0)||E'\n';

  -- Besitzer löscht Dokument und Datei
  delete from storage.objects where bucket_id='pet-documents' and name=luna||'/befund.pdf'; get diagnostics n=row_count; r:=r||'30 Besitzer löscht Datei: '||(n=1)||E'\n';
  delete from public.pet_documents where id=d; get diagnostics n=row_count; r:=r||'31 Besitzer löscht Dokument: '||(n=1)||E'\n';

  -- Tier löschen entfernt die Einträge
  delete from public.pets where id=luna;
  execute 'reset role';
  select count(*) into n from public.pet_documents where pet_id=luna; r:=r||'32 Tier gelöscht → Dokumente weg: '||(n=0)||E'\n';
  raise notice E'\n%', r;
end $$;
rollback;
