-- Departments & Department Access Control
-- Safe to run multiple times (IF NOT EXISTS, idempotent seeds)

-- 0) Prereqs
create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

-- 1) Departments (per org)
create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  lead_user_id uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);

create index if not exists idx_departments_org on departments(org_id);

-- 2) Department members (role within dept)
create table if not exists department_users (
  org_id uuid not null references organizations(id) on delete cascade,
  department_id uuid not null references departments(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  role text not null check (role in ('lead','member')),
  created_at timestamptz not null default now(),
  primary key (department_id, user_id)
);

create index if not exists idx_department_users_org on department_users(org_id);
create index if not exists idx_department_users_user on department_users(user_id);

-- 3) Per-user access overrides (org-wide or dept-specific)
create table if not exists user_access_overrides (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  department_id uuid references departments(id) on delete cascade, -- nullable: org-wide override when null
  permissions jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id, department_id)
);

-- 4) updated_at trigger
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end; $$ language plpgsql;

drop trigger if exists trg_departments_updated on departments;
create trigger trg_departments_updated before update on departments
  for each row execute function update_updated_at_column();

drop trigger if exists trg_user_access_overrides_updated on user_access_overrides;
create trigger trg_user_access_overrides_updated before update on user_access_overrides
  for each row execute function update_updated_at_column();

-- 5) Helper functions

-- Is user a member of department?
create or replace function is_dept_member(p_org_id uuid, p_dept_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1 from department_users du
    where du.org_id = p_org_id
      and du.department_id = p_dept_id
      and du.user_id = auth.uid()
  );
$$;

-- Is user a lead of department?
create or replace function is_dept_lead(p_org_id uuid, p_dept_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1 from department_users du
    where du.org_id = p_org_id
      and du.department_id = p_dept_id
      and du.user_id = auth.uid()
      and du.role = 'lead'
  );
$$;

-- Return effective permission boolean with override precedence:
-- dept_override > org_override > role permissions
create or replace function has_perm_dept(p_org_id uuid, p_dept_id uuid, p_perm text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_role_perms jsonb := '{}'::jsonb;
  v_org_override jsonb := '{}'::jsonb;
  v_dept_override jsonb := '{}'::jsonb;
  v_val text;
begin
  select role into v_role from organization_users
   where org_id = p_org_id and user_id = auth.uid();

  if v_role is not null then
    select permissions into v_role_perms from org_roles
      where org_id = p_org_id and key = v_role;
  end if;

  select permissions into v_org_override
    from user_access_overrides
    where org_id = p_org_id and user_id = auth.uid() and department_id is null
    limit 1;

  if p_dept_id is not null then
    select permissions into v_dept_override
      from user_access_overrides
      where org_id = p_org_id and user_id = auth.uid() and department_id = p_dept_id
      limit 1;
  end if;

  v_val := coalesce(
    (v_dept_override ->> p_perm),
    (v_org_override  ->> p_perm),
    (v_role_perms    ->> p_perm),
    'false'
  );
  return v_val::boolean;
end;
$$;

grant execute on function is_dept_member(uuid, uuid) to anon, authenticated;
grant execute on function is_dept_lead(uuid, uuid) to anon, authenticated;
grant execute on function has_perm_dept(uuid, uuid, text) to anon, authenticated;

-- 6) Attach departments to documents
-- Step A: add nullable column
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'documents' and column_name = 'department_id'
  ) then
    alter table documents add column department_id uuid references departments(id) on delete set null;
  end if;
end $$;

-- Step B: seed a default department per org and backfill existing documents
do $$
declare
  r record;
  dept_id uuid;
begin
  for r in select distinct org_id from documents loop
    -- create 'General' department if not exists
    insert into departments(org_id, name)
    values (r.org_id, 'General')
    on conflict (org_id, name) do nothing;

    select id into dept_id from departments where org_id = r.org_id and name = 'General' limit 1;

    -- backfill documents without department
    update documents set department_id = dept_id
      where org_id = r.org_id and (department_id is null);
  end loop;
end $$;

-- Optionally enforce NOT NULL after backfill
-- alter table documents alter column department_id set not null;

-- 7) RLS for new tables
alter table departments enable row level security;
alter table department_users enable row level security;
alter table user_access_overrides enable row level security;

