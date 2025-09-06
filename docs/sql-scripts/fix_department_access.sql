-- Fix Department Access Control Issues
-- This script fixes the RLS policies and ensures proper department-based access

-- 1) First, check if the helper functions exist and work properly
-- These should already exist from departments_schema.sql

-- 2) Update the documents RLS policy to handle null department_id properly
-- The issue: current policy excludes docs with null department_id for regular users
-- The fix: allow access to docs with null department_id OR docs in user's department

drop policy if exists documents_read on documents;
create policy documents_read on documents
  for select using (
    is_member_of(org_id) and (
      -- Org admins can see all documents
      has_perm(org_id, 'org.manage_members')
      or 
      -- Regular users can see:
      -- 1. Documents in their department(s)
      -- 2. Documents with no department assigned (null department_id)
      (
        department_id is null 
        or exists (
          select 1 from department_users du 
          where du.org_id = documents.org_id 
            and du.department_id = documents.department_id 
            and du.user_id = auth.uid()
        )
      )
    )
  );

-- 3) Update write policies to be consistent
drop policy if exists documents_create_perm on documents;
create policy documents_create_perm on documents
  for insert with check (
    has_perm(org_id, 'documents.create') and (
      -- Org admins can create in any department
      has_perm(org_id, 'org.manage_members')
      or 
      -- Regular users can create in their departments or no department
      (
        department_id is null 
        or exists (
          select 1 from department_users du 
          where du.org_id = documents.org_id 
            and du.department_id = documents.department_id 
            and du.user_id = auth.uid()
        )
      )
    )
  );

drop policy if exists documents_update_perm on documents;
create policy documents_update_perm on documents
  for update using (
    has_perm(org_id, 'documents.update') and (
      -- Org admins can update any document
      has_perm(org_id, 'org.manage_members')
      or 
      -- Regular users can update docs in their departments or no department
      (
        department_id is null 
        or exists (
          select 1 from department_users du 
          where du.org_id = documents.org_id 
            and du.department_id = documents.department_id 
            and du.user_id = auth.uid()
        )
      )
    )
  );

drop policy if exists documents_delete_perm on documents;
create policy documents_delete_perm on documents
  for delete using (
    has_perm(org_id, 'documents.delete') and (
      -- Org admins can delete any document
      has_perm(org_id, 'org.manage_members')
      or 
      -- Regular users can delete docs in their departments or no department
      (
        department_id is null 
        or exists (
          select 1 from department_users du 
          where du.org_id = documents.org_id 
            and du.department_id = documents.department_id 
            and du.user_id = auth.uid()
        )
      )
    )
  );

-- 4) Update doc_chunks policies to match
drop policy if exists doc_chunks_read on doc_chunks;
create policy doc_chunks_read on doc_chunks
  for select using (
    is_member_of(org_id) and exists (
      select 1 from documents d
      where d.id = doc_chunks.doc_id
        and d.org_id = doc_chunks.org_id
        and (
          -- Org admins can see all
          has_perm(doc_chunks.org_id, 'org.manage_members')
          or 
          -- Regular users: same logic as documents
          (
            d.department_id is null 
            or exists (
              select 1 from department_users du 
              where du.org_id = d.org_id 
                and du.department_id = d.department_id 
                and du.user_id = auth.uid()
            )
          )
        )
    )
  );

-- 5) Ensure all documents have a proper department assignment
-- For organizations that haven't properly set up departments, 
-- we'll assign all null department docs to the "General" department

-- Create a function to get or create the General department for an org
create or replace function get_or_create_general_dept(p_org_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  dept_id uuid;
begin
  -- Try to find existing General department
  select id into dept_id from departments 
  where org_id = p_org_id and name = 'General' 
  limit 1;
  
  -- If not found, create it
  if dept_id is null then
    insert into departments (org_id, name) 
    values (p_org_id, 'General') 
    returning id into dept_id;
  end if;
  
  return dept_id;
end;
$$;

-- Update documents with null department_id to use General department
-- This ensures all documents are properly departmentalized
do $$
declare
  r record;
  general_dept_id uuid;
begin
  for r in select distinct org_id from documents where department_id is null loop
    general_dept_id := get_or_create_general_dept(r.org_id);
    
    update documents 
    set department_id = general_dept_id 
    where org_id = r.org_id and department_id is null;
    
    raise notice 'Updated documents in org % to use General department %', r.org_id, general_dept_id;
  end loop;
end $$;

-- 6) Create a helper view to check user department access
create or replace view v_user_department_access as
select 
  du.org_id,
  du.user_id,
  du.department_id,
  d.name as department_name,
  du.role as department_role,
  ou.role as org_role
from department_users du
join departments d on d.id = du.department_id
join organization_users ou on ou.org_id = du.org_id and ou.user_id = du.user_id;

-- Done
select 'Department access control fixed!' as status;
