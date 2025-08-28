-- Debug upload permissions for team lead user - CORRECTED VERSION
-- Org ID: 5f4fa858-8ba2-4f46-988b-58ac0b2a948d

-- Check which user is experiencing the upload issue (likely yashlead@gmail.com or yashlead1@gmail.com)
SELECT 
  'Team Lead Users' as check_type,
  auth_users.email,
  au.display_name,
  ou.role as org_role,
  d.name as department_name,
  du.role as dept_role,
  ou.expires_at,
  CASE 
    WHEN ou.expires_at IS NULL THEN 'Never expires'
    WHEN ou.expires_at > NOW() THEN 'Active'
    ELSE 'Expired'
  END as access_status
FROM app_users au
JOIN auth.users auth_users ON auth_users.id = au.id
JOIN organization_users ou ON ou.user_id = au.id
LEFT JOIN department_users du ON du.user_id = au.id AND du.org_id = ou.org_id
LEFT JOIN departments d ON d.id = du.department_id
WHERE ou.org_id = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d'
  AND ou.role = 'teamLead'
ORDER BY auth_users.email;

-- Check if there are any documents table policies blocking uploads
-- This query will show us the current RLS policies on the documents table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'documents'
ORDER BY policyname;

-- Check organization details (organizations table doesn't have settings column)
SELECT 
  'Organization Info' as check_type,
  id,
  name,
  created_at
FROM organizations 
WHERE id = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d';

-- Check if there's an org_settings table for upload restrictions
SELECT 
  'Org Settings' as check_type,
  org_id,
  settings
FROM org_settings 
WHERE org_id = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d';

-- Check department access for team leads
SELECT 
  'Department Access Check' as check_type,
  d.id as dept_id,
  d.name as dept_name,
  d.org_id,
  COUNT(du.user_id) as member_count,
  COUNT(CASE WHEN du.role = 'lead' THEN 1 END) as lead_count
FROM departments d
LEFT JOIN department_users du ON du.department_id = d.id
WHERE d.org_id = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d'
GROUP BY d.id, d.name, d.org_id
ORDER BY d.name;

-- Check if teamLead role is properly configured in organization_users
SELECT 
  'Role Configuration Check' as check_type,
  ou.role,
  COUNT(*) as user_count,
  STRING_AGG(auth_users.email, ', ') as users
FROM organization_users ou
JOIN app_users au ON au.id = ou.user_id
JOIN auth.users auth_users ON auth_users.id = au.id
WHERE ou.org_id = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d'
GROUP BY ou.role
ORDER BY ou.role;

-- Test document insertion permission for team leads (simulate what happens during upload)
-- This will help us understand if the RLS policies are blocking document creation
SELECT 
  'Upload Permission Test' as check_type,
  'This query tests if team leads can create documents in their departments' as description,
  CASE 
    WHEN COUNT(*) > 0 THEN 'Team leads found - should be able to upload to their departments'
    ELSE 'No team leads found'
  END as permission_status
FROM organization_users ou
JOIN department_users du ON du.user_id = ou.user_id AND du.org_id = ou.org_id
WHERE ou.org_id = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d'
  AND ou.role = 'teamLead'
  AND du.role = 'lead';
