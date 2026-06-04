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
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Banknote, CheckCircle2, Loader2, ShieldCheck, AlertTriangle, Building2 } from 'lucide-react';
import { useAppNav } from '@/hooks/useAppNav';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useActiveRole } from '@/hooks/useActiveRole';
import { useToast } from '@/hooks/useToast';
import { paystackService, type PaystackBank } from '@/services/paystackService';
import { supabase } from '@/config/supabase';
import ProfessionalDropdown from '@/components/ui/ProfessionalDropdown';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';

// Theme-aware token builder. Replaces the module-level dark-only
// constant so the page paints correctly in light mode too.
function buildPayoutTokens(theme: 'light' | 'dark') {
  const dt = getDashboardTokens(theme);
  const isLight = theme === 'light';
  return {
    bg:      dt.bg,
    panel:   dt.card,
    border:  dt.cardBorder,
    text:    dt.text,
    textSec: dt.textSec,
    textTer: dt.textTer,
    primary: dt.primary,
    mint:    dt.mint,
    danger:  dt.danger,
    inputBg: isLight ? '#FFFFFF' : 'rgba(0,0,0,0.25)',
  };
}

export default function PayoutSetupPage() {
  const { go } = useAppNav();
  const { user, organization, refreshSession } = useMultiTenantAuth();
  const toast = useToast();
  const { theme } = useTheme();
  const tk = useMemo(() => buildPayoutTokens(theme), [theme]);

  // Tier-aware: when ?groupId is on the URL, this page configures
  // THAT group's subaccount instead of the org's. Used by the
  // CreateDuePage "set up payout first" gate, the dept-exec
  // dashboard, and the class-rep dashboard.
  //
  // If no ?groupId is present, we look at the user's ACTIVE role.
  //   • org-scope active role        → configure the org's payout
  //   • group / unit-scope active    → configure THAT scope's group
  //   • no exec active role          → fall back to org (legacy)
  //
  // Without this fallback, a class rep clicking "Payout Account" in
  // the admin dropdown would land on the org's payout — which they
  // typically can't edit AND isn't the bucket they collect to.
  const [searchParams] = useSearchParams();
  const { activeRole } = useActiveRole({
    orgId: organization?.id,
    memberId: user?.id,
  });
  const groupId = useMemo(() => {
    const fromUrl = searchParams.get('groupId');
    if (fromUrl) return fromUrl;
    if (activeRole?.kind !== 'exec') return null;
    if (activeRole.scopeLevel === 'org') return null;
    return activeRole.groupId ?? null;
  }, [searchParams, activeRole?.kind, activeRole?.scopeLevel, activeRole?.groupId]);

  const [groupCtx, setGroupCtx] = useState<{
    id: string; name: string; kind: string;
    subaccount_code: string | null;
    account_name: string | null;
    account_number: string | null;
    settlement_bank: string | null;
  } | null>(null);

  // Whenever we have a groupId, resolve that group's identity (name,
  // kind) first so the "Configuring payout for X" banner can render
  // immediately. Then opportunistically pull the payout columns added
  // by mig 092. Splitting it like this keeps the page useful even
  // when the migration hasn't been applied yet — the banner shows the
  // tier name, the connected-state is just "not configured."
  useEffect(() => {
    if (!groupId) { setGroupCtx(null); return; }
    let cancelled = false;
    (async () => {
      // 1) Basic identity — columns guaranteed to exist on every env.
      const { data: baseData } = await supabase
        .from('organization_groups')
        .select('id, name, kind')
        .eq('id', groupId)
        .maybeSingle();
      if (cancelled || !baseData) return;
      const base = {
        id:              baseData.id as string,
        name:            (baseData.name as string) || 'this group',
        kind:            ((baseData.kind as string) || 'group').toLowerCase(),
        subaccount_code: null as string | null,
        account_name:    null as string | null,
        account_number:  null as string | null,
        settlement_bank: null as string | null,
      };
      // Show the banner with name/kind RIGHT NOW.
      setGroupCtx(base);

      // 2) Try to enrich with payout fields. If mig 092 isn't applied
      // yet (or the columns are missing on this env), .select() throws
      // a 42703 error — we catch it and leave the base state in place.
      // Either way the banner already displays correctly.
      try {
        const { data: payoutData, error } = await supabase
          .from('organization_groups')
          .select('paystack_subaccount_code, account_name, account_number, bank_code')
          .eq('id', groupId)
          .maybeSingle();
        if (cancelled) return;
        if (!error && payoutData) {
          setGroupCtx({
            ...base,
            subaccount_code: (payoutData.paystack_subaccount_code as string | null) ?? null,
            account_name:    (payoutData.account_name as string | null) ?? null,
            account_number:  (payoutData.account_number as string | null) ?? null,
            settlement_bank: (payoutData.bank_code as string | null) ?? null,
          });
        }
      } catch {
        // Mig 092 not applied — base state already set, just move on.
      }
    })();
    return () => { cancelled = true; };
  }, [groupId]);

  const org = organization as unknown as Record<string, unknown> | null;

  // Pick the right source-of-truth for the "are we already connected?"
  // banner based on whether we're in tier mode or org mode.
  const initialConnected = groupId
    ? Boolean(groupCtx?.subaccount_code)
    : Boolean(org?.paystack_subaccount_code);

  const [banks, setBanks] = useState<PaystackBank[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(true);
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [connected, setConnected] = useState(initialConnected);
  const [connectedName, setConnectedName] = useState<string | null>(
    groupId ? (groupCtx?.account_name ?? null) : ((org?.paystack_account_name as string) || null),
  );
  const [editing, setEditing] = useState(!initialConnected);

  // When the tier context resolves async, re-seed the "connected" UI.
  useEffect(() => {
    if (!groupId) return;
    const c = Boolean(groupCtx?.subaccount_code);
    setConnected(c);
    setConnectedName(groupCtx?.account_name ?? null);
    setEditing(!c);
  }, [groupId, groupCtx?.subaccount_code, groupCtx?.account_name]);

  const connectedBankName = useMemo(() => {
    const code = groupId
      ? groupCtx?.settlement_bank ?? null
      : (org?.paystack_settlement_bank as string | undefined) ?? null;
    return banks.find((b) => b.code === code)?.name || code || null;
  }, [banks, org, groupId, groupCtx?.settlement_bank]);

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
      groupId: groupId || null,
    });
    setSaving(false);

    if (!res.ok) { toast?.error?.(res.error || 'Could not set up the payout account.'); return; }

    setConnected(true);
    setConnectedName(res.account_name || null);
    setEditing(false);
    // Update local group context so the "Connected" panel reflects
    // the new state without a full refresh.
    if (groupId && groupCtx) {
      setGroupCtx({
        ...groupCtx,
        subaccount_code: res.subaccount_code || groupCtx.subaccount_code,
        account_name:    res.account_name || groupCtx.account_name,
        account_number:  digits,
        settlement_bank: bankCode,
      });
    }
    toast?.success?.(
      groupId
        ? `Payout connected for ${groupCtx?.name ?? 'this tier'}: ${res.account_name || 'verified'}.`
        : `Payout account connected: ${res.account_name || 'verified'}.`,
    );
    // Org-wide flow refreshes the session because org fields move
    // into the auth context. Tier-scoped flow doesn't need that.
    if (!groupId) void refreshSession();
  }, [user?.id, bankCode, accountNumber, toast, refreshSession, groupId, groupCtx]);

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
          <h1 className="text-xl font-bold" style={{ color: tk.text }}>
            {groupId ? 'Tier payout account' : 'Payout account'}
          </h1>
        </div>
        {/* Context: when configuring a tier (class / dept / faculty),
            spell out which one — no ambiguity about which bucket
            money will land in. */}
        {groupId && groupCtx && (
          <div
            className="mb-4 rounded-xl px-3 py-2 flex items-center gap-2 text-[12px]"
            style={{
              background: `${tk.primary}12`,
              border: `1px solid ${tk.primary}30`,
              color: tk.textSec,
            }}
          >
            <Building2 className="w-4 h-4 shrink-0" style={{ color: tk.primary }} />
            <span>
              Configuring payout for{' '}
              <span className="font-bold" style={{ color: tk.text }}>{groupCtx.name}</span>{' '}
              <span style={{ color: tk.textTer }}>({groupCtx.kind})</span>. Each tier
              collects to its own bank — no cascading.
            </span>
          </div>
        )}
        <p className="text-sm mb-6" style={{ color: tk.textSec }}>
          {groupId
            ? "Where THIS tier's collected dues are settled. Until this is set, no one can publish dues here."
            : 'Where your collected dues are settled. Until this is set, payments are held in the platform account.'}
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
              <div className="flex justify-between"><dt style={{ color: tk.textTer }}>Account number</dt><dd style={{ color: tk.text }}>{
                groupId
                  ? (groupCtx?.account_number ? `••••••${groupCtx.account_number.slice(-4)}` : '—')
                  : ((org?.paystack_account_number as string) || '—')
              }</dd></div>
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
            <div className="mb-4">
              <label className="block text-xs font-semibold mb-1.5" style={{ color: tk.textSec }}>Bank</label>
              <ProfessionalDropdown
                value={bankCode}
                onChange={(v) => setBankCode(Array.isArray(v) ? (v[0] ?? '') : v)}
                placeholder={loadingBanks ? 'Loading banks…' : 'Select your bank'}
                searchable
                disabled={loadingBanks || saving}
                options={banks.map((b) => ({
                  value: b.code,
                  label: b.name,
                }))}
              />
            </div>

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
