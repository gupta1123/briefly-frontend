-- Debug Department Access Issues
-- Run these queries to help diagnose the folder/document access problems

-- 1) Check current user's department memberships and role
-- Replace 'YOUR_USER_ID' with the actual user ID of the HR team lead
SELECT 
  'Current User Info' as query_type,
  ou.user_id,
  ou.role as org_role,
  ou.org_id,
  du.department_id,
  du.role as dept_role,
  d.name as department_name
FROM organization_users ou
LEFT JOIN department_users du ON du.org_id = ou.org_id AND du.user_id = ou.user_id  
LEFT JOIN departments d ON d.id = du.department_id
WHERE ou.user_id = 'YOUR_USER_ID'  -- Replace with actual user ID
  AND ou.org_id = 'YOUR_ORG_ID';   -- Replace with actual org ID

-- 2) Check all documents and their department assignments
SELECT 
  'Document Department Mapping' as query_type,
  d.id,
  d.title,
  d.filename,
  d.type,
  d.department_id,
  dept.name as department_name,
  d.folder_path,
  d.owner_user_id
FROM documents d
LEFT JOIN departments dept ON dept.id = d.department_id
WHERE d.org_id = 'YOUR_ORG_ID'  -- Replace with actual org ID
ORDER BY d.created_at DESC
LIMIT 20;

-- 3) Check all departments and their members
SELECT 
  'Department Memberships' as query_type,
  d.name as department_name,
  d.id as department_id,
  du.user_id,
  du.role as dept_role,
  ou.role as org_role
FROM departments d
LEFT JOIN department_users du ON du.department_id = d.id
LEFT JOIN organization_users ou ON ou.user_id = du.user_id AND ou.org_id = d.org_id
WHERE d.org_id = 'YOUR_ORG_ID'  -- Replace with actual org ID
ORDER BY d.name, du.role;

-- 4) Check folder-type documents specifically  
SELECT 
  'Folder Documents' as query_type,
  d.id,
  d.title,
  d.type,
  d.department_id,
  dept.name as department_name,
  d.folder_path,
  d.owner_user_id,
  d.created_at
FROM documents d
LEFT JOIN departments dept ON dept.id = d.department_id
WHERE d.org_id = 'YOUR_ORG_ID'  -- Replace with actual org ID
  AND d.type = 'folder'
ORDER BY d.created_at DESC;

-- 5) Test RLS policies - check what documents current user can see
-- This will show if RLS is working correctly
SELECT 
  'RLS Test - Visible Documents' as query_type,
  COUNT(*) as total_visible_documents,
  COUNT(CASE WHEN department_id IS NULL THEN 1 END) as null_dept_docs,
  COUNT(CASE WHEN department_id IS NOT NULL THEN 1 END) as assigned_dept_docs
FROM documents 
WHERE org_id = 'YOUR_ORG_ID';  -- Replace with actual org ID

-- 6) Check if there are any folder_access entries (sharing)
SELECT 
  'Folder Sharing' as query_type,
  fa.org_id,
  fa.path,
  fa.department_id,
  d.name as shared_with_department
FROM folder_access fa
JOIN departments d ON d.id = fa.department_id
WHERE fa.org_id = 'YOUR_ORG_ID'  -- Replace with actual org ID
ORDER BY fa.path;

-- 7) Check for any documents still with null department_id
SELECT 
  'Null Department Documents' as query_type,
  COUNT(*) as count,
  STRING_AGG(d.title || ' (' || d.type || ')', ', ') as titles
FROM documents d
WHERE d.org_id = 'YOUR_ORG_ID'  -- Replace with actual org ID
  AND d.department_id IS NULL;

-- 8) Verify current RLS policies
SELECT 
  'Current RLS Policies' as query_type,
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd, 
  qual
FROM pg_policies 
WHERE tablename = 'documents' 
  AND schemaname = 'public'
ORDER BY policyname;

-- Instructions for running:
-- 1. Replace 'YOUR_USER_ID' with the HR team lead's actual user ID
-- 2. Replace 'YOUR_ORG_ID' with your organization's actual ID
-- 3. Run each query and share the results
-- 4. This will help identify exactly where the access control is breaking down
