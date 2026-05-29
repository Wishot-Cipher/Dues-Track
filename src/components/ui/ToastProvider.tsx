import React, { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { ToastContext, type ToastApi } from '@/contexts/ToastContext'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'warning' | 'info'

type ToastItem = {
  id: string
  type: ToastType
  message: React.ReactNode
  duration: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens — matches Payvexo's dark command aesthetic
// ─────────────────────────────────────────────────────────────────────────────

const TOKENS = {
  success: {
    accent:      '#10B981',
    accentLight: 'rgba(16, 185, 129, 0.12)',
    accentBorder:'rgba(16, 185, 129, 0.22)',
    glow:        'rgba(16, 185, 129, 0.18)',
    label:       'DONE',
    // Minimal geometric check mark
    Symbol: () => (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M2.5 7.5L6 11L12.5 4" stroke="#10B981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  error: {
    accent:      '#EF4444',
    accentLight: 'rgba(239, 68, 68, 0.12)',
    accentBorder:'rgba(239, 68, 68, 0.22)',
    glow:        'rgba(239, 68, 68, 0.18)',
    label:       'ERR',
    Symbol: () => (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M3 3L12 12M12 3L3 12" stroke="#EF4444" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  warning: {
    accent:      '#F59E0B',
    accentLight: 'rgba(245, 158, 11, 0.12)',
    accentBorder:'rgba(245, 158, 11, 0.22)',
    glow:        'rgba(245, 158, 11, 0.18)',
    label:       'WARN',
    Symbol: () => (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M7.5 3V8.5M7.5 11.5V12" stroke="#F59E0B" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  info: {
    accent:      '#FF6B35',
    accentLight: 'rgba(255, 107, 53, 0.10)',
    accentBorder:'rgba(255, 107, 53, 0.20)',
    glow:        'rgba(255, 107, 53, 0.16)',
    label:       'INFO',
    Symbol: () => (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M7.5 4V4.5M7.5 7V11" stroke="#FF6B35" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export const ToastProvider: React.FC<{
  children?: React.ReactNode
  position?: 'bottom-right' | 'top-right' | 'top-left' | 'bottom-left'
}> = ({ children, position = 'bottom-right' }) => {
  const [toasts, setToasts]   = useState<ToastItem[]>([])
  const toastsRef             = useRef<ToastItem[]>([])
  const timers                = useRef<Record<string, number | null>>({})

  const remove = useCallback((id: string) => {
    setToasts(t => {
      const next = t.filter(x => x.id !== id)
      toastsRef.current = next
      return next
    })
    const handle = timers.current[id]
    if (handle) window.clearTimeout(handle)
    delete timers.current[id]
  }, [])

  const add = useCallback((
    message: React.ReactNode,
    type: ToastType = 'info',
    duration = 4000,
  ) => {
    // Deduplicate: skip if same message+type already visible
    const msgStr = typeof message === 'string' ? message : String(message)
    const isDuplicate = toastsRef.current.some(t =>
      t.type === type &&
      (typeof t.message === 'string' ? t.message : String(t.message)) === msgStr,
    )
    if (isDuplicate) return ''

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const item: ToastItem = { id, type, message, duration }

    setToasts(t => {
      // Cap at 5 toasts — drop oldest if over limit
      const next = [...t, item].slice(-5)
      toastsRef.current = next
      return next
    })

    if (duration > 0) {
      const handle = window.setTimeout(() => remove(id), duration)
      timers.current[id] = handle
    }

    return id
  }, [remove])

  const api: ToastApi = {
    success: (m, d) => add(m, 'success', d ?? 4000),
    error:   (m, d) => add(m, 'error',   d ?? 6000),
    warning: (m, d) => add(m, 'warning', d ?? 5000),
    info:    (m, d) => add(m, 'info',    d ?? 4000),
  }

  useEffect(() => {
    const currentTimers = timers.current
    return () => {
      Object.values(currentTimers).forEach(h => h && window.clearTimeout(h))
    }
  }, [])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastContainer toasts={toasts} onRemove={remove} position={position} />
    </ToastContext.Provider>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Container
// ─────────────────────────────────────────────────────────────────────────────

const POSITION_STYLES: Record<string, React.CSSProperties> = {
  'bottom-right': { bottom: 24, right: 24 },
  'top-right':    { top: 24,    right: 24 },
  'top-left':     { top: 24,    left: 24  },
  'bottom-left':  { bottom: 24, left: 24  },
}

const ToastContainer: React.FC<{
  toasts: ToastItem[]
  onRemove: (id: string) => void
  position: string
}> = ({ toasts, onRemove, position }) => {
  const isTop = position.startsWith('top')

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      style={{
        position: 'fixed',
        zIndex: 9999,
        display: 'flex',
        flexDirection: isTop ? 'column' : 'column-reverse',
        gap: 10,
        pointerEvents: 'none',
        ...POSITION_STYLES[position] ?? POSITION_STYLES['bottom-right'],
      }}
    >
      <AnimatePresence initial={false} mode="sync">
        {toasts.map(t => (
          <Toast key={t.id} {...t} onClose={() => onRemove(t.id)} />
        ))}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual Toast
// ─────────────────────────────────────────────────────────────────────────────

const Toast: React.FC<ToastItem & { onClose: () => void }> = ({
  message,
  type,
  duration,
  onClose,
}) => {
  const [paused,   setPaused]   = useState(false)
  const [progress, setProgress] = useState(100)
  const [exiting,  setExiting]  = useState(false)
  const elapsed   = useRef(0)
  const lastTick  = useRef<number | null>(null)
  const rafHandle = useRef<number>(0)

  const tk = TOKENS[type]

  // ── Drain animation (RAF-based, pause-aware) ─────────────────────
  useEffect(() => {
    if (duration <= 0) return

    const tick = (now: number) => {
      if (!paused) {
        if (lastTick.current !== null) {
          elapsed.current += now - lastTick.current
        }
        lastTick.current = now
        const pct = Math.max(0, 100 - (elapsed.current / duration) * 100)
        setProgress(pct)
        if (pct <= 0) return // let the parent timer call onClose
      } else {
        lastTick.current = null
      }
      rafHandle.current = requestAnimationFrame(tick)
    }

    rafHandle.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafHandle.current)
  }, [duration, paused])

  const handleClose = () => {
    setExiting(true)
    setTimeout(onClose, 280) // let exit animation complete
  }

  // ── Spring entrance / exit variants ──────────────────────────────
  const variants = {
    initial: {
      opacity: 0,
      x: 64,
      scale: 0.92,
      filter: 'blur(6px)',
    },
    animate: {
      opacity: 1,
      x: 0,
      scale: 1,
      filter: 'blur(0px)',
      transition: {
        type: 'spring' as const,
        stiffness: 420,
        damping: 32,
        mass: 0.9,
      },
    },
    exit: {
      opacity: 0,
      x: 48,
      scale: 0.94,
      filter: 'blur(4px)',
      transition: {
        duration: 0.26,
        ease: [0.4, 0, 1, 1] as [number, number, number, number],
      },
    },
  }

  // ── Drain path (SVG liquid effect) ───────────────────────────────
  // We render a thin vertical strip on the left as the "draining" indicator.
  // The strip is a clipped rect that shrinks from bottom → top as time passes.
  const drainHeight = `${progress}%`

  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate={exiting ? 'exit' : 'animate'}
      exit="exit"
      layout
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role="status"
      aria-live="polite"
      style={{
        pointerEvents: 'auto',
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 0,
        minWidth: 316,
        maxWidth: 420,
        borderRadius: 14,
        overflow: 'hidden',
        // Liquid glass base
        background: `linear-gradient(135deg, rgba(12, 18, 32, 0.97) 0%, rgba(8, 12, 22, 0.99) 100%)`,
        border: `1px solid ${tk.accentBorder}`,
        boxShadow: [
          `0 4px 6px rgba(0,0,0,0.4)`,
          `0 12px 28px rgba(0,0,0,0.55)`,
          `0 0 0 1px rgba(255,255,255,0.03) inset`,
          `0 1px 0 rgba(255,255,255,0.06) inset`,
          `0 24px 64px ${tk.glow}`,
        ].join(', '),
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
      }}
    >
      {/* ── Left accent rail (drain indicator) ── */}
      <div
        style={{
          width: 3,
          alignSelf: 'stretch',
          flexShrink: 0,
          position: 'relative',
          background: 'rgba(255,255,255,0.04)',
          borderRadius: '14px 0 0 14px',
          overflow: 'hidden',
        }}
      >
        {/* Drained portion — fills from top, shrinks as progress drops */}
        <motion.div
          initial={{ height: '100%' }}
          animate={{ height: drainHeight }}
          transition={{ ease: 'linear', duration: 0.12 }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            background: `linear-gradient(180deg, ${tk.accent}cc 0%, ${tk.accent} 100%)`,
            boxShadow: `0 0 8px ${tk.accent}80`,
            borderRadius: '14px 0 0 14px',
          }}
        />
      </div>

      {/* ── Content ── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          padding: '14px 14px 14px 16px',
        }}
      >
        {/* Icon container */}
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: tk.accentLight,
            border: `1px solid ${tk.accentBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          <tk.Symbol />
        </div>

        {/* Text block */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Type label */}
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.14em',
              color: tk.accent,
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
              marginBottom: 4,
              textTransform: 'uppercase',
            }}
          >
            {tk.label}
          </div>

          {/* Message */}
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'rgba(241, 245, 249, 0.92)',
              lineHeight: 1.5,
              fontFamily: "'Syne', -apple-system, 'Segoe UI', sans-serif",
              wordBreak: 'break-word',
            }}
          >
            {message}
          </div>
        </div>

        {/* Close button */}
        <motion.button
          whileHover={{ scale: 1.12, background: 'rgba(255,255,255,0.1)' }}
          whileTap={{ scale: 0.92 }}
          onClick={handleClose}
          style={{
            flexShrink: 0,
            width: 24,
            height: 24,
            borderRadius: 7,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'rgba(148, 163, 184, 0.7)',
            marginTop: 1,
            transition: 'background 0.15s',
          }}
          aria-label="Dismiss notification"
        >
          <X size={12} strokeWidth={2.2} />
        </motion.button>
      </div>

      {/* ── Ambient corner glow ── */}
      <div
        style={{
          position: 'absolute',
          top: -20,
          right: -20,
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${tk.accent}18 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />

      {/* ── Top shimmer line ── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 3, // after the rail
          right: 0,
          height: 1,
          background: `linear-gradient(90deg, ${tk.accent}50 0%, rgba(255,255,255,0.05) 60%, transparent 100%)`,
          pointerEvents: 'none',
        }}
      />
    </motion.div>
  )
}

export default ToastProvider