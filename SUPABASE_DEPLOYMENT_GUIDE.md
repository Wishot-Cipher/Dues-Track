# 🚀 Supabase Migration Deployment Guide

## ✅ What We're Adding to Your Database

This migration adds **professional expense management** to your existing Class Dues Tracker database WITHOUT breaking anything.

### New Tables (4):
1. **`expense_categories`** - 10 predefined categories (Academic, Events, Infrastructure, etc.)
2. **`expense_audit_log`** - Complete history of all expense changes
3. **`expense_budgets`** - Budget tracking per category and fund
4. **`expense_receipts`** - Multiple receipt uploads per expense

### New Columns on `expenses` table (6):
1. `status` - pending/approved/rejected workflow
2. `approved_by` - Who approved/rejected
3. `approved_at` - When it was approved
4. `rejection_reason` - Why it was rejected
5. `category_id` - Link to expense_categories
6. `funded_by` - Link to payment_types

### New RPC Functions (4):
1. `approve_expense()` - Approve/reject with audit logging
2. `update_expense_with_audit()` - Edit with change tracking
3. `get_approved_expenses_summary()` - Student transparency view
4. `get_budget_health()` - Budget monitoring

---

## 📋 Step-by-Step Deployment

### Step 1: Open Supabase Dashboard
1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project: **Class-dues-tracker**
3. Navigate to **SQL Editor** (left sidebar)

### Step 2: Run the Migration
1. Click **"+ New Query"**
2. Copy the entire contents of:
   ```
   supabase/migrations/ADD_EXPENSE_ENHANCEMENTS.sql
   ```
3. Paste into the SQL Editor
4. Click **"Run"** (or press `Ctrl+Enter`)

### Step 3: Verify Success
You should see:
```
✅ Success. No rows returned
```

Check that new tables exist:
```sql
-- Run this to verify
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('expense_categories', 'expense_audit_log', 'expense_budgets', 'expense_receipts');
```

Expected result: **4 rows** showing all 4 new tables

### Step 4: Check Default Categories
```sql
-- Verify 10 categories were inserted
SELECT name, icon, color FROM expense_categories ORDER BY name;
```

