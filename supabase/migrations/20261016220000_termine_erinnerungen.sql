-- Teil 5: Termine und Erinnerungen je Tier.
-- Termine: eigene Termine (Tierarzt, Impfung, Pflege …) mit Datum/Uhrzeit, Ort, Notiz.
-- Erinnerungen: wiederkehrende oder einmalige Aufgaben (Entwurmung, Floh/Zecke, Medikament …).
-- Lesen: alle Mitglieder des Tiers. Anlegen/Ändern/Löschen: Besitzer und Mithalter:innen.

-- ---------- Termine ----------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  kind text not null default 'vet'
    check (kind in ('vet','vaccination','grooming','training','other')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text check (location is null or char_length(location) <= 200),
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'planned' check (status in ('planned','done','cancelled')),
  created_at timestamptz not null default now(),
  constraint appointments_end_check check (ends_at is null or ends_at > starts_at)
);
create index appointments_pet_idx on public.appointments(pet_id, starts_at);
create index appointments_owner_idx on public.appointments(owner_id);

alter table public.appointments enable row level security;
create policy "termine lesen" on public.appointments for select to authenticated
  using (private.is_pet_member(pet_id));
create policy "termine anlegen" on public.appointments for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.can_edit_pet(pet_id));
create policy "termine aendern" on public.appointments for update to authenticated
  using (private.can_edit_pet(pet_id)) with check (private.can_edit_pet(pet_id));
create policy "termine loeschen" on public.appointments for delete to authenticated
  using (private.can_edit_pet(pet_id));

revoke all on public.appointments from anon, authenticated;
grant select, insert, delete on public.appointments to authenticated;
grant update (title, kind, starts_at, ends_at, location, note, status) on public.appointments to authenticated;

-- ---------- Erinnerungen ----------
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  kind text not null default 'other'
    check (kind in ('deworming','flea_tick','medication','vaccination','checkup','grooming','other')),
  due_on date not null,
  repeat_days integer check (repeat_days is null or repeat_days between 1 and 3650),
  note text check (note is null or char_length(note) <= 1000),
  last_done_on date,
  done_at timestamptz,           -- nur bei einmaligen Erinnerungen: erledigt
  created_at timestamptz not null default now()
);
create index reminders_pet_idx on public.reminders(pet_id, due_on);
create index reminders_owner_idx on public.reminders(owner_id);

alter table public.reminders enable row level security;
create policy "erinnerungen lesen" on public.reminders for select to authenticated
  using (private.is_pet_member(pet_id));
create policy "erinnerungen anlegen" on public.reminders for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.can_edit_pet(pet_id));
create policy "erinnerungen aendern" on public.reminders for update to authenticated
  using (private.can_edit_pet(pet_id)) with check (private.can_edit_pet(pet_id));
create policy "erinnerungen loeschen" on public.reminders for delete to authenticated
  using (private.can_edit_pet(pet_id));

revoke all on public.reminders from anon, authenticated;
grant select, insert, delete on public.reminders to authenticated;
grant update (title, kind, due_on, repeat_days, note, last_done_on, done_at) on public.reminders to authenticated;

-- Erinnerung als erledigt markieren (eine Transaktion, damit zwei Personen nicht doppelt weiterschieben)
create or replace function public.complete_reminder(p_id uuid, p_done_on date default current_date)
returns public.reminders
language plpgsql security invoker set search_path = '' as $$
declare v public.reminders%rowtype;
begin
  if p_done_on > current_date + 1 then raise exception 'reminder_future' using errcode = 'P0001'; end if;
  select * into v from public.reminders where id = p_id for update;
  if not found then raise exception 'reminder_not_found' using errcode = 'P0002'; end if;
  if v.repeat_days is null then
    update public.reminders set last_done_on = p_done_on, done_at = now() where id = p_id returning * into v;
  else
    update public.reminders set last_done_on = p_done_on, due_on = p_done_on + v.repeat_days, done_at = null
      where id = p_id returning * into v;
  end if;
  if not found then raise exception 'reminder_not_allowed' using errcode = '42501'; end if;
  return v;
end; $$;
revoke all on function public.complete_reminder(uuid, date) from public, anon;
grant execute on function public.complete_reminder(uuid, date) to authenticated;
