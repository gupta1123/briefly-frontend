-- Debug Folder Creation Department Assignment Issue
-- Run this to understand why folders are being created in wrong departments

-- Replace with actual values:
-- 'YOUR_ORG_ID' with your organization ID
-- 'YOUR_FINANCE_TEAM_USER_ID' with the Finance team user ID

-- 1) Check Finance team user's department memberships
SELECT 
  'Finance User Departments' as check_type,
  du.user_id,
  du.department_id,
  du.role as dept_role,
  d.name as department_name,
  ou.role as org_role
FROM department_users du
JOIN departments d ON d.id = du.department_id
LEFT JOIN organization_users ou ON ou.user_id = du.user_id AND ou.org_id = du.org_id
WHERE du.org_id = 'YOUR_ORG_ID'
  AND du.user_id = 'YOUR_FINANCE_TEAM_USER_ID';

-- 2) Check the most recently created folder and its department assignment
SELECT 
  'Recent Folder Creation' as check_type,
  d.id,
  d.title,
  d.type,
  d.department_id,
  dept.name as assigned_department_name,
  d.owner_user_id,
  d.uploaded_at,
  ou.role as creator_org_role
FROM documents d
LEFT JOIN departments dept ON dept.id = d.department_id
LEFT JOIN organization_users ou ON ou.user_id = d.owner_user_id AND ou.org_id = d.org_id
WHERE d.org_id = 'YOUR_ORG_ID'
  AND d.type = 'folder'
ORDER BY d.uploaded_at DESC
LIMIT 5;

-- 3) Check all department IDs and names for reference
SELECT 
  'All Departments' as check_type,
  d.id as department_id,
  d.name as department_name,
  COUNT(du.user_id) as member_count
FROM departments d
LEFT JOIN department_users du ON du.department_id = d.id
WHERE d.org_id = 'YOUR_ORG_ID'
GROUP BY d.id, d.name
ORDER BY d.name;

-- 4) Check if there are multiple "General" departments (shouldn't happen)
SELECT 
  'General Departments Check' as check_type,
  COUNT(*) as general_dept_count,
  STRING_AGG(id::text, ', ') as general_dept_ids
FROM departments
WHERE org_id = 'YOUR_ORG_ID'
  AND name = 'General';

-- 5) Check Finance department specifically
SELECT 
  'Finance Department Info' as check_type,
  d.id as finance_dept_id,
  d.name,
  COUNT(du.user_id) as member_count,
  STRING_AGG(du.user_id::text || '(' || du.role || ')', ', ') as members
FROM departments d
LEFT JOIN department_users du ON du.department_id = d.id
WHERE d.org_id = 'YOUR_ORG_ID'
  AND d.name = 'Finance'
GROUP BY d.id, d.name;

-- 6) Test the backend folder creation logic simulation
-- This simulates what should happen when a Finance user creates a folder
WITH finance_user_depts AS (
  SELECT 
    du.department_id,
    du.role,
    d.name as dept_name
  FROM department_users du
  JOIN departments d ON d.id = du.department_id
  WHERE du.org_id = 'YOUR_ORG_ID'
    AND du.user_id = 'YOUR_FINANCE_TEAM_USER_ID'
),
expected_dept AS (
  SELECT 
    department_id,
    dept_name,
    CASE 
      WHEN role = 'lead' THEN 1
      ELSE 2 
    END as priority
  FROM finance_user_depts
  ORDER BY priority
  LIMIT 1
)
SELECT 
  'Expected Department Logic' as check_type,
  ed.department_id as should_be_assigned_to,
  ed.dept_name as should_be_department_name,
  'This is where folders should be created' as note
FROM expected_dept ed;

-- Instructions:
-- 1. Replace 'YOUR_ORG_ID' with: 0eb17226-9124-4963-80e5-d88b211014c4
-- 2. Replace 'YOUR_FINANCE_TEAM_USER_ID' with the actual Finance user's ID
-- 3. Run the queries to understand the department assignment flow
-- 4. Check if Finance user has proper department membership
-- 5. Verify folder creation logic is working as expected
