/**
 * AppGuide — a role-aware, STEP-BY-STEP "show me around" tour.
 *
 * A "?" button opens a modal that walks the user through the app one
 * card at a time: a focused step → Next → the next, with a progress
 * bar, Back/Skip, an "N / total" counter, concrete "what you can do"
 * points on each step, and a "Take me there" jump.
 *
 * Members get the member steps; anyone with an exec/admin role also
 * gets the admin-tool steps. Fully responsive (bottom-sheet on mobile,
 * centred dialog on desktop, scrolling body) + theme-aware.
 */

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HelpCircle, X, Wallet, Ticket, Bell, Users, UserCircle, ClipboardCheck,
  Receipt, PieChart, BadgePercent, Banknote, Plus, ArrowRight, ArrowLeft,
  Sparkles, ShieldCheck, Check,
} from 'lucide-react';
import { useAppNav } from '@/hooks/useAppNav';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
import { useUserRoles } from '@/hooks/useUserRoles';

interface Step {
  icon: React.ElementType;
  chip: string;
  admin?: boolean;
  title: string;
  desc: string;
  points: string[];
  to?: string;
  cta?: string;
}

const MEMBER_STEPS: Step[] = [
  {
    icon: Wallet, chip: 'Dues', title: 'My Dues',
    desc: 'Everything you owe or have paid, in one place.',
    points: [
      'Filter by tier (class / department / faculty) and sort by amount or date',
      'Tap a paid due to open its receipt',
      'Outstanding dues show what’s left and when it’s due',
    ],
    to: '/payments', cta: 'Open My Dues',
  },
  {
    icon: Ticket, chip: 'Events', title: 'My Tickets',
    desc: 'Your event tickets and entry passes.',
    points: [
      'Each ticket has a QR — show it at the door for check-in',
      'Buy more than one (e.g. for a friend) and each is its own ticket',
    ],
    to: '/tickets', cta: 'Open My Tickets',
  },
  {
    icon: Bell, chip: 'Updates', title: 'Notifications',
    desc: 'Never miss a payment, waiver or role update.',
    points: [
      'The bell badge counts unread — it also shows on your home-screen icon',
      'Tap any notification to read the full message',
      'They’re a permanent record — read, never deleted',
    ],
    to: '/notifications', cta: 'Open Notifications',
  },
  {
    icon: Users, chip: 'Belong', title: 'My Groups',
    desc: 'The group(s) you’re part of, and how to grow them.',
    points: [
      'See your class / department / faculty at a glance',
      'Share an invite link to bring classmates in',
    ],
    to: '/groups', cta: 'Open My Groups',
  },
  {
    icon: UserCircle, chip: 'You', title: 'Your Profile',
    desc: 'Keep your details current.',
    points: [
      'The completeness bar nudges you to fill what’s missing',
      'Update your name, email, phone and section any time',
    ],
    to: '/profile', cta: 'Open Profile',
  },
];

const ADMIN_STEPS: Step[] = [
  {
    icon: ClipboardCheck, chip: 'Approve', admin: true, title: 'Review payments',
    desc: 'Your daily queue of payments to verify.',
    points: [
      'Approve or reject what members submit for your tier',
      'See the receipt they uploaded before you decide',
    ],
    to: '/admin/review', cta: 'Open Review',
  },
  {
    icon: Receipt, chip: 'Dues', admin: true, title: 'Manage dues',
    desc: 'Your tier’s own dues — created and controlled by you.',
    points: [
      'Create, edit, end and archive dues',
      'You manage only YOUR tier’s dues, never the tiers below',
    ],
    to: '/admin/manage-dues', cta: 'Manage dues',
  },
  {
    icon: PieChart, chip: 'Money', admin: true, title: 'Finance & audit',
    desc: 'Where your tier’s money came from and went.',
    points: [
      'Collected, expenses and net balance — scoped to your tier',
      'Per-due breakdown: who paid, who was waived',
      'Waivers are shown but never counted as money',
    ],
    to: '/admin/collected', cta: 'Open Finance',
  },
  {
    icon: Users, chip: 'People', admin: true, title: 'Members',
    desc: 'Invite and manage the people in your group.',
    points: [
      'Generate invite links (class, or scoped for higher tiers)',
      'View and manage your members',
    ],
    to: '/admin/members', cta: 'Open Members',
  },
  {
    icon: BadgePercent, chip: 'Waive', admin: true, title: 'Waive a due',
    desc: 'Clear a due for someone at zero cost.',
    points: [
      'Search a member and waive their due',
      'They’re notified, and it’s recorded as ₦0 (not money collected)',
    ],
    to: '/admin/waive-payment', cta: 'Open Waive',
  },
  {
    icon: Plus, chip: 'Create', admin: true, title: 'Create a due / event',
    desc: 'Publish something for your tier to pay.',
    points: [
      'A recurring due, a one-off levy, or a ticketed event',
      'Set the amount, deadline and who it applies to',
    ],
    to: '/admin/create-payment', cta: 'Create a due',
  },
  {
    icon: Banknote, chip: 'Payout', admin: true, title: 'Payout',
    desc: 'Where collected money lands.',
    points: [
      'Connect your tier’s bank account (password-confirmed)',
      'Only finance roles (president / treasurer / fin-sec) can change it',
    ],
    to: '/admin/payout', cta: 'Open Payout',
  },
];

