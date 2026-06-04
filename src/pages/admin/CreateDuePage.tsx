/**
 * CreateDuePage — admin creates a new due (or event ticket).
 *
 * Route: /:orgSlug/admin/create-payment
 *
 * Layout:
 *   ┌─────────────────────────┬───────────────────────┐
 *   │  FORM (3 sections)      │  LIVE PREVIEW         │
 *   │  ─ Basics               │   how it looks on     │
 *   │  ─ Targeting            │   the student's       │
 *   │  ─ Payment + notify     │   dashboard           │
 *   └─────────────────────────┴───────────────────────┘
 *
 * Three notable behaviours:
 *
 *   1. When admin picks category='event', the Event section reveals
 *      inline (date, venue, cover image, ticket tiers). One form
 *      handles dues AND events — same payment_types table per
 *      migration 031.
 *
 *   2. Payment-method toggles (Paystack / Manual) decide what
 *      students see at checkout. Defaults to both on.
 *
 *   3. The preview pane updates as you type, so admins can see
 *      exactly what students will see before publishing.
 *
 * On submit: organizationService.createPaymentType() inserts the
 * row; in the next migration we'll fan out notifications.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CreditCard,
  DollarSign,
  Eye,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Megaphone,
  Sparkles,
  Tag,
  Ticket,
  Upload,
  Users,
} from 'lucide-react';
import { getOrgScope } from '@/utils/orgScope';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { useAuth } from '@/hooks/useAppAuth';
import { useAppNav } from '@/hooks/useAppNav';
import { useActiveRole } from '@/hooks/useActiveRole';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useToast } from '@/hooks/useToast';
import { organizationService, type DueCreationContext } from '@/services/organizationService';
import { STORAGE_BUCKETS, supabase, getStoredAccessToken } from '@/config/supabase';
import ProfessionalDropdown from '@/components/ui/ProfessionalDropdown';
import ProfessionalDateTimePicker from '@/components/ui/ProfessionalDateTimePicker';

// ────────────────────────────────────────────────────────────────────────────
// Tokens — theme-aware. The previous module-level constant was dark
// only, so the form painted as ember-on-white in light mode.
// ────────────────────────────────────────────────────────────────────────────
type CreateDueTokens = {
  bg: string; panel: string; panelHov: string; border: string; borderHov: string;
  text: string; textSec: string; textTer: string; textQuat: string;
  primary: string; primaryHi: string; mint: string; blue: string; purple: string;
  pink: string; amber: string; danger: string;
};
function buildCreateDueTokens(theme: 'light' | 'dark'): CreateDueTokens {
  const dt = getDashboardTokens(theme);
  const isLight = theme === 'light';
  return {
    bg:        dt.bg,
    panel:     dt.card,
    panelHov:  dt.cardHover,
    border:    dt.cardBorder,
    borderHov: dt.primaryRing,
    text:      dt.text,
    textSec:   dt.textSec,
    textTer:   dt.textTer,
    textQuat:  isLight ? 'rgba(15,7,3,0.22)' : 'rgba(255,255,255,0.22)',
    primary:   dt.primary,
    primaryHi: dt.primaryHi,
    mint:      dt.mint,
    blue:      dt.blue,
    purple:    dt.purple,
    pink:      '#ec4899',
    amber:     dt.amber,
    danger:    dt.danger,
  };
}
const TokensContext = createContext<CreateDueTokens | null>(null);
function useTokens(): CreateDueTokens {
  const tk = useContext(TokensContext);
  if (!tk) throw new Error('useTokens called outside TokensContext.Provider');
  return tk;
}
// Static brand-color palette for module-scope refs (e.g. CATEGORIES).
// These specific colors don't change per theme — the brand orange is
// the same hex in light + dark. Component code uses `useTokens()`.
const BRAND = {
  primary: '#FF6803', mint: '#30FFAC', blue: '#5B9BFF',
  purple: '#8b5cf6', pink: '#ec4899', amber: '#F59E0B', danger: '#ef4444',
};

// ────────────────────────────────────────────────────────────────────────────
// Static config
// ────────────────────────────────────────────────────────────────────────────
// CATEGORIES/COLOR_PALETTE/DEFAULT_FORM use the static BRAND palette
// at module scope. The brand colors are the same hex in light + dark
// (orange is orange, mint is mint) so theme switching doesn't need
// to rebuild this list. Component-level chrome still derives from
// the theme-aware `tk` via useTokens().
const CATEGORIES = [
  { value: 'dues', label: 'Dues', icon: '🎓', color: BRAND.primary },
  { value: 'fees', label: 'Fees', icon: '📚', color: BRAND.blue },
  { value: 'levy', label: 'Levy', icon: '📋', color: BRAND.amber },
  { value: 'event', label: 'Event ticket', icon: '🎟️', color: BRAND.purple },
  { value: 'contribution', label: 'Contribution', icon: '🤝', color: BRAND.mint },
  { value: 'welfare', label: 'Welfare', icon: '❤️', color: BRAND.pink },
  { value: 'project', label: 'Project', icon: '📘', color: BRAND.blue },
  { value: 'donation', label: 'Donation', icon: '💝', color: BRAND.pink },
  { value: 'subscription', label: 'Subscription', icon: '🔄', color: BRAND.amber },
  { value: 'savings', label: 'Savings', icon: '💰', color: BRAND.mint },
  { value: 'custom', label: 'Custom', icon: '📦', color: BRAND.primary },
] as const;

const ICONS = ['🎓', '📚', '🎉', '📘', '❤️', '📦', '💰', '🏆', '⚽', '🎨', '🎟️', '🎵', '🍕'];
const COLOR_PALETTE = [
  BRAND.primary, BRAND.blue, BRAND.mint, BRAND.amber,
  BRAND.danger, BRAND.purple, BRAND.pink, '#06B6D4',
];

const NIGERIAN_BANKS = [
  'Access Bank', 'Zenith Bank', 'GTBank', 'First Bank',
  'UBA', 'Fidelity Bank', 'Union Bank', 'Sterling Bank',
  'Stanbic IBTC', 'Ecobank', 'FCMB', 'Wema Bank',
  'Polaris Bank', 'Keystone Bank', 'Heritage Bank',
  'Opay', 'Palmpay', 'MoniePoint',
];

const AMOUNT_CHIPS = [500, 1000, 2000, 5000, 10000];

const LEVEL_OPTIONS = ['100', '200', '300', '400', '500', '600', '700'];
const RECOMMENDED_COVER_SIZE = { width: 1600, height: 900 };

// ────────────────────────────────────────────────────────────────────────────
// Form state
// ────────────────────────────────────────────────────────────────────────────
interface FormState {
  // Basics
  title: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  amount: string;

  // Schedule
  deadline: string;
  late_fee_per_day: string;

  // Behavior
  is_mandatory: boolean;
  allow_partial: boolean;
  minimum_partial_amount: string;
  is_public: boolean;

  // Targeting
  target_levels: string[];     // [] = all
  target_sections: string[];   // [] = all

  // Payment method
  accepts_paystack: boolean;
  accepts_manual: boolean;
  bank_name: string;
  account_name: string;
  account_number: string;

  // Event extras (only used when category='event')
  event_date: string;
  event_venue: string;
  event_cover_url: string;
  event_max_attendees: string;
  tiers: TierInput[];
}

interface TierInput {
  name: string;
  price: string;
  quantity: string; // '' = unlimited
}

const EMPTY: FormState = {
  title: '', description: '', category: 'dues', icon: '🎓', color: BRAND.primary,
  amount: '',
  deadline: '', late_fee_per_day: '',
  is_mandatory: true, allow_partial: false, minimum_partial_amount: '', is_public: false,
  target_levels: [], target_sections: [],
  accepts_paystack: true, accepts_manual: true,
  bank_name: '', account_name: '', account_number: '',
  event_date: '', event_venue: '', event_cover_url: '', event_max_attendees: '',
  tiers: [{ name: 'Regular', price: '', quantity: '' }],
};

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

export default function CreateDuePage() {
  const { user, hasPermission } = useAuth();
  const { user: mtUser, organization } = useMultiTenantAuth();
  const { go } = useAppNav();
  const navigate = useNavigate();
  const toast = useToast();
  // Theme-aware tokens. Build once per render from the resolved
  // theme so the form paints correctly in both modes (this used to
  // be a module-level dark-only constant). Provided via
  // TokensContext so the seven helper components in this file can
  // read it without prop drilling.
  const { theme } = useTheme();
  const tk = useMemo(() => buildCreateDueTokens(theme), [theme]);

  // Edit mode: when the route is /admin/dues/:id/edit, useParams gives
  // us the payment_type id. We fetch the existing row, map it to
  // FormState on mount, and the submit handler branches to UPDATE
  // instead of CREATE. Everything else (validation, panels, payout
  // checks) reuses the create-mode UI so a publisher gets the same
  // surface in both flows — the user explicitly asked for this so
  // editing doesn't feel like a different page.
  const { id: editId } = useParams<{ id?: string }>();
  const isEditMode = Boolean(editId);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Payout-gate state — when the RPC returns code='no_payout', we hold
  // the offending group's id + scope so the modal can deep-link to
  // the right tier's payout setup. Null = no gate active.
  const [payoutGate, setPayoutGate] = useState<{
    groupId: string | null;
    scope: string;
    detail: string;
  } | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverFileName, setCoverFileName] = useState<string | null>(null);
  const [coverWarning, setCoverWarning] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Scope-aware context loaded from mig 035 RPC
  const [ctx, setCtx] = useState<DueCreationContext | null>(null);
  const [ctxLoading, setCtxLoading] = useState(true);

  // Target scope state — derived from caller scope + their choice
  const [targetScope, setTargetScope] = useState<'org' | 'faculty' | 'group'>('group');
  const [targetGroupId, setTargetGroupId] = useState<string | null>(null);

  // Permission guard
  useEffect(() => {
    if (user && !hasPermission?.('can_create_payments')) {
      toast?.error?.('You do not have permission to create dues.');
      navigate(-1);
    }
  }, [user, hasPermission, navigate, toast]);

  // Edit-mode prefill. When ?id is present, fetch the existing
  // payment_type row and map it back into the FormState so every
  // field lands at the value the publisher last saved. Event tiers
  // are loaded separately because they live in event_ticket_tiers,
  // a sibling table.
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: pt, error: ptErr } = await supabase
          .from('payment_types')
          .select('*')
          .eq('id', editId)
          .maybeSingle();
        if (ptErr) throw ptErr;
        if (!pt) {
          setError('That due no longer exists. It may have been deleted.');
          return;
        }

        // Tiers (events only) — sibling table. Skip the query when
        // category is not 'event' so we don't waste a round-trip.
        let tiers: TierInput[] = [{ name: 'Regular', price: '', quantity: '' }];
        if ((pt as { category?: string }).category === 'event') {
          const { data: tierRows } = await supabase
            .from('event_ticket_tiers')
            .select('name, price, quantity, sort_order')
            .eq('payment_type_id', editId)
            .order('sort_order', { ascending: true });
          if (tierRows && tierRows.length > 0) {
            tiers = (tierRows as Array<{
              name: string; price: number; quantity: number | null;
            }>).map((t) => ({
              name: t.name,
              price: String(t.price ?? ''),
              quantity: t.quantity == null ? '' : String(t.quantity),
            }));
          }
        }
        if (cancelled) return;
        const row = pt as Record<string, unknown>;
        // The form's deadline / event_date inputs expect 'YYYY-MM-DD'
        // (or empty). Strip the time/zone off so the date picker
        // doesn't read it as invalid.
        const fmtDate = (v: unknown) => {
          if (typeof v !== 'string' || !v) return '';
          // ISO with time → date only
          return v.length > 10 ? v.slice(0, 10) : v;
        };
        setForm({
          title: (row.title as string) || '',
          description: (row.description as string) || '',
          category: (row.category as string) || 'dues',
          icon: (row.icon as string) || '🎓',
          color: (row.color as string) || tk.primary,
          amount: row.amount == null ? '' : String(row.amount),
          deadline: fmtDate(row.deadline),
          late_fee_per_day: row.late_fee_per_day == null ? '' : String(row.late_fee_per_day),
          is_mandatory: Boolean(row.is_mandatory ?? true),
          allow_partial: Boolean(row.allow_partial ?? false),
          minimum_partial_amount: row.minimum_partial_amount == null ? '' : String(row.minimum_partial_amount),
          is_public: Boolean(row.is_public ?? false),
          target_levels: Array.isArray(row.target_levels) ? (row.target_levels as string[]) : [],
          target_sections: Array.isArray(row.target_sections) ? (row.target_sections as string[]) : [],
          accepts_paystack: Boolean(row.accepts_paystack ?? true),
          accepts_manual: Boolean(row.accepts_manual ?? true),
          bank_name: (row.bank_name as string) || '',
          account_name: (row.account_name as string) || '',
          account_number: (row.account_number as string) || '',
          event_date: fmtDate(row.event_date),
          event_venue: (row.event_venue as string) || '',
          event_cover_url: (row.event_cover_url as string) || '',
          event_max_attendees: row.event_max_attendees == null ? '' : String(row.event_max_attendees),
          tiers,
        });
        // Also lock the targeting: edit doesn't move a due to a
        // different scope. We populate targetScope + targetGroupId
        // from the row so the read-only targeting panel still shows
        // the right context.
        const grp = row.group_id as string | null;
        if (!grp) setTargetScope('org');
        else { setTargetScope('group'); setTargetGroupId(grp); }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load that due for editing.');
      }
    })();
    return () => { cancelled = true; };
  }, [editId]);

  // Read query params from the dept-/faculty-exec targeting cards so
  // we can prefill the form. Accepted keys:
  //   scope     'org' | 'faculty' | 'group'
  //   groupId   the target group id (faculty / dept / class)
  //   byLevel   '1' → flag so we know to scroll the level picker
  //             into view (the picker is already in the form below)
  // We also accept `deptId` / `facultyId` from the cards even though
  // we don't use them to filter yet — they're harmless and keep the
  // URL self-describing for future polish.
  const [searchParams] = useSearchParams();
  const qpScope = searchParams.get('scope');
  const qpGroupId = searchParams.get('groupId');
  const qpByLevel = searchParams.get('byLevel') === '1';

  // When the dept/faculty exec arrives via the "By level" targeting
  // card, we scroll the level picker into view + pulse it briefly so
  // they know exactly where to make the choice. The ref attaches
  // below, the effect fires once after the form mounts.
  const levelPickerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!qpByLevel) return;
    const t = setTimeout(() => {
      const el = levelPickerRef.current;
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.02)' }, { transform: 'scale(1)' }],
        { duration: 600, easing: 'ease-in-out', iterations: 2 },
      );
    }, 400);
    return () => clearTimeout(t);
  }, [qpByLevel, ctxLoading]);

  // Load context (caller's scope, org state, target list)
  useEffect(() => {
    const scope = getOrgScope();
    if (!scope?.memberId) {
      setCtxLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const data = await organizationService.getDueCreationContext(scope.memberId);
      if (cancelled) return;
      setCtx(data);

      // Override order: URL params (from dept/faculty targeting cards)
      // win, then we fall back to seeded defaults from the caller's
      // own scope. This way an exec who tapped "All classes in dept"
      // lands on the form already configured for that dept.
      const validScopes = ['org', 'faculty', 'group'] as const;
      const urlScope = validScopes.find((s) => s === qpScope);

      if (urlScope) {
        setTargetScope(urlScope);
        if (urlScope === 'org') {
          setTargetGroupId(null);
        } else if (qpGroupId) {
          setTargetGroupId(qpGroupId);
        }
      } else if (!isEditMode && data.ok && data.caller?.scope) {
        // Default the form to the *active* role's scope, not the
        // max scope across all roles. The active-role gating lives
        // in effectiveScope above; this just makes the auto-fill
        // match (so a class rep doesn't see "faculty-tier" pre-selected
        // just because they happen to also hold a dept role).
        const activeScope = activeRole?.kind === 'exec' ? activeRole.scopeLevel : null;
        const cscope = activeScope ?? data.caller.scope;
        const fallbackGroup = activeRole?.kind === 'exec'
          ? activeRole.groupId ?? data.caller.group_id
          : data.caller.group_id;
        if (cscope === 'group') {
          setTargetScope('group');
          setTargetGroupId(fallbackGroup);
        } else if (cscope === 'unit') {
          setTargetScope('faculty');
          setTargetGroupId(fallbackGroup);
        } else {
          setTargetScope('org');
          setTargetGroupId(null);
        }
      }
      setCtxLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qpScope, qpGroupId]);

  // Derived: what kinds of targets are available given caller scope
  const targetGroups = ctx?.targets ?? [];
  // "Whole unit" targets: a faculty, college or department — a due here cascades
  // to every class below it. Departments live here (not in the leaf list) so a
  // department president can bill all their classes in one publish.
  const facultyTargets = useMemo(
    () => targetGroups.filter((g) =>
      g.kind === 'faculty' || g.kind === 'college' || g.kind === 'department' || g.kind === 'unit'
    ),
    [targetGroups]
  );
  const leafTargets = useMemo(
    () => targetGroups.filter((g) =>
      g.kind === 'class' || g.kind === 'association' || g.kind === 'level'
    ),
    [targetGroups]
  );

  // The scope picker has TWO inputs:
  //   • callerScope — the MAX scope the user holds anywhere (from
  //     getDueCreationContext). For a dept-pres-who-is-also-a-class-
  //     rep this is 'unit' (the higher of the two roles).
  //   • activeRole.scopeLevel — the role the user is CURRENTLY
  //     operating as via the role switcher. If they switched to
  //     "Class Rep of ECE 300L", scopeLevel is 'group'.
  //
  // Previously the page used only callerScope, so a class rep who
  // ALSO holds a dept role saw "Faculty / Dept" + "Whole org"
  // checkboxes while on the class-rep dashboard. Confusing and
  // wrong — exec capabilities should be gated by the *active* role,
  // not the union of all roles. We now derive the effective scope:
  //   active exec role → use its scopeLevel
  //   no active exec role (member view) → fall back to callerScope
  //                                       so the page still works
  //                                       for non-role-switcher orgs.
  const { activeRole } = useActiveRole({
    orgId: organization?.id,
    memberId: mtUser?.id,
  });
  const effectiveScope: 'org' | 'unit' | 'group' | null | undefined =
    activeRole?.kind === 'exec' ? activeRole.scopeLevel : ctx?.caller?.scope;
  const canChooseOrgScope = effectiveScope === 'org';
  const canChooseFacultyScope = effectiveScope === 'org' || effectiveScope === 'unit';

  useEffect(() => {
    if (isEditMode) return;
    if (form.category !== 'event') return;
    setForm((f) => {
      if (
        !f.is_mandatory &&
        !f.allow_partial &&
        f.minimum_partial_amount === '' &&
        !f.accepts_manual &&
        f.late_fee_per_day === ''
      ) {
        return f;
      }
      return {
        ...f,
        is_mandatory: false,
        allow_partial: false,
        minimum_partial_amount: '',
        accepts_manual: false,
        late_fee_per_day: '',
      };
    });
  }, [form.category]); // ← remove isEditMode, keep only form.category

  // ── Smart defaults: category sets default icon + color ──
  const setCategory = (value: string) => {
    const meta = CATEGORIES.find((c) => c.value === value);
    setForm((f) => ({
      ...f,
      category: value,
      icon: meta?.icon ?? f.icon,
      color: meta?.color ?? f.color,
      is_mandatory: value === 'event' ? false : f.is_mandatory,
      allow_partial: value === 'event' ? false : f.allow_partial,
      minimum_partial_amount: value === 'event' ? '' : f.minimum_partial_amount,
      accepts_manual: value === 'event' ? false : f.accepts_manual,
      late_fee_per_day: value === 'event' ? '' : f.late_fee_per_day,
    }));
  };

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));


  const getImageDimensions = (file: File): Promise<{ width: number; height: number }> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);

      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to inspect image dimensions.'));
      };

      image.src = objectUrl;
    });

  const handleCoverUpload = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file for the event cover.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Cover image must be smaller than 5MB.');
      return;
    }

    const scope = getOrgScope();
    if (!scope?.memberId) {
      setError('No organization context found. Please log in again.');
      return;
    }

    try {
      setCoverUploading(true);
      setError(null);
      setCoverWarning(null);

      try {
        const { width, height } = await getImageDimensions(file);
        if (width < RECOMMENDED_COVER_SIZE.width || height < RECOMMENDED_COVER_SIZE.height) {
          setCoverWarning(
            `Best results use at least ${RECOMMENDED_COVER_SIZE.width}×${RECOMMENDED_COVER_SIZE.height}px. Current image: ${width}×${height}px.`,
          );
        }
      } catch {
        setCoverWarning('Could not inspect the image size, but it will still upload.');
      }

      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `event_${scope.memberId}_${Date.now()}.${fileExt}`;
      const filePath = `event-covers/${fileName}`;

      try {
        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKETS.EVENT_COVERS)
          .upload(filePath, file, { cacheControl: '3600', upsert: true });

        if (uploadError) throw new Error(uploadError.message);

        const { data: urlData } = supabase.storage
          .from(STORAGE_BUCKETS.EVENT_COVERS)
          .getPublicUrl(filePath);

        setField('event_cover_url', urlData.publicUrl);
        setCoverFileName(file.name);
      } catch (uploadErr) {
        setError('Image upload failed. Please try again or paste a URL instead.');
        setCoverFileName(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload cover image.';
      setError(message);
    } finally {
      setCoverUploading(false);
    }
  };

  const isEvent = form.category === 'event';

  // ── Ticket tier handlers (events) ──
  const addTier = () =>
    setForm((f) => ({ ...f, tiers: [...f.tiers, { name: '', price: '', quantity: '' }] }));
  const removeTier = (i: number) =>
    setForm((f) => ({ ...f, tiers: f.tiers.filter((_, idx) => idx !== i) }));
  const setTier = (i: number, k: keyof TierInput, v: string) =>
    setForm((f) => ({ ...f, tiers: f.tiers.map((t, idx) => (idx === i ? { ...t, [k]: v } : t)) }));

  const validTiers = useMemo(
    () => form.tiers.filter((t) => t.name.trim().length > 0 && t.price !== '' && Number(t.price) >= 0),
    [form.tiers],
  );

  // ── Validation ──
  // Tier rows the user *touched* but left incomplete (a name OR a price
  // but not both). validTiers silently drops these, which caused
  // events that the publisher created with "Regular" + "VIP" to land
  // in the DB with only one tier row when one of the two had a blank
  // price or blank name. Surface it as a hard error so the user can
  // either complete the row or remove it.
  const incompleteTierLabels = useMemo(() => {
    return form.tiers
      .map((t, i) => {
        const hasName = t.name.trim().length > 0;
        const hasPrice = t.price !== '' && Number(t.price) >= 0;
        if (hasName && hasPrice) return null;
        if (!hasName && !hasPrice) return null; // genuinely empty extra row — ignore
        return hasName ? `"${t.name.trim()}"` : `row ${i + 1}`;
      })
      .filter((x): x is string => Boolean(x));
  }, [form.tiers]);

  const validation = useMemo(() => {
    const errors: string[] = [];
    if (form.title.trim().length < 2) errors.push('Title is too short.');

    if (isEvent) {
      if (!form.event_date) errors.push('Events need a date.');
      if (!form.event_venue) errors.push('Events need a venue.');
      if (validTiers.length === 0) errors.push('Add at least one ticket type with a price.');
      if (incompleteTierLabels.length > 0) {
        errors.push(
          `${incompleteTierLabels.length === 1 ? 'Ticket type' : 'Ticket types'} ${incompleteTierLabels.join(', ')} ${incompleteTierLabels.length === 1 ? 'needs' : 'need'} both a name and a price — fill them in or remove the row.`,
        );
      }
    } else {
      if (!form.amount || Number(form.amount) <= 0) errors.push('Amount must be greater than zero.');
      if (form.accepts_manual && (!form.bank_name || !form.account_number)) {
        errors.push('Manual payments need bank name and account number.');
      }
      if (!form.accepts_paystack && !form.accepts_manual) {
        errors.push('Enable at least one payment method.');
      }
      if (form.allow_partial && Number(form.minimum_partial_amount || 0) <= 0) {
        errors.push('Set the minimum partial amount.');
      }
    }
    return errors;
  }, [form, isEvent, validTiers, incompleteTierLabels]);

  const targetingValid =
    targetScope === 'org' ||
    (targetScope === 'faculty' && Boolean(targetGroupId)) ||
    (targetScope === 'group' && Boolean(targetGroupId));

  const canSubmit =
    validation.length === 0 &&
    targetingValid &&
    Boolean(ctx?.caller?.can_publish);

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);

    const scope = getOrgScope();
    if (!scope?.memberId) {
      setError('No organization context found. Please log in again.');
      setSubmitting(false);
      return;
    }

    // For events, the price comes from the cheapest ticket tier; events are
    // online-only (Paystack) so a ticket can be auto-issued, and never mandatory.
    // Defensive: Math.min(...[]) returns Infinity, which JSON.stringify
    // emits as `null`. A non-null amount column would reject the PATCH
    // with a confusing 400. Bail with a useful message instead.
    const eventBaseAmount = isEvent
      ? (validTiers.length > 0 ? Math.min(...validTiers.map((t) => Number(t.price))) : NaN)
      : Number(form.amount);
    if (!Number.isFinite(eventBaseAmount)) {
      setError(isEvent
        ? 'Add at least one valid ticket tier (name + price) before saving.'
        : 'Enter a valid amount before saving.');
      setSubmitting(false);
      return;
    }

    // ── EDIT BRANCH ───────────────────────────────────────────
    // Direct UPDATE on payment_types (matches the legacy modal's
    // submit shape). We don't move the due between scopes here —
    // re-targeting would re-fan notifications and is a separate
    // operation.
    //
    // Event ticket tiers live in a sibling table (event_ticket_tiers)
    // and used to be UNTOUCHED here — meaning if the publisher added
    // a "VIP" tier or changed prices on edit, the row update went
    // through but the new tier silently disappeared. That was the
    // "i tried update the ticket types and it didn't show" bug.
    // The fix: after updating the payment_types row, sync the
    // tier rows by position (UPDATE existing positions, INSERT
    // new ones, soft-deactivate excess rows so we don't break
    // event_tickets FK references).
    if (isEditMode && editId) {
      try {
        const scope = getOrgScope();
        const editRes = await fetch('/api/billing/verify-payment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getStoredAccessToken()}`,
          },
          body: JSON.stringify({
            action: 'update-payment-type',
            id: editId,
            callerId: scope?.memberId,
            payload: {
              title: form.title.trim(),
              description: form.description.trim() || null,
              category: form.category,
              amount: eventBaseAmount,
              icon: form.icon,
              color: form.color,
              deadline: form.deadline || null,
              late_fee_per_day: isEvent ? null : (form.late_fee_per_day || null),
              is_mandatory: isEvent ? false : form.is_mandatory,
              allow_partial: isEvent ? false : form.allow_partial,
              minimum_partial_amount: !isEvent && form.allow_partial ? Number(form.minimum_partial_amount || 0) : null,
              is_public: form.is_public,
              target_levels: form.target_levels.length ? form.target_levels : null,
              target_sections: form.target_sections.length ? form.target_sections : null,
              bank_name: !isEvent && form.accepts_manual ? form.bank_name.trim() : null,
              account_name: !isEvent && form.accepts_manual ? form.account_name.trim() : null,
              account_number: !isEvent && form.accepts_manual ? form.account_number.trim() : null,
              accepts_paystack: isEvent ? true : form.accepts_paystack,
              accepts_manual: isEvent ? false : form.accepts_manual,
              event_date: isEvent ? (form.event_date || null) : null,
              event_venue: isEvent ? (form.event_venue || null) : null,
              event_cover_url: isEvent ? (form.event_cover_url || null) : null,
              event_max_attendees: isEvent && form.event_max_attendees ? Number(form.event_max_attendees) : null,
              tiers: isEvent ? validTiers.map((t, i) => ({
                name: t.name.trim(),
                price: Number(t.price),
                quantity: t.quantity === '' ? null : Number(t.quantity),
                sort_order: i,
              })) : undefined,
            },
          }),
        });
        const data = await editRes.json();
        if (!editRes.ok) throw new Error(data.error || 'Could not save changes.');
        toast?.success?.(isEvent ? 'Event updated.' : 'Due updated.');
        go(`/admin/manage-dues?updated=${editId}`);
        return;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save changes.');
        setSubmitting(false);
        return;
      }
    }

    // Build the payload that maps to the create_due_with_scope_check payload JSON
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category,
      amount: eventBaseAmount,
      icon: form.icon,
      color: form.color,
      deadline: form.deadline || null,
      late_fee_per_day: isEvent ? null : (form.late_fee_per_day || null),
      is_mandatory: isEvent ? false : form.is_mandatory,
      allow_partial: isEvent ? false : form.allow_partial,
      minimum_partial_amount: !isEvent && form.allow_partial ? form.minimum_partial_amount : null,
      is_public: form.is_public,
      target_levels: form.target_levels.length ? form.target_levels : null,
      target_sections: form.target_sections.length ? form.target_sections : null,
      bank_name: !isEvent && form.accepts_manual ? form.bank_name : null,
      account_name: !isEvent && form.accepts_manual ? form.account_name : null,
      account_number: !isEvent && form.accepts_manual ? form.account_number : null,
      accepts_paystack: isEvent ? true : form.accepts_paystack,
      accepts_manual: isEvent ? false : form.accepts_manual,
    };

    if (isEvent) {
      payload.event_date = form.event_date || null;
      payload.event_venue = form.event_venue || null;
      payload.event_cover_url = form.event_cover_url || null;
      payload.event_max_attendees = form.event_max_attendees || null;
      // NOTE: tiers are NOT added to payload here — the RPC inserts
      // payment_types only. Tiers are inserted separately after the RPC
      // returns the new payment_type_id.
    }
    const res = await organizationService.createDueWithScope({
      callerMemberId: scope.memberId,
      targetScope,
      targetGroupId: targetScope === 'org' ? null : targetGroupId,
      payload,
    });

    // Insert ticket tiers for events after the payment type is created.
    //
    // RLS gotcha (mig 057): event_ticket_tiers grants INSERT to
    // service_role ONLY — a direct supabase.from('event_ticket_tiers')
    // .insert() call from an authenticated client fails silently
    // (no error toast, just no rows). The EDIT path already routes
    // through /api/billing/verify-payment to use service_role; the
    // CREATE path now does the same via the 'insert-event-tiers'
    // action. The endpoint re-verifies the caller is an admin in
    // the payment_type's org before inserting.
    if (res.ok && res.payment_type_id && isEvent && validTiers.length > 0) {
      try {
        const tierRes = await fetch('/api/billing/verify-payment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getStoredAccessToken()}`,
          },
          body: JSON.stringify({
            action: 'insert-event-tiers',
            callerId: scope.memberId,
            paymentTypeId: res.payment_type_id,
            tiers: validTiers.map((tier, i) => ({
              name: tier.name.trim(),
              price: Number(tier.price),
              quantity: tier.quantity === '' ? null : Number(tier.quantity),
              sort_order: i,
            })),
          }),
        });
        const tierData = await tierRes.json();
        if (!tierRes.ok || !tierData?.ok) {
          console.error('Tier insert failed:', tierData);
          toast?.error?.('Event created but ticket tiers failed to save. Edit the event to add them.');
        }
      } catch (err) {
        console.error('Tier insert request failed:', err);
        toast?.error?.('Event created but ticket tiers failed to save. Edit the event to add them.');
      }
    }

    // Special-case: the target tier has no payout account on file
    // (mig 093 returns code='no_payout'). Show the dedicated "set up
    // payout first" modal so the user has a clear next step instead
    // of a vague error — they're one click from solving it.
    if (!res.ok && res.code === 'no_payout') {
      setPayoutGate({
        groupId: res.group_id ?? (targetScope !== 'org' ? targetGroupId : null),
        scope: res.scope ?? targetScope,
        detail: res.detail || 'This tier has no payout account on file. Set it up first so members can pay.',
      });
      setSubmitting(false);
      return;
    }

    if (!res.ok || !res.payment_type_id) {
      setError(res.error || 'Could not publish. Please try again.');
      setSubmitting(false);
      return;
    }

    const notified = res.notified_count ?? 0;
    const targets = res.target_count ?? 0;
    toast?.success?.(
      isEvent
        ? `Event published — ${notified} of ${targets} members notified.`
        : `Due published — ${notified} of ${targets} members notified.`
    );
    go(`/admin/manage-dues?created=${res.payment_type_id}`);
  };

  return (
    <TokensContext.Provider value={tk}>
    <div className="min-h-screen relative overflow-x-hidden" style={{ minHeight: '100dvh', background: tk.bg }}>
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute rounded-full blur-[160px]"
          style={{
            width: 560, height: 560,
            background: `radial-gradient(circle, ${form.color} 0%, transparent 70%)`,
            top: '-12%', right: '-10%', opacity: 0.12,
            transition: 'background 0.4s ease',
          }}
        />
      </div>

      {/* Top bar */}
      <nav className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm font-medium transition-colors"
          style={{ color: tk.textSec }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <span className="text-xs uppercase tracking-[0.18em] font-semibold" style={{ color: tk.textTer }}>
          New {isEvent ? 'event' : 'due'}
        </span>
      </nav>

      <header className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-2 pb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-4"
          style={{ background: `${form.color}14`, color: form.color, border: `1px solid ${form.color}28` }}>
          <Sparkles className="w-3.5 h-3.5" />
          {isEditMode ? (isEvent ? 'Editing event' : 'Editing due') : (isEvent ? 'Event ticketing' : 'New due')}
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
          {isEditMode
            ? (isEvent ? 'Edit event details' : 'Edit due details')
            : (isEvent ? 'Sell tickets to an event' : 'Create a new due')}
        </h1>
        <p className="text-sm sm:text-base max-w-2xl leading-7 mt-2" style={{ color: tk.textSec }}>
          {isEditMode
            ? "Changes apply to every reference to this due. Members who already paid keep their payments — the new title, amount, and deadline are what they'll see going forward."
            : 'Members get notified the moment you publish. The preview on the right shows exactly what they\'ll see.'}
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pb-24 grid lg:grid-cols-[1fr_360px] gap-6"
      >
        {/* ╭───────── LEFT: FORM ─────────╮ */}
        <div className="space-y-5">
          {/* ── SCOPE / STATUS BANNER ── */}
          {!ctxLoading && ctx?.ok && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl px-4 py-3 flex items-start gap-3"
              style={{
                background: ctx.caller?.can_publish
                  ? `${tk.mint}0E`
                  : 'rgba(245,158,11,0.08)',
                border: `1px solid ${ctx.caller?.can_publish ? `${tk.mint}30` : 'rgba(245,158,11,0.30)'}`,
              }}
            >
              <Sparkles className="w-4 h-4 shrink-0 mt-0.5"
                style={{ color: ctx.caller?.can_publish ? tk.mint : tk.amber }} />
              <div className="flex-1 min-w-0 text-xs leading-5" style={{ color: tk.textSec }}>
                <p className="font-semibold text-white">
                  {ctx.org?.name} · {scopeLabel(ctx.caller?.scope)}
                  {ctx.session?.label ? ` · ${ctx.session.label}` : ''}
                </p>
                {!ctx.caller?.can_publish && (
                  <p className="mt-1" style={{ color: 'rgba(255,224,170,0.9)' }}>
                    {ctx.org?.state !== 'active'
                      ? `Your organization is in "${ctx.org?.state}" state — dues can't be published until it's Active.`
                      : ctx.caller?.verification_status &&
                        !['email_verified', 'document_verified', 'admin_verified', 'member_confirmed'].includes(ctx.caller.verification_status)
                        ? `Your exec role is "${ctx.caller.verification_status}". Complete verification before publishing.`
                        : 'You do not have permission to publish dues here.'}
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {/* ── BASICS ── */}
          <Panel title="Basics" icon={<Tag className="w-4 h-4" />}>
            <Field label="Title" required>
              <Input value={form.title} onChange={(v) => setField('title', v)} placeholder={isEvent ? 'Dept Dinner 2026' : 'Semester Dues'} required />
            </Field>

            <Field label="Description" hint="optional, shown to members">
              <Textarea value={form.description} onChange={(v) => setField('description', v)} placeholder="What's this payment for?" />
            </Field>

            <Field label="Category" required>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => {
                  const active = form.category === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCategory(c.value)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                      style={{
                        background: active ? `${c.color}18` : 'rgba(255,255,255,0.04)',
                        color: active ? c.color : tk.textSec,
                        border: `1px solid ${active ? `${c.color}40` : tk.border}`,
                      }}
                    >
                      <span>{c.icon}</span>
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Row>
              <Field label="Icon">
                <div className="flex flex-wrap gap-1.5">
                  {ICONS.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setField('icon', ic)}
                      className="w-9 h-9 rounded-lg text-base transition-all"
                      style={{
                        background: form.icon === ic ? `${form.color}20` : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${form.icon === ic ? `${form.color}50` : tk.border}`,
                      }}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Accent color">
                <div className="flex flex-wrap gap-1.5">
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setField('color', c)}
                      className="w-7 h-7 rounded-full transition-all"
                      style={{
                        background: c,
                        outline: form.color === c ? `2px solid ${tk.text}` : 'none',
                        outlineOffset: 2,
                      }}
                    />
                  ))}
                </div>
              </Field>
            </Row>

            {!isEvent && (
              <Field label="Amount" required hint="in your org currency">
                <div className="space-y-2">
                  <Input
                    value={form.amount}
                    onChange={(v) => setField('amount', v.replace(/[^0-9.]/g, ''))}
                    placeholder="5000"
                    type="text"
                    inputMode="decimal"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {AMOUNT_CHIPS.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setField('amount', String(amt))}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
                        style={{
                          background: form.amount === String(amt) ? `${form.color}18` : 'rgba(255,255,255,0.04)',
                          color: form.amount === String(amt) ? form.color : tk.textSec,
                          border: `1px solid ${form.amount === String(amt) ? `${form.color}40` : tk.border}`,
                        }}
                      >
                        ₦{amt.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>
              </Field>
            )}

            <Row>
              <Field label="Deadline" hint="optional">
                <ProfessionalDateTimePicker
                  mode="datetime"
                  value={form.deadline}
                  onChange={(iso) => setField('deadline', iso)}
                  placeholder="Pick a date and time"
                  fullWidth
                />
              </Field>
              <Field label="Late fee per day" hint="₦, optional">
                <Input value={form.late_fee_per_day} onChange={(v) => setField('late_fee_per_day', v.replace(/[^0-9.]/g, ''))} placeholder="0" />
              </Field>
            </Row>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {!isEvent && (
                <ToggleCard
                  label="Mandatory"
                  description="Members must pay"
                  checked={form.is_mandatory}
                  onChange={(v) => setField('is_mandatory', v)}
                />
              )}
              {!isEvent && (
                <ToggleCard
                  label="Allow partial"
                  description="Pay in installments"
                  checked={form.allow_partial}
                  onChange={(v) => setField('allow_partial', v)}
                />
              )}
              <ToggleCard
                label={isEvent ? 'Public sale' : 'Public link'}
                description={isEvent ? 'Anyone can buy via link' : 'Shareable URL'}
                checked={form.is_public}
                onChange={(v) => setField('is_public', v)}
              />
            </div>

            {!isEvent && form.allow_partial && (
              <Field label="Minimum partial amount" required>
                <Input value={form.minimum_partial_amount} onChange={(v) => setField('minimum_partial_amount', v.replace(/[^0-9.]/g, ''))} placeholder="1000" />
              </Field>
            )}
          </Panel>

          {/* ── EVENT SECTION (reveals when category=event) ── */}
          <AnimatePresence>
            {isEvent && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <Panel title="Event details" icon={<Ticket className="w-4 h-4" />} accent={tk.purple}>
                  <Row>
                    <Field label="Event date" required icon={<Calendar className="w-3 h-3" />}>
                      <ProfessionalDateTimePicker
                        mode="datetime"
                        value={form.event_date}
                        onChange={(iso) => setField('event_date', iso)}
                        placeholder="Pick event date & time"
                        fullWidth
                      />
                    </Field>
                    <Field label="Venue" required icon={<MapPin className="w-3 h-3" />}>
                      <Input value={form.event_venue} onChange={(v) => setField('event_venue', v)} placeholder="Engineering Auditorium" required />
                    </Field>
                  </Row>
                  <Row>
                    <Field label="Cover image" hint="upload or paste a URL" icon={<ImageIcon className="w-3 h-3" />}>
                      <div className="space-y-2">
                        <input
                          ref={coverInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            void handleCoverUpload(e.target.files?.[0] ?? null);
                            e.currentTarget.value = '';
                          }}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => coverInputRef.current?.click()}
                            disabled={coverUploading}
                            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60"
                            style={{ background: tk.panelHov, color: tk.text }}
                          >
                            <Upload className="w-3.5 h-3.5" />
                            {coverUploading ? 'Uploading…' : 'Upload image'}
                          </button>
                          {coverFileName && (
                            <span className="text-[11px]" style={{ color: tk.textTer }}>
                              {coverFileName}
                            </span>
                          )}
                        </div>
                        {coverWarning && (
                          <p className="text-[11px] leading-5" style={{ color: tk.amber }}>
                            {coverWarning}
                          </p>
                        )}
                        <Input value={form.event_cover_url} onChange={(v) => setField('event_cover_url', v)} placeholder="https://..." />
                      </div>
                    </Field>
                    <Field label="Max attendees" hint="optional">
                      <Input value={form.event_max_attendees} onChange={(v) => setField('event_max_attendees', v.replace(/[^0-9]/g, ''))} placeholder="200" />
                    </Field>
                  </Row>

                  {/* ── Ticket types (tiers) ── */}
                  <div className="mt-1">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold" style={{ color: tk.textSec }}>Ticket types</label>
                      <button type="button" onClick={addTier} className="text-xs font-bold" style={{ color: tk.purple }}>
                        + Add type
                      </button>
                    </div>
                    <div className="space-y-2">
                      {form.tiers.map((t, i) => (
                        <div
                          key={i}
                          className="flex flex-wrap items-end gap-2 rounded-xl p-2.5"
                          style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${tk.border}` }}
                        >
                          <div className="flex-1 min-w-[120px]">
                            <label className="block text-[10px] mb-1" style={{ color: tk.textTer }}>Name</label>
                            <Input value={t.name} onChange={(v) => setTier(i, 'name', v)} placeholder="Regular / VIP" />
                          </div>
                          <div className="w-24">
                            <label className="block text-[10px] mb-1" style={{ color: tk.textTer }}>Price ₦</label>
                            <Input value={t.price} onChange={(v) => setTier(i, 'price', v.replace(/[^0-9.]/g, ''))} placeholder="2000" />
                          </div>
                          <div className="w-20">
                            <label className="block text-[10px] mb-1" style={{ color: tk.textTer }}>Qty</label>
                            <Input value={t.quantity} onChange={(v) => setTier(i, 'quantity', v.replace(/[^0-9]/g, ''))} placeholder="∞" />
                          </div>
                          {form.tiers.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeTier(i)}
                              className="text-xs font-semibold px-2 py-2.5"
                              style={{ color: tk.danger }}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] mt-2" style={{ color: tk.textTer }}>
                      Leave Qty empty for unlimited. Buyers choose a type at checkout and get a QR ticket.
                    </p>
                  </div>
                </Panel>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── TARGETING (scope-aware) ── */}
          <Panel title="Who pays" icon={<Users className="w-4 h-4" />}>
            {ctxLoading ? (
              <p className="text-xs" style={{ color: tk.textTer }}>Loading your scope…</p>
            ) : !ctx?.ok ? (
              <p className="text-xs" style={{ color: tk.danger }}>
                {ctx?.error || 'Could not load your admin scope.'}
              </p>
            ) : (
              <>
                {/* Prefill banner — shown when the page was opened from a
                    dept/faculty targeting card. Reassures the user the
                    selection isn't locked: change anything below. */}
                {(qpScope || qpByLevel) && (
                  <div
                    className="mb-3 rounded-xl px-3 py-2 flex items-start gap-2 text-[11px]"
                    style={{
                      // tk in this file is a hardcoded dark-theme const
                      // (no primarySoft/primaryRing tokens). Compose the
                      // tints inline from the primary brand colour.
                      background: `${tk.primary}18`,
                      border: `1px solid ${tk.primary}38`,
                      color: tk.textSec,
                    }}
                  >
                    <span className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: tk.primary, color: '#FFFFFF', fontSize: 10, fontWeight: 800 }}>i</span>
                    <span>
                      <span className="font-semibold" style={{ color: tk.text }}>
                        Targeting prefilled
                      </span>
                      {' '}from your dashboard. You can change scope, target group, or level below at any time before publishing.
                    </span>
                  </div>
                )}
                {/* Scope tabs — only show options the caller can actually do */}
                <Field label="Scope" required>
                  <div className="flex flex-wrap gap-2">
                    {canChooseOrgScope && (
                      <ScopeTab
                        active={targetScope === 'org'}
                        onClick={() => { setTargetScope('org'); setTargetGroupId(null); }}
                        label="Whole organization"
                        sublabel="Every active member is billed"
                        color={form.color}
                      />
                    )}
                    {canChooseFacultyScope && facultyTargets.length > 0 && (
                      <ScopeTab
                        active={targetScope === 'faculty'}
                        onClick={() => {
                          setTargetScope('faculty');
                          // pick caller's own unit if they're unit scope
                          const def = ctx.caller?.scope === 'unit' ? ctx.caller.group_id : facultyTargets[0]?.id ?? null;
                          setTargetGroupId(def);
                        }}
                        label="Whole faculty / dept"
                        sublabel="Bills everyone in the classes below"
                        color={form.color}
                      />
                    )}
                    {leafTargets.length > 0 && (
                      <ScopeTab
                        active={targetScope === 'group'}
                        onClick={() => {
                          setTargetScope('group');
                          const def = ctx.caller?.scope === 'group' ? ctx.caller.group_id : leafTargets[0]?.id ?? null;
                          setTargetGroupId(def);
                          // a single class is always one level — wipe the
                          // per-level filter so it doesn't sneak through
                          setField('target_levels', []);
                        }}
                        label="One class / dept"
                        sublabel="Just that group's members"
                        color={form.color}
                      />
                    )}
                  </div>
                </Field>

                {/* Specific picker when scope=faculty or scope=group */}
                {targetScope === 'faculty' && facultyTargets.length > 1 && (
                  <Field label="Faculty / Department">
                    <ProfessionalDropdown
                      value={targetGroupId ?? ''}
                      onChange={(v) => setTargetGroupId((Array.isArray(v) ? v[0] : v) || null)}
                      placeholder="Select a faculty or department…"
                      searchable
                      options={facultyTargets.map((g) => ({
                        value: g.id,
                        label: g.name,
                        description: g.short_name ?? g.kind,
                      }))}
                    />
                  </Field>
                )}
                {targetScope === 'group' && leafTargets.length > 1 && (
                  <Field label="Class / Department">
                    <ProfessionalDropdown
                      value={targetGroupId ?? ''}
                      onChange={(v) => setTargetGroupId((Array.isArray(v) ? v[0] : v) || null)}
                      placeholder="Select a class / department…"
                      searchable
                      options={leafTargets.map((g) => ({
                        value: g.id,
                        label: g.name,
                        description: `${g.kind} · ${g.member_count} ${g.member_count === 1 ? 'member' : 'members'}`,
                      }))}
                    />
                  </Field>
                )}

                {/* Optional level filter — only meaningful when targeting multiple
                    classes. A class rep ('group' scope) targets one class, so all
                    members are the same level by definition; we hide it for them. */}
                {targetScope !== 'group' && (
                  <Field label="Filter by level" hint="optional — leave blank for everyone in scope">
                    <div ref={levelPickerRef} className="flex flex-wrap gap-1.5 rounded-lg p-1 -m-1">
                      {LEVEL_OPTIONS.map((lvl) => {
                        const on = form.target_levels.includes(lvl);
                        return (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() =>
                              setField('target_levels', on
                                ? form.target_levels.filter((l) => l !== lvl)
                                : [...form.target_levels, lvl]
                              )
                            }
                            className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                            style={{
                              background: on ? `${form.color}20` : 'rgba(255,255,255,0.04)',
                              color: on ? form.color : tk.textSec,
                              border: `1px solid ${on ? `${form.color}50` : tk.border}`,
                            }}
                          >
                            {lvl}L
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                )}
              </>
            )}
          </Panel>

          {/* ── PAYMENT METHOD ── */}
          <Panel title="How members pay" icon={<CreditCard className="w-4 h-4" />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ToggleCard
                label="Card / Bank / USSD"
                description="Paystack checkout, auto-confirmed"
                checked={form.accepts_paystack}
                onChange={(v) => setField('accepts_paystack', v)}
                accent={tk.primary}
              />
              <ToggleCard
                label="Manual bank transfer"
                description="Member uploads receipt, you approve"
                checked={form.accepts_manual}
                onChange={(v) => setField('accepts_manual', v)}
                accent={tk.blue}
              />
            </div>

            {form.accepts_manual && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
                className="space-y-3"
              >
                {/* IMPORTANT: do NOT add overflow-hidden here — the ProfessionalDropdown
                    used below renders its menu with position:absolute, and an overflow-hidden
                    parent would clip it (even though the menu has z-index 9999). */}
                <p className="text-[11px] uppercase tracking-wider font-semibold pt-2" style={{ color: tk.textTer }}>
                  Bank details (shown to members who pick manual)
                </p>
                <Row>
                  <Field label="Bank" required={form.accepts_manual}>
                    <ProfessionalDropdown
                      value={form.bank_name}
                      onChange={(v) => setField('bank_name', Array.isArray(v) ? v[0] : v)}
                      placeholder="Select bank"
                      searchable
                      options={NIGERIAN_BANKS.map((b) => ({ value: b, label: b }))}
                    />
                  </Field>
                  <Field label="Account number" required={form.accepts_manual}>
                    <Input value={form.account_number} onChange={(v) => setField('account_number', v.replace(/[^0-9]/g, ''))} placeholder="0123456789" />
                  </Field>
                </Row>
                <Field label="Account name">
                  <Input value={form.account_name} onChange={(v) => setField('account_name', v)} placeholder="Class of 2026" />
                </Field>
              </motion.div>
            )}
          </Panel>

          {/* ── Notifications (info card — actual fan-out wired in next migration) ── */}
          <Panel title="Notifications" icon={<Megaphone className="w-4 h-4" />} accent={tk.mint}>
            <p className="text-xs leading-5" style={{ color: tk.textSec }}>
              When you publish, members will receive an in-app notification and push (if enabled).
              Email goes out to members who've opted in. Each member can override their own notification
              preferences in their settings.
            </p>
          </Panel>

          {/* Validation list */}
          <AnimatePresence>
            {(error || validation.length > 0) && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="rounded-xl px-4 py-3 flex items-start gap-3"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
              >
                <AlertCircle className="w-5 h-5 shrink-0" style={{ color: tk.danger, marginTop: 1 }} />
                <div className="text-sm leading-6" style={{ color: 'rgba(254,202,202,0.95)' }}>
                  {error ? error : (
                    <ul className="space-y-0.5 text-xs">
                      {validation.map((v) => <li key={v}>· {v}</li>)}
                    </ul>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit */}
          <div className="pt-1 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-xs leading-5" style={{ color: tk.textTer, maxWidth: 380 }}>
              You can edit or deactivate this {isEvent ? 'event' : 'due'} later from Manage Dues.
            </p>
            <motion.button
              type="submit"
              disabled={!canSubmit || submitting}
              className="px-6 py-3 rounded-2xl text-white font-bold text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: canSubmit
                  ? `linear-gradient(135deg, ${form.color} 0%, ${form.color}CC 100%)`
                  : 'rgba(255,255,255,0.06)',
                boxShadow: canSubmit ? `0 8px 28px ${form.color}40` : 'none',
              }}
              whileHover={canSubmit && !submitting ? { scale: 1.03 } : undefined}
              whileTap={canSubmit && !submitting ? { scale: 0.97 } : undefined}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {isEditMode
                ? (submitting ? 'Saving…' : 'Save changes')
                : `Publish ${isEvent ? 'event' : 'due'}`}
              {!isEditMode && <ArrowRight className="w-4 h-4" />}
            </motion.button>
          </div>
        </div>

        {/* ╭───────── RIGHT: LIVE PREVIEW ─────────╮ */}
        <aside className="space-y-3 lg:sticky lg:top-6 self-start">
          <div className="flex items-center gap-2 px-1">
            <Eye className="w-3.5 h-3.5" style={{ color: tk.textTer }} />
            <span className="text-[10px] uppercase tracking-[0.18em] font-semibold" style={{ color: tk.textTer }}>
              Live preview — student view
            </span>
          </div>
          <StudentCardPreview form={form} />
          {form.accepts_manual && form.bank_name && (
            <BankPreview form={form} />
          )}
        </aside>
      </form>

      {/* ── PAYOUT-GATE MODAL ────────────────────────────────────
          Shown when the dues-creation RPC returns code='no_payout'.
          The target tier (class / dept / faculty / org) hasn't set
          their subaccount yet, so we can't route the money. Members
          would pay into nothing. Send the user to the right payout
          page rather than letting them publish blindly. */}
      <AnimatePresence>
        {payoutGate && (
          <motion.div
            className="fixed inset-0 z-[120] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0"
              style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
              onClick={() => setPayoutGate(null)}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            />
            <motion.div
              className="relative w-full max-w-md rounded-3xl overflow-hidden"
              style={{
                // Modal surface — use the page's own panel tint over a
                // dark base. tk has no `card` token; this matches the
                // visual weight of other modals on the page.
                background: `linear-gradient(180deg, ${tk.panel} 0%, #1A0E09 100%)`,
                border: `1px solid ${tk.border}`,
                boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
                color: tk.text,
              }}
              initial={{ y: 18, opacity: 0, scale: 0.97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 12, opacity: 0, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            >
              <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${tk.primary}, ${tk.primary}80)` }} />
              <div className="p-6">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
                  style={{ background: `${tk.primary}18`, color: tk.primary, border: `1px solid ${tk.primary}40` }}
                >
                  <CreditCard className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-extrabold tracking-tight" style={{ color: tk.text }}>
                  Set up your payout first
                </h3>
                <p className="text-sm leading-relaxed mt-2" style={{ color: tk.textSec }}>
                  {payoutGate.detail}
                </p>
                <p className="text-[12px] leading-relaxed mt-3" style={{ color: tk.textTer }}>
                  Each tier collects to its OWN bank account — no cascading. The{' '}
                  <span className="font-bold" style={{ color: tk.text }}>{payoutGate.scope}</span>{' '}
                  tier needs an account on file before anyone can pay this due.
                </p>
                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPayoutGate(null)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      color: tk.textSec,
                      border: `1px solid ${tk.border}`,
                    }}
                  >
                    Not now
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const path = payoutGate.groupId
                        ? `/admin/payout?groupId=${payoutGate.groupId}`
                        : '/admin/payout';
                      setPayoutGate(null);
                      go(path);
                    }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1.5"
                    style={{
                      background: `linear-gradient(135deg, ${tk.primary} 0%, ${tk.primary}cc 100%)`,
                      color: '#FFFFFF',
                      boxShadow: `0 8px 22px -8px ${tk.primary}`,
                    }}
                  >
                    Set up payout <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </TokensContext.Provider>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Form primitives
// ════════════════════════════════════════════════════════════════════════════
function scopeLabel(scope: 'org' | 'unit' | 'group' | null | undefined): string {
  if (scope === 'org') return 'Org-wide admin';
  if (scope === 'unit') return 'Faculty admin';
  if (scope === 'group') return 'Class / dept admin';
  return 'Not an admin';
}

function ScopeTab({
  active, onClick, label, sublabel, color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sublabel: string;
  color: string;
}) {
  const tk = useTokens();
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-xl px-3.5 py-2.5 transition-all flex-1 min-w-[140px]"
      style={{
        background: active ? `${color}14` : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? `${color}50` : tk.border}`,
      }}
    >
      <p className="text-[12px] font-bold" style={{ color: active ? color : tk.text }}>
        {label}
      </p>
      <p className="text-[10px] mt-0.5" style={{ color: tk.textSec }}>{sublabel}</p>
    </button>
  );
}

function Panel({
  title, icon, accent = BRAND.primary, children,
}: {
  title: string;
  icon?: React.ReactNode;
  accent?: string;
  children: React.ReactNode;
}) {
  const tk = useTokens();
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-3xl p-5 sm:p-6"
      style={{ background: tk.panel, border: `1px solid ${tk.border}` }}
    >
      <header className="mb-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-white">
          {icon && (
            <span
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: `${accent}15`, color: accent }}
            >
              {icon}
            </span>
          )}
          {title}
        </h2>
      </header>
      <div className="space-y-4">{children}</div>
    </motion.section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

function Field({
  label, hint, required, icon, children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const tk = useTokens();
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: tk.textSec }}>
          {icon}
          <span className="ml-1.5 inline-block align-middle">
            {label}
            {required && <span style={{ color: tk.primary }}> *</span>}
          </span>
        </span>
        {hint && <span className="text-[10px]" style={{ color: tk.textTer }}>{hint}</span>}
      </div>
      {children}
    </label>
  );
}

