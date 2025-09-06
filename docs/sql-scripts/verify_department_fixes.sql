-- Verify Department Access Fixes
-- Run this after applying the backend changes to verify everything is working

-- Replace these with your actual values:
-- 'YOUR_ORG_ID' with your organization ID
-- 'YOUR_HR_LEAD_USER_ID' with the HR team lead's user ID  
-- 'YOUR_ADMIN_USER_ID' with an admin user ID

-- 1) Check HR team lead's department memberships
SELECT 
  'HR Team Lead Departments' as check_type,
  du.department_id,
  du.role,
  d.name as department_name
FROM department_users du
JOIN departments d ON d.id = du.department_id
WHERE du.org_id = 'YOUR_ORG_ID'
  AND du.user_id = 'YOUR_HR_LEAD_USER_ID';

-- 2) Check documents/folders created by HR team lead
SELECT 
  'HR Lead Created Items' as check_type,
  doc.id,
  doc.title,
  doc.type,
  doc.department_id,
  dept.name as department_name,
  doc.folder_path,
  doc.created_at
FROM documents doc
LEFT JOIN departments dept ON dept.id = doc.department_id
WHERE doc.org_id = 'YOUR_ORG_ID'
  AND doc.owner_user_id = 'YOUR_HR_LEAD_USER_ID'
ORDER BY doc.created_at DESC;

-- 3) Check documents/folders created by admin
SELECT 
  'Admin Created Items' as check_type,
  doc.id,
  doc.title,
  doc.type,
  doc.department_id,
  dept.name as department_name,
  doc.folder_path,
  doc.created_at
FROM documents doc
LEFT JOIN departments dept ON dept.id = doc.department_id
WHERE doc.org_id = 'YOUR_ORG_ID'
  AND doc.owner_user_id = 'YOUR_ADMIN_USER_ID'
ORDER BY doc.created_at DESC;

-- 4) Check if any documents are still in General that shouldn't be
SELECT 
  'General Department Documents' as check_type,
  doc.id,
  doc.title,
  doc.type,
  doc.owner_user_id,
  ou.role as owner_org_role
FROM documents doc
JOIN departments dept ON dept.id = doc.department_id
LEFT JOIN organization_users ou ON ou.user_id = doc.owner_user_id AND ou.org_id = doc.org_id
WHERE doc.org_id = 'YOUR_ORG_ID'
  AND dept.name = 'General'
ORDER BY doc.created_at DESC;

-- 5) Test RLS: simulate what HR team lead can see
-- This tests if the department filtering is working correctly
SET ROLE postgres; -- Reset to superuser for testing
SET row_security = off; -- Temporarily disable RLS to see all data

SELECT 
  'All Documents (RLS OFF)' as check_type,
  COUNT(*) as total_count,
  COUNT(CASE WHEN dept.name = 'HR' THEN 1 END) as hr_docs,
  COUNT(CASE WHEN dept.name = 'General' THEN 1 END) as general_docs,
  COUNT(CASE WHEN dept.name IS NULL THEN 1 END) as null_dept_docs
FROM documents doc
LEFT JOIN departments dept ON dept.id = doc.department_id
WHERE doc.org_id = 'YOUR_ORG_ID';

-- Re-enable RLS
SET row_security = on;

-- 6) Check current RLS policies
SELECT 
  'Current Document Policies' as check_type,
  policyname,
  cmd,
  permissive,
  qual
FROM pg_policies 
WHERE tablename = 'documents' 
  AND schemaname = 'public'
ORDER BY policyname;

-- 7) Verify no documents with null department_id remain
SELECT 
  'Null Department Check' as check_type,
  COUNT(*) as null_dept_count,
  CASE 
    WHEN COUNT(*) = 0 THEN 'PASS: No null department documents'
    ELSE 'FAIL: ' || COUNT(*) || ' documents still have null department_id'
  END as result
FROM documents
WHERE org_id = 'YOUR_ORG_ID'
  AND department_id IS NULL;

-- 8) Test cross-department isolation
-- Check if HR documents would be visible to other departments
WITH hr_dept AS (
  SELECT id FROM departments WHERE org_id = 'YOUR_ORG_ID' AND name = 'HR'
),
hr_docs AS (
  SELECT COUNT(*) as hr_doc_count
  FROM documents doc
  WHERE doc.org_id = 'YOUR_ORG_ID'
    AND doc.department_id = (SELECT id FROM hr_dept)
)
SELECT 
  'Department Isolation Test' as check_type,
  hr_doc_count,
  CASE 
    WHEN hr_doc_count > 0 THEN 'HR department has ' || hr_doc_count || ' documents'
    ELSE 'HR department has no documents yet'
  END as isolation_status
FROM hr_docs;

-- Instructions:
-- 1. Replace the placeholder values at the top
-- 2. Run each query to verify the fixes
-- 3. Expected results:
--    - HR team lead should only have documents in HR department (not General)
--    - Admin documents should be in their specified departments
--    - No null department documents should remain  
--    - RLS policies should be updated with new strict names
