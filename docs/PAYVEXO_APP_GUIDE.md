# Payvexo — App Guide

A single source of truth for **what Payvexo is, how it works today, and how to debug it when something goes wrong**. Read this and you should be able to pitch the product, onboard a new collaborator, or diagnose a stuck user flow without re-reading the source.

> **Last refreshed:** 2026-06-04 (after the identity-rework batch — chunks A through G5b, migs 100–104, commits `aa7c394` → `c7a5f43`).
> **Previous baseline:** founder-anchored-invite + receipts pass — commit `5d0f55d`.
> **Companion docs:** [`PAYVEXO_MASTER_BLUEPRINT.md`](./PAYVEXO_MASTER_BLUEPRINT.md) is the long-form design doc; this file is the operating manual.

---

## 1. What Payvexo is, in one paragraph

Payvexo is a multi-tenant **dues, events, and payments platform** for Nigerian student bodies, churches, clubs, and similar groups. A class rep, treasurer, or ministry leader stands up their org in minutes, invites their people, publishes dues and events, and collects money digitally through Paystack. Every payment is receipted, every cent is auditable, and the platform sits on a layered-trust model so no single person can lift money out of an org they haven't been verified to lead.

It is **multi-tenant by design** — one user can be a regular member in one org and an exec in another, and the dashboard adapts to whichever role they're acting as.

---

## 2. Who uses it (and what they each see)

| Persona | What they do | First-screen they care about |
|---|---|---|
| **Member** (e.g. a 200L student) | Pay dues, see what's coming, attend events | `/dashboard` — outstanding hero, what's due, events |
| **Founder** (created the org/class) | Bring in their people, claim a role, get verified, then run the org | Same dashboard + claim banner + founder share card |
| **Exec / Admin** (claimed & verified) | Publish dues, manage members, run payouts | `/admin/dashboard` once Layer 4 |
| **Platform admin** (Payvexo team) | Override stuck claims, freeze bad orgs, monitor earnings | `/platform/...` console |

---

## 3. The big mental models

### 3.1 Multi-tenant identity

- One human can be a member of many orgs. Internally there's a global `accounts` row linking memberships (migration 076), but **each org has its own `organization_members` row** with its own UUID `id`.
- When the user switches orgs, `useMultiTenantAuth()` swaps the active `user`, `organization`, and `group` — so `user.id` always means "this user's membership in the org they're currently looking at."

### 3.2 Group hierarchy (academic orgs)

```
Faculty / College   (parent = NULL)
  └─ Department     (parent = Faculty)
       └─ Class     (parent = Department)
```

Enforced by trigger in migration 079. A class **cannot** exist without a department, a department **cannot** exist without a faculty. Period. Orphan groups are surfaced for cleanup on the admin "Org Groups" page.

### 3.3 Graduated-trust claim system

Claiming a role is **opt-in and separate from creating structure** (migration 081). The founder of a class is just a regular member until they explicitly submit a claim. Once submitted, the claim climbs through verification layers:

| Layer | Name | Unlocks | How you get here |
|---|---|---|---|
| **0–1** | Pending / submitted | Nothing | Submit a claim at `/claim` |
| **2** | Email verified (acting admin) | Setup routes (dashboard, structure, calendar) | Verify a school/work/affiliation email at `/verify-email` |
| **3** | Peer voted | Same as Layer 2 + stronger trust signal | Members vote yes via `VoteUrgencyBanner` on their dashboard |
| **4** | Fully verified (full admin) | **Money & member-management** routes (`/admin/members`, payouts, dues publishing) | Parent admin confirms OR Path-C auto-threshold (10 indep votes) |

Routes are gated by `OrgProtectedRoute`:
- `requireActing` → Layer 2+
- `requireVerified` → Layer 4+
- `requirePermission` → permission check + optional layer

Money paths use `requireVerified` so a Layer-2 admin can set things up but cannot move funds.

### 3.4 Founder-anchored bootstrap invites

Pre-mig 082 the app couldn't grow: only admins could invite, and the new opt-in claim model meant founders had no admin row — so they couldn't pull anyone in to vote them in. Migration 082-088 fixed it:

- **Every class has an explicit `founder_member_id`** (set on first insert via trigger).
- **Only the founder can share a code** while the class has no non-founder admin.
- Founder gets **1 active code, 20 uses, 14 days**.
- The moment a non-founder admin verifies, the bootstrap path closes and admin invites take over (`/admin/members`).
- Calling the RPC a second time **returns the existing active code** instead of erroring — friendly UX.
- The whole trail is visible via `v_class_invite_activity` for accountability.

A founder who is also the verified admin keeps sharing — the gate is "other admin exists," not "any admin exists."

### 3.5 Email verification adapts to org type

- **Academic** (university, school, faculty, dept, class) → "School email" + must match the org's domain.
- **Church / fellowship** → "Verification email" + any email the user can prove ownership of.
- **Corporate** → "Work email" + ownership check only.
- The backend (`api/auth/verify-email.ts`) skips the strict domain match for non-academic orgs.

After verification:
- If a pending claim got bumped to Layer 2 → land on `/admin/dashboard`.
- If no claim existed → routed to `/claim` with a friendly nudge.

---

## 4. The user journeys, end-to-end

### 4.1 "I want to start managing dues for my class"

```
1.  Sign up / create org via "Bring your school"   →  /onboarding
2.  Land on /dashboard as a regular class member
3.  "Are you an exec here?" banner appears         →  Tap Claim a role
4.  Fill the claim form at /claim                  →  Layer 0 claim_request row
5.  /verify-email → enter & confirm code           →  Layer 2 (acting)
6.  Share class code from the founder card        →  classmates join
7.  Classmates see VoteUrgencyBanner → vote yes   →  Layer 3
8.  Parent exec/auto-threshold confirms           →  Layer 4 (money unlocked)
9.  /admin/dashboard → publish first due
10. /admin/payouts   → connect sub-account
```

### 4.2 "I just joined an org via a friend's link"

```
1.  Tap link  →  /:orgSlug/join?code=XXXXXXXX
2.  signup_member_via_invite RPC validates + creates membership
3.  Land on /dashboard as a regular member
4.  See: outstanding hero, what's due, events, recent activity
5.  "Are you an exec here?" banner shows → dismiss if not an exec
```

