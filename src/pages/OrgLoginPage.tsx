/**
 * OrgLoginPage — Organization-scoped login
 * Route: /:orgSlug/login
 *
 * Design: Editorial luxury — near-black canvas, generous white space,
 * restrained use of the brand accent, confident typography.
 */

import { useState, useEffect } from 'react';
import {
  Lock,
  User,
  AlertCircle,
  ArrowLeft,
  Building2,
  Eye,
  EyeOff,
  ChevronRight,
  Layers,
  Info,
} from 'lucide-react';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { getDashboardTokens, useTheme } from '@/hooks/useTheme';
import { useNavigate, useParams, Link, useSearchParams, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import PageWrapper from '@/components/ui/PageWrapper';
import { organizationService } from '@/services/organizationService';
import type { Organization, OrganizationGroup } from '@/types/multiTenant';
import { APP_NAME } from '@/config/constants';

// ── Token sheet — read core tokens from the central design system
type LoginTokens = {
  pageBase: string;
  leftPanel: string;
  rightPanel: string;
  inputBg: string;
  inputBgHov: string;
  borderFaint: string;
  borderMid: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  accentDim: string;
  accentBorder: string;
};

function buildLoginTokens(theme: 'light' | 'dark'): LoginTokens {
  const dtk = getDashboardTokens(theme);
  return {
    pageBase: dtk.bg,
    leftPanel: theme === 'light' ? '#FFF5EA' : '#120904',
    rightPanel: theme === 'light' ? '#FFFFFF' : '#1A0E09',
    inputBg: theme === 'light' ? 'rgba(15,7,3,0.04)' : 'rgba(255,255,255,0.045)',
    inputBgHov: theme === 'light' ? 'rgba(15,7,3,0.06)' : 'rgba(255,255,255,0.07)',
    borderFaint: dtk.cardBorder,
    borderMid: dtk.primaryRing,
    textPrimary: dtk.text,
    textSecondary: dtk.textSec,
    textTertiary: dtk.textTer,
    accent: dtk.primary,
    accentDim: dtk.primarySoft,
    accentBorder: dtk.primaryRing,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function orgAccent(org: Organization | null, fallback: string) {
  return org?.primary_color || fallback;
}

function lighten(hex: string): string {
  try {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, ((n >> 16) & 0xff) + 36);
    const g = Math.min(255, ((n >>  8) & 0xff) + 18);
    const b = Math.min(255, ( n        & 0xff) + 8);
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  } catch { return hex; }
}

function hexToRgb(hex: string): string {
  try {
    const n = parseInt(hex.replace('#', ''), 16);
    return `${(n >> 16) & 0xff},${(n >> 8) & 0xff},${n & 0xff}`;
  } catch { return '255,104,3'; }
}

// ── Loading ───────────────────────────────────────────────────────────────────
function LoadingScreen({ tk }: { tk: LoginTokens }) {
  return (
    <PageWrapper centered noPadding style={{ background: tk.pageBase, color: tk.textPrimary }}>
      <div className="flex flex-col items-center gap-4">
        <motion.div
          className="w-9 h-9 border-[1.5px] rounded-full"
          style={{ borderColor: `${tk.accent}30`, borderTopColor: tk.accent, borderRightColor: tk.accentDim }}
          animate={{ rotate: 360 }}
          transition={{ duration: 0.85, repeat: Infinity, ease: 'linear' }}
        />
        <p className="text-xs tracking-wider" style={{ color: tk.textTertiary }}>
          Loading…
        </p>
      </div>
    </PageWrapper>
  );
}

// ── Not-found ─────────────────────────────────────────────────────────────────
function NotFoundScreen({ orgSlug, tk }: { orgSlug?: string; tk: LoginTokens }) {
  return (
    <PageWrapper centered noPadding className="p-6" style={{ background: tk.pageBase, color: tk.textPrimary }}>
      <motion.div
        className="text-center space-y-5 max-w-sm"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
          style={{ background: `${tk.accent}12`, border: `1px solid ${tk.accentBorder}` }}
        >
          <Building2 size={28} style={{ color: tk.accent }} />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Organization not found</h2>
        <p className="text-sm leading-6" style={{ color: tk.textSecondary }}>
          No organization exists at <strong style={{ color: tk.textPrimary }}>/{orgSlug}</strong>.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: `linear-gradient(135deg, ${tk.accent}, ${lighten(tk.accent)})`, color: '#FFFFFF' }}
        >
          <ArrowLeft size={16} /> Find your organization
        </Link>
      </motion.div>
    </PageWrapper>
  );
}

