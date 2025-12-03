import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Award, Star, Zap, Target, Clock, Users, Heart } from 'lucide-react'
import { colors, gradients } from '@/config/colors'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'

interface Achievement {
  id: string
  icon: React.ReactNode
  title: string
  description: string
  earned: boolean
  earnedAt?: string
  color: string
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
}

interface PaymentStreak {
  current: number
  longest: number
  lastPaymentDate: string | null
}

export default function AchievementSystem() {
  const { user } = useAuth()
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [streak, setStreak] = useState<PaymentStreak>({ current: 0, longest: 0, lastPaymentDate: null })
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    if (user) {
      loadAchievements()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function loadAchievements() {
    try {
      setLoading(true)

      // Get user's payment history
      const { data: payments } = await supabase
        .from('payments')
        .select('id, amount, created_at, status, payment_type_id')
        .eq('student_id', user?.id)
        .eq('status', 'approved')
        .order('created_at', { ascending: true })

      // Get payments made for others
      const { data: helpedPayments } = await supabase
        .from('payments')
        .select('id, created_at')
        .eq('paid_by', user?.id)
        .neq('student_id', user?.id)
        .eq('status', 'approved')

      const paymentCount = payments?.length || 0
      const helpedCount = helpedPayments?.length || 0
      const totalAmount = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0

      // Calculate payment streak
      const streakData = calculateStreak(payments || [])
      setStreak(streakData)

      // Check for early payments (paid before deadline)
      const { data: paymentTypes } = await supabase
        .from('payment_types')
        .select('id, deadline')

      const earlyPayments = payments?.filter(p => {
        const pt = paymentTypes?.find(t => t.id === p.payment_type_id)
        if (!pt?.deadline) return false
        return new Date(p.created_at) < new Date(pt.deadline)
      }) || []

      // Define all achievements
      const allAchievements: Achievement[] = [
        {
          id: 'first_payment',
          icon: <Star className="w-6 h-6" />,
          title: 'First Step',
          description: 'Made your first payment',
          earned: paymentCount >= 1,
          earnedAt: payments?.[0]?.created_at,
          color: '#FFD700',
          rarity: 'common'
        },
        {
          id: 'early_bird',
          icon: <Clock className="w-6 h-6" />,
          title: 'Early Bird',
          description: 'Paid before the deadline',
          earned: earlyPayments.length >= 1,
          earnedAt: earlyPayments[0]?.created_at,
          color: '#4ADE80',
          rarity: 'rare'
        },
        {
          id: 'consistent_payer',
          icon: <Target className="w-6 h-6" />,
          title: 'Consistent Payer',
          description: 'Made 5+ payments',
          earned: paymentCount >= 5,
          color: '#3B82F6',
          rarity: 'rare'
        },
        {
          id: 'payment_streak_3',
          icon: <Zap className="w-6 h-6" />,
          title: 'On Fire!',
          description: '3-payment streak',
          earned: streakData.longest >= 3,
          color: '#F97316',
          rarity: 'epic'
        },
        {
          id: 'helpful_classmate',
          icon: <Heart className="w-6 h-6" />,
          title: 'Helpful Classmate',
          description: 'Paid for others',
          earned: helpedCount >= 1,
          color: '#EC4899',
          rarity: 'epic'
        },
        {
          id: 'big_spender',
          icon: <Trophy className="w-6 h-6" />,
          title: 'Big Contributor',
          description: 'Paid ₦50,000+',
          earned: totalAmount >= 50000,
          color: '#8B5CF6',
          rarity: 'epic'
        },
        {
          id: 'perfect_record',
          icon: <Award className="w-6 h-6" />,
          title: 'Perfect Record',
          description: 'All payments approved on first try',
          earned: paymentCount >= 3 && Boolean(payments?.every(p => p.status === 'approved')),
          color: '#EAB308',
          rarity: 'legendary'
        },
        {
          id: 'class_champion',
          icon: <Users className="w-6 h-6" />,
          title: 'Class Champion',
          description: 'Helped 5+ classmates',
          earned: helpedCount >= 5,
          color: '#06B6D4',
          rarity: 'legendary'
        }
      ]

      setAchievements(allAchievements)
    } catch (error) {
      console.error('Failed to load achievements:', error)
    } finally {
      setLoading(false)
    }
  }

  function calculateStreak(payments: Array<{ created_at: string; status: string }>): PaymentStreak {
    if (payments.length === 0) {
      return { current: 0, longest: 0, lastPaymentDate: null }
    }

    let currentStreak = 1
    let longestStreak = 1
    let tempStreak = 1

    for (let i = 1; i < payments.length; i++) {
      const prevDate = new Date(payments[i - 1].created_at)
      const currDate = new Date(payments[i].created_at)
      const daysDiff = Math.floor((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24))

      if (daysDiff <= 30) {
        tempStreak++
        longestStreak = Math.max(longestStreak, tempStreak)
      } else {
        tempStreak = 1
      }
    }

    currentStreak = tempStreak

    return {
      current: currentStreak,
      longest: longestStreak,
      lastPaymentDate: payments[payments.length - 1].created_at
    }
  }

  const earnedAchievements = achievements.filter(a => a.earned)
  const displayedAchievements = showAll ? achievements : achievements.slice(0, 4)

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'legendary': return '#EAB308'
      case 'epic': return '#8B5CF6'
      case 'rare': return '#3B82F6'
      default: return '#6B7280'
    }
  }

  if (loading) {
    return (
      <div className="p-6 rounded-xl border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: colors.borderLight }}>
        <div className="text-center py-4">
          <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-2" 
            style={{ borderColor: `${colors.primary}40`, borderTopColor: colors.primary }} 
          />
          <p className="text-xs" style={{ color: colors.textSecondary }}>Loading achievements...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <Trophy className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" style={{ color: colors.primary }} />
            <span className="truncate">Your Achievements</span>
          </h3>
          <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
            {earnedAchievements.length} of {achievements.length} unlocked
          </p>
        </div>
        {streak.current > 0 && (
          <div className="text-right shrink-0">
            <div className="flex items-center gap-1.5 justify-end">
              <Zap className="w-4 h-4 text-orange-500" />
              <span className="text-lg sm:text-xl font-bold text-white">{streak.current}</span>
            </div>
            <p className="text-xs whitespace-nowrap" style={{ color: colors.textSecondary }}>payment streak</p>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(earnedAchievements.length / achievements.length) * 100}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="h-full rounded-full"
            style={{ background: gradients.primary }}
          />
        </div>
      </div>

      {/* Achievement Grid */}
      <div className="grid grid-cols-2 gap-3">
        <AnimatePresence>
          {displayedAchievements.map((achievement, index) => (
            <motion.div
              key={achievement.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              className={`p-4 rounded-xl border relative overflow-hidden ${
                achievement.earned ? 'cursor-pointer hover:scale-105' : 'opacity-50'
              } transition-all`}
              style={{
                background: achievement.earned 
                  ? `linear-gradient(135deg, ${achievement.color}15 0%, ${achievement.color}05 100%)`
                  : 'rgba(255,255,255,0.02)',
                borderColor: achievement.earned ? `${achievement.color}40` : colors.borderLight
              }}
            >
              {/* Rarity Badge */}
              <div className="absolute top-2 right-2">
                <div className="px-2 py-0.5 rounded-full text-xs font-bold uppercase" style={{
                  background: `${getRarityColor(achievement.rarity)}20`,
                  color: getRarityColor(achievement.rarity),
                  fontSize: '0.6rem'
                }}>
                  {achievement.rarity}
                </div>
              </div>

              {/* Icon */}
              <div className="mb-3" style={{ color: achievement.earned ? achievement.color : colors.textSecondary }}>
                {achievement.icon}
              </div>

              {/* Content */}
              <h4 className="text-sm font-bold text-white mb-1">{achievement.title}</h4>
              <p className="text-xs leading-relaxed" style={{ color: colors.textSecondary }}>
                {achievement.description}
              </p>

              {/* Earned Date */}
              {achievement.earned && achievement.earnedAt && (
                <p className="text-xs mt-2 font-medium" style={{ color: achievement.color }}>
                  ✓ Earned {new Date(achievement.earnedAt).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </p>
              )}

              {/* Locked State */}
              {!achievement.earned && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm rounded-xl">
                  <div className="text-4xl">🔒</div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Show More/Less Button */}
      {achievements.length > 4 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full py-2 rounded-lg text-sm font-medium transition-all hover:bg-white/10"
          style={{ border: `1px solid ${colors.borderLight}`, color: colors.textPrimary }}
        >
          {showAll ? 'Show Less' : `Show All ${achievements.length} Achievements`}
        </button>
      )}
    </div>
  )
}
