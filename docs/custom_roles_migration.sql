-- Custom Roles & Permissions for Briefly
-- Run this entire script in your Supabase SQL editor.
-- Safe to run multiple times (uses IF EXISTS / upserts where possible).

-- 0) Prereqs: ensure helper functions exist (from existing schema)
-- current_org_role(p_org_id uuid) and is_member_of(p_org_id uuid)

-- 1) org_roles table: per-organization role definitions with permission map
create table if not exists org_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  permissions jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key)
);

-- Indexes
create index if not exists idx_org_roles_org on org_roles(org_id);

-- updated_at trigger
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_org_roles_updated on org_roles;
create trigger trg_org_roles_updated before update on org_roles
  for each row execute function update_updated_at_column();

-- 2) Relax fixed enum constraint on organization_users.role and add FK to org_roles
do $$
declare
  c record;
begin
  -- Drop any CHECK constraint on organization_users.role enforcing fixed values
  for c in (
    select conname
    from pg_constraint
    where conrelid = 'organization_users'::regclass
      and contype = 'c'
  ) loop
    execute format('alter table organization_users drop constraint %I', c.conname);
  end loop;
exception when others then
  null; -- continue if no constraint
end $$;

-- Ensure a supporting composite FK exists to keep (org_id, role) consistent
do $$
begin
  alter table organization_users
    add constraint organization_users_role_fk
    foreign key (org_id, role)
    references org_roles(org_id, key)
    on update cascade on delete restrict;
exception when others then
  -- ignore if it already exists
  null;
end $$;

-- 3) Permission helper: has_perm(org_id, perm_key)
create or replace function has_perm(p_org_id uuid, p_perm text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (
      select (r.permissions ->> p_perm)::boolean
      from organization_users u
      join org_roles r
        on r.org_id = u.org_id and r.key = u.role
      where u.org_id = p_org_id
        and u.user_id = auth.uid()
      limit 1
    ), false
  );
$$;

grant execute on function has_perm(uuid, text) to anon, authenticated;

comment on function has_perm(uuid, text) is 'Returns true if the caller''s role grants the given permission within the org.';

-- 4) Seed default system roles for every organization
-- Permissions are flat keys for simple RLS checks.
-- Adjust defaults as needed.
with orgs as (
  select id from organizations
)
insert into org_roles (org_id, key, name, description, is_system, permissions)
select id as org_id,
       r.key,
       r.name,
       r.description,
       true as is_system,
       r.permissions::jsonb
from orgs o
cross join (
  values
  (
    'orgAdmin',
    'Organization Admin',
    'Full control of organization settings, users, and documents.',
    '{
      "org.manage_members": true,
      "org.update_settings": true,
      "security.ip_bypass": true,
      "documents.read": true,
      "documents.create": true,
      "documents.update": true,
      "documents.delete": true,
      "documents.move": true,
      "documents.link": true,
      "documents.version.manage": true,
      "documents.bulk_delete": true,
      "storage.upload": true,
      "search.semantic": true,
      "chat.save_sessions": true,
      "audit.read": true
    }'
  ),
  (
    'contentManager',
    'Content Manager',
    'Create, update, and manage documents; no org settings or user management.',
    '{
      "org.manage_members": false,
      "org.update_settings": false,
      "security.ip_bypass": false,
      "documents.read": true,
      "documents.create": true,
      "documents.update": true,
      "documents.delete": true,
      "documents.move": true,
      "documents.link": true,
      "documents.version.manage": true,
      "documents.bulk_delete": true,
      "storage.upload": true,
      "search.semantic": true,
      "chat.save_sessions": true,
      "audit.read": true
    }'
  ),
  (
    'contentViewer',
    'Content Viewer',
    'Read-only access to documents and search.',
    '{
      "org.manage_members": false,
      "org.update_settings": false,
      "security.ip_bypass": false,
      "documents.read": true,
      "documents.create": false,
      "documents.update": false,
      "documents.delete": false,
      "documents.move": false,
      "documents.link": false,
      "documents.version.manage": false,
      "documents.bulk_delete": false,
      "storage.upload": false,
      "search.semantic": true,
      "chat.save_sessions": false,
      "audit.read": true
    }'
  ),
  (
    'guest',
    'Guest',
    'Temporary, minimal read access.',
    '{
      "org.manage_members": false,
      "org.update_settings": false,
      "security.ip_bypass": false,
      "documents.read": true,
      "documents.create": false,
      "documents.update": false,
      "documents.delete": false,
      "documents.move": false,
      "documents.link": false,
      "documents.version.manage": false,
      "documents.bulk_delete": false,
      "storage.upload": false,
      "search.semantic": false,
      "chat.save_sessions": false,
      "audit.read": false
    }'
  )
) as r(key, name, description, permissions)
on conflict (org_id, key) do nothing;

