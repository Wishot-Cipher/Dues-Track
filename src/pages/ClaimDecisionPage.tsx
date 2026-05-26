/**
 * ClaimDecisionPage — landing page for `claim_vote_requested` and
 * `claim_confirm_requested` notifications.
 *
 * Route: /:orgSlug/claim/:claimId/decide
 *
 * One URL, two possible actions — chosen by what the viewer is allowed
 * to do (re-checked server-side by the RPCs):
 *
 *   • Peer voter (eligible member in target scope, not the claimant):
 *     Confirm / Reject / Skip
 *     → cast_claim_vote_v2
 *   • Verified parent-org exec (layer >= 4): the authoritative confirm action
 *     → confirm_claim_by_parent_exec / reject_claim_by_parent_exec
 *
 * If a viewer happens to be both (e.g. dept exec voting in their own dept's
 * class claim), both action groups render and the user can choose.
 *
 * Self-claim, already-voted, or resolved-claim states render a read-only view.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle, ArrowLeft, CheckCircle2, Hourglass, Loader2,
  ShieldCheck, ThumbsDown, ThumbsUp, Vote as VoteIcon, X as XIcon,
} from 'lucide-react';
import { supabase } from '@/config/supabase';
import { organizationService } from '@/services/organizationService';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useToast } from '@/hooks/useToast';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
import PayvexoBackground from '@/components/student/dashboard/PayvexoBackground';

type ClaimTheme = {
  bg: string;
  panel: string;
  border: string;
  text: string;
  textSec: string;
  textTer: string;
  primary: string;
  mint: string;
  amber: string;
  danger: string;
  gradOrange: string;
  primarySoft: string;
  inputBg: string;
  inputBorder: string;
  inputBorderHov: string;
  isLight: boolean;
};

interface ClaimRow {
  id: string;
  organization_id: string;
  claimant_user_id: string;
  full_name: string;
  position_title: string;
  claimed_role: string;
  claimed_scope: 'org' | 'unit' | 'group';
  claimed_group_id: string | null;
  claimed_unit_group_id: string | null;
  bootstrap_path: boolean;
  votes_required: number;
  votes_received: number;
  current_layer: number;
  required_layer: number;
  status: string;
  vote_deadline: string | null;
  created_at: string;
}

interface MyVote {
  vote: 'confirm' | 'reject' | 'abstain';
  comment: string | null;
  created_at: string;
}

interface ConfirmerCapability {
  can_confirm: boolean;
  reason: string | null;  // e.g. "not a verified parent exec"
}

export default function ClaimDecisionPage() {
  const { orgSlug, claimId } = useParams<{ orgSlug: string; claimId: string }>();
  const navigate = useNavigate();
  const { user, organization } = useMultiTenantAuth();
  const toast = useToast();
  const { theme } = useTheme();
  const t = getDashboardTokens(theme);
  const tk: ClaimTheme = {
    bg: t.bg,
    panel: t.card,
    border: t.cardBorder,
    text: t.text,
    textSec: t.textSec,
    textTer: t.textTer,
    primary: t.primary,
    mint: t.mint,
    amber: t.amber,
    danger: t.danger,
    gradOrange: t.gradOrange,
    primarySoft: t.primarySoft,
    inputBg: theme === 'light' ? '#FFFFFF' : 'rgba(26,14,9,0.85)',
    inputBorder: theme === 'light' ? 'rgba(15, 7, 3, 0.12)' : t.cardBorder,
    inputBorderHov: t.primaryRing,
    isLight: theme === 'light',
  };

  const [claim, setClaim] = useState<ClaimRow | null>(null);
  const [myVote, setMyVote] = useState<MyVote | null>(null);
  const [confirmerCap, setConfirmerCap] = useState<ConfirmerCapability>({ can_confirm: false, reason: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'confirm' | 'reject' | 'abstain' | 'parent_confirm' | 'parent_reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectReason, setShowRejectReason] = useState(false);

  // ── Load the claim + current viewer's vote status + parent-exec capability
  const refresh = useCallback(async () => {
    if (!claimId || !user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    // Use maybeSingle() — when a claim is missing OR RLS hides it,
    // PostgREST returns 0 rows; .single() throws "Cannot coerce…"
    // which renders as a scary "Claim not found" error. maybeSingle
    // returns null cleanly and we control the messaging.
    const { data: claimRow, error: claimErr } = await supabase
      .from('claim_requests')
      .select('id, organization_id, claimant_user_id, full_name, position_title, claimed_role, claimed_scope, claimed_group_id, claimed_unit_group_id, bootstrap_path, votes_required, votes_received, current_layer, required_layer, status, vote_deadline, created_at')
      .eq('id', claimId)
      .maybeSingle();

    if (claimErr) {
      setError(claimErr.message);
      setClaim(null);
      setLoading(false);
      return;
    }
    if (!claimRow) {
      setError('This claim is no longer available. It may have been resolved or withdrawn.');
      setClaim(null);
      setLoading(false);
      return;
    }
    setClaim(claimRow as ClaimRow);

    // Already voted?
    const { data: voteRow } = await supabase
      .from('claim_votes')
      .select('vote, comment, created_at')
      .eq('claim_request_id', claimId)
      .eq('voter_member_id', user.id)
      .maybeSingle();
    setMyVote((voteRow as MyVote | null) ?? null);

    // Parent-exec capability check (client-side hint only — RPC enforces).
    // The DB rule: a member_admin with verification_layer >= 4 at the target's
    // parent group (or org scope) can confirm. We don't replicate that whole
    // tree here — we just check "do I have a layer-4 admin row in this org?"
    // and let the RPC make the authoritative scope decision.
    const { data: maRows } = await supabase
      .from('member_admins')
      .select('id, verification_layer, scope_level, group_id')
      .eq('member_id', user.id)
      .eq('organization_id', (claimRow as ClaimRow).organization_id)
      .eq('is_active', true)
      .gte('verification_layer', 4);
    const hasLayer4 = Array.isArray(maRows) && maRows.length > 0;
    const isSelfClaim = (claimRow as ClaimRow).claimant_user_id === user.id;
    setConfirmerCap({
      can_confirm: hasLayer4 && !isSelfClaim && !(claimRow as ClaimRow).bootstrap_path,
      reason: isSelfClaim
        ? "You can't confirm your own claim."
        : (claimRow as ClaimRow).bootstrap_path
          ? "Bootstrap claims auto-finalize on peer votes alone."
          : !hasLayer4
            ? "Only verified parent-org execs can confirm."
            : null,
    });

    setLoading(false);
  }, [claimId, user?.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  const pct = useMemo(() => {
    if (!claim) return 0;
    return Math.min(100, Math.round((claim.votes_received / Math.max(1, claim.votes_required)) * 100));
  }, [claim]);

  const isSelfClaim = claim && user?.id && claim.claimant_user_id === user.id;
  const isResolved = claim && !['awaiting_votes', 'submitted', 'under_review'].includes(claim.status);

  // ── Actions ──
  const handlePeerVote = useCallback(async (vote: 'confirm' | 'reject' | 'abstain') => {
    if (!claim || !user?.id || busy) return;
    setBusy(vote);
    setError(null);
    const res = await organizationService.castClaimVoteV2({
      claimId: claim.id,
      voterMemberId: user.id,
      vote,
    });
    setBusy(null);
    if (!res.ok) {
      setError(res.error ?? 'Could not record your vote.');
      return;
    }
    if (res.promoted) {
      toast?.success?.('Your vote pushed them over the threshold — they are verified.');
      navigate(`/${orgSlug}/dashboard`);
      return;
    }
    if (vote === 'confirm') {
      const tail = res.bootstrap_path
        ? `${res.votes_received ?? 0} of ${res.votes_required ?? 0} confirmations.`
        : `${res.votes_received ?? 0} of ${res.votes_required ?? 0} peer votes — money unlocks once their parent exec confirms.`;
      toast?.success?.(`Vote recorded. ${tail}`);
    } else if (vote === 'reject') {
      toast?.info?.('Rejection recorded.');
    } else {
      toast?.info?.('Skipped.');
    }
    void refresh();
  }, [claim, user?.id, busy, orgSlug, navigate, toast, refresh]);

  const handleParentConfirm = useCallback(async () => {
    if (!claim || !user?.id || busy) return;
    setBusy('parent_confirm');
    setError(null);
    const res = await organizationService.confirmClaimByParentExec({
      claimId: claim.id,
      confirmerMemberId: user.id,
    });
    setBusy(null);
    if (!res.ok) {
      setError(res.error ?? 'Could not confirm this claim.');
      return;
    }
    toast?.success?.('Claim confirmed. Money is now unlocked for the new exec.');
    navigate(`/${orgSlug}/dashboard`);
  }, [claim, user?.id, busy, orgSlug, navigate, toast]);

  const handleParentReject = useCallback(async () => {
    if (!claim || !user?.id || busy) return;
    if (!rejectReason.trim()) {
      setShowRejectReason(true);
      return;
    }
    setBusy('parent_reject');
    setError(null);
    const res = await organizationService.rejectClaimByParentExec({
      claimId: claim.id,
      confirmerMemberId: user.id,
      reason: rejectReason.trim(),
    });
    setBusy(null);
    if (!res.ok) {
      setError(res.error ?? 'Could not reject this claim.');
      return;
    }
    toast?.info?.('Claim rejected. The claimant will be notified.');
    navigate(`/${orgSlug}/dashboard`);
  }, [claim, user?.id, busy, rejectReason, orgSlug, navigate, toast]);

  // ── Render gates ──
  if (loading) {
    return (
      <Centered theme={theme}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: tk.primary }} />
      </Centered>
    );
  }

  if (!user || !organization) {
    return (
      <Centered theme={theme}>
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-3" style={{ color: tk.text }}>Sign in first</h1>
          <p className="text-sm leading-6 mb-6" style={{ color: tk.textSec }}>
            You must be signed in to act on a claim.
          </p>
          <motion.button
            onClick={() => navigate(orgSlug ? `/${orgSlug}/login` : '/')}
            className="px-6 py-3 rounded-xl font-semibold text-sm text-white"
            style={{ background: tk.gradOrange }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            Sign in
          </motion.button>
        </div>
      </Centered>
    );
  }

  if (!claim) {
    return (
      <Centered theme={theme}>
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: tk.amber }} />
          <h1 className="text-xl font-bold mb-2" style={{ color: tk.text }}>Claim not found</h1>
          <p className="text-sm leading-6 mb-6" style={{ color: tk.textSec }}>
            {error ?? "This claim has been removed or you don't have access to view it."}
          </p>
          <motion.button
            onClick={() => navigate(`/${orgSlug}/dashboard`)}
            className="px-6 py-3 rounded-xl font-semibold text-sm text-white"
            style={{ background: tk.gradOrange }}
          >
            Back to dashboard
          </motion.button>
        </div>
      </Centered>
    );
  }

  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{ minHeight: '100dvh' }}>
      <PayvexoBackground theme={theme} />

      <nav className="relative z-10 max-w-2xl mx-auto px-5 sm:px-6 py-5 flex items-center justify-between">
        <button
          onClick={() => navigate(`/${orgSlug}/dashboard`)}
          className="flex items-center gap-2 text-sm font-medium" style={{ color: tk.textSec }}
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </nav>

      <header className="relative z-10 max-w-2xl mx-auto px-5 sm:px-6 pt-2 pb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-4"
          style={{ background: tk.primarySoft, color: tk.primary, border: `1px solid ${tk.primary}28` }}>
          {confirmerCap.can_confirm ? <ShieldCheck className="w-3.5 h-3.5" /> : <VoteIcon className="w-3.5 h-3.5" />}
          {confirmerCap.can_confirm ? 'Parent-exec confirmation' : 'Peer vote requested'}
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight" style={{ color: tk.text }}>
          <span style={{ color: tk.primary }}>{claim.full_name}</span>{' '}
          <span className="font-normal" style={{ color: tk.textSec }}>claims to be your</span>{' '}
          <span style={{ color: tk.text }}>{claim.position_title}</span>
        </h1>
        <p className="text-sm mt-3" style={{ color: tk.textSec }}>
          {claim.bootstrap_path
            ? <>This is a bootstrap claim — once <span className="font-semibold" style={{ color: tk.text }}>{claim.votes_required}</span> members confirm, they're verified and money unlocks for everyone.</>
            : <>Peer votes strengthen the signal. The verified parent exec gives the final yes — that's the moment money unlocks.</>}
        </p>
      </header>

      <main className="relative z-10 max-w-2xl mx-auto px-5 sm:px-6 pb-24 space-y-5">
        {/* Progress panel */}
        <Panel title="Verification progress" icon={<Hourglass className="w-4 h-4" />} tk={tk}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-widest" style={{ color: tk.textTer }}>
              Peer confirmations
            </span>
            <span className="text-sm font-bold" style={{ color: tk.text }}>
              {claim.votes_received} <span style={{ color: tk.textTer }}>/</span> {claim.votes_required}
            </span>
          </div>
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ background: tk.isLight ? 'rgba(15,7,3,0.08)' : 'rgba(255,255,255,0.06)' }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${tk.primary}, ${tk.mint})` }}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
            <Stat label="Scope" value={claim.claimed_scope} tk={tk} />
            <Stat label="Status" value={claim.status.replace(/_/g, ' ')} tk={tk} />
            <Stat label="Trust layer" value={`${claim.current_layer} of ${claim.required_layer}`} tk={tk} />
            <Stat label="Path" value={claim.bootstrap_path ? 'Bootstrap' : 'Standard'} tk={tk} />
          </div>
        </Panel>

        {/* Read-only states */}
        {isResolved && (
          <Panel title="This claim is closed" icon={<CheckCircle2 className="w-4 h-4" />} tk={tk}>
            <p className="text-sm" style={{ color: tk.textSec }}>
              Status: <span className="font-semibold" style={{ color: tk.text }}>{claim.status.replace(/_/g, ' ')}</span>. No more action is needed.
            </p>
          </Panel>
        )}

        {isSelfClaim && !isResolved && (
          <Panel title="This is your own claim" icon={<Hourglass className="w-4 h-4" />} tk={tk}>
            <p className="text-sm" style={{ color: tk.textSec }}>
              You'll be notified automatically when it crosses the threshold. Share your org with members so they can vote.
            </p>
          </Panel>
        )}

        {myVote && !isSelfClaim && !isResolved && (
          <Panel title="You've already voted" icon={<CheckCircle2 className="w-4 h-4" />} tk={tk}>
            <p className="text-sm" style={{ color: tk.textSec }}>
              Your vote: <span className="font-semibold capitalize" style={{ color: tk.text }}>{myVote.vote}</span>. You can change it below.
            </p>
          </Panel>
        )}

        {/* Peer-vote actions — hidden when self-claim or resolved */}
        {!isSelfClaim && !isResolved && (
          <Panel title="Your vote" icon={<VoteIcon className="w-4 h-4" />} tk={tk}>
            <p className="text-xs mb-4" style={{ color: tk.textSec }}>
              Do you recognise <span className="font-semibold" style={{ color: tk.text }}>{claim.full_name}</span> as your{' '}
              <span className="font-semibold" style={{ color: tk.text }}>{claim.position_title}</span>?
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <ActionButton
                tone="mint"
                label="Confirm"
                icon={<ThumbsUp className="w-4 h-4" />}
                busy={busy === 'confirm'}
                disabled={!!busy}
                tk={tk}
                onClick={() => handlePeerVote('confirm')}
              />
              <ActionButton
                tone="danger"
                label="Reject"
                icon={<ThumbsDown className="w-4 h-4" />}
                busy={busy === 'reject'}
                disabled={!!busy}
                tk={tk}
                onClick={() => handlePeerVote('reject')}
              />
              <ActionButton
                tone="muted"
                label="Skip"
                icon={<XIcon className="w-4 h-4" />}
                busy={busy === 'abstain'}
                disabled={!!busy}
                tk={tk}
                onClick={() => handlePeerVote('abstain')}
              />
            </div>
          </Panel>
        )}

        {/* Parent-exec confirmation block */}
        {confirmerCap.can_confirm && !isResolved && (
          <Panel title="Parent-exec confirmation" icon={<ShieldCheck className="w-4 h-4" />} tk={tk}>
            <p className="text-xs mb-4" style={{ color: tk.textSec }}>
              As a verified parent-org exec, your confirmation is the trust anchor.
              Confirming unlocks money flow for the claimant.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <ActionButton
                tone="primary"
                label="Confirm as parent exec"
                icon={<ShieldCheck className="w-4 h-4" />}
                busy={busy === 'parent_confirm'}
                disabled={!!busy}
                tk={tk}
                onClick={handleParentConfirm}
              />
              <ActionButton
                tone="danger"
                label={showRejectReason ? 'Submit rejection' : 'Reject'}
                icon={<ThumbsDown className="w-4 h-4" />}
                busy={busy === 'parent_reject'}
                disabled={!!busy || (showRejectReason && !rejectReason.trim())}
                tk={tk}
                onClick={handleParentReject}
              />
            </div>
            <AnimatePresence>
              {showRejectReason && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4"
                >
                  <label className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: tk.textSec }}>
                    Reason (required) — visible to the claimant
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="e.g. This person is not the actual class rep."
                    rows={3}
                    className="w-full mt-1.5 rounded-xl px-3 py-2 text-sm outline-none"
                    style={{ background: tk.inputBg, border: `1px solid ${tk.inputBorder}`, color: tk.text }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </Panel>
        )}

        {!confirmerCap.can_confirm && confirmerCap.reason && !isSelfClaim && !isResolved && (
          <p className="text-xs px-1" style={{ color: tk.textTer }}>
            {confirmerCap.reason}
          </p>
        )}

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="rounded-xl px-4 py-3 flex items-start gap-3"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
            >
              <AlertCircle className="w-5 h-5 shrink-0" style={{ color: tk.danger, marginTop: 1 }} />
              <p className="text-sm leading-6" style={{ color: 'rgba(254,202,202,0.95)' }}>{error}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Small presentational helpers
// ─────────────────────────────────────────────────────────────────────

function Panel({ title, icon, children, tk }: { title: string; icon?: React.ReactNode; children: React.ReactNode; tk: ClaimTheme }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl p-5 sm:p-6"
      style={{ background: tk.panel, border: `1px solid ${tk.border}` }}
    >
      <h2 className="flex items-center gap-2 text-base font-bold mb-4" style={{ color: tk.text }}>
        {icon && (
          <span className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: `${tk.primary}15`, color: tk.primary }}>{icon}</span>
        )}
        {title}
      </h2>
      <div>{children}</div>
    </motion.section>
  );
}

function Stat({ label, value, tk }: { label: string; value: string | number; tk: ClaimTheme }) {
  return (
    <div
      className="rounded-xl px-3 py-2"
      style={{
        background: tk.isLight ? '#FFFFFF' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${tk.border}`,
      }}
    >
      <p className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: tk.textTer }}>{label}</p>
      <p className="text-sm font-bold capitalize" style={{ color: tk.text }}>{value}</p>
    </div>
  );
}

