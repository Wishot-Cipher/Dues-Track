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
  CheckCircle2, AlertTriangle, RefreshCw, Clock, Vote,
} from 'lucide-react';
import {
  platformAdminRequestCode, platformAdminVerifyCode, getPlatformAdmin,
  verifySession, platformAdminLogout, fetchPlatformStats, fetchOrganizations,
  toggleOrganizationStatus, listPendingClaims, grantClaimOverride,
  getFinancialSummary, getAuditFeed, getGrowthFunnel,
  getPlatformSettings, updatePlatformSettings, getUniversityMap, broadcast,
  type PlatformAdmin, type PlatformStats, type OrgOverview, type PendingClaim,
  type FinancialSummary, type AuditEntry, type FunnelStage,
  type PlatformSettings, type UniRow,
} from '@/services/platformAdminService';

const naira = (kobo: number) => '₦' + Math.round((kobo || 0) / 100).toLocaleString();

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

const STATUS_COLOR: Record<string, string> = { approved: T.mint, successful: T.mint, paid: T.mint, pending: T.amber, failed: T.red, abandoned: T.textTer };

function FinancialIntel() {
  const [d, setD] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try { setD(await getFinancialSummary()); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); }
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
            { l: 'Gross volume', v: naira(s.mtd_gross_kobo), c: T.text },
            { l: 'To orgs (dues)', v: naira(s.mtd_dues_kobo), c: T.blue },
            { l: 'Platform fees', v: naira(s.mtd_fees_kobo), c: T.primary },
            { l: 'All-time fees', v: naira(s.alltime_fees_kobo), c: T.mint },
            { l: 'Pending settle', v: naira(s.pending_settlement_kobo), c: T.amber },
            { l: 'Success / Fail', v: `${s.mtd_success} / ${s.mtd_failed}`, c: T.textSec },
          ].map((x, i) => (
            <div key={i}>
              <p style={{ margin: '0 0 4px', fontSize: 10, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{x.l}</p>
              <p style={{ margin: 0, fontSize: 19, fontWeight: 800, color: x.c }}>{x.v}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 700, color: T.text }}>Recent transactions</div>
          {d.recent.length === 0 ? <p style={{ padding: 18, margin: 0, fontSize: 12, color: T.textTer }}>No transactions yet.</p>
            : d.recent.map((t) => (
              <div key={t.id} style={{ padding: '10px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
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
          {d.top_orgs.length === 0 ? <p style={{ padding: 18, margin: 0, fontSize: 12, color: T.textTer }}>—</p>
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
  useEffect(() => { (async () => { try { setFunnel(await getGrowthFunnel()); } catch { /* ignore */ } setLoading(false); })(); }, []);
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
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setEntries(await getAuditFeed(100)); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  return (
    <div>
      <SectionHead title="Audit Trail" sub="Every privileged platform action — append-only"
        right={<Btn onClick={load} color={T.textSec}><RefreshCw size={13} /> Refresh</Btn>} />
      {loading ? <p style={{ color: T.textSec, fontSize: 13 }}><Loader2 size={14} className="animate-spin" style={{ verticalAlign: 'middle' }} /> Loading…</p>
        : err ? <p style={{ color: T.red, fontSize: 13 }}>{err}</p>
        : entries.length === 0 ? <p style={{ color: T.textTer, fontSize: 13 }}>No audit entries yet.</p>
        : (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
            {entries.map((e) => (
              <div key={e.id} style={{ padding: '11px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                <Badge color={T.purple}>{e.action}</Badge>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {e.target_type ? `${e.target_type}` : ''}{e.target_id ? ` · ${String(e.target_id).slice(0, 8)}` : ''}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: T.textSec }}>{e.admin_email}</p>
                </div>
                <span style={{ fontSize: 10, color: T.textTer, fontFamily: mono, flexShrink: 0 }}>{new Date(e.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', background: 'rgba(0,0,0,0.25)', border: `1px solid ${T.border}`, borderRadius: 9, color: T.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' };

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: T.textSec, fontWeight: 600, marginBottom: 5 }}>{label}{hint && <span style={{ color: T.textTer, fontWeight: 400 }}> · {hint}</span>}</label>
      {children}
    </div>
  );
}

function PlatformConfig() {
  const [s, setS] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applyAll, setApplyAll] = useState(false);
  const toast = useToast();

  useEffect(() => { (async () => { try { setS(await getPlatformSettings()); } catch { /* */ } setLoading(false); })(); }, []);
  const set = (k: keyof PlatformSettings, v: string | number) => setS((p) => p ? { ...p, [k]: v } : p);

  const save = async () => {
    if (!s) return;
    setSaving(true);
    try {
      const next = await updatePlatformSettings({ ...s, apply_fee_to_all_orgs: applyAll });
      setS(next); toast?.success?.('Platform settings saved.');
    } catch (e) { toast?.error?.(e instanceof Error ? e.message : 'Save failed'); }
    setSaving(false);
  };

  if (loading || !s) return <p style={{ color: T.textSec, fontSize: 13 }}><Loader2 size={14} className="animate-spin" style={{ verticalAlign: 'middle' }} /> Loading…</p>;

  return (
    <div>
      <SectionHead title="Platform Config" sub="Fee model and trust thresholds — these control the live system" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 14, color: T.text }}>Service fee (default)</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Mode">
              <select value={s.fee_mode} onChange={(e) => set('fee_mode', e.target.value)} style={inputStyle}>
                <option value="percent" style={{ color: '#000' }}>Percentage only</option>
                <option value="hybrid" style={{ color: '#000' }}>Percentage + flat</option>
                <option value="flat" style={{ color: '#000' }}>Flat only</option>
              </select>
            </Field>
            <Field label="Percent" hint="%"><input type="number" step="0.1" value={s.fee_percent} onChange={(e) => set('fee_percent', Number(e.target.value))} style={inputStyle} /></Field>
            <Field label="Flat fee" hint="₦"><input type="number" value={Math.round(s.fee_flat_kobo / 100)} onChange={(e) => set('fee_flat_kobo', Number(e.target.value) * 100)} style={inputStyle} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Floor" hint="₦"><input type="number" value={Math.round(s.fee_min_kobo / 100)} onChange={(e) => set('fee_min_kobo', Number(e.target.value) * 100)} style={inputStyle} /></Field>
              <Field label="Cap" hint="₦"><input type="number" value={Math.round(s.fee_cap_kobo / 100)} onChange={(e) => set('fee_cap_kobo', Number(e.target.value) * 100)} style={inputStyle} /></Field>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.textSec, cursor: 'pointer' }}>
              <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} /> Re-price all existing orgs to this
            </label>
          </div>
        </div>

        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 14, color: T.text }}>Verification policy</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Bootstrap base votes"><input type="number" value={s.bootstrap_base_votes} onChange={(e) => set('bootstrap_base_votes', Number(e.target.value))} style={inputStyle} /></Field>
              <Field label="Escalated votes"><input type="number" value={s.bootstrap_escalated_votes} onChange={(e) => set('bootstrap_escalated_votes', Number(e.target.value))} style={inputStyle} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Window" hint="hrs"><input type="number" value={s.bootstrap_window_hours} onChange={(e) => set('bootstrap_window_hours', Number(e.target.value))} style={inputStyle} /></Field>
              <Field label="Independent votes"><input type="number" value={s.independent_votes} onChange={(e) => set('independent_votes', Number(e.target.value))} style={inputStyle} /></Field>
            </div>
            <Field label="Platform-review after" hint="days stuck"><input type="number" value={s.platform_review_days} onChange={(e) => set('platform_review_days', Number(e.target.value))} style={inputStyle} /></Field>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        <Btn onClick={save} disabled={saving} color={T.primary}>{saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Save settings</Btn>
      </div>
    </div>
  );
}

function UniversityMap() {
  const [rows, setRows] = useState<UniRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { try { setRows(await getUniversityMap()); } catch { /* */ } setLoading(false); })(); }, []);
  if (loading) return <p style={{ color: T.textSec, fontSize: 13 }}><Loader2 size={14} className="animate-spin" style={{ verticalAlign: 'middle' }} /> Loading…</p>;
  return (
    <div>
      <SectionHead title="University Map" sub="Per-institution penetration across the platform" />
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr', padding: '10px 18px', borderBottom: `1px solid ${T.border}`, fontSize: 10, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          <span>Institution</span><span>Members</span><span>Groups</span><span>Verified</span><span>Collected</span>
        </div>
        {rows.length === 0 ? <p style={{ padding: 18, margin: 0, fontSize: 12, color: T.textTer }}>No organizations yet.</p>
          : rows.map((r) => (
            <div key={r.org_id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr', padding: '11px 18px', borderBottom: `1px solid ${T.border}`, alignItems: 'center', fontSize: 12 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, color: T.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.org_name}</p>
                <p style={{ margin: '1px 0 0', color: T.textTer, fontSize: 10, fontFamily: mono }}>{r.organization_type}</p>
              </div>
              <span style={{ color: T.text, fontFamily: mono }}>{r.member_count}</span>
              <span style={{ color: T.text, fontFamily: mono }}>{r.group_count}</span>
              <span style={{ color: r.verified_execs > 0 ? T.mint : T.textTer, fontFamily: mono }}>{r.verified_execs}</span>
              <span style={{ color: T.amber, fontFamily: mono }}>{naira(r.collected_kobo)}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

function TrustSafety() {
  const [orgs, setOrgs] = useState<OrgOverview[]>([]);
  const [flags, setFlags] = useState<PendingClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, c] = await Promise.all([fetchOrganizations(), listPendingClaims().catch(() => [])]);
      setOrgs(o); setFlags(c.filter((x) => x.dispute_count > 0));
    } catch { /* */ }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const toggle = async (o: OrgOverview) => {
    if (!confirm(`${o.is_active ? 'Freeze' : 'Unfreeze'} ${o.name}? ${o.is_active ? 'Payments and access stop.' : ''}`)) return;
    setBusyId(o.id);
    try { await toggleOrganizationStatus(o.id, !o.is_active); setOrgs((p) => p.map((x) => x.id === o.id ? { ...x, is_active: !x.is_active } : x)); } catch (e) { alert(e instanceof Error ? e.message : 'Failed'); }
    setBusyId(null);
  };
  if (loading) return <p style={{ color: T.textSec, fontSize: 13 }}><Loader2 size={14} className="animate-spin" style={{ verticalAlign: 'middle' }} /> Loading…</p>;
  return (
    <div>
      <SectionHead title="Trust & Safety" sub="Fraud signals and emergency controls" right={<Btn onClick={load} color={T.textSec}><RefreshCw size={13} /> Refresh</Btn>} />
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden', marginBottom: 18 }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Disputed claims</span><Badge color={T.red} dot>{flags.length}</Badge>
        </div>
        {flags.length === 0 ? <p style={{ padding: 18, margin: 0, fontSize: 12, color: T.textTer }}>No disputed claims.</p>
          : flags.map((f) => (
            <div key={f.id} style={{ padding: '11px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
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
          <div key={o.id} style={{ padding: '10px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 12, color: T.text, fontWeight: 600 }}>{o.name}</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: T.textSec, fontFamily: mono }}>/{o.slug}</p>
            </div>
            <Badge color={o.is_active ? T.mint : T.red}>{o.is_active ? 'active' : 'frozen'}</Badge>
            <Btn onClick={() => toggle(o)} disabled={busyId === o.id} color={o.is_active ? T.red : T.mint}>{o.is_active ? 'Freeze' : 'Unfreeze'}</Btn>
          </div>
        ))}
      </div>
    </div>
  );
}

function Communications() {
  const [orgs, setOrgs] = useState<OrgOverview[]>([]);
  const [target, setTarget] = useState<string>('all');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const toast = useToast();
  useEffect(() => { (async () => { try { setOrgs(await fetchOrganizations()); } catch { /* */ } })(); }, []);
  const send = async () => {
    if (title.trim().length < 2 || message.trim().length < 2) { toast?.error?.('Title and message required.'); return; }
    if (!confirm(`Send to ${target === 'all' ? 'EVERY member on the platform' : orgs.find((o) => o.id === target)?.name}?`)) return;
    setSending(true);
    try {
      const n = await broadcast(target === 'all' ? null : target, title.trim(), message.trim());
      toast?.success?.(`Sent to ${n} member${n === 1 ? '' : 's'}.`); setTitle(''); setMessage('');
    } catch (e) { toast?.error?.(e instanceof Error ? e.message : 'Failed'); }
    setSending(false);
  };
  return (
    <div>
      <SectionHead title="Communications" sub="Broadcast an in-app announcement" />
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18, maxWidth: 560, display: 'grid', gap: 14 }}>
        <Field label="Audience">
          <select value={target} onChange={(e) => setTarget(e.target.value)} style={inputStyle}>
            <option value="all" style={{ color: '#000' }}>All organizations (everyone)</option>
            {orgs.map((o) => <option key={o.id} value={o.id} style={{ color: '#000' }}>{o.name}</option>)}
          </select>
        </Field>
        <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Scheduled maintenance" style={inputStyle} /></Field>
        <Field label="Message"><textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="What do you want members to know?" style={{ ...inputStyle, resize: 'vertical' }} /></Field>
        <div><Btn onClick={send} disabled={sending} color={T.primary}>{sending ? <Loader2 size={14} className="animate-spin" /> : <Megaphone size={14} />} Send broadcast</Btn></div>
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
  const [narrow, setNarrow] = useState(typeof window !== 'undefined' && window.innerWidth < 900);

  useEffect(() => {
    (async () => { const a = await verifySession(); setAdmin(a); setChecking(false); })();
    const onResize = () => setNarrow(window.innerWidth < 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Operator console is desktop-only by design — mobile is intentionally left out.
  if (narrow) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, color: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28, textAlign: 'center' }}>
        <div style={{ maxWidth: 320 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: T.primary }}>Pay<span style={{ color: T.amber }}>vexo</span></span>
          <div style={{ fontSize: 10, color: T.textTer, fontFamily: mono, letterSpacing: '0.2em', margin: '4px 0 20px' }}>CONSOLE</div>
          <p style={{ color: T.text, fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>Open on a desktop</p>
          <p style={{ color: T.textSec, fontSize: 13, margin: 0, lineHeight: 1.6 }}>The operator console is built for a large screen. Please use a laptop or desktop to manage the platform.</p>
        </div>
      </div>
    );
  }

  if (checking) {
    return <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 size={24} className="animate-spin" style={{ color: T.primary }} />
    </div>;
  }
  // A session without a token predates session_token persistence (or expired) —
  // force a fresh login so every session-gated RPC (Config, grants, broadcast…) works.
  if (!admin || !admin.session_token) return <LoginGate onLogin={setAdmin} />;

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
            {section === 'financial' && <FinancialIntel />}
            {section === 'map' && <UniversityMap />}
            {section === 'safety' && <TrustSafety />}
            {section === 'comms' && <Communications />}
            {section === 'config' && <PlatformConfig />}
            {section === 'analytics' && <GrowthAnalytics />}
            {section === 'audit' && <AuditTrail />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
