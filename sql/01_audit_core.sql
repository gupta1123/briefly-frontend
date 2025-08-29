-- 01_audit_core.sql
-- Snapshot current RLS, policies, duplicates, helper functions, triggers, and org snapshots.

-- 1) RLS status for key tables (public + storage.objects)
select
  n.nspname as sch,
  c.relname as tbl,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and (
    (n.nspname = 'public' and c.relname in (
      'app_users','organizations','organization_users','org_roles',
      'org_settings','user_settings',
      'documents','document_links','doc_chunks','audit_events',
      'departments','department_users','user_access_overrides'
    ))
    or (n.nspname = 'storage' and c.relname = 'objects')
  )
order by sch, tbl;

-- 2) Full policies (USING / WITH CHECK)
with p as (
  select
    n.nspname as sch,
    c.relname  as tbl,
    pol.polname,
    pol.polcmd,
    case when pol.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end as mode,
    pg_get_expr(pol.polqual, pol.polrelid)      as using_expr,
    pg_get_expr(pol.polwithcheck, pol.polrelid) as with_check_expr
  from pg_policy pol
  join pg_class c     on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where (n.nspname = 'public' and c.relname in (
           'app_users','organizations','organization_users','org_roles',
           'org_settings','user_settings',
           'documents','document_links','doc_chunks','audit_events',
           'departments','department_users','user_access_overrides'
         ))
     or (n.nspname = 'storage' and c.relname = 'objects')
)
select * from p
order by sch, tbl, polcmd, polname;

-- 3) Duplicate policy summary
with p as (
  select
    n.nspname as sch,
    c.relname  as tbl,
    pol.polname,
    pol.polcmd
  from pg_policy pol
  join pg_class c     on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where (n.nspname = 'public' and c.relname in (
           'app_users','organizations','organization_users','org_roles',
           'org_settings','user_settings',
           'documents','document_links','doc_chunks','audit_events',
           'departments','department_users','user_access_overrides'
         ))
     or (n.nspname = 'storage' and c.relname = 'objects')
)
select sch, tbl, polcmd, count(*) as policy_count, array_agg(polname order by polname) as policy_names
from p
group by sch, tbl, polcmd
having count(*) > 1
order by sch, tbl, polcmd;

-- 4) Helper functions used by policies
select p.proname,
       p.prosecdef as security_definer,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'current_org_role','is_member_of','has_perm','has_perm_dept',
    'is_dept_member','is_dept_lead','get_my_permissions','can_access_audit'
  )
order by p.proname;

-- 5) Triggers on key tables
select
  n.nspname as sch,
  c.relname  as tbl,
  t.tgname   as trg,
  pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c     on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'org_roles','departments','user_access_overrides','documents','doc_chunks',
    'organization_users','org_settings','user_settings'
  )
  and not t.tgisinternal
order by sch, tbl, trg;

-- 6) Constraints overview for key tables
select conname,
       contype,
       conrelid::regclass as table_name,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid::regclass::text in (
  'organization_users','org_roles','departments','department_users',
  'user_access_overrides','documents','document_links','doc_chunks',
  'org_settings','user_settings','audit_events'
)
order by conrelid::regclass::text, conname;

-- 7) Role catalog per org
select org_id,
       count(*) as role_count,
       array_agg(key order by key) as role_keys
from org_roles
group by org_id
order by role_count desc;

-- 8) Role definitions for all orgs (may be verbose)
select org_id, key, is_system, jsonb_pretty(permissions) as permissions
from org_roles
order by org_id, is_system desc, key;

-- 9) Membership distribution per org
select org_id, role, count(*) as users
from organization_users
group by org_id, role
order by org_id, role;

-- 10) Departments + member/lead counts per org
select d.org_id, d.id, d.name, d.color,
       count(du.user_id) as member_count,
       sum(case when du.role = 'lead' then 1 else 0 end) as lead_count
from departments d
left join department_users du
  on du.department_id = d.id and du.org_id = d.org_id
group by d.org_id, d.id, d.name, d.color
order by d.org_id, d.name;

-- 11) Documents per department per org
select d.org_id, d.department_id,
       coalesce(dep.name, '(unassigned)') as department_name,
       count(*) as document_count
from documents d
left join departments dep
  on dep.id = d.department_id and dep.org_id = d.org_id
group by d.org_id, d.department_id, dep.name
order by d.org_id, document_count desc;

-- 12) Overrides summary per org
select org_id,
       count(*) as total_overrides,
       sum((department_id is null)::int) as org_wide_overrides,
       sum((department_id is not null)::int) as department_overrides
from user_access_overrides
group by org_id
order by org_id;

