/**
 * VerificationStatusBanner — surfaces the user's current verification state
 * and the next clear action they should take.
 *
 * Four shapes (the component hides itself in any other state):
 *
 *  ┌─ REGULAR STUDENT (no exec claim, no admin row) ─────────────┐
 *  │ "You created this org — invite your people"                  │
 *  │ Invite panel with WhatsApp, Copy, Share                      │
 *  │ Dismissable after first view                                 │
 *  └──────────────────────────────────────────────────────────────┘
 *
 *  ┌─ NOT ADMIN (hasn't claimed yet) ────────────────────────────┐
 *  │ "Want to manage this organization?"                          │
 *  │ Brief explainer + [Claim a role →] button                    │
 *  │ + Invite panel below (always visible even without exec role) │
 *  └──────────────────────────────────────────────────────────────┘
 *
 *  ┌─ ADMIN, NOT YET VERIFIED (layer 0–2) ───────────────────────┐
 *  │ "Your [Founder / Treasurer / ...] role is pending"           │
 *  │ Progress: Layer X of 4 · "Money unlocks at Layer N"          │
 *  │ [Submit verification →]                                      │
 *  │ + Invite panel                                               │
 *  └──────────────────────────────────────────────────────────────┘
 *
 *  ┌─ ADMIN, PEER-VOTED BUT WAITING FOR PARENT (layer 3) ────────┐
 *  │ "Your role is peer-verified. Waiting for [parent role]."     │
 *  │ + Invite panel (bootstrap path only)                         │
 *  └──────────────────────────────────────────────────────────────┘
 *
 * Hidden entirely when the user is layer >= 4 (fully verified).
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Hourglass,
  PartyPopper,
  Vote as VoteIcon,
  X as XIcon,
} from 'lucide-react';
import { supabase } from '@/config/supabase';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';

// ─────────────────────────────────────────────────────────────────────────
// Local types
// ─────────────────────────────────────────────────────────────────────────
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

type BannerTokens = {
  primary:    string;
  amber:      string;
  mint:       string;
  blue:       string;
  border:     string;
  text:       string;
  textSec:    string;
  textTer:    string;
  danger:     string;
  card:       string;
  gradOrange: string;
  cardBorder: string;
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/** Case-insensitive partial keyword match against org type string */
function orgTypeIs(orgType: string, keywords: string[]): boolean {
  const lower = orgType.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

/**
 * Resolves a human-readable label for what was created.
 * e.g. "your 300L Civil Engineering class" or "your Mechanical Engineering department"
 */
function resolveOrgLabel({
  orgName,
  orgType,
  level,
  department,
  session,
}: {
  orgName:    string;
  orgType:    string;
  level?:     string | null;
  department?: string | null;
  session?:   string | null;
}): string {
  const sessionTag = session ? ` (${session})` : '';

  if (orgTypeIs(orgType, ['class', 'set', 'level'])) {
    const lvl = level ? `${level} ` : '';
    const dep = department ? `${department} ` : '';
    return `the *${lvl}${dep}class${sessionTag}*`;
  }
  if (orgTypeIs(orgType, ['department', 'dept'])) {
    return `the *${orgName} department${sessionTag}*`;
  }
  if (orgTypeIs(orgType, ['faculty', 'college', 'school', 'university', 'academic'])) {
    return `the *${orgName}${sessionTag}*`;
  }
  if (orgTypeIs(orgType, ['church', 'chapel', 'parish', 'mosque', 'fellowship', 'ministry'])) {
    return `*${orgName}*`;
  }
  if (orgTypeIs(orgType, ['club', 'association', 'society', 'union', 'ngo', 'cooperative'])) {
    return `*${orgName}*`;
  }
  return `*${orgName}*`;
}

// ── DELETED: buildWhatsAppMessage ────────────────────────────────────
// 200+ line org-type-branching message composer used to live here.
// ShareClassLinkCard now owns its own (simpler) share template, so
// this whole helper became dead weight. Removed in the dedup pass.

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────
export default function VerificationStatusBanner() {
  const navigate   = useNavigate();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { user, organization, group } = useMultiTenantAuth();
  const memberId = user?.id;
  const orgId    = organization?.id;

  // ── Theme ──────────────────────────────────────────────────────────────
  const { theme } = useTheme();
  const t  = getDashboardTokens(theme);
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

  const [adminRow,      setAdminRow]      = useState<AdminRow | null>(null);
  const [pendingClaim,  setPendingClaim]  = useState<PendingClaim | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [dismissed,     setDismissed]     = useState(false);
  const [lastSeenVotes, setLastSeenVotes] = useState<number | null>(null);
  // Invite state intentionally removed — ShareClassLinkCard owns it now.

  // ── Storage keys ───────────────────────────────────────────────────────
  const dismissKey = memberId && orgId
    ? `pvx_claim_banner_dismissed_${orgId}_${memberId}`
    : null;

  const progressKey = pendingClaim && memberId
    ? `pvx_claim_progress_${pendingClaim.id}_${memberId}`
    : null;

  // ── Data fetching ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!memberId || !orgId) { setLoading(false); return; }

    (async () => {
      setLoading(true);

      const { data: admins } = await supabase
        .from('member_admins')
        .select('id, role, role_label, verification_layer, verification_status, scope_level')
        .eq('member_id', memberId)
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('verification_layer', { ascending: false })
        .order('created_at',         { ascending: false })
        .limit(1);

      const { data: claims } = await supabase
        .from('claim_requests')
        .select('id, position_title, bootstrap_path, votes_received, votes_required, current_layer, required_layer')
        .eq('claimant_user_id', memberId)
        .eq('organization_id', orgId)
        .in('status', ['awaiting_votes', 'submitted', 'under_review'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (!cancelled) {
        setAdminRow((admins  ?? [])[0] as AdminRow    | null ?? null);
        setPendingClaim((claims ?? [])[0] as PendingClaim | null ?? null);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [memberId, orgId]);

  // ── Persist dismiss ────────────────────────────────────────────────────
  useEffect(() => {
    if (!dismissKey) return;
    try { setDismissed(localStorage.getItem(dismissKey) === '1'); } catch { /* ignore */ }
  }, [dismissKey]);

  // ── Vote progress tracking ─────────────────────────────────────────────
  useEffect(() => {
    if (!progressKey) { setLastSeenVotes(null); return; }
    try {
      const stored = localStorage.getItem(progressKey);
      setLastSeenVotes(stored ? Number(stored) : 0);
    } catch { setLastSeenVotes(0); }
  }, [progressKey]);

  useEffect(() => {
    if (!progressKey || !pendingClaim || lastSeenVotes === null) return;
    if (pendingClaim.votes_received > lastSeenVotes) {
      try { localStorage.setItem(progressKey, String(pendingClaim.votes_received)); }
      catch { /* ignore */ }
    }
  }, [progressKey, pendingClaim, lastSeenVotes]);

  // ── Variant resolution ─────────────────────────────────────────────────
  const variant = useMemo(() => {
    if (loading) return 'hidden';
    // Fully verified — banner not needed at all
    if (adminRow && adminRow.verification_layer >= 4) return 'hidden';
    if (pendingClaim)  return 'in_progress';
    // A founder's 'org_setup' row is a money-locked SETUP STEWARD (mig
    // 111), NOT a claimed governance role. Without this branch they'd be
    // read as an "unverified_admin awaiting verification" and the banner
    // would suppress itself — leaving the founder with no path to claim
    // their real role (class rep / president / etc.). Treat them like a
    // not_admin so the "Claim a role" CTA shows.
    if (adminRow && adminRow.role === 'org_setup') return 'not_admin';
    if (adminRow && adminRow.verification_layer < 4) return 'unverified_admin';
    return 'not_admin'; // covers both regular students and non-exec org creators
  }, [loading, adminRow, pendingClaim]);

  // Is this person acting as / trying to be an exec?
  // `isExec` (true if adminRow or pendingClaim exists) was previously
  // used to branch the not_admin copy, but variant resolution already
  // siphons those cases off (in_progress / unverified_admin / hidden),
  // so by the time we render not_admin both are always false. Removed.

  // The person who actually created this org may have done so without
  // claiming a role yet. We still surface the "claim a role" CTA to them
  // (variant = not_admin) so they aren't stuck. ShareClassLinkCard handles
  // the invite UX separately, on the dashboard below this banner.
  const isOrgCreator = Boolean(
    memberId && (organization?.created_by === memberId || organization?.founded_by_user_id === memberId)
  );

  const goToClaim = () => navigate(`/${orgSlug}/claim`);

  const handleDismiss = () => {
    if (!dismissKey) return;
    try { localStorage.setItem(dismissKey, '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  // ── Org display label (human-readable description of what was created) ─
  const orgDisplayLabel = useMemo(() => resolveOrgLabel({
    orgName:    organization?.name    || '',
    orgType:    organization?.organization_type || '',
    level:      user?.level           || group?.levels?.[0] || null,
    department: group?.name           || null,
    session:    null, // wire in academic session when available
  }), [organization, user?.level, group]);

  if (variant === 'hidden') return null;
  if (variant === 'not_admin' && dismissed) return null;
  // Previously this branch was suppressed for non-creators — meaning a
  // new exec who joined via an invite never got nudged to claim their
  // role. That left every newly-arrived class rep / treasurer / leader
  // with no on-screen path to verification. We now show the banner to
  // anyone who isn't a verified admin yet; the dismiss X lets regular
  // members hide it once if they're just here to pay dues.

  // ── Variant: in-progress claim ─────────────────────────────────────────
  if (variant === 'in_progress' && pendingClaim) {
    if (lastSeenVotes === null) return null;
    if (pendingClaim.votes_received <= lastSeenVotes) return null;

    const pct = Math.min(100, Math.round(
      (pendingClaim.votes_received / Math.max(1, pendingClaim.votes_required)) * 100,
    ));
    const stillNeeds = Math.max(0, pendingClaim.votes_required - pendingClaim.votes_received);

    return (
      <BannerShell
        accent={tk.amber}
        icon={<Hourglass className="w-4 h-4" />}
        eyebrow="Verification in progress"
        tk={tk}
      >
        <p className="text-sm font-bold mb-1" style={{ color: tk.text }}>
          Your claim as{' '}
          <span style={{ color: tk.amber }}>{pendingClaim.position_title}</span>{' '}
          is awaiting confirmation
        </p>
        <p className="text-xs leading-5 mb-3" style={{ color: tk.textSec }}>
          {pendingClaim.bootstrap_path ? (
            <>
              You need{' '}
              <span className="font-semibold" style={{ color: tk.text }}>{stillNeeds}</span>{' '}
              more member {stillNeeds === 1 ? 'confirmation' : 'confirmations'} to unlock
              admin access. Share the link below to speed this up.
            </>
          ) : (
            <>
              Peer votes:{' '}
              <span className="font-semibold" style={{ color: tk.text }}>
                {pendingClaim.votes_received}
              </span>
              /
              <span className="font-semibold" style={{ color: tk.text }}>
                {pendingClaim.votes_required}
              </span>
              . Your verified parent-org exec will confirm once they review — money unlocks then.
            </>
          )}
        </p>

        {/* Progress bar */}
        <div className="h-1 rounded-full overflow-hidden mb-1" style={{ background: t.cardBorder }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: `linear-gradient(90deg, ${tk.amber}, ${tk.mint})` }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
        <p className="text-[10px] mb-3" style={{ color: tk.textTer }}>
          {pendingClaim.votes_received} of {pendingClaim.votes_required} confirmations received
        </p>

        {/* Invite panel intentionally removed — ShareClassLinkCard
            (mounted on the dashboard right below this banner) owns the
            entire invite UX now, so there's no duplicate "Share the
            link" block. */}
      </BannerShell>
    );
  }

  // ── Variant: admin but unverified ── REMOVED ─────────────────────────
  // The legacy "Verify your role / Submit verification" CTA was retired:
  // school orgs now use the email verification banner mounted at the
  // top of the page, and other org types reach role verification through
  // the dedicated /claim page. Surfacing it here a third time was just
  // noise. We let this variant fall through to null below.
  if (variant === 'unverified_admin') return null;

  // ── Variant: not_admin ───────────────────────────────────────────────
  // Three audiences share this branch:
  //   • Org creator who hasn't claimed yet → "you set this up, claim if
  //     you want admin rights"
  //   • Fresh exec who just joined via someone's invite → "claim your
  //     role so members can confirm you"
  //   • Plain member who just joined → can dismiss; no harm in offering
  //     the option in case they ARE an exec
  // All three get one consistent CTA: Claim a role.
  return (
    <BannerShell
      accent={tk.primary}
      icon={isOrgCreator ? <PartyPopper className="w-4 h-4" /> : <VoteIcon className="w-4 h-4" />}
      eyebrow={isOrgCreator ? 'You created this org 🎉' : 'Are you an exec here?'}
      onDismiss={handleDismiss}
      tk={tk}
    >
      {isOrgCreator ? (
        <>
          <p className="text-sm font-bold mb-1" style={{ color: tk.text }}>
            {orgDisplayLabel} is ready — claim your role
          </p>
          <p className="text-xs leading-5 mb-3" style={{ color: tk.textSec }}>
            You don't HAVE to be the exec — but if you are, claim your role and members
            will confirm you. Once verified, you can publish dues, manage members, and
            track payments. Not the exec? Dismiss this and share the join code with the
            person who actually is.
          </p>
          <div className="mb-1" onClick={goToClaim} style={{ cursor: 'pointer' }}>
            <Cta label="Claim a role" accent={tk.primary} />
          </div>
        </>
      ) : (
        <>
          <p className="text-sm font-bold mb-1" style={{ color: tk.text }}>
            Class rep, treasurer, or another exec?
          </p>
          <p className="text-xs leading-5 mb-3" style={{ color: tk.textSec }}>
            Claim your role here and your fellow members will confirm you. Once verified,
            you can publish dues, manage members, and run payouts. If you're just here to
            pay your dues, dismiss this — you can always come back later.
          </p>
          <div className="mb-1" onClick={goToClaim} style={{ cursor: 'pointer' }}>
            <Cta label="Claim a role" accent={tk.primary} />
          </div>
        </>
      )}
    </BannerShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// BannerShell
// ─────────────────────────────────────────────────────────────────────────
function BannerShell({
  accent, icon, eyebrow, children, onClick, onDismiss, tk,
}: {
  accent:     string;
  icon:       React.ReactNode;
  eyebrow:    string;
  children:   React.ReactNode;
  onClick?:   () => void;
  onDismiss?: () => void;
  tk:         BannerTokens;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onClick={onClick}
      className="rounded-3xl p-5 sm:p-6 relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${accent}14 0%, ${tk.card} 100%)`,
        border:     `1px solid ${accent}30`,
        cursor:     onClick ? 'pointer' : 'default',
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 50% 60% at 100% 0%, ${accent}28, transparent)`,
        }}
      />
      <div className="relative">
        {onDismiss && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            className="absolute right-0 top-0 p-1 rounded-lg transition-opacity hover:opacity-70"
            style={{ color: `${accent}AA` }}
            aria-label="Dismiss"
          >
            <XIcon className="w-4 h-4" />
          </button>
        )}
        <div className="flex items-center gap-2 mb-2">
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: `${accent}22`, color: accent }}
          >
            {icon}
          </span>
          <p className="text-[10px] uppercase tracking-[0.18em] font-bold" style={{ color: accent }}>
            {eyebrow}
          </p>
        </div>
        {children}
      </div>
    </motion.section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Cta
// ─────────────────────────────────────────────────────────────────────────
function Cta({ label, accent }: { label: string; accent: string }) {
  return (
    <motion.span
      className="inline-flex items-center gap-1.5 text-xs font-bold"
      whileHover={{ x: 2 }}
      style={{ color: accent }}
    >
      {label}
      <ArrowRight className="w-3.5 h-3.5" />
    </motion.span>
  );
}

