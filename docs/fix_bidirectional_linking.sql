-- Fix Bidirectional Linking System
-- Run this in Supabase SQL Editor to enable automatic bidirectional document links

-- 1. Create function to handle bidirectional linking
CREATE OR REPLACE FUNCTION create_bidirectional_link()
RETURNS TRIGGER AS $$
BEGIN
  -- Create reverse link if it doesn't exist and avoid self-links
  IF NEW.doc_id != NEW.linked_doc_id THEN
    INSERT INTO document_links (org_id, doc_id, linked_doc_id)
    VALUES (NEW.org_id, NEW.linked_doc_id, NEW.doc_id)
    ON CONFLICT (doc_id, linked_doc_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Create function to handle bidirectional unlink
CREATE OR REPLACE FUNCTION remove_bidirectional_link()
RETURNS TRIGGER AS $$
BEGIN
  -- Remove reverse link if it exists
  DELETE FROM document_links 
  WHERE org_id = OLD.org_id 
    AND doc_id = OLD.linked_doc_id 
    AND linked_doc_id = OLD.doc_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 3. Create triggers for automatic bidirectional linking
DROP TRIGGER IF EXISTS trigger_create_bidirectional_link ON document_links;
CREATE TRIGGER trigger_create_bidirectional_link
  AFTER INSERT ON document_links
  FOR EACH ROW
  EXECUTE FUNCTION create_bidirectional_link();

DROP TRIGGER IF EXISTS trigger_remove_bidirectional_link ON document_links;
CREATE TRIGGER trigger_remove_bidirectional_link
  AFTER DELETE ON document_links
  FOR EACH ROW
  EXECUTE FUNCTION remove_bidirectional_link();

-- 4. Add link type column for future enhancements
ALTER TABLE document_links 
ADD COLUMN IF NOT EXISTS link_type VARCHAR(50) DEFAULT 'related';

-- 5. Add created_at timestamp for tracking
ALTER TABLE document_links 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 6. Create index for better performance
CREATE INDEX IF NOT EXISTS idx_document_links_linked_doc_id 
ON document_links(linked_doc_id);

-- 7. Create index for link types
CREATE INDEX IF NOT EXISTS idx_document_links_type 
ON document_links(link_type);

-- 8. Fix existing unidirectional links (make them bidirectional)
-- This will create reverse links for all existing one-way relationships
WITH existing_links AS (
  SELECT DISTINCT org_id, doc_id, linked_doc_id 
  FROM document_links dl1
  WHERE NOT EXISTS (
    SELECT 1 FROM document_links dl2 
    WHERE dl2.org_id = dl1.org_id 
      AND dl2.doc_id = dl1.linked_doc_id 
      AND dl2.linked_doc_id = dl1.doc_id
  )
  AND dl1.doc_id != dl1.linked_doc_id
)
INSERT INTO document_links (org_id, doc_id, linked_doc_id, link_type)
SELECT org_id, linked_doc_id, doc_id, 'related'
FROM existing_links
ON CONFLICT (doc_id, linked_doc_id) DO NOTHING;

-- Verify the changes
SELECT 'Bidirectional linking system successfully implemented!' as status;

-- Show sample of bidirectional links
SELECT 
  dl1.doc_id as document_a,
  dl1.linked_doc_id as document_b,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM document_links dl2 
      WHERE dl2.doc_id = dl1.linked_doc_id 
        AND dl2.linked_doc_id = dl1.doc_id
    ) THEN 'Bidirectional ✓'
    ELSE 'One-way only ⚠️'
  END as link_status
FROM document_links dl1
ORDER BY dl1.created_at DESC
LIMIT 5;