// ── Left panel geometric art ───────────────────────────────────────────────────
function LeftArt({ color }: { color: string }) {
  const rgb = hexToRgb(color);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Giant arc — the single hero element */}
      <svg
        className="absolute"
        style={{ top: '-10%', right: '-30%', width: '75%', height: '120%', opacity: 0.9 }}
        viewBox="0 0 400 600"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="arcGrad" cx="30%" cy="40%" r="70%">
            <stop offset="0%" stopColor={`rgba(${rgb},0.18)`} />
            <stop offset="60%" stopColor={`rgba(${rgb},0.06)`} />
            <stop offset="100%" stopColor={`rgba(${rgb},0)`} />
          </radialGradient>
        </defs>
        {/* Outer arc */}
        <circle cx="400" cy="300" r="300" stroke={`rgba(${rgb},0.12)`} strokeWidth="0.5" fill="none" />
        <circle cx="400" cy="300" r="240" stroke={`rgba(${rgb},0.08)`} strokeWidth="0.5" fill="none" />
        <circle cx="400" cy="300" r="180" stroke={`rgba(${rgb},0.06)`} strokeWidth="0.5" fill="none" />
        {/* Filled half-disc */}
        <path
          d="M400,0 A300,300 0 0,0 400,600 Z"
          fill="url(#arcGrad)"
        />
      </svg>

      {/* Subtle noise texture via repeating pattern */}
      <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.025 }}>
        <defs>
          <pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.8" fill="white" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots)" />
      </svg>

      {/* Horizontal rule near bottom */}
      <div
        className="absolute bottom-32 left-10 right-10"
        style={{ height: '1px', background: `linear-gradient(90deg, ${color}30, transparent)` }}
      />
    </div>
  );
}

// ── Group chip ────────────────────────────────────────────────────────────────
function GroupChip({
  group, org, orgSlug, tk,
}: {
  group: OrganizationGroup | undefined;
  org: Organization | null;
  orgSlug?: string;
  tk: LoginTokens;
}) {
  const color = orgAccent(org, tk.accent);
  if (!group) return null;
  const levelText = group.levels?.length ? `Level ${group.levels.join(' · ')}` : '';

  return (
    <motion.div
      className="flex flex-wrap items-center gap-2"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, duration: 0.35 }}
    >
      <span
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
        style={{ background: `${color}14`, color, border: `1px solid ${color}28` }}
      >
        <Layers className="w-3 h-3" />
        {group.name}
        {group.kind && (
          <span className="ml-1 opacity-70 text-[10px] uppercase tracking-wider">
            · {group.kind}
          </span>
        )}
      </span>
      {levelText && (
        <span
          className="text-[11px] px-2.5 py-1 rounded-full font-medium"
          style={{ background: tk.inputBg, color: tk.textSecondary, border: `1px solid ${tk.borderFaint}` }}
        >
          {levelText}
        </span>
      )}
      <Link
        to={`/${orgSlug}/overview`}
        className="inline-flex items-center gap-0.5 text-[11px] font-medium transition-colors"
        style={{ color }}
      >
        Change <ChevronRight className="w-3 h-3" />
      </Link>
    </motion.div>
  );
}

