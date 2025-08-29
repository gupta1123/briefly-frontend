-- ====================================================================
-- SIMPLE POLAAD ORGANIZATION CREATION
-- ====================================================================
-- Run this entire script in Supabase SQL Editor
-- Creates Polaad organization with departments and links to existing user

-- Replace this with your actual auth user ID from Supabase Auth
-- You can find this in Authentication > Users in Supabase Dashboard
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

    -- Validate that admin user exists
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = admin_user_id) THEN
        RAISE EXCEPTION 'Admin user ID % does not exist in auth.users. Please check your user ID.', admin_user_id;
    END IF;

    RAISE NOTICE '🚀 Creating Polaad organization...';

    -- 1) Create organization
    INSERT INTO organizations (id, name) VALUES (org_id, 'Polaad');
    RAISE NOTICE '✅ Created organization: Polaad';

    -- 2) Create app_users entry
    INSERT INTO app_users (id, display_name) VALUES (admin_user_id, 'Polaad Admin');
    RAISE NOTICE '✅ Created app user entry';

    -- 3) Add admin to organization
    INSERT INTO organization_users (org_id, user_id, role) VALUES (org_id, admin_user_id, 'orgAdmin');
    RAISE NOTICE '✅ Added admin to organization as orgAdmin';

    -- 4) Create departments
    INSERT INTO departments (id, org_id, name, lead_user_id) VALUES
    (creative_dept_id, org_id, 'Creative', admin_user_id),
    (marketing_dept_id, org_id, 'Marketing', admin_user_id),
    (sales_dept_id, org_id, 'Sales', admin_user_id),
    (general2_dept_id, org_id, 'General2', admin_user_id);
    RAISE NOTICE '✅ Created departments: Creative, Marketing, Sales, General2';

    -- 5) Add admin as lead of all departments
    INSERT INTO department_users (org_id, department_id, user_id, role) VALUES
    (org_id, creative_dept_id, admin_user_id, 'lead'),
    (org_id, marketing_dept_id, admin_user_id, 'lead'),
    (org_id, sales_dept_id, admin_user_id, 'lead'),
    (org_id, general2_dept_id, admin_user_id, 'lead');
    RAISE NOTICE '✅ Added admin as lead of all departments';

    -- 6) Initialize org settings
    INSERT INTO org_settings (org_id, date_format, accent_color, dark_mode, chat_filters_enabled, ip_allowlist_enabled, ip_allowlist_ips, categories)
    VALUES (org_id, 'd MMM yyyy', 'default', false, false, false, '{}', ARRAY['General', 'Legal', 'Financial', 'HR', 'Marketing', 'Technical', 'Invoice', 'Contract', 'Report', 'Correspondence']);
    RAISE NOTICE '✅ Initialized organization settings';

    -- 7) Initialize user settings
    INSERT INTO user_settings (user_id, date_format, accent_color, dark_mode, chat_filters_enabled)
    VALUES (admin_user_id, 'd MMM yyyy', 'default', false, false);
    RAISE NOTICE '✅ Initialized user settings';

    RAISE NOTICE '';
    RAISE NOTICE '🎉 SUCCESS! Polaad organization created!';
    RAISE NOTICE 'Organization ID: %', org_id;
    RAISE NOTICE 'Admin User ID: %', admin_user_id;
    RAISE NOTICE 'Login with your auth user credentials to access the organization';

END $$;

-- ====================================================================
-- VERIFICATION
-- ====================================================================

-- Check results
SELECT
    '✅ Organization Created:' as status,
    o.name as organization_name,
    COUNT(d.id) as departments_created,
    COUNT(ou.user_id) as users_added
FROM organizations o
LEFT JOIN departments d ON d.org_id = o.id
LEFT JOIN organization_users ou ON ou.org_id = o.id
WHERE o.name = 'Polaad'
GROUP BY o.id, o.name;

-- Show departments
SELECT
    d.name as department,
    'Admin' as lead
FROM departments d
JOIN organizations o ON o.id = d.org_id
WHERE o.name = 'Polaad'
ORDER BY d.name;
