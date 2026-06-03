import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  X,
  Loader2,
} from 'lucide-react'
import { useTheme, getDashboardTokens } from '@/hooks/useTheme'

interface ConfirmRow {
  label: string
  value: string
}

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  /**
   * Short one-line subtitle that explains the context of the action.
   * Renders directly under the title in the icon row.
   */
  subtitle?: string
  /**
   * Optional long-form body. Mirrors the legacy `message` prop —
   * still supported. Either pass `message` for a single paragraph or
   * pass `rows` for a structured Action / Impact / Reason layout
   * (the console pattern).
   */
  message?: string
  /**
   * Structured info rows — label + value pairs that appear as small
   * surfaced cards inside the modal. Matches PlatformConsole's
   * SafetyConfirmModal / ActionConfirmModal exactly so every
   * confirm in the app reads with the same hierarchy.
   */
  rows?: ConfirmRow[]
  type?: 'info' | 'warning' | 'danger' | 'success'
  confirmText?: string
  cancelText?: string
  /**
   * When true the confirm button shows a spinner and both buttons go
   * disabled. The dialog stays open until the caller flips this back
   * to false (or calls onClose).
   */
  busy?: boolean
}

/**
 * ConfirmDialog — the project's standard confirmation modal.
 *
 * Visual pattern lifted from `PlatformConsole.SafetyConfirmModal` /
 * `ActionConfirmModal` (the console's "review before you act" sheet):
 * a small icon chip + title + subtitle header, an optional grid of
 * info rows describing the Action / Impact, then Cancel + Confirm
 * buttons at the bottom. On phones the modal anchors to the BOTTOM
 * of the screen (matches the console); on desktop it floats centred.
 *
 * Theme-aware via getDashboardTokens — the legacy version was
 * dark-only and read badly on light theme. Backwards compatible:
 * the old `message` prop still works (renders as a single body
 * paragraph) so existing call sites keep functioning.
 */
export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  subtitle,
  message,
  rows,
  type = 'info',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  busy = false,
}: ConfirmDialogProps) {
  const { theme } = useTheme()
  const tt = getDashboardTokens(theme)
  const isLight = theme === 'light'

  const handleConfirm = () => {
    onConfirm()
    if (!busy) onClose()
  }

  const cfg = (() => {
    switch (type) {
      case 'warning':
        return { icon: <AlertTriangle className="w-[18px] h-[18px]" />, color: tt.amber }
      case 'danger':
        return { icon: <AlertCircle className="w-[18px] h-[18px]" />, color: tt.danger }
      case 'success':
        return { icon: <CheckCircle className="w-[18px] h-[18px]" />, color: tt.mint }
      default:
        return { icon: <Info className="w-[18px] h-[18px]" />, color: tt.primary }
    }
  })()

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            background: isLight ? 'rgba(15,7,3,0.30)' : 'rgba(3,7,18,0.68)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
          onClick={() => { if (!busy) onClose() }}
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-2xl overflow-hidden"
            style={{
              maxWidth: 520,
              background: isLight ? '#FFFFFF' : '#100A07',
              border: `1px solid ${cfg.color}55`,
              padding: 22,
              boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
            }}
          >
            {/* ── Header ─────────────────────────────────────────
                Icon chip + title + subtitle. Close button tucked
                top-right so the user has a no-action exit even
                while a busy action is running. */}
            <div className="flex items-start gap-2.5 mb-3">
              <div
                className="shrink-0 rounded-xl flex items-center justify-center"
                style={{
                  width: 38,
                  height: 38,
                  background: `${cfg.color}1f`,
                  color: cfg.color,
                }}
              >
                {cfg.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[18px] leading-tight font-extrabold tracking-tight" style={{ color: tt.text, margin: 0 }}>
                  {title}
                </h3>
                {subtitle && (
                  <p className="text-[12px] mt-0.5" style={{ color: tt.textSec, margin: 0 }}>
                    {subtitle}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-50"
                style={{ color: tt.textTer }}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ── Body ─────────────────────────────────────────────
                Structured row grid when caller passes `rows` (the
                console pattern). Falls back to a single body
                paragraph when only `message` is passed (back-compat
                with the legacy confirm-dialog call sites). */}
            {(rows && rows.length > 0) ? (
              <div className="grid gap-2.5 mb-4">
                {rows.map((r) => (
                  <div
                    key={r.label}
                    className="rounded-xl p-3"
                    style={{
                      background: isLight ? 'rgba(15,7,3,0.03)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${tt.cardBorder}`,
                    }}
                  >
                    <p
                      className="text-[10px] font-bold uppercase tracking-[0.08em] mb-1"
                      style={{ color: tt.textTer }}
                    >
                      {r.label}
                    </p>
                    <p
                      className="text-[13px] leading-relaxed whitespace-pre-wrap"
                      style={{ color: tt.text, margin: 0 }}
                    >
                      {r.value}
                    </p>
                  </div>
                ))}
              </div>
            ) : message ? (
              <p
                className="text-[13px] leading-relaxed mb-4"
                style={{ color: tt.textSec, margin: '0 0 16px' }}
              >
                {message}
              </p>
            ) : null}

            {/* ── Actions ──────────────────────────────────────────
                Bottom-right cluster. Same chip-button shape as
                Console.Btn so every confirm in the app reads with
                the same call-to-action language. */}
            <div className="flex justify-end gap-2 flex-wrap">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all disabled:opacity-50"
                style={{
                  background: isLight ? 'rgba(15,7,3,0.05)' : 'rgba(255,255,255,0.05)',
                  color: tt.textSec,
                  border: `1px solid ${tt.cardBorder}`,
                }}
              >
                {cancelText}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all disabled:opacity-50"
                style={{
                  background: `${cfg.color}15`,
                  color: cfg.color,
                  border: `1px solid ${cfg.color}35`,
                }}
              >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
