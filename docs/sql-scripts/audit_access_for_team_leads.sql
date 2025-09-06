-- Allow team leads access to audit logs
-- This gives department leads the ability to see audit events for their teams

-- 1) Create a function to check if user can access audit logs
-- (either org admin or department lead)
create or replace function can_access_audit(p_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select (
    -- Org admins can always access audit
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

grant execute on function can_access_audit(uuid) to anon, authenticated;

-- 2) Update audit events RLS to allow department leads
-- They should see events related to documents in their departments

drop policy if exists audit_events_read on audit_events;
create policy audit_events_read on audit_events
  for select using (
    is_member_of(org_id) and (
      -- Org admins see all audit events
      has_perm(org_id, 'audit.read')
      or
      -- Department leads see events for their departments
      (
        exists (
          select 1 from department_users du
          where du.org_id = audit_events.org_id
            and du.user_id = auth.uid()
            and du.role = 'lead'
        )
        and (
          -- Events with no document (like login) - show all for dept leads
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
          -- Events for unassigned documents (department_id is null)
          exists (
            select 1 from documents d
            where d.id = audit_events.doc_id
              and d.department_id is null
          )
        )
      )
    )
  );

-- Done
select 'Audit access for team leads configured!' as status;
