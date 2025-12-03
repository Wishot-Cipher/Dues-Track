import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Users, TrendingUp, Target, Sparkles } from 'lucide-react'
import { colors, gradients } from '@/config/colors'
import { supabase } from '@/config/supabase'

interface ClassProgress {
  totalStudents: number
  studentsWhoPaid: number
  percentagePaid: number
  totalCollected: number
  totalExpected: number
  recentPayers: Array<{
    name: string
    amount: number
    time: string
  }>
}

export default function ClassProgressVisualization() {
  const [progress, setProgress] = useState<ClassProgress | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadClassProgress()
    // Refresh every 5 minutes
    const interval = setInterval(loadClassProgress, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  async function loadClassProgress() {
    try {
      setLoading(true)

      // Get total students count
      const { count: totalStudents } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })

      // Get all active payment types
      const { data: paymentTypes } = await supabase
        .from('payment_types')
        .select('id, amount')
        .eq('is_active', true)

      const totalExpected = (paymentTypes?.reduce((sum, pt) => sum + Number(pt.amount), 0) || 0) * (totalStudents || 0)

      // Get ALL approved payments to count unique students and total collected
      const { data: allPayments } = await supabase
        .from('payments')
        .select('amount, student_id')
        .eq('status', 'approved')
        .not('transaction_ref', 'like', 'WAIVED-%')

      const totalCollected = allPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0

      // Count unique students who have paid from ALL payments
      const uniqueStudents = new Set(allPayments?.map(p => p.student_id) || [])
      const studentsWhoPaid = uniqueStudents.size

      const percentagePaid = totalStudents ? (studentsWhoPaid / (totalStudents || 1)) * 100 : 0

      // Get recent 5 payers with student names
      const { data: recentPayments } = await supabase
        .from('payments')
        .select(`
          amount,
          student_id,
          created_at,
          students!inner(full_name)
        `)
        .eq('status', 'approved')
        .not('transaction_ref', 'like', 'WAIVED-%')
        .order('created_at', { ascending: false })
        .limit(5)

      // Recent payers (last 5)
      const recentPayers = recentPayments?.map(p => {
        const paymentWithStudent = p as unknown as { students?: { full_name: string }; amount: number; created_at: string }
        return {
          name: paymentWithStudent.students?.full_name || 'Anonymous',
          amount: Number(paymentWithStudent.amount),
          time: new Date(paymentWithStudent.created_at).toLocaleTimeString('en-US', { 
            hour: 'numeric',
            minute: '2-digit',
            hour12: true 
          })
        }
      }) || []

      setProgress({
        totalStudents: totalStudents || 0,
        studentsWhoPaid,
        percentagePaid,
        totalCollected,
        totalExpected,
        recentPayers
      })
    } catch (error) {
      console.error('Failed to load class progress:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 rounded-xl border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: colors.borderLight }}>
        <div className="text-center py-4">
          <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-2" 
            style={{ borderColor: `${colors.primary}40`, borderTopColor: colors.primary }} 
          />
          <p className="text-xs" style={{ color: colors.textSecondary }}>Loading class progress...</p>
        </div>
      </div>
    )
  }

  if (!progress) return null

  return (
    <div className="p-4 sm:p-6 rounded-xl border" style={{ 
      background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
      borderColor: colors.borderLight 
    }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4 sm:mb-6 gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <Users className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" style={{ color: colors.accentMint }} />
            <span className="truncate">Class Payment Progress</span>
          </h3>
          <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
            See how your class is doing
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-xl sm:text-2xl font-bold" style={{ 
            background: gradients.primary,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            {progress.percentagePaid.toFixed(0)}%
          </div>
          <p className="text-xs whitespace-nowrap" style={{ color: colors.textSecondary }}>completed</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-2">
          <span className="text-xs sm:text-sm text-white font-medium">
            {progress.studentsWhoPaid} of {progress.totalStudents} students paid
          </span>
          <span className="text-xs" style={{ color: colors.textSecondary }}>
            {progress.totalStudents - progress.studentsWhoPaid} remaining
          </span>
        </div>
        <div className="h-4 rounded-full overflow-hidden relative" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress.percentagePaid}%` }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
            className="h-full rounded-full relative overflow-hidden"
            style={{ background: gradients.primary }}
          >
            {/* Shimmer effect */}
            <motion.div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
              }}
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            />
          </motion.div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4 sm:mb-6">
        <div className="p-2 sm:p-3 rounded-lg" style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
          <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
            <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500 flex-shrink-0" />
            <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>Collected</span>
          </div>
          <p className="text-sm sm:text-lg font-bold text-white break-all">
            ₦{progress.totalCollected.toLocaleString()}
          </p>
        </div>

        <div className="p-2 sm:p-3 rounded-lg" style={{ background: `${colors.primary}10`, border: `1px solid ${colors.primary}30` }}>
          <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
            <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" style={{ color: colors.primary }} />
            <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>Target</span>
          </div>
          <p className="text-sm sm:text-lg font-bold text-white break-all">
            ₦{progress.totalExpected.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Motivation Message */}
      {progress.percentagePaid >= 75 ? (
        <div className="p-2.5 sm:p-3 rounded-lg mb-3 sm:mb-4" style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
          <p className="text-xs sm:text-sm font-medium text-green-400 flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Amazing! Your class is doing great! 🎉
          </p>
        </div>
      ) : progress.percentagePaid >= 50 ? (
        <div className="p-2.5 sm:p-3 rounded-lg mb-3 sm:mb-4" style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
          <p className="text-xs sm:text-sm font-medium text-blue-400 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Good progress! Keep it up! 💪
          </p>
        </div>
      ) : progress.percentagePaid >= 25 ? (
        <div className="p-2.5 sm:p-3 rounded-lg mb-3 sm:mb-4" style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.2)' }}>
          <p className="text-xs sm:text-sm font-medium text-yellow-400 flex items-center gap-2">
            <Target className="w-4 h-4" />
            Let's reach our goal together! 🎯
          </p>
        </div>
      ) : (
        <div className="p-2.5 sm:p-3 rounded-lg mb-3 sm:mb-4" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <p className="text-xs sm:text-sm font-medium text-red-400 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Be a leader! Pay now and motivate others! 🚀
          </p>
        </div>
      )}

      {/* Recent Payers */}
      {progress.recentPayers.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-white mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" style={{ color: colors.accentMint }} />
            Recent Payments
          </h4>
          <div className="space-y-1.5">
            {progress.recentPayers.map((payer, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center justify-between p-2 rounded-lg gap-2"
                style={{ background: 'rgba(255,255,255,0.03)' }}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ 
                    background: gradients.primary,
                    color: 'white'
                  }}>
                    {payer.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs text-white truncate">{payer.name}</span>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-bold text-white whitespace-nowrap">₦{payer.amount.toLocaleString()}</p>
                  <p className="text-xs whitespace-nowrap" style={{ color: colors.textSecondary }}>{payer.time}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
