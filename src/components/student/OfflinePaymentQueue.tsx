/**
 * OfflinePaymentQueue
 *
 * Two exports:
 *
 * 1. useOfflineQueue()  — hook that wraps your submit function.
 *    If the device is offline, it serialises the payload to localStorage and
 *    automatically retries when connectivity is restored.
 *
 * 2. OfflineBanner      — ambient status bar shown at the top of the payment
 *    page when the device is offline or when a queued item is waiting to send.
 *
 * Usage:
 *
 *   // In PaymentDetailPage or PaymentSubmissionFlow:
 *   const { wrappedSubmit, queuedCount, isOnline } = useOfflineQueue(actualSubmitFn);
 *
 *   // Replace your submit call:
 *   await wrappedSubmit(payload);
 *
 *   // In your JSX:
 *   <OfflineBanner isOnline={isOnline} queuedCount={queuedCount} />
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, Wifi, Clock, Send, CheckCircle } from 'lucide-react';

const QUEUE_KEY = 'payvexo_payment_queue';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QueuedPayload {
  id:        string;         // uuid generated at queue time
  queuedAt:  string;         // ISO timestamp
  data:      unknown;        // the original submit payload
}

// ── Storage helpers ───────────────────────────────────────────────────────────

function readQueue(): QueuedPayload[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeQueue(q: QueuedPayload[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch { /* quota exceeded — fail silently */ }
}

function enqueue(data: unknown): QueuedPayload {
  const item: QueuedPayload = {
    id:       crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    queuedAt: new Date().toISOString(),
    data,
  };
  writeQueue([...readQueue(), item]);
  return item;
}

function dequeue(id: string) {
  writeQueue(readQueue().filter(i => i.id !== id));
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * @param submitFn  Your real async submit function that accepts the payload.
 *                  Should throw on failure so we can re-queue.
 */
export function useOfflineQueue<T>(submitFn: (data: T) => Promise<void>) {
  const [isOnline,    setIsOnline]    = useState(navigator.onLine);
  const [queuedCount, setQueuedCount] = useState(readQueue().length);
  const [flushing,    setFlushing]    = useState(false);
  const submitRef = useRef(submitFn);
  submitRef.current = submitFn;

  // Track online/offline
  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online',  on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Flush queue when we come back online
  useEffect(() => {
    if (!isOnline || flushing) return;

    const q = readQueue();
    if (q.length === 0) return;

    const flush = async () => {
      setFlushing(true);
      for (const item of q) {
        try {
          await submitRef.current(item.data as T);
          dequeue(item.id);
          setQueuedCount(readQueue().length);
        } catch {
          // Leave in queue for next attempt
        }
      }
      setFlushing(false);
    };

    flush();
  }, [isOnline, flushing]);

  // Wrapped submit: queue if offline, execute immediately if online
  const wrappedSubmit = useCallback(async (data: T) => {
    if (!navigator.onLine) {
      enqueue(data);
      setQueuedCount(readQueue().length);
      return;
    }
    await submitRef.current(data);
  }, []);

  return { wrappedSubmit, isOnline, queuedCount, flushing };
}

// ── OfflineBanner ─────────────────────────────────────────────────────────────

interface BannerProps {
  isOnline:    boolean;
  queuedCount: number;
  flushing?:   boolean;
}

export function OfflineBanner({ isOnline, queuedCount, flushing = false }: BannerProps) {
  const [justCameOnline, setJustCameOnline] = useState(false);
  const prevOnline = useRef(isOnline);

  useEffect(() => {
    if (!prevOnline.current && isOnline) {
      setJustCameOnline(true);
      const t = setTimeout(() => setJustCameOnline(false), 3500);
      return () => clearTimeout(t);
    }
    prevOnline.current = isOnline;
  }, [isOnline]);

  const show = !isOnline || queuedCount > 0 || justCameOnline;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="w-full rounded-2xl overflow-hidden"
          initial={{ opacity: 0, height: 0, marginBottom: 0 }}
          animate={{ opacity: 1, height: 'auto', marginBottom: 12 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{
              background: !isOnline
                ? 'rgba(239,68,68,0.09)'
                : flushing
                ? 'rgba(99,102,241,0.09)'
                : justCameOnline
                ? 'rgba(34,197,94,0.09)'
                : 'rgba(245,158,11,0.09)',
              border: `1px solid ${
                !isOnline        ? 'rgba(239,68,68,0.25)'
                : flushing       ? 'rgba(99,102,241,0.25)'
                : justCameOnline ? 'rgba(34,197,94,0.25)'
                :                  'rgba(245,158,11,0.25)'
              }`,
            }}
          >
            {/* Icon */}
            <motion.div
              animate={!isOnline ? { opacity: [1, 0.5, 1] } : {}}
              transition={{ duration: 1.6, repeat: Infinity }}
            >
              {!isOnline ? (
                <WifiOff className="w-4 h-4 shrink-0" style={{ color: '#EF4444' }} />
              ) : flushing ? (
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                  <Send className="w-4 h-4 shrink-0" style={{ color: '#6366F1' }} />
                </motion.div>
              ) : justCameOnline ? (
                <CheckCircle className="w-4 h-4 shrink-0" style={{ color: '#22C55E' }} />
              ) : (
                <Clock className="w-4 h-4 shrink-0" style={{ color: '#F59E0B' }} />
              )}
            </motion.div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              {!isOnline && (
                <p className="text-xs font-semibold" style={{ color: '#EF4444' }}>
                  You're offline
                  {queuedCount > 0 && (
                    <span className="font-normal" style={{ color: 'rgba(239,68,68,0.7)' }}>
                      {' '}— {queuedCount} payment{queuedCount > 1 ? 's' : ''} queued, will send automatically when reconnected
                    </span>
                  )}
                  {queuedCount === 0 && (
                    <span className="font-normal" style={{ color: 'rgba(239,68,68,0.7)' }}>
                      {' '}— your payment will be submitted automatically when you reconnect
                    </span>
                  )}
                </p>
              )}
              {isOnline && flushing && (
                <p className="text-xs font-semibold" style={{ color: '#6366F1' }}>
                  Sending queued payment{queuedCount > 1 ? 's' : ''}…
                </p>
              )}
              {isOnline && !flushing && justCameOnline && queuedCount === 0 && (
                <p className="text-xs font-semibold" style={{ color: '#22C55E' }}>
                  Back online — payment submitted successfully!
                </p>
              )}
              {isOnline && !flushing && !justCameOnline && queuedCount > 0 && (
                <p className="text-xs font-semibold" style={{ color: '#F59E0B' }}>
                  {queuedCount} payment{queuedCount > 1 ? 's' : ''} queued — retrying…
                </p>
              )}
            </div>

            {/* Queued count pill */}
            {queuedCount > 0 && (
              <span
                className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0"
                style={{
                  background: flushing ? 'rgba(99,102,241,0.2)' : 'rgba(245,158,11,0.2)',
                  color: flushing ? '#6366F1' : '#F59E0B',
                }}
              >
                {queuedCount}
              </span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}