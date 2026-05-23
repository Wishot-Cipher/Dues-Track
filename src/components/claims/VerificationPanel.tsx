/**
 * VerificationPanel — the Layer-4 trust anchor UI (Blueprint §13.7, §13.8).
 *
 * Drops onto Dept / Faculty / SUG admin dashboards. Lists pending
 * claims at the level UNDER the caller — e.g. a dept exec sees
 * pending class-rep claims; a faculty exec sees pending dept-president
 * claims. The Confirm button calls confirmClaimByParentExec which
 * promotes the claimant to verification_layer=4 and unlocks money.
 *
 * Hides entirely when there's nothing to confirm.
 *
 * Visual: same family as VoteInbox but with stronger weight — the
 * actions here directly unlock money for an entire group, so the
 * primary CTA is amber-emphasised and a "you are confirming as
 * [Your Role]" line of accountability is shown above each card.
 */

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Vote as VoteIcon,
} from 'lucide-react';
import { organizationService } from '@/services/organizationService';
import { useToast } from '@/hooks/useToast';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';

const tk = {
  panel:    'rgba(255,255,255,0.03)',
  border:   'rgba(255,255,255,0.08)',
  text:     '#FFFFFF',
  textSec:  'rgba(255,255,255,0.65)',
  textTer:  'rgba(255,255,255,0.40)',
  primary:  '#FF6803',
  amber:    '#F59E0B',
  mint:     '#30FFAC',
  danger:   '#ef4444',
};

interface Claim {
  id: string;
  full_name: string;
  position_title: string;
  claimed_role: string;
  claimed_scope: string;
  institutional_email: string | null;
  votes_received: number;
  votes_required: number;
  current_layer: number;
  bootstrap_path: boolean;
  created_at: string;
}

