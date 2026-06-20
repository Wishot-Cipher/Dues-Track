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
 */

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Megaphone, Sparkles, RefreshCw as UpdateIcon, Wrench, PartyPopper,
  Plus, Loader2, RefreshCw, Eye, EyeOff, Edit3, X, Check, Calendar, Send,
} from 'lucide-react';
import {
  listPlatformNotices, createPlatformNotice, updatePlatformNotice, setNoticeActive,
  broadcast,
  type PlatformNoticeRow, type NoticeInput, type OrgOverview,
} from '@/services/platformAdminService';
import { useToast } from '@/hooks/useToast';

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
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, gap: 12, flexWrap: 'wrap' }}>
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
// never `null`/`undefined`. NoticeInput (the API payload type) allows
// null for optional fields, which is correct for the wire format, but
// it made every controlled <input value={form.x}> in this file a type
// error since React inputs require a definite string. We convert
// blank strings → null only at submit time (see submit() below),
// which already does this correctly via `.trim() || null`.
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

export function Communications({ orgs }: { orgs: OrgOverview[] }) {
  const [notices, setNotices] = useState<PlatformNoticeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
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

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
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

  // ── Deactivate/activate now goes through the confirm modal, matching
  // the freeze/unfreeze and revoke/restore pattern used everywhere else
  // in the console — no more bare-click state flips. ──
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

      {/* ── Instant broadcast ── */}
      <div
        style={{
          background: T.card,
          border: `1px solid ${T.borderHot}`,
          borderRadius: 16,
          padding: 0,
          marginBottom: 24,
          overflow: 'hidden',
        }}
      >
        {/* Header strip — distinct from the body, signals "this is a
            different class of action" than the notice composer below */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '16px 20px',
            background: `linear-gradient(135deg, ${T.amber}12, transparent)`,
            borderBottom: `1px solid ${T.border}`,
          }}
        >
          <div
            style={{
              width: 38, height: 38, borderRadius: 11,
              background: `${T.amber}18`, border: `1px solid ${T.amber}35`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: T.amber, flexShrink: 0,
            }}
          >
            <Send size={17} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: T.text }}>
              Instant broadcast
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: T.textSec }}>
              Push notification to real members — fires immediately on send
            </p>
          </div>
        </div>

        {/* Body — composer (left) + live audience preview (right) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 240px',
            gap: 20,
            padding: 20,
          }}
        >
          {/* Composer */}
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

            {/* Target — segmented control instead of a bare <select> */}
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
                <select
                  value={broadcastForm.org_id}
                  onChange={(e) => setBroadcastForm((f) => ({ ...f, org_id: e.target.value }))}
                  style={{
                    flex: 1, minWidth: 160,
                    padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
                    background: broadcastForm.org_id ? `${T.amber}18` : 'rgba(0,0,0,0.25)',
                    border: `1px solid ${broadcastForm.org_id ? T.amber + '55' : T.border}`,
                    color: broadcastForm.org_id ? T.amber : T.text,
                    fontSize: 12.5, fontWeight: 700, outline: 'none',
                  }}
                >
                  <option value="" disabled>— or pick one organization —</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>{o.name} ({o.member_count} members)</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Live audience preview */}
          <div
            style={{
              background: 'rgba(0,0,0,0.2)',
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              alignSelf: 'start',
            }}
          >
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textTer }}>
              Will notify
            </p>
            <div>
              <p style={{ margin: 0, fontSize: 28, fontWeight: 800, color: T.text, fontFamily: mono, lineHeight: 1 }}>
                {broadcastForm.org_id
                  ? (orgs.find((o) => o.id === broadcastForm.org_id)?.member_count ?? 0)
                  : orgs.reduce((sum, o) => sum + o.member_count, 0)}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: T.textSec }}>
                active member{(broadcastForm.org_id
                  ? (orgs.find((o) => o.id === broadcastForm.org_id)?.member_count ?? 0)
                  : orgs.reduce((sum, o) => sum + o.member_count, 0)) === 1 ? '' : 's'}
              </p>
            </div>
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
              <p style={{ margin: 0, fontSize: 12, color: T.textSec, lineHeight: 1.5 }}>
                {broadcastForm.org_id
                  ? <>Scoped to <strong style={{ color: T.text }}>{orgName(broadcastForm.org_id)}</strong> only</>
                  : <>Every active member across <strong style={{ color: T.text }}>{orgs.length}</strong> organizations</>}
              </p>
            </div>
          </div>
        </div>

        {/* Irreversibility callout + send action */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            padding: '14px 20px',
            background: `${T.amber}08`,
            borderTop: `1px solid ${T.border}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div
              style={{
                width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                background: `${T.amber}18`, color: T.amber,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Send size={13} />
            </div>
            <p style={{ margin: 0, fontSize: 12, color: T.textSec, lineHeight: 1.4 }}>
              Fires the moment you confirm — there is no undo or recall.
            </p>
          </div>
          <Btn onClick={requestBroadcast} color={T.amber}>
            <Send size={13} /> Review &amp; send
          </Btn>
        </div>
      </div>

      {/* ── Notice composer ── */}
      <div style={{ background: T.card, border: `1px solid ${isEditing ? T.borderHot : T.border}`, borderRadius: 14, padding: 18, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 14, color: T.text, display: 'flex', alignItems: 'center', gap: 8 }}>
            {isEditing ? <Edit3 size={15} style={{ color: T.primary }} /> : <Plus size={15} style={{ color: T.primary }} />}
            {isEditing ? 'Edit notice' : 'New notice'}
          </h3>
          {isEditing && <Btn onClick={cancelEdit} color={T.textSec}><X size={13} /> Cancel edit</Btn>}
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 12 }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="CTA label" hint="optional">
              <input value={form.cta_label} onChange={(e) => set('cta_label', e.target.value)} placeholder="See what changed" style={inputStyle} />
            </Field>
            <Field label="CTA URL" hint="optional">
              <input value={form.cta_url} onChange={(e) => set('cta_url', e.target.value)} placeholder="/changelog or https://…" style={inputStyle} />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Field label="Priority" hint="higher shows first">
              <input type="number" value={form.priority} onChange={(e) => set('priority', Number(e.target.value))} style={inputStyle} />
            </Field>
            <Field label="Target" hint="org or global">
              <select
                value={form.org_id}
                onChange={(e) => set('org_id', e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">Global — all organizations</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </Field>
            <Field label="Expires" hint="optional">
              <input type="datetime-local" value={form.expires_at} onChange={(e) => set('expires_at', e.target.value)} style={inputStyle} />
            </Field>
          </div>
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
          <Btn onClick={submit} disabled={saving} color={T.primary}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {isEditing ? 'Save changes' : 'Publish notice'}
          </Btn>
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
                  <div
                    key={n.id}
                    style={{
                      background: T.card, border: `1px solid ${T.border}`,
                      borderLeft: `3px solid ${n.is_active ? meta.color : T.textTer}`,
                      borderRadius: 12, padding: '14px 18px',
                      opacity: n.is_active ? 1 : 0.6,
                    }}
                  >
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
                  </div>
                );
              })}
            </div>
          )}

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
              { label: 'Recipients', value: targetLabel },
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