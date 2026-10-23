-- Auftrag 13, Stufe 1: Vorgeschichte der Halterin (Herkunft, Haltung, Freitexte).
-- Lesen: alle Tiermitglieder. Schreiben: Halter:in und Mithalter:in. Betreuung hat keinen Zugriff.
create table public.pet_history (
  pet_id uuid primary key references public.pets(id) on delete cascade,
  origin text check (origin in ('breeder', 'shelter', 'private', 'found', 'abroad')),
  with_since date check (with_since <= current_date),
  neutered text check (neutered in ('yes', 'no', 'unknown')),
  housing text check (housing in ('flat', 'outdoor_access', 'house_garden', 'outdoor_stable')),
  past_illness text check (char_length(past_illness) <= 2000),
  surgeries text check (char_length(surgeries) <= 2000),
  chronic text check (char_length(chronic) <= 2000),
  allergies text check (char_length(allergies) <= 2000),
  past_medication text check (char_length(past_medication) <= 2000),
  travel text check (char_length(travel) <= 2000),
  previous_practice text check (char_length(previous_practice) <= 500),
  other text check (char_length(other) <= 2000),
  updated_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now()
);

alter table public.pet_history enable row level security;

create policy "vorgeschichte lesen" on public.pet_history for select to authenticated
  using (private.is_pet_member(pet_id));

create policy "vorgeschichte anlegen" on public.pet_history for insert to authenticated
  with check (private.can_edit_pet(pet_id));

create policy "vorgeschichte aendern" on public.pet_history for update to authenticated
  using (private.can_edit_pet(pet_id)) with check (private.can_edit_pet(pet_id));

create trigger pet_history_updated before update on public.pet_history
  for each row execute function public.set_updated_at();
