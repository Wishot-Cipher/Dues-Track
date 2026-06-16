/**
 * MakePaymentPage — mockup-faithful payment screen.
 *
 * Layout (matches the Lucy Nwakwo "Make Payment" mockup):
 *   • Back arrow + "Make Payment" title
 *   • 3-step horizontal progress: Review → Payment → Confirm
 *     - Each step has a circular badge + label
 *     - Steps render filled (current), checked (done), or muted (todo)
 *   • "You are paying" section
 *     - Category icon + due title + amount (right side)
 *   • "Pay with" section
 *     - Paystack card showing the brand + the channels it bundles
 *       (Bank Transfer / USSD / Card). Tap shows nothing more —
 *       Paystack handles the rail selection on the hosted page.
 *   • Big orange "Pay ₦{total} →" sticky button at the bottom
 *
 * Below the fold: a soft <details> with the manual "I can't pay
 * online" fallback for users without internet. This keeps the
 * Paystack-first flow loud without removing the offline path.
 *
 * Theme-aware. Uses the new dashboard tokens.
 *
 * Why a separate file from the legacy PaymentDetailPage: that page
 * is 950 lines of feature overlap (timelines, offline queues, pay-for-
 * others, QR receipts) and trying to graft the new design onto it
 * was creating noise. This page does ONE thing — get the member to
 * Paystack cleanly — and links out to the legacy page only when the
 * member explicitly chooses the manual fallback.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, BookOpen, Calendar, CheckCircle2,
  CreditCard, GraduationCap, Heart, Loader2, Sparkles, Ticket, Wallet, Shield, Smartphone,
} from 'lucide-react';
import { useAppAuth as useAuth } from '@/hooks/useAppAuth';
import { useAppNav } from '@/hooks/useAppNav';
import { useToast } from '@/hooks/useToast';
import { supabase } from '@/config/supabase';
import { getOrgScope } from '@/utils/orgScope';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
import PayvexoBackground from '@/components/student/dashboard/PayvexoBackground';
import paystackService from '@/services/paystackService';

// ── Types ──────────────────────────────────────────────────────────
interface PaymentTypeRow {
  id: string;
  title: string;
  description: string | null;
  amount: number;
  deadline: string | null;
  category: string | null;
  is_mandatory: boolean | null;
  event_date?: string | null;
  event_venue?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  account_name?: string | null;
}

interface PaymentRow {
  id: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'failed' | 'abandoned';
  transaction_ref?: string | null;
}

interface TierRow {
  id: string;
  name: string;
  description: string | null;
  price: number;
  quantity: number | null;
  sold_count: number;
}

// ── Helpers ────────────────────────────────────────────────────────
function iconForCategory(key?: string | null) {
  const k = (key || '').toLowerCase();
  if (k.includes('tuition') || k.includes('fee')) return GraduationCap;
  if (k.includes('don') || k.includes('charity')) return Heart;
  if (k.includes('book') || k.includes('material')) return BookOpen;
  if (k.includes('event') || k.includes('ticket')) return Ticket;
  if (k.includes('party') || k.includes('social')) return Sparkles;
  if (k.includes('calendar') || k.includes('annual')) return Calendar;
  return Wallet;
}

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Estimate of the service fee the student pays on top of the dues, so the
// ORG receives EXACTLY the amount it set. Mirrors the server gross-up
// (api/paystack): covers Paystack's worst-case (bank transfer) fee — 1.5%
// + ₦100 over ₦2,500, capped at ₦2,000. Card is cheaper, so this is an
// upper bound; the exact total is shown on the secure checkout page. Does
// not include any per-org platform margin (0 by default).
function estimateServiceFeeNaira(duesNaira: number): number {
  if (!duesNaira || duesNaira <= 0) return 0;
  const D = Math.round(duesNaira * 100); // kobo
  const PERCENT = 0.015, FLAT = 10000, THRESHOLD = 250000, CAP = 200000;
  let total = (D + FLAT) / (1 - PERCENT);
  if (total <= THRESHOLD) total = D / (1 - PERCENT);
  let cover = Math.ceil(total - D);
  if (cover > CAP) cover = CAP;
  return cover / 100;
}

function daysFromNow(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// ── Page ───────────────────────────────────────────────────────────
export default function MakePaymentPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { go } = useAppNav();
  const { theme } = useTheme();
  const t = getDashboardTokens(theme);
  const toast = useToast();
  const isLight = theme === 'light';

  const [pt, setPt] = useState<PaymentTypeRow | null>(null);
  const [myPayments, setMyPayments] = useState<PaymentRow[]>([]);
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Paystack flow state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Load payment_type + this member's prior payments ─────────────
  useEffect(() => {
    let cancelled = false;
    if (!id || !user?.id) return;

    (async () => {
      setLoading(true);
      try {
        const scope = getOrgScope();
        let ptQ = supabase
          .from('payment_types')
          .select('id, title, description, amount, deadline, category, is_mandatory, event_date, event_venue, bank_name, account_number, account_name')
          .eq('id', id);
        if (scope) ptQ = ptQ.eq('organization_id', scope.orgId);
        const { data: ptRow, error: ptErr } = await ptQ.maybeSingle();
        if (ptErr) throw ptErr;
        if (!cancelled) setPt(ptRow as PaymentTypeRow | null);

        // Events: load the ticket tiers so the buyer can choose one.
        if ((ptRow as PaymentTypeRow | null)?.category === 'event') {
          const { data: tierRows } = await supabase
            .from('event_ticket_tiers')
            .select('id, name, description, price, quantity, sold_count')
            .eq('payment_type_id', id)
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
          if (!cancelled) {
            const list = (tierRows || []) as TierRow[];
            setTiers(list);
            // default to the first tier that isn't sold out
            const firstAvailable = list.find(t => t.quantity == null || t.sold_count < t.quantity) || list[0] || null;
            setSelectedTierId(firstAvailable?.id ?? null);
          }
        }

        let payQ = supabase
          .from('payments')
          .select('id, amount, status, transaction_ref')
          .eq('payment_type_id', id)
          .eq('member_id', user.id);
        if (scope) payQ = payQ.eq('organization_id', scope.orgId);
        const { data: payRows } = await payQ;
        if (!cancelled) setMyPayments((payRows || []) as PaymentRow[]);
      } catch (e) {
        if (!cancelled) {
          console.error('MakePaymentPage load error', e);
          toast.error('Could not load this payment.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [id, user?.id, toast]);

  // ── Derived ─────────────────────────────────────────────────────
  const approvedSum = useMemo(
    () => myPayments.filter(p => p.status === 'approved').reduce((s, p) => s + Number(p.amount || 0), 0),
    [myPayments],
  );
  const isEvent = (pt?.category || '').toLowerCase() === 'event';
  const eventDate = pt?.event_date ?? null;
  const eventEnded = isEvent && eventDate ? new Date(eventDate).getTime() < Date.now() : false;
  const selectedTier = useMemo(() => tiers.find(t => t.id === selectedTierId) || null, [tiers, selectedTierId]);
  const tierSoldOut = (t: TierRow) => t.quantity != null && t.sold_count >= t.quantity;
  const eventSoldOut = tiers.length > 0 && tiers.every(tierSoldOut);
  const eventClosed = eventEnded || eventSoldOut;

  const dueAmount = Number(pt?.amount || 0);
  const approvedOutstanding = Math.max(0, dueAmount - approvedSum);
  // Events have no "outstanding" — you buy a ticket at the chosen tier price.
  const outstanding = isEvent ? Number(selectedTier?.price ?? dueAmount) : approvedOutstanding;
  const fullyPaid = isEvent ? false : approvedOutstanding <= 0;
  const hasPending = myPayments.some(p => p.status === 'pending');
  const daysLeft = daysFromNow(pt?.deadline ?? null);

  // The org receives `outstanding` exactly; the student also pays a small
  // service fee that covers the secure-transfer cost. Shown transparently.
  const serviceFee = estimateServiceFeeNaira(outstanding);
  const totalToPay = outstanding + serviceFee;

  const Icon = iconForCategory(pt?.category);

  // Step state: which of the 3 dots is "current"
  // - Review: while we're showing the page (default)
  // - Payment: while we're handing off to Paystack
  // - Confirm: handled on the verify page (separate route)
  const step: 'review' | 'payment' = submitting ? 'payment' : 'review';

  // ── Paystack handoff ────────────────────────────────────────────
  const handlePayWithPaystack = useCallback(async () => {
    // Guard against double-fire. The button is disabled={submitting}
    // but the disabled attribute can be bypassed by keyboard,
    // screen-reader, or a programmatic .click(). Guarding here means
    // a flaky network click-spammer can't open multiple Paystack
    // sessions — each session would consume a Paystack channel slot
    // and the user would see two "pay" tabs.
    if (submitting) return;
    if (!user?.id || !id) {
      setError('You need to be signed in to pay.');
      return;
    }
    if (eventEnded) {
      setError('This event has ended. Tickets are no longer available.');
      return;
    }
    if (!isEvent && fullyPaid) {
      toast.success("You've already paid this due in full.");
      return;
    }
    if (isEvent) {
      if (tiers.length > 0 && !selectedTierId) {
        setError('Please choose a ticket type.');
        return;
      }
      if (selectedTier && tierSoldOut(selectedTier)) {
        setError(`"${selectedTier.name}" is sold out. Pick another type.`);
        return;
      }
    }
    setSubmitting(true);
    setError(null);

    const res = await paystackService.initialize({
      memberId: user.id,
      paymentTypeId: id,
      tierId: isEvent ? selectedTierId : undefined,
      // server defaults callbackPath to /<orgSlug>/payments/verify
    });

    if (!res.ok || !res.authorization_url) {
      setError(res.error || 'Could not start checkout. Please try again.');
      setSubmitting(false);
      return;
    }

    window.location.assign(res.authorization_url);
  }, [submitting, user?.id, id, fullyPaid, toast, isEvent, tiers, selectedTierId, selectedTier, eventEnded]);

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{ minHeight: '100dvh' }}>
      <PayvexoBackground theme={theme} />

      <main className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-40">

        {/* ── Top row: back + title ────────────────────────────── */}
        <header className="flex items-center gap-3 mb-5">
          <button
            type="button"
            onClick={() => go('/dashboard')}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
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
          <h1 className="text-[17px] font-extrabold tracking-tight" style={{ color: t.text }}>
            Make Payment
          </h1>
        </header>

        {/* ── 3-step progress ──────────────────────────────────── */}
        <ProgressBar step={step} theme={theme} />

        {/* ── Loading / not-found ─────────────────────────────── */}
        {loading && (
          <div className="mt-10 flex flex-col items-center gap-2" style={{ color: t.textSec }}>
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">Loading your due…</span>
          </div>
        )}

        {!loading && !pt && (
          <div
            className="mt-10 rounded-2xl px-5 py-6 text-center"
            style={{ background: t.card, border: `1px solid ${t.cardBorder}`, color: t.textSec }}
          >
            <p className="text-sm">This due is not available, or you don't have access to it.</p>
            <button
              type="button"
              onClick={() => go('/dashboard')}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold"
              style={{ background: t.primary, color: '#fff' }}
            >
              <ArrowLeft size={14} /> Back to dashboard
            </button>
          </div>
        )}

        {/* ── Main content (loaded) ───────────────────────────── */}
        {!loading && pt && (
          <div className="mt-6 space-y-5">
            {/* You are paying */}
            <section>
              <p
                className="text-[12px] uppercase tracking-[0.14em] font-bold mb-2 px-1"
                style={{ color: t.textTer }}
              >
                You are paying
              </p>
              <div
                className="w-full rounded-2xl px-4 py-4 flex items-center gap-3"
                style={{
                  background: t.card,
                  border: `1px solid ${t.cardBorder}`,
                  boxShadow: isLight
                    ? '0 1px 0 rgba(255,255,255,0.7) inset, 0 4px 14px -8px rgba(15,7,3,0.08)'
                    : '0 1px 0 rgba(255,255,255,0.02) inset',
                }}
              >
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                  style={{
                    background: isLight ? hexAlpha(t.primary, 0.10) : hexAlpha(t.primary, 0.16),
                    border: `1px solid ${hexAlpha(t.primary, isLight ? 0.20 : 0.28)}`,
                  }}
                >
                  <Icon size={20} color={t.primary} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold truncate" style={{ color: t.text }}>
                    {pt.title}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: t.textSec }}>
                    {pt.is_mandatory ? 'Mandatory' : 'Optional'}
                    {daysLeft !== null
                      ? ` · ${daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue`
                        : daysLeft === 0 ? 'Due today'
                          : `${daysLeft}d left`}`
                      : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[15px] font-extrabold tabular-nums" style={{ color: t.text }}>
                    {formatNaira(outstanding)}
                  </p>
                  {approvedSum > 0 && approvedSum < dueAmount && (
                    <p className="text-[10px] font-semibold" style={{ color: t.amber }}>
                      part-paid
                    </p>
                  )}
                </div>
              </div>
            </section>

            {eventEnded && (
              <section>
                <div
                  className="rounded-2xl px-4 py-3"
                  style={{
                    background: isLight ? '#FFF1F1' : 'rgba(239,68,68,0.10)',
                    border: `1px solid ${isLight ? '#F8C7C7' : 'rgba(239,68,68,0.25)'}`,
                  }}
                >
                  <p className="text-[12px] font-bold" style={{ color: t.danger }}>
                    This event has ended.
                  </p>
                  <p className="text-[11px] mt-1" style={{ color: t.textSec }}>
                    Tickets are closed and payment is no longer available.
                  </p>
                </div>
              </section>
            )}

            {/* Ticket type selector (events only) */}
            {isEvent && tiers.length > 0 && (
              <section>
                <p
                  className="text-[12px] uppercase tracking-[0.14em] font-bold mb-2 px-1"
                  style={{ color: t.textTer }}
                >
                  Choose your ticket
                </p>
                <div className="space-y-2">
                  {tiers.map((tier) => {
                    const sold = tierSoldOut(tier);
                    const active = tier.id === selectedTierId;
                    const left = tier.quantity != null ? Math.max(0, tier.quantity - tier.sold_count) : null;
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        disabled={sold || eventEnded}
                        onClick={() => setSelectedTierId(tier.id)}
                        className="w-full rounded-2xl px-4 py-3 flex items-center gap-3 text-left transition-all disabled:opacity-50"
                        style={{
                          background: t.card,
                          border: `1.5px solid ${active ? t.primary : t.cardBorder}`,
                          boxShadow: active ? `0 8px 22px -12px ${t.primary}` : 'none',
                        }}
                      >
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                          style={{
                            border: `2px solid ${active ? t.primary : t.cardBorder}`,
                            background: active ? t.primary : 'transparent',
                          }}
                        >
                          {active && <CheckCircle2 size={12} color="#fff" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-bold truncate" style={{ color: t.text }}>{tier.name}</p>
                          {(tier.description || left != null || sold) && (
                            <p className="text-[11px] mt-0.5" style={{ color: sold || eventEnded ? t.amber : t.textSec }}>
                              {eventEnded ? 'Ended' : sold ? 'Sold out' : tier.description || (left != null ? `${left} left` : '')}
                            </p>
                          )}
                        </div>
                        <p className="text-[14px] font-extrabold tabular-nums shrink-0" style={{ color: t.text }}>
                          {formatNaira(Number(tier.price))}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Pay with — premium payment-method card. The big visual
                draw is the credit-card "chip" graphic on the left
                with the brand-orange gradient — the same finish as
                physical bank cards. The right side stacks the trusted
                network logos (Visa · Mastercard · Verve) so the user
                instantly sees we accept the brands they own. */}
            <section>
              <p
                className="text-[12px] uppercase tracking-[0.14em] font-bold mb-2 px-1"
                style={{ color: t.textTer }}
              >
                Pay with
              </p>
              <div
                className="relative rounded-2xl p-4 overflow-hidden"
                style={{
                  background: t.card,
                  border: `1px solid ${t.cardBorder}`,
                  boxShadow: isLight
                    ? '0 1px 0 rgba(255,255,255,0.7) inset, 0 6px 22px -10px rgba(15,7,3,0.10)'
                    : '0 1px 0 rgba(255,255,255,0.02) inset',
                }}
              >
                {/* Top row: brand chip + paystack label + status pill */}
                <div className="flex items-center gap-3">
                  <PaymentCardChip theme={theme} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-extrabold leading-tight" style={{ color: t.text }}>
                      Paystack secure checkout
                    </p>
                    <p className="text-[11px] mt-0.5 leading-snug" style={{ color: t.textSec }}>
                      Bank transfer, USSD or card — pick on the next screen.
                    </p>
                  </div>
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 shrink-0"
                    style={{
                      background: isLight ? '#E7FAF1' : 'rgba(48,255,172,0.14)',
                      color: isLight ? '#0E9F62' : t.mint,
                    }}
                  >
                    <Shield size={10} /> Secure
                  </span>
                </div>

                {/* Bottom row: card brand logos + small rail pills */}
                <div
                  className="mt-3 pt-3 flex items-center justify-between gap-2"
                  style={{ borderTop: `1px dashed ${t.cardBorder}` }}
                >
                  <div className="flex items-center gap-2">
                    <CardBrandVisa theme={theme} />
                    <CardBrandMastercard />
                    <CardBrandVerve />
                  </div>
                  <div className="flex items-center gap-1">
                    <RailPill icon={<Smartphone size={11} />} label="USSD" theme={theme} />
                    <RailPill icon={<CreditCard size={11} />} label="Card" theme={theme} />
                  </div>
                </div>
              </div>
            </section>

            {/* All-paid notice */}
            {fullyPaid && (
              <div
                className="rounded-2xl px-4 py-3 flex items-center gap-2.5"
                style={{
                  background: isLight ? '#E7FAF1' : 'rgba(48,255,172,0.10)',
                  border: `1px solid ${isLight ? '#B8EED4' : 'rgba(48,255,172,0.22)'}`,
                }}
              >
                <CheckCircle2 size={18} color={t.mint} />
                <p className="text-[13px] font-semibold" style={{ color: t.text }}>
                  You've already paid this due in full.
                </p>
              </div>
            )}

            {hasPending && !fullyPaid && (
              <div
                className="rounded-2xl px-4 py-3 flex items-start gap-2.5"
                style={{
                  background: isLight ? '#FFF3DC' : 'rgba(245,158,11,0.10)',
                  border: `1px solid ${isLight ? '#FACC93' : 'rgba(245,158,11,0.22)'}`,
                }}
              >
                <Loader2 size={18} color={t.amber} className="animate-spin shrink-0 mt-0.5" />
                <p className="text-[12px] leading-snug" style={{ color: t.text }}>
                  You have a payment awaiting approval. You can still complete an online payment below.
                </p>
              </div>
            )}

            {error && (
              <div
                className="rounded-2xl px-4 py-3"
                style={{
                  background: isLight ? '#FEE6E6' : 'rgba(239,68,68,0.10)',
                  border: `1px solid ${isLight ? '#FAB6B6' : 'rgba(239,68,68,0.28)'}`,
                  color: isLight ? '#A82020' : '#FCA5A5',
                }}
              >
                <p className="text-[12px] font-semibold">{error}</p>
              </div>
            )}

            {/* Manual fallback — collapsed by default. Paystack-first */}
            <details className="group">
              <summary
                className="list-none cursor-pointer flex items-center justify-between rounded-2xl px-4 py-3 text-[12px] font-semibold"
                style={{
                  background: t.card,
                  border: `1px dashed ${t.cardBorder}`,
                  color: t.textSec,
                }}
              >
                <span>I can't pay online right now</span>
                <span
                  className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                  style={{
                    background: isLight ? '#FEEDDC' : 'rgba(245,158,11,0.18)',
                    color: t.amber,
                  }}
                >
                  slower
                </span>
              </summary>
              <div
                className="mt-2 rounded-2xl p-4 text-[12px] leading-snug"
                style={{
                  background: t.card,
                  border: `1px solid ${t.cardBorder}`,
                  color: t.textSec,
                }}
              >
                <p>
                  Paying offline is supported but slower — payments need manual review by your
                  admin and can take a day or two.
                </p>
                <button
                  type="button"
                  onClick={() => go(`/payment/${pt.id}/manual`)}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold"
                  style={{
                    background: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)',
                    color: t.primary,
                    border: `1px solid ${t.primaryRing}`,
                  }}
                >
                  Use bank transfer / upload receipt
                  <ArrowRight size={12} />
                </button>
              </div>
            </details>
          </div>
        )}
      </main>

      {/* ── Sticky bottom CTA ───────────────────────────────── */}
      {!loading && pt && (isEvent ? !eventClosed : !fullyPaid) && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 px-4 sm:px-6 pb-5 pt-3"
          style={{
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)',
            background: isLight
              ? 'linear-gradient(180deg, rgba(255,251,247,0) 0%, rgba(255,251,247,0.92) 35%, rgba(255,251,247,1) 100%)'
              : 'linear-gradient(180deg, rgba(15,7,3,0) 0%, rgba(15,7,3,0.92) 35%, rgba(15,7,3,1) 100%)',
          }}
        >
          <div className="max-w-2xl mx-auto">
            {/* Transparent breakdown — the org gets `outstanding` exactly;
                the student also covers a small secure-transfer fee. Exact
                total is confirmed on the Paystack checkout page. */}
            {serviceFee > 0 && (
              <div
                className="rounded-2xl px-4 py-3 mb-3 text-[12.5px]"
                style={{ background: isLight ? 'rgba(15,7,3,0.04)' : 'rgba(255,255,255,0.05)', border: `1px solid ${t.cardBorder}`, color: t.textSec }}
              >
                <div className="flex items-center justify-between">
                  <span>{isEvent ? 'Ticket' : 'Dues'}</span>
                  <span className="tabular-nums" style={{ color: t.text }}>{formatNaira(outstanding)}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span>Service fee <span style={{ color: t.textTer }}>· secure transfer</span></span>
                  <span className="tabular-nums">~{formatNaira(serviceFee)}</span>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 font-bold" style={{ borderTop: `1px solid ${t.cardBorder}`, color: t.text }}>
                  <span>You pay</span>
                  <span className="tabular-nums">~{formatNaira(totalToPay)}</span>
                </div>
                <p className="text-[10.5px] mt-1.5" style={{ color: t.textTer }}>
                  {isEvent ? 'Organiser' : 'Your group'} receives the full {formatNaira(outstanding)}. Exact total shown on the secure checkout.
                </p>
              </div>
            )}
            <motion.button
              type="button"
              onClick={handlePayWithPaystack}
              disabled={submitting}
              whileTap={{ scale: 0.985 }}
              className="w-full rounded-2xl h-14 flex items-center justify-center gap-2 text-[15px] font-extrabold text-white disabled:opacity-70"
              style={{
                background: `linear-gradient(135deg, #FF7A1E 0%, #FF6803 50%, #E55A02 100%)`,
                boxShadow:
                  '0 18px 40px -16px rgba(255,104,3,0.55),' +
                  ' 0 4px 12px -2px rgba(255,104,3,0.32),' +
                  ' inset 0 1px 0 rgba(255,255,255,0.22)',
              }}
            >
              {submitting ? (
                <>
                  <Shield size={17} className="animate-pulse" />
                  Securing your checkout…
                </>
              ) : (
                <>
                  {isEvent ? 'Buy ticket · ' : 'Pay '}{formatNaira(serviceFee > 0 ? totalToPay : outstanding)}
                  <ArrowRight size={16} />
                </>
              )}
            </motion.button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ProgressBar — the three-step indicator ───────────────────────
