-- Debug upload permissions for team lead user
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

-- Check organization settings that might affect uploads
SELECT 
  'Organization Settings' as check_type,
  org_id,
  name,
  created_at,
  (settings->>'allowUploads')::boolean as allow_uploads,
  (settings->>'maxFileSize')::text as max_file_size,
  settings
FROM organizations 
WHERE id = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d';

-- Check if the user has proper folder access
SELECT 
  'User Folder Access' as check_type,
  f.id as folder_id,
  f.name as folder_name,
  f.department_id,
  d.name as department_name,
  CASE 
    WHEN f.department_id IS NULL THEN 'Organization-wide folder'
    ELSE 'Department-specific folder'
  END as folder_scope
FROM folders f
LEFT JOIN departments d ON d.id = f.department_id
WHERE f.org_id = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d'
ORDER BY f.name;

-- Check if there are any specific upload restrictions in the database
SELECT 
  'Upload Restrictions Check' as check_type,
  COUNT(*) as total_folders,
  COUNT(CASE WHEN department_id IS NOT NULL THEN 1 END) as dept_folders,
  COUNT(CASE WHEN department_id IS NULL THEN 1 END) as org_folders
FROM folders 
WHERE org_id = '5f4fa858-8ba2-4f46-988b-58ac0b2a948d';
