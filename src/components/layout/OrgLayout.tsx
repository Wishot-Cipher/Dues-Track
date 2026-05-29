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
  X as XIcon,
} from 'lucide-react';
// import Footer from '@/components/Footer';
import { colors, glows, glass } from '@/config/colors';
import { isAcademicOrgType } from '@/config/constants';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useActiveRole } from '@/hooks/useActiveRole';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/config/supabase';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { NotificationCenter } from '@/components/NotificationCenter';
import { organizationService } from '@/services/organizationService';
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
}

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

  const currentSlug = organization?.slug;

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
  ];

  const adminNav: NavItem[] = showAdmin ? [
    { path: '/admin/dashboard', label: 'Overview', icon: <PieChart size={20} />, section: 'admin' },
    { path: '/admin/members', label: organization.member_label_plural || 'Members', icon: <Users size={20} />, section: 'admin' },
    { path: '/admin/groups', label: groupNavLabel, icon: <Building2 size={20} />, section: 'admin', hideOnMobile: true },
    ...(isAcademicOrg ? [{ path: '/admin/academic-calendar', label: 'Academic Calendar', icon: <CalendarDays size={20} />, section: 'admin' as const, hideOnMobile: true }] : []),
    { path: '/admin/create-payment', label: 'Create Dues', icon: <BadgeDollarSign size={20} />, section: 'admin', hideOnMobile: true },
    { path: '/admin/manage-dues', label: 'Manage Dues', icon: <Receipt size={20} />, section: 'admin', hideOnMobile: true },
    { path: '/admin/review', label: 'Review', icon: <ClipboardCheck size={20} />, section: 'admin', hideOnMobile: true },
    { path: '/admin/expenses', label: 'Expenses', icon: <HandCoins size={20} />, section: 'admin', hideOnMobile: true },
    { path: '/admin/scan-qr', label: 'Scan QR', icon: <QrCode size={20} />, section: 'admin', hideOnMobile: true },
    { path: '/admin/contributions', label: 'Contributions', icon: <Heart size={20} />, section: 'admin', hideOnMobile: true },
    { path: '/admin/billing', label: 'Billing', icon: <Wallet size={20} />, section: 'admin', hideOnMobile: true },
    { path: '/admin/payout', label: 'Payout Account', icon: <Banknote size={20} />, section: 'admin', hideOnMobile: true },
  ] : [];

  // Bottom tab items (mobile) — fintech "2 + FAB + 2" pattern.
  // The mockup shows Home / Dues on the left, a big orange center FAB,
  // then Receipts / Profile on the right. The FAB opens the "More"
  // sheet, which is where any extra-or-admin routes live.
  //
  // For non-admins we want 4 plain tabs (Home, Dues, Receipts, Profile).
  // For admins the right two tabs become Admin / Members so the FAB
  // is the way to reach secondary admin pages.
  const memberTabs: NavItem[] = [
    { path: '/dashboard', label: 'Home',    icon: <LayoutDashboard size={22} />, section: 'member' },
    { path: '/payments',  label: organization.payment_label || 'Dues',
      icon: <CreditCard size={22} />, section: 'member' },
  ];
  const memberTrailingTabs: NavItem[] = [
    { path: '/payments', label: 'Receipts',
      icon: <Receipt size={22} />, section: 'member' },
    { path: '/profile',  label: 'Profile',
      icon: <UserCog size={22} />, section: 'member' },
  ];
  const execTabsLeft: NavItem[] = [
    { path: '/admin/dashboard', label: 'Overview', icon: <PieChart size={22} />, section: 'admin' },
    { path: '/admin/members', label: organization.member_label_plural || 'Members', icon: <Users size={22} />, section: 'admin' },
  ];
  const execTabsRight: NavItem[] = [
    { path: '/admin/review', label: 'Review', icon: <ClipboardCheck size={22} />, section: 'admin' },
    { path: '/admin/manage-dues', label: organization.payment_label || 'Dues', icon: <Receipt size={22} />, section: 'admin' },
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
        { path: '/groups',        label: organization.group_label_plural || 'Groups', icon: <Users size={20} />, section: 'member' },
        { path: '/profile',         label: 'My Profile',     icon: <Building2 size={20} />, section: 'member' },
        { path: '/settings',        label: 'Settings',       icon: <Settings size={20} />,  section: 'member' },
        { path: '/change-password', label: 'Change Password', icon: <UserCog size={20} />,  section: 'member' },
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
      style={{ background: isLight ? '#FFFBF7' : colors.secondary }}
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
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold ring-1 ring-white/10 group-hover:ring-white/20 transition-all"
                style={{ background: `linear-gradient(135deg, ${organization.primary_color || colors.primary}, ${organization.primary_color || colors.primary}88)` }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {organization.short_name?.charAt(0) || 'P'}
              </motion.div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white leading-tight group-hover:text-orange-200 transition-colors truncate">
                {organization.short_name || organization.name}
              </p>
              <div className="flex flex-col">
                {/* <p className="text-[10px] font-medium tracking-wider uppercase truncate" style={{ color: colors.primary }}>
                  {organization.organization_type === 'university' ? '🎓 University'
                    : organization.organization_type === 'school' ? '🏫 School'
                    : organization.organization_type === 'church' ? '⛪ Church'
                    : organization.organization_type === 'club' ? '🏢 Club'
                    : organization.organization_type === 'association' ? '🤝 Association'
                    : organization.organization_type === 'cooperative' ? '🏦 Cooperative'
                    : organization.organization_type === 'ngo' ? '🌍 NGO'
                    : APP_NAME
                  }
                </p> */}

                {/* Group short name + level badge (standout) */}
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-[10px] font-bold uppercase truncate" style={{ color: colors.textTertiary, maxWidth: '160px' }}>
                    {group?.short_name || group?.name || ''}
                  </p>
                  {(user.level || groupPrimary || fetchedLevel) && (
                    <span
                      className="text-[10px] font-semibold uppercase truncate"
                      style={{
                        background: `${colors.primary}16`,
                        color: colors.primary,
                        padding: '2px 8px',
                        borderRadius: 9999,
                        border: `1px solid ${colors.primary}25`,
                        boxShadow: `0 6px 18px ${colors.primary}10`,
                        whiteSpace: 'nowrap',
                        maxWidth: '120px'
                      }}
                    >
                      {`Level ${user.level || groupPrimary || fetchedLevel}`}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Link>

          {/* ── Center: Role switcher + Desktop Navigation ── */}
          <div className="hidden lg:flex items-center gap-4 flex-1 justify-center">
            <RoleSwitcher />
            <nav className="flex items-center gap-1 relative">
              {!isExecContext && memberNav.map(item => (
                <NavLink key={item.path} item={item} basePath={basePath} isActive={isActive(item.path)} />
              ))}

              {showAdmin && (
                <>
                  <div className="w-px h-6 mx-2" style={{ background: colors.borderLight }} />
                  
                  {/* Admin nav group */}
                  <div className="relative">
                    <button
                      onClick={() => setShowAdminSubmenu(prev => !prev)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
                      style={{
                        color: isActivePrefix('/admin') ? colors.primary : colors.textSecondary,
                        background: isActivePrefix('/admin') ? `${colors.primary}12` : 'transparent',
                      }}
                    >
                      <Shield size={18} />
                      <span>Admin</span>
                      <motion.div animate={{ rotate: showAdminSubmenu ? 180 : 0 }} transition={{ duration: 0.2 }}>
                        <ChevronDown size={14} />
                      </motion.div>
                      <span
                        className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
                        style={{ background: colors.accentMint, boxShadow: glows.mint.replace('30px', '8px') }}
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
                              {adminNav.map(item => (
                                <Link
                                  key={item.path}
                                  to={`${basePath}${item.path}`}
                                  className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all"
                                  style={{
                                    color: isActive(item.path) ? '#fff' : colors.textSecondary,
                                    background: isActive(item.path) ? `${colors.primary}20` : 'transparent',
                                  }}
                                  onClick={() => setShowAdminSubmenu(false)}
                                >
                                  <span style={{ color: isActive(item.path) ? colors.primary : colors.textTertiary }}>
                                    {item.icon}
                                  </span>
                                  {item.label}
                                  {isActive(item.path) && (
                                    <motion.div layoutId="admin-check" className="ml-auto">
                                      <CheckCircle2 size={14} style={{ color: colors.primary }} />
                                    </motion.div>
                                  )}
                                </Link>
                              ))}
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

                <div className="sm:hidden text-left">
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wide truncate"
                    style={{
                      color: isExecContext ? colors.primary : (isLight ? 'rgba(15,7,3,0.6)' : colors.textSecondary),
                      maxWidth: '90px',
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

              <AnimatePresence>
                {showProfileMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute right-0 top-full mt-2 w-64 rounded-2xl overflow-hidden z-50"
                    style={{
                      // Theme-aware dropdown surface. In light mode it's
                      // a true white card with a crisp shadow + 1px
                      // border. In dark mode it stays glassy ember.
                      ...(isLight
                        ? {
                            background: '#FFFFFF',
                            backdropFilter: 'saturate(180%) blur(20px)',
                            WebkitBackdropFilter: 'saturate(180%) blur(20px)',
                          }
                        : glass.strong),
                      border: `1px solid ${isLight ? 'rgba(15, 7, 3, 0.06)' : colors.borderLight}`,
                      boxShadow: isLight
                        ? '0 20px 50px -16px rgba(15, 7, 3, 0.18), 0 4px 12px -2px rgba(15, 7, 3, 0.06)'
                        : `0 20px 60px rgba(0,0,0,0.6), ${glows.amber.replace('30px', '12px').replace('0.5', '0.1')}`,
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
              className="w-14 h-14 rounded-full flex items-center justify-center text-white"
              style={{
                background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primary}dd 100%)`,
                boxShadow: `0 12px 28px -8px ${colors.primary}, 0 4px 10px -2px rgba(0,0,0,0.35)`,
                border: '4px solid ' + (isLight ? '#FFFBF7' : '#0F0703'),
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
              className="fixed left-0 right-0 bottom-0 z-95 lg:hidden rounded-t-3xl overflow-hidden"
              style={{
                ...glass.strong,
                borderTop: `1px solid rgba(255,104,3,0.18)`,
                paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
                maxHeight: '80vh',
              }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <span
                  className="block w-10 h-1 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.18)' }}
                />
              </div>

              {/* Header */}
              <div className="px-5 pt-2 pb-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] font-bold" style={{ color: colors.primary }}>
                    {isExecContext ? 'Admin tools' : 'Quick actions'}
                  </p>
                  <h3 className="text-base font-bold text-white">More</h3>
                </div>
                <button
                  onClick={() => setShowMoreSheet(false)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                  aria-label="Close"
                >
                  <XIcon className="w-4 h-4" style={{ color: colors.textSecondary }} />
                </button>
              </div>

              {/* Role switcher (mobile) */}
              <RoleSwitcherSheet onSelect={() => setShowMoreSheet(false)} />

              {/* Items */}
              <div className="px-3 pb-3 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 80px)' }}>
                <div className="grid grid-cols-2 gap-2">
                  {moreSheetItems.map(item => (
                    <Link
                      key={item.path}
                      to={`${basePath}${item.path}`}
                      onClick={() => setShowMoreSheet(false)}
                      className="flex items-center gap-3 px-3.5 py-3 rounded-2xl transition-all"
                      style={{
                        background: isActive(item.path) ? `${colors.primary}18` : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${isActive(item.path) ? `${colors.primary}30` : colors.borderLight}`,
                      }}
                    >
                      <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          background: isActive(item.path) ? `${colors.primary}22` : 'rgba(255,255,255,0.04)',
                          color: isActive(item.path) ? colors.primary : colors.textSecondary,
                        }}
                      >
                        {item.icon}
                      </span>
                      <span className="text-xs font-semibold text-white truncate">{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══════════ LOGOUT CONFIRMATION MODAL ═══════════ */}
      <AnimatePresence>
        {showLogoutModal && (
          <motion.div
            className="fixed inset-0 z-100 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0"
              style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(8px)' }}
              onClick={() => setShowLogoutModal(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            {/* Modal Card */}
            <motion.div
              className="relative w-full max-w-sm rounded-3xl overflow-hidden"
              style={{
                background: `linear-gradient(145deg, ${colors.cardBg} 0%, rgba(15, 7, 3, 0.98) 100%)`,
                border: `1px solid ${colors.borderLight}`,
                boxShadow: `0 25px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(239, 68, 68, 0.08)`,
              }}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            >
              {/* Top accent */}
              <div className="h-1" style={{ background: 'linear-gradient(90deg, #ef4444, #f97316, #ef4444)' }} />

              <div className="p-6 pt-7 text-center">
                {/* Icon */}
                <motion.div
                  className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                  }}
                  initial={{ rotate: -10 }}
                  animate={{ rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  <LogOut size={28} style={{ color: '#ef4444' }} />
                </motion.div>

                {/* Text */}
                <h3 className="text-xl font-bold text-white mb-2">Sign Out?</h3>
                <p className="text-sm leading-relaxed mb-6" style={{ color: colors.textSecondary }}>
                  You'll need to sign back in to access<br />
                  <span className="font-medium text-white/80">{organization.name}</span>
                </p>

                {/* Buttons */}
                <div className="flex gap-3">
                  <motion.button
                    className="flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-all"
                    style={{
                      background: 'rgba(255, 255, 255, 0.06)',
                      color: colors.textSecondary,
                      border: `1px solid ${colors.borderLight}`,
                    }}
                    whileHover={{ scale: 1.02, background: 'rgba(255, 255, 255, 0.1)' }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowLogoutModal(false)}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    className="flex-1 py-3 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                    style={{
                      background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                      color: 'white',
                      boxShadow: '0 4px 14px rgba(239, 68, 68, 0.3)',
                    }}
                    whileHover={{ scale: 1.02, boxShadow: '0 6px 20px rgba(239, 68, 68, 0.4)' }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleLogout}
                  >
                    <LogOut size={16} />
                    Sign Out
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────── Sub-components ─────────────────── */

/** Bottom tab — a single tab in the mobile 2+FAB+2 nav bar.
 *  Active state: brand-orange icon + label + tiny top-dot. Inactive:
 *  textTertiary so the inactive row stays calm. */
function BottomTab({
  item, basePath, active,
}: { item: NavItem; basePath: string; active: boolean }) {
  return (
    <Link
      to={`${basePath}${item.path}`}
      className="relative flex flex-col items-center justify-center gap-0.5 py-1 px-2 transition-all"
      style={{ minWidth: '52px' }}
    >
      <span
        className="relative z-10 transition-colors"
        style={{ color: active ? colors.primary : colors.textTertiary }}
      >
        {item.icon}
      </span>
      <span
        className="relative z-10 text-[10px] font-semibold transition-colors"
        style={{ color: active ? colors.primary : colors.textTertiary }}
      >
        {item.label}
      </span>
      {active && (
        <motion.span
          layoutId="bottomTabDot"
          className="absolute -top-0.5 w-1 h-1 rounded-full"
          style={{ background: colors.primary, boxShadow: `0 0 8px ${colors.primary}` }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}
    </Link>
  );
}

/** Desktop nav link with animated active indicator */
function NavLink({ item, basePath, isActive }: { item: NavItem; basePath: string; isActive: boolean }) {
  return (
    <Link
      to={`${basePath}${item.path}`}
      className="relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
      style={{
        color: isActive ? '#fff' : colors.textSecondary,
      }}
    >
      {/* Active background pill */}
      {isActive && (
        <motion.div
          layoutId="activeNavPill"
          className="absolute inset-0 rounded-xl"
          style={{
            background: `${colors.primary}18`,
            border: `1px solid ${colors.primary}25`,
            boxShadow: `0 0 20px ${colors.primary}10`,
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}
      <span className="relative z-10" style={{ color: isActive ? colors.primary : colors.textTertiary }}>
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