// ── Text input base ────────────────────────────────────────────────────────────
function TextInput({
  label, value, onChange, placeholder, disabled, icon: Icon, type = 'text',
  autoComplete, rightSlot, tk,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  icon: React.ElementType;
  type?: string;
  autoComplete?: string;
  rightSlot?: React.ReactNode;
  tk: LoginTokens;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="space-y-2">
      <label
        className="block text-[11px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: focused ? tk.accent : tk.textTertiary }}
      >
        {label}
      </label>
      <div
        className="relative flex items-center transition-all duration-150"
        style={{
          background: focused ? tk.inputBgHov : tk.inputBg,
          border: `1px solid ${focused ? `${tk.accent}50` : tk.borderFaint}`,
          borderRadius: 14,
          boxShadow: focused ? `0 0 0 3px ${tk.accent}14` : 'none',
        }}
      >
        <Icon
          className="absolute left-4 w-[15px] h-[15px] shrink-0 transition-colors"
          style={{ color: focused ? tk.accent : tk.textTertiary }}
        />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoComplete={autoComplete}
          className="w-full pl-11 pr-4 py-4 bg-transparent text-sm font-medium placeholder:font-normal outline-none"
          style={{ color: tk.textPrimary, caretColor: tk.accent }}
        />
        {rightSlot && <div className="absolute right-3">{rightSlot}</div>}
      </div>
    </div>
  );
}

