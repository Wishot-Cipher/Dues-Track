/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * OrgLayout - Premium authenticated layout for org-scoped routes
 * Wraps all /:orgSlug/* protected pages
 * 
 * Features:
 * - Glassmorphism top bar with subtle glow
 * - Bottom tab navigation for mobile (iOS/Android style)
 * - Animated active indicators with glowing pill
 * - Role badge for admins
 * - Profile dropdown with smooth transitions
 * - Collapsible admin section
 */

import { useEffect, useState, useRef } from 'react';
import { Outlet, useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  CreditCard,
  Users,
  Settings,
  LogOut,
  ChevronDown,
  Shield,
  Building2,
  CheckCircle2,
  PieChart,
  Receipt,
  UserCog,
  BadgeDollarSign,
  ClipboardCheck,
  QrCode,
  HandCoins,
  Heart,
  Wallet,
  Banknote,
  CalendarDays,
  LayoutGrid,
  Ticket as TicketIcon,
  ScanLine,
  X as XIcon,
} from 'lucide-react';
// import Footer from '@/components/Footer';
import { colors, glows, glass } from '@/config/colors';
import { isAcademicOrgType } from '@/config/constants';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useActiveRole } from '@/hooks/useActiveRole';
import { useTheme } from '@/hooks/useTheme';
import { useThemeTokens, type ThemeTokens } from '@/hooks/useThemeTokens';
import { supabase } from '@/config/supabase';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { NotificationCenter } from '@/components/NotificationCenter';
import { organizationService } from '@/services/organizationService';
import { multiTenantAuthService, type MembershipSummary } from '@/services/multiTenantAuthService';
import RoleSwitcher from '@/components/RoleSwitcher';
import RoleSwitcherSheet from '@/components/RoleSwitcherSheet';

/* ─────────────────────── types ─────────────────────── */
interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  mobileIcon?: React.ReactNode;
  section?: 'member' | 'admin';
  permission?: string;
  hideOnMobile?: boolean;
  /**
   * Minimum admin scope required to see this tool. Used for tools that
   * only make sense at higher tiers — billing, org structure, academic
   * calendar, payout setup, public contributions. A group-scope class
   * rep shouldn't see them; a dept-scope unit exec sees the unit ones.
   */
  minScope?: 'org' | 'unit';
  /**
   * Maximum admin scope. Tools that are LOCAL to a class — scanning
   * QR codes at a class venue, checking attendees in, approving the
   * class's own payments — clutter higher-tier dashboards if they
   * leak up. A dept/faculty exec shouldn't be reviewing individual
   * payments; that stays with the class rep closest to the student.
   */
  maxScope?: 'group' | 'unit';
  /**
   * Admin-only grouping for the dropdown / sheet. Keeps the cluttered admin
   * nav visually digestible: Overview · Money · Structure · Org-level.
   */
  adminGroup?: 'overview' | 'money' | 'structure' | 'org';
}

const ADMIN_GROUP_ORDER: Array<{ id: NonNullable<NavItem['adminGroup']>; label: string }> = [
  { id: 'overview',  label: 'Overview' },
  { id: 'money',     label: 'Money' },
  { id: 'structure', label: 'Structure' },
  { id: 'org',       label: 'Organisation' },
];

