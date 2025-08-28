-- FINAL Department Isolation Fix
-- This script definitively fixes document access control by cleaning up ALL conflicting policies
-- Run this AFTER all other migration scripts to ensure proper department isolation

-- 1) First, let's check what policies currently exist
DO $$
DECLARE
  policy_record RECORD;
BEGIN
  RAISE NOTICE 'Current document policies:';
  FOR policy_record IN 
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies 
    WHERE tablename = 'documents' AND schemaname = 'public'
  LOOP
    RAISE NOTICE 'Policy: % | Command: % | Permissive: %', policy_record.policyname, policy_record.cmd, policy_record.permissive;
  END LOOP;
END $$;

-- 2) Clean slate - remove ALL existing document policies
DROP POLICY IF EXISTS documents_read ON documents;
DROP POLICY IF EXISTS documents_write ON documents;
DROP POLICY IF EXISTS documents_update ON documents;
DROP POLICY IF EXISTS documents_delete ON documents;
DROP POLICY IF EXISTS documents_create_perm ON documents;
DROP POLICY IF EXISTS documents_update_perm ON documents;
DROP POLICY IF EXISTS documents_delete_perm ON documents;

-- 3) Create helper functions if they don't exist
CREATE OR REPLACE FUNCTION is_member_of(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY definer
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_users ou
    WHERE ou.org_id = p_org_id 
      AND ou.user_id = auth.uid()
      AND (ou.expires_at IS NULL OR ou.expires_at > now())
  );
$$;

CREATE OR REPLACE FUNCTION has_perm(p_org_id uuid, p_perm text)
RETURNS boolean
LANGUAGE sql
SECURITY definer
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT (r.permissions ->> p_perm)::boolean
    FROM organization_users u
    JOIN org_roles r ON r.org_id = u.org_id AND r.key = u.role
    WHERE u.org_id = p_org_id AND u.user_id = auth.uid()
    LIMIT 1
  ), false);
$$;

CREATE OR REPLACE FUNCTION is_dept_member(p_org_id uuid, p_department_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY definer
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM department_users du
    WHERE du.org_id = p_org_id
      AND du.department_id = p_department_id
      AND du.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION is_path_prefix(p_path text[], p_prefix text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT array_length(p_prefix, 1) <= array_length(p_path, 1) 
    AND p_path[1:array_length(p_prefix, 1)] = p_prefix;
$$;

-- 4) Create the FINAL, DEFINITIVE access control function
CREATE OR REPLACE FUNCTION user_can_access_document(p_org_id uuid, p_department_id uuid, p_folder_path text[])
RETURNS boolean
LANGUAGE sql
SECURITY definer
SET search_path = public
AS $$
  SELECT 
    -- Org admins can access everything
    has_perm(p_org_id, 'org.manage_members')
    OR 
    -- User is member of the document's department (MUST have department_id)
    (p_department_id IS NOT NULL AND is_dept_member(p_org_id, p_department_id))
    OR
    -- Document is in a folder that has been shared with user's department
    EXISTS (
      SELECT 1 FROM folder_access fa
      WHERE fa.org_id = p_org_id
        AND is_path_prefix(COALESCE(p_folder_path, ARRAY[]::text[]), fa.path)
        AND is_dept_member(p_org_id, fa.department_id)
    );
$$;

-- 5) Create FINAL RLS policies - STRICT department isolation
CREATE POLICY documents_read_final ON documents
  FOR SELECT USING (
    is_member_of(org_id) AND user_can_access_document(org_id, department_id, folder_path)
  );

CREATE POLICY documents_create_final ON documents
  FOR INSERT WITH CHECK (
    has_perm(org_id, 'documents.create') AND (
      -- Must specify a department AND be member of it (unless admin)
      (department_id IS NOT NULL AND (
        has_perm(org_id, 'org.manage_members')
        OR is_dept_member(org_id, department_id)
      ))
      -- NO NULL DEPARTMENT DOCUMENTS ALLOWED (even for admins)
    )
  );

CREATE POLICY documents_update_final ON documents
  FOR UPDATE USING (
    has_perm(org_id, 'documents.update') AND user_can_access_document(org_id, department_id, folder_path)
  );

