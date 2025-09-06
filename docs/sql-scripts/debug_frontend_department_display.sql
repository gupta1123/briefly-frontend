-- Debug Frontend Department Display Issue
-- Check if the departments list and document department assignment match

-- 1) Check the Finance department ID that was used in the folder creation
SELECT 
  'Finance Department Info' as check_type,
  id as department_id,
  name as department_name,
  'This should match the departmentId in folder creation request' as note
FROM departments
WHERE org_id = '0eb17226-9124-4963-80e5-d88b211014c4'
  AND name = 'Finance';

-- 2) Verify the folder was actually created in Finance department  
SELECT 
  'Test Finance Folder' as check_type,
  d.id,
  d.title,
  d.department_id,
  dept.name as actual_department,
  'This should show Finance, not General' as expected
FROM documents d
LEFT JOIN departments dept ON dept.id = d.department_id
WHERE d.org_id = '0eb17226-9124-4963-80e5-d88b211014c4'
  AND d.title = '[Folder] Test finance'
  AND d.type = 'folder';

-- 3) Check all departments that should be available to the frontend
SELECT 
  'All Departments List' as check_type,
  id as department_id,
  name as department_name,
  'Frontend should be able to find all these in departments array' as note
FROM departments
WHERE org_id = '0eb17226-9124-4963-80e5-d88b211014c4'
ORDER BY name;

-- 4) Check what the GET /departments API should return
SELECT 
  'API Response Check' as check_type,
  json_build_object(
    'id', id,
    'org_id', org_id,
    'name', name,
    'lead_user_id', lead_user_id,
    'color', color
  ) as department_object
FROM departments
WHERE org_id = '0eb17226-9124-4963-80e5-d88b211014c4'
ORDER BY name;

-- 5) Verify Finance department ID specifically
SELECT 
  'Finance Department ID Verification' as check_type,
  id as finance_dept_id,
  CASE 
    WHEN id = 'ddaa2b2c-07e7-43ed-b94e-6e78b0a62314' THEN 'MATCH: ID matches folder creation request'
    ELSE 'MISMATCH: ID does not match request - this is the problem!'
  END as id_check
FROM departments
WHERE org_id = '0eb17226-9124-4963-80e5-d88b211014c4'
  AND name = 'Finance';

-- Expected results:
-- 1. Finance department should have ID: ddaa2b2c-07e7-43ed-b94e-6e78b0a62314
-- 2. The Test finance folder should have department_id pointing to Finance
-- 3. All departments should be returned by the API
-- 4. If folder shows as "General", it means the frontend lookup is failing
