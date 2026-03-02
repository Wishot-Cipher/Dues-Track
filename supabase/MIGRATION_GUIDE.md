# 🔄 Database Migration Guide

## ⚠️ Error: "relation 'students' already exists"

This means your database tables are already created. **Don't run `schema.sql` again!**

---

## ✅ **Solution: Run Migration Instead**

### **Step 1: Add Missing Column**

Run this in Supabase SQL Editor:

```sql
-- File: supabase/migration_add_force_password_change.sql
```

Copy and paste the contents of `migration_add_force_password_change.sql`

This will:
- ✅ Check if `force_password_change` column exists
- ✅ Add it if missing
- ✅ Skip if already exists (safe to run multiple times)

---

## 📋 **When to Use What**

### **Fresh Database (New Supabase Project):**
```
Run: schema.sql → policies.sql → functions.sql → seed.sql
```

### **Existing Database (Already ran schema.sql):**
```
Run: migration_add_force_password_change.sql
Then: Your student import script
```

---

## 🔍 **Check What Tables You Have**

Run this in Supabase SQL Editor:

```sql
-- List all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- Check students table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'students'
ORDER BY ordinal_position;
```

---

## 🗑️ **If You Want to Start Fresh**

**⚠️ WARNING: This deletes ALL data!**

```sql
-- Drop all tables (run in this order)
DROP TABLE IF EXISTS fraud_logs CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS payment_pledges CASCADE;
DROP TABLE IF EXISTS public_payments CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS payment_history CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS payment_types CASCADE;
DROP TABLE IF EXISTS admins CASCADE;
DROP TABLE IF EXISTS students CASCADE;

-- Then run schema.sql again
```

---

## ✅ **For Your Current Situation**

Since you already have the tables:

1. **Run the migration:**
   ```
   supabase/migration_add_force_password_change.sql
   ```

2. **Then import your students:**
   ```powershell
   node scripts/minimal_csv_import.js
   ```

3. **Paste the generated SQL to Supabase**

Done! 🎉

---

## 📝 **Future Migrations**

If you need to add more columns or modify the database later:

1. Create a new migration file: `supabase/migration_YYYY_MM_DD_description.sql`
2. Use `ALTER TABLE` instead of `CREATE TABLE`
3. Always check if the change already exists before applying

Example:
```sql
-- Add new column safely
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'students' AND column_name = 'new_field'
    ) THEN
        ALTER TABLE students ADD COLUMN new_field TEXT;
    END IF;
END $$;
```

---

**TL;DR:** Run `migration_add_force_password_change.sql` instead of `schema.sql`! ✅
