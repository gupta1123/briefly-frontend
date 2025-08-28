-- Remove yash@gmail.com from General department
-- Org ID: 5f4fa858-8ba2-4f46-988b-58ac0b2a948d

-- First, check what we're about to remove
SELECT 
  'Before Removal' as action,
  auth_users.email,
  au.display_name,
  d.name as department_name,
  du.role as dept_role
FROM department_users du
JOIN app_users au ON au.id = du.user_id
JOIN auth.users auth_users ON auth_users.id = au.id
JOIN departments d ON d.id = du.department_id
WHERE du.org_id = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d' 
  AND d.name = 'General'
  AND auth_users.email = 'yash@gmail.com';

-- Remove yash@gmail.com from General department
DELETE FROM department_users 
WHERE user_id = (
  SELECT au.id 
  FROM app_users au 
  JOIN auth.users auth_users ON auth_users.id = au.id 
  WHERE auth_users.email = 'yash@gmail.com'
)
AND org_id = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d'
AND department_id = (
  SELECT id FROM departments 
  WHERE org_id = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d' AND name = 'General'
);

-- Verify removal - check General department after removal
SELECT 
  'After Removal - General Department' as action,
  auth_users.email,
  au.display_name,
  du.role as dept_role,
  CASE 
    WHEN du.role = 'lead' THEN 'Department Lead'
    WHEN du.role = 'member' THEN 'Department Member'
    ELSE du.role
  END as role_description
FROM department_users du
JOIN app_users au ON au.id = du.user_id
JOIN auth.users auth_users ON auth_users.id = au.id
JOIN departments d ON d.id = du.department_id
WHERE du.org_id = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d' 
  AND d.name = 'General'
ORDER BY du.role DESC, auth_users.email;
