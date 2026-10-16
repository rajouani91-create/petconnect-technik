-- Teil 3: Familie & Mithalter:innen wie im Prototyp.
-- Zwei Rechte-Stufen: 'carer' (Mithalter:in, darf ändern) und 'viewer' (nur ansehen).
-- Eine Einladung hat einen Namen, eine Rechte-Stufe und gilt für ein oder mehrere Tiere.
-- Höchstens 5 weitere Personen je Besitzer (Mitglieder + offene Einladungen).

-- ---------- Rollen ----------
alter table public.pet_members drop constraint pet_members_role_check;
alter table public.pet_members add constraint pet_members_role_check check (role in ('owner','carer','viewer'));

create or replace function private.can_edit_pet(p_pet uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.pet_members m
    where m.pet_id = p_pet and m.user_id = (select auth.uid()) and m.role in ('owner','carer'));
$$;

create or replace function private.can_edit_item(p_item uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.routine_items r join public.pet_members m on m.pet_id = r.pet_id
    where r.id = p_item and m.user_id = (select auth.uid()) and m.role in ('owner','carer'));
$$;
revoke all on function private.can_edit_pet(uuid), private.can_edit_item(uuid) from public, anon;
grant execute on function private.can_edit_pet(uuid), private.can_edit_item(uuid) to authenticated;

-- Schreiben nur für Besitzer und Mithalter:innen; Lesen bleibt für alle Betreuer
drop policy "tier aendern" on public.pets;
create policy "tier aendern" on public.pets for update to authenticated
  using (private.can_edit_pet(id)) with check (private.can_edit_pet(id));

drop policy "tagesplan anlegen" on public.routine_items;
drop policy "tagesplan aendern" on public.routine_items;
drop policy "tagesplan loeschen" on public.routine_items;
create policy "tagesplan anlegen" on public.routine_items for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.can_edit_pet(pet_id));
create policy "tagesplan aendern" on public.routine_items for update to authenticated
  using (private.can_edit_pet(pet_id)) with check (private.can_edit_pet(pet_id));
create policy "tagesplan loeschen" on public.routine_items for delete to authenticated
  using (private.can_edit_pet(pet_id));

drop policy "erledigt anlegen" on public.routine_done;
drop policy "erledigt loeschen" on public.routine_done;
create policy "erledigt anlegen" on public.routine_done for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.can_edit_item(routine_item_id));
create policy "erledigt loeschen" on public.routine_done for delete to authenticated
  using (private.can_edit_item(routine_item_id));

drop policy "gewicht anlegen" on public.weights;
drop policy "gewicht aendern" on public.weights;
drop policy "gewicht loeschen" on public.weights;
create policy "gewicht anlegen" on public.weights for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.can_edit_pet(pet_id));
create policy "gewicht aendern" on public.weights for update to authenticated
  using (private.can_edit_pet(pet_id)) with check (private.can_edit_pet(pet_id));
create policy "gewicht loeschen" on public.weights for delete to authenticated
  using (private.can_edit_pet(pet_id));

drop policy "impfungen anlegen" on public.vaccinations;
drop policy "impfungen aendern" on public.vaccinations;
drop policy "impfungen loeschen" on public.vaccinations;
create policy "impfungen anlegen" on public.vaccinations for insert to authenticated
  with check (owner_id = (select auth.uid()) and source = 'owner' and private.can_edit_pet(pet_id));
create policy "impfungen aendern" on public.vaccinations for update to authenticated
  using (private.can_edit_pet(pet_id) and source = 'owner') with check (private.can_edit_pet(pet_id) and source = 'owner');
create policy "impfungen loeschen" on public.vaccinations for delete to authenticated
  using (private.can_edit_pet(pet_id) and source = 'owner');

-- Besitzer darf die Rechte-Stufe von Mitbetreuern ändern
drop policy "betreuer entfernen" on public.pet_members;
create policy "betreuer entfernen" on public.pet_members for delete to authenticated
  using (role <> 'owner' and (user_id = (select auth.uid()) or private.is_pet_owner(pet_id)));