/* ─────────────────────── component ─────────────────────── */
export default function OrgLayout() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { user, organization, group, loading, isAuthenticated, isAnyAdmin, logout } = useMultiTenantAuth();
  // Theme — read the resolved theme so the layout chrome (background,
  // borders) matches whatever the dashboard page is rendering. Without
  // this, the chrome stays dark and "light mode" looks broken even
  // though the page itself rendered in light.
  const { theme } = useTheme();
  const isLight = theme === 'light';
  // One theme sheet for the whole chrome — text, surfaces, borders auto-flip
  // between light and dark. Brand colors (colors.primary/etc.) stay invariant.
  const tk = useThemeTokens();
  const { activeRole } = useActiveRole({
    orgId: organization?.id,
    memberId: user?.id,
    fallbackGroupId: group?.id,
  });
  const isExecContext = activeRole?.kind === 'exec';
  const groupPrimary = group?.levels && group.levels.length > 0 ? organizationService.canonicalizeLevel(group.levels[0]) : null;
  const navigate = useNavigate();
  const location = useLocation();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showAdminSubmenu, setShowAdminSubmenu] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const [fetchedLevel, setFetchedLevel] = useState<string | null>(null);

  // Global identity — the orgs this person can switch between (one login).
  const [myOrgs, setMyOrgs] = useState<MembershipSummary[]>([]);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const currentSlug = organization?.slug;

  // Load the account's other orgs when the profile menu opens.
  useEffect(() => {
    if (!showProfileMenu || !user?.id || myOrgs.length > 0) return;
    let cancelled = false;
    (async () => {
      const orgs = await multiTenantAuthService.listMyOrganizations(user.id);
      if (!cancelled) setMyOrgs(orgs);
    })();
    return () => { cancelled = true; };
  }, [showProfileMenu, user?.id, myOrgs.length]);

  const handleSwitchOrg = async (m: MembershipSummary) => {
    if (m.is_current || switchingId) return;
    setSwitchingId(m.member_id);
    try {
      await multiTenantAuthService.switchOrganization(m.member_id);
      // Hard navigation so every provider re-reads the new session cleanly.
      window.location.assign(`/${m.org_slug}/dashboard`);
    } catch {
      setSwitchingId(null);
    }
  };

  // Hide the bottom nav + content padding on focused checkout-style
  // routes. The Pay flow and Paystack verify return are single-task
  // screens — like a checkout sheet — so navigation chrome at the
  // bottom would just cover the sticky CTA. Pattern: Stripe/Paystack
  // hosted checkouts.
  const hideBottomNav =
    /^\/[^/]+\/payment\/[^/]+(\/manual)?\/?$/.test(location.pathname) ||
    /^\/[^/]+\/payments\/verify\/?$/.test(location.pathname) ||
    /^\/[^/]+\/receipt\/[^/]+\/?$/.test(location.pathname);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate(`/${orgSlug}/login`, { replace: true });
    }
  }, [loading, isAuthenticated, navigate, orgSlug]);

  // Redirect if logged into a different org
  useEffect(() => {
    if (!loading && isAuthenticated && currentSlug && orgSlug && currentSlug !== orgSlug) {
      navigate(`/${currentSlug}/dashboard`, { replace: true });
    }
  }, [loading, isAuthenticated, currentSlug, orgSlug, navigate]);

  // Close profile menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close admin submenu on route change
  useEffect(() => {
    setShowAdminSubmenu(false);
    setShowProfileMenu(false);
    setShowMoreSheet(false);
  }, [location.pathname]);

  // If the mapped `user` lacks `level`, try to fetch it from organization_members.
  useEffect(() => {
    let mounted = true;
    const fetchLevel = async () => {
      try {
        if (!user) return;
        if (user.level) return;

        // First, try to read the level from organization_members
        const { data: memberData } = await supabase.from('organization_members').select('level, group_id').eq('id', user.id).single();
        if (mounted && memberData && (memberData as any).level) {
          setFetchedLevel((memberData as any).level as string);
          return;
        }

        // If member row has no level, try to fetch the group's first level
        const groupId = (memberData && (memberData as any).group_id) || group?.id;
        if (groupId) {
          const { data: groupData } = await supabase.from('organization_groups').select('levels').eq('id', groupId).single();
          const levels = (groupData && (groupData as any).levels) || [];
          if (mounted && Array.isArray(levels) && levels.length > 0) {
            // Use the first canonicalized level
            setFetchedLevel(organizationService.canonicalizeLevel(levels[0]));
            return;
          }
        }
      } catch (err) {
        // Best-effort fetch; ignore failures silently
      }
    };
    void fetchLevel();
    return () => { mounted = false; };
  }, [user, group?.id]);

  if (loading) return <LoadingSpinner fullScreen size="lg" />;
  if (!user || !organization) return null;

  const basePath = `/${orgSlug}`;
  const isActive = (path: string) => location.pathname === `${basePath}${path}`;
  const isActivePrefix = (prefix: string) => location.pathname.startsWith(`${basePath}${prefix}`);
  const admin = isAnyAdmin();
  const showAdmin = admin && isExecContext;
  const isAcademicOrg = isAcademicOrgType(organization.organization_type);
  const groupNavLabel = isAcademicOrg
    ? 'Faculties & Departments'
    : (organization.group_label_plural || 'Groups');
  const homePath = isExecContext ? '/admin/dashboard' : '/dashboard';

  /* ──── Navigation Items ──── */
  const memberNav: NavItem[] = [
    { path: '/dashboard', label: 'Home', icon: <LayoutDashboard size={20} />, section: 'member' },
    { path: '/payments', label: organization.payment_label || 'Payments', icon: <CreditCard size={20} />, section: 'member' },
    { path: '/groups', label: organization.group_label_plural || 'Groups', icon: <Users size={20} />, section: 'member' },
    { path: '/tickets', label: 'Tickets', icon: <TicketIcon size={20} />, section: 'member' },
  ];

  // Every tool is tagged with the permission it needs. We then show an exec
  // ONLY the tools they can actually use — so a class rep isn't buried under
  // billing/payout/expenses they'll never touch. Overview has no permission
  // (every exec gets it). Permission map comes from the member's aggregated
  // admin_permissions (see multiTenantAuthService.aggregatePermissions).
  const perms = (user.admin_permissions || {}) as Record<string, boolean>;

  // What scope drives the visible TENANT-level tools.
  //
  // Old behaviour: max scope across ALL admin rows. That meant a user
  // who's both a class rep AND a faculty exec saw Faculty / Calendar
  // items in their nav even when they had explicitly switched to their
  // class-rep role from the role switcher — which is wrong, because
  // those tools belong to the faculty exec context.
  //
  // New behaviour: when the user is actively in an exec role, we use
  // THAT role's scope. We still fall back to the max across admin
  // rows for callers who haven't picked an active role yet (legacy
  // sessions or first-load before the switcher has settled).
  const scopeRank = (s?: string) => (s === 'org' ? 2 : s === 'unit' ? 1 : 0);
  const maxScopeRank = (user.admin_records || []).reduce(
    (max, a) => Math.max(max, scopeRank((a as { scope_level?: string }).scope_level)), 0,
  );
  const activeScopeRank = activeRole?.kind === 'exec' && activeRole.scopeLevel
    ? scopeRank(activeRole.scopeLevel)
    : null;
  const execScopeRank = activeScopeRank !== null ? activeScopeRank : maxScopeRank;

  const adminNavAll: NavItem[] = showAdmin ? [
    { path: '/admin/dashboard', label: 'Overview', icon: <PieChart size={20} />, section: 'admin', adminGroup: 'overview' },
    // maxScope: 'group' hides Members from dept/faculty execs even
    // when their permissions row carries can_manage_members (legacy
    // grants from the claim-approval RPC blanket-enable it). Members
    // management is a class-tier responsibility.
    { path: '/admin/members', label: organization.member_label_plural || 'Members', icon: <Users size={20} />, section: 'admin', permission: 'can_manage_members', maxScope: 'group', adminGroup: 'overview' },
    // Tenant structure — org/unit execs only (a class rep doesn't reshape the org tree).
    { path: '/admin/groups', label: groupNavLabel, icon: <Building2 size={20} />, section: 'admin', hideOnMobile: true, permission: 'can_manage_settings', minScope: 'unit', adminGroup: 'structure' },
    ...(isAcademicOrg ? [{ path: '/admin/academic-calendar', label: 'Academic Calendar', icon: <CalendarDays size={20} />, section: 'admin' as const, hideOnMobile: true, permission: 'can_manage_settings', minScope: 'unit' as const, adminGroup: 'structure' as const }] : []),
    // Money collection — available at ANY scope. The dept/faculty exec
    // gets a targeted form (scope=unit / by-level); the class rep gets
    // a class-scoped form. The page itself adapts to context.
    { path: '/admin/create-payment', label: 'Create Dues', icon: <BadgeDollarSign size={20} />, section: 'admin', hideOnMobile: true, permission: 'can_create_payments', adminGroup: 'money' },
    { path: '/admin/manage-dues', label: 'Manage Dues', icon: <Receipt size={20} />, section: 'admin', hideOnMobile: true, permission: 'can_create_payments', adminGroup: 'money' },
    // Per-payment approve/reject + class-venue tools — these are
    // CLOSE-TO-THE-STUDENT actions. They belong to the class rep.
    // Hiding them from dept/faculty execs declutters their nav and
    // matches the strategic rule: "individual payment detail stays
    // with the class rep."
    // Review is no longer maxScope:'group'. The faculty/dept exec
    // (or their treasurer) genuinely needs to see payments members
    // made toward faculty- or dept-scoped dues. The page itself
    // tightens the query to the active role's subtree so a faculty
    // exec doesn't accidentally see another faculty's payments.
    { path: '/admin/review', label: 'Review', icon: <ClipboardCheck size={20} />, section: 'admin', hideOnMobile: true, permission: 'can_approve_payments', adminGroup: 'money' },
    { path: '/admin/expenses', label: 'Expenses', icon: <HandCoins size={20} />, section: 'admin', hideOnMobile: true, permission: 'can_manage_expenses', maxScope: 'group', adminGroup: 'money' },
    { path: '/admin/scan-qr', label: 'Scan QR', icon: <QrCode size={20} />, section: 'admin', hideOnMobile: true, permission: 'can_approve_payments', maxScope: 'group', adminGroup: 'money' },
    { path: '/admin/check-in', label: 'Event Check-in', icon: <ScanLine size={20} />, section: 'admin', hideOnMobile: true, permission: 'can_approve_payments', maxScope: 'group', adminGroup: 'money' },
    // Public donations are org-wide (a class doesn't have its own
    // donation page).
    { path: '/admin/contributions', label: 'Contributions', icon: <Heart size={20} />, section: 'admin', hideOnMobile: true, permission: 'can_approve_payments', minScope: 'org', adminGroup: 'money' },
    // Payout destination — per-tier (mig 092). Each exec — class rep,
    // dept exec, faculty exec, org owner — owns their own Paystack
    // subaccount. Strict ownership, no cascade. So the nav entry is
    // visible to every admin tier; the page itself reads ?groupId
    // (or the caller's active scope) to know which tier's payout
    // it's configuring.
    { path: '/admin/payout', label: 'Payout Account', icon: <Banknote size={20} />, section: 'admin', hideOnMobile: true, permission: 'can_manage_settings', adminGroup: 'org' },
    // Platform subscription — the whole tenant's plan: org-scope owner only.
    { path: '/admin/billing', label: 'Billing', icon: <Wallet size={20} />, section: 'admin', hideOnMobile: true, permission: 'can_manage_settings', minScope: 'org', adminGroup: 'org' },
  ] : [];
  const adminNav: NavItem[] = adminNavAll.filter((i) => {
    if (i.permission && !perms[i.permission]) return false;
    if (i.minScope && execScopeRank < scopeRank(i.minScope)) return false;
    // maxScope hides items from HIGHER tiers — e.g. Scan QR shouldn't
    // appear in a faculty exec's nav even though they technically have
    // can_approve_payments. The cap is strict: the active tier's rank
    // must be <= the item's maxScope rank.
    if (i.maxScope && execScopeRank > scopeRank(i.maxScope)) return false;
    return true;
  });

  // Bottom tab items (mobile) — fintech "2 + FAB + 2" pattern.
  // The mockup shows Home / Dues on the left, a big orange center FAB,
  // then Receipts / Profile on the right. The FAB opens the "More"
  // sheet, which is where any extra-or-admin routes live.
  //
  // For non-admins we want 4 plain tabs (Home, Dues, Receipts, Profile).
  // For admins the right two tabs become Admin / Members so the FAB
  // is the way to reach secondary admin pages.
  // Member-side bottom tabs (4 slots around the center FAB).
  // Both `Dues` and `Receipts` previously pointed at /payments —
  // the same page with two different icons / labels on either side
  // of the FAB. The user kept tapping the wrong one. Now: Home,
  // Dues, Tickets (their event tickets), Profile — four distinct
  // destinations. Tickets uses the dedicated /tickets route that
  // already exists in App.tsx.
  const memberTabs: NavItem[] = [
    { path: '/dashboard', label: 'Home',                                 icon: <LayoutDashboard size={22} />, section: 'member' },
    { path: '/payments',  label: organization.payment_label || 'Dues',   icon: <CreditCard size={22} />,      section: 'member' },
  ];
  const memberTrailingTabs: NavItem[] = [
    { path: '/tickets',   label: 'Tickets',                              icon: <TicketIcon size={22} />,      section: 'member' },
    { path: '/profile',   label: 'Profile',                              icon: <UserCog size={22} />,         section: 'member' },
  ];
  // Mobile exec tabs (4 slots around the center FAB). The four picked
  // depend on the active role's tier — a class rep / org owner has
  // Members as their daily surface, while a dept/faculty exec
  // doesn't manage members at all so their "personal" slot becomes
  // the org-structure page. Previously the dept/faculty path put
  // /admin/manage-dues in BOTH the left and right halves — two
  // identical "Dues" tabs sitting either side of the FAB. Now each
  // slot is distinct: Overview, (Members or Groups), Review, Dues.
  const showMembersInExecTabs =
    activeRole?.kind === 'exec' &&
    (activeRole.scopeLevel === 'group' || activeRole.scopeLevel === 'org');
  const execTabsLeft: NavItem[] = [
    { path: '/admin/dashboard', label: 'Overview', icon: <PieChart size={22} />, section: 'admin' },
    showMembersInExecTabs
      ? { path: '/admin/members', label: organization.member_label_plural || 'Members', icon: <Users size={22} />, section: 'admin' }
      : { path: '/admin/groups',  label: groupNavLabel,                                  icon: <Building2 size={22} />, section: 'admin' },
  ];
  const execTabsRight: NavItem[] = [
    { path: '/admin/review',      label: 'Review',                                      icon: <ClipboardCheck size={22} />, section: 'admin' },
    { path: '/admin/manage-dues', label: organization.payment_label || 'Dues',          icon: <Receipt size={22} />, section: 'admin' },
  ];
  const leftTabs = isExecContext ? execTabsLeft : memberTabs;
  const rightTabs = isExecContext ? execTabsRight : memberTrailingTabs;

  // Routes that overflow the 4-tab bottom bar — surfaced via the
  // sheet that opens when the center FAB is tapped.
  // For admins: all secondary admin routes.
  // For members: useful shortcuts (settings, password, sign-out).
  const moreSheetItems: NavItem[] = showAdmin
    ? adminNav.filter(item => !['/admin/dashboard', '/admin/members', '/admin/review', '/admin/manage-dues'].includes(item.path))
    : [
        { path: '/groups',          label: organization.group_label_plural || 'Groups', icon: <Users size={20} />,   section: 'member' },
        { path: '/tickets',         label: 'Tickets',         icon: <TicketIcon size={20} />, section: 'member' },
        { path: '/profile',         label: 'My Profile',      icon: <Building2 size={20} />,  section: 'member' },
        { path: '/settings',        label: 'Settings',        icon: <Settings size={20} />,   section: 'member' },
        { path: '/change-password', label: 'Change Password', icon: <UserCog size={20} />,    section: 'member' },
      ];

  const handleLogout = async () => {
    setShowLogoutModal(false);
    await logout();
    navigate(`/${orgSlug}/login`, { replace: true });
  };

  const userInitial = user.full_name?.charAt(0)?.toUpperCase() || 'U';
  const firstName = user.full_name?.split(' ')[0] || 'User';

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: isLight ? '#FFFBF7' : colors.secondary, color: tk.text }}
    >
      {/* ═══════════ TOP BAR ═══════════ */}
      <header
        className="sticky top-0 z-50"
        style={{
          ...(isLight
            ? {
                background: 'rgba(255, 251, 247, 0.85)',
                backdropFilter: 'saturate(180%) blur(20px)',
                WebkitBackdropFilter: 'saturate(180%) blur(20px)',
              }
            : glass.light),
          borderBottom: `1px solid ${isLight ? 'rgba(15, 7, 3, 0.06)' : 'rgba(255, 104, 3, 0.08)'}`,
        }}
      >
        {/* Subtle top glow line */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${colors.primary}40 30%, ${colors.primary}60 50%, ${colors.primary}40 70%, transparent 100%)`,
          }}
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          {/* ── Left: Logo + Org Name ── */}
          <Link
            to={`${basePath}${homePath}`}
            className="flex items-center gap-3 group"
          >
            {organization.logo_url ? (
              <motion.img
                src={organization.logo_url}
                alt={organization.short_name}
                className="w-9 h-9 rounded-xl object-cover ring-1 ring-white/10 group-hover:ring-white/20 transition-all"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              />
            ) : (
              <motion.div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold ring-1 ring-white/10 group-hover:ring-white/20 transition-all"
                style={{
                  background: `linear-gradient(135deg, ${organization.primary_color || colors.primary}, ${organization.primary_color || colors.primary}88)`,
                  color: '#FFFFFF',   // always white over the brand-gradient avatar
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {organization.short_name?.charAt(0) || 'P'}
              </motion.div>
            )}
            <div className="min-w-0 max-w-[60vw] sm:max-w-none">
              <p
                className="text-sm font-semibold leading-tight transition-colors truncate max-w-[140px] sm:max-w-[200px]"
                style={{ color: tk.text }}
              >
                {organization.short_name || organization.name}
              </p>
              {/* Subtitle: group + level — single tidy line with a middot
                  separator. Theme-aware tokens, tighter typography, and
                  bounded width so a long class name can't push the
                  whole header sideways on mobile. The width caps are
                  responsive: tight on phones, generous on desktop. */}
              <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                {(group?.short_name || group?.name) && (
                  <span
                    className="text-[10px] font-bold uppercase truncate max-w-[80px] sm:max-w-[130px]"
                    style={{ color: tk.textTer }}
                  >
                    {group?.short_name || group?.name}
                  </span>
                )}
                {(user.level || groupPrimary || fetchedLevel) && (
                  <>
                    {(group?.short_name || group?.name) && (
                      <span
                        aria-hidden
                        className="w-1 h-1 rounded-full shrink-0"
                        style={{ background: tk.textTer }}
                      />
                    )}
                    <span
                      className="text-[10px] font-bold tracking-wide whitespace-nowrap"
                      style={{
                        background: tk.primarySoft,
                        color: tk.primary,
                        padding: '1px 7px',
                        borderRadius: 9999,
                        border: `1px solid ${tk.primaryRing}`,
                      }}
                    >
                      L{user.level || groupPrimary || fetchedLevel}
                    </span>
                  </>
                )}
              </div>
            </div>
          </Link>

          {/* ── Center: Role switcher + Desktop Navigation ── */}
          <div className="hidden lg:flex items-center gap-4 flex-1 justify-center">
            <RoleSwitcher />
            <nav className="flex items-center gap-1 relative">
              {!isExecContext && memberNav.map(item => (
                <NavLink key={item.path} item={item} basePath={basePath} isActive={isActive(item.path)} tk={tk} />
              ))}

              {showAdmin && (
                <>
                  <div className="w-px h-6 mx-2" style={{ background: tk.divider }} />

                  {/* Admin nav group */}
                  <div className="relative">
                    <button
                      onClick={() => setShowAdminSubmenu(prev => !prev)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
                      style={{
                        color: isActivePrefix('/admin') ? tk.primary : tk.textSec,
                        background: isActivePrefix('/admin') ? tk.primarySoft : 'transparent',
                      }}
                    >
                      <Shield size={18} />
                      <span>Admin</span>
                      <motion.div animate={{ rotate: showAdminSubmenu ? 180 : 0 }} transition={{ duration: 0.2 }}>
                        <ChevronDown size={14} />
                      </motion.div>
                      <span
                        className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
                        style={{ background: tk.mint, boxShadow: `0 0 8px ${tk.mint}` }}
                      />
                    </button>

                    <AnimatePresence>
                      {showAdminSubmenu && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowAdminSubmenu(false)} />
                          <motion.div
                            initial={{ opacity: 0, y: -8, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.96 }}
                            transition={{ duration: 0.15, ease: 'easeOut' }}
                            className="absolute top-full mt-2 left-0 w-60 rounded-2xl overflow-hidden z-50"
                            style={{
                              ...glass.strong,
                              boxShadow: `0 20px 60px rgba(0,0,0,0.6), ${glows.amber.replace('30px', '12px').replace('0.5', '0.1')}`,
                            }}
                          >
                            <div className="p-1.5">
                              {ADMIN_GROUP_ORDER.map((g) => {
                                const items = adminNav.filter((i) => (i.adminGroup ?? 'overview') === g.id);
                                if (items.length === 0) return null;
                                return (
                                  <div key={g.id} className="mb-1.5 last:mb-0">
                                    <p
                                      className="px-3.5 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.14em]"
                                      style={{ color: tk.textTer }}
                                    >
                                      {g.label}
                                    </p>
                                    {items.map(item => (
                                      <Link
                                        key={item.path}
                                        to={`${basePath}${item.path}`}
                                        className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all"
                                        style={{
                                          color: isActive(item.path) ? tk.text : tk.textSec,
                                          background: isActive(item.path) ? tk.primarySoft : 'transparent',
                                        }}
                                        onClick={() => setShowAdminSubmenu(false)}
                                      >
                                        <span style={{ color: isActive(item.path) ? tk.primary : tk.textTer }}>
                                          {item.icon}
                                        </span>
                                        {item.label}
                                        {isActive(item.path) && (
                                          <motion.div layoutId="admin-check" className="ml-auto">
                                            <CheckCircle2 size={14} style={{ color: tk.primary }} />
                                          </motion.div>
                                        )}
                                      </Link>
                                    ))}
                                  </div>
                                );
                              })}
                            </div>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              )}
            </nav>
          </div>

          {/* ── Right: Actions ── */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Notification bell with full panel */}
            {/* <div className="relative">
              <NotificationCenter />
            </div> */}

            {/* Profile Dropdown — theme-aware */}
            <div ref={profileRef} className="relative" style={{ paddingLeft: '0.9rem' }}>
              <button
                onClick={() => setShowProfileMenu(prev => !prev)}
                className="flex items-center gap-2.5 py-1 rounded-full transition-all pl-1.5 pr-1.5 sm:pr-2.5"
                style={{
                  background: showProfileMenu
                    ? (isLight ? 'rgba(15,7,3,0.05)' : 'rgba(255,255,255,0.08)')
                    : 'transparent',
                }}
              >
                {/* Avatar */}
                <div className="relative">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-extrabold transition-all"
                    style={{
                      background: `linear-gradient(135deg, ${colors.primary}, ${colors.primary}aa)`,
                      color: '#fff',
                      boxShadow: showProfileMenu
                        ? `0 0 0 2px ${colors.primary}, 0 8px 18px -6px ${colors.primary}66`
                        : `0 0 0 2px ${isLight ? 'rgba(15,7,3,0.06)' : 'rgba(255,255,255,0.10)'}, 0 4px 10px -4px ${colors.primary}55`,
                    }}
                  >
                    {userInitial}
                  </div>
                  {/* Online dot */}
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                    style={{
                      background: '#10B981',
                      borderColor: isLight ? '#FFFFFF' : colors.secondaryLight,
                      boxShadow: '0 0 6px rgba(16, 185, 129, 0.55)',
                    }}
                  />
                </div>

                {/* Role chip beside the avatar. Drops off on the
                    smallest phones (< 400px width) so the org name +
                    avatar still fit comfortably on a 320px viewport.
                    Tailwind doesn't ship an xs breakpoint by default,
                    so we use the arbitrary `max-[399px]:hidden` syntax. */}
                <div className="max-[399px]:hidden sm:hidden text-left">
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wide truncate"
                    style={{
                      color: isExecContext ? colors.primary : (isLight ? 'rgba(15,7,3,0.6)' : colors.textSecondary),
                      maxWidth: '70px',
                    }}
                  >
                    {activeRole?.label || (isExecContext ? 'Exec' : 'Student')}
                  </p>
                </div>

                <div className="hidden sm:block text-left">
                  <p
                    className="text-sm font-bold leading-tight"
                    style={{ color: isLight ? '#0F0703' : '#FFFFFF' }}
                  >
                    {firstName}
                  </p>
                  {showAdmin && (
                    <p className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: colors.primary }}>
                      Admin
                    </p>
                  )}
                </div>

                <motion.div
                  animate={{ rotate: showProfileMenu ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="hidden sm:block"
                >
                  <ChevronDown
                    size={14}
                    style={{ color: isLight ? 'rgba(15,7,3,0.45)' : colors.textTertiary }}
                  />
                </motion.div>
              </button>

              {/* Desktop: positioned dropdown anchored to the chip.
                  Mobile gets the bottom-sheet variant below. The
                  `hidden sm:block` wrapper keeps this off the small
                  screens where the dropdown couldn't fit cleanly. */}
              <AnimatePresence>
                {showProfileMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="hidden sm:block absolute right-0 top-full mt-2 rounded-2xl overflow-hidden z-50"
                    style={{
                      width: 'min(17rem, calc(100vw - 1.5rem))',
                      maxHeight: 'calc(100vh - 6rem)',
                      overflowY: 'auto',
                      background: isLight ? '#FFFFFF' : 'rgba(15, 7, 3, 0.92)',
                      backdropFilter: 'saturate(180%) blur(22px)',
                      WebkitBackdropFilter: 'saturate(180%) blur(22px)',
                      border: `1px solid ${isLight ? 'rgba(15, 7, 3, 0.06)' : 'rgba(255,255,255,0.08)'}`,
                      boxShadow: isLight
                        ? '0 20px 50px -16px rgba(15, 7, 3, 0.18), 0 4px 12px -2px rgba(15, 7, 3, 0.06)'
                        : '0 20px 60px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.3)',
                    }}
                  >
                    {/* Profile header */}
                    <div
                      className="p-4"
                      style={{
                        borderBottom: `1px solid ${isLight ? 'rgba(15, 7, 3, 0.06)' : colors.borderLight}`,
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                          style={{
                            background: `linear-gradient(135deg, ${colors.primary}, ${colors.primary}aa)`,
                            color: '#fff',
                            boxShadow: `0 8px 18px -6px ${colors.primary}66`,
                          }}
                        >
                          {userInitial}
                        </div>
                        <div className="min-w-0">
                          <p
                            className="text-sm font-bold truncate"
                            style={{ color: isLight ? '#0F0703' : '#FFFFFF' }}
                          >
                            {user.full_name}
                          </p>
                          <p
                            className="text-xs truncate"
                            style={{ color: isLight ? 'rgba(15,7,3,0.55)' : colors.textTertiary }}
                          >
                            {user.member_id}
                          </p>
                          {(user.level || groupPrimary || fetchedLevel) && (
                            <p className="text-[10px] font-semibold truncate mt-0.5" style={{ color: colors.primary }}>
                              {user.level || groupPrimary || fetchedLevel}
                            </p>
                          )}
                          {showAdmin && (
                            <span
                              className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase"
                              style={{
                                background: `${colors.primary}18`,
                                color: colors.primary,
                                border: `1px solid ${colors.primary}30`,
                              }}
                            >
                              <Shield size={9} />
                              Admin
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Menu items */}
                    <div className="py-1.5 px-1.5">
                      <ProfileMenuItem
                        to={`${basePath}/profile`}
                        icon={<Building2 size={16} />}
                        label="My Profile"
                        onClose={() => setShowProfileMenu(false)}
                        isLight={isLight}
                      />
                      <ProfileMenuItem
                        to={`${basePath}/settings`}
                        icon={<Settings size={16} />}
                        label="Settings"
                        onClose={() => setShowProfileMenu(false)}
                        isLight={isLight}
                      />
                      <ProfileMenuItem
                        to={`${basePath}/change-password`}
                        icon={<UserCog size={16} />}
                        label="Change Password"
                        onClose={() => setShowProfileMenu(false)}
                        isLight={isLight}
                      />
                    </div>

                    {/* Your organizations (global identity) — only when >1 */}
                    {myOrgs.length > 1 && (
                      <div
                        className="px-1.5 pb-1.5 pt-1"
                        style={{ borderTop: `1px solid ${isLight ? 'rgba(15, 7, 3, 0.06)' : colors.borderLight}` }}
                      >
                        <p className="px-3 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: colors.textTertiary }}>
                          Your organizations
                        </p>
                        <div className="max-h-56 overflow-y-auto">
                          {myOrgs.map((m) => (
                            <button
                              key={m.member_id}
                              onClick={() => handleSwitchOrg(m)}
                              disabled={switchingId !== null}
                              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all hover:bg-white/5 disabled:opacity-60"
                              style={{ background: m.is_current ? `${colors.primary}12` : 'transparent' }}
                            >
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden text-xs font-bold"
                                style={{ background: `${colors.primary}1a`, color: colors.primary }}
                              >
                                {m.logo_url ? <img src={m.logo_url} alt="" className="w-full h-full object-cover" /> : (m.org_name?.[0] || '?')}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold truncate" style={{ color: isLight ? '#0F0703' : '#FFFFFF' }}>
                                  {m.org_name}
                                </p>
                                <p className="text-[11px] truncate" style={{ color: colors.textTertiary }}>
                                  {m.role_label || (m.is_admin ? 'Admin' : 'Member')}{m.group_name ? ` · ${m.group_name}` : ''}
                                </p>
                              </div>
                              {switchingId === m.member_id
                                ? <LoadingSpinner size="sm" />
                                : m.is_current
                                  ? <CheckCircle2 size={16} style={{ color: colors.primary }} />
                                  : null}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Logout */}
                    <div
                      className="px-1.5 pb-1.5"
                      style={{
                        borderTop: `1px solid ${isLight ? 'rgba(15, 7, 3, 0.06)' : colors.borderLight}`,
                      }}
                    >
                      <button
                        onClick={() => { setShowProfileMenu(false); setShowLogoutModal(true); }}
                        className="w-full flex items-center gap-3 px-3.5 py-2.5 mt-1 rounded-xl text-sm font-medium transition-all hover:bg-red-500/10"
                        style={{ color: '#ef4444' }}
                      >
                        <LogOut size={16} />
                        Sign Out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Mobile: bottom sheet ──────────────────────────
                  On phones the right-anchored dropdown above is
                  hidden (`hidden sm:block`). Instead we slide a
                  full-width sheet up from the bottom — the standard
                  mobile pattern. Backdrop + drag handle + the same
                  content. Gets out of the way of the keyboard and
                  never clips off the right edge. */}
              <AnimatePresence>
                {showProfileMenu && (
                  <>
                    <motion.div
                      key="profile-sheet-backdrop"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="sm:hidden fixed inset-0 z-[80]"
                      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}
                      onClick={() => setShowProfileMenu(false)}
                    />
                    <motion.div
                      key="profile-sheet"
                      initial={{ y: '100%' }}
                      animate={{ y: 0 }}
                      exit={{ y: '100%' }}
                      transition={{ type: 'spring', stiffness: 340, damping: 32 }}
                      className="sm:hidden fixed left-0 right-0 bottom-0 z-[90] rounded-t-3xl overflow-hidden"
                      style={{
                        background: isLight ? '#FFFFFF' : 'rgba(15, 7, 3, 0.98)',
                        border: `1px solid ${isLight ? 'rgba(15, 7, 3, 0.08)' : 'rgba(255,255,255,0.08)'}`,
                        borderBottom: 'none',
                        boxShadow: '0 -12px 40px rgba(0,0,0,0.35)',
                        maxHeight: 'calc(100vh - 4rem)',
                        display: 'flex',
                        flexDirection: 'column',
                        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                      }}
                    >
                      {/* Drag handle */}
                      <div className="pt-2 pb-1 flex justify-center shrink-0">
                        <span
                          className="block w-10 h-1 rounded-full"
                          style={{ background: isLight ? 'rgba(15,7,3,0.18)' : 'rgba(255,255,255,0.22)' }}
                        />
                      </div>

                      {/* Header — bigger avatar than the desktop pop,
                          mobile users have the room and it reads more
                          like a profile screen. */}
                      <div
                        className="px-5 pb-4 shrink-0"
                        style={{ borderBottom: `1px solid ${isLight ? 'rgba(15, 7, 3, 0.06)' : 'rgba(255,255,255,0.06)'}` }}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-12 h-12 rounded-2xl flex items-center justify-center text-base font-extrabold shrink-0"
                            style={{
                              background: `linear-gradient(135deg, ${colors.primary}, ${colors.primary}aa)`,
                              color: '#fff',
                              boxShadow: `0 8px 20px -6px ${colors.primary}66`,
                            }}
                          >
                            {userInitial}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-base font-bold truncate" style={{ color: isLight ? '#0F0703' : '#FFFFFF' }}>
                              {user.full_name}
                            </p>
                            <p className="text-xs truncate" style={{ color: isLight ? 'rgba(15,7,3,0.55)' : colors.textTertiary }}>
                              {user.member_id}
                            </p>
                            {showAdmin && (
                              <span
                                className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase"
                                style={{
                                  background: `${colors.primary}18`,
                                  color: colors.primary,
                                  border: `1px solid ${colors.primary}30`,
                                }}
                              >
                                <Shield size={9} />
                                Admin
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Scrollable body. Without `flex-1 + overflow-y-auto`
                          a long org list pushed the Sign Out button past
                          the safe-area and it was unreachable on phones.
                          Now the body scrolls inside the sheet. */}
                      <div className="flex-1 overflow-y-auto px-3 py-2">
                        <ProfileMenuItem
                          to={`${basePath}/profile`}
                          icon={<Building2 size={16} />}
                          label="My Profile"
                          onClose={() => setShowProfileMenu(false)}
                          isLight={isLight}
                        />
                        <ProfileMenuItem
                          to={`${basePath}/settings`}
                          icon={<Settings size={16} />}
                          label="Settings"
                          onClose={() => setShowProfileMenu(false)}
                          isLight={isLight}
                        />
                        <ProfileMenuItem
                          to={`${basePath}/change-password`}
                          icon={<UserCog size={16} />}
                          label="Change Password"
                          onClose={() => setShowProfileMenu(false)}
                          isLight={isLight}
                        />

                        {/* Your organizations (global identity) — only when >1 */}
                        {myOrgs.length > 1 && (
                          <div
                            className="mt-2 pt-2"
                            style={{ borderTop: `1px solid ${isLight ? 'rgba(15, 7, 3, 0.06)' : 'rgba(255,255,255,0.06)'}` }}
                          >
                            <p className="px-3 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: colors.textTertiary }}>
                              Your organizations
                            </p>
                            {myOrgs.map((m) => (
                              <button
                                key={m.member_id}
                                onClick={() => handleSwitchOrg(m)}
                                disabled={switchingId !== null}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all disabled:opacity-60"
                                style={{ background: m.is_current ? `${colors.primary}12` : 'transparent' }}
                              >
                                <div
                                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden text-xs font-bold"
                                  style={{ background: `${colors.primary}1a`, color: colors.primary }}
                                >
                                  {m.logo_url ? <img src={m.logo_url} alt="" className="w-full h-full object-cover" /> : (m.org_name?.[0] || '?')}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold truncate" style={{ color: isLight ? '#0F0703' : '#FFFFFF' }}>
                                    {m.org_name}
                                  </p>
                                  <p className="text-[11px] truncate" style={{ color: colors.textTertiary }}>
                                    {m.role_label || (m.is_admin ? 'Admin' : 'Member')}{m.group_name ? ` · ${m.group_name}` : ''}
                                  </p>
                                </div>
                                {switchingId === m.member_id
                                  ? <LoadingSpinner size="sm" />
                                  : m.is_current
                                    ? <CheckCircle2 size={16} style={{ color: colors.primary }} />
                                    : null}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Sign Out — anchored at the bottom of the sheet
                          (outside the scrollable body) so it stays
                          reachable even when the org list is long. */}
                      <div
                        className="px-3 py-3 shrink-0"
                        style={{ borderTop: `1px solid ${isLight ? 'rgba(15, 7, 3, 0.06)' : 'rgba(255,255,255,0.06)'}` }}
                      >
                        <button
                          type="button"
                          onClick={() => { setShowProfileMenu(false); setShowLogoutModal(true); }}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
                          style={{
                            background: `${tk.danger}12`,
                            color: tk.danger,
                            border: `1px solid ${tk.danger}38`,
                          }}
                        >
                          <LogOut size={16} />
                          Sign out
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
             <div className="relative">
              <NotificationCenter />
            </div>
          </div>
        </div>
      </header>
  
      {/* ═══════════ MAIN CONTENT ═══════════ */}
      {/* Bottom padding lifts content above the mobile tab bar. On
          focused checkout routes we hide the tab bar entirely, so we
          drop the padding too. */}
      <main className={`flex-1 ${hideBottomNav ? '' : 'pb-20 lg:pb-0'}`}>
        <Outlet />
      </main>

      {/* ═══════════ MOBILE BOTTOM TAB BAR ═══════════
          Hidden on focused checkout routes so the sticky Pay button
          isn't covered. */}
      {!hideBottomNav && (
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 lg:hidden"
        style={{
          ...(isLight
            ? {
                background: 'rgba(255, 251, 247, 0.92)',
                backdropFilter: 'saturate(180%) blur(22px)',
                WebkitBackdropFilter: 'saturate(180%) blur(22px)',
                boxShadow: '0 -12px 30px -12px rgba(15, 7, 3, 0.08)',
              }
            : glass.strong),
          borderTop: `1px solid ${isLight ? 'rgba(15, 7, 3, 0.06)' : 'rgba(255, 104, 3, 0.08)'}`,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Top glow line */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${colors.primary}30 30%, ${colors.primary}50 50%, ${colors.primary}30 70%, transparent 100%)`,
          }}
        />

        {/* Layout: 2 tabs left │ center FAB │ 2 tabs right.
            FAB sits ABOVE the bar (slightly raised), grid-icon, brand
            orange, glow halo — matches the Lucy Nwakwo mockup. Tapping
            it opens the "More" sheet which contains secondary routes. */}
        <div className="relative h-16">
          {/* Left side tabs */}
          <div className="absolute inset-y-0 left-0 right-1/2 flex items-center justify-around pr-10">
            {leftTabs.map((item) => (
              <BottomTab
                key={item.path}
                item={item}
                basePath={basePath}
                active={isActive(item.path)}
                tk={tk}
              />
            ))}
          </div>

          {/* Right side tabs */}
          <div className="absolute inset-y-0 right-0 left-1/2 flex items-center justify-around pl-10">
            {rightTabs.map((item) => {
              const isAdminTab = item.path === '/admin/dashboard';
              const active = isAdminTab
                ? isActivePrefix('/admin') && !isActive('/admin/members')
                : isActive(item.path);
              return (
                <BottomTab
                  key={item.path}
                  item={item}
                  basePath={basePath}
                  active={active}
                  tk={tk}
                />
              );
            })}
          </div>

          {/* Center FAB — raised, brand orange, opens the More sheet */}
          <div className="absolute left-1/2 -translate-x-1/2 -top-5 z-10">
            <motion.button
              type="button"
              onClick={() => setShowMoreSheet(true)}
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.04 }}
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primary}dd 100%)`,
                boxShadow: `0 12px 28px -8px ${colors.primary}, 0 4px 10px -2px rgba(0,0,0,0.35)`,
                border: '4px solid ' + (isLight ? '#FFFBF7' : '#0F0703'),
                color: '#FFFFFF',   // always white over the brand-gradient FAB
              }}
              aria-label="Open quick actions"
            >
              <LayoutGrid size={22} />
            </motion.button>
            {/* Tiny dot indicator when sheet is open */}
            {showMoreSheet && (
              <span
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
                style={{ background: colors.primary, boxShadow: `0 0 8px ${colors.primary}` }}
              />
            )}
          </div>
        </div>
      </nav>
      )}

      {/* ═══════════ MOBILE MORE SHEET ═══════════ */}
      <AnimatePresence>
        {showMoreSheet && (
          <>
            <motion.div
              className="fixed inset-0 z-90 lg:hidden"
              style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMoreSheet(false)}
            />
            <motion.div
              // Flex column: drag handle + header stay fixed at the
              // top, body (role switcher + tools) flex-grows and
              // SCROLLS. The previous layout had the body alone
              // scrolling at `calc(80vh - 80px)` — a static estimate.
              // When the role list was tall, it pushed the body's
              // top edge down and the body couldn't reach the lower
              // tools at all. flex-1 + overflow-y-auto makes the
              // whole body region scrollable regardless of role
              // count, role switcher height, or admin group count.
              className="fixed left-0 right-0 bottom-0 z-95 lg:hidden rounded-t-3xl overflow-hidden flex flex-col"
              style={{
                ...glass.strong,
                borderTop: `1px solid rgba(255,104,3,0.18)`,
                paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
                maxHeight: '85vh',
                minHeight: '40vh',
              }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            >
              {/* Drag handle (fixed) */}
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <span
                  className="block w-10 h-1 rounded-full"
                  style={{ background: tk.divider }}
                />
              </div>

              {/* Header (fixed) */}
              <div className="px-5 pt-2 pb-3 flex items-center justify-between shrink-0">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] font-bold" style={{ color: tk.primary }}>
                    {isExecContext ? 'Admin tools' : 'Quick actions'}
                  </p>
                  <h3 className="text-base font-bold" style={{ color: tk.text }}>More</h3>
                </div>
                <button
                  onClick={() => setShowMoreSheet(false)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: tk.overlay }}
                  aria-label="Close"
                >
                  <XIcon className="w-4 h-4" style={{ color: tk.textSec }} />
                </button>
              </div>

              {/* Scrollable body — role switcher + tools live HERE so
                  they share one scroll surface. A tall role list no
                  longer pushes the lower tool grid below the sheet. */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                <RoleSwitcherSheet onSelect={() => setShowMoreSheet(false)} />

              {/* Items — grouped on the admin side (Overview · Money ·
                  Structure · Org); flat on the member side. */}
              <div className="px-3 pb-3">
                {showAdmin ? (
                  ADMIN_GROUP_ORDER.map((g) => {
                    const items = moreSheetItems.filter((i) => (i.adminGroup ?? 'overview') === g.id);
                    if (items.length === 0) return null;
                    return (
                      <div key={g.id} className="mb-3 last:mb-0">
                        <p
                          className="px-1.5 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-[0.16em]"
                          style={{ color: tk.textTer }}
                        >
                          {g.label}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {items.map(item => (
                            <MoreSheetTile key={item.path} item={item} basePath={basePath} isActive={isActive(item.path)} onClose={() => setShowMoreSheet(false)} />
                          ))}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {moreSheetItems.map(item => (
                      <MoreSheetTile key={item.path} item={item} basePath={basePath} isActive={isActive(item.path)} onClose={() => setShowMoreSheet(false)} />
                    ))}
                  </div>
                )}
              </div>{/* /tools grid wrapper */}
              </div>{/* /flex-1 scrollable body */}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══════════ LOGOUT CONFIRMATION ═══════════
          Uses ConfirmDialog (the project's standard) so the look
          matches every other delete / approve / reject confirm in
          the app. Was a bespoke inline modal with a different visual
          (gradient top bar, glassy ember surface) which felt
          inconsistent with the rest of the system. */}
      <ConfirmDialog
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleLogout}
        title="Sign out?"
        message={`You'll need to sign back in to access ${organization.name}.`}
        type="danger"
        confirmText="Sign out"
        cancelText="Stay signed in"
      />
    </div>
  );
}

