create schema if not exists net; create schema if not exists cron;
create table if not exists net.calls(url text, headers jsonb, at timestamptz default now());
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint
language sql as $$ insert into net.calls(url,headers) values (url,headers); select 1::bigint $$;
create or replace function cron.schedule(n text, s text, c text) returns bigint language sql as $$ select 1::bigint $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if; end $$;
