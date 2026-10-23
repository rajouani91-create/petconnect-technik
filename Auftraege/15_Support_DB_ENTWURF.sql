-- ENTWURF Auftrag 15 (Support-Grundlagen). NICHT ausgeführt.
-- Freigabe durch Ahmed erforderlich, bevor diese Datei in Supabase läuft.
-- Voraussetzung: staff_roles, support_tickets, staff_audit sind bereits angelegt.

-- 1. Kontostatus: eigene Tabelle, damit der Status nicht in profiles gemischt wird.
create table if not exists public.account_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'locked')),
  reason text check (reason is null or char_length(reason) <= 200),
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);
alter table public.account_status enable row level security;
create policy account_status_admin_select on public.account_status
  for select to authenticated using (private.is_staff('admin'));
-- Kein Insert/Update/Delete per Policy: Änderungen nur über die Funktion unten.

-- 2. Suche: nur Support und Admin, mindestens 3 Zeichen, max. 25 Treffer.
--    Liefert Stammdaten und die Tierarten, aber keine Gesundheitsdaten.
create or replace function public.staff_search_accounts(q text)
returns table (
  user_id uuid,
  email text,
  display_name text,
  created_at timestamptz,
  status text,
  pets jsonb
)
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
  needle := '%' || replace(replace(replace(btrim(coalesce(q, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  if char_length(btrim(coalesce(q, ''))) < 3 then
    raise exception 'query_too_short' using errcode = '22023';
  end if;
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

-- 3. Sperren / Freigeben: nur Admin, Grund Pflicht (1 bis 200 Zeichen), Protokoll im selben Vorgang.
--    Sperre wirkt auf die Anmeldung über auth.users.banned_until.
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
    set status = excluded.status,
        reason = excluded.reason,
        changed_by = excluded.changed_by,
        changed_at = excluded.changed_at;

  update auth.users
    set banned_until = case when new_status = 'locked' then 'infinity'::timestamptz else null end
    where id = target;

  insert into public.staff_audit (staff_id, action, target_user_id, reason)
  values ((select auth.uid()), 'account_' || new_status, target, clean_reason);
end;
$$;
revoke all on function public.staff_set_account_status(uuid, text, text) from public, anon;
grant execute on function public.staff_set_account_status(uuid, text, text) to authenticated;

-- Offen (eigene Schritte, nicht in dieser Datei):
-- - Reset-Link: Edge Function mit Service-Role-Schlüssel, die den bestehenden
--   Reset-Mechanismus auslöst und das Protokoll schreibt. Kein Passwort sichtbar.
-- - Ankündigungen: eigene Tabelle, nach Freigabe.
-- - Protokoll-Eintrag für Reset-Link über die Edge Function.
