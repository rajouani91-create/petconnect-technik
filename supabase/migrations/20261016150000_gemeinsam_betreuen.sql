-- Teil 2: Ein Tier gemeinsam betreuen.
-- Jedes Tier hat genau einen Besitzer (pets.owner_id) und beliebig viele Mitbetreuer.
-- Alle Betreuer sehen Stammdaten, Tagesplan, Erledigt, Gewicht und Impfungen des Tieres.
-- Nur der Besitzer kann einladen, Mitbetreuer entfernen und das Tier löschen.

create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------- Betreuer ----------
create table public.pet_members (
  pet_id uuid not null references public.pets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','carer')),
  created_at timestamptz not null default now(),
  primary key (pet_id, user_id)
);
create index pet_members_user_idx on public.pet_members(user_id);
create unique index pet_members_one_owner on public.pet_members(pet_id) where role = 'owner';

-- vorhandene Tiere: Besitzer als Betreuer eintragen
insert into public.pet_members (pet_id, user_id, role)
select id, owner_id, 'owner' from public.pets
on conflict do nothing;

-- ---------- Hilfsfunktionen (nicht über die API erreichbar) ----------
create or replace function private.is_pet_member(p_pet uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.pet_members m where m.pet_id = p_pet and m.user_id = (select auth.uid()));
$$;

create or replace function private.is_pet_owner(p_pet uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.pet_members m where m.pet_id = p_pet and m.user_id = (select auth.uid()) and m.role = 'owner');
$$;

create or replace function private.is_item_member(p_item uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.routine_items r join public.pet_members m on m.pet_id = r.pet_id
    where r.id = p_item and m.user_id = (select auth.uid()));
$$;

create or replace function private.shares_pet(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.pet_members a join public.pet_members b on a.pet_id = b.pet_id
    where a.user_id = (select auth.uid()) and b.user_id = p_user);
$$;

revoke all on function private.is_pet_member(uuid), private.is_pet_owner(uuid), private.is_item_member(uuid), private.shares_pet(uuid) from public, anon;
grant execute on function private.is_pet_member(uuid), private.is_pet_owner(uuid), private.is_item_member(uuid), private.shares_pet(uuid) to authenticated;

-- Neues Tier: Besitzer automatisch als Betreuer
create or replace function private.add_owner_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.pet_members (pet_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end; $$;
revoke all on function private.add_owner_member() from public, anon, authenticated;
create trigger pets_add_owner after insert on public.pets for each row execute function private.add_owner_member();

-- Besitzer eines Tieres lässt sich nicht per Update ändern
create or replace function private.keep_owner() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'owner_change_not_allowed' using errcode = '42501';
  end if;
  return new;
end; $$;
revoke all on function private.keep_owner() from public, anon, authenticated;
create trigger pets_keep_owner before update on public.pets for each row execute function private.keep_owner();

-- ---------- Zugriffsregeln neu ----------
drop policy "eigene tiere" on public.pets;
-- owner_id = ich: damit ein neu angelegtes Tier sofort zurückgegeben werden kann
create policy "tiere lesen" on public.pets for select to authenticated
  using (owner_id = (select auth.uid()) or private.is_pet_member(id));
create policy "tier anlegen" on public.pets for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "tier aendern" on public.pets for update to authenticated
  using (private.is_pet_member(id)) with check (private.is_pet_member(id));
create policy "tier loeschen" on public.pets for delete to authenticated
  using (private.is_pet_owner(id));

drop policy "eigener tagesplan" on public.routine_items;
create policy "tagesplan lesen" on public.routine_items for select to authenticated
  using (private.is_pet_member(pet_id));
create policy "tagesplan anlegen" on public.routine_items for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.is_pet_member(pet_id));
create policy "tagesplan aendern" on public.routine_items for update to authenticated
  using (private.is_pet_member(pet_id)) with check (private.is_pet_member(pet_id));
create policy "tagesplan loeschen" on public.routine_items for delete to authenticated
  using (private.is_pet_member(pet_id));

drop policy "eigene erledigt" on public.routine_done;
create policy "erledigt lesen" on public.routine_done for select to authenticated
  using (private.is_item_member(routine_item_id));
create policy "erledigt anlegen" on public.routine_done for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.is_item_member(routine_item_id));
create policy "erledigt loeschen" on public.routine_done for delete to authenticated
  using (private.is_item_member(routine_item_id));
revoke update on public.routine_done from authenticated;

