import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  CalendarDays,
  Clock3,
  Plus,
  Save,
  Shield,
  Sparkles,
  Lock,
  CheckCircle2,
  AlertCircle,
  Timer,
  GraduationCap,
  Zap,
} from 'lucide-react';
import PageWrapper from '@/components/ui/PageWrapper';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import ProfessionalDropdown from '@/components/ui/ProfessionalDropdown';
import CustomButton from '@/components/ui/CustomButton';
import Checkbox from '@/components/ui/Checkbox';
import ProfessionalDateTimePicker from '@/components/ui/ProfessionalDateTimePicker';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
import organizationService, {
  type AcademicSessionRecord,
  type AcademicTermRecord,
} from '@/services/organizationService';

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS
//
// Brand-static values (hex colours that never change between light/dark)
// live here at module scope — same pattern as CreateDuePage's BRAND const.
// Theme-surface values (bg, card, borders, text) are derived at render
// time from getDashboardTokens(theme) and distributed via TokensContext.
// ─────────────────────────────────────────────────────────────────────────────
const BRAND = {
  primary: '#FF6803',
  mint:    '#30FFAC',
  blue:    '#3b82f6',
  amber:   '#f59e0b',
  danger:  '#EF4444',
  purple:  '#FF6803', // Payvexo uses brand orange as the "purple" accent
} as const;

// TokensContext distributes the full resolved token set (including
// theme-sensitive surfaces) to every sub-component without prop drilling.
type CalTokens = ReturnType<typeof getDashboardTokens>;
const TokensContext = createContext<CalTokens | null>(null);
function useTokens(): CalTokens {
  const tk = useContext(TokensContext);
  if (!tk) throw new Error('useTokens must be used inside TokensContext.Provider');
  return tk;
}

// ─────────────────────────────────────────────────────────────────────────────
// ANIMATION PRESETS
// ─────────────────────────────────────────────────────────────────────────────
const EASE = [0.22, 1, 0.36, 1] as const;
const fadeUp = (delay = 0) => ({
  initial:    { opacity: 0, y: 20 },
  animate:    { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: EASE },
});

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────────────────────
interface SessionFormData {
  label: string; start_date: string; end_date: string;
  is_active: boolean; is_locked: boolean;
}
interface TermFormData {
  name: string; session_id: string; sequence: number;
  start_date: string; end_date: string;
  promotion_window_starts_at: string; promotion_window_ends_at: string;
  status: AcademicTermRecord['status'];
}
interface PromotionSettingsForm {
  auto_promotion_enabled: boolean;
  promotion_requires_approval: boolean;
  promotion_grace_days: number;
}

