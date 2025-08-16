-- Check the version relationship
SELECT 
  id,
  title,
  filename,
  version_group_id,
  version_number,
  is_current_version,
  uploaded_at
FROM documents 
WHERE id = 'b40630d2-f22a-4426-93bc-1c042ccb99e9' 
   OR version_group_id = 'b40630d2-f22a-4426-93bc-1c042ccb99e9'
ORDER BY uploaded_at;