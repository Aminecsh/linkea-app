-- À exécuter dans Supabase → SQL Editor

alter table projects add column if not exists github_repo text;

create table if not exists project_commits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  sha text not null,
  message text not null,
  author_name text,
  author_login text,
  url text not null,
  committed_at timestamptz not null,
  ai_summary text,
  created_at timestamptz not null default now(),
  unique (project_id, sha)
);

create index if not exists project_commits_project_id_idx on project_commits(project_id);

create table if not exists project_activity_digests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  digest_date date not null,
  summary_fr text not null,
  commit_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, digest_date)
);

-- RLS : lecture réservée aux membres du projet (founder ou dev matché).
-- Vérifie que ça correspond à ta politique existante sur `tasks`/`sprints` (même logique attendue).
alter table project_commits enable row level security;
alter table project_activity_digests enable row level security;

create policy "project_commits_select_members" on project_commits
  for select using (
    exists (
      select 1 from projects p
      join profiles_founder pf on pf.id = p.founder_id
      where p.id = project_commits.project_id and pf.user_id = auth.uid()
    )
    or exists (
      select 1 from conversations c
      join profiles_developer pd on pd.id = c.developer_id
      where c.project_id = project_commits.project_id and pd.user_id = auth.uid()
    )
  );

create policy "project_activity_digests_select_members" on project_activity_digests
  for select using (
    exists (
      select 1 from projects p
      join profiles_founder pf on pf.id = p.founder_id
      where p.id = project_activity_digests.project_id and pf.user_id = auth.uid()
    )
    or exists (
      select 1 from conversations c
      join profiles_developer pd on pd.id = c.developer_id
      where c.project_id = project_activity_digests.project_id and pd.user_id = auth.uid()
    )
  );

-- Écriture : uniquement via le service role (route API /api/github/sync), donc pas de policy insert/update
-- côté client — la clé service_role bypass RLS.