export default function VerificationPanel() {
  const { user } = useMultiTenantAuth();
  const memberId = user?.id;
  const toast = useToast();

  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<{ id: string; action: 'confirm' | 'reject' } | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const refresh = useCallback(async () => {
    if (!memberId) {
      setClaims([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const list = await organizationService.listPendingConfirmationsForExec(memberId);
    setClaims(list as unknown as Claim[]);
    setLoading(false);
  }, [memberId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleConfirm = useCallback(
    async (claimId: string) => {
      if (!memberId || busy) return;
      setBusy({ id: claimId, action: 'confirm' });
      const res = await organizationService.confirmClaimByParentExec({
        claimId,
        confirmerMemberId: memberId,
      });
      setBusy(null);

      if (!res.ok) {
        toast?.error?.(res.error || 'Could not confirm.');
        return;
      }
      toast?.success?.('Confirmed — they are now a verified exec. Money is unlocked for their group.');
      setClaims((prev) => prev.filter((c) => c.id !== claimId));
    },
    [memberId, busy, toast]
  );

  const handleRejectStart = (claimId: string) => {
    setRejectingId(claimId);
    setRejectReason('');
  };

  const handleRejectCancel = () => {
    setRejectingId(null);
    setRejectReason('');
  };

  const handleRejectSubmit = useCallback(
    async (claimId: string) => {
      if (!memberId || busy) return;
      setBusy({ id: claimId, action: 'reject' });
      const res = await organizationService.rejectClaimByParentExec({
        claimId,
        confirmerMemberId: memberId,
        reason: rejectReason || undefined,
      });
      setBusy(null);
      setRejectingId(null);
      setRejectReason('');

      if (!res.ok) {
        toast?.error?.(res.error || 'Could not reject.');
        return;
      }
      toast?.info?.('Rejected. The claimant has a 90-day cooldown before they can re-claim.');
      setClaims((prev) => prev.filter((c) => c.id !== claimId));
    },
    [memberId, busy, rejectReason, toast]
  );

  if (loading || claims.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl overflow-hidden"
      style={{ background: tk.panel, border: `1px solid ${tk.border}` }}
    >
      <header
        className="flex items-center justify-between px-5 sm:px-6 py-4"
        style={{ borderBottom: `1px solid ${tk.border}` }}
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" style={{ color: tk.amber }} />
          <h2 className="text-sm font-bold text-white tracking-tight">Verify execs under you</h2>
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: `${tk.amber}18`, color: tk.amber }}
          >
            {claims.length}
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-widest" style={{ color: tk.textTer }}>
          your confirmation unlocks money
        </span>
      </header>

      <div className="divide-y" style={{ borderColor: tk.border } as React.CSSProperties}>
        <AnimatePresence initial={false}>
          {claims.map((c) => {
            const isBusy = busy?.id === c.id;
            const isRejecting = rejectingId === c.id;
            const peerPct = Math.min(
              100,
              Math.round((c.votes_received / Math.max(1, c.votes_required)) * 100)
            );
            return (
              <motion.div
                key={c.id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.22 }}
                className="px-5 sm:px-6 py-4"
              >
                {/* Top row: claimant + role + email badge */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      <span style={{ color: tk.amber }}>{c.full_name}</span>
                      <span className="font-normal" style={{ color: tk.textSec }}>
                        {' '}claims to be{' '}
                      </span>
                      <span>{c.position_title}</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span
                        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-mono uppercase"
                        style={{ background: 'rgba(255,255,255,0.05)', color: tk.textTer }}
                      >
                        scope: {c.claimed_scope}
                      </span>
                      {c.institutional_email && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: `${tk.mint}10`, color: tk.mint }}
                        >
                          <Mail className="w-2.5 h-2.5" /> {c.institutional_email}
                        </span>
                      )}
                      <span
                        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(255,255,255,0.04)', color: tk.textTer }}
                      >
                        <VoteIcon className="w-2.5 h-2.5" />
                        {c.votes_received}/{c.votes_required} peer votes
                      </span>
                    </div>
                  </div>
                </div>

                {/* Peer-vote progress (informational only at Layer 4) */}
                <div
                  className="h-1 rounded-full overflow-hidden mb-3"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: `linear-gradient(90deg, ${tk.amber}, ${tk.mint})` }}
                    initial={{ width: 0 }}
                    animate={{ width: `${peerPct}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>

                {/* Reject form */}
                {isRejecting ? (
                  <div className="rounded-xl p-3 mb-2" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.20)' }}>
                    <p className="text-[11px] font-semibold mb-2" style={{ color: tk.danger }}>
                      Why are you rejecting?
                    </p>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={2}
                      placeholder="They aren't actually our class rep / this is fake / etc."
                      className="w-full rounded-lg px-3 py-2 text-xs outline-none mb-2"
                      style={{
                        background: 'rgba(0,0,0,0.25)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: tk.text,
                      }}
                    />
                    <div className="flex items-center gap-2">
                      <motion.button
                        onClick={() => handleRejectSubmit(c.id)}
                        disabled={isBusy}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40"
                        style={{ background: tk.danger, color: 'white' }}
                        whileTap={!isBusy ? { scale: 0.97 } : undefined}
                      >
                        {isBusy && busy?.action === 'reject'
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : 'Confirm reject'}
                      </motion.button>
                      <motion.button
                        onClick={handleRejectCancel}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold"
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          color: tk.textSec,
                          border: `1px solid ${tk.border}`,
                        }}
                        whileTap={{ scale: 0.97 }}
                      >
                        Cancel
                      </motion.button>
                      <span className="text-[10px] ml-auto flex items-center gap-1" style={{ color: tk.textTer }}>
                        <AlertTriangle className="w-3 h-3" />
                        90-day cooldown applies
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <motion.button
                      onClick={() => handleConfirm(c.id)}
                      disabled={isBusy}
                      className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold disabled:opacity-40"
                      style={{
                        background: `linear-gradient(135deg, ${tk.amber}28 0%, ${tk.amber}14 100%)`,
                        color: tk.amber,
                        border: `1px solid ${tk.amber}50`,
                      }}
                      whileHover={!isBusy ? { scale: 1.02 } : undefined}
                      whileTap={!isBusy ? { scale: 0.98 } : undefined}
                    >
                      {isBusy && busy?.action === 'confirm'
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <ThumbsUp className="w-3.5 h-3.5" />}
                      Confirm & unlock money
                    </motion.button>
                    <motion.button
                      onClick={() => handleRejectStart(c.id)}
                      disabled={isBusy}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold disabled:opacity-40"
                      style={{
                        background: 'rgba(239,68,68,0.10)',
                        color: tk.danger,
                        border: '1px solid rgba(239,68,68,0.32)',
                      }}
                      whileHover={!isBusy ? { scale: 1.02 } : undefined}
                      whileTap={!isBusy ? { scale: 0.98 } : undefined}
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                      Reject
                    </motion.button>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <footer
        className="px-5 sm:px-6 py-3 flex items-center justify-between"
        style={{ borderTop: `1px solid ${tk.border}`, background: 'rgba(0,0,0,0.18)' }}
      >
        <p className="text-[10px] flex items-center gap-1.5" style={{ color: tk.textTer }}>
          <CheckCircle2 className="w-3 h-3" style={{ color: tk.amber }} />
          Confirming is Layer 4 — money flows immediately for their group.
        </p>
        <button
          onClick={refresh}
          className="text-[10px] font-semibold underline"
          style={{ color: tk.textSec }}
        >
          Refresh
        </button>
      </footer>
    </motion.section>
  );
}
