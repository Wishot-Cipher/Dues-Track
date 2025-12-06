import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, X } from 'lucide-react'
import { colors } from '@/config/colors'

// Current app version - update this when you make changes
const APP_VERSION = '1.0.1'

export default function UpdateNotification() {
  const [showUpdate, setShowUpdate] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    // Check if service worker has an update
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) {
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  setShowUpdate(true)
                }
              })
            }
          })

          if (reg.waiting) {
            setShowUpdate(true)
          }
        }
      })
    }

    // Check app version from localStorage
    const storedVersion = localStorage.getItem('app_version')
    if (storedVersion !== APP_VERSION) {
      setShowUpdate(true)
      localStorage.setItem('app_version', APP_VERSION)
    }
  }, [])

  const handleUpdate = () => {
    setIsUpdating(true)
    
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg?.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' })
        }
      })

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload()
      })
    }

    setTimeout(() => {
      window.location.reload()
    }, 500)
  }

  const handleDismiss = () => {
    setDismissed(true)
    setShowUpdate(false)
    setTimeout(() => {
      setDismissed(false)
      setShowUpdate(true)
    }, 60 * 60 * 1000)
  }

  if (!showUpdate || dismissed) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ type: 'spring', damping: 30, stiffness: 400 }}
        className="fixed top-3 left-1/2 -translate-x-1/2 z-100 w-[calc(100%-2rem)] max-w-sm"
      >
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg"
          style={{
            background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.95) 0%, rgba(255, 140, 80, 0.95) 100%)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: '0 4px 20px rgba(255, 107, 53, 0.4), 0 0 0 1px rgba(255, 107, 53, 0.1)',
          }}
        >
          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">
              New update available
            </p>
          </div>

          {/* Update button */}
          <motion.button
            onClick={handleUpdate}
            disabled={isUpdating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-70"
            style={{
              background: 'rgba(255, 255, 255, 0.95)',
              color: colors.primary,
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
            {isUpdating ? 'Updating' : 'Update'}
          </motion.button>

          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="shrink-0 p-1 rounded-md transition-all hover:bg-white/20"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
