// App-wide constants

export const APP_NAME = 'Payvexo'
export const APP_VERSION = '2.0.0'
export const APP_TAGLINE = 'Smart Payment & Dues Management'
export const APP_DESCRIPTION = 'The all-in-one platform for collecting dues, tracking payments, and managing finances.'

// Organization types supported
export const ORGANIZATION_TYPES = {
  UNIVERSITY: 'university',
  CHURCH: 'church',
  CLUB: 'club',
  ASSOCIATION: 'association',
  COOPERATIVE: 'cooperative',
  NGO: 'ngo',
  SCHOOL: 'school',
  OTHER: 'other',
} as const

export type OrganizationType = typeof ORGANIZATION_TYPES[keyof typeof ORGANIZATION_TYPES]

/**
 * Per-org-type HIERARCHY (the #27 flexible-depth model).
 *
 * Every org uses the SAME canonical DB kinds — 'faculty' | 'department'
 * | 'class' — so all tier-autonomy + scoping + finance logic keeps
 * working unchanged. What varies per org type is (a) how MANY tiers
 * they use (depth) and (b) the LABELS shown to users. The LAST tier is
 * always the leaf where members live (canonical kind 'class').
 *
 * A church is therefore Ministry ('department') → Section ('class') —
 * 2 levels, never a "faculty". A co-op is a single Unit ('class').
 */
export interface OrgTier {
  /** Canonical DB kind — drives all logic. Never shown to users. */
  kind: 'faculty' | 'department' | 'class'
  label: string
  label_plural: string
}

export const ORG_TIER_CONFIG: Record<OrganizationType, OrgTier[]> = {
  university: [
    { kind: 'faculty',    label: 'Faculty',    label_plural: 'Faculties' },
    { kind: 'department', label: 'Department', label_plural: 'Departments' },
    { kind: 'class',      label: 'Class',      label_plural: 'Classes' },
  ],
  school: [
    { kind: 'faculty',    label: 'Section',    label_plural: 'Sections' },
    { kind: 'department', label: 'Department', label_plural: 'Departments' },
    { kind: 'class',      label: 'Class',      label_plural: 'Classes' },
  ],
  church: [
    { kind: 'department', label: 'Ministry', label_plural: 'Ministries' },
    { kind: 'class',      label: 'Section',  label_plural: 'Sections' },
  ],
  club: [
    { kind: 'department', label: 'Chapter', label_plural: 'Chapters' },
    { kind: 'class',      label: 'Group',   label_plural: 'Groups' },
  ],
  association: [
    { kind: 'department', label: 'Branch', label_plural: 'Branches' },
    { kind: 'class',      label: 'Unit',   label_plural: 'Units' },
  ],
  cooperative: [
    { kind: 'class', label: 'Unit', label_plural: 'Units' },
  ],
  ngo: [
    { kind: 'department', label: 'Program', label_plural: 'Programs' },
    { kind: 'class',      label: 'Team',    label_plural: 'Teams' },
  ],
  other: [
    { kind: 'department', label: 'Group',    label_plural: 'Groups' },
    { kind: 'class',      label: 'Subgroup', label_plural: 'Subgroups' },
  ],
}

/** The ordered tier list (top → leaf) for an org type. */
export function getOrgTiers(type: OrganizationType | string | null | undefined): OrgTier[] {
  return ORG_TIER_CONFIG[(type as OrganizationType)] ?? ORG_TIER_CONFIG.association
}

/** Human label for a canonical kind under a given org type. */
export function getTierLabel(
  type: OrganizationType | string | null | undefined,
  kind: string,
  plural = false,
): string {
  const tier = getOrgTiers(type).find((t) => t.kind === kind)
  if (tier) return plural ? tier.label_plural : tier.label
  const cap = kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : 'Group'
  return plural ? `${cap}s` : cap
}

/** Does this org type use the given canonical tier? (church has no faculty) */
export function orgUsesTier(
  type: OrganizationType | string | null | undefined,
  kind: 'faculty' | 'department' | 'class',
): boolean {
  return getOrgTiers(type).some((t) => t.kind === kind)
}

