-- ============================================
-- QUICK FIX: Disable RLS for Development
-- ============================================
-- This is the simplest fix for development
-- Re-enable RLS with proper policies for production

-- Check current RLS status
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Disable RLS on all tables (for development only)
ALTER TABLE students DISABLE ROW LEVEL SECURITY;
ALTER TABLE admins DISABLE ROW LEVEL SECURITY;
ALTER TABLE payment_types DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE payment_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE public_payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE payment_pledges DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_logs DISABLE ROW LEVEL SECURITY;

-- Grant full access to authenticated and anon users
GRANT ALL ON students TO anon, authenticated;
GRANT ALL ON admins TO anon, authenticated;
GRANT ALL ON payment_types TO anon, authenticated;
GRANT ALL ON payments TO anon, authenticated;
GRANT ALL ON payment_history TO anon, authenticated;
GRANT ALL ON expenses TO anon, authenticated;
GRANT ALL ON public_payments TO anon, authenticated;
GRANT ALL ON payment_pledges TO anon, authenticated;
GRANT ALL ON notifications TO anon, authenticated;
GRANT ALL ON fraud_logs TO anon, authenticated;

-- Grant sequence permissions
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '✅ RLS disabled for all tables!';
  RAISE NOTICE '⚠️  This is for DEVELOPMENT only';
  RAISE NOTICE '';
  RAISE NOTICE '🔑 NOW:';
  RAISE NOTICE '1. Clear browser localStorage: localStorage.clear()';
  RAISE NOTICE '2. Refresh the page';
  RAISE NOTICE '3. Login with: 2024/274872 / Wisdom123';
  RAISE NOTICE '4. You should now be able to create payment types!';
  RAISE NOTICE '';
  RAISE NOTICE '✨ RLS will be re-enabled with proper policies later for production';
END $$;
