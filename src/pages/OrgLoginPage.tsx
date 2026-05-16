/**
 * OrgLoginPage — Organization-scoped login
 * Route: /:orgSlug/login
 *
 * Design decisions:
 * - Department picker is GONE from the form flow. The user already chose it
 *   on OrgOverviewPage (?group=... is in the URL). We display it as a small
 *   dismissable chip so the user knows their context and can swap if needed.
 * - Left panel: immersive org branding with animated background geometry.
 * - Right panel: clean, focused login form with micro-interactions.
 */

import { useState, useEffect } from 'react';
import {
  Lock,
  User,
  AlertCircle,
  Info,
  ArrowLeft,
  Building2,
  Eye,
  EyeOff,
  ChevronRight,
  Layers,
} from 'lucide-react';
import { colors } from '@/config/colors';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useNavigate, useParams, Link, useSearchParams, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import PageWrapper from '@/components/ui/PageWrapper';
import { organizationService } from '@/services/organizationService';
import type { Organization, OrganizationGroup } from '@/types/multiTenant';
import { APP_NAME } from '@/config/constants';

// ── Design tokens (mirrors OrgOverviewPage) ──────────────────────────────────
const tk = {
  cardBg:        'rgba(255,255,255,0.03)',
  cardBorder:    'rgba(255,255,255,0.08)',
  textSecondary: 'rgba(255,255,255,0.55)',
  textTertiary:  'rgba(255,255,255,0.32)',
  primary:       '#FF6803',
};

// ── Tiny helpers ──────────────────────────────────────────────────────────────
function orgColor(org: Organization | null) {
  return org?.primary_color || tk.primary;
}

// ── Animated background orbs (left panel) ────────────────────────────────────
function BackgroundOrbs({ color }: { color: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Large slow orb */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 480,
          height: 480,
          top: '-15%',
          left: '-20%',
          background: `radial-gradient(circle, ${color}28 0%, transparent 65%)`,
          filter: 'blur(2px)',
        }}
        animate={{ x: [0, 24, 0], y: [0, -16, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Mid orb */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 320,
          height: 320,
          bottom: '5%',
          right: '-10%',
          background: `radial-gradient(circle, ${color}1A 0%, transparent 60%)`,
          filter: 'blur(1px)',
        }}
        animate={{ x: [0, -18, 0], y: [0, 22, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
      />
      {/* Tiny accent */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 120,
          height: 120,
          top: '55%',
          left: '10%',
          background: `radial-gradient(circle, ${color}20 0%, transparent 70%)`,
        }}
        animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
      />
      {/* Grid lines */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.04]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
    </div>
  );
}

// ── Feature list item ─────────────────────────────────────────────────────────
function Feature({ text, delay, color }: { text: string; delay: number; color: string }) {
  return (
    <motion.div
      className="flex items-center gap-3"
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: color, boxShadow: `0 0 6px ${color}` }}
      />
      <p className="text-sm" style={{ color: tk.textSecondary }}>{text}</p>
    </motion.div>
  );
}

// ── Group chip (replaces the group picker) ────────────────────────────────────
function GroupChip({
  group,
  org,
  orgSlug,
}: {
  group: OrganizationGroup | undefined;
  org: Organization | null;
  orgSlug: string | undefined;
}) {
  const color = orgColor(org);
  if (!group) return null;
  const levelText = group.levels?.length ? group.levels.join(' · ') : '';
  return (
    <motion.div
      className="flex items-center gap-2 mb-5"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.35 }}
    >
      <span
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
        style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
      >
        <Layers className="w-3 h-3" />
        {group.name}
        {group.kind && (
          <span
            className="ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] uppercase tracking-wide font-bold"
            style={{ background: `${color}25`, color }}
          >
            {group.kind}
          </span>
        )}
      </span>
      {levelText && (
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold"
          style={{ background: 'rgba(255,255,255,0.05)', color: tk.textSecondary, border: `1px solid ${tk.cardBorder}` }}
        >
          Level
          <span style={{ color }}>{levelText}</span>
        </span>
      )}
      <Link
        to={`/${orgSlug}`}
        className="inline-flex items-center gap-1 text-[11px] font-medium hover:underline transition-colors"
        style={{ color: tk.textTertiary }}
      >
        Change
        <ChevronRight className="w-3 h-3" />
      </Link>
    </motion.div>
  );
}

