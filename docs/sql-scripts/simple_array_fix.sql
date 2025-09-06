-- Simple Array Fix for Folder System
-- Run this in Supabase SQL Editor

-- 1. Ensure folder_path column exists and is properly configured
DO $$ 
BEGIN
    -- Add folder_path column if it doesn't exist
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

-- 6. Success message
SELECT 'Folder system database setup completed successfully!' as status; 

-- 7. Add function for robust folder_path updates via Supabase RPC
CREATE OR REPLACE FUNCTION update_document_folder_path(doc_id uuid, new_folder_path text[])
RETURNS void AS $$
BEGIN
  UPDATE documents SET folder_path = new_folder_path WHERE id = doc_id;
END;
$$ LANGUAGE plpgsql; 