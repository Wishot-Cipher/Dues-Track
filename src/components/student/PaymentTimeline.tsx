/**
 * PaymentTimeline
 *
 * Replaces the flat "Payment History" list with an animated vertical timeline.
 * Each event has a contextual icon, colour, and timestamp.
 *
 * Supports events:
 *   submitted  — payment was created (pending)
 *   approved   — admin approved
 *   rejected   — admin rejected with reason
 *   waived     — payment was waived by admin
 *   resubmitted — student resubmitted after rejection
 *
 * Usage:
 *   <PaymentTimeline payments={existingPayments} paymentTypeName="Monthly Dues" />
 */

import { motion } from 'framer-motion';
import {
  Clock,
  CheckCircle,
  XCircle,
  Gift,
  RotateCcw,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { PrivacyMask } from '@/components/ui/PrivacyMask';
import { colors } from '@/config/colors';

interface Payment {
  id: string;
  amount: number;
  status: string;
  transaction_ref: string;
  receipt_url?: string;
  notes?: string | null;
  payment_method: string;
  rejection_reason?: string | null;
  submitted_at: string;
  reviewed_at?: string | null;
}

interface Props {
  payments: Payment[];
  paymentTypeName?: string;
}

interface TimelineEvent {
  id: string;
  type: 'submitted' | 'approved' | 'rejected' | 'waived' | 'pending';
  amount: number;
  timestamp: string;
  label: string;
  sublabel?: string;
  method?: string;
  transactionRef?: string;
  rejectionReason?: string | null;
}

const METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  cash:          'Cash',
  pos:           'POS',
};

