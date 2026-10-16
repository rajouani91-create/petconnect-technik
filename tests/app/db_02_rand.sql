begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); pa uuid; pb uuid; ib uuid; r text := ''; n int;
begin
  insert into auth.users(id,email,raw_user_meta_data) values (a,'a@x.invalid','{}'),(b,'b@x.invalid','{}');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  insert into public.pets(name,species) values ('A-Tier','dog') returning id into pa;
  perform set_config('request.jwt.claims', json_build_object('sub',b)::text, true);
  insert into public.pets(name,species) values ('B-Tier','cat') returning id into pb;
  insert into public.routine_items(pet_id,kind,time_of_day) values (pb,'feed','08:00') returning id into ib;
  begin update public.routine_items set pet_id=pa where id=ib; get diagnostics n=row_count; r:=r||'29 B verschiebt Eintrag zu A-Tier verhindert: '||(n=0)||E'\n';
  exception when others then r:=r||'29 B verschiebt Eintrag zu A-Tier verhindert: true ('||sqlstate||')'||E'\n'; end;
  begin update public.pets set owner_id=a where id=pb; get diagnostics n=row_count; r:=r||'30 B schiebt Tier an A ab verhindert: '||(n=0)||E'\n';
  exception when others then r:=r||'30 B schiebt Tier an A ab verhindert: true ('||sqlstate||')'||E'\n'; end;
  begin insert into public.profiles(id,display_name) values (a,'x'); r:=r||'31 Fremdes Profil anlegen verhindert: false'||E'\n';
  exception when others then r:=r||'31 Fremdes Profil anlegen verhindert: true ('||sqlstate||')'||E'\n'; end;
  raise notice E'\n%', r;
end $$;
rollback;
