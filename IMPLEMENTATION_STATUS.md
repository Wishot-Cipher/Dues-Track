# Implementation Status: Professional Dues-Track Architecture

**Last Updated**: May 15, 2026
**Status**: IN PROGRESS (Phase 1)

---

## ✅ COMPLETED CHANGES

### 1. Login Flow Enhancement
**File**: `src/pages/OrgLoginPage.tsx`
- ✅ Added department membership verification
- ✅ If `member.group_id` is NULL → redirect to `/join` with message
- ✅ If `member.group_id` exists → proceed to dashboard normally
- ✅ Forgot password link already integrated

### 2. Route Architecture
**File**: `src/App.tsx`
- ✅ Commented out public `/create` route
- ✅ Route now hidden from public access

### 3. Landing Page Cleanup
**File**: `src/pages/LandingPage.tsx`
- ✅ Removed "Create Organization" button from navbar
- ✅ Users now only see search functionality

---

## 🚀 IN PROGRESS - NEXT STEPS

### Phase 1: Department Selection/Creation Flow (IMMEDIATE)

#### 1A. Update CreateDepartmentPage (`src/pages/CreateDepartmentPage.tsx`)
**Goal**: Transform from "create department" to "select or create"

**Changes Needed**:
```
Step 1: Search & Select Organization
  - Show organization info
  - List existing departments (enhanced UX)

Step 2: Join Existing or Create New
  ├─ Existing Departments
  │  ├─ Show all existing departments
  │  ├─ Click to join
  │  └─ No password needed for existing
  │
  └─ Create New Department
     ├─ Show form (existing code)
     ├─ You become CLASS REP
     └─ Need to set password

Step 3: Confirm & Login
  - Show summary
  - Automatically log in user
```

**UI Enhancements**:
- Add prominent "Existing Departments" section
- Show member count per department
- Add CTA: "Can't find yours? Create it"
- Visual distinction between "join" and "create" paths

#### 1B. Handle Joining Existing Department
**New Function in organizationService.ts**:
```typescript
async addMemberToGroup(
  memberId: string,
  groupId: string
): Promise<OrganizationMember | null>
```

This allows users to join existing departments without creating new ones.

#### 1C. Password Reset Integration
**Status**: Already exists at `/{orgSlug}/forgot-password`
**Enhancement**: Add OTP verification (optional but recommended)

---

### Phase 2: Admin Console - University Creation (HIGH PRIORITY)

#### 2A. Create Console Pages
**New Pages**:
- `src/pages/admin/ConsoleUniversitiesPage.tsx`
  - List all organizations
  - Create new organization
  - Edit organization details
  - View subscription status

- `src/pages/admin/ConsoleRoleManagementPage.tsx`
  - Search members by org
  - View current roles
  - Assign/revoke roles (class rep, admin, etc.)
  - Audit log of changes

#### 2B. Add Routes to Console
**Update**: `src/pages/PlatformConsolePage.tsx`
- Add navigation to university management
- Add navigation to role management
- Add breadcrumb: Console → Universities → Create New

#### 2C. API Endpoints
**New**:
```typescript
// organizationService.ts or new consoleService.ts
async createUniversityFromConsole(
  name: string,
  shortName: string,
  type: OrganizationType,
  email?: string,
  ...otherFields
): Promise<Organization>

async assignRoleToMember(
  memberId: string,
  orgId: string,
  role: 'class_rep' | 'admin' | 'treasurer'
): Promise<boolean>
```

---

### Phase 3: Database Schema Updates (CRITICAL)

#### 3A. Add New Fields to organization_members
```sql
ALTER TABLE organization_members ADD COLUMN
  -- Already exists: group_id

-- For future enhancements:
  created_by_member_id UUID REFERENCES organization_members(id),
  created_at TIMESTAMP,
  verified_at TIMESTAMP,
  verified_by_member_id UUID REFERENCES organization_members(id);
```

#### 3B. Create role_history Table (Audit Log)
```sql
CREATE TABLE role_change_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) NOT NULL,
  member_id UUID REFERENCES organization_members(id) NOT NULL,
  changed_by_member_id UUID REFERENCES organization_members(id) NOT NULL,
  old_role VARCHAR(50),
  new_role VARCHAR(50),
  reason TEXT,
  changed_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

-- Enable RLS
ALTER TABLE role_change_history ENABLE ROW LEVEL SECURITY;
```

