// App-wide constants

export const APP_NAME = 'Class Dues Tracker'
export const APP_VERSION = '1.0.0'

// User roles
export const USER_ROLES = {
  STUDENT: 'student',
  FINANCIAL_SECRETARY: 'financial_secretary',
  CLASS_REP: 'class_rep',
  EVENT_COORDINATOR: 'event_coordinator',
  CUSTOM: 'custom',
}

// Payment status
export const PAYMENT_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PARTIAL: 'partial',
  WAIVED: 'waived',
}

// Payment methods
export const PAYMENT_METHODS = {
  BANK_TRANSFER: 'bank_transfer',
  CASH: 'cash',
  POS: 'pos',
}

// Payment categories
export const PAYMENT_CATEGORIES = {
  SEMESTER_DUES: 'semester_dues',
  BOOKS: 'books',
  EVENTS: 'events',
  PROJECTS: 'projects',
  WELFARE: 'welfare',
  CUSTOM: 'custom',
}

// Expense categories
export const EXPENSE_CATEGORIES = {
  MATERIALS: 'materials',
  TRANSPORT: 'transport',
  PRINTING: 'printing',
  FOOD: 'food',
  VENUE: 'venue',
  OTHER: 'other',
}

// Notification types
export const NOTIFICATION_TYPES = {
  PAYMENT_DUE: 'payment_due',
  PAYMENT_APPROVED: 'payment_approved',
  PAYMENT_REJECTED: 'payment_rejected',
  REMINDER: 'reminder',
  EXPENSE_REPORT: 'expense_report',
}

// File upload limits
export const FILE_LIMITS = {
  MAX_SIZE: 5 * 1024 * 1024, // 5MB
  ACCEPTED_FORMATS: ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'],
  ACCEPTED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.pdf'],
}

// Levels
export const STUDENT_LEVELS = ['100L', '200L', '300L', '400L', '500L']

// Pagination
export const ITEMS_PER_PAGE = 20

// Date format
export const DATE_FORMAT = 'MMM dd, yyyy'
export const DATETIME_FORMAT = 'MMM dd, yyyy HH:mm'

export const DEPARTMENTS = [
  'Electronics & Computer Engineering',
  'Computer Engineering',
  'Electrical Engineering',
  'Electronics Engineering',
]

export const SECTIONS = ['A', 'B', 'C', 'D']