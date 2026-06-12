/**
 * VerificationStatusBanner
 *
 * Surfaces the user's current verification state and the next clear
 * action they should take. Handles four distinct audience shapes:
 *
 *  ┌─ ORG CREATOR (org_setup role, hasn't claimed a real role yet) ──┐
 *  │ Amber banner — DISMISSABLE (founder may opt out if not exec)     │
 *  │ "Email verified — now claim your actual role"                    │
 *  │ Clear CTA → /claim                                               │
 *  │ Re-shown on handover events regardless of prior dismiss          │
 *  └────────────────────────────────────────────────────────────────────┘
 *
 *  ┌─ REGULAR MEMBER / NON-EXEC (hasn't claimed) ────────────────────┐
 *  │ Orange banner — DISMISSABLE                                      │
 *  │ "Are you an exec? Claim your role."                              │
 *  │ Dismissed state persists in localStorage.                        │
 *  │ Re-shown automatically when a handover event is detected         │
 *  │ (org.claim_banner_version bumps → dismiss key is invalidated)    │
 *  └────────────────────────────────────────────────────────────────────┘
 *
 *  ┌─ CLAIM IN PROGRESS ─────────────────────────────────────────────┐
 *  │ Amber banner — shown on first load even with 0 votes             │
 *  │ Layer 0-1: "Verify your school email → next step"               │
 *  │ Layer 2+:  Vote progress bar + invite nudge                      │
 *  │ Suppressed only when votes haven't changed since last view       │
 *  │ AND the user has already seen this state (lastSeenVotes > 0)    │
 *  └────────────────────────────────────────────────────────────────────┘
 *
 *  ┌─ CLAIM REJECTED ────────────────────────────────────────────────┐
 *  │ Danger banner — DISMISSABLE                                      │
 *  │ "Your claim wasn't approved" + common reasons + "Try again" CTA  │
 *  │ Shown for most recent rejected claim (status = 'rejected')       │
 *  │ Re-shown on bannerVersion bump like not_admin                    │
 *  └────────────────────────────────────────────────────────────────────┘
 *
 *  ┌─ CLAIM EXPIRED ────────────────────────────────────────────────┐
 *  │ Muted amber banner — DISMISSABLE                                 │
 *  │ "Your claim timed out" + soft explanation + "Reapply" CTA        │
 *  │ Shown for most recent expired claim (status = 'expired')         │
 *  └────────────────────────────────────────────────────────────────────┘
 *
 *  ┌─ FULLY VERIFIED (layer >= 4) ───────────────────────────────────┐
 *  │ Hidden entirely                                                   │
 *  └────────────────────────────────────────────────────────────────────┘
 *
 * Dismiss contract:
 *   - All dismiss states are stored as `pvx_claim_banner_dismissed_v{V}_{orgId}_{memberId}`
 *     where V = org.claim_banner_version (integer). When an exec handover
 *     happens, the platform bumps claim_banner_version on the org row,
 *     which invalidates all old dismiss keys automatically — every member
 *     sees the banner again without any code change.
 *   - Org creator (org_setup): NOW dismissable. The founder may not be
 *     the exec and should be able to opt out. Re-shown on next handover event.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Hourglass,
  PartyPopper,
  Vote as VoteIcon,
  X as XIcon,
  XCircle,
  Clock,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/config/supabase';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

type AdminRow = {
  id: string;
  role_label: string | null;
  role: string;
  verification_layer: number;
  verification_status: string | null;
  scope_level: string;
};

type PendingClaim = {
  id: string;
  position_title: string;
  bootstrap_path: boolean;
  votes_received: number;
  votes_required: number;
  current_layer: number;
  required_layer: number;
};

// Rejection record from the claim_rejections table.
// target_signature is a human-readable position slug (e.g. 'class-rep').
// reason is nullable -- the reviewer may or may not have left one.
// expires_at is a hard expiry; lifted_at is an early pardon by an admin.
// A rejection is active when lifted_at IS NULL and expires_at > now().
type RejectionRecord = {
  id: string;
  target_signature: string;
  reason: string | null;
  expires_at: string;
  lifted_at: string | null;
};

// Expired claim -- from claim_requests, status = 'expired' (timed out, not rejected).
type ExpiredClaim = {
  id: string;
  position_title: string;
};

type BannerTokens = {
  primary: string;
  amber: string;
  mint: string;
  blue: string;
  border: string;
  text: string;
  textSec: string;
  textTer: string;
  danger: string;
  card: string;
  gradOrange: string;
  cardBorder: string;
};

type Variant =
  | 'hidden'
  | 'org_creator_unclaimed'   // has org_setup role, must claim a real role
  | 'in_progress'             // active claim awaiting votes / review
  | 'rejected'                // active rejection record in claim_rejections
  | 'expired'                 // most recent claim_request timed out
  | 'not_admin';              // regular member or exec who hasn't claimed

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Build the versioned dismiss key. When org.claim_banner_version
 * increments (e.g. after a handover), old keys become stale and the
 * banner reappears for everyone automatically.
 */
