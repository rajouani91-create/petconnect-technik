-- Teil 10: Push-Benachrichtigungen (Web Push für die Android-App / PWA)
-- Geräte melden sich mit ihrer Push-Adresse an. Jede Minute sucht die Datenbank fällige Benachrichtigungen
-- (Medikamente, Erinnerungen, Termine), die Edge Function „push-senden“ verschickt sie.
-- Die VAPID-Schlüssel erzeugt die Edge Function selbst beim ersten Lauf und legt sie im nicht öffentlichen
-- Schema private ab – kein Mensch muss einen geheimen Schlüssel anfassen.

create extension if not exists pg_net;

-- ---------- Geräte ----------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  device_label text check (device_label is null or char_length(device_label) <= 80),
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  failures integer not null default 0
);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
create policy "geraete lesen" on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy "geraete anmelden" on public.push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "geraete abmelden" on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;

-- Gleiches Gerät neu anmelden (z. B. nach Login mit anderem Konto): Adresse gehört danach dem aktuellen Konto
create or replace function public.register_push(p_endpoint text, p_p256dh text, p_auth text, p_label text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if (select auth.uid()) is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth, device_label)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth, left(p_label, 80))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    device_label = excluded.device_label, failures = 0
  returning id into v;
  return v;
end; $$;
revoke all on function public.register_push(text,text,text,text) from public, anon;
grant execute on function public.register_push(text,text,text,text) to authenticated;

-- ---------- Einstellungen je Person ----------
create table public.notification_prefs (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  medication boolean not null default true,
  reminders boolean not null default true,
  appointments boolean not null default true,
  reminder_time time not null default '09:00',
  updated_at timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
create policy "einstellungen lesen" on public.notification_prefs for select to authenticated using (user_id = (select auth.uid()));
create policy "einstellungen anlegen" on public.notification_prefs for insert to authenticated with check (user_id = (select auth.uid()));
create policy "einstellungen aendern" on public.notification_prefs for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.notification_prefs from anon, authenticated;
grant select, insert on public.notification_prefs to authenticated;
grant update (medication, reminders, appointments, reminder_time) on public.notification_prefs to authenticated;
create trigger notification_prefs_touch before update on public.notification_prefs for each row execute function public.set_updated_at();

-- ---------- Interne Tabellen (nicht über die API erreichbar) ----------
create table private.push_config (
  id integer primary key default 1 check (id = 1),
  vapid_public text,
  vapid_private_jwk jsonb,
  cron_token text not null default (replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')),
  function_url text not null default 'https://cpnbkegojxagbzkomzap.supabase.co/functions/v1/push-senden'
);
insert into private.push_config(id) values (1) on conflict do nothing;

create table private.push_sent (
  kind text not null,
  ref_id uuid not null,
  slot timestamptz not null,
  user_id uuid not null,
  sent_at timestamptz not null default now(),
  primary key (kind, ref_id, slot, user_id)
);
create index push_sent_at_idx on private.push_sent(sent_at);

-- Fällige Benachrichtigungen im Fenster (p_now - 10 Min., p_now]; Zeitzone Europe/Berlin
create or replace function private.due_pushes(p_now timestamptz)
returns table (user_id uuid, kind text, ref_id uuid, slot timestamptz, pet_name text, title text, info jsonb, url text)
language sql stable security definer set search_path = '' as $$
  with z as (select (p_now at time zone 'Europe/Berlin')::date as d, p_now as n, p_now - interval '10 minutes' as f),
  med as (
    select m.id, m.pet_id, m.name, m.amount, m.unit, m.intake_hint,
           ((z.d + t) at time zone 'Europe/Berlin') as slot, t
    from public.pet_medications m cross join z cross join lateral unnest(m.times) t
    where m.frequency = 'daily' and m.remind and m.starts_on <= z.d
      and (m.ends_on is null or m.ends_on >= z.d) and (m.stopped_on is null or m.stopped_on >= z.d)
  ),
  med_due as (
    select me.* from med me, z
    where me.slot > z.f and me.slot <= z.n
      and not exists (select 1 from public.medication_doses d where d.medication_id = me.id and d.scheduled_on = z.d and d.scheduled_time = me.t)
  )
  -- Medikamente: Besitzer und Mithalter:innen
  select pm.user_id, 'medication', md.id, md.slot, p.name, md.name,
         jsonb_build_object('amount', md.amount, 'unit', md.unit, 'hint', md.intake_hint, 'time', to_char(md.t,'HH24:MI')),
         '/erinnerungen'
  from med_due md join public.pets p on p.id = md.pet_id and not coalesce(p.deceased,false)
  join public.pet_members pm on pm.pet_id = md.pet_id and pm.role in ('owner','carer')
  left join public.notification_prefs np on np.user_id = pm.user_id
  where coalesce(np.medication, true)
  union all
  -- Erinnerungen: am Fälligkeitstag zur eingestellten Uhrzeit (Standard 09:00), auch überfällige einmal täglich
  select pm.user_id, 'reminder', r.id, ((z.d + coalesce(np.reminder_time,'09:00')) at time zone 'Europe/Berlin'), p.name, r.title,
         jsonb_build_object('overdue', r.due_on < z.d, 'due_on', r.due_on), '/erinnerungen'
  from public.reminders r cross join z
  join public.pets p on p.id = r.pet_id and not coalesce(p.deceased,false)
  join public.pet_members pm on pm.pet_id = r.pet_id and pm.role in ('owner','carer')
  left join public.notification_prefs np on np.user_id = pm.user_id
  where r.done_at is null and r.due_on <= z.d and coalesce(np.reminders, true)
    and ((z.d + coalesce(np.reminder_time,'09:00')) at time zone 'Europe/Berlin') > z.f
    and ((z.d + coalesce(np.reminder_time,'09:00')) at time zone 'Europe/Berlin') <= z.n
  union all
  -- Termine: 60 Minuten vorher, an alle Mitglieder außer „nur ansehen“
  select pm.user_id, 'appointment', a.id, a.starts_at - interval '60 minutes', p.name, a.title,
         jsonb_build_object('time', to_char(a.starts_at at time zone 'Europe/Berlin', 'HH24:MI'), 'location', a.location), '/termine'
  from public.appointments a cross join z
  join public.pets p on p.id = a.pet_id and not coalesce(p.deceased,false)
  join public.pet_members pm on pm.pet_id = a.pet_id and pm.role in ('owner','carer')
  left join public.notification_prefs np on np.user_id = pm.user_id
  where a.status = 'planned' and coalesce(np.appointments, true)
    and a.starts_at - interval '60 minutes' > z.f and a.starts_at - interval '60 minutes' <= z.n;
$$;
revoke all on function private.due_pushes(timestamptz) from public, anon, authenticated;

-- ---------- Schnittstelle für die Edge Function (nur service_role) ----------
-- Holt fällige Benachrichtigungen samt Geräten und merkt sie als gesendet (jede höchstens einmal je Person)
create or replace function public.push_claim(p_token text, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if p_token is null or p_token <> (select cron_token from private.push_config where id = 1) then
    raise exception 'push_forbidden' using errcode = '42501'; end if;
  with due as (select * from private.due_pushes(p_now)),
  ins as (
    insert into private.push_sent(kind, ref_id, slot, user_id)
    select kind, ref_id, slot, user_id from due on conflict do nothing
    returning kind, ref_id, slot, user_id)
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', d.kind, 'ref_id', d.ref_id, 'slot', d.slot, 'pet', d.pet_name, 'title', d.title, 'info', d.info, 'url', d.url,
           'language', coalesce(pr.language, 'de'),
           'subs', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
                    from public.push_subscriptions s where s.user_id = d.user_id and s.failures < 10))), '[]'::jsonb)
    into v
  from ins i join due d on d.kind = i.kind and d.ref_id = i.ref_id and d.slot = i.slot and d.user_id = i.user_id
  left join public.profiles pr on pr.id = d.user_id;
  return v;