Expected: **10 rows** with categories like:
- Academic Materials (BookOpen, #3B82F6)
- Administrative (Briefcase, #6366F1)
- Awards & Recognition (Award, #F59E0B)
- Donations & Charity (Heart, #EC4899)
- Events & Activities (PartyPopper, #8B5CF6)
- Infrastructure (Building2, #10B981)
- Maintenance & Repairs (Wrench, #EF4444)
- Miscellaneous (MoreHorizontal, #6B7280)
- Refreshments & Catering (Coffee, #84CC16)
- Technology & Equipment (Laptop, #06B6D4)

### Step 5: Update Existing Expenses (Backward Compatibility)
```sql
-- Set existing expenses to 'approved' status
UPDATE expenses SET status = 'approved' WHERE status IS NULL;

-- Assign default category to uncategorized expenses
UPDATE expenses 
SET category_id = (SELECT id FROM expense_categories WHERE name = 'Miscellaneous')
WHERE category_id IS NULL;
```

---

## 🗄️ Storage Bucket Configuration

### Option A: Using Supabase Dashboard (Recommended)

1. Go to **Storage** → **Policies** → Select `expense-receipts` bucket
2. Click **"New Policy"**
3. Create these 3 policies:

#### Policy 1: Admins Can Upload
```sql
Policy Name: Admins can upload expense receipts
Allowed operation: INSERT
Target roles: authenticated

WITH CHECK expression:
(bucket_id = 'expense-receipts'::text) 
AND (auth.uid() IN ( SELECT admins.student_id FROM admins 
WHERE ((admins.can_create_payments = true) OR (admins.can_manage_students = true))))
```

#### Policy 2: Admins Can View All
```sql
Policy Name: Admins can view expense receipts
Allowed operation: SELECT
Target roles: authenticated

USING expression:
(bucket_id = 'expense-receipts'::text) 
AND (auth.uid() IN ( SELECT admins.student_id FROM admins))
```

#### Policy 3: Students View Approved Only
```sql
Policy Name: Students can view approved expense receipts
Allowed operation: SELECT
Target roles: authenticated

USING expression:
(bucket_id = 'expense-receipts'::text) 
AND (name IN ( SELECT expenses.receipt_url FROM expenses WHERE (expenses.status = 'approved'::text)))
```

### Option B: Using SQL (Advanced)

If you prefer SQL, run this in SQL Editor:
```sql
-- Create storage policies for expense-receipts bucket
-- Note: Replace these if you already have policies

-- Policy 1: Admins upload
CREATE POLICY "Admins can upload expense receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'expense-receipts' 
  AND auth.uid() IN (
    SELECT student_id FROM admins 
    WHERE can_create_payments = true OR can_manage_students = true
  )
);

-- Policy 2: Admins view all
CREATE POLICY "Admins can view expense receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'expense-receipts'
  AND auth.uid() IN (SELECT student_id FROM admins)
);

-- Policy 3: Students view approved only
CREATE POLICY "Students can view approved expense receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'expense-receipts'
  AND name IN (
    SELECT receipt_url FROM expenses WHERE status = 'approved'
  )
);
```

---

## ✅ Testing the Migration

### Test 1: Create a Pending Expense
```sql
-- This should work if you're logged in as an admin
INSERT INTO expenses (
  title, 
  description, 
  amount, 
  expense_date, 
  category_id, 
  status
) VALUES (
  'Test Expense', 
  'Testing approval workflow', 
  1000.00, 
  CURRENT_DATE,
  (SELECT id FROM expense_categories WHERE name = 'Miscellaneous'),
  'pending'
) RETURNING *;
```

Expected: **1 row inserted** with `status = 'pending'`

### Test 2: Approve an Expense
```sql
-- Replace 'expense-id-here' with actual ID from Test 1
SELECT approve_expense(
  'expense-id-here'::uuid,
  true,
  'Approved for testing'
);
```

Expected: **Success** (no error)

### Test 3: Check Audit Log
```sql
-- Replace 'expense-id-here' with actual ID
SELECT * FROM expense_audit_log 
WHERE expense_id = 'expense-id-here'::uuid;
```

Expected: **1 row** showing the approval action

### Test 4: Get Expense Summary
```sql
SELECT * FROM get_approved_expenses_summary(NULL, NULL);
```

Expected: **1 row** with totals, category breakdown, monthly spending

### Test 5: Verify RLS Policies
```sql
-- Test as student (should only see approved)
SELECT status, COUNT(*) FROM expenses GROUP BY status;

-- As admin, should see all statuses
-- As student, should only see 'approved'
```

---

## 🐛 Troubleshooting

### Error: "relation already exists"
**Solution:** The migration uses `IF NOT EXISTS` - this is safe. It means the table/column already exists. You can ignore this.

### Error: "permission denied for table"
**Solution:** Make sure you're running as the database owner (postgres role). In Supabase, you should have full permissions by default.

### Error: "function auth.uid() does not exist"
**Solution:** You're not connected as an authenticated user. RLS policies require user context. For testing, use the Supabase client library or Dashboard.

### Categories not showing in dropdown
**Solution:** Run this query:
```sql
SELECT * FROM expense_categories WHERE is_active = true;
```
If empty, re-run the INSERT statement from the migration.

### Storage policies not working
**Solution:** 
1. Check bucket name is exactly `expense-receipts` (no typos)
2. Verify bucket exists in Storage → Buckets
3. Check if policies are enabled (green checkmark)

---

## 📊 What Happens to Existing Data?

### ✅ Safe - Nothing is Deleted
- All existing expenses remain intact
- All existing students, payments, admins unchanged
- All existing payment_types safe

### ✅ Automatic Updates
- Existing expenses get `status = 'approved'` (backward compatible)
- Uncategorized expenses get assigned to "Miscellaneous"

### ✅ New Features Available Immediately
- New expenses will use approval workflow
- Admins can categorize expenses
- Audit trail starts tracking from now on
- Budget tracking ready to use

---

## 🎯 Next Steps After Migration

1. ✅ **Verify migration success** (run test queries above)
2. ✅ **Configure storage policies** (choose Option A or B)
3. ✅ **Test expense creation** (should be pending)
4. ✅ **Test approval workflow** (senior admin approves)
5. ✅ **Build UI components** (expense approval queue)

---

## 🆘 Need Help?

### Check Migration Status
```sql
-- See all your tables
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- See all RPC functions
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_type = 'FUNCTION'
ORDER BY routine_name;
```

### Rollback (Emergency Only)
```sql
-- ⚠️ WARNING: This deletes the new tables and columns
-- Only use if migration completely failed

DROP TABLE IF EXISTS expense_receipts CASCADE;
DROP TABLE IF EXISTS expense_budgets CASCADE;
DROP TABLE IF EXISTS expense_audit_log CASCADE;
DROP TABLE IF EXISTS expense_categories CASCADE;

ALTER TABLE expenses DROP COLUMN IF EXISTS status;
ALTER TABLE expenses DROP COLUMN IF EXISTS approved_by;
ALTER TABLE expenses DROP COLUMN IF EXISTS approved_at;
ALTER TABLE expenses DROP COLUMN IF EXISTS rejection_reason;
ALTER TABLE expenses DROP COLUMN IF EXISTS category_id;
ALTER TABLE expenses DROP COLUMN IF EXISTS funded_by;

DROP FUNCTION IF EXISTS approve_expense;
DROP FUNCTION IF EXISTS update_expense_with_audit;
DROP FUNCTION IF EXISTS get_approved_expenses_summary;
DROP FUNCTION IF EXISTS get_budget_health;
```

---

## ✨ Summary

After running this migration, you'll have:

✅ **4 new tables** for professional expense management  
✅ **6 new columns** on expenses for approval workflow  
✅ **4 secure RPC functions** for expense operations  
✅ **10 predefined categories** ready to use  
✅ **Complete audit trail** for accountability  
✅ **Budget tracking** foundation  
✅ **Enhanced RLS policies** for security  

**Estimated time:** 5-10 minutes  
**Risk level:** Low (non-destructive migration)  
**Rollback available:** Yes (see above)

🚀 **Ready to deploy!**
