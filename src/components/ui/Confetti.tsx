import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { colors } from '@/config/colors'

interface Particle {
  id: number
  x: number
  y: number
  color: string
  rotation: number
  scale: number
  velocity: { x: number; y: number }
}

interface ConfettiProps {
  isActive: boolean
  duration?: number
  particleCount?: number
  onComplete?: () => void
}

const COLORS = [
  colors.primary,      // Orange
  colors.accentMint,   // Mint
  colors.accentGreen,  // Green
  colors.accentCyan,   // Cyan
  '#FFD700',           // Gold
  '#FF6B9D',           // Pink
]

export default function Confetti({ 
  isActive, 
  duration = 3000,
  particleCount = 50,
  onComplete 
}: ConfettiProps) {
  const [particles, setParticles] = useState<Particle[]>([])

  const createParticles = useCallback(() => {
    const newParticles: Particle[] = []
    for (let i = 0; i < particleCount; i++) {
      newParticles.push({
        id: i,
        x: 50 + (Math.random() - 0.5) * 20, // Center with spread
        y: 50,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotation: Math.random() * 360,
        scale: 0.5 + Math.random() * 0.5,
        velocity: {
          x: (Math.random() - 0.5) * 30,
          y: -20 - Math.random() * 30,
        },
      })
    }
    return newParticles
  }, [particleCount])

  useEffect(() => {
    if (isActive) {
      setParticles(createParticles())
      
      const timer = setTimeout(() => {
        setParticles([])
        onComplete?.()
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [isActive, createParticles, duration, onComplete])

  if (!isActive && particles.length === 0) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-[1000] overflow-hidden">
      <AnimatePresence>
        {particles.map((particle) => (
          <motion.div
            key={particle.id}
            initial={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              rotate: particle.rotation,
              scale: 0,
              opacity: 1,
            }}
            animate={{
              left: `${particle.x + particle.velocity.x}%`,
              top: `${particle.y + particle.velocity.y + 120}%`,
              rotate: particle.rotation + 720,
              scale: particle.scale,
              opacity: [1, 1, 0],
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: duration / 1000,
              ease: [0.25, 0.46, 0.45, 0.94],
            }}
            className="absolute"
            style={{
              width: 12,
              height: 12,
            }}
          >
            {/* Different shapes for variety */}
            {particle.id % 3 === 0 ? (
              // Circle
              <div 
                className="w-full h-full rounded-full"
                style={{ backgroundColor: particle.color }}
              />
            ) : particle.id % 3 === 1 ? (
              // Square
              <div 
                className="w-full h-full rounded-sm"
                style={{ backgroundColor: particle.color }}
              />
            ) : (
              // Star/Diamond
              <div 
                className="w-full h-full rotate-45"
                style={{ backgroundColor: particle.color }}
              />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

// Success celebration with confetti + message
interface SuccessCelebrationProps {
  isVisible: boolean
  title?: string
  subtitle?: string
  onClose?: () => void
  autoCloseDuration?: number
}

export function SuccessCelebration({
  isVisible,
  title = 'Payment Successful! 🎉',
  subtitle = 'Your payment has been recorded successfully.',
  onClose,
  autoCloseDuration = 4000,
}: SuccessCelebrationProps) {
  const [showConfetti, setShowConfetti] = useState(false)

  useEffect(() => {
    if (isVisible) {
      setShowConfetti(true)
      const timer = setTimeout(() => {
        onClose?.()
      }, autoCloseDuration)
      return () => clearTimeout(timer)
    }
  }, [isVisible, autoCloseDuration, onClose])

  return (
    <>
      <Confetti 
        isActive={showConfetti} 
        onComplete={() => setShowConfetti(false)} 
      />
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', duration: 0.5 }}
              className="text-center p-8 rounded-3xl mx-4 max-w-md"
              style={{
                background: 'rgba(26, 14, 9, 0.95)',
                border: '1px solid rgba(255, 104, 3, 0.3)',
                boxShadow: '0 20px 60px rgba(255, 104, 3, 0.3)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Success Icon */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(48, 255, 172, 0.2), rgba(22, 244, 86, 0.2))',
                  border: '2px solid rgba(48, 255, 172, 0.5)',
                }}
              >
                <motion.svg
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ delay: 0.4, duration: 0.5 }}
                  className="w-10 h-10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={colors.accentMint}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <motion.path d="M5 12l5 5L20 7" />
                </motion.svg>
              </motion.div>

              <motion.h2
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-2xl font-bold text-white mb-2"
              >
                {title}
              </motion.h2>
              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                style={{ color: colors.textSecondary }}
              >
                {subtitle}
              </motion.p>

              <motion.button
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                onClick={onClose}
                className="mt-6 px-8 py-3 rounded-xl font-semibold transition-transform hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)',
                  color: 'white',
                }}
              >
                Continue
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
