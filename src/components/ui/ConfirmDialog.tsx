import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, AlertCircle, Info, CheckCircle, X } from 'lucide-react'
import { useTheme, getDashboardTokens } from '@/hooks/useTheme'

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  type?: 'info' | 'warning' | 'danger' | 'success'
  confirmText?: string
  cancelText?: string
}

/**
 * ConfirmDialog — the project's standard confirmation modal.
 *
 * Theme-aware (light + dark) and visually consistent with the rest of
 * the app's exec-dashboard surfaces. The previous version was dark-only
 * (`background: rgba(30, 20, 15, 0.95)` + hardcoded white text), so on
 * light theme a delete-confirm popped up as a dark slab over a light
 * page. Now both themes get the right card colour, border and text
 * tones from getDashboardTokens.
 */
export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  type = 'info',
  confirmText = 'Confirm',
  cancelText = 'Cancel'
}: ConfirmDialogProps) {
  const { theme } = useTheme()
  const tt = getDashboardTokens(theme)
  const isLight = theme === 'light'

  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  // Type → accent colour mapping. Each variant uses one of the theme's
  // status tokens so colour selection stays consistent with the rest
  // of the UI (info = primary, success = mint, etc.).
  const getConfig = () => {
    switch (type) {
      case 'warning':
        return { icon: <AlertTriangle className="w-7 h-7" />, color: tt.amber }
      case 'danger':
        return { icon: <AlertCircle className="w-7 h-7" />, color: tt.danger }
      case 'success':
        return { icon: <CheckCircle className="w-7 h-7" />, color: tt.mint }
      default:
        return { icon: <Info className="w-7 h-7" />, color: tt.primary }
    }
  }

  const config = getConfig()

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop — same dim level on both themes; the card sits
              clearly above it. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0"
            style={{ background: 'rgba(0, 0, 0, 0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="relative w-full max-w-sm rounded-2xl overflow-hidden"
            style={{
              background: isLight ? '#FFFFFF' : tt.card,
              border: `1px solid ${isLight ? 'rgba(15,7,3,0.06)' : tt.cardBorder}`,
              boxShadow: isLight
                ? '0 25px 60px -16px rgba(15,7,3,0.22), 0 6px 16px -4px rgba(15,7,3,0.08)'
                : '0 25px 50px -12px rgba(0,0,0,0.5)',
            }}
          >
            {/* Top accent bar — uses the variant colour as a single
                solid line so it doesn't read like a gradient banner. */}
            <div className="h-1" style={{ background: config.color }} />

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3 right-3 p-1.5 rounded-lg transition-colors"
              style={{ color: tt.textTer }}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Content */}
            <div className="p-6 pt-5 text-center">
              {/* Icon */}
              <div
                className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-4"
                style={{
                  background: `${config.color}18`,
                  border: `1px solid ${config.color}38`,
                  color: config.color,
                }}
              >
                {config.icon}
              </div>

              {/* Title */}
              <h2 className="text-lg font-extrabold tracking-tight mb-2" style={{ color: tt.text }}>
                {title}
              </h2>

              {/* Message */}
              <p className="text-sm leading-relaxed mb-5" style={{ color: tt.textSec }}>
                {message}
              </p>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition-all hover:-translate-y-0.5 active:scale-[0.98]"
                  style={{
                    background: tt.card,
                    color: tt.text,
                    border: `1px solid ${tt.cardBorder}`,
                  }}
                >
                  {cancelText}
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition-all hover:-translate-y-0.5 active:scale-[0.98]"
                  style={{
                    background: config.color,
                    color: '#FFFFFF',
                    border: `1px solid ${config.color}`,
                  }}
                >
                  {confirmText}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
