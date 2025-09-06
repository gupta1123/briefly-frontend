-- 04b_reset_policies_create_public_only.sql
-- Recreate a clean, consistent policy set for Briefly (public schema only).
-- Assumes helper functions exist: current_org_role, is_member_of, has_perm, is_dept_member, is_dept_lead.

-- App users
create policy app_users_self_read   on app_users for select using (id = auth.uid());
create policy app_users_self_update on app_users for update using (id = auth.uid()) with check (id = auth.uid());

-- Organizations
create policy orgs_member_read  on organizations for select using (is_member_of(id));
create policy orgs_admin_update on organizations for update using (current_org_role(id) = 'orgAdmin');
create policy orgs_admin_insert on organizations for insert with check (auth.role() = 'authenticated');

-- Org roles
create policy org_roles_member_read on org_roles for select using (is_member_of(org_id));
create policy org_roles_admin_write on org_roles for all using (
  current_org_role(org_id) = 'orgAdmin' or has_perm(org_id, 'org.manage_members')
) with check (
  current_org_role(org_id) = 'orgAdmin' or has_perm(org_id, 'org.manage_members')
);

-- Org settings & user settings
create policy org_settings_member_read on org_settings for select using (is_member_of(org_id));
create policy org_settings_manage_perm on org_settings for all using (has_perm(org_id, 'org.update_settings')) with check (has_perm(org_id, 'org.update_settings'));

create policy user_settings_self_read  on user_settings for select using (user_id = auth.uid());
create policy user_settings_self_write on user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Organization users (membership)
create policy org_users_member_read on organization_users for select using (user_id = auth.uid());
create policy org_users_admin_read  on organization_users for select using (current_org_role(org_id) = 'orgAdmin');
create policy org_users_manage_perm on organization_users for all using (has_perm(org_id, 'org.manage_members')) with check (has_perm(org_id, 'org.manage_members'));

-- Departments
create policy departments_read        on departments for select using (is_member_of(org_id));
create policy departments_admin_write on departments for all using (has_perm(org_id, 'org.update_settings')) with check (has_perm(org_id, 'org.update_settings'));

-- Department users
create policy department_users_read on department_users
  for select using (is_member_of(org_id));

create policy department_users_manage on department_users
  for all using (
    has_perm(org_id, 'org.manage_members')
    or is_dept_lead(org_id, department_id)
  ) with check (
    has_perm(org_id, 'org.manage_members')
    or is_dept_lead(org_id, department_id)
  );

-- User access overrides
create policy overrides_read on user_access_overrides
  for select using (
    (user_id = auth.uid() and is_member_of(org_id))
    or has_perm(org_id, 'org.manage_members')
    or (department_id is not null and is_dept_lead(org_id, department_id))
  );

create policy overrides_write on user_access_overrides
  for all using (
    has_perm(org_id, 'org.manage_members')
    or (department_id is not null and is_dept_lead(org_id, department_id))
  ) with check (
    has_perm(org_id, 'org.manage_members')
    or (department_id is not null and is_dept_lead(org_id, department_id))
  );

-- Documents
create policy documents_read on documents
  for select using (
    is_member_of(org_id) and (
      has_perm(org_id, 'org.manage_members')
      or (department_id is not null and is_dept_member(org_id, department_id))
    )
  );

create policy documents_create_perm on documents
  for insert with check (
    has_perm(org_id, 'documents.create') and (
      has_perm(org_id, 'org.manage_members')
      or (department_id is not null and is_dept_member(org_id, department_id))
    )
  );

create policy documents_update_perm on documents
  for update using (
    has_perm(org_id, 'documents.update') and (
      has_perm(org_id, 'org.manage_members')
      or (department_id is not null and is_dept_member(org_id, department_id))
    )
  ) with check (
    has_perm(org_id, 'documents.update') and (
      has_perm(org_id, 'org.manage_members')
      or (department_id is not null and is_dept_member(org_id, department_id))
    )
  );

create policy documents_delete_perm on documents
  for delete using (
    has_perm(org_id, 'documents.delete') and (
      has_perm(org_id, 'org.manage_members')
      or (department_id is not null and is_dept_member(org_id, department_id))
    )
  );

-- Document links
create policy links_read on document_links for select using (is_member_of(org_id));
create policy links_write_perm on document_links for all using (has_perm(org_id, 'documents.link')) with check (has_perm(org_id, 'documents.link'));

-- Doc chunks (align with allowed documents)
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

create policy chunks_insert_perm on doc_chunks for insert with check (has_perm(org_id, 'documents.update'));
create policy chunks_update_perm on doc_chunks for update using      (has_perm(org_id, 'documents.update'));

-- Audit events
create policy audit_insert on audit_events
  for insert with check (is_member_of(org_id));

create policy audit_events_read on audit_events
  for select using (
    is_member_of(org_id) and (
      has_perm(org_id, 'audit.read')
      or (
        doc_id is not null and exists (
          select 1 from documents d
          join department_users du
            on du.org_id = d.org_id
           and du.department_id = d.department_id
           and du.user_id = auth.uid()
           and du.role = 'lead'
          where d.id = audit_events.doc_id
            and d.org_id = audit_events.org_id
        )
      )
      or (
        type = 'login' and exists (
          select 1
          from department_users me
          join department_users du
            on du.org_id = me.org_id
           and du.department_id = me.department_id
           and du.user_id = audit_events.actor_user_id
          where me.org_id = audit_events.org_id
            and me.user_id = auth.uid()
            and me.role = 'lead'
        )
      )
    )
  );

