-- ============================================================
-- DIAGNOSTIC — paste this into Supabase SQL Editor any time
-- to see the REAL columns on the core tables.
--
-- Not a migration. Doesn't modify anything. Just reports.
-- Use this output to verify any RPC INSERT matches reality
-- BEFORE running the RPC and hitting "column does not exist".
-- ============================================================

SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'organizations',
    'organization_groups',
    'organization_members',
    'member_admins',
    'organization_settings',
    'payment_types',
    'payments',
    'expenses',
    'expense_categories',
    'notifications',
    'seed_institutions',
    'claim_requests',
    'platform_earnings'
  )
ORDER BY table_name, ordinal_position;
