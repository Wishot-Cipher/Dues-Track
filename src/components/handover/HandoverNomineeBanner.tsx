/**
 * HandoverNomineeBanner — durable prompt for a nominated successor.
 *
 * The problem this solves (user's spec): a member nominated to take
 * over an exec role might not be an admin yet, so they could dismiss
 * a normal claim banner without realizing it's THEIR handover. This
 * banner is driven by the server (get_my_pending_handover) — not by
 * dismissible local state — so it survives logout / reload until the
 * nominee accepts or declines.
 *
 * Accept → respond_to_handover auto-submits a claim for the role and
 * the normal vote begins. Decline → the outgoing exec is told and
 * keeps their role.
 *
 * Mounted once in OrgLayout (alongside OfficeClassGate). It self-hides
 * when there's no pending handover for the caller.
 */

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRightLeft, Loader2, Check, X } from 'lucide-react';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useThemeTokens } from '@/hooks/useThemeTokens';
import { useToast } from '@/hooks/useToast';
import handoverService, { type PendingHandover } from '@/services/handoverService';

export default function HandoverNomineeBanner() {
  const t = useThemeTokens();
  const { user } = useMultiTenantAuth();
  const toast = useToast();

  const [pending, setPending] = useState<PendingHandover | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<null | 'accept' | 'decline'>(null);

  const load = useCallback(async () => {
    if (!user?.id) { setPending(null); return; }
    const h = await handoverService.getMyPendingHandover(user.id);
    setPending(h);
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  const respond = useCallback(async (accept: boolean) => {
    if (!user?.id || !pending) return;
    setBusy(true);
    const res = await handoverService.respond(user.id, pending.id, accept);
    setBusy(false);
    setConfirming(null);
    if (!res.ok) { toast?.error?.(res.error || 'Could not respond.'); return; }
    if (accept) {
      toast?.success?.('Accepted — your verification has started. Members will vote to confirm you.');
    } else {
      toast?.info?.('Declined. The current exec keeps their role.');
    }
    setPending(null);
  }, [user?.id, pending, toast]);

  if (!pending) return null;

  const roleLabel = pending.role_label || 'an exec role';
  const where = pending.group_name ? ` for ${pending.group_name}` : '';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="mx-3 mt-3 rounded-2xl p-4"
        style={{ background: `${t.primary}10`, border: `1px solid ${t.primary}30` }}
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${t.primary}1A`, color: t.primary }}>
            <ArrowRightLeft size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold" style={{ color: t.text }}>
              You've been nominated as {roleLabel}
            </p>
            <p className="text-[12px] mt-0.5 leading-relaxed" style={{ color: t.textSec }}>
              {pending.from_name || 'The current exec'} wants to hand over {roleLabel}{where} to you.
              {pending.reason ? ` "${pending.reason}".` : ''} Accept to start verification — the members vote to confirm you, then the role becomes yours.
            </p>

            {confirming === null && (
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => setConfirming('accept')}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-bold disabled:opacity-50"
                  style={{ background: t.primary, color: '#1A0E09' }}
                >
                  <Check size={14} /> Accept
                </button>
                <button
                  onClick={() => setConfirming('decline')}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-semibold disabled:opacity-50"
                  style={{ background: t.overlay, color: t.textSec, border: `1px solid ${t.divider}` }}
                >
                  <X size={14} /> Decline
                </button>
              </div>
            )}

            {confirming !== null && (
              <div className="mt-3 rounded-xl p-3" style={{ background: t.overlay, border: `1px solid ${t.divider}` }}>
                <p className="text-[12px] mb-2.5" style={{ color: t.text }}>
                  {confirming === 'accept'
                    ? 'Accept and start verification? The members of your tier will be asked to confirm you.'
                    : 'Decline this handover? The current exec keeps their role.'}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => respond(confirming === 'accept')}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-bold disabled:opacity-50"
                    style={{
                      background: confirming === 'accept' ? t.primary : t.danger,
                      color: confirming === 'accept' ? '#1A0E09' : '#fff',
                    }}
                  >
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    Yes, {confirming === 'accept' ? 'accept' : 'decline'}
                  </button>
                  <button
                    onClick={() => setConfirming(null)}
                    disabled={busy}
                    className="px-3.5 py-1.5 rounded-lg text-[12px] font-semibold"
                    style={{ color: t.textSec }}
                  >
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
