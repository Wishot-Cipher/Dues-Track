# Notification System Fix Guide

## Issues Found and Fixed

### 1. **Fixed Column Name Mismatch** ✅
- **Problem**: NotificationCenter was querying `student_id` but the database table uses `recipient_id`
- **Fixed In**: `src/components/NotificationCenter.tsx`
  - Changed `eq('student_id', user.id)` to `eq('recipient_id', user.id)` (2 places)

### 2. **SQL Files Cleanup** ✅
- Moved 21 old debug/fix SQL files to `supabase/archive_old_sql/`
- Kept only essential files:
  - `schema.sql` - Main database schema
  - `complete_setup.sql` - Complete setup script
  - `policies.sql` - RLS policies
  - `functions.sql` - Database functions
  - `seed.sql` - Seed data
  - `make_admin.sql` - Admin creation
  - `import_students.sql` - Student import
  - `verify_setup.sql` - Setup verification

### 3. **Created Diagnostic Tools** 🛠️

#### `fix_notifications.sql`
Run this in Supabase SQL Editor to:
- Enable RLS on notifications table
- Create proper policies for students and admins
- Verify the setup

#### `diagnose_notifications.sql`
Run this to check:
- Table structure
- RLS status
- Existing policies
- Notification counts and types
- Recent notifications
- Orphaned notifications

#### `test_notification.sql`
Use this to create a test notification:
1. Replace `'YOUR_EMAIL_HERE'` with your email
2. Run the script
3. Check if notification appears in the app

## Steps to Fix Notifications

### Step 1: Run the Fix Script
```sql
-- In Supabase SQL Editor, run:
-- supabase/fix_notifications.sql
```

### Step 2: Verify with Diagnostics
```sql
-- Run diagnostics to check everything:
-- supabase/diagnose_notifications.sql
```

### Step 3: Create a Test Notification
```sql
-- Edit and run test notification:
-- supabase/test_notification.sql
-- (Replace YOUR_EMAIL_HERE with your email)
```

### Step 4: Check in the App
1. Open the app
2. Look for the bell icon in the navigation
3. You should see:
   - Red badge with unread count
   - Test notification when you click the bell
   - Sound effect when new notification arrives

## Common Issues

### No Notifications Appearing?
1. **Check RLS**: Make sure RLS is enabled on notifications table
2. **Check Policies**: Verify policies allow SELECT for your user
3. **Check Data**: Run `SELECT * FROM notifications WHERE recipient_id = auth.uid();`
4. **Check Console**: Look for errors in browser DevTools

### Can't Mark as Read?
- Check UPDATE policy exists for notifications
- Verify `recipient_id = auth.uid()` in the policy

### Notifications Not Creating?
- Check if admins table has your user
- Verify INSERT policy allows admins or system
- Check notificationService.ts for errors

## Notification Types

The system supports:
- `payment_approved` - Payment was approved ✅
- `payment_rejected` - Payment was rejected ❌
- `payment_waived` - Payment was waived by admin 🎉
- `welcome` - Welcome message for new users 👋
- `system` - System announcements 📢

## Testing Checklist

- [ ] Run `fix_notifications.sql`
- [ ] Run `diagnose_notifications.sql` - verify RLS enabled
- [ ] Create test notification with your email
- [ ] Refresh app and check bell icon
- [ ] Click bell - see notification panel
- [ ] Click notification - mark as read
- [ ] Click "Mark all as read" - verify works
- [ ] Submit a payment - verify admin gets notification
- [ ] Approve payment as admin - verify student gets notification

## Files Modified

1. `src/components/NotificationCenter.tsx` - Fixed column names
2. `supabase/fix_notifications.sql` - New fix script
3. `supabase/diagnose_notifications.sql` - New diagnostic tool
4. `supabase/test_notification.sql` - New test tool
5. `supabase/archive_old_sql/` - Archived 21 old SQL files

## Next Steps

After fixing notifications:
1. Test with real payment flow
2. Verify real-time updates work
3. Test notification sounds
4. Check mobile notification display
5. Consider adding email notifications (future feature)
