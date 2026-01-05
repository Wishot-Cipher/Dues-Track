# Multi-Tenant Development Database Setup

## Step 1: Create a New Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **"New Project"**
3. Name it something like: `dues-tracker-multi-tenant-dev`
4. Choose a strong database password (save it!)
5. Select the same region as your production project
6. Click **Create new project**

Wait for the project to be provisioned (usually 1-2 minutes).

---

## Step 2: Get Your New Project Credentials

Once the project is created:

1. Go to **Project Settings** → **API**
2. Copy:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon public** key
   - **service_role** key (keep this secret!)

---

## Step 3: Create Environment File

Create a file called `.env.multitenant` in the project root with these values:

```env
# Multi-Tenant Development Database
# DO NOT COMMIT THIS FILE

VITE_SUPABASE_URL=https://YOUR_NEW_PROJECT_URL.supabase.co
VITE_SUPABASE_ANON_KEY=your_new_anon_key_here

# Optional: For server-side operations
SUPABASE_SERVICE_ROLE_KEY=your_new_service_role_key_here
```

---

## Step 4: Run Migrations on New Database

Go to your new Supabase project's **SQL Editor** and run these migrations in order:

### Migration 1: Organizations
Run the contents of: `multi-tenant/migrations/001_organizations.sql`

### Migration 2: Add Tenant Columns  
Run the contents of: `multi-tenant/migrations/002_add_tenant_columns.sql`

### Migration 3: Migrate Data
Run the contents of: `multi-tenant/migrations/003_migrate_data.sql`

### Migration 4: RLS Policies
Run the contents of: `multi-tenant/migrations/004_rls_policies.sql`

---

## Step 5: Switch Between Databases

### To use multi-tenant database (development):
```powershell
# Windows PowerShell
Copy-Item .env.multitenant .env.local -Force
```

### To use production database (main branch):
```powershell
# Your original .env.local should have the production keys
# Or restore from backup
Copy-Item .env.production .env.local -Force
```

---

## Step 6: Verify Setup

After running migrations, verify by running this query in SQL Editor:

```sql
-- Check organizations table exists
SELECT * FROM organizations;

-- Check departments table exists  
SELECT * FROM departments;

-- Verify sample data
SELECT o.short_name, d.short_name as dept 
FROM organizations o 
LEFT JOIN departments d ON d.organization_id = o.id;
```

You should see FUTO and ECE in the results.

---

## Important Notes

⚠️ **Never commit `.env.multitenant` or `.env.local`** - they're in .gitignore

⚠️ **The multi-tenant database is for development only** - don't use production data

⚠️ **When switching branches:**
- `main` branch → Use production database
- `feature/multi-tenant` branch → Use multi-tenant dev database

---

## Quick Reference

| Environment | Database | Branch |
|------------|----------|--------|
| Production | Original Supabase | `main` |
| Multi-tenant Dev | New Supabase | `feature/multi-tenant` |
