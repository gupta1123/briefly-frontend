-- Complete Document Linking & Versioning Fix
-- Run this in Supabase SQL Editor to fix all linking and versioning issues

-- ========================================
-- 1. Fix document_links table schema
-- ========================================

-- Add missing columns
ALTER TABLE document_links 
ADD COLUMN IF NOT EXISTS link_type VARCHAR(50) DEFAULT 'related';

ALTER TABLE document_links 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- ========================================
-- 2. Create improved bidirectional linking functions
-- ========================================

-- Function to handle bidirectional linking with version group awareness
CREATE OR REPLACE FUNCTION create_bidirectional_link()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent self-linking
  IF NEW.doc_id = NEW.linked_doc_id THEN
    RETURN NEW;
  END IF;
  
  -- Create reverse link if it doesn't exist
  INSERT INTO document_links (org_id, doc_id, linked_doc_id, link_type, created_at)
  VALUES (NEW.org_id, NEW.linked_doc_id, NEW.doc_id, NEW.link_type, NEW.created_at)
  ON CONFLICT (doc_id, linked_doc_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle bidirectional unlinking
CREATE OR REPLACE FUNCTION remove_bidirectional_link()
RETURNS TRIGGER AS $$
BEGIN
  -- Remove reverse link
  DELETE FROM document_links 
  WHERE org_id = OLD.org_id 
    AND doc_id = OLD.linked_doc_id 
    AND linked_doc_id = OLD.doc_id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Function to propagate links to version groups
CREATE OR REPLACE FUNCTION propagate_version_links()
RETURNS TRIGGER AS $$
DECLARE
  doc1_versions UUID[];
  doc2_versions UUID[];
  v1 UUID;
  v2 UUID;
BEGIN
  -- Get all versions of doc1 (including itself)
  SELECT ARRAY_AGG(id) INTO doc1_versions
  FROM documents 
  WHERE org_id = NEW.org_id 
    AND (version_group_id = (SELECT COALESCE(version_group_id, id) FROM documents WHERE id = NEW.doc_id AND org_id = NEW.org_id)
         OR id = NEW.doc_id);
  
  -- Get all versions of doc2 (including itself)  
  SELECT ARRAY_AGG(id) INTO doc2_versions
  FROM documents 
  WHERE org_id = NEW.org_id 
    AND (version_group_id = (SELECT COALESCE(version_group_id, id) FROM documents WHERE id = NEW.linked_doc_id AND org_id = NEW.org_id)
         OR id = NEW.linked_doc_id);
  
  -- Create links between all version combinations (except original which is already created)
  FOREACH v1 IN ARRAY doc1_versions LOOP
    FOREACH v2 IN ARRAY doc2_versions LOOP
      IF v1 != NEW.doc_id OR v2 != NEW.linked_doc_id THEN
        INSERT INTO document_links (org_id, doc_id, linked_doc_id, link_type, created_at)
        VALUES (NEW.org_id, v1, v2, NEW.link_type, NEW.created_at)
        ON CONFLICT (doc_id, linked_doc_id) DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 3. Create/Update triggers
-- ========================================

-- Drop existing triggers
DROP TRIGGER IF EXISTS trigger_create_bidirectional_link ON document_links;
DROP TRIGGER IF EXISTS trigger_remove_bidirectional_link ON document_links;
DROP TRIGGER IF EXISTS trigger_propagate_version_links ON document_links;

-- Create bidirectional linking trigger
CREATE TRIGGER trigger_create_bidirectional_link
  AFTER INSERT ON document_links
  FOR EACH ROW
  EXECUTE FUNCTION create_bidirectional_link();

-- Create bidirectional unlinking trigger  
CREATE TRIGGER trigger_remove_bidirectional_link
  AFTER DELETE ON document_links
  FOR EACH ROW
  EXECUTE FUNCTION remove_bidirectional_link();

-- Create version propagation trigger (runs after bidirectional)
CREATE TRIGGER trigger_propagate_version_links
  AFTER INSERT ON document_links
  FOR EACH ROW
  EXECUTE FUNCTION propagate_version_links();

-- ========================================
-- 4. Create performance indexes
-- ========================================

CREATE INDEX IF NOT EXISTS idx_document_links_reverse
ON document_links (org_id, linked_doc_id, doc_id);

CREATE INDEX IF NOT EXISTS idx_document_links_type
ON document_links (org_id, link_type);

CREATE INDEX IF NOT EXISTS idx_document_links_created
ON document_links (created_at DESC);

-- Version group performance indexes
CREATE INDEX IF NOT EXISTS idx_documents_version_group
ON documents (org_id, version_group_id, version_number)
WHERE version_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_current_version
ON documents (org_id, version_group_id, is_current_version)
WHERE is_current_version = true;

-- ========================================
-- 5. Fix existing data
-- ========================================

-- Fix any unidirectional links to be bidirectional
WITH existing_links AS (
  SELECT DISTINCT org_id, doc_id, linked_doc_id, link_type, created_at
  FROM document_links dl1
  WHERE NOT EXISTS (
    SELECT 1 FROM document_links dl2 
    WHERE dl2.org_id = dl1.org_id 
      AND dl2.doc_id = dl1.linked_doc_id 
      AND dl2.linked_doc_id = dl1.doc_id
  )
  AND dl1.doc_id != dl1.linked_doc_id
)
INSERT INTO document_links (org_id, doc_id, linked_doc_id, link_type, created_at)
SELECT org_id, linked_doc_id, doc_id, 
       COALESCE(link_type, 'related'), 
       COALESCE(created_at, NOW())
FROM existing_links
ON CONFLICT (doc_id, linked_doc_id) DO NOTHING;

-- Initialize version_group_id for documents that don't have it
UPDATE documents 
SET version_group_id = id 
WHERE version_group_id IS NULL 
  AND version_number IS NOT NULL;

-- ========================================
-- 6. Create helper views for better querying
-- ========================================

-- View to get all relationships for a document (both ways)
CREATE OR REPLACE VIEW document_relationships AS
SELECT DISTINCT 
  d.org_id,
  d.id as document_id,
  d.title as document_title,
  linked.id as related_document_id,
  linked.title as related_document_title,
  dl.link_type,
  dl.created_at as linked_at,
  CASE 
    WHEN d.version_group_id = linked.version_group_id THEN 'version'
    ELSE dl.link_type 
  END as relationship_type
FROM documents d
JOIN document_links dl ON (dl.doc_id = d.id OR dl.linked_doc_id = d.id)
JOIN documents linked ON (
  CASE 
    WHEN dl.doc_id = d.id THEN dl.linked_doc_id = linked.id
    ELSE dl.doc_id = linked.id
  END
)
WHERE d.id != linked.id;

-- ========================================
-- 7. Verification queries
-- ========================================

-- Count bidirectional links
SELECT 
  'Total document links' as metric,
  COUNT(*) as count
FROM document_links
UNION ALL
SELECT 
  'Bidirectional links' as metric,
  COUNT(*) / 2 as count
FROM document_links dl1
WHERE EXISTS (
  SELECT 1 FROM document_links dl2
  WHERE dl2.doc_id = dl1.linked_doc_id 
    AND dl2.linked_doc_id = dl1.doc_id
    AND dl2.org_id = dl1.org_id
);

-- Show sample relationships
SELECT 
  d1.title as document,
  d2.title as linked_to,
  dl.link_type,
  CASE 
    WHEN d1.version_group_id = d2.version_group_id THEN 'Same version group'
    ELSE 'Different documents'
  END as relationship_context
FROM document_links dl
JOIN documents d1 ON dl.doc_id = d1.id
JOIN documents d2 ON dl.linked_doc_id = d2.id
ORDER BY dl.created_at DESC
LIMIT 10;

SELECT 'Document linking system fixed successfully! ✅' as status;