end; $$;

create or replace function public.push_result(p_token text, p_ok uuid[], p_gone uuid[], p_failed uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null or p_token <> (select cron_token from private.push_config where id = 1) then
    raise exception 'push_forbidden' using errcode = '42501'; end if;
  update public.push_subscriptions set last_ok_at = now(), failures = 0 where id = any(coalesce(p_ok,'{}'));
  -- abgemeldete Geräte (404/410) und Geräte mit 10 Fehlversuchen werden nicht mehr angeschrieben;
  -- die Zeile bleibt, bis die Person das Gerät in der App entfernt oder neu anmeldet
  update public.push_subscriptions set failures = 1000 where id = any(coalesce(p_gone,'{}'));
  update public.push_subscriptions set failures = failures + 1 where id = any(coalesce(p_failed,'{}'));
end; $$;

-- VAPID-Schlüssel: Edge Function liest sie, beim ersten Lauf legt sie sie an
create or replace function public.push_vapid(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null or p_token <> (select cron_token from private.push_config where id = 1) then
    raise exception 'push_forbidden' using errcode = '42501'; end if;
  return (select jsonb_build_object('public', vapid_public, 'private_jwk', vapid_private_jwk) from private.push_config where id = 1);
end; $$;
create or replace function public.push_set_vapid(p_token text, p_public text, p_private_jwk jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null or p_token <> (select cron_token from private.push_config where id = 1) then
    raise exception 'push_forbidden' using errcode = '42501'; end if;
  update private.push_config set vapid_public = p_public, vapid_private_jwk = p_private_jwk where id = 1 and vapid_public is null;
end; $$;

-- Token für die Edge Function: nur service_role (die Edge Function selbst) darf ihn lesen
create or replace function public.push_token() returns text
language sql stable security definer set search_path = '' as $$ select cron_token from private.push_config where id = 1; $$;

revoke all on function public.push_claim(text,timestamptz), public.push_result(text,uuid[],uuid[],uuid[]),
  public.push_vapid(text), public.push_set_vapid(text,text,jsonb), public.push_token() from public, anon, authenticated;
grant execute on function public.push_claim(text,timestamptz), public.push_result(text,uuid[],uuid[],uuid[]),
  public.push_vapid(text), public.push_set_vapid(text,text,jsonb), public.push_token() to service_role;

-- Öffentlicher Schlüssel für die App (zum Anmelden des Geräts)
create or replace function public.vapid_public_key() returns text
language sql stable security definer set search_path = '' as $$ select vapid_public from private.push_config where id = 1; $$;
revoke all on function public.vapid_public_key() from public, anon;
grant execute on function public.vapid_public_key() to authenticated;

-- ---------- Jede Minute anstoßen ----------
create or replace function private.push_tick() returns void
language plpgsql security definer set search_path = '' as $$
declare c private.push_config%rowtype;
begin
  select * into c from private.push_config where id = 1;
  -- erst senden, wenn es überhaupt Geräte gibt (spart Aufrufe)
  if not exists (select 1 from public.push_subscriptions where failures < 10) and c.vapid_public is not null then return; end if;
  perform net.http_post(url := c.function_url, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','x-push-token', c.cron_token),
    timeout_milliseconds := 20000);
end; $$;
revoke all on function private.push_tick() from public, anon, authenticated;

select cron.schedule('push-senden', '* * * * *', $$select private.push_tick()$$);
