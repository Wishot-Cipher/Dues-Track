import { motion } from 'framer-motion'
import GlassCard from '@/components/ui/GlassCard'
import { colors } from '@/config/colors'
import RecordExpense from '@/components/admin/RecordExpense'
import ExpenseList from '@/components/admin/ExpenseList'
import ExpenseApprovalQueue from '@/components/admin/ExpenseApprovalQueue'
import Footer from '@/components/Footer'
import { ArrowLeft, Receipt, Sparkles, TrendingDown, Wallet } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useNavigate } from 'react-router-dom'

export default function ExpensesPage() {
  const { hasPermission } = useAuth()
  const navigate = useNavigate()

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
        {/* Enhanced Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <GlassCard className="relative overflow-hidden">
            {/* Decorative Elements */}
            <div className="absolute top-0 right-0 w-48 h-48 opacity-5 pointer-events-none">
              <Receipt className="w-full h-full" style={{ color: colors.statusFailed }} />
            </div>
            <div 
              className="absolute top-0 left-0 w-full h-1"
              style={{ background: `linear-gradient(90deg, ${colors.statusFailed}, ${colors.primary}, transparent)` }}
            />

            <div className="relative z-10">
              <motion.button
                whileHover={{ x: -4 }}
                onClick={() => navigate('/admin/dashboard')}
                className="flex items-center gap-2 mb-4 px-4 py-2 rounded-xl transition-all"
                style={{ 
                  background: `${colors.primary}15`,
                  border: `1px solid ${colors.primary}30`,
                  color: colors.primary 
                }}
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="font-medium">Back to Dashboard</span>
              </motion.button>

              <div className="flex flex-col sm:flex-row items-center gap-4">
                <motion.div
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  className="w-16 h-16 rounded-2xl flex items-center justify-center relative shrink-0"
                  style={{ 
                    background: `linear-gradient(135deg, ${colors.statusFailed}30, ${colors.statusFailed}10)`,
                    border: `1px solid ${colors.statusFailed}40`,
                    boxShadow: `0 4px 20px ${colors.statusFailed}30`
                  }}
                >
                  <TrendingDown className="w-8 h-8" style={{ color: colors.statusFailed }} />
                  <Sparkles className="w-4 h-4 absolute -top-1 -right-1" style={{ color: colors.primary }} />
                </motion.div>
                <div className="text-center sm:text-left">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-2"
                    style={{ 
                      background: `linear-gradient(135deg, ${colors.statusFailed}30, ${colors.statusFailed}10)`,
                      border: `1px solid ${colors.statusFailed}40`,
                      color: colors.statusFailed,
                    }}
                  >
                    <Wallet className="w-3 h-3" />
                    EXPENSE TRACKING
                  </motion.div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-white">Class Expenses</h1>
                  <p className="text-sm" style={{ color: colors.textSecondary }}>
                    Record, track, and review class expenses
                  </p>
                </div>
              </div>

              {/* Quick Info Cards */}
              <div className="grid grid-cols-2 gap-3 mt-6">
                <div className="p-3 rounded-xl text-center" 
                     style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <Receipt className="w-5 h-5 mx-auto mb-1" style={{ color: colors.primary }} />
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Record expenses below</p>
                </div>
                <div className="p-3 rounded-xl text-center" 
                     style={{ background: `${colors.statusPaid}08`, border: `1px solid ${colors.statusPaid}15` }}>
                  <TrendingDown className="w-5 h-5 mx-auto mb-1" style={{ color: colors.statusPaid }} />
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Track all spending</p>
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
