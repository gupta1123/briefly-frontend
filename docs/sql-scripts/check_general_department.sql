-- Check users in General department for org: 5f4fa858-8ba2-4f46-988b-58ac0b2a948d

SELECT 
  'General Department Members' as check_type,
  auth_users.email,
  au.display_name,
  du.role as dept_role,
  ou.role as org_role,
  CASE 
    WHEN du.role = 'lead' THEN 'Department Lead'
    WHEN du.role = 'member' THEN 'Department Member'
    ELSE du.role
  END as role_description
FROM department_users du
JOIN app_users au ON au.id = du.user_id
JOIN auth.users auth_users ON auth_users.id = au.id
JOIN departments d ON d.id = du.department_id
JOIN organization_users ou ON ou.user_id = au.id AND ou.org_id = du.org_id
WHERE du.org_id = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d' 
  AND d.name = 'General'
ORDER BY 
  CASE du.role WHEN 'lead' THEN 1 WHEN 'member' THEN 2 ELSE 3 END,
  auth_users.email;
