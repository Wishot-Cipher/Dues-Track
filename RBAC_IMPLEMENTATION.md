tch# Role-Based Access Control Implementation

This document summarizes the changes made to implement proper role-based access control (RBAC) in the Class Dues Tracker application.

## Role Permissions Summary

### Admin Role
- **Full access to everything**
- Can manage students (create, edit, delete, activate/deactivate)
- Can create payment types
- Can approve/reject payments
- Can approve/reject expenses
- Can view analytics
- Can scan QR codes

### Class Rep Role
- **Full access to everything (same as Admin)**
- Can manage students (create, edit, delete, activate/deactivate)
- Can create payment types
- Can approve/reject payments
- Can approve/reject expenses
- Can view analytics
- Can scan QR codes

### Financial Secretary (Finsec) Role
- **Full access EXCEPT student management**
- ❌ Cannot manage students
- ✅ Can create payment types
- ✅ Can approve/reject payments
- ✅ Can approve/reject expenses
- ✅ Can view analytics
- ✅ Can scan QR codes

## Files Modified

### 1. `src/hooks/useAuth.tsx`
Updated the `hasPermission` function to properly check role-based permissions:
- Admin: Full access to all permissions
- Class Rep: Full access to all permissions
- Finsec: All permissions except `can_manage_students`
- Regular users: Only explicit permissions from `admin_permissions`

### 2. `src/pages/admin/ManageStudentsPage.tsx`
- Updated `handleEditStudent` to use new `admin_update_student` RPC function
- Updated `toggleStudentStatus` to use new `admin_toggle_student_status` RPC function
- Updated `executeDeleteStudent` to use new `admin_delete_student` RPC function
- Updated Class Rep role assignment to grant full permissions
- Added permission checks before operations

### 3. `src/pages/admin/AdminDashboardPage.tsx`
- Made the "Total Students" card only clickable for users with `can_manage_students` permission

### 4. `src/pages/admin/ScanQRCodePage.tsx`
- Improved scanner container detection with more retries and longer delays
- Added initial 500ms delay before scanning to ensure DOM is ready
- Better error handling for when container is not ready

### 5. `src/components/admin/ExpenseApprovalQueue.tsx`
- Simplified permission check to not require `can_manage_students` for expense approval

## SQL Migration Required

**IMPORTANT**: You must run the SQL migration to create the new security functions.

Run this SQL in your Supabase SQL Editor:

```sql
-- Copy contents from: supabase/migrations/20260105_student_management_functions.sql
```

The migration creates these functions with `SECURITY DEFINER`:
- `admin_update_student` - Update student information
- `admin_delete_student` - Delete a student
- `admin_toggle_student_status` - Activate/deactivate a student
- `admin_bulk_update_students` - Bulk update multiple students

## QR Scanner Fixes

The QR scanner has been improved with:
1. Increased DOM container detection retries (8 → 20 attempts)
2. Increased delay between retries (100ms → 150ms)
3. Added 500ms initial delay before scanner initialization
4. Better error messages when container is not ready
5. Improved diagnostics panel for troubleshooting

## Testing Checklist

After applying these changes:

1. **Test Admin Role**
   - [ ] Can access Manage Students page
   - [ ] Can edit students
   - [ ] Can delete students
   - [ ] Can activate/deactivate students
   - [ ] Can grant/remove roles
   - [ ] Can approve expenses
   - [ ] Can scan QR codes

2. **Test Class Rep Role**
   - [ ] Can access Manage Students page
   - [ ] Can edit students
   - [ ] Can delete students
   - [ ] Can activate/deactivate students
   - [ ] Can grant/remove roles
   - [ ] Can approve expenses
   - [ ] Can scan QR codes

3. **Test Finsec Role**
   - [ ] Cannot access Manage Students page (redirected)
   - [ ] Cannot see "Manage Students" link in dashboard
   - [ ] Can approve expenses
   - [ ] Can scan QR codes
   - [ ] Can create payments
   - [ ] Can approve payments

4. **Test QR Scanner**
   - [ ] Camera initializes properly
   - [ ] Manual input works
   - [ ] QR code scanning works
