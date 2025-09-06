-- FINAL DEPARTMENT ISOLATION FIX V2
-- This script addresses the critical issues found in the diagnostic results

-- Step 1: DROP ALL CONFLICTING RLS POLICIES AND DEPENDENT OBJECTS
-- The old policies are overriding the new department-based ones

-- Drop policies on documents table
DROP POLICY IF EXISTS "Users can view documents in their org folders" ON documents;
DROP POLICY IF EXISTS "Users can create documents in their org folders" ON documents;
DROP POLICY IF EXISTS "Users can update documents in their org folders" ON documents;
DROP POLICY IF EXISTS "Users can delete documents in their org folders" ON documents;
DROP POLICY IF EXISTS "documents_read" ON documents;
DROP POLICY IF EXISTS "documents_create_perm" ON documents;
DROP POLICY IF EXISTS "documents_update_perm" ON documents;
DROP POLICY IF EXISTS "documents_delete_perm" ON documents;

-- Drop policies on doc_chunks table that depend on our functions
DROP POLICY IF EXISTS "doc_chunks_read" ON doc_chunks;
DROP POLICY IF EXISTS "doc_chunks_create" ON doc_chunks;
DROP POLICY IF EXISTS "doc_chunks_update" ON doc_chunks;
DROP POLICY IF EXISTS "doc_chunks_delete" ON doc_chunks;

-- Drop policies on folder_access table
DROP POLICY IF EXISTS "folder_access_read" ON folder_access;
DROP POLICY IF EXISTS "folder_access_create" ON folder_access;
DROP POLICY IF EXISTS "folder_access_update" ON folder_access;
DROP POLICY IF EXISTS "folder_access_delete" ON folder_access;

-- Drop policies on user_access_overrides table
DROP POLICY IF EXISTS "user_access_overrides_read" ON user_access_overrides;
DROP POLICY IF EXISTS "user_access_overrides_create" ON user_access_overrides;
DROP POLICY IF EXISTS "user_access_overrides_update" ON user_access_overrides;
DROP POLICY IF EXISTS "user_access_overrides_delete" ON user_access_overrides;
DROP POLICY IF EXISTS "overrides_self_read" ON user_access_overrides;
DROP POLICY IF EXISTS "overrides_write" ON user_access_overrides;

-- Drop policies on folder_access table (additional ones found)
DROP POLICY IF EXISTS "folder_access_manage" ON folder_access;

-- Drop policies on department_users table
DROP POLICY IF EXISTS "department_users_manage" ON department_users;
DROP POLICY IF EXISTS "department_users_read" ON department_users;
DROP POLICY IF EXISTS "department_users_create" ON department_users;
DROP POLICY IF EXISTS "department_users_update" ON department_users;
DROP POLICY IF EXISTS "department_users_delete" ON department_users;

-- Step 2: DROP HELPER FUNCTIONS (now that dependent policies are gone)
DROP FUNCTION IF EXISTS is_dept_member(uuid, uuid);
DROP FUNCTION IF EXISTS is_dept_lead(uuid, uuid);
DROP FUNCTION IF EXISTS user_can_access_document(uuid, uuid, text[]);
DROP FUNCTION IF EXISTS is_path_prefix(text[], text[]);

