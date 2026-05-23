# Payvexo — Master Architecture Blueprint

> **This document is the single source of truth for all AI coding assistants and human contributors working on this project.**
> If an AI tool (Codex, GPT-4, Claude, Copilot, Cursor, etc.) is given a task on this codebase, it must read this document first and follow the flows defined here exactly.
> Do **not** invent alternative schemas, rename tables, or skip verification steps. If something here conflicts with code you find in the repo, the document wins — the code is the thing that needs to change.

**Status:** Authoritative. Last updated 2026-05-22.
**Branch:** `feature/multi-tenant`
**Stack:** React + TypeScript + Vite + Tailwind, Supabase (Postgres + Auth + Storage + Edge Functions), Paystack for payments.

---

## ⚠️ AUTHORITATIVE TABLE NAME MAPPING (READ THIS FIRST)

After auditing the existing schema (migrations 001–008), the project already uses different table names than the conceptual ones used in this blueprint. **When writing code or migrations, use the REAL names.** The conceptual names below appear in the blueprint for clarity of explanation, but they are aliases — they do not exist in the database.

| Conceptual name (blueprint) | Real name (database & code) | Notes |
|---|---|---|
| `org_units` | `organization_groups` where `kind='faculty'` | Already supports hierarchy via `parent_group_id` self-reference |
| `org_groups` (leaf) | `organization_groups` where `kind IN ('class','general')` | Same table — `kind` discriminates faculty from leaf |
| `members` | `organization_members` | `id` column = `auth.uid()`; also serves as the profile table |
| `profiles` | `organization_members` | Don't create a separate profiles table |
| `org_executives` | `member_admins` | Already has permission flags (`can_create_payments`, `can_approve_payments`, etc.) |
| `transactions` | `payments` | The existing financial ledger; Paystack columns will be added to it |
| `due_assignments` | (not yet — to be added as `payment_assignments`) | New table in migration 015 |
| `claim_requests` | `claim_requests` | New — see migration 015 |
| `claim_votes` | `claim_votes` | New |
| `executive_invite_codes` | `executive_invite_codes` | New |
| `seed_institutions` | `seed_institutions` | New |
| `platform_earnings` | `platform_earnings` | New |
| `organization_requests` | `organization_requests` | New |

**Existing tables that stay as-is and gain new columns:**
`organizations`, `organization_members`, `organization_groups`, `member_admins`, `organization_settings`, `payments`, `payment_types`, `expenses`, `expense_categories`, `notifications`, `audit_logs`, `super_admins`, `academic_sessions`, `academic_terms`, `class_progression_policies`, `promotion_runs`, `promotion_decisions`.

**Existing tables that are DEAD legacy and will be dropped in migration 020:**
`students`, `admins`, `departments` (zero references in `src/` as of the audit). Do not write any new code against these.

**Existing helper functions that are already in production — reuse them, do not redefine:**
- `get_current_user_org_id()` — returns the caller's org from `organization_members`
- `get_current_member_org_id()` — same purpose, alternative name used in mig 007
- `is_admin_for_org(org_id UUID)` — caller is active in `member_admins` for that org
- `has_permission(permission_name TEXT)` — dynamic permission check on `member_admins`
- `is_current_user_admin()` — any active `member_admins` row for caller

Wherever this blueprint shows pseudocode like `is_org_executive()` or `has_org_permission()`, write the migration using the **existing** function names above. New helper functions are only added when an existing one cannot cover the case.

---

## Table of Contents

