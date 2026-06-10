/**
 * InstallPWA — "install the app" prompt.
 *
 * Two paths, because the platforms differ:
 *  • Android / Chromium → the native `beforeinstallprompt` event gives
 *    us a real "Install" button (one tap).
 *  • iOS Safari → there is NO install event. The user must tap Share →
 *    "Add to Home Screen". So we DETECT iOS and show the exact steps,
 *    otherwise iPhone users (a huge share) never get the app and think
 *    it isn't installable.
 *
 * Hidden once the app is already running standalone, and after dismiss
 * (per session). Theme-aware.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Share, Plus, Smartphone } from 'lucide-react';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'pwa_install_dismissed';

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIOSDevice(): boolean {
  const ua = navigator.userAgent;
  const iOS = /iPhone|iPad|iPod/i.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // Only Safari can Add-to-Home-Screen on iOS (not Chrome/Firefox iOS).
  const isSafari = /^((?!chrome|crios|fxios|android).)*safari/i.test(ua);
  return iOS && isSafari;
}

export default function InstallPWA() {
  const { theme } = useTheme();
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [iosMode, setIosMode] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;                       // already installed
    if (sessionStorage.getItem(DISMISS_KEY)) return;  // dismissed this session

    // Android / Chromium path.
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS path — no event fires, so surface the manual steps after a
    // short delay (let the page settle first so it's not jarring).
    let iosTimer: ReturnType<typeof setTimeout> | undefined;
    if (isIOSDevice()) {
      iosTimer = setTimeout(() => { setIosMode(true); setShow(true); }, 2500);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShow(false);
  };

  const dismiss = () => {
    setShow(false);
    try { sessionStorage.setItem(DISMISS_KEY, 'true'); } catch { /* ignore */ }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-[380px] z-[120]"
        >
          <div
            className="relative rounded-2xl p-4 overflow-hidden"
            style={{
              background: t.card,
              border: `1px solid ${t.cardBorder}`,
              boxShadow: '0 20px 50px rgba(0,0,0,0.28)',
            }}
          >
            {/* soft brand wash */}
            <span aria-hidden className="absolute -right-10 -top-10 w-28 h-28 rounded-full pointer-events-none"
              style={{ background: t.blob1, filter: 'blur(36px)' }} />

            <button
              onClick={dismiss}
              className="absolute top-2.5 right-2.5 p-1.5 rounded-lg"
              style={{ background: isLight ? 'rgba(15,7,3,0.05)' : 'rgba(255,255,255,0.06)' }}
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" style={{ color: t.textSec }} />
            </button>

            <div className="relative flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: t.gradOrange }}>
                <Smartphone className="w-6 h-6 text-white" />
              </div>

              <div className="flex-1 min-w-0 pr-4">
                <h3 className="font-extrabold mb-0.5" style={{ color: t.text }}>
                  {iosMode ? 'Add Payvexo to your Home Screen' : 'Install Payvexo'}
                </h3>

                {iosMode ? (
                  <>
                    <p className="text-[13px] mb-2.5" style={{ color: t.textSec }}>
                      Get the full-screen app + offline access in two taps:
                    </p>
                    <ol className="space-y-1.5">
                      <li className="flex items-center gap-2 text-[13px]" style={{ color: t.text }}>
                        <span className="w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0"
                          style={{ background: t.primarySoft, color: t.primary }}>1</span>
                        Tap <Share className="w-4 h-4 inline" style={{ color: t.primary }} /> <span style={{ color: t.textSec }}>(Share)</span> in the toolbar
                      </li>
                      <li className="flex items-center gap-2 text-[13px]" style={{ color: t.text }}>
                        <span className="w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0"
                          style={{ background: t.primarySoft, color: t.primary }}>2</span>
                        Choose <Plus className="w-4 h-4 inline" style={{ color: t.primary }} /> <b>Add to Home Screen</b>
                      </li>
                    </ol>
                  </>
                ) : (
                  <>
                    <p className="text-[13px] mb-3" style={{ color: t.textSec }}>
                      Install for instant access, offline support, and notifications — like a real app.
                    </p>
                    <button
                      onClick={handleInstall}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-white"
                      style={{ background: t.gradOrange, boxShadow: `0 8px 22px -8px ${t.primary}` }}
                    >
                      <Download className="w-4 h-4" /> Install app
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
