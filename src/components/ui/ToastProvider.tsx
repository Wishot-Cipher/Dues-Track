import React, { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react'
import { colors } from '../../config/colors'
import { ToastContext, type ToastApi } from '@/contexts/ToastContext'

type ToastType = 'success' | 'error' | 'warning' | 'info'

type ToastItem = {
  id: string
  type: ToastType
  message: React.ReactNode
  duration: number
}

export const ToastProvider: React.FC<{ children?: React.ReactNode; position?: 'bottom-right' | 'top-right' | 'top-left' | 'bottom-left' }> = ({ children, position = 'bottom-right' }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Record<string, number | null>>({})

  const remove = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id))
    const handle = timers.current[id]
    if (handle) window.clearTimeout(handle)
    delete timers.current[id]
  }, [])

  const add = useCallback((message: React.ReactNode, type: ToastType = 'info', duration = 4000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const item: ToastItem = { id, type, message, duration }
    setToasts((t) => [...t, item])

    if (duration > 0) {
      const handle = window.setTimeout(() => remove(id), duration)
      timers.current[id] = handle
    }

    return id
  }, [remove])

  const api: ToastApi = {
    success: (m, d) => add(m, 'success', d ?? 4000),
    error: (m, d) => add(m, 'error', d ?? 6000),
    warning: (m, d) => add(m, 'warning', d ?? 5000),
    info: (m, d) => add(m, 'info', d ?? 4000),
  }

  useEffect(() => {
    const currentTimers = timers.current
    return () => {
      // cleanup timers — use captured reference
      Object.values(currentTimers).forEach((h) => h && window.clearTimeout(h))
    }
  }, [])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastContainer toasts={toasts} onRemove={remove} position={position} />
    </ToastContext.Provider>
  )
}

const ToastContainer: React.FC<{ toasts: ToastItem[]; onRemove: (id: string) => void; position: string }> = ({ toasts, onRemove, position }) => {
  const posClass =
    position === 'bottom-right'
      ? 'bottom-6 right-6'
      : position === 'top-right'
      ? 'top-6 right-6'
      : position === 'top-left'
      ? 'top-6 left-6'
      : 'bottom-6 left-6'

  return (
    <div className={`fixed z-50 space-y-3 pointer-events-none ${posClass}`}>
      {toasts.map((t) => (
        <Toast key={t.id} {...t} onClose={() => onRemove(t.id)} />
      ))}
    </div>
  )
}

const Toast: React.FC<ToastItem & { onClose: () => void }> = ({ message, type, duration, onClose }) => {
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(100)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (duration <= 0) return
    const start = Date.now()
    startRef.current = start

    let raf = 0
    const step = () => {
      if (!paused) {
        const elapsed = Date.now() - (startRef.current ?? start)
        const pct = Math.max(0, 100 - (elapsed / duration) * 100)
        setProgress(pct)
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)

    return () => cancelAnimationFrame(raf)
  }, [duration, paused])

  const config = {
    success: { icon: CheckCircle, color: colors.statusPaid, bg: `${colors.statusPaid}20`, glow: 'rgba(22, 244, 86, 0.4)' },
    error: { icon: XCircle, color: colors.statusUnpaid, bg: `${colors.statusUnpaid}20`, glow: 'rgba(255, 77, 77, 0.4)' },
    warning: { icon: AlertCircle, color: colors.statusPartial, bg: `${colors.statusPartial}20`, glow: 'rgba(255, 195, 0, 0.4)' },
    info: { icon: Info, color: colors.accentMint, bg: `${colors.accentMint}20`, glow: 'rgba(48, 255, 172, 0.4)' },
  }[type]

  const Icon = config.icon

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="pointer-events-auto flex items-center gap-3 p-4 rounded-xl backdrop-blur-xl min-w-[300px] max-w-md"
      style={{ background: config.bg, border: `1px solid ${config.color}50`, boxShadow: `0 8px 32px ${config.glow}` }}
      role="status"
      aria-live="polite"
    >
      <div className="shrink-0">
        <Icon size={20} style={{ color: config.color }} />
      </div>
      <div className="flex-1 text-sm font-medium">{message}</div>
      <button onClick={onClose} className="shrink-0 p-1 rounded hover:bg-white/10 transition-colors">
        <X size={16} />
      </button>
      {duration > 0 && (
        <div className="absolute left-0 bottom-0 right-0 h-0.5 bg-white/10 rounded-b" style={{ overflow: 'hidden' }}>
          <div style={{ width: `${progress}%`, height: '100%', background: config.color, transition: 'width 0.1s linear' }} />
        </div>
      )}
    </div>
  )
}

export default ToastProvider
