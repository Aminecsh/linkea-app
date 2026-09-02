-- À exécuter dans Supabase → SQL Editor
-- Photo de couverture d'un projet (dépôt + modification), affichée sur le feed dev,
-- la fiche projet et la page projet.

alter table projects add column if not exists image_url text;

-- Bucket public en lecture (les couvertures sont visibles par tous les devs du feed).
insert into storage.buckets (id, name, public)
values ('project-covers', 'project-covers', true)
on conflict (id) do nothing;

-- Lecture publique, écriture réservée aux utilisateurs connectés (les porteurs de
-- projet, seuls à voir le formulaire de dépôt). Le chemin est <founder_id>/<uuid>.<ext>.
drop policy if exists "project_covers_public_read" on storage.objects;
create policy "project_covers_public_read" on storage.objects
  for select using (bucket_id = 'project-covers');

drop policy if exists "project_covers_auth_insert" on storage.objects;
create policy "project_covers_auth_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'project-covers');

drop policy if exists "project_covers_auth_update" on storage.objects;
create policy "project_covers_auth_update" on storage.objects
  for update to authenticated using (bucket_id = 'project-covers');

drop policy if exists "project_covers_auth_delete" on storage.objects;
create policy "project_covers_auth_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'project-covers');
