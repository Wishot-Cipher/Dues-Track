/**
 * GroupBillingPage — per-CLASS subscription for tier execs.
 *
 * Subscription is billed per group (class / dept / faculty), NOT per
 * org. A tier exec sees THEIR tier's plan, what Pro unlocks, the price,
 * and how to upgrade.
 *
 * At launch the platform is manual-only (free), so the free plan already
 * does the core job (record dues, collect by bank transfer / receipt,
 * approve). Pro adds instant online checkout (Paystack: card / USSD /
 * transfer) on top. Self-serve payment isn't wired yet — upgrades are
 * granted by the platform team — so the CTA points there honestly.
 *
 * Route: /:orgSlug/admin/billing
 */

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, CreditCard, Check, Crown, Loader2, Shield, Wallet,
  Zap, BadgeCheck, Sparkles, X, Mail,
} from 'lucide-react';
import { useAppNav } from '@/hooks/useAppNav';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useActiveRole } from '@/hooks/useActiveRole';
import { billingService, type GroupBilling } from '@/services/billingService';

// Pro price for a class, per semester. One flat fee per tier — see the
// blueprint / monetization plan. Display-only here.
const PRO_PRICE_NAIRA = 4000;

const PRO_BENEFITS: { icon: React.ReactNode; title: string; desc: string }[] = [
  { icon: <Zap size={15} />, title: 'Instant online checkout', desc: 'Members pay by card, USSD or bank transfer via Paystack — confirmed in seconds, no receipt upload.' },
  { icon: <BadgeCheck size={15} />, title: 'Auto-confirmed payments', desc: 'No manual approval queue for online payments — they settle and mark paid automatically.' },
  { icon: <Wallet size={15} />, title: 'You still net the full dues', desc: 'The transparent service fee covers the gateway cost; your class receives exactly what you set.' },
  { icon: <Sparkles size={15} />, title: 'More on the way', desc: 'SMS / WhatsApp reminders, advanced analytics and custom branding are rolling out to Pro tiers.' },
];

