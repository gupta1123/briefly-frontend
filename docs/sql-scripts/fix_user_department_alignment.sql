-- Fix User Department Alignment Issues
-- Based on the analysis results, this script fixes role mismatches and missing department assignments

-- Issue 1: Fix Finance team lead role mismatch
-- shubham1@gmail.com has teamLead org role but is only 'member' in Finance
-- This should be 'lead' to properly create folders in Finance department

UPDATE department_users 
SET role = 'lead'
WHERE org_id = '0eb17226-9124-4963-80e5-d88b211014c4'
  AND user_id = '9de03c1b-1c06-480a-9695-3ed701d32990'  -- shubham1@gmail.com
  AND department_id = (
    SELECT id FROM departments 
    WHERE org_id = '0eb17226-9124-4963-80e5-d88b211014c4' 
      AND name = 'Finance'
  );

-- Issue 2: Assign admin to General department (as per frontend configuration)
-- Admins should be in General department so they can create general organizational content
INSERT INTO department_users (org_id, user_id, department_id, role)
SELECT 
  '0eb17226-9124-4963-80e5-d88b211014c4',
  '4292418f-ded6-4a11-bcdf-ae7d04fe619f',  -- admin@nyx.test
  d.id,
  'lead'
FROM departments d
WHERE d.org_id = '0eb17226-9124-4963-80e5-d88b211014c4' 
  AND d.name = 'General'
  AND NOT EXISTS (
    SELECT 1 FROM department_users du 
    WHERE du.org_id = '0eb17226-9124-4963-80e5-d88b211014c4'
      AND du.user_id = '4292418f-ded6-4a11-bcdf-ae7d04fe619f'
      AND du.department_id = d.id
  );

-- Issue 3: Assign orphaned users to appropriate departments
-- These users have org access but no department assignments

-- Option A: Assign to General department (if you want them to have basic access)
-- Uncomment the lines below if you want to assign orphaned users to General

-- INSERT INTO department_users (org_id, user_id, department_id, role)
-- SELECT 
--   '0eb17226-9124-4963-80e5-d88b211014c4',
--   orphaned_users.user_id,
--   d.id,
--   'member'
-- FROM (VALUES 
--   ('bfd517df-0a79-4702-bced-289cb3cf4461'), -- shubham22@gmail.com (hr2)
--   ('391e0658-6f1b-4298-bdc6-2e31f7ba49c5'), -- shubham31@gmail.com (asda)  
--   ('186c5dec-d79d-4bf9-86c7-b92da9b35a84')  -- shubham33@gmail.com (s345)
-- ) AS orphaned_users(user_id)
-- CROSS JOIN departments d
-- WHERE d.org_id = '0eb17226-9124-4963-80e5-d88b211014c4' 
--   AND d.name = 'General'
--   AND NOT EXISTS (
--     SELECT 1 FROM department_users du 
--     WHERE du.org_id = '0eb17226-9124-4963-80e5-d88b211014c4'
--       AND du.user_id = orphaned_users.user_id
--       AND du.department_id = d.id
--   );

-- Issue 4: Verification queries to confirm fixes

-- Check Finance department leadership
SELECT 
  'Finance Department After Fix' as check_type,
  auth_users.email,
  du.role as dept_role,
  ou.role as org_role,
  CASE 
    WHEN du.role = 'lead' AND ou.role = 'teamLead' THEN 'ALIGNED: Can create Finance folders'
    ELSE 'ISSUE: Role mismatch'
  END as status
FROM department_users du
JOIN app_users au ON au.id = du.user_id  
LEFT JOIN auth.users auth_users ON auth_users.id = au.id
JOIN organization_users ou ON ou.user_id = du.user_id AND ou.org_id = du.org_id
JOIN departments d ON d.id = du.department_id
WHERE du.org_id = '0eb17226-9124-4963-80e5-d88b211014c4'
  AND d.name = 'Finance';

-- Check Admin department assignment  
SELECT 
  'Admin Department Assignment' as check_type,
  auth_users.email,
  d.name as department_name,
  du.role as dept_role,
  ou.role as org_role,
  'Admin can now create folders in General department' as status
FROM department_users du
JOIN app_users au ON au.id = du.user_id
LEFT JOIN auth.users auth_users ON auth_users.id = au.id
JOIN organization_users ou ON ou.user_id = du.user_id AND ou.org_id = du.org_id
JOIN departments d ON d.id = du.department_id
WHERE du.org_id = '0eb17226-9124-4963-80e5-d88b211014c4'
  AND du.user_id = '4292418f-ded6-4a11-bcdf-ae7d04fe619f'  -- admin@nyx.test
  AND d.name = 'General';

-- Check all users still without department assignments
SELECT 
  'Remaining Users Without Departments' as check_type,
  auth_users.email,
  au.display_name,
  ou.role as org_role,
  'Still needs department assignment' as action_needed
FROM app_users au
LEFT JOIN auth.users auth_users ON auth_users.id = au.id
JOIN organization_users ou ON ou.user_id = au.id
LEFT JOIN department_users du ON du.user_id = au.id AND du.org_id = ou.org_id
WHERE ou.org_id = '0eb17226-9124-4963-80e5-d88b211014c4'
  AND du.user_id IS NULL;

-- Summary of department membership after fixes
SELECT 
  'Department Summary After Fixes' as check_type,
  d.name as department_name,
  COUNT(du.user_id) as member_count,
  COUNT(CASE WHEN du.role = 'lead' THEN 1 END) as lead_count,
  STRING_AGG(auth_users.email || ' (' || du.role || ')', ', ') as members
FROM departments d
LEFT JOIN department_users du ON du.department_id = d.id
LEFT JOIN app_users au ON au.id = du.user_id
LEFT JOIN auth.users auth_users ON auth_users.id = au.id
WHERE d.org_id = '0eb17226-9124-4963-80e5-d88b211014c4'
GROUP BY d.id, d.name
ORDER BY d.name;

-- Expected Results After Running This Script:
-- 1. shubham1@gmail.com will be 'lead' of Finance department (can create Finance folders)
-- 2. admin@nyx.test will be assigned to Admin department (can create admin folders there)  
-- 3. Folder creation should now work correctly with proper department assignment
-- 4. You can uncomment the orphaned users section if you want to assign them to General
