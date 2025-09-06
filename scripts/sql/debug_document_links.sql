-- Debug queries for document linking issues
-- Run these in Supabase SQL Editor to diagnose the problem

-- 1. Check if the document exists and get basic info
SELECT id, title, filename, type, org_id, version_group_id, is_current_version, uploaded_at
FROM documents 
WHERE id = 'b40630d2-f22a-4426-93bc-1c042ccb99e9';

-- 2. Check if document_links table exists and has data
SELECT COUNT(*) as total_links FROM document_links;

-- 3. Check for any links involving this specific document (both directions)
SELECT 
    dl.doc_id,
    dl.linked_doc_id,
    dl.link_type,
    dl.created_at,
    d1.title as doc_title,
    d2.title as linked_doc_title
FROM document_links dl
LEFT JOIN documents d1 ON dl.doc_id = d1.id
LEFT JOIN documents d2 ON dl.linked_doc_id = d2.id
WHERE dl.doc_id = 'b40630d2-f22a-4426-93bc-1c042ccb99e9' 
   OR dl.linked_doc_id = 'b40630d2-f22a-4426-93bc-1c042ccb99e9';

-- 4. Check the structure of document_links table
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'document_links' 
ORDER BY ordinal_position;

-- 5. Check if there are any triggers on document_links table
SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'document_links';

-- 6. Check if document_links table has the new columns we added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'document_links' 
ORDER BY ordinal_position;

-- 7. Check all documents in the same org to see basic info
SELECT id, title, filename, type, version_group_id
FROM documents 
WHERE org_id = (SELECT org_id FROM documents WHERE id = 'b40630d2-f22a-4426-93bc-1c042ccb99e9')
LIMIT 10;

-- 8. Check if the new relationships endpoint data would return anything
-- (This simulates what the backend /relationships endpoint should return)
WITH target_doc AS (
  SELECT org_id FROM documents WHERE id = 'b40630d2-f22a-4426-93bc-1c042ccb99e9'
),
all_links AS (
  SELECT doc_id, linked_doc_id, link_type, created_at
  FROM document_links 
  WHERE org_id = (SELECT org_id FROM target_doc)
    AND (doc_id = 'b40630d2-f22a-4426-93bc-1c042ccb99e9' 
         OR linked_doc_id = 'b40630d2-f22a-4426-93bc-1c042ccb99e9')
),
related_ids AS (
  SELECT DISTINCT 
    CASE 
      WHEN doc_id = 'b40630d2-f22a-4426-93bc-1c042ccb99e9' THEN linked_doc_id
      ELSE doc_id 
    END as related_id
  FROM all_links
)
SELECT 
  d.id,
  d.title,
  d.type,
  d.version_group_id,
  d.is_current_version
FROM documents d
JOIN related_ids r ON d.id = r.related_id
WHERE d.org_id = (SELECT org_id FROM target_doc);