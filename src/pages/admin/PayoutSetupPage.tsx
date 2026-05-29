/**
 * PayoutSetupPage — the org's bank/payout onboarding.
 *
 * An org cannot truly collect until it registers a bank account: we resolve
 * the account with Paystack, create a subaccount, and store it on the org.
 * After that, every payment splits automatically — the org's dues settle to
 * THIS bank, and the platform keeps only its service fee. Until then, all
 * charges land in the platform account.
 *
 * Gated to a VERIFIED admin with can_manage_settings (route + server both check).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Banknote, CheckCircle2, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useAppNav } from '@/hooks/useAppNav';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useToast } from '@/hooks/useToast';
import { paystackService, type PaystackBank } from '@/services/paystackService';

const tk = {
  bg:       '#0F0703',
  panel:    'rgba(255,255,255,0.03)',
  border:   'rgba(255,255,255,0.08)',
  text:     '#FFFFFF',
  textSec:  'rgba(255,255,255,0.65)',
  textTer:  'rgba(255,255,255,0.40)',
  primary:  '#FF6803',
  mint:     '#30FFAC',
  danger:   '#ef4444',
  inputBg:  'rgba(0,0,0,0.25)',
};

export default function PayoutSetupPage() {
  const { go } = useAppNav();
  const { user, organization, refreshSession } = useMultiTenantAuth();
  const toast = useToast();

  const org = organization as unknown as Record<string, unknown> | null;
  const initialConnected = Boolean(org?.paystack_subaccount_code);

  const [banks, setBanks] = useState<PaystackBank[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(true);
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [connected, setConnected] = useState(initialConnected);
  const [connectedName, setConnectedName] = useState<string | null>((org?.paystack_account_name as string) || null);
  const [editing, setEditing] = useState(!initialConnected);

  const connectedBankName = useMemo(() => {
    const code = org?.paystack_settlement_bank as string | undefined;
    return banks.find((b) => b.code === code)?.name || code || null;
  }, [banks, org]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoadingBanks(true);
      const res = await paystackService.listBanks();
      if (!active) return;
      if (res.ok) setBanks(res.banks);
      else toast?.error?.(res.error || 'Could not load banks.');
      setLoadingBanks(false);
    })();
    return () => { active = false; };
  }, [toast]);

  const handleSave = useCallback(async () => {
    if (!user?.id) { toast?.error?.('Sign in required.'); return; }
    if (!bankCode) { toast?.error?.('Please choose your bank.'); return; }
    const digits = accountNumber.replace(/\D/g, '');
    if (digits.length !== 10) { toast?.error?.('Account number must be 10 digits.'); return; }

    setSaving(true);
    const res = await paystackService.setupSubaccount({
      memberId: user.id,
      bankCode,
      accountNumber: digits,
    });
    setSaving(false);

    if (!res.ok) { toast?.error?.(res.error || 'Could not set up the payout account.'); return; }

    setConnected(true);
    setConnectedName(res.account_name || null);
    setEditing(false);
    toast?.success?.(`Payout account connected: ${res.account_name || 'verified'}.`);
    void refreshSession();
  }, [user?.id, bankCode, accountNumber, toast, refreshSession]);

  return (
    <div className="min-h-screen px-4 sm:px-6 py-6" style={{ background: tk.bg }}>
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <button
          onClick={() => go('/admin/dashboard')}
          className="inline-flex items-center gap-1.5 text-sm mb-5"
          style={{ color: tk.textSec }}
        >
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </button>

        <div className="flex items-center gap-2 mb-1">
          <Banknote className="w-5 h-5" style={{ color: tk.primary }} />
          <h1 className="text-xl font-bold" style={{ color: tk.text }}>Payout account</h1>
        </div>
        <p className="text-sm mb-6" style={{ color: tk.textSec }}>
          Where your collected dues are settled. Until this is set, payments are held in the platform account.
        </p>

        {/* Connected state */}
        {connected && !editing && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-5 mb-5"
            style={{ background: `${tk.mint}10`, border: `1px solid ${tk.mint}40` }}
          >
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-5 h-5" style={{ color: tk.mint }} />
              <span className="font-bold" style={{ color: tk.text }}>Connected</span>
            </div>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt style={{ color: tk.textTer }}>Account name</dt><dd style={{ color: tk.text }}>{connectedName || '—'}</dd></div>
              <div className="flex justify-between"><dt style={{ color: tk.textTer }}>Bank</dt><dd style={{ color: tk.text }}>{connectedBankName || '—'}</dd></div>
              <div className="flex justify-between"><dt style={{ color: tk.textTer }}>Account number</dt><dd style={{ color: tk.text }}>{(org?.paystack_account_number as string) || '—'}</dd></div>
            </dl>
            <p className="text-xs mt-3 flex items-center gap-1.5" style={{ color: tk.textTer }}>
              <ShieldCheck className="w-3.5 h-3.5" style={{ color: tk.mint }} />
              Dues now settle here automatically; the platform keeps only its fee.
            </p>
            <button
              onClick={() => setEditing(true)}
              className="mt-4 text-xs font-semibold underline"
              style={{ color: tk.textSec }}
            >
              Change bank account
            </button>
          </motion.div>
        )}

        {/* Form */}
        {editing && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-5"
            style={{ background: tk.panel, border: `1px solid ${tk.border}` }}
          >
            <label className="block text-xs font-semibold mb-1.5" style={{ color: tk.textSec }}>Bank</label>
            <select
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
              disabled={loadingBanks || saving}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none mb-4"
              style={{ background: tk.inputBg, border: `1px solid ${tk.border}`, color: tk.text }}
            >
              <option value="">{loadingBanks ? 'Loading banks…' : 'Select your bank'}</option>
              {banks.map((b) => (
                <option key={b.code} value={b.code} style={{ color: '#000' }}>{b.name}</option>
              ))}
            </select>

            <label className="block text-xs font-semibold mb-1.5" style={{ color: tk.textSec }}>Account number</label>
            <input
              inputMode="numeric"
              maxLength={10}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit account number"
              disabled={saving}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none mb-2 font-mono tracking-wide"
              style={{ background: tk.inputBg, border: `1px solid ${tk.border}`, color: tk.text }}
            />
            <p className="text-[11px] mb-4 flex items-center gap-1.5" style={{ color: tk.textTer }}>
              <AlertTriangle className="w-3 h-3" />
              We verify the account with your bank before saving — make sure it's correct.
            </p>

            <div className="flex items-center gap-2">
              <motion.button
                onClick={handleSave}
                disabled={saving || loadingBanks}
                whileTap={!saving ? { scale: 0.98 } : undefined}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold disabled:opacity-50"
                style={{ background: tk.primary, color: '#1A0E09' }}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {saving ? 'Verifying…' : 'Verify & connect'}
              </motion.button>
              {connected && (
                <button
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="px-4 py-3 rounded-xl text-sm font-bold"
                  style={{ background: 'rgba(255,255,255,0.04)', color: tk.textSec, border: `1px solid ${tk.border}` }}
                >
                  Cancel
                </button>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
