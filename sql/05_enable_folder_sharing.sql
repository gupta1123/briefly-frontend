-- 05_enable_folder_sharing.sql
-- Enable folder/subfolder sharing across departments and align document/chunk RLS accordingly.
-- Safe to run multiple times.

-- Drop then recreate to avoid parameter-name mismatch errors
drop function if exists is_path_prefix(text[], text[]);
create or replace function is_path_prefix(doc_path text[], access_path text[])
returns boolean language sql immutable as $$
  select coalesce(doc_path[1:array_length(access_path,1)] = access_path, false)
$$;

-- 2) Folder access mapping table
create table if not exists folder_access (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  path text[] not null,
  department_id uuid not null references departments(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, path, department_id)
);

create index if not exists idx_folder_access_org on folder_access(org_id);
create index if not exists idx_folder_access_dept on folder_access(department_id);

-- updated_at trigger
do $$
begin
  perform 1 from pg_proc where proname = 'update_updated_at_column';
  if found then
    drop trigger if exists trg_folder_access_updated on folder_access;
    create trigger trg_folder_access_updated before update on folder_access
      for each row execute function update_updated_at_column();
  end if;
end $$;

-- 3) RLS for folder_access: restrict to admins or department leads
alter table folder_access enable row level security;

drop policy if exists folder_access_read on folder_access;
create policy folder_access_read on folder_access
  for select using (
    has_perm(org_id, 'org.update_settings')
    or is_dept_lead(org_id, department_id)
  );

drop policy if exists folder_access_manage on folder_access;
create policy folder_access_manage on folder_access
  for all using (
    has_perm(org_id, 'org.update_settings')
    or is_dept_lead(org_id, department_id)
  ) with check (
    has_perm(org_id, 'org.update_settings')
    or is_dept_lead(org_id, department_id)
  );

-- 4) Update documents/chunks to honor shared folders
-- Recreate policies to include shared-folder clause for non-admins

drop policy if exists documents_read on documents;
create policy documents_read on documents
  for select using (
    is_member_of(org_id) and (
      has_perm(org_id, 'org.manage_members')
      or (department_id is not null and is_dept_member(org_id, department_id))
      or exists (
        select 1 from folder_access fa
        where fa.org_id = documents.org_id
          and is_path_prefix(documents.folder_path, fa.path)
          and is_dept_member(documents.org_id, fa.department_id)
      )
    )
  );

drop policy if exists documents_update_perm on documents;
create policy documents_update_perm on documents
  for update using (
    has_perm(org_id, 'documents.update') and (
      has_perm(org_id, 'org.manage_members')
      or (department_id is not null and is_dept_member(org_id, department_id))
      or exists (
        select 1 from folder_access fa
        where fa.org_id = documents.org_id
          and is_path_prefix(documents.folder_path, fa.path)
          and is_dept_member(documents.org_id, fa.department_id)
      )
    )
  ) with check (
    has_perm(org_id, 'documents.update') and (
      has_perm(org_id, 'org.manage_members')
      or (department_id is not null and is_dept_member(org_id, department_id))
      or exists (
        select 1 from folder_access fa
        where fa.org_id = documents.org_id
          and is_path_prefix(documents.folder_path, fa.path)
          and is_dept_member(documents.org_id, fa.department_id)
      )
    )
  );

drop policy if exists documents_delete_perm on documents;
create policy documents_delete_perm on documents
  for delete using (
    has_perm(org_id, 'documents.delete') and (
      has_perm(org_id, 'org.manage_members')
      or (department_id is not null and is_dept_member(org_id, department_id))
      or exists (
        select 1 from folder_access fa
        where fa.org_id = documents.org_id
          and is_path_prefix(documents.folder_path, fa.path)
          and is_dept_member(documents.org_id, fa.department_id)
      )
    )
  );

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
          or exists (
            select 1 from folder_access fa
            where fa.org_id = d.org_id
              and is_path_prefix(d.folder_path, fa.path)
              and is_dept_member(d.org_id, fa.department_id)
          )
        )
    )
  );

select 'folder sharing enabled' as status;