/* ─────────────────── Sub-components ─────────────────── */

/** A single tile inside the mobile More sheet — used by both the grouped
 *  admin layout and the flat member layout so the visual is identical. */
function MoreSheetTile({
  item, basePath, isActive, onClose,
}: {
  item: NavItem;
  basePath: string;
  isActive: boolean;
  onClose: () => void;
}) {
  // Theme-aware: surfaces + label colour resolve from useThemeTokens
  // so the More sheet reads correctly in light + dark. The brand
  // tints (primarySoft / primaryRing) only show on the active tile,
  // matching the desktop admin dropdown.
  const tk = useThemeTokens();
  return (
    <Link
      to={`${basePath}${item.path}`}
      onClick={onClose}
      className="flex items-center gap-3 px-3.5 py-3 rounded-2xl transition-all"
      style={{
        background: isActive ? tk.primarySoft : tk.overlay,
        border: `1px solid ${isActive ? tk.primaryRing : tk.cardBorder}`,
      }}
    >
      <span
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{
          background: isActive ? tk.primarySoft : tk.card,
          color: isActive ? tk.primary : tk.textSec,
          border: `1px solid ${isActive ? tk.primaryRing : tk.cardBorder}`,
        }}
      >
        {item.icon}
      </span>
      <span
        className="text-xs font-semibold truncate"
        style={{ color: isActive ? tk.text : tk.text }}
      >
        {item.label}
      </span>
    </Link>
  );
}

