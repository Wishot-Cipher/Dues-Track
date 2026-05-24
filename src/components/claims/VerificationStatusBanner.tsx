/**
 * VerificationStatusBanner — surfaces the user's current verification state
 * and the next clear action they should take.
 *
 * Three shapes (the component hides itself in any other state):
 *
 *  ┌─ NOT ADMIN ─────────────────────────────────────────────────┐
 *  │ "Want to manage this organization?"                          │
 *  │ Brief explainer + [Claim a role →] button                    │
 *  └──────────────────────────────────────────────────────────────┘
 *
 *  ┌─ ADMIN, NOT YET VERIFIED (layer 0–2) ───────────────────────┐
 *  │ "Your [Founder / Treasurer / ...] role is pending"           │
 *  │ Progress: Layer X of 4 · "Money unlocks at Layer N"          │
 *  │ [Submit verification →]                                      │
 *  └──────────────────────────────────────────────────────────────┘
 *
 *  ┌─ ADMIN, PEER-VOTED BUT WAITING FOR PARENT (layer 3) ────────┐
 *  │ "Your role is peer-verified. Waiting for [parent role]."     │
 *  │ Shown only when not bootstrap path; explains why nothing's   │
 *  │ unlocked yet.                                                │
 *  └──────────────────────────────────────────────────────────────┘
 *
 * Hidden entirely when the user is layer >= 4 (fully verified).
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Hourglass, ShieldCheck, Vote as VoteIcon, X as XIcon } from 'lucide-react';
import { supabase } from '@/config/supabase';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';

const tk = {
  primary: '#FF6803',
  amber:   '#F59E0B',
  mint:    '#30FFAC',
  blue:    '#5B9BFF',
  border:  'rgba(255,255,255,0.10)',
  text:    '#FFFFFF',
  textSec: 'rgba(255,255,255,0.65)',
  textTer: 'rgba(255,255,255,0.40)',
};

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

export default function VerificationStatusBanner() {
  const navigate = useNavigate();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { user, organization } = useMultiTenantAuth();
  const memberId = user?.id;
  const orgId = organization?.id;

  const [adminRow, setAdminRow] = useState<AdminRow | null>(null);
  const [pendingClaim, setPendingClaim] = useState<PendingClaim | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [lastSeenVotes, setLastSeenVotes] = useState<number | null>(null);

  const dismissKey = memberId && orgId
    ? `pvx_claim_banner_dismissed_${orgId}_${memberId}`
    : null;
  const progressKey = pendingClaim && memberId
    ? `pvx_claim_progress_${pendingClaim.id}_${memberId}`
    : null;

  useEffect(() => {
    let cancelled = false;
    if (!memberId || !orgId) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      // Pick the highest-layer active admin row for this user in this org
      const { data: admins } = await supabase
        .from('member_admins')
        .select('id, role, role_label, verification_layer, verification_status, scope_level')
        .eq('member_id', memberId)
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('verification_layer', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1);
      const top = (admins ?? [])[0] ?? null;

      // Any open claim the user has submitted (so we can show progress)
      const { data: claims } = await supabase
        .from('claim_requests')
        .select('id, position_title, bootstrap_path, votes_received, votes_required, current_layer, required_layer')
        .eq('claimant_user_id', memberId)
        .eq('organization_id', orgId)
        .in('status', ['awaiting_votes', 'submitted', 'under_review'])
        .order('created_at', { ascending: false })
        .limit(1);
      const claim = (claims ?? [])[0] ?? null;

      if (!cancelled) {
        setAdminRow(top as AdminRow | null);
        setPendingClaim(claim as PendingClaim | null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [memberId, orgId]);

  useEffect(() => {
    if (!dismissKey) return;
    try {
      setDismissed(localStorage.getItem(dismissKey) === '1');
    } catch {
      // ignore storage errors
    }
  }, [dismissKey]);

  useEffect(() => {
    if (!progressKey) {
      setLastSeenVotes(null);
      return;
    }
    try {
      const stored = localStorage.getItem(progressKey);
      setLastSeenVotes(stored ? Number(stored) : 0);
    } catch {
      setLastSeenVotes(0);
    }
  }, [progressKey]);

  useEffect(() => {
    if (!progressKey || !pendingClaim) return;
    if (lastSeenVotes === null) return;
    if (pendingClaim.votes_received > lastSeenVotes) {
      try {
        localStorage.setItem(progressKey, String(pendingClaim.votes_received));
      } catch {
        // ignore storage errors
      }
    }
  }, [progressKey, pendingClaim, lastSeenVotes]);

  const variant = useMemo(() => {
    if (loading) return 'hidden';
    // Fully verified — nothing to nag
    if (adminRow && adminRow.verification_layer >= 4) return 'hidden';
    // Has an open claim → show progress card
    if (pendingClaim) return 'in_progress';
    // Is an admin but not verified → show "verify your role" CTA
    if (adminRow && adminRow.verification_layer < 4) return 'unverified_admin';
    // Not an admin at all → show "claim a role" CTA
    return 'not_admin';
  }, [loading, adminRow, pendingClaim]);

  if (variant === 'hidden') return null;
  if (variant === 'not_admin' && dismissed) return null;

  const goToClaim = () => navigate(`/${orgSlug}/claim`);
  const handleDismiss = () => {
    if (!dismissKey) return;
    try { localStorage.setItem(dismissKey, '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  // ── Variant: in-progress claim ──
  if (variant === 'in_progress' && pendingClaim) {
    if (lastSeenVotes === null) return null;
    if (pendingClaim.votes_received <= lastSeenVotes) return null;
    const pct = Math.min(
      100,
      Math.round((pendingClaim.votes_received / Math.max(1, pendingClaim.votes_required)) * 100)
    );
    const stillNeeds = Math.max(0, pendingClaim.votes_required - pendingClaim.votes_received);
    return (
      <BannerShell accent={tk.amber} icon={<Hourglass className="w-4 h-4" />} eyebrow="Verification in progress">
        <p className="text-sm font-bold text-white mb-1">
          Your claim as <span style={{ color: tk.amber }}>{pendingClaim.position_title}</span> is awaiting confirmation
        </p>
        <p className="text-xs leading-5 mb-3" style={{ color: tk.textSec }}>
          {pendingClaim.bootstrap_path
            ? <>You need <span className="text-white font-semibold">{stillNeeds}</span> more classmate {stillNeeds === 1 ? 'confirmation' : 'confirmations'} to unlock admin access for everyone.</>
            : <>Peer votes: <span className="text-white font-semibold">{pendingClaim.votes_received}</span>/<span className="text-white font-semibold">{pendingClaim.votes_required}</span>. Your verified parent-org exec will confirm once they review — money unlocks then.</>}
        </p>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: `linear-gradient(90deg, ${tk.amber}, ${tk.mint})` }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      </BannerShell>
    );
  }

  // ── Variant: admin but unverified (e.g. founder freshly out of bring-school) ──
  if (variant === 'unverified_admin' && adminRow) {
    const roleLabel = adminRow.role_label || adminRow.role || 'admin';
    return (
      <BannerShell
        accent={tk.amber}
        icon={<ShieldCheck className="w-4 h-4" />}
        eyebrow="Verify your role"
        onClick={goToClaim}
      >
        <p className="text-sm font-bold text-white mb-1">
          Your <span style={{ color: tk.amber }}>{roleLabel}</span> role isn't verified yet
        </p>
        <p className="text-xs leading-5 mb-3" style={{ color: tk.textSec }}>
          You're set up as an admin but can't publish dues or move money until you verify.
          Submit your verification, get classmates to confirm, and you're unlocked.
        </p>
        <Cta label="Submit verification" />
      </BannerShell>
    );
  }

  // ── Variant: not admin → invite to claim ──
  return (
    <BannerShell
      accent={tk.primary}
      icon={<VoteIcon className="w-4 h-4" />}
      eyebrow="Help run this organization"
      onClick={goToClaim}
      onDismiss={handleDismiss}
    >
      <p className="text-sm font-bold text-white mb-1">
        Are you the {organization?.payment_label?.toLowerCase().includes('tithe') ? 'treasurer' : 'class rep'},
        a treasurer, or another exec?
      </p>
      <p className="text-xs leading-5 mb-3" style={{ color: tk.textSec }}>
        Claim your role and we'll get your fellow members to confirm. Once verified, you can publish
        dues, manage members, and track payments.
      </p>
      <Cta label="Claim a role" />
    </BannerShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Layout shell — keeps all three variants visually consistent
// ─────────────────────────────────────────────────────────────────────────
function BannerShell({
  accent,
  icon,
  eyebrow,
  children,
  onClick,
  onDismiss,
}: {
  accent: string;
  icon: React.ReactNode;
  eyebrow: string;
  children: React.ReactNode;
  onClick?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onClick={onClick}
      className="rounded-3xl p-5 sm:p-6 relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${accent}14 0%, rgba(255,255,255,0.02) 100%)`,
        border: `1px solid ${accent}30`,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 50% 60% at 100% 0%, ${accent}28, transparent)` }}
      />
      <div className="relative">
        {onDismiss && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="absolute right-0 top-0 p-1 rounded-lg"
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
          <p
            className="text-[10px] uppercase tracking-[0.18em] font-bold"
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

function Cta({ label }: { label: string }) {
  return (
    <motion.span
      className="inline-flex items-center gap-1.5 text-xs font-bold"
      whileHover={{ x: 2 }}
      style={{ color: tk.amber }}
    >
      {label}
      <ArrowRight className="w-3.5 h-3.5" />
    </motion.span>
  );
}