### 4.3 "I want to pay a due"

```
1.  Tap an event card on the dashboard or open /payments
2.  /payments/:paymentTypeId  →  amount, breakdown, Paystack inline
3.  Paystack returns → webhook records payment
4.  Auto-route to /receipt/:paymentId
5.  Receipt page: receipt number, all data, QR for scan-to-verify
6.  Download PDF → opens a clean print-window with the receipt only
```

---

## 5. Project structure (the bits you'll actually touch)

```
src/
├─ pages/                      Route components
│  ├─ StudentDashboardPage.tsx The active member dashboard (`/:org/dashboard`)
│  ├─ ReceiptPage.tsx          The on-screen receipt + PDF entry point
│  ├─ ClaimSubmitPage.tsx      Submit a claim
│  ├─ ClaimDecisionPage.tsx    Vote on someone else's claim
│  ├─ VerifyEmailPage.tsx      Email verification flow
│  ├─ JoinOrganizationPage.tsx Invite-code signup
│  ├─ AddFacultyPage.tsx       Wizard for adding a faculty
│  ├─ AddDepartmentPage.tsx    Wizard for adding a dept+class
│  └─ admin/                   Admin-only pages (gated by Layer 4)
│     ├─ AdminDashboardPage.tsx
│     ├─ OrgMembersPage.tsx    Manage members + admin invites
│     ├─ OrgGroupsPage.tsx     Hierarchy + orphan cleanup
│     └─ ManageDuesPage.tsx, CreateDuePage.tsx, etc.
│
├─ components/
│  ├─ layout/
│  │  └─ OrgLayout.tsx         Top nav + bottom mobile nav (single shell)
│  ├─ student/dashboard/       Modular dashboard pieces
│  │  ├─ OutstandingHero.tsx       Hero card (animated count-up, mouse highlight)
│  │  ├─ DueNextList.tsx           "Coming up" rows with urgency pills
│  │  ├─ EventsSection.tsx + EventCard.tsx  Event posters
│  │  ├─ QuickActionsGrid.tsx      4 tiles under hero
│  │  ├─ ShareClassLinkCard.tsx    The founder share card (post-082)
│  │  └─ PayvexoBackground.tsx     The ambient background
│  ├─ claims/
│  │  ├─ VerificationStatusBanner.tsx  Claim-state nudges
│  │  ├─ VoteUrgencyBanner.tsx         "You have votes to cast"
│  │  └─ MyClaimStatus.tsx             Your own claim's progress
│  └─ RoleSwitcher.tsx         Desktop "Acting as" dropdown
│
├─ hooks/
│  ├─ useMultiTenantAuth.tsx   Auth context (user/org/group/adminRecords)
│  ├─ useTheme.ts              Theme tokens (getDashboardTokens)
│  ├─ useThemeTokens.ts        Convenience hook returning {bg, text, primary, ...}
│  ├─ useAppNav.ts             `go()` helper (org-scoped navigation)
│  └─ useUserRoles.ts          Roles list for RoleSwitcher
│
├─ services/
│  ├─ multiTenantAuthService.ts    Sign-in / session / promotion
│  ├─ organizationService.ts        Org/group/invite CRUD
│  ├─ paymentService.ts             Dues + payments
│  └─ platformAdminService.ts       Platform overrides
│
├─ utils/
│  ├─ pdfExport.ts             jsPDF templates (incl. generatePaymentReceiptPDF)
│  ├─ memberFileParser.ts      CSV/XLSX member import
│  └─ formatters.ts            Date/currency helpers
│
└─ config/
   ├─ supabase.ts              Supabase client (custom JWT header)
   ├─ constants.ts             APP_NAME, etc.
   └─ colors.ts                Legacy palette (slowly being replaced by tokens)

api/                           Vercel serverless functions
├─ auth/
│  └─ verify-email.ts          School/affiliation email verification
└─ ...                         Webhooks, billing, expenses

multi-tenant/migrations/       SQL migrations (gitignored — *.sql in .gitignore)
                                Run in Supabase SQL editor in numeric order
```

---

## 6. The data model (the tables you'll meet)

| Table | What it stores | Key columns |
|---|---|---|
| `organizations` | The tenant | `id`, `slug`, `organization_type`, `email_domain`, `currency_symbol`, `primary_color` |
| `organization_groups` | The hierarchy (faculty/dept/class) | `id`, `parent_group_id`, `kind`, `founder_member_id` (mig 082), `levels[]`, **`is_staff_office`** (mig 099, transitional) |
| `organization_members` | A user's membership in an org | `id`, `organization_id`, `group_id`, `member_id` (text login), `password_hash`, `level`, `account_id` (mig 076) |
| `member_admins` | Admin/exec rows with verification layers | `member_id`, `verification_layer`, `scope_level` (`'org'`/`'unit'`/`'group'`), `group_id`, perm flags |
| `accounts` | Cross-org identity link (mig 076) | `id`, `email`, joined via `account_id` on members |
| `claim_requests` | Active claims awaiting verification | `claimant_user_id`, `position_title`, `votes_required`, `votes_received`, `current_layer`, `claimed_scope`, `claimed_group_id`, `claimed_role` |
| `claim_rejections` | 30-day cooldown ledger (signature-keyed) | `member_id`, `signature` (scope+group+role hash), `rejected_at` |
| `claim_votes` | Vote records | `claim_id`, `voter_member_id`, `vote` (`'confirm'`/`'reject'`/`'abstain'`) |
| `organization_invites` | Active join codes | `invite_code`, `created_by` (admin id), `created_by_member_id` (mig 082), `group_id`, `max_uses`, `use_count` |
| `payment_types` | Dues / events templates | `title`, `amount`, `is_mandatory`, `deadline`, `category` (incl. `'event'`), `group_id`, `event_date`, `event_venue`, `event_cover_url`, `event_max_attendees` |
| `payments` | Individual payment records | `member_id`, `payment_type_id`, `event_tier_id`, `status`, `paystack_reference`, `total_charged_kobo`, `platform_fee_kobo`, `transaction_ref` (waivers prefix with `WAIVED-`) |
| `event_ticket_tiers` | Event tier pricing | `payment_type_id`, `name`, `price`, `quantity`, `sold_count`, `is_active`, `sort_order` |
| `event_tickets` | Issued tickets (one per successful payment) | `payment_id`, `ticket_code` (`PVX-TKT-XXXX`), `tier_id`, `member_id`, `group_id`, `status` (`'valid'`/`'used'`/`'cancelled'`), `checked_in_at`, `checked_in_by` |
| `group_memberships` | Multi-group membership rows (mig 074) | `member_id`, `group_id`, `is_primary`, `status` |