export default function GroupBillingPage() {
  const { go } = useAppNav();
  const { theme } = useTheme();
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';

  const { user: mtUser, organization } = useMultiTenantAuth();
  const { activeRole } = useActiveRole({ orgId: organization?.id, memberId: mtUser?.id });

  const groupId = activeRole?.kind === 'exec' ? (activeRole.groupId ?? null) : null;
  const isOrgScope = activeRole?.kind === 'exec' && activeRole.scopeLevel === 'org';

  const [billing, setBilling] = useState<GroupBilling | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const load = useCallback(async () => {
    if (!groupId) { setLoading(false); return; }
    setLoading(true);
    const b = await billingService.getGroupBilling(groupId);
    setBilling(b);
    setLoading(false);
  }, [groupId]);

  useEffect(() => { void load(); }, [load]);

  const isPro = billing ? (billing.plan === 'pro' || billing.plan === 'enterprise') && billing.onlinePayments : false;
  const tierWord = billing?.kind === 'class' || billing?.kind === 'group' ? 'class'
    : billing?.kind === 'faculty' ? 'faculty'
    : billing?.kind ? 'tier' : 'class';

  const surface = { background: t.card, border: `1px solid ${t.cardBorder}` };

  return (
    <div className="min-h-screen py-6 px-4" style={{ background: t.bgWash, color: t.text, minHeight: '100dvh' }}>
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header */}
        <header className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => go('/admin/dashboard')}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)', color: t.text, border: `1px solid ${t.cardBorder}` }}
            aria-label="Back"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-2">
            <CreditCard size={18} style={{ color: t.primary }} />
            <h1 className="text-[17px] font-extrabold tracking-tight" style={{ color: t.text }}>Subscription</h1>
          </div>
        </header>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" style={{ color: t.primary }} /></div>
        ) : isOrgScope ? (
          // Org owner has no single tier — billing is per class.
          <div className="rounded-2xl p-5" style={surface}>
            <p className="text-sm font-bold" style={{ color: t.text }}>Billing is per class</p>
            <p className="text-[13px] mt-1 leading-relaxed" style={{ color: t.textSec }}>
              Each class, department or faculty has its own plan. Switch to a tier role (e.g. a class you lead)
              to manage its subscription, or upgrade tiers from the platform console.
            </p>
          </div>
        ) : !billing ? (
          <div className="rounded-2xl p-5" style={surface}>
            <p className="text-sm font-bold" style={{ color: t.text }}>No tier selected</p>
            <p className="text-[13px] mt-1 leading-relaxed" style={{ color: t.textSec }}>
              We couldn't resolve which class this is for. Open the dashboard for the class you lead, then come back.
            </p>
          </div>
        ) : (
          <>
            {/* Current plan card */}
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl overflow-hidden"
              style={{
                background: isPro
                  ? `linear-gradient(135deg, ${t.primary}1A, ${t.primary}08)`
                  : t.card,
                border: `1px solid ${isPro ? `${t.primary}55` : t.cardBorder}`,
              }}
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-white"
                      style={{ background: isPro ? t.gradOrange : (isLight ? '#9AA0A6' : '#4B5563') }}
                    >
                      {isPro ? <Crown size={22} /> : <Zap size={22} />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-extrabold" style={{ color: t.text }}>
                          {isPro ? 'Pro' : 'Free'} plan
                        </h2>
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                          style={{
                            background: isPro ? 'rgba(48,255,172,0.16)' : (isLight ? 'rgba(15,7,3,0.06)' : 'rgba(255,255,255,0.08)'),
                            color: isPro ? (isLight ? '#0E9F62' : t.mint) : t.textSec,
                          }}
                        >
                          {isPro ? 'Active' : 'Current'}
                        </span>
                      </div>
                      <p className="text-[12px] mt-0.5 truncate" style={{ color: t.textSec }}>
                        {billing.name} · this {tierWord}'s plan
                      </p>
                    </div>
                  </div>
                </div>

                {/* What's included now */}
                <div className="mt-4 grid grid-cols-1 gap-2">
                  {[
                    'Unlimited dues, members & records',
                    'Bank transfer / receipt-upload collection',
                    'Exec approval + receipts + audit trail',
                    ...(isPro ? ['Instant online checkout (card / USSD / transfer)', 'Auto-confirmed online payments'] : []),
                  ].map((line) => (
                    <div key={line} className="flex items-center gap-2">
                      <Check size={14} style={{ color: t.mint }} className="shrink-0" />
                      <span className="text-[13px]" style={{ color: t.textSec }}>{line}</span>
                    </div>
                  ))}
                </div>

                {isPro && billing.expiresAt && (
                  <p className="text-[11px] mt-4" style={{ color: t.textTer }}>
                    Renews / expires {new Date(billing.expiresAt).toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </p>
                )}
              </div>
            </motion.div>

            {/* Upgrade card — only when on free */}
            {!isPro && (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                className="rounded-2xl p-5"
                style={{ background: `linear-gradient(135deg, ${t.primary}12, transparent 70%)`, border: `1px solid ${t.primary}40` }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Crown size={18} style={{ color: t.primary }} />
                  <h3 className="text-base font-extrabold" style={{ color: t.text }}>Upgrade to Pro</h3>
                </div>
                <p className="text-[13px] leading-relaxed" style={{ color: t.textSec }}>
                  Let members of {billing.name} pay instantly online. You keep the free manual flow too —
                  Pro just adds the fast lane.
                </p>

                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-2xl font-extrabold" style={{ color: t.text }}>₦{PRO_PRICE_NAIRA.toLocaleString()}</span>
                  <span className="text-[12px]" style={{ color: t.textSec }}>/ semester · per {tierWord}</span>
                </div>

                <div className="mt-4 space-y-3">
                  {PRO_BENEFITS.map((b) => (
                    <div key={b.title} className="flex items-start gap-2.5">
                      <span
                        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: t.primarySoft, color: t.primary, border: `1px solid ${t.primaryRing}` }}
                      >
                        {b.icon}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold" style={{ color: t.text }}>{b.title}</p>
                        <p className="text-[11.5px] leading-snug" style={{ color: t.textSec }}>{b.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setShowUpgrade(true)}
                  className="mt-5 w-full py-3 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1.5 text-white"
                  style={{ background: t.gradOrange, boxShadow: `0 10px 26px -10px ${t.primary}` }}
                >
                  <Crown size={16} /> Upgrade {billing.name} to Pro
                </button>
              </motion.div>
            )}

            {/* Manual-first reassurance */}
            <div
              className="rounded-2xl p-4 flex items-start gap-2.5"
              style={{ background: isLight ? 'rgba(48,255,172,0.06)' : 'rgba(48,255,172,0.08)', border: `1px solid ${isLight ? '#CCF2DE' : 'rgba(48,255,172,0.20)'}` }}
            >
              <Shield size={16} style={{ color: t.mint }} className="shrink-0 mt-0.5" />
              <p className="text-[12px] leading-relaxed" style={{ color: t.textSec }}>
                The free plan is fully functional — your {tierWord} can collect, track and confirm every payment by
                bank transfer today. Pro is optional and only adds instant online checkout.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Upgrade info modal — self-serve payment isn't wired yet, so this
          routes the exec to the team honestly rather than faking a flow. */}
      <AnimatePresence>
        {showUpgrade && billing && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4"
            style={{ background: isLight ? 'rgba(15,7,3,0.30)' : 'rgba(3,7,18,0.68)', backdropFilter: 'blur(8px)' }}
            onClick={() => setShowUpgrade(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl p-5"
              style={{ background: isLight ? '#FFFFFF' : '#100A07', border: `1px solid ${t.cardBorder}`, boxShadow: '0 24px 60px rgba(0,0,0,0.45)' }}
            >
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: t.primarySoft, color: t.primary, border: `1px solid ${t.primaryRing}` }}>
                  <Crown size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-extrabold" style={{ color: t.text }}>Go Pro — {billing.name}</h3>
                  <p className="text-[12.5px] mt-1 leading-relaxed" style={{ color: t.textSec }}>
                    We're rolling out self-serve upgrades. To switch {billing.name} to Pro
                    (₦{PRO_PRICE_NAIRA.toLocaleString()} / semester) right now, reach the team and we'll
                    enable instant online checkout for your {tierWord}.
                  </p>
                </div>
                <button type="button" onClick={() => setShowUpgrade(false)} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: isLight ? 'rgba(15,7,3,0.05)' : 'rgba(255,255,255,0.05)', color: t.textSec, border: `1px solid ${t.cardBorder}` }} aria-label="Close">
                  <X size={16} />
                </button>
              </div>
              <a
                href={`mailto:support@payvexo.com?subject=${encodeURIComponent(`Upgrade ${billing.name} to Pro`)}&body=${encodeURIComponent(`Please enable Pro (online payments) for: ${billing.name} (group id ${billing.groupId}).`)}`}
                className="mt-4 w-full py-3 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1.5 text-white"
                style={{ background: t.gradOrange }}
              >
                <Mail size={15} /> Contact us to upgrade
              </a>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
