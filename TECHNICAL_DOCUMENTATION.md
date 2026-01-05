# Class Dues Tracker - Technical Documentation

> **Version:** 2.0  
> **Last Updated:** December 2024  
> **Stack:** React 19 + TypeScript + Supabase + Vite

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Authentication System](#3-authentication-system)
4. [Database Schema](#4-database-schema)
5. [Security Implementation](#5-security-implementation)
6. [Payment System](#6-payment-system)
7. [Expense Management](#7-expense-management)
8. [Notification System](#8-notification-system)
9. [PDF Export System](#9-pdf-export-system)
10. [Offline Capabilities](#10-offline-capabilities)
11. [Real-time Features](#11-real-time-features)
12. [Frontend Components](#12-frontend-components)
13. [Hooks & Services](#13-hooks--services)
14. [Deployment](#14-deployment)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. System Overview

### Purpose
The Class Dues Tracker is a comprehensive web application designed to manage class financial contributions, expenses, and student payments for the ECE Department. It provides role-based access control with distinct dashboards for students and administrators.

### Key Features
- **Student Portal:** View payment status, make payments, track history
- **Admin Portal:** Approve payments, manage expenses, view analytics
- **Financial Tracking:** Real-time balance calculations with category breakdowns
- **Receipt Generation:** QR code scanning, image uploads, PDF receipts
- **Transparency Dashboard:** Students can view how funds are spent
- **Waiving System:** Admins can waive payments for specific students
- **Pay-for-Others:** Students can pay dues for classmates

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS, Framer Motion |
| Backend | Supabase (PostgreSQL, Auth, Storage, Realtime) |
| PDF Generation | jsPDF, jspdf-autotable |
| Icons | Lucide React |
| State Management | React Context + Custom Hooks |

---

## 2. Architecture

### Directory Structure

```
src/
├── components/          # Reusable UI components
│   ├── admin/          # Admin-specific components
│   ├── student/        # Student-specific components
│   └── ui/             # Generic UI components (GlassCard, Modal, etc.)
├── config/             # Configuration files
│   ├── colors.ts       # Color palette and gradients
│   └── supabase.ts     # Supabase client initialization
├── contexts/           # React Context providers
│   └── AuthContext.tsx # Authentication state management
├── hooks/              # Custom React hooks
│   ├── useAuth.ts      # Authentication hook
│   ├── useToast.ts     # Toast notification hook
│   └── useExpenses.ts  # Expense management hook
├── pages/              # Page components
│   ├── admin/          # Admin pages (dashboard, students, expenses)
│   └── student/        # Student pages (dashboard, payment history)
├── services/           # API service layers
│   ├── authService.ts  # Authentication operations
│   └── expenseService.ts # Expense CRUD operations
├── types/              # TypeScript type definitions
└── utils/              # Utility functions
    ├── formatters.ts   # Currency and date formatting
    └── pdfExport.ts    # PDF generation utilities
```

### Data Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   React     │────▶│   Supabase   │────▶│  PostgreSQL │
│   Frontend  │◀────│   Client     │◀────│   Database  │
└─────────────┘     └──────────────┘     └─────────────┘
       │                    │
       │     ┌──────────────┴──────────────┐
       │     │                             │
       ▼     ▼                             ▼
┌─────────────────┐         ┌─────────────────────┐
│  Row Level      │         │   Realtime          │
│  Security (RLS) │         │   Subscriptions     │
└─────────────────┘         └─────────────────────┘
```

---

## 3. Authentication System

### Overview
Authentication uses Supabase Auth with custom password hashing for student login. The system supports:
- Student login via Reg Number + Password
- Admin authentication with enhanced permissions
- Role-based access control (RBAC)

### Auth Flow

```typescript
// src/services/authService.ts

class AuthService {
  // Student login flow:
  // 1. Find student by reg_number in students table
  // 2. Hash provided password with SHA-256
  // 3. Compare with stored password_hash
  // 4. If match, sign in via Supabase Auth or create session
  
  async login(regNumber: string, password: string) {
    const student = await findStudentByRegNumber(regNumber);
    const hashedPassword = await hashPassword(password);
    
    if (student.password_hash === hashedPassword) {
      // Create authenticated session
      return await supabase.auth.signInWithPassword({
        email: student.email,
        password: password
      });
    }
  }
}
```

### Password Security

```typescript
// Password hashing implementation
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

### User Roles

| Role | Permissions |
|------|-------------|
| Student | View own payments, make payments, view expenses |
| Class Rep | Student permissions + limited admin access |
| Financial Secretary (FinSec) | Full payment management |
| Admin | Full system access |
| Super Admin | All permissions including system settings |

### Permission Checks

```typescript
// src/hooks/useAuth.ts
function useAuth() {
  const hasPermission = (permission: string): boolean => {
    const permissions = user?.admins || {};
    return permissions[permission] === true;
  };
  
  return { user, hasPermission, isAdmin, isFinsec };
}
```

---

## 4. Database Schema

### Core Tables

#### `students`
```sql
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  reg_number TEXT UNIQUE NOT NULL,
  email TEXT,
  phone TEXT,
  level TEXT,
  department TEXT DEFAULT 'ECE',
  section TEXT,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_admin BOOLEAN DEFAULT false,
  is_finsec BOOLEAN DEFAULT false,
  is_class_rep BOOLEAN DEFAULT false,
  force_password_change BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### `payment_types`
```sql
CREATE TABLE payment_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  amount DECIMAL NOT NULL,
  category TEXT NOT NULL, -- 'dept_dues', 'faculty_dues', etc.
  is_active BOOLEAN DEFAULT true,
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### `payments`
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id),
  payment_type_id UUID REFERENCES payment_types(id),
  amount DECIMAL NOT NULL,
  transaction_ref TEXT,
  receipt_url TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  rejection_reason TEXT,
  paid_by UUID REFERENCES students(id), -- For pay-for-others feature
  approved_by UUID REFERENCES students(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  approved_at TIMESTAMPTZ
);
```

#### `expenses`
```sql
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  amount DECIMAL NOT NULL,
  category_id UUID REFERENCES expense_categories(id),
  payment_type_id UUID REFERENCES payment_types(id), -- Which fund to deduct from
  receipt_url TEXT,
  status TEXT DEFAULT 'pending',
  expense_date TIMESTAMPTZ,
  created_by UUID REFERENCES students(id),
  approved_by UUID REFERENCES students(id),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  approved_at TIMESTAMPTZ
);
```

#### `admins` (permission flags)
```sql
CREATE TABLE admins (
  id UUID PRIMARY KEY REFERENCES students(id),
  role TEXT DEFAULT 'admin',
  can_create_payments BOOLEAN DEFAULT true,
  can_approve_payments BOOLEAN DEFAULT true,
  can_manage_students BOOLEAN DEFAULT true,
  can_view_analytics BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Relationships Diagram

```
                    ┌─────────────────┐
                    │    students     │
                    └────────┬────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
    ┌──────────┐      ┌──────────┐       ┌──────────┐
    │ payments │      │  admins  │       │ expenses │
    └────┬─────┘      └──────────┘       └────┬─────┘
         │                                    │
         ▼                                    ▼
  ┌──────────────┐                 ┌───────────────────┐
  │payment_types │                 │expense_categories │
  └──────────────┘                 └───────────────────┘
```

---

## 5. Security Implementation

### Row Level Security (RLS)

All tables have RLS enabled with policies that restrict data access based on user authentication and role.

#### Students Table RLS

```sql
-- Students can only read their own record
CREATE POLICY "students_read_own" ON students
  FOR SELECT USING (auth.uid()::text = id::text);

-- Admins can read all students
CREATE POLICY "admins_read_all" ON students
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admins WHERE id::text = auth.uid()::text)
  );
```

#### Payments Table RLS

```sql
-- Students can read their own payments
CREATE POLICY "students_own_payments" ON payments
  FOR SELECT USING (student_id::text = auth.uid()::text);

-- Students can read payments they made for others
CREATE POLICY "paid_by_access" ON payments
  FOR SELECT USING (paid_by::text = auth.uid()::text);

-- Admins have full access
CREATE POLICY "admin_payments_access" ON payments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admins WHERE id::text = auth.uid()::text)
  );
```

### Input Validation & XSS Prevention

```typescript
// All user inputs are validated and sanitized
// Using textContent instead of innerHTML for user data display

// SECURE:
element.textContent = userInput;

// VULNERABLE (never use):
// element.innerHTML = userInput;
```

### Storage Security

```sql
-- Storage bucket policies for receipts
CREATE POLICY "receipt_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'receipts' AND
    auth.uid() IS NOT NULL
  );

CREATE POLICY "receipt_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'receipts');
```

---

## 6. Payment System

### Payment Flow

```
Student                   System                    Admin
   │                         │                         │
   │  1. Submit Payment      │                         │
   │  ────────────────────▶  │                         │
   │                         │                         │
   │  2. Upload Receipt      │                         │
   │  ────────────────────▶  │                         │
   │                         │                         │
   │                         │  3. Payment Pending     │
   │                         │  ────────────────────▶  │
   │                         │                         │
   │                         │  4. Review & Approve    │
   │                         │  ◀────────────────────  │
   │                         │                         │
   │  5. Notification        │                         │
   │  ◀────────────────────  │                         │
```

### Payment Statuses

| Status | Description |
|--------|-------------|
| `pending` | Awaiting admin review |
| `approved` | Payment verified and confirmed |
| `rejected` | Payment declined with reason |

### Waiving Payments

```typescript
// Waiving creates an "approved" payment with special transaction_ref
async function waivePayment(studentId: string, paymentTypeId: string, reason: string) {
  const { data, error } = await supabase
    .from('payments')
    .insert({
      student_id: studentId,
      payment_type_id: paymentTypeId,
      amount: 0, // or full amount
      transaction_ref: `WAIVED-${Date.now()}`,
      status: 'approved',
      notes: reason,
      approved_at: new Date().toISOString()
    });
}
```

### Pay-for-Others Feature

```typescript
// The paid_by field tracks who actually made the payment
interface Payment {
  student_id: string;    // Who the payment is FOR
  paid_by: string;       // Who actually PAID
  // ...other fields
}

// Query to show payments made by current user for others
const { data: paidForOthers } = await supabase
  .from('payments')
  .select('*, students!student_id(*)')
  .eq('paid_by', currentUser.id)
  .neq('student_id', currentUser.id);
```

---

## 7. Expense Management

### Expense Categories

```typescript
interface ExpenseCategory {
  id: string;
  name: string;
  icon: string;  // Lucide icon name
  color: string; // Hex color
}

// Categories are configurable and linked to expenses
const categories = [
  { name: 'Stationery', icon: 'Pencil', color: '#3B82F6' },
  { name: 'Transportation', icon: 'Car', color: '#10B981' },
  { name: 'Events', icon: 'Calendar', color: '#8B5CF6' },
  // ...
];
```

### Expense Workflow

```
1. FinSec records expense
   │
   ▼
2. Expense status = 'pending'
   │
   ▼
3. Admin reviews expense
   │
   ├─▶ Approve → Status = 'approved', deducted from balance
   │
   └─▶ Reject → Status = 'rejected', reason recorded
```

### Net Balance Calculation

```typescript
// Net balance = Total Collections - Total Approved Expenses
function calculateNetBalance(payments: Payment[], expenses: Expense[]) {
  const totalCollected = payments
    .filter(p => p.status === 'approved')
    .filter(p => !p.transaction_ref?.startsWith('WAIVED-'))
    .reduce((sum, p) => sum + p.amount, 0);

  const totalExpenses = expenses
    .filter(e => e.status === 'approved')
    .reduce((sum, e) => sum + e.amount, 0);

  return totalCollected - totalExpenses;
}
```

---

## 8. Notification System

### Implementation

```typescript
// src/hooks/useToast.ts
const useToast = () => {
  const success = (message: string) => {
    // Display success toast
  };
  
  const error = (message: string) => {
    // Display error toast
  };
  
  const info = (message: string) => {
    // Display info toast
  };
  
  return { success, error, info };
};
```

### Real-time Notifications

```typescript
// Subscribe to payment status changes
const subscription = supabase
  .channel('payment-updates')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'payments',
      filter: `student_id=eq.${userId}`
    },
    (payload) => {
      if (payload.new.status === 'approved') {
        toast.success('Your payment has been approved!');
      } else if (payload.new.status === 'rejected') {
        toast.error(`Payment rejected: ${payload.new.rejection_reason}`);
      }
    }
  )
  .subscribe();
```

---

## 9. PDF Export System

### Architecture

```typescript
// src/utils/pdfExport.ts

// Uses jsPDF with autoTable plugin for professional reports
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Color scheme matching app design
const COLORS = {
  primary: '#FF6B35',
  secondary: '#1A0E09',
  accent: '#50C878',
  // ...
};
```

### Export Functions

| Function | Purpose |
|----------|---------|
| `exportStudentsToPDF()` | Student directory with stats |
| `exportPaymentsToPDF()` | Payment history with summaries |
| `exportExpensesToPDF()` | Expense report with categories |
| `exportFinancialSummaryToPDF()` | Complete financial overview |
| `generatePaymentReceiptPDF()` | Individual payment receipt |

### PDF Structure

```
┌──────────────────────────────────────┐
│  HEADER (Dark background + Title)     │
│  ────────────────────────────────────│
│  App branding | Generated date        │
├──────────────────────────────────────┤
│  STATS BOXES                          │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐    │
│  │Total│ │Paid │ │Unpaid│ │ ... │    │
│  └─────┘ └─────┘ └─────┘ └─────┘    │
├──────────────────────────────────────┤
│  DATA TABLE                           │
│  ────────────────────────────────────│
│  Col1 | Col2 | Col3 | Col4           │
│  ──────────────────────────────────  │
│  Data rows with alternating colors   │
├──────────────────────────────────────┤
│  FOOTER                               │
│  Page X of Y | Confidential          │
└──────────────────────────────────────┘
```

### Usage Example

```typescript
// In a component
import { exportPaymentsToPDF } from '@/utils/pdfExport';

const handleExport = () => {
  const payments = [...]; // Your payment data
  const studentInfo = {
    full_name: 'John Doe',
    reg_number: 'ECE/2021/001',
    email: 'john@example.com'
  };
  
  exportPaymentsToPDF(payments, studentInfo);
  // PDF automatically downloads
};
```

---

## 10. Offline Capabilities

### Service Worker Registration

```typescript
// src/registerSW.ts
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}
```

### PWA Manifest

```json
// public/manifest.json
{
  "name": "Class Dues Tracker",
  "short_name": "Dues Tracker",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0F0703",
  "theme_color": "#FF6B35",
  "icons": [...]
}
```

### Offline Data Sync

```typescript
// Queue operations when offline
const offlineQueue = [];

window.addEventListener('online', async () => {
  while (offlineQueue.length > 0) {
    const operation = offlineQueue.shift();
    await executeOperation(operation);
  }
});
```

---

## 11. Real-time Features

### Supabase Realtime Subscriptions

```typescript
// Subscribe to payment changes
const channel = supabase
  .channel('payments-channel')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'payments' },
    (payload) => {
      handlePaymentChange(payload);
    }
  )
  .subscribe();

// Cleanup on unmount
return () => {
  supabase.removeChannel(channel);
};
```

### Live Dashboard Updates

```typescript
// AdminDashboardPage.tsx
useEffect(() => {
  const subscription = supabase
    .channel('dashboard-updates')
    .on('postgres_changes', { event: '*', table: 'payments' }, fetchStats)
    .on('postgres_changes', { event: '*', table: 'expenses' }, fetchStats)
    .on('postgres_changes', { event: '*', table: 'students' }, fetchStats)
    .subscribe();

  return () => {
    supabase.removeChannel(subscription);
  };
}, []);
```

---

## 12. Frontend Components

### Core UI Components

#### `GlassCard`
A reusable glassmorphism card component with backdrop blur.

```tsx
// Usage
<GlassCard className="p-6">
  <h2>Card Content</h2>
</GlassCard>
```

#### `Modal`
Full-featured modal with animations and customizable footer.

```tsx
<Modal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  title="Modal Title"
  size="md"
  footer={<Button>Submit</Button>}
>
  <p>Modal content</p>
</Modal>
```

#### `AnimatedCounter`
Smooth number animation for statistics.

```tsx
<AnimatedCounter value={totalAmount} prefix="₦" />
```

#### `ProfessionalDropdown`
Custom dropdown with search, multi-select, and keyboard navigation.

```tsx
<ProfessionalDropdown
  options={options}
  value={selected}
  onChange={setSelected}
  placeholder="Select option..."
  searchable
/>
```

### Page Components

| Component | Purpose |
|-----------|---------|
| `AdminDashboardPage` | Main admin control center |
| `StudentDashboardPage` | Student payment portal |
| `ManageStudentsPage` | Student CRUD operations |
| `PaymentHistoryPage` | Payment records and receipts |
| `ExpensesPage` | Expense management |
| `AdminCollectedPage` | Collection analytics |

---

## 13. Hooks & Services

### Custom Hooks

#### `useAuth()`
```typescript
const { user, login, logout, hasPermission, isAdmin, isFinsec } = useAuth();
```

#### `useToast()`
```typescript
const { success, error, info } = useToast();
success('Operation completed!');
```

#### `useExpenses()`
```typescript
const { expenses, loading, error, createExpense, approveExpense } = useExpenses();
```

### Services

#### `authService`
```typescript
class AuthService {
  login(regNumber: string, password: string): Promise<User>
  logout(): Promise<void>
  resetPassword(email: string): Promise<void>
  getCurrentUser(): Promise<User | null>
}
```

#### `expenseService`
```typescript
class ExpenseService {
  getExpenses(): Promise<Expense[]>
  createExpense(data: CreateExpenseData): Promise<Expense>
  approveExpense(id: string): Promise<void>
  rejectExpense(id: string, reason: string): Promise<void>
}
```

---

## 14. Deployment

### Environment Variables

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### Build Process

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

### Vercel Deployment

```json
// vercel.json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/" }]
}
```

### Supabase Setup

1. Create Supabase project
2. Run migration SQL files in `supabase/` folder
3. Configure RLS policies
4. Set up storage buckets for receipts
5. Enable realtime for required tables

---

## 15. Troubleshooting

### Common Issues

#### "Permission denied" errors
- Check RLS policies are correctly configured
- Verify user has required admin permissions in `admins` table
- Ensure Supabase Auth session is valid

#### Payments not appearing
- Verify `student_id` matches logged-in user
- Check `status` filter in queries
- Confirm RLS policy allows read access

#### PDF export fails
- Ensure jsPDF is properly imported
- Check data format matches expected interface
- Verify sufficient data exists for export

#### Real-time updates not working
- Confirm Supabase realtime is enabled for table
- Check channel subscription is active
- Verify client has read permissions

### Debug Mode

```typescript
// Enable debug logging in development
if (import.meta.env.DEV) {
  console.log('Debug:', data);
}
```

### Performance Optimization

1. **Pagination** - All lists use pagination to limit data fetching
2. **Memoization** - `useMemo` for computed values
3. **Lazy Loading** - Components load on-demand
4. **Image Optimization** - Receipts stored in Supabase Storage

---

## Appendix

### Color Palette

```typescript
// src/config/colors.ts
export const colors = {
  primary: '#FF6B35',      // Orange
  secondary: '#1A0E09',    // Dark brown
  accentMint: '#50C878',   // Mint green
  statusPaid: '#22C55E',   // Green
  statusUnpaid: '#EF4444', // Red
  statusPending: '#FBBF24',// Yellow
  textPrimary: '#FFFFFF',
  textSecondary: '#9CA3AF',
};
```

### API Reference

See [Supabase Documentation](https://supabase.com/docs) for detailed API reference.

### Support

For technical support or bug reports, please contact the development team or create an issue in the project repository.

---

*This documentation is maintained as part of the Class Dues Tracker project. Last updated December 2024.*
