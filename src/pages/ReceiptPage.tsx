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
  Hash, Mail, Building2, Sparkles, ShieldCheck, Calendar, CreditCard,
  UserRound, FileText,
} from 'lucide-react';
import QRCode from 'qrcode';
import { supabase } from '@/config/supabase';
import { useAppNav } from '@/hooks/useAppNav';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
import { useToast } from '@/hooks/useToast';
import PayvexoBackground from '@/components/student/dashboard/PayvexoBackground';

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
  org:          { name: string; short_name: string | null; slug: string | null; primary_color: string | null } | null;
  member:       { full_name: string; member_id: string; level: string | null } | null;
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

/**
 * Escape user-supplied strings before interpolating into the receipt
 * HTML template. The new-tab HTML is built with template literals, so
 * a malicious org name (or, more realistically, an apostrophe in a
 * member's name) would break the page or worse without this.
 */
function escapeHtml(input: string | null | undefined): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  const [downloading, setDownloading] = useState(false);
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
            org:organization_id ( name, short_name, slug, primary_color ),
            member:member_id ( full_name, member_id, level )
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

  // ── Download (real PDF — saves to disk, matches the on-screen UI) ──
  // The previous version called generatePaymentReceiptPDF which just
  // opened a new browser window with a totally different hardcoded
  // template. From the user's perspective: tapping Download navigated
  // away into an old-looking receipt page that DIDN'T download
  // anything. Nothing landed in their downloads folder.
  //
  // Real fix: snapshot THIS card (the redesigned hero-amount layout
  // the user sees on screen) into a canvas, drop it onto a jsPDF
  // page sized to the canvas's aspect ratio, and trigger save().
  // What the user downloads is byte-for-byte what they see.
  const handleDownload = useCallback(async () => {
    if (!receipt) return;
    setDownloading(true);
    try {
      // ── HTML receipt in a new tab ───────────────────────────
      // Stripe / Wise / Square all do it this way: serve a clean
      // printable HTML page, let the browser's native PDF engine
      // render it on Save. Result: pixel-perfect typography, real
      // fonts, no clipping, no canvas blurriness.
      //
      // The new tab has two large action buttons (Save PDF · Print)
      // that hide via @media print so the saved output is just the
      // receipt itself. Everything else is one self-contained doc.

      const orgPrimary = brandColor || '#FF6803';
      const orgInitial = (orgName.charAt(0) || 'P').toUpperCase();
      const verifyUrl  = window.location.href;
      const issuedAt   = formatDateTime(receipt.approved_at || receipt.created_at);

      // Pre-render the QR as a PNG data URL so we can embed it as
      // a plain <img>. This makes the receipt page self-contained
      // and prints without network round-trips.
      let qrDataUrl = '';
      try {
        qrDataUrl = await QRCode.toDataURL(verifyUrl, {
          width: 320,
          margin: 0,
          color: { dark: '#0F0703', light: '#FFFFFF' },
          errorCorrectionLevel: 'M',
        });
      } catch { /* best effort */ }

      // Build the rows that go into the items table. We render at
      // most three: dues, platform fee, total. When no fee exists
      // it collapses to a single "Total paid" line.
      const itemsHtml = feeBreakdown
        ? `
          <tr><td>${escapeHtml(receipt.payment_type?.title || 'Payment')}</td><td class="r">${escapeHtml(formatNaira(feeBreakdown.dues))}</td></tr>
          <tr><td>Platform fee</td><td class="r">${escapeHtml(formatNaira(feeBreakdown.fee))}</td></tr>
          <tr class="total"><td>Total</td><td class="r">${escapeHtml(formatNaira(feeBreakdown.total))}</td></tr>
        `
        : `
          <tr><td>${escapeHtml(receipt.payment_type?.title || 'Payment')}</td><td class="r">${escapeHtml(amountDisplay)}</td></tr>
          <tr class="total"><td>Total</td><td class="r">${escapeHtml(amountDisplay)}</td></tr>
        `;

      // Build the receipt HTML. CSS is inlined so the new tab is
      // fully self-contained — no external stylesheets, no fetches
      // after open. The print stylesheet hides the action bar.
      const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Receipt ${escapeHtml(receiptNo)} · ${escapeHtml(orgName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" />
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #F4F4F2; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #0F0703;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .actions {
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      display: flex; gap: 10px; z-index: 100;
    }
    .actions button {
      font-family: inherit; font-weight: 700; font-size: 13px;
      padding: 10px 18px; border-radius: 999px; border: 0; cursor: pointer;
      transition: transform .15s ease, box-shadow .15s ease;
      letter-spacing: 0.01em;
    }
    .actions .primary {
      background: ${orgPrimary}; color: #fff;
      box-shadow: 0 8px 20px -8px ${orgPrimary}99;
    }
    .actions .ghost {
      background: #FFFFFF; color: #0F0703;
      box-shadow: 0 4px 14px -6px rgba(15,7,3,.12);
    }
    .actions button:hover { transform: translateY(-1px); }

    .sheet {
      max-width: 720px; margin: 80px auto 40px;
      background: #FFFFFF;
      box-shadow:
        0 30px 60px -20px rgba(15,7,3,.10),
        0 10px 30px -10px rgba(15,7,3,.06);
      border-radius: 14px;
      overflow: hidden;
    }
    .sheet .inner { padding: 56px 64px; }

    .row { display: flex; align-items: center; justify-content: space-between; }

    /* Header */
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand .mark {
      width: 36px; height: 36px; border-radius: 10px;
      background: ${orgPrimary};
      color: #fff; font-weight: 800; font-size: 16px;
      display: flex; align-items: center; justify-content: center;
    }
    .brand .name {
      font-weight: 700; font-size: 18px; line-height: 1;
      letter-spacing: -0.01em;
    }
    .brand .sub {
      font-size: 11px; color: #7a7a78; margin-top: 4px;
      letter-spacing: 0.04em; text-transform: uppercase;
    }
    .receipt-label {
      font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
      color: #7a7a78; font-weight: 700;
    }
    .receipt-no {
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      font-weight: 600; font-size: 12px; color: #0F0703;
      margin-top: 4px;
    }

    hr { border: 0; border-top: 1px solid #EBEBE8; margin: 28px 0; }

    /* Hero amount */
    .hero { margin-top: 8px; }
    .hero .label {
      font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
      color: #7a7a78; font-weight: 700;
    }
    .hero .amount {
      font-weight: 800; font-size: 44px; letter-spacing: -0.025em;
      line-height: 1.1; margin-top: 6px;
      font-variant-numeric: tabular-nums;
    }
    .hero .status {
      display: inline-flex; align-items: center; gap: 8px;
      margin-top: 10px;
      font-size: 13px; font-weight: 600; color: #4f4f4d;
    }
    .pill {
      display: inline-block;
      font-size: 11px; font-weight: 800; letter-spacing: 0.06em;
      padding: 3px 10px; border-radius: 999px;
    }
    .pill.paid    { background: #E7FAF1; color: #047857; }
    .pill.pending { background: #FFF3DC; color: #B45309; }

    /* Two-column meta */
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
    .meta .label {
      font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;
      color: #7a7a78; font-weight: 700; margin-bottom: 8px;
    }
    .meta .body { font-size: 14px; line-height: 1.55; color: #2A2A28; }
    .meta .body strong { color: #0F0703; font-weight: 600; }
    .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12.5px; }

    /* Items table */
    table.items { width: 100%; border-collapse: collapse; }
    table.items th, table.items td {
      padding: 14px 0; text-align: left; font-size: 14px;
      border-bottom: 1px solid #EBEBE8;
    }
    table.items th {
      font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;
      color: #7a7a78; font-weight: 700; padding-bottom: 10px;
    }
    table.items td.r, table.items th.r { text-align: right; font-variant-numeric: tabular-nums; }
    table.items tr.total td {
      font-weight: 700; font-size: 16px;
      border-bottom: 0; padding-top: 18px;
    }
    table.items tr.total td:last-child {
      color: ${orgPrimary};
    }

    /* QR block */
    .verify {
      display: flex; gap: 24px; align-items: center;
    }
    .verify img {
      width: 96px; height: 96px;
      padding: 8px; background: #fff; border: 1px solid #EBEBE8; border-radius: 10px;
    }
    .verify .copy { font-size: 13px; color: #4f4f4d; line-height: 1.6; }
    .verify .copy .url { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 11.5px; color: #0F0703; word-break: break-all; }
    .verify .copy .no { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px; color: ${orgPrimary}; margin-top: 8px; font-weight: 700; }

    /* Footer */
    .footer {
      text-align: center; padding: 24px 0 0;
      font-size: 12px; color: #7a7a78;
    }
    .footer .thanks {
      font-size: 14px; color: #0F0703; font-weight: 600; margin-bottom: 8px;
    }

    /* Print rules: hide action bar, drop shadow + margin so the
       paper is filled edge-to-edge by the receipt content. */
    @page { size: A4; margin: 18mm; }
    @media print {
      html, body { background: #FFFFFF; }
      .actions { display: none !important; }
      .sheet { box-shadow: none; margin: 0 auto; border-radius: 0; }
      .sheet .inner { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="actions">
    <button class="primary" onclick="window.print()">Save as PDF</button>
    <button class="ghost" onclick="window.close()">Close</button>
  </div>

  <section class="sheet">
    <div class="inner">

      <!-- HEADER ────────────────────────────────────────── -->
      <div class="row">
        <div class="brand">
          <div class="mark">${escapeHtml(orgInitial)}</div>
          <div>
            <div class="name">${escapeHtml(orgName)}</div>
            <div class="sub">Payment receipt</div>
          </div>
        </div>
        <div style="text-align:right">
          <div class="receipt-label">Receipt</div>
          <div class="receipt-no">${escapeHtml(receiptNo)}</div>
        </div>
      </div>

      <hr />

      <!-- HERO AMOUNT ─────────────────────────────────────── -->
      <div class="hero">
        <div class="label">${paid ? 'Amount paid' : 'Amount charged'}</div>
        <div class="amount">${escapeHtml(amountDisplay)}</div>
        <div class="status">
          <span class="pill ${paid ? 'paid' : 'pending'}">${paid ? 'PAID' : 'PENDING'}</span>
          <span>${escapeHtml(issuedAt)}</span>
        </div>
      </div>

      <hr />

      <!-- TWO-COLUMN META ────────────────────────────────── -->
      <div class="grid meta">
        <div>
          <div class="label">Billed to</div>
          <div class="body">
            <strong>${escapeHtml(receipt.member?.full_name || receipt.payer_name || '—')}</strong><br />
            ${escapeHtml(receipt.member?.member_id || '—')}<br />
            ${receipt.member?.level ? `${escapeHtml(receipt.member.level)}<br />` : ''}
            ${receipt.payer_email ? escapeHtml(receipt.payer_email) : ''}
          </div>
        </div>
        <div>
          <div class="label">Issued by</div>
          <div class="body">
            <strong>${escapeHtml(orgName)}</strong><br />
            ${receipt.org?.slug ? `payvexo.com/${escapeHtml(receipt.org.slug)}<br />` : ''}
            ${escapeHtml(issuedAt)}
          </div>
        </div>
      </div>

      <hr />

      <!-- ITEMS TABLE ─────────────────────────────────────── -->
      <table class="items">
        <thead>
          <tr><th>Description</th><th class="r">Amount</th></tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <hr />

      <!-- PAYMENT META ─────────────────────────────────────── -->
      <div class="grid meta">
        <div>
          <div class="label">Payment method</div>
          <div class="body"><strong>${escapeHtml(channelLabel(receipt.payment_method, receipt.paystack_channel))}</strong></div>
        </div>
        <div>
          <div class="label">Transaction reference</div>
          <div class="body mono"><strong>${escapeHtml(ref)}</strong></div>
        </div>
      </div>

      <hr />

      <!-- VERIFY / QR ──────────────────────────────────────── -->
      <div class="verify">
        ${qrDataUrl ? `<img src="${qrDataUrl}" alt="Scan to verify" />` : ''}
        <div class="copy">
          <div><strong>Verify this receipt online</strong></div>
          <div>Scan the QR code or open the link below.</div>
          <div class="url">${escapeHtml(verifyUrl)}</div>
          <div class="no">Receipt &nbsp; ${escapeHtml(receiptNo)}</div>
        </div>
      </div>

      <hr />

      <!-- FOOTER ──────────────────────────────────────────── -->
      <div class="footer">
        <div class="thanks">${firstName ? `Thank you, ${escapeHtml(firstName)}.` : 'Thank you.'}</div>
        <div>Powered by <strong>Payvexo</strong> &middot; Smart payments &amp; dues management</div>
      </div>

    </div>
  </section>
</body>
</html>`;

      // Open in a new tab. We need to handle popup-blocker rejection
      // so we open the window first, then write into it after the
      // QR is ready (we already awaited above so it's ready here).
      const win = window.open('', '_blank');
      if (!win) {
        toast.error('Allow pop-ups for this site to download the receipt.');
        return;
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
      // Focus the new tab so the user sees it immediately.
      win.focus();
    } catch (e) {
      console.error('[ReceiptPage] PDF generation failed', e);
      toast.error('Could not generate receipt. Try again.');
    } finally {
      setDownloading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Brand colour for the hero accents. Falls back to the theme's
  // primary so the receipt still reads correctly when the org hasn't
  // configured their own colour yet.
  const brandColor = receipt?.org?.primary_color || t.primary;

  // First name for the friendly "Thank you, Wisdom" line. We split on
  // whitespace and fall back to nothing if the name isn't usable.
  const firstName = (() => {
    const full = receipt?.member?.full_name || receipt?.payer_name || '';
    const f = full.trim().split(/\s+/)[0] || '';
    return f.length > 1 ? f : '';
  })();

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
              {/* Top brand accent — uses the ORG's primary_color when set
                  so a church receipt feels church-coloured, a class
                  feels class-coloured, etc. Falls back to brand orange. */}
              <div
                className="h-1.5"
                style={{
                  background: `linear-gradient(90deg, ${brandColor} 0%, ${brandColor}cc 50%, ${brandColor}99 100%)`,
                }}
              />

              {/* ── HERO BLOCK ───────────────────────────────────
                  The amount is the star of the show. Org context sits
                  above it; the payment title sits beneath it. Status
                  pill anchors the top-right corner. */}
              <div
                className="relative px-6 pt-6 pb-7"
                style={{
                  background: `linear-gradient(180deg, ${brandColor}10 0%, transparent 100%)`,
                }}
              >
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-extrabold shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${brandColor} 0%, ${brandColor}cc 100%)`,
                        color: '#FFFFFF',
                        boxShadow: `0 6px 14px -6px ${brandColor}80`,
                      }}
                    >
                      {orgName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-extrabold leading-tight truncate" style={{ color: t.text }}>
                        {orgName}
                      </p>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: t.textTer }}>
                        Payment receipt
                      </p>
                    </div>
                  </div>
                  <StatusPill paid={!!paid} theme={theme} />
                </div>

                <p className="text-[10px] uppercase tracking-[0.18em] font-bold mb-1" style={{ color: t.textTer }}>
                  {paid ? 'Amount paid' : 'Amount charged'}
                </p>
                <p
                  className="text-[36px] sm:text-[42px] font-black leading-none tracking-tight tabular-nums"
                  style={{ color: t.text }}
                >
                  {amountDisplay}
                </p>
                <p className="text-[12px] mt-2 font-semibold" style={{ color: t.textSec }}>
                  for {receipt.payment_type?.title || 'Payment'}
                </p>

                {/* Receipt-number chip — sits below the hero amount so
                    you always have one short string to quote to support. */}
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  <span
                    className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-1 rounded-full"
                    style={{
                      background: `${brandColor}18`,
                      color: brandColor,
                      border: `1px solid ${brandColor}38`,
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
              </div>

              {/* Perforation line — gives the card the "torn ticket"
                  reading without overdoing it. */}
              <div
                className="mx-6"
                style={{
                  height: 1,
                  background: `repeating-linear-gradient(to right, ${t.cardBorder} 0 6px, transparent 6px 12px)`,
                }}
              />

              {/* ── PAID BY ─────────────────────────────────────── */}
              <Section title="Paid by" icon={<UserRound size={11} />} t={t} brand={brandColor}>
                <KV label="Member"    value={receipt.member?.full_name || receipt.payer_name || '—'} theme={theme} />
                <KV label="Member ID" value={receipt.member?.member_id || '—'} theme={theme} mono />
                {receipt.member?.level && (
                  <KV label="Level" value={receipt.member.level} theme={theme} small />
                )}
                {receipt.payer_email && (
                  <KV label="Email" value={receipt.payer_email} theme={theme} small icon={<Mail size={11} />} />
                )}
              </Section>

              {/* ── PAYMENT DETAILS ─────────────────────────────── */}
              <Section title="Payment details" icon={<CreditCard size={11} />} t={t} brand={brandColor}>
                <KV
                  label="Method"
                  value={channelLabel(receipt.payment_method, receipt.paystack_channel)}
                  theme={theme}
                />
                <KV label="Transaction ID" value={ref} theme={theme} mono small />
                <KV
                  label="Date"
                  value={formatDateTime(receipt.approved_at || receipt.created_at)}
                  theme={theme}
                  small
                  icon={<Calendar size={11} />}
                />
              </Section>

              {/* ── BREAKDOWN (only if there's a platform fee) ──── */}
              {feeBreakdown && (
                <Section title="Breakdown" icon={<FileText size={11} />} t={t} brand={brandColor}>
                  <KV label="Dues"          value={formatNaira(feeBreakdown.dues)}  theme={theme} small />
                  <KV label="Platform fee"  value={formatNaira(feeBreakdown.fee)}   theme={theme} small />
                  <KV label="Total charged" value={formatNaira(feeBreakdown.total)} theme={theme} highlight />
                </Section>
              )}

              {/* ── THANK-YOU + VERIFICATION ────────────────────── */}
              <div
                className="mx-6 mb-5 rounded-2xl overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${brandColor}12 0%, ${brandColor}05 100%)`,
                  border: `1px dashed ${brandColor}40`,
                }}
              >
                <div className="px-5 pt-5 pb-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: brandColor }}>
                      <Sparkles size={11} />
                      Thank you{firstName ? `, ${firstName}` : ''}
                    </p>
                    <p className="text-[15px] font-extrabold mt-1 leading-tight" style={{ color: t.text }}>
                      Your payment is on the books.
                    </p>
                    <p className="text-[12px] mt-1.5 leading-relaxed" style={{ color: t.textSec }}>
                      This is your official record. Save the PDF or share the
                      verification link — it stays valid for as long as the
                      payment is on file.
                    </p>
                  </div>
                  <VerifiedStamp theme={theme} />
                </div>

                {/* QR strip — visually inside the same gratitude block so
                    "thank you" and "here's how to verify" feel like one
                    breath, not two disconnected widgets. */}
                <div
                  className="mx-5 mb-5 rounded-xl p-3 flex items-center gap-3"
                  style={{
                    background: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${t.cardBorder}`,
                  }}
                >
                  <div
                    className="rounded-lg p-1.5 shrink-0"
                    style={{
                      background: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.08)',
                      border: `1px solid ${t.cardBorder}`,
                    }}
                  >
                    <canvas
                      ref={qrCanvasRef}
                      width={72}
                      height={72}
                      style={{ display: 'block' }}
                      aria-label="Receipt verification QR code"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.16em] font-bold inline-flex items-center gap-1" style={{ color: brandColor }}>
                      <ShieldCheck size={11} />
                      Scan to verify
                    </p>
                    <p className="text-[11px] mt-1 leading-relaxed" style={{ color: t.textSec }}>
                      Opens this live receipt on Payvexo. Receipt #{receiptNo} ·
                      issued {formatDateTime(receipt.approved_at || receipt.created_at)}.
                    </p>
                  </div>
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
                disabled={downloading}
                whileTap={{ scale: downloading ? 1 : 0.97 }}
                className="rounded-2xl py-3.5 flex items-center justify-center gap-2 text-[13px] font-bold text-white disabled:opacity-80"
                style={{
                  background: 'linear-gradient(135deg, #FF7A1E 0%, #FF6803 50%, #C84600 100%)',
                  boxShadow:
                    '0 12px 28px -12px rgba(255,104,3,0.55),' +
                    ' inset 0 1px 0 rgba(255,255,255,0.22)',
                }}
              >
                {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                {downloading ? 'Saving…' : 'Download PDF'}
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

// ── Section — visually groups related KV rows under a single
// labelled banner. Used to split the receipt into "Paid by",
// "Payment details", and the optional "Breakdown". Replaces the old
// flat data block, which buried the visual hierarchy in dividers.
function Section({
  title, icon, brand, t, children,
}: {
  title:    string;
  icon:     React.ReactNode;
  brand:    string;
  t:        ReturnType<typeof getDashboardTokens>;
  children: React.ReactNode;
}) {
  return (
    <div className="px-6 py-4 space-y-2.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span
          className="inline-flex w-5 h-5 rounded-full items-center justify-center"
          style={{ background: `${brand}18`, color: brand }}
        >
          {icon}
        </span>
        <p
          className="text-[10px] font-bold uppercase tracking-[0.18em]"
          style={{ color: t.textTer }}
        >
          {title}
        </p>
        <span className="flex-1 h-px" style={{ background: t.cardBorder }} />
      </div>
      {children}
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
