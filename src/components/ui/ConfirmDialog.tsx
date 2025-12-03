import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, AlertCircle, Info, CheckCircle } from 'lucide-react'
import CustomButton from './CustomButton'
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

  const getIcon = () => {
    switch (type) {
      case 'warning':
        return <AlertTriangle className="w-12 h-12 text-yellow-500" />
      case 'danger':
        return <AlertCircle className="w-12 h-12 text-red-500" />
      case 'success':
        return <CheckCircle className="w-12 h-12 text-green-500" />
      default:
        return <Info className="w-12 h-12 text-blue-500" />
    }
  }

  const getColors = () => {
    switch (type) {
      case 'warning':
        return {
          border: 'border-yellow-500/30',
          bg: 'bg-yellow-500/10',
          button: colors.warning
        }
      case 'danger':
        return {
          border: 'border-red-500/30',
          bg: 'bg-red-500/10',
          button: colors.error
        }
      case 'success':
        return {
          border: 'border-green-500/30',
          bg: 'bg-green-500/10',
          button: colors.success
        }
      default:
        return {
          border: 'border-blue-500/30',
          bg: 'bg-blue-500/10',
          button: colors.primary
        }
    }
  }

  const colorScheme = getColors()

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
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className={`relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full border-2 ${colorScheme.border} overflow-hidden`}
          >
            {/* Header with colored background */}
            <div className={`${colorScheme.bg} p-6 flex flex-col items-center text-center border-b ${colorScheme.border}`}>
              {getIcon()}
              <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
                {title}
              </h2>
            </div>

            {/* Content */}
            <div className="p-6">
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line text-center">
                {message}
              </p>
            </div>

            {/* Actions */}
            <div className="p-6 pt-0 flex gap-3">
              <CustomButton
                onClick={onClose}
                variant="secondary"
                className="flex-1"
              >
                {cancelText}
              </CustomButton>
              <CustomButton
                onClick={handleConfirm}
                variant={type === 'danger' ? 'danger' : type === 'warning' ? 'primary' : type === 'success' ? 'success' : 'primary'}
                className="flex-1"
              >
                {confirmText}
              </CustomButton>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
