-- Role/Access Hardening for Briefly

-- 0) Helpers (idempotent)
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

create or replace function get_my_permissions(p_org_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(r.permissions, '{}'::jsonb)
  from organization_users u
  join org_roles r on r.org_id = u.org_id and r.key = u.role
  where u.org_id = p_org_id and u.user_id = auth.uid()
  limit 1;
$$;

-- 1) Update existing role permissions so only Admins can read audit
update org_roles
set permissions = jsonb_set(permissions, '{audit.read}', 'false'::jsonb, true)
where key in ('contentManager','contentViewer','guest');

update org_roles
set permissions = jsonb_set(permissions, '{audit.read}', 'true'::jsonb, true)
where key = 'orgAdmin';

-- 2) Departments visibility: only admins or members of that department
alter table departments enable row level security;

drop policy if exists departments_read on departments;
create policy departments_read on departments
  for select using (
    current_org_role(org_id) = 'orgAdmin'
    or exists (
      select 1 from department_users du
      where du.org_id = departments.org_id
        and du.department_id = departments.id
        and du.user_id = auth.uid()
    )
  );

-- 3) Department membership visibility
alter table department_users enable row level security;

drop policy if exists department_users_read on department_users;
create policy department_users_read on department_users
  for select using (
    current_org_role(org_id) = 'orgAdmin'
    or (role = 'lead' and user_id = auth.uid())
    or user_id = auth.uid()
    or exists (
      select 1 from department_users me
      where me.org_id = department_users.org_id
        and me.department_id = department_users.department_id
        and me.user_id = auth.uid()
        and me.role = 'lead'
    )
  );

drop policy if exists department_users_manage on department_users;
create policy department_users_manage on department_users
  for all using (
    has_perm(org_id, 'org.manage_members')
    or exists (
      select 1 from department_users me
      where me.org_id = department_users.org_id
        and me.department_id = department_users.department_id
        and me.user_id = auth.uid()
        and me.role = 'lead'
    )
  )
  with check (
    has_perm(org_id, 'org.manage_members')
    or exists (
      select 1 from department_users me
      where me.org_id = department_users.org_id
        and me.department_id = department_users.department_id
        and me.user_id = auth.uid()
        and me.role = 'lead'
    )
  );

-- 4) Audit events: require audit.read
alter table audit_events enable row level security;

drop policy if exists audit_read on audit_events;
create policy audit_read on audit_events
  for select using (has_perm(org_id, 'audit.read'));

-- 5) Folder access table: admin‑only read and write
alter table folder_access enable row level security;

drop policy if exists folder_access_read on folder_access;
create policy folder_access_read on folder_access
  for select using (has_perm(org_id, 'org.update_settings'));

drop policy if exists folder_access_manage on folder_access;
create policy folder_access_manage on folder_access
  for all using (has_perm(org_id, 'org.update_settings'))
  with check (has_perm(org_id, 'org.update_settings'));

-- 6) Ensure department/folder sharing policies are applied from departments_schema.sql and folder_access.sql

select 'role_access_hardening applied' as status;

