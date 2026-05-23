/**
 * VoteInbox — shows pending claims the current member can vote on.
 *
 * Drops into any logged-in surface (StudentDashboardPage primarily).
 * Hides itself entirely when there's nothing to vote on, so it's
 * non-disruptive on the happy path.
 *
 * Each claim card:
 *   • Who is claiming what role
 *   • Progress bar (X of Y confirmations)
 *   • Three buttons: Confirm / Reject / Skip
 *
 * Vote → calls cast_claim_vote RPC. When the threshold is met, the
 * RPC auto-promotes the claimant (we just show a celebratory toast).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Vote,
  X as XIcon,
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
  mint:     '#30FFAC',
  danger:   '#ef4444',
  blue:     '#5B9BFF',
};

interface Claim {
  id: string;
  full_name: string;
  position_title: string;
  claimed_role: string;
  claimed_scope: string;
  votes_required: number;
  votes_received: number;
  vote_deadline: string;
  created_at: string;
}

export default function VoteInbox() {
  const { user } = useMultiTenantAuth();
  const memberId = user?.id;
  const toast = useToast();

  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState<string | null>(null);  // claim id mid-vote

  const refresh = useCallback(async () => {
    if (!memberId) {
      setClaims([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const list = await organizationService.listOpenClaimsForVoter(memberId);
    setClaims(list);
    setLoading(false);
  }, [memberId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleVote = useCallback(
    async (claimId: string, vote: 'confirm' | 'reject' | 'abstain') => {
      if (!memberId || voting) return;
      setVoting(claimId);
      const res = await organizationService.castClaimVote({
        claimId,
        voterMemberId: memberId,
        vote,
      });
      setVoting(null);

      if (!res.ok) {
        toast?.error?.(res.error || 'Could not record your vote.');
        return;
      }

      if (res.finalize?.approved) {
        toast?.success?.('Your vote pushed them over the line — they are now a verified admin.');
      } else if (vote === 'confirm') {
        const got = res.finalize?.votes_received ?? 0;
        const need = res.finalize?.votes_required ?? 0;
        toast?.success?.(`Vote recorded. ${got} of ${need} confirmations.`);
      } else if (vote === 'reject') {
        toast?.info?.('Rejection recorded.');
      } else {
        toast?.info?.('Skipped.');
      }
      // optimistic: remove the claim we just voted on
      setClaims((prev) => prev.filter((c) => c.id !== claimId));
    },
    [memberId, voting, toast]
  );

  const visibleClaims = useMemo(() => claims.slice(0, 5), [claims]);

  // Hide entirely when there's nothing actionable
  if (loading) return null;
  if (visibleClaims.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl overflow-hidden"
      style={{ background: tk.panel, border: `1px solid ${tk.border}` }}
    >
      <header className="flex items-center justify-between px-5 sm:px-6 py-4"
        style={{ borderBottom: `1px solid ${tk.border}` }}>
        <div className="flex items-center gap-2">
          <Vote className="w-4 h-4" style={{ color: tk.primary }} />
          <h2 className="text-sm font-bold text-white tracking-tight">Verify your execs</h2>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: `${tk.primary}18`, color: tk.primary }}>
            {claims.length}
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-widest" style={{ color: tk.textTer }}>
          your vote matters
        </span>
      </header>

      <div className="divide-y" style={{ borderColor: tk.border } as React.CSSProperties}>
        <AnimatePresence initial={false}>
          {visibleClaims.map((c) => {
            const isBusy = voting === c.id;
            const pct = Math.min(100, Math.round((c.votes_received / Math.max(1, c.votes_required)) * 100));
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
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      <span style={{ color: tk.primary }}>{c.full_name}</span>
                      <span className="font-normal" style={{ color: tk.textSec }}> claims to be your</span>{' '}
                      <span>{c.position_title}</span>
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: tk.textTer }}>
                      Scope: {c.claimed_scope} · {c.votes_received} of {c.votes_required} confirmed
                    </p>
                  </div>
                  <ShieldCheck className="w-4 h-4 shrink-0" style={{ color: tk.textTer }} />
                </div>

                {/* Progress bar */}
                <div
                  className="h-1 rounded-full overflow-hidden mb-3"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: `linear-gradient(90deg, ${tk.primary}, ${tk.mint})` }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <motion.button
                    onClick={() => handleVote(c.id, 'confirm')}
                    disabled={isBusy}
                    className="flex-1 min-w-[110px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-40"
                    style={{
                      background: `linear-gradient(135deg, ${tk.mint}22 0%, ${tk.mint}10 100%)`,
                      color: tk.mint,
                      border: `1px solid ${tk.mint}40`,
                    }}
                    whileHover={!isBusy ? { scale: 1.02 } : undefined}
                    whileTap={!isBusy ? { scale: 0.98 } : undefined}
                  >
                    {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                    Confirm
                  </motion.button>
                  <motion.button
                    onClick={() => handleVote(c.id, 'reject')}
                    disabled={isBusy}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-40"
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
                  <motion.button
                    onClick={() => handleVote(c.id, 'abstain')}
                    disabled={isBusy}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-40"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      color: tk.textSec,
                      border: `1px solid ${tk.border}`,
                    }}
                    whileHover={!isBusy ? { scale: 1.02 } : undefined}
                    whileTap={!isBusy ? { scale: 0.98 } : undefined}
                  >
                    <XIcon className="w-3.5 h-3.5" />
                    Skip
                  </motion.button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {claims.length > visibleClaims.length && (
        <div className="px-5 sm:px-6 py-3 text-center" style={{ borderTop: `1px solid ${tk.border}` }}>
          <p className="text-[11px]" style={{ color: tk.textTer }}>
            {claims.length - visibleClaims.length} more after these.
          </p>
        </div>
      )}
    </motion.section>
  );
}
