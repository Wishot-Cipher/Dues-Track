# Payvexo — App Guide

A single source of truth for **what Payvexo is, how it works today, and how to debug it when something goes wrong**. Read this and you should be able to pitch the product, onboard a new collaborator, or diagnose a stuck user flow without re-reading the source.

> **Last refreshed:** 2026-06 (after the founder-anchored-invite + receipts pass — commit `5d0f55d`).
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
| `organization_groups` | The hierarchy (faculty/dept/class) | `id`, `parent_group_id`, `kind`, **`founder_member_id`** (mig 082) |
| `organization_members` | A user's membership in an org | `id`, `organization_id`, `group_id`, `member_id` (text login), `password_hash`, `level` |
| `member_admins` | Admin/exec rows with verification layers | `member_id`, `verification_layer`, `scope_level`, `group_id`, perm flags |
| `accounts` | Cross-org identity link (mig 076) | `id`, `email`, joined via `account_id` on members |
| `claim_requests` | Active claims awaiting verification | `claimant_user_id`, `position_title`, `votes_required`, `votes_received`, `current_layer` |
| `claim_votes` | Vote records | `claim_id`, `voter_member_id`, `decision` |
| `organization_invites` | Active join codes | `invite_code`, `created_by` (admin id), **`created_by_member_id`** (mig 082), `group_id`, `max_uses`, `times_used` |
| `payment_types` | Dues / events templates | `title`, `amount`, `is_mandatory`, `deadline`, `category`, `group_id` |
| `payments` | Individual payment records | `member_id`, `payment_type_id`, `status`, `paystack_reference`, `total_charged_kobo`, `platform_fee_kobo` |
| `event_ticket_tiers` | Event tier pricing | `payment_type_id`, `name`, `price`, `quantity`, `sold_count` |

### Important RPCs (SECURITY DEFINER)

| RPC | Purpose | Migration |
|---|---|---|
| `signup_member_via_invite` | Anon-callable signup using an invite code | 078 |
| `bootstrap_department_with_class` | Create dept + class + first member atomically | 080/081 |
| `bootstrap_class_with_rep` | Same, but starting from an existing dept | 080/081 |
| `create_member_join_invite` | Founder bootstrap share-link generator | 082-087 |
| `get_class_invite_status` | "Can the caller share, and is admin in scope?" | 082-088 |
| `_class_has_admin_other_than` | Helper: any admin **other than** this member? | 084 |
| `_group_ancestor_ids` | Walks the group hierarchy upward | 084 |
| `submit_claim_v2` | Submit a claim_request | (claim system mig 060-071) |

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

## 12. Roadmap (pending in todo)

- Sub-account wiring + creation audit (when an org's first due is created, did Paystack get configured?).
- Payout flow audit.
- First-due flow: prompt to set up payout **before** creating the first due so funds never land in an unconfigured sub-account.
- Class activity feed (recent joins, vote events) for transparency.
- Remove the orphan `OrgDashboardPage.tsx` (replaced by `StudentDashboardPage`).

---

**One-paragraph elevator pitch (memorize this):**

> Payvexo is the easiest way for a Nigerian student class, a church, or a club to manage dues, events, and payments together — digitally, with full receipts, and with safety baked in so the wrong person can never lift money. A class rep stands up their class in five minutes, invites their people through a code, gets confirmed by their members, and unlocks payouts. No spreadsheets, no missing cash, no "who paid what."
