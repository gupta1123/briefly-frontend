-- 03b_reset_policies_drop_public_only.sql
-- Drops ALL policies on key tables in the public schema only (skips storage.objects).
-- Run this if you see: ERROR: must be owner of table objects

do $$
declare r record;
begin
  for r in
    select n.nspname as sch, c.relname as tbl, p.polname
    from pg_policy p
    join pg_class c     on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'app_users','organizations','organization_users','org_roles',
        'org_settings','user_settings',
        'documents','document_links','doc_chunks','audit_events',
        'departments','department_users','user_access_overrides'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', r.polname, r.sch, r.tbl);
  end loop;
end $$;

-- Re-enable RLS (idempotent) for public tables
alter table app_users enable row level security;
alter table organizations enable row level security;
alter table organization_users enable row level security;
alter table org_roles enable row level security;
alter table org_settings enable row level security;
alter table user_settings enable row level security;
alter table documents enable row level security;
alter table document_links enable row level security;
alter table doc_chunks enable row level security;
alter table audit_events enable row level security;
alter table departments enable row level security;
alter table department_users enable row level security;
alter table user_access_overrides enable row level security;

