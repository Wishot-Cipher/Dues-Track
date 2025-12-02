import { motion } from 'framer-motion'
import GlassCard from '@/components/ui/GlassCard'
import { colors } from '@/config/colors'
import RecordExpense from '@/components/admin/RecordExpense'
import ExpenseList from '@/components/admin/ExpenseList'
import ExpenseApprovalQueue from '@/components/admin/ExpenseApprovalQueue'
import Footer from '@/components/Footer'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

export default function ExpensesPage() {
  const { hasPermission } = useAuth()

  return (
    <div className="min-h-screen py-6 px-4 relative overflow-hidden" style={{ background: 'radial-gradient(ellipse at top, #1A0E09 0%, #0F0703 100%)' }}>
      {/* Background Grid Pattern + Logo (same style as admin dashboard) */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute w-[500px] h-[500px] rounded-full blur-[120px] opacity-30 animate-pulse"
          style={{
            background: `radial-gradient(circle, ${colors.primary} 0%, transparent 70%)`,
            top: '-10%',
            right: '-5%',
            animationDuration: '4s',
          }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full blur-[100px] opacity-20"
          style={{
            background: `radial-gradient(circle, ${colors.accentMint} 0%, transparent 70%)`,
            bottom: '-5%',
            left: '-5%',
            animation: 'pulse 6s ease-in-out infinite',
          }}
        />

        <div className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-[0.08] pointer-events-none">
          <img 
            src="/Ece picture.jpg" 
            alt="ECE Background"
            className="w-full h-full object-contain"
            style={{
              filter: 'grayscale(0.5) brightness(0.8)',
              mixBlendMode: 'soft-light',
            }}
          />
        </div>
      </div>
      <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
        backgroundImage: `linear-gradient(${colors.primary}40 1px, transparent 1px), linear-gradient(90deg, ${colors.primary}40 1px, transparent 1px)`,
        backgroundSize: '50px 50px',
      }} />

      <div className="max-w-7xl mx-auto space-y-6 relative z-10">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <GlassCard>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => window.history.back()}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all"
                  style={{ background: 'rgba(255,255,255,0.03)' }}
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="text-sm" style={{ color: colors.textPrimary }}>Back</span>
                </button>

                <div>
                  <h1 className="text-2xl font-bold text-white">Expenses</h1>
                  <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>Record and review class expenses</p>
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1">
              <RecordExpense />
            </div>
            <div className="lg:col-span-2">
              <ExpenseList />
            </div>
          </div>
        </motion.div>

        {/* Approval Queue for Senior Admins */}
        {hasPermission('can_manage_students') && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <ExpenseApprovalQueue />
          </motion.div>
        )}
      </div>
      <Footer />
    </div>
  )
}
