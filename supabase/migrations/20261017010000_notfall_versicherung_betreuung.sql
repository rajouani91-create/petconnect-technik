-- Teil 6: Notfallkarte, Versicherung, Betreuung (Sitter-Zugang per Link).
-- Lesen: Mitglieder des Tiers (Sitter-Zugänge nur Besitzer/Mithalter:innen).
-- Schreiben: Besitzer und Mithalter:innen.

-- ---------- Notfallkarte: zusätzliche Angaben am Tier ----------
alter table public.pets
  add column if not exists vet_name text check (vet_name is null or char_length(vet_name) <= 120),
  add column if not exists vet_phone text check (vet_phone is null or char_length(vet_phone) <= 40),
  add column if not exists owner_phone text check (owner_phone is null or char_length(owner_phone) <= 40);

-- ---------- Versicherungen ----------
create table public.pet_insurances (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  insurer text not null check (char_length(btrim(insurer)) between 1 and 120),
  policy_no text not null check (char_length(btrim(policy_no)) between 1 and 60),
  holder_name text check (holder_name is null or char_length(holder_name) <= 120),
  deductible numeric(10,2) check (deductible is null or (deductible >= 0 and deductible < 100000)),
  reimbursement_pct integer check (reimbursement_pct is null or reimbursement_pct between 0 and 100),
  submission text check (submission is null or submission in ('portal','email','post','app','other')),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (id, pet_id)
);
create index pet_insurances_pet_idx on public.pet_insurances(pet_id);
create index pet_insurances_owner_idx on public.pet_insurances(owner_id);

create table public.insurance_claims (
  id uuid primary key default gen_random_uuid(),
  insurance_id uuid not null,
  pet_id uuid not null,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  amount numeric(10,2) not null check (amount > 0 and amount < 100000),
  claim_date date not null default current_date,
  status text not null default 'open'
    check (status in ('open','submitted','query','partial','reimbursed','rejected')),
  reimbursed_amount numeric(10,2) check (reimbursed_amount is null or (reimbursed_amount >= 0 and reimbursed_amount <= amount)),
  document_id uuid references public.pet_documents(id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  foreign key (insurance_id, pet_id) references public.pet_insurances(id, pet_id) on delete cascade
);
create index insurance_claims_ins_idx on public.insurance_claims(insurance_id);
create index insurance_claims_pet_idx on public.insurance_claims(pet_id);
create index insurance_claims_owner_idx on public.insurance_claims(owner_id);
create index insurance_claims_doc_idx on public.insurance_claims(document_id);

-- Ein verknüpftes Dokument muss zum selben Tier gehören
create or replace function private.claim_doc_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.document_id is not null and not exists
     (select 1 from public.pet_documents d where d.id = new.document_id and d.pet_id = new.pet_id) then
    raise exception 'claim_doc_pet' using errcode = 'P0001';
  end if;
  return new;
end; $$;
create trigger insurance_claims_doc_check before insert or update of document_id, pet_id on public.insurance_claims
  for each row execute function private.claim_doc_check();

alter table public.pet_insurances enable row level security;
alter table public.insurance_claims enable row level security;

create policy "versicherung lesen" on public.pet_insurances for select to authenticated using (private.is_pet_member(pet_id));
create policy "versicherung anlegen" on public.pet_insurances for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.can_edit_pet(pet_id));
create policy "versicherung aendern" on public.pet_insurances for update to authenticated
  using (private.can_edit_pet(pet_id)) with check (private.can_edit_pet(pet_id));
create policy "versicherung loeschen" on public.pet_insurances for delete to authenticated using (private.can_edit_pet(pet_id));

create policy "einreichung lesen" on public.insurance_claims for select to authenticated using (private.is_pet_member(pet_id));
create policy "einreichung anlegen" on public.insurance_claims for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.can_edit_pet(pet_id));
create policy "einreichung aendern" on public.insurance_claims for update to authenticated
  using (private.can_edit_pet(pet_id)) with check (private.can_edit_pet(pet_id));
create policy "einreichung loeschen" on public.insurance_claims for delete to authenticated using (private.can_edit_pet(pet_id));

revoke all on public.pet_insurances, public.insurance_claims from anon, authenticated;
grant select, insert, delete on public.pet_insurances, public.insurance_claims to authenticated;
grant update (insurer, policy_no, holder_name, deductible, reimbursement_pct, submission, note) on public.pet_insurances to authenticated;
grant update (title, amount, claim_date, status, reimbursed_amount, document_id, note) on public.insurance_claims to authenticated;

-- ---------- Betreuung: Sitter-Zugang per Link ----------
create table public.sitter_access (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sitter_name text not null check (char_length(btrim(sitter_name)) between 1 and 80),
  valid_from date not null,
  valid_to date not null,
  feeding text check (feeding is null or char_length(feeding) <= 2000),
  care_notes text check (care_notes is null or char_length(care_notes) <= 2000),
  token text not null unique default (replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint sitter_access_dates check (valid_to >= valid_from and valid_to <= valid_from + 92)
);
create index sitter_access_pet_idx on public.sitter_access(pet_id);
create index sitter_access_owner_idx on public.sitter_access(owner_id);

alter table public.sitter_access enable row level security;
-- Nur wer das Tier bearbeiten darf, sieht die Zugänge (und damit die Links)
create policy "sitter lesen" on public.sitter_access for select to authenticated using (private.can_edit_pet(pet_id));
create policy "sitter anlegen" on public.sitter_access for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.can_edit_pet(pet_id));
create policy "sitter aendern" on public.sitter_access for update to authenticated
  using (private.can_edit_pet(pet_id)) with check (private.can_edit_pet(pet_id));
create policy "sitter loeschen" on public.sitter_access for delete to authenticated using (private.can_edit_pet(pet_id));

revoke all on public.sitter_access from anon, authenticated;
grant select, insert, delete on public.sitter_access to authenticated;
grant update (sitter_name, valid_from, valid_to, feeding, care_notes, revoked_at) on public.sitter_access to authenticated;

-- Öffentliche Sitter-Ansicht: nur mit gültigem Link, nur Betreuungsinfos.
-- Keine Gesundheitsakte, keine Rechnungen, keine Versicherung, keine Dokumente.
create or replace function public.sitter_view(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.sitter_access%rowtype; p public.pets%rowtype; v_owner text; v_today date := (now() at time zone 'Europe/Berlin')::date;
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
  return jsonb_build_object(
    'status','ok',
    'sitter_name',a.sitter_name,'valid_from',a.valid_from,'valid_to',a.valid_to,
    'feeding',a.feeding,'care_notes',a.care_notes,
    'pet', jsonb_build_object('name',p.name,'species',p.species,'species_other',p.species_other,'breed',p.breed,
                              'chip_no',p.chip_no,'allergies',p.allergies,'medications',p.medications,'deceased',p.deceased),
    'owner_name',v_owner,'owner_phone',p.owner_phone,'emergency_contact',p.emergency_contact,
    'vet_name',p.vet_name,'vet_phone',p.vet_phone);
end; $$;
revoke all on function public.sitter_view(text) from public;
grant execute on function public.sitter_view(text) to anon, authenticated;