function dismissKey(orgId: string, memberId: string, version: number): string {
  return `pvx_claim_banner_dismissed_v${version}_${orgId}_${memberId}`;
}

function isDismissed(orgId: string, memberId: string, version: number): boolean {
  try {
    return localStorage.getItem(dismissKey(orgId, memberId, version)) === '1';
  } catch {
    return false;
  }
}

function persistDismiss(orgId: string, memberId: string, version: number) {
  try {
    localStorage.setItem(dismissKey(orgId, memberId, version), '1');
  } catch { /* ignore */ }
}

function orgTypeIs(orgType: string, keywords: string[]): boolean {
  const lower = orgType.toLowerCase();
  return keywords.some(k => lower.includes(k));
}

function resolveOrgLabel(orgName: string, orgType: string): string {
  if (orgTypeIs(orgType, ['class', 'set', 'level'])) return `this class`;
  if (orgTypeIs(orgType, ['department', 'dept']))     return `the ${orgName} department`;
  if (orgTypeIs(orgType, ['faculty', 'college', 'university', 'school'])) return `${orgName}`;
  return orgName;
}

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function BannerShell({
  accent,
  icon,
  eyebrow,
  children,
  onDismiss,
  tk,
}: {
  accent: string;
  icon: React.ReactNode;
  eyebrow: string;
  children: React.ReactNode;
  onDismiss?: () => void;
  tk: BannerTokens;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-3xl p-5 sm:p-6 relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${accent}12 0%, ${tk.card} 100%)`,
        border: `1px solid ${accent}35`,
      }}
    >
      {/* Radial glow top-right */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 55% 65% at 100% 0%, ${accent}22, transparent)`,
        }}
      />

      <div className="relative">
        {/* Dismiss button — only rendered when explicitly provided */}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="absolute right-0 top-0 p-1.5 rounded-lg transition-opacity hover:opacity-60"
            style={{ color: `${accent}99` }}
            aria-label="Dismiss banner"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Eyebrow */}
        <div className="flex items-center gap-2 mb-3">
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${accent}20`, color: accent }}
          >
            {icon}
          </span>
          <p
            className="text-[10px] uppercase tracking-[0.2em] font-bold"
            style={{ color: accent }}
          >
            {eyebrow}
          </p>
        </div>

        {children}
      </div>
    </motion.section>
  );
}

function CtaButton({
  label,
  accent,
  onClick,
}: {
  label: string;
  accent: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all"
      style={{
        background: `${accent}18`,
        color: accent,
        border: `1px solid ${accent}30`,
      }}
      whileHover={{ scale: 1.03, x: 1 }}
      whileTap={{ scale: 0.97 }}
    >
      {label}
      <ArrowRight className="w-3.5 h-3.5" />
    </motion.button>
  );
}

function VoteProgressBar({
  received,
  required,
  accent,
  tk,
}: {
  received: number;
  required: number;
  accent: string;
  tk: BannerTokens;
}) {
  const pct = Math.min(100, Math.round((received / Math.max(1, required)) * 100));
  return (
    <div>
      <div
        className="h-1.5 rounded-full overflow-hidden mb-1"
        style={{ background: `${tk.cardBorder}` }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${accent}, ${tk.mint})` }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.65, ease: 'easeOut' }}
        />
      </div>
      <p className="text-[10px]" style={{ color: tk.textTer }}>
        {received} of {required} confirmations received
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────

