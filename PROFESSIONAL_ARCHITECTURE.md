# Professional Dues-Track Onboarding & Access Control Architecture

## Executive Overview
Transform from open public universe creation to a **closed, admin-controlled, role-based system** with powerful self-service capabilities for users.

---

## System Architecture

### Three Distinct User Personas

#### 1. **Platform Admin** (Super Admin)
- **Portal**: `/pvx-console` (hidden, credential-protected)
- **Powers**:
  - Create universities/organizations
  - View platform-wide statistics
  - Manage organization subscriptions
  - **NEW**: Assign/revoke roles (e.g., class rep → person X)
  - **NEW**: Monitor member-to-department mappings
- **Access**: Password-only login to console

#### 2. **Organization Admin** (University/Institution Admin)
- **Portal**: `/{orgSlug}/settings/*` (protected routes)
- **Powers**:
  - Manage departments/groups within their organization
  - View organization analytics
  - Create members/admins
  - **NEW**: Validate department creators (class reps)
  - **NEW**: Reassign roles through console
- **Access**: Multi-tenant login + org membership + admin role

#### 3. **Student/Member** (End User)
- **Portal**: Public app `/{orgSlug}/login`, `/{orgSlug}/contribute`
- **Journey**:
  1. Search for their organization
  2. See existing departments
  3. Select their department (if exists)
  4. Create department if not exists (becomes class rep automatically)
  5. Login with verification of department membership
- **Powers**:
  - View payments/dues
  - Contribute/pay
  - View personal data
  - Change password

---

## User Flows (Detailed)

### FLOW 1: Platform Admin Creates University
```
/pvx-console
  ↓
[Platform Admin Login]
  ↓
Dashboard → "New Organization" button
  ↓
Create University Form:
  - Name, Short name, Type
  - Email, Phone, Country
  - Currency
  - Admin email (initial org admin)
  ↓
Organization Created ✅
  ↓
Initial Org Admin receives setup email
```

### FLOW 2: Student Discovers & Joins Organization
```
Landing Page: /
  ↓
[Search for University]
  ↓
Search Results → Select "Federal University of Lagos"
  ↓
/futo/join  [NEW IMPROVED PAGE]
  ├─ Show existing departments
  │  ├─ Engineering (200 members)
  │  ├─ Medicine (150 members)
  │  └─ Law (100 members)
  │
  └─ Button: "Don't see your department? Create it"
      ↓
      [Department Creation Modal]
      - Department name
      - Department code
      - Your role: Class Rep
      - Your name
      - Your member ID
      - Password (for login)
      ↓
      Department Created ✅
      You are now CLASS REP
```

### FLOW 3: User Login with Membership Verification
```
/{orgSlug}/login
  ↓
[Enter Member ID & Password]
  ↓
↙─────────────────────────┘
│
├─ Member found? NO → "Account not found"
├─ Member active? NO → "Account deactivated"
├─ Member suspended? NO → "Account suspended"
├─ Password correct? NO → "Invalid credentials"
│
└─ All checks passed ✓
   ↓
   [NEW] Verify Department Membership
   ├─ Is member.department_id set? NO → 
   │  "You're not assigned to a department. Contact admin."
   │
   └─ YES → Proceed to login
      ↓
      Redirect to dashboard ✅
```

### FLOW 4: Password Reset
```
/{orgSlug}/login
  ↓
[Link] "Forgot Password?"
  ↓
/reset-password
  ├─ Step 1: Enter email
  ├─ Step 2: Enter member ID
  ├─ Step 3: OTP verification (or security questions)
  ├─ Step 4: New password
  │
  └─ Success → Redirect to login ✅
```

### FLOW 5: Admin Role Management (Console)
```
/pvx-console
  ↓
Dashboard → [Select Organization]
  ↓
{orgSlug}/console/manage-roles
  ↓
Member List with Role Assignments:
┌─────────────────────────────────────────────┐
│ Member          │ Department    │ Role      │
├─────────────────────────────────────────────┤
│ Chioma Okafor   │ Engineering   │ [Class Rep ▼] │
│ Akeem Adeyemi   │ Medicine      │ [Member ▼]   │
│ Zainab Hassan   │ Law           │ [Admin ▼]    │
└─────────────────────────────────────────────┘
        ↓
   [Edit Role]
        ↓
   Confirm & save ✅
   Notification sent to member
```