export default function AppGuide() {
  const { go } = useAppNav();
  const { theme } = useTheme();
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';
  const { hasExec } = useUserRoles();

  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);

  const steps = useMemo<Step[]>(
    () => (hasExec ? [...MEMBER_STEPS, ...ADMIN_STEPS] : MEMBER_STEPS),
    [hasExec],
  );
  const total = steps.length;
  const step = steps[Math.min(i, total - 1)];
  const isLast = i >= total - 1;
  const Icon = step.icon;

  const start = () => { setI(0); setDir(1); setOpen(true); };
  const close = () => setOpen(false);
  const next = () => { if (isLast) { close(); return; } setDir(1); setI((n) => n + 1); };
  const back = () => { if (i === 0) return; setDir(-1); setI((n) => n - 1); };
  const goThere = () => { if (step.to) { close(); go(step.to); } };

  return (
    <>
      <button
        type="button"
        onClick={start}
        className="p-2.5 rounded-xl transition-all"
        style={{ background: isLight ? 'rgba(15, 7, 3, 0.04)' : 'rgba(255, 255, 255, 0.05)', border: `1px solid ${t.cardBorder}` }}
        aria-label="Guide — show me around"
        title="Show me around"
      >
        <HelpCircle className="w-5 h-5" style={{ color: t.text }} />
      </button>

      {createPortal(
        <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0"
              style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)' }}
              onClick={close}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            />
            <motion.div
              className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
              style={{
                background: t.card,
                border: `1px solid ${t.cardBorder}`,
                boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
                maxHeight: '85vh',
                maxWidth: 'min(28rem, 100%)',
              }}
              initial={{ y: '100%', opacity: 0.6 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            >
              {/* Top bar: progress + skip (fixed) */}
              <div className="px-5 pt-4 pb-3 shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] inline-flex items-center gap-1" style={{ color: t.primary }}>
                    <Sparkles className="w-3 h-3" /> Show me around
                  </span>
                  <button onClick={close} className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg" style={{ color: t.textTer }}>
                    Skip <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex gap-1">
                  {steps.map((_, idx) => (
                    <div key={idx} className="h-1 flex-1 rounded-full overflow-hidden" style={{ background: t.cardBorder }}>
                      <div className="h-full rounded-full transition-all duration-300"
                        style={{ width: idx <= i ? '100%' : '0%', background: t.primary }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Step body (scrolls) */}
              <div className="px-5 pb-2 overflow-y-auto flex-1">
                <AnimatePresence mode="wait" custom={dir}>
                  <motion.div
                    key={i}
                    custom={dir}
                    initial={{ opacity: 0, x: dir * 26 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: dir * -26 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex items-center gap-2.5 mb-3">
                      <span className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                        style={{ background: `${t.primary}14`, color: t.primary }}>
                        <Icon className="w-6 h-6" />
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full"
                        style={{
                          background: step.admin ? `${t.primary}18` : t.bgWash,
                          color: step.admin ? t.primary : t.textTer,
                          border: `1px solid ${step.admin ? t.primaryRing : t.cardBorder}`,
                        }}>
                        {step.admin && <ShieldCheck className="w-3 h-3" />}
                        {step.chip}
                      </span>
                    </div>

                    <h2 className="text-xl font-extrabold leading-tight" style={{ color: t.text }}>{step.title}</h2>
                    <p className="text-[14px] leading-relaxed mt-1" style={{ color: t.textSec }}>{step.desc}</p>

                    <ul className="mt-3 space-y-2">
                      {step.points.map((p, idx) => (
                        <li key={idx} className="flex items-start gap-2.5">
                          <span className="w-4.5 h-4.5 mt-0.5 rounded-full flex items-center justify-center shrink-0"
                            style={{ background: `${t.mint}1A`, color: t.mint }}>
                            <Check className="w-3 h-3" />
                          </span>
                          <span className="text-[13px] leading-snug" style={{ color: t.text }}>{p}</span>
                        </li>
                      ))}
                    </ul>

                    {step.to && (
                      <button
                        type="button"
                        onClick={goThere}
                        className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-bold px-3.5 py-2 rounded-xl"
                        style={{ background: t.primarySoft, color: t.primary, border: `1px solid ${t.primaryRing}` }}
                      >
                        {step.cta || 'Take me there'} <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Footer nav (fixed) */}
              <div className="px-5 py-4 flex items-center justify-between gap-3 shrink-0" style={{ borderTop: `1px solid ${t.cardBorder}` }}>
                <button
                  type="button"
                  onClick={back}
                  disabled={i === 0}
                  className="inline-flex items-center gap-1 text-sm font-bold px-3 py-2.5 rounded-xl disabled:opacity-0 transition-opacity"
                  style={{ color: t.textSec }}
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <span className="text-[11px] font-semibold tabular-nums" style={{ color: t.textTer }}>{i + 1} / {total}</span>
                <button
                  type="button"
                  onClick={next}
                  className="inline-flex items-center gap-1.5 text-sm font-bold px-5 py-2.5 rounded-xl text-white"
                  style={{ background: t.gradOrange, boxShadow: `0 8px 22px -8px ${t.primary}` }}
                >
                  {isLast ? <>Got it <Check className="w-4 h-4" /></> : <>Next <ArrowRight className="w-4 h-4" /></>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