drop policy "eigenes gewicht" on public.weights;
create policy "gewicht lesen" on public.weights for select to authenticated
  using (private.is_pet_member(pet_id));
create policy "gewicht anlegen" on public.weights for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.is_pet_member(pet_id));
create policy "gewicht aendern" on public.weights for update to authenticated
  using (private.is_pet_member(pet_id)) with check (private.is_pet_member(pet_id));
create policy "gewicht loeschen" on public.weights for delete to authenticated
  using (private.is_pet_member(pet_id));

drop policy "eigene impfungen" on public.vaccinations;
create policy "impfungen lesen" on public.vaccinations for select to authenticated
  using (private.is_pet_member(pet_id));
create policy "impfungen anlegen" on public.vaccinations for insert to authenticated
  with check (owner_id = (select auth.uid()) and source = 'owner' and private.is_pet_member(pet_id));
create policy "impfungen aendern" on public.vaccinations for update to authenticated
  using (private.is_pet_member(pet_id) and source = 'owner') with check (private.is_pet_member(pet_id) and source = 'owner');
create policy "impfungen loeschen" on public.vaccinations for delete to authenticated
  using (private.is_pet_member(pet_id) and source = 'owner');

-- Profile: eigenes und das der Mitbetreuer (für „erledigt von Kyra“)
drop policy "profil lesen" on public.profiles;
create policy "profil lesen" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_pet(id));

alter table public.pet_members enable row level security;
create policy "betreuer lesen" on public.pet_members for select to authenticated
  using (private.is_pet_member(pet_id));
-- Besitzer entfernt Mitbetreuer, Mitbetreuer kann selbst gehen. Der Besitzer-Eintrag bleibt.
create policy "betreuer entfernen" on public.pet_members for delete to authenticated
  using (role = 'carer' and (user_id = (select auth.uid()) or private.is_pet_owner(pet_id)));
grant select, delete on public.pet_members to authenticated;

-- ---------- Einladungen ----------
create table public.pet_invites (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index pet_invites_pet_idx on public.pet_invites(pet_id);
create index pet_invites_created_by_idx on public.pet_invites(created_by);
create index pet_invites_accepted_by_idx on public.pet_invites(accepted_by);

alter table public.pet_invites enable row level security;
create policy "einladungen lesen" on public.pet_invites for select to authenticated
  using (private.is_pet_owner(pet_id));
create policy "einladung anlegen" on public.pet_invites for insert to authenticated
  with check (created_by = (select auth.uid()) and private.is_pet_owner(pet_id));
create policy "einladung loeschen" on public.pet_invites for delete to authenticated
  using (private.is_pet_owner(pet_id));
grant select, insert, delete on public.pet_invites to authenticated;

-- Vorschau für die eingeladene Person: welches Tier, von wem, noch gültig?
create or replace function public.invite_preview(p_token text)
returns table (pet_name text, species text, species_other text, inviter_name text, status text)
language sql stable security definer set search_path = '' as $$
  select p.name, p.species, p.species_other, pr.display_name,
    case
      when exists (select 1 from public.pet_members m where m.pet_id = i.pet_id and m.user_id = (select auth.uid())) then 'member'
      when i.accepted_at is not null then 'used'
      when i.expires_at < now() then 'expired'
      else 'open'
    end
  from public.pet_invites i
  join public.pets p on p.id = i.pet_id
  left join public.profiles pr on pr.id = i.created_by
  where i.token = p_token;
$$;

-- Einladung annehmen: liefert die ID des Tieres
create or replace function public.accept_pet_invite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_inv public.pet_invites%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into v_inv from public.pet_invites where token = p_token for update;
  if not found then raise exception 'invite_not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.pet_members where pet_id = v_inv.pet_id and user_id = v_uid) then
    return v_inv.pet_id;
  end if;
  if v_inv.accepted_at is not null then raise exception 'invite_used' using errcode = 'P0001'; end if;
  if v_inv.expires_at < now() then raise exception 'invite_expired' using errcode = 'P0001'; end if;
  insert into public.pet_members (pet_id, user_id, role) values (v_inv.pet_id, v_uid, 'carer');
  update public.pet_invites set accepted_by = v_uid, accepted_at = now() where id = v_inv.id;
  return v_inv.pet_id;
end; $$;

revoke all on function public.invite_preview(text), public.accept_pet_invite(text) from public, anon;
grant execute on function public.invite_preview(text), public.accept_pet_invite(text) to authenticated;
