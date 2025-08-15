-- Extensions
create extension if not exists pg_trgm;
create extension if not exists pgcrypto;
create extension if not exists vector;

-- Users table mirrors auth.users
create table if not exists app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- Organizations (multi-tenant)
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Organization membership and roles (one admin per org)
create table if not exists organization_users (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  role text not null check (role in ('orgAdmin','contentManager','contentViewer','guest')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create unique index if not exists organization_one_admin on organization_users(org_id) where role = 'orgAdmin';

-- Helper views/functions
create or replace view v_user_org_roles as
select ou.user_id, ou.org_id, ou.role from organization_users ou;

-- Helper functions (SECURITY DEFINER to avoid RLS recursion in policies)
create or replace function current_org_role(p_org_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r text;
begin
  select role into r from organization_users where org_id = p_org_id and user_id = auth.uid();
  return r;
end;
$$;

create or replace function is_member_of(p_org_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v boolean;
begin
  select exists(select 1 from organization_users where org_id = p_org_id and user_id = auth.uid()) into v;
  return coalesce(v, false);
end;
$$;

grant execute on function current_org_role(uuid) to anon, authenticated;
grant execute on function is_member_of(uuid) to anon, authenticated;

-- Documents
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  owner_user_id uuid not null references app_users(id) on delete restrict,
  title text,
  filename text,
  type text,
  folder_path text[] default '{}',
  subject text,
  description text,
  category text,
  tags text[] default '{}',
  keywords text[] default '{}',
  sender text,
  receiver text,
  document_date date,
  uploaded_at timestamptz not null default now(),
  file_size_bytes int,
  mime_type text,
  content_hash text,
  storage_key text,
  version_group_id uuid,
  version_number int,
  is_current_version boolean default true,
  supersedes_id uuid references documents(id) on delete set null,
  unique (org_id, content_hash)
);

-- Document Links (related documents)
create table if not exists document_links (
  org_id uuid not null references organizations(id) on delete cascade,
  doc_id uuid not null references documents(id) on delete cascade,
  linked_doc_id uuid not null references documents(id) on delete cascade,
  primary key (doc_id, linked_doc_id)
);

-- Audit Events (include login events)
create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  ts timestamptz not null default now(),
  actor_user_id uuid not null references app_users(id) on delete set null,
  type text not null check (type in ('login','create','edit','delete','move','link','unlink','versionSet')),
  doc_id uuid references documents(id) on delete set null,
  title text,
  path text[],
  note text
);

-- Chat sessions and messages (org-scoped)
create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now()
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  session_id uuid references chat_sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant','tool')),
  content text not null,
  citations jsonb,
  created_at timestamptz not null default now()
);

-- Document chunks for RAG (org-scoped)
create table if not exists doc_chunks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  doc_id uuid not null references documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(1536),
  token_count int,
  unique (doc_id, chunk_index)
);

-- Indexes
create index if not exists idx_documents_org on documents(org_id);
create index if not exists idx_documents_owner on documents(owner_user_id);
create index if not exists idx_documents_folder on documents using gin(folder_path);
create index if not exists idx_documents_tags on documents using gin(tags);
create index if not exists idx_documents_keywords on documents using gin(keywords);
create index if not exists idx_documents_search on documents using gin ((coalesce(title,'') || ' ' || coalesce(subject,'') || ' ' || coalesce(sender,'') || ' ' || coalesce(receiver,'')) gin_trgm_ops);

create index if not exists idx_audit_org_ts on audit_events(org_id, ts desc);
create index if not exists idx_audit_actor_ts on audit_events(actor_user_id, ts desc);
create index if not exists idx_audit_doc_ts on audit_events(doc_id, ts desc);

create index if not exists idx_chat_sessions_org on chat_sessions(org_id);
create index if not exists idx_chat_messages_session_ts on chat_messages(session_id, created_at);

-- pgvector HNSW index
create index if not exists idx_doc_chunks_embedding_hnsw on doc_chunks using hnsw (embedding vector_cosine_ops);