// ── Password input ────────────────────────────────────────────────────────────
function PasswordInput({
  label, value, onChange, placeholder, disabled, tk,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; disabled?: boolean;
  tk: LoginTokens;
}) {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <div className="space-y-2">
      <label
        className="block text-[11px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: focused ? tk.accent : tk.textTertiary }}
      >
        {label}
      </label>
      <div
        className="relative flex items-center transition-all duration-150"
        style={{
          background: focused ? tk.inputBgHov : tk.inputBg,
          border: `1px solid ${focused ? `${tk.accent}50` : tk.borderFaint}`,
          borderRadius: 14,
          boxShadow: focused ? `0 0 0 3px ${tk.accent}14` : 'none',
        }}
      >
        <Lock
          className="absolute left-4 w-[15px] h-[15px] shrink-0 transition-colors"
          style={{ color: focused ? tk.accent : tk.textTertiary }}
        />
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoComplete="current-password"
          className="w-full pl-11 pr-12 py-4 bg-transparent text-sm font-medium outline-none"
          style={{ color: tk.textPrimary, caretColor: tk.accent }}
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          tabIndex={-1}
          className="absolute right-4 p-0.5 transition-colors"
          style={{ color: show ? tk.accent : tk.textTertiary }}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function OrgLoginPage() {
  const { orgSlug }         = useParams<{ orgSlug: string }>();
  const [searchParams]      = useSearchParams();
  const location            = useLocation();

  const [memberId,  setMemberId]  = useState('');
  const [password,  setPassword]  = useState('');
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);

  const [org,         setOrg]         = useState<Organization | null>(null);
  const [groups,      setGroups]      = useState<OrganizationGroup[]>([]);
  const [orgLoading,  setOrgLoading]  = useState(true);
  const [orgNotFound, setOrgNotFound] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<OrganizationGroup | undefined>();

  // Wrong-door detection: if the visitor previously signed in to a DIFFERENT
  // org slug, we surface a non-intrusive banner so they can hop back without
  // typing the wrong credentials here. Read once on mount.
  const [lastOrgSlug, setLastOrgSlug] = useState<string | null>(null);
  const [showIdHelp, setShowIdHelp] = useState(false);
  useEffect(() => {
    try {
      const s = localStorage.getItem('pvx_org_slug');
      if (s) setLastOrgSlug(s);
    } catch { /* private mode, etc. */ }
  }, []);

  const { login, isAuthenticated, user, needsPasswordChange } = useMultiTenantAuth();
  const { theme } = useTheme();
  const tk = buildLoginTokens(theme);
  const navigate = useNavigate();

  const fromLocation   = (location.state as { from?: { pathname: string; search?: string } } | null)?.from;
  const backTarget     = fromLocation ? `${fromLocation.pathname}${fromLocation.search || ''}` : `/${orgSlug}`;
  const afterLoginTarget = fromLocation ? backTarget : `/${orgSlug}/dashboard`;

  // ── Fetch org ──
  useEffect(() => {
    if (!orgSlug) return;
    setOrgLoading(true);
    organizationService.getBySlug(orgSlug)
      .then(data => {
        if (!data) { setOrgNotFound(true); return; }
        setOrg(data);
        return organizationService.getGroups(data.id)
          .then(setGroups)
          .catch(() => setGroups([]));
      })
      .catch(() => setOrgNotFound(true))
      .finally(() => setOrgLoading(false));
  }, [orgSlug]);

  // ── Resolve group from URL ──
  useEffect(() => {
    if (!groups.length) return;
    const gid   = searchParams.get('group');
    const match = gid ? groups.find(g => g.id === gid) : undefined;
    setSelectedGroup(match ?? groups[0]);
  }, [groups, searchParams]);

  // ── Redirect if already authenticated ──
  useEffect(() => {
    if (isAuthenticated && user && orgSlug) {
      if (needsPasswordChange) navigate(`/${orgSlug}/change-password`, { replace: true });
      else navigate(`/${orgSlug}/dashboard`, { replace: true });
    }
  }, [isAuthenticated, user, needsPasswordChange, navigate, orgSlug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgSlug) return;
    setError('');
    setLoading(true);
    try {
      const result = await login(memberId, password, orgSlug, selectedGroup?.id);

      if (!result.member.group_id) {
        navigate(`/${orgSlug}/join`, {
          state: { message: 'Please select or create your department to continue', memberId: result.member.id },
          replace: true,
        });
        return;
      }

      if (result.mustChangePassword) navigate(`/${orgSlug}/change-password`, { replace: true });
      else navigate(afterLoginTarget, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (orgLoading)  return <LoadingScreen tk={tk} />;
  if (orgNotFound) return <NotFoundScreen orgSlug={orgSlug} tk={tk} />;

  const color         = orgAccent(org, tk.accent);
  const rgb           = hexToRgb(color);
  const memberLabel   = org?.member_label  || 'Member';
  const groupLabel    = org?.group_label   || 'Department';
  const isUniversity  = org?.organization_type === 'university';
  const idLabel       = isUniversity ? 'Registration Number' : `${memberLabel} ID`;
  const idPlaceholder = isUniversity ? 'e.g., 2024/274804' : `Your ${memberLabel} ID`;
  const canSubmit     = memberId.trim().length > 0 && password.length > 0;

  return (
    <div
      className="min-h-screen flex"
      style={{ background: tk.pageBase }}
    >
      {/* ══════════════════════════════════════════════
          LEFT  — Editorial brand panel
      ══════════════════════════════════════════════ */}
      <motion.div
        className="hidden lg:flex flex-col relative overflow-hidden"
        style={{
          width: '44%',
          flexShrink: 0,
          background: tk.leftPanel,
          borderRight: `1px solid ${tk.borderFaint}`,
          color: tk.textPrimary,  // descendants inherit themed text (was only)
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <LeftArt color={tk.accent} />

        {/* Top bar */}
        <div
          className="relative z-10 flex items-center justify-between px-10 pt-9"
        >
          <div className="flex items-center gap-3">
            {org?.logo_url ? (
              <img src={org.logo_url} alt={org.name} className="w-8 h-8 rounded-lg object-cover" />
            ) : (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                style={{ background: color, color: '#FFFFFF' }}
              >
                {org?.short_name?.charAt(0) || 'O'}
              </div>
            )}
            <span className="text-sm font-semibold tracking-tight">{org?.short_name || org?.name}</span>
          </div>
          <span
            className="text-[10px] px-2.5 py-1 rounded-full font-medium uppercase tracking-wider"
            style={{ background: tk.inputBg, color: tk.textTertiary, border: `1px solid ${tk.borderFaint}` }}
          >
            {APP_NAME}
          </span>
        </div>

        {/* Main copy — positioned at vertical center */}
        <div className="relative z-10 flex-1 flex flex-col justify-center px-10 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Eyebrow */}
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.2em] mb-5"
              style={{ color }}
            >
              Member Portal
            </p>

            {/* Headline — large & confident */}
            <h1
              className="text-5xl xl:text-6xl font-black leading-[1.02] tracking-[-0.03em] mb-6"
            >
              {org?.name ? (
                <>
                  {org.name.split(' ').slice(0, 2).join(' ')}
                  {org.name.split(' ').length > 2 && (
                    <><br /><span style={{ color }}>{org.name.split(' ').slice(2).join(' ')}</span></>
                  )}
                </>
              ) : (
                <>Your<br /><span style={{ color }}>Account.</span></>
              )}
            </h1>

            {/* Sub-copy */}
            <p
              className="text-sm leading-7 max-w-xs"
              style={{ color: tk.textSecondary }}
            >
              Manage payments, track dues and stay connected with your {groupLabel.toLowerCase()}. Everything in one place.
            </p>
          </motion.div>

          {/* Divider */}
          <motion.div
            className="my-10"
            style={{ height: 1, background: `linear-gradient(90deg, ${color}30, transparent 70%)` }}
            initial={{ scaleX: 0, originX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.5, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />

          {/* Stat pills */}
          <motion.div
            className="flex flex-col gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55, duration: 0.4 }}
          >
            {[
              { label: 'Real-time payment status',   val: '✓' },
              { label: 'Scoped, secure access',       val: '✓' },
              { label: 'Full dues history',           val: '✓' },
              { label: 'Instant notifications',       val: '✓' },
            ].map(({ label, val }, i) => (
              <motion.div
                key={label}
                className="flex items-center justify-between"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + i * 0.07 }}
              >
                <span className="text-sm" style={{ color: tk.textSecondary }}>{label}</span>
                <span
                  className="text-[11px] font-bold px-2 py-0.5 rounded"
                  style={{ background: `${color}18`, color }}
                >
                  {val}
                </span>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Bottom: context box if group is selected */}
        {selectedGroup && (
          <motion.div
            className="relative z-10 px-10 pb-9"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.4 }}
          >
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{
                background: `rgba(${rgb},0.07)`,
                border: `1px solid rgba(${rgb},0.18)`,
              }}
            >
              <Layers className="w-4 h-4 shrink-0" style={{ color }} />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: tk.textTertiary }}>
                  Logging into
                </p>
                {selectedGroup.levels?.length ? (
                  <p className="text-[10px]" style={{ color: tk.textTertiary }}>
                    Level {selectedGroup.levels.join(' · ')}
                  </p>
                ) : null}
                <p className="text-sm font-semibold truncate">{selectedGroup.name}</p>
              </div>
              <Link
                to={`/${orgSlug}/overview`}
                className="text-[11px] font-semibold shrink-0 hover:underline"
                style={{ color }}
              >
                Change
              </Link>
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* ══════════════════════════════════════════════
          RIGHT — Form panel
      ══════════════════════════════════════════════ */}
      <div
        className="flex-1 flex flex-col"
        style={{ background: tk.rightPanel, color: tk.textPrimary }}
      >
        {/* Thin top accent line */}
        <div style={{ height: 2, background: `linear-gradient(90deg, ${color} 0%, transparent 60%)` }} />

        <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-16 xl:px-20 py-12">
          <div className="w-full max-w-md mx-auto">

            {/* Mobile org header */}
            <motion.div
              className="flex lg:hidden items-center gap-3 mb-8"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {org?.logo_url ? (
                <img src={org.logo_url} alt={org.name} className="w-9 h-9 rounded-xl object-cover" />
              ) : (
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold"
                  style={{ background: color, color: '#FFFFFF' }}
                >
                  {org?.short_name?.charAt(0) || 'O'}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold">{org?.name}</p>
                <p className="text-[10px]" style={{ color: tk.textTertiary }}>Powered by {APP_NAME}</p>
              </div>
            </motion.div>

            {/* Back / org switch row */}
            <motion.div
              className="flex items-center gap-4 mb-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <button
                type="button"
                onClick={() => navigate(backTarget)}
                className="flex items-center gap-1.5 text-xs font-medium transition-colors"
                style={{ color: tk.textTertiary }}
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <div style={{ width: 1, height: 14, background: tk.borderFaint }} />
              <Link
                to="/"
                className="text-xs font-medium transition-colors"
                style={{ color }}
              >
                Switch organization
              </Link>
            </motion.div>

            {/* Title block */}
            <motion.div
              className="mb-8"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4 }}
            >
              <h2
                className="text-4xl font-black tracking-[-0.03em] mb-2"
              >
                Sign in
              </h2>
              <p className="text-sm" style={{ color: tk.textSecondary }}>
                Enter your credentials to continue to your {groupLabel.toLowerCase()}.
              </p>
            </motion.div>

            {/* Group chip */}
            <div className="mb-7">
              <GroupChip group={selectedGroup} org={org} orgSlug={orgSlug} tk={tk} />
            </div>

            {/* Wrong-door banner — your last session was a DIFFERENT org */}
            {lastOrgSlug && orgSlug && lastOrgSlug !== orgSlug && (
              <motion.div
                className="flex items-start gap-2.5 p-3.5 rounded-xl mb-5"
                style={{
                  background: `${tk.accent}10`,
                  border: `1px solid ${tk.accent}30`,
                }}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Building2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: tk.accent }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm" style={{ color: tk.textPrimary }}>
                    You last signed in to <span className="font-semibold">/{lastOrgSlug}</span>.
                  </p>
                  <p className="text-[11px] mt-0.5 leading-5" style={{ color: tk.textSecondary }}>
                    If you're at the wrong door, jump back —{' '}
                    <Link to={`/${lastOrgSlug}/login`} className="font-semibold underline" style={{ color: tk.accent }}>
                      go to /{lastOrgSlug}/login
                    </Link>
                    {' '}or sign in here with credentials for this org.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  className="flex items-start gap-2.5 p-3.5 rounded-xl mb-6"
                  style={{
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.22)',
                  }}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
                  <p className="text-sm" style={{ color: tk.textSecondary }}>{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Form */}
            <motion.form
              onSubmit={handleSubmit}
              className="space-y-5"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <div>
                <TextInput
                  label={idLabel}
                  value={memberId}
                  onChange={setMemberId}
                  placeholder={idPlaceholder}
                  disabled={loading}
                  icon={User}
                  autoComplete="username"
                  tk={tk}
                />
                <div className="flex justify-end mt-2">
                  <button
                    type="button"
                    onClick={() => setShowIdHelp((v) => !v)}
                    className="text-[11px] font-medium transition-opacity hover:opacity-70"
                    style={{ color: tk.textTertiary }}
                  >
                    Forgot your {idLabel.toLowerCase()}?
                  </button>
                </div>
                <AnimatePresence>
                  {showIdHelp && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden mt-2"
                    >
                      <div
                        className="p-3 rounded-xl text-[11px] leading-5"
                        style={{
                          background: tk.inputBg,
                          border: `1px solid ${tk.borderFaint}`,
                          color: tk.textSecondary,
                        }}
                      >
                        Your {idLabel.toLowerCase()} is the {isUniversity ? 'matric/registration number' : 'login ID'} you used when you joined — usually issued by your{' '}
                        <span style={{ color: tk.textPrimary, fontWeight: 600 }}>
                          {org?.admin_label?.toLowerCase() || 'admin'}
                        </span>.
                        {' '}If you've forgotten it, check the welcome email from{' '}
                        <span style={{ color: tk.textPrimary, fontWeight: 600 }}>{org?.name}</span>
                        {' '}or message your admin. (Your password is separate — use the "Forgot password" link below.)
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div>
                <PasswordInput
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  placeholder="Enter your password"
                  disabled={loading}
                  tk={tk}
                />
                <div className="flex justify-end mt-2">
                  <Link
                    to={`/${orgSlug}/forgot-password`}
                    className="text-[11px] font-medium transition-opacity hover:opacity-70"
                    style={{ color }}
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>

              {/* First-time hint */}
              <div
                className="flex items-start gap-2.5 p-3 rounded-xl"
                style={{ background: tk.inputBg, border: `1px solid ${tk.borderFaint}` }}
              >
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: tk.textTertiary }} />
                <p className="text-[11px] leading-5" style={{ color: tk.textTertiary }}>
                  First time? Use your {idLabel.toLowerCase()} as both username and password — you'll be prompted to change it.
                </p>
              </div>

              {/* Submit */}
              <motion.button
                type="submit"
                disabled={loading || !canSubmit}
                className="w-full py-4 rounded-2xl text-sm font-bold tracking-wide relative overflow-hidden transition-all"
                style={{
                  background: canSubmit && !loading
                    ? `linear-gradient(135deg, ${color} 0%, ${lighten(color)} 100%)`
                    : `linear-gradient(135deg, rgba(${rgb},0.08), rgba(${rgb},0.03))`,
                  color: '#fff',
                  border: `1px solid ${canSubmit && !loading ? 'transparent' : tk.borderFaint}`,
                  boxShadow: canSubmit && !loading ? `0 12px 32px rgba(${rgb},0.22)` : 'none',
                  cursor: loading || !canSubmit ? 'not-allowed' : 'pointer',
                  
                }}
                whileHover={canSubmit && !loading ? { scale: 1.01, boxShadow: `0 16px 40px rgba(${rgb},0.28)` } : {}}
                whileTap={canSubmit && !loading ? { scale: 0.985 } : {}}
              >
                {/* Shimmer on hover */}
                {canSubmit && !loading && (
                  <motion.div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.15) 50%, transparent 65%)',
                    }}
                    initial={{ x: '-100%' }}
                    whileHover={{ x: '100%' }}
                    transition={{ duration: 0.5, ease: 'easeInOut' }}
                  />
                )}
                <span className="relative">
                  {loading ? (
                    <span className="flex items-center justify-center gap-2.5">
                      <motion.span
                        className="w-3.5 h-3.5 border-[1.5px] rounded-full"
                        style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }}
                        animate={{ rotate: 360 }}
                        transition={{ duration: 0.75, repeat: Infinity, ease: 'linear' }}
                      />
                      Signing in…
                    </span>
                  ) : 'Sign in'}
                </span>
              </motion.button>
            </motion.form>

            {/* Footer */}
            <motion.p
              className="mt-8 text-center text-[11px]"
              style={{ color: tk.textTertiary }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              Trouble signing in? Contact your{' '}
              <span style={{ color: tk.textSecondary }}>
                {org?.admin_label?.toLowerCase() || 'administrator'}
              </span>.
            </motion.p>
          </div>
        </div>

        {/* Bottom wordmark */}
        <div className="px-12 pb-8 text-center lg:text-right">
          <p className="text-[10px] tracking-wider" style={{ color: tk.textTertiary }}>
            Secured by <span className="font-semibold" style={{ color: tk.textSecondary }}>{APP_NAME}</span>
          </p>
        </div>
      </div>
    </div>
  );
}