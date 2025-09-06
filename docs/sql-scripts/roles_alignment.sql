-- Roles Alignment: Admin, Team Lead, Member, Guest
-- Applies per-organization role updates and audit RLS to support department-scoped leads.

-- 0) Preconditions: helper functions
-- assumes: current_org_role(uuid), is_member_of(uuid), is_dept_lead(uuid, uuid)
-- assumes: has_perm(uuid,text) exists; if not, recreate
create or replace function has_perm(p_org_id uuid, p_perm text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((
    select (r.permissions ->> p_perm)::boolean
    from organization_users u
    join org_roles r on r.org_id = u.org_id and r.key = u.role
    where u.org_id = p_org_id and u.user_id = auth.uid()
    limit 1
  ), false);
$$;

-- 1) Upsert new role keys per org: teamLead, member (idempotent)
with orgs as (
  select id as org_id from organizations
)
insert into org_roles (org_id, key, name, description, is_system, permissions)
select org_id, 'teamLead', 'Team Lead', 'Department lead with department-scoped powers', true,
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
    "documents.bulk_delete": false,
    "storage.upload": true,
    "search.semantic": true,
    "chat.save_sessions": false,
    "audit.read": true
  }'::jsonb
from orgs
on conflict (org_id, key) do nothing;

with orgs as (
  select id as org_id from organizations
)
insert into org_roles (org_id, key, name, description, is_system, permissions)
select org_id, 'member', 'Member', 'Department member with full document capabilities within team', true,
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
    "documents.bulk_delete": false,
    "storage.upload": true,
    "search.semantic": true,
    "chat.save_sessions": false,
    "audit.read": false
  }'::jsonb
from orgs
on conflict (org_id, key) do nothing;

-- 2) Migrate existing memberships to new roles (idempotent semantics)
-- Keep orgAdmin as is. If a user is a department lead, set teamLead (unless orgAdmin).
-- Map contentManager/contentViewer -> member. Keep guest as guest. Leave custom roles untouched.
do $$
begin
  -- teamLead assignment for department leads (skip orgAdmin)
  update organization_users u
  set role = 'teamLead'
  where role <> 'orgAdmin'
    and exists (
      select 1 from department_users du
      where du.org_id = u.org_id and du.user_id = u.user_id and du.role = 'lead'
    )
    and exists (
      select 1 from org_roles r where r.org_id = u.org_id and r.key = 'teamLead'
    );

  -- contentManager/contentViewer -> member
  update organization_users u
  set role = 'member'
  where role in ('contentManager','contentViewer')
    and exists (
      select 1 from org_roles r where r.org_id = u.org_id and r.key = 'member'
    );
end $$;

-- 3) Audit RLS: allow teamLead to view doc-linked events for departments they lead; keep login-only admin-only
alter table audit_events enable row level security;

-- Clean up any prior audit policies that may grant over-broad access
drop policy if exists audit_read on audit_events;
drop policy if exists audit_read_admin on audit_events;
drop policy if exists audit_read_dept_lead_docs on audit_events;
drop policy if exists audit_read_dept_lead_login on audit_events;
drop policy if exists audit_events_read on audit_events;

-- Admin (or any role with audit.read) sees org-wide audit
create policy audit_read_admin on audit_events
  for select using (
    has_perm(org_id, 'audit.read')
  );

-- Dept leads: see audit rows linked to documents in their departments
create policy audit_read_dept_lead_docs on audit_events
  for select using (
    doc_id is not null and exists (
      select 1
      from documents d
      join department_users du
        on du.org_id = d.org_id
       and du.department_id = d.department_id
       and du.user_id = auth.uid()
       and du.role = 'lead'
      where d.id = audit_events.doc_id
        and d.org_id = audit_events.org_id
    )
  );

-- Dept leads: see login events for actors in their departments
create policy audit_read_dept_lead_login on audit_events
  for select using (
    audit_events.type = 'login' and exists (
      select 1
      from department_users du
      where du.org_id = audit_events.org_id
        and du.user_id = audit_events.actor_user_id
        and exists (
          select 1 from department_users me
          where me.org_id = audit_events.org_id
            and me.department_id = du.department_id
            and me.user_id = auth.uid()
            and me.role = 'lead'
        )
    )
  );

select 'roles_alignment applied' as status;