function ActionButton({
  tone, label, icon, busy, disabled, onClick, tk,
}: {
  tone: 'primary' | 'mint' | 'danger' | 'muted';
  label: string;
  icon: React.ReactNode;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
  tk: ClaimTheme;
}) {
  const tones = {
    primary: { bg: tk.gradOrange, color: '#FFFFFF', border: 'transparent' },
    mint:    { bg: `linear-gradient(135deg, ${tk.mint}22 0%, ${tk.mint}10 100%)`, color: tk.mint, border: `${tk.mint}40` },
    danger:  { bg: 'rgba(239,68,68,0.10)', color: tk.danger, border: 'rgba(239,68,68,0.32)' },
    muted:   { bg: tk.isLight ? '#F5F1ED' : 'rgba(255,255,255,0.04)', color: tk.textSec, border: tk.border },
  }[tone];
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40"
      style={{ background: tones.bg, color: tones.color, border: `1px solid ${tones.border}` }}
      whileHover={!disabled ? { scale: 1.02 } : undefined}
      whileTap={!disabled ? { scale: 0.98 } : undefined}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {label}
    </motion.button>
  );
}

function Centered({ children, theme }: { children: React.ReactNode; theme: 'light' | 'dark' }) {
  return (
    <div className="min-h-screen relative flex items-center justify-center px-5" style={{ minHeight: '100dvh' }}>
      <PayvexoBackground theme={theme} />
      <div className="relative z-10 w-full max-w-md flex flex-col items-center">{children}</div>
    </div>
  );
}
