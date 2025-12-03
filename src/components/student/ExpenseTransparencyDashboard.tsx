import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import GlassCard from '@/components/ui/GlassCard'
import { colors, gradients } from '@/config/colors'
import { Package, TrendingUp, TrendingDown, DollarSign, Eye, PieChart } from 'lucide-react'
import { supabase } from '@/config/supabase'
import { useExpenseVisibility } from '@/hooks/useExpenseVisibility'

interface ExpenseSummary {
  totalSpent: number
  totalCollected: number
  remainingBalance: number
  expensesByCategory: Array<{
    category: string
    icon: string
    color: string
    amount: number
    count: number
  }>
  recentExpenses: Array<{
    id: string
    title: string
    category: string
    amount: number
    expense_date: string
  }>
}

export default function ExpenseTransparencyDashboard() {
  const [summary, setSummary] = useState<ExpenseSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [showDetails, setShowDetails] = useState(false)
  const { visibility } = useExpenseVisibility()

  useEffect(() => {
    fetchExpenseSummary()
  }, [])

  async function fetchExpenseSummary() {
    try {
      setLoading(true)

      // Get total collected (approved payments, excluding waived)
      const { data: payments } = await supabase
        .from('payments')
        .select('amount')
        .eq('status', 'approved')
        .not('transaction_ref', 'like', 'WAIVED-%')

      const totalCollected = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0

      // Get approved expenses with categories
      const { data: expenses } = await supabase
        .from('expenses')
        .select(`
          id,
          title,
          amount,
          expense_date,
          category,
          category:expense_categories(name, icon, color)
        `)
        .eq('status', 'approved')
        .order('expense_date', { ascending: false })

      const totalSpent = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0
      const remainingBalance = totalCollected - totalSpent

      // Group by category
      const categoryMap = new Map()
      expenses?.forEach(exp => {
        const categoryData = (exp as { category?: { id: string; name: string; icon: string; color: string } }).category
        const categoryName = categoryData?.name || exp.category || 'Other'
        const categoryIcon = categoryData?.icon || '📦'
        const categoryColor = categoryData?.color || colors.primary

        if (!categoryMap.has(categoryName)) {
          categoryMap.set(categoryName, {
            category: categoryName,
            icon: categoryIcon,
            color: categoryColor,
            amount: 0,
            count: 0
          })
        }

        const cat = categoryMap.get(categoryName)
        cat.amount += Number(exp.amount)
        cat.count += 1
      })

      const expensesByCategory = Array.from(categoryMap.values())
        .sort((a, b) => b.amount - a.amount)

      const recentExpenses = expenses?.slice(0, 5).map(exp => ({
        id: exp.id,
        title: exp.title,
        category: ((exp as { category?: { name: string } }).category?.name || exp.category || 'Other'),
        amount: Number(exp.amount),
        expense_date: exp.expense_date
      })) || []

      setSummary({
        totalSpent,
        totalCollected,
        remainingBalance,
        expensesByCategory,
        recentExpenses
      })
    } catch (error) {
      console.error('Failed to fetch expense summary:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <GlassCard className="p-6">
        <div className="text-center py-8">
          <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4" 
            style={{ borderColor: `${colors.primary}40`, borderTopColor: colors.primary }} 
          />
          <p style={{ color: colors.textSecondary }}>Loading expense data...</p>
        </div>
      </GlassCard>
    )
  }

  if (!summary) return null

  const percentageSpent = summary.totalCollected > 0 
    ? (summary.totalSpent / summary.totalCollected) * 100 
    : 0

  return (
    <GlassCard className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4 sm:mb-6 gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-base sm:text-xl font-bold text-white flex items-center gap-2">
            <Eye className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" style={{ color: colors.accentMint }} />
            <span className="truncate">Class Funds Transparency</span>
          </h3>
          <p className="text-xs sm:text-sm mt-1" style={{ color: colors.textSecondary }}>
            See how your contributions are being used
          </p>
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-white/10 shrink-0"
          style={{ border: `1px solid ${colors.borderLight}`, color: colors.textPrimary }}
        >
          {showDetails ? 'Hide' : 'Show'} Details
        </button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Total Collected */}
        {visibility.showTotalCollected && (
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="p-4 rounded-xl border"
            style={{ background: 'rgba(34, 197, 94, 0.05)', borderColor: 'rgba(34, 197, 94, 0.2)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>Total Collected</span>
              <TrendingUp className="w-4 h-4 text-green-500" />
            </div>
            <p className="text-2xl font-bold text-white">
              ₦{summary.totalCollected.toLocaleString()}
            </p>
          </motion.div>
        )}

        {/* Total Spent */}
        {visibility.showTotalSpent && (
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="p-4 rounded-xl border"
            style={{ background: 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>Total Spent</span>
              <TrendingDown className="w-4 h-4 text-red-500" />
            </div>
            <p className="text-2xl font-bold text-white">
              ₦{summary.totalSpent.toLocaleString()}
            </p>
            <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
              {percentageSpent.toFixed(1)}% of collected
            </p>
          </motion.div>
        )}

        {/* Remaining Balance */}
        {visibility.showRemainingBalance && (
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="p-4 rounded-xl border"
            style={{ background: `${colors.primary}10`, borderColor: `${colors.primary}30` }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>Available Balance</span>
              <DollarSign className="w-4 h-4" style={{ color: colors.primary }} />
            </div>
            <p className="text-2xl font-bold" style={{ 
              background: gradients.primary,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
              ₦{summary.remainingBalance.toLocaleString()}
            </p>
          </motion.div>
        )}
      </div>

      {/* Progress Bar */}
      {visibility.showBudgetUsage && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-white">Budget Usage</span>
            <span className="text-sm font-medium" style={{ color: colors.textSecondary }}>
              {percentageSpent.toFixed(1)}%
            </span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(percentageSpent, 100)}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{
                background: percentageSpent > 90 
                  ? 'linear-gradient(90deg, #EF4444 0%, #DC2626 100%)'
                  : percentageSpent > 75
                  ? 'linear-gradient(90deg, #F59E0B 0%, #D97706 100%)'
                  : gradients.primary
              }}
            />
          </div>
        </div>
      )}

      {/* Details Section */}
      {showDetails && visibility.showExpenseDetails && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="space-y-6"
        >
          {/* Expenses by Category */}
          {visibility.showExpenseCategories && summary.expensesByCategory.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <PieChart className="w-4 h-4" style={{ color: colors.accentMint }} />
                Spending by Category
              </h4>
              <div className="space-y-2">
                {summary.expensesByCategory.map((cat, index) => {
                  const percentage = summary.totalSpent > 0 
                    ? (cat.amount / summary.totalSpent) * 100 
                    : 0

                  return (
                    <motion.div
                      key={cat.category}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="p-3 rounded-lg border"
                      style={{ background: 'rgba(255,255,255,0.02)', borderColor: colors.borderLight }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span style={{ color: cat.color }}>{cat.icon}</span>
                          <span className="text-sm font-medium text-white">{cat.category}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ 
                            background: 'rgba(255,255,255,0.1)', 
                            color: colors.textSecondary 
                          }}>
                            {cat.count} {cat.count === 1 ? 'expense' : 'expenses'}
                          </span>
                        </div>
                        <span className="text-sm font-bold text-white">
                          ₦{cat.amount.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 0.8, delay: index * 0.1 }}
                          className="h-full rounded-full"
                          style={{ background: cat.color }}
                        />
                      </div>
                      <p className="text-xs mt-1 text-right" style={{ color: colors.textSecondary }}>
                        {percentage.toFixed(1)}% of total
                      </p>
                    </motion.div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Recent Expenses */}
          {visibility.showRecentExpenses && summary.recentExpenses.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Package className="w-4 h-4" style={{ color: colors.accentMint }} />
                Recent Expenses
              </h4>
              <div className="space-y-2">
                {summary.recentExpenses.map((exp, index) => (
                  <motion.div
                    key={exp.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center justify-between p-3 rounded-lg"
                    style={{ background: 'rgba(255,255,255,0.02)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{exp.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ 
                          background: 'rgba(255,255,255,0.1)', 
                          color: colors.textSecondary 
                        }}>
                          {exp.category}
                        </span>
                        <span className="text-xs" style={{ color: colors.textSecondary }}>
                          {new Date(exp.expense_date).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric' 
                          })}
                        </span>
                      </div>
                    </div>
                    <span className="text-sm font-bold ml-4" style={{ color: colors.primary }}>
                      ₦{exp.amount.toLocaleString()}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </GlassCard>
  )
}