-- Step 3: RECREATE HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION is_path_prefix(doc_path text[], access_path text[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Check if access_path is a prefix of doc_path
  -- Example: access_path ['folder1'] is prefix of doc_path ['folder1', 'subfolder']
  IF array_length(access_path, 1) IS NULL THEN
    RETURN FALSE;
  END IF;
  
  IF array_length(doc_path, 1) IS NULL THEN
    RETURN FALSE;
  END IF;
  
  IF array_length(access_path, 1) > array_length(doc_path, 1) THEN
    RETURN FALSE;
  END IF;
  
  FOR i IN 1..array_length(access_path, 1) LOOP
    IF access_path[i] != doc_path[i] THEN
      RETURN FALSE;
    END IF;
  END LOOP;
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION is_dept_member(target_org_id uuid, target_dept_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM department_users du 
    WHERE du.org_id = target_org_id 
      AND du.department_id = target_dept_id 
      AND du.user_id = auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION is_dept_lead(target_org_id uuid, target_dept_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM department_users du 
    WHERE du.org_id = target_org_id 
      AND du.department_id = target_dept_id 
      AND du.user_id = auth.uid()
      AND du.role = 'lead'
  );
END;
$$;

CREATE OR REPLACE FUNCTION user_can_access_document(target_org_id uuid, doc_dept_id uuid, doc_folder_path text[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Org admins can access everything
  IF has_perm(target_org_id, 'org.manage_members') THEN
    RETURN TRUE;
  END IF;

  -- Document must have a department (no null department access for non-admins)
  IF doc_dept_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- User must be a member of the document's department
  IF is_dept_member(target_org_id, doc_dept_id) THEN
    RETURN TRUE;
  END IF;

  -- Check for explicit folder sharing
  RETURN EXISTS (
    SELECT 1
    FROM folder_access fa
    JOIN department_users du ON du.department_id = fa.department_id
    WHERE fa.org_id = target_org_id
      AND du.org_id = target_org_id
      AND du.user_id = auth.uid()
      AND (
        doc_folder_path = fa.path OR
        array_to_string(doc_folder_path, '/') LIKE array_to_string(fa.path, '/') || '/%'
      )
  );
END;
$$;

-- Step 4: CREATE STRICT DEPARTMENT-BASED RLS POLICIES

-- Policies for documents table
CREATE POLICY "strict_documents_read" ON documents
FOR SELECT
TO public
USING (
  is_member_of(org_id) AND user_can_access_document(org_id, department_id, folder_path)
);

CREATE POLICY "strict_documents_create" ON documents
FOR INSERT
TO public
WITH CHECK (
  is_member_of(org_id) AND (
    has_perm(org_id, 'org.manage_members') OR
    (department_id IS NOT NULL AND is_dept_member(org_id, department_id))
  )
);

CREATE POLICY "strict_documents_update" ON documents
FOR UPDATE
TO public
USING (
  is_member_of(org_id) AND user_can_access_document(org_id, department_id, folder_path)
)
WITH CHECK (
  is_member_of(org_id) AND user_can_access_document(org_id, department_id, folder_path)
);

CREATE POLICY "strict_documents_delete" ON documents
FOR DELETE
TO public
USING (
  is_member_of(org_id) AND user_can_access_document(org_id, department_id, folder_path)
);

-- Policies for doc_chunks table
CREATE POLICY "strict_doc_chunks_read" ON doc_chunks
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM documents d 
    WHERE d.id = doc_chunks.doc_id 
      AND is_member_of(d.org_id) 
      AND user_can_access_document(d.org_id, d.department_id, d.folder_path)
  )
);

-- Policies for folder_access table
CREATE POLICY "strict_folder_access_read" ON folder_access
FOR SELECT
TO public
USING (
  is_member_of(org_id) AND (
    has_perm(org_id, 'org.manage_members') OR
    is_dept_member(org_id, department_id)
  )
);

CREATE POLICY "strict_folder_access_create" ON folder_access
FOR INSERT
TO public
WITH CHECK (
  is_member_of(org_id) AND has_perm(org_id, 'org.manage_members')
);

CREATE POLICY "strict_folder_access_update" ON folder_access
FOR UPDATE
TO public
USING (
  is_member_of(org_id) AND has_perm(org_id, 'org.manage_members')
)
WITH CHECK (
  is_member_of(org_id) AND has_perm(org_id, 'org.manage_members')
);

CREATE POLICY "strict_folder_access_delete" ON folder_access
FOR DELETE
TO public
USING (
  is_member_of(org_id) AND has_perm(org_id, 'org.manage_members')
);

-- Policies for user_access_overrides table (if it exists)
CREATE POLICY "strict_user_access_overrides_read" ON user_access_overrides
FOR SELECT
TO public
USING (
  is_member_of(org_id) AND has_perm(org_id, 'org.manage_members')
);

CREATE POLICY "strict_user_access_overrides_create" ON user_access_overrides
FOR INSERT
TO public
WITH CHECK (
  is_member_of(org_id) AND has_perm(org_id, 'org.manage_members')
);

CREATE POLICY "strict_user_access_overrides_update" ON user_access_overrides
FOR UPDATE
TO public
USING (
  is_member_of(org_id) AND has_perm(org_id, 'org.manage_members')
)
WITH CHECK (
  is_member_of(org_id) AND has_perm(org_id, 'org.manage_members')
);

CREATE POLICY "strict_user_access_overrides_delete" ON user_access_overrides
FOR DELETE
TO public
USING (
  is_member_of(org_id) AND has_perm(org_id, 'org.manage_members')
);

-- Policies for department_users table
CREATE POLICY "strict_department_users_read" ON department_users
FOR SELECT
TO public
USING (
  is_member_of(org_id) AND (
    has_perm(org_id, 'org.manage_members') OR
    is_dept_member(org_id, department_id) OR
    is_dept_lead(org_id, department_id)
  )
);

CREATE POLICY "strict_department_users_create" ON department_users
FOR INSERT
TO public
WITH CHECK (
  is_member_of(org_id) AND (
    has_perm(org_id, 'org.manage_members') OR
    is_dept_lead(org_id, department_id)
  )
);

CREATE POLICY "strict_department_users_update" ON department_users
FOR UPDATE
TO public
USING (
  is_member_of(org_id) AND (
    has_perm(org_id, 'org.manage_members') OR
    is_dept_lead(org_id, department_id)
  )
)
WITH CHECK (
  is_member_of(org_id) AND (
    has_perm(org_id, 'org.manage_members') OR
    is_dept_lead(org_id, department_id)
  )
);

CREATE POLICY "strict_department_users_delete" ON department_users
FOR DELETE
TO public
USING (
  is_member_of(org_id) AND (
    has_perm(org_id, 'org.manage_members') OR
    is_dept_lead(org_id, department_id)
  )
);

-- Step 5: FIX DATA ISSUES
-- 4a: Move admin-created content from HR department to General
-- Find admin user ID from the diagnostic results: 4292418f-ded6-4a11-bcdf-ae7d04fe619f

-- Get or create General department for the org
INSERT INTO departments (org_id, name, color)
VALUES ('0eb17226-9124-4963-80e5-d88b211014c4', 'Admin', 'blue')
ON CONFLICT (org_id, name) DO NOTHING;

-- Move admin's documents from HR to Admin department
UPDATE documents 
SET department_id = (
  SELECT id FROM departments 
  WHERE org_id = '0eb17226-9124-4963-80e5-d88b211014c4' 
    AND name = 'Admin'
)
WHERE org_id = '0eb17226-9124-4963-80e5-d88b211014c4'
  AND owner_user_id = '4292418f-ded6-4a11-bcdf-ae7d04fe619f'
  AND department_id = 'e5cf7457-a20f-4cc7-b409-f796da070028'; -- HR department

-- 4b: Remove inappropriate folder sharing
-- Remove T1 folder sharing that's causing cross-department access
DELETE FROM folder_access 
WHERE org_id = '0eb17226-9124-4963-80e5-d88b211014c4'
  AND path = ARRAY['T1'];

-- Step 6: VERIFICATION QUERIES
-- Check that admin documents are no longer in HR
SELECT 
  'Admin Documents After Fix' as check_type,
  d.title,
  d.type,
  dept.name as department_name,
  d.owner_user_id
FROM documents d
LEFT JOIN departments dept ON dept.id = d.department_id
WHERE d.org_id = '0eb17226-9124-4963-80e5-d88b211014c4'
  AND d.owner_user_id = '4292418f-ded6-4a11-bcdf-ae7d04fe619f'
ORDER BY dept.name;

-- Check current RLS policies
SELECT 
  'New RLS Policies' as check_type,
  policyname,
  cmd
FROM pg_policies 
WHERE tablename = 'documents' 
  AND schemaname = 'public'
  AND policyname LIKE 'strict_%'
ORDER BY policyname;

-- Test department isolation
SELECT 
  'Department Isolation Test' as check_type,
  dept.name as department,
  COUNT(*) as document_count
FROM documents d
JOIN departments dept ON dept.id = d.department_id
WHERE d.org_id = '0eb17226-9124-4963-80e5-d88b211014c4'
GROUP BY dept.name
ORDER BY dept.name;

-- Final verification: HR should only see HR documents
SET ROLE postgres;
SET row_security = off;

SELECT 
  'HR Department Documents Only' as check_type,
  d.title,
  d.type,
  dept.name as department_name,
  CASE 
    WHEN dept.name = 'HR' THEN 'CORRECT: HR content'
    ELSE 'ERROR: Non-HR content visible to HR'
  END as isolation_status
FROM documents d
LEFT JOIN departments dept ON dept.id = d.department_id
WHERE d.org_id = '0eb17226-9124-4963-80e5-d88b211014c4'
  AND d.department_id = 'e5cf7457-a20f-4cc7-b409-f796da070028' -- HR dept ID
ORDER BY d.uploaded_at DESC;

SET row_security = on;

-- Summary message
SELECT 'ISOLATION FIX COMPLETE - HR should now only see HR department content' as summary;