/** Bottom tab — a single tab in the mobile 2+FAB+2 nav bar.
 *  Active state: brand-orange icon + label + tiny top-dot. Inactive:
 *  textTertiary so the inactive row stays calm. */
function BottomTab({
  item, basePath, active, tk,
}: { item: NavItem; basePath: string; active: boolean; tk: ThemeTokens }) {
  return (
    <Link
      to={`${basePath}${item.path}`}
      // Tabs sit inside a half-width column with a 40px FAB pad, so on
      // 320px-wide phones each tab gets ~60px. The old minWidth=52
      // + non-truncating label pushed long labels ("Receipts",
      // "Members" with the org's custom plural) past the column edge
      // and the layout broke. min-w-0 + truncating the label keeps it
      // tight. py-1.5 gives the inactive-state hit target some breathing
      // room without growing the bar height.
      className="relative flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 min-w-0 flex-1 transition-all"
    >
      <span
        className="relative z-10 transition-colors"
        style={{ color: active ? tk.primary : tk.textTer }}
      >
        {item.icon}
      </span>
      <span
        className="relative z-10 text-[10px] font-semibold transition-colors max-w-full truncate"
        style={{ color: active ? tk.primary : tk.textTer }}
      >
        {item.label}
      </span>
      {active && (
        <motion.span
          layoutId="bottomTabDot"
          className="absolute -top-0.5 w-1 h-1 rounded-full"
          style={{ background: tk.primary, boxShadow: `0 0 8px ${tk.primary}` }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}
    </Link>
  );
}

/** Desktop nav link with animated active indicator — theme-aware (light + dark). */
function NavLink({
  item, basePath, isActive, tk,
}: {
  item: NavItem;
  basePath: string;
  isActive: boolean;
  tk: ThemeTokens;
}) {
  return (
    <Link
      to={`${basePath}${item.path}`}
      className="relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
      style={{
        color: isActive ? tk.primary : tk.textSec,
      }}
    >
      {/* Active background pill */}
      {isActive && (
        <motion.div
          layoutId="activeNavPill"
          className="absolute inset-0 rounded-xl"
          style={{
            background: tk.primarySoft,
            border: `1px solid ${tk.primaryRing}`,
            boxShadow: `0 0 20px ${tk.primary}10`,
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}
      <span className="relative z-10" style={{ color: isActive ? tk.primary : tk.textTer }}>
        {item.icon}
      </span>
      <span className="relative z-10">{item.label}</span>
    </Link>
  );
}

/** Profile dropdown menu item — theme-aware */
function ProfileMenuItem({
  to, icon, label, onClose, isLight = false,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  onClose: () => void;
  isLight?: boolean;
}) {
  return (
    <Link
      to={to}
      onClick={onClose}
      className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
        isLight ? 'hover:bg-black/[0.04]' : 'hover:bg-white/5'
      }`}
      style={{
        color: isLight ? '#1F1B1A' : colors.textSecondary,
      }}
    >
      <span style={{ color: isLight ? 'rgba(15,7,3,0.55)' : colors.textTertiary }}>{icon}</span>
      {label}
    </Link>
  );
}
