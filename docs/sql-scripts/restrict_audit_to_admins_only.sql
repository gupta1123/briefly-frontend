-- Restrict audit access to admins only (not team leads)
-- This removes department lead access to audit logs

-- 1) Update the can_access_audit function to only allow org admins
create or replace function can_access_audit(p_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select (
    -- Only org admins can access audit (remove department lead access)
    has_perm(p_org_id, 'audit.read')
  );
$$;

grant execute on function can_access_audit(uuid) to anon, authenticated;

-- 2) Update audit events RLS policy to only allow org admins
drop policy if exists audit_events_read on audit_events;
create policy audit_events_read on audit_events
  for select using (
    is_member_of(org_id) and (
      -- Only org admins can see audit events (remove department lead access)
      has_perm(org_id, 'audit.read')
    )
  );

-- Done
select 'Audit access restricted to admins only!' as status;
