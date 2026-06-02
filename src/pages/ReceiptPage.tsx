/**
 * ReceiptPage — official-looking payment receipt screen.
 *
 * Route: /:orgSlug/receipt/:paymentId
 *
 * Matches the Lucy Nwakwo "Receipt" mockup:
 *   • Header: back + "Receipt" + share icon
 *   • Receipt card with a notched/scalloped bottom edge (the classic
 *     "torn ticket" look that signals "this is a receipt")
 *   • Org wordmark + tagline + "Paid" status pill
 *   • Data rows: Student, Member ID, Due, Amount, Method, Transaction
 *     ID, Date — laid out in cleanly aligned key-value pairs
 *   • "Thank you!" message with a circular "Payvexo Verified" stamp
 *     SVG (the kind of detail real receipts have)
 *   • Download PDF + Share buttons at the bottom
 *
 * Theme-aware. Data fetched from `payments` joined with `payment_types`
 * + `organization_members`. The page is read-only — no mutations.
 *
 * Loading + not-found states render gracefully so a bad/expired link
 * doesn't blow up.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Share2, CheckCircle2, Download, Loader2, AlertCircle,
  Hash, Mail, Building2,
} from 'lucide-react';
import QRCode from 'qrcode';
import { supabase } from '@/config/supabase';
import { useAppNav } from '@/hooks/useAppNav';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
import { useToast } from '@/hooks/useToast';
import PayvexoBackground from '@/components/student/dashboard/PayvexoBackground';
import { generatePaymentReceiptPDF } from '@/utils/pdfExport';

// ── Types ──────────────────────────────────────────────────────────
interface ReceiptRow {
  id:                 string;
  amount:             number;
  status:             string;
  payment_method:     string | null;
  paystack_status:    string | null;
  paystack_channel:   string | null;
  paystack_reference: string | null;
  transaction_ref:    string | null;
  total_charged_kobo: number | null;
  dues_amount_kobo:   number | null;
  platform_fee_kobo:  number | null;
  currency_code:      string | null;
  created_at:         string | null;
  approved_at:        string | null;
  payer_email:        string | null;
  payer_name:         string | null;
  // joins
  payment_type: { title: string; category: string | null } | null;
  org:          { name: string; short_name: string | null; slug: string | null } | null;
  member:       { full_name: string; member_id: string } | null;
}

// ── Helpers ────────────────────────────────────────────────────────
function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-NG', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function channelLabel(method: string | null, channel: string | null): string {
  // Prefer Paystack's actual channel when present (card / bank / ussd /
  // mobile_money / qr / eft / transfer). Falls back to payment_method.
  const k = (channel || method || '').toLowerCase();
  if (k.includes('card'))     return 'Card payment';
  if (k.includes('transfer')) return 'Bank transfer';
  if (k.includes('bank'))     return 'Bank';
  if (k.includes('ussd'))     return 'USSD';
  if (k.includes('mobile'))   return 'Mobile money';
  if (k.includes('qr'))       return 'QR code';
  if (k === 'cash')           return 'Cash (in person)';
  return 'Online payment';
}

/**
 * Deterministic, human-readable receipt number derived from the row id.
 * Same algorithm the PDF exporter uses, so the on-screen and PDF
 * receipt numbers always match.
 */
