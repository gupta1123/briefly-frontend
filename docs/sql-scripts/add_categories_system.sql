-- Add Category Management System to Briefly
-- Run this in Supabase SQL Editor to add category functionality

-- 1. Add categories field to org_settings table
ALTER TABLE org_settings 
ADD COLUMN IF NOT EXISTS categories text[] DEFAULT ARRAY['General', 'Legal', 'Financial', 'HR', 'Marketing', 'Technical', 'Invoice', 'Contract', 'Report', 'Correspondence'];

-- 2. Update existing org_settings records to have default categories
UPDATE org_settings 
SET categories = ARRAY['General', 'Legal', 'Financial', 'HR', 'Marketing', 'Technical', 'Invoice', 'Contract', 'Report', 'Correspondence']
WHERE categories IS NULL OR array_length(categories, 1) IS NULL;

-- 3. Add index for better performance on category searches
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);

-- 4. Add index for org_settings categories
CREATE INDEX IF NOT EXISTS idx_org_settings_categories ON org_settings USING gin(categories);

-- 5. Verify the changes
SELECT 'Categories system successfully added to org_settings!' as status;

-- 6. Show sample of what default categories look like
SELECT org_id, categories 
FROM org_settings 
LIMIT 3;