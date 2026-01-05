# Multi-Tenant Implementation Roadmap

> **Status:** 🚧 In Progress  
> **Branch:** `feature/multi-tenant`  
> **Last Updated:** January 2026

---

## Phase Overview

```
Phase 1: Database Foundation ◀── YOU ARE HERE
    ↓
Phase 2: Backend Services
    ↓
Phase 3: Frontend Context
    ↓
Phase 4: UI Updates
    ↓
Phase 5: Testing & Validation
    ↓
Phase 6: Production Migration
```

---

## Phase 1: Database Foundation ✅

### Completed Files

| File | Description | Status |
|------|-------------|--------|
| `SCHEMA_DESIGN.md` | Complete schema documentation | ✅ |
| `migrations/001_organizations.sql` | Organizations & Departments tables | ✅ |
| `migrations/002_add_tenant_columns.sql` | Add columns to existing tables | ✅ |
| `migrations/003_migrate_data.sql` | Migrate existing data | ✅ |
| `migrations/004_rls_policies.sql` | Multi-tenant RLS policies | ✅ |
| `types/index.ts` | TypeScript type definitions | ✅ |
| `contexts/OrganizationContext.tsx` | React context for org data | ✅ |

### Migration Order

```bash
# Run in Supabase SQL Editor in this exact order:
1. migrations/001_organizations.sql
2. migrations/002_add_tenant_columns.sql
3. migrations/003_migrate_data.sql
4. migrations/004_rls_policies.sql
```

---

## Phase 2: Backend Services (TODO)

### Tasks

- [ ] Create `organizationService.ts` - CRUD for organizations
- [ ] Create `departmentService.ts` - CRUD for departments  
- [ ] Update `authService.ts` - Add org context to login
- [ ] Update `studentService.ts` - Filter by org/dept
- [ ] Update `paymentService.ts` - Filter by org/dept
- [ ] Update `expenseService.ts` - Filter by org/dept
- [ ] Create `auditService.ts` - Audit logging
- [ ] Update Supabase storage policies for multi-tenant buckets

---

## Phase 3: Frontend Context (TODO)

### Tasks

- [ ] Integrate `OrganizationProvider` in App.tsx
- [ ] Update `AuthContext` to include org info
- [ ] Create `useDepartment` hook
- [ ] Create `useMultiTenantQuery` hook (auto-adds org filter)
- [ ] Update route structure for org-aware URLs

### Route Structure

```
Current:
  /login
  /dashboard
  /admin/students

Multi-tenant:
  /                           → Landing page (choose org)
  /:orgSlug/login            → /futo/login
  /:orgSlug/dashboard        → /futo/dashboard
  /:orgSlug/admin/students   → /futo/admin/students
```

---

## Phase 4: UI Updates (TODO)

### Components to Update

- [ ] `Header.tsx` - Show org name/logo
- [ ] `Sidebar.tsx` - Department switcher (if multi-dept admin)
- [ ] `LoginPage.tsx` - Org-aware login
- [ ] `Dashboard.tsx` - Dynamic currency/levels
- [ ] All pages - Use `useOrganization` hook

### New Components

- [ ] `OrgSwitcher` - For super admins
- [ ] `DepartmentSwitcher` - For org admins
- [ ] `OrgLandingPage` - Public page for each org
- [ ] `SuperAdminDashboard` - Platform management

---

## Phase 5: Testing & Validation (TODO)

### Test Scenarios

- [ ] Create 2 test organizations
- [ ] Create students in each org
- [ ] Verify data isolation (Student A can't see Org B data)
- [ ] Test cross-org login attempts (should fail)
- [ ] Test admin role hierarchy
- [ ] Test RLS policies with different user types
- [ ] Load testing with multiple concurrent orgs

### Security Checklist

- [ ] Verify RLS prevents cross-org data access
- [ ] Verify storage bucket isolation
- [ ] Test API with forged org_id (should fail)
- [ ] Audit log captures all sensitive actions
- [ ] Rate limiting per organization

---

## Phase 6: Production Migration (TODO)

### Pre-Migration

- [ ] Full database backup
- [ ] Create migration rollback script
- [ ] Notify existing users of maintenance window
- [ ] Document current data counts for verification

### Migration Steps

1. [ ] Enable maintenance mode
2. [ ] Run migrations in order
3. [ ] Verify data integrity
4. [ ] Update frontend deployment
5. [ ] Test core flows
6. [ ] Disable maintenance mode
7. [ ] Monitor for issues

### Post-Migration

- [ ] Verify all existing data accessible
- [ ] Check payment history preserved
- [ ] Confirm admin permissions work
- [ ] Monitor error rates
- [ ] Gather user feedback

---

## File Structure

```
multi-tenant/
├── README.md                       # This file
├── SCHEMA_DESIGN.md               # Database design documentation
├── migrations/
│   ├── 001_organizations.sql      # Create orgs & depts
│   ├── 002_add_tenant_columns.sql # Add columns to existing
│   ├── 003_migrate_data.sql       # Migrate existing data
│   └── 004_rls_policies.sql       # RLS policies
├── types/
│   └── index.ts                   # TypeScript definitions
├── contexts/
│   └── OrganizationContext.tsx    # React context
├── services/                      # (TODO)
│   ├── organizationService.ts
│   └── departmentService.ts
└── components/                    # (TODO)
    ├── OrgSwitcher.tsx
    └── DepartmentSwitcher.tsx
```

---

## Development Workflow

### Working on Multi-Tenant Features

```bash
# Switch to feature branch
git checkout feature/multi-tenant

# Make changes
# ...

# Commit with descriptive message
git add .
git commit -m "feat(multi-tenant): add organization service"

# Push to remote
git push origin feature/multi-tenant
```

### Testing Migrations Locally

1. Create a test Supabase project
2. Run migrations in order
3. Verify with test queries
4. Check RLS policies work correctly

### Merging to Main

**DO NOT MERGE** until:
- [ ] All phases complete
- [ ] Full testing passed
- [ ] Production migration plan approved
- [ ] Rollback plan documented

---

## Questions & Decisions

### Decided

| Question | Decision |
|----------|----------|
| Tenant isolation strategy | Shared DB with org_id columns |
| URL structure | `/:orgSlug/...` pattern |
| Default org for migration | FUTO (existing data) |
| Currency handling | Per-org configuration |

### Open Questions

| Question | Options | Status |
|----------|---------|--------|
| How to handle org onboarding? | Self-service vs admin-created | TBD |
| Subscription billing integration? | Paystack vs Flutterwave | TBD |
| Custom domain support? | Subdomain vs path | TBD |

---

## Resources

- [Supabase Multi-Tenancy Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [React Context Best Practices](https://react.dev/reference/react/useContext)

---

*This document is updated as progress is made on the multi-tenant implementation.*
