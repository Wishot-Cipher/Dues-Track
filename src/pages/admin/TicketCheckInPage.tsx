/**
 * TicketCheckInPage — door check-in for event tickets.
 *
 * Route: /:orgSlug/admin/check-in
 * Execs scan a ticket QR (or type the code) → check_in_ticket validates it and
 * marks it used. Re-scanning a used ticket reports who/when it was checked in.
 * Fully theme-aware (light + dark).
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ScanLine, CheckCircle2, XCircle, AlertTriangle, Loader2, Keyboard, Camera } from 'lucide-react';
import QRScanner from '@/components/admin/QRScanner';
import { ticketService, type CheckInResult } from '@/services/ticketService';
import { useThemeTokens, type ThemeTokens } from '@/hooks/useThemeTokens';
import { getOrgScope } from '@/utils/orgScope';
import { useToast } from '@/hooks/useToast';

function resultMeta(t: ThemeTokens) {
  return {
    checked_in:     { color: t.mint,   icon: <CheckCircle2 className="w-6 h-6" />, label: 'Checked in' },
    already_used:   { color: t.amber,  icon: <AlertTriangle className="w-6 h-6" />, label: 'Already used' },
    invalid:        { color: t.danger, icon: <XCircle className="w-6 h-6" />, label: 'Invalid ticket' },
    unauthorized:   { color: t.danger, icon: <XCircle className="w-6 h-6" />, label: 'Not authorized' },
    // Mig 102 result: the ticket belongs to a tier this scanner
    // doesn't cover. Different from "unauthorized" — they ARE an
    // exec, just at the wrong level for this event.
    scope_mismatch: { color: t.amber,  icon: <AlertTriangle className="w-6 h-6" />, label: 'Wrong tier' },
    cancelled:      { color: t.danger, icon: <XCircle className="w-6 h-6" />, label: 'Cancelled ticket' },
    refunded:       { color: t.danger, icon: <XCircle className="w-6 h-6" />, label: 'Refunded ticket' },
  } as Record<string, { color: string; icon: React.ReactNode; label: string }>;
}

export default function TicketCheckInPage() {
  const t = useThemeTokens();
  const navigate = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState<'scan' | 'manual'>('scan');
  const [scanning, setScanning] = useState(true);
  const [busy, setBusy] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [last, setLast] = useState<CheckInResult | null>(null);

  const runCheckIn = useCallback(async (codeRaw: string) => {
    const scope = getOrgScope();
    if (!scope?.memberId) { toast.error('Session expired. Please sign in again.'); return; }
    const code = codeRaw.trim();
    if (!code || busy) return;
    setBusy(true);
    setScanning(false);
    try {
      const res = await ticketService.checkIn(code, scope.memberId);
      setLast(res);
      if (res.ok && res.result === 'checked_in') toast.success(`${res.ticket?.buyer_name || 'Guest'} checked in`);
      else if (res.result === 'already_used') toast.warning('Ticket already used');
      else toast.error(res.error || 'Check-in failed');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Check-in failed');
    }
    setBusy(false);
  }, [busy, toast]);

  const resetForNext = () => { setLast(null); setManualCode(''); setScanning(true); };

  const meta = resultMeta(t);
  const resultStyle = last ? meta[last.result || (last.ok ? 'checked_in' : 'invalid')] : null;

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, backgroundImage: t.bgWash, padding: '20px 16px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 mb-4" style={{ color: t.textSec, fontSize: 13, fontWeight: 500 }}>
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="flex items-center gap-2 mb-1">
          <ScanLine className="w-5 h-5" style={{ color: t.primary }} />
          <h1 style={{ color: t.text, fontSize: 22, fontWeight: 800 }}>Ticket check-in</h1>
        </div>
        <p style={{ color: t.textSec, fontSize: 13, marginBottom: 18 }}>Scan a guest's QR or enter the code to admit them.</p>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-4">
          {([['scan', 'Scan QR', <Camera className="w-4 h-4" key="c" />], ['manual', 'Enter code', <Keyboard className="w-4 h-4" key="k" />]] as const).map(([m, label, icon]) => (
            <button key={m} onClick={() => { setMode(m); resetForNext(); }}
              className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{ background: mode === m ? t.primarySoft : t.card, color: mode === m ? t.primary : t.textSec, border: `1px solid ${mode === m ? t.primaryRing : t.cardBorder}` }}>
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Result card */}
        <AnimatePresence>
          {last && resultStyle && (
            <motion.div
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="rounded-2xl p-4 mb-4 flex items-start gap-3"
              style={{ background: `${resultStyle.color}14`, border: `1px solid ${resultStyle.color}40` }}
            >
              <span style={{ color: resultStyle.color }}>{resultStyle.icon}</span>
              <div className="flex-1 min-w-0">
                <p style={{ color: resultStyle.color, fontSize: 15, fontWeight: 800 }}>{resultStyle.label}</p>
                {last.ticket && (
                  <p style={{ color: t.text, fontSize: 13, marginTop: 2 }}>
                    {last.ticket.buyer_name || 'Guest'} · {last.ticket.tier_name || 'Ticket'}
                    {last.ticket.event_title ? ` · ${last.ticket.event_title}` : ''}
                  </p>
                )}
                {last.result === 'already_used' && last.checked_in_at && (
                  <p style={{ color: t.textTer, fontSize: 12, marginTop: 2 }}>Checked in {new Date(last.checked_in_at).toLocaleString()}</p>
                )}
                {!last.ok && last.error && <p style={{ color: t.textSec, fontSize: 12, marginTop: 2 }}>{last.error}</p>}
              </div>
              <button onClick={resetForNext} className="text-xs font-bold px-3 py-2 rounded-lg shrink-0" style={{ color: t.primary, background: t.primarySoft }}>Next</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scanner or manual entry */}
        {mode === 'scan' ? (
          <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${t.cardBorder}` }}>
            {scanning && !busy ? (
              <QRScanner scanning={scanning} onScan={(text) => runCheckIn(text)} onError={() => { /* surfaced by scanner UI */ }} />
            ) : (
              <div style={{ padding: 28, textAlign: 'center', background: t.card }}>
                {busy
                  ? <Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: t.primary }} />
                  : <button onClick={resetForNext} className="px-5 py-2.5 rounded-xl text-sm font-bold" style={{ background: t.primary, color: '#fff' }}>Scan next ticket</button>}
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); runCheckIn(manualCode); }} className="space-y-3">
            <input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value.toUpperCase())}
              placeholder="PVX-TKT-XXXXXXXX"
              className="w-full rounded-xl px-4 py-3 outline-none"
              style={{ background: t.input, border: `1px solid ${t.inputBorder}`, color: t.text, fontFamily: 'monospace', letterSpacing: '0.06em' }}
            />
            <button type="submit" disabled={busy || !manualCode.trim()}
              className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm disabled:opacity-40"
              style={{ background: t.primary, color: '#fff' }}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Check in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
