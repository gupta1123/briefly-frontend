-- Login Performance Optimization for Briefly Application
-- Run this in Supabase SQL Editor to optimize login-related queries

-- =========================================
-- USER AND ORGANIZATION TABLES OPTIMIZATION
-- =========================================

-- 1. Optimize app_users table lookups
CREATE INDEX IF NOT EXISTS idx_app_users_id 
ON app_users (id);

-- 2. Optimize organization_users table for /me endpoint
CREATE INDEX IF NOT EXISTS idx_org_users_user_id 
ON organization_users (user_id);

CREATE INDEX IF NOT EXISTS idx_org_users_user_id_expires 
ON organization_users (user_id, expires_at);

-- 3. Composite index for organization lookups with active status
-- Note: Can't use NOW() in index predicate as it's not immutable
-- This index will help with user_id + org_id lookups regardless of expiration
CREATE INDEX IF NOT EXISTS idx_org_users_active 
ON organization_users (user_id, org_id, expires_at);

-- 4. Organizations table optimization for joins
CREATE INDEX IF NOT EXISTS idx_organizations_id 
ON organizations (id);

-- =========================================
-- AUDIT EVENTS OPTIMIZATION (for login logs)
-- =========================================

-- 5. Optimize audit events for login tracking
CREATE INDEX IF NOT EXISTS idx_audit_login_user_org 
ON audit_events (actor_user_id, org_id, type, ts) 
WHERE type = 'login';

-- 6. Cleanup old audit events index
CREATE INDEX IF NOT EXISTS idx_audit_cleanup_date 
ON audit_events (ts, type);

-- =========================================
-- DOCUMENTS TABLE LOGIN-RELATED OPTIMIZATION
-- =========================================

-- 7. Initial documents load optimization (for dashboard)
CREATE INDEX IF NOT EXISTS idx_documents_recent_by_org 
ON documents (org_id, uploaded_at DESC) 
WHERE type != 'folder';

-- 8. Document count optimization for dashboard
CREATE INDEX IF NOT EXISTS idx_documents_count_by_org 
ON documents (org_id) 
WHERE type != 'folder';

-- =========================================
-- STATISTICS UPDATE
-- =========================================

-- Update table statistics for better query planning
ANALYZE app_users;
ANALYZE organization_users;
ANALYZE organizations;
ANALYZE audit_events;
ANALYZE documents;

-- Note: Run this script in your Supabase SQL Editor to improve login performance
-- These indexes specifically target the queries used during login flow