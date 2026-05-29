/**
 * PAYVEXO PLATFORM CONSOLE — command-room operator console.
 *
 * Fresh shell (Blueprint: operator command center). Phase 1 ships the auth gate,
 * the sidebar shell, and three REAL sections wired to live data:
 *   • Command Center   — platform stats + an alert queue derived from claims
 *   • Verification     — every in-flight claim, categorised, with platform grant
 *   • Organizations    — registry with suspend toggle
 * Later phases fill Financial / Universities / Trust&Safety / Comms / Config /
 * Analytics / Audit. All data flows through session-gated RPCs (no new API fns).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, ShieldCheck, Building2, Banknote, GraduationCap, Siren,
  Megaphone, Settings2, BarChart3, ScrollText, LogOut, Loader2, Mail, KeyRound,
  CheckCircle2, AlertTriangle, RefreshCw, Clock, Vote, ChevronRight,
} from 'lucide-react';
import {
  platformAdminRequestCode, platformAdminVerifyCode, getPlatformAdmin,
  verifySession, platformAdminLogout, fetchPlatformStats, fetchOrganizations,
  toggleOrganizationStatus, listPendingClaims, grantClaimOverride,
  type PlatformAdmin, type PlatformStats, type OrgOverview, type PendingClaim,
} from '@/services/platformAdminService';

// ── Theme ────────────────────────────────────────────────────────
const T = {
  bg: '#060B14', card: '#0C1220', hover: '#111827',
  border: 'rgba(255,255,255,0.06)', borderHot: 'rgba(255,104,3,0.3)',
  primary: '#FF6803', amber: '#F59E0B', mint: '#10B981', blue: '#3B82F6',
  purple: '#8B5CF6', red: '#EF4444', text: '#F1F5F9', textSec: '#94A3B8', textTer: '#475569',
};
const mono = "'JetBrains Mono', ui-monospace, monospace";

// ── Small UI ─────────────────────────────────────────────────────
function Badge({ color, children, dot }: { color: string; children: React.ReactNode; dot?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 99,
      background: `${color}18`, border: `1px solid ${color}35`, color, fontSize: 11, fontWeight: 600, fontFamily: mono }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />}
      {children}
    </span>
  );
}
function Btn({ children, onClick, color = T.primary, disabled }: { children: React.ReactNode; onClick?: () => void; color?: string; disabled?: boolean }) {
  return (
    <motion.button whileTap={!disabled ? { scale: 0.97 } : undefined} onClick={onClick} disabled={disabled}
      style={{ background: `${color}15`, border: `1px solid ${color}35`, color, padding: '6px 12px', borderRadius: 8,
        fontSize: 11, fontWeight: 700, cursor: disabled ? 'default' : 'pointer', fontFamily: mono, opacity: disabled ? 0.5 : 1,
        display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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
      <div style={{ width: `${Math.min(100, (v / Math.max(1, max)) * 100)}%`, height: '100%', background: color, borderRadius: 99 }} />
    </div>
  );
}

// ── Claim categorisation ─────────────────────────────────────────
type Cat = 'escalated' | 'disputed' | 'independent' | 'bootstrap' | 'normal';
function categorise(c: PendingClaim): Cat {
  if (c.platform_review_requested_at) return 'escalated';
  if (c.dispute_count > 0) return 'disputed';
  if (c.is_independent) return 'independent';
  return c.higher_exec_exists ? 'normal' : 'bootstrap';
}
const CAT_COLOR: Record<Cat, string> = { escalated: T.purple, disputed: T.red, independent: T.blue, bootstrap: T.amber, normal: T.mint };
function hoursSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.round((Date.now() - new Date(iso).getTime()) / 3.6e6);
}

// ════════════════════════════════════════════════════════════════
// LOGIN GATE
// ════════════════════════════════════════════════════════════════
function LoginGate({ onLogin }: { onLogin: (a: PlatformAdmin) => void }) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

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
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@payvexo.com" type="email"
                onKeyDown={(e) => e.key === 'Enter' && sendCode()}
                style={{ width: '100%', padding: '9px 12px 9px 34px', background: 'rgba(0,0,0,0.25)', border: `1px solid ${T.border}`, borderRadius: 10, color: T.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
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
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" inputMode="numeric"
                onKeyDown={(e) => e.key === 'Enter' && verify()}
                style={{ width: '100%', padding: '9px 12px 9px 34px', background: 'rgba(0,0,0,0.25)', border: `1px solid ${T.border}`, borderRadius: 10, color: T.text, fontSize: 16, letterSpacing: '0.3em', fontFamily: mono, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={verify} disabled={busy} color={T.mint}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Verify
              </Btn>
              <Btn onClick={() => { setStep('email'); setCode(''); setErr(null); }} color={T.textSec}>Back</Btn>
            </div>
          </>
        )}
        {note && <p style={{ color: T.mint, fontSize: 11, marginTop: 14 }}>{note}</p>}
        {err && <p style={{ color: T.red, fontSize: 12, marginTop: 14 }}>{err}</p>}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// SECTIONS
// ════════════════════════════════════════════════════════════════
function SectionHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, gap: 12 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: T.text, letterSpacing: '-0.02em' }}>{title}</h2>
        {sub && <p style={{ margin: '4px 0 0', fontSize: 13, color: T.textSec }}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

function VerificationQueue() {
  const [claims, setClaims] = useState<PendingClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | Cat>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setClaims(await listPendingClaims()); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed to load'); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const grant = async (c: PendingClaim) => {
    if (!confirm(`Grant Layer 4 to ${c.claimant_name} (${c.position_title}) at ${c.org_name}? This unlocks money for their group.`)) return;
    setBusyId(c.id);
    try { await grantClaimOverride(c.id); setClaims((p) => p.filter((x) => x.id !== c.id)); }
    catch (e) { alert(e instanceof Error ? e.message : 'Grant failed'); }
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
      <SectionHead title="Verification Queue" sub="Every in-flight exec claim — review, then grant or let the system resolve it"
        right={<Btn onClick={load} color={T.textSec}><RefreshCw size={13} /> Refresh</Btn>} />

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {(['all', 'escalated', 'disputed', 'bootstrap', 'independent', 'normal'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: mono,
            background: filter === f ? `${T.primary}18` : 'transparent',
            border: `1px solid ${filter === f ? T.primary + '40' : T.border}`, color: filter === f ? T.primary : T.textSec }}>
            {f.toUpperCase()} ({f === 'all' ? claims.length : counts[f] || 0})
          </button>
        ))}
      </div>

      {loading ? <p style={{ color: T.textSec, fontSize: 13 }}><Loader2 size={14} className="animate-spin" style={{ verticalAlign: 'middle' }} /> Loading…</p>
        : err ? <p style={{ color: T.red, fontSize: 13 }}>{err}</p>
        : filtered.length === 0 ? <p style={{ color: T.textTer, fontSize: 13 }}>No claims in this view.</p>
        : (
          <div style={{ display: 'grid', gap: 10 }}>
            {filtered.map((c) => {
              const cat = categorise(c);
              const col = CAT_COLOR[cat];
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
                    <Btn onClick={() => grant(c)} disabled={busyId === c.id} color={T.mint}>
                      {busyId === c.id ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Grant L4
                    </Btn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}

function CommandCenter() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
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
        <StatCard label="Organizations" value={stats?.totalOrganizations ?? 0} />
        <StatCard label="Active orgs" value={stats?.activeOrganizations ?? 0} accent={T.mint} />
        <StatCard label="Members" value={(stats?.totalMembers ?? 0).toLocaleString()} accent={T.blue} />
        <StatCard label="Payments" value={(stats?.totalPayments ?? 0).toLocaleString()} accent={T.purple} />
        <StatCard label="Collected" value={`₦${((stats?.totalCollected ?? 0)).toLocaleString()}`} accent={T.amber} />
        <StatCard label="Pending claims" value={claims.length} accent={T.amber} />
      </div>

      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Needs attention</span>
          <Badge color={T.red} dot>{alerts.length}</Badge>
        </div>
        {alerts.length === 0 ? <p style={{ padding: '16px 18px', margin: 0, fontSize: 12, color: T.textTer }}>All clear — nothing flagged.</p>
          : alerts.map(({ c, cat, stuck }) => (
            <div key={c.id} style={{ padding: '12px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
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

function OrgRegistry() {
  const [orgs, setOrgs] = useState<OrgOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setOrgs(await fetchOrganizations()); } catch { /* ignore */ }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (o: OrgOverview) => {
    setBusyId(o.id);
    try { await toggleOrganizationStatus(o.id, !o.is_active); setOrgs((p) => p.map((x) => x.id === o.id ? { ...x, is_active: !x.is_active } : x)); }
    catch (e) { alert(e instanceof Error ? e.message : 'Failed'); }
    setBusyId(null);
  };

  const filtered = orgs.filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase()) || o.slug.includes(q.toLowerCase()));

  return (
    <div>
      <SectionHead title="Organization Registry" sub="Every org on the platform"
        right={<Btn onClick={load} color={T.textSec}><RefreshCw size={13} /> Refresh</Btn>} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search orgs…"
        style={{ width: '100%', padding: '9px 14px', background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, color: T.text, fontSize: 13, outline: 'none', marginBottom: 16, boxSizing: 'border-box' }} />
      {loading ? <p style={{ color: T.textSec, fontSize: 13 }}><Loader2 size={14} className="animate-spin" style={{ verticalAlign: 'middle' }} /> Loading…</p>
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {filtered.map((o) => (
              <div key={o.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
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
                <Btn onClick={() => toggle(o)} disabled={busyId === o.id} color={o.is_active ? T.red : T.mint}>
                  {busyId === o.id ? <Loader2 size={13} className="animate-spin" /> : null}
                  {o.is_active ? 'Suspend' : 'Reactivate'}
                </Btn>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

function Placeholder({ title, phase }: { title: string; phase: string }) {
  return (
    <div>
      <SectionHead title={title} sub="Coming in a later build phase" />
      <div style={{ background: T.card, border: `1px dashed ${T.border}`, borderRadius: 14, padding: 40, textAlign: 'center' }}>
        <p style={{ color: T.textSec, fontSize: 14, margin: 0 }}>{title} lands in <b style={{ color: T.primary }}>{phase}</b>.</p>
        <p style={{ color: T.textTer, fontSize: 12, margin: '6px 0 0' }}>Wired to real data via session-gated RPCs (no new API functions).</p>
      </div>
    </div>
  );
}

// ── Nav ──────────────────────────────────────────────────────────
const NAV = [
  { id: 'command', label: 'Command', icon: LayoutDashboard },
  { id: 'verification', label: 'Verification', icon: ShieldCheck },
  { id: 'orgs', label: 'Organizations', icon: Building2 },
  { id: 'financial', label: 'Financial', icon: Banknote },
  { id: 'map', label: 'Universities', icon: GraduationCap },
  { id: 'safety', label: 'Trust & Safety', icon: Siren },
  { id: 'comms', label: 'Comms', icon: Megaphone },
  { id: 'config', label: 'Config', icon: Settings2 },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'audit', label: 'Audit Trail', icon: ScrollText },
] as const;

// ════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════
export default function PlatformConsole() {
  const [admin, setAdmin] = useState<PlatformAdmin | null>(() => getPlatformAdmin());
  const [checking, setChecking] = useState(true);
  const [section, setSection] = useState<string>('command');

  useEffect(() => {
    (async () => { const a = await verifySession(); setAdmin(a); setChecking(false); })();
  }, []);

  if (checking) {
    return <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 size={24} className="animate-spin" style={{ color: T.primary }} />
    </div>;
  }
  if (!admin) return <LoginGate onLogin={setAdmin} />;

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, display: 'flex' }}>
      {/* Sidebar */}
      <aside style={{ width: 220, borderRight: `1px solid ${T.border}`, padding: '20px 14px', display: 'flex', flexDirection: 'column', gap: 4, position: 'sticky', top: 0, height: '100vh', flexShrink: 0 }}>
        <div style={{ padding: '0 8px 16px' }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: T.primary }}>Pay<span style={{ color: T.amber }}>vexo</span></span>
          <div style={{ fontSize: 10, color: T.textTer, fontFamily: mono, letterSpacing: '0.2em', marginTop: 2 }}>CONSOLE</div>
        </div>
        {NAV.map((n) => {
          const I = n.icon; const on = section === n.id;
          return (
            <button key={n.id} onClick={() => setSection(n.id)} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, cursor: 'pointer',
              background: on ? `${T.primary}15` : 'transparent', border: `1px solid ${on ? T.primary + '30' : 'transparent'}`,
              color: on ? T.primary : T.textSec, fontSize: 13, fontWeight: 600, textAlign: 'left', width: '100%' }}>
              <I size={16} /> {n.label}
            </button>
          );
        })}
        <div style={{ marginTop: 'auto', borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
          <p style={{ margin: '0 8px 8px', fontSize: 11, color: T.textSec, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{admin.full_name}</p>
          <button onClick={() => { platformAdminLogout(); setAdmin(null); }} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 9, cursor: 'pointer',
            background: 'transparent', border: `1px solid ${T.border}`, color: T.textSec, fontSize: 12, width: '100%' }}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, padding: '28px 32px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
        <AnimatePresence mode="wait">
          <motion.div key={section} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            {section === 'command' && <CommandCenter />}
            {section === 'verification' && <VerificationQueue />}
            {section === 'orgs' && <OrgRegistry />}
            {section === 'financial' && <Placeholder title="Financial Intelligence" phase="Phase 3" />}
            {section === 'map' && <Placeholder title="University Map" phase="Phase 3" />}
            {section === 'safety' && <Placeholder title="Trust & Safety" phase="Phase 4" />}
            {section === 'comms' && <Placeholder title="Communications" phase="Phase 4" />}
            {section === 'config' && <Placeholder title="Platform Config" phase="Phase 3" />}
            {section === 'analytics' && <Placeholder title="Growth & Analytics" phase="Phase 4" />}
            {section === 'audit' && <Placeholder title="Audit Trail" phase="Phase 4" />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
