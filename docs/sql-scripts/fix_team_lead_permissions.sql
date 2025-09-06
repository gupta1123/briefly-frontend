-- Fix Team Lead Permissions for Department Access
-- This script ensures team leads can access their department members and manage their teams

-- 1) First, ensure all department leads have the 'teamLead' org role (if not already set)
--    This handles cases where someone was made a team lead but their org role wasn't updated
DO $$
BEGIN
  -- Update users who are department leads but don't have teamLead org role
  UPDATE organization_users ou
  SET role = 'teamLead'
  WHERE ou.role NOT IN ('orgAdmin', 'teamLead')  -- Don't demote orgAdmins
    AND EXISTS (
      SELECT 1 FROM department_users du
      WHERE du.org_id = ou.org_id 
        AND du.user_id = ou.user_id 
        AND du.role = 'lead'
    )
    AND EXISTS (
      SELECT 1 FROM org_roles r 
      WHERE r.org_id = ou.org_id 
        AND r.key = 'teamLead'
    );
    
  RAISE NOTICE 'Updated organization users to have teamLead role where they are department leads';
END $$;

-- 1.5) Ensure users with teamLead org role have at least one department membership
--      This is critical for the new permission logic that requires department membership
DO $$
DECLARE
  user_record RECORD;
  dept_id uuid;
  general_dept_id uuid;
BEGIN
  -- Find teamLead users who have no department memberships
  FOR user_record IN 
    SELECT ou.org_id, ou.user_id
    FROM organization_users ou
    WHERE ou.role = 'teamLead'
      AND NOT EXISTS (
        SELECT 1 FROM department_users du
        WHERE du.org_id = ou.org_id AND du.user_id = ou.user_id
      )
  LOOP
    -- Try to find a General department for this org
    SELECT id INTO general_dept_id
    FROM departments 
    WHERE org_id = user_record.org_id AND name = 'General'
    LIMIT 1;
    
    -- If no General department, create one
    IF general_dept_id IS NULL THEN
      INSERT INTO departments (org_id, name)
      VALUES (user_record.org_id, 'General')
      ON CONFLICT (org_id, name) DO NOTHING
      RETURNING id INTO general_dept_id;
      
      -- If still null due to conflict, get the existing one
      IF general_dept_id IS NULL THEN
        SELECT id INTO general_dept_id
        FROM departments 
        WHERE org_id = user_record.org_id AND name = 'General'
        LIMIT 1;
      END IF;
    END IF;
    
    -- Add the teamLead user as a lead of the General department
    INSERT INTO department_users (org_id, department_id, user_id, role)
    VALUES (user_record.org_id, general_dept_id, user_record.user_id, 'lead')
    ON CONFLICT (department_id, user_id) DO NOTHING;
    
    RAISE NOTICE 'Added teamLead user % to General department as lead', user_record.user_id;
  END LOOP;
END $$;

-- 2) Ensure teamLead role has proper permissions to manage departments
--    Update existing teamLead role permissions to include department management
DO $$
DECLARE
  org_record RECORD;
BEGIN
  FOR org_record IN SELECT DISTINCT org_id FROM org_roles WHERE key = 'teamLead'
  LOOP
    UPDATE org_roles 
    SET permissions = jsonb_set(
      permissions,
      '{departments.manage_members}',
      'true'::jsonb
    )
    WHERE org_id = org_record.org_id 
      AND key = 'teamLead'
      AND NOT (permissions ? 'departments.manage_members');
      
    -- Also ensure they can read department info
    UPDATE org_roles 
    SET permissions = jsonb_set(
      permissions,
      '{departments.read}',
      'true'::jsonb
    )
    WHERE org_id = org_record.org_id 
      AND key = 'teamLead'
      AND NOT (permissions ? 'departments.read');
  END LOOP;
  
  RAISE NOTICE 'Updated teamLead role permissions to include department management';
END $$;

-- 3) Create/update helper function to check if user is team lead of specific department
CREATE OR REPLACE FUNCTION is_dept_lead(p_org_id uuid, p_dept_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY definer
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM department_users du
    WHERE du.org_id = p_org_id
      AND du.department_id = p_dept_id
      AND du.user_id = auth.uid()
      AND du.role = 'lead'
  );
$$;

-- 4) Update RLS policies to allow team leads to manage their department members
DROP POLICY IF EXISTS department_users_read ON department_users;
CREATE POLICY department_users_read ON department_users
  FOR SELECT USING (
    is_member_of(org_id)  -- Any org member can read
  );

DROP POLICY IF EXISTS department_users_manage ON department_users;
CREATE POLICY department_users_manage ON department_users
  FOR ALL USING (
    has_perm(org_id, 'org.manage_members')  -- Org admins
    OR is_dept_lead(org_id, department_id)  -- Department leads
  )
  WITH CHECK (
    has_perm(org_id, 'org.manage_members')  -- Org admins
    OR is_dept_lead(org_id, department_id)  -- Department leads
  );

-- 5) Verify the changes
DO $$
DECLARE
  team_lead_count INTEGER;
  dept_lead_count INTEGER;
BEGIN
  -- Count users with teamLead org role
  SELECT COUNT(*) INTO team_lead_count
  FROM organization_users
  WHERE role = 'teamLead';
  
  -- Count users who are department leads
  SELECT COUNT(DISTINCT user_id) INTO dept_lead_count
  FROM department_users
  WHERE role = 'lead';
  
  RAISE NOTICE 'Found % users with teamLead org role', team_lead_count;
  RAISE NOTICE 'Found % users who are department leads', dept_lead_count;
  
  -- Log any mismatches for review
  IF team_lead_count < dept_lead_count THEN
    RAISE WARNING 'Some department leads may not have teamLead org role - check manually';
  END IF;
END $$;

-- 6) Test query to verify a team lead can see their department
-- Run this manually with a known team lead user ID and department ID to test:
/*
SELECT 
  du.user_id,
  du.role,
  au.display_name,
  'Can see department members' as access_test
FROM department_users du
JOIN app_users au ON au.id = du.user_id
WHERE du.org_id = 'YOUR_ORG_ID'
  AND du.department_id = 'YOUR_DEPT_ID';
*/

RAISE NOTICE 'Team lead permissions fix completed successfully';
