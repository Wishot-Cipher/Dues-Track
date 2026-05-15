# Multi-Tenant Production Architecture Roadmap

## Goal
Implement a production-ready university model with:
- Institution -> Faculty -> Class Group hierarchy
- Controlled admin creation flow
- Semester-aware operations
- Safe, auditable level progression

## Design Principles
1. Keep one internal domain model and map UI labels by org type.
2. Prefer additive schema changes over destructive rewrites.
3. Make promotions explicit and auditable (no silent auto-promotion).
4. Ship in phases with compatibility bridges.

## Target Domain Model
1. Institution (existing organization)
2. Faculty (organization_group with kind="faculty")
3. Class Group (organization_group with kind="class", parent_group_id -> faculty)
4. Member (existing organization_member)

## Permission Model
1. super_admin: platform-level governance
2. org_owner/org_admin: institution-level governance
3. faculty_admin: faculty-level governance
4. group_admin/secretary/treasurer: class-group operations

## Academic Time Model
1. AcademicSession: year scope, e.g. 2024/2025
2. AcademicTerm: semester/term inside session
3. ClassProgressionPolicy: level sequence per class group
4. PromotionRun + PromotionDecision: immutable audit trail

## Rollout Plan

### Phase 1 - Contracts and Compatibility (current sprint)
- Add faculty/class hierarchy and academic progression types in frontend domain contracts.
- Keep existing flows running with default kind="general".
- Add role support for faculty_admin.

### Phase 2 - Data Layer
- Add DB columns/tables:
  - organization_groups.kind
  - academic_sessions
  - academic_terms
  - class_progression_policies
  - promotion_runs
  - promotion_decisions
- Add indexes for organization_id, kind, active term lookup.

### Phase 3 - Admin UX
- Institution admin: create faculty.
- Faculty admin/class rep: create class group under faculty.
- Student: join class group via invite/request flow.

### Phase 4 - Semester Operations
- Term open/close actions.
- Promotion dry-run screen with per-member decision preview.
- Manual approval step before commit.

### Phase 5 - Hardening
- Audit logs for admin actions.
- Alerts for term end and pending promotions.
- Monitoring dashboards and failure notifications.

## Operational Rules
1. Never auto-promote without a recorded PromotionRun.
2. Never modify historical payment data during level transitions.
3. New term activation should not rewrite old term contexts.
4. Promotion failures must be resumable and idempotent.

## API/Service Boundaries
1. institutionService
2. facultyService
3. classGroupService
4. academicCalendarService
5. promotionService
6. inviteService
7. permissionService

## Immediate Next Tasks
1. Implement DB migration SQL for Phase 2 tables/columns.
2. Add faculty creation in organization/group management UI.
3. Add academic term CRUD screens and status transitions.
4. Implement promotion dry-run endpoint and admin confirmation flow.