create policy "rechte aendern" on public.pet_members for update to authenticated
  using (role <> 'owner' and private.is_pet_owner(pet_id))
  with check (role in ('carer','viewer') and private.is_pet_owner(pet_id));
grant update (role) on public.pet_members to authenticated;

-- ---------- Einladungen neu (die Tabelle aus Teil 2 war noch leer) ----------
drop function if exists public.invite_preview(text);
drop function if exists public.accept_pet_invite(text);
drop table public.pet_invites;

create table public.pet_invites (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  invitee_name text not null check (char_length(btrim(invitee_name)) between 1 and 60),
  role text not null default 'carer' check (role in ('carer','viewer')),
  token text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index pet_invites_created_by_idx on public.pet_invites(created_by);
create index pet_invites_accepted_by_idx on public.pet_invites(accepted_by);

create table public.pet_invite_pets (
  invite_id uuid not null references public.pet_invites(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  primary key (invite_id, pet_id)
);
create index pet_invite_pets_pet_idx on public.pet_invite_pets(pet_id);

alter table public.pet_invites enable row level security;
alter table public.pet_invite_pets enable row level security;
-- Lesen und Zurückziehen nur durch die einladende Person; Anlegen nur über create_pet_invite
create policy "einladungen lesen" on public.pet_invites for select to authenticated
  using (created_by = (select auth.uid()));
create policy "einladung zurueckziehen" on public.pet_invites for delete to authenticated
  using (created_by = (select auth.uid()));
create policy "einladungstiere lesen" on public.pet_invite_pets for select to authenticated
  using (exists (select 1 from public.pet_invites i where i.id = invite_id and i.created_by = (select auth.uid())));
grant select, delete on public.pet_invites to authenticated;
grant select on public.pet_invite_pets to authenticated;

-- Wie viele weitere Personen hat ein Besitzer? (Mitglieder seiner Tiere + offene Einladungen)
create or replace function private.household_count(p_owner uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select
    (select count(distinct m.user_id) from public.pet_members m
       join public.pet_members o on o.pet_id = m.pet_id and o.user_id = p_owner and o.role = 'owner'
       where m.user_id <> p_owner)
  + (select count(*) from public.pet_invites i
       where i.created_by = p_owner and i.accepted_at is null and i.expires_at > now())::integer;
$$;
revoke all on function private.household_count(uuid) from public, anon, authenticated;

-- Einladung anlegen: liefert Code und Ablaufdatum
create or replace function public.create_pet_invite(p_name text, p_role text, p_pet_ids uuid[])
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_inv public.pet_invites%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 60 then raise exception 'invite_name' using errcode = 'P0001'; end if;
  if p_role not in ('carer','viewer') then raise exception 'invite_role' using errcode = 'P0001'; end if;
  if p_pet_ids is null or cardinality(p_pet_ids) = 0 then raise exception 'invite_no_pets' using errcode = 'P0001'; end if;
  if exists (select 1 from unnest(p_pet_ids) as x(pid)
             where not exists (select 1 from public.pet_members m where m.pet_id = x.pid and m.user_id = v_uid and m.role = 'owner')) then
    raise exception 'invite_not_owner' using errcode = '42501';
  end if;
  if exists (select 1 from public.pet_invites i where i.created_by = v_uid and i.accepted_at is null
             and i.expires_at > now() and lower(i.invitee_name) = lower(v_name)) then
    raise exception 'invite_duplicate' using errcode = 'P0001';
  end if;
  if private.household_count(v_uid) >= 5 then raise exception 'invite_max' using errcode = 'P0001'; end if;

  insert into public.pet_invites (created_by, invitee_name, role) values (v_uid, v_name, p_role) returning * into v_inv;
  insert into public.pet_invite_pets (invite_id, pet_id) select v_inv.id, x.pid from (select distinct unnest(p_pet_ids) as pid) x;
  return query select v_inv.id, v_inv.token, v_inv.expires_at;
end; $$;

-- Vorschau für die eingeladene Person
create or replace function public.invite_preview(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'inviter_name', pr.display_name,
    'invitee_name', i.invitee_name,
    'role', i.role,
    'expires_at', i.expires_at,
    'pets', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'species', p.species, 'species_other', p.species_other) order by p.name)
                      from public.pet_invite_pets ip join public.pets p on p.id = ip.pet_id where ip.invite_id = i.id), '[]'::jsonb),
    'status', case
      when not exists (select 1 from public.pet_invite_pets ip where ip.invite_id = i.id) then 'empty'
      when not exists (select 1 from public.pet_invite_pets ip where ip.invite_id = i.id
                       and not exists (select 1 from public.pet_members m where m.pet_id = ip.pet_id and m.user_id = (select auth.uid()))) then 'member'
      when i.accepted_at is not null then 'used'
      when i.expires_at < now() then 'expired'
      else 'open' end)
  from public.pet_invites i left join public.profiles pr on pr.id = i.created_by
  where i.token = p_token;