// ── Password input with show/hide ─────────────────────────────────────────────
function PasswordInput({
  value,
  onChange,
  label,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder: string;
  disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium" style={{ color: tk.textSecondary }}>
        {label}
      </label>
      <div
        className="relative flex items-center rounded-xl transition-all"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: `1px solid ${focused ? tk.primary : tk.cardBorder}`,
          boxShadow: focused ? `0 0 0 3px ${tk.primary}18` : 'none',
        }}
      >
        <Lock className="absolute left-3.5 w-4 h-4 shrink-0" style={{ color: focused ? tk.primary : tk.textTertiary }} />
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoComplete="current-password"
          className="w-full pl-10 pr-10 py-3 bg-transparent text-sm text-white placeholder:text-white/20 outline-none"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3.5 p-0.5 transition-colors"
          style={{ color: show ? tk.primary : tk.textTertiary }}
          tabIndex={-1}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ── Member ID input ───────────────────────────────────────────────────────────
function MemberIdInput({
  value,
  onChange,
  label,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder: string;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium" style={{ color: tk.textSecondary }}>
        {label}
      </label>
      <div
        className="relative flex items-center rounded-xl transition-all"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: `1px solid ${focused ? tk.primary : tk.cardBorder}`,
          boxShadow: focused ? `0 0 0 3px ${tk.primary}18` : 'none',
        }}
      >
        <User className="absolute left-3.5 w-4 h-4 shrink-0" style={{ color: focused ? tk.primary : tk.textTertiary }} />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoComplete="username"
          className="w-full pl-10 pr-4 py-3 bg-transparent text-sm text-white placeholder:text-white/20 outline-none"
        />
      </div>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <PageWrapper centered noPadding>
      <div className="flex flex-col items-center gap-4">
        <motion.div
          className="w-10 h-10 border-2 rounded-full"
          style={{ borderColor: `${tk.primary}30`, borderTopColor: tk.primary }}
          animate={{ rotate: 360 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
        />
        <p className="text-sm" style={{ color: tk.textTertiary }}>Loading organization…</p>
      </div>
    </PageWrapper>
  );
}