### Important RPCs (SECURITY DEFINER)

| RPC | Purpose | Migration |
|---|---|---|
| `signup_member_via_invite` | Anon-callable signup using an invite code. Auto-inherits level from class. Pre-checks same-name-in-class. | 078 → 103 → 104 |
| `bootstrap_department_with_class` | Create dept + class + first member atomically. `p_is_staff` argument retired; class info now required for every founder. | 080/081 → 098 → 100 |
| `bootstrap_class_with_rep` | Same, but starting from an existing dept | 080/081 |
| `create_member_join_invite` | Founder bootstrap share-link generator | 082-087 |
| `get_class_invite_status` | "Can the caller share, and is admin in scope?" | 082-088 |
| `_class_has_admin_other_than` | Helper: any admin **other than** this member? | 084 |
| `_group_ancestor_ids` | Walks the group hierarchy upward | 084 |
| `submit_claim_v2` | Submit a claim_request. Self-exclusion in parent-exec detection + ancestor fallback when only Layer-4 exec at the parent IS the claimant. Contestation broadcast to voting pool + earlier claimants. | claim system mig 042 → 101 |
| `move_member_to_class` | Re-home a member to a real class (used by the legacy-Office gate) | 100 |
| `check_in_ticket` | Door-side ticket validation. Walks the ticket's group ancestor chain so each tier exec scans only their subtree. New `scope_mismatch` result code. | 077 → 102 |
| `issue_event_ticket` | Mint an `event_tickets` row from a paid `payments` row. Reused by the free-ticket-grant flow on waivers. | 058 |
| `is_member_under_cooldown` + `_claim_signature` | 30-day cooldown machinery for rejected claims | 042 |
| `get_my_billing_group_ids` | Member's groups + every ancestor — drives the cascade rule for dues + events | 075 |
| `get_my_memberships` | Cross-org switcher feed (one row per (account, org)) | 076 |

### Important views

- **`v_class_invite_activity`** (mig 082) — admin-visible feed: who shared which code, when, how many uses left.

---

## 7. Theming

Everything visual reads from `useThemeTokens()`:

```ts
const tk = useThemeTokens();
//  tk.bg, tk.bgWash             page surfaces
//  tk.card, tk.cardBorder       card surfaces
//  tk.text, tk.textSec, tk.textTer   typography
//  tk.primary, tk.primarySoft, tk.primaryRing   brand orange family
//  tk.mint, tk.blue, tk.purple, tk.amber, tk.danger   status colors
//  tk.gradOrange, tk.gradGreen, tk.gradTeal   designed gradients
//  tk.blob1, tk.blob2, tk.dot   decorative ambient
//  tk.shadow, tk.shadowLg, tk.overlay, tk.input, tk.inputBorder, tk.divider
//  tk.isLight (bool), tk.theme ('light'|'dark')
```

**Rules of the road:**
- Page roots get `style={{ color: tk.text }}` so text inherits.
- Avoid `text-white` on non-colored surfaces. Use `color: tk.text` inline.
- Keep `#FFFFFF` only on **gradient pills** (orange brand buttons, etc.) — the gradient is dark in both themes.
- `colors.*` imports from `src/config/colors` are legacy. Migrate to `tk.*` as you touch a file.

---

## 8. The Big Things We Just Shipped (commit `5d0f55d`)

### 8.1 Founder-anchored invites (mig 082-088)
- Replaces "any member can invite" with "the class founder, until the class has a non-founder exec."
- Codes auto-expire when admin takes over. Tapping share twice returns the same code.
- UI: `ShareClassLinkCard` shows founder bootstrap, "ask the founder" hint for non-founders, "go to admin/members" for fully verified admins (Layer 4).
- The card's modal labels the org explicitly so a multi-org founder can never confuse codes.
- WhatsApp-ready share message template.

### 8.2 Verification & claim flow polish
- `VerifyEmailPage`: label/placeholder/helper adapt to org type (school/church/work).
- `api/auth/verify-email.ts`: domain check only for academic orgs with a domain on file.
- Post-confirm routing branches: pending claim → `/admin/dashboard`, no claim → `/claim`.
- `VerificationStatusBanner` nudges **anyone** without a verified role to claim — not just the org creator. Stripped the embedded invite panel (single source of truth in `ShareClassLinkCard`). Removed the legacy "Verify your role / Submit verification" CTA — superseded by the dedicated `/verify-email` page.

### 8.3 Nav redesign
- **Desktop**: role-switcher → single "Acting as" dropdown chip. No more horizontal-scroll overflow.
- **Mobile top bar**: tighter org/group/level row, theme-aware tokens.

### 8.4 OutstandingHero polish
- Warmer orange gradient (less "neon CSS"), animated count-up, mouse-tracked highlight, holographic foil on hover, status-aware sub-line, embossed `MEMBER · <id>` footer, sparkle pop when balance is zero, hand-drawn underline + thumbprint mark for the "human" feel.

### 8.5 EventsSection + EventCard
- 2-up responsive grid on wide screens.
- EventCard adds: date-block stub (poster-style), countdown chip (Today / Tomorrow / In Nd), "spots left" badge with low-stock urgency tint.

### 8.6 Receipts
- On-screen: receipt-number chip (`PVX-XXXXXX`), payer email, fee breakdown when a platform fee exists, scan-to-verify QR pointing back at the receipt URL.
- "Download PDF" now hands off to `generatePaymentReceiptPDF` — opens a clean print-window with **only** the receipt. The nav, sheets, and ambient bg never leak into the PDF.

---

## 8.A The 2026-06 identity-rework batch (chunks A → G5b)

