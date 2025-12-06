/**
 * Core TypeScript types for the application
 */

// Student/User Interface
export interface Student {
  id: string;
  reg_number: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  section: string | null;
  department: string;
  level: string; // e.g., '200L'
  force_password_change: boolean;
  is_active: boolean;
  roles?: string[];
  // Admin records joined from the admins table
  admins?: Array<{
    id: string;
    role: string;
    can_create_payments: boolean;
    can_approve_payments: boolean;
    can_manage_students: boolean;
    can_view_analytics: boolean;
  }>;
  // Derived admin permissions (aggregated from `admins` table)
  admin_permissions?: {
    can_create_payments?: boolean;
    can_approve_payments?: boolean;
    can_manage_students?: boolean;
    can_view_analytics?: boolean;
  };
  created_at?: string;
  updated_at?: string;
}

// Authentication Context Type
export interface AuthContextType {
  user: Student | null;
  loading: boolean;
  login: (regNumber: string, password: string) => Promise<{ student: Student; mustChangePassword: boolean }>;
  logout: () => Promise<void>;
  changePassword: (studentId: string, currentPassword: string, newPassword: string) => Promise<void>;
  updateProfile: (profileData: Partial<Student>) => Promise<Student>;
  isAuthenticated: boolean;
  isProfileComplete: boolean;
  needsPasswordChange: boolean;
  hasPermission: (permission: 'can_create_payments' | 'can_approve_payments' | 'can_manage_students' | 'can_view_analytics') => boolean;
  // Refresh current session from server and update context
  refreshSession: () => Promise<void>;
}

// Profile Update Data
export interface ProfileUpdateData {
  email?: string;
  phone?: string;
  section?: string;
  reg_number?: string;
}

// Payment Record
export interface Payment {
  id: string;
  student_id: string;
  payment_type_id: string;
  amount: number;
  payment_method: 'bank_transfer' | 'cash' | 'pos';
  transaction_ref?: string;
  receipt_url?: string;
  status: 'pending' | 'approved' | 'rejected' | 'partial' | 'waived';
  rejection_reason?: string;
  waiver_reason?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  notes?: string;
  submitted_at: string;
  created_at: string;
  updated_at: string;
  payment_types?: PaymentType; // For joins
}

// Payment Type (Dues Configuration)
export interface PaymentType {
  id: string;
  title: string;
  description?: string;
  category: 'semester_dues' | 'books' | 'events' | 'projects' | 'welfare' | 'custom';
  amount: number;
  allow_partial: boolean;
  is_mandatory: boolean;
  deadline: string;
  icon?: string;
  color?: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  created_by?: string;
  approver_id?: string;
  target_levels?: string[];
  target_departments?: string[];
  is_active: boolean;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

// Payment Statistics
export interface PaymentStats {
  totalPaid: number;
  totalDue: number;
  paymentsMade: number;
  pendingPayments: number;
  nextDueDate?: string;
}

// Audit Log
export interface AuditLog {
  id: string;
  action: string;
  table_name: string;
  record_id: string;
  old_data?: Record<string, unknown>;
  new_data?: Record<string, unknown>;
  performed_by: string;
  performed_at: string;
}
