import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, AlertCircle, Info, CheckCircle, X } from 'lucide-react'
import { colors } from '@/config/colors'

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
  
  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  const getConfig = () => {
    switch (type) {
      case 'warning':
        return {
          icon: <AlertTriangle className="w-7 h-7" />,
          color: colors.warning,
          bgGradient: `linear-gradient(135deg, ${colors.warning}25, ${colors.warning}10)`,
          borderColor: `${colors.warning}40`,
          buttonBg: `linear-gradient(135deg, ${colors.warning}, #D97706)`
        }
      case 'danger':
        return {
          icon: <AlertCircle className="w-7 h-7" />,
          color: '#EF4444',
          bgGradient: 'linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(239, 68, 68, 0.10))',
          borderColor: 'rgba(239, 68, 68, 0.4)',
          buttonBg: 'linear-gradient(135deg, #EF4444, #DC2626)'
        }
      case 'success':
        return {
          icon: <CheckCircle className="w-7 h-7" />,
          color: colors.success,
          bgGradient: `linear-gradient(135deg, ${colors.success}25, ${colors.success}10)`,
          borderColor: `${colors.success}40`,
          buttonBg: `linear-gradient(135deg, ${colors.success}, #16A34A)`
        }
      default:
        return {
          icon: <Info className="w-7 h-7" />,
          color: colors.primary,
          bgGradient: `linear-gradient(135deg, ${colors.primary}25, ${colors.primary}10)`,
          borderColor: `${colors.primary}40`,
          buttonBg: `linear-gradient(135deg, ${colors.primary}, ${colors.accentMint})`
        }
    }
  }

  const config = getConfig()

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 sm:bg-black/70 sm:backdrop-blur-sm"
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl"
            style={{
              background: 'rgba(30, 20, 15, 0.95)',
              border: `1px solid ${config.borderColor}`,
              boxShadow: `0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px ${config.color}15`
            }}
          >
            {/* Top accent bar */}
            <div className="h-1" style={{ background: config.buttonBg }} />
            
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 p-1.5 rounded-lg transition-colors hover:bg-white/10"
              style={{ color: colors.textSecondary }}
            >
              <X className="w-5 h-5" />
            </button>

            {/* Content */}
            <div className="p-6 pt-5">
              {/* Icon */}
              <div
                className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-4"
                style={{
                  background: config.bgGradient,
                  border: `1px solid ${config.borderColor}`,
                  color: config.color
                }}
              >
                {config.icon}
              </div>

              {/* Title */}
              <h2 className="text-xl font-bold text-white text-center mb-2">
                {title}
              </h2>

              {/* Message */}
              <p className="text-sm text-center leading-relaxed mb-6" style={{ color: colors.textSecondary }}>
                {message}
              </p>

              {/* Actions */}
              <div className="flex gap-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onClose}
                  className="flex-1 px-4 py-3 rounded-xl font-medium text-sm transition-all"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: colors.textSecondary
                  }}
                >
                  {cancelText}
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleConfirm}
                  className="flex-1 px-4 py-3 rounded-xl font-medium text-sm text-white shadow-lg transition-all"
                  style={{
                    background: config.buttonBg,
                    boxShadow: `0 4px 15px ${config.color}30`
                  }}
                >
                  {confirmText}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
