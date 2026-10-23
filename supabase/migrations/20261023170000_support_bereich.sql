-- Support-Bereich (Auftrag 15): Rollen, Protokoll, Tickets, Kontostatus, Suche, Zählungen, Reset-Link-Protokoll, Ankündigungen.
-- Entspricht dem Stand, der nach und nach in Supabase angewendet wurde.

-- 1. Rollen
create table public.staff_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'support')),
  created_at timestamptz not null default now()
);
alter table public.staff_roles enable row level security;

create or replace function private.is_staff(min_role text default 'support')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_roles s
    where s.user_id = (select auth.uid())
      and (min_role = 'support' or s.role = 'admin')
  );
$$;

create policy staff_roles_select_self on public.staff_roles
  for select to authenticated
  using (user_id = (select auth.uid()));

-- 2. Tickets
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  sender text check (sender is null or char_length(sender) <= 200),
  subject text not null check (char_length(subject) between 1 and 200),
  body text not null check (char_length(body) between 1 and 4000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  staff_note text check (staff_note is null or char_length(staff_note) <= 2000),
  created_by_staff uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.support_tickets enable row level security;

create policy support_tickets_staff_select on public.support_tickets
  for select to authenticated using (private.is_staff('support'));
create policy support_tickets_staff_insert on public.support_tickets
  for insert to authenticated with check (private.is_staff('support'));
create policy support_tickets_staff_update on public.support_tickets
  for update to authenticated using (private.is_staff('support')) with check (private.is_staff('support'));

-- 3. Protokoll (nur einfügen, nicht ändern, nicht löschen)
create table public.staff_audit (
  id bigint generated always as identity primary key,
  staff_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 1 and 60),
  target_user_id uuid references auth.users(id) on delete set null,
  reason text check (char_length(reason) <= 200),
  created_at timestamptz not null default now()
);
alter table public.staff_audit enable row level security;

create policy staff_audit_admin_select on public.staff_audit
  for select to authenticated using (private.is_staff('admin'));
create policy staff_audit_staff_insert on public.staff_audit
  for insert to authenticated with check (private.is_staff('support') and staff_id = (select auth.uid()));

-- 4. Kontostatus
create table public.account_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'locked')),
  reason text check (reason is null or char_length(reason) <= 200),
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);
alter table public.account_status enable row level security;
create policy account_status_admin_select on public.account_status
  for select to authenticated using (private.is_staff('admin'));

-- 5. Suche (Support und Admin, mindestens 3 Zeichen, höchstens 25 Treffer, keine Gesundheitsdaten)
create or replace function public.staff_search_accounts(q text)
returns table (user_id uuid, email text, display_name text, created_at timestamptz, status text, pets jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  needle text;
begin
  if not private.is_staff('support') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(q, ''))) < 3 then
    raise exception 'query_too_short' using errcode = '22023';
  end if;
  needle := '%' || replace(replace(replace(btrim(q), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select u.id,
           u.email::text,
           p.display_name,
           u.created_at,
           coalesce(s.status, 'active'),
           coalesce((
             select jsonb_agg(jsonb_build_object('name', pt.name, 'species', pt.species) order by pt.name)
             from public.pets pt where pt.owner_id = u.id
           ), '[]'::jsonb)
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.account_status s on s.user_id = u.id
    where u.email ilike needle
       or p.display_name ilike needle
       or exists (select 1 from public.pets pt where pt.owner_id = u.id and pt.name ilike needle)
    order by u.created_at desc
    limit 25;
end;
$$;
revoke all on function public.staff_search_accounts(text) from public, anon;
grant execute on function public.staff_search_accounts(text) to authenticated;

-- 6. Sperren und Freigeben (nur Admin, Grund Pflicht, Protokoll im selben Vorgang)
create or replace function public.staff_set_account_status(target uuid, new_status text, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_reason text := btrim(coalesce(reason, ''));
begin
  if not private.is_staff('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if new_status not in ('active', 'locked') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if char_length(clean_reason) < 1 or char_length(clean_reason) > 200 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if target = (select auth.uid()) then
    raise exception 'cannot_change_own_account' using errcode = '22023';
  end if;

  insert into public.account_status (user_id, status, reason, changed_by, changed_at)
  values (target, new_status, clean_reason, (select auth.uid()), now())
  on conflict (user_id) do update
    set status = excluded.status, reason = excluded.reason, changed_by = excluded.changed_by, changed_at = excluded.changed_at;

  update auth.users
    set banned_until = case when new_status = 'locked' then 'infinity'::timestamptz else null end
    where id = target;

  insert into public.staff_audit (staff_id, action, target_user_id, reason)
  values ((select auth.uid()), 'account_' || new_status, target, clean_reason);
end;
$$;
revoke all on function public.staff_set_account_status(uuid, text, text) from public, anon;
grant execute on function public.staff_set_account_status(uuid, text, text) to authenticated;

-- 7. Zählungen für das Dashboard (nur Admin, nur Summen)
create or replace function public.staff_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'accounts', (select count(*) from auth.users),
    'profiles', (select count(*) from public.profiles),
    'accounts_with_pets', (select count(distinct owner_id) from public.pets),
    'pets', (select count(*) from public.pets),
    'pets_by_species', coalesce((select jsonb_object_agg(species, n) from (select species, count(*) as n from public.pets group by species) s), '{}'::jsonb),
    'locked_accounts', (select count(*) from public.account_status where status = 'locked'),
    'tickets_open', (select count(*) from public.support_tickets where status = 'open'),
    'tickets_in_progress', (select count(*) from public.support_tickets where status = 'in_progress'),
    'tickets_closed', (select count(*) from public.support_tickets where status = 'closed')
  );
end;
$$;
revoke all on function public.staff_stats() from public, anon;
grant execute on function public.staff_stats() to authenticated;

-- 8. Ankündigungen
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(btrim(body)) between 1 and 300),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint announcements_end_after_start check (ends_at > starts_at)
);
alter table public.announcements enable row level security;
create policy announcements_read_active on public.announcements
  for select to authenticated using (now() between starts_at and ends_at);
create policy announcements_admin_select on public.announcements
  for select to authenticated using (private.is_staff('admin'));
create policy announcements_admin_insert on public.announcements
  for insert to authenticated with check (private.is_staff('admin') and created_by = (select auth.uid()));
create policy announcements_admin_delete on public.announcements
  for delete to authenticated using (private.is_staff('admin'));

create table public.announcement_dismissals (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, announcement_id)
);
alter table public.announcement_dismissals enable row level security;
create policy announcement_dismissals_own_select on public.announcement_dismissals
  for select to authenticated using (user_id = (select auth.uid()));
create policy announcement_dismissals_own_insert on public.announcement_dismissals
  for insert to authenticated with check (user_id = (select auth.uid()));