export default function VerificationStatusBanner() {
  const navigate = useNavigate();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  // Fix: removed unused `group` from destructuring (TS6133)
  const { user, organization } = useMultiTenantAuth();

  const memberId = user?.id;
  const orgId    = organization?.id;

  // Claim banner version — bumped by platform on handover events.
  // Defaults to 0 if the column doesn't exist yet.
  // Fix: double-cast through `unknown` to satisfy TS2352 — Organization type
  // has no index signature, so direct cast to Record<string, unknown> is rejected.
  const org = organization as unknown as Record<string, unknown>;
  const bannerVersion: number = (org?.claim_banner_version as number) ?? 0;

  // ── Theme ──────────────────────────────────────────────────────
  const { theme } = useTheme();
  const t = getDashboardTokens(theme);
  const tk: BannerTokens = {
    primary:    t.primary,
    amber:      t.amber,
    mint:       t.mint,
    blue:       t.blue,
    border:     t.cardBorder,
    text:       t.text,
    textSec:    t.textSec,
    textTer:    t.textTer,
    danger:     t.danger,
    card:       t.card,
    gradOrange: t.gradOrange,
    cardBorder: t.cardBorder,
  };

  // ── State ──────────────────────────────────────────────────────
  const [adminRow, setAdminRow]         = useState<AdminRow | null>(null);
  const [pendingClaim, setPendingClaim] = useState<PendingClaim | null>(null);
  const [rejection, setRejection]       = useState<RejectionRecord | null>(null);
  const [expiredClaim, setExpiredClaim] = useState<ExpiredClaim | null>(null);
  const [loading, setLoading]           = useState(true);
  const [dismissed, setDismissed]       = useState(false);
  const [lastSeenVotes, setLastSeenVotes] = useState<number | null>(null);

  // ── Data fetch ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!memberId || !orgId) { setLoading(false); return; }

    (async () => {
      setLoading(true);

      const [{ data: admins }, { data: claims }, { data: rejections }, { data: expired }] = await Promise.all([
        supabase
          .from('member_admins')
          .select('id, role, role_label, verification_layer, verification_status, scope_level')
          .eq('member_id', memberId)
          .eq('organization_id', orgId)
          .eq('is_active', true)
          .order('verification_layer', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1),

        supabase
          .from('claim_requests')
          .select('id, position_title, bootstrap_path, votes_received, votes_required, current_layer, required_layer')
          .eq('claimant_user_id', memberId)
          .eq('organization_id', orgId)
          .in('status', ['awaiting_votes', 'submitted', 'under_review'])
          .order('created_at', { ascending: false })
          .limit(1),

        // Q1 fix (updated): rejections live in claim_rejections, not claim_requests.
        // Fetch the most recent active rejection (not lifted, not expired) for this
        // member in this org. We also fetch the most recent expired claim_request
        // separately so both paths have their own data source.
        supabase
          .from('claim_rejections')
          .select('id, target_signature, reason, expires_at, lifted_at')
          .eq('member_id', memberId)
          .eq('organization_id', orgId)
          .is('lifted_at', null)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1),

        supabase
          .from('claim_requests')
          .select('id, position_title')
          .eq('claimant_user_id', memberId)
          .eq('organization_id', orgId)
          .eq('status', 'expired')
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

      if (!cancelled) {
        setAdminRow((admins ?? [])[0] as AdminRow ?? null);
        setPendingClaim((claims ?? [])[0] as PendingClaim ?? null);
        setRejection((rejections ?? [])[0] as RejectionRecord ?? null);
        setExpiredClaim((expired ?? [])[0] as ExpiredClaim ?? null);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [memberId, orgId]);

  // ── Dismiss persistence ────────────────────────────────────────
  useEffect(() => {
    if (!memberId || !orgId) return;
    setDismissed(isDismissed(orgId, memberId, bannerVersion));
  }, [memberId, orgId, bannerVersion]);

  // ── Vote progress tracking ─────────────────────────────────────
  const progressKey = pendingClaim && memberId
    ? `pvx_claim_progress_${pendingClaim.id}_${memberId}`
    : null;

  useEffect(() => {
    if (!progressKey) { setLastSeenVotes(null); return; }
    try {
      const stored = localStorage.getItem(progressKey);
      setLastSeenVotes(stored !== null ? Number(stored) : 0);
    } catch { setLastSeenVotes(0); }
  }, [progressKey]);

  useEffect(() => {
    if (!progressKey || !pendingClaim || lastSeenVotes === null) return;
    if (pendingClaim.votes_received > lastSeenVotes) {
      try { localStorage.setItem(progressKey, String(pendingClaim.votes_received)); }
      catch { /* ignore */ }
    }
  }, [progressKey, pendingClaim, lastSeenVotes]);

  // ── Variant resolution ─────────────────────────────────────────
  const variant = useMemo((): Variant => {
    if (loading) return 'hidden';

    // Fully verified — no banner needed
    if (adminRow && adminRow.verification_layer >= 4) return 'hidden';

    // Active claim in the pipeline — checked BEFORE org_setup so a founder
    // who immediately files a claim sees in_progress, not org_creator_unclaimed.
    // (Q3: this ordering is intentional — do not swap without reviewing both variants.)
    if (pendingClaim) return 'in_progress';

    // Active rejection in claim_rejections takes priority -- user is in a cooldown
    // period and cannot reapply until expires_at passes or an admin lifts it.
    if (rejection) return 'rejected';

    // Expired claim_request -- timed out before gathering enough votes.
    if (expiredClaim) return 'expired';

    // org_setup = founder who set up the org but hasn't claimed a
    // governance role yet. Must see the banner — but CAN dismiss it
    // in case they're not the actual exec.
    if (adminRow && adminRow.role === 'org_setup') return 'org_creator_unclaimed';

    // Unverified admin (claimed but not yet at layer 4):
    // Let them fall into not_admin so the claim CTA stays visible.
    // The dedicated /verify-email page handles the email step.
    if (adminRow && adminRow.verification_layer < 4) return 'not_admin';

    return 'not_admin';
  }, [loading, adminRow, pendingClaim, rejection, expiredClaim]);

  // ── Is this person the one who created the org? ────────────────
  // Fix: reuse already-cast `org` ref to avoid repeated TS2352 casts (lines 412/413)
  const isOrgCreator = Boolean(
    memberId && (
      org?.created_by === memberId ||
      org?.founded_by_user_id === memberId
    )
  );

  const orgLabel = resolveOrgLabel(
    organization?.name ?? '',
    organization?.organization_type ?? '',
  );

  const goToClaim = () => navigate(`/${orgSlug}/claim`);

  const handleDismiss = () => {
    if (!memberId || !orgId) return;
    persistDismiss(orgId, memberId, bannerVersion);
    setDismissed(true);
  };

  // ── Gate renders ───────────────────────────────────────────────
  if (variant === 'hidden') return null;

  // Both org_creator_unclaimed and not_admin are dismissable.
  // org_creator_unclaimed re-appears on next handover (bannerVersion bump).
  if (dismissed) return null;

  // ══════════════════════════════════════════════════════════════
  // VARIANT: org_creator_unclaimed
  // Founder has org_setup role. Email may or may not be verified.
  // Dismissable — founder may not be the exec and should be able
  // to opt out. Will re-appear after the next handover event.
  // ══════════════════════════════════════════════════════════════
  if (variant === 'org_creator_unclaimed') {
    return (
      <AnimatePresence>
        <BannerShell
          accent={tk.amber}
          icon={<AlertTriangle className="w-4 h-4" />}
          eyebrow="Action required — claim your role"
          onDismiss={handleDismiss}
          tk={tk}
        >
          <p className="text-sm font-bold mb-1.5" style={{ color: tk.text }}>
            Your organization is set up — now claim your actual role
          </p>
          <p className="text-xs leading-6 mb-4" style={{ color: tk.textSec }}>
            You created {orgLabel} and verified your email — that's step one.
            Now claim your real position (Class Rep, President, Treasurer, etc.)
            so your members can confirm you. Until you do, you{' '}
            <span className="font-semibold" style={{ color: tk.amber }}>
              cannot publish dues or manage payments.
            </span>
            {' '}Not the exec? Dismiss this and share the join link with whoever is.
          </p>

          {/* Step indicators */}
          <div className="flex items-center gap-2 mb-4">
            {[
              { label: 'Org created', done: true },
              // Fix: null-safe access — adminRow.verification_layer is possibly
              // undefined at runtime despite the type saying number (TS18048).
              { label: 'Email verified', done: (adminRow?.verification_layer ?? 0) >= 2 },
              { label: 'Role claimed', done: false },
              { label: 'Peers confirm', done: false },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      background: step.done ? `${tk.mint}20` : `${tk.amber}15`,
                      border: `1.5px solid ${step.done ? tk.mint : tk.amber}40`,
                    }}
                  >
                    {step.done
                      ? <ShieldCheck className="w-3 h-3" style={{ color: tk.mint }} />
                      : <span className="text-[9px] font-bold" style={{ color: tk.amber }}>{i + 1}</span>
                    }
                  </div>
                  <span
                    className="text-[10px] font-semibold hidden sm:block"
                    style={{ color: step.done ? tk.mint : tk.textTer }}
                  >
                    {step.label}
                  </span>
                </div>
                {i < 3 && (
                  <div
                    className="w-4 h-px hidden sm:block"
                    style={{ background: tk.cardBorder }}
                  />
                )}
              </div>
            ))}
          </div>

          <CtaButton label="Claim my role now" accent={tk.amber} onClick={goToClaim} />
        </BannerShell>
      </AnimatePresence>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // VARIANT: in_progress
  // Active claim. Show on first load even with 0 votes.
  // Suppress only when votes haven't changed AND user has seen
  // this state before (lastSeenVotes > 0).
  // ══════════════════════════════════════════════════════════════
  if (variant === 'in_progress' && pendingClaim) {
    if (lastSeenVotes === null) return null;

    // First arrival: lastSeenVotes=0, votes_received=0 → show banner
    // Returning visit with no new votes → suppress (not a notification)
    // New votes → always show
    if (
      pendingClaim.votes_received > 0 &&
      pendingClaim.votes_received <= lastSeenVotes
    ) return null;

    const stillNeeds = Math.max(
      0,
      pendingClaim.votes_required - pendingClaim.votes_received,
    );
    const needsEmailVerification = pendingClaim.current_layer < 2;

    return (
      <AnimatePresence>
        <BannerShell
          accent={tk.amber}
          icon={<Hourglass className="w-4 h-4" />}
          eyebrow="Verification in progress"
          tk={tk}
        >
          <p className="text-sm font-bold mb-1.5" style={{ color: tk.text }}>
            Your claim as{' '}
            <span style={{ color: tk.amber }}>{pendingClaim.position_title}</span>{' '}
            is being processed
          </p>

          {/* Layer 0–1: Email verification is the immediate next step */}
          {needsEmailVerification && (
            <div
              className="mb-3 rounded-xl px-3 py-2.5 flex items-start sm:items-center justify-between gap-3"
              style={{
                background: `${tk.primary}10`,
                border: `1px solid ${tk.primary}28`,
              }}
            >
              <p className="text-xs leading-5" style={{ color: tk.text }}>
                <span className="font-bold">Next step:</span>{' '}
                verify your school email to reach Layer 2 and unlock
                member confirmations.
              </p>
              <button
                type="button"
                onClick={() => navigate(`/${orgSlug}/verify-email`)}
                className="shrink-0 inline-flex items-center gap-1 text-xs font-bold"
                style={{ color: tk.primary }}
              >
                Verify email
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Layer 2+: Vote progress */}
          {!needsEmailVerification && (
            <p className="text-xs leading-5 mb-3" style={{ color: tk.textSec }}>
              {pendingClaim.bootstrap_path ? (
                <>
                  You need{' '}
                  <span className="font-semibold" style={{ color: tk.text }}>
                    {stillNeeds}
                  </span>{' '}
                  more member{' '}
                  {stillNeeds === 1 ? 'confirmation' : 'confirmations'} to
                  unlock admin access. Share your join link to speed this up.
                </>
              ) : (
                <>
                  Peer votes:{' '}
                  <span className="font-semibold" style={{ color: tk.text }}>
                    {pendingClaim.votes_received}
                  </span>
                  {' / '}
                  <span className="font-semibold" style={{ color: tk.text }}>
                    {pendingClaim.votes_required}
                  </span>
                  . A verified exec from your parent org will confirm once
                  they review — payment access unlocks then.
                </>
              )}
            </p>
          )}

          <VoteProgressBar
            received={pendingClaim.votes_received}
            required={pendingClaim.votes_required}
            accent={tk.amber}
            tk={tk}
          />
        </BannerShell>
      </AnimatePresence>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // VARIANT: rejected
  // Active rejection record in claim_rejections. Shows reviewer
  // reason when populated, falls back to common-causes guidance.
  // No CTA while the cooldown is active — expiry date shown instead.
  // Dismissable — same versioned key as not_admin.
  // ══════════════════════════════════════════════════════════════
  if (variant === 'rejected' && rejection) {
    const expiryDate = new Date(rejection.expires_at).toLocaleDateString(undefined, {
      day: 'numeric', month: 'short', year: 'numeric',
    });
    // Convert slug to title-case label: 'class-rep' → 'Class Rep'
    const positionLabel = rejection.target_signature
      .replace(/-/g, ' ')
      .replace(/\w/g, (c: string) => c.toUpperCase());

    return (
      <AnimatePresence>
        <BannerShell
          accent={tk.danger}
          icon={<XCircle className="w-4 h-4" />}
          eyebrow="Claim not approved"
          onDismiss={handleDismiss}
          tk={tk}
        >
          <p className="text-sm font-bold mb-1.5" style={{ color: tk.text }}>
            Your claim as{' '}
            <span style={{ color: tk.danger }}>{positionLabel}</span>{' '}
            wasn't approved
          </p>

          {rejection.reason ? (
            /* Reviewer left a specific reason — surface it directly */
            <div
              className="mb-4 rounded-xl px-3 py-2.5"
              style={{ background: `${tk.danger}0D`, border: `1px solid ${tk.danger}25` }}
            >
              <p className="text-[10px] uppercase tracking-widest font-bold mb-1" style={{ color: `${tk.danger}99` }}>
                Reviewer note
              </p>
              <p className="text-xs leading-5" style={{ color: tk.textSec }}>
                {rejection.reason}
              </p>
            </div>
          ) : (
            /* No reason stored — show common causes as guidance */
            <>
              <p className="text-xs leading-5 mb-3" style={{ color: tk.textSec }}>
                This usually happens for one of these reasons:
              </p>
              <ul className="mb-4 space-y-1.5">
                {[
                  "School email wasn't verified before the review",
                  'Not enough peer confirmations from existing members',
                  'Another member already holds this position',
                ].map((reason, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span
                      className="mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold"
                      style={{ background: `${tk.danger}18`, color: tk.danger }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-xs leading-5" style={{ color: tk.textSec }}>
                      {reason}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* No CTA while cooldown is active — show expiry date instead */}
          <p className="text-[11px] inline-flex items-center gap-1.5" style={{ color: tk.textTer }}>
            <Clock className="w-3 h-3" />
            You can reapply after{' '}
            <span className="font-semibold" style={{ color: tk.textSec }}>{expiryDate}</span>
          </p>
        </BannerShell>
      </AnimatePresence>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // VARIANT: expired
  // Most recent claim_request timed out before gathering enough
  // votes. Softer tone than rejected — no fault implied, no cooldown.
  // CTA is always shown — user can reapply immediately.
  // ══════════════════════════════════════════════════════════════
  if (variant === 'expired' && expiredClaim) {
    return (
      <AnimatePresence>
        <BannerShell
          accent={tk.amber}
          icon={<Clock className="w-4 h-4" />}
          eyebrow="Claim timed out"
          onDismiss={handleDismiss}
          tk={tk}
        >
          <p className="text-sm font-bold mb-1.5" style={{ color: tk.text }}>
            Your claim as{' '}
            <span style={{ color: tk.amber }}>{expiredClaim.position_title}</span>{' '}
            timed out
          </p>
          <p className="text-xs leading-6 mb-4" style={{ color: tk.textSec }}>
            Claims expire when they don't receive enough peer confirmations
            within the review window. This isn't a rejection — you can reapply
            at any time. To move faster, share your join link so more members
            can confirm you before the window closes.
          </p>
          <CtaButton label="Reapply" accent={tk.amber} onClick={goToClaim} />
        </BannerShell>
      </AnimatePresence>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // VARIANT: not_admin
  // ══════════════════════════════════════════════════════════════
  // VARIANT: not_admin
  // Regular member or exec who hasn't claimed yet.
  // Dismissable. Re-appears when bannerVersion bumps (handover).
  // ══════════════════════════════════════════════════════════════
  return (
    <AnimatePresence>
      <BannerShell
        accent={tk.primary}
        icon={
          isOrgCreator
            ? <PartyPopper className="w-4 h-4" />
            : <VoteIcon className="w-4 h-4" />
        }
        eyebrow={
          isOrgCreator
            ? 'You created this organization'
            : 'Are you an exec here?'
        }
        onDismiss={handleDismiss}
        tk={tk}
      >
        {isOrgCreator ? (
          <>
            <p className="text-sm font-bold mb-1.5" style={{ color: tk.text }}>
              {orgLabel} is live — want to manage it?
            </p>
            <p className="text-xs leading-6 mb-4" style={{ color: tk.textSec }}>
              If you're the class rep, president, or treasurer, claim your role
              and your members will confirm you. Once verified, you can publish
              dues, manage members, and run payouts. Not the exec? Dismiss this
              and share the join link with whoever is.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-bold mb-1.5" style={{ color: tk.text }}>
              Class rep, treasurer, or another exec?
            </p>
            <p className="text-xs leading-6 mb-4" style={{ color: tk.textSec }}>
              Claim your role and your fellow members will confirm you. Once
              verified, you can publish dues, manage members, and run payouts.
              Just here to pay your dues? Dismiss this — you can always come
              back later.
            </p>
          </>
        )}

        <CtaButton label="Claim a role" accent={tk.primary} onClick={goToClaim} />
      </BannerShell>
    </AnimatePresence>
  );
}