This is the most significant single batch the codebase has seen since the layered-trust system. It re-shapes how identity, claims, tier visibility, events, and onboarding all behave. Every change below is shipping behind real commits + four new migrations (100-104).

> **One-line summary:** A person is now a *member of one class*, not a *member parked on whatever group came first*. Exec roles layer on top via `member_admins`; the form, the queries, and the UX all assume this rule.

### 8.A.1 Why this batch existed

The user (UNN founder) hit a wall in real use: founding a department created a "department account" with the founder's personal details; then trying to also create their real class said the email/ID was already taken; trying to log in with the dept account against the class URL said "this account belongs to a different group"; the role-claim picker only offered Class / Faculty / Org with no clean way to claim Department; a dept president who was *also* a class rep couldn't approve his own class-rep claim because he was the only verified parent exec — the claim sat in `awaiting_votes` forever; class reps could scan tickets for events that belonged to other tiers; the Outstanding hero counted event prices as "you owe ₦5k" even though events are buy-in only; My Dues showed the cheapest tier price (₦3k Regular) for someone who actually paid ₦25k VIP; and so on.

Each of those is a different symptom of one root cause: the app conflated **who you are** with **which group you belong to**. The rework separates them.

### 8.A.2 Chunk-by-chunk recap

| Chunk | What ships | Migration |
|---|---|---|
| **A** — Login + logout | Server drops the strict `member.group_id === selectedGroupId` check on `/api/auth/login`; `?group=` becomes a UI hint only. `OrgLoginPage` stops auto-defaulting to `groups[0]`. `OrgLayout.handleLogout` snapshots `group.id` BEFORE state-clear and preserves `?group=` across the round-trip. | — |
| **H** — Office concept retired | `bootstrap_department_with_class` drops `p_is_staff`. Every founder picks a real class. Legacy `is_staff_office` classes still exist for FK integrity; an `OfficeClassGate` modal forces parked members to pick a real class on next login. `AddDepartmentPage` no longer offers a "staff (no class)" intent. New RPC `move_member_to_class`. | **100** |
| **B** — 4-tier claim picker | `ClaimSubmitPage` shows Class / Department / Faculty / Org as four buttons. Dept and Faculty both map to `scope_level='unit'` under the hood but each gets its own target dropdown (only depts vs only faculties). Role list filtered per tier via `getRolesForTier(orgType, tier)` — "Class Rep" disappears for non-class tiers, "HOD" only on dept, etc. Native role `<select>` swapped to `ProfessionalDropdown`. Pre-submit banner detects contested claims (same group + role from another claimant) and warns the user before they file. | — |
| **C** — Claim review routing | `submit_claim_v2` patched: self-exclusion when detecting parent execs (claimant no longer counts as "a parent exec who exists"), ancestor fallback (sibling parents → walk-up ancestors → org-scope), `claim_contested` notifications to earlier claimants, peer-vote notification message branches on contestation so the voting pool knows it's a contest, plus a re-ping about earlier claims so the inbox shows both candidates simultaneously. | **101** |
| **D** — Active-role scope gating | `CreateDuePage` derives the form's effective scope from `useActiveRole().scopeLevel`, not the union of all admin rows. A dept-pres-AND-class-rep sitting on the class-rep dashboard sees ONLY class-tier targets in the picker. `PayoutSetupPage` was already tier-aware via `activeRole.groupId`. | — |
| **E** — Per-tier ticket check-in | `check_in_ticket` walks the ticket's group ancestor chain. `scope_level='org'` covers everything; `'unit'` covers self + all descendants; `'group'` covers self only. New `scope_mismatch` result code with amber "Wrong tier" badge in `TicketCheckInPage`. `OrgLayout` drops `maxScope: 'group'` from the Event Check-in nav so every tier sees the button. | **102** |
| **F** — Structural invite buttons | New `CopyInviteLink` component. `OrgOverviewPage` shows "Invite a faculty founder" next to "Add faculty"; `FacultyDetailPage` shows "Invite a dept founder"; `DepartmentDetailPage` shows "Invite a class rep". Each button has a hint explaining the trust model — URL alone grants nothing, claim still goes through peer vote. | — |
| **G1** — Event ticket-tier insert on CREATE | `event_ticket_tiers` RLS grants INSERT to `service_role` only (mig 057). Direct client insert from `CreateDuePage` was failing silently. New `insert-event-tiers` action on `/api/billing/verify-payment` re-verifies admin scope and writes via service_role. | — |
| **G2** — Event waive → free-ticket grant | New `issue-free-ticket` action on `/api/billing/verify-payment`. Inserts a `payments` row + calls existing `issue_event_ticket` to mint the actual ticket. Rolls back the payment row if ticket minting fails. `WaivePaymentPage` detects `category='event'`, loads tiers, renders a "Step 2b — Pick the ticket tier" card with cheapest tier pre-selected. Preview text branches: "A FREE TICKET for VIP will be issued to …". Multi-admin `.single()` crash fixed (`.order().limit(1).maybeSingle()` instead). `payments.approved_by` removed from inserts (column was dropped in mig 020 — PostgREST schema cache was rejecting writes). | — |
| **G3a** — Level inheritance | `signup_member_via_invite` auto-fills level from the target class's `levels[1]` when caller passes no level. Class rep sets the level once at creation; every joiner inherits. `JoinOrganizationPage` drops the level input. `AddDepartmentPage` makes class level field required at class-step. `BringMySchoolPage` enforces level for academic orgs. | **103** |
| **G3b** — Onboarding audit | Findings written into this guide. Critical fixes applied: BringMySchool level required + global validity; faculty field hint clarified ("optional — we'll nest your class directly under the org"). Findings flagged for later: `CreateOrganizationPage` duplicates `BringMySchoolPage`; AddFaculty could offer inline claim like AddDept does. | — |
| **G3c** — Hero rework | `paymentService.getStudentDashboardPayload.totalDue` skips `category='event'` (tickets aren't debt) and `is_mandatory=false` (optional contributions aren't arrears). `StudentDashboardPage.unpaidCount` filters to mandatory unpaid only so donut + headline number agree. Events stay visible via existing `EventsSection`; optional dues stay in `DueNextList` with their existing "Optional" label. | — |
| **G3d** — My Dues read fix | `MyDuesPage` paid-row rendering switches from `pt.amount` (cheapest tier price) to `data.approvedSum` (what the member actually paid). VIP buyer's ₦25k now reads correctly. | — |
| **G4** — Class-scoped name dedupe | New partial unique index on `(group_id, lower(trim(full_name)))` for active members with non-null name. `signup_member_via_invite` pre-checks before INSERT and returns `code='name_taken_in_class'` with a friendly "Add a middle initial" message. Race-condition fallback inspects `SQLERRM` for the new index name. | **104** |
| **G5a** | Settings "Admin control" section removal | *(pending)* |
| **G5b** — School-email autofill | `ClaimSubmitPage.institutionalEmail` defaults to `user.email` on mount and via effect. Hint copy branches on whether the value still matches `user.email`: "using your account email — change if you have a different school email" vs the legacy "required for first claim". Verified founders no longer retype on every subsequent claim; the back end's bootstrap gate keeps the strict rule for first-claim-at-org. | — |
| **G5c** — Onboarding restructure | `AddDepartmentPage` drops the `intent` picker (`student` vs `helping`). Wizard now reads as: **The department (structure only)** → **YOUR class** → **YOUR account** → **Claim a role** → **Review**. Panel copy explicitly distinguishes structure-vs-roster. Recap row labels mirror the same vocabulary. `BringMySchoolPage` hides the "Group kind" picker for academic orgs (forces `class`); non-academic orgs keep the picker because their hierarchy varies. | — |
| **Expenses tier finishing pass** | `ExpenseApprovalQueue` + `AdminCollectedPage` now resolve `getScopedGroupIds()` once and switch every group filter to `.in()`. `expenseService.fetchExpenses` + `fetchExpenseCategories` accept an optional `scopedIds` parameter so existing call sites keep the legacy primary-class behavior while new callers widen to the active role's subtree. Dept/faculty execs see the full financial picture on the approval queue, the collected page, the expenses list, and the record-expense form. | — |

