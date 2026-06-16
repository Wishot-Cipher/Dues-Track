/**
 * NotificationsPage — the full notification history.
 *
 * The bell dropdown (NotificationCenter) shows recent items with the
 * message clamped to 2 lines. Long messages (waiver reasons, role
 * decisions, announcements) get cut off there, so this page renders
 * the COMPLETE history with full, untruncated messages.
 *
 * No delete — notifications are a permanent record on a financial app
 * (receipts, waivers, role changes). Users can mark-as-read and read
 * the full message here; they can never erase the trail.
 *
 * Route: /:orgSlug/notifications
 */

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Bell, BellOff, CheckCircle, AlertCircle, DollarSign, Ticket, ShieldCheck, Loader2,
} from 'lucide-react';
import { useAppAuth as useAuth } from '@/hooks/useAppAuth';
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

// Normalize a stored link to the current routing scheme (mirrors the
// fixes the bell dropdown applies to legacy DB-trigger links).
function normalizeLink(link: string | null | undefined): string | null {
  if (!link) return null;
  let l = link;
  l = l.replace(/^\/payments\/([0-9a-f-]+)$/i, '/payment/$1');
  return l;
}

function iconFor(type: string) {
  if (type.includes('approved') || type.includes('paid')) return CheckCircle;
  if (type.includes('rejected') || type.includes('failed')) return AlertCircle;
  if (type.includes('waived')) return DollarSign;
  if (type.includes('ticket')) return Ticket;
  if (type.includes('role') || type.includes('claim') || type.includes('handover')) return ShieldCheck;
  return Bell;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const { go } = useAppNav();
  const { theme } = useTheme();
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';

  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const scope = getOrgScope();
      // Full history for THIS member across the org (not group-scoped
      // like the dropdown) so nothing is hidden.
      let q = supabase
        .from('notifications')
        .select('id, type, title, message, link, is_read, created_at')
        .eq('member_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (scope) q = q.eq('organization_id', scope.orgId);
      const { data } = await q;
      setRows((data || []) as NotificationRow[]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const onOpen = async (n: NotificationRow) => {
    if (!n.is_read) {
      // Optimistic — flip locally, persist in the background.
      setRows((prev) => prev.map((r) => (r.id === n.id ? { ...r, is_read: true } : r)));
      void notificationService.markAsRead(n.id);
    }
    // Always open the detail view — it shows the FULL message (long
    // ones aren't dumped into the list) and offers an "Open" button
    // for any action link. One consistent reading surface.
    go(`/notifications/${n.id}`);
  };

  return (
    <div className="min-h-screen relative overflow-x-hidden py-6 px-4" style={{ background: t.bgWash, color: t.text, minHeight: '100dvh' }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <header className="flex items-center gap-3 mb-5">
          <button
            type="button"
            onClick={() => go('/dashboard')}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)', color: t.text, border: `1px solid ${t.cardBorder}` }}
            aria-label="Back"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <Bell size={18} style={{ color: t.primary }} />
            <h1 className="text-[17px] font-extrabold tracking-tight" style={{ color: t.text }}>Notifications</h1>
          </div>
        </header>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" style={{ color: t.primary }} /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-20 rounded-2xl" style={{ background: t.card, border: `1px solid ${t.cardBorder}` }}>
            <BellOff className="w-10 h-10 mx-auto mb-3" style={{ color: t.textTer }} />
            <p className="text-sm font-bold" style={{ color: t.text }}>No notifications yet</p>
            <p className="text-xs mt-1" style={{ color: t.textSec }}>Payment, waiver and role updates show up here.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {rows.map((n, i) => {
              const Icon = iconFor(n.type);
              const clickable = Boolean(normalizeLink(n.link));
              return (
                <motion.button
                  key={n.id}
                  type="button"
                  onClick={() => onOpen(n)}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                  className="w-full text-left rounded-2xl p-4 flex gap-3 transition-colors"
                  style={{
                    background: n.is_read ? t.card : t.primarySoft,
                    border: `1px solid ${n.is_read ? t.cardBorder : t.primaryRing}`,
                    cursor: clickable ? 'pointer' : 'default',
                  }}
                >
                  <span
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${t.primary}14`, color: t.primary }}
                  >
                    <Icon className="w-4.5 h-4.5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold min-w-0 break-words" style={{ color: t.text }}>{n.title}</p>
                      {!n.is_read && <span className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ background: t.primary }} />}
                    </div>
                    {/* Preview — clamped to 2 lines so a long message
                        doesn't flood the list. Tap opens the full
                        detail view. */}
                    <p className="text-[13px] mt-1 leading-relaxed line-clamp-2" style={{ color: t.textSec }}>
                      {n.message}
                    </p>
                    {/* At-a-glance reason for a confirm ping — an exec gets
                        asked about a group BELOW their tier, which is
                        otherwise confusing. */}
                    {n.type === 'claim_confirm_requested' && (
                      <span
                        className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{ background: `${t.primary}14`, color: t.primary }}
                      >
                        Confirm · you're the exec above
                      </span>
                    )}
                    <p className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: t.textTer }}>
                      {formatDate(n.created_at, 'short')}
                      {n.message.length > 90 && <span style={{ color: t.primary }}>· Tap to read</span>}
                    </p>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
