/**
 * MyTicketsPage — the buyer's event tickets. Tapping one opens its QR ticket.
 * Route: /:orgSlug/tickets  ·  Fully theme-aware (light + dark).
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Ticket as TicketIcon, Calendar, MapPin, CheckCircle2, Loader2, ChevronRight } from 'lucide-react';
import { ticketService, type MyTicket } from '@/services/ticketService';
import { useThemeTokens } from '@/hooks/useThemeTokens';
import { getOrgScope } from '@/utils/orgScope';
import { formatCurrency, formatDate } from '@/utils/formatters';

export default function MyTicketsPage() {
  const t = useThemeTokens();
  const navigate = useNavigate();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [tickets, setTickets] = useState<MyTicket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const scope = getOrgScope();
      const list = scope?.memberId ? await ticketService.getMyTickets(scope.memberId) : [];
      if (!cancelled) { setTickets(list); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, backgroundImage: t.bgWash, padding: '20px 16px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="flex items-center gap-2 mb-1">
          <TicketIcon className="w-5 h-5" style={{ color: t.primary }} />
          <h1 style={{ color: t.text, fontSize: 22, fontWeight: 800 }}>My tickets</h1>
        </div>
        <p style={{ color: t.textSec, fontSize: 13, marginBottom: 18 }}>Your event tickets — tap one to show its QR at the door.</p>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: t.primary }} /></div>
        ) : tickets.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 16, boxShadow: t.shadow }}>
            <TicketIcon className="w-10 h-10 mx-auto mb-3" style={{ color: t.textTer }} />
            <p style={{ color: t.text, fontSize: 15, fontWeight: 700 }}>No tickets yet</p>
            <p style={{ color: t.textSec, fontSize: 13, marginTop: 4 }}>When you buy an event ticket, it shows up here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map((tk) => {
              const accent = tk.color || t.primary;
              const used = tk.status === 'used';
              return (
                <motion.button
                  key={tk.id}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  onClick={() => navigate(`/${orgSlug}/ticket/${tk.ticket_code}`)}
                  className="w-full text-left rounded-2xl p-4 flex items-center gap-4"
                  style={{ background: t.card, border: `1px solid ${t.cardBorder}`, boxShadow: t.shadow }}
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                    style={{ background: `${accent}1a`, border: `1px solid ${accent}30` }}>
                    {tk.icon || '🎟️'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p style={{ color: t.text, fontSize: 15, fontWeight: 700 }} className="truncate">{tk.event_title}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                      {tk.event_date && <span className="inline-flex items-center gap-1" style={{ color: t.textSec, fontSize: 12 }}><Calendar className="w-3 h-3" />{formatDate(tk.event_date, 'short')}</span>}
                      {tk.event_venue && <span className="inline-flex items-center gap-1 truncate" style={{ color: t.textSec, fontSize: 12 }}><MapPin className="w-3 h-3" />{tk.event_venue}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: `${accent}1a`, color: accent }}>{tk.tier_name || 'Ticket'}</span>
                      {used
                        ? <span className="inline-flex items-center gap-1 text-[10px] font-bold" style={{ color: t.textTer }}><CheckCircle2 className="w-3 h-3" />Checked in</span>
                        : <span className="text-[10px] font-bold" style={{ color: t.mint }}>Valid</span>}
                      {typeof tk.price === 'number' && <span style={{ color: t.textTer, fontSize: 11 }}>{formatCurrency(tk.price)}</span>}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 shrink-0" style={{ color: t.textTer }} />
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
