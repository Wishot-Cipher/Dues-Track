# 💰 Expense Management Enhancement Plan

## Current State Analysis

### ✅ What Works
- Basic expense CRUD operations
- Receipt upload to `expense-receipts` bucket
- Admin permission checks (client-side)
- Recent expense list display
- Modal detail view for expenses

### ❌ What's Missing
- ❌ No approval workflow (expenses are immediately "final")
- ❌ No expense categorization or fund tracking
- ❌ No expense editing or deletion capability
- ❌ No expense reporting/transparency for students
- ❌ No receipt preview in list view
- ❌ No expense analytics or charts
- ❌ No audit trail for modifications
- ❌ No budget tracking against payment collections

---

## 🎯 Professional Expense Features

### Feature 1: **Expense Approval Workflow**

**Database Schema Addition:**
```sql
-- Add approval workflow columns to expenses table
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES admins(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Add check constraint for valid statuses
ALTER TABLE expenses ADD CONSTRAINT valid_expense_status 
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- Add index for filtering
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
```

**UI Components Needed:**
1. `ExpenseApprovalQueue.tsx` - Pending expenses awaiting approval
2. `ExpenseApprovalModal.tsx` - Approve/reject with reason
3. Status badges in `ExpenseList.tsx`

**Workflow:**
```
Recorder (Admin) → Creates Expense → Status: 'pending'
                     ↓
Approver (Senior Admin) → Reviews → Approve/Reject
                     ↓
Status: 'approved' or 'rejected' (with reason)
```

---

### Feature 2: **Expense Categories & Fund Tracking**

**Schema:**
```sql
-- Create expense categories table
CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT, -- Lucide icon name
  color TEXT, -- Hex color code
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES admins(id)
);

-- Link expenses to categories
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES expense_categories(id);

-- Link expenses to payment types (fund source)
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS funded_by UUID REFERENCES payment_types(id);
```

**Predefined Categories:**
- 🏫 Academic Materials (books, supplies)
- 🎉 Events & Activities (excursions, socials)
- 🏗️ Infrastructure (facility improvements)
- 💼 Administrative (office supplies, fees)
- 🎓 Awards & Recognition (prizes, certificates)
- 🔧 Maintenance & Repairs
- 🤝 Donations & Charity
- 📱 Technology & Equipment
- 🍽️ Refreshments & Catering
- 📊 Miscellaneous

**UI:** 
- Category selector in `RecordExpense.tsx`
- Color-coded category badges
- Spending breakdown by category charts

---

### Feature 3: **Expense Editing & Deletion with Audit Trail**

**Schema:**
```sql
-- Create expense audit log
CREATE TABLE IF NOT EXISTS expense_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'created', 'updated', 'deleted', 'approved', 'rejected'
  performed_by UUID REFERENCES admins(id),
  previous_data JSONB, -- Snapshot of data before change
  new_data JSONB, -- Snapshot after change
  reason TEXT, -- Why the change was made
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_expense_audit_log ON expense_audit_log(expense_id, created_at DESC);
```

**RPC Function:**
```sql
CREATE OR REPLACE FUNCTION update_expense_with_audit(
  p_expense_id UUID,
  p_description TEXT,
  p_amount DECIMAL,
  p_category_id UUID,
  p_reason TEXT
) RETURNS void AS $$
DECLARE
  v_old_data JSONB;
  v_admin_id UUID;
BEGIN
  -- Verify admin permissions
  SELECT id INTO v_admin_id FROM admins 
  WHERE user_id = auth.uid() AND can_create_payments = true;
  
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Admin permission required';
  END IF;
  
  -- Store old data
  SELECT row_to_json(expenses.*) INTO v_old_data 
  FROM expenses WHERE id = p_expense_id;
  
  -- Update expense
  UPDATE expenses SET
    description = p_description,
    amount = p_amount,
    category_id = p_category_id,
    updated_at = now()
  WHERE id = p_expense_id;
  
  -- Log the change
  INSERT INTO expense_audit_log (expense_id, action, performed_by, previous_data, new_data, reason)
  VALUES (
    p_expense_id,
    'updated',
    v_admin_id,
    v_old_data,
    (SELECT row_to_json(expenses.*) FROM expenses WHERE id = p_expense_id),
    p_reason
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**UI:**
- Edit button in expense detail modal
- Require "reason for change" field
- Show audit history timeline in modal

---

### Feature 4: **Expense Transparency Dashboard (Student View)**

**New Page: `StudentExpenseTransparency.tsx`**

**Features:**
- 📊 Pie chart: Spending by category
- 📈 Line chart: Expenses over time
- 💵 Total collected vs. total spent
- 📋 Recent expenses list (approved only)
- 🔍 Search and filter by category/date
- 📥 Download expense report (PDF/CSV)

**Query for Student Dashboard:**
```sql
CREATE OR REPLACE FUNCTION get_approved_expenses_summary(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
) RETURNS TABLE (
  total_spent DECIMAL,
  by_category JSONB,
  by_month JSONB,
  recent_expenses JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE status = 'approved') as total_spent,
    (SELECT jsonb_agg(jsonb_build_object('category', ec.name, 'total', cat_totals.total))
     FROM (
       SELECT category_id, SUM(amount) as total 
       FROM expenses 
       WHERE status = 'approved'
       GROUP BY category_id
     ) cat_totals
     JOIN expense_categories ec ON cat_totals.category_id = ec.id
    ) as by_category,
    (SELECT jsonb_agg(jsonb_build_object('month', month_totals.month, 'total', month_totals.total))
     FROM (
       SELECT DATE_TRUNC('month', expense_date) as month, SUM(amount) as total
       FROM expenses
       WHERE status = 'approved'
       GROUP BY month
       ORDER BY month DESC
     ) month_totals
    ) as by_month,
    (SELECT jsonb_agg(row_to_json(e.*))
     FROM (
       SELECT e.*, ec.name as category_name
       FROM expenses e
       LEFT JOIN expense_categories ec ON e.category_id = ec.id
       WHERE e.status = 'approved'
       ORDER BY e.expense_date DESC
       LIMIT 20
     ) e
    ) as recent_expenses;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

