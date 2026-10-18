-- Teil 9: Medikation je Tier – strukturiert (Präparat, Menge, Einheit, Uhrzeiten, Hinweis, Zeitraum)
-- und „Gabe abgehakt“ mit Person und Zeitpunkt. Die App berechnet und empfiehlt KEINE Dosierungen.
-- Lesen: alle Mitglieder des Tiers. Anlegen/Ändern/Löschen: Besitzer und Mithalter:innen.
-- Einträge mit source = 'practice' (später von Praxen) können Halter:innen nicht ändern oder löschen.
-- Das alte Freitextfeld pets.medications bleibt als „Weitere Hinweise“ erhalten.

-- Uhrzeiten: 0–4 Stück, keine doppelten
create or replace function private.valid_med_times(p time[]) returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select coalesce(cardinality(p), 0) <= 4
     and coalesce(cardinality(p), 0) = (select count(distinct x) from unnest(coalesce(p, '{}')) x);
$$;

create table public.pet_medications (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source text not null default 'owner' check (source in ('owner','practice')),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  amount numeric(7,2) not null check (amount > 0 and amount <= 1000),
  unit text not null check (unit in ('tablet','capsule','ml','drop','pipette','puff','sachet','g','mg','application')),
  frequency text not null default 'daily' check (frequency in ('daily','as_needed')),
  times time[] not null default '{}',
  intake_hint text not null default 'none' check (intake_hint in ('none','with_food','empty_stomach')),
  note text check (note is null or char_length(note) <= 200),
  reason text check (reason is null or char_length(reason) <= 200),
  prescribed_by text check (prescribed_by is null or char_length(prescribed_by) <= 120),
  starts_on date not null default current_date,
  ends_on date,
  stopped_on date,
  remind boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pet_medications_id_pet unique (id, pet_id),
  constraint pet_medications_times check (
    private.valid_med_times(times)
    and ((frequency = 'daily' and cardinality(times) between 1 and 4) or (frequency = 'as_needed' and cardinality(times) = 0))),
  constraint pet_medications_ends check (ends_on is null or ends_on >= starts_on),
  constraint pet_medications_stopped check (stopped_on is null or stopped_on >= starts_on - 1)
);
create index pet_medications_pet_idx on public.pet_medications(pet_id, starts_on);
create index pet_medications_owner_idx on public.pet_medications(owner_id);

create trigger pet_medications_touch before update on public.pet_medications
  for each row execute function public.set_updated_at();

alter table public.pet_medications enable row level security;
create policy "medikation lesen" on public.pet_medications for select to authenticated
  using (private.is_pet_member(pet_id));
create policy "medikation anlegen" on public.pet_medications for insert to authenticated
  with check (owner_id = (select auth.uid()) and source = 'owner' and private.can_edit_pet(pet_id));
create policy "medikation aendern" on public.pet_medications for update to authenticated
  using (source = 'owner' and private.can_edit_pet(pet_id)) with check (source = 'owner' and private.can_edit_pet(pet_id));
create policy "medikation loeschen" on public.pet_medications for delete to authenticated
  using (source = 'owner' and private.can_edit_pet(pet_id));

revoke all on public.pet_medications from anon, authenticated;
grant select, insert, delete on public.pet_medications to authenticated;
grant update (name, amount, unit, frequency, times, intake_hint, note, reason, prescribed_by, starts_on, ends_on, stopped_on, remind)
  on public.pet_medications to authenticated;

-- ---------- Gaben (abgehakt) ----------
create table public.medication_doses (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null,
  pet_id uuid not null,
  scheduled_on date not null,
  scheduled_time time not null,
  given_at timestamptz not null default now(),
  given_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  constraint medication_doses_med foreign key (medication_id, pet_id)
    references public.pet_medications(id, pet_id) on delete cascade,
  constraint medication_doses_once unique (medication_id, scheduled_on, scheduled_time)
);
create index medication_doses_pet_idx on public.medication_doses(pet_id, scheduled_on);

