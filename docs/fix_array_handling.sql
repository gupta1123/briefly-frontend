-- Fix Array Handling for Folder System
-- Run this in Supabase SQL Editor to resolve the array literal error

-- 1. Create function to check if folder exists
CREATE OR REPLACE FUNCTION check_folder_exists(p_org_id uuid, p_folder_path text[])
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT d.id
  FROM documents d
  WHERE d.org_id = p_org_id
    AND d.folder_path = p_folder_path
  LIMIT 1;
END;
$$;

-- 2. Create function to create folder placeholder
CREATE OR REPLACE FUNCTION create_folder_placeholder(
  p_org_id uuid,
  p_owner_user_id uuid,
  p_title text,
  p_filename text,
  p_folder_path text[],
  p_subject text,
  p_description text,
  p_storage_key text
)
RETURNS TABLE(id uuid, title text, folder_path text[])
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO documents (
    org_id,
    owner_user_id,
    title,
    filename,
    type,
    folder_path,
    subject,
    description,
    tags,
    keywords,
    storage_key
  ) VALUES (
    p_org_id,
    p_owner_user_id,
    p_title,
    p_filename,
    'folder',
    p_folder_path,
    p_subject,
    p_description,
    ARRAY['folder', 'placeholder'],
    ARRAY[split_part(p_title, ' ', 2), 'folder'],
    p_storage_key
  ) RETURNING documents.id, documents.title, documents.folder_path INTO v_id, p_title, p_folder_path;
  
  RETURN QUERY SELECT v_id, p_title, p_folder_path;
END;
$$;

-- 3. Grant execute permissions
GRANT EXECUTE ON FUNCTION check_folder_exists(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION create_folder_placeholder(uuid, uuid, text, text, text[], text, text, text) TO authenticated;

-- 4. Test the functions
DO $$
DECLARE
  test_org_id uuid := '00000000-0000-0000-0000-000000000000';
  test_user_id uuid := '00000000-0000-0000-0000-000000000000';
  test_result record;
BEGIN
  -- Test folder creation
  SELECT * INTO test_result FROM create_folder_placeholder(
    test_org_id,
    test_user_id,
    '[Folder] Test',
    'Test.folder',
    ARRAY['Test'],
    'Folder: Test',
    'Test folder placeholder',
    'folders/test/.placeholder'
  );
  
  RAISE NOTICE 'Created folder with ID: %', test_result.id;
  
  -- Clean up test data
  DELETE FROM documents WHERE id = test_result.id;
  
  RAISE NOTICE 'Array handling test completed successfully';
END;
$$; 