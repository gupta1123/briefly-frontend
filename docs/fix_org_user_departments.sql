-- Fix organization user departments and roles
-- Org ID: 5f4fa858-8ba2-4f46-988b-58ac0b2a948d

-- Step 1: Get the General department ID for this org
-- (Run this first to get the department_id, then use it in subsequent queries)
SELECT id as general_dept_id, name 
FROM departments 
WHERE org_id = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d' AND name = 'General';

-- Step 2: Remove yashlead@gmail.com from General department lead role
-- First, let's see what we're removing
SELECT 
  du.user_id,
  auth_users.email,
  d.name as department_name,
  du.role
FROM department_users du
JOIN app_users au ON au.id = du.user_id
JOIN auth.users auth_users ON auth_users.id = au.id
JOIN departments d ON d.id = du.department_id
WHERE du.org_id = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d' 
  AND d.name = 'General'
  AND auth_users.email = 'yashlead@gmail.com';

-- Remove yashlead@gmail.com from General department
DELETE FROM department_users 
WHERE user_id = (
  SELECT au.id 
  FROM app_users au 
  JOIN auth.users auth_users ON auth_users.id = au.id 
  WHERE auth_users.email = 'yashlead@gmail.com'
)
AND org_id = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d'
AND department_id = (
  SELECT id FROM departments 
  WHERE org_id = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d' AND name = 'General'
);

-- Step 3: Add admin user to General department as lead
INSERT INTO department_users (user_id, department_id, org_id, role, created_at)
SELECT 
  au.id as user_id,
  d.id as department_id,
  '5f4fa858-8ba2-4f46-988b-58ac0b2a948d' as org_id,
  'lead' as role,
  NOW() as created_at
FROM app_users au
JOIN auth.users auth_users ON auth_users.id = au.id
JOIN departments d ON d.org_id = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d' AND d.name = 'General'
WHERE auth_users.email = 'admin@briefly.local'
AND NOT EXISTS (
  SELECT 1 FROM department_users du2 
  WHERE du2.user_id = au.id 
  AND du2.department_id = d.id 
  AND du2.org_id = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d'
);

-- Step 4: Assign yash@gmail.com to General department as member
INSERT INTO department_users (user_id, department_id, org_id, role, created_at)
SELECT 
  au.id as user_id,
  d.id as department_id,
  '5f4fa858-8ba2-4f46-988b-58ac0b2a948d' as org_id,
  'member' as role,
  NOW() as created_at
FROM app_users au
JOIN auth.users auth_users ON auth_users.id = au.id
JOIN departments d ON d.org_id = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d' AND d.name = 'General'
WHERE auth_users.email = 'yash@gmail.com'
AND NOT EXISTS (
  SELECT 1 FROM department_users du2 
  WHERE du2.user_id = au.id 
  AND du2.department_id = d.id 
  AND du2.org_id = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d'
);

-- Step 5: Optional - Assign a lead to Sales department
-- You may want to promote yashuser@gmail.com to lead or assign someone else
-- Uncomment the following if you want to make yashuser@gmail.com the Sales lead:

/*
UPDATE department_users 
SET role = 'lead'
WHERE user_id = (
  SELECT au.id 
  FROM app_users au 
  JOIN auth.users auth_users ON auth_users.id = au.id 
  WHERE auth_users.email = 'yashuser@gmail.com'
)
AND org_id = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d'
AND department_id = (
  SELECT id FROM departments 
  WHERE org_id = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d' AND name = 'Sales'
);
*/

-- Verification queries to run after the fixes
-- Run these to confirm everything is correct:

-- Check General department membership
SELECT 
  'General Department After Fix' as check_type,
  auth_users.email,
  du.role,
  au.display_name
FROM department_users du
JOIN app_users au ON au.id = du.user_id
JOIN auth.users auth_users ON auth_users.id = au.id
JOIN departments d ON d.id = du.department_id
WHERE du.org_id = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d' 
  AND d.name = 'General'
ORDER BY du.role DESC, auth_users.email;

-- Check users without departments
SELECT 
  'Users Still Without Departments' as check_type,
  auth_users.email,
  au.display_name,
  ou.role as org_role
FROM app_users au
LEFT JOIN auth.users auth_users ON auth_users.id = au.id
JOIN organization_users ou ON ou.user_id = au.id
LEFT JOIN department_users du ON du.user_id = au.id AND du.org_id = ou.org_id
WHERE ou.org_id = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d'
  AND du.user_id IS NULL
ORDER BY auth_users.email;

-- Instructions:
-- 1. Run the queries in order (Steps 1-4)
-- 2. Optionally run Step 5 if you want to assign a Sales lead
-- 3. Run the verification queries to confirm fixes
-- 4. Re-run the original user_roles_departments_query.sql to see the final state