// ── Not found ─────────────────────────────────────────────────────────────────
function NotFoundScreen({ orgSlug }: { orgSlug?: string }) {
  return (
    <PageWrapper centered noPadding className="p-4 sm:p-6 lg:p-8">
      <motion.div
        className="text-center space-y-6 max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto"
          style={{ background: `${colors.statusUnpaid}15` }}
        >
          <Building2 size={36} style={{ color: colors.statusUnpaid }} />
        </div>
        <h2 className="text-2xl font-bold text-white">Organization Not Found</h2>
        <p style={{ color: tk.textSecondary }}>
          We couldn't find an organization at{' '}
          <strong className="text-white">/{orgSlug}</strong>.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-white"
          style={{ background: tk.primary }}
        >
          <ArrowLeft size={18} /> Find your organization
        </Link>
      </motion.div>
    </PageWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function OrgLoginPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const [memberId, setMemberId]   = useState('');
  const [password, setPassword]   = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);

  const [org, setOrg]             = useState<Organization | null>(null);
  const [groups, setGroups]       = useState<OrganizationGroup[]>([]);
  const [orgLoading, setOrgLoading]   = useState(true);
  const [orgNotFound, setOrgNotFound] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<OrganizationGroup | undefined>();

  const { login, isAuthenticated, user, needsPasswordChange } = useMultiTenantAuth();
  const navigate = useNavigate();
  const fromLocation = (location.state as { from?: { pathname: string; search?: string } } | null)?.from;
  const backTarget = fromLocation ? `${fromLocation.pathname}${fromLocation.search || ''}` : `/${orgSlug}`;
  const afterLoginTarget = fromLocation ? backTarget : `/${orgSlug}/dashboard`;

  // ── Fetch org + groups ──
  useEffect(() => {
    if (!orgSlug) return;
    setOrgLoading(true);
    organizationService
      .getBySlug(orgSlug)
      .then((data) => {
        if (!data) { setOrgNotFound(true); return; }
        setOrg(data);
        return organizationService.getGroups(data.id).then(setGroups).catch(() => setGroups([]));
      })
      .catch(() => setOrgNotFound(true))
      .finally(() => setOrgLoading(false));
  }, [orgSlug]);

  // ── Resolve selected group from URL param ──
  useEffect(() => {
    if (!groups.length) return;
    const gid = searchParams.get('group');
    const match = gid ? groups.find((g) => g.id === gid) : undefined;
    setSelectedGroup(match ?? groups[0]);
  }, [groups, searchParams]);

  // ── Redirect if already authenticated ──
  useEffect(() => {
    if (isAuthenticated && user && orgSlug) {
      if (needsPasswordChange) {
        navigate(`/${orgSlug}/change-password`, { replace: true });
      } else {
        navigate(`/${orgSlug}/dashboard`, { replace: true });
      }
    }
  }, [isAuthenticated, user, needsPasswordChange, navigate, orgSlug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgSlug) return;
    setError('');
    setLoading(true);
    try {
      const result = await login(memberId, password, orgSlug);

      if (selectedGroup?.id && result.member.group_id && result.member.group_id !== selectedGroup.id) {
        setError(
          `This account belongs to a different ${org?.group_label?.toLowerCase() || 'department'}. Please choose the correct one.`
        );
        setLoading(false);
        return;
      }

      if (!result.member.group_id) {
        navigate(`/${orgSlug}/join`, {
          state: { message: 'Please select or create your department to continue', memberId: result.member.id, autoSelect: true },
          replace: true,
        });
        return;
      }

      if (result.mustChangePassword) {
        navigate(`/${orgSlug}/change-password`, { replace: true });
      } else {
        navigate(afterLoginTarget, { replace: true });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (orgLoading) return <LoadingScreen />;
  if (orgNotFound) return <NotFoundScreen orgSlug={orgSlug} />;

  const color          = orgColor(org);
  const memberLabel    = org?.member_label || 'Member';
  const groupLabel     = org?.group_label  || 'Department';
  const memberIdLabel  = org?.organization_type === 'university' ? 'Registration Number' : `${memberLabel} ID`;
  const memberIdPH     = org?.organization_type === 'university' ? 'e.g., 2024/274804' : `Enter your ${memberLabel} ID`;

  return (
    <PageWrapper centered noPadding className="min-h-screen p-0">
      <div className="w-full min-h-screen lg:grid lg:grid-cols-[1fr_1fr] xl:grid-cols-[1.1fr_0.9fr]">

        {/* ── LEFT: Immersive org branding panel ── */}
        <motion.div
          className="hidden lg:flex flex-col justify-between relative overflow-hidden p-10 xl:p-14"
          style={{
            background: `linear-gradient(145deg, #0a0402 0%, #110601 60%, rgba(${hexToRgb(color)},0.08) 100%)`,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
        >
          <BackgroundOrbs color={color} />

          <div className="relative space-y-8 z-10">
            {/* Org avatar + name */}
            <motion.div
              className="flex items-center gap-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.45 }}
            >
              {org?.logo_url ? (
                <img src={org.logo_url} alt={org.name} className="w-14 h-14 rounded-2xl object-cover" />
              ) : (
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-extrabold text-white"
                  style={{
                    background: `linear-gradient(135deg, ${color} 0%, ${lighten(color)} 100%)`,
                    boxShadow: `0 8px 24px ${color}40`,
                  }}
                >
                  {org?.short_name?.charAt(0) || 'O'}
                </div>
              )}
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] font-semibold mb-0.5" style={{ color: tk.textTertiary }}>
                  Member Access
                </p>
                <h1 className="text-xl font-extrabold text-white leading-tight">{org?.name}</h1>
                <p className="text-xs mt-0.5" style={{ color: tk.textTertiary }}>
                  {org?.short_name} · Powered by {APP_NAME}
                </p>
              </div>
            </motion.div>

            {/* Headline */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28, duration: 0.45 }}
            >
              <h2 className="text-4xl xl:text-5xl font-extrabold leading-[1.1] text-white">
                Welcome<br />
                <span style={{ color }}>back.</span>
              </h2>
              <p className="mt-4 text-base leading-7" style={{ color: tk.textSecondary }}>
                Sign in to manage your {org?.payment_label?.toLowerCase() || 'payments'}, track your
                history, and stay connected with your {groupLabel.toLowerCase()}.
              </p>
            </motion.div>

            {/* Features */}
            <div className="space-y-3 pt-2">
              {[
                'Real-time payment tracking',
                'Secure, scoped access',
                'Instant payment notifications',
                'Complete dues history',
              ].map((f, i) => (
                <Feature key={f} text={f} delay={0.42 + i * 0.08} color={color} />
              ))}
            </div>
          </div>

          {/* Bottom: selected group context */}
          <motion.div
            className="relative z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            {selectedGroup && (
              <div
                className="rounded-2xl p-4 flex items-center gap-3"
                style={{ background: `${color}0D`, border: `1px solid ${color}20` }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${color}20` }}
                >
                  <Layers className="w-4 h-4" style={{ color }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: tk.textTertiary }}>
                    Logging into
                  </p>
                  {selectedGroup.levels?.length ? (
                    <p className="text-[10px] uppercase tracking-[0.2em] mb-1" style={{ color: tk.textTertiary }}>
                      Level {selectedGroup.levels.join(' · ')}
                    </p>
                  ) : null}
                  <p className="text-sm font-bold text-white truncate">{selectedGroup.name}</p>
                  {selectedGroup.kind && (
                    <p className="text-[10px] capitalize" style={{ color: tk.textTertiary }}>{selectedGroup.kind}</p>
                  )}
                </div>
                <Link
                  to={`/${orgSlug}`}
                  className="ml-auto shrink-0 text-[11px] font-semibold hover:underline transition-colors"
                  style={{ color }}
                >
                  Change
                </Link>
              </div>
            )}
          </motion.div>
        </motion.div>

        {/* ── RIGHT: Login form panel ── */}
        <div className="flex flex-col justify-center p-6 sm:p-10 lg:p-12 xl:p-16">

          {/* Mobile org header */}
          <motion.div
            className="flex lg:hidden flex-col items-center mb-8"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            {org?.logo_url ? (
              <img src={org.logo_url} alt={org.name} className="w-14 h-14 rounded-2xl object-cover mb-3" />
            ) : (
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-extrabold text-white mb-3"
                style={{ background: `linear-gradient(135deg, ${color} 0%, ${lighten(color)} 100%)` }}
              >
                {org?.short_name?.charAt(0) || 'O'}
              </div>
            )}
            <h1 className="text-lg font-bold text-white">{org?.name}</h1>
            <p className="text-xs mt-0.5" style={{ color: tk.textTertiary }}>Powered by {APP_NAME}</p>
          </motion.div>

          <div className="w-full max-w-2xl mx-auto space-y-7">

            {/* Back links */}
            <motion.div className="flex flex-wrap items-center gap-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
              <button
                type="button"
                onClick={() => navigate(backTarget)}
                className="inline-flex items-center gap-1.5 text-xs font-medium hover:underline transition-colors"
                style={{ color: tk.textTertiary }}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
                style={{ color: color, background: `${color}14`, border: `1px solid ${color}22` }}
              >
                Change organization
              </Link>
            </motion.div>

            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.4 }}
            >
              <h2 className="text-3xl font-extrabold text-white">Sign in</h2>
              <p className="mt-1.5 text-sm" style={{ color: tk.textSecondary }}>
                Enter your credentials to continue.
              </p>
            </motion.div>

            {/* Group chip (replaces the full department picker) */}
            <GroupChip group={selectedGroup} org={org} orgSlug={orgSlug} />

            {/* Info banner */}
            <motion.div
              className="flex items-start gap-3 p-3.5 rounded-2xl"
              style={{ background: `${color}12`, border: `1px solid ${color}28` }}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <Info className="w-4 h-4 mt-0.5 shrink-0" style={{ color }} />
              <p className="text-xs leading-5" style={{ color }}>
                First time? Use your {memberIdLabel.toLowerCase()} as both username and password — you'll be prompted to create a new one.
              </p>
            </motion.div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  className="flex items-start gap-3 p-3.5 rounded-2xl"
                  style={{ background: `${colors.statusUnpaid}14`, border: `1px solid ${colors.statusUnpaid}38` }}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.25 }}
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: colors.statusUnpaid }} />
                  <p className="text-sm leading-5" style={{ color: colors.statusUnpaid }}>{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Form card */}
            <motion.div
              className="rounded-[32px] p-8 sm:p-10 space-y-7"
              style={{
                background: 'linear-gradient(180deg, rgba(24,11,5,0.98) 0%, rgba(12,6,3,0.9) 100%)',
                border: `1px solid ${color}44`,
                boxShadow: `0 0 0 1px ${color}18, 0 34px 76px -18px rgba(0,0,0,0.82), 0 0 48px ${color}20, inset 0 1px 0 rgba(255,255,255,0.05)`,
                backdropFilter: 'blur(20px)',
              }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="h-1 w-24 rounded-full mb-2" style={{ background: `linear-gradient(90deg, ${color} 0%, #FFB36B 100%)` }} />
              <form onSubmit={handleSubmit} className="space-y-6">
                <MemberIdInput
                  label={memberIdLabel}
                  value={memberId}
                  onChange={setMemberId}
                  placeholder={memberIdPH}
                  disabled={loading}
                />

                <div className="space-y-1">
                  <PasswordInput
                    label="Password"
                    value={password}
                    onChange={setPassword}
                    placeholder="Enter your password"
                    disabled={loading}
                  />
                  <div className="text-right pt-1">
                    <Link
                      to={`/${orgSlug}/forgot-password`}
                      className="text-[11px] font-semibold hover:underline transition-colors"
                      style={{ color }}
                    >
                      Forgot password?
                    </Link>
                  </div>
                </div>

                {/* Submit button */}
                <motion.button
                  type="submit"
                  disabled={loading || !memberId || !password}
                  className="w-full py-4.5 rounded-2xl text-base font-bold text-white relative overflow-hidden transition-all"
                  style={{
                    background: loading || !memberId || !password
                      ? 'rgba(255,255,255,0.08)'
                      : `linear-gradient(135deg, ${color} 0%, #FFB36B 100%)`,
                    boxShadow: loading || !memberId || !password
                      ? 'none'
                      : `0 14px 34px ${color}4C`,
                    color: loading || !memberId || !password ? tk.textTertiary : '#fff',
                    cursor: loading || !memberId || !password ? 'not-allowed' : 'pointer',
                  }}
                  whileHover={!loading && memberId && password ? { scale: 1.015 } : {}}
                  whileTap={!loading && memberId && password ? { scale: 0.985 } : {}}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <motion.span
                        className="w-4 h-4 border-2 rounded-full border-white/30 border-t-white block"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                      />
                      Signing in…
                    </span>
                  ) : (
                    'Sign In'
                  )}
                </motion.button>
              </form>
            </motion.div>

            {/* Footer */}
            <motion.p
              className="text-center text-xs leading-6"
              style={{ color: tk.textTertiary }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55 }}
            >
              Having trouble? Contact your{' '}
              <span className="text-white/60">{org?.admin_label?.toLowerCase() || 'admin'}</span>{' '}
              for assistance.
            </motion.p>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}

// ── Colour utilities ──────────────────────────────────────────────────────────
/** Lighten a hex colour slightly for gradient end-stops */
function lighten(hex: string): string {
  try {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, ((n >> 16) & 0xff) + 40);
    const g = Math.min(255, ((n >> 8)  & 0xff) + 20);
    const b = Math.min(255, ( n        & 0xff) + 10);
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  } catch {
    return hex;
  }
}

/** Convert hex to "R,G,B" string for CSS rgba() */
function hexToRgb(hex: string): string {
  try {
    const n = parseInt(hex.replace('#', ''), 16);
    return `${(n >> 16) & 0xff},${(n >> 8) & 0xff},${n & 0xff}`;
  } catch {
    return '255,104,3';
  }
}