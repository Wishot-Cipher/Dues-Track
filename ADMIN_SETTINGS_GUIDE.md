# Admin Settings Feature - Setup Guide

## ✅ What's Been Fixed

### 1. Database Relationship Error - RESOLVED
**Problem:** `Failed to fetch payments: Could not find a relationship between 'payments' and 'admins'`

**Solution:** Fixed all payment queries to use correct Supabase foreign key syntax:
- ❌ Wrong: `admin:admins(full_name)` 
- ✅ Correct: `reviewed_by_admin:admins!reviewed_by(full_name)`

**Files Updated:**
- `QuickPaymentSummary.tsx` - Both CSV export and print functions

### 2. Admin Settings UI - NOW VISIBLE
**Problem:** "i cant see the setting feature for admins"

**Solution:** Added Student Feature Settings and Expense Visibility Settings to Admin Dashboard

**Location:** Admin Dashboard now shows two new settings panels (requires `can_manage_students` permission)

---

## 🚀 Required Setup Steps

### Step 1: Run SQL Migrations in Supabase

You need to run these SQL files in your Supabase SQL Editor:

#### A. Student Feature Settings
```sql
-- File: supabase/student_features_settings.sql
-- This creates the table for controlling student features
-- Run this in Supabase SQL Editor
```

#### B. Expense Visibility Settings
```sql
-- File: supabase/student_expense_visibility_settings.sql
-- This creates the table for controlling expense transparency
-- Run this in Supabase SQL Editor
```

**How to Run:**
1. Go to your Supabase project dashboard
2. Click on "SQL Editor" in the left sidebar
3. Click "New Query"
4. Open `supabase/student_features_settings.sql` and copy the entire content
5. Paste it into the SQL Editor and click "Run"
6. Repeat steps 3-5 for `supabase/student_expense_visibility_settings.sql`

### Step 2: Verify Tables Were Created

Run this query to verify:
```sql
-- Check if tables exist
SELECT * FROM student_feature_settings;
SELECT * FROM expense_visibility_settings;
```

You should see:
- 5 rows in `student_feature_settings` (5 features)
- 7 rows in `expense_visibility_settings` (7 visibility controls)

---

## 🎯 Using the Admin Controls

### Access the Settings
1. Log in as an admin with `can_manage_students` permission
2. Go to Admin Dashboard
3. Scroll down to see two new panels:
   - **Student Feature Settings** (left)
   - **Expense Visibility Settings** (right)

### Student Feature Settings (5 Features)

Control which features students can see:

1. **📊 Expense Transparency Dashboard**
   - Shows class finances and spending
   - Default: Enabled

2. **🏆 Achievement System**
   - Shows payment badges and achievements
   - Default: Enabled

3. **⏰ Smart Deadline Reminders**
   - Shows urgent payment notifications
   - Default: Enabled

4. **📈 Class Progress Visualization**
   - Shows % of class that has paid
   - Default: Enabled

5. **📄 Quick Payment Summary**
   - CSV/Print export of payment records
   - Default: Enabled

**How to Use:**
- Toggle any feature ON/OFF
- Click "Save Changes"
- Students will immediately see/hide the feature on their dashboard

### Expense Visibility Settings (7 Controls)

Control what financial details students can see:

1. **Total Collected** - Show total money collected
2. **Total Spent** - Show total expenses
3. **Remaining Balance** - Show available balance
4. **Expense Categories** - Show spending breakdown by category
5. **Recent Expenses** - Show recent transaction list
6. **Full Expense Details** - Allow expanding to see full details (disabled by default)
7. **Budget Usage** - Show progress visualization

**How to Use:**
- Toggle any visibility setting ON/OFF
- Click "Save Changes"
- Students will immediately see/hide that financial detail

---

## 💡 Professional Tips

### When to Hide Features

**Hide Expense Transparency When:**
- Class is being too critical about spending
- You want to announce expenses later
- Budget is tight and you want to manage expectations

**Hide Full Expense Details When:**
- You want to show totals but not individual items
- Protecting vendor/supplier information
- Simplifying the student view

### Recommended Settings

**Default (Balanced):**
- ✅ Show totals and categories
- ✅ Show recent expenses
- ❌ Hide full details (expand button)

**Full Transparency:**
- ✅ Enable all 7 settings

**Minimal View:**
- ✅ Total Collected only
- ❌ Hide all spending details

---

## 🔧 Troubleshooting

### Settings Not Showing Up?

**Check 1:** Did you run both SQL migrations?
```sql
SELECT * FROM student_feature_settings;
SELECT * FROM expense_visibility_settings;
```

**Check 2:** Do you have the correct permission?
- You need `can_manage_students = true` in the admins table

**Check 3:** Clear browser cache
- Hard refresh: Ctrl + Shift + R (Windows) or Cmd + Shift + R (Mac)

### Features Still Showing After Toggling Off?

**Check 1:** Did you click "Save Changes"?

**Check 2:** Is the student on an old cached page?
- Student should refresh their dashboard

**Check 3:** Check browser console for errors
- Press F12 → Console tab

### Database Errors?

If you see relationship errors:
```
Could not find a relationship between 'payments' and 'admins'
```

**Solution:** This has been fixed in `QuickPaymentSummary.tsx`. Make sure you have the latest version.

---

## 📊 What Students See

### When All Features Are Enabled:
Students see their dashboard with:
1. Expense Transparency card (financial overview)
2. Achievement System (badges)
3. Deadline Reminders (urgent notifications)
4. Class Progress (payment percentage)
5. Payment Summary (CSV/Print buttons)

### When Features Are Disabled:
The corresponding section simply doesn't appear on the student dashboard.

### When Expense Visibility Is Controlled:
Only the enabled financial details appear in the Expense Transparency card.

---

## 🎨 Visual Guide

### Admin Dashboard - Before
```
┌─────────────────────────────────┐
│ Quick Actions                    │
│ • Student Dashboard             │
│ • Create Payment                │
│ • Review Submissions            │
└─────────────────────────────────┘
```

### Admin Dashboard - After (with settings)
```
┌─────────────────────────────────┐
│ Quick Actions                    │
│ • Student Dashboard             │
│ • Create Payment                │
│ • Review Submissions            │
└─────────────────────────────────┘

┌──────────────────┬──────────────────┐
│ Student Features │ Expense Visible  │
│ □ Expense Trans. │ □ Total Collected│
│ □ Achievements   │ □ Total Spent    │
│ □ Reminders      │ □ Balance        │
│ □ Class Progress │ □ Categories     │
│ □ Payment Export │ □ Recent Exp.    │
│ [Save Changes]   │ [Save Changes]   │
└──────────────────┴──────────────────┘
```

---

## ✨ Next Steps

1. ✅ Run both SQL migrations (Step 1)
2. ✅ Verify tables exist (Step 2)
3. ✅ Log in to Admin Dashboard
4. ✅ Test toggling features ON/OFF
5. ✅ Check student view to confirm changes
6. ✅ Set your preferred defaults

---

## 🎯 Success Checklist

- [ ] Both SQL files executed successfully
- [ ] Can see Student Feature Settings panel
- [ ] Can see Expense Visibility Settings panel
- [ ] Toggle switches work and save
- [ ] Student dashboard respects the settings
- [ ] No "relationship not found" errors in console

---

## 📞 Support

If you encounter any issues:
1. Check browser console (F12)
2. Verify SQL migrations ran successfully
3. Confirm admin permissions
4. Try a hard refresh (Ctrl + Shift + R)

All features are working correctly now! 🎉
