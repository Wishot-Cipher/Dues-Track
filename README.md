# 🎓 Class Dues Tracker

> A modern, secure, and user-friendly payment management system for class dues, built with React, TypeScript, and Supabase.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-7.2-646cff.svg)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Ready-3ecf8e.svg)](https://supabase.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Quick Start](#-quick-start)
- [Project Structure](#-project-structure)
- [Database Schema](#-database-schema)
- [Security](#-security)
- [Screenshots](#-screenshots)
- [Deployment](#-deployment)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🌟 Overview

**Class Dues Tracker** is a comprehensive financial management platform designed specifically for student class organizations. It streamlines the process of collecting, tracking, and managing class dues with transparency and efficiency.

### Why This Project?

- **Transparency**: Every student can see payment progress and where funds are going
- **Efficiency**: Automated payment tracking reduces manual work
- **Security**: Bank-level security with Row Level Security (RLS)
- **Accessibility**: Beautiful, responsive UI works on any device
- **Trust**: Built-in fraud detection and admin review system

---

## ✨ Features

### 👨‍🎓 Student Features

#### 📊 Dashboard
- Real-time payment statistics and overview
- Upcoming dues with clear deadlines
- Quick payment status at a glance
- Recent payment activity feed

#### 💳 Payment Management
- **Submit Payments** with receipt uploads
- View detailed payment information
- Track payment status (Pending → Approved/Rejected)
- Download submitted receipts
- Payment history with filters
- QR Code generation for easy payments

#### 📈 Progress Tracking
- See how many classmates have paid
- Visual progress bars
- Class participation statistics
- Deadline countdowns

#### 🔔 Notifications (Real-time)
- Payment approval notifications
- Payment rejection with reasons
- Payment waiver notifications
- System announcements

### 👨‍💼 Admin Features

#### 💰 Payment Type Management
- Create new payment requirements
- Set deadlines and amounts
- Configure bank account details
- Target specific student levels
- Partial payment support
- Custom icons and colors

#### ✅ Payment Review System
- Approve or reject submissions
- View receipt images in modal
- Add rejection reasons
- Bulk operations
- QR Code scanner for verification
- Payment waiver functionality

#### 📊 Analytics Dashboard
- Total collections tracking
- Payment status breakdown
- Student participation rates
- Revenue insights
- Export reports

#### 👥 Student Management
- Import students via CSV
- Manage student profiles
- Set admin privileges
- Track student payment history

### 🔒 Security Features

- **Authentication**: Secure login with Supabase Auth
- **Authorization**: Row Level Security (RLS) on all tables
- **File Security**: Validated uploads with size/type restrictions
- **Fraud Detection**: Duplicate receipt detection
- **Data Privacy**: Students only see their own data
- **Secure Storage**: Encrypted file storage with Supabase

---

## 🏗️ Tech Stack

### Frontend
- **React 18** - Modern UI library
- **TypeScript** - Type-safe development
- **Vite** - Lightning-fast build tool
- **Tailwind CSS** - Utility-first styling
- **Framer Motion** - Smooth animations
- **React Router v6** - Client-side routing
- **Lucide React** - Beautiful icons

### Backend
- **Supabase** - Backend as a Service
  - PostgreSQL database
  - Authentication
  - Storage
  - Real-time subscriptions
  - Row Level Security

### Development Tools
- **ESLint** - Code linting
- **TypeScript** - Static typing
- **Vite PWA** - Progressive Web App support

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- Supabase account ([Sign up free](https://supabase.com))

### 1. Clone the Repository

```bash
git clone https://github.com/Wishot-Cipher/Dues-Track.git
cd Dues-Track
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Create a `.env.local` file in the root directory:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Set Up Supabase Database

1. Create a new Supabase project
2. Go to SQL Editor
3. Run the following SQL files in order:

```sql
-- 1. Create schema
supabase/schema.sql

-- 2. Set up policies
supabase/policies.sql

-- 3. Create functions
supabase/functions.sql

-- 4. (Optional) Seed data
supabase/seed.sql
```

### 5. Run the Application

```bash
npm run dev
```

Visit `http://localhost:5173` 🎉

### 6. Build for Production

```bash
npm run build
npm run preview  # Preview production build
```

---

## 📁 Project Structure

```
Dues-Track/
├── public/
│   ├── favicon.svg              # Custom logo
│   ├── favicon-32x32.png
│   ├── favicon-512x512.png
│   └── manifest.json
├── src/
│   ├── assets/                  # Static assets
│   ├── components/
│   │   ├── auth/               # Authentication components
│   │   ├── student/            # Student-specific components
│   │   │   ├── QRCodeGenerator.tsx
│   │   │   ├── PaymentMethodSelector.tsx
│   │   │   └── PayForOthersModal.tsx
│   │   ├── ui/                 # Reusable UI components
│   │   │   ├── GlassCard.tsx
│   │   │   ├── ToastProvider.tsx
│   │   │   ├── Checkbox.tsx
│   │   │   └── Modal.tsx
│   │   ├── Footer.tsx
│   │   └── NotificationCenter.tsx
│   ├── config/
│   │   ├── supabase.ts         # Supabase client
│   │   └── colors.ts           # Design system colors
│   ├── contexts/
│   │   └── ToastContext.ts     # Toast notification context
│   ├── hooks/
│   │   ├── useAuth.ts          # Authentication hook
│   │   └── useToast.ts         # Toast notification hook
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── student/
│   │   │   ├── PaymentDetailPage.tsx
│   │   │   └── PaymentHistoryPage.tsx
│   │   └── admin/
│   │       ├── CreatePaymentTypePage.tsx
│   │       ├── AdminReviewPage.tsx
│   │       ├── ScanQRCodePage.tsx
│   │       ├── ManageStudentsPage.tsx
│   │       └── WaivePaymentPage.tsx
│   ├── services/
│   │   ├── authService.ts
│   │   ├── paymentService.ts
│   │   └── notificationService.ts
│   ├── utils/
│   │   ├── formatters.ts       # Date/currency formatters
│   │   └── notificationSound.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── supabase/
│   ├── schema.sql              # Database schema
│   ├── policies.sql            # RLS policies
│   ├── functions.sql           # Database functions
│   ├── seed.sql                # Sample data
│   ├── make_admin.sql          # Admin creation
│   ├── import_students.sql     # Bulk student import
│   ├── fix_notifications.sql   # Notification setup
│   ├── diagnose_notifications.sql
│   └── archive_old_sql/        # Archived files
├── .env.local                  # Environment variables (create this)
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── README.md
```

---

## 🗄️ Database Schema

### Core Tables

#### `students`
Student profiles and authentication
```sql
- id (UUID, PK)
- reg_number (VARCHAR, UNIQUE)
- full_name (VARCHAR)
- email (VARCHAR)
- phone (VARCHAR)
- level (VARCHAR)
- password_hash (TEXT)
- created_at (TIMESTAMP)
```

#### `payment_types`
Payment definitions created by admins
```sql
- id (UUID, PK)
- title (VARCHAR)
- description (TEXT)
- amount (DECIMAL)
- deadline (TIMESTAMP)
- bank_name (VARCHAR)
- account_number (VARCHAR)
- account_name (VARCHAR)
- target_levels (TEXT[])
- is_active (BOOLEAN)
- icon (VARCHAR)
- color (VARCHAR)
```

#### `payments`
Student payment submissions
```sql
- id (UUID, PK)
- student_id (UUID, FK)
- payment_type_id (UUID, FK)
- amount (DECIMAL)
- transaction_ref (VARCHAR, UNIQUE)
- receipt_url (TEXT)
- status (VARCHAR) -- pending, approved, rejected
- notes (TEXT)
- rejection_reason (TEXT)
- created_at (TIMESTAMP)
- approved_at (TIMESTAMP)
```

#### `admins`
Admin role assignments
```sql
- id (UUID, PK)
- student_id (UUID, FK)
- role (VARCHAR)
- created_at (TIMESTAMP)
```

#### `notifications`
Real-time notifications
```sql
- id (UUID, PK)
- recipient_id (UUID, FK)
- type (VARCHAR)
- title (VARCHAR)
- message (TEXT)
- is_read (BOOLEAN)
- created_at (TIMESTAMP)
```

### Storage Buckets

#### `payment-receipts`
- Stores receipt images (JPG, PNG, PDF)
- Max file size: 5MB
- Public read access
- Authenticated write access

---

## 🔐 Security

### Authentication & Authorization
- Supabase Auth for secure login
- Password hashing with bcrypt
- Protected routes with authentication guards
- Row Level Security (RLS) on all tables

### Data Protection
- Students can only view/edit their own data
- Admins have elevated permissions
- Secure file uploads with validation
- Transaction reference uniqueness enforced

### File Upload Security
- File type validation (JPG, PNG, PDF only)
- File size limits (5MB max)
- Virus scanning (Supabase layer)
- Secure URL generation

### Database Security
- RLS policies prevent unauthorized access
- Prepared statements prevent SQL injection
- Encrypted connections (SSL/TLS)
- Regular backups

---

## 📸 Screenshots

### Student Dashboard
*Clean, modern interface showing payment overview and quick actions*

### Payment Detail
*Comprehensive payment information with bank details and progress tracking*

### Admin Review
*Streamlined interface for reviewing and approving payments*

### Payment History
*Beautiful card-based layout with filters and animations*

---

## 🚀 Deployment

### Deploy to Vercel

1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy!

### Deploy to Netlify

1. Build the project: `npm run build`
2. Deploy the `dist` folder
3. Configure environment variables
4. Set up redirects for SPA routing

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👨‍💻 Author

**Wishot**
- GitHub: [@Wishot-Cipher](https://github.com/Wishot-Cipher)
- Project: [Dues-Track](https://github.com/Wishot-Cipher/Dues-Track)

---

## 🙏 Acknowledgments

- **React Team** - For the amazing React library
- **Vercel** - For Vite and hosting
- **Supabase** - For the incredible BaaS platform
- **Tailwind Labs** - For Tailwind CSS
- **Framer** - For Motion animation library

---

## 📞 Support

If you encounter any issues or have questions:

1. Check the [documentation files](./supabase/)
2. Search existing [issues](https://github.com/Wishot-Cipher/Dues-Track/issues)
3. Create a [new issue](https://github.com/Wishot-Cipher/Dues-Track/issues/new)

---

## 🎉 Project Status

**Current Version:** 1.0.0

**✅ Completed Features:**
- Student & Admin authentication
- Payment type creation
- Payment submission with receipts
- Payment review & approval system
- QR Code generation & scanning
- Real-time notifications
- Payment history with filters
- Student management
- Responsive design
- PWA support

**🚧 In Progress:**
- Analytics dashboard enhancements
- Email notifications
- Expense tracking module

**📝 Planned:**
- Mobile app (React Native)
- SMS notifications
- Report generation
- Bulk payment operations
- Payment reminders

---

Made with ❤️ for student financial transparency and efficiency.

**Happy Coding! 🚀**

## 🌟 Features

### ✅ Implemented

#### Student Features
- **Dashboard** - View payment stats, upcoming dues, and recent activity
- **Payment Submission** - Submit payments with receipt uploads
- **Payment Detail View** - See full payment information, bank details, and class progress
- **Progress Tracking** - See how many classmates have paid
- **Secure File Upload** - Upload receipts (JPG, PNG, PDF) up to 5MB

#### Admin Features
- **Create Payment Types** - Set up new payment requirements
- **Bank Account Management** - Configure payment destination accounts
- **Target Student Selection** - Specify which levels should pay
- **Payment Customization** - Icons, colors, partial payments, deadlines

#### Security
- **Row Level Security (RLS)** - Students can only see their own data
- **Secure Authentication** - Login with registration number and password
- **Protected Routes** - Authentication required for all pages
- **File Upload Security** - Validated file types and sizes

### 🚧 Coming Soon
- Admin payment review and approval
- Payment history and tracking
- Fraud detection
- Notifications system
- Analytics dashboard
- Expense tracking and transparency

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- Supabase account ([Sign up free](https://supabase.com))

### 1. Clone & Install

```bash
# Clone the repository
git clone <your-repo-url>
cd Class-dues-tracker

# Install dependencies
npm install
```

### 2. Set Up Supabase

#### A. Create Supabase Project
1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Create a new project
3. Copy your project URL and anon key

#### B. Configure Environment Variables

Create `.env.local` in the project root:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

#### C. Run Database Migrations

In Supabase SQL Editor, run these files in order:

```bash
1. supabase/schema.sql                    # Creates all tables
2. supabase/create_payments_table.sql     # Creates payments table + RLS
3. supabase/create_storage_bucket.sql     # Creates receipt storage
4. supabase/verify_setup.sql              # Verify everything works
```

### 3. Run the App

```bash
npm run dev
```

Visit `http://localhost:5173` to see the app!

---

## 📚 Documentation

- **[Implementation Summary](IMPLEMENTATION_SUMMARY.md)** - Detailed feature documentation
- **[Testing Guide](PAYMENT_FLOW_TESTING.md)** - How to test payment submission
- **[Project Flow Diagram](userRequest.md)** - Complete system design

---

## 🏗️ Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + Custom Glassmorphism
- **Backend**: Supabase (PostgreSQL + Storage + Auth)
- **Routing**: React Router v6
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **State Management**: React Context API

---

## 📁 Project Structure

```
Class-dues-tracker/
├── src/
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── student/
│   │   │   └── PaymentDetailPage.tsx      # NEW! Payment submission
│   │   └── admin/
│   │       └── CreatePaymentTypePage.tsx
│   ├── components/
│   │   ├── auth/
│   │   ├── ui/
│   │   └── shared/
│   ├── services/
│   │   ├── authService.ts
│   │   └── paymentService.ts
│   ├── hooks/
│   │   └── useAuth.ts
│   └── config/
│       └── supabaseClient.ts
├── supabase/
│   ├── schema.sql
│   ├── create_payments_table.sql          # NEW!
│   ├── create_storage_bucket.sql          # NEW!
│   └── verify_setup.sql                   # NEW!
└── README.md
```

---

## 🎯 User Flow

### Student Journey

1. **Login** → Enter registration number & password
2. **Dashboard** → View upcoming dues with "PAY NOW" buttons
3. **Payment Detail** → Click PAY NOW to see:
   - Full payment information
   - Bank account details (with copy button)
   - Class progress tracker
   - Payment submission form
4. **Submit Payment** → Upload receipt + enter transaction reference
5. **Wait for Approval** → Admin reviews and approves/rejects

### Admin Journey

1. **Login** → Same as student
2. **Dashboard** → Floating + button for admins
3. **Create Payment** → Set up new payment requirement
4. **Review Payments** → (Coming soon) Approve/reject student submissions

---

## 🗄️ Database Schema

### Main Tables

#### `students`
- Student information, authentication, profile data

#### `payment_types`
- Payment definitions created by admins
- Bank account details, deadlines, target levels

#### `payments`
- Student payment submissions
- Status: pending → approved/rejected

#### `admins`
- Admin role assignments
- Linked to student accounts

### Storage Buckets

#### `payment-receipts`
- Stores uploaded receipt images/PDFs
- Public read access, authenticated write

---

## 🔐 Security Features

### Authentication
- Supabase Auth for login/logout
- Protected routes require authentication
- Automatic redirection based on user state

### Authorization
- Row Level Security (RLS) on all tables
- Students can only view/edit their own data
- Admins have elevated permissions
- Storage policies prevent unauthorized access

### Data Validation
- File type validation (images and PDFs only)
- File size limits (5MB max)
- Required field validation
- Transaction reference uniqueness

---

## 🧪 Testing

### Test Student Payment Submission

1. **Setup** (one-time):
   ```sql
   -- Run in Supabase SQL Editor
   supabase/create_payments_table.sql
   supabase/create_storage_bucket.sql
   ```

2. **Login** as student (e.g., `2024/274872`)

3. **Navigate** to dashboard

4. **Click** "💰 PAY NOW" on any payment

5. **Fill form**:
   - Upload a receipt image/PDF
   - Enter transaction reference
   - (Optional) Add notes

6. **Submit** and check database for new payment record

### Verify Setup

```sql
-- Run in Supabase SQL Editor
supabase/verify_setup.sql
```

This will show:
- ✅ Tables created
- ✅ Storage bucket configured
- ✅ RLS policies active
- ✅ Payment types available

---

## 🎨 Design System

### Colors
- **Primary**: `#FF6B35` (Vibrant Orange)
- **Accent**: `#50D890` (Mint Green)
- **Background**: Dark gradient (Brown → Black)
- **Status Paid**: `#10B981` (Green)
- **Status Unpaid**: `#EF4444` (Red)
- **Warning**: `#F59E0B` (Amber)

### Components
- **Glassmorphism cards** - Translucent backgrounds with blur
- **Gradient buttons** - Primary → Mint
- **Smooth animations** - Framer Motion
- **Responsive design** - Mobile-first approach

---

## 🚦 Roadmap

### Phase 1: Core Features (CURRENT)
- [x] Authentication system
- [x] Student dashboard
- [x] Admin create payment types
- [x] Student payment submission
- [ ] Admin payment review

### Phase 2: Enhanced Features
- [ ] Payment history
- [ ] Receipt viewer (modal)
- [ ] Fraud detection
- [ ] Notifications
- [ ] Search and filters

### Phase 3: Advanced Features
- [ ] Expense tracking
- [ ] Analytics dashboard
- [ ] Report generation
- [ ] Bulk operations
- [ ] Email notifications

---

## 🐛 Troubleshooting

### "Payment types not showing"
- Check `payment_types` table has records
- Verify `is_active = true`
- Check `deadline` is in the future
- Verify `target_levels` matches student level

### "Failed to upload receipt"
- Run `create_storage_bucket.sql`
- Check file size < 5MB
- Check file type is JPG/PNG/PDF

### "Cannot submit payment"
- Check `payments` table exists
- Verify RLS policies are set
- Check transaction reference is unique

### Database Access Issues
- Verify `.env.local` has correct credentials
- Check Supabase project is running
- Ensure RLS policies allow student access

---

## 📞 Support

For issues or questions:
1. Check [Implementation Summary](IMPLEMENTATION_SUMMARY.md)
2. Review [Testing Guide](PAYMENT_FLOW_TESTING.md)
3. Check browser console for errors
4. Check Supabase logs

---

## 📄 License

MIT License - feel free to use this project for your class or organization!

---

## 🙏 Acknowledgments

Built with ❤️ for class financial transparency and efficiency.

**Tech Stack Credits:**
- React Team for React 18
- Vercel for Vite
- Supabase for awesome BaaS
- Tailwind Labs for Tailwind CSS

---

## 🎉 Current Status

**✅ FULLY FUNCTIONAL:**
- Student can view payment types
- Student can submit payments with receipts
- Secure file uploads to Supabase Storage
- Database records created successfully
- Toast notifications working
- Beautiful responsive UI

**🚧 NEXT UP:**
- Admin payment review page
- Approve/Reject payments
- Receipt viewer
- Payment status tracking

Happy coding! 🚀
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
