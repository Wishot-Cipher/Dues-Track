/**
 * ClaimStatusCard — shows a claimant their own verification progress under the
 * graduated-trust model (migration 060). It reads get_claim_status, which runs
 * the decision tree server-side, so it always reflects the live path:
 *   independent | awaiting_higher_exec | bootstrap (pre/post 72h) | approved.
 *
 * Surfaces vote progress, the 72h window, and the "Request platform review"
 * escape valve once eligible (7 days stuck).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Loader2, Vote, Clock, CheckCircle2, LifeBuoy, Hourglass } from 'lucide-react';
import { supabase } from '@/config/supabase';
import { organizationService } from '@/services/organizationService';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useToast } from '@/hooks/useToast';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';

interface Status {
  ok: boolean;
  status?: string;
  path?: string;
  granted?: boolean;
  position_title?: string;
  grant_method?: string | null;
  votes_received?: number;
  votes_required?: number;
  current_layer?: number;
  window_hours_elapsed?: number;
  bootstrap_window_over?: boolean;
  can_request_platform_review?: boolean;
  platform_review_requested?: boolean;
}

export default function ClaimStatusCard({ claimId }: { claimId: string }) {
  const { user, refreshSession } = useMultiTenantAuth();
  const toast = useToast();
  const { theme } = useTheme();
  const t = getDashboardTokens(theme);

  // Theme tokens — derived from the live theme so the card adapts to
  // light/dark and any custom palette the org has set.
  const tk = {
    panel:    t.card,
    border:   t.cardBorder,
    text:     t.text,
    textSec:  t.textSec,
    textTer:  t.textTer,
    primary:  t.primary,
    mint:     t.mint,
    amber:    t.amber,
    danger:   t.danger,
  };

  const [s, setS] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  // Track whether we've already triggered a session refresh for this approval
  const refreshedRef = useRef(false);

  const load = useCallback(async () => {
    const res = (await organizationService.getClaimStatus(claimId)) as Status;
    setS(res);
    setLoading(false);

    // When the claim is newly approved and session hasn't refreshed yet,
    // call refreshSession() so the auth context picks up the new member_admins
    // row (updated verification_layer, can_create_payments, etc.) without
    // requiring the user to log out.
    if ((res.status === 'approved' || res.granted) && !refreshedRef.current) {
      refreshedRef.current = true;
      try {
        await refreshSession();
        toast?.success?.('Your exec role is now verified — admin access is live.');
      } catch {
        // Non-critical: user can refresh the page if needed
      }
    }
  }, [claimId, refreshSession, toast]);

  useEffect(() => { void load(); }, [load]);

  // Real-time subscription: listen for vote_received changes on this claim
  // so the claimant sees live progress without manually refreshing.
  useEffect(() => {
    const channel = supabase
      .channel(`claim_status_${claimId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'claim_requests',
          filter: `id=eq.${claimId}`,
        },
        () => { void load(); }
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [claimId, load]);

  const requestReview = useCallback(async () => {
    if (!user?.id) return;
    setRequesting(true);
    const res = await organizationService.requestPlatformReview({ claimId, callerMemberId: user.id });
    setRequesting(false);
    if (!res.ok) { toast?.error?.(res.error || 'Could not request review.'); return; }
    toast?.success?.('Platform review requested — our team will look into it.');
    void load();
  }, [user?.id, claimId, toast, load]);

  if (loading || !s?.ok) return null;

  const votes = s.votes_received ?? 0;
  const need = s.votes_required ?? 0;
  const pct = Math.min(100, Math.round((votes / Math.max(1, need)) * 100));
  const approved = s.status === 'approved' || s.granted;

  // Path-aware copy
  let title = 'Verification in progress';
  let sub = '';
  if (approved) {
    title = "You're verified";
    sub = 'Your role is confirmed — admin access is unlocked.';
  } else if (s.path === 'independent') {
    title = 'Member confirmations';
    sub = `Auto-verifies once ${need} members confirm you.`;
  } else if (s.path === 'awaiting_higher_exec') {
    title = 'Waiting on a senior exec';
    sub = `You've reached acting status. A verified exec above you has been notified to confirm you.`;
  } else if (s.path === 'bootstrap' && !s.bootstrap_window_over) {
    const remaining = Math.max(0, 72 - (s.window_hours_elapsed ?? 0));
    sub = need <= 7
      ? `Reach ${need} confirmations to start acting. Final verification opens after a 72-hour window${s.window_hours_elapsed ? ` (~${Math.ceil(remaining)}h left)` : ''}.`
      : `Final verification needs ${need} confirmations.`;
    title = 'Building trust';
  } else if (s.path === 'bootstrap' && s.bootstrap_window_over) {
    title = 'Final stretch';
    sub = `${votes}/${need} confirmations to unlock full access.`;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4 mb-3"
      style={{
        background: approved ? `${tk.mint}10` : tk.panel,
        border: `1px solid ${approved ? `${tk.mint}40` : tk.border}`,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        {approved
          ? <CheckCircle2 className="w-4 h-4" style={{ color: tk.mint }} />
          : <ShieldCheck className="w-4 h-4" style={{ color: tk.primary }} />}
        <span className="text-sm font-bold" style={{ color: tk.text }}>
          {title}{s.position_title
            ? <span style={{ color: tk.textSec, fontWeight: 400 }}> · {s.position_title}</span>
            : null}
        </span>
      </div>
      <p className="text-xs mb-3" style={{ color: tk.textSec }}>{sub}</p>

      {!approved && (
        <>
          <div className="flex items-center justify-between mb-1.5 text-[11px]" style={{ color: tk.textTer }}>
            <span className="inline-flex items-center gap-1">
              <Vote className="w-3 h-3" /> {votes}/{need} confirmations
            </span>
            {s.path === 'bootstrap' && !s.bootstrap_window_over && (s.window_hours_elapsed ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> {Math.round(s.window_hours_elapsed ?? 0)}h / 72h
              </span>
            )}
          </div>
          <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ background: `${tk.border}` }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${tk.primary}, ${tk.mint})` }}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6 }}
            />
          </div>

          {s.platform_review_requested ? (
            <p className="text-[11px] inline-flex items-center gap-1.5" style={{ color: tk.amber }}>
              <Hourglass className="w-3 h-3" /> Platform review requested — pending decision.
            </p>
          ) : s.can_request_platform_review ? (
            <motion.button
              onClick={requestReview}
              disabled={requesting}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
              style={{
                background: `${tk.amber}1A`,
                color: tk.amber,
                border: `1px solid ${tk.amber}40`,
              }}
            >
              {requesting
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <LifeBuoy className="w-3.5 h-3.5" />}
              Request platform review
            </motion.button>
          ) : null}
        </>
      )}
    </motion.div>
  );
}