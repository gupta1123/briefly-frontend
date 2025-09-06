-- ====================================================================
-- POLAAD ORGANIZATION SETUP - STEP 1: Create Organization Structure
-- ====================================================================
-- This script creates the Polaad organization, departments, and roles
-- BUT requires you to create the auth user first via Supabase Auth API

-- IMPORTANT: You MUST create the auth user FIRST before running this script!
-- Use the JavaScript script instead for automatic auth user creation.

DO $$
DECLARE
    org_id UUID := gen_random_uuid();
    creative_dept_id UUID := gen_random_uuid();
    marketing_dept_id UUID := gen_random_uuid();
    sales_dept_id UUID := gen_random_uuid();
    general2_dept_id UUID := gen_random_uuid();
    -- REPLACE THIS WITH YOUR ACTUAL AUTH USER ID
    admin_user_id UUID := '09102105-24f4-4a53-8836-94f541c3deec';
BEGIN

    -- Validate that admin user exists in auth.users
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = admin_user_id) THEN
        RAISE EXCEPTION 'Admin user ID % does not exist in auth.users. Please create the auth user first via Supabase Auth API or dashboard.', admin_user_id;
    END IF;

    RAISE NOTICE 'Creating Polaad organization with ID: %', org_id;
    RAISE NOTICE 'Using existing admin user ID: %', admin_user_id;

    -- 1) Create the organization
    INSERT INTO organizations (id, name) VALUES (org_id, 'Polaad');
    RAISE NOTICE '✅ Created organization: Polaad';

    -- 2) Create app_users entry for the admin (now that we know auth user exists)
    INSERT INTO app_users (id, display_name) VALUES (admin_user_id, 'Polaad Admin');
    RAISE NOTICE '✅ Created app user entry';

    -- 3) Add admin to organization as orgAdmin
    INSERT INTO organization_users (org_id, user_id, role) VALUES (org_id, admin_user_id, 'orgAdmin');
    RAISE NOTICE '✅ Added admin to organization as orgAdmin';

    -- 4) Create organization roles
    INSERT INTO org_roles (org_id, key, name, is_system, permissions) VALUES
    (org_id, 'orgAdmin', 'Organization Admin', true, '{
        "org.manage_members": true,
        "org.update_settings": true,
        "security.ip_bypass": true,
        "documents.read": true,
        "documents.create": true,
        "documents.update": true,
        "documents.delete": true,
        "documents.move": true,
        "documents.link": true,
        "documents.version.manage": true,
        "documents.bulk_delete": true,
        "storage.upload": true,
        "search.semantic": true,
        "chat.save_sessions": true,
        "audit.read": true
    }'),
    (org_id, 'contentManager', 'Content Manager', true, '{
        "org.manage_members": false,
        "org.update_settings": false,
        "security.ip_bypass": false,
        "documents.read": true,
        "documents.create": true,
        "documents.update": true,
        "documents.delete": true,
        "documents.move": true,
        "documents.link": true,
        "documents.version.manage": true,
        "documents.bulk_delete": true,
        "storage.upload": true,
        "search.semantic": true,
        "chat.save_sessions": true,
        "audit.read": true
    }'),
    (org_id, 'contentViewer', 'Content Viewer', true, '{
        "org.manage_members": false,
        "org.update_settings": false,
        "security.ip_bypass": false,
        "documents.read": true,
        "documents.create": false,
        "documents.update": false,
        "documents.delete": false,
        "documents.move": false,
        "documents.link": false,
        "documents.version.manage": false,
        "documents.bulk_delete": false,
        "storage.upload": false,
        "search.semantic": true,
        "chat.save_sessions": false,
        "audit.read": true
    }'),
    (org_id, 'guest', 'Guest', true, '{
        "org.manage_members": false,
        "org.update_settings": false,
        "security.ip_bypass": false,
        "documents.read": true,
        "documents.create": false,
        "documents.update": false,
        "documents.delete": false,
        "documents.move": false,
        "documents.link": false,
        "documents.version.manage": false,
        "documents.bulk_delete": false,
        "storage.upload": false,
        "search.semantic": false,
        "chat.save_sessions": false,
        "audit.read": false
    }');
    RAISE NOTICE '✅ Created organization roles';

    -- 5) Create departments (including Core department)
    INSERT INTO departments (id, org_id, name, lead_user_id) VALUES
    (creative_dept_id, org_id, 'Creative', admin_user_id),
    (marketing_dept_id, org_id, 'Marketing', admin_user_id),
    (sales_dept_id, org_id, 'Sales', admin_user_id),
    (general2_dept_id, org_id, 'General2', admin_user_id),
    (gen_random_uuid(), org_id, 'Core', admin_user_id);  -- Restricted Core department
    RAISE NOTICE '✅ Created departments: Creative, Marketing, Sales, General2, Core';

    -- 6) Add admin as lead of all departments (including Core)
    INSERT INTO department_users (org_id, department_id, user_id, role) VALUES
    (org_id, creative_dept_id, admin_user_id, 'lead'),
    (org_id, marketing_dept_id, admin_user_id, 'lead'),
    (org_id, sales_dept_id, admin_user_id, 'lead'),
    (org_id, general2_dept_id, admin_user_id, 'lead'),
    (org_id, (SELECT id FROM departments WHERE org_id = org_id AND name = 'Core'), admin_user_id, 'lead');
    RAISE NOTICE '✅ Added admin as lead of all departments';

    -- 7) Initialize org settings
    INSERT INTO org_settings (org_id, date_format, accent_color, dark_mode, chat_filters_enabled, ip_allowlist_enabled, ip_allowlist_ips, categories)
    VALUES (org_id, 'd MMM yyyy', 'default', false, false, false, '{}', ARRAY['General', 'Legal', 'Financial', 'HR', 'Marketing', 'Technical', 'Invoice', 'Contract', 'Report', 'Correspondence']);
    RAISE NOTICE '✅ Initialized organization settings';

    -- 8) Initialize user settings for admin
    INSERT INTO user_settings (user_id, date_format, accent_color, dark_mode, chat_filters_enabled)
    VALUES (admin_user_id, 'd MMM yyyy', 'default', false, false);
    RAISE NOTICE '✅ Initialized user settings';

    RAISE NOTICE '';
    RAISE NOTICE '🎉 SUCCESS! Polaad organization created successfully!';
    RAISE NOTICE 'Organization ID: %', org_id;
    RAISE NOTICE 'Admin User ID: %', admin_user_id;
    RAISE NOTICE 'Departments: Creative, Marketing, Sales, General2';
    RAISE NOTICE 'Admin has full access including Activity/Audit logs';

