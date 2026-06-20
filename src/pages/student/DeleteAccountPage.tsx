/**
 * DeleteAccountConfirmPage
 *
 * Route: /:orgSlug/confirm-delete?token=<uuid>
 *
 * Landed on from the confirmation email. Validates the token via
 * confirm_account_deletion() RPC. On success, clears localStorage
 * and redirects to the landing page.
 *
 * Design: minimal — full-screen centered card, no nav, no distractions.
 * The user is about to do something permanent; the UI should not feel
 * like a normal app page.
 */

import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldOff,
  LogOut,
  ArrowRight,
} from 'lucide-react';
import { supabase } from '@/config/supabase';
import { useThemeTokens } from '@/hooks/useThemeTokens';

type ConfirmState =
  | { phase: 'loading' }
  | { phase: 'success'; deletion_path: string }
  | { phase: 'error'; message: string; code?: string };

// Keys that must be cleared on successful deletion so the app
// doesn't try to restore a session that no longer exists.
const SESSION_KEYS = [
  'pvx_auth', 'pvx_org_id', 'pvx_org_slug',
  'pvx_member_id', 'pvx_group_id', 'pvx_active_role',
  'org_scope', 'pvx_privacy_mask',
];

export default function DeleteAccountConfirmPage() {
  const t = useThemeTokens();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');

  const [state, setState] = useState<ConfirmState>({ phase: 'loading' });

  useEffect(() => {
    if (!token) {
      setState({ phase: 'error', message: 'No confirmation token found in this link. It may be malformed or expired.' });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('confirm_account_deletion', {
          p_token: token,
        });

        if (cancelled) return;

        if (error) throw new Error(error.message);

        const result = data as { ok: boolean; deletion_path?: string; error?: string; code?: string };

        if (!result.ok) {
          setState({
            phase: 'error',
            message: result.error || 'Could not complete account deletion.',
            code: result.code,
          });
          return;
        }

        // Clear ALL session keys — the account no longer exists.
        SESSION_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch { /* ignore */ } });

        setState({ phase: 'success', deletion_path: result.deletion_path || 'hard' });
      } catch (err) {
        if (cancelled) return;
        setState({
          phase: 'error',
          message: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        });
      }
    })();

    return () => { cancelled = true; };
  }, [token]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-5"
      style={{ minHeight: '100dvh', background: t.bg, color: t.text }}
    >
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-2xl font-extrabold tracking-tight">
            <span style={{ color: '#FF6803' }}>Pay</span>
            <span style={{ color: t.textSec }}>vexo</span>
          </span>
        </div>

        {/* ── Loading ── */}
        {state.phase === 'loading' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl p-8 text-center space-y-4"
            style={{ background: t.card, border: `1px solid ${t.cardBorder}` }}
          >
            <Loader2 size={32} className="animate-spin mx-auto" style={{ color: t.primary }} />
            <div>
              <p className="text-base font-bold" style={{ color: t.text }}>Processing your request</p>
              <p className="text-sm mt-1" style={{ color: t.textSec }}>
                Validating your confirmation link…
              </p>
            </div>
          </motion.div>
        )}

        {/* ── Success ── */}
        {state.phase === 'success' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-3xl overflow-hidden"
            style={{ border: `1px solid rgba(48,255,172,0.25)`, background: t.card }}
          >
            <div
              className="h-1.5"
              style={{ background: 'linear-gradient(90deg, #30FFAC, #10B981)' }}
            />
            <div className="p-7 space-y-5">
              <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(48,255,172,0.12)', color: t.mint }}>
                <CheckCircle2 size={26} />
              </div>

              <div className="text-center">
                <p className="text-lg font-extrabold tracking-tight" style={{ color: t.text }}>
                  Account deleted
                </p>
                <p className="text-sm mt-2 leading-6" style={{ color: t.textSec }}>
                  {state.deletion_path === 'soft'
                    ? 'Your personal information has been permanently removed. Transaction records have been anonymized and preserved for audit compliance.'
                    : 'Your account and all personal data have been permanently deleted.'}
                </p>
              </div>

              <div
                className="rounded-2xl p-4 text-[12px] leading-5 space-y-1.5"
                style={{ background: t.overlay ?? t.cardBorder, border: `1px solid ${t.cardBorder}` }}
              >
                <p className="font-bold uppercase tracking-wider text-[10px] mb-2" style={{ color: t.textTer }}>
                  What happened
                </p>
                <p style={{ color: t.textSec }}>✓ Your login access has been revoked</p>
                <p style={{ color: t.textSec }}>✓ Personal details (name, email, phone) removed</p>
                {state.deletion_path === 'soft' && (
                  <p style={{ color: t.textSec }}>· Financial records retained in anonymized form as required by Nigerian data protection regulation</p>
                )}
              </div>

              <motion.button
                onClick={() => navigate('/')}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2"
                style={{
                  background: 'linear-gradient(135deg, #FF6803, #FFAC5F)',
                  color: '#fff',
                }}
              >
                Back to home
                <ArrowRight size={16} />
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ── Error ── */}
        {state.phase === 'error' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-3xl overflow-hidden"
            style={{ border: `1px solid rgba(239,68,68,0.25)`, background: t.card }}
          >
            <div
              className="h-1.5"
              style={{ background: 'linear-gradient(90deg, #ef4444, #dc2626)' }}
            />
            <div className="p-7 space-y-5">
              <div
                className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(239,68,68,0.12)', color: t.danger }}
              >
                {state.code === 'active_role_blocked'
                  ? <ShieldOff size={26} />
                  : state.code === 'handover_in_progress'
                    ? <LogOut size={26} />
                    : <AlertCircle size={26} />}
              </div>

              <div className="text-center">
                <p className="text-base font-extrabold" style={{ color: t.text }}>
                  {state.code === 'active_role_blocked'
                    ? 'Hand over your role first'
                    : state.code === 'handover_in_progress'
                      ? 'Handover in progress'
                      : 'Could not delete account'}
                </p>
                <p className="text-sm mt-2 leading-6" style={{ color: t.textSec }}>
                  {state.message}
                </p>
              </div>

              <div className="flex gap-2">
                <motion.button
                  onClick={() => navigate('/')}
                  whileTap={{ scale: 0.97 }}
                  className="flex-1 py-3 rounded-2xl text-sm font-semibold"
                  style={{ background: t.overlay ?? t.cardBorder, color: t.textSec, border: `1px solid ${t.cardBorder}` }}
                >
                  Go home
                </motion.button>
                <motion.button
                  onClick={() => navigate(-1)}
                  whileTap={{ scale: 0.97 }}
                  className="flex-1 py-3 rounded-2xl text-sm font-bold"
                  style={{ background: 'rgba(239,68,68,0.12)', color: t.danger, border: `1px solid rgba(239,68,68,0.25)` }}
                >
                  Back to profile
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}