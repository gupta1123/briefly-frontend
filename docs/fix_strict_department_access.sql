-- Fix Strict Department Access Control
-- This script ensures documents and folders are properly isolated by department
-- and only accessible to intended teams unless explicitly shared

-- 1) Create helper function to check if user has access to a specific document via department membership or sharing
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
    -- User is member of the document's department
    (p_department_id IS NOT NULL AND is_dept_member(p_org_id, p_department_id))
    OR
    -- Document is in a folder that has been shared with user's department
    EXISTS (
      SELECT 1 FROM folder_access fa
      JOIN department_users du ON du.org_id = fa.org_id 
        AND du.department_id = fa.department_id 
        AND du.user_id = auth.uid()
      WHERE fa.org_id = p_org_id
        AND is_path_prefix(p_folder_path, fa.path)
    );
$$;

-- 2) Update documents RLS policy to be strictly department-based
-- NO MORE null department_id documents visible to all users
DROP POLICY IF EXISTS documents_read ON documents;
CREATE POLICY documents_read ON documents
  FOR SELECT USING (
    is_member_of(org_id) AND user_can_access_document(org_id, department_id, folder_path)
  );

-- 3) Ensure document creation requires proper department assignment
DROP POLICY IF EXISTS documents_create_perm ON documents;
CREATE POLICY documents_create_perm ON documents
  FOR INSERT WITH CHECK (
    has_perm(org_id, 'documents.create') AND (
      -- Must specify a department unless you're an admin
      (department_id IS NOT NULL AND (
        has_perm(org_id, 'org.manage_members')
        OR is_dept_member(org_id, department_id)
      ))
      OR 
      -- Only admins can create documents without department (and they should be restricted)
      (department_id IS NULL AND has_perm(org_id, 'org.manage_members'))
    )
  );

-- 4) Update document modification policies
DROP POLICY IF EXISTS documents_update_perm ON documents;
CREATE POLICY documents_update_perm ON documents
  FOR UPDATE USING (
    has_perm(org_id, 'documents.update') AND user_can_access_document(org_id, department_id, folder_path)
  );

DROP POLICY IF EXISTS documents_delete_perm ON documents;
CREATE POLICY documents_delete_perm ON documents
  FOR DELETE USING (
    has_perm(org_id, 'documents.delete') AND user_can_access_document(org_id, department_id, folder_path)
  );

-- 5) Handle existing documents with null department_id
-- Move them to General department or create a private admin department
DO $$
DECLARE
  org_record RECORD;
  general_dept_id uuid;
  admin_dept_id uuid;
BEGIN
  FOR org_record IN SELECT DISTINCT org_id FROM documents WHERE department_id IS NULL
  LOOP
    -- Try to find General department
    SELECT id INTO general_dept_id
    FROM departments 
    WHERE org_id = org_record.org_id AND name = 'General'
    LIMIT 1;
    
    -- If no General department, try to find Admin department
    IF general_dept_id IS NULL THEN
      SELECT id INTO admin_dept_id
      FROM departments 
      WHERE org_id = org_record.org_id AND name = 'Admin'
      LIMIT 1;
      
      -- If no Admin department, create one
      IF admin_dept_id IS NULL THEN
        INSERT INTO departments (org_id, name)
        VALUES (org_record.org_id, 'Admin')
        ON CONFLICT (org_id, name) DO NOTHING
        RETURNING id INTO admin_dept_id;
        
        -- If still null due to conflict, get the existing one
        IF admin_dept_id IS NULL THEN
          SELECT id INTO admin_dept_id
          FROM departments 
          WHERE org_id = org_record.org_id AND name = 'Admin'
          LIMIT 1;
        END IF;
      END IF;
      
      general_dept_id := admin_dept_id;
    END IF;
    
    -- Update documents with null department_id to use General/Admin department
    UPDATE documents 
    SET department_id = general_dept_id
    WHERE org_id = org_record.org_id AND department_id IS NULL;
    
    RAISE NOTICE 'Updated null department documents for org % to department %', org_record.org_id, general_dept_id;
  END LOOP;
END $$;

-- 6) Create a function to validate department access during document/folder creation
CREATE OR REPLACE FUNCTION validate_department_access(p_org_id uuid, p_department_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY definer
SET search_path = public
AS $$
  SELECT 
    -- Org admins can create in any department
    has_perm(p_org_id, 'org.manage_members')
    OR 
    -- User must be member of the target department
    EXISTS (
      SELECT 1 FROM department_users du
      WHERE du.org_id = p_org_id
        AND du.department_id = p_department_id
        AND du.user_id = p_user_id
    );
$$;

-- 7) Add constraint to prevent null department_id on new documents (optional - uncomment if desired)
-- ALTER TABLE documents ADD CONSTRAINT documents_require_department 
--   CHECK (department_id IS NOT NULL OR has_perm(org_id, 'org.manage_members'));

-- 8) Create audit logging for department access violations (optional)
CREATE OR REPLACE FUNCTION log_department_access_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY definer
SET search_path = public
AS $$
BEGIN
  -- Log when someone tries to access a document they shouldn't have access to
  IF TG_OP = 'SELECT' AND NOT user_can_access_document(NEW.org_id, NEW.department_id, NEW.folder_path) THEN
    INSERT INTO audit_events (org_id, user_id, action, metadata)
    VALUES (
      NEW.org_id, 
      auth.uid(), 
      'unauthorized_document_access_attempt',
      jsonb_build_object(
        'document_id', NEW.id,
        'document_title', NEW.title,
        'department_id', NEW.department_id,
        'folder_path', NEW.folder_path
      )
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Uncomment to enable audit logging:
-- DROP TRIGGER IF EXISTS documents_access_audit ON documents;
-- CREATE TRIGGER documents_access_audit
--   AFTER SELECT ON documents
--   FOR EACH ROW
--   EXECUTE FUNCTION log_department_access_attempt();

-- 9) Verification queries
DO $$
DECLARE
  total_docs INTEGER;
  null_dept_docs INTEGER;
  admin_accessible INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_docs FROM documents;
  SELECT COUNT(*) INTO null_dept_docs FROM documents WHERE department_id IS NULL;
  
  RAISE NOTICE 'Total documents: %, Documents with null department: %', total_docs, null_dept_docs;
  
  IF null_dept_docs > 0 THEN
    RAISE WARNING 'There are still % documents with null department_id - consider running the migration above', null_dept_docs;
  ELSE
    RAISE NOTICE 'All documents now have proper department assignments';
  END IF;
END $$;

RAISE NOTICE 'Strict department access control implemented successfully';
RAISE NOTICE 'Key changes:';
RAISE NOTICE '- Documents now require department assignment for non-admins';
RAISE NOTICE '- No more automatic access to null department documents';  
RAISE NOTICE '- Proper isolation between departments';
RAISE NOTICE '- Folder sharing still works via folder_access table';
