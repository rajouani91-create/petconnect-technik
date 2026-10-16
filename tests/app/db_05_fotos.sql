begin;
do $$
declare a uuid := gen_random_uuid(); o uuid := gen_random_uuid(); f uuid := gen_random_uuid(); luna uuid; tk text; n int; r text := '';
begin
  insert into auth.users(id,email,raw_user_meta_data) values (a,'a@x','{"display_name":"Ahmed"}'),(o,'o@x','{}'),(f,'f@x','{}');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  insert into public.pets(name,species) values ('Luna','dog') returning id into luna;
  insert into storage.objects(bucket_id,name) values ('pet-photos', luna||'/foto.jpg'); r:=r||'01 Besitzer lädt Foto hoch: true'||E'\n';
  update public.pets set photo_path = luna||'/foto.jpg' where id=luna;
  begin insert into storage.objects(bucket_id,name) values ('pet-photos', 'kein-ordner.jpg'); r:=r||'02 Foto ohne Tier-Ordner abgelehnt: false'||E'\n';
  exception when others then r:=r||'02 Foto ohne Tier-Ordner abgelehnt: true'||E'\n'; end;
  select token into tk from public.create_pet_invite('Oma','viewer',array[luna]);
  perform set_config('request.jwt.claims', json_build_object('sub',o)::text, true);
  perform public.accept_pet_invite(tk);
  select count(*) into n from storage.objects where bucket_id='pet-photos'; r:=r||'03 Nur-ansehen sieht das Foto: '||(n=1)||E'\n';
  begin insert into storage.objects(bucket_id,name) values ('pet-photos', luna||'/neu.jpg'); r:=r||'04 Nur-ansehen kann kein Foto hochladen: false'||E'\n';
  exception when others then r:=r||'04 Nur-ansehen kann kein Foto hochladen: true'||E'\n'; end;
  delete from storage.objects where bucket_id='pet-photos'; get diagnostics n=row_count; r:=r||'05 Nur-ansehen kann nicht löschen: '||(n=0)||E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub',f)::text, true);
  select count(*) into n from storage.objects; r:=r||'06 Fremde sieht kein Foto: '||(n=0)||E'\n';
  begin insert into storage.objects(bucket_id,name) values ('pet-photos', luna||'/boese.jpg'); r:=r||'07 Fremde kann nicht hochladen: false'||E'\n';
  exception when others then r:=r||'07 Fremde kann nicht hochladen: true'||E'\n'; end;
  raise notice E'\n%', r;
end $$;
rollback;