-- 5) Ensure every membership refers to an existing role key
-- If a membership points to an unknown key, set to 'contentViewer' as a safe default
update organization_users u
set role = 'contentViewer'
where not exists (
  select 1 from org_roles r where r.org_id = u.org_id and r.key = u.role
);

-- 6) RLS policies for org_roles
alter table org_roles enable row level security;

-- Read roles: members only
drop policy if exists org_roles_member_read on org_roles;
create policy org_roles_member_read on org_roles
  for select using (is_member_of(org_id));

-- Write roles: org admins or holders of org.manage_members
drop policy if exists org_roles_admin_write on org_roles;
create policy org_roles_admin_write on org_roles
  for all using (
    current_org_role(org_id) = 'orgAdmin' or has_perm(org_id, 'org.manage_members')
  ) with check (
    current_org_role(org_id) = 'orgAdmin' or has_perm(org_id, 'org.manage_members')
  );

-- 7) Update core table policies to use permissions (keeps read for members)

-- Documents
drop policy if exists documents_write on documents;
drop policy if exists documents_update on documents;
drop policy if exists documents_delete on documents;
-- Keep read policy as-is (members), or switch to documents.read if desired
create policy documents_create_perm on documents for insert with check (has_perm(org_id, 'documents.create'));
create policy documents_update_perm on documents for update using (has_perm(org_id, 'documents.update'));
create policy documents_delete_perm on documents for delete using (has_perm(org_id, 'documents.delete'));

-- Document links
drop policy if exists links_write on document_links;
create policy links_write_perm on document_links for all using (has_perm(org_id, 'documents.link')) with check (has_perm(org_id, 'documents.link'));

-- Chunks
drop policy if exists chunks_write on doc_chunks;
drop policy if exists chunks_update on doc_chunks;
create policy chunks_insert_perm on doc_chunks for insert with check (has_perm(org_id, 'documents.update'));
create policy chunks_update_perm on doc_chunks for update using (has_perm(org_id, 'documents.update'));

-- Organization users (membership management)
drop policy if exists org_users_admin_write on organization_users;
create policy org_users_manage_perm on organization_users for all using (has_perm(org_id, 'org.manage_members')) with check (has_perm(org_id, 'org.manage_members'));

-- Org settings
drop policy if exists org_settings_admin_write on org_settings;
create policy org_settings_manage_perm on org_settings for all using (has_perm(org_id, 'org.update_settings')) with check (has_perm(org_id, 'org.update_settings'));

-- Audit read (optional tighten)
-- drop policy if exists audit_read on audit_events;
-- create policy audit_read_perm on audit_events for select using (has_perm(org_id, 'audit.read'));

-- 8) Storage object policies: writes require storage.upload; reads keep member visibility
-- Documents bucket write
drop policy if exists documents_obj_write on storage.objects;
create policy documents_obj_write_perm on storage.objects for insert with check (
  bucket_id = 'documents' and has_perm((substring(name from '^[^/]+')::uuid), 'storage.upload')
);

-- Previews bucket write
drop policy if exists previews_obj_write on storage.objects;
create policy previews_obj_write_perm on storage.objects for insert with check (
  bucket_id = 'previews' and has_perm((substring(name from '^[^/]+')::uuid), 'storage.upload')
);

-- Extractions bucket write
drop policy if exists extractions_obj_write on storage.objects;
create policy extractions_obj_write_perm on storage.objects for insert with check (
  bucket_id = 'extractions' and has_perm((substring(name from '^[^/]+')::uuid), 'storage.upload')
);

-- 9) Safety: prevent deletion of system role 'orgAdmin'
create or replace function prevent_delete_system_admin()
returns trigger as $$
begin
  if old.is_system and old.key = 'orgAdmin' then
    raise exception 'Cannot delete system role orgAdmin';
  end if;
  return old;
end;
$$ language plpgsql;

drop trigger if exists trg_org_roles_prevent_delete on org_roles;
create trigger trg_org_roles_prevent_delete
  before delete on org_roles
  for each row execute function prevent_delete_system_admin();

-- 10) Utility: return my permissions as jsonb map for an org
create or replace function get_my_permissions(p_org_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(r.permissions, '{}'::jsonb) from organization_users u
    join org_roles r on r.org_id = u.org_id and r.key = u.role
    where u.org_id = p_org_id and u.user_id = auth.uid()
    limit 1;
$$;

grant execute on function get_my_permissions(uuid) to anon, authenticated;

-- Done.
select 'Custom roles migration applied' as status;

