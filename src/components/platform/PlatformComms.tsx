/**
 * PlatformComms — notice board management + instant broadcast for the
 * Platform Console.
 *
 * Two distinct mechanisms, both session-validated server-side (RLS on
 * the underlying tables blocks direct client writes):
 *   - Notices  (platform_notices) — persistent, shown on the dashboard
 *     until deactivated or expired. Created/edited/toggled here.
 *   - Broadcast (platform_broadcast) — fire-and-forget. Inserts a
 *     notification row for every matching active member, immediately.
 *     Irreversible once sent, so it goes through the same confirm-modal
 *     pattern used for freeze/unfreeze and revoke/restore elsewhere in
 *     the console — never a bare click.
 *
 * UI revision: the two mechanisms now live behind a segmented switch
 * instead of stacking as two full-weight sections — each one gets the
 * page's full attention while it's open, and the panel never reads as
 * "two forms competing." Notices also got a live preview pane so an
 * operator can see exactly what a member will see before publishing.
 *
 * Bugfix (this pass): the "Target" org dropdown in the Notices composer
 * was visually empty when opened ("No options found"), even though the
 * `orgs` prop was confirmed populated. Root cause was NOT missing data —
 * it was ProfessionalDropdown's options panel being painted over by
 * later DOM siblings (the "Publish notice" button, then the notice list
 * cards below it), since the panel rendered inline with a z-index that
 * only resolved within its own nested stacking context and never
 * propagated past the surrounding grid/card wrappers. Confirmed via
 * screenshot: the panel was open, had height, and its search box was
 * visible — but option rows were drawn underneath sibling elements.
 * Fixed at the source in ProfessionalDropdown.tsx by portaling the open
 * menu to document.body, so it can never be painted over by anything on
 * the page regardless of nesting. The local zIndex:9999 workaround on
 * the composer card and the debug console.log used to diagnose this are
 * removed below now that the real fix lives in the shared component.
 */

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Megaphone, Sparkles, RefreshCw as UpdateIcon, Wrench, PartyPopper,
  Plus, Loader2, RefreshCw, Eye, EyeOff, Edit3, X, Check, Calendar,
  Send, Radio, ArrowUpRight, Users2,
} from 'lucide-react';
import {
  listPlatformNotices, createPlatformNotice, updatePlatformNotice, setNoticeActive,
  broadcast,
  type PlatformNoticeRow, type NoticeInput, type OrgOverview,
} from '@/services/platformAdminService';
import { useToast } from '@/hooks/useToast';
import ProfessionalDropdown from '@/components/ui/ProfessionalDropdown';
import ProfessionalDateTimePicker from '@/components/ui/ProfessionalDateTimePicker';

// ── Local tokens — mirrors PlatformConsole.tsx's T object exactly so
// this file looks native even though it lives in its own module. ──
const T = {
  bg: '#060B14', card: '#0C1220', hover: '#111827',
  border: 'rgba(255,255,255,0.06)', borderHot: 'rgba(255,104,3,0.3)',
  primary: '#FF6803', amber: '#F59E0B', mint: '#10B981', blue: '#3B82F6',
  purple: '#8B5CF6', red: '#EF4444', text: '#F1F5F9', textSec: '#94A3B8', textTer: '#475569',
};
const mono = "'JetBrains Mono', ui-monospace, monospace";

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: 'rgba(0,0,0,0.25)', border: `1px solid ${T.border}`,
  borderRadius: 9, color: T.text, fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

// ── Local copies of console primitives (not exported from PlatformConsole) ──
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

