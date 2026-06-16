/**
 * NotificationDetailPage — the full view of ONE notification.
 *
 * The bell dropdown + the notifications list both clamp the message to
 * a few lines. Long messages (waiver reasons, role decisions,
 * announcements) open here in FULL, with a clear "read" state and —
 * when the notification points somewhere (a payment, a claim) — a
 * single action button to go there.
 *
 * Opening this page marks the notification read (a financial-app
 * record: read, never deleted).
 *
 * Route: /:orgSlug/notifications/:id
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Bell, CheckCircle, AlertCircle, DollarSign, Ticket, ShieldCheck, Loader2, ArrowRight, Check, Info,
} from 'lucide-react';
import { useAppNav } from '@/hooks/useAppNav';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
import { supabase } from '@/config/supabase';
import { getOrgScope } from '@/utils/orgScope';
import { notificationService } from '@/services/notificationService';
import { formatDate } from '@/utils/formatters';

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  is_read: boolean;
  created_at: string;
}

function normalizeLink(link: string | null | undefined): string | null {
  if (!link) return null;
  return link.replace(/^\/payments\/([0-9a-f-]+)$/i, '/payment/$1');
}

function iconFor(type: string) {
  if (type.includes('approved') || type.includes('paid')) return CheckCircle;
  if (type.includes('rejected') || type.includes('failed')) return AlertCircle;
  if (type.includes('waived')) return DollarSign;
  if (type.includes('ticket')) return Ticket;
  if (type.includes('role') || type.includes('claim') || type.includes('handover')) return ShieldCheck;
  return Bell;
}

// Claim notifications reach people in roles they may not realise they're
// acting in — most confusingly, a department/faculty exec gets a
// "confirm" ping about a CLASS *below* their tier, which reads as "why is
// another class messaging me?". Spell out WHY they got it so the message
// isn't a flat, contextless line.
function claimContext(type: string): string | null {
  if (type === 'claim_confirm_requested')
    return "You're seeing this because you're a verified exec of the tier above. Someone in a group below you is claiming a role — confirm whether it's really them before their access unlocks.";
  if (type === 'claim_vote_requested' || type === 'claim_contested_vote')
    return "You're a member of this group, so your vote helps confirm who the real exec is.";
  if (type === 'claim_contested')
    return "Someone else claimed the same role. The group's members vote — whoever they confirm wins.";
  return null;
}

export default function NotificationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { go } = useAppNav();
  const { theme } = useTheme();
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';

  const [row, setRow] = useState<NotificationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const fetchOne = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const scope = getOrgScope();
      let q = supabase
        .from('notifications')
        .select('id, type, title, message, link, is_read, created_at')
        .eq('id', id)
        .limit(1);
      if (scope) q = q.eq('organization_id', scope.orgId);
      const { data } = await q;
      const n = (data && data[0]) as NotificationRow | undefined;
      if (!n) { setNotFound(true); return; }
      setRow(n);
      if (!n.is_read) void notificationService.markAsRead(n.id);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void fetchOne(); }, [fetchOne]);

  const actionLink = normalizeLink(row?.link);
  const Icon = iconFor(row?.type ?? '');

  return (
    <div className="min-h-screen relative py-6 px-4" style={{ background: t.bgWash, color: t.text, minHeight: '100dvh' }}>
      <div className="max-w-2xl mx-auto">
        <header className="flex items-center gap-3 mb-5">
          <button
            type="button"
            onClick={() => go('/notifications')}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)', color: t.text, border: `1px solid ${t.cardBorder}` }}
            aria-label="Back to notifications"
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-[15px] font-extrabold tracking-tight" style={{ color: t.text }}>Notification</h1>
        </header>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" style={{ color: t.primary }} /></div>
        ) : notFound || !row ? (
          <div className="text-center py-20 rounded-2xl" style={{ background: t.card, border: `1px solid ${t.cardBorder}` }}>
            <Bell className="w-10 h-10 mx-auto mb-3" style={{ color: t.textTer }} />
            <p className="text-sm font-bold" style={{ color: t.text }}>Notification not found</p>
            <p className="text-xs mt-1" style={{ color: t.textSec }}>It may have been from another account.</p>
          </div>
        ) : (
          <motion.article
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-5"
            style={{ background: t.card, border: `1px solid ${t.cardBorder}` }}
          >
            <div className="flex items-start gap-3">
              <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${t.primary}14`, color: t.primary }}>
                <Icon className="w-5 h-5" />
              </span>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-extrabold leading-snug break-words" style={{ color: t.text }}>{row.title}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: t.mint }}>
                    <Check className="w-3 h-3" /> Read
                  </span>
                  <span className="text-[11px]" style={{ color: t.textTer }}>· {formatDate(row.created_at, 'long')}</span>
                </div>
              </div>
            </div>

            {/* Full message — never clamped. */}
            <p className="text-[15px] mt-4 leading-relaxed whitespace-pre-wrap break-words" style={{ color: t.textSec }}>
              {row.message}
            </p>

            {/* Why you're seeing this — context for claim notifications so
                an exec understands a ping about a tier below them. */}
            {claimContext(row.type) && (
              <div
                className="mt-4 rounded-xl p-3 flex gap-2.5"
                style={{ background: isLight ? 'rgba(255,104,3,0.06)' : 'rgba(255,104,3,0.10)', border: `1px solid ${t.primary}33` }}
              >
                <Info className="w-4 h-4 mt-0.5 shrink-0" style={{ color: t.primary }} />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: t.primary }}>
                    Why you're seeing this
                  </p>
                  <p className="text-[12.5px] leading-relaxed mt-0.5" style={{ color: t.textSec }}>
                    {claimContext(row.type)}
                  </p>
                </div>
              </div>
            )}

            {actionLink && (
              <button
                type="button"
                onClick={() => go(actionLink)}
                className="mt-5 w-full py-3 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1.5"
                style={{ background: t.gradOrange, color: '#fff', boxShadow: `0 8px 22px -8px ${t.primary}` }}
              >
                Open <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </motion.article>
        )}
      </div>
    </div>
  );
}
