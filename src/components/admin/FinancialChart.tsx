/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Financial Chart Component
 * A single comprehensive chart showing category breakdown with collected vs spent
 * 
 * @author Dev_Wishot (@wishotstudio)
 */
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from 'recharts'
import GlassCard from '@/components/ui/GlassCard'
import { colors } from '@/config/colors'
import { BarChart3 } from 'lucide-react'

interface CategoryData {
  category: string
  total_collected: number
  total_expenses: number
  net_balance: number
  payment_count: number
}

interface FinancialChartProps {
  categoriesBreakdown: CategoryData[]
  totalCollected: number
  totalExpenses: number
  netBalance: number
}

// Custom tooltip
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null

  return (
    <div 
      className="p-3 rounded-lg shadow-xl"
      style={{ 
        background: 'rgba(20, 15, 10, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)'
      }}
    >
      <p className="text-white font-semibold mb-2 capitalize text-sm">{label?.replace(/_/g, ' ')}</p>
      {payload.map((entry: any, index: number) => (
        <p key={index} className="text-xs" style={{ color: entry.color }}>
          {entry.name}: ₦{Number(entry.value).toLocaleString()}
        </p>
      ))}
    </div>
  )
}

export default function FinancialChart({ 
  categoriesBreakdown, 
  totalCollected, 
  totalExpenses, 
  netBalance,
}: FinancialChartProps) {
  
  // Prepare bar chart data for category comparison (top 8)
  const chartData = useMemo(() => {
    return categoriesBreakdown
      .filter(cat => cat.total_collected > 0 || cat.total_expenses > 0)
      .slice(0, 8)
      .map(cat => ({
        category: cat.category.replace(/_/g, ' ').substring(0, 10),
        fullName: cat.category.replace(/_/g, ' '),
        Collected: cat.total_collected,
        Spent: cat.total_expenses,
        Available: cat.net_balance
      }))
  }, [categoriesBreakdown])

  if (chartData.length === 0) {
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <GlassCard className="relative overflow-hidden">
        <div 
          className="absolute top-0 left-0 w-full h-1"
          style={{ background: `linear-gradient(90deg, ${colors.statusPaid}, ${colors.primary}, transparent)` }}
        />
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                 style={{ background: `${colors.statusPaid}15`, border: `1px solid ${colors.statusPaid}30` }}>
              <BarChart3 className="w-5 h-5" style={{ color: colors.statusPaid }} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Financial Overview</h3>
              <p className="text-xs" style={{ color: colors.textSecondary }}>Collection vs Expenses by Category</p>
            </div>
          </div>
          
          {/* Summary badges */}
          <div className="flex flex-wrap gap-2">
            <div className="px-3 py-1.5 rounded-lg text-xs font-medium" 
                 style={{ background: `${colors.statusPaid}15`, color: colors.statusPaid }}>
              Collected: ₦{totalCollected.toLocaleString()}
            </div>
            <div className="px-3 py-1.5 rounded-lg text-xs font-medium" 
                 style={{ background: `${colors.statusFailed}15`, color: colors.statusFailed }}>
              Spent: ₦{totalExpenses.toLocaleString()}
            </div>
            <div className="px-3 py-1.5 rounded-lg text-xs font-medium" 
                 style={{ 
                   background: netBalance >= 0 ? `${colors.statusPaid}15` : `${colors.statusFailed}15`, 
                   color: netBalance >= 0 ? colors.statusPaid : colors.statusFailed 
                 }}>
              Available: ₦{netBalance.toLocaleString()}
            </div>
          </div>
        </div>
        
        {/* Chart */}
        <div className="h-[280px] sm:h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="15%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis 
                dataKey="category" 
                stroke={colors.textSecondary}
                fontSize={10}
                angle={-35}
                textAnchor="end"
                height={60}
                interval={0}
              />
              <YAxis 
                stroke={colors.textSecondary}
                fontSize={10}
                tickFormatter={(value) => value >= 1000 ? `₦${(value / 1000).toFixed(0)}k` : `₦${value}`}
                width={55}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ paddingTop: '10px' }}
                formatter={(value) => <span className="text-xs" style={{ color: colors.textSecondary }}>{value}</span>}
              />
              <Bar dataKey="Collected" fill={colors.statusPaid} radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Bar dataKey="Spent" fill={colors.statusFailed} radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>
    </motion.div>
  )
}
