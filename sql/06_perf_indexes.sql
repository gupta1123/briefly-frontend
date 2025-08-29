-- 06_perf_indexes.sql
-- Idempotent performance indexes for common query patterns.

-- Organization users
create index if not exists idx_org_users_user on organization_users(user_id);
create index if not exists idx_org_users_org_role on organization_users(org_id, role);

-- Department users
create index if not exists idx_department_users_org_dept on department_users(org_id, department_id);

-- Documents
create index if not exists idx_documents_org_dept on documents(org_id, department_id);
create index if not exists idx_documents_org_dept_uploaded_at on documents(org_id, department_id, uploaded_at desc);
create index if not exists idx_documents_org_type on documents(org_id, type);
create index if not exists idx_documents_org_uploaded_at on documents(org_id, uploaded_at desc);
-- Text search/trigram helpers (if not already applied)
create index if not exists idx_documents_title_search on documents using gin (to_tsvector('english', coalesce(title,'')));
create index if not exists idx_documents_subject_search on documents using gin (to_tsvector('english', coalesce(subject,'')));
create index if not exists idx_documents_description_search on documents using gin (to_tsvector('english', coalesce(description,'')));

-- Document links reverse lookups
create index if not exists idx_document_links_linked on document_links(linked_doc_id);

-- Folder access lookups by (org_id, path)
create index if not exists idx_folder_access_org_path on folder_access(org_id, path);

-- Optional: Keyset pagination helper on uploaded_at,id
create index if not exists idx_documents_org_uploaded_keyset on documents(org_id, uploaded_at desc, id);

select 'perf indexes ensured' as status;

