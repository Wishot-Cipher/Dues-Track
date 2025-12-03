import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, X } from 'lucide-react'
import CustomButton from './ui/CustomButton'

// Current app version - update this when you make changes
const APP_VERSION = '1.0.1'

export default function UpdateNotification() {
  const [showUpdate, setShowUpdate] = useState(false)
  const [dismissed, setDismissed] = useState(false)

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
                  // New service worker available
                  setShowUpdate(true)
                }
              })
            }
          })

          // Check for waiting service worker
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
    // Tell service worker to skip waiting and activate
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg?.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' })
        }
      })

      // Listen for controller change and reload
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload()
      })
    }

    // If no service worker, just reload
    setTimeout(() => {
      window.location.reload()
    }, 100)
  }

  const handleDismiss = () => {
    setDismissed(true)
    setShowUpdate(false)
    // Show again in 1 hour
    setTimeout(() => {
      setDismissed(false)
      setShowUpdate(true)
    }, 60 * 60 * 1000)
  }

  if (!showUpdate || dismissed) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -100 }}
        className="fixed top-4 left-1/2 -translate-x-1/2 z-100 max-w-md w-full mx-4"
      >
        <div
          className="relative rounded-2xl p-4 shadow-2xl border border-white/20"
          style={{
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.95) 0%, rgba(147, 51, 234, 0.95) 100%)',
            backdropFilter: 'blur(10px)',
          }}
        >
          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="absolute top-2 right-2 p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>

          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className="shrink-0 mt-0.5">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-white" />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-bold text-base mb-1">
                🎉 Update Available!
              </h3>
              <p className="text-white/90 text-sm mb-3">
                A new version of the app is available with improvements and new features. Update now for the best experience.
              </p>

              <div className="flex items-center gap-2">
                <CustomButton
                  onClick={handleUpdate}
                  variant="secondary"
                  size="sm"
                  className="bg-white/20 hover:bg-white/30 text-white border border-white/30"
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Update Now
                </CustomButton>
                <button
                  onClick={handleDismiss}
                  className="text-xs text-white/80 hover:text-white underline"
                >
                  Remind me later
                </button>
              </div>
            </div>
          </div>

          {/* Version badge */}
          <div className="absolute bottom-2 right-2">
            <span className="text-xs text-white/60 font-mono">v{APP_VERSION}</span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
