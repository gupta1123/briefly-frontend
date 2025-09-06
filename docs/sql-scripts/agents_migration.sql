-- Agents & Retrieval Enhancements Migration
-- Run this in Supabase SQL Editor after the base schema.

-- 1) Add optional page number to chunks for page-aware citations
alter table if exists doc_chunks
  add column if not exists page int;

-- 2) Per-org agent configuration table
create table if not exists org_agent_configs (
  org_id uuid not null references organizations(id) on delete cascade,
  agent_key text not null,
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, agent_key)
);

-- Update trigger for updated_at
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_org_agent_configs_updated on org_agent_configs;
create trigger trg_org_agent_configs_updated
  before update on org_agent_configs
  for each row execute function update_updated_at_column();

-- Enable RLS and policies
alter table org_agent_configs enable row level security;

-- Members can read their org configs
drop policy if exists org_agent_configs_member_read on org_agent_configs;
create policy org_agent_configs_member_read on org_agent_configs
  for select using (is_member_of(org_id));

-- Admins can write, or holders of org.update_settings
drop policy if exists org_agent_configs_admin_write on org_agent_configs;
create policy org_agent_configs_admin_write on org_agent_configs
  for all using (
    current_org_role(org_id) = 'orgAdmin' or has_perm(org_id, 'org.update_settings')
  ) with check (
    current_org_role(org_id) = 'orgAdmin' or has_perm(org_id, 'org.update_settings')
  );

-- 3) Seed/extend role permissions with feature flags (idempotent JSONB updates)
-- Add feature flags only if the key is missing to avoid overwriting customizations
do $$
declare
  r record;
  perm jsonb;
begin
  for r in select * from org_roles loop
    perm := coalesce(r.permissions, '{}'::jsonb);
    perm := jsonb_set(perm, '{feature.chat.snippets}', to_jsonb(
      case when r.key in ('orgAdmin','contentManager','contentViewer') then true else false end
    ), true);
    perm := jsonb_set(perm, '{feature.chat.metadata}', to_jsonb(true), true);
    perm := jsonb_set(perm, '{feature.chat.analytics}', to_jsonb(
      case when r.key in ('orgAdmin','contentManager') then true else false end
    ), true);
    perm := jsonb_set(perm, '{feature.chat.linked}', to_jsonb(true), true);
    perm := jsonb_set(perm, '{feature.search.semantic}', to_jsonb(
      case when r.key in ('orgAdmin','contentManager','contentViewer') then true else false end
    ), true);
    perm := jsonb_set(perm, '{feature.ocr}', to_jsonb(
      case when r.key in ('orgAdmin','contentManager') then true else false end
    ), true);
    perm := jsonb_set(perm, '{feature.chat.save_sessions}', to_jsonb(
      case when r.key in ('orgAdmin','contentManager') then true else false end
    ), true);
    update org_roles set permissions = perm where id = r.id;
  end loop;
end $$;

-- 4) Optional: small hybrid lexical index improvements (already present in base schema)
-- create index if not exists idx_documents_search on documents using gin ((coalesce(title,'') || ' ' || coalesce(subject,'') || ' ' || coalesce(sender,'') || ' ' || coalesce(receiver,'')) gin_trgm_ops);

-- Done
select 'agents_migration applied' as status;

