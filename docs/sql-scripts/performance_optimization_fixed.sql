-- Performance Optimization for Briefly Application (CORRECTED VERSION)
-- Run this in Supabase SQL Editor to add comprehensive indexes for faster queries
-- This version uses the correct column names based on the actual schema

-- =========================================
-- DOCUMENTS TABLE OPTIMIZATION
-- =========================================

-- 1. Core search indexes (using actual column names)
CREATE INDEX IF NOT EXISTS idx_documents_title_search 
ON documents USING gin(to_tsvector('english', title));

CREATE INDEX IF NOT EXISTS idx_documents_subject_search 
ON documents USING gin(to_tsvector('english', subject));

CREATE INDEX IF NOT EXISTS idx_documents_description_search 
ON documents USING gin(to_tsvector('english', description));

-- 2. Metadata search indexes
CREATE INDEX IF NOT EXISTS idx_documents_sender_lower 
ON documents (org_id, lower(sender));

CREATE INDEX IF NOT EXISTS idx_documents_receiver_lower 
ON documents (org_id, lower(receiver));

CREATE INDEX IF NOT EXISTS idx_documents_type 
ON documents (org_id, type);

-- 3. Date-based queries
CREATE INDEX IF NOT EXISTS idx_documents_upload_date 
ON documents (org_id, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_document_date 
ON documents (org_id, document_date DESC);

-- 4. Version management indexes
CREATE INDEX IF NOT EXISTS idx_documents_version_group 
ON documents (org_id, version_group_id, version_number);

CREATE INDEX IF NOT EXISTS idx_documents_current_version 
ON documents (org_id, is_current_version, version_group_id) 
WHERE is_current_version = true;

-- 5. Folder and organization indexes
CREATE INDEX IF NOT EXISTS idx_documents_folder_path 
ON documents USING gin(folder_path);

CREATE INDEX IF NOT EXISTS idx_documents_org_folder 
ON documents (org_id, folder_path);

-- 6. Tag and keyword search
CREATE INDEX IF NOT EXISTS idx_documents_tags 
ON documents USING gin(tags);

CREATE INDEX IF NOT EXISTS idx_documents_keywords 
ON documents USING gin(keywords);

-- 7. Content hash for deduplication
CREATE INDEX IF NOT EXISTS idx_documents_content_hash 
ON documents (org_id, content_hash) 
WHERE content_hash IS NOT NULL;

-- 8. Storage key lookups
CREATE INDEX IF NOT EXISTS idx_documents_storage_key 
ON documents (storage_key) 
WHERE storage_key IS NOT NULL;

-- 9. MIME type for file operations
CREATE INDEX IF NOT EXISTS idx_documents_mime_type 
ON documents (org_id, mime_type) 
WHERE mime_type IS NOT NULL;

-- =========================================
-- DOCUMENT_LINKS TABLE OPTIMIZATION
-- =========================================

-- 10. Bidirectional link performance
CREATE INDEX IF NOT EXISTS idx_document_links_reverse 
ON document_links (org_id, linked_doc_id, doc_id);

-- 11. Link type performance (if column exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'document_links' AND column_name = 'link_type') THEN
        CREATE INDEX IF NOT EXISTS idx_document_links_type 
        ON document_links (org_id, link_type);
    END IF;
END $$;

-- =========================================
-- AUDIT_EVENTS TABLE OPTIMIZATION
-- =========================================

-- 12. Audit queries (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables 
               WHERE table_name = 'audit_events') THEN
        CREATE INDEX IF NOT EXISTS idx_audit_events_org_time 
        ON audit_events (org_id, ts DESC);
        
        CREATE INDEX IF NOT EXISTS idx_audit_events_type 
        ON audit_events (org_id, type, ts DESC);
    END IF;
END $$;

-- =========================================
-- COMPOSITE QUERIES OPTIMIZATION
-- =========================================

-- 13. Common document list queries
CREATE INDEX IF NOT EXISTS idx_documents_org_current_upload 
ON documents (org_id, is_current_version, uploaded_at DESC) 
WHERE is_current_version IS NOT FALSE;

-- 14. Search with filters
CREATE INDEX IF NOT EXISTS idx_documents_search_combo 
ON documents (org_id, type, uploaded_at DESC);

-- 15. Version group with current flag
CREATE INDEX IF NOT EXISTS idx_documents_version_current 
ON documents (version_group_id, is_current_version, version_number) 
WHERE version_group_id IS NOT NULL;

-- =========================================
-- SETTINGS OPTIMIZATION
-- =========================================

-- 16. Settings lookup (if tables exist)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables 
               WHERE table_name = 'org_settings') THEN
        CREATE INDEX IF NOT EXISTS idx_org_settings_lookup 
        ON org_settings (org_id);
        
        -- For IP allowlist queries
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'org_settings' AND column_name = 'ip_allowlist_enabled') THEN
            CREATE INDEX IF NOT EXISTS idx_org_settings_ip_enabled 
            ON org_settings (org_id, ip_allowlist_enabled) 
            WHERE ip_allowlist_enabled = true;
        END IF;
    END IF;
END $$;

-- =========================================
-- CATEGORY OPTIMIZATION (if column exists)
-- =========================================

CREATE INDEX IF NOT EXISTS idx_documents_category 
ON documents (org_id, category) 
WHERE category IS NOT NULL;

-- =========================================
-- ANALYZE TABLES FOR BETTER QUERY PLANNING
-- =========================================

ANALYZE documents;
ANALYZE document_links;

-- Analyze other tables if they exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_events') THEN
        ANALYZE audit_events;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'org_settings') THEN
        ANALYZE org_settings;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_settings') THEN
        ANALYZE user_settings;
    END IF;
END $$;

-- =========================================
-- PERFORMANCE STATISTICS
-- =========================================

-- Show created indexes
SELECT 
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
    AND tablename IN ('documents', 'document_links', 'audit_events', 'org_settings')
    AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

SELECT 'Performance optimization indexes created successfully!' as status;