### Feature 5: **Budget vs. Actual Tracking**

**Schema:**
```sql
-- Add budget planning
CREATE TABLE IF NOT EXISTS expense_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES expense_categories(id),
  payment_type_id UUID REFERENCES payment_types(id), -- Which fund
  budget_amount DECIMAL(10,2) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_by UUID REFERENCES admins(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add unique constraint
ALTER TABLE expense_budgets ADD CONSTRAINT unique_budget_period
  UNIQUE (category_id, payment_type_id, period_start, period_end);
```

**UI Component: `BudgetOverview.tsx`**
- Progress bars showing budget utilization
- Alerts when category exceeds 80% of budget
- Comparison: Budget vs. Actual vs. Remaining

---

### Feature 6: **Receipt Management Enhancements**

**Features:**
1. **Receipt Preview in List**
   ```tsx
   // In ExpenseList.tsx
   <img 
     src={getPublicUrl('expense-receipts', expense.receipt_url)} 
     alt="Receipt thumbnail"
     className="w-16 h-16 object-cover rounded"
   />
   ```

2. **Receipt Gallery View**
   - Lightbox for full-size viewing
   - Zoom and pan controls
   - Download original receipt

3. **Multiple Receipts per Expense**
   ```sql
   -- Create receipts table
   CREATE TABLE expense_receipts (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
     file_path TEXT NOT NULL,
     file_name TEXT,
     uploaded_at TIMESTAMPTZ DEFAULT now()
   );
   ```

---

### Feature 7: **Expense Analytics Dashboard (Admin)**

**Components:**
1. **SpendingTrends.tsx** - Line/bar charts over time
2. **CategoryBreakdown.tsx** - Pie chart with percentages
3. **TopExpenses.tsx** - Largest expenses list
4. **BudgetHealth.tsx** - Budget vs. actual gauges
5. **ExpenseVsIncome.tsx** - Collections vs. spending comparison

**Metrics:**
- Total spent (this month, year, all-time)
- Average expense amount
- Most expensive category
- Spending velocity (rate of spend)
- Funds utilization percentage

---

## 🎨 UI Design Consistency

All expense pages will follow existing design system:

**Components to Reuse:**
- ✅ `GlassCard` - For expense cards
- ✅ `FileUploader` - For receipt uploads
- ✅ `BackButton` - Consistent navigation
- ✅ Background grid + gradient orbs pattern
- ✅ Framer Motion animations (page enter/exit)

**Color Scheme:**
- Pending: `text-yellow-400`
- Approved: `text-green-400`
- Rejected: `text-red-400`
- Categories: Use existing tailwind colors with glass effect

---

## 📱 Implementation Priority

### Sprint 1: Core Enhancements (This Week)
1. ✅ Add expense status workflow (pending/approved/rejected)
2. ✅ Create expense categories table and UI
3. ✅ Add expense editing with audit trail
4. ✅ Implement receipt preview in list

### Sprint 2: Analytics & Reporting
5. ✅ Build expense analytics dashboard
6. ✅ Create student expense transparency page
7. ✅ Add spending charts (category, time-series)

### Sprint 3: Advanced Features
8. ✅ Implement budget tracking
9. ✅ Add multiple receipts per expense
10. ✅ Create expense export (PDF/CSV)

---

## 🔐 Security Enhancements for Expenses

1. **Server-side validation** of all expense data
2. **RLS policies** for expense approval (only senior admins)
3. **Audit logging** for all expense modifications
4. **File upload security** (covered in main security audit)
5. **Amount limits** (max single expense amount)

```sql
-- Example RLS for expense approval
CREATE POLICY "Only senior admins can approve expenses"
ON expenses FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM admins
    WHERE user_id = auth.uid()
    AND can_manage_students = true -- Senior admin
  )
)
WITH CHECK (
  status IN ('approved', 'rejected')
);
```

---

## 🚀 Next Steps

**Ready to implement! Please choose:**

A) **Start with expense approval workflow** (database + UI)
B) **Implement expense categories first** (provides foundation)
C) **Build student transparency dashboard** (high visibility feature)
D) **Complete all Sprint 1 items in sequence**

Let me know your preference, and I'll begin coding immediately! 💪