-- Abhaken nur für geplante Uhrzeit, im Zeitraum der Medikation, nicht in der Zukunft
create or replace function private.dose_check() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m public.pet_medications%rowtype; v_today date := (now() at time zone 'Europe/Berlin')::date;
begin
  select * into m from public.pet_medications where id = new.medication_id;
  if not found then raise exception 'dose_medication_not_found' using errcode = 'P0002'; end if;
  if m.frequency <> 'daily' or not (new.scheduled_time = any(m.times)) then
    raise exception 'dose_time_not_planned' using errcode = '23514'; end if;
  if new.scheduled_on > v_today or new.scheduled_on < v_today - 7 then
    raise exception 'dose_day_out_of_range' using errcode = '23514'; end if;
  if new.scheduled_on < m.starts_on or (m.ends_on is not null and new.scheduled_on > m.ends_on)
     or (m.stopped_on is not null and new.scheduled_on > m.stopped_on) then
    raise exception 'dose_outside_period' using errcode = '23514'; end if;
  return new;
end; $$;
revoke all on function private.dose_check() from public, anon, authenticated;
create trigger medication_doses_check before insert on public.medication_doses
  for each row execute function private.dose_check();

alter table public.medication_doses enable row level security;
create policy "gaben lesen" on public.medication_doses for select to authenticated
  using (private.is_pet_member(pet_id));
create policy "gaben abhaken" on public.medication_doses for insert to authenticated
  with check (given_by = (select auth.uid()) and private.can_edit_pet(pet_id));
create policy "gaben zuruecknehmen" on public.medication_doses for delete to authenticated
  using (private.can_edit_pet(pet_id));

revoke all on public.medication_doses from anon, authenticated;
grant select, insert, delete on public.medication_doses to authenticated;

-- ---------- Sitter-Ansicht: laufende Medikamente mitliefern ----------
create or replace function public.sitter_view(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.sitter_access%rowtype; p public.pets%rowtype; v_owner text; v_today date := (now() at time zone 'Europe/Berlin')::date; v_meds jsonb;
begin
  if p_token is null or char_length(p_token) <> 64 then return jsonb_build_object('status','not_found'); end if;
  select * into a from public.sitter_access where token = p_token;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if a.revoked_at is not null then return jsonb_build_object('status','revoked'); end if;
  if v_today > a.valid_to then return jsonb_build_object('status','expired'); end if;
  select * into p from public.pets where id = a.pet_id;
  if p.deceased then return jsonb_build_object('status','revoked'); end if;
  if v_today < a.valid_from then
    return jsonb_build_object('status','not_yet','valid_from',a.valid_from,'pet_name',p.name);
  end if;
  select display_name into v_owner from public.profiles where id = p.owner_id;
  select coalesce(jsonb_agg(jsonb_build_object('name',m.name,'amount',m.amount,'unit',m.unit,'frequency',m.frequency,
           'times',(select coalesce(jsonb_agg(to_char(x,'HH24:MI') order by x),'[]'::jsonb) from unnest(m.times) x),
           'intake_hint',m.intake_hint,'note',m.note,'ends_on',m.ends_on) order by m.name), '[]'::jsonb)
    into v_meds
    from public.pet_medications m
   where m.pet_id = p.id and m.starts_on <= a.valid_to
     and coalesce(m.stopped_on, m.ends_on, 'infinity'::date) >= greatest(a.valid_from, v_today);
  return jsonb_build_object(
    'status','ok',
    'sitter_name',a.sitter_name,'valid_from',a.valid_from,'valid_to',a.valid_to,
    'feeding',a.feeding,'care_notes',a.care_notes,
    'pet', jsonb_build_object('name',p.name,'species',p.species,'species_other',p.species_other,'breed',p.breed,
                              'chip_no',p.chip_no,'allergies',p.allergies,'medications',p.medications,'deceased',p.deceased),
    'active_medications', v_meds,
    'owner_name',v_owner,'owner_phone',p.owner_phone,'emergency_contact',p.emergency_contact,
    'vet_name',p.vet_name,'vet_phone',p.vet_phone);
end; $$;
revoke all on function public.sitter_view(text) from public;
grant execute on function public.sitter_view(text) to anon, authenticated;