#### 3C. Add Password Reset Support
```sql
-- Add to organization_members table
ALTER TABLE organization_members ADD COLUMN
  reset_token VARCHAR(256),
  reset_token_expires_at TIMESTAMP;

-- Create reset_requests table
CREATE TABLE password_reset_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES organization_members(id) NOT NULL,
  token VARCHAR(256) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  is_valid BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 📋 COMPLETE TASK CHECKLIST

### Phase 1: Foundation
- [x] Update OrgLoginPage with membership check
- [x] Comment out /create route
- [x] Remove Create button from landing
- [ ] Update CreateDepartmentPage UX
- [ ] Add addMemberToGroup function
- [ ] Test membership verification

### Phase 2: Console Enhancement
- [ ] Create ConsoleUniversitiesPage
- [ ] Create ConsoleRoleManagementPage  
- [ ] Add routes to PlatformConsole
- [ ] Create role management service
- [ ] Add audit logging

### Phase 3: Database Updates
- [ ] Execute schema migrations for audit log
- [ ] Execute password reset schema
- [ ] Test RLS on new tables

### Phase 4: Password Reset
- [ ] Enhance existing reset page with OTP
- [ ] Create passwordResetService
- [ ] Add email notifications
- [ ] Test reset flow end-to-end

### Phase 5: Testing & Polish
- [ ] Test complete onboarding flow
- [ ] Test login with membership check
- [ ] Test admin role assignment
- [ ] Test password reset
- [ ] Performance testing
- [ ] Security review

---

## 🎯 KEY FILES TO MODIFY

| Priority | File | Change |
|----------|------|--------|
| CRITICAL | `src/pages/CreateDepartmentPage.tsx` | Refactor UI - add existing dept display |
| CRITICAL | `src/pages/admin/ConsoleUniversitiesPage.tsx` | CREATE - university management |
| CRITICAL | `src/pages/admin/ConsoleRoleManagementPage.tsx` | CREATE - role assignment |
| HIGH | `src/services/organizationService.ts` | Add addMemberToGroup |
| HIGH | `src/services/platformAdminService.ts` | Add university creation RPC |
| HIGH | `multi-tenant/migrations/009_role_history.sql` | CREATE - audit log table |
| MEDIUM | `src/pages/student/ForgotPasswordPage.tsx` | Enhance with OTP |
| MEDIUM | `src/services/passwordResetService.ts` | CREATE - reset logic |
| LOW | `src/pages/PlatformConsolePage.tsx` | Add navigation links |

---

## 🔐 Security Considerations

1. **Department Assignment**
   - Only authenticated users can join/create
   - Member must verify they belong to that department
   - Admin can reassign later if needed

2. **Role Changes**
   - Must be admin in org
   - Logged in audit table
   - Email notification to affected member

3. **Password Reset**
   - Token expires after 30 minutes
   - OTP sent to registered email
   - Token single-use only

4. **Console Access**
   - Credentials required (separate from member auth)
   - IP whitelisting recommended
   - All actions logged

---

## 📊 User Flow Diagram

```
Landing Page (/)
  ↓
[Search for Organization]
  ↓
Organization Found
  ↓
/{orgSlug}/join  ← Currently: CreateDepartmentPage
  ├─────────────────────────────────┬──────────────────────┐
  │                                  │                      │
  SELECT EXISTING              CREATE NEW DEPARTMENT    (None Available)
  ↓                           ↓
  Enter Password           Enter:
  (If account exists)       - Name
                           - Code
                           - Password
                           ↓
                        [Account Created]
                        [You're Class Rep]
  ↓                           ↓
  [Login]  ←─────────────────────────
  ↓
Check: Has group_id?
  ├─ NO → Show "Select Department" message
  └─ YES → Proceed to Dashboard
```

---

## 🚀 Expected Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| Phase 1 (Login + Routes) | 2-3 hours | ✅ DONE |
| Phase 2 (Console) | 4-5 hours | ⏳ NEXT |
| Phase 3 (Database) | 1-2 hours | ⏳ PENDING |
| Phase 4 (Password Reset) | 2-3 hours | ⏳ PENDING |
| Phase 5 (Testing) | 2-3 hours | ⏳ PENDING |
| **TOTAL** | **11-16 hours** | |

---

## 📝 Notes

- The `/create` route still imports CreateOrganizationPage but is commented out
  - **Option A**: Keep file for reference
  - **Option B**: Archive to `/archived` folder
  - Recommend: **Option B** for clean codebase

- The existing CreateDepartmentPage will become the "Join/Create Department" page
  - No need for new page
  - Just enhance existing UX

- Platform console at `/pvx-console` is ready to extend
  - Already has PlatformLoginForm and dashboard
  - Just need to add university + role management sections

---

## 🔄 Current Dependencies

- ✅ multiTenantAuthService.login() - returns member with group_id
- ✅ organizationService.getGroups() - lists departments
- ✅ supabase RPC functions - ready for new operations
- ✅ RLS policies - will enforce auth at DB level (once executed)

---

## ✋ NEXT IMMEDIATE ACTION

Start with **Phase 2A**: Create the Console Universities Page

This is high-priority because:
1. Moves university creation away from public
2. Requires minimal code
3. Unblocks platform admins
4. Enables testing of the new flow

Would you like me to start building this now?

