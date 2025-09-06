-- Enable RLS
alter table app_users enable row level security;
alter table organizations enable row level security;
alter table organization_users enable row level security;
alter table documents enable row level security;
alter table document_links enable row level security;
alter table audit_events enable row level security;
alter table chat_sessions enable row level security;
alter table chat_messages enable row level security;
alter table doc_chunks enable row level security;

-- Basic policies
create policy app_users_self_read on app_users for select using (id = auth.uid());
create policy app_users_self_update on app_users for update using (id = auth.uid());

-- Orgs: members can read; admin can update
create policy orgs_member_read on organizations for select using (is_member_of(id));
create policy orgs_admin_update on organizations for update using (current_org_role(id) = 'orgAdmin');
create policy orgs_admin_insert on organizations for insert with check (auth.role() = 'authenticated');

-- Org users: list only own memberships; admin can insert/update
drop policy if exists org_users_member_read on organization_users;
create policy org_users_member_read on organization_users for select using (user_id = auth.uid());
drop policy if exists org_users_admin_write on organization_users;
create policy org_users_admin_write on organization_users for all using (current_org_role(org_id) = 'orgAdmin') with check (current_org_role(org_id) = 'orgAdmin');

-- Documents: org-scoped; editors: orgAdmin/contentManager; viewers: contentViewer/guest
create policy documents_read on documents for select using (is_member_of(org_id));
create policy documents_write on documents for insert with check (current_org_role(org_id) in ('orgAdmin','contentManager'));
create policy documents_update on documents for update using (current_org_role(org_id) in ('orgAdmin','contentManager'));
create policy documents_delete on documents for delete using (current_org_role(org_id) in ('orgAdmin','contentManager'));

-- Links: follow documents
create policy links_read on document_links for select using (is_member_of(org_id));
create policy links_write on document_links for all using (current_org_role(org_id) in ('orgAdmin','contentManager')) with check (current_org_role(org_id) in ('orgAdmin','contentManager'));

-- Audit: members read; writers are server or user actions; include login events
create policy audit_read on audit_events for select using (is_member_of(org_id));
create policy audit_insert on audit_events for insert with check (is_member_of(org_id));

-- Chat: default not saved → no automatic insert. Only when client asks to save, API will insert rows.
-- Policies still enforce org membership.
create policy chat_sessions_rw on chat_sessions for all using (is_member_of(org_id)) with check (is_member_of(org_id));
create policy chat_messages_rw on chat_messages for all using (is_member_of(org_id)) with check (is_member_of(org_id));

-- Chunks: readable to org members; writable by managers/admins
create policy chunks_read on doc_chunks for select using (is_member_of(org_id));
create policy chunks_write on doc_chunks for insert with check (current_org_role(org_id) in ('orgAdmin','contentManager'));
create policy chunks_update on doc_chunks for update using (current_org_role(org_id) in ('orgAdmin','contentManager'));

-- Storage buckets: expect you to create buckets `documents`, `previews`, `extractions` in Supabase.
-- Use object keys prefixed by org_id to enforce org scoping in policies.

-- Documents bucket policies
create policy documents_obj_read on storage.objects for select using (
  bucket_id = 'documents' and is_member_of((substring(name from '^[^/]+')::uuid))
);
create policy documents_obj_write on storage.objects for insert with check (
  bucket_id = 'documents' and current_org_role((substring(name from '^[^/]+')::uuid)) in ('orgAdmin','contentManager')
);

-- Previews bucket policies
create policy previews_obj_read on storage.objects for select using (
  bucket_id = 'previews' and is_member_of((substring(name from '^[^/]+')::uuid))
);
create policy previews_obj_write on storage.objects for insert with check (
  bucket_id = 'previews' and current_org_role((substring(name from '^[^/]+')::uuid)) in ('orgAdmin','contentManager')
);

-- Extractions bucket policies
create policy extractions_obj_read on storage.objects for select using (
  bucket_id = 'extractions' and is_member_of((substring(name from '^[^/]+')::uuid))
);
create policy extractions_obj_write on storage.objects for insert with check (
  bucket_id = 'extractions' and current_org_role((substring(name from '^[^/]+')::uuid)) in ('orgAdmin','contentManager')
);