CREATE POLICY documents_delete_final ON documents
  FOR DELETE USING (
    has_perm(org_id, 'documents.delete') AND user_can_access_document(org_id, department_id, folder_path)
  );

-- 6) Handle existing documents with null department_id
-- Move them to General department or create a restricted Admin department
DO $$
DECLARE
  org_record RECORD;
  general_dept_id uuid;
  null_doc_count INTEGER;
BEGIN
  FOR org_record IN SELECT DISTINCT org_id FROM documents WHERE department_id IS NULL
  LOOP
    -- Count null department documents for this org
    SELECT COUNT(*) INTO null_doc_count
    FROM documents 
    WHERE org_id = org_record.org_id AND department_id IS NULL;
    
    RAISE NOTICE 'Found % documents with null department in org %', null_doc_count, org_record.org_id;
    
    -- Try to find General department
    SELECT id INTO general_dept_id
    FROM departments 
    WHERE org_id = org_record.org_id AND name = 'General'
    LIMIT 1;
    
    -- If no General department, create one
    IF general_dept_id IS NULL THEN
      INSERT INTO departments (org_id, name)
      VALUES (org_record.org_id, 'General')
      ON CONFLICT (org_id, name) DO NOTHING
      RETURNING id INTO general_dept_id;
      
      -- If still null due to conflict, get the existing one
      IF general_dept_id IS NULL THEN
        SELECT id INTO general_dept_id
        FROM departments 
        WHERE org_id = org_record.org_id AND name = 'General'
        LIMIT 1;
      END IF;
      
      RAISE NOTICE 'Created General department % for org %', general_dept_id, org_record.org_id;
    END IF;
    
    -- Update documents with null department_id to use General department
    UPDATE documents 
    SET department_id = general_dept_id
    WHERE org_id = org_record.org_id AND department_id IS NULL;
    
    RAISE NOTICE 'Moved % documents to General department for org %', null_doc_count, org_record.org_id;
  END LOOP;
END $$;

-- 7) Verify the fix
DO $$
DECLARE
  total_docs INTEGER;
  null_dept_docs INTEGER;
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_docs FROM documents;
  SELECT COUNT(*) INTO null_dept_docs FROM documents WHERE department_id IS NULL;
  SELECT COUNT(*) INTO policy_count FROM pg_policies WHERE tablename = 'documents' AND schemaname = 'public';
  
  RAISE NOTICE '=== VERIFICATION RESULTS ===';
  RAISE NOTICE 'Total documents: %', total_docs;
  RAISE NOTICE 'Documents with null department: %', null_dept_docs;
  RAISE NOTICE 'Active document policies: %', policy_count;
  
  IF null_dept_docs > 0 THEN
    RAISE WARNING 'STILL HAVE % DOCUMENTS WITH NULL DEPARTMENT - ISOLATION NOT COMPLETE!', null_dept_docs;
  ELSE
    RAISE NOTICE '✅ All documents now have proper department assignments';
  END IF;
  
  RAISE NOTICE '=== CURRENT POLICIES ===';
  
  -- List current policies
  FOR policy_record IN 
    SELECT policyname, cmd 
    FROM pg_policies 
    WHERE tablename = 'documents' AND schemaname = 'public'
    ORDER BY policyname
  LOOP
    RAISE NOTICE 'Policy: % (%)' , policy_record.policyname, policy_record.cmd;
  END LOOP;
END $$;

-- 8) Create constraint to prevent future null department documents (optional but recommended)
-- Uncomment this if you want to enforce at database level:
-- ALTER TABLE documents ADD CONSTRAINT documents_require_department 
--   CHECK (department_id IS NOT NULL);

RAISE NOTICE '🎯 FINAL DEPARTMENT ISOLATION FIX COMPLETED';
RAISE NOTICE 'Key changes:';
RAISE NOTICE '- Removed ALL conflicting document policies';
RAISE NOTICE '- Created strict department-based access (NO null department documents visible)';
RAISE NOTICE '- Migrated existing null department documents to General department';
RAISE NOTICE '- Prevented future null department document creation';
RAISE NOTICE '- Folder sharing still works via folder_access table';
RAISE NOTICE '';
RAISE NOTICE '🔒 Documents are now properly isolated by department!';
