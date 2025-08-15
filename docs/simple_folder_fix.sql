-- Simple Folder System Fix
-- Run this in Supabase SQL Editor to resolve 500 errors

-- 1. Ensure folder_path column exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'documents' AND column_name = 'folder_path'
    ) THEN
        ALTER TABLE documents ADD COLUMN folder_path text[] DEFAULT '{}';
    END IF;
END $$;

-- 2. Set folder_path to not null with default
ALTER TABLE documents ALTER COLUMN folder_path SET NOT NULL;
ALTER TABLE documents ALTER COLUMN folder_path SET DEFAULT '{}';

-- 3. Create folder path index
CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents USING gin(folder_path);

-- 4. Remove the problematic unique constraint that prevents folder creation
DO $$
BEGIN
    -- Drop the unique constraint if it exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'documents_org_id_content_hash_key' 
        AND conrelid = 'documents'::regclass
    ) THEN
        ALTER TABLE documents DROP CONSTRAINT documents_org_id_content_hash_key;
    END IF;
END $$;

-- 5. Grant permissions
GRANT ALL ON documents TO authenticated;

-- 6. Add comment
COMMENT ON COLUMN documents.folder_path IS 'Array of folder names representing the path to this document. Empty array means root level.'; 