/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState, useEffect, useRef, useMemo } from 'react';
import { motion} from 'framer-motion';
import { 
  User, 
  Mail, 
  Phone, 
  Calendar,
  BookOpen,
  Edit2,
  Save,
  X,
  ArrowLeft,
  Shield,
  Wallet,
  Lock,
  CheckCircle2,
  Sparkles,
  AlertCircle,
  GraduationCap,
  Hash,
  KeyRound,
  History,
  ChevronRight,
  Camera,
  Building2,
  Upload,
  Loader2,
  Trash2,
  AlertTriangle,
  ShieldOff,
  LogOut,
} from 'lucide-react';
import Footer from '@/components/Footer';
import { gradients } from '@/config/colors';
import { useThemeTokens } from '@/hooks/useThemeTokens';
import { useAuth } from '@/hooks/useAppAuth';
import {  } from 'react-router-dom';
import { useAppNav } from '@/hooks/useAppNav';
import GlassCard from '@/components/ui/GlassCard';
import HandoverButton from '@/components/handover/HandoverButton';
import Input from '@/components/ui/Input';
import CustomButton from '@/components/ui/CustomButton';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { PrivacyMask } from '@/components/ui/PrivacyMask';
import paymentService from '@/services/paymentService';
import type { PaymentType, Payment } from '@/types';
import PageWrapper from '@/components/ui/PageWrapper';
import { ProfileSkeleton } from '@/components/ui/Skeleton';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { organizationService } from '@/services/organizationService';
import { supabase } from '@/config/supabase';


// ── Delete Account Section ────────────────────────────────────────────────────
// Implements the full decision tree from migration 141:
//   • Platform admin → blocked (manual support)
//   • Mid-handover outgoing → blocked (finish handover)
//   • Active verified exec role(s) → blocked (hand over first)
//   • Sole founder, no history → hard delete (account + orphan group archived)
//   • Has financial/receipt history → soft delete + anonymize
//   • No history → hard delete

type DeletionResult =
  | { ok: false; error: string }   // 'Member not found.' or already-deleted — no `code` at all
  | { ok: false; code: 'platform_admin_blocked'; error: string }
  | { ok: false; code: 'handover_in_progress'; error: string; handovers?: Array<{ handover_id: string; role_label: string; status: string }> }
  | { ok: false; code: 'active_role_blocked'; error: string; roles?: Array<{ admin_id: string; role: string; role_label: string; scope_level: string; group_id: string; group_name: string; group_kind: string }> }
  | { ok: true; deletion_path: 'hard' | 'soft' | 'hard_with_orphan_group'; had_transaction_history: boolean; confirmation_token: string; expires_in_hours?: number };