### 8.A.3 The hard rules this batch encodes

1. **Every member belongs to exactly one class** (`organization_members.group_id` always points at a `kind='class'` group). Departments and faculties are pure structure with zero member rows.
2. **A person can hold many roles, but acts as one at a time.** `useActiveRole()` is the source of truth for which scope a UI surface should filter on — never the union of `member_admins.scope_level` values.
3. **Each tier sees only their subtree.** Class → own class only. Dept → dept + every descendant class. Faculty → faculty + every descendant dept + every descendant class. Org → everything. Enforced by `getScopedGroupIds()` on the client + by RPCs that walk the ancestor chain on the server.
4. **A class owns one level.** New joiners inherit `organization_groups.levels[1]`. Class rep is the only person who bumps it (typically once a year). Dues filter on `target_levels` so changing the class level cascades naturally.
5. **Same name within a class is blocked; same name across classes is fine.** Real-world rule — every large university has multiple John Does, but two of them in one class breaks the class rep's mental model when approving payments.
6. **Events surface in their own section, not as debt.** Outstanding hero counts only mandatory non-event dues. Event-tier waivers issue a real ticket (`event_tickets` row + QR code), not just a zeroed payment.
7. **Claims can't approve themselves.** When the claimant is the only Layer-4 exec at the parent group, the system walks up the ancestor tree to find a reviewer.
8. **Contests are visible.** Multiple pending claims for the same role + group surface a pre-submit banner to the new claimant, a `claim_contested` notification to the earlier claimant, and a re-ping with "vote for the real X" copy to the entire voting pool.

### 8.A.4 Migrations to run (cumulative for this batch)

```
100_remove_office_concept.sql        — bootstrap loses p_is_staff; move_member_to_class added
101_claim_review_routing.sql         — self-exclusion + ancestor fallback + contestation broadcast (re-runnable; idempotent via DROP IF EXISTS)
102_tier_scoped_ticket_checkin.sql   — check_in_ticket walks ancestors; new 'scope_mismatch' result
103_class_level_inherit.sql          — signup auto-fills level from class
104_class_scoped_name_dedupe.sql     — partial unique index + signup pre-check
```

Run in numeric order in the Supabase SQL editor. **101 is idempotent** because of the new `DROP FUNCTION IF EXISTS` guard — safe to re-run if the first attempt hit the `rejected_at` column error from a stale draft.

### 8.A.5 The bugs we hit and squashed mid-batch

These shipped together with the chunks above — listed here for the bug-triage path:

- **`Could not submit claim: column "rejected_at" does not exist`** — early draft of mig 101 invented a `rejected_at` column on `claim_requests`. Fixed by reverting to the original mig 042 cooldown machinery (`is_member_under_cooldown()` + `_claim_signature()`).
- **`Waive failed: Could not find the 'approved_by' column of 'payments'`** — `payments.approved_by` was dropped in mig 020 (legacy FK to the retired `admins` table). Both the existing waive flow and the new `issue-free-ticket` endpoint were writing to it. Removed from both inserts; audit identity moved to the `notes` field.
- **`Cannot coerce the result to a single JSON object`** on waive — multi-admin user (dept-pres + class-rep in same org) has two active `member_admins` rows; `.single()` blows up on > 1 result. Switched to `.order('verification_layer', desc).limit(1).maybeSingle()`.
- **PostgREST silent INSERT failures on `event_ticket_tiers`** — RLS grants INSERT to `service_role` only (mig 057). Raw client insert from CreateDuePage returned `ok` with zero rows. Fixed by routing through the service-role endpoint.

---

## 9. Debugging cookbook

When a user reports a bug, walk the funnel from outermost (network / SQL) to innermost (UI state).

### 9.1 "Share Link button is disabled / says I can't"

1. **DevTools console.** ShareClassLinkCard logs `[ShareClassLinkCard]` on errors with full server detail.
2. **Did you run all migrations 082-088?** Most "can't generate" errors trace to a missing migration.
3. **Are you the actual founder?** Query: `select founder_member_id from organization_groups where id = '<group-id>'`. Compare to your `organization_members.id` in the active org.
4. **Is there a non-founder admin?** `select * from member_admins where organization_id = '<org-id>' and verification_layer >= 2 and member_id != '<your member id>'`. If yes, bootstrap is closed.
5. **Is your `created_by` column NOT NULL?** mig 083 dropped that constraint; if you missed it, every founder INSERT fails inside the RPC with the generic "unknown" code.

