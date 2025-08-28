-- Query to understand user emails, roles, and department memberships
-- Replace 'YOUR_ORG_ID' with your actual organization ID: 0eb17226-9124-4963-80e5-d88b211014c4

-- Complete user overview with emails, roles, and departments
SELECT 
  'User Roles and Departments' as query_type,
  au.id as user_id,
  auth_users.email,
  au.display_name,
  ou.role as org_role,
  d.name as department_name,
  du.role as dept_role,
  CASE 
    WHEN ou.role = 'orgAdmin' THEN 'Organization Admin'
    WHEN ou.role = 'teamLead' THEN 'Team Lead'
    WHEN ou.role = 'member' THEN 'Member'
    WHEN ou.role = 'contentManager' THEN 'Content Manager'
    WHEN ou.role = 'contentViewer' THEN 'Content Viewer'
    WHEN ou.role = 'guest' THEN 'Guest'
    ELSE ou.role
  END as org_role_description,
  CASE 
    WHEN du.role = 'lead' THEN 'Department Lead'
    WHEN du.role = 'member' THEN 'Department Member'
    ELSE du.role
  END as dept_role_description,
  ou.expires_at,
  CASE 
    WHEN ou.expires_at IS NULL THEN 'Never expires'
    WHEN ou.expires_at > NOW() THEN 'Active'
    ELSE 'Expired'
  END as access_status
FROM app_users au
LEFT JOIN auth.users auth_users ON auth_users.id = au.id
LEFT JOIN organization_users ou ON ou.user_id = au.id
LEFT JOIN department_users du ON du.user_id = au.id AND du.org_id = ou.org_id
LEFT JOIN departments d ON d.id = du.department_id
WHERE ou.org_id = 'YOUR_ORG_ID'  -- Replace with actual org ID
ORDER BY 
  auth_users.email,
  d.name;

-- Summary by organization role
SELECT 
  'Summary by Org Role' as query_type,
  ou.role as org_role,
  COUNT(DISTINCT ou.user_id) as user_count,
  STRING_AGG(DISTINCT auth_users.email, ', ') as users
FROM organization_users ou
JOIN app_users au ON au.id = ou.user_id
LEFT JOIN auth.users auth_users ON auth_users.id = au.id
WHERE ou.org_id = 'YOUR_ORG_ID'  -- Replace with actual org ID
GROUP BY ou.role
ORDER BY 
  CASE ou.role
    WHEN 'orgAdmin' THEN 1
    WHEN 'teamLead' THEN 2
    WHEN 'member' THEN 3
    WHEN 'contentManager' THEN 4
    WHEN 'contentViewer' THEN 5
    WHEN 'guest' THEN 6
    ELSE 7
  END;

-- Summary by department
SELECT 
  'Summary by Department' as query_type,
  d.name as department_name,
  COUNT(du.user_id) as member_count,
  COUNT(CASE WHEN du.role = 'lead' THEN 1 END) as lead_count,
  COUNT(CASE WHEN du.role = 'member' THEN 1 END) as member_only_count,
  STRING_AGG(
    auth_users.email || ' (' || du.role || ')', 
    ', ' ORDER BY du.role, auth_users.email
  ) as members
FROM departments d
LEFT JOIN department_users du ON du.department_id = d.id
LEFT JOIN app_users au ON au.id = du.user_id
LEFT JOIN auth.users auth_users ON auth_users.id = au.id
WHERE d.org_id = 'YOUR_ORG_ID'  -- Replace with actual org ID
GROUP BY d.id, d.name
ORDER BY d.name;

-- Users without department assignments
SELECT 
  'Users Without Departments' as query_type,
  au.id as user_id,
  auth_users.email,
  au.display_name,
  ou.role as org_role,
  'No department assigned' as issue
FROM app_users au
LEFT JOIN auth.users auth_users ON auth_users.id = au.id
JOIN organization_users ou ON ou.user_id = au.id
LEFT JOIN department_users du ON du.user_id = au.id AND du.org_id = ou.org_id
WHERE ou.org_id = 'YOUR_ORG_ID'  -- Replace with actual org ID
  AND du.user_id IS NULL
ORDER BY auth_users.email;

-- Users with multiple department memberships
SELECT 
  'Users with Multiple Departments' as query_type,
  auth_users.email,
  au.display_name,
  ou.role as org_role,
  COUNT(du.department_id) as dept_count,
  STRING_AGG(d.name || ' (' || du.role || ')', ', ') as departments
FROM app_users au
LEFT JOIN auth.users auth_users ON auth_users.id = au.id
JOIN organization_users ou ON ou.user_id = au.id
JOIN department_users du ON du.user_id = au.id AND du.org_id = ou.org_id
JOIN departments d ON d.id = du.department_id
WHERE ou.org_id = 'YOUR_ORG_ID'  -- Replace with actual org ID
GROUP BY au.id, auth_users.email, au.display_name, ou.role
HAVING COUNT(du.department_id) > 1
ORDER BY auth_users.email;

-- Department leads vs org role mismatches
SELECT 
  'Role Alignment Check' as query_type,
  auth_users.email,
  ou.role as org_role,
  d.name as department_name,
  du.role as dept_role,
  CASE 
    WHEN du.role = 'lead' AND ou.role != 'teamLead' THEN 'MISMATCH: Dept lead but not teamLead org role'
    WHEN ou.role = 'teamLead' AND du.role != 'lead' THEN 'MISMATCH: teamLead org role but not dept lead'
    ELSE 'OK'
  END as alignment_status
FROM app_users au
LEFT JOIN auth.users auth_users ON auth_users.id = au.id
JOIN organization_users ou ON ou.user_id = au.id
JOIN department_users du ON du.user_id = au.id AND du.org_id = ou.org_id
JOIN departments d ON d.id = du.department_id
WHERE ou.org_id = 'YOUR_ORG_ID'  -- Replace with actual org ID
  AND (
    (du.role = 'lead' AND ou.role != 'teamLead') OR
    (ou.role = 'teamLead' AND du.role != 'lead')
  )
ORDER BY auth_users.email;

-- Instructions:
-- 1. Replace 'YOUR_ORG_ID' with: 0eb17226-9124-4963-80e5-d88b211014c4
-- 2. Run each query section to understand:
--    - Complete user overview with all details
--    - Summary by organization roles
--    - Summary by departments
--    - Users missing department assignments
--    - Users with multiple departments
--    - Role alignment issues between org and dept roles