END $$;

-- ====================================================================
-- VERIFICATION QUERIES
-- ====================================================================

-- Check that everything was created correctly
SELECT
    '✅ Polaad Organization Setup Complete!' as status,
    o.id as organization_id,
    o.name as organization_name,
    COUNT(DISTINCT d.id) as departments_created,
    COUNT(DISTINCT ou.user_id) as users_added
FROM organizations o
LEFT JOIN departments d ON d.org_id = o.id
LEFT JOIN organization_users ou ON ou.org_id = o.id
WHERE o.name = 'Polaad'
GROUP BY o.id, o.name;

-- Show department details
SELECT
    '📁 Departments Created:' as info,
    d.name as department_name,
    au.display_name as lead_name
FROM departments d
JOIN organizations o ON o.id = d.org_id
LEFT JOIN app_users au ON au.id = d.lead_user_id
WHERE o.name = 'Polaad'
ORDER BY d.name;

-- Show admin user details
SELECT
    '👤 Admin User:' as info,
    ou.role as admin_role,
    au.display_name,
    au.id as user_id
FROM organization_users ou
JOIN organizations o ON o.id = ou.org_id
JOIN app_users au ON au.id = ou.user_id
WHERE o.name = 'Polaad' AND ou.role = 'orgAdmin';

-- ====================================================================
-- MANUAL STEP REQUIRED
-- ====================================================================
/*
BEFORE RUNNING THIS SCRIPT:

1. Create the auth user via Supabase Dashboard or API:
   - Go to Authentication > Users in Supabase Dashboard
   - Click "Add user"
   - Email: admin@polaad.com (or any email with "polaad")
   - Password: YourSecurePassword123!
   - Enable "Auto confirm user"

2. Copy the User ID from the created user

3. Replace 'REPLACE_WITH_ACTUAL_AUTH_USER_ID' in this script with the actual user ID

ALTERNATIVE: Use the JavaScript script which handles auth user creation automatically:
   cd server
   node scripts/create-polaad-org.js --adminEmail admin@polaad.com --adminPassword "YourPassword123!"
*/
