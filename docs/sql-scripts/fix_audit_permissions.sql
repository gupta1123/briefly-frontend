-- Fix audit permissions to ensure only admins and department leads can access

-- 1) Update role permissions: orgAdmin and contentManager should have audit.read
update org_roles
set permissions = jsonb_set(permissions, '{audit.read}', 'true'::jsonb, true)
where key in ('orgAdmin', 'contentManager');

-- 2) Ensure other roles cannot access audit
update org_roles
set permissions = jsonb_set(permissions, '{audit.read}', 'false'::jsonb, true)
where key in ('contentViewer', 'guest');

-- 3) Update the can_access_audit function to be more explicit
create or replace function can_access_audit(p_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select (
    -- Org admins and content managers can access audit
    has_perm(p_org_id, 'audit.read')
    or
    -- Department leads can access audit for their teams
    exists (
      select 1 from department_users du
      where du.org_id = p_org_id
        and du.user_id = auth.uid()
        and du.role = 'lead'
    )
  );
$$;

-- 4) Update the audit events RLS policy to be more restrictive
drop policy if exists audit_events_read on audit_events;
create policy audit_events_read on audit_events
  for select using (
    -- Must be a member of the organization first
    is_member_of(org_id) and (
      -- Org admins and content managers see all audit events
      has_perm(org_id, 'audit.read')
      or
      -- Department leads see events for their departments only
      (
        -- User must be a department lead
        exists (
          select 1 from department_users du
          where du.org_id = audit_events.org_id
            and du.user_id = auth.uid()
            and du.role = 'lead'
        )
        and (
          -- Events with no document (like login) - show for dept leads
          doc_id is null
          or
          -- Events for documents in their departments
          exists (
            select 1 from documents d
            join department_users du on du.department_id = d.department_id
            where d.id = audit_events.doc_id
              and du.org_id = audit_events.org_id
              and du.user_id = auth.uid()
              and du.role = 'lead'
          )
          or
          -- Events for unassigned documents (department_id is null) - only if user is dept lead
          (
            exists (
              select 1 from documents d
              where d.id = audit_events.doc_id
                and d.department_id is null
            )
            and exists (
              select 1 from department_users du
              where du.org_id = audit_events.org_id
                and du.user_id = auth.uid()
                and du.role = 'lead'
            )
          )
        )
      )
    )
  );

-- Done
select 'Audit permissions fixed - only admins, content managers, and department leads can access!' as status;