---

## Database Schema Changes Required

### New Tables/Fields

#### `organization_members` (additions)
```sql
-- NEW FIELDS
ALTER TABLE organization_members ADD COLUMN
  is_verified BOOLEAN DEFAULT false,  -- Verified by admin
  verification_code VARCHAR(6),        -- OTP for password reset
  verification_expires_at TIMESTAMP,
  preferred_department_id UUID REFERENCES organization_groups(id);
```

#### `member_admins` (no change, but enhanced usage)
```
Existing roles:
- can_create_payments
- can_approve_payments
- can_manage_members
- can_manage_admins
- etc.

NEW USAGE:
Assign "class_rep" role → can_manage_members = true (limited to their class)
Assign "admin" role → all permissions within org
```

#### New: `role_assignments` (Optional alternative)
```sql
CREATE TABLE role_assignments (
  id UUID PRIMARY KEY,
  member_id UUID REFERENCES organization_members(id),
  organization_id UUID REFERENCES organizations(id),
  role_type VARCHAR(50), -- 'class_rep', 'admin', 'treasurer', etc.
  assigned_by UUID REFERENCES organization_members(id),
  assigned_at TIMESTAMP,
  expires_at TIMESTAMP (optional),
  is_active BOOLEAN DEFAULT true
);
```

---

## Implementation Roadmap

### Phase 1: Foundation (Days 1-2)
- [ ] Update database schema
- [ ] Create RPC for password reset
- [ ] Create password reset page

### Phase 2: Public User Flow (Day 2-3)
- [ ] Remove `/create` route from public navigation
- [ ] Enhance `/join-org` → search + existing depts display
- [ ] Add department creation modal (class rep flow)
- [ ] Update login to check department membership

### Phase 3: Console Enhancement (Day 3-4)
- [ ] Add university creation to console
- [ ] Add role management page to console
- [ ] Create audit log for role changes
- [ ] Add notifications for role assignments

### Phase 4: Polish & Security (Day 4-5)
- [ ] Email notifications for new departments
- [ ] Admin verification workflow
- [ ] Comprehensive error handling
- [ ] UI/UX refinement

---

## File Structure Changes

```
src/
├── pages/
│   ├── CreateOrganizationPage.tsx      [DELETE or Archive]
│   ├── LandingPage.tsx                 [UPDATE - remove create link]
│   ├── CreateDepartmentPage.tsx        [ENHANCE]
│   ├── OrgLoginPage.tsx                [UPDATE - add membership check]
│   ├── student/
│   │   ├── ForgotPasswordPage.tsx       [ENHANCE - move password reset]
│   │   └── ResetPasswordPage.tsx        [UPDATE]
│   │
│   └── admin/
│       ├── UniversityManagementPage.tsx [NEW - console creation]
│       └── RoleManagementPage.tsx       [NEW - console role assignment]
│
├── components/
│   ├── DepartmentSearchModal.tsx        [NEW]
│   ├── ClassRepConfirmation.tsx         [NEW]
│   └── RoleAssignmentForm.tsx           [NEW]
│
├── services/
│   ├── passwordResetService.ts          [NEW - OTP, reset logic]
│   ├── roleManagementService.ts         [NEW - assign/revoke roles]
│   └── organizationService.ts           [UPDATE - university CRUD to console]
│
└── hooks/
    └── usePasswordReset.ts              [NEW]
```

---

## Route Changes

### PUBLIC ROUTES (No change)
```
GET  /                          Landing
GET  /pvx-console              Platform console login
GET  /{orgSlug}/login          Organization login
GET  /{orgSlug}/join           Search + create department [ENHANCED]
GET  /{orgSlug}/forgot-password Password reset
GET  /reset-password            Reset completion
GET  /{orgSlug}/contribute      Public contribution page
```

