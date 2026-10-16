-- Teil 1: Tierhalter ohne Praxis. Jede Person sieht nur ihre eigenen Daten.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  language text not null default 'de',
  created_at timestamptz not null default now()
);

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  species text not null check (species in ('dog','cat','rabbit','guinea','bird','reptile','horse','other')),
  species_other text check (species_other is null or char_length(species_other) <= 40),
  breed text,
  sex text check (sex in ('female','male')),
  birth_date date,
  chip_no text,
  cat_outdoor boolean,
  stable text,
  allergies text,
  medications text,
  emergency_contact text,
  photo_path text,
  deceased boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint other_needs_name check (species <> 'other' or species_other is not null)
);
create index pets_owner_idx on public.pets(owner_id);

create table public.routine_items (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('walk','feed','med','litter','cage','terra','muck','own')),
  label text check (label is null or char_length(label) <= 40),
  time_of_day time not null,
  repeat text not null default 'daily' check (repeat in ('daily','weekdays','weekends')),
  reminder_on boolean not null default true,
  created_at timestamptz not null default now(),
  unique (pet_id, kind, time_of_day, label)
);
create index routine_items_pet_idx on public.routine_items(pet_id);
create index routine_items_owner_idx on public.routine_items(owner_id);

create table public.routine_done (
  id uuid primary key default gen_random_uuid(),
  routine_item_id uuid not null references public.routine_items(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  done_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (routine_item_id, done_on)
);
create index routine_done_owner_idx on public.routine_done(owner_id);

create table public.weights (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  measured_on date not null default current_date,
  kg numeric(6,2) not null check (kg > 0 and kg < 2000),
  created_at timestamptz not null default now()
);
create index weights_pet_idx on public.weights(pet_id);
create index weights_owner_idx on public.weights(owner_id);

create table public.vaccinations (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  given_on date,
  valid_until date,
  source text not null default 'owner' check (source in ('owner','practice')),
  created_at timestamptz not null default now()
);
create index vaccinations_pet_idx on public.vaccinations(pet_id);
create index vaccinations_owner_idx on public.vaccinations(owner_id);

-- Zugriffsschutz
alter table public.profiles enable row level security;
alter table public.pets enable row level security;
alter table public.routine_items enable row level security;
alter table public.routine_done enable row level security;
alter table public.weights enable row level security;
alter table public.vaccinations enable row level security;

create policy "profil lesen" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profil aendern" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "eigene tiere" on public.pets for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create policy "eigener tagesplan" on public.routine_items for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id and exists (select 1 from public.pets p where p.id = pet_id and p.owner_id = (select auth.uid())));

create policy "eigene erledigt" on public.routine_done for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id and exists (select 1 from public.routine_items r where r.id = routine_item_id and r.owner_id = (select auth.uid())));

create policy "eigenes gewicht" on public.weights for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id and exists (select 1 from public.pets p where p.id = pet_id and p.owner_id = (select auth.uid())));

create policy "eigene impfungen" on public.vaccinations for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id and source = 'owner' and exists (select 1 from public.pets p where p.id = pet_id and p.owner_id = (select auth.uid())));

-- Neue Tabellen werden nicht automatisch freigegeben: Rechte nur für angemeldete Personen
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.pets, public.routine_items, public.routine_done, public.weights, public.vaccinations to authenticated;

-- updated_at pflegen
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
create trigger pets_updated_at before update on public.pets for each row execute function public.set_updated_at();

-- Profil bei Registrierung anlegen
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, language)
  values (new.id, new.raw_user_meta_data->>'display_name', coalesce(new.raw_user_meta_data->>'language','de'));
  return new;
end; $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