const DEFAULT_SESSION: SessionFormData = {
  label: '', start_date: '', end_date: '', is_active: false, is_locked: false,
};
const DEFAULT_TERM: TermFormData = {
  name: '', session_id: '', sequence: 1, start_date: '', end_date: '',
  promotion_window_starts_at: '', promotion_window_ends_at: '', status: 'upcoming',
};

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// All read from TokensContext — no colour props needed.
// ─────────────────────────────────────────────────────────────────────────────

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon, color, delay }: {
  label: string; value: string | number;
  icon: React.ReactNode; color: string; delay: number;
}) {
  const tk = useTokens();
  const isLight = tk.bg === '#FFFBF7' || tk.bg.startsWith('#F');
  return (
    <motion.div
      {...fadeUp(delay)}
      className="rounded-[20px] p-5 relative overflow-hidden"
      style={{
        background: tk.card,
        border: `1px solid ${tk.cardBorder}`,
        boxShadow: isLight ? '0 2px 12px -4px rgba(15,7,3,0.08)' : 'none',
      }}
    >
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: color }} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className="text-[10px] uppercase tracking-[0.22em] font-semibold mb-2"
            style={{ color: tk.textTer }}
          >
            {label}
          </p>
          <p
            className="text-2xl font-black tabular-nums leading-none"
            style={{ color: tk.text }}
          >
            {value}
          </p>
        </div>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${color}18`, color }}
        >
          {icon}
        </div>
      </div>
    </motion.div>
  );
}

// ── Panel shell ──────────────────────────────────────────────────────────────
function Panel({
  children, accentColor = BRAND.primary, className = '',
}: {
  children: React.ReactNode; accentColor?: string; className?: string;
}) {
  const tk = useTokens();
  const isLight = tk.bg === '#FFFBF7' || tk.bg.startsWith('#F');
  return (
    <div
      className={`rounded-[24px] overflow-hidden ${className}`}
      style={{
        background: tk.card,
        border: `1px solid ${tk.cardBorder}`,
        boxShadow: isLight ? '0 2px 16px -6px rgba(15,7,3,0.08)' : 'none',
      }}
    >
      <div
        className="h-[2px]"
        style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }}
      />
      {children}
    </div>
  );
}

// ── Field label ──────────────────────────────────────────────────────────────
function FL({ children }: { children: React.ReactNode }) {
  const tk = useTokens();
  return (
    <label
      className="block text-[10px] font-bold uppercase tracking-widest mb-1.5"
      style={{ color: tk.textTer }}
    >
      {children}
    </label>
  );
}

// ── Session row ──────────────────────────────────────────────────────────────
function SessionRow({ session, saving, onActivate, onEdit }: {
  session: AcademicSessionRecord; saving: boolean;
  onActivate: (id: string) => void; onEdit: (s: AcademicSessionRecord) => void;
}) {
  const tk = useTokens();
  const [hov, setHov] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.32, ease: EASE }}
      onHoverStart={() => setHov(true)}
      onHoverEnd={() => setHov(false)}
      className="rounded-2xl p-4 transition-colors"
      style={{
        background: session.is_active
          ? `${BRAND.primary}0E`
          : hov ? tk.cardHover : tk.card,
        border: `1px solid ${
          session.is_active
            ? `${BRAND.primary}48`
            : hov ? tk.primaryRing : tk.cardBorder
        }`,
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          {/* Status dot */}
          <div className="mt-1 shrink-0">
            {session.is_active ? (
              <motion.div
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: BRAND.mint }}
              />
            ) : (
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: tk.textTer }} />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-sm truncate" style={{ color: tk.text }}>
                {session.label}
              </h3>
              {session.is_active && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
                  style={{ background: `${BRAND.mint}18`, color: BRAND.mint }}
                >
                  <span className="w-1 h-1 rounded-full" style={{ background: BRAND.mint }} />
                  Active
                </span>
              )}
              {session.is_locked && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase"
                  style={{ background: tk.card, color: tk.textSec, border: `1px solid ${tk.cardBorder}` }}
                >
                  <Lock className="w-2.5 h-2.5" /> Locked
                </span>
              )}
            </div>
            <p className="text-xs mt-1 font-mono" style={{ color: tk.textTer }}>
              {session.start_date} → {session.end_date}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!session.is_active && (
            <motion.button
              whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
              onClick={() => onActivate(session.id)}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40"
              style={{
                background: `${BRAND.mint}18`,
                color: BRAND.mint,
                border: `1px solid ${BRAND.mint}30`,
              }}
            >
              Activate
            </motion.button>
          )}
          <motion.button
            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
            onClick={() => onEdit(session)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{
              background: tk.card,
              color: tk.textSec,
              border: `1px solid ${tk.cardBorder}`,
            }}
          >
            Edit
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Term card ────────────────────────────────────────────────────────────────
const TERM_STATUS_COLORS: Record<string, string> = {
  upcoming: BRAND.blue,
  active:   BRAND.mint,
  closing:  BRAND.amber,
  closed:   '#64748b',
};

function TermCard({ term, saving, onActivate, onEdit }: {
  term: AcademicTermRecord; saving: boolean;
  onActivate: (id: string) => void; onEdit: (t: AcademicTermRecord) => void;
}) {
  const tk = useTokens();
  const [hov, setHov] = useState(false);
  const sc = TERM_STATUS_COLORS[term.status] || BRAND.primary;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      onHoverStart={() => setHov(true)}
      onHoverEnd={() => setHov(false)}
      className="rounded-2xl overflow-hidden transition-shadow"
      style={{
        background: hov ? tk.cardHover : tk.card,
        border: `1px solid ${hov ? `${sc}40` : tk.cardBorder}`,
      }}
    >
      <div
        className="h-[2px]"
        style={{ background: `linear-gradient(90deg, ${sc}, transparent)` }}
      />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span
                className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
                style={{ background: `${sc}18`, color: sc }}
              >
                {term.status}
              </span>
              <span className="text-[10px]" style={{ color: tk.textTer }}>
                #{term.sequence}
              </span>
            </div>
            <h3 className="font-bold text-sm" style={{ color: tk.text }}>{term.name}</h3>
            <p className="text-xs mt-0.5 font-mono" style={{ color: tk.textTer }}>
              {term.start_date} → {term.end_date}
            </p>
            {(term.promotion_window_starts_at || term.promotion_window_ends_at) && (
              <p
                className="text-[10px] mt-1.5 flex items-center gap-1"
                style={{ color: BRAND.primary }}
              >
                <Timer className="w-3 h-3" />
                Promo: {term.promotion_window_starts_at || 'TBD'} → {term.promotion_window_ends_at || 'TBD'}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5 shrink-0">
            {term.status !== 'active' && (
              <motion.button
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                onClick={() => onActivate(term.id)}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40"
                style={{
                  background: `${BRAND.mint}18`,
                  color: BRAND.mint,
                  border: `1px solid ${BRAND.mint}30`,
                }}
              >
                Activate
              </motion.button>
            )}
            <motion.button
              whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
              onClick={() => onEdit(term)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{
                background: tk.card,
                color: tk.textSec,
                border: `1px solid ${tk.cardBorder}`,
              }}
            >
              Edit
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Spinner (inline, used in save buttons) ───────────────────────────────────
function BtnSpinner() {
  return (
    <motion.div
      className="w-4 h-4 border-2 rounded-full"
      style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }}
      animate={{ rotate: 360 }}
      transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function OrgAcademicCalendarPage() {
  const { organization }    = useMultiTenantAuth();
  const { settings }        = useOrganization();

  // ── Theme ── exact two-liner from CreateDuePage / MakePaymentPage
  const { theme } = useTheme();
  const tk        = getDashboardTokens(theme);
  const isLight   = theme === 'light';

  const [sessions, setSessions] = useState<AcademicSessionRecord[]>([]);
  const [terms, setTerms]       = useState<AcademicTermRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [saving, setSaving]     = useState(false);

  const [showSessionModal, setShowSessionModal] = useState(false);
  const [showTermModal, setShowTermModal]       = useState(false);
  const [editingSession, setEditingSession]     = useState<AcademicSessionRecord | null>(null);
  const [editingTerm, setEditingTerm]           = useState<AcademicTermRecord | null>(null);
  const [sessionForm, setSessionForm]           = useState<SessionFormData>(DEFAULT_SESSION);
  const [termForm, setTermForm]                 = useState<TermFormData>(DEFAULT_TERM);
  const [formError, setFormError]               = useState('');
  const [settingsSaving, setSettingsSaving]     = useState(false);
  const [settingsMessage, setSettingsMessage]   = useState('');
  const [promotionSettings, setPromotionSettings] = useState<PromotionSettingsForm>({
    auto_promotion_enabled: false,
    promotion_requires_approval: true,
    promotion_grace_days: 14,
  });

  const isAcademicOrg = (
    organization?.organization_type === 'university' ||
    organization?.organization_type === 'school'
  );

  const activeSession  = useMemo(() => sessions.find(s => s.is_active) || null, [sessions]);
  const activeTerm     = useMemo(() => terms.find(t => t.status === 'active') || null, [terms]);
  const currentTerms   = useMemo(
    () => activeSession ? terms.filter(t => t.session_id === activeSession.id) : [],
    [terms, activeSession],
  );

  const fetchData = useCallback(async () => {
    if (!organization) return;
    setLoading(true); setError('');
    try {
      const [sd, td] = await Promise.all([
        organizationService.getAcademicSessions(organization.id),
        organizationService.getAcademicTerms(organization.id),
      ]);
      setSessions(sd); setTerms(td);
    } catch {
      setError('Unable to load the academic calendar right now.');
    } finally {
      setLoading(false);
    }
  }, [organization]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!settings) return;
    setPromotionSettings({
      auto_promotion_enabled:      Boolean(settings.auto_promotion_enabled),
      promotion_requires_approval: settings.promotion_requires_approval ?? true,
      promotion_grace_days:        settings.promotion_grace_days ?? 14,
    });
  }, [settings]);

  // ── Modal helpers ────────────────────────────────────────────────────────
  const openSessionModal = (session?: AcademicSessionRecord) => {
    if (session) {
      setEditingSession(session);
      setSessionForm({
        label: session.label, start_date: session.start_date, end_date: session.end_date,
        is_active: session.is_active, is_locked: session.is_locked,
      });
    } else {
      setEditingSession(null); setSessionForm(DEFAULT_SESSION);
    }
    setFormError(''); setShowSessionModal(true);
  };

  const openTermModal = (term?: AcademicTermRecord) => {
    if (term) {
      setEditingTerm(term);
      setTermForm({
        name: term.name, session_id: term.session_id, sequence: term.sequence,
        start_date: term.start_date, end_date: term.end_date,
        promotion_window_starts_at: term.promotion_window_starts_at || '',
        promotion_window_ends_at:   term.promotion_window_ends_at   || '',
        status: term.status,
      });
    } else {
      setEditingTerm(null);
      setTermForm({
        ...DEFAULT_TERM,
        session_id: activeSession?.id || sessions[0]?.id || '',
        sequence:   currentTerms.length + 1,
      });
    }
    setFormError(''); setShowTermModal(true);
  };

  const closeModals = () => {
    setShowSessionModal(false); setShowTermModal(false);
    setEditingSession(null); setEditingTerm(null); setFormError('');
  };

  // ── Validation ───────────────────────────────────────────────────────────
  const validateSession = () => {
    if (!sessionForm.label.trim())  { setFormError('Session label is required.'); return false; }
    if (!sessionForm.start_date)    { setFormError('Start date is required.'); return false; }
    if (!sessionForm.end_date)      { setFormError('End date is required.'); return false; }
    return true;
  };

  const validateTerm = () => {
    if (!termForm.session_id)    { setFormError('Select a session.'); return false; }
    if (!termForm.name.trim())   { setFormError('Term name is required.'); return false; }
    if (!termForm.start_date)    { setFormError('Start date is required.'); return false; }
    if (!termForm.end_date)      { setFormError('End date is required.'); return false; }
    return true;
  };

  // ── Save handlers ────────────────────────────────────────────────────────
  const saveSession = async () => {
    if (!organization || !validateSession()) return;
    setSaving(true); setFormError('');
    try {
      const p = {
        organization_id: organization.id,
        label: sessionForm.label.trim(),
        start_date: sessionForm.start_date,
        end_date:   sessionForm.end_date,
        is_active:  sessionForm.is_active,
        is_locked:  sessionForm.is_locked,
      };
      if (editingSession) await organizationService.updateAcademicSession(editingSession.id, p);
      else await organizationService.createAcademicSession(p);
      await fetchData(); closeModals();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save session.');
    } finally { setSaving(false); }
  };

  const saveTerm = async () => {
    if (!organization || !validateTerm()) return;
    setSaving(true); setFormError('');
    try {
      const p = {
        organization_id: organization.id,
        session_id: termForm.session_id,
        name:       termForm.name.trim(),
        sequence:   termForm.sequence,
        start_date: termForm.start_date,
        end_date:   termForm.end_date,
        promotion_window_starts_at: termForm.promotion_window_starts_at || null,
        promotion_window_ends_at:   termForm.promotion_window_ends_at   || null,
        status: termForm.status,
      };
      if (editingTerm) await organizationService.updateAcademicTerm(editingTerm.id, p);
      else await organizationService.createAcademicTerm(p);
      await fetchData(); closeModals();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save term.');
    } finally { setSaving(false); }
  };

  const activateSession = async (id: string) => {
    if (!organization) return; setSaving(true);
    try { await organizationService.setActiveAcademicSession(organization.id, id); await fetchData(); }
    finally { setSaving(false); }
  };

  const activateTerm = async (id: string) => {
    if (!organization) return; setSaving(true);
    try { await organizationService.setActiveAcademicTerm(organization.id, id); await fetchData(); }
    finally { setSaving(false); }
  };

  const savePromotionSettings = async () => {
    if (!organization) return;
    setSettingsSaving(true); setSettingsMessage('');
    try {
      const updated = await organizationService.updateSettings(organization.id, {
        auto_promotion_enabled:      promotionSettings.auto_promotion_enabled,
        promotion_requires_approval: promotionSettings.promotion_requires_approval,
        promotion_grace_days: Math.max(0, promotionSettings.promotion_grace_days || 0),
      });
      if (!updated) throw new Error('Unable to save promotion settings.');
      setSettingsMessage('Promotion settings saved successfully.');
    } catch (err) {
      setSettingsMessage(err instanceof Error ? err.message : 'Failed to save.');
    } finally { setSettingsSaving(false); }
  };

  if (!organization) return null;

  const isSettingsError = settingsMessage.toLowerCase().includes('failed') ||
    settingsMessage.toLowerCase().includes('unable');

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <TokensContext.Provider value={tk}>
      <div className="min-h-screen relative" style={{ background: tk.bg }}>

        {/* ── Ambient glows ── */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <motion.div
            className="absolute rounded-full blur-[200px]"
            style={{
              width: 600, height: 600,
              background: `radial-gradient(circle, ${BRAND.primary}, transparent 70%)`,
              top: '-15%', right: '-10%',
              opacity: isLight ? 0.06 : 0.10,
            }}
            animate={{ scale: [1, 1.08, 1], opacity: isLight ? [0.06, 0.09, 0.06] : [0.1, 0.15, 0.1] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute rounded-full blur-[160px]"
            style={{
              width: 400, height: 400,
              background: `radial-gradient(circle, ${BRAND.primary}, transparent 70%)`,
              bottom: '10%', left: '-8%',
              opacity: isLight ? 0.04 : 0.08,
            }}
            animate={{ scale: [1, 1.12, 1] }}
            transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
          />
          {/* Diagonal stripe texture — subtler in light mode */}
          <div
            className="absolute inset-0"
            style={{
              opacity: isLight ? 0.008 : 0.018,
              backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 50px, rgba(255,104,3,0.6) 50px, rgba(255,104,3,0.6) 51px)',
            }}
          />
        </div>

        <PageWrapper>
          <div className="max-w-7xl mx-auto space-y-6 relative z-10">

            {/* ── HERO ── */}
            <motion.div {...fadeUp(0)}>
              <div
                className="rounded-[32px] overflow-hidden relative"
                style={{
                  background: isLight
                    ? `linear-gradient(135deg, ${BRAND.primary}0A, rgba(59,130,246,0.04))`
                    : `linear-gradient(135deg, rgba(255,104,3,0.10), rgba(168,85,247,0.06))`,
                  border: `1px solid ${tk.cardBorder}`,
                  boxShadow: isLight ? '0 4px 24px -8px rgba(15,7,3,0.10)' : 'none',
                }}
              >
                {/* Top brand stripe */}
                <div
                  className="absolute top-0 left-0 right-0 h-[2px]"
                  style={{ background: `linear-gradient(90deg, ${BRAND.primary}, ${BRAND.blue} 50%, transparent)` }}
                />
                {/* Radial glint */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: `radial-gradient(ellipse 50% 60% at 95% 5%, ${BRAND.primary}${isLight ? '0C' : '18'}, transparent)`,
                  }}
                />
                {/* Watermark calendar icon */}
                <div
                  className="absolute -right-8 -top-8 w-64 h-64 pointer-events-none"
                  style={{ color: tk.text, opacity: isLight ? 0.025 : 0.03 }}
                >
                  <Calendar className="w-full h-full" />
                </div>

                <div className="relative p-7 sm:p-10">
                  <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                    <div>
                      {/* Badge */}
                      <div
                        className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] mb-4"
                        style={{
                          background: `${BRAND.primary}14`,
                          border: `1px solid ${BRAND.primary}28`,
                          color: BRAND.primary,
                        }}
                      >
                        <GraduationCap className="w-3 h-3" /> Academic Operations
                      </div>

                      <h1
                        className="text-3xl sm:text-5xl font-black tracking-tight leading-none"
                        style={{ color: tk.text }}
                      >
                        Academic<br />
                        <span style={{ color: BRAND.primary }}>Calendar</span>
                      </h1>
                      <p
                        className="mt-3 text-sm sm:text-base max-w-lg leading-7"
                        style={{ color: tk.textSec }}
                      >
                        Manage sessions, terms, and promotion windows. The active period stays
                        visible to all administrators and members.
                      </p>
                    </div>

                    {/* CTA buttons */}
                    <div className="flex gap-3">
                      <motion.button
                        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                        onClick={() => openSessionModal()}
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold text-white"
                        style={{
                          background: `linear-gradient(135deg, ${BRAND.primary}, #FFAC5F)`,
                          boxShadow: `0 8px 28px ${BRAND.primary}38`,
                        }}
                      >
                        <Plus className="w-4 h-4" /> Session
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                        onClick={() => openTermModal()}
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold"
                        style={{
                          background: tk.card,
                          color: tk.textSec,
                          border: `1px solid ${tk.cardBorder}`,
                        }}
                      >
                        <CalendarDays className="w-4 h-4" /> Term
                      </motion.button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* ── STATS ── */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard label="Sessions"       value={sessions.length}            icon={<Calendar className="w-4 h-4" />}     color={BRAND.primary} delay={0.05} />
              <StatCard label="Terms"          value={terms.length}               icon={<CalendarDays className="w-4 h-4" />} color={BRAND.blue}    delay={0.10} />
              <StatCard label="Active Session" value={activeSession?.label || '—'} icon={<Shield className="w-4 h-4" />}      color={BRAND.mint}    delay={0.15} />
              <StatCard label="Active Term"    value={activeTerm?.name || '—'}    icon={<Clock3 className="w-4 h-4" />}       color={BRAND.primary} delay={0.20} />
            </div>

            {/* ── SESSIONS + TERMS ── */}
            <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">

              {/* Sessions panel */}
              <motion.div {...fadeUp(0.10)}>
                <Panel accentColor={BRAND.primary}>
                  <div className="p-6">
                    <div className="flex items-center justify-between gap-3 mb-5">
                      <div>
                        <h2 className="text-lg font-black" style={{ color: tk.text }}>Sessions</h2>
                        <p className="text-xs mt-0.5" style={{ color: tk.textTer }}>
                          {settings?.current_period_label || 'Academic sessions'}
                        </p>
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                        onClick={() => openSessionModal()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold"
                        style={{
                          background: `${BRAND.primary}14`,
                          color: BRAND.primary,
                          border: `1px solid ${BRAND.primary}28`,
                        }}
                      >
                        <Plus className="w-3.5 h-3.5" /> New
                      </motion.button>
                    </div>

                    {loading ? (
                      <div className="py-10 flex justify-center"><LoadingSpinner size="md" /></div>
                    ) : error ? (
                      <EmptyState
                        illustration="error"
                        title="Load error"
                        description={error}
                        action={<CustomButton variant="secondary" onClick={fetchData}>Retry</CustomButton>}
                      />
                    ) : sessions.length === 0 ? (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-10 text-center">
                        <div
                          className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                          style={{ background: `${BRAND.primary}12` }}
                        >
                          <Calendar className="w-8 h-8" style={{ color: BRAND.primary }} />
                        </div>
                        <p className="font-semibold text-sm" style={{ color: tk.text }}>No sessions yet</p>
                        <p className="text-xs mt-1" style={{ color: tk.textTer }}>Create the first academic session.</p>
                        <motion.button
                          whileHover={{ scale: 1.04 }}
                          onClick={() => openSessionModal()}
                          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                          style={{ background: `linear-gradient(135deg, ${BRAND.primary}, #FFAC5F)` }}
                        >
                          <Plus className="w-4 h-4" /> Create Session
                        </motion.button>
                      </motion.div>
                    ) : (
                      <AnimatePresence>
                        <div className="space-y-2.5">
                          {sessions.map(s => (
                            <SessionRow
                              key={s.id} session={s} saving={saving}
                              onActivate={activateSession} onEdit={openSessionModal}
                            />
                          ))}
                        </div>
                      </AnimatePresence>
                    )}
                  </div>
                </Panel>
              </motion.div>

              {/* Terms panel */}
              <motion.div {...fadeUp(0.14)}>
                <Panel accentColor={BRAND.blue}>
                  <div className="p-6">
                    <div className="flex items-center justify-between gap-3 mb-5">
                      <div>
                        <h2 className="text-lg font-black" style={{ color: tk.text }}>Terms</h2>
                        <p className="text-xs mt-0.5" style={{ color: tk.textTer }}>
                          {activeSession ? `In ${activeSession.label}` : 'Set a session active first'}
                        </p>
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                        onClick={() => openTermModal()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold"
                        style={{
                          background: `${BRAND.blue}14`,
                          color: BRAND.blue,
                          border: `1px solid ${BRAND.blue}28`,
                        }}
                      >
                        <Plus className="w-3.5 h-3.5" /> New
                      </motion.button>
                    </div>

                    {!activeSession ? (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-10 text-center">
                        <div
                          className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                          style={{ background: `${BRAND.blue}12` }}
                        >
                          <CalendarDays className="w-8 h-8" style={{ color: BRAND.blue }} />
                        </div>
                        <p className="font-semibold text-sm" style={{ color: tk.text }}>No active session</p>
                        <p className="text-xs mt-1" style={{ color: tk.textTer }}>
                          Activate a session to manage its terms.
                        </p>
                      </motion.div>
                    ) : currentTerms.length === 0 ? (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-10 text-center">
                        <p className="font-semibold text-sm" style={{ color: tk.text }}>No terms yet</p>
                        <p className="text-xs mt-1" style={{ color: tk.textTer }}>
                          Add the first term for this session.
                        </p>
                        <motion.button
                          whileHover={{ scale: 1.04 }}
                          onClick={() => openTermModal()}
                          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
                          style={{
                            background: `${BRAND.blue}14`,
                            color: BRAND.blue,
                            border: `1px solid ${BRAND.blue}28`,
                          }}
                        >
                          <Plus className="w-4 h-4" /> Create Term
                        </motion.button>
                      </motion.div>
                    ) : (
                      <AnimatePresence>
                        <div className="space-y-2.5">
                          {currentTerms.map(t => (
                            <TermCard
                              key={t.id} term={t} saving={saving}
                              onActivate={activateTerm} onEdit={openTermModal}
                            />
                          ))}
                        </div>
                      </AnimatePresence>
                    )}
                  </div>
                </Panel>
              </motion.div>
            </div>

            {/* ── PROMOTION CONTROLS ── */}
            {isAcademicOrg && (
              <motion.div {...fadeUp(0.20)}>
                <Panel accentColor={BRAND.primary}>
                  <div className="p-6 sm:p-8">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
                      <div className="flex items-center gap-4">
                        <div
                          className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                          style={{
                            background: `${BRAND.primary}18`,
                            border: `1px solid ${BRAND.primary}30`,
                          }}
                        >
                          <Zap className="w-5 h-5" style={{ color: BRAND.primary }} />
                        </div>
                        <div>
                          <h2 className="text-lg font-black" style={{ color: tk.text }}>
                            Promotion Controls
                          </h2>
                          <p className="text-xs mt-0.5" style={{ color: tk.textTer }}>
                            Configure level-up approval and grace windows.
                          </p>
                        </div>
                      </div>

                      <motion.button
                        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                        onClick={savePromotionSettings}
                        disabled={settingsSaving}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                        style={{
                          background: `linear-gradient(135deg, ${BRAND.primary}, #FFAC5F)`,
                          boxShadow: `0 6px 20px ${BRAND.primary}30`,
                        }}
                      >
                        {settingsSaving ? <BtnSpinner /> : <Save className="w-4 h-4" />}
                        Save Controls
                      </motion.button>
                    </div>

                    {/* Settings feedback */}
                    <AnimatePresence>
                      {settingsMessage && (
                        <motion.div
                          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          className="flex items-start gap-2.5 px-4 py-3 rounded-xl mb-5"
                          style={{
                            background: isSettingsError
                              ? `${BRAND.danger}0D`
                              : `${BRAND.mint}0D`,
                            border: `1px solid ${isSettingsError ? BRAND.danger : BRAND.mint}28`,
                          }}
                        >
                          {isSettingsError
                            ? <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: BRAND.danger }} />
                            : <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: BRAND.mint }} />
                          }
                          <p
                            className="text-xs leading-5"
                            style={{ color: isSettingsError ? BRAND.danger : BRAND.mint }}
                          >
                            {settingsMessage}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Toggle cards */}
                    <div className="grid gap-4 lg:grid-cols-2 mb-5">
                      {([
                        {
                          key: 'auto_promotion_enabled',
                          label: 'Enable automatic promotion runs',
                          help: 'Eligible members are prepared automatically at term closure.',
                        },
                        {
                          key: 'promotion_requires_approval',
                          label: 'Require manual approval before commit',
                          help: 'Recommended for auditability and final sign-off.',
                        },
                      ] as const).map(({ key, label, help }) => (
                        <div
                          key={key}
                          className="flex items-start gap-3 p-4 rounded-xl"
                          style={{
                            background: isLight ? 'rgba(15,7,3,0.03)' : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${tk.cardBorder}`,
                          }}
                        >
                          <div className="mt-0.5">
                            <Checkbox
                              checked={promotionSettings[key] as boolean}
                              onChange={e =>
                                setPromotionSettings(prev => ({ ...prev, [key]: e.target.checked }))
                              }
                              label={
                                <span className="font-semibold text-sm" style={{ color: tk.text }}>
                                  {label}
                                </span>
                              }
                              helperText={help}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Grace period */}
                    <div className="max-w-xs">
                      <label
                        className="block text-[10px] font-bold uppercase tracking-widest mb-1.5"
                        style={{ color: tk.textTer }}
                      >
                        Grace Period (days)
                      </label>
                      <Input
                        type="number" min={0}
                        value={promotionSettings.promotion_grace_days}
                        onChange={e =>
                          setPromotionSettings(prev => ({
                            ...prev,
                            promotion_grace_days: Number(e.target.value) || 0,
                          }))
                        }
                        helperText="Days after term end when promotions can still be finalized."
                        fullWidth
                      />
                    </div>
                  </div>
                </Panel>
              </motion.div>
            )}
          </div>
        </PageWrapper>

        {/* ════════════════════════════════════════════════════════
            SESSION MODAL
        ════════════════════════════════════════════════════════ */}
        <Modal
          isOpen={showSessionModal}
          onClose={closeModals}
          title={editingSession ? 'Edit Session' : 'Create Session'}
          size="lg"
        >
          <div className="space-y-4">
            <AnimatePresence>
              {formError && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex items-start gap-2.5 p-3 rounded-xl"
                  style={{ background: `${BRAND.danger}0D`, border: `1px solid ${BRAND.danger}28` }}
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: BRAND.danger }} />
                  <p className="text-xs" style={{ color: BRAND.danger }}>{formError}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <FL>Session Label</FL>
              <Input
                placeholder="e.g. 2025/2026 Academic Session"
                value={sessionForm.label}
                onChange={e => setSessionForm(p => ({ ...p, label: e.target.value }))}
                fullWidth
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FL>Start Date</FL>
                <ProfessionalDateTimePicker
                  value={sessionForm.start_date}
                  onChange={v => setSessionForm(p => ({ ...p, start_date: v }))}
                  fullWidth
                />
              </div>
              <div>
                <FL>End Date</FL>
                <ProfessionalDateTimePicker
                  value={sessionForm.end_date}
                  onChange={v => setSessionForm(p => ({ ...p, end_date: v }))}
                  fullWidth
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Checkbox
                checked={sessionForm.is_active}
                onChange={e => setSessionForm(p => ({ ...p, is_active: e.target.checked }))}
                label={<span className="text-sm" style={{ color: tk.text }}>Mark as active session</span>}
                helperText="Only one session should be active at a time."
              />
              <Checkbox
                checked={sessionForm.is_locked}
                onChange={e => setSessionForm(p => ({ ...p, is_locked: e.target.checked }))}
                label={<span className="text-sm" style={{ color: tk.text }}>Lock this session</span>}
                helperText="Locked sessions are treated as closed."
              />
            </div>
          </div>

          <div className="mt-6 flex gap-3 justify-end">
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={closeModals} disabled={saving}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: isLight ? 'rgba(15,7,3,0.05)' : 'rgba(255,255,255,0.05)', color: tk.textSec }}
            >
              Cancel
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={saveSession} disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
              style={{ background: `linear-gradient(135deg, ${BRAND.primary}, #FFAC5F)` }}
            >
              {saving ? <BtnSpinner /> : <Save className="w-4 h-4" />}
              Save Session
            </motion.button>
          </div>
        </Modal>

        {/* ════════════════════════════════════════════════════════
            TERM MODAL
        ════════════════════════════════════════════════════════ */}
        <Modal
          isOpen={showTermModal}
          onClose={closeModals}
          title={editingTerm ? 'Edit Term' : 'Create Term'}
          size="lg"
        >
          <div className="space-y-4">
            <AnimatePresence>
              {formError && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex items-start gap-2.5 p-3 rounded-xl"
                  style={{ background: `${BRAND.danger}0D`, border: `1px solid ${BRAND.danger}28` }}
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: BRAND.danger }} />
                  <p className="text-xs" style={{ color: BRAND.danger }}>{formError}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <ProfessionalDropdown
              label="Session"
              value={termForm.session_id}
              onChange={v => setTermForm(p => ({ ...p, session_id: v as string }))}
              placeholder="Select session"
              options={sessions.map(s => ({
                value: s.id,
                label: s.label,
                description: s.is_active ? 'Active session' : `${s.start_date} to ${s.end_date}`,
              }))}
            />

            <div>
              <FL>Term Name</FL>
              <Input
                placeholder="e.g. First Semester"
                value={termForm.name}
                onChange={e => setTermForm(p => ({ ...p, name: e.target.value }))}
                fullWidth
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FL>Sequence</FL>
                <Input
                  type="number" min={1}
                  value={termForm.sequence}
                  onChange={e => setTermForm(p => ({ ...p, sequence: Number(e.target.value) || 1 }))}
                  fullWidth
                />
              </div>
              <ProfessionalDropdown
                label="Status"
                value={termForm.status}
                onChange={v => setTermForm(p => ({ ...p, status: v as AcademicTermRecord['status'] }))}
                options={[
                  { value: 'upcoming', label: 'Upcoming' },
                  { value: 'active',   label: 'Active' },
                  { value: 'closing',  label: 'Closing' },
                  { value: 'closed',   label: 'Closed' },
                ]}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FL>Start Date</FL>
                <ProfessionalDateTimePicker
                  value={termForm.start_date}
                  onChange={v => setTermForm(p => ({ ...p, start_date: v }))}
                  fullWidth
                />
              </div>
              <div>
                <FL>End Date</FL>
                <ProfessionalDateTimePicker
                  value={termForm.end_date}
                  onChange={v => setTermForm(p => ({ ...p, end_date: v }))}
                  fullWidth
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FL>Promotion Window Starts</FL>
                <ProfessionalDateTimePicker
                  mode="datetime"
                  value={termForm.promotion_window_starts_at}
                  onChange={v => setTermForm(p => ({ ...p, promotion_window_starts_at: v }))}
                  fullWidth
                />
              </div>
              <div>
                <FL>Promotion Window Ends</FL>
                <ProfessionalDateTimePicker
                  mode="datetime"
                  value={termForm.promotion_window_ends_at}
                  onChange={v => setTermForm(p => ({ ...p, promotion_window_ends_at: v }))}
                  fullWidth
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-3 justify-end">
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={closeModals} disabled={saving}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: isLight ? 'rgba(15,7,3,0.05)' : 'rgba(255,255,255,0.05)', color: tk.textSec }}
            >
              Cancel
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={saveTerm} disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
              style={{ background: `linear-gradient(135deg, ${BRAND.primary}, #FFAC5F)` }}
            >
              {saving ? <BtnSpinner /> : <Sparkles className="w-4 h-4" />}
              Save Term
            </motion.button>
          </div>
        </Modal>

      </div>
    </TokensContext.Provider>
  );
}