### CONSOLE ROUTES (New)
```
GET  /{orgSlug}/console/universities     [Admin] Manage organizations
GET  /{orgSlug}/console/role-management  [Admin] Assign member roles
POST /api/console/create-university      [Platform] Create org
```

### REMOVED ROUTES
```
❌ GET  /create                 [DELETE] Public org creation
```

---

## Security & Authorization

### Login Authorization Chain
```
1. Member exists? 
   → NO: Reject login
2. Member active?
   → NO: Reject login
3. Password correct?
   → NO: Reject login
4. [NEW] Department assigned?
   → NO: Redirect to department selection
   → YES: Continue
5. [Optional] Account verified?
   → NO: Show verification prompt
   → YES: Login complete
```

### Department Creation Authorization
```
Person wants to create department:
1. Authenticate (user)
2. Organization found? YES
3. Department name unique? YES
4. Set: member.preferred_department_id = new_dept.id
5. Set: created_by_member_id = current_member.id
6. Auto-assign as CLASS_REP (can_manage_members in that dept)
```

### Role Assignment Authorization
```
Admin wants to reassign role:
1. Is requester an admin? YES
2. Target member exists in org? YES
3. New role valid? YES
4. Create audit log entry
5. Send notification to member
6. Update member_admins table
```

---

## Professional UX Elements

### 1. Onboarding Email Templates
```
[New Department Created]
From: noreply@payvexo.com
Subject: You're now a Class Rep at Federal University of Lagos

Hi Chioma,

You've successfully created the Engineering Department!
As the class representative, you have the power to:
- Add members to your class
- Manage payment settings
- View department analytics

To add your first members, visit:
https://app.payvexo.com/futo/settings/members

Questions? Support: support@payvexo.com
```

### 2. Admin Dashboard Widget
```
┌─────────────────────────────────────────┐
│ 🎓 Recent Department Creations          │
├─────────────────────────────────────────┤
│ Engineering (FUTO)                      │
│ Created by: Chioma Okafor               │
│ 5 members so far                        │
│ [Verify] [Assign to Faculty]            │
├─────────────────────────────────────────┤
│ Medicine (FUTO)                         │
│ Created by: Dr. Akeem Adeyemi           │
│ 12 members                              │
│ ✅ Verified                             │
└─────────────────────────────────────────┘
```

### 3. Role Change Notification
```
[Role Assignment Notification]
"Hello Chioma, you've been promoted to Class Representative 
for Engineering Department. You now have access to member 
management tools. Click here to get started."
```

---

## API Endpoints Summary

### Platform Admin
```
POST   /api/console/organizations        Create university
GET    /api/console/organizations        List universities
PATCH  /api/console/organizations/{id}   Update org

POST   /api/console/roles/assign          Assign role to member
POST   /api/console/roles/revoke          Revoke role from member
GET    /api/console/audit-log             View role change history
```

### Organization Admin
```
GET    /{orgSlug}/api/members              List members
PATCH  /{orgSlug}/api/members/{id}         Update member
GET    /{orgSlug}/api/members/verify       Verify member status

GET    /{orgSlug}/api/roles                List role assignments
PATCH  /{orgSlug}/api/roles/{id}           Update role
```

### Public/User
```
POST   /{orgSlug}/api/auth/login           Login with verification
POST   /{orgSlug}/api/departments          Create department
GET    /{orgSlug}/api/departments          List departments
POST   /api/auth/password-reset            Request password reset
POST   /api/auth/verify-reset              Verify OTP & set new password
```

---

## Success Metrics

- ✅ Zero unauthorized university creations
- ✅ 100% of class reps verified by admins
- ✅ <1% account lockout rate (from membership checks)
- ✅ <2min password reset time
- ✅ Complete audit trail of role changes
- ✅ Professional, guided user experience

---

## Timeline Estimate

| Phase | Duration | Priority |
|-------|----------|----------|
| Phase 1 (DB + Password Reset) | 1 day | CRITICAL |
| Phase 2 (User Flow) | 1.5 days | CRITICAL |
| Phase 3 (Console) | 1.5 days | HIGH |
| Phase 4 (Polish) | 0.5 days | MEDIUM |
| **TOTAL** | **4.5 days** | |