function buildEvents(payments: Payment[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // Sort oldest first for timeline display
  const sorted = [...payments].sort(
    (a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
  );

  sorted.forEach((p) => {
    const isWaived = p.transaction_ref?.startsWith('WAIVED-');

    // Submission event
    events.push({
      id:            `${p.id}-submitted`,
      type:          'submitted',
      amount:        p.amount,
      timestamp:     p.submitted_at,
      label:         isWaived ? 'Payment Waived' : 'Payment Submitted',
      sublabel:      METHOD_LABELS[p.payment_method] || p.payment_method,
      method:        p.payment_method,
      transactionRef: p.transaction_ref,
    });

    // Resolution event
    if (p.reviewed_at) {
      if (isWaived) {
        events.push({
          id:        `${p.id}-waived`,
          type:      'waived',
          amount:    p.amount,
          timestamp: p.reviewed_at,
          label:     'Waived by Admin',
          sublabel:  'No payment required',
        });
      } else if (p.status === 'approved') {
        events.push({
          id:        `${p.id}-approved`,
          type:      'approved',
          amount:    p.amount,
          timestamp: p.reviewed_at,
          label:     'Payment Approved',
          sublabel:  'Verified by admin',
        });
      } else if (p.status === 'rejected') {
        events.push({
          id:               `${p.id}-rejected`,
          type:             'rejected',
          amount:           p.amount,
          timestamp:        p.reviewed_at,
          label:            'Payment Rejected',
          rejectionReason:  p.rejection_reason,
        });
      }
    } else if (p.status === 'pending' && !isWaived) {
      events.push({
        id:        `${p.id}-pending`,
        type:      'pending',
        amount:    p.amount,
        timestamp: p.submitted_at,
        label:     'Awaiting Review',
        sublabel:  'Admin will verify shortly',
      });
    }
  });

  // Sort newest first for display
  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

const EVENT_CONFIG = {
  submitted: {
    color:  '#6366F1',
    bg:     'rgba(99,102,241,0.15)',
    Icon:   RefreshCw,
    ring:   'rgba(99,102,241,0.3)',
  },
  pending: {
    color:  colors.warning,
    bg:     `rgba(245,158,11,0.15)`,
    Icon:   Clock,
    ring:   `rgba(245,158,11,0.3)`,
  },
  approved: {
    color:  colors.statusPaid,
    bg:     `rgba(34,197,94,0.15)`,
    Icon:   CheckCircle,
    ring:   `rgba(34,197,94,0.3)`,
  },
  rejected: {
    color:  colors.statusUnpaid,
    bg:     `rgba(239,68,68,0.15)`,
    Icon:   XCircle,
    ring:   `rgba(239,68,68,0.3)`,
  },
  waived: {
    color:  '#A78BFA',
    bg:     'rgba(167,139,250,0.15)',
    Icon:   Gift,
    ring:   'rgba(167,139,250,0.3)',
  },
};

export default function PaymentTimeline({ payments, paymentTypeName }: Props) {
  if (!payments.length) return null;

  const events = buildEvents(payments);

  return (
    <div className="space-y-4 min-w-0">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: `${colors.primary}15` }}
        >
          <Clock className="w-4 h-4" style={{ color: colors.primary }} />
        </div>
        <div>
          <h3 className="text-base font-bold text-white">Payment Timeline</h3>
          {paymentTypeName && (
            <p className="text-xs" style={{ color: colors.textSecondary }}>{paymentTypeName}</p>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div
          className="absolute left-[19px] top-2 bottom-2 w-px"
          style={{ background: 'rgba(255,255,255,0.07)' }}
        />

        <div className="space-y-3">
          {events.map((event, index) => {
            const cfg = EVENT_CONFIG[event.type];
            const IconComp = cfg.Icon;
            const isPulsing = event.type === 'pending';

            return (
              <motion.div
                key={event.id}
                className="flex gap-3 sm:gap-4 relative min-w-0"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.06, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* Icon node */}
                <div className="relative shrink-0 z-10">
                  <motion.div
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ background: cfg.bg, border: `2px solid ${cfg.ring}` }}
                    animate={isPulsing ? { boxShadow: [`0 0 0px ${cfg.color}00`, `0 0 10px ${cfg.color}60`, `0 0 0px ${cfg.color}00`] } : {}}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <IconComp className="w-4 h-4" style={{ color: cfg.color }} />
                  </motion.div>
                  {/* Connector dot */}
                  {index < events.length - 1 && (
                    <div
                      className="absolute bottom-[-14px] left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
                      style={{ background: 'rgba(255,255,255,0.12)' }}
                    />
                  )}
                </div>

                {/* Content card */}
                <div
                  className="flex-1 rounded-2xl p-3 sm:p-4 min-w-0"
                  style={{ background: 'rgba(255,255,255,0.025)', border: `1px solid ${cfg.ring}` }}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white">{event.label}</p>
                      {event.sublabel && (
                        <p className="text-[11px] mt-0.5" style={{ color: colors.textSecondary }}>
                          {event.sublabel}
                        </p>
                      )}
                    </div>
                    <div className="w-full text-left sm:w-auto sm:text-right sm:shrink-0">
                      <PrivacyMask>
                        <p className="text-sm font-black" style={{ color: cfg.color }}>
                          {formatCurrency(event.amount)}
                        </p>
                      </PrivacyMask>
                      <p className="text-[10px] mt-0.5" style={{ color: colors.textTertiary }}>
                        {formatDate(event.timestamp, 'short')}
                      </p>
                    </div>
                  </div>

                  {/* Transaction ref */}
                  {event.transactionRef && event.type === 'submitted' && (
                    <p className="text-[10px] mt-2 font-mono truncate" style={{ color: 'rgba(255,255,255,0.25)' }}>
                      Ref: {event.transactionRef}
                    </p>
                  )}

                  {/* Rejection reason */}
                  {event.rejectionReason && (
                    <div
                      className="mt-2 flex items-start gap-2 p-2 rounded-xl"
                      style={{ background: `${cfg.color}0e` }}
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: cfg.color }} />
                      <p className="text-[11px] leading-4" style={{ color: cfg.color }}>
                        {event.rejectionReason}
                      </p>
                    </div>
                  )}

                  {/* Resubmit hint */}
                  {event.type === 'rejected' && (
                    <div className="mt-3 flex items-center gap-1.5">
                      <RotateCcw className="w-3 h-3" style={{ color: colors.primary }} />
                      <span className="text-[11px] font-semibold" style={{ color: colors.primary }}>
                        Tap "Resubmit" below to try again
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}