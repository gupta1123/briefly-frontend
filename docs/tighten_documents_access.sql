-- Tighten documents/chunks read access to department-only or shared folders
-- Run this after departments_schema.sql and folder_access.sql

-- Documents: drop permissive read and enforce dept/shared-only for non-admins
drop policy if exists documents_read on documents;
create policy documents_read on documents
  for select using (
    is_member_of(org_id) and (
      has_perm(org_id, 'org.manage_members') -- Admins see all
      or (
        -- Docs in caller's departments
        department_id is not null and is_dept_member(org_id, department_id)
      )
      or (
        -- Docs under a shared folder path for caller's departments
        exists (
          select 1 from folder_access fa
          where fa.org_id = documents.org_id
            and is_path_prefix(documents.folder_path, fa.path)
            and is_dept_member(documents.org_id, fa.department_id)
        )
      )
    )
  );

-- doc_chunks must follow documents_read
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

select 'tighten_documents_access applied' as status;

