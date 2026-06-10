/**
 * AppGuide — a role-aware "where things are" guide.
 *
 * A "?" button (next to the bell) opens a slide-up sheet that explains,
 * in plain language, what each part of the app does and links straight
 * to it. Members see member features; people with an exec/admin role
 * ALSO see an "Admin tools" section — the surfaces a normal member
 * never sees. This is the "show me around" experience the user asked
 * for: discoverable, professional, never a wall of text.
 *
 * Self-contained: drop <AppGuide /> anywhere. Theme-aware.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HelpCircle, X, Wallet, Ticket, Bell, Users, UserCircle, ClipboardCheck,
  Receipt, PieChart, BadgePercent, Banknote, Plus, ArrowRight, Sparkles, ShieldCheck,
} from 'lucide-react';
import { useAppNav } from '@/hooks/useAppNav';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
import { useUserRoles } from '@/hooks/useUserRoles';

interface GuideItem {
  icon: React.ElementType;
  title: string;
  desc: string;
  to: string;
}

const MEMBER_ITEMS: GuideItem[] = [
  { icon: Wallet,     title: 'My Dues',       desc: 'See every due you owe or have paid. Filter by tier, sort, and tap a paid one for its receipt.', to: '/payments' },
  { icon: Ticket,     title: 'My Tickets',    desc: 'Your event tickets live here — open one to show its QR at the door.', to: '/tickets' },
  { icon: Bell,       title: 'Notifications', desc: 'Every alert — payments, waivers, role updates. Tap any to read the full message.', to: '/notifications' },
  { icon: Users,      title: 'My Groups',     desc: 'The class / department / faculty you belong to, and invite links to grow them.', to: '/groups' },
  { icon: UserCircle, title: 'Profile',       desc: 'Update your details and keep your profile complete.', to: '/profile' },
];

const ADMIN_ITEMS: GuideItem[] = [
  { icon: ClipboardCheck, title: 'Review payments', desc: 'Approve or reject the payments members submit for your tier.', to: '/admin/review' },
  { icon: Receipt,        title: 'Manage dues',     desc: "Create, edit, end and archive your tier's own dues.", to: '/admin/manage-dues' },
  { icon: PieChart,       title: 'Finance & audit', desc: "Collected, expenses and net balance — scoped to your tier's dues.", to: '/admin/collected' },
  { icon: Users,          title: 'Members',         desc: 'Invite people and manage the members in your group.', to: '/admin/members' },
  { icon: BadgePercent,   title: 'Waive a due',     desc: 'Clear a due for someone (zero-money settlement) and notify them.', to: '/admin/waive-payment' },
  { icon: Plus,           title: 'Create a due',    desc: 'Publish a new due or event for your tier to collect.', to: '/admin/create-payment' },
  { icon: Banknote,       title: 'Payout',          desc: 'Connect the bank account where collected money lands.', to: '/admin/payout' },
];

export default function AppGuide() {
  const { go } = useAppNav();
  const { theme } = useTheme();
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';
  const { hasExec } = useUserRoles();
  const [open, setOpen] = useState(false);

  const openItem = (to: string) => { setOpen(false); go(to); };

  const Section = ({ label, items, badge }: { label: string; items: GuideItem[]; badge?: boolean }) => (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] flex items-center gap-1.5 px-1" style={{ color: t.textTer }}>
        {badge && <ShieldCheck className="w-3 h-3" style={{ color: t.primary }} />}
        {label}
      </p>
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <button
            key={it.title}
            type="button"
            onClick={() => openItem(it.to)}
            className="group w-full text-left rounded-xl p-3 flex items-start gap-3 transition-colors"
            style={{ background: t.bgWash, border: `1px solid ${t.cardBorder}` }}
          >
            <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${t.primary}14`, color: t.primary }}>
              <Icon className="w-4.5 h-4.5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: t.text }}>{it.title}</p>
              <p className="text-[12px] leading-snug mt-0.5" style={{ color: t.textSec }}>{it.desc}</p>
            </div>
            <ArrowRight className="w-4 h-4 mt-1 shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: t.textTer }} />
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="p-2.5 rounded-xl transition-all"
        style={{ background: isLight ? 'rgba(15, 7, 3, 0.04)' : 'rgba(255, 255, 255, 0.05)', border: `1px solid ${t.cardBorder}` }}
        aria-label="Guide — show me around"
        title="Show me around"
      >
        <HelpCircle className="w-5 h-5" style={{ color: t.text }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-0 sm:p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0"
              style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            />
            <motion.div
              className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
              style={{ background: t.card, border: `1px solid ${t.cardBorder}`, maxHeight: '85vh', boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }}
              initial={{ y: '100%', opacity: 0.6 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            >
              <div className="flex items-start justify-between px-5 pt-5 pb-3 shrink-0">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] inline-flex items-center gap-1" style={{ color: t.primary }}>
                    <Sparkles className="w-3 h-3" /> Show me around
                  </p>
                  <h2 className="text-lg font-extrabold mt-0.5" style={{ color: t.text }}>What you can do here</h2>
                </div>
                <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: isLight ? 'rgba(15,7,3,0.05)' : 'rgba(255,255,255,0.06)' }} aria-label="Close">
                  <X className="w-4 h-4" style={{ color: t.textSec }} />
                </button>
              </div>

              <div className="px-5 pb-6 space-y-5 overflow-y-auto">
                <Section label="For you" items={MEMBER_ITEMS} />
                {hasExec && <Section label="Admin tools" items={ADMIN_ITEMS} badge />}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
