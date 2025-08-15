-- Fix Folder System Database Issues
-- Run this in Supabase SQL Editor to resolve 500 errors

-- 1. Check if folder_path column exists and add it if missing
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'documents' AND column_name = 'folder_path'
    ) THEN
        ALTER TABLE documents ADD COLUMN folder_path text[] DEFAULT '{}';
    END IF;
END $$;

-- 2. Ensure folder_path is not null and has default
ALTER TABLE documents ALTER COLUMN folder_path SET NOT NULL;
ALTER TABLE documents ALTER COLUMN folder_path SET DEFAULT '{}';

-- 3. Create the folder path index if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents USING gin(folder_path);

-- 4. Remove the problematic unique constraint if it exists
DO $$
BEGIN
    -- Check if the unique constraint exists and drop it
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'documents_org_id_content_hash_key' 
        AND conrelid = 'documents'::regclass
    ) THEN
        ALTER TABLE documents DROP CONSTRAINT documents_org_id_content_hash_key;
    END IF;
    
    -- Also drop any existing partial index with the same name
    DROP INDEX IF EXISTS documents_org_id_content_hash_unique;
END $$;

-- 5. Add a new unique constraint that excludes folder placeholders
-- Note: PostgreSQL doesn't support WHERE clauses in UNIQUE constraints like this
-- We'll use a partial index instead
CREATE UNIQUE INDEX IF NOT EXISTS documents_org_id_content_hash_unique 
ON documents (org_id, content_hash) 
WHERE content_hash IS NOT NULL AND type != 'folder';

-- 6. Grant necessary permissions
GRANT ALL ON documents TO authenticated;

-- 7. Test the folder system by creating a test folder placeholder
-- (This will help identify any remaining issues)
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
    '00000000-0000-0000-0000-000000000000', -- Replace with actual org_id for testing
    '00000000-0000-0000-0000-000000000000', -- Replace with actual user_id for testing
    '[Folder] Test',
    'Test.folder',
    'folder',
    ARRAY['Test'],
    'Folder: Test',
    'Test folder placeholder',
    ARRAY['folder', 'placeholder'],
    ARRAY['Test', 'folder'],
    'folders/test/.placeholder'
) ON CONFLICT DO NOTHING;

-- 8. Clean up test data
DELETE FROM documents 
WHERE org_id = '00000000-0000-0000-0000-000000000000' 
AND title = '[Folder] Test';

-- 9. Add comments for documentation
COMMENT ON COLUMN documents.folder_path IS 'Array of folder names representing the path to this document. Empty array means root level.'; 