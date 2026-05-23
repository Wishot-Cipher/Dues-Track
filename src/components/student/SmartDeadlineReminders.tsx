import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Bell, Clock, AlertCircle, Calendar as CalendarIcon, X } from 'lucide-react'
import { colors } from '@/config/colors'
import { supabase } from '@/config/supabase'
import { useAppAuth as useAuth } from '@/hooks/useAppAuth'
import { getOrgScope } from '@/utils/orgScope'

interface DeadlineReminder {
  id: string
  paymentType: string
  amount: number
  deadline: string
  daysLeft: number
  status: 'paid' | 'partial' | 'unpaid'
  amountPaid: number
  urgency: 'low' | 'medium' | 'high' | 'critical'
  late_fee_per_day?: number
}

export default function SmartDeadlineReminders() {
  const { user } = useAuth()
  const [reminders, setReminders] = useState<DeadlineReminder[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  // Respect globally-dismissed optional dues (localStorage)
  const [globalDismissed, setGlobalDismissed] = useState<string[]>(() => {
    try {
      const key = `dismissedDues_${user?.id}`;
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : [];
    } catch {
      return [];
    }
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      loadReminders()
      // Refresh every hour
      const interval = setInterval(loadReminders, 60 * 60 * 1000)
      return () => clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function loadReminders() {
    try {
      setLoading(true)

      const scope = getOrgScope()

      // Get active payment types with deadlines
      let qTypes = supabase
        .from('payment_types')
        .select('id, title, amount, deadline, allow_partial, late_fee_per_day')
        .eq('is_active', true)
        .not('deadline', 'is', null)
      if (scope) {
        qTypes = qTypes.eq('organization_id', scope.orgId)
        qTypes = qTypes.eq('group_id', scope.groupId)
      }
      const { data: paymentTypes } = await qTypes

      if (!paymentTypes) return

      // Get user's payments
      let qPayments = supabase
        .from('payments')
        .select('payment_type_id, amount, status')
        .eq('member_id', user?.id)
      if (scope) {
        qPayments = qPayments.eq('organization_id', scope.orgId)
        qPayments = qPayments.eq('group_id', scope.groupId)
      }
      const { data: payments } = await qPayments

      const now = new Date()
      const remindersList: DeadlineReminder[] = []

      paymentTypes.forEach(pt => {
        const deadline = new Date(pt.deadline)
        const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

        // Only show if deadline is in the future or within 7 days past
        if (daysLeft >= -7) {
          const userPayments = payments?.filter(p => 
            p.payment_type_id === pt.id && p.status === 'approved'
          ) || []
          
          const amountPaid = userPayments.reduce((sum, p) => sum + Number(p.amount), 0)
          
          let status: 'paid' | 'partial' | 'unpaid' = 'unpaid'
          if (amountPaid >= Number(pt.amount)) {
            status = 'paid'
          } else if (amountPaid > 0 && pt.allow_partial) {
            status = 'partial'
          }

          // Determine urgency
          let urgency: 'low' | 'medium' | 'high' | 'critical' = 'low'
          if (daysLeft < 0) {
            urgency = 'critical'
          } else if (daysLeft <= 1 && status !== 'paid') {
            urgency = 'critical'
          } else if (daysLeft <= 3 && status !== 'paid') {
            urgency = 'high'
          } else if (daysLeft <= 7) {
            urgency = 'medium'
          }

          // Respect global dismissed (user skipped optional dues)
          const isGloballyDismissed = globalDismissed.includes(pt.id);

          // Only add if not fully paid and not globally dismissed. Previously we allowed
          // showing reminders for recently-due paid items; user requested removing reminders
          // when payment is paid — so skip when status === 'paid'. Also skip when globally dismissed.
          if (status !== 'paid' && !isGloballyDismissed) {
            // Only add near-deadline ones as before (daysLeft >= -7)
            if (daysLeft >= -7) {
              remindersList.push({
              id: pt.id,
              paymentType: pt.title,
              amount: Number(pt.amount),
              deadline: pt.deadline,
              daysLeft,
              status,
              amountPaid,
              urgency,
              late_fee_per_day: pt.late_fee_per_day ? Number(pt.late_fee_per_day) : undefined
            })
            }
          }
        }
      })

      // Sort by urgency and days left
      remindersList.sort((a, b) => {
        const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 }
        if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
          return urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
        }
        return a.daysLeft - b.daysLeft
      })

      setReminders(remindersList)
    } catch (error) {
      console.error('Failed to load reminders:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDismiss = (id: string) => {
    setDismissed(prev => new Set([...prev, id]))
    try {
      const key = `dismissedDues_${user?.id}`;
      const existing = localStorage.getItem(key);
      const arr = existing ? JSON.parse(existing) : [];
      if (!arr.includes(id)) {
        arr.push(id);
        localStorage.setItem(key, JSON.stringify(arr));
        setGlobalDismissed(arr);
      }
    } catch {
      // best-effort
    }
  }

  const activeReminders = reminders.filter(r => !dismissed.has(r.id) && !globalDismissed.includes(r.id))

  if (loading || activeReminders.length === 0) return null

  return (
    <div className="space-y-2 sm:space-y-3">
      {activeReminders.map((reminder, index) => {
        const getUrgencyConfig = () => {
          switch (reminder.urgency) {
            case 'critical':
              return {
                bg: 'rgba(239, 68, 68, 0.1)',
                border: 'rgba(239, 68, 68, 0.3)',
                color: '#EF4444',
                icon: <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5" />,
                pulse: true
              }
            case 'high':
              return {
                bg: 'rgba(251, 191, 36, 0.1)',
                border: 'rgba(251, 191, 36, 0.3)',
                color: '#FBBF24',
                icon: <Clock className="w-4 h-4 sm:w-5 sm:h-5" />,
                pulse: true
              }
            case 'medium':
              return {
                bg: 'rgba(59, 130, 246, 0.1)',
                border: 'rgba(59, 130, 246, 0.3)',
                color: '#3B82F6',
                icon: <Bell className="w-4 h-4 sm:w-5 sm:h-5" />,
                pulse: false
              }
            default:
              return {
                bg: 'rgba(156, 163, 175, 0.1)',
                border: 'rgba(156, 163, 175, 0.3)',
                color: '#9CA3AF',
                icon: <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5" />,
                pulse: false
              }
          }
        }

        const config = getUrgencyConfig()
        const remainingAmount = reminder.amount - reminder.amountPaid

        return (
          <motion.div
            key={reminder.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ delay: index * 0.1 }}
            className={`relative p-3 sm:p-4 rounded-xl border ${config.pulse ? 'animate-pulse' : ''}`}
            style={{
              background: config.bg,
              borderColor: config.border
            }}
          >
            {/* Dismiss Button */}
            <button
              onClick={() => handleDismiss(reminder.id)}
              className="absolute top-2 right-2 p-1 rounded-lg hover:bg-black/20 transition-colors"
              style={{ color: config.color }}
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-3 pr-8">
              {/* Icon */}
              <div style={{ color: config.color }}>
                {config.icon}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-white mb-1">{reminder.paymentType}</h4>
                
                {/* Deadline Info */}
                <div className="flex items-center gap-2 mb-2">
                  {reminder.daysLeft < 0 ? (
                    <span className="text-sm font-bold" style={{ color: config.color }}>
                      ⚠️ {Math.abs(reminder.daysLeft)} days overdue
                    </span>
                  ) : reminder.daysLeft === 0 ? (
                    <span className="text-sm font-bold" style={{ color: config.color }}>
                      ⏰ Due TODAY
                    </span>
                  ) : reminder.daysLeft === 1 ? (
                    <span className="text-sm font-bold" style={{ color: config.color }}>
                      ⏰ Due TOMORROW
                    </span>
                  ) : (
                    <span className="text-sm" style={{ color: colors.textSecondary }}>
                      {reminder.daysLeft} days left
                    </span>
                  )}
                  <span className="text-xs" style={{ color: colors.textSecondary }}>
                    {new Date(reminder.deadline).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </span>
                </div>

                {/* Amount Info */}
                {reminder.status === 'paid' ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-green-500 font-medium">✓ Fully Paid</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span style={{ color: colors.textSecondary }}>
                        {reminder.status === 'partial' ? 'Remaining:' : 'Amount:'}
                      </span>
                      <span className="font-bold text-white">
                        ₦{remainingAmount.toLocaleString()}
                      </span>
                    </div>
                    {reminder.status === 'partial' && (
                      <div className="text-xs" style={{ color: colors.textSecondary }}>
                        Paid: ₦{reminder.amountPaid.toLocaleString()} of ₦{reminder.amount.toLocaleString()}
                      </div>
                    )}
                    {reminder.late_fee_per_day && (
                      <div className="text-xs mt-1 font-medium" style={{ color: colors.textSecondary }}>
                        Late fee: ₦{Number(reminder.late_fee_per_day).toLocaleString()} / day after deadline
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
