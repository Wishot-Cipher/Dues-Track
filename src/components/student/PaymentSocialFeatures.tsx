/**
 * PeerPaymentBadge
 * Shows "🔥 N students paid today" social proof counter.
 * Queries a lightweight count from Supabase filtered to today.
 *
 * LateFeWaiverRequest
 * Inline waiver request link that opens a small modal sending a message to admin.
 * Empathetic UX for students who have genuine late-fee situations.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Flame,
  Users,
  X,
  Send,
  CheckCircle,
  AlertCircle,
  Heart,
} from 'lucide-react';
import { colors } from '@/config/colors';
import { supabase } from '@/config/supabase';
import { getOrgScope } from '@/utils/orgScope';
import { formatCurrency } from '@/utils/formatters';

// ─────────────────────────────────────────────────────────────────────────────
// PeerPaymentBadge
// ─────────────────────────────────────────────────────────────────────────────

interface PeerBadgeProps {
  paymentTypeId: string;
  className?: string;
}

export function PeerPaymentBadge({ paymentTypeId, className = '' }: PeerBadgeProps) {
  const [count, setCount]     = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const fetchCount = async () => {
      try {
        const scope = getOrgScope();
        let q = supabase
          .from('payments')
          .select('id', { count: 'exact', head: true })
          .eq('payment_type_id', paymentTypeId)
          .eq('status', 'approved')
          .gte('created_at', today.toISOString());
        if (scope) q = q.eq('organization_id', scope.orgId);
        const { count: c } = await q;
        setCount(c ?? 0);
      } catch {
        setCount(null);
      } finally {
        setLoading(false);
      }
    };

    fetchCount();
  }, [paymentTypeId]);

  if (loading || count === null || count === 0) return null;

  return (
    <motion.div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${className}`}
      style={{
        background: 'rgba(249,115,22,0.1)',
        border: '1px solid rgba(249,115,22,0.25)',
        color: '#F97316',
      }}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 200 }}
    >
      <motion.span
        animate={{ scale: [1, 1.3, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
      >
        🔥
      </motion.span>
      <Users className="w-3 h-3" />
      {count} student{count !== 1 ? 's' : ''} paid today
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LateFeWaiverRequest
// ─────────────────────────────────────────────────────────────────────────────

interface WaiverProps {
  paymentTypeId: string;
  paymentTypeName: string;
  lateFeeAmount: number;
  memberId: string;
  memberName: string;
  className?: string;
}

type WaiverStatus = 'idle' | 'open' | 'submitting' | 'sent' | 'error';

export function LateFeeWaiverRequest({
  paymentTypeId,
  paymentTypeName,
  lateFeeAmount,
  memberId,
  memberName,
  className = '',
}: WaiverProps) {
  const [status, setStatus]   = useState<WaiverStatus>('idle');
  const [reason, setReason]   = useState('');
  const [focused, setFocused] = useState(false);

  const submit = async () => {
    if (!reason.trim()) return;
    setStatus('submitting');

    try {
      const scope = getOrgScope();

      // Insert a waiver request as a notification/message to admins
      const { error } = await supabase
        .from('notifications')
        .insert({
          type:            'waiver_request',
          title:           `Late Fee Waiver Request`,
          message:         `${memberName} is requesting a waiver for late fees (${formatCurrency(lateFeeAmount)}) on "${paymentTypeName}". Reason: ${reason}`,
          recipient_type:  'admin',
          member_id:       memberId,
          payment_type_id: paymentTypeId,
          metadata: {
            late_fee_amount: lateFeeAmount,
            reason,
            payment_type_id: paymentTypeId,
          },
          ...(scope ? { organization_id: scope.orgId } : {}),
        });

      if (error) throw error;
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  };

  if (status === 'sent') {
    return (
      <motion.div
        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs ${className}`}
        style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.22)', color: '#22C55E' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <CheckCircle className="w-3.5 h-3.5 shrink-0" />
        Waiver request sent to admin — they'll review shortly.
      </motion.div>
    );
  }

  return (
    <>
      {/* Trigger link */}
      {status === 'idle' && (
        <motion.button
          type="button"
          onClick={() => setStatus('open')}
          className={`flex items-center gap-1.5 text-xs font-medium underline underline-offset-2 ${className}`}
          style={{ color: 'rgba(167,139,250,0.8)' }}
          whileHover={{ color: '#A78BFA' }}
        >
          <Heart className="w-3 h-3" />
          Request fee waiver
        </motion.button>
      )}

      {/* Modal */}
      <AnimatePresence>
        {(status === 'open' || status === 'submitting' || status === 'error') && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => status !== 'submitting' && setStatus('idle')}
            />

            {/* Sheet */}
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[32px] p-6 sm:p-8 max-w-lg mx-auto"
              style={{
                background: 'linear-gradient(160deg, #120802, #0e0601)',
                border: '1px solid rgba(167,139,250,0.2)',
                borderBottom: 'none',
              }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            >
              {/* Handle */}
              <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: 'rgba(255,255,255,0.12)' }} />

              {/* Close */}
              <button
                type="button"
                onClick={() => setStatus('idle')}
                className="absolute top-5 right-5 p-1.5 rounded-lg"
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                <X className="w-4 h-4" />
              </button>

              {/* Header */}
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(167,139,250,0.12)' }}>
                  <Heart className="w-5 h-5" style={{ color: '#A78BFA' }} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Request Late Fee Waiver</h3>
                  <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                    Late fee: {formatCurrency(lateFeeAmount)} · {paymentTypeName}
                  </p>
                </div>
              </div>

              {/* Context */}
              <div
                className="flex items-start gap-2.5 p-3 rounded-2xl mb-4"
                style={{ background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.18)' }}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#A78BFA' }} />
                <p className="text-xs leading-5" style={{ color: 'rgba(167,139,250,0.8)' }}>
                  Your admin will review your request. Waivers are not guaranteed but are considered on a case-by-case basis.
                </p>
              </div>

              {/* Reason textarea */}
              <div className="space-y-2 mb-5">
                <label
                  className="block text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: focused ? '#A78BFA' : 'rgba(255,255,255,0.3)' }}
                >
                  Reason for waiver request
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  rows={3}
                  placeholder="Briefly explain your situation…"
                  className="w-full px-4 py-3 rounded-2xl text-sm text-white outline-none resize-none placeholder:text-white/15"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${focused ? 'rgba(167,139,250,0.55)' : 'rgba(255,255,255,0.08)'}`,
                    boxShadow: focused ? '0 0 0 3px rgba(167,139,250,0.1)' : 'none',
                  }}
                />
              </div>

              {status === 'error' && (
                <p className="text-xs mb-3" style={{ color: '#EF4444' }}>
                  Failed to send. Please try again.
                </p>
              )}

              <motion.button
                type="button"
                onClick={submit}
                disabled={!reason.trim() || status === 'submitting'}
                className="w-full py-3.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40"
                style={{
                  background: 'linear-gradient(135deg, #A78BFA, #7C3AED)',
                  boxShadow: '0 8px 24px rgba(167,139,250,0.3)',
                }}
                whileHover={reason.trim() ? { scale: 1.015 } : {}}
                whileTap={reason.trim() ? { scale: 0.985 } : {}}
              >
                {status === 'submitting' ? (
                  <>
                    <motion.div
                      className="w-4 h-4 border-2 rounded-full border-white/30 border-t-white"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                    />
                    Sending…
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send Waiver Request
                  </>
                )}
              </motion.button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}