function ProgressBar({
  step, theme,
}: { step: 'review' | 'payment' | 'confirm'; theme: 'light' | 'dark' }) {
  const t = getDashboardTokens(theme);
  const steps = [
    { key: 'review', label: 'Review' },
    { key: 'payment', label: 'Payment' },
    { key: 'confirm', label: 'Confirm' },
  ] as const;

  return (
    <div className="flex items-center justify-between gap-2 px-1">
      {steps.map((s, i) => {
        const stepIndex = steps.findIndex(x => x.key === step);
        const isCurrent = s.key === step;
        const isDone = i < stepIndex;
        const dotBg = isCurrent ? t.primary
          : isDone ? t.mint
            : (theme === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.06)');
        const dotColor = isCurrent || isDone ? '#FFFFFF' : t.textTer;
        const dotBorder = isCurrent ? t.primary
          : isDone ? t.mint
            : t.cardBorder;
        return (
          <div key={s.key} className="flex-1 flex items-center gap-2">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-extrabold"
                style={{
                  background: dotBg,
                  color: dotColor,
                  border: `1px solid ${dotBorder}`,
                  boxShadow: isCurrent
                    ? `0 6px 18px -6px ${dotBorder}`
                    : 'none',
                }}
              >
                {isDone ? <CheckCircle2 size={14} /> : i + 1}
              </div>
              <span
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: isCurrent ? t.primary : t.textTer }}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="flex-1 h-0.5 rounded-full mb-4"
                style={{
                  background: isDone || isCurrent
                    ? `linear-gradient(90deg, ${t.primary} 0%, ${t.mint} 100%)`
                    : (theme === 'light' ? 'rgba(15,7,3,0.08)' : 'rgba(255,255,255,0.08)'),
                  opacity: isDone || isCurrent ? 0.85 : 1,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── RailPill — tiny pill showing a payment rail option ──────────
function RailPill({
  icon, label, theme,
}: { icon: React.ReactNode; label: string; theme: 'light' | 'dark' }) {
  const isLight = theme === 'light';
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5"
      style={{
        background: isLight ? '#F1EDEA' : 'rgba(255,255,255,0.06)',
        color: isLight ? '#5A4F4A' : 'rgba(255,255,255,0.65)',
      }}
    >
      {icon}
      {label}
    </span>
  );
}

function hexAlpha(color: string, alpha: number): string {
  if (!color.startsWith('#') || color.length !== 7) return color;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── PaymentCardChip — mini "credit card" graphic, brand-orange.
// Inspired by the EMV chip on physical cards: golden contact pad
// over a soft gradient. Sits on the left of the "Pay with" row to
// give the section a tangible, fintech feel (vs. a flat icon chip).
function PaymentCardChip({ theme }: { theme: 'light' | 'dark' }) {
  const isLight = theme === 'light';
  return (
    <div
      className="relative shrink-0 w-14 h-10 rounded-lg overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #FF7A1E 0%, #FF6803 55%, #C84600 100%)',
        boxShadow: isLight
          ? '0 8px 18px -8px rgba(255,104,3,0.45), inset 0 1px 0 rgba(255,255,255,0.18)'
          : '0 6px 16px -8px rgba(255,104,3,0.55), inset 0 1px 0 rgba(255,255,255,0.10)',
      }}
      aria-hidden
    >
      {/* Top-left chip pad — gold rectangle with two inner contact lines */}
      <div
        className="absolute"
        style={{
          left: 7, top: 8, width: 16, height: 12, borderRadius: 3,
          background: 'linear-gradient(135deg, #F8D571 0%, #C79B2A 100%)',
          boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.18)',
        }}
      >
        <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2"
          style={{ background: 'rgba(0,0,0,0.22)' }} />
        <div className="absolute top-1/2 left-0 right-0 h-px -translate-y-1/2"
          style={{ background: 'rgba(0,0,0,0.22)' }} />
      </div>
      {/* Wireless/contactless arcs — tiny lower-right detail */}
      <svg
        className="absolute"
        style={{ right: 6, top: 6, width: 14, height: 14, opacity: 0.85 }}
        viewBox="0 0 16 16"
        fill="none"
      >
        <path d="M6 4 a5 5 0 0 1 0 8" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        <path d="M9 6 a3 3 0 0 1 0 4" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      </svg>
      {/* Tiny "PAY" wordmark bottom-right */}
      <span
        className="absolute right-1.5 bottom-1 text-[7px] font-extrabold tracking-[0.1em]"
        style={{ color: 'rgba(255,255,255,0.85)' }}
      >
        PAY
      </span>
    </div>
  );
}

// ── CardBrandVisa — flat wordmark on a soft pill so the brand reads
// in both light + dark. Not a logo file: we recreate the "VISA"
// wordmark in the brand blue so we don't have to ship asset files
// or worry about trademark color profiles.
function CardBrandVisa({ theme }: { theme: 'light' | 'dark' }) {
  const isLight = theme === 'light';
  return (
    <span
      className="inline-flex items-center justify-center px-2 h-6 rounded-md"
      style={{
        background: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${isLight ? 'rgba(15,7,3,0.08)' : 'rgba(255,255,255,0.10)'}`,
      }}
      aria-label="Visa accepted"
      title="Visa"
    >
      <span
        className="text-[11px] font-black italic tracking-tight"
        style={{ color: '#1A1F71', letterSpacing: '-0.02em' }}
      >
        VISA
      </span>
    </span>
  );
}

// ── CardBrandMastercard — two overlapping circles, red + yellow.
// Recreates the iconic Mastercard mark inline as SVG so it scales
// crisply and never 404s.
function CardBrandMastercard() {
  return (
    <span
      className="inline-flex items-center justify-center w-9 h-6 rounded-md"
      style={{ background: '#FFFFFF', border: '1px solid rgba(15,7,3,0.08)' }}
      aria-label="Mastercard accepted"
      title="Mastercard"
    >
      <svg width="22" height="14" viewBox="0 0 32 20" fill="none">
        <circle cx="12" cy="10" r="8" fill="#EB001B" />
        <circle cx="20" cy="10" r="8" fill="#F79E1B" />
        {/* The overlap is rendered with a third blended shape so the
            intersection feels official (Mastercard's brand uses a
            golden-orange blend in the middle). */}
        <path
          d="M16 4.2 a8 8 0 0 1 0 11.6 a8 8 0 0 1 0 -11.6 z"
          fill="#FF5F00"
        />
      </svg>
    </span>
  );
}

// ── CardBrandVerve — Nigerian card scheme. The actual logo is two
// half-rings; we approximate it as a green pill with the "verve"
// wordmark, because that combination is what users recognise on
// USSD/POS prompts.
function CardBrandVerve() {
  return (
    <span
      className="inline-flex items-center justify-center px-2 h-6 rounded-md"
      style={{
        background: 'linear-gradient(135deg, #00A859 0%, #006C39 100%)',
        boxShadow: '0 3px 10px -4px rgba(0, 108, 57, 0.45)',
      }}
      aria-label="Verve accepted"
      title="Verve"
    >
      <span className="text-[10px] font-extrabold uppercase tracking-wider text-white">
        verve
      </span>
    </span>
  );
}
