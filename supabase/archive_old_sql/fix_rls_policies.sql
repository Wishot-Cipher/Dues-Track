-- ============================================
-- FIX: Enable RLS Policies for Admins Table
-- ============================================

-- ============================================
-- STEP 1: Enable RLS on admins table
-- ============================================
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 2: Create RLS Policies
-- ============================================

-- Policy 1: Allow authenticated users to read their own admin records
CREATE POLICY "Users can view their own admin records"
ON admins
FOR SELECT
TO authenticated
USING (
  student_id IN (
    SELECT id FROM students 
    WHERE id = auth.uid() 
    OR id::text = current_setting('request.jwt.claims', true)::json->>'sub'
    OR id::text IN (
      SELECT value::text 
      FROM json_each_text(current_setting('request.jwt.claims', true)::json)
    )
  )
);

-- Policy 2: Allow anyone to read admin records (for login purposes)
-- This is needed because the login happens before authentication
CREATE POLICY "Allow reading admin records for authentication"
ON admins
FOR SELECT
TO anon, authenticated
USING (true);

-- Policy 3: Allow admins to insert/update admin records
CREATE POLICY "Admins can manage admin records"
ON admins
FOR ALL
TO authenticated
USING (
  student_id IN (
    SELECT student_id FROM admins 
    WHERE role = 'admin'
  )
);

-- ============================================
-- ALTERNATIVE: Disable RLS (Simpler for development)
-- ============================================
-- If the above policies are too complex, you can temporarily disable RLS:
-- ALTER TABLE admins DISABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 3: Grant access to anon and authenticated roles
-- ============================================
GRANT SELECT ON admins TO anon;
GRANT SELECT ON admins TO authenticated;
GRANT INSERT, UPDATE ON admins TO authenticated;

-- ============================================
-- STEP 4: Verify your admin record still exists
-- ============================================
SELECT 
  a.id as admin_id,
  a.student_id,
  a.role,
  a.can_create_payments,
  s.reg_number,
  s.full_name
FROM admins a
JOIN students s ON a.student_id = s.id
WHERE s.reg_number = '2024/274872';

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '✅ RLS policies created for admins table!';
  RAISE NOTICE '';
  RAISE NOTICE '🔑 NEXT STEPS:';
  RAISE NOTICE '1. Clear browser localStorage: localStorage.clear()';
  RAISE NOTICE '2. Refresh the page';
  RAISE NOTICE '3. Login again';
  RAISE NOTICE '4. Try creating a payment type';
  RAISE NOTICE '';
  RAISE NOTICE 'If still having issues, uncomment the DISABLE RLS line above';
END $$;