function receiptNumberFor(id: string, amount: number, status: string): string {
  const raw = `${id}-${amount}-${status}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  return 'PVX-' + Math.abs(hash).toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
}

// ── Page ───────────────────────────────────────────────────────────
export default function ReceiptPage() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const { go } = useAppNav();
  const { theme } = useTheme();
  const t = getDashboardTokens(theme);
  const toast = useToast();
  const isLight = theme === 'light';

  const [receipt, setReceipt] = useState<ReceiptRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!paymentId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('payments')
          .select(`
            id, amount, status, payment_method,
            paystack_status, paystack_channel, paystack_reference, transaction_ref,
            total_charged_kobo, dues_amount_kobo, platform_fee_kobo, currency_code,
            created_at, approved_at, payer_email, payer_name,
            payment_type:payment_type_id ( title, category ),
            org:organization_id ( name, short_name, slug ),
            member:member_id ( full_name, member_id )
          `)
          .eq('id', paymentId)
          .maybeSingle();

        if (cancelled) return;
        if (error || !data) {
          setNotFound(true);
        } else {
          setReceipt(data as unknown as ReceiptRow);
        }
      } catch (e) {
        if (!cancelled) {
          console.error('ReceiptPage load error', e);
          setNotFound(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [paymentId]);

  // ── Share ──────────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    if (!receipt) return;
    const text =
      `Payvexo receipt — ${formatNaira(receipt.amount)} for ${receipt.payment_type?.title || 'payment'}` +
      (receipt.transaction_ref ? `\nRef: ${receipt.transaction_ref}` : '');
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'Payvexo Receipt', text, url: window.location.href });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${text}\n${window.location.href}`);
        toast.success('Receipt link copied');
      }
    } catch { /* user cancelled */ }
  }, [receipt, toast]);

  // ── Download (proper PDF, NOT a page screenshot) ──────────────
  // The previous implementation called window.print() on the whole
  // page — which captured the nav, the background, and shrank the
  // receipt to a tiny square in the middle of an A4 sheet. That's
  // not how receipts work in real life.
  //
  // We now hand the receipt to generatePaymentReceiptPDF, which opens
  // a separate window with a print-friendly receipt-sized template.
  // The current page (nav, sheets, modals) is never part of the output.
  const handleDownload = useCallback(() => {
    if (!receipt) return;
    try {
      generatePaymentReceiptPDF({
        id: receipt.id,
        amount: Number(receipt.total_charged_kobo
          ? receipt.total_charged_kobo / 100
          : receipt.amount || 0),
        status: receipt.status,
        payment_method: channelLabel(receipt.payment_method, receipt.paystack_channel),
        transaction_ref: receipt.paystack_reference || receipt.transaction_ref || '',
        created_at: receipt.created_at || new Date().toISOString(),
        approved_at: receipt.approved_at || undefined,
        payment_type: {
          title:  receipt.payment_type?.title || 'Payment',
          amount: Number(receipt.dues_amount_kobo
            ? receipt.dues_amount_kobo / 100
            : receipt.amount || 0),
        },
        student: {
          full_name:  receipt.member?.full_name  || receipt.payer_name  || 'Member',
          reg_number: receipt.member?.member_id  || '—',
          email:      receipt.payer_email || undefined,
        },
      });
    } catch (e) {
      console.error('[ReceiptPage] PDF generation failed', e);
      toast.error('Could not generate PDF. Try again.');
    }
  }, [receipt, toast]);

  // ── QR code render ─────────────────────────────────────────────
  // The on-screen receipt shows a QR code that points back at this
  // receipt's URL. Anyone scanning it (e.g. from a printed PDF) lands
  // on the live, verifiable version — same as how restaurant receipts
  // and event tickets work.
  useEffect(() => {
    const canvas = qrCanvasRef.current;
    if (!canvas || !receipt) return;
    QRCode.toCanvas(canvas, window.location.href, {
      width: 84,
      margin: 0,
      color: { dark: '#0F0703', light: '#00000000' },
      errorCorrectionLevel: 'M',
    }).catch((e) => console.warn('[ReceiptPage] QR render failed', e));
  }, [receipt]);

  // ── Render ───────────────────────────────────────────────────────
  const paid = receipt && receipt.status === 'approved';

  const orgName = receipt?.org?.name || 'Payvexo';
  const ref     = receipt?.paystack_reference || receipt?.transaction_ref || '—';

  // Receipt number — used in the header, the QR caption, and the PDF.
  const receiptNo = useMemo(() => {
    if (!receipt) return '';
    return receiptNumberFor(receipt.id, Number(receipt.amount || 0), receipt.status);
  }, [receipt]);

  // Amount-paid (total charged including platform fee if present).
  const amountDisplay = useMemo(() => {
    if (!receipt) return '—';
    if (receipt.total_charged_kobo) return formatNaira(receipt.total_charged_kobo / 100);
    return formatNaira(Number(receipt.amount || 0));
  }, [receipt]);

  // Did the payment carry a platform fee that's worth surfacing?
  // We only show the breakdown when there's an actual fee row.
  const feeBreakdown = useMemo(() => {
    if (!receipt) return null;
    const dues = receipt.dues_amount_kobo ? receipt.dues_amount_kobo / 100 : null;
    const fee  = receipt.platform_fee_kobo ? receipt.platform_fee_kobo / 100 : null;
    if (!fee || fee <= 0) return null;
    return {
      dues: dues ?? Number(receipt.amount || 0),
      fee,
      total: receipt.total_charged_kobo ? receipt.total_charged_kobo / 100 : (dues ?? 0) + fee,
    };
  }, [receipt]);

  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{ minHeight: '100dvh' }}>
      <PayvexoBackground theme={theme} />

      <main className="relative z-10 max-w-md mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-24">

        {/* ── Top row ──────────────────────────────────────── */}
        <header className="flex items-center gap-3 mb-5 print:hidden">
          <button
            type="button"
            onClick={() => go('/payments')}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors shrink-0"
            style={{
              background: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)',
              color: t.text,
              border: `1px solid ${t.cardBorder}`,
              boxShadow: isLight ? '0 6px 18px -8px rgba(15,7,3,0.10)' : 'none',
            }}
            aria-label="Back"
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-[17px] font-extrabold tracking-tight flex-1" style={{ color: t.text }}>
            Receipt
          </h1>
          <button
            type="button"
            onClick={handleShare}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors shrink-0"
            style={{
              background: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)',
              color: t.textSec,
              border: `1px solid ${t.cardBorder}`,
            }}
            aria-label="Share receipt"
          >
            <Share2 size={15} />
          </button>
        </header>

        {/* ── Loading ──────────────────────────────────────── */}
        {loading && (
          <div className="mt-10 flex flex-col items-center gap-2" style={{ color: t.textSec }}>
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">Loading your receipt…</span>
          </div>
        )}

        {/* ── Not found ────────────────────────────────────── */}
        {!loading && (notFound || !receipt) && (
          <div
            className="mt-10 rounded-2xl px-5 py-6 text-center"
            style={{ background: t.card, border: `1px solid ${t.cardBorder}` }}
          >
            <div
              className="w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-3"
              style={{ background: isLight ? '#FEE6E6' : 'rgba(239,68,68,0.18)' }}
            >
              <AlertCircle size={22} color={t.danger} />
            </div>
            <p className="text-sm font-bold" style={{ color: t.text }}>Receipt not found</p>
            <p className="text-xs mt-1" style={{ color: t.textSec }}>
              This receipt may have been removed or the link is incorrect.
            </p>
            <button
              type="button"
              onClick={() => go('/payments')}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold"
              style={{ background: t.primary, color: '#fff' }}
            >
              <ArrowLeft size={14} /> Back to My Dues
            </button>
          </div>
        )}

        {/* ── Receipt body ────────────────────────────────── */}
        {!loading && receipt && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            {/* The "torn ticket" receipt card. The scalloped bottom edge
                is achieved with a mask of circles, so it always renders
                crisply regardless of card width. */}
            <div
              className="relative rounded-2xl overflow-hidden"
              style={{
                background: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.035)',
                border: `1px solid ${t.cardBorder}`,
                boxShadow: isLight
                  ? '0 16px 50px -16px rgba(15,7,3,0.16), 0 4px 14px -4px rgba(15,7,3,0.06)'
                  : '0 1px 0 rgba(255,255,255,0.04) inset',
                // The scalloped bottom: a horizontal repeating radial
                // gradient that "punches out" semicircles. The mask is
                // a clip-path so the actual element stays a solid card.
                WebkitMaskImage:
                  'radial-gradient(circle 8px at 8px 100%, transparent 100%, #000 101%), linear-gradient(#000, #000)',
                WebkitMaskComposite: 'source-over',
              }}
            >
              {/* Top gradient accent line */}
              <div
                className="h-1"
                style={{ background: 'linear-gradient(90deg, #FF7A1E 0%, #FF6803 50%, #C84600 100%)' }}
              />

              {/* Brand row */}
              <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-base font-extrabold shrink-0"
                      style={{
                        background: 'linear-gradient(135deg, #FF7A1E 0%, #C84600 100%)',
                        boxShadow: '0 6px 14px -6px rgba(255,104,3,0.45)',
                      }}
                    >
                      {orgName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[14px] font-extrabold leading-tight truncate" style={{ color: t.text }}>
                        {orgName}
                      </p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: t.textTer }}>
                        Official payment receipt
                      </p>
                    </div>
                  </div>
                </div>
                <StatusPill paid={!!paid} theme={theme} />
              </div>

              {/* Receipt-no chip — gives the document a real "audit
                  identity" so members can quote a single short string
                  back to support, and so the on-screen and PDF
                  versions visibly match. */}
              <div className="px-6 -mt-1 mb-3 flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-1 rounded-full"
                  style={{
                    background: t.primarySoft,
                    color: t.primary,
                    border: `1px solid ${t.primaryRing}`,
                  }}
                >
                  <Hash size={11} />
                  {receiptNo}
                </span>
                {receipt.org?.slug && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-semibold"
                    style={{ color: t.textTer }}
                  >
                    <Building2 size={10} />
                    {receipt.org.slug}
                  </span>
                )}
              </div>

              {/* Dashed divider — the "perforation line" */}
              <div
                className="mx-6"
                style={{
                  height: 1,
                  background: `repeating-linear-gradient(to right, ${t.cardBorder} 0 6px, transparent 6px 12px)`,
                }}
              />

              {/* Data rows */}
              <div className="px-6 py-5 space-y-3">
                <KV label="Member"          value={receipt.member?.full_name || receipt.payer_name || '—'} theme={theme} />
                <KV label="Member ID"       value={receipt.member?.member_id || '—'} theme={theme} mono />
                {receipt.payer_email && (
                  <KV
                    label="Email"
                    value={receipt.payer_email}
                    theme={theme}
                    small
                    icon={<Mail size={11} />}
                  />
                )}
                <KV label="Fee type"        value={receipt.payment_type?.title || 'Payment'} theme={theme} />

                {/* Fee breakdown — only renders when there's an actual
                    platform fee to disclose. Keeps simple cases simple. */}
                {feeBreakdown ? (
                  <>
                    <KV
                      label="Dues"
                      value={formatNaira(feeBreakdown.dues)}
                      theme={theme}
                      small
                    />
                    <KV
                      label="Platform fee"
                      value={formatNaira(feeBreakdown.fee)}
                      theme={theme}
                      small
                    />
                    <KV
                      label="Total charged"
                      value={formatNaira(feeBreakdown.total)}
                      theme={theme}
                      highlight
                    />
                  </>
                ) : (
                  <KV
                    label="Amount paid"
                    value={amountDisplay}
                    theme={theme}
                    highlight
                  />
                )}

                <KV
                  label="Payment method"
                  value={channelLabel(receipt.payment_method, receipt.paystack_channel)}
                  theme={theme}
                />
                <KV label="Transaction ID" value={ref} theme={theme} mono small />
                <KV
                  label="Date"
                  value={formatDateTime(receipt.approved_at || receipt.created_at)}
                  theme={theme}
                  small
                />
              </div>

              {/* Thank-you + verified stamp + QR */}
              <div
                className="mx-6 mb-6 px-5 py-4 rounded-2xl flex items-center gap-4"
                style={{
                  background: isLight ? '#FFF7EE' : 'rgba(255,172,95,0.10)',
                  border: `1px dashed ${isLight ? 'rgba(255,104,3,0.28)' : 'rgba(255,172,95,0.28)'}`,
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-extrabold leading-tight" style={{ color: t.text }}>
                    Thank you!
                    {' '}<span aria-hidden>🎉</span>
                  </p>
                  <p className="text-[11px] mt-1" style={{ color: t.textSec }}>
                    Your payment was successful and recorded on our ledger.
                  </p>
                  <p className="text-[10px] mt-2 font-semibold" style={{ color: t.textTer }}>
                    Scan the code to verify this receipt online.
                  </p>
                </div>
                <VerifiedStamp theme={theme} />
              </div>

              {/* QR strip — scan-to-verify. Sits in its own row below the
                  thank-you so it has room to breathe; the canvas mounts
                  once and is filled by the useEffect above. */}
              <div className="mx-6 mb-6 flex items-center gap-3">
                <div
                  className="rounded-xl p-2 shrink-0"
                  style={{
                    background: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${t.cardBorder}`,
                  }}
                >
                  <canvas
                    ref={qrCanvasRef}
                    width={84}
                    height={84}
                    style={{ display: 'block' }}
                    aria-label="Receipt verification QR code"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.16em] font-bold" style={{ color: t.textTer }}>
                    Scan to verify
                  </p>
                  <p className="text-[11px] mt-1 break-all" style={{ color: t.textSec }}>
                    Opens the live receipt on Payvexo. The code stays valid
                    as long as the payment is on file.
                  </p>
                </div>
              </div>

              {/* Bottom spacer for the scalloped edge */}
              <div className="h-3" />
            </div>

            {/* ── Action buttons ─────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 mt-5 print:hidden">
              <motion.button
                type="button"
                onClick={handleShare}
                whileTap={{ scale: 0.97 }}
                className="rounded-2xl py-3.5 flex items-center justify-center gap-2 text-[13px] font-bold transition-colors"
                style={{
                  background: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)',
                  color: t.text,
                  border: `1px solid ${t.cardBorder}`,
                  boxShadow: isLight ? '0 4px 14px -8px rgba(15,7,3,0.10)' : 'none',
                }}
              >
                <Share2 size={15} />
                Share
              </motion.button>
              <motion.button
                type="button"
                onClick={handleDownload}
                whileTap={{ scale: 0.97 }}
                className="rounded-2xl py-3.5 flex items-center justify-center gap-2 text-[13px] font-bold text-white"
                style={{
                  background: 'linear-gradient(135deg, #FF7A1E 0%, #FF6803 50%, #C84600 100%)',
                  boxShadow:
                    '0 12px 28px -12px rgba(255,104,3,0.55),' +
                    ' inset 0 1px 0 rgba(255,255,255,0.22)',
                }}
              >
                <Download size={15} />
                Download PDF
              </motion.button>
            </div>
          </motion.div>
        )}
      </main>

      {/* Print styles — keep the receipt card visible, hide everything
          else so the browser's "Save as PDF" produces a clean output. */}
      <style>{`
        @media print {
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}

// ── KV — clean key/value row used inside the receipt body ────────
function KV({
  label, value, theme, highlight, mono, small, icon,
}: {
  label: string;
  value: string;
  theme: 'light' | 'dark';
  highlight?: boolean;
  mono?: boolean;
  small?: boolean;
  icon?: React.ReactNode;
}) {
  const t = getDashboardTokens(theme);
  return (
    <div className="flex items-center justify-between gap-3">
      <span
        className="text-[11px] uppercase tracking-wider font-bold shrink-0 inline-flex items-center gap-1"
        style={{ color: t.textTer }}
      >
        {icon}
        {label}
      </span>
      <span
        className={`text-right truncate ${mono ? 'font-mono' : ''}`}
        style={{
          color: highlight ? t.primary : t.text,
          fontWeight: highlight ? 800 : 700,
          fontSize: highlight ? '16px' : small ? '11px' : '13px',
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ── StatusPill ─────────────────────────────────────────────────
function StatusPill({ paid, theme }: { paid: boolean; theme: 'light' | 'dark' }) {
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';
  if (paid) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold shrink-0"
        style={{
          background: isLight ? '#E7FAF1' : 'rgba(48,255,172,0.16)',
          color: isLight ? '#047857' : t.mint,
          border: `1px solid ${isLight ? '#A8E6CC' : 'rgba(48,255,172,0.28)'}`,
        }}
      >
        <CheckCircle2 size={12} />
        Paid
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold shrink-0"
      style={{
        background: isLight ? '#FFF3DC' : 'rgba(245,158,11,0.18)',
        color: isLight ? '#B45309' : t.amber,
        border: `1px solid ${isLight ? '#FACC93' : 'rgba(245,158,11,0.28)'}`,
      }}
    >
      Pending
    </span>
  );
}

// ── VerifiedStamp — the "official receipt" rubber stamp. Hand-drawn
// circular badge in brand orange with rotated text and a checkmark.
function VerifiedStamp({ theme }: { theme: 'light' | 'dark' }) {
  const isLight = theme === 'light';
  return (
    <div
      className="relative shrink-0 w-16 h-16 rounded-full flex items-center justify-center"
      style={{
        background: isLight ? 'rgba(255,104,3,0.04)' : 'rgba(255,104,3,0.10)',
        border: `2px dashed ${isLight ? 'rgba(255,104,3,0.50)' : 'rgba(255,172,95,0.55)'}`,
        transform: 'rotate(-8deg)',
      }}
      aria-hidden
    >
      <svg viewBox="0 0 100 100" width="56" height="56" className="absolute inset-0 m-auto">
        <defs>
          <path id="stamp-circle" d="M 50,50 m -34,0 a 34,34 0 1,1 68,0 a 34,34 0 1,1 -68,0" />
        </defs>
        <text
          fill={isLight ? '#C84600' : '#FFAC5F'}
          style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: '0.16em' }}
        >
          <textPath href="#stamp-circle" startOffset="0">
            PAYVEXO · VERIFIED · PAYVEXO · VERIFIED ·
          </textPath>
        </text>
      </svg>
      <CheckCircle2
        size={22}
        color={isLight ? '#C84600' : '#FFAC5F'}
        strokeWidth={2.4}
      />
    </div>
  );
}