/**
 * Academic org types use the faculty/department/level hierarchy.
 * Non-academic orgs (church, club, association, cooperative, ngo, other)
 * skip these fields in onboarding and signup.
 */
export function isAcademicOrgType(type: OrganizationType | string | null | undefined): boolean {
  return type === 'university' || type === 'school';
}

/**
 * Org-type-aware label for the "level / position" field on signup forms.
 * Academic orgs see "Level / Year"; everything else sees "Position / Role".
 */
export function levelFieldLabel(type: OrganizationType | string | null | undefined): {
  label: string;
  placeholder: string;
  hint: string;
} {
  if (isAcademicOrgType(type)) {
    return { label: 'Level / Year', placeholder: '200L', hint: 'optional, e.g. 200L, SS2' };
  }
  return { label: 'Position / Role', placeholder: 'Member', hint: 'optional, e.g. Member, Worker' };
}

/**
 * Exec-role dropdown options for the claim-submission form, scoped by
 * org type. The `value` is what gets stored in claim_requests.claimed_role
 * (a free string in the DB — permissions don't key off it today), and
 * `label` is the auto-fill text for the `position_title` field. `custom`
 * is always present last so users can type their own title.
 */
export interface ClaimRoleOption {
  value: string;
  label: string;
}

export function getClaimRoleOptions(type: OrganizationType | string | null | undefined): ClaimRoleOption[] {
  const ACADEMIC: ClaimRoleOption[] = [
    { value: 'class_rep',           label: 'Class Rep' },
    { value: 'treasurer',           label: 'Treasurer' },
    { value: 'financial_secretary', label: 'Financial Secretary' },
    { value: 'secretary',           label: 'Secretary' },
    { value: 'president',           label: 'President' },
    { value: 'vice_president',      label: 'Vice President' },
    { value: 'hod',                 label: 'HOD' },
    { value: 'director',            label: 'Director' },
    { value: 'pro',                 label: 'PRO' },
  ];

  const CHURCH: ClaimRoleOption[] = [
    { value: 'pastor',              label: 'Pastor' },
    { value: 'assistant_pastor',    label: 'Assistant Pastor' },
    { value: 'treasurer',           label: 'Treasurer' },
    { value: 'financial_secretary', label: 'Financial Secretary' },
    { value: 'secretary',           label: 'Secretary' },
    { value: 'welfare_officer',     label: 'Welfare Officer' },
    { value: 'choir_director',      label: 'Choir Director' },
    { value: 'usher_head',          label: 'Head Usher' },
    { value: 'worker',              label: 'Worker' },
  ];

  const CLUB: ClaimRoleOption[] = [
    { value: 'president',           label: 'President' },
    { value: 'vice_president',      label: 'Vice President' },
    { value: 'treasurer',           label: 'Treasurer' },
    { value: 'financial_secretary', label: 'Financial Secretary' },
    { value: 'secretary',           label: 'Secretary' },
    { value: 'pro',                 label: 'PRO' },
    { value: 'welfare_officer',     label: 'Welfare Officer' },
  ];

  const ASSOCIATION: ClaimRoleOption[] = [
    { value: 'president',           label: 'President' },
    { value: 'vice_president',      label: 'Vice President' },
    { value: 'secretary',           label: 'Secretary' },
    { value: 'treasurer',           label: 'Treasurer' },
    { value: 'pro',                 label: 'PRO' },
    { value: 'welfare_officer',     label: 'Welfare Officer' },
  ];

  const COOPERATIVE: ClaimRoleOption[] = [
    { value: 'chairman',            label: 'Chairman' },
    { value: 'vice_chairman',       label: 'Vice Chairman' },
    { value: 'treasurer',           label: 'Treasurer' },
    { value: 'secretary',           label: 'Secretary' },
    { value: 'auditor',             label: 'Auditor' },
  ];

  const NGO: ClaimRoleOption[] = [
    { value: 'director',            label: 'Director' },
    { value: 'deputy_director',     label: 'Deputy Director' },
    { value: 'treasurer',           label: 'Treasurer' },
    { value: 'secretary',           label: 'Secretary' },
    { value: 'program_manager',     label: 'Program Manager' },
  ];

  let list: ClaimRoleOption[];
  switch (type) {
    case 'university':
    case 'school':
      list = ACADEMIC;
      break;
    case 'church':
      list = CHURCH;
      break;
    case 'club':
      list = CLUB;
      break;
    case 'association':
      list = ASSOCIATION;
      break;
    case 'cooperative':
      list = COOPERATIVE;
      break;
    case 'ngo':
      list = NGO;
      break;
    default:
      // Unknown / 'other' — give the broad superset so users aren't blocked
      list = [
        { value: 'president',           label: 'President' },
        { value: 'vice_president',      label: 'Vice President' },
        { value: 'treasurer',           label: 'Treasurer' },
        { value: 'financial_secretary', label: 'Financial Secretary' },
        { value: 'secretary',           label: 'Secretary' },
      ];
  }
  return [...list, { value: 'custom', label: 'Other / custom' }];
}

