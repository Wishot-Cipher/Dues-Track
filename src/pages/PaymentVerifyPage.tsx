/**
 * PaymentVerifyPage — landing target after Paystack redirects the
 * user back from hosted checkout.
 *
 * Route: /:orgSlug/payments/verify?reference=<paystack-ref>
 *
 * Flow:
 *   1. Read `reference` from the URL
 *   2. Call paystackService.verify(reference)
 *   3. Render one of four states: approved · pending · failed · abandoned
 *   4. On approved, auto-redirect to the receipt page after 4s
 *   5. On pending, poll every 3s up to 8 times (most Paystack
 *      callbacks are already final, but USSD can lag)
 *
 * Visual: matches the rest of the app. Theme-aware — reads the
 * user's current light/dark preference via useTheme() and derives
 * all surface colours from getDashboardTokens(), the same helper
 * used by CreateDuePage, MakePaymentPage, and the dashboard.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Receipt as ReceiptIcon,
  Sparkles,
  XCircle,
} from 'lucide-react';
import paystackService, { type PaystackVerifyResult } from '@/services/paystackService';
import { APP_NAME } from '@/config/constants';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────
type UiState = 'verifying' | 'approved' | 'pending' | 'failed' | 'abandoned' | 'error';

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────
function naira(kobo?: number | null): string {
  if (!kobo && kobo !== 0) return '—';
  const n = kobo / 100;
  return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// STATE_META needs the live theme tokens, so we build it as a
// function rather than a module-level constant — same pattern as
// the page's own derived colours.
function buildStateMeta(tk: ReturnType<typeof getDashboardTokens>) {
  return {
    verifying: {
      color:    tk.primary,
      bg:       `${tk.primary}14`,
      border:   `${tk.primary}40`,
      title:    'Confirming your payment…',
      subtitle: "Hold tight — we're double-checking with Paystack.",
      Icon:     Loader2,
    },
    approved: {
      color:    tk.mint,
      bg:       `${tk.mint}14`,
      border:   `${tk.mint}48`,
      title:    'Payment confirmed.',
      subtitle: 'Your receipt is on the way to your inbox.',
      Icon:     CheckCircle2,
    },
    pending: {
      color:    tk.amber,
      bg:       `${tk.amber}18`,
      border:   `${tk.amber}48`,
      title:    'Still processing…',
      subtitle: "Bank transfers and USSD can take a minute. We'll keep checking.",
      Icon:     Loader2,
    },
    failed: {
      color:    tk.danger,
      bg:       `${tk.danger}18`,
      border:   `${tk.danger}50`,
      title:    'Payment failed.',
      subtitle: 'Nothing was charged. You can try again.',
      Icon:     XCircle,
    },
    abandoned: {
      color:    tk.textSec,
      bg:       tk.card,
      border:   tk.cardBorder,
      title:    'You backed out.',
      subtitle: 'No worries — nothing was charged. You can try again.',
      Icon:     AlertCircle,
    },
    error: {
      color:    tk.danger,
      bg:       `${tk.danger}18`,
      border:   `${tk.danger}50`,
      title:    'We hit a snag.',
      subtitle: 'Something went wrong on our end while verifying.',
      Icon:     AlertCircle,
    },
  } satisfies Record<UiState, {
    color: string; bg: string; border: string;
    title: string; subtitle: string; Icon: React.ElementType;
  }>;
}

const MAX_POLLS = 8;
const POLL_MS   = 3000;

// ─────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────
export default function PaymentVerifyPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [params]    = useSearchParams();
  const navigate    = useNavigate();

  // ── Theme tokens ── same two-liner as CreateDuePage / MakePaymentPage
  const { theme } = useTheme();
  const tk = getDashboardTokens(theme);
  const isLight = theme === 'light';

  const reference = params.get('reference') || params.get('trxref') || '';

  const [uiState, setUiState] = useState<UiState>(reference ? 'verifying' : 'error');
  const [result, setResult]   = useState<PaystackVerifyResult | null>(null);
  const [errMsg, setErrMsg]   = useState<string | null>(reference ? null : 'Missing transaction reference.');
  const pollCount = useRef(0);

  const verifyOnce = useCallback(async () => {
    const r = await paystackService.verify(reference);
    setResult(r);

    if (!r.ok) {
      setUiState('error');
      setErrMsg(r.error || 'Verification failed.');
      return;
    }

    switch (r.status) {
      case 'approved':  setUiState('approved');  break;
      case 'failed':    setUiState('failed');    break;
      case 'abandoned': setUiState('abandoned'); break;
      case 'reversed':  setUiState('failed');    break;
      case 'pending':   setUiState('pending');   break;
      default:          setUiState('pending');
    }
  }, [reference]);

  useEffect(() => {
    if (!reference) return;
    void verifyOnce();
  }, [reference, verifyOnce]);

  // ── Auto-poll while pending ──
  useEffect(() => {
    if (uiState !== 'pending') return;
    if (pollCount.current >= MAX_POLLS) return;
    const id = window.setTimeout(() => {
      pollCount.current += 1;
      void verifyOnce();
    }, POLL_MS);
    return () => window.clearTimeout(id);
  }, [uiState, verifyOnce]);

  // ── Auto-redirect to receipt after approval ──
  useEffect(() => {
    if (uiState !== 'approved') return;
    const ticketCode = result?.ticket_code;
    const pid = result?.payment?.id;
    const id = window.setTimeout(() => {
      if (ticketCode) { navigate(`/${orgSlug}/ticket/${ticketCode}`); return; }
      if (pid)        { navigate(`/${orgSlug}/receipt/${pid}`); }
    }, 3200);
    return () => window.clearTimeout(id);
  }, [uiState, result, navigate, orgSlug]);

  // ── Derived ──
  const stateMeta  = useMemo(() => buildStateMeta(tk), [tk]);
  const meta       = stateMeta[uiState];
  const { Icon }   = meta;
  const showAmount = uiState === 'approved' || uiState === 'pending';

  return (
    <div
      className="min-h-screen relative overflow-x-hidden"
      style={{ minHeight: '100dvh', background: tk.bg }}
    >
      {/* Ambient glow — colour tracks current state */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <motion.div
          className="absolute rounded-full blur-[180px]"
          style={{
            width: 620, height: 620,
            background: `radial-gradient(circle, ${meta.color} 0%, transparent 70%)`,
            top: '-12%', right: '-10%',
            opacity: isLight ? 0.10 : 0.18,
          }}
          animate={{ opacity: isLight ? [0.08, 0.13, 0.08] : [0.16, 0.22, 0.16] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Top bar */}
      <nav
        className="relative z-10 max-w-2xl mx-auto px-5 sm:px-6 py-5 flex items-center justify-between"
      >
        <button
          onClick={() => navigate(orgSlug ? `/${orgSlug}/dashboard` : '/')}
          className="flex items-center gap-2 text-sm font-medium transition-colors"
          style={{ color: tk.textSec }}
        >
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </button>
        <span className="text-base font-bold" style={{ color: tk.text }}>{APP_NAME}</span>
      </nav>

      {/* Main card */}
      <main className="relative z-10 max-w-2xl mx-auto px-5 sm:px-6 pt-6 pb-24">
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="rounded-[28px] p-6 sm:p-8 text-center"
          style={{
            background: tk.card,
            border: `1px solid ${tk.cardBorder}`,
            boxShadow: isLight
              ? '0 4px 24px -8px rgba(15,7,3,0.10)'
              : 'none',
          }}
        >
          {/* State icon */}
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 230, damping: 18, delay: 0.05 }}
            className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 relative"
            style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
          >
            <Icon
              className={`w-10 h-10 ${(uiState === 'verifying' || uiState === 'pending') ? 'animate-spin' : ''}`}
              style={{ color: meta.color }}
              strokeWidth={uiState === 'approved' ? 2.4 : 2}
            />
            {uiState === 'approved' && (
              <motion.div
                className="absolute inset-0 rounded-3xl"
                style={{ border: `2px solid ${meta.color}` }}
                initial={{ scale: 1, opacity: 0.8 }}
                animate={{ scale: 1.6, opacity: 0 }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
              />
            )}
          </motion.div>

          {/* Title + subtitle */}
          <h1
            className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2"
            style={{ color: tk.text }}
          >
            {meta.title}
          </h1>
          <p
            className="text-sm leading-6 mb-6 max-w-md mx-auto"
            style={{ color: tk.textSec }}
          >
            {meta.subtitle}
          </p>

          {/* Amount card */}
          <AnimatePresence>
            {showAmount && result?.payment && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="rounded-2xl p-5 mb-5 inline-block min-w-[260px]"
                style={{
                  background: isLight ? 'rgba(15,7,3,0.04)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${tk.cardBorder}`,
                }}
              >
                <p
                  className="text-[10px] uppercase tracking-[0.22em] font-bold mb-1"
                  style={{ color: tk.textTer }}
                >
                  Amount
                </p>
                <p
                  className="text-3xl font-extrabold tracking-tight"
                  style={{ color: tk.text }}
                >
                  {naira(result.payment.total_charged_kobo)}
                </p>
                {result.payment.platform_fee_kobo && result.payment.platform_fee_kobo > 0 ? (
                  <p className="text-[11px] mt-2" style={{ color: tk.textTer }}>
                    Dues {naira(result.payment.dues_amount_kobo)} + service fee {naira(result.payment.platform_fee_kobo)}
                  </p>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Reference */}
          {reference && (
            <p className="text-[11px] font-mono mb-1" style={{ color: tk.textTer }}>
              REF · {reference}
            </p>
          )}

          {/* Error message */}
          {errMsg && uiState === 'error' && (
            <p className="text-xs mt-1" style={{ color: tk.danger }}>{errMsg}</p>
          )}

          {/* Action row */}
          <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
            {uiState === 'approved' && result?.payment?.id && (
              <motion.button
                onClick={() => navigate(`/${orgSlug}/receipt/${result.payment!.id}`)}
                className="px-5 py-3 rounded-2xl font-bold text-sm flex items-center gap-2"
                style={{
                  background: `linear-gradient(135deg, ${tk.mint} 0%, #00D88B 100%)`,
                  boxShadow: `0 8px 28px ${tk.mint}52`,
                  color: '#0F0703',
                }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <ReceiptIcon className="w-4 h-4" />
                View receipt
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            )}

            {(uiState === 'failed' || uiState === 'abandoned' || uiState === 'error') && (
              <motion.button
                onClick={() => navigate(orgSlug ? `/${orgSlug}/payments` : '/')}
                className="px-5 py-3 rounded-2xl text-white font-bold text-sm flex items-center gap-2"
                style={{
                  background: `linear-gradient(135deg, ${tk.primary} 0%, ${tk.amber} 100%)`,
                  boxShadow: `0 8px 28px ${tk.primary}40`,
                }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <Sparkles className="w-4 h-4" />
                Try again
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            )}

            {(uiState === 'pending' || uiState === 'error') && (
              <motion.button
                onClick={() => { pollCount.current = 0; setUiState('verifying'); void verifyOnce(); }}
                className="px-4 py-2.5 rounded-2xl text-sm font-semibold flex items-center gap-2"
                style={{
                  background: isLight ? 'rgba(15,7,3,0.05)' : 'rgba(255,255,255,0.04)',
                  color: tk.textSec,
                  border: `1px solid ${tk.cardBorder}`,
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Check again
              </motion.button>
            )}
          </div>

          {/* Footer notes */}
          {uiState === 'approved' && (
            <p className="text-[11px] mt-5" style={{ color: tk.textTer }}>
              Redirecting to your receipt in a moment…
            </p>
          )}
          {uiState === 'pending' && pollCount.current >= MAX_POLLS && (
            <p className="text-[11px] mt-5" style={{ color: tk.textTer }}>
              Still nothing? You can safely close this tab. We'll notify you when the payment lands.
            </p>
          )}
        </motion.section>
      </main>
    </div>
  );
}