function Input({
  value, onChange, placeholder, type = 'text', inputMode, required,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: 'text' | 'numeric' | 'decimal' | 'email' | 'tel' | 'url';
  required?: boolean;
}) {
  const tk = useTokens();
  return (
    <input
      type={type}
      value={value}
      inputMode={inputMode}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-colors"
      style={{
        // Background derives from the theme's panel so the input
        // sits cleanly on top of the panel in both light + dark.
        background: tk.panel,
        border: `1px solid ${tk.border}`,
        color: tk.text,
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = tk.borderHov; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = tk.border; }}
    />
  );
}

function Textarea({
  value, onChange, placeholder,
}: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const tk = useTokens();
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-colors resize-none"
      style={{
        background: 'rgba(26,14,9,0.85)',
        border: `1px solid ${tk.border}`,
        color: tk.text,
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = tk.borderHov; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = tk.border; }}
    />
  );
}

function ToggleCard({
  label, description, checked, onChange, accent = BRAND.primary,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  accent?: string;
}) {
  const tk = useTokens();
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="text-left rounded-xl p-3 flex items-start gap-3 transition-all"
      style={{
        background: checked ? `${accent}12` : tk.panel,
        border: `1px solid ${checked ? `${accent}40` : tk.border}`,
      }}
    >
      <div
        className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 transition-all"
        style={{
          background: checked ? accent : 'transparent',
          border: `1.5px solid ${checked ? accent : 'rgba(255,255,255,0.25)'}`,
        }}
      >
        {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-white">{label}</p>
        <p className="text-[10px] mt-0.5 leading-4" style={{ color: tk.textSec }}>{description}</p>
      </div>
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Preview — what students see on their dashboard
// ════════════════════════════════════════════════════════════════════════════
function StudentCardPreview({ form }: { form: FormState }) {
  const tk = useTokens();
  const amount = Number(form.amount || 0);
  const isEvent = form.category === 'event';
  return (
    <motion.div
      key={`${form.color}-${form.icon}-${form.title}`}
      initial={{ opacity: 0.6, scale: 0.99 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.18 }}
      className="rounded-2xl p-4 relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${form.color}10, rgba(255,255,255,0.025))`,
        border: `1px solid ${form.color}30`,
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
          style={{
            background: `${form.color}18`,
            border: `1px solid ${form.color}30`,
          }}
        >
          {form.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white text-sm truncate">{form.title || 'New due'}</p>
          <div className="flex items-center gap-1.5 mt-0.5 text-[11px]" style={{ color: tk.textTer }}>
            <Calendar className="w-3 h-3" />
            {form.deadline
              ? formatDate(form.deadline, 'short')
              : isEvent && form.event_date
                ? formatDate(form.event_date, 'short')
                : 'No deadline'}
          </div>
        </div>
      </div>

      {isEvent && form.event_venue && (
        <div className="flex items-center gap-1.5 mb-2 text-[11px]" style={{ color: tk.textSec }}>
          <MapPin className="w-3 h-3" />
          {form.event_venue}
        </div>
      )}

      {form.description && (
        <p className="text-[11px] mb-3 line-clamp-2" style={{ color: tk.textSec }}>
          {form.description}
        </p>
      )}

      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] uppercase tracking-wider" style={{ color: tk.textTer }}>
            {isEvent ? 'Ticket' : 'Amount'}
          </p>
          <p className="text-xl font-extrabold text-white tabular-nums">
            {amount > 0 ? formatCurrency(amount) : '₦0'}
          </p>
        </div>
        {form.is_mandatory ? (
          <span
            className="px-2.5 py-1 rounded-full text-[10px] font-bold"
            style={{ background: 'rgba(239,68,68,0.12)', color: tk.danger, border: '1px solid rgba(239,68,68,0.28)' }}
          >
            MANDATORY
          </span>
        ) : (
          <span
            className="px-2.5 py-1 rounded-full text-[10px] font-bold"
            style={{ background: `${tk.mint}14`, color: tk.mint, border: `1px solid ${tk.mint}30` }}
          >
            OPTIONAL
          </span>
        )}
      </div>

      {/* Method indicators */}
      <div className="flex items-center gap-1.5 mt-3 pt-3" style={{ borderTop: `1px solid ${tk.border}` }}>
        {form.accepts_paystack && (
          <span
            className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md font-semibold"
            style={{ background: `${tk.mint}10`, color: tk.mint, border: `1px solid ${tk.mint}28` }}
          >
            <DollarSign className="w-2.5 h-2.5" />
            Card / Bank
          </span>
        )}
        {form.accepts_manual && (
          <span
            className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md font-semibold"
            style={{ background: 'rgba(255,255,255,0.05)', color: tk.textSec, border: `1px solid ${tk.border}` }}
          >
            <Upload className="w-2.5 h-2.5" />
            Manual
          </span>
        )}
      </div>
    </motion.div>
  );
}

function BankPreview({ form }: { form: FormState }) {
  const tk = useTokens();
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4"
      style={{ background: tk.panel, border: `1px solid ${tk.border}` }}
    >
      <p className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-2" style={{ color: tk.textTer }}>
        Manual payment shown to members
      </p>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span style={{ color: tk.textTer }}>Bank</span>
          <span className="text-white font-semibold">{form.bank_name}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: tk.textTer }}>Account name</span>
          <span className="text-white font-semibold">{form.account_name || '—'}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: tk.textTer }}>Account number</span>
          <span className="text-white font-mono font-bold tabular-nums">{form.account_number || '—'}</span>
        </div>
      </div>
    </motion.div>
  );
}
