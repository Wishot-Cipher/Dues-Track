/**
 * PAYVEXO PLATFORM CONSOLE — command-room operator console.
 *
 * Mobile changelog (this revision):
 *  - Removed the hard "Open on a desktop" narrow guard entirely.
 *  - Sidebar is now collapsible on desktop (220 ↔ 56 px icon-rail).
 *  - On mobile (< 768 px) the sidebar becomes a fixed slide-over
 *    drawer triggered by a hamburger in a sticky top bar.
 *  - Content area offset tracks collapsed state on desktop, is 0 on mobile.
 *  - useIsMobile() hook drives the breakpoint reactively so SSR and
 *    resize both work correctly.
 *
 * All sections, data flows, and business logic are unchanged.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, ShieldCheck, Building2, Banknote, GraduationCap, Siren,
  Megaphone, Settings2, BarChart3, ScrollText, LogOut, Loader2, Mail, KeyRound,
  Check, CheckCircle2, AlertTriangle, RefreshCw, Clock, Vote, Menu, X,
  MoreHorizontal, XCircle, UserX, ShieldOff, ChevronDown, ChevronUp, Layers, Users,
} from 'lucide-react';
import { supabase } from '@/config/supabase';
import {
  platformAdminRequestCode, platformAdminVerifyCode, getPlatformAdmin,
  verifySession, platformAdminLogout, fetchPlatformStats, fetchOrganizations,
  toggleOrganizationStatus, listPendingClaims, grantClaimOverride, rejectClaim,
  getFinancialSummary, getAuditFeed, getGrowthFunnel,
  getPlatformSettings, updatePlatformSettings, getUniversityMap, broadcast,
  listOrgAdmins, setAdminActive, updateOrgSubscription,
  type PlatformAdmin, type PlatformStats, type OrgOverview, type PendingClaim,
  type FinancialSummary, type AuditEntry, type FunnelStage,
  type PlatformSettings, type UniRow, type OrgAdminRow,
} from '@/services/platformAdminService';
import { useToast } from '@/hooks/useToast';
import Pagination, { usePagination } from '@/components/ui/Pagination';

const naira = (kobo: number) => '₦' + Math.round((kobo || 0) / 100).toLocaleString();

// ── Theme ────────────────────────────────────────────────────────
const T = {
  bg: '#060B14', card: '#0C1220', hover: '#111827',
  border: 'rgba(255,255,255,0.06)', borderHot: 'rgba(255,104,3,0.3)',
  primary: '#FF6803', amber: '#F59E0B', mint: '#10B981', blue: '#3B82F6',
  purple: '#8B5CF6', red: '#EF4444', text: '#F1F5F9', textSec: '#94A3B8', textTer: '#475569',
};
const mono = "'JetBrains Mono', ui-monospace, monospace";

// ── Responsive hook ──────────────────────────────────────────────
function useIsMobile(bp = 768): boolean {
  const [is, setIs] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < bp : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${bp - 1}px)`);
    setIs(mq.matches);
    const h = (e: MediaQueryListEvent) => setIs(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [bp]);
  return is;
}

function LogoutConfirmModal({
  onCancel,
  onConfirm,
  busy,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ background: 'rgba(3,7,18,0.68)', backdropFilter: 'blur(10px)' }}
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.16 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          background: '#0C1220',
          border: `1px solid ${T.borderHot}`,
          borderRadius: 18,
          padding: 22,
          boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(255,104,3,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.primary }}>
            <LogOut size={18} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, color: T.text }}>Confirm sign out</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: T.textSec }}>Review the action before leaving the console.</p>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
          <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Action</div>
            <div style={{ fontSize: 13, color: T.text }}>Sign out of the platform console</div>
          </div>
          <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Impact</div>
            <div style={{ fontSize: 13, color: T.textSec, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>You’ll need to verify your session again next time you open the platform console.</div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <Btn onClick={onCancel} disabled={busy} color={T.textSec}>Cancel</Btn>
          <Btn onClick={onConfirm} disabled={busy} color={T.primary}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />} Sign out
          </Btn>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SafetyConfirmModal({
  org,
  onCancel,
  onConfirm,
  busy,
}: {
  org: OrgOverview | null;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  if (!org) return null;

  const freezing = org.is_active;
  const actionLabel = freezing ? 'Freeze organization' : 'Unfreeze organization';
  const actionDescription = freezing
    ? 'This will immediately block access for all members in this organization.'
    : 'This will restore access for all members in this organization.';

  return (
    <motion.div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ background: 'rgba(3,7,18,0.68)', backdropFilter: 'blur(10px)' }}
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.16 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          background: '#0C1220',
          border: `1px solid ${freezing ? T.borderHot : 'rgba(16,185,129,0.3)'}`,
          borderRadius: 18,
          padding: 22,
          boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: freezing ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: freezing ? T.red : T.mint }}>
            <Siren size={18} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, color: T.text }}>{freezing ? 'Confirm freeze' : 'Confirm unfreeze'}</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: T.textSec }}>Review the selected organization before applying changes.</p>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
          <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Organization</div>
            <div style={{ fontSize: 13, color: T.text }}>{org.name}</div>
          </div>
          <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Action</div>
            <div style={{ fontSize: 13, color: T.text }}>{actionLabel}</div>
          </div>
          <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Impact</div>
            <div style={{ fontSize: 13, color: T.textSec, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{actionDescription}</div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <Btn onClick={onCancel} disabled={busy} color={T.textSec}>Cancel</Btn>
          <Btn onClick={onConfirm} disabled={busy} color={freezing ? T.red : T.mint}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Siren size={14} />} {freezing ? 'Freeze' : 'Unfreeze'}
          </Btn>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Generic action-confirm modal with an optional reason field. Used for
// granting/rejecting claims and revoking admin roles — never window.confirm.
function ActionConfirmModal({
  icon, title, subtitle, rows, confirmLabel, color, busy,
  reasonLabel, reasonValue, onReason, onCancel, onConfirm,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  rows: Array<{ label: string; value: string }>;
  confirmLabel: string;
  color: string;
  busy: boolean;
  reasonLabel?: string;
  reasonValue?: string;
  onReason?: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ background: 'rgba(3,7,18,0.68)', backdropFilter: 'blur(10px)' }}
      onClick={() => !busy && onCancel()}
    >
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={{ duration: 0.16 }}
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 520, background: '#0C1220', border: `1px solid ${color}55`, borderRadius: 18, padding: 22, boxShadow: '0 24px 60px rgba(0,0,0,0.45)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: `${color}1f`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
            {icon}
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, color: T.text }}>{title}</h3>
            {subtitle && <p style={{ margin: '2px 0 0', fontSize: 12, color: T.textSec }}>{subtitle}</p>}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
          {rows.map((r) => (
            <div key={r.label} style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 10, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{r.label}</div>
              <div style={{ fontSize: 13, color: T.text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{r.value}</div>
            </div>
          ))}
          {reasonLabel && (
            <div>
              <label style={{ display: 'block', fontSize: 11, color: T.textSec, fontWeight: 600, marginBottom: 5 }}>{reasonLabel}</label>
              <textarea
                value={reasonValue ?? ''} onChange={(e) => onReason?.(e.target.value)} rows={2}
                placeholder="Optional — recorded in the audit log"
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <Btn onClick={onCancel} disabled={busy} color={T.textSec}>Cancel</Btn>
          <Btn onClick={onConfirm} disabled={busy} color={color}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : null} {confirmLabel}
          </Btn>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Small UI ─────────────────────────────────────────────────────
function Badge({ color, children, dot }: { color: string; children: React.ReactNode; dot?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', borderRadius: 99,
      background: `${color}18`, border: `1px solid ${color}35`,
      color, fontSize: 11, fontWeight: 600, fontFamily: mono,
    }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />}
      {children}
    </span>
  );
}

function Btn({ children, onClick, color = T.primary, disabled }: {
  children: React.ReactNode; onClick?: () => void; color?: string; disabled?: boolean;
}) {
  return (
    <motion.button
      whileTap={!disabled ? { scale: 0.97 } : undefined}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: `${color}15`, border: `1px solid ${color}35`, color,
        padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
        cursor: disabled ? 'default' : 'pointer', fontFamily: mono,
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}
    >
      {children}
    </motion.button>
  );
}

function StatCard({ label, value, accent = T.primary }: { label: string; value: string | number; accent?: string }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '14px 18px' }}>
      <div style={{ fontSize: 10, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: mono }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: T.text, marginTop: 4, letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ height: 2, width: 28, background: accent, borderRadius: 2, marginTop: 8 }} />
    </div>
  );
}

function Progress({ v, max, color = T.primary }: { v: number; max: number; color?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 99, height: 5, overflow: 'hidden' }}>
      <div style={{
        width: `${Math.min(100, (v / Math.max(1, max)) * 100)}%`,
        height: '100%', background: color, borderRadius: 99,
      }} />
    </div>
  );
}

// ── Claim categorisation ─────────────────────────────────────────
type Cat = 'escalated' | 'disputed' | 'independent' | 'bootstrap' | 'normal';
function categorise(c: PendingClaim): Cat {
  if (c.platform_review_requested_at) return 'escalated';
  if (c.dispute_count > 0)            return 'disputed';
  if (c.is_independent)               return 'independent';
  return c.higher_exec_exists ? 'normal' : 'bootstrap';
}
const CAT_COLOR: Record<Cat, string> = {
  escalated: T.purple, disputed: T.red, independent: T.blue, bootstrap: T.amber, normal: T.mint,
};
function hoursSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.round((Date.now() - new Date(iso).getTime()) / 3.6e6);
}

// ════════════════════════════════════════════════════════════════
// LOGIN GATE
// ════════════════════════════════════════════════════════════════
function LoginGate({ onLogin }: { onLogin: (a: PlatformAdmin) => void }) {
  const [step, setStep]   = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [code, setCode]   = useState('');
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState<string | null>(null);
  const [note, setNote]   = useState<string | null>(null);

  const sendCode = async () => {
    setBusy(true); setErr(null); setNote(null);
    try {
      const res = await platformAdminRequestCode(email.trim());
      if (!res.ok || !res.request_token) { setErr(res.error || 'Could not send code.'); setBusy(false); return; }
      setToken(res.request_token);
      setStep('code');
      setNote(res.sent ? 'Code sent to your email.' : (res.debug || 'Code generated.'));
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); }
    setBusy(false);
  };

  const verify = async () => {
    setBusy(true); setErr(null);
    try {
      const admin = await platformAdminVerifyCode(token, code.trim());
      onLogin(admin);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Invalid code'); }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380, background: T.card, border: `1px solid ${T.borderHot}`, borderRadius: 16, padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: T.primary }}>Pay<span style={{ color: T.amber }}>vexo</span></span>
          <Badge color={T.textSec}>CONSOLE</Badge>
        </div>
        <p style={{ color: T.textSec, fontSize: 13, margin: '0 0 20px' }}>Platform operator sign-in</p>

        {step === 'email' ? (
          <>
            <label style={{ fontSize: 11, color: T.textSec, fontWeight: 600 }}>Operator email</label>
            <div style={{ position: 'relative', margin: '6px 0 16px' }}>
              <Mail size={15} style={{ position: 'absolute', left: 11, top: 11, color: T.textTer }} />
              <input
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@payvexo.com" type="email"
                onKeyDown={(e) => e.key === 'Enter' && sendCode()}
                style={{ width: '100%', padding: '9px 12px 9px 34px', background: 'rgba(0,0,0,0.25)', border: `1px solid ${T.border}`, borderRadius: 10, color: T.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <Btn onClick={sendCode} disabled={busy} color={T.primary}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Send code
            </Btn>
          </>
        ) : (
          <>
            <label style={{ fontSize: 11, color: T.textSec, fontWeight: 600 }}>6-digit code</label>
            <div style={{ position: 'relative', margin: '6px 0 16px' }}>
              <KeyRound size={15} style={{ position: 'absolute', left: 11, top: 11, color: T.textTer }} />
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456" inputMode="numeric"
                onKeyDown={(e) => e.key === 'Enter' && verify()}
                style={{ width: '100%', padding: '9px 12px 9px 34px', background: 'rgba(0,0,0,0.25)', border: `1px solid ${T.border}`, borderRadius: 10, color: T.text, fontSize: 16, letterSpacing: '0.3em', fontFamily: mono, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={verify} disabled={busy} color={T.mint}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Verify
              </Btn>
              <Btn onClick={() => { setStep('email'); setCode(''); setErr(null); }} color={T.textSec}>Back</Btn>
            </div>
          </>
        )}
        {note && <p style={{ color: T.mint,  fontSize: 11, marginTop: 14 }}>{note}</p>}
        {err  && <p style={{ color: T.red,   fontSize: 12, marginTop: 14 }}>{err}</p>}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// SECTIONS
// ════════════════════════════════════════════════════════════════
function SectionHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, gap: 12, flexWrap: 'wrap' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: T.text, letterSpacing: '-0.02em' }}>{title}</h2>
        {sub && <p style={{ margin: '4px 0 0', fontSize: 13, color: T.textSec }}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

function VerificationQueue() {
  const [claims, setClaims]   = useState<PendingClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState<string | null>(null);
  const [filter, setFilter]   = useState<'all' | Cat>('all');
  const [busyId, setBusyId]   = useState<string | null>(null);
  const [menuId, setMenuId]   = useState<string | null>(null);
  const [action, setAction]   = useState<{ claim: PendingClaim; kind: 'grant' | 'reject' } | null>(null);
  const [reason, setReason]   = useState('');
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setClaims(await listPendingClaims()); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed to load'); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const runAction = async () => {
    if (!action) return;
    const { claim, kind } = action;
    setBusyId(claim.id);
    try {
      if (kind === 'grant') {
        await grantClaimOverride(claim.id);
        toast.success(`Granted Layer 4 to ${claim.claimant_name}.`);
      } else {
        await rejectClaim(claim.id, reason.trim() || undefined);
        toast.success(`Rejected ${claim.claimant_name}'s claim.`);
      }
      setClaims((p) => p.filter((x) => x.id !== claim.id));
      setAction(null); setReason('');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Action failed'); }
    setBusyId(null);
  };

  const filtered = filter === 'all' ? claims : claims.filter((c) => categorise(c) === filter);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    claims.forEach((c) => { const k = categorise(c); m[k] = (m[k] || 0) + 1; });
    return m;
  }, [claims]);

  return (
    <div>
      <SectionHead
        title="Verification Queue"
        sub="Every in-flight exec claim — review, then grant or reject"
        right={<Btn onClick={load} color={T.textSec}><RefreshCw size={13} /> Refresh</Btn>}
      />
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {(['all', 'escalated', 'disputed', 'bootstrap', 'independent', 'normal'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: mono,
            background: filter === f ? `${T.primary}18` : 'transparent',
            border: `1px solid ${filter === f ? T.primary + '40' : T.border}`,
            color: filter === f ? T.primary : T.textSec,
          }}>
            {f.toUpperCase()} ({f === 'all' ? claims.length : counts[f] || 0})
          </button>
        ))}
      </div>

      {loading
        ? <p style={{ color: T.textSec, fontSize: 13 }}><Loader2 size={14} className="animate-spin" style={{ verticalAlign: 'middle' }} /> Loading…</p>
        : err
          ? <p style={{ color: T.red, fontSize: 13 }}>{err}</p>
          : filtered.length === 0
            ? <p style={{ color: T.textTer, fontSize: 13 }}>No claims in this view.</p>
            : (
              <div style={{ display: 'grid', gap: 10 }}>
                {filtered.map((c) => {
                  const cat  = categorise(c);
                  const col  = CAT_COLOR[cat];
                  const stuckH = hoursSince(c.layer3_reached_at);
                  return (
                    <div key={c.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderLeft: `3px solid ${col}`, borderRadius: 12, padding: '14px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                        <div style={{ width: 38, height: 38, borderRadius: '50%', background: `${col}33`, color: col, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>
                          {(c.claimant_name || '?')[0]}
                        </div>
                        <div style={{ flex: 1, minWidth: 180 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{c.claimant_name}</span>
                            <Badge color={col}>{cat}</Badge>
                            {c.dispute_count > 0 && <Badge color={T.red}>{c.dispute_count} disputes</Badge>}
                            {c.has_financial_history && <Badge color={T.amber}>has money</Badge>}
                          </div>
                          <p style={{ margin: '3px 0 0', fontSize: 12, color: T.textSec }}>
                            {c.position_title} · {c.target_group_name || c.claimed_scope} · {c.org_name}
                          </p>
                        </div>
                        <div style={{ width: 110, flexShrink: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: T.textTer, marginBottom: 4 }}>
                            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Vote size={11} /> votes</span>
                            <span style={{ fontFamily: mono, color: T.text }}>{c.votes_received}/{c.votes_required}</span>
                          </div>
                          <Progress v={c.votes_received} max={c.votes_required} color={c.votes_received >= c.votes_required ? T.mint : col} />
                        </div>
                        <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 90 }}>
                          {c.layer3_reached_at
                            ? <span style={{ fontSize: 11, color: stuckH >= 168 ? T.red : T.textSec, display: 'inline-flex', gap: 4, alignItems: 'center' }}><Clock size={11} /> {stuckH}h stuck</span>
                            : <span style={{ fontSize: 11, color: T.textTer }}>L{c.current_layer}</span>}
                        </div>
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          <Btn onClick={() => setMenuId(menuId === c.id ? null : c.id)} disabled={busyId === c.id} color={T.textSec}>
                            {busyId === c.id ? <Loader2 size={13} className="animate-spin" /> : <MoreHorizontal size={14} />} Actions
                          </Btn>
                          <AnimatePresence>
                            {menuId === c.id && (
                              <>
                                <button
                                  type="button" aria-label="Close menu" onClick={() => setMenuId(null)}
                                  style={{ position: 'fixed', inset: 0, zIndex: 10, background: 'transparent', border: 'none' }}
                                />
                                <motion.div
                                  initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.14 }}
                                  style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 20, minWidth: 180, background: '#0A1020', border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: '0 18px 40px rgba(0,0,0,0.35)', overflow: 'hidden' }}
                                >
                                  <button type="button" onClick={() => { setMenuId(null); setReason(''); setAction({ claim: c, kind: 'grant' }); }}
                                    style={menuItemStyle(T.mint)}>
                                    <ShieldCheck size={14} /> Grant Layer 4
                                  </button>
                                  <button type="button" onClick={() => { setMenuId(null); setReason(''); setAction({ claim: c, kind: 'reject' }); }}
                                    style={menuItemStyle(T.red)}>
                                    <XCircle size={14} /> Reject claim
                                  </button>
                                </motion.div>
                              </>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

      <AnimatePresence>
        {action && (
          <ActionConfirmModal
            icon={action.kind === 'grant' ? <ShieldCheck size={18} /> : <XCircle size={18} />}
            title={action.kind === 'grant' ? 'Grant Layer 4' : 'Reject claim'}
            subtitle={action.kind === 'grant'
              ? 'This unlocks money for their group.'
              : 'The claimant stays a normal member; they can re-apply later.'}
            color={action.kind === 'grant' ? T.mint : T.red}
            confirmLabel={action.kind === 'grant' ? 'Grant Layer 4' : 'Reject claim'}
            busy={busyId === action.claim.id}
            rows={[
              { label: 'Claimant', value: `${action.claim.claimant_name} · ${action.claim.position_title}` },
              { label: 'Organization', value: `${action.claim.org_name} · ${action.claim.target_group_name || action.claim.claimed_scope}` },
            ]}
            reasonLabel={action.kind === 'reject' ? 'Reason' : undefined}
            reasonValue={reason}
            onReason={setReason}
            onCancel={() => { setAction(null); setReason(''); }}
            onConfirm={runAction}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const menuItemStyle = (color: string): React.CSSProperties => ({
  width: '100%', padding: '10px 14px', background: 'transparent', color,
  border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 12, fontWeight: 600,
  display: 'flex', alignItems: 'center', gap: 8, fontFamily: mono,
});

function CommandCenter() {
  const [stats, setStats]   = useState<PlatformStats | null>(null);
  const [claims, setClaims] = useState<PendingClaim[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [s, c] = await Promise.all([fetchPlatformStats(), listPendingClaims().catch(() => [])]);
        setStats(s); setClaims(c);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const alerts = useMemo(() => {
    return claims
      .map((c) => ({ c, cat: categorise(c), stuck: hoursSince(c.layer3_reached_at) }))
      .filter((a) => a.cat === 'escalated' || a.cat === 'disputed' || a.stuck >= 168)
      .sort((a, b) => b.stuck - a.stuck);
  }, [claims]);

  if (loading) return <p style={{ color: T.textSec, fontSize: 13 }}><Loader2 size={14} className="animate-spin" style={{ verticalAlign: 'middle' }} /> Loading…</p>;

  return (
    <div>
      <SectionHead title="Command Center" sub="Platform pulse and everything that needs your attention" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 26 }}>
        <StatCard label="Organizations"   value={stats?.totalOrganizations ?? 0} />
        <StatCard label="Active orgs"     value={stats?.activeOrganizations ?? 0}                            accent={T.mint} />
        <StatCard label="Members"         value={(stats?.totalMembers ?? 0).toLocaleString()}                accent={T.blue} />
        <StatCard label="Payments"        value={(stats?.totalPayments ?? 0).toLocaleString()}               accent={T.purple} />
        <StatCard label="Collected"       value={`₦${((stats?.totalCollected ?? 0)).toLocaleString()}`}      accent={T.amber} />
        <StatCard label="Pending claims"  value={claims.length}                                              accent={T.amber} />
      </div>

      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Needs attention</span>
          <Badge color={T.red} dot>{alerts.length}</Badge>
        </div>
        {alerts.length === 0
          ? <p style={{ padding: '16px 18px', margin: 0, fontSize: 12, color: T.textTer }}>All clear — nothing flagged.</p>
          : alerts.map(({ c, cat, stuck }) => (
            <div key={c.id} style={{ padding: '12px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <AlertTriangle size={15} style={{ color: CAT_COLOR[cat], flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: T.text }}>{c.claimant_name} · {c.position_title}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: T.textSec }}>
                  {cat === 'escalated' ? 'Requested platform review' : cat === 'disputed' ? `${c.dispute_count} member disputes` : `Stuck ${stuck}h at Layer 3`} · {c.org_name}
                </p>
              </div>
              <Badge color={CAT_COLOR[cat]}>{cat}</Badge>
            </div>
          ))}
      </div>
    </div>
  );
}

// ── Org card with an expandable academic "sets & levels" panel.
// Ported from the (now-removed) standalone ConsoleUniversitiesPage into
// the live console. organization_groups is publicly readable, so the
// direct query works without a dedicated platform RPC.
interface ConsoleSetRow {
  id: string;
  name: string;
  current_level: string | null;
  entry_year: number | null;
  is_graduated: boolean | null;
  alumni_label: string | null;
}

function OrgCard({ o, busy, onToggle }: { o: OrgOverview; busy: boolean; onToggle: () => void }) {
  const isAcademic = o.organization_type === 'university' || o.organization_type === 'school';
  const [expanded, setExpanded]   = useState(false);
  const [sets, setSets]           = useState<ConsoleSetRow[]>([]);
  const [setsLoaded, setSetsLoaded] = useState(false);

  useEffect(() => {
    if (!expanded || setsLoaded || !isAcademic) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('organization_groups')
        .select('id, name, current_level, entry_year, is_graduated, alumni_label')
        .eq('organization_id', o.id)
        .in('kind', ['class', 'level'])
        .order('entry_year', { ascending: false })
        .limit(80);
      if (!cancelled) { setSets((data as ConsoleSetRow[]) ?? []); setSetsLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [expanded, setsLoaded, isAcademic, o.id]);

  // ── Billing plan control. Size is never capped; the plan drives the
  // value-add features + the transaction fee (set the org's fee % in the
  // Config section). Lets you change an org's plan without touching code.
  const planToast = useToast();
  const [plan, setPlan] = useState<string>((o as { subscription_plan?: string }).subscription_plan || 'free');
  const [savingPlan, setSavingPlan] = useState(false);
  async function changePlan(next: string) {
    setSavingPlan(true);
    try {
      await updateOrgSubscription(o.id, next as 'free' | 'starter' | 'professional' | 'enterprise');
      setPlan(next);
      planToast.success(`${o.name} → ${next} plan.`);
    } catch (e) { planToast.error(e instanceof Error ? e.message : 'Failed to update plan'); }
    setSavingPlan(false);
  }

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.name}</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: T.textSec, fontFamily: mono }}>/{o.slug} · {o.organization_type}</p>
        </div>
        <Badge color={o.is_active ? T.mint : T.red}>{o.is_active ? 'active' : 'suspended'}</Badge>
      </div>
      <div style={{ display: 'flex', gap: 16, margin: '12px 0', fontSize: 12, color: T.textSec }}>
        <span><b style={{ color: T.text }}>{o.member_count}</b> members</span>
        <span><b style={{ color: T.text }}>₦{(o.total_collected || 0).toLocaleString()}</b></span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Btn onClick={onToggle} disabled={busy} color={o.is_active ? T.red : T.mint}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : null}
          {o.is_active ? 'Suspend' : 'Reactivate'}
        </Btn>
        {isAcademic && (
          <Btn onClick={() => setExpanded((v) => !v)} color={T.textSec}>
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Sets
          </Btn>
        )}
      </div>

      {/* Billing plan — change without touching code. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <span style={{ fontSize: 11, color: T.textSec, flexShrink: 0 }}>Plan</span>
        <select
          value={plan}
          disabled={savingPlan}
          onChange={(e) => changePlan(e.target.value)}
          style={{ flex: 1, padding: '6px 8px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 12, textTransform: 'capitalize' }}
        >
          {['free', 'starter', 'professional', 'enterprise'].map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        {savingPlan && <Loader2 size={12} className="animate-spin" style={{ color: T.textSec, flexShrink: 0 }} />}
      </div>

      {isAcademic && expanded && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
          <p style={{ margin: '0 0 8px', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: T.textSec, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Layers size={11} /> Academic sets &amp; levels
          </p>
          {!setsLoaded ? (
            <p style={{ fontSize: 12, color: T.textSec }}><Loader2 size={12} className="animate-spin" style={{ verticalAlign: 'middle' }} /> Loading…</p>
          ) : sets.length === 0 ? (
            <p style={{ fontSize: 12, color: T.textSec }}>No classes/sets yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
              {sets.map((s) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 10px' }}>
                  <span style={{ color: T.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                  {s.entry_year ? <span style={{ color: T.textSec, flexShrink: 0 }}>· {s.entry_year} set</span> : null}
                  <span style={{ marginLeft: 'auto', flexShrink: 0 }}>
                    {s.is_graduated
                      ? <Badge color={T.mint}>🎓 {s.alumni_label || 'Alumni'}</Badge>
                      : <Badge color={T.primary}>{s.current_level || '—'}</Badge>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OrgRegistry() {
  const [orgs, setOrgs]     = useState<OrgOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ]           = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try { setOrgs(await fetchOrganizations()); } catch { /* ignore */ }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (o: OrgOverview) => {
    setBusyId(o.id);
    try {
      await toggleOrganizationStatus(o.id, !o.is_active);
      setOrgs((p) => p.map((x) => x.id === o.id ? { ...x, is_active: !x.is_active } : x));
      toast.success(o.is_active ? `${o.name} suspended.` : `${o.name} reactivated.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    setBusyId(null);
  };

  const filtered = orgs.filter((o) =>
    !q || o.name.toLowerCase().includes(q.toLowerCase()) || o.slug.includes(q.toLowerCase())
  );
  const { page, setPage, pageItems, pageCount, range, total } = usePagination(filtered, 18);

  return (
    <div>
      <SectionHead title="Organization Registry" sub="Every org on the platform"
        right={<Btn onClick={load} color={T.textSec}><RefreshCw size={13} /> Refresh</Btn>}
      />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search orgs…"
        style={{ width: '100%', padding: '9px 14px', background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, color: T.text, fontSize: 13, outline: 'none', marginBottom: 16, boxSizing: 'border-box' }}
      />
      {loading
        ? <p style={{ color: T.textSec, fontSize: 13 }}><Loader2 size={14} className="animate-spin" style={{ verticalAlign: 'middle' }} /> Loading…</p>
        : (
          <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {pageItems.map((o) => (
              <OrgCard key={o.id} o={o} busy={busyId === o.id} onToggle={() => toggle(o)} />
            ))}
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} range={range} total={total} noun="orgs" />
          </>
        )}
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  approved: T.mint, successful: T.mint, paid: T.mint,
  pending: T.amber, failed: T.red, abandoned: T.textTer,
};

function FinancialIntel() {
  const [d, setD]           = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]       = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try { setD(await getFinancialSummary()); }
      catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); }
      setLoading(false);
    })();
  }, []);

  if (loading) return <p style={{ color: T.textSec, fontSize: 13 }}><Loader2 size={14} className="animate-spin" style={{ verticalAlign: 'middle' }} /> Loading…</p>;
  if (err || !d) return <p style={{ color: T.red, fontSize: 13 }}>{err || 'No data'}</p>;
  const s = d.summary;

  return (
    <div>
      <SectionHead title="Financial Intelligence" sub="Month-to-date money flow, fees and settlements" />
      <div style={{ background: `linear-gradient(135deg, ${T.card}, rgba(255,104,3,0.05))`, border: `1px solid ${T.borderHot}`, borderRadius: 14, padding: 22, marginBottom: 22 }}>
        <p style={{ margin: '0 0 14px', fontSize: 11, color: T.primary, letterSpacing: '0.12em', fontFamily: mono }}>MONTH-TO-DATE</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 16 }}>
          {[
            { l: 'Gross volume',    v: naira(s.mtd_gross_kobo),          c: T.text    },
            { l: 'To orgs (dues)',  v: naira(s.mtd_dues_kobo),           c: T.blue    },
            { l: 'Platform fees',  v: naira(s.mtd_fees_kobo),           c: T.primary },
            { l: 'All-time fees',  v: naira(s.alltime_fees_kobo),       c: T.mint    },
            { l: 'Pending settle', v: naira(s.pending_settlement_kobo), c: T.amber   },
            { l: 'Success / Fail', v: `${s.mtd_success} / ${s.mtd_failed}`, c: T.textSec },
          ].map((x, i) => (
            <div key={i}>
              <p style={{ margin: '0 0 4px', fontSize: 10, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{x.l}</p>
              <p style={{ margin: 0, fontSize: 19, fontWeight: 800, color: x.c }}>{x.v}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 700, color: T.text }}>Recent transactions</div>
          {d.recent.length === 0
            ? <p style={{ padding: 18, margin: 0, fontSize: 12, color: T.textTer }}>No transactions yet.</p>
            : d.recent.map((t) => (
              <div key={t.id} style={{ padding: '10px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: T.text }}>{t.payer_name || '—'}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: T.textSec }}>{t.org_name} · {t.paystack_channel || '—'}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontSize: 12, color: T.text, fontFamily: mono }}>{naira(t.total_charged_kobo)}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 10, color: T.textTer }}>fee {naira(t.platform_fee_kobo)}</p>
                </div>
                <Badge color={STATUS_COLOR[t.status] || T.textTer}>{t.status}</Badge>
              </div>
            ))}
        </div>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 700, color: T.text }}>Top orgs (MTD)</div>
          {d.top_orgs.length === 0
            ? <p style={{ padding: 18, margin: 0, fontSize: 12, color: T.textTer }}>—</p>
            : d.top_orgs.map((o, i) => (
              <div key={i} style={{ padding: '10px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 12, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.org_name}</span>
                <span style={{ fontSize: 12, color: T.mint, fontFamily: mono, flexShrink: 0 }}>{naira(o.collected_kobo)}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function GrowthAnalytics() {
  const [funnel, setFunnel] = useState<FunnelStage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => { try { setFunnel(await getGrowthFunnel()); } catch { /* ignore */ } setLoading(false); })();
  }, []);

  const top = funnel[0]?.count || 1;

  if (loading) return <p style={{ color: T.textSec, fontSize: 13 }}><Loader2 size={14} className="animate-spin" style={{ verticalAlign: 'middle' }} /> Loading…</p>;

  return (
    <div>
      <SectionHead title="Growth & Analytics" sub="Where orgs progress — and where they drop off" />
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 22, display: 'grid', gap: 12 }}>
        {funnel.map((f, i) => {
          const pct = Math.round((f.count / top) * 100);
          return (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 13, color: T.text }}>{f.stage}</span>
                <span style={{ fontSize: 12, color: T.textSec, fontFamily: mono }}>{f.count} · {pct}%</span>
              </div>
              <Progress v={f.count} max={top} color={i === 0 ? T.blue : pct > 50 ? T.mint : pct > 25 ? T.amber : T.red} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AuditTrail() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState<string | null>(null);
  const { page, setPage, pageItems, pageCount, range, total } = usePagination(entries, 20);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setEntries(await getAuditFeed(200)); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <SectionHead title="Audit Trail" sub="Every privileged platform action — append-only"
        right={<Btn onClick={load} color={T.textSec}><RefreshCw size={13} /> Refresh</Btn>}
      />
      {loading
        ? <p style={{ color: T.textSec, fontSize: 13 }}><Loader2 size={14} className="animate-spin" style={{ verticalAlign: 'middle' }} /> Loading…</p>
        : err
          ? <p style={{ color: T.red, fontSize: 13 }}>{err}</p>
          : entries.length === 0
            ? <p style={{ color: T.textTer, fontSize: 13 }}>No audit entries yet.</p>
            : (
              <>
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
                  {pageItems.map((e) => (
                    <div key={e.id} style={{ padding: '11px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <Badge color={T.purple}>{e.action}</Badge>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 12, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {e.target_type ? `${e.target_type}` : ''}{e.target_id ? ` · ${String(e.target_id).slice(0, 8)}` : ''}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: T.textSec }}>{e.admin_email}</p>
                      </div>
                      <span style={{ fontSize: 10, color: T.textTer, fontFamily: mono, flexShrink: 0 }}>
                        {new Date(e.created_at).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
                <Pagination page={page} pageCount={pageCount} onChange={setPage} range={range} total={total} noun="entries" />
              </>
            )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: 'rgba(0,0,0,0.25)', border: `1px solid ${T.border}`,
  borderRadius: 9, color: T.text, fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: T.textSec, fontWeight: 600, marginBottom: 5 }}>
        {label}
        {hint && <span style={{ color: T.textTer, fontWeight: 400 }}> · {hint}</span>}
      </label>
      {children}
    </div>
  );
}

function PlatformConfig() {
  const [s, setS]           = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applyAll, setApplyAll] = useState(false);
  const [feeModeOpen, setFeeModeOpen] = useState(false);
  const toast = useToast();

  const feeModeLabel = s?.fee_mode === 'percent'
    ? 'Percentage only'
    : s?.fee_mode === 'hybrid'
      ? 'Percentage + flat'
      : 'Flat only';

  useEffect(() => {
    (async () => { try { setS(await getPlatformSettings()); } catch { /* */ } setLoading(false); })();
  }, []);

  const set = (k: keyof PlatformSettings, v: string | number) =>
    setS((p) => p ? { ...p, [k]: v } : p);

  const save = async () => {
    if (!s) return;
    setSaving(true);
    try {
      const next = await updatePlatformSettings({ ...s, apply_fee_to_all_orgs: applyAll });
      setS(next); toast.success('Platform settings saved.');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Save failed'); }
    setSaving(false);
  };

  if (loading || !s) return <p style={{ color: T.textSec, fontSize: 13 }}><Loader2 size={14} className="animate-spin" style={{ verticalAlign: 'middle' }} /> Loading…</p>;

  return (
    <div>
      <SectionHead title="Platform Config" sub="Fee model and trust thresholds — these control the live system" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 14, color: T.text }}>Service fee (default)</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Mode">
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setFeeModeOpen((v) => !v)}
                  style={{
                    ...inputStyle,
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{feeModeLabel}</span>
                  <span style={{ color: T.textTer, fontFamily: mono, fontSize: 11 }}>⌄</span>
                </button>

                <AnimatePresence>
                  {feeModeOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      transition={{ duration: 0.14 }}
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        left: 0,
                        right: 0,
                        zIndex: 20,
                        background: '#0A1020',
                        border: `1px solid ${T.border}`,
                        borderRadius: 12,
                        boxShadow: '0 18px 40px rgba(0,0,0,0.35)',
                        overflow: 'hidden',
                      }}
                    >
                      {([
                        ['percent', 'Percentage only'],
                        ['hybrid', 'Percentage + flat'],
                        ['flat', 'Flat only'],
                      ] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            set('fee_mode', value);
                            setFeeModeOpen(false);
                          }}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            background: s.fee_mode === value ? 'rgba(255,104,3,0.12)' : 'transparent',
                            color: s.fee_mode === value ? T.primary : T.text,
                            border: 'none',
                            textAlign: 'left',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                          }}
                        >
                          <span>{label}</span>
                          {s.fee_mode === value && <Check size={14} />}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {feeModeOpen && (
                  <button
                    type="button"
                    aria-label="Close fee mode dropdown"
                    onClick={() => setFeeModeOpen(false)}
                    style={{ position: 'fixed', inset: 0, zIndex: 10, background: 'transparent', border: 'none', padding: 0, margin: 0 }}
                  />
                )}
              </div>
            </Field>
            <Field label="Percent" hint="%"><input type="number" step="0.1" value={s.fee_percent} onChange={(e) => set('fee_percent', Number(e.target.value))} style={inputStyle} /></Field>
            <Field label="Flat fee" hint="₦"><input type="number" value={Math.round(s.fee_flat_kobo / 100)} onChange={(e) => set('fee_flat_kobo', Number(e.target.value) * 100)} style={inputStyle} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Floor" hint="₦"><input type="number" value={Math.round(s.fee_min_kobo / 100)} onChange={(e) => set('fee_min_kobo', Number(e.target.value) * 100)} style={inputStyle} /></Field>
              <Field label="Cap"   hint="₦"><input type="number" value={Math.round(s.fee_cap_kobo / 100)} onChange={(e) => set('fee_cap_kobo', Number(e.target.value) * 100)} style={inputStyle} /></Field>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.textSec, cursor: 'pointer' }}>
              <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} />
              Re-price all existing orgs to this
            </label>
          </div>
        </div>

        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 14, color: T.text }}>Verification policy</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Bootstrap base votes"><input type="number" value={s.bootstrap_base_votes}     onChange={(e) => set('bootstrap_base_votes',     Number(e.target.value))} style={inputStyle} /></Field>
              <Field label="Escalated votes">     <input type="number" value={s.bootstrap_escalated_votes} onChange={(e) => set('bootstrap_escalated_votes', Number(e.target.value))} style={inputStyle} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Window" hint="hrs"><input type="number" value={s.bootstrap_window_hours} onChange={(e) => set('bootstrap_window_hours', Number(e.target.value))} style={inputStyle} /></Field>
              <Field label="Independent votes">  <input type="number" value={s.independent_votes}    onChange={(e) => set('independent_votes',    Number(e.target.value))} style={inputStyle} /></Field>
            </div>
            <Field label="Platform-review after" hint="days stuck">
              <input type="number" value={s.platform_review_days} onChange={(e) => set('platform_review_days', Number(e.target.value))} style={inputStyle} />
            </Field>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        <Btn onClick={save} disabled={saving} color={T.primary}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Save settings
        </Btn>
      </div>
    </div>
  );
}

function UniversityMap() {
  const [rows, setRows]     = useState<UniRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { try { setRows(await getUniversityMap()); } catch { /* */ } setLoading(false); })(); }, []);

  if (loading) return <p style={{ color: T.textSec, fontSize: 13 }}><Loader2 size={14} className="animate-spin" style={{ verticalAlign: 'middle' }} /> Loading…</p>;

  return (
    <div>
      <SectionHead title="University Map" sub="Per-institution penetration across the platform" />
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden', overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr', padding: '10px 18px', borderBottom: `1px solid ${T.border}`, fontSize: 10, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.08em', minWidth: 480 }}>
          <span>Institution</span><span>Members</span><span>Groups</span><span>Verified</span><span>Collected</span>
        </div>
        {rows.length === 0
          ? <p style={{ padding: 18, margin: 0, fontSize: 12, color: T.textTer }}>No organizations yet.</p>
          : rows.map((r) => (
            <div key={r.org_id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr', padding: '11px 18px', borderBottom: `1px solid ${T.border}`, alignItems: 'center', fontSize: 12, minWidth: 480 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, color: T.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.org_name}</p>
                <p style={{ margin: '1px 0 0', color: T.textTer, fontSize: 10, fontFamily: mono }}>{r.organization_type}</p>
              </div>
              <span style={{ color: T.text,                                  fontFamily: mono }}>{r.member_count}</span>
              <span style={{ color: T.text,                                  fontFamily: mono }}>{r.group_count}</span>
              <span style={{ color: r.verified_execs > 0 ? T.mint : T.textTer, fontFamily: mono }}>{r.verified_execs}</span>
              <span style={{ color: T.amber,                                 fontFamily: mono }}>{naira(r.collected_kobo)}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

function TrustSafety() {
  const [orgs, setOrgs]     = useState<OrgOverview[]>([]);
  const [flags, setFlags]   = useState<PendingClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmOrg, setConfirmOrg] = useState<OrgOverview | null>(null);
  const toast = useToast();

  // Admin / role management
  const [adminOrgId, setAdminOrgId] = useState<string>('');
  const [adminOrgOpen, setAdminOrgOpen] = useState(false);
  const [admins, setAdmins] = useState<OrgAdminRow[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [adminAction, setAdminAction] = useState<{ row: OrgAdminRow; activate: boolean } | null>(null);
  const [adminReason, setAdminReason] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, c] = await Promise.all([fetchOrganizations(), listPendingClaims().catch(() => [])]);
      setOrgs(o); setFlags(c.filter((x) => x.dispute_count > 0));
    } catch { /* */ }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const loadAdmins = useCallback(async (orgId: string) => {
    if (!orgId) { setAdmins([]); return; }
    setAdminsLoading(true);
    try { setAdmins(await listOrgAdmins(orgId)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not load admins'); }
    setAdminsLoading(false);
  }, [toast]);
  useEffect(() => { void loadAdmins(adminOrgId); }, [adminOrgId, loadAdmins]);

  const runAdminAction = async () => {
    if (!adminAction) return;
    const { row, activate } = adminAction;
    setAdminBusy(true);
    try {
      await setAdminActive(row.admin_id, activate, adminReason.trim() || undefined);
      setAdmins((p) => p.map((x) => x.admin_id === row.admin_id ? { ...x, is_active: activate } : x));
      toast.success(activate ? `Restored ${row.full_name}'s role.` : `Revoked ${row.full_name}'s role.`);
      setAdminAction(null); setAdminReason('');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Action failed'); }
    setAdminBusy(false);
  };

  const toggle = async (o: OrgOverview) => {
    setConfirmOrg(o);
  };

  const runToggle = async () => {
    if (!confirmOrg) return;
    const o = confirmOrg;
    setBusyId(o.id);
    try {
      await toggleOrganizationStatus(o.id, !o.is_active);
      setOrgs((p) => p.map((x) => x.id === o.id ? { ...x, is_active: !x.is_active } : x));
      toast.success(o.is_active ? `${o.name} frozen.` : `${o.name} unfrozen.`);
      setConfirmOrg(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    setBusyId(null);
  };

  const adminOrgLabel = orgs.find((o) => o.id === adminOrgId)?.name || 'Select an organization…';

  if (loading) return <p style={{ color: T.textSec, fontSize: 13 }}><Loader2 size={14} className="animate-spin" style={{ verticalAlign: 'middle' }} /> Loading…</p>;

  return (
    <div>
      <SectionHead title="Trust & Safety" sub="Fraud signals and emergency controls" right={<Btn onClick={load} color={T.textSec}><RefreshCw size={13} /> Refresh</Btn>} />
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden', marginBottom: 18 }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Disputed claims</span>
          <Badge color={T.red} dot>{flags.length}</Badge>
        </div>
        {flags.length === 0
          ? <p style={{ padding: 18, margin: 0, fontSize: 12, color: T.textTer }}>No disputed claims.</p>
          : flags.map((f) => (
            <div key={f.id} style={{ padding: '11px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Siren size={15} style={{ color: T.red }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 12, color: T.text, fontWeight: 600 }}>{f.claimant_name} · {f.position_title}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: T.textSec }}>{f.dispute_count} disputes · {f.org_name}</p>
              </div>
              <Badge color={T.red}>{f.dispute_count} disputes</Badge>
            </div>
          ))}
      </div>

      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 700, color: T.text }}>Emergency org controls</div>
        {orgs.map((o) => (
          <div key={o.id} style={{ padding: '10px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 12, color: T.text, fontWeight: 600 }}>{o.name}</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: T.textSec, fontFamily: mono }}>/{o.slug}</p>
            </div>
            <Badge color={o.is_active ? T.mint : T.red}>{o.is_active ? 'active' : 'frozen'}</Badge>
            <Btn onClick={() => toggle(o)} disabled={busyId === o.id} color={o.is_active ? T.red : T.mint}>
              {o.is_active ? 'Freeze' : 'Unfreeze'}
            </Btn>
          </div>
        ))}
      </div>

      {/* ── Admins & roles: revoke a suspicious exec ── */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'visible', marginTop: 18 }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={15} style={{ color: T.amber }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Admins &amp; roles</span>
          <span style={{ fontSize: 11, color: T.textTer }}>— revoke or restore an exec role</span>
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ position: 'relative', maxWidth: 360, marginBottom: 14 }}>
            <button type="button" onClick={() => setAdminOrgOpen((v) => !v)}
              style={{ ...inputStyle, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adminOrgLabel}</span>
              <ChevronDown size={14} style={{ color: T.textTer, flexShrink: 0 }} />
            </button>
            <AnimatePresence>
              {adminOrgOpen && (
                <>
                  <button type="button" aria-label="Close" onClick={() => setAdminOrgOpen(false)}
                    style={{ position: 'fixed', inset: 0, zIndex: 10, background: 'transparent', border: 'none' }} />
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.14 }}
                    style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 20, background: '#0A1020', border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: '0 18px 40px rgba(0,0,0,0.35)', overflow: 'hidden', maxHeight: 280, overflowY: 'auto' }}
                  >
                    {orgs.map((o) => (
                      <button key={o.id} type="button" onClick={() => { setAdminOrgId(o.id); setAdminOrgOpen(false); }}
                        style={{ width: '100%', padding: '10px 12px', background: adminOrgId === o.id ? 'rgba(255,104,3,0.12)' : 'transparent', color: adminOrgId === o.id ? T.primary : T.text, border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13 }}>
                        {o.name}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {!adminOrgId
            ? <p style={{ margin: 0, fontSize: 12, color: T.textTer }}>Pick an organization to see its admins.</p>
            : adminsLoading
              ? <p style={{ margin: 0, fontSize: 12, color: T.textSec }}><Loader2 size={13} className="animate-spin" style={{ verticalAlign: 'middle' }} /> Loading admins…</p>
              : admins.length === 0
                ? <p style={{ margin: 0, fontSize: 12, color: T.textTer }}>No admins in this organization.</p>
                : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {admins.map((a) => (
                      <div key={a.admin_id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.border}` }}>
                        <div style={{ flex: 1, minWidth: 160 }}>
                          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: T.text }}>
                            {a.full_name} {!a.is_active && <Badge color={T.textTer}>revoked</Badge>}
                          </p>
                          <p style={{ margin: '2px 0 0', fontSize: 11, color: T.textSec }}>
                            {(a.role_label || a.role || 'admin')} · {a.group_name || a.scope_level} · L{a.verification_layer}
                          </p>
                        </div>
                        {a.is_active
                          ? <Btn onClick={() => { setAdminReason(''); setAdminAction({ row: a, activate: false }); }} color={T.red}><ShieldOff size={13} /> Revoke</Btn>
                          : <Btn onClick={() => { setAdminReason(''); setAdminAction({ row: a, activate: true }); }} color={T.mint}><ShieldCheck size={13} /> Restore</Btn>}
                      </div>
                    ))}
                  </div>
                )}
        </div>
      </div>

      <AnimatePresence>
        {confirmOrg && (
          <SafetyConfirmModal
            org={confirmOrg}
            onCancel={() => setConfirmOrg(null)}
            onConfirm={runToggle}
            busy={busyId === confirmOrg.id}
          />
        )}
        {adminAction && (
          <ActionConfirmModal
            icon={adminAction.activate ? <ShieldCheck size={18} /> : <UserX size={18} />}
            title={adminAction.activate ? 'Restore admin role' : 'Revoke admin role'}
            subtitle={adminAction.activate
              ? 'This re-enables their exec powers.'
              : 'This immediately removes their exec powers (dues, members, money).'}
            color={adminAction.activate ? T.mint : T.red}
            confirmLabel={adminAction.activate ? 'Restore role' : 'Revoke role'}
            busy={adminBusy}
            rows={[
              { label: 'Admin', value: `${adminAction.row.full_name} · ${adminAction.row.role_label || adminAction.row.role || 'admin'}` },
              { label: 'Scope', value: adminAction.row.group_name || adminAction.row.scope_level },
            ]}
            reasonLabel="Reason"
            reasonValue={adminReason}
            onReason={setAdminReason}
            onCancel={() => { setAdminAction(null); setAdminReason(''); }}
            onConfirm={runAdminAction}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Communications() {
  const [orgs, setOrgs]     = useState<OrgOverview[]>([]);
  const [target, setTarget] = useState<string>('all');
  const [title, setTitle]   = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const toast = useToast();

  useEffect(() => { (async () => { try { setOrgs(await fetchOrganizations()); } catch { /* */ } })(); }, []);

  const audienceLabel = target === 'all'
    ? 'All organizations (everyone)'
    : orgs.find((o) => o.id === target)?.name || 'Selected organization';

  const send = async () => {
    if (title.trim().length < 2 || message.trim().length < 2) {
      toast.error('Title and message required.');
      return;
    }
    setSending(true);
    try {
      const n = await broadcast(target === 'all' ? null : target, title.trim(), message.trim());
      toast.success(`Sent to ${n} member${n === 1 ? '' : 's'}.`);
      setTitle('');
      setMessage('');
      setConfirmOpen(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    setSending(false);
  };

  return (
    <div>
      <SectionHead title="Communications" sub="Broadcast an in-app announcement" />
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18, maxWidth: 560, display: 'grid', gap: 14 }}>
        <Field label="Audience">
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setDropdownOpen((v) => !v)}
              style={{
                ...inputStyle,
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{audienceLabel}</span>
              <span style={{ color: T.textTer, fontFamily: mono, fontSize: 11 }}>⌄</span>
            </button>

            <AnimatePresence>
              {dropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.14 }}
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    left: 0,
                    right: 0,
                    zIndex: 20,
                    background: '#0A1020',
                    border: `1px solid ${T.border}`,
                    borderRadius: 12,
                    boxShadow: '0 18px 40px rgba(0,0,0,0.35)',
                    overflow: 'hidden',
                    maxHeight: 280,
                    overflowY: 'auto',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => { setTarget('all'); setDropdownOpen(false); }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: target === 'all' ? 'rgba(255,104,3,0.12)' : 'transparent',
                      color: target === 'all' ? T.primary : T.text,
                      border: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <span>All organizations (everyone)</span>
                    {target === 'all' && <Check size={14} />}
                  </button>
                  {orgs.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => { setTarget(o.id); setDropdownOpen(false); }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: target === o.id ? 'rgba(255,104,3,0.12)' : 'transparent',
                        color: target === o.id ? T.primary : T.text,
                        border: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                      }}
                    >
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</span>
                      {target === o.id && <Check size={14} />}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {dropdownOpen && (
              <button
                type="button"
                aria-label="Close audience dropdown"
                onClick={() => setDropdownOpen(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 10, background: 'transparent', border: 'none', padding: 0, margin: 0 }}
              />
            )}
          </div>
        </Field>
        <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Scheduled maintenance" style={inputStyle} /></Field>
        <Field label="Message"><textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="What do you want members to know?" style={{ ...inputStyle, resize: 'vertical' }} /></Field>
        <div>
          <Btn onClick={() => {
            if (title.trim().length < 2 || message.trim().length < 2) {
              toast.error('Title and message required.');
              return;
            }
            setConfirmOpen(true);
          }} disabled={sending} color={T.primary}>
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Megaphone size={14} />} Send broadcast
          </Btn>
        </div>
      </div>

      <AnimatePresence>
        {confirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(3,7,18,0.68)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
            onClick={() => !sending && setConfirmOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              onClick={(e) => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 520, background: '#0C1220', border: `1px solid ${T.borderHot}`, borderRadius: 18, padding: 22, boxShadow: '0 24px 60px rgba(0,0,0,0.45)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(255,104,3,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.primary }}>
                  <Megaphone size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, color: T.text }}>Confirm broadcast</h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: T.textSec }}>Review the target audience before sending.</p>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
                <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 10, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Audience</div>
                  <div style={{ fontSize: 13, color: T.text }}>{audienceLabel}</div>
                </div>
                <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 10, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Title</div>
                  <div style={{ fontSize: 13, color: T.text }}>{title.trim()}</div>
                </div>
                <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 10, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Message</div>
                  <div style={{ fontSize: 13, color: T.textSec, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{message.trim()}</div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                <Btn onClick={() => setConfirmOpen(false)} disabled={sending} color={T.textSec}>Cancel</Btn>
                <Btn onClick={send} disabled={sending} color={T.primary}>
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Megaphone size={14} />} Confirm send
                </Btn>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Nav items ────────────────────────────────────────────────────
const NAV = [
  { id: 'command',      label: 'Command',      icon: LayoutDashboard },
  { id: 'verification', label: 'Verification', icon: ShieldCheck     },
  { id: 'orgs',         label: 'Organizations',icon: Building2       },
  { id: 'financial',    label: 'Financial',    icon: Banknote        },
  { id: 'map',          label: 'Universities', icon: GraduationCap   },
  { id: 'safety',       label: 'Trust & Safety',icon: Siren          },
  { id: 'comms',        label: 'Comms',        icon: Megaphone       },
  { id: 'config',       label: 'Config',       icon: Settings2       },
  { id: 'analytics',    label: 'Analytics',    icon: BarChart3       },
  { id: 'audit',        label: 'Audit Trail',  icon: ScrollText      },
] as const;

type SectionId = (typeof NAV)[number]['id'];

// ── Animated label (fades when sidebar collapses) ────────────────
function SideLabel({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.span
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: 'auto' }}
          exit={{   opacity: 0, width: 0 }}
          transition={{ duration: 0.18 }}
          style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}
        >
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════
export default function PlatformConsole() {
  const [admin, setAdmin]       = useState<PlatformAdmin | null>(() => getPlatformAdmin());
  const [checking, setChecking] = useState(true);
  const [section, setSection]   = useState<SectionId>('command');
  const [collapsed, setCollapsed] = useState(false);   // desktop icon-rail
  const [mobileOpen, setMobileOpen] = useState(false); // mobile drawer
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const isMobile = useIsMobile(768);

  const confirmLogout = useCallback(async () => {
    setLogoutBusy(true);
    try {
      await platformAdminLogout();
      setAdmin(null);
      setShowLogoutModal(false);
    } finally {
      setLogoutBusy(false);
    }
  }, []);

  useEffect(() => {
    (async () => { const a = await verifySession(); setAdmin(a); setChecking(false); })();
  }, []);

  // Close mobile drawer on route change
  useEffect(() => { setMobileOpen(false); }, [section]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (isMobile) document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen, isMobile]);

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: T.primary }} />
      </div>
    );
  }

  if (!admin || !admin.session_token) return <LoginGate onLogin={setAdmin} />;

  // Effective sidebar width used to offset the content area on desktop
  const sidebarW = collapsed ? 56 : 220;

  const navBtn = (n: (typeof NAV)[number]) => {
    const I  = n.icon;
    const on = section === n.id;
    return (
      <motion.button
        key={n.id}
        whileHover={{ background: 'rgba(17, 24, 39, 1)' }}
        onClick={() => setSection(n.id)}
        title={collapsed && !isMobile ? n.label : undefined}
        style={{
          display: 'flex', alignItems: 'center',
          justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
          gap: 10, padding: collapsed && !isMobile ? '10px 0' : '9px 12px',
          borderRadius: 9, cursor: 'pointer', width: '100%',
          background: on ? `${T.primary}15` : 'rgba(17, 24, 39, 0)',
          border: `1px solid ${on ? T.primary + '30' : 'rgba(17, 24, 39, 0)'}`,
          color: on ? T.primary : T.textSec,
          fontSize: 13, fontWeight: 600, marginBottom: 2,
          overflow: 'hidden', transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        <I size={16} style={{ flexShrink: 0 }} />
        {/* On mobile the drawer is always full-width — always show labels */}
        <SideLabel visible={isMobile || !collapsed}>{n.label}</SideLabel>
      </motion.button>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, display: 'flex', position: 'relative' }}>

      {/* ── Mobile backdrop ─────────────────────────────────────── */}
      <AnimatePresence>
        {isMobile && mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setMobileOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 40,
              background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Sidebar ──────────────────────────────────────────────── */}
      <motion.aside
        animate={{ width: isMobile ? 240 : sidebarW }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        style={{
          position: 'fixed', top: 0, left: 0, height: '100vh',
          zIndex: 50, background: T.bg,
          borderRight: `1px solid ${T.border}`,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden', flexShrink: 0,
          // Mobile: slide-over drawer
          transform: isMobile
            ? mobileOpen ? 'translateX(0)' : 'translateX(-100%)'
            : 'translateX(0)',
          transition: isMobile
            ? 'transform 0.25s cubic-bezier(0.4,0,0.2,1)'
            : 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: isMobile && mobileOpen ? '4px 0 32px rgba(0,0,0,0.55)' : 'none',
          width: isMobile ? 240 : sidebarW,
        }}
      >
        {/* Logo row + collapse toggle */}
        <div style={{
          padding: collapsed && !isMobile ? '18px 0' : '18px 14px 14px',
          borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center',
          justifyContent: collapsed && !isMobile ? 'center' : 'space-between',
          gap: 8, flexShrink: 0,
        }}>
          {/* Logo — always visible on mobile, hidden when collapsed on desktop */}
          {(!collapsed || isMobile) && (
            <div>
              <span style={{ fontSize: 18, fontWeight: 800, color: T.primary }}>
                Pay<span style={{ color: T.amber }}>vexo</span>
              </span>
              <div style={{ fontSize: 10, color: T.textTer, fontFamily: mono, letterSpacing: '0.2em', marginTop: 2 }}>
                CONSOLE
              </div>
            </div>
          )}
          {/* Collapse toggle — desktop only */}
          {!isMobile && (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => setCollapsed(c => !c)}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              style={{
                background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.border}`,
                borderRadius: 8, width: 28, height: 28, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: T.textSec, flexShrink: 0,
              }}
            >
              <motion.svg
                animate={{ rotate: collapsed ? 180 : 0 }}
                transition={{ duration: 0.22 }}
                width="14" height="14" viewBox="0 0 14 14" fill="none"
              >
                <path d="M9 3L5 7L9 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </motion.svg>
            </motion.button>
          )}
          {/* Close button — mobile drawer only */}
          {isMobile && (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => setMobileOpen(false)}
              style={{
                background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.border}`,
                borderRadius: 8, width: 28, height: 28, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: T.textSec, flexShrink: 0,
              }}
            >
              <X size={14} />
            </motion.button>
          )}
        </div>

        {/* Nav items */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '10px 8px' }}>
          {NAV.map(navBtn)}
        </div>

        {/* Admin info + sign out */}
        <div style={{ borderTop: `1px solid ${T.border}`, padding: '12px 8px', flexShrink: 0 }}>
          {(!collapsed || isMobile) && (
            <p style={{ margin: '0 4px 8px', fontSize: 11, color: T.textSec, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {admin.full_name}
            </p>
          )}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowLogoutModal(true)}
            title={collapsed && !isMobile ? 'Sign out' : undefined}
            style={{
              display: 'flex', alignItems: 'center',
              justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
              gap: collapsed && !isMobile ? 0 : 8,
              padding: collapsed && !isMobile ? '10px 0' : '8px 12px',
              borderRadius: 9, cursor: 'pointer', background: 'transparent',
              border: `1px solid ${T.border}`, color: T.textSec,
              fontSize: 12, width: '100%',
            }}
          >
            <LogOut size={14} style={{ flexShrink: 0 }} />
            <SideLabel visible={isMobile || !collapsed}> Sign out</SideLabel>
          </motion.button>
        </div>
      </motion.aside>

      {/* ── Content wrapper ──────────────────────────────────────── */}
      <div style={{
        flex: 1,
        marginLeft: isMobile ? 0 : sidebarW,
        transition: 'margin-left 0.22s cubic-bezier(0.4,0,0.2,1)',
        minWidth: 0, display: 'flex', flexDirection: 'column',
      }}>

        {/* ── Mobile top bar ── */}
        {isMobile && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px', borderBottom: `1px solid ${T.border}`,
            background: T.bg, position: 'sticky', top: 0, zIndex: 30,
          }}>
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => setMobileOpen(o => !o)}
              style={{
                background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.border}`,
                borderRadius: 8, padding: '7px 8px', cursor: 'pointer',
                color: T.textSec, display: 'flex', alignItems: 'center',
              }}
              aria-label="Open navigation"
            >
              {mobileOpen ? <X size={16} /> : <Menu size={16} />}
            </motion.button>

            <span style={{ fontSize: 16, fontWeight: 800, color: T.primary }}>
              Pay<span style={{ color: T.amber }}>vexo</span>
              <span style={{ fontSize: 9, color: T.textTer, fontFamily: mono, letterSpacing: '0.2em', marginLeft: 6 }}>CONSOLE</span>
            </span>

            {/* Spacer to keep title centred */}
            <div style={{ width: 36 }} />
          </div>
        )}

        {/* ── Page content ── */}
        <main style={{ flex: 1, padding: isMobile ? '20px 16px' : '28px 32px', maxWidth: 1400, width: '100%' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            >
              {section === 'command'      && <CommandCenter />}
              {section === 'verification' && <VerificationQueue />}
              {section === 'orgs'         && <OrgRegistry />}
              {section === 'financial'    && <FinancialIntel />}
              {section === 'map'          && <UniversityMap />}
              {section === 'safety'       && <TrustSafety />}
              {section === 'comms'        && <Communications />}
              {section === 'config'       && <PlatformConfig />}
              {section === 'analytics'    && <GrowthAnalytics />}
              {section === 'audit'        && <AuditTrail />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <AnimatePresence>
        {showLogoutModal && (
          <LogoutConfirmModal
            onCancel={() => setShowLogoutModal(false)}
            onConfirm={() => void confirmLogout()}
            busy={logoutBusy}
          />
        )}
      </AnimatePresence>

    </div>
  );
}