### 9.2 "PDF receipt is huge / contains the nav"

You're somewhere that still calls `window.print()` directly. Search for it — only `ReceiptPage.handleDownload` should ever call PDF helpers, and that one now hands off to `generatePaymentReceiptPDF`. If a different page prints, swap it for the helper.

### 9.3 "After email verification I'm stuck on /admin/dashboard with nothing to do"

This is the **"no pending claim"** path. Check the server response from `confirmSchoolEmailCode`:
- `promoted > 0` → existing claim got bumped. Should land on /admin/dashboard. Genuinely usable.
- `promoted = 0` → email verified but no claim existed. New flow (commit `5d0f55d`) routes you to `/claim`. If you see the old behavior, you're on stale build — hard refresh.

### 9.4 "Members don't see the VoteUrgencyBanner"

- `VoteUrgencyBanner` calls `organizationService.listOpenClaimsForVoter(memberId)`.
- It returns claims where the caller is an **eligible** voter (same org, not the claimant, not already voted).
- If empty:
  - Is the claim actually `awaiting_votes` / `submitted` / `under_review`? Query `claim_requests.status`.
  - Has this member already voted? Query `claim_votes`.
  - Is the claim from the same org? Cross-org claims are intentionally invisible.

### 9.5 "I see another org's invite code"

This was the cross-org confusion bug. Fix shipped in commit `5d0f55d`:
- `ShareClassLinkCard` now resets `invite`/`error`/`copied` on every `memberId` or `groupId` change.
- Modal header shows `{orgName} · Share to grow / {className} — join code`.

If you still see stale codes: clear localStorage (`pvx_invite_*` keys), hard refresh, check the active org in `useMultiTenantAuth`.

### 9.6 "Verification banner won't dismiss"

It writes `pvx_claim_banner_dismissed_<orgId>_<memberId>=1` to localStorage. Clear that key to bring it back. The banner is intentionally per-(org, member) so dismissing in one org doesn't silence another.

### 9.7 General: "an RPC errored with `unknown`"

Every SECURITY DEFINER RPC ends with:
```sql
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'code', 'unknown', 'detail', SQLERRM);
```

So if the client gets `code: 'unknown'`, check `result.detail` — the underlying Postgres error is there. Common culprits:
- `function gen_random_bytes(integer) does not exist` → wrong schema (mig 085 qualified it as `extensions.gen_random_bytes`).
- `null value in column "created_by" violates not-null constraint` → mig 083 didn't drop the NOT NULL.
- `column ... does not exist` → check the migration order; you likely skipped one.

### 9.8 RLS / silent INSERT failures

If a write "succeeds" in code but no row appears in Supabase, RLS denied it silently. The fix path:
- Move writes that need privilege to a SECURITY DEFINER RPC (see `signup_member_via_invite`, `create_member_join_invite`).
- Don't fight RLS from the client — use the RPC pattern.

### 9.9 Build error: "Invalid value for '--ignoreDeprecations'"

`tsconfig.app.json` has `"ignoreDeprecations": "6.0"` which TS 5.9 rejects. Use `npx vite build` directly (skip `tsc -b`) for quick verification. Real fix: lower the value to `"5.0"` or upgrade TS.

### 9.10 "I'm blocked behind a 'Pick your real class' modal"

You're a legacy Office member. Pre-mig-100, staff founders got dropped into an auto-created `Office` class flagged with `is_staff_office=TRUE`. The `OfficeClassGate` overlay (mounted in `OrgLayout`) fires whenever `group.is_staff_office === true`. Pick a real class from the dropdown — `move_member_to_class` (mig 100) updates `group_id` + counters in one shot, the session refreshes, the page reloads. After everyone migrates, a follow-up mig can drop the column for good.

If the modal won't dismiss after picking a class:
- Check `member_admins` — the member needs an active row in the org or the auth session won't refresh cleanly.
- Hard reload after the move — the gate state lives on `group.is_staff_office`, which only re-reads on session refresh.

### 9.11 "A claim is stuck at `awaiting_votes` with no path forward"

Pre-mig 101: the only Layer-4 exec at the parent group IS the claimant. `submit_claim_v2` notified them to confirm their own claim, the inbox filtered it back out, and the row sat forever.

Post-mig 101:
- Run mig 101 if you haven't.
- Existing stuck claims need a manual nudge — query `claim_requests` for `status='awaiting_votes'` AND `claimant_user_id IN (SELECT member_id FROM member_admins WHERE group_id = <parent>)`. Each such row needs either (a) a re-submission so the new ancestor-fallback notification fires, or (b) a platform-console override.

### 9.12 "Class rep scanning a ticket for someone else's event gets `unauthorized`"

Pre-mig 102: `check_in_ticket` only checked the scanner was "an exec somewhere in the org" — no tier filter. Post-102: the scanner's `(scope_level, group_id)` is compared against the ticket's `group_id` and its ancestor chain. `'org'` covers everything; `'unit'` covers self + descendants; `'group'` covers self only. Mismatches return `result='scope_mismatch'` and render as an amber "Wrong tier" badge.

If you get `scope_mismatch` for a ticket you SHOULD be able to scan:
- Check `event_tickets.group_id` for the ticket's actual tier.
- Check `member_admins` for the scanner — they need a row whose `(scope_level, group_id)` covers the ticket.
- An org-tier scanner with `scope_level='org'` AND `group_id IS NULL` covers everything.

### 9.13 "Waive fails with a column-not-found error"

Almost always `approved_by`. The column was dropped in mig 020 (legacy FK to retired `admins`). Both the waive form and the free-ticket endpoint now write audit identity into `notes` instead. If you reintroduce it on a fork, PostgREST schema cache rejects the INSERT silently in production but loudly in development — surfacing as `Could not find the 'approved_by' column of 'payments' in the schema cache`.

### 9.14 "A member can't sign up — 'Someone with that name is already in this class'"

