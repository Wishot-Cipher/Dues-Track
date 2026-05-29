/**
 * TicketPage — a buyer's event ticket with a scannable QR.
 *
 * Route: /:orgSlug/ticket/:code  (public — resolvable by anyone with the code,
 * so it works from a saved link, email, or screenshot). The QR encodes the
 * ticket code; execs scan it at the door (TicketCheckInPage → check_in_ticket).
 *
 * Fully theme-aware (light + dark) via useThemeTokens.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import QRCode from 'qrcode';
import { ArrowLeft, Calendar, MapPin, Loader2, CheckCircle2, Ticket as TicketIcon, AlertCircle } from 'lucide-react';
import { ticketService, type TicketDetail } from '@/services/ticketService';
import { useThemeTokens, type ThemeTokens } from '@/hooks/useThemeTokens';
import { formatCurrency, formatDate } from '@/utils/formatters';

export default function TicketPage() {
  const t = useThemeTokens();
  const { code, orgSlug } = useParams<{ code: string; orgSlug: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [qr, setQr] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const found = code ? await ticketService.getTicketByCode(code) : null;
      if (cancelled) return;
      setTicket(found);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [code]);

  useEffect(() => {
    if (!ticket?.ticket_code) return;
    // QR keeps a white quiet-zone in both themes so scanners read it reliably.
    QRCode.toDataURL(ticket.ticket_code, { width: 320, margin: 1, color: { dark: '#0F0703', light: '#FFFFFF' } })
      .then(setQr).catch(() => setQr(''));
  }, [ticket?.ticket_code]);

  const accent = ticket?.color || t.primary;
  const status = useMemo(() => {
    const map: Record<string, { label: string; color: string }> = {
      valid:     { label: 'Valid',      color: t.mint },
      used:      { label: 'Checked in', color: t.textTer },
      cancelled: { label: 'Cancelled',  color: t.danger },
      refunded:  { label: 'Refunded',   color: t.danger },
    };
    return map[ticket?.status || 'valid'] || map.valid;
  }, [ticket?.status, t]);

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: t.primary }} />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div style={{ minHeight: '100dvh', background: t.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center' }}>
        <AlertCircle className="w-10 h-10" style={{ color: t.danger }} />
        <p style={{ color: t.text, fontSize: 18, fontWeight: 700 }}>Ticket not found</p>
        <p style={{ color: t.textSec, fontSize: 13, maxWidth: 320 }}>This ticket code doesn't match any ticket. Check the link or contact the organizer.</p>
        <button onClick={() => navigate(`/${orgSlug || ''}`)} style={{ color: t.primary, fontSize: 13, fontWeight: 600 }}>Go back</button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, backgroundImage: t.bgWash, padding: '20px 16px' }}>
      <div style={{ maxWidth: 440, margin: '0 auto' }}>
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 mb-4" style={{ color: t.textSec, fontSize: 13, fontWeight: 500 }}>
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl overflow-hidden"
          style={{ background: t.card, border: `1px solid ${t.cardBorder}`, boxShadow: t.shadowLg }}
        >
          {/* Event header */}
          <div style={{ padding: '22px 22px 16px', background: `linear-gradient(135deg, ${accent}1f, transparent)` }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold"
                style={{ background: `${accent}1f`, color: accent, border: `1px solid ${accent}40` }}>
                <TicketIcon className="w-3 h-3" /> {ticket.tier_name || 'Ticket'}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold"
                style={{ background: `${status.color}1f`, color: status.color, border: `1px solid ${status.color}40` }}>
                {ticket.status === 'used' ? <CheckCircle2 className="w-3 h-3" /> : null}{status.label}
              </span>
            </div>
            <h1 style={{ color: t.text, fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>{ticket.event_title}</h1>
            <div className="mt-2 space-y-1">
              {ticket.event_date && (
                <p className="flex items-center gap-1.5" style={{ color: t.textSec, fontSize: 13 }}>
                  <Calendar className="w-3.5 h-3.5" /> {formatDate(ticket.event_date, 'long')}
                </p>
              )}
              {ticket.event_venue && (
                <p className="flex items-center gap-1.5" style={{ color: t.textSec, fontSize: 13 }}>
                  <MapPin className="w-3.5 h-3.5" /> {ticket.event_venue}
                </p>
              )}
            </div>
          </div>

          {/* Perforation */}
          <div style={{ height: 1, background: t.divider, margin: '0 22px' }} />

          {/* QR */}
          <div style={{ padding: 22, textAlign: 'center' }}>
            {ticket.status === 'used' ? (
              <div style={{ padding: '18px 0' }}>
                <CheckCircle2 className="w-12 h-12 mx-auto mb-2" style={{ color: t.textTer }} />
                <p style={{ color: t.text, fontSize: 15, fontWeight: 700 }}>Already checked in</p>
                {ticket.checked_in_at && <p style={{ color: t.textTer, fontSize: 12, marginTop: 2 }}>{formatDate(ticket.checked_in_at, 'long')}</p>}
              </div>
            ) : qr ? (
              <div className="inline-block rounded-2xl p-3" style={{ background: '#FFFFFF', boxShadow: t.shadow }}>
                <img src={qr} alt="Ticket QR" style={{ width: 220, height: 220, display: 'block' }} />
              </div>
            ) : (
              <Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: t.primary }} />
            )}
            <p style={{ color: t.text, fontSize: 18, fontWeight: 800, letterSpacing: '0.08em', marginTop: 14, fontFamily: 'monospace' }}>
              {ticket.ticket_code}
            </p>
            <p style={{ color: t.textTer, fontSize: 11, marginTop: 4 }}>Show this at the door</p>
          </div>

          {/* Footer details */}
          <div style={{ padding: '14px 22px 22px', borderTop: `1px solid ${t.divider}` }}>
            <Row t={t} label="Attendee" value={ticket.buyer_name || '—'} />
            {ticket.group_name && <Row t={t} label="Group" value={ticket.group_name} />}
            <Row t={t} label="Organizer" value={ticket.org_name} />
            {typeof ticket.price === 'number' && <Row t={t} label="Paid" value={formatCurrency(ticket.price)} />}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function Row({ t, label, value }: { t: ThemeTokens; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span style={{ color: t.textTer, fontSize: 12 }}>{label}</span>
      <span style={{ color: t.text, fontSize: 13, fontWeight: 600 }}>{value}</span>
    </div>
  );
}
