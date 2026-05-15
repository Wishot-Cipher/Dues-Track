import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Globe,
  Search,
  Shield,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import PageWrapper from '@/components/ui/PageWrapper';
import { APP_NAME } from '@/config/constants';
import { organizationService } from '@/services/organizationService';
import type { Organization, OrganizationGroup } from '@/types/multiTenant';

// ── Local design tokens (consistent with app system) ──
const tk = {
  cardBg:     'rgba(255,255,255,0.03)',
  cardBorder: 'rgba(255,255,255,0.08)',
  hoverBorder:'rgba(255,104,3,0.35)',
  textSecondary: 'rgba(255,255,255,0.55)',
  textTertiary:  'rgba(255,255,255,0.32)',
  primary: '#FF6803',
  accentMint: '#30FFAC',
};

// ── Kind label → color ──
const KIND_COLORS: Record<string, string> = {
  department: '#8b5cf6',
  faculty:    '#3b82f6',
  class:      '#f59e0b',
  general:    '#06b6d4',
  year:       '#10b981',
  level:      '#ec4899',
};
function kindColor(kind?: string) {
  return KIND_COLORS[kind?.toLowerCase() || ''] || tk.primary;
}

// ── Stagger container ──
const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show:   { opacity: 1, y: 0 },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Loading screen
// ─────────────────────────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <PageWrapper centered noPadding className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <motion.div
          className="w-10 h-10 border-2 rounded-full"
          style={{ borderColor: `${tk.primary}30`, borderTopColor: tk.primary }}
          animate={{ rotate: 360 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
        />
        <p className="text-sm" style={{ color: tk.textTertiary }}>
          Loading organization…
        </p>
      </div>
    </PageWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Not found screen
// ─────────────────────────────────────────────────────────────────────────────
function NotFoundScreen({ orgSlug, onBack }: { orgSlug?: string; onBack: () => void }) {
  return (
    <PageWrapper centered noPadding className="p-4 sm:p-6 lg:p-8">
      <motion.div
        className="w-full max-w-md rounded-[28px] p-8 sm:p-10 text-center"
        style={{ background: tk.cardBg, border: `1px solid ${tk.cardBorder}` }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div
          className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
          style={{ background: `${tk.primary}18` }}
        >
          <Building2 className="w-8 h-8" style={{ color: tk.primary }} />
        </div>
        <h1 className="text-2xl font-bold text-white">Organization not found</h1>
        <p className="mt-3 text-sm leading-6" style={{ color: tk.textSecondary }}>
          We couldn't find an organization at{' '}
          <span className="text-white font-semibold">/{orgSlug}</span>.
          It may have been removed or the link may be incorrect.
        </p>
        <motion.button
          onClick={onBack}
          className="mt-6 px-6 py-3 rounded-xl font-semibold text-sm text-white"
          style={{ background: 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)' }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          Back to search
        </motion.button>
      </motion.div>
    </PageWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Group Card
// ─────────────────────────────────────────────────────────────────────────────
function GroupCard({
  group,
  index,
  groupLabel,
  onClick,
}: {
  group: OrganizationGroup;
  index: number;
  groupLabel: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const kc = kindColor(group.kind);
  const levelText = group.levels?.length ? group.levels.join(' · ') : '';

  return (
    <motion.button
      variants={itemVariants}
      onClick={onClick}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="text-left rounded-2xl p-5 w-full transition-colors relative overflow-hidden"
      style={{
        background: hovered ? 'rgba(255,104,3,0.05)' : tk.cardBg,
        border: `1px solid ${hovered ? tk.hoverBorder : tk.cardBorder}`,
      }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
    >
      {/* Index number — subtle watermark */}
      <span
        className="absolute top-4 right-4 text-[11px] font-bold tabular-nums select-none"
        style={{ color: hovered ? `${tk.primary}60` : tk.textTertiary }}
      >
        {String(index + 1).padStart(2, '0')}
      </span>

      {/* Kind badge */}
      {group.kind && (
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide mb-3"
          style={{ background: `${kc}18`, color: kc }}
        >
          {group.kind}
        </span>
      )}

      {levelText && (
        <div className="mb-2 flex items-center gap-2">
          <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
            style={{ background: 'rgba(255,104,3,0.12)', color: tk.primary }}
          >
            Level
          </span>
          <span className="text-[11px] font-semibold" style={{ color: tk.textSecondary }}>
            {levelText}
          </span>
        </div>
      )}

      <p className="text-white font-bold text-base leading-snug pr-8">{group.name}</p>
      <p className="text-[11px] mt-0.5 font-mono uppercase tracking-widest" style={{ color: tk.textTertiary }}>
        {group.short_name}
      </p>

      {group.description && (
        <p className="mt-3 text-sm leading-6 line-clamp-2" style={{ color: tk.textSecondary }}>
          {group.description}
        </p>
      )}

      <div
        className="mt-4 flex items-center justify-between text-xs pt-3"
        style={{ borderTop: `1px solid ${hovered ? 'rgba(255,104,3,0.15)' : tk.cardBorder}` }}
      >
        <span style={{ color: tk.textTertiary }}>
          {groupLabel}
        </span>
        <span
          className="inline-flex items-center gap-1 font-semibold transition-all"
          style={{ color: hovered ? tk.primary : tk.textSecondary }}
        >
          Continue
          <motion.span animate={{ x: hovered ? 3 : 0 }} transition={{ duration: 0.2 }}>
            <ArrowRight className="w-3.5 h-3.5" />
          </motion.span>
        </span>
      </div>
    </motion.button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function OrgOverviewPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();

  const [loading, setLoading]   = useState(true);
  const [org, setOrg]           = useState<Organization | null>(null);
  const [groups, setGroups]     = useState<OrganizationGroup[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!orgSlug) return;
      setLoading(true);
      try {
        const orgData = await organizationService.getBySlug(orgSlug);
        if (!mounted) return;
        setOrg(orgData);
        if (orgData) {
          const groupData = await organizationService.getGroups(orgData.id);
          if (mounted) setGroups(groupData);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [orgSlug]);

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.short_name.toLowerCase().includes(q) ||
        (g.description || '').toLowerCase().includes(q)
    );
  }, [groups, searchQuery]);

  const goToLogin = (group?: OrganizationGroup) => {
    if (!orgSlug) return;
    const params = new URLSearchParams();
    if (group?.id) params.set('group', group.id);
    navigate(`/${orgSlug}/login${params.toString() ? `?${params.toString()}` : ''}`);
  };

  const goToJoinOrg = () => {
    const orgSlugValue = org?.slug;
    if (!orgSlugValue) return;
    const params = new URLSearchParams();
    params.set('org', orgSlugValue);
    navigate(`/join-org?${params.toString()}`);
  };

  if (loading) return <LoadingScreen />;
  if (!org)    return <NotFoundScreen orgSlug={orgSlug} onBack={() => navigate('/')} />;

  const groupLabel       = org.group_label || 'Group';
  const groupLabelPlural = org.group_label_plural || 'Groups';

  return (
    <PageWrapper centered noPadding className="p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-6xl space-y-5">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <motion.div
          className="rounded-[32px] p-6 sm:p-8 lg:p-10 overflow-hidden relative"
          style={{
            background: 'linear-gradient(135deg, rgba(255,104,3,0.13), rgba(255,255,255,0.02))',
            border: `1px solid ${tk.cardBorder}`,
          }}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Radial glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse 60% 55% at 90% 10%, rgba(255,104,3,0.16), transparent)',
            }}
          />

          <div className="relative grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 items-start lg:items-center">
            {/* Left: org identity + description */}
            <div className="space-y-5">
              {/* Org avatar + name */}
              <div className="flex items-start sm:items-center gap-3 sm:gap-4 flex-wrap">
                <div className="relative shrink-0">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-extrabold text-xl"
                    style={{
                      background: 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)',
                      boxShadow: '0 8px 24px rgba(255,104,3,0.35)',
                    }}
                  >
                    {org.short_name?.slice(0, 1) || 'O'}
                  </div>
                  {/* Active ring */}
                  <span
                    className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 flex items-center justify-center"
                    style={{
                      background: '#22c55e',
                      borderColor: '#0F0703',
                    }}
                  />
                </div>
                <div>
                  <p
                    className="text-[10px] uppercase tracking-[0.25em] font-semibold mb-0.5"
                    style={{ color: tk.textTertiary }}
                  >
                    Organization Access
                  </p>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight break-words max-w-full">
                    {org.name}
                  </h1>
                </div>
              </div>

              <p className="max-w-xl text-sm sm:text-base leading-7" style={{ color: tk.textSecondary }}>
                Choose the {groupLabelPlural.toLowerCase()} you belong to, then continue
                to a login scoped to that exact team — clean, secure, and easy to track.
              </p>

              {/* Pill tags */}
              <div className="flex flex-wrap gap-2">
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                  style={{ background: `${tk.primary}18`, color: tk.primary }}
                >
                  <Shield className="w-3.5 h-3.5" /> Secure access
                </span>
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                  style={{ background: 'rgba(255,255,255,0.05)', color: tk.textSecondary }}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Member-first login
                </span>
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold capitalize"
                  style={{ background: 'rgba(255,255,255,0.05)', color: tk.textSecondary }}
                >
                  <Globe className="w-3.5 h-3.5" /> {org.organization_type}
                </span>
              </div>
            </div>

            {/* Right: quick-stats grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Groups count */}
              <div
                className="rounded-2xl p-4 relative overflow-hidden"
                style={{ background: tk.cardBg, border: `1px solid ${tk.cardBorder}` }}
              >
                <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: tk.primary }} />
                <p className="text-[10px] uppercase tracking-wider" style={{ color: tk.textTertiary }}>
                  {groupLabelPlural}
                </p>
                <p className="mt-2 text-2xl font-bold text-white">{groups.length}</p>
              </div>

              {/* Type */}
              <div
                className="rounded-2xl p-4 relative overflow-hidden capitalize"
                style={{ background: tk.cardBg, border: `1px solid ${tk.cardBorder}` }}
              >
                <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: '#3b82f6' }} />
                <p className="text-[10px] uppercase tracking-wider" style={{ color: tk.textTertiary }}>
                  Type
                </p>
                <p className="mt-2 text-2xl font-bold text-white">{org.organization_type}</p>
              </div>

              {/* Hint card */}
              <div
                className="col-span-2 rounded-2xl p-4 flex items-center gap-3"
                style={{ background: `${tk.primary}09`, border: `1px solid ${tk.primary}20` }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${tk.primary}18` }}
                >
                  <Sparkles className="w-4 h-4" style={{ color: tk.primary }} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    Start with your {groupLabel.toLowerCase()}
                  </p>
                  <p className="text-[11px] leading-5 mt-0.5" style={{ color: tk.textTertiary }}>
                    Don't see yours? Request one or ask an admin.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <div className="grid lg:grid-cols-[1fr_300px] gap-5 items-start">

          {/* Groups panel */}
          <motion.div
            className="rounded-[28px] p-5 sm:p-6"
            style={{ background: tk.cardBg, border: `1px solid ${tk.cardBorder}` }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Panel header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Select a {groupLabel.toLowerCase()}
                </h2>
                <p className="text-xs mt-0.5" style={{ color: tk.textTertiary }}>
                  {groups.length} {groupLabelPlural.toLowerCase()} available
                </p>
              </div>

              {/* Search */}
              <div className="relative w-full sm:w-72">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: tk.textTertiary }}
                />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search ${groupLabelPlural.toLowerCase()}…`}
                  className="w-full pl-9 pr-9 py-2.5 rounded-xl text-sm text-white outline-none focus:ring-2 focus:ring-orange-500/30 transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: `1px solid ${tk.cardBorder}`,
                  }}
                />
                <AnimatePresence>
                  {searchQuery && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                    >
                      <X className="w-3.5 h-3.5" style={{ color: tk.textTertiary }} />
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Group cards grid */}
            {filteredGroups.length > 0 ? (
              <motion.div
                className="grid sm:grid-cols-2 gap-3"
                variants={listVariants}
                initial="hidden"
                animate="show"
              >
                {filteredGroups.map((group, i) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    index={i}
                    groupLabel={groupLabel}
                    onClick={() => goToLogin(group)}
                  />
                ))}
              </motion.div>
            ) : (
              <motion.div
                className="rounded-2xl p-8 text-center"
                style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${tk.cardBorder}` }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <Building2
                  className="w-10 h-10 mx-auto mb-3 opacity-30"
                  style={{ color: tk.textTertiary }}
                />
                <p className="font-semibold text-white text-sm">
                  {searchQuery ? `No results for "${searchQuery}"` : `No ${groupLabelPlural.toLowerCase()} yet`}
                </p>
                <p className="mt-1 text-xs leading-5" style={{ color: tk.textTertiary }}>
                  {searchQuery
                    ? 'Try a different search term or browse all groups.'
                    : "If you're the first member, ask an admin to create one or join via invite."}
                </p>
                {!searchQuery && (
                  <motion.button
                    onClick={() => navigate('/join-org')}
                    className="mt-5 px-5 py-2.5 rounded-xl text-sm text-white font-semibold"
                    style={{ background: 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)' }}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    Request a {groupLabel.toLowerCase()}
                  </motion.button>
                )}
              </motion.div>
            )}
          </motion.div>

          {/* Sidebar */}
          <motion.aside
            className="rounded-[28px] p-5 sm:p-6 sticky top-6 space-y-5"
            style={{ background: tk.cardBg, border: `1px solid ${tk.cardBorder}` }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Help header */}
            <div>
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                style={{ background: `${tk.primary}18` }}
              >
                <Users className="w-4 h-4" style={{ color: tk.primary }} />
              </div>
              <h3 className="text-base font-bold text-white">Need help?</h3>
              <p className="mt-1.5 text-sm leading-6" style={{ color: tk.textSecondary }}>
                If your {groupLabel.toLowerCase()} isn't listed, you can create one — or ask
                your admin to add it.
              </p>
            </div>

            {/* Divider */}
            <div style={{ borderTop: `1px solid ${tk.cardBorder}` }} />

            {/* CTAs */}
            <div className="space-y-2.5">
              <motion.button
                onClick={() => goToLogin()}
                className="w-full px-4 py-3 rounded-xl text-sm font-semibold transition-colors"
                style={{ background: `${tk.primary}18`, color: tk.primary }}
                whileHover={{ scale: 1.02, background: `${tk.primary}25` }}
                whileTap={{ scale: 0.98 }}
              >
                I already know my {groupLabel.toLowerCase()}
              </motion.button>
              <motion.button
                onClick={goToJoinOrg}
                className="w-full px-4 py-3 rounded-xl text-sm font-semibold"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  color: tk.textSecondary,
                  border: `1px solid ${tk.cardBorder}`,
                }}
                whileHover={{ scale: 1.02, color: '#fff' }}
                whileTap={{ scale: 0.98 }}
              >
                Create / join a {groupLabel.toLowerCase()}
              </motion.button>
            </div>

            {/* Footer note */}
            <p className="text-[11px] leading-5" style={{ color: tk.textTertiary }}>
              Powered by {APP_NAME}. Access is scoped per {groupLabel.toLowerCase()} —
              your data stays private to your team.
            </p>
          </motion.aside>
        </div>
      </div>
    </PageWrapper>
  );
}