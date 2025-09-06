-- 03_reset_policies_drop_all.sql
-- Drops ALL policies on key tables (public + storage.objects) and ensures RLS is enabled.
-- Run during a quiet window. No data loss.

do $$
declare r record;
begin
  for r in
    select n.nspname as sch, c.relname as tbl, p.polname
    from pg_policy p
    join pg_class c     on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where (n.nspname = 'public' and c.relname in (
             'app_users','organizations','organization_users','org_roles',
             'org_settings','user_settings',
             'documents','document_links','doc_chunks','audit_events',
             'departments','department_users','user_access_overrides'
           ))
       or (n.nspname = 'storage' and c.relname = 'objects')
  loop
    execute format('drop policy if exists %I on %I.%I', r.polname, r.sch, r.tbl);
  end loop;
end $$;

-- Re-enable RLS (idempotent)
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
alter table storage.objects enable row level security;