-- Departments: members read; org admins manage; leads can update their own dept (name/lead restricted to admins)
drop policy if exists departments_read on departments;
create policy departments_read on departments
  for select using (is_member_of(org_id));

drop policy if exists departments_admin_write on departments;
create policy departments_admin_write on departments
  for all using (has_perm(org_id, 'org.update_settings')) with check (has_perm(org_id, 'org.update_settings'));

-- Department users: read members; write by org admins or the department lead
drop policy if exists department_users_read on department_users;
create policy department_users_read on department_users
  for select using (is_member_of(org_id));

drop policy if exists department_users_manage on department_users;
create policy department_users_manage on department_users
  for all using (
    has_perm(org_id, 'org.manage_members')
    or is_dept_lead(org_id, department_id)
  )
  with check (
    has_perm(org_id, 'org.manage_members')
    or is_dept_lead(org_id, department_id)
  );

-- Overrides: members can read their own overrides; admins read all; dept leads read/write overrides within their dept
drop policy if exists overrides_self_read on user_access_overrides;
create policy overrides_self_read on user_access_overrides
  for select using (
    (user_id = auth.uid() and is_member_of(org_id))
    or has_perm(org_id, 'org.manage_members')
    or (department_id is not null and is_dept_lead(org_id, department_id))
  );

drop policy if exists overrides_write on user_access_overrides;
create policy overrides_write on user_access_overrides
  for all using (
    has_perm(org_id, 'org.manage_members')
    or (department_id is not null and is_dept_lead(org_id, department_id))
  )
  with check (
    has_perm(org_id, 'org.manage_members')
    or (department_id is not null and is_dept_lead(org_id, department_id))
  );

-- 8) Documents/doc_chunks RLS tightened to departments
-- Documents: members can read only their dept; org admins can read all
drop policy if exists documents_read on documents;
create policy documents_read on documents
  for select using (
    is_member_of(org_id) and (
      has_perm(org_id, 'org.manage_members')
      or (department_id is not null and is_dept_member(org_id, department_id))
    )
  );

-- Writes: must have write perms and belong to the doc's department unless admin
drop policy if exists documents_create_perm on documents;
create policy documents_create_perm on documents
  for insert with check (
    has_perm(org_id, 'documents.create') and (
      has_perm(org_id, 'org.manage_members')
      or (department_id is not null and is_dept_member(org_id, department_id))
    )
  );

drop policy if exists documents_update_perm on documents;
create policy documents_update_perm on documents
  for update using (
    has_perm(org_id, 'documents.update') and (
      has_perm(org_id, 'org.manage_members')
      or (department_id is not null and is_dept_member(org_id, department_id))
    )
  );

drop policy if exists documents_delete_perm on documents;
create policy documents_delete_perm on documents
  for delete using (
    has_perm(org_id, 'documents.delete') and (
      has_perm(org_id, 'org.manage_members')
      or (department_id is not null and is_dept_member(org_id, department_id))
    )
  );

-- doc_chunks read must align with allowed documents
drop policy if exists doc_chunks_read on doc_chunks;
create policy doc_chunks_read on doc_chunks
  for select using (
    is_member_of(org_id) and exists (
      select 1 from documents d
      where d.id = doc_chunks.doc_id
        and d.org_id = doc_chunks.org_id
        and (
          has_perm(doc_chunks.org_id, 'org.manage_members')
          or (d.department_id is not null and is_dept_member(doc_chunks.org_id, d.department_id))
        )
    )
  );

-- doc_chunks insert/update: same as documents.update
drop policy if exists chunks_insert_perm on doc_chunks;
create policy chunks_insert_perm on doc_chunks
  for insert with check (
    has_perm(org_id, 'documents.update')
  );

drop policy if exists chunks_update_perm on doc_chunks;
create policy chunks_update_perm on doc_chunks
  for update using (
    has_perm(org_id, 'documents.update')
  );

-- 9) (Optional) Department-scoped audit view to simplify backend
create or replace view v_audit_with_dept as
select a.*, d.department_id
from audit_events a
left join documents d on d.id = a.doc_id;

-- Done
select 'departments_schema applied' as status;

