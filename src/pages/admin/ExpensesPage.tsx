import { motion } from 'framer-motion'
import RecordExpense from '@/components/admin/RecordExpense'
import ExpenseList from '@/components/admin/ExpenseList'
import ExpenseApprovalQueue from '@/components/admin/ExpenseApprovalQueue'
import Footer from '@/components/Footer'
import { ArrowLeft, TrendingDown, LayoutGrid, Wallet, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/hooks/useAppAuth'
import { useAppNav } from '@/hooks/useAppNav'

// ── Design tokens ──────────────────────────────────────────────────────────
const tk = {
  primary:    '#FF6803',
  mint:       '#30FFAC',
  danger:     '#EF4444',
  warning:    '#FBBF24',
  bg:         '#0F0703',
  cardBg:     'rgba(255,255,255,0.03)',
  cardBorder: 'rgba(255,255,255,0.07)',
  textSec:    'rgba(255,255,255,0.5)',
  textTer:    'rgba(255,255,255,0.28)',
}

// ── Stagger helpers ────────────────────────────────────────────────────────
const EASE = [0.22, 1, 0.36, 1] as const

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 22 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: EASE },
})

export default function ExpensesPage() {
  const { hasPermission } = useAuth()
  const { go: navigate } = useAppNav()

  return (
    <div
      className="min-h-screen relative overflow-x-hidden"
      style={{ background: tk.bg, minHeight: '100dvh' }}
    >
      {/* ── Ambient glows ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Primary warm glow — top right */}
        <motion.div
          className="absolute rounded-full blur-[180px]"
          style={{
            width: 700, height: 700,
            background: `radial-gradient(circle, ${tk.danger} 0%, transparent 65%)`,
            top: '-20%', right: '-14%', opacity: 0.11,
          }}
          animate={{ scale: [1, 1.07, 1], opacity: [0.11, 0.16, 0.11] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Mint glow — bottom left */}
        <motion.div
          className="absolute rounded-full blur-[140px]"
          style={{
            width: 500, height: 500,
            background: `radial-gradient(circle, ${tk.mint} 0%, transparent 70%)`,
            bottom: '-8%', left: '-10%', opacity: 0.07,
          }}
          animate={{ scale: [1, 1.12, 1] }}
          transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
        />
        {/* Diagonal grain grid */}
        <div
          className="absolute inset-0 opacity-[0.022]"
          style={{
            backgroundImage: `
              repeating-linear-gradient(
                -45deg,
                transparent, transparent 50px,
                rgba(255,104,3,0.7) 50px, rgba(255,104,3,0.7) 51px
              )
            `,
          }}
        />
      </div>

      {/* ── Page content ── */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">

        {/* ── HERO HEADER ───────────────────────────────────────────────── */}
        <motion.div {...fadeUp(0)}>
          <div
            className="relative rounded-[32px] overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(239,68,68,0.11) 0%, rgba(255,255,255,0.02) 100%)',
              border: `1px solid ${tk.cardBorder}`,
            }}
          >
            {/* Accent line */}
            <div
              className="absolute top-0 left-0 right-0 h-[2px]"
              style={{ background: `linear-gradient(90deg, ${tk.danger}, ${tk.primary} 50%, transparent)` }}
            />

            {/* Decorative watermark icon */}
            <div
              className="absolute -right-8 -top-8 w-64 h-64 opacity-[0.04] pointer-events-none"
              style={{ color: tk.danger }}
            >
              <TrendingDown className="w-full h-full" />
            </div>

            {/* Radial glow overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse 55% 60% at 95% 5%, rgba(239,68,68,0.12), transparent)' }}
            />

            <div className="relative p-6 sm:p-8 lg:p-10">
              {/* Back button */}
              <motion.button
                whileHover={{ x: -3 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/admin/dashboard')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium mb-6 transition-colors"
                style={{
                  background: `${tk.primary}12`,
                  border: `1px solid ${tk.primary}28`,
                  color: tk.primary,
                }}
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Dashboard
              </motion.button>

              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                {/* Identity */}
                <div className="flex items-start gap-5">
                  {/* Icon block */}
                  <div className="relative shrink-0">
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center"
                      style={{
                        background: `linear-gradient(135deg, ${tk.danger}28, ${tk.danger}0a)`,
                        border: `1px solid ${tk.danger}35`,
                        boxShadow: `0 8px 28px ${tk.danger}20`,
                      }}
                    >
                      <TrendingDown className="w-8 h-8" style={{ color: tk.danger }} />
                    </div>
                    {/* Pulsing ring */}
                    <motion.div
                      className="absolute inset-0 rounded-2xl"
                      style={{ border: `1px solid ${tk.danger}40` }}
                      animate={{ scale: [1, 1.18, 1], opacity: [0.6, 0, 0.6] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut' }}
                    />
                  </div>

                  <div>
                    {/* Pill tag */}
                    <div
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-2"
                      style={{
                        background: `${tk.danger}14`,
                        border: `1px solid ${tk.danger}30`,
                        color: tk.danger,
                      }}
                    >
                      <Wallet className="w-3 h-3" />
                      Expense Tracking
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-none">
                      Expenses
                    </h1>
                    <p className="mt-1.5 text-sm leading-6" style={{ color: tk.textSec }}>
                      Record, review, and manage your organization's expenditure
                    </p>
                  </div>
                </div>

                {/* Right meta pills */}
                <div className="flex flex-wrap items-center gap-2 lg:pb-1">
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                    style={{ background: `${tk.mint}10`, color: tk.mint, border: `1px solid ${tk.mint}22` }}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" /> Auditable records
                  </span>
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                    style={{ background: 'rgba(255,255,255,0.04)', color: tk.textSec, border: `1px solid ${tk.cardBorder}` }}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" /> Category tracking
                  </span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── BODY GRID ─────────────────────────────────────────────────── */}
        <motion.div
          {...fadeUp(0.08)}
          className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5 items-start"
        >
          {/* Record form — fixed width left column */}
          <div className="lg:sticky lg:top-6">
            <RecordExpense />
          </div>

          {/* Expense list — grows right */}
          <div>
            <ExpenseList />
          </div>
        </motion.div>

        {/* ── APPROVAL QUEUE ────────────────────────────────────────────── */}
        {hasPermission('can_manage_students') && (
          <motion.div {...fadeUp(0.16)}>
            <ExpenseApprovalQueue />
          </motion.div>
        )}
      </div>

      <Footer />
    </div>
  )
}