$$;

-- Einladung annehmen: liefert die IDs der Tiere
create or replace function public.accept_pet_invite(p_token text) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_inv public.pet_invites%rowtype;
  v_pets uuid[];
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into v_inv from public.pet_invites where token = p_token for update;
  if not found then raise exception 'invite_not_found' using errcode = 'P0002'; end if;
  select array_agg(pet_id) into v_pets from public.pet_invite_pets where invite_id = v_inv.id;
  if v_pets is null then raise exception 'invite_not_found' using errcode = 'P0002'; end if;
  if v_inv.accepted_by = v_uid then return v_pets; end if;
  if v_inv.accepted_at is not null then raise exception 'invite_used' using errcode = 'P0001'; end if;
  if v_inv.expires_at < now() then raise exception 'invite_expired' using errcode = 'P0001'; end if;
  if v_inv.created_by = v_uid then raise exception 'invite_own' using errcode = 'P0001'; end if;
  insert into public.pet_members (pet_id, user_id, role)
    select unnest(v_pets), v_uid, v_inv.role
    on conflict (pet_id, user_id) do nothing;
  update public.pet_invites set accepted_by = v_uid, accepted_at = now() where id = v_inv.id;
  return v_pets;
end; $$;

revoke all on function public.create_pet_invite(text, text, uuid[]), public.invite_preview(text), public.accept_pet_invite(text) from public, anon;
grant execute on function public.create_pet_invite(text, text, uuid[]), public.invite_preview(text), public.accept_pet_invite(text) to authenticated;

-- Teil 4: Fotos der Tiere. Privater Speicher, Pfad: <pet_id>/<datei>.
-- Ansehen dürfen alle Betreuer des Tieres, hochladen und löschen Besitzer und Mithalter:innen.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pet-photos', 'pet-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create or replace function private.photo_pet(p_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return ((storage.foldername(p_name))[1])::uuid;
exception when others then
  return null;
end; $$;
grant execute on function private.photo_pet(text) to authenticated;
revoke all on function private.photo_pet(text) from public, anon;

create policy "tierfotos ansehen" on storage.objects for select to authenticated
  using (bucket_id = 'pet-photos' and private.is_pet_member(private.photo_pet(name)));
create policy "tierfotos hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'pet-photos' and private.can_edit_pet(private.photo_pet(name)));
create policy "tierfotos ersetzen" on storage.objects for update to authenticated
  using (bucket_id = 'pet-photos' and private.can_edit_pet(private.photo_pet(name)))
  with check (bucket_id = 'pet-photos' and private.can_edit_pet(private.photo_pet(name)));
create policy "tierfotos loeschen" on storage.objects for delete to authenticated
  using (bucket_id = 'pet-photos' and private.can_edit_pet(private.photo_pet(name)));
