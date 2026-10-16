-- Teil 4: Dokumentenablage in der Tierakte.
-- Befunde, Impfpass, Rechnungen, Versicherung usw. als PDF oder Bild je Tier.
-- Lesen: alle Mitglieder des Tiers. Hochladen/Ändern/Löschen: Besitzer und Mithalter:innen.
-- Dateien liegen im privaten Bucket 'pet-documents' unter <pet_id>/<datei>.

-- ---------- Tabelle ----------
create table public.pet_documents (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  category text not null default 'other'
    check (category in ('finding','vaccination','invoice','insurance','prescription','other')),
  doc_date date,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now(),
  -- Die Datei muss im Ordner des eigenen Tiers liegen
  constraint pet_documents_path_check check (split_part(storage_path, '/', 1) = pet_id::text)
);
create index pet_documents_pet_idx on public.pet_documents(pet_id, created_at desc);
create index pet_documents_owner_idx on public.pet_documents(owner_id);

alter table public.pet_documents enable row level security;

create policy "dokumente lesen" on public.pet_documents for select to authenticated
  using (private.is_pet_member(pet_id));
create policy "dokumente anlegen" on public.pet_documents for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.can_edit_pet(pet_id));
create policy "dokumente aendern" on public.pet_documents for update to authenticated
  using (private.can_edit_pet(pet_id)) with check (private.can_edit_pet(pet_id));
create policy "dokumente loeschen" on public.pet_documents for delete to authenticated
  using (private.can_edit_pet(pet_id));

-- Nur Titel, Kategorie und Datum dürfen nachträglich geändert werden
revoke all on public.pet_documents from anon, authenticated;
grant select, insert, delete on public.pet_documents to authenticated;
grant update (title, category, doc_date) on public.pet_documents to authenticated;

-- ---------- Speicher ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pet-documents', 'pet-documents', false, 10485760,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "tierdokumente ansehen" on storage.objects for select to authenticated
  using (bucket_id = 'pet-documents' and private.is_pet_member(private.photo_pet(name)));
create policy "tierdokumente hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'pet-documents' and private.can_edit_pet(private.photo_pet(name)));
create policy "tierdokumente loeschen" on storage.objects for delete to authenticated
  using (bucket_id = 'pet-documents' and private.can_edit_pet(private.photo_pet(name)));
-- Kein Überschreiben: jede Datei bekommt einen neuen Namen