Working as designed (mig 104). The class already has another member with that exact normalized name. Two options:
- The joiner adds a distinguishing detail ("John A. Doe", "Mary K.").
- The class rep checks if the existing member is actually the same person who's re-joining via a different invite — if so, deactivate the legacy row instead of creating a second one.

The constraint is a partial unique index — it doesn't apply to `is_active=FALSE` rows, so deactivating + re-creating is a clean path.

### 9.15 "Outstanding hero shows ₦0 but I owe dues"

Post-G3c: only **mandatory non-event** dues count toward `totalDue`. If your only unpaid items are events or optional contributions, the hero correctly reads ₦0. Look at `DueNextList` (events + optional dues with their "Optional" label) and `EventsSection` ("Happening soon") for the surfaces those show on.

If you DO have mandatory unpaid and still see ₦0:
- Confirm `payment_types.is_mandatory = TRUE` for the unpaid items.
- Check `get_my_billing_group_ids` returns your group + ancestors — the cascade rule depends on this.
- Inspect `paymentService.getStudentDashboardPayload` in the network tab; the response's `stats.totalDue` is the source.

### 9.16 "My Dues shows the wrong amount on a paid row"

Pre-G3d: it displayed `pt.amount` (the cheapest tier's price). Post-G3d: it displays `approvedSum` (the actual sum of your approved payments for that payment type). If you still see the wrong number, you're on a stale build — hard refresh.

### 9.17 "Recent activity shows the receipt amount but My Dues / hero disagree"

This is the canonical "tier price vs paid amount" mismatch. Receipt + recent activity always show the actual payment row's `amount`. My Dues now does too (G3d). The Outstanding hero filters to mandatory non-event dues only (G3c). If three different surfaces show three different numbers, run a diff:
```sql
SELECT pt.title, pt.amount AS asking_price, p.amount AS paid_amount, pt.category, pt.is_mandatory
FROM payments p
JOIN payment_types pt ON pt.id = p.payment_type_id
WHERE p.member_id = '<member-uuid>' AND p.status = 'approved';
```
The numbers should match what each surface shows under its own filter.

---

## 10. How to run the project

```bash
npm install
cp .env.example .env.local         # fill in Supabase + Paystack keys
npm run dev                        # vite dev server on http://localhost:1455
```

**Apply pending SQL migrations.** Open the Supabase SQL editor → copy each `multi-tenant/migrations/0XX_*.sql` in numeric order → run. They're idempotent (`IF NOT EXISTS`, `OR REPLACE`, `DROP IF EXISTS`).

**Build check** (skips the broken tsc -b step):
```bash
npx vite build
```

**Vercel deploys** the `api/` folder as serverless functions. Locally, those endpoints don't work via Vite — point your dev server at the deployed preview for full integration tests.

---

## 11. Glossary

- **Org / Organization** — A tenant. A university, a church, a club.
- **Group** — A sub-unit of an org. Faculty → department → class for academic orgs.
- **Member** — A row in `organization_members`. One per (user, org).
- **Founder** — The first member of a group, captured in `organization_groups.founder_member_id`.
- **Admin / Exec** — A member with a row in `member_admins`. Their `verification_layer` decides what they can do.
- **Layer** — A trust tier (0–4). Money unlocks at 4.
- **Claim** — A `claim_requests` row representing "I want to be the treasurer (or whatever)." Progresses through layers as members vote and the parent exec confirms.
- **Bootstrap invite** — The founder's share code. Active while the class has no non-founder admin.
- **Verification email** — Any email the user can prove ownership of. For academic orgs it must match the org domain; for non-academic orgs ownership is enough.
- **Paystack sub-account** — The Paystack-side account that receives an org's funds. Each org has one.
- **Payout** — Sending the sub-account balance to the org's real bank account.

---

## 12. Roadmap (pending)

**In the next batch (small, in-scope):**
- **G5a** — Remove the "Admin control" section from the Settings page.
- **AddFacultyPage parity** — add an optional inline claim step like AddDepartmentPage already has.
- **CreateOrganizationPage consolidation** — duplicates `BringMySchoolPage`; merge or retire one entry point.

**Operational (when an org starts using us in anger):**
- Sub-account wiring + creation audit (when an org's first due is created, did Paystack get configured?).
- First-due flow: prompt to set up payout **before** creating the first due so funds never land in an unconfigured sub-account.
- Per-admin daily cap on free-ticket grants (G2 mitigation) + audit log surfaced to platform console.
- "Promote class" button on the class admin page that bumps `levels[1]` (e.g. 300L → 400L) when the cohort moves up; graduated cohort gets `is_active=FALSE`.
- Drop the `is_staff_office` column once every legacy member has migrated out via the OfficeClassGate.

**UX polish:**
- Hide stale debugging-cookbook entries that referenced commit `5d0f55d`-era surfaces (some still apply, some don't post-identity-rework — audit on next pass).
- Notification routing — `claim_contested_vote` + `claim_contested` types both route through the existing `/claims/<id>` → `/claim/<id>/decide` normalizer; consider distinct icons on the inbox cards.
- Remove the orphan `OrgDashboardPage.tsx` (replaced by `StudentDashboardPage`).

**Bigger investments:**
- Class activity feed (recent joins, vote events) for transparency.
- Onboarding restructure for non-academic orgs — current `BringMySchoolPage` is academic-coded.
- Per-tier verify-event-ticket scanning history surface (who scanned what when).

---

## 13. Operational runbook

### 13.1 Wipe a test org (DESTRUCTIVE)

`multi-tenant/tools/wipe_org_by_slug.sql` is intentionally **gitignored** — destructive helpers don't ship in the repo so a teammate can't accidentally hit Run on prod. To use:

1. Open `multi-tenant/tools/wipe_org_by_slug.sql` locally.
2. Edit `v_slug` near the top to the slug you want to drop.
3. Paste the whole file into the Supabase SQL editor.
4. The DO block prints a pre-wipe count before running the DELETE so you can ROLLBACK if something looks off.

The tool deletes every per-org row but leaves the `accounts` global identity table alone — members in OTHER orgs still need it. Orphan accounts (no remaining memberships) can be cleaned separately later if you care; harmless to leave.

### 13.2 Re-running migrations safely

All migrations are written idempotently (`CREATE OR REPLACE FUNCTION`, `IF NOT EXISTS`, `DROP IF EXISTS`). Run order matters when a later mig modifies a function from an earlier mig. The canonical order for the identity-rework batch:

1. `100_remove_office_concept.sql`
2. `101_claim_review_routing.sql`
3. `102_tier_scoped_ticket_checkin.sql`
4. `103_class_level_inherit.sql`
5. `104_class_scoped_name_dedupe.sql`

`104` supersedes `103`'s `signup_member_via_invite` (same param signature, adds the name pre-check on top of level inheritance). Running 104 after 103 is correct; running 103 alone leaves you without the name pre-check, which is fine if you don't need it yet.

### 13.3 Resetting a stuck claim

```sql
-- Find the stuck claim
SELECT id, claimant_user_id, claimed_role, claimed_scope, claimed_group_id, status, current_layer, votes_received, votes_required
FROM claim_requests WHERE status = 'awaiting_votes' AND created_at < NOW() - INTERVAL '7 days';

-- Soft-reject so the claimant can try again after 30 days (uses the cooldown machinery, not destructive)
UPDATE claim_requests SET status = 'rejected' WHERE id = '<claim-id>';
INSERT INTO claim_rejections (member_id, signature, rejected_at)
  SELECT claimant_user_id, public._claim_signature(claimed_scope, claimed_group_id, claimed_role), NOW()
  FROM claim_requests WHERE id = '<claim-id>';

-- OR: nudge ancestor execs to re-review by calling submit_claim_v2 again as the same claimant
--     (it'll trip the anti-double-submit guard unless you delete the row first; safer to use the
--     soft-reject + re-submit route).
```

### 13.4 Verifying the tier model is intact

Quick health check after running migs 100-104:

```sql
-- 1) Every member belongs to a class. Zero rows expected.
SELECT om.id, om.full_name, g.kind
FROM organization_members om JOIN organization_groups g ON g.id = om.group_id
WHERE g.kind <> 'class' AND COALESCE(om.is_active, TRUE) = TRUE;

-- 2) No class has duplicate active names. Zero rows expected after cleanup.
SELECT om.group_id, LOWER(TRIM(om.full_name)) AS name, COUNT(*)
FROM organization_members om JOIN organization_groups g ON g.id = om.group_id
WHERE g.kind = 'class' AND om.is_active AND om.full_name IS NOT NULL
GROUP BY om.group_id, LOWER(TRIM(om.full_name)) HAVING COUNT(*) > 1;

-- 3) Class-tier groups have a level (mig 103 makes this mandatory going forward; existing rows may be null).
SELECT id, name, levels FROM organization_groups WHERE kind = 'class' AND (levels IS NULL OR array_length(levels, 1) = 0);

-- 4) Each event with paid tickets has the corresponding event_tickets rows.
SELECT pt.id, pt.title, COUNT(p.id) AS paid_count, COUNT(et.id) AS ticket_count
FROM payment_types pt
LEFT JOIN payments p ON p.payment_type_id = pt.id AND p.status = 'approved'
LEFT JOIN event_tickets et ON et.payment_id = p.id
WHERE pt.category = 'event'
GROUP BY pt.id, pt.title HAVING COUNT(p.id) <> COUNT(et.id);
```

---

## 14. Pitch material

**One-paragraph elevator pitch (memorize this):**

> Payvexo is the easiest way for a Nigerian student class, a church, or a club to manage dues, events, and payments together — digitally, with full receipts, and with safety baked in so the wrong person can never lift money. A class rep stands up their class in five minutes, invites their people through a code, gets confirmed by their members, and unlocks payouts. No spreadsheets, no missing cash, no "who paid what."

**Three-sentence value prop for execs (multi-tenant scope):**

> Payvexo gives every tier of an organization — class, department, faculty, or the whole school — its own dues, events, and payout account, with a layered-trust verification model so role claims can't be rubber-stamped by a single person. Class reps collect class dues to a class bank; dept presidents publish dept-wide dues that cascade to every class under them; faculty execs see the rollup; the platform takes a small per-transaction fee and pushes the rest straight to the relevant tier's Paystack sub-account in real time. The entire path — invite, claim, vote, publish, pay, receipt, payout — runs in one app on one login per org.

**One-sentence positioning for non-academic orgs:**

> Same platform, same trust model — churches see "ministries" instead of "departments," clubs see "chapters," and the language adapts everywhere from the role picker to the email-verification prompt.

**Differentiation from spreadsheet collection workflows:**

| Spreadsheet workflow | Payvexo |
|---|---|
| Treasurer DMs a bank account; members WhatsApp screenshots | Members pay inline via Paystack; receipts auto-issued |
| One person knows who paid; if they leave, the record dies | Every payment is a `payments` row + a receipt anyone in scope can audit |
| Disputes over "I sent it last week" go unsolved | Receipt has a number, a member ID, an exact timestamp, and a scan-to-verify QR |
| Wrong person claims to be the treasurer; no recourse | Layered-trust claim system + contested-role voting + peer + parent-exec confirmation |
| No event tickets, no door check-in | Ticketed events with tier pricing, QR check-in scoped per tier exec |
| Org dies when the exec graduates | Class rep bumps the level once; cohort moves up; new exec is one peer-vote away |

**What's still in beta (don't pitch as launched):**

- Free-ticket grants on event waivers (audit log not yet surfaced to platform console).
- Cross-class name dedupe (intentionally NOT enforced — only same name in the same class is blocked).
- The OfficeClassGate is a one-time migration aid, not a long-term UX.
- AddFaculty lacks the inline-claim step that AddDepartment has.

**What's bulletproof now (pitch confidently):**

- Multi-tenant identity + cross-org switcher (since mig 076).
- Founder-anchored invites + signup-via-invite (mig 082+).
- Layered-trust claim system (mig 042+101).
- Per-tier scope gating across every admin surface (chunks D + E + expense tier-finishing pass).
- Tier-aware ticket check-in (mig 102).
- Onboarding that doesn't conflate structure with identity (chunk G5c).