/**
 * Tier the claim is for. The DB only sees three scope_levels
 * ('org' | 'unit' | 'group'), but the UI distinguishes Department vs
 * Faculty (both ride 'unit'). We keep the four tiers here so the role
 * dropdown can filter out roles that make no sense for the picked
 * tier — e.g. "Class Rep" disappears for dept/faculty/org claims,
 * "HOD" disappears for faculty/org. Without this, an academic org's
 * dept-tier picker still surfaced "Class Rep" and confused users.
 */
export type ClaimTier = 'class' | 'dept' | 'faculty' | 'org';

/**
 * Roles that only make sense at specific tiers. Anything not in this
 * map is allowed at every tier (the per-org-type list above is the
 * outer filter; this is the inner tier filter).
 */
const TIER_ROLE_RESTRICTIONS: Record<string, ClaimTier[]> = {
  class_rep:    ['class'],
  hod:          ['dept'],
  director:     ['dept', 'faculty', 'org'],
  pastor:       ['dept', 'faculty', 'org'],
  assistant_pastor: ['dept', 'faculty'],
  choir_director:   ['dept', 'faculty'],
  usher_head:       ['class', 'dept'],
};

/**
 * Tier-aware role list. Pulls the per-org-type set and strips any
 * roles whose restricted-tier set doesn't include the picked tier.
 * 'custom' always rides through so the user can type a free-text
 * role at any tier.
 */
export function getRolesForTier(
  type: OrganizationType | string | null | undefined,
  tier: ClaimTier,
): ClaimRoleOption[] {
  if (tier === 'org') return getOrgScopeRoleOptions(type);
  const base = getClaimRoleOptions(type);
  return base.filter((opt) => {
    if (opt.value === 'custom') return true;
    const allowedTiers = TIER_ROLE_RESTRICTIONS[opt.value];
    if (!allowedTiers) return true; // unrestricted role
    return allowedTiers.includes(tier);
  });
}

/**
 * Org-scope roles are restricted to the highest executive role.
 * This keeps org-wide voting reserved for the SUG/lead exec level.
 */
export function getOrgScopeRoleOptions(type: OrganizationType | string | null | undefined): ClaimRoleOption[] {
  switch (type) {
    case 'university':
    case 'school':
      return [{ value: 'president', label: 'SUG President' }];
    case 'church':
      return [{ value: 'pastor', label: 'Lead Pastor' }];
    case 'cooperative':
      return [{ value: 'chairman', label: 'Chairman' }];
    case 'ngo':
      return [{ value: 'director', label: 'Director' }];
    case 'club':
    case 'association':
      return [{ value: 'president', label: 'President' }];
    default:
      return [{ value: 'president', label: 'President' }];
  }
}

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