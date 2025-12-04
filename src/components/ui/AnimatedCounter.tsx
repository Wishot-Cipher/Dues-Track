import { useEffect, useRef, useState } from 'react'
import { motion, useSpring, useTransform } from 'framer-motion'

interface AnimatedCounterProps {
  value: number
  duration?: number
  formatFn?: (value: number) => string
  className?: string
  prefix?: string
  suffix?: string
}

export default function AnimatedCounter({
  value,
  duration = 1.5,
  formatFn,
  className = '',
  prefix = '',
  suffix = ''
}: AnimatedCounterProps) {
  const [isVisible, setIsVisible] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  
  // Use spring animation for smooth counting
  const spring = useSpring(0, { 
    duration: duration * 1000,
    bounce: 0,
  })
  
  const display = useTransform(spring, (latest) => {
    const rounded = Math.round(latest)
    if (formatFn) {
      return formatFn(rounded)
    }
    return rounded.toLocaleString()
  })

  // Intersection observer for triggering animation when visible
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isVisible) {
          setIsVisible(true)
          spring.set(value)
        }
      },
      { threshold: 0.3 }
    )

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => observer.disconnect()
  }, [value, isVisible, spring])

  // Update value if it changes after initial animation
  useEffect(() => {
    if (isVisible) {
      spring.set(value)
    }
  }, [value, isVisible, spring])

  return (
    <span ref={ref} className={className}>
      {prefix}
      <motion.span>{display}</motion.span>
      {suffix}
    </span>
  )
}

// Currency-specific variant
interface CurrencyCounterProps {
  value: number
  currency?: string
  duration?: number
  className?: string
}

export function CurrencyCounter({
  value,
  currency = '₦',
  duration = 1.5,
  className = ''
}: CurrencyCounterProps) {
  return (
    <AnimatedCounter
      value={value}
      duration={duration}
      className={className}
      prefix={currency}
      formatFn={(val) => val.toLocaleString()}
    />
  )
}

// Percentage counter
interface PercentageCounterProps {
  value: number
  duration?: number
  className?: string
}

export function PercentageCounter({
  value,
  duration = 1.5,
  className = ''
}: PercentageCounterProps) {
  return (
    <AnimatedCounter
      value={value}
      duration={duration}
      className={className}
      suffix="%"
    />
  )
}
