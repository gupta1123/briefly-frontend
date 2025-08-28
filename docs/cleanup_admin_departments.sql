-- Cleanup Admin Department Assignments
-- Remove admin from Admin department since they should only be in General

-- Step 1: Remove admin from Admin department
DELETE FROM department_users 
WHERE org_id = '0eb17226-9124-4963-80e5-d88b211014c4'
  AND user_id = '4292418f-ded6-4a11-bcdf-ae7d04fe619f'  -- admin@nyx.test
  AND department_id = (
    SELECT id FROM departments 
    WHERE org_id = '0eb17226-9124-4963-80e5-d88b211014c4' 
      AND name = 'Admin'
  );

-- Step 2: Move any documents from Admin department to General department
-- This ensures admin's previously created content goes to the right place
UPDATE documents 
SET department_id = (
  SELECT id FROM departments 
  WHERE org_id = '0eb17226-9124-4963-80e5-d88b211014c4' 
    AND name = 'General'
)
WHERE org_id = '0eb17226-9124-4963-80e5-d88b211014c4'
  AND department_id = (
    SELECT id FROM departments 
    WHERE org_id = '0eb17226-9124-4963-80e5-d88b211014c4' 
      AND name = 'Admin'
  );

-- Step 3: Remove the Admin department entirely (optional - only if empty)
-- This prevents confusion about which department admin should use
DELETE FROM departments 
WHERE org_id = '0eb17226-9124-4963-80e5-d88b211014c4'
  AND name = 'Admin'
  AND NOT EXISTS (
    SELECT 1 FROM department_users du 
    WHERE du.department_id = departments.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM documents d 
    WHERE d.department_id = departments.id
  );

-- Step 4: Verification - Check final department structure
SELECT 
  'Final Department Summary' as check_type,
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

-- Step 5: Verify admin is only in General department
SELECT 
  'Admin Department Memberships' as check_type,
  auth_users.email,
  d.name as department_name,
  du.role as dept_role,
  'Should only be in General' as expected_result
FROM department_users du
JOIN app_users au ON au.id = du.user_id
LEFT JOIN auth.users auth_users ON auth_users.id = au.id
JOIN departments d ON d.id = du.department_id
WHERE du.org_id = '0eb17226-9124-4963-80e5-d88b211014c4'
  AND du.user_id = '4292418f-ded6-4a11-bcdf-ae7d04fe619f'  -- admin@nyx.test
ORDER BY d.name;

-- Step 6: Check documents in General department
SELECT 
  'General Department Documents' as check_type,
  COUNT(*) as total_documents,
  COUNT(CASE WHEN d.type = 'folder' THEN 1 END) as folder_count,
  COUNT(CASE WHEN d.owner_user_id = '4292418f-ded6-4a11-bcdf-ae7d04fe619f' THEN 1 END) as admin_created_count
FROM documents d
JOIN departments dept ON dept.id = d.department_id
WHERE d.org_id = '0eb17226-9124-4963-80e5-d88b211014c4'
  AND dept.name = 'General';

-- Expected Results:
-- 1. Admin will only be in General department (not Admin)
-- 2. Admin department will be removed if empty
-- 3. Any admin-created content will be in General department
-- 4. Clean department structure with no duplicates
