-- Folder Sharing and Department Color
-- Run this after existing departments_schema.sql

-- 1) Add color to departments
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'departments' and column_name = 'color'
  ) then
    alter table departments add column color text check (color in (
      'default','red','rose','orange','amber','yellow','lime','green','emerald','teal','cyan','sky','blue','indigo','violet','purple','fuchsia','pink'
    ));
  end if;
end $$;

-- 2) Folder access mapping (share folder paths with multiple departments)
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
drop trigger if exists trg_folder_access_updated on folder_access;
create trigger trg_folder_access_updated before update on folder_access
  for each row execute function update_updated_at_column();

-- 3) Helper: is path prefix
create or replace function is_path_prefix(doc_path text[], prefix text[])
returns boolean language sql immutable as $$
  select coalesce(doc_path[1:array_length(prefix,1)] = prefix, false)
$$;

-- 4) RLS for folder_access
alter table folder_access enable row level security;

drop policy if exists folder_access_read on folder_access;
create policy folder_access_read on folder_access
  for select using (is_member_of(org_id));

drop policy if exists folder_access_manage on folder_access;
create policy folder_access_manage on folder_access
  for all using (
    has_perm(org_id, 'org.update_settings')
    or is_dept_lead(org_id, department_id)
  )
  with check (
    has_perm(org_id, 'org.update_settings')
    or is_dept_lead(org_id, department_id)
  );

-- 5) Expand documents and doc_chunks policies to honor shared folders
-- Allow read/update/delete when doc lies under a shared path of a department the user belongs to

-- READ
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

-- UPDATE
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
  );

-- DELETE
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

-- doc_chunks read should align with documents_read
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

select 'folder_access applied' as status;