function DeleteAccountSection({ memberId }: { memberId: string }) {
  const t = useThemeTokens();
  const [phase, setPhase] = useState<'idle' | 'confirm' | 'loading' | 'result'>('idle');
  const [result, setResult] = useState<DeletionResult | null>(null);
  const [typed, setTyped] = useState('');
  const CONFIRM_PHRASE = 'delete my account';

  const requestDeletion = async () => {
    setPhase('loading');
    try {
      const { data, error } = await supabase.rpc('request_account_deletion', {
        p_member_id: memberId,
      });
      if (error) throw error;
      const deletionResult = data as DeletionResult;

      // Every blocked path already explains itself without an email —
      // only the success path needs the confirmation link sent.
      if (deletionResult.ok) {
        const emailRes = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'request_deletion_email',
            memberId,
            token: deletionResult.confirmation_token,
          }),
        });
        const emailData = await emailRes.json().catch(() => ({}));
        if (!emailRes.ok || !emailData.ok) {
          setResult({
            ok: false,
            error: emailData.error || 'Your deletion request was created, but we could not send the confirmation email. Please try again.',
          });
          setPhase('result');
          return;
        }
      }

      setResult(deletionResult);
      setPhase('result');
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      });
      setPhase('result');
    }
  };

  // ── Idle state — the entry card ──
  if (phase === 'idle') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2 }}
        className="rounded-2xl overflow-hidden"
        style={{ border: `1px solid ${t.danger}30`, background: `${t.danger}06` }}
      >
        <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: `1px solid ${t.danger}20` }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${t.danger}15`, color: t.danger }}>
            <ShieldOff size={17} />
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{ color: t.text }}>Danger zone</h3>
            <p className="text-[11px]" style={{ color: t.textSec }}>Irreversible account actions</p>
          </div>
        </div>
        <div className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: t.text }}>Delete my account</p>
            <p className="text-[11px] mt-0.5 leading-5" style={{ color: t.textSec }}>
              Permanently remove your access. Financial records are retained in anonymized form as required by law.
            </p>
          </div>
          <motion.button
            onClick={() => setPhase('confirm')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="shrink-0 px-4 py-2 rounded-xl text-xs font-bold"
            style={{ background: `${t.danger}15`, color: t.danger, border: `1px solid ${t.danger}30` }}
          >
            Delete account
          </motion.button>
        </div>
      </motion.div>
    );
  }

  // ── Confirm phase — type to confirm ──
  if (phase === 'confirm') {
    const ready = typed.toLowerCase() === CONFIRM_PHRASE;
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl p-5 space-y-4"
        style={{ border: `1px solid ${t.danger}40`, background: `${t.danger}08` }}
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${t.danger}18`, color: t.danger }}>
            <AlertTriangle size={17} />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: t.danger }}>Are you absolutely sure?</p>
            <p className="text-[12px] mt-1 leading-5" style={{ color: t.textSec }}>
              This will check your account status and either permanently remove your account
              or anonymize your personal data while preserving financial records for audit compliance.
              <strong style={{ color: t.text }}> This cannot be undone.</strong>
            </p>
          </div>
        </div>

        <div
          className="rounded-xl p-3 text-[11px] leading-5"
          style={{ background: `${t.amber}10`, border: `1px solid ${t.amber}25`, color: t.textSec }}
        >
          <strong style={{ color: t.amber }}>Before you delete:</strong> If you hold an exec role (class rep, treasurer, etc.),
          you must hand it over first. If you have payment history, your personal details
          will be anonymized but transaction records stay to keep the org's books accurate.
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: t.textSec }}>
            Type <span style={{ color: t.danger, fontStyle: 'italic' }}>"{CONFIRM_PHRASE}"</span> to continue
          </label>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-colors"
            style={{
              background: t.card,
              border: `1px solid ${ready ? t.danger + '60' : t.cardBorder}`,
              color: t.text,
            }}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <motion.button
            onClick={() => { setPhase('idle'); setTyped(''); }}
            whileTap={{ scale: 0.97 }}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: t.card, color: t.textSec, border: `1px solid ${t.cardBorder}` }}
          >
            Cancel
          </motion.button>
          <motion.button
            onClick={requestDeletion}
            disabled={!ready}
            whileHover={ready ? { scale: 1.01 } : undefined}
            whileTap={ready ? { scale: 0.98 } : undefined}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ background: ready ? t.danger : `${t.danger}30`, color: '#fff' }}
          >
            <Trash2 size={14} />
            Continue
          </motion.button>
        </div>
      </motion.div>
    );
  }

  // ── Loading ──
  if (phase === 'loading') {
    return (
      <div className="rounded-2xl p-8 flex flex-col items-center gap-3" style={{ border: `1px solid ${t.cardBorder}`, background: t.card }}>
        <Loader2 size={24} className="animate-spin" style={{ color: t.primary }} />
        <p className="text-sm" style={{ color: t.textSec }}>Checking your account status…</p>
      </div>
    );
  }

  // ── Result ──
 // ── Result ──
  if (phase === 'result' && result) {
    // ── BLOCKED: member not found / already deleted (no code at all) ──
    // Must run BEFORE any check that accesses result.code, since this
    // is the one ok:false member that doesn't have that property —
    // narrowing it out here is what lets every check below safely
    // access .code without TypeScript complaining it might be missing.
    if (!result.ok && !('code' in result)) {
      return (
        <ResultCard
          icon={<AlertCircle size={20} />}
          color={t.danger}
          title="Could not process request"
          body={result.error}
          onReset={() => setPhase('idle')}
          t={t}
        />
      );
    }

    // ── BLOCKED: platform admin ──
    if (!result.ok && result.code === 'platform_admin_blocked') {
      return (
        <ResultCard
          icon={<Shield size={20} />}
          color={t.amber}
          title="Platform admin accounts"
          body="Platform admin accounts cannot be self-deleted. Contact the Payvexo team directly to proceed."
          onReset={() => setPhase('idle')}
          t={t}
        />
      );
    }

    // ── BLOCKED: mid-handover ──
    if (!result.ok && result.code === 'handover_in_progress') {
      return (
        <ResultCard
          icon={<LogOut size={20} />}
          color={t.amber}
          title="Handover in progress"
          body={result.error}
          detail="Your successor hasn't been verified yet — you still hold the role. Wait for the handover to complete, then return here."
          onReset={() => setPhase('idle')}
          t={t}
        />
      );
    }

    // ── BLOCKED: active exec role(s) ──
    if (!result.ok && result.code === 'active_role_blocked') {
      const roles = result.roles;
      return (
        <ResultCard
          icon={<ShieldOff size={20} />}
          color={t.danger}
          title="Hand over your role first"
          body="You hold an active exec role. If you delete your account without handing over, the members in your tier lose access to dues collection and payout management."
          detail={roles?.map(r => `${r.role_label || 'Exec'} — ${r.group_name || 'your group'}`).join('\n')}
          action={{ label: 'Go to handover', onClick: () => window.location.href = '#handover' }}
          onReset={() => setPhase('idle')}
          t={t}
        />
      );
    }

    // ── SUCCESS: deletion queued ──
    const isSoft = result.deletion_path === 'soft';
    const isHardOrphan = result.deletion_path === 'hard_with_orphan_group';

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl p-5 space-y-4"
        style={{ border: `1px solid ${t.mint}30`, background: `${t.mint}06` }}
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${t.mint}18`, color: t.mint }}>
            <CheckCircle2 size={17} />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: t.text }}>Confirmation email sent</p>
            <p className="text-[12px] mt-1 leading-5" style={{ color: t.textSec }}>
              Check your email for a confirmation link. It expires in 24 hours. Click it to finalize deletion.
            </p>
          </div>
        </div>

        <div
          className="rounded-xl p-3 space-y-1.5 text-[11px]"
          style={{ background: t.card, border: `1px solid ${t.cardBorder}` }}
        >
          <p className="font-bold uppercase tracking-wider text-[10px]" style={{ color: t.textTer }}>What will happen</p>
          {isSoft ? (
            <>
              <p style={{ color: t.textSec }}>✓ Your name, email, and phone will be permanently removed</p>
              <p style={{ color: t.textSec }}>✓ Your login access will be revoked immediately</p>
              <p style={{ color: t.textSec }}>· Payment records stay as anonymous entries — the org's books stay accurate</p>
              <p style={{ color: t.textSec }}>· Receipt images are preserved for audit compliance</p>
            </>
          ) : (
            <>
              <p style={{ color: t.textSec }}>✓ Your account and all personal data will be permanently deleted</p>
              {isHardOrphan && <p style={{ color: t.textSec }}>✓ The group you founded (with no other members) will be archived</p>}
              <p style={{ color: t.textSec }}>✓ Your login access will be revoked immediately</p>
            </>
          )}
        </div>

        <motion.button
          onClick={() => { setPhase('idle'); setTyped(''); setResult(null); }}
          whileTap={{ scale: 0.97 }}
          className="w-full py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: t.card, color: t.textSec, border: `1px solid ${t.cardBorder}` }}
        >
          Back to profile
        </motion.button>
      </motion.div>
    );
  }

  return null;
}

function ResultCard({
  icon, color, title, body, detail, action, onReset, t,
}: {
  icon: React.ReactNode;
  color: string;
  title: string;
  body: string;
  detail?: string;
  action?: { label: string; onClick: () => void };
  onReset: () => void;
  t: ReturnType<typeof useThemeTokens>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-2xl p-5 space-y-3"
      style={{ border: `1px solid ${color}30`, background: `${color}06` }}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}18`, color }}>
          {icon}
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: t.text }}>{title}</p>
          <p className="text-[12px] mt-1 leading-5" style={{ color: t.textSec }}>{body}</p>
        </div>
      </div>
      {detail && (
        <div
          className="rounded-xl px-3 py-2.5 text-[11px] leading-5 whitespace-pre-line"
          style={{ background: t.card, border: `1px solid ${t.cardBorder}`, color: t.textSec }}
        >
          {detail}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <motion.button
          onClick={onReset}
          whileTap={{ scale: 0.97 }}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: t.card, color: t.textSec, border: `1px solid ${t.cardBorder}` }}
        >
          Go back
        </motion.button>
        {action && (
          <motion.button
            onClick={action.onClick}
            whileTap={{ scale: 0.97 }}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold"
            style={{ background: `${color}18`, color, border: `1px solid ${color}35` }}
          >
            {action.label}
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

export default function ProfilePage() {
  const t = useThemeTokens();
  const { user, updateProfile, loading: authLoading } = useAuth();
  const { organization, group, refreshSession } = useMultiTenantAuth();
  const { go: navigate } = useAppNav();

  // Only an ORG-SCOPE admin (president / treasurer / founder steward)
  // may touch the org logo — matches the mig 117 RLS that gates the
  // organizations UPDATE. A class rep or dept exec is an admin, but NOT
  // for the org's identity, so we don't even show them the control.
  const isOrgAdmin = ((user as { admin_records?: Array<{ is_active?: boolean; scope_level?: string }> })?.admin_records || [])
    .some((a) => a.is_active !== false && a.scope_level === 'org');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [paymentSummary, setPaymentSummary] = useState({
    totalPaid: 0,
    totalOutstanding: 0,
    totalPending: 0,
    completedPayments: 0,
    pendingPayments: 0,
  });
  // Dismissed optional dues (localStorage key matches Dashboard) - read-only here
  const dismissedDues: string[] = (() => {
    try {
      const stored = localStorage.getItem(`dismissedDues_${user?.id}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  })();

  // If the user's `level` is not populated in the mapped auth user, try fetching it
  // directly from the members table so the Profile page can show it.
  const [fetchedLevel, setFetchedLevel] = useState<string | null>(null);
  const academicInfo = ((organization as any)?.custom_settings as Record<string, unknown>)?.academic as { academic_level?: string } | undefined;
  const groupPrimary = group?.levels && group.levels.length > 0 ? organizationService.canonicalizeLevel(group.levels[0]) : null;
  useEffect(() => {
    const fetchLevel = async () => {
      if (!user?.id) return;
      if (user.level) return; // already present
      try {
        const { data } = await supabase.from('organization_members').select('level').eq('id', user.id).single();
        if (data && (data as any).level) setFetchedLevel((data as any).level as string);
      } catch {
        // best-effort
      }
    };
    fetchLevel();
  }, [user?.id, user?.level]);
  const [formData, setFormData] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    section: user?.section || '',
  });

  // Profile completeness — a gentle nudge to finish the profile. Drawn
  // from the live `user` fields (not formData, which resets on edit).
  const completeness = useMemo(() => {
    const fields = [
      { label: 'Full name', val: user?.full_name },
      { label: 'Email',     val: user?.email },
      { label: 'Phone',     val: user?.phone },
      { label: 'Section',   val: user?.section },
    ];
    const missing = fields.filter((f) => !String(f.val ?? '').trim()).map((f) => f.label);
    const pct = Math.round(((fields.length - missing.length) / fields.length) * 100);
    return { pct, missing };
  }, [user?.full_name, user?.email, user?.phone, user?.section]);

  // Org logo state
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [orgLogoUrl, setOrgLogoUrl] = useState(organization?.logo_url || '');
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoMessage, setLogoMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setOrgLogoUrl(organization?.logo_url || '');
  }, [organization?.logo_url]);

  const handleLogoUpload = async (file: File) => {
    if (!organization?.id) return;
    if (!file.type.startsWith('image/')) {
      setLogoMessage({ type: 'error', text: 'Please select an image file (PNG, JPG, etc.)' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoMessage({ type: 'error', text: 'Image must be smaller than 2MB' });
      return;
    }

    try {
      setLogoUploading(true);
      setLogoMessage(null);

      const fileExt = file.name.split('.').pop() || 'png';
      const fileName = `org_${organization.id}_${Date.now()}.${fileExt}`;
      const filePath = `org-logos/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('profile-images')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('profile-images')
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;

      // Update organization record
      const { error: updateError } = await supabase
        .from('organizations')
        .update({ logo_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', organization.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setOrgLogoUrl(publicUrl);
      setLogoMessage({ type: 'success', text: 'Organization logo updated successfully!' });

      // Refresh session to update the org data in context
      try { await refreshSession(); } catch { /* best effort */ }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to upload logo';
      setLogoMessage({ type: 'error', text: msg });
    } finally {
      setLogoUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!organization?.id) return;
    try {
      setLogoUploading(true);
      setLogoMessage(null);

      const { error } = await supabase
        .from('organizations')
        .update({ logo_url: null, updated_at: new Date().toISOString() })
        .eq('id', organization.id);

      if (error) throw new Error(error.message);

      setOrgLogoUrl('');
      setLogoMessage({ type: 'success', text: 'Organization logo removed' });
      try { await refreshSession(); } catch { /* best effort */ }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to remove logo';
      setLogoMessage({ type: 'error', text: msg });
    } finally {
      setLogoUploading(false);
    }
  };

  // Fetch payment summary
  useEffect(() => {
    const fetchPaymentSummary = async () => {
      if (!user?.id) return;

      try {
        setPageLoading(true);
        const summary = await paymentService.getPaymentSummary(user.id);

        // Also fetch active payment types + payments to determine dismissed optional unpaid dues
        const [activeTypes, payments] = await Promise.all([
          paymentService.getActivePaymentTypesForStudent(user.id),
          paymentService.getStudentPayments(user.id),
        ]);

        // Compute unpaid optional dues that are dismissed
        const unpaid = (activeTypes || []).map((pt: PaymentType) => {
          const paymentsForType = (payments || []).filter((p: Payment) => p.payment_type_id === pt.id);
          const paid = paymentsForType.filter((p) => p.status === 'approved' && !p.transaction_ref?.startsWith('WAIVED-')).reduce((s, p) => s + Number(p.amount || 0), 0) || 0;
          const isWaived = paymentsForType.some((p) => p.status === 'approved' && p.transaction_ref?.startsWith('WAIVED-'));
          const outstanding = isWaived ? 0 : Math.max(0, Number(pt.amount || 0) - paid);
          return { id: pt.id, totalDue: outstanding, is_mandatory: pt.is_mandatory };
        });

        const dismissedUnpaidSum = unpaid
          .filter(u => !u.is_mandatory && dismissedDues.includes(u.id))
          .reduce((s, u) => s + (Number(u.totalDue || 0)), 0);

        setPaymentSummary({
          ...summary,
          totalOutstanding: Math.max(0, Number(summary.totalOutstanding || 0) - dismissedUnpaidSum),
        });
      } catch (error) {
        // Error handling without console log
      } finally {
        setPageLoading(false);
      }
    };

    fetchPaymentSummary();
  }, [user?.id, dismissedDues]);

  const handleSave = async () => {
    try {
      setLoading(true);
      setMessage(null);
      await updateProfile(formData);
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
      setIsEditing(false);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update profile. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      full_name: user?.full_name || '',
      email: user?.email || '',
      phone: user?.phone || '',
      section: user?.section || '',
    });
    setMessage(null);
    setIsEditing(false);
  };

  // Show skeleton while loading
  if (authLoading || (!user && pageLoading)) {
    return (
      <PageWrapper noPadding style={{ background: t.bg, backgroundImage: t.bgWash, color: t.text }}>
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
          {/* Header Skeleton */}
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 rounded-lg animate-pulse" style={{ background: t.cardBorder }} />
                <div>
                  <div className="h-8 w-32 rounded-lg animate-pulse mb-2" style={{ background: t.cardBorder }} />
                  <div className="h-4 w-64 rounded-lg animate-pulse" style={{ background: t.cardHover }} />
                </div>
              </div>
              <div className="h-10 w-32 rounded-lg animate-pulse" style={{ background: t.cardBorder }} />
            </div>
          </div>
          <ProfileSkeleton />
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper noPadding style={{ background: t.bg, backgroundImage: t.bgWash, color: t.text }}>
      {/* Main Content */}
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        {/* Header */}
        <motion.div
          className="mb-6 sm:mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <motion.button
                onClick={() => navigate('/dashboard')}
                className="flex items-center justify-center px-3 py-2 rounded-lg transition-all duration-300 outline-1"
                style={{ 
                  color: t.textSec,
                  outlineColor: t.primary,
                  background: 'rgba(255, 107, 53, 0.1)'
                }}
                whileHover={{ scale: 1.05, background: 'rgba(255, 107, 53, 0.2)' }}
                whileTap={{ scale: 0.95 }}
              >
                <ArrowLeft size={20} style={{ color: t.primary }} />
              </motion.button>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold">My Profile</h1>
                <p className="text-sm" style={{ color: t.textSec }}>
                  Manage your personal information and view payment summary
                </p>
              </div>
            </div>

            {!isEditing ? (
              <CustomButton
                variant="primary"
                size="sm"
                onClick={() => setIsEditing(true)}
                icon={Edit2}
                className="w-full sm:w-auto"
              >
                Edit Profile
              </CustomButton>
            ) : (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <CustomButton
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  icon={X}
                  className="flex-1 sm:flex-none"
                >
                  Cancel
                </CustomButton>
                <CustomButton
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  loading={loading}
                  icon={Save}
                  className="flex-1 sm:flex-none"
                >
                  Save Changes
                </CustomButton>
              </div>
            )}
          </div>

          {/* Profile completeness — modern progress nudge */}
          {completeness.pct < 100 && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-4"
              style={{ background: t.card, border: `1px solid ${t.cardBorder}` }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles size={15} style={{ color: t.primary }} />
                  <span className="text-sm font-bold" style={{ color: t.text }}>
                    Complete your profile
                  </span>
                </div>
                <span className="text-sm font-extrabold tabular-nums" style={{ color: t.primary }}>
                  {completeness.pct}%
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: t.cardBorder }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${completeness.pct}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{ background: t.gradOrange ?? t.primary }}
                />
              </div>
              {completeness.missing.length > 0 && (
                <p className="text-[12px] mt-2" style={{ color: t.textSec }}>
                  Add your{' '}
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="font-semibold underline-offset-2 hover:underline"
                    style={{ color: t.primary }}
                  >
                    {completeness.missing.join(', ').toLowerCase()}
                  </button>{' '}
                  to finish.
                </p>
              )}
            </motion.div>
          )}

          {/* Success/Error Message */}
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-4 rounded-xl flex items-center gap-3"
              style={{
                background: message.type === 'success' 
                  ? 'rgba(34, 197, 94, 0.1)' 
                  : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${message.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
              }}
            >
              {message.type === 'success' ? (
                <CheckCircle2 size={20} className="text-green-400" />
              ) : (
                <AlertCircle size={20} className="text-red-400" />
              )}
              <p className={`text-sm font-medium ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {message.text}
              </p>
            </motion.div>
          )}
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Left Column - Profile Card */}
          <motion.div
            className="lg:col-span-1"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <GlassCard className="text-center">
              {/* Avatar */}
              <motion.div
                className="w-24 h-24 sm:w-32 sm:h-32 mx-auto mb-4 sm:mb-6 rounded-full flex items-center justify-center text-3xl sm:text-4xl font-bold shadow-lg"
                style={{ background: gradients.primary }}
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                {user?.full_name?.charAt(0).toUpperCase() || 'U'}
              </motion.div>

              <h2 className="text-xl sm:text-2xl font-bold mb-1">{user?.full_name}</h2>
              <p className="text-sm mb-4" style={{ color: t.textSec }}>
                {user?.reg_number}
              </p>

              {/* Role Badge */}
              <div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6"
                style={{ background: `${t.mint}20`, border: `1px solid ${t.mint}40` }}
              >
                <Shield size={16} style={{ color: t.mint }} />
                <span className="text-sm font-medium" style={{ color: t.mint }}>
                  Student
                </span>
              </div>

              {/* Quick Stats */}
              <div className="space-y-3 pt-6 border-t" style={{ borderColor: t.cardBorder }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: t.textSec }}>Status</span>
                  <span className="text-sm font-medium px-3 py-1 rounded-full" style={{ 
                    background: 'rgba(34, 197, 94, 0.2)',
                    color: '#22c55e'
                  }}>Active</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: t.textSec }}>Level</span>
                  <span className="text-sm font-medium">{user?.level || groupPrimary || fetchedLevel || academicInfo?.academic_level || 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: t.textSec }}>Department</span>
                  <span className="text-sm font-medium">{user?.department || 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: t.textSec }}>Section</span>
                  <span className="text-sm font-medium">{user?.section || 'Not set'}</span>
                </div>
              </div>
            </GlassCard>

            {/* Quick Actions */}
            <motion.div
              className="mt-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
            >
              <GlassCard className="p-0! overflow-hidden">
                <div className="px-4 pt-4 pb-2">
                  <h3 className="text-sm font-semibold">Quick Actions</h3>
                </div>
                {[
                  { icon: KeyRound, label: 'Change Password', path: '/change-password', color: t.primary },
                  { icon: History, label: 'Payment History', path: '/dashboard', color: t.mint },
                ].map((action, i) => (
                  <motion.button
                    key={action.path}
                    onClick={() => navigate(action.path)}
                    className="w-full flex items-center gap-3 px-4 py-3 transition-all text-left"
                    style={{ borderTop: `1px solid ${t.divider}` }}
                    whileHover={{ background: t.overlay }}
                    whileTap={{ scale: 0.98 }}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.1 }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${action.color}15` }}
                    >
                      <action.icon size={16} style={{ color: action.color }} />
                    </div>
                    <span className="text-sm font-medium flex-1">{action.label}</span>
                    <ChevronRight size={16} style={{ color: t.textSec }} />
                  </motion.button>
                ))}
              </GlassCard>
            </motion.div>

            {/* Organization Logo — ORG-scope admins only (mig 117). */}
            {isOrgAdmin && organization && (
              <motion.div
                className="mt-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
              >
                <GlassCard>
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${t.primary}15` }}
                    >
                      <Building2 size={16} style={{ color: t.primary }} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">Organization Logo</h3>
                      <p className="text-[11px]" style={{ color: t.textSec }}>
                        {organization.short_name || organization.name}
                      </p>
                    </div>
                  </div>

                  {/* Current Logo Preview */}
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative group">
                      {orgLogoUrl ? (
                        <img
                          src={orgLogoUrl}
                          alt={organization.short_name}
                          className="w-20 h-20 rounded-xl object-cover ring-2 ring-white/10"
                        />
                      ) : (
                        <div
                          className="w-20 h-20 rounded-xl flex items-center justify-center text-2xl font-bold ring-2 ring-white/10"
                          style={{ background: `linear-gradient(135deg, ${organization.primary_color || t.primary}, ${organization.primary_color || t.primary}88)` }}
                        >
                          {organization.short_name?.charAt(0) || 'O'}
                        </div>
                      )}

                      {/* Camera overlay */}
                      <motion.button
                        onClick={() => logoInputRef.current?.click()}
                        disabled={logoUploading}
                        className="absolute inset-0 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        style={{ background: 'rgba(0,0,0,0.5)' }}
                        whileTap={{ scale: 0.95 }}
                      >
                        {logoUploading ? (
                          <Loader2 size={20} className="animate-spin" />
                        ) : (
                          <Camera size={20} className="text-white" />
                        )}
                      </motion.button>
                    </div>

                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleLogoUpload(file);
                        e.target.value = '';
                      }}
                    />

                    <div className="flex items-center gap-2">
                      <motion.button
                        onClick={() => logoInputRef.current?.click()}
                        disabled={logoUploading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                        style={{ background: `${t.primary}20`, color: t.primary }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Upload size={12} />
                        {orgLogoUrl ? 'Change' : 'Upload'}
                      </motion.button>
                      {orgLogoUrl && (
                        <motion.button
                          onClick={handleRemoveLogo}
                          disabled={logoUploading}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                          style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <X size={12} />
                          Remove
                        </motion.button>
                      )}
                    </div>

                    <p className="text-[10px] text-center" style={{ color: t.textSec }}>
                      PNG, JPG or WebP • Max 2MB
                    </p>
                  </div>

                  {/* Logo upload message */}
                  {logoMessage && (
                    <motion.div
                      className="mt-3 p-2.5 rounded-lg flex items-center gap-2"
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{
                        background: logoMessage.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        border: `1px solid ${logoMessage.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                      }}
                    >
                      {logoMessage.type === 'success' ? (
                        <CheckCircle2 size={14} className="text-green-400 shrink-0" />
                      ) : (
                        <AlertCircle size={14} className="text-red-400 shrink-0" />
                      )}
                      <p className={`text-[11px] font-medium ${logoMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                        {logoMessage.text}
                      </p>
                    </motion.div>
                  )}
                </GlassCard>
              </motion.div>
            )}

            {/* Exec handover — self-hides for non-execs (mig 108). */}
            <HandoverButton />

            {/* Payment Summary Card - Mobile */}
            <motion.div
              className="mt-4 lg:hidden"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <GlassCard>
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: `${t.primary}20` }}
                  >
                    <Wallet size={20} style={{ color: t.primary }} />
                  </div>
                  <h3 className="text-base font-bold">Payment Summary</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl" style={{ background: t.overlay, border: `1px solid ${t.cardBorder}` }}>
                    <p className="text-xs font-medium mb-1" style={{ color: t.textSec }}>
                      Total Paid
                    </p>
                    <p className="text-lg font-bold">
                      <PrivacyMask>{formatCurrency(paymentSummary.totalPaid)}</PrivacyMask>
                    </p>
                    <p className="text-[10px] mt-1" style={{ color: t.textSec }}>
                      {paymentSummary.completedPayments} payment{paymentSummary.completedPayments !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl" style={{ background: t.overlay, border: `1px solid ${t.cardBorder}` }}>
                    <p className="text-xs font-medium mb-1" style={{ color: t.textSec }}>
                      Outstanding
                    </p>
                    <p className="text-lg font-bold" style={{ color: t.amber }}>
                      <PrivacyMask>{formatCurrency(paymentSummary.totalOutstanding)}</PrivacyMask>
                    </p>
                    <p className="text-[10px] mt-1" style={{ color: t.textSec }}>
                      {paymentSummary.pendingPayments} pending
                    </p>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>

          {/* Right Column - Details */}
          <motion.div
            className="lg:col-span-2 space-y-4 sm:space-y-6"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            {/* Personal Information Section */}
            <GlassCard>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg sm:text-xl font-bold">Personal Information</h3>
                {!isEditing && (
                  <div className="flex items-center gap-2 text-xs px-3 py-1 rounded-full" 
                    style={{ background: t.cardHover, color: t.textSec }}>
                    <Lock size={12} />
                    <span>Some fields are read-only</span>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {/* READ-ONLY: Registration Number */}
                <motion.div
                  className="p-4 rounded-xl border"
                  style={{ 
                    background: t.overlay,
                    borderColor: t.cardBorder
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${t.primary}15` }}
                    >
                      <Hash size={18} style={{ color: t.primary }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs font-medium" style={{ color: t.textSec }}>
                          Registration Number
                        </p>
                        <span className="text-[10px] px-2 py-0.5 rounded-full" 
                          style={{ background: t.cardBorder, color: t.textSec }}>
                          Read-only
                        </span>
                      </div>
                      <p className="text-sm font-semibold truncate">{user?.reg_number}</p>
                    </div>
                  </div>
                </motion.div>

                {/* EDITABLE: Full Name */}
                {isEditing ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                  >
                    <Input
                      label="Full Name"
                      type="text"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      icon={<User size={20} />}
                      placeholder="Enter your full name"
                      fullWidth
                      required
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    className="p-4 rounded-xl border"
                    style={{ 
                      background: t.overlay,
                      borderColor: t.cardBorder
                    }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: `${t.mint}15` }}
                      >
                        <User size={18} style={{ color: t.mint }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium mb-1" style={{ color: t.textSec }}>
                          Full Name
                        </p>
                        <p className="text-sm font-semibold truncate">{user?.full_name}</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* EDITABLE: Email */}
                {isEditing ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                  >
                    <Input
                      label="Email Address"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      icon={<Mail size={20} />}
                      placeholder="your.email@example.com"
                      fullWidth
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    className="p-4 rounded-xl border"
                    style={{ 
                      background: t.overlay,
                      borderColor: t.cardBorder
                    }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: `${t.mint}15` }}
                      >
                        <Mail size={18} style={{ color: t.mint }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium mb-1" style={{ color: t.textSec }}>
                          Email Address
                        </p>
                        <p className="text-sm font-semibold truncate">{user?.email || 'Not set'}</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* EDITABLE: Phone */}
                {isEditing ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                  >
                    <Input
                      label="Phone Number"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      icon={<Phone size={20} />}
                      placeholder="+234 XXX XXX XXXX"
                      fullWidth
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    className="p-4 rounded-xl border"
                    style={{ 
                      background: t.overlay,
                      borderColor: t.cardBorder
                    }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: `${t.amber}15` }}
                      >
                        <Phone size={18} style={{ color: t.amber }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium mb-1" style={{ color: t.textSec }}>
                          Phone Number
                        </p>
                        <p className="text-sm font-semibold truncate">{user?.phone || 'Not set'}</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* EDITABLE: Section */}
                {isEditing ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                  >
                    <Input
                      label="Section"
                      type="text"
                      value={formData.section}
                      onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                      icon={<BookOpen size={20} />}
                      placeholder="e.g., A, B, C"
                      fullWidth
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    className="p-4 rounded-xl border"
                    style={{ 
                      background: t.overlay,
                      borderColor: t.cardBorder
                    }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: `${t.primary}15` }}
                      >
                        <BookOpen size={18} style={{ color: t.primary }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium mb-1" style={{ color: t.textSec }}>
                          Section
                        </p>
                        <p className="text-sm font-semibold truncate">{user?.section || 'Not set'}</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* READ-ONLY: Level */}
                <motion.div
                  className="p-4 rounded-xl border"
                  style={{ 
                    background: t.overlay,
                    borderColor: t.cardBorder
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9 }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${t.mint}15` }}
                    >
                      <GraduationCap size={18} style={{ color: t.mint }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs font-medium" style={{ color: t.textSec }}>
                          Current Level
                        </p>
                        <span className="text-[10px] px-2 py-0.5 rounded-full" 
                          style={{ background: t.cardBorder, color: t.textSec }}>
                          Read-only
                        </span>
                      </div>
                      <p className="text-sm font-semibold">{user?.level || groupPrimary || fetchedLevel || academicInfo?.academic_level || 'N/A'}</p>
                    </div>
                  </div>
                </motion.div>

                {/* READ-ONLY: Member Since */}
                <motion.div
                  className="p-4 rounded-xl border"
                  style={{ 
                    background: t.overlay,
                    borderColor: t.cardBorder
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.0 }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${t.mint}15` }}
                    >
                      <Calendar size={18} style={{ color: t.mint }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs font-medium" style={{ color: t.textSec }}>
                          Member Since
                        </p>
                        <span className="text-[10px] px-2 py-0.5 rounded-full" 
                          style={{ background: t.cardBorder, color: t.textSec }}>
                          Read-only
                        </span>
                      </div>
                      <p className="text-sm font-semibold">
                        {user?.created_at ? formatDate(user.created_at, 'long') : 'N/A'}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Help Text */}
              {isEditing && (
                <motion.div
                  className="mt-4 p-3 rounded-lg flex items-start gap-2"
                  style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)' }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <AlertCircle size={16} className="text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-400">
                    You can update your full name, email, phone number, and section. 
                    Your registration number, level, and join date cannot be changed.
                  </p>
                </motion.div>
              )}
            </GlassCard>

            {/* Delete Account */}
            {user?.id && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.15 }}
              >
                <DeleteAccountSection memberId={user.id} />
              </motion.div>
            )}

            {/* Payment Summary Card - Desktop */}
            <motion.div
              className="hidden lg:block"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1 }}
            >
              <GlassCard>
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: `${t.primary}20` }}
                  >
                    <Wallet size={20} style={{ color: t.primary }} />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold">Payment Summary</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl border" style={{ 
                    background: t.overlay,
                    borderColor: 'rgba(34, 197, 94, 0.3)' 
                  }}>
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 size={16} className="text-green-400" />
                      <p className="text-xs font-medium text-green-400">
                        Total Paid
                      </p>
                    </div>
                    <p className="text-xl sm:text-2xl font-bold mb-1">
                      <PrivacyMask>{formatCurrency(paymentSummary.totalPaid)}</PrivacyMask>
                    </p>
                    <p className="text-xs" style={{ color: t.textSec }}>
                      {paymentSummary.completedPayments} completed payment{paymentSummary.completedPayments !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl border" style={{ 
                    background: t.overlay,
                    borderColor: 'rgba(251, 146, 60, 0.3)'
                  }}>
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle size={16} style={{ color: t.amber }} />
                      <p className="text-xs font-medium" style={{ color: t.amber }}>
                        Outstanding
                      </p>
                    </div>
                    <p className="text-xl sm:text-2xl font-bold" style={{ color: t.amber }}>
                      <PrivacyMask>{formatCurrency(paymentSummary.totalOutstanding)}</PrivacyMask>
                    </p>
                    <p className="text-xs" style={{ color: t.textSec }}>
                      {paymentSummary.pendingPayments} pending payment{paymentSummary.pendingPayments !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>
        </div>
      </div>
      <Footer />
    </PageWrapper>
  );
}