function Btn({ children, onClick, color = T.primary, disabled, type = 'button' }: {
  children: React.ReactNode; onClick?: () => void; color?: string; disabled?: boolean; type?: 'button' | 'submit';
}) {
  return (
    <motion.button
      type={type}
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

function SectionHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: T.text, letterSpacing: '-0.02em' }}>{title}</h2>
        {sub && <p style={{ margin: '4px 0 0', fontSize: 13, color: T.textSec }}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

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

// Local copy of PlatformConsole's ActionConfirmModal — identical shape so
// every confirm dialog in the console (org freeze, admin revoke, this
// file's deactivate/broadcast) reads as the same component to the user,
// even though it can't literally be imported across these two files.
function ActionConfirmModal({
  icon, title, subtitle, rows, confirmLabel, color, busy, onCancel, onConfirm,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  rows: Array<{ label: string; value: string }>;
  confirmLabel: string;
  color: string;
  busy: boolean;
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

// ── Kind metadata — icon + color per notice kind ──
const KIND_META: Record<PlatformNoticeRow['kind'], { icon: React.ElementType; color: string; label: string }> = {
  announcement: { icon: Megaphone,  color: T.primary, label: 'Announcement' },
  tip:          { icon: Sparkles,   color: T.blue,    label: 'Tip' },
  update:       { icon: UpdateIcon, color: T.amber,   label: 'Update' },
  maintenance:  { icon: Wrench,     color: T.red,     label: 'Maintenance' },
  milestone:    { icon: PartyPopper, color: T.mint,   label: 'Milestone' },
};
const KIND_ORDER: PlatformNoticeRow['kind'][] = ['announcement', 'tip', 'update', 'maintenance', 'milestone'];

// Dedicated form-state shape — every field is a definite `string`,
// never `null`/`undefined`, since React controlled inputs require it.
// NoticeInput (the wire payload type) allows null for optional fields;
// we convert blank → null only at submit time.
interface NoticeFormState {
  id: string | null;
  title: string;
  body: string;
  kind: PlatformNoticeRow['kind'];
  emoji: string;
  cta_label: string;
  cta_url: string;
  priority: number;
  org_id: string;
  expires_at: string;
}

const EMPTY_FORM: NoticeFormState = {
  id: null,
  title: '',
  body: '',
  kind: 'announcement',
  emoji: '',
  cta_label: '',
  cta_url: '',
  priority: 0,
  org_id: '',
  expires_at: '',
};

const EMPTY_BROADCAST = { title: '', message: '', org_id: '' };

function fmtDate(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(local: string): string | null {
  if (!local) return null;
  return new Date(local).toISOString();
}

// ════════════════════════════════════════════════════════════════
// Segmented tab switch — Notices / Broadcast. A single sliding pill
// (shared layoutId) moves between the two options instead of either
// being its own static highlight, which is what makes it read as one
// coherent control rather than two buttons that happen to sit together.
// ════════════════════════════════════════════════════════════════
type CommsTab = 'notices' | 'broadcast';

function TabSwitch({ tab, onChange }: { tab: CommsTab; onChange: (t: CommsTab) => void }) {
  const tabs: Array<{ id: CommsTab; label: string; icon: React.ElementType; color: string }> = [
    { id: 'notices', label: 'Notices', icon: Megaphone, color: T.primary },
    { id: 'broadcast', label: 'Broadcast', icon: Radio, color: T.amber },
  ];
  return (
    <div
      style={{
        display: 'inline-flex', gap: 4, padding: 4, borderRadius: 14,
        background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}`,
      }}
    >
      {tabs.map((t) => {
        const Icon = t.icon;
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            style={{
              position: 'relative', display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 18px', borderRadius: 11, border: 'none', cursor: 'pointer',
              background: 'transparent', fontSize: 13, fontWeight: 700,
              color: active ? '#0A0E16' : T.textSec, transition: 'color 0.2s',
            }}
          >
            {active && (
              <motion.div
                layoutId="commsTabIndicator"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                style={{
                  position: 'absolute', inset: 0, borderRadius: 11,
                  background: t.color, boxShadow: `0 6px 20px ${t.color}45`,
                }}
              />
            )}
            <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon size={14} style={{ color: active ? '#0A0E16' : t.color }} />
              {t.label}
              {t.id === 'broadcast' && (
                <motion.span
                  animate={{ opacity: [1, 0.35, 1] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: active ? '#0A0E16' : T.amber,
                  }}
                />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Panel header banner — shared visual language between the two
// composer panels so switching tabs feels like one designed system,
// not two different forms bolted together. ──
function PanelBanner({ icon, color, title, sub }: { icon: React.ReactNode; color: string; title: string; sub: string }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '16px 20px',
        background: `linear-gradient(135deg, ${color}12, transparent)`,
        borderBottom: `1px solid ${T.border}`,
        borderRadius: '16px 16px 0 0',
      }}
    >
      <div
        style={{
          width: 38, height: 38, borderRadius: 11, flexShrink: 0,
          background: `${color}18`, border: `1px solid ${color}35`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color,
        }}
      >
        {icon}
      </div>
      <div>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: T.text }}>{title}</h3>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: T.textSec }}>{sub}</p>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Live notice preview — exactly what a member sees on their dashboard
// notice board, updating as the operator types. Real utility, not
// just decoration: catches a too-long title or an awkward line break
// before it ever goes live.
// ════════════════════════════════════════════════════════════════
function NoticePreviewCard({ form }: { form: NoticeFormState }) {
  const meta = KIND_META[form.kind];
  const Icon = meta.icon;
  const hasContent = form.title.trim() || form.body.trim();

  return (
    <div className="lg:sticky lg:top-5">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Eye size={12} style={{ color: T.textTer }} />
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.textTer, fontFamily: mono }}>
          Live preview
        </span>
      </div>
      <div
        style={{
          background: '#080C14', border: `1px solid ${T.border}`, borderRadius: 20,
          padding: 16, position: 'relative', overflow: 'hidden',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 50, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.08)',
            margin: '0 auto 16px',
          }}
        />
        <AnimatePresence mode="wait">
          {hasContent ? (
            <motion.div
              key={form.kind}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              style={{
                background: T.card, border: `1px solid ${T.border}`,
                borderLeft: `3px solid ${meta.color}`, borderRadius: 14, padding: 14,
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div
                  style={{
                    width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                    background: `${meta.color}18`, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {form.emoji ? <span style={{ fontSize: 16 }}>{form.emoji}</span> : <Icon size={16} style={{ color: meta.color }} />}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.text, wordBreak: 'break-word' }}>
                    {form.title || 'Notice title'}
                  </p>
                  <p style={{ margin: '3px 0 0', fontSize: 11.5, color: T.textSec, lineHeight: 1.5 }}>
                    {form.body || 'Body text will appear here as members see it on their dashboard…'}
                  </p>
                  {form.cta_label && (
                    <div style={{ marginTop: 9, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: meta.color }}>
                      {form.cta_label} <ArrowUpRight size={11} />
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ padding: '30px 12px', textAlign: 'center' }}
            >
              <p style={{ margin: 0, fontSize: 11.5, color: T.textTer }}>Start typing to preview…</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <p style={{ margin: '10px 2px 0', fontSize: 10.5, color: T.textTer, lineHeight: 1.5 }}>
        This is exactly how it renders on a member's dashboard.
      </p>
    </div>
  );
}

export function Communications({ orgs }: { orgs: OrgOverview[] }) {
  const [tab, setTab] = useState<CommsTab>('notices');
  const orgsReady = orgs.length > 0;

  const [notices, setNotices] = useState<PlatformNoticeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<NoticeFormState>(EMPTY_FORM);
  const toast = useToast();

  // ── Pending confirm-modal action — covers BOTH notice toggle and
  // broadcast send, since they share the same confirm/cancel shape. ──
  const [pendingToggle, setPendingToggle] = useState<PlatformNoticeRow | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);

  const [broadcastForm, setBroadcastForm] = useState(EMPTY_BROADCAST);
  const [confirmingBroadcast, setConfirmingBroadcast] = useState(false);
  const [broadcastBusy, setBroadcastBusy] = useState(false);

  const isEditing = form.id !== null;

  const load = useCallback(async () => {
    setLoading(true);
    try { setNotices(await listPlatformNotices()); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to load notices'); }
    setLoading(false);
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const set = <K extends keyof NoticeFormState>(k: K, v: NoticeFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const startEdit = (n: PlatformNoticeRow) => {
    setForm({
      id: n.id,
      title: n.title,
      body: n.body,
      kind: n.kind,
      emoji: n.emoji ?? '',
      cta_label: n.cta_label ?? '',
      cta_url: n.cta_url ?? '',
      priority: n.priority,
      org_id: n.org_id ?? '',
      expires_at: toLocalInput(n.expires_at),
    });
    setTab('notices');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => setForm(EMPTY_FORM);

  const submit = async () => {
    if (form.title.trim().length < 2) { toast.error('Title needs at least 2 characters.'); return; }
    if (form.body.trim().length < 2) { toast.error('Body needs at least 2 characters.'); return; }

    setSaving(true);
    const input: NoticeInput = {
      title: form.title.trim(),
      body: form.body.trim(),
      kind: form.kind,
      emoji: form.emoji.trim() || null,
      cta_label: form.cta_label.trim() || null,
      cta_url: form.cta_url.trim() || null,
      priority: Number(form.priority) || 0,
      org_id: form.org_id || null,
      expires_at: fromLocalInput(form.expires_at),
    };
    try {
      if (isEditing && form.id) {
        await updatePlatformNotice(form.id, input);
        toast.success('Notice updated.');
      } else {
        await createPlatformNotice(input);
        toast.success('Notice published.');
      }
      setForm(EMPTY_FORM);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save notice');
    }
    setSaving(false);
  };

  // ── Deactivate/activate goes through the confirm modal, matching the
  // freeze/unfreeze and revoke/restore pattern used everywhere else in
  // the console — no bare-click state flips. ──
  const runToggle = async () => {
    if (!pendingToggle) return;
    const n = pendingToggle;
    setToggleBusy(true);
    try {
      await setNoticeActive(n.id, !n.is_active);
      setNotices((p) => p.map((x) => x.id === n.id ? { ...x, is_active: !x.is_active } : x));
      toast.success(n.is_active ? `"${n.title}" deactivated.` : `"${n.title}" activated.`);
      setPendingToggle(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
    setToggleBusy(false);
  };

  const orgName = (orgId: string | null) => orgId ? (orgs.find((o) => o.id === orgId)?.name ?? 'Unknown org') : 'Global';

  // ── Broadcast ──
  const audienceCount = broadcastForm.org_id
    ? (orgs.find((o) => o.id === broadcastForm.org_id)?.member_count ?? 0)
    : orgs.reduce((sum, o) => sum + o.member_count, 0);
  const targetLabel = broadcastForm.org_id
    ? (orgs.find((o) => o.id === broadcastForm.org_id)?.name ?? 'Unknown org')
    : 'Every active member, every organization';

  const requestBroadcast = () => {
    if (broadcastForm.title.trim().length < 2) { toast.error('Title needs at least 2 characters.'); return; }
    if (broadcastForm.message.trim().length < 2) { toast.error('Message needs at least 2 characters.'); return; }
    setConfirmingBroadcast(true);
  };

  const runBroadcast = async () => {
    setBroadcastBusy(true);
    try {
      const notified = await broadcast(
        broadcastForm.org_id || null,
        broadcastForm.title.trim(),
        broadcastForm.message.trim(),
      );
      toast.success(`Notified ${notified} member${notified === 1 ? '' : 's'}.`);
      setBroadcastForm(EMPTY_BROADCAST);
      setConfirmingBroadcast(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Broadcast failed');
    }
    setBroadcastBusy(false);
  };

  return (
    <div>
      <SectionHead
        title="Communications"
        sub="Notices on the dashboard, plus instant broadcasts straight to member inboxes"
        right={<Btn onClick={load} color={T.textSec}><RefreshCw size={13} /> Refresh</Btn>}
      />

      <div style={{ marginBottom: 22 }}>
        <TabSwitch tab={tab} onChange={setTab} />
      </div>

      <AnimatePresence mode="wait">
        {tab === 'notices' ? (
          <motion.div
            key="notices"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.2 }}
          >
            {/* ── Notice composer + live preview ──
                No special z-index needed here anymore — the dropdown's
                options panel now portals to document.body and is
                immune to being painted over by the notice list below,
                regardless of this card's stacking context. */}
            <div
              style={{ background: T.card, border: `1px solid ${isEditing ? T.borderHot : T.border}`, borderRadius: 16, overflow: 'hidden', marginBottom: 24 }}
            >
              <PanelBanner
                icon={isEditing ? <Edit3 size={17} /> : <Plus size={17} />}
                color={isEditing ? T.primary : KIND_META[form.kind].color}
                title={isEditing ? 'Edit notice' : 'New notice'}
                sub="Persists on the member dashboard until deactivated or expired"
              />

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5 p-4 sm:p-5">
                <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_90px] gap-3">
                    <Field label="Title" hint="required">
                      <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="New feature: receipt downloads" style={inputStyle} />
                    </Field>
                    <Field label="Emoji" hint="optional">
                      <input value={form.emoji} onChange={(e) => set('emoji', e.target.value)} placeholder="🎉" style={inputStyle} maxLength={4} />
                    </Field>
                  </div>

                  <Field label="Body" hint="required">
                    <textarea
                      value={form.body}
                      onChange={(e) => set('body', e.target.value)}
                      placeholder="Tell members what changed and why it matters to them…"
                      rows={3}
                      style={{ ...inputStyle, resize: 'vertical' }}
                    />
                  </Field>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: T.textSec, fontWeight: 600, marginBottom: 7 }}>Kind</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {KIND_ORDER.map((k) => {
                        const meta = KIND_META[k];
                        const Icon = meta.icon;
                        const on = form.kind === k;
                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={() => set('kind', k)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '7px 12px', borderRadius: 9, cursor: 'pointer',
                              background: on ? `${meta.color}18` : 'transparent',
                              border: `1px solid ${on ? meta.color + '50' : T.border}`,
                              color: on ? meta.color : T.textSec,
                              fontSize: 12, fontWeight: 600,
                            }}
                          >
                            <Icon size={13} /> {meta.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="CTA label" hint="optional">
                      <input value={form.cta_label} onChange={(e) => set('cta_label', e.target.value)} placeholder="See what changed" style={inputStyle} />
                    </Field>
                    <Field label="CTA URL" hint="optional">
                      <input value={form.cta_url} onChange={(e) => set('cta_url', e.target.value)} placeholder="/changelog or https://…" style={inputStyle} />
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    <Field label="Priority" hint="higher shows first">
                      <input type="number" value={form.priority} onChange={(e) => set('priority', Number(e.target.value))} style={inputStyle} />
                    </Field>
                    <Field label="Target" hint="org or global">
                      {!orgsReady ? (
                        <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: 8, color: T.textTer }}>
                          <Loader2 size={13} className="animate-spin" /> Loading organizations…
                        </div>
                      ) : (
                        <ProfessionalDropdown
                          value={form.org_id || ''}
                          onChange={(v) => set('org_id', (Array.isArray(v) ? v[0] : v) ?? '')}
                          placeholder="Global — all organizations"
                          searchable
                          options={[
                            { value: '', label: 'Global — all organizations' },
                            ...orgs.map((o) => ({
                              value: o.id,
                              label: o.name,
                              description: `${o.member_count ?? 0} members`,
                            })),
                          ]}
                        />
                      )}
                    </Field>
                    <Field label="Expires" hint="optional">
                      <ProfessionalDateTimePicker
                        mode="datetime"
                        value={form.expires_at}
                        onChange={(iso) => set('expires_at', iso)}
                        placeholder="Pick expiry date & time"
                        fullWidth
                      />
                    </Field>
                  </div>

                  <div className="flex flex-wrap gap-2.5 mt-0.5">
                    {isEditing && <Btn onClick={cancelEdit} color={T.textSec}><X size={13} /> Cancel edit</Btn>}
                    <Btn onClick={submit} disabled={saving} color={T.primary}>
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      {isEditing ? 'Save changes' : 'Publish notice'}
                    </Btn>
                  </div>
                </div>

                <NoticePreviewCard form={form} />
              </div>
            </div>

            {/* ── Notice list ── */}
            {loading
              ? <p style={{ color: T.textSec, fontSize: 13 }}><Loader2 size={14} className="animate-spin" style={{ verticalAlign: 'middle' }} /> Loading…</p>
              : notices.length === 0
                ? <p style={{ color: T.textTer, fontSize: 13 }}>No notices yet — publish one above.</p>
                : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {notices.map((n) => {
                      const meta = KIND_META[n.kind];
                      const Icon = meta.icon;
                      return (
                        <motion.div
                          key={n.id}
                          whileHover={{ y: -2 }}
                          transition={{ duration: 0.15 }}
                          style={{
                            background: T.card, border: `1px solid ${T.border}`,
                            borderRadius: 12, padding: '14px 18px', position: 'relative',
                            opacity: n.is_active ? 1 : 0.55,
                          }}
                        >
                          <div
                            aria-hidden
                            style={{
                              position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                              borderRadius: '12px 0 0 12px',
                              background: n.is_active ? meta.color : T.textTer,
                              boxShadow: n.is_active ? `0 0 12px ${meta.color}60` : 'none',
                            }}
                          />
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${meta.color}18`, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {n.emoji ? <span style={{ fontSize: 16 }}>{n.emoji}</span> : <Icon size={16} />}
                            </div>
                            <div style={{ flex: 1, minWidth: 220 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{n.title}</span>
                                <Badge color={meta.color}>{meta.label}</Badge>
                                <Badge color={n.is_active ? T.mint : T.textTer} dot>{n.is_active ? 'active' : 'inactive'}</Badge>
                              </div>
                              <p style={{ margin: '4px 0 0', fontSize: 12, color: T.textSec, lineHeight: 1.5, maxWidth: 520 }}>
                                {n.body}
                              </p>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, fontSize: 11, color: T.textTer, flexWrap: 'wrap' }}>
                                <span>{orgName(n.org_id)}</span>
                                <span>· priority {n.priority}</span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <Calendar size={11} /> expires {fmtDate(n.expires_at)}
                                </span>
                                {n.cta_label && <span>· CTA: {n.cta_label}</span>}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                              <Btn onClick={() => startEdit(n)} color={T.textSec}><Edit3 size={13} /> Edit</Btn>
                              <Btn onClick={() => setPendingToggle(n)} color={n.is_active ? T.red : T.mint}>
                                {n.is_active ? <EyeOff size={13} /> : <Eye size={13} />}
                                {n.is_active ? 'Deactivate' : 'Activate'}
                              </Btn>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
          </motion.div>
        ) : (
          <motion.div
            key="broadcast"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {/* ── Broadcast composer + audience preview ── */}
            <div style={{ background: T.card, border: `1px solid ${T.borderHot}`, borderRadius: 16, overflow: 'hidden' }}>
              <PanelBanner
                icon={<Send size={17} />}
                color={T.amber}
                title="Instant broadcast"
                sub="Push notification to real members — fires immediately on send"
              />

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5 p-4 sm:p-5">
                <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
                  <Field label="Title" hint={`required · ${broadcastForm.title.length}/80`}>
                    <input
                      value={broadcastForm.title}
                      onChange={(e) => setBroadcastForm((f) => ({ ...f, title: e.target.value.slice(0, 80) }))}
                      placeholder="Scheduled maintenance tonight"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Message" hint={`required · ${broadcastForm.message.length}/280`}>
                    <textarea
                      value={broadcastForm.message}
                      onChange={(e) => setBroadcastForm((f) => ({ ...f, message: e.target.value.slice(0, 280) }))}
                      placeholder="Payvexo will be briefly unavailable between 11pm and midnight WAT…"
                      rows={4}
                      style={{ ...inputStyle, resize: 'vertical' }}
                    />
                  </Field>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: T.textSec, fontWeight: 600, marginBottom: 7 }}>
                      Audience
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => setBroadcastForm((f) => ({ ...f, org_id: '' }))}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                          background: !broadcastForm.org_id ? `${T.amber}18` : 'transparent',
                          border: `1px solid ${!broadcastForm.org_id ? T.amber + '55' : T.border}`,
                          color: !broadcastForm.org_id ? T.amber : T.textSec,
                          fontSize: 12.5, fontWeight: 700,
                        }}
                      >
                        Every organization
                      </button>
                      <div style={{ flex: 1, minWidth: 160 }}>
                        {!orgsReady ? (
                          <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: 8, color: T.textTer }}>
                            <Loader2 size={13} className="animate-spin" /> Loading…
                          </div>
                        ) : (
                          <ProfessionalDropdown
                            value={broadcastForm.org_id || ''}
                            onChange={(v) => {
                              const val = (Array.isArray(v) ? v[0] : v) ?? '';
                              setBroadcastForm((f) => ({ ...f, org_id: val }));
                            }}
                            placeholder="— or pick one organization —"
                            searchable
                            options={orgs.map((o) => ({
                              value: o.id,
                              label: o.name,
                              description: `${o.member_count ?? 0} members`,
                            }))}
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, marginTop: 4,
                      padding: '10px 14px', borderRadius: 10, background: `${T.amber}08`,
                      border: `1px solid ${T.amber}22`,
                    }}
                  >
                    <Send size={13} style={{ color: T.amber, flexShrink: 0 }} />
                    <p style={{ margin: 0, fontSize: 11.5, color: T.textSec, lineHeight: 1.4 }}>
                      Fires the moment you confirm — there is no undo or recall.
                    </p>
                  </div>

                  <div>
                    <Btn onClick={requestBroadcast} color={T.amber}>
                      <Send size={13} /> Review &amp; send
                    </Btn>
                  </div>
                </div>

                {/* Live audience preview */}
                <div className="lg:sticky lg:top-5">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <Users2 size={12} style={{ color: T.textTer }} />
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.textTer, fontFamily: mono }}>
                      Will notify
                    </span>
                  </div>
                  <div
                    style={{
                      background: 'rgba(0,0,0,0.2)', border: `1px solid ${T.border}`,
                      borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 14,
                    }}
                  >
                    <div>
                      <AnimatePresence mode="wait">
                        <motion.p
                          key={audienceCount}
                          initial={{ opacity: 0, y: -6, scale: 0.92 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          style={{ margin: 0, fontSize: 34, fontWeight: 800, color: T.amber, fontFamily: mono, lineHeight: 1 }}
                        >
                          {audienceCount.toLocaleString()}
                        </motion.p>
                      </AnimatePresence>
                      <p style={{ margin: '6px 0 0', fontSize: 12, color: T.textSec }}>
                        active member{audienceCount === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
                      <p style={{ margin: 0, fontSize: 12, color: T.textSec, lineHeight: 1.5 }}>
                        {broadcastForm.org_id
                          ? <>Scoped to <strong style={{ color: T.text }}>{targetLabel}</strong> only</>
                          : <>Every active member across <strong style={{ color: T.text }}>{orgs.length}</strong> organizations</>}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Confirm modals ── */}
      <AnimatePresence>
        {pendingToggle && (
          <ActionConfirmModal
            icon={pendingToggle.is_active ? <EyeOff size={18} /> : <Eye size={18} />}
            title={pendingToggle.is_active ? 'Deactivate notice' : 'Activate notice'}
            subtitle={pendingToggle.is_active
              ? 'Members will stop seeing this on their dashboard immediately.'
              : 'This notice will appear on matching members\' dashboards again.'}
            color={pendingToggle.is_active ? T.red : T.mint}
            confirmLabel={pendingToggle.is_active ? 'Deactivate' : 'Activate'}
            busy={toggleBusy}
            rows={[
              { label: 'Notice', value: pendingToggle.title },
              { label: 'Scope', value: orgName(pendingToggle.org_id) },
            ]}
            onCancel={() => setPendingToggle(null)}
            onConfirm={runToggle}
          />
        )}
        {confirmingBroadcast && (
          <ActionConfirmModal
            icon={<Send size={18} />}
            title="Send broadcast"
            subtitle="This notifies real members right now — it can't be recalled."
            color={T.amber}
            confirmLabel="Send now"
            busy={broadcastBusy}
            rows={[
              { label: 'Recipients', value: `${targetLabel} (${audienceCount.toLocaleString()} members)` },
              { label: 'Title', value: broadcastForm.title },
              { label: 'Message', value: broadcastForm.message },
            ]}
            onCancel={() => setConfirmingBroadcast(false)}
            onConfirm={runBroadcast}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default Communications;