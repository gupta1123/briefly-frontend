-- Folder System Database Updates
-- Run this in Supabase SQL Editor to ensure folder functionality works properly

-- 1. Ensure the folder_path column exists and has proper constraints
DO $$ 
BEGIN
    -- Add folder_path column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'documents' AND column_name = 'folder_path'
    ) THEN
        ALTER TABLE documents ADD COLUMN folder_path text[] DEFAULT '{}';
    END IF;
    
    -- Ensure folder_path is not null
    ALTER TABLE documents ALTER COLUMN folder_path SET NOT NULL;
    ALTER TABLE documents ALTER COLUMN folder_path SET DEFAULT '{}';
END $$;

-- 2. Create or recreate the folder path index for efficient queries
DROP INDEX IF EXISTS idx_documents_folder;
CREATE INDEX idx_documents_folder ON documents USING gin(folder_path);

-- 3. Add a function to validate folder paths
CREATE OR REPLACE FUNCTION validate_folder_path(path_array text[])
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
    -- Check if any path segment contains invalid characters
    FOR i IN 1..array_length(path_array, 1) LOOP
        IF path_array[i] ~ '[<>:"/\\|?*]' THEN
            RETURN false;
        END IF;
        
        -- Check for empty segments
        IF path_array[i] = '' OR path_array[i] IS NULL THEN
            RETURN false;
        END IF;
    END LOOP;
    
    RETURN true;
END;
$$;

-- 4. Add a trigger to validate folder paths on insert/update
CREATE OR REPLACE FUNCTION validate_document_folder_path()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.folder_path IS NOT NULL AND NOT validate_folder_path(NEW.folder_path) THEN
        RAISE EXCEPTION 'Invalid folder path: contains invalid characters or empty segments';
    END IF;
    
    RETURN NEW;
END;
$$;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS trigger_validate_folder_path ON documents;

-- Create trigger
CREATE TRIGGER trigger_validate_folder_path
    BEFORE INSERT OR UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION validate_document_folder_path();

-- 5. Add a function to get folder hierarchy
CREATE OR REPLACE FUNCTION get_folder_hierarchy(org_id uuid, parent_path text[] DEFAULT '{}')
RETURNS TABLE(folder_name text, full_path text[], document_count bigint)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        folder_path[array_length(parent_path, 1) + 1] as folder_name,
        folder_path as full_path,
        COUNT(*) as document_count
    FROM documents 
    WHERE documents.org_id = get_folder_hierarchy.org_id
        AND array_length(folder_path, 1) = array_length(parent_path, 1) + 1
        AND (array_length(parent_path, 1) = 0 OR folder_path[1:array_length(parent_path, 1)] = parent_path)
    GROUP BY folder_path
    ORDER BY folder_path[array_length(parent_path, 1) + 1];
END;
$$;

-- 6. Add RLS policies for folder operations
-- Ensure users can only access folders in their organization
DROP POLICY IF EXISTS "Users can view documents in their org folders" ON documents;
CREATE POLICY "Users can view documents in their org folders" ON documents
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM organization_users 
            WHERE user_id = auth.uid() 
            AND (expires_at IS NULL OR expires_at > now())
        )
    );

-- Ensure users can create documents (including folder placeholders) in their org
DROP POLICY IF EXISTS "Users can create documents in their org folders" ON documents;
CREATE POLICY "Users can create documents in their org folders" ON documents
    FOR INSERT WITH CHECK (
        org_id IN (
            SELECT org_id FROM organization_users 
            WHERE user_id = auth.uid() 
            AND (expires_at IS NULL OR expires_at > now())
            AND role IN ('orgAdmin', 'contentManager')
        )
    );

-- Ensure users can update documents in their org folders
DROP POLICY IF EXISTS "Users can update documents in their org folders" ON documents;
CREATE POLICY "Users can update documents in their org folders" ON documents
    FOR UPDATE USING (
        org_id IN (
            SELECT org_id FROM organization_users 
            WHERE user_id = auth.uid() 
            AND (expires_at IS NULL OR expires_at > now())
            AND role IN ('orgAdmin', 'contentManager')
        )
    );

-- Ensure users can delete documents in their org folders
DROP POLICY IF EXISTS "Users can delete documents in their org folders" ON documents;
CREATE POLICY "Users can delete documents in their org folders" ON documents
    FOR DELETE USING (
        org_id IN (
            SELECT org_id FROM organization_users 
            WHERE user_id = auth.uid() 
            AND (expires_at IS NULL OR expires_at > now())
            AND role IN ('orgAdmin', 'contentManager')
        )
    );

-- 7. Grant necessary permissions
GRANT EXECUTE ON FUNCTION validate_folder_path(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_folder_hierarchy(uuid, text[]) TO authenticated;

-- 8. Create a view for easier folder queries
CREATE OR REPLACE VIEW folder_view AS
SELECT 
    org_id,
    folder_path,
    array_length(folder_path, 1) as depth,
    folder_path[array_length(folder_path, 1)] as folder_name,
    COUNT(*) as document_count,
    COUNT(*) FILTER (WHERE type = 'folder') as folder_count,
    COUNT(*) FILTER (WHERE type != 'folder') as file_count
FROM documents 
WHERE folder_path IS NOT NULL AND array_length(folder_path, 1) > 0
GROUP BY org_id, folder_path
ORDER BY folder_path;

-- Grant access to the view
GRANT SELECT ON folder_view TO authenticated;

-- 9. Add comments for documentation
COMMENT ON COLUMN documents.folder_path IS 'Array of folder names representing the path to this document. Empty array means root level.';
COMMENT ON FUNCTION validate_folder_path(text[]) IS 'Validates that folder path segments do not contain invalid characters';
COMMENT ON FUNCTION get_folder_hierarchy(uuid, text[]) IS 'Returns folder hierarchy for an organization at a given parent path';
COMMENT ON VIEW folder_view IS 'View providing folder statistics and hierarchy information';

-- 10. Add a function to clean up empty folders
CREATE OR REPLACE FUNCTION cleanup_empty_folders(org_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_count integer := 0;
    folder_record record;
BEGIN
    -- Find and delete placeholder documents for empty folders
    FOR folder_record IN 
        SELECT id, folder_path 
        FROM documents 
        WHERE org_id = cleanup_empty_folders.org_id
            AND type = 'folder'
            AND title LIKE '[Folder]%'
            AND NOT EXISTS (
                SELECT 1 FROM documents d2 
                WHERE d2.org_id = documents.org_id 
                    AND d2.folder_path = documents.folder_path
                    AND d2.type != 'folder'
            )
    LOOP
        DELETE FROM documents WHERE id = folder_record.id;
        deleted_count := deleted_count + 1;
    END LOOP;
    
    RETURN deleted_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION cleanup_empty_folders(uuid) TO authenticated;

COMMENT ON FUNCTION cleanup_empty_folders(uuid) IS 'Removes placeholder documents for folders that have no actual documents'; 