0. [What We Are Building](#section-0--what-we-are-building)
1. [Current State vs Target State](#section-1--current-state-vs-target-state)
2. [Complete Supabase Schema](#section-2--complete-supabase-schema)
3. [Row Level Security & Multi-Tenant Isolation](#section-3--row-level-security--multi-tenant-isolation)
4. [Migration Plan (Old Schema → New Schema)](#section-4--migration-plan-old-schema--new-schema)
5. [Search Architecture (The Discovery Layer)](#section-5--search-architecture-the-discovery-layer)
6. [Onboarding Flows (A, B, C, D)](#section-6--onboarding-flows-a-b-c-d)
7. [Trust Level & Claim System](#section-7--trust-level--claim-system)
8. [Paystack Integration & The Fee Model](#section-8--paystack-integration--the-fee-model)
9. [Currency & International Handling](#section-9--currency--international-handling)
10. [Build Order (Phases 1–4)](#section-10--build-order-phases-14)
11. [Rules For AI Coding Assistants](#section-11--rules-for-ai-coding-assistants)
12. [Answers To Specific Questions](#section-12--answers-to-specific-questions)

---

## SECTION 0 — What We Are Building

**Payvexo** is a multi-tenant financial infrastructure platform for organizations — primarily Nigerian student bodies (departments, classes, faculties, SUG), churches, clubs, and associations — with a path to global use.

It handles:

- Dues collection
- Automatic payment distribution (org gets paid directly, platform takes a transparent fee)
- Executive verification (claim flow, member confirmation, school-email check)
- Financial records and reports
- Self-service organization creation (no admin gatekeeping)

### Core value proposition

- Organizations manage dues and finances in one place
- Students pay dues digitally; receipts are generated automatically (no upload required)
- The platform earns a small, transparent fee on every transaction (this is how Payvexo makes money)
- The platform grows itself — students discover, create, and claim organizations without admin intervention

### What makes this different from a simple dues tracker

- **Self-growing.** Students create organizations. Executives claim them. Trust builds progressively.
- **Money flows automatically** via Paystack split payments — no manual reconciliation.
- **Receipt-free.** Paystack webhooks confirm payment → receipts are auto-generated PDFs. No image uploads, no storage cost, no manual approval queue.
- **Global-aware** from day one (country code, currency code, institution discovery via Wikidata).

---

## SECTION 1 — Current State vs Target State

### What exists today (do not lose)

- `organizations` table (flat: `id, name, slug, currency_code, subscription_plan, ...`)
- `departments` table (direct child of `organizations`, no faculty layer)
- `organization_settings` table
- Existing RLS policies and RPC functions in `multi-tenant/migrations/`
- Frontend services: `multiTenantAuthService.ts`, `organizationService.ts`, `paymentService.ts`, `expenseService.ts`, `notificationService.ts`
- Frontend pages and components on the `feature/multi-tenant` branch

### What is missing or wrong

| Problem | Impact | Fix |
|---|---|---|
| Faculty and Department are separate silos with no link | Cannot query "all departments under Faculty of Engineering" | Introduce `org_units` between `organizations` and `org_groups` |
| Only platform admin can create orgs | Growth bottleneck — students bounce | Allow any user to create orgs at `trust_level='community'` |
| Search only returns DB rows | Students searching for a not-yet-added university get nothing | Add `seed_institutions` table + Wikidata fallback |
| No trust/claim system | Anyone could pretend to be an executive | Add `trust_level`, `claim_status`, `claim_requests`, `org_executives` |
| Receipt upload model | Storage cost, manual delays, students dislike it | Replace with Paystack webhook → auto-generated PDF receipt |
| `departments` is the only leaf type | Churches, clubs, hostels don't fit | Rename to `org_groups` with a `kind` field |
| No platform earnings ledger | Can't reconcile what Payvexo earned | Add `platform_earnings` table linked to transactions |
| No org-chosen terminology | A church doesn't say "Faculty" | Add `unit_label`, `group_label`, `member_label`, `payment_label` on orgs |

### Target state (high level)

```
PLATFORM
│
└── ORGANIZATION  (UNN, Covenant, RCCG Lagos, ACMSA, ...)
     │  type: university | polytechnic | college | church | club | company | other
     │  trust_level: seed | community | recognized | verified | official
     │  claim_status: unclaimed | pending | claimed | disputed
     │  currency_code: NGN | USD | GHS | KES | ...
     │
     ├── ORG_UNIT  (optional middle tier — Faculty, School, Division, Branch, Chapter)
     │    │
     │    └── ORG_GROUP  (leaf — Department, Class, Fellowship, Hostel, Club)
     │         ├── MEMBERS (profiles linked to a group)
     │         ├── EXECUTIVES (roles with explicit permission flags)
     │         ├── PAYMENT_TYPES (dues categories)
     │         └── DUE_ASSIGNMENTS → TRANSACTIONS (the financial ledger)
     │
     └── ORG_GROUP (directly under org if no unit tier needed)
```

---

## SECTION 2 — Complete Supabase Schema

> **AI assistants: this is the schema. If a table or column you reference is not here, do not invent it. Add it to this document first, then write the migration.**

Migrations live in `multi-tenant/migrations/`. The new ones will be numbered `010_` onwards to coexist with existing files.

### 2.1 Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- fuzzy/trigram search on names
CREATE EXTENSION IF NOT EXISTS "unaccent";      -- normalize "Lagos" vs "Lágos"
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- for invite codes / tokens
```

### 2.2 `seed_institutions`

Pre-loaded from NUC/JAMB data (Nigeria) and Wikidata (global). These are **never user-created** — they are the discovery layer that turns failed searches into growth signals.

```sql
CREATE TABLE seed_institutions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  short_name      TEXT,
  aliases         TEXT[] DEFAULT '{}',         -- e.g. {"UNN","Nsukka"}
  country_code    TEXT NOT NULL DEFAULT 'NG',  -- ISO 3166-1 alpha-2
  state           TEXT,
  city            TEXT,
  type            TEXT NOT NULL DEFAULT 'university',
                  -- university | polytechnic | college_of_education |
                  -- monotechnic | seminary | other
  ownership       TEXT,                        -- federal | state | private
  website         TEXT,
  email_domain    TEXT,                        -- e.g. 'unn.edu.ng'
  jamb_code       TEXT,
  wikidata_id     TEXT,                        -- Q-number for global lookup
  logo_url        TEXT,
  is_active       BOOLEAN DEFAULT FALSE,       -- TRUE when an org is created from this seed
  linked_org_id   UUID,                        -- FK set when org is created
  source          TEXT DEFAULT 'manual',       -- nuc | jamb | wikidata | manual
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_seed_institutions_name_trgm
  ON seed_institutions USING GIN (name gin_trgm_ops);
CREATE INDEX idx_seed_institutions_aliases_gin
  ON seed_institutions USING GIN (aliases);
CREATE INDEX idx_seed_institutions_country
  ON seed_institutions (country_code);
CREATE INDEX idx_seed_institutions_email_domain
  ON seed_institutions (email_domain);
```

### 2.3 `organizations` (restructured)

The current table is renamed-in-place via migration. New columns added; existing data preserved.

```sql
CREATE TABLE organizations (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Identity
  name                        TEXT NOT NULL,
  short_name                  TEXT NOT NULL,
  slug                        TEXT UNIQUE NOT NULL,
  description                 TEXT,
  logo_url                    TEXT,
  website                     TEXT,
  email_domain                TEXT,              -- verified domain for auto exec verification

  -- Classification
  type                        TEXT NOT NULL DEFAULT 'university',
                              -- university | polytechnic | college | church |
                              -- club | association | ngo | company | other
  country_code                TEXT NOT NULL DEFAULT 'NG',
  state                       TEXT,
  city                        TEXT,
  currency_code               TEXT NOT NULL DEFAULT 'NGN',
  currency_symbol             TEXT NOT NULL DEFAULT '₦',
  timezone                    TEXT NOT NULL DEFAULT 'Africa/Lagos',

  -- Branding (preserved from current schema)
  primary_color               TEXT DEFAULT '#FF6B35',
  secondary_color             TEXT DEFAULT '#1A0E09',

  -- Trust and verification
  trust_level                 TEXT NOT NULL DEFAULT 'community'
                              CHECK (trust_level IN ('seed','community','recognized','verified','official')),
  claim_status                TEXT NOT NULL DEFAULT 'unclaimed'
                              CHECK (claim_status IN ('unclaimed','pending','claimed','disputed')),
  verification_score          INTEGER DEFAULT 0,

  -- Org-chosen terminology
  unit_label                  TEXT DEFAULT 'Faculty',
  unit_label_plural           TEXT DEFAULT 'Faculties',
  group_label                 TEXT DEFAULT 'Department',
  group_label_plural          TEXT DEFAULT 'Departments',
  member_label                TEXT DEFAULT 'Student',
  member_label_plural         TEXT DEFAULT 'Students',
  payment_label               TEXT DEFAULT 'Dues',
  admin_label                 TEXT DEFAULT 'Executive',

  -- Platform fee config (per-org override capable; system default if NULL)
  platform_fee_mode           TEXT DEFAULT 'hybrid'
                              CHECK (platform_fee_mode IN ('flat','percent','hybrid')),
  platform_fee_flat           INTEGER DEFAULT 7500,    -- ₦75.00 in kobo
  platform_fee_percent        DECIMAL(5,2) DEFAULT 1.50,
  platform_fee_min            INTEGER DEFAULT 5000,    -- ₦50.00
  platform_fee_cap            INTEGER DEFAULT 50000,   -- ₦500.00

  -- Paystack split-payment integration
  paystack_subaccount_code    TEXT,
  paystack_business_name      TEXT,
  paystack_settlement_bank    TEXT,
  paystack_account_number     TEXT,
  paystack_account_name       TEXT,
  paystack_verified           BOOLEAN DEFAULT FALSE,

  -- Subscription (preserved)
  subscription_plan           TEXT DEFAULT 'free'
                              CHECK (subscription_plan IN ('free','starter','pro','enterprise')),
  subscription_expires_at     TIMESTAMPTZ,

  -- Limits
  max_units                   INTEGER DEFAULT 50,
  max_groups                  INTEGER DEFAULT 200,
  max_members                 INTEGER DEFAULT 10000,
  max_admins                  INTEGER DEFAULT 50,

  -- Discovery linkage
  seed_institution_id         UUID REFERENCES seed_institutions(id),

  -- Audit
  founded_by_user_id          UUID,
  is_active                   BOOLEAN DEFAULT TRUE,
  member_count                INTEGER DEFAULT 0,
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.4 `org_units` (new middle tier — replaces standalone `faculties`)

```sql
CREATE TABLE org_units (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  short_name      TEXT NOT NULL,
  description     TEXT,
  kind            TEXT NOT NULL DEFAULT 'faculty'
                  CHECK (kind IN ('faculty','school','college','division','branch','chapter','zone','region')),
  is_active       BOOLEAN DEFAULT TRUE,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, short_name)
);

CREATE INDEX idx_org_units_org ON org_units (organization_id);
```

### 2.5 `org_groups` (renamed from `departments`, generalized)

```sql
CREATE TABLE org_groups (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  unit_id         UUID REFERENCES org_units(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  short_name      TEXT NOT NULL,
  code            TEXT,
  description     TEXT,
  kind            TEXT NOT NULL DEFAULT 'department'
                  CHECK (kind IN ('department','class','level','fellowship','hostel','club','association','year_group','team')),
  levels          TEXT[] DEFAULT ARRAY['100L','200L','300L','400L','500L'],
  sections        TEXT[],
  head_label      TEXT,                        -- "HOD", "Class Rep", "Pastor", ...
  is_active       BOOLEAN DEFAULT TRUE,
  member_count    INTEGER DEFAULT 0,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, short_name)
);

CREATE INDEX idx_org_groups_org ON org_groups (organization_id);
CREATE INDEX idx_org_groups_unit ON org_groups (unit_id);
```

### 2.6 `profiles` (extends `auth.users`)

```sql
CREATE TABLE profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name           TEXT NOT NULL,
  phone               TEXT,
  avatar_url          TEXT,
  country_code        TEXT DEFAULT 'NG',
  is_platform_admin   BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.7 `members`

```sql
CREATE TABLE members (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  group_id              UUID NOT NULL REFERENCES org_groups(id) ON DELETE CASCADE,

  member_number         TEXT,                  -- matric/staff/member ID
  display_name          TEXT,
  institutional_email   TEXT,
  level                 TEXT,                  -- "200L", "SS2", "Member", ...

  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','inactive','suspended','graduated','left')),
  joined_at             TIMESTAMPTZ DEFAULT NOW(),

  custom_fields         JSONB DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(profile_id, group_id)
);

CREATE INDEX idx_members_profile ON members (profile_id);
CREATE INDEX idx_members_org ON members (organization_id);
CREATE INDEX idx_members_group ON members (group_id);
```

### 2.8 `org_executives`

```sql
CREATE TABLE org_executives (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  scope_level             TEXT NOT NULL DEFAULT 'group'
                          CHECK (scope_level IN ('org','unit','group')),
  unit_id                 UUID REFERENCES org_units(id),
  group_id                UUID REFERENCES org_groups(id),

  role                    TEXT NOT NULL,
                          -- president | vice_president | treasurer | financial_secretary |
                          -- secretary | pro | class_rep | hod | director | coordinator |
                          -- admin | custom
  role_label              TEXT,

  -- Explicit permission flags (do NOT infer from role name)
  can_create_dues         BOOLEAN DEFAULT FALSE,
  can_approve_payments    BOOLEAN DEFAULT FALSE,
  can_manage_members      BOOLEAN DEFAULT FALSE,
  can_manage_executives   BOOLEAN DEFAULT FALSE,
  can_view_financials     BOOLEAN DEFAULT FALSE,
  can_send_announcements  BOOLEAN DEFAULT FALSE,
  can_export_data         BOOLEAN DEFAULT FALSE,
  can_record_expenses     BOOLEAN DEFAULT FALSE,

  verification_status     TEXT NOT NULL DEFAULT 'pending'
                          CHECK (verification_status IN ('pending','email_verified','member_confirmed','document_verified','admin_verified','rejected')),
  verification_method     TEXT,
  verified_at             TIMESTAMPTZ,

  is_active               BOOLEAN DEFAULT TRUE,
  tenure_start            DATE,
  tenure_end              DATE,
  invited_by_exec_id      UUID REFERENCES org_executives(id),

  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_exec_profile ON org_executives (profile_id);
CREATE INDEX idx_exec_org     ON org_executives (organization_id);
CREATE INDEX idx_exec_group   ON org_executives (group_id);
```

### 2.9 `claim_requests`

```sql
CREATE TABLE claim_requests (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id         UUID NOT NULL REFERENCES organizations(id),
  claimant_profile_id     UUID NOT NULL REFERENCES profiles(id),

  claimed_role            TEXT NOT NULL,
  claimed_scope           TEXT NOT NULL DEFAULT 'group',
  claimed_unit_id         UUID REFERENCES org_units(id),
  claimed_group_id        UUID REFERENCES org_groups(id),

  full_name               TEXT NOT NULL,
  position_title          TEXT NOT NULL,
  phone                   TEXT NOT NULL,
  institutional_email     TEXT,
  personal_email          TEXT NOT NULL,
  document_urls           TEXT[] DEFAULT '{}',
  social_links            JSONB DEFAULT '{}'::jsonb,

  verification_method     TEXT NOT NULL
                          CHECK (verification_method IN ('email','member_vote','document','invite_code','admin')),

  status                  TEXT NOT NULL DEFAULT 'submitted'
                          CHECK (status IN ('submitted','email_sent','awaiting_votes','votes_complete','under_review','approved','rejected','disputed')),

  email_token             TEXT,
  email_token_expires     TIMESTAMPTZ,
  email_verified_at       TIMESTAMPTZ,

  votes_required          INTEGER DEFAULT 0,
  votes_received          INTEGER DEFAULT 0,
  vote_deadline           TIMESTAMPTZ,

  reviewed_by             UUID REFERENCES profiles(id),
  reviewer_notes          TEXT,
  reviewed_at             TIMESTAMPTZ,

  disputed_by             UUID REFERENCES profiles(id),
  dispute_reason          TEXT,
  disputed_at             TIMESTAMPTZ,

  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_claim_requests_org ON claim_requests (organization_id);
CREATE INDEX idx_claim_requests_status ON claim_requests (status);
```

### 2.10 `claim_votes`

```sql
CREATE TABLE claim_votes (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_request_id    UUID NOT NULL REFERENCES claim_requests(id) ON DELETE CASCADE,
  voter_member_id     UUID NOT NULL REFERENCES members(id),
  vote                TEXT NOT NULL CHECK (vote IN ('confirm','reject','abstain')),
  comment             TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(claim_request_id, voter_member_id)
);
```

### 2.11 `executive_invite_codes`

```sql
CREATE TABLE executive_invite_codes (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  generated_by_exec   UUID NOT NULL REFERENCES org_executives(id),

  intended_role       TEXT NOT NULL,
  scope_level         TEXT NOT NULL DEFAULT 'group',
  unit_id             UUID REFERENCES org_units(id),
  group_id            UUID REFERENCES org_groups(id),

  code                TEXT UNIQUE NOT NULL,    -- 8-char alphanumeric, generated server-side
  max_uses            INTEGER DEFAULT 1,
  times_used          INTEGER DEFAULT 0,
  used_by_profile     UUID REFERENCES profiles(id),
  used_at             TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ NOT NULL,
  is_active           BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.12 `payment_types`

```sql
CREATE TABLE payment_types (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  unit_id             UUID REFERENCES org_units(id),
  group_id            UUID REFERENCES org_groups(id),
  created_by_exec     UUID REFERENCES org_executives(id),

  name                TEXT NOT NULL,
  description         TEXT,
  amount              INTEGER NOT NULL,        -- in smallest currency unit (kobo for NGN)
  currency_code       TEXT NOT NULL DEFAULT 'NGN',

  is_recurring        BOOLEAN DEFAULT FALSE,
  recurrence_period   TEXT CHECK (recurrence_period IN ('term','semester','annual','monthly','custom')),
  due_date            TIMESTAMPTZ,
  late_fee_per_day    INTEGER DEFAULT 0,

  is_active           BOOLEAN DEFAULT TRUE,
  is_mandatory        BOOLEAN DEFAULT TRUE,

  applies_to          TEXT NOT NULL DEFAULT 'all_members'
                      CHECK (applies_to IN ('all_members','specific_levels','custom_list')),
  applicable_levels   TEXT[],

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payment_types_org ON payment_types (organization_id);
CREATE INDEX idx_payment_types_group ON payment_types (group_id);
```

### 2.13 `due_assignments`

```sql
CREATE TABLE due_assignments (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_type_id     UUID NOT NULL REFERENCES payment_types(id) ON DELETE CASCADE,
  member_id           UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  organization_id     UUID NOT NULL REFERENCES organizations(id),

  amount_due          INTEGER NOT NULL,
  amount_paid         INTEGER DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'unpaid'
                      CHECK (status IN ('unpaid','partial','paid','waived','overdue')),

  due_date            TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,
  waived_by_exec_id   UUID REFERENCES org_executives(id),
  waiver_reason       TEXT,

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(payment_type_id, member_id)
);

CREATE INDEX idx_due_assignments_member ON due_assignments (member_id);
CREATE INDEX idx_due_assignments_org    ON due_assignments (organization_id);
CREATE INDEX idx_due_assignments_status ON due_assignments (status);
```

### 2.14 `transactions` (financial ledger — append-only)

```sql
CREATE TABLE transactions (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  organization_id             UUID NOT NULL REFERENCES organizations(id),
  group_id                    UUID REFERENCES org_groups(id),
  member_id                   UUID REFERENCES members(id),
  due_assignment_id           UUID REFERENCES due_assignments(id),
  payment_type_id             UUID REFERENCES payment_types(id),

  dues_amount                 INTEGER NOT NULL,    -- to org
  platform_fee                INTEGER NOT NULL,    -- to Payvexo
  total_charged               INTEGER NOT NULL,    -- dues + fee
  currency_code               TEXT NOT NULL DEFAULT 'NGN',

  paystack_reference          TEXT UNIQUE,
  paystack_access_code        TEXT,
  paystack_status             TEXT,                -- success | failed | abandoned
  paystack_channel            TEXT,                -- card | bank | ussd | transfer
  paystack_ip_address         TEXT,
  paystack_fees_breakdown     JSONB,

  org_subaccount_code         TEXT,
  org_amount_settled          INTEGER,
  platform_amount_settled     INTEGER,

  status                      TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','successful','failed','abandoned','refunded')),

  webhook_received_at         TIMESTAMPTZ,
  webhook_verified            BOOLEAN DEFAULT FALSE,
  webhook_signature           TEXT,

  payer_email                 TEXT,
  payer_name                  TEXT,
  ip_address                  TEXT,
  user_agent                  TEXT,
  notes                       TEXT,

  receipt_pdf_url             TEXT,                -- after auto-generation

  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_org           ON transactions (organization_id);
CREATE INDEX idx_transactions_member        ON transactions (member_id);
CREATE INDEX idx_transactions_status        ON transactions (status);
CREATE INDEX idx_transactions_paystack_ref  ON transactions (paystack_reference);
CREATE INDEX idx_transactions_created       ON transactions (created_at DESC);
```

### 2.15 `platform_earnings`

```sql
CREATE TABLE platform_earnings (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id      UUID NOT NULL REFERENCES transactions(id),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  amount              INTEGER NOT NULL,
  currency_code       TEXT NOT NULL DEFAULT 'NGN',
  settled             BOOLEAN DEFAULT FALSE,
  settled_at          TIMESTAMPTZ,
  paystack_settlement_id TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_platform_earnings_org ON platform_earnings (organization_id);
CREATE INDEX idx_platform_earnings_settled ON platform_earnings (settled);
```

### 2.16 `organization_requests`

```sql
CREATE TABLE organization_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requested_by    UUID NOT NULL REFERENCES profiles(id),
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,
  country_code    TEXT NOT NULL DEFAULT 'NG',
  state           TEXT,
  city            TEXT,
  website         TEXT,
  requester_role  TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','auto_created')),
  created_org_id  UUID REFERENCES organizations(id),
  reviewed_by     UUID REFERENCES profiles(id),
  reviewer_notes  TEXT,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.17 `audit_log` (security trail)

```sql
CREATE TABLE audit_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_profile_id UUID REFERENCES profiles(id),
  organization_id UUID REFERENCES organizations(id),
  action          TEXT NOT NULL,             -- e.g. 'claim_submitted','exec_added','dues_created'
  target_table    TEXT,
  target_id       UUID,
  metadata        JSONB DEFAULT '{}'::jsonb,
  ip_address      TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_org ON audit_log (organization_id);
CREATE INDEX idx_audit_log_actor ON audit_log (actor_profile_id);
CREATE INDEX idx_audit_log_action ON audit_log (action);
```

---

## SECTION 3 — Row Level Security & Multi-Tenant Isolation

> **This is the most important security section. An RLS bug here means one organization can read or write another organization's data. Treat every policy as load-bearing.**

### 3.1 Enable RLS on every table

```sql
ALTER TABLE organizations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_units               ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_groups              ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE members                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_executives          ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_requests          ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_votes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE executive_invite_codes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_types           ENABLE ROW LEVEL SECURITY;
ALTER TABLE due_assignments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_earnings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE seed_institutions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log               ENABLE ROW LEVEL SECURITY;
```

### 3.2 Helper functions (SECURITY DEFINER)

```sql
-- Is the caller a platform-level superadmin?
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_platform_admin FROM profiles WHERE id = auth.uid()),
    FALSE
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Is the caller an active, verified executive of org_id?
CREATE OR REPLACE FUNCTION is_org_executive(org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_executives
    WHERE profile_id = auth.uid()
      AND organization_id = org_id
      AND is_active = TRUE
      AND verification_status IN ('email_verified','member_confirmed','document_verified','admin_verified')
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Does the caller have a specific permission on org_id?
CREATE OR REPLACE FUNCTION has_org_permission(org_id UUID, perm TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  ok BOOLEAN;
BEGIN
  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM org_executives
       WHERE profile_id = $1
         AND organization_id = $2
         AND is_active = TRUE
         AND %I = TRUE)',
    perm
  ) INTO ok USING auth.uid(), org_id;
  RETURN ok;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Is the caller a member of org_id?
CREATE OR REPLACE FUNCTION is_org_member(org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM members
    WHERE profile_id = auth.uid()
      AND organization_id = org_id
      AND status = 'active'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;
```

### 3.3 Core policy pattern

For every tenant-scoped table, four policies:

```sql
-- Pattern (example: payment_types)

-- SELECT: members and execs of the org can read
CREATE POLICY "pt_select" ON payment_types FOR SELECT
  USING (
    is_platform_admin()
    OR is_org_member(organization_id)
    OR is_org_executive(organization_id)
  );

-- INSERT: only execs with can_create_dues
CREATE POLICY "pt_insert" ON payment_types FOR INSERT
  WITH CHECK (
    has_org_permission(organization_id, 'can_create_dues')
  );

-- UPDATE: only execs with can_create_dues
CREATE POLICY "pt_update" ON payment_types FOR UPDATE
  USING (has_org_permission(organization_id, 'can_create_dues'))
  WITH CHECK (has_org_permission(organization_id, 'can_create_dues'));

-- DELETE: only execs with can_create_dues (soft-delete preferred — use is_active)
CREATE POLICY "pt_delete" ON payment_types FOR DELETE
  USING (has_org_permission(organization_id, 'can_create_dues'));
```

### 3.4 Special tables

- **`transactions`** — `INSERT` and `UPDATE` are forbidden from the client entirely. All writes happen through a Supabase Edge Function that verifies the Paystack signature. RLS: `SELECT` allowed to org execs with `can_view_financials` and to the paying member themselves; `INSERT/UPDATE` denied for all roles except `service_role`.

- **`platform_earnings`** — Only readable by `is_platform_admin()`. No client writes ever.

- **`seed_institutions`** — Public SELECT allowed (this is the discovery layer). Write only from `service_role` (the scraping/seeding job).

- **`claim_votes`** — A row may only be inserted if the voter is an active member of the org being claimed, and the claimant ≠ voter.

- **`audit_log`** — `INSERT` from edge functions only (service role); `SELECT` for platform admins and org execs with `can_view_financials` (scoped to their own org).

### 3.5 The golden rule

**No service code ever bypasses RLS by using the `service_role` key on a user-driven request, except inside trusted Edge Functions that verify the user's identity first.**

The Vite/React frontend uses the anon key. The webhook handler and seed jobs use service role. Never expose the service role to the browser.

---

## SECTION 4 — Migration Plan (Old Schema → New Schema)

User picked **full restructure with data migration**. This is the prescribed sequence — no shortcuts.

### 4.1 Preconditions

1. Take a Supabase backup (`supabase db dump` or use the dashboard backup).
2. Announce maintenance window (the multi-tenant branch is not yet in production, so risk is low).
3. Confirm no other branches have schema drift that we'd lose.

### 4.2 Migration files (run in order)

Add the following files under `multi-tenant/migrations/`:

- `010_extensions.sql` — enable trgm, unaccent, pgcrypto
- `011_seed_institutions.sql` — create `seed_institutions` table + indexes
- `012_organizations_alter.sql` — add new columns (`trust_level`, `claim_status`, `*_label`, fee columns, paystack columns, `seed_institution_id`)
- `013_org_units.sql` — create `org_units` table
- `014_org_groups_from_departments.sql` — rename `departments` → `org_groups`, add `unit_id`, `kind`, etc.
- `015_profiles.sql` — create `profiles` table backed by `auth.users`
- `016_members.sql` — create `members` table; backfill from existing `users`/`students` table
- `017_org_executives.sql` — create `org_executives`; backfill from existing admin users
- `018_claims_and_votes.sql` — claim_requests, claim_votes, executive_invite_codes
- `019_payment_types.sql` — create or migrate from existing payment tables
- `020_due_assignments.sql` — new table; backfill from existing assignments
- `021_transactions.sql` — new ledger
- `022_platform_earnings.sql`
- `023_organization_requests.sql`
- `024_audit_log.sql`
- `025_rls_helpers.sql` — the `SECURITY DEFINER` functions
- `026_rls_policies.sql` — every policy from Section 3
- `027_seed_data_nigeria.sql` — INSERT statements for NUC-accredited Nigerian institutions
- `028_drop_legacy.sql` — drop unused legacy tables/columns once verified

### 4.3 Data migration semantics

| Source (current) | Target (new) | Notes |
|---|---|---|
| `organizations` row | `organizations` row | Add `trust_level='verified'` for existing orgs, `claim_status='claimed'` |
| `departments` row | `org_groups` row | `unit_id = NULL` initially; if `code` looks like a faculty prefix, group later |
| `users` with admin role | `profiles` + `org_executives` | All current admins become `verification_status='admin_verified'`, `is_active=TRUE` |
| `users` with student role | `profiles` + `members` | Linked to current department via `members.group_id` |
| existing payment records | `transactions` | Preserve `paystack_reference` if any; mark as `webhook_verified=FALSE` for legacy rows |

### 4.4 Code changes required after migration

The services that must be updated (and which AI must verify still pass type-check):

- [src/services/organizationService.ts](src/services/organizationService.ts) — add unit/group hierarchy queries
- [src/services/multiTenantAuthService.ts](src/services/multiTenantAuthService.ts) — emit `org_executives` rows, not legacy admin role
- [src/services/paymentService.ts](src/services/paymentService.ts) — switch to Paystack-initiated flow, remove receipt upload
- [src/services/expenseService.ts](src/services/expenseService.ts) — same currency model
- [src/services/notificationService.ts](src/services/notificationService.ts) — new events: `CLAIM_SUBMITTED`, `CLAIM_APPROVED`, `EXEC_INVITE_RECEIVED`, etc.
- [src/utils/orgScope.ts](src/utils/orgScope.ts) — extend scoping helpers to include unit + group

---

## SECTION 5 — Search Architecture (The Discovery Layer)

> **This is the single biggest acquisition lever in the app. Every failed search must become a lead.**

### 5.1 Two-layer search

```
User types "University of Nigeria"
            │
            ▼
Layer 1: Search `seed_institutions` + `organizations`  (your Supabase DB)
            │
            ▼
Found organizations? ─── Yes ──► Show with trust badges
            │
            No / Few results
            │
            ▼
Layer 2: Wikidata API (global universities)
            │
            ▼
Show as "Not yet on Payvexo" with [Bring My School Here] button
            │
            ▼
Click → creates an `organization_requests` row → auto-creates org at `trust_level='community'`
```

### 5.2 Layer 1 query (Postgres)

Use `pg_trgm` similarity scoring with `unaccent`, search across `name`, `short_name`, `aliases`:

```sql
SELECT 'org' AS source, id, name, short_name, type, trust_level,
       similarity(unaccent(lower(name)), unaccent(lower(:q))) AS score
FROM organizations
WHERE name ILIKE '%' || :q || '%'
   OR short_name ILIKE '%' || :q || '%'
UNION ALL
SELECT 'seed' AS source, id, name, short_name, type, 'seed' AS trust_level,
       similarity(unaccent(lower(name)), unaccent(lower(:q))) AS score
FROM seed_institutions
WHERE (name ILIKE '%' || :q || '%' OR :q = ANY(aliases))
  AND linked_org_id IS NULL
ORDER BY score DESC
LIMIT 20;
```

### 5.3 Layer 2 — Wikidata fallback (free, no key)

```
GET https://www.wikidata.org/w/api.php
  ?action=wbsearchentities
  &search={query}+university
  &language=en
  &type=item
  &format=json
  &origin=*
```

Use this only when Layer 1 returns 0–2 results. Cache responses for 24h in Edge Function memory or Supabase storage.

### 5.4 The Nigerian seed data sources

There is **no public JAMB API**. The data is reachable via:

1. **NUC official list** — National Universities Commission publishes the list of accredited federal/state/private universities at `https://www.nuc.edu.ng/nigerian-univerisities/`. Scrape it once with a Node/Python script, store in `seed_institutions`.
2. **JAMB CAPS institution list** — visible inside the JAMB portal but not via a public API. Compiled spreadsheets are widely circulated; verify against NUC before importing.
3. **List of Nigerian polytechnics (NBTE)** — `https://nbte.gov.ng/` — same approach.
4. **List of colleges of education (NCCE)** — `https://www.ncceonline.edu.ng/`.

Seeding job (run once, idempotent):

```ts
// scripts/seed-nigerian-institutions.ts
// Run with: pnpm tsx scripts/seed-nigerian-institutions.ts
// Uses Supabase service role. NEVER ship this key to the browser.
```

The job:
1. Reads a static JSON file (`scripts/data/ng_institutions.json`) you maintain in the repo.
2. Upserts into `seed_institutions` with `source='nuc'` or `'nbte'`.
3. Computes `email_domain` from the institution website when present.

### 5.5 Global discovery

For non-Nigerian queries, the Wikidata fallback (Section 5.3) provides every accredited university worldwide. The country code is inferred from the Wikidata "country" property (P17). When a user creates an org from a Wikidata result, we set:

- `country_code` from Wikidata P17
- `currency_code` from a hardcoded map (`NG → NGN`, `GH → GHS`, `KE → KES`, `ZA → ZAR`, `US → USD`, `GB → GBP`, default `USD`)
- `seed_institution_id = NULL` (Wikidata records aren't seeds in our table unless we promote them)

### 5.6 Failed search → lead capture

When Layer 1 returns 0 results and Layer 2 is empty or rejected:

```
┌───────────────────────────────────────────────────┐
│ No results found for "Covenant University"        │
│                                                   │
│ [🌱 Add My School to Payvexo]                     │
└───────────────────────────────────────────────────┘
```

Click → tiny form (Section 6 Flow B) → row in `organization_requests` → org auto-created at `trust_level='community'` → user becomes founding member.

---

## SECTION 6 — Onboarding Flows (A, B, C, D)

> **AI assistants: Each flow has a step number. When implementing UI components, name them to match (e.g. `FlowA_Step3_FacultySelect.tsx`). Do not collapse steps or skip the trust-level banners.**

### Flow A — Student finds their school (the happy path)

```
A1. Land on /  → see search bar prominently
A2. Type query → results from Section 5
A3. Click result → /:orgSlug overview
A4. See: trust badge, member count, list of org_units
A5. Pick unit → /:orgSlug/:unitSlug
A6. Pick group → /:orgSlug/:unitSlug/:groupSlug
A7. Click [Join This Group]
A8. Sign up (full_name, email, password, phone)
A9. Verify email (Supabase magic link)
A10. Provide member_number, level
A11. Land on /me → dashboard
```

Dashboard shows: outstanding dues (`due_assignments` where `status IN ('unpaid','partial','overdue')`), payment history, group announcements.

### Flow B — Student creates a new organization (growth engine)

```
B1. Search returns nothing useful
B2. Click [Add My School to Payvexo]
B3. Short form: name, type, country, state, city, website (optional), your role
B4. Server fuzzy-matches name against existing orgs + seeds (Section 5.2)
B5. If similar match exists → "Did you mean X?" → bounces to Flow A
B6. Else: insert into organization_requests; insert into organizations with trust_level='community'
B7. User becomes founding member + first executive (verification_status='pending')
B8. Prompted: "Set up your first Faculty (Unit) and Department (Group)"
B9. Org dashboard shows persistent banner: "Community Created — Claim this org to unlock full features"
```

### Flow C — Executive claims an organization (the most critical flow)

> **Do not collapse this into a single screen. Each step exists to prevent fraud.**

```
C1. Click [Claim This Organization]
C2. See explanation: "Claiming gives you executive control. False claims are permanently banned."
C3. Step 1 — Basic details
       full_name, position_title, phone, personal_email
C4. Step 2 — Pick verification method:

       Option A: School email (strongest)
         - Enter institutional email
         - Server checks domain against organizations.email_domain
                                 or seed_institutions.email_domain
         - Send magic link → on click, verification_status='email_verified'

       Option B: Member confirmation (decentralized)
         - System counts current members of the group/org
         - votes_required = ceil(0.30 * member_count), capped at 20, min 3
         - Notify members → they vote confirm/reject/abstain in claim_votes
         - If confirm votes ≥ votes_required and vote_deadline not passed → status='votes_complete'

       Option C: Document upload (manual)
         - Upload appointment letter / ID photo / official screenshot
         - claim_requests.document_urls populated
         - Status='under_review' → goes to platform admin queue

       Option D: Invite code (trust chain)
         - Existing verified exec generated an invite code (Section 6.5)
         - Code validates → instant verification_status='member_confirmed'
                          with invited_by_exec_id linkage

C5. Step 3 — (Optional) Invite other executives
       Generates 8-char alphanumeric codes (executive_invite_codes), each
       role-specific, expires in 7 days.

C6. Submit → status='submitted' → claim_requests row created → audit_log entry

C7. On approval:
       - Insert/update org_executives with appropriate permission flags
       - organizations.claim_status='claimed'
       - organizations.trust_level promoted (community → recognized or verified)
       - All members notified
```

### Flow D — Dispute flow

```
D1. Org has active claim_request (status in 'submitted','email_sent','awaiting_votes','votes_complete','under_review')
D2. Another user views the org, sees "This org has an active claim"
D3. Click [I Believe This Claim Is Incorrect]
D4. Required: their own verification submission + dispute_reason
D5. claim_requests row updated: disputed_by, dispute_reason, disputed_at, status='disputed'
D6. Original claimant has 72 hours to provide stronger evidence
D7. If financial history exists on the org (any successful transactions) → mandatory platform_admin review
D8. Platform admin decides → loser banned from claiming for 90 days
D9. audit_log entries at every step
```

### Flow E — Dormant organization succession (long-term integrity)

```
E1. Cron job (Edge Function) runs daily:
    UPDATE organizations SET trust_level='community' WHERE last_activity < NOW() - INTERVAL '180 days'
E2. After 365 days of dormancy with no active executive → flagged as 'dormant'
E3. Incoming class rep can submit a "succession claim" — same as Flow C
       but with reduced verification thresholds (membership confirmation
       only requires 20% instead of 30%)
E4. Outgoing executives (if reachable) can nominate replacements via invite code
```

---

## SECTION 7 — Trust Level & Claim System

### 7.1 The five levels

| Level | How achieved | Search visible | Members can join | Create dues | Collect payments | Featured | Export reports |
|---|---|---|---|---|---|---|---|
| `seed` | Pre-loaded NUC/Wikidata | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `community` | User-created | ✅ | ✅ | ✅ | ⚠️ capped at ₦50,000 total | ❌ | ❌ |
| `recognized` | ≥1 verified exec OR ≥50 active members | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `verified` | School-email domain confirmed + verified exec | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `official` | Platform admin manual approval | ✅ | ✅ | ✅ | ✅ + featured tier | ✅ pinned | ✅ + analytics |

### 7.2 Promotion rules (computed nightly + on key events)

```ts
// pseudocode for the trust scoring job
function recomputeTrust(org) {
  if (org.trust_level === 'official') return;             // never demote from official
  if (hasVerifiedExec(org) && hasVerifiedDomain(org)) return 'verified';
  if (hasVerifiedExec(org) || org.member_count >= 50) return 'recognized';
  return 'community';
}
```

### 7.3 Financial protection rule (very important)

When `organizations.claim_status` transitions from `unclaimed` → `pending` and there is **any** successful transaction history:

- Verification method must be **Option A (school email)** or **Option C (document)** — Option B (member vote) alone is not enough.
- All financial activity is **frozen** until claim resolves.
- A platform admin is notified within minutes.

This protects the case where ₦500,000 has already been collected and a stranger tries to claim ownership.

---

## SECTION 8 — Paystack Integration & The Fee Model

### 8.1 Is the platform fee legal?

Yes. Adding a transparent processing fee on top of dues is standard practice — every Nigerian payment platform (Paystack, Flutterwave, Remita) and global one (Stripe, PayPal) does it. The legal requirements are:

1. **Disclose it.** Show the breakdown at checkout (dues + fee = total). Do not hide it.
2. **Disclose in T&Cs.** A short clause: "Payvexo adds a service fee on each transaction; the fee covers payment processing and platform operations."
3. **Receipt shows both lines** — the org's amount and the platform fee — as separate line items.

That is the entire compliance picture for a Nigerian SaaS taking a service fee. CBN does not require additional licensing for this model **because you are not holding funds** — Paystack does the split, and funds go directly to the org's and platform's bank accounts. You are a payment facilitator, not a payment processor.

### 8.2 Paystack account requirements

- **Personal Paystack account** — works for **testing** and initial development. You can accept payments, but Paystack **subaccounts** (which are how split payments work) require a **registered business**.
- **For production** with split payments, you need:
  - CAC certificate (business registration in Nigeria)
  - Bank account in the business name
  - TIN (Tax Identification Number)
  - Director's ID
- Get this in motion now. CAC registration online takes ~5–10 working days and costs ~₦20,000–₦35,000 depending on company type. You can build, test, and demo on the personal account; you flip the live keys once the business account is approved.

**Recommended path for you right now:**

1. Build the integration using your personal Paystack account in **test mode** (`pk_test_...`, `sk_test_...`). Test mode does not require business docs.
2. Implement split payments in code using Paystack subaccounts (test mode supports subaccount creation).
3. Register the business with CAC in parallel.
4. Once approved, upgrade Paystack to business account → live keys → flip env vars.

### 8.3 The fee math

```
Student pays ₦5,000 dues

Platform fee = max( fee_min, min( fee_cap, round(dues * fee_percent/100) + fee_flat ) )
             = max( 50, min( 500, round(5000 * 0.015) + 75 ) )
             = max( 50, min( 500, 75 + 75 ) )
             = ₦150

Checkout breakdown shown to student:
  Dues Amount      ₦5,000.00
  Service Fee      ₦150.00
  ─────────────────────────
  Total            ₦5,150.00

Paystack collects ₦5,150 from student.
Paystack's own processing cost = 1.5% capped at ₦2,000 = ₦77.25.

Split via subaccounts:
  - Org subaccount receives:        ₦5,000.00  (dues amount, full)
  - Platform main account receives: ₦150 − Paystack's slice

Net to platform per ₦5,000 transaction ≈ ₦70–₦100.
```

At 1,000 transactions/day × ₦75 net average = ₦75,000/day = ~₦2.25M/month.

### 8.4 Split payment configuration

Use Paystack's **Split Payments** feature with **subaccounts**:

1. Each organization registers a subaccount (their bank account).
2. The split percentage is configured per transaction (we compute it dynamically from dues vs total).
3. Paystack settles automatically — org gets their dues to their bank, platform keeps the fee.

```ts
// When initiating a transaction
const response = await paystack.transaction.initialize({
  email: student.email,
  amount: totalCharged,                  // in kobo
  reference: localReference,
  subaccount: org.paystack_subaccount_code,
  transaction_charge: platformFee,       // platform's slice in kobo
  bearer: 'subaccount',                  // who bears Paystack's own processing cost
  metadata: {
    organization_id: org.id,
    group_id: group.id,
    member_id: member.id,
    due_assignment_id: dueAssignment.id,
    dues_amount: duesAmount,
    platform_fee: platformFee,
  },
  callback_url: `${APP_URL}/payment/verify`,
});
```

### 8.5 Webhook flow (the receipt-free magic)

The Paystack webhook is the **source of truth** for marking dues paid. The frontend never marks dues paid on its own.

```
Student completes payment on Paystack
        │
        ▼
Paystack POSTs to https://yourapp.com/api/paystack/webhook
        │
        ▼
Supabase Edge Function `paystack-webhook`:
  1. Verify HMAC signature: HMAC-SHA512(body, PAYSTACK_SECRET) === x-paystack-signature
  2. Look up transactions.paystack_reference
  3. If event === 'charge.success':
     a. UPDATE transactions SET status='successful', webhook_verified=TRUE
     b. UPDATE due_assignments SET status='paid', amount_paid=..., paid_at=NOW()
     c. INSERT INTO platform_earnings (transaction_id, amount, ...)
     d. Trigger receipt PDF generation (background job)
     e. Notify member: "Payment confirmed"
     f. Notify org executives: "New payment received"
  4. INSERT INTO audit_log
        │
        ▼
Return 200 OK to Paystack
```

**HMAC verification is non-negotiable.** Without it, anyone can POST a fake `charge.success` and mark dues paid for free. The Edge Function must reject any request whose signature doesn't match.

### 8.6 Receipt generation

After webhook confirms success:

1. Edge Function `generate-receipt` is invoked.
2. Pulls transaction + member + org + payment_type.
3. Renders a PDF (use `@react-pdf/renderer` server-side, or a serverless service like Carbone/PDFShift).
4. Stores PDF in Supabase Storage bucket `receipts/{org_id}/{transaction_id}.pdf`.
5. Updates `transactions.receipt_pdf_url`.
6. Emails the receipt to the payer.

**No member ever uploads a receipt image again.** The current `require_receipt_upload` flag in `organization_settings` is deprecated and should be removed after migration.

### 8.7 Environment variables

```
# Test mode (for development)
PAYSTACK_PUBLIC_KEY=pk_test_xxxxxxxxxxxx
PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxx

# Live mode (after CAC + business Paystack approval)
PAYSTACK_PUBLIC_KEY=pk_live_xxxxxxxxxxxx
PAYSTACK_SECRET_KEY=sk_live_xxxxxxxxxxxx

# Webhook secret (Paystack dashboard → Settings → API & Webhooks)
PAYSTACK_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx

# App identity
APP_URL=https://payvexo.com
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # NEVER in frontend code
```

---

## SECTION 9 — Currency & International Handling

### 9.1 Per-org currency

Every organization has `currency_code` and `currency_symbol`. All amounts are stored in the **smallest currency unit**:

- NGN: kobo (1 ₦ = 100 kobo)
- USD: cents
- GHS: pesewas
- KES: cents

UI helpers convert to display format. **Never store decimal currency in the DB.** Integer math eliminates floating-point errors.

### 9.2 Paystack currency support

Paystack supports: **NGN, USD, GHS, ZAR, KES, EGP, XOF**. For currencies outside this list (e.g. GBP, INR), the org cannot use Paystack — the system shows "Payment collection not yet available in your region. Bank transfer fallback only."

### 9.3 Country → currency map

Maintain a static map in [src/config/currency.ts](src/config/currency.ts):

```ts
export const COUNTRY_TO_CURRENCY: Record<string, { code: string; symbol: string }> = {
  NG: { code: 'NGN', symbol: '₦' },
  GH: { code: 'GHS', symbol: 'GH₵' },
  KE: { code: 'KES', symbol: 'KSh' },
  ZA: { code: 'ZAR', symbol: 'R' },
  EG: { code: 'EGP', symbol: 'E£' },
  US: { code: 'USD', symbol: '$' },
  GB: { code: 'GBP', symbol: '£' },
  // ...
};
```

When an org is created from a Wikidata seed in country `XX`, default to `COUNTRY_TO_CURRENCY[XX] ?? { code: 'USD', symbol: '$' }`.

---

## SECTION 10 — Build Order (Phases 1–4)

> **AI assistants: do not jump phases. Phase 1 must be merged and tested before Phase 2 begins.**

### Phase 1 — Foundation (~2 weeks)

1. Write and run migrations `010` through `028` (Section 4.2).
2. Seed Nigerian institutions (`scripts/seed-nigerian-institutions.ts`).
3. Update [src/services/organizationService.ts](src/services/organizationService.ts) for the new hierarchy.
4. Replace search on [src/pages/LandingPage.tsx](src/pages/LandingPage.tsx) with the two-layer search (Section 5).
5. Implement Flow B (community org creation) — replaces admin-only creation.
6. Add trust badges to org cards in search results and overview pages.

### Phase 2 — Claim system (~2 weeks)

7. Implement Flow C (claim flow) UI + edge function `submit-claim`.
8. Implement school-email magic-link verification (Edge Function `verify-claim-email`).
9. Implement member-vote system (in-app notifications + `claim_votes` writes).
10. Implement invite-code generation and redemption.
11. Implement Flow D (dispute flow).

### Phase 3 — Payments (~3 weeks)

12. Integrate Paystack initialization in [src/services/paymentService.ts](src/services/paymentService.ts).
13. Build dues creation flow on [src/pages/admin/CreatePaymentTypePage.tsx](src/pages/admin/CreatePaymentTypePage.tsx) — already exists, update to use new `payment_types`.
14. Build student checkout flow with transparent fee breakdown.
15. Build webhook handler (Supabase Edge Function `paystack-webhook`) with HMAC verification.
16. Build receipt PDF generator (Edge Function `generate-receipt`).
17. **Remove receipt upload UI everywhere.** Drop `require_receipt_upload` setting.

### Phase 4 — Polish & growth (~2 weeks)

18. Explore/Featured page (orgs with `trust_level >= 'recognized'`).
19. Dormant organization succession (Flow E).
20. Financial reports for orgs (`can_view_financials` execs).
21. Platform admin dashboard (`is_platform_admin()` users) — claim queue, dispute queue, earnings dashboard.

---

## SECTION 11 — Rules For AI Coding Assistants

> **Read this before writing any code on this codebase. These rules exist because past AI runs deviated from the design and produced broken work.**

1. **Read this document first.** If a task references "the blueprint," it's this file.
2. **Do not invent table names or columns.** The schema in Section 2 is the schema. If you need a new column, add it to this document first, then write the migration.
3. **Never bypass RLS.** All client-side Supabase calls go through the anon key. If you need elevated access, use an Edge Function with service role.
4. **Webhook handlers must verify HMAC signatures.** No exceptions.
5. **Never mark dues paid from the frontend.** Only the webhook handler may flip `due_assignments.status` to `'paid'`.
6. **Currency is stored in smallest units** (kobo, cents). UI converts for display.
7. **Use the org's terminology fields** (`unit_label`, `group_label`, etc.) when rendering UI for that org. Do not hardcode "Faculty" or "Department".
8. **Trust-level promotion is automatic.** Do not let frontend code mutate `trust_level` directly — it's computed by a server job (Section 7.2).
9. **Every executive action writes to `audit_log`.** This is required for the dispute flow.
10. **Migration files are append-only.** Once `010_*.sql` is merged and run, do not edit it. Write `011_*.sql` to make changes.
11. **Test every claim flow path manually before merging.** A buggy claim flow lets strangers seize organizations.
12. **Do not store Paystack secret keys in frontend code, env files committed to git, or any `VITE_*` variable.** Only `PAYSTACK_PUBLIC_KEY` is safe for the frontend.
13. **When in doubt, ask the human.** Do not improvise multi-step flows. Each step in Section 6 exists for a reason.

---

## SECTION 12 — Answers To Specific Questions

### Q1. Do the people collecting dues (executives) need to create accounts?

**Yes.** Every executive is a `profiles` row backed by a `auth.users` row, plus an `org_executives` row that defines their scope (org/unit/group) and permissions. The dues money does not flow through their account directly — Paystack splits the transaction at payment time so:

- The **org's** Paystack subaccount receives the dues amount.
- The **platform's** Paystack account receives the service fee.

The executive's role is operational: create payment types, manage members, view financials. They never personally receive the money — it goes to the org's registered bank account.

### Q2. How is the money distributed (class gets theirs, platform gets its cut)?

**Paystack Split Payments via Subaccounts** (Section 8.4). At payment time:

- Total charged = dues + platform fee.
- `subaccount = org.paystack_subaccount_code` → org receives dues amount.
- `transaction_charge = platform_fee` → platform receives fee.
- `bearer = 'subaccount'` → Paystack's own processing cost comes out of the org's slice (or platform's, configurable per org).

Settlement happens automatically T+1. No manual reconciliation.

### Q3. With my personal Paystack account, can I build and test this?

**Yes for development**, **no for production**. Use test mode (`pk_test_*`) on your personal account — test mode supports subaccount creation and the full split payment flow. For live mode you need a business-tier Paystack account, which requires CAC business registration. Register the business in parallel with development; flip env vars when CAC + Paystack business is approved.

### Q4. How do I get the list of other universities (JAMB)?

There is no public JAMB API. The data comes from:

- **NUC** (nuc.edu.ng) — accredited universities. Scrape once.
- **NBTE** (nbte.gov.ng) — polytechnics.
- **NCCE** — colleges of education.

Maintain `scripts/data/ng_institutions.json` in the repo. The seeding script (`scripts/seed-nigerian-institutions.ts`) upserts into `seed_institutions`. For global discovery, use **Wikidata's free API** (Section 5.3) — every accredited university worldwide, no key required.

### Q5. How does the app handle different currencies for international orgs?

Each org has `currency_code` and `currency_symbol`. Amounts are stored in smallest units. Paystack supports NGN/USD/GHS/ZAR/KES/EGP/XOF — for orgs outside those currencies, payment collection is disabled until we integrate an alternative (Stripe, Flutterwave). The country code is set at org creation time (from Wikidata, or user input) and maps to default currency via `src/config/currency.ts`.

### Q6. How do we keep organizations isolated so they cannot interfere with each other?

**Row Level Security** (Section 3). Every tenant-scoped table enforces:

- `SELECT` requires `is_org_member()`, `is_org_executive()`, or `is_platform_admin()` for the row's `organization_id`.
- `INSERT/UPDATE/DELETE` require specific permissions on the executing user.
- `transactions` and `platform_earnings` are read-only from the client; only Edge Functions with `service_role` can write them.

The RLS helpers (`is_org_executive`, `has_org_permission`, etc.) are `SECURITY DEFINER` functions that the client cannot circumvent. Combined with never exposing the service role key to the frontend, this provides hard multi-tenant isolation at the database level — not just application-level checks that can be bypassed by a forged request.

### Q7. Where do receipts go now that students don't upload them?

Generated server-side after the Paystack webhook confirms `charge.success`. PDF is stored in Supabase Storage at `receipts/{org_id}/{transaction_id}.pdf` and the URL is saved on `transactions.receipt_pdf_url`. The receipt is emailed to the payer and visible in their dashboard. Storage cost: a single PDF is ~30KB → 1M transactions = 30GB, which is well within Supabase's free/paid tiers.

---

**End of blueprint.** When adding to this document, append new subsections rather than rewriting existing ones, and bump the "Last updated" date at the top.
