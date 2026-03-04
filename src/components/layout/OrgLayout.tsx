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
} from 'lucide-react';
import { colors, glows, glass } from '@/config/colors';
import { APP_NAME } from '@/config/constants';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { NotificationCenter } from '@/components/NotificationCenter';

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
  const { user, organization, loading, isAuthenticated, isAnyAdmin, logout } = useMultiTenantAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showAdminSubmenu, setShowAdminSubmenu] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const currentSlug = organization?.slug;

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
  }, [location.pathname]);

  if (loading) return <LoadingSpinner fullScreen size="lg" />;
  if (!user || !organization) return null;

  const basePath = `/${orgSlug}`;
  const isActive = (path: string) => location.pathname === `${basePath}${path}`;
  const isActivePrefix = (prefix: string) => location.pathname.startsWith(`${basePath}${prefix}`);
  const admin = isAnyAdmin();

  /* ──── Navigation Items ──── */
  const memberNav: NavItem[] = [
    { path: '/dashboard', label: 'Home', icon: <LayoutDashboard size={20} />, section: 'member' },
    { path: '/payments', label: organization.payment_label || 'Payments', icon: <CreditCard size={20} />, section: 'member' },
  ];

  const adminNav: NavItem[] = admin ? [
    { path: '/admin/dashboard', label: 'Overview', icon: <PieChart size={20} />, section: 'admin' },
    { path: '/admin/members', label: organization.member_label_plural || 'Members', icon: <Users size={20} />, section: 'admin' },
    { path: '/admin/create-payment', label: 'Create Dues', icon: <BadgeDollarSign size={20} />, section: 'admin', hideOnMobile: true },
    { path: '/admin/manage-dues', label: 'Manage Dues', icon: <Receipt size={20} />, section: 'admin', hideOnMobile: true },
    { path: '/admin/review', label: 'Review', icon: <ClipboardCheck size={20} />, section: 'admin', hideOnMobile: true },
    { path: '/admin/expenses', label: 'Expenses', icon: <HandCoins size={20} />, section: 'admin', hideOnMobile: true },
    { path: '/admin/scan-qr', label: 'Scan QR', icon: <QrCode size={20} />, section: 'admin', hideOnMobile: true },
    { path: '/admin/contributions', label: 'Contributions', icon: <Heart size={20} />, section: 'admin', hideOnMobile: true },
    { path: '/admin/billing', label: 'Billing', icon: <Wallet size={20} />, section: 'admin', hideOnMobile: true },
  ] : [];

  // Bottom tab items (mobile) — limited to 5 for thumb reach
  const bottomTabItems: NavItem[] = [
    { path: '/dashboard', label: 'Home', icon: <LayoutDashboard size={22} />, section: 'member' },
    { path: '/payments', label: organization.payment_label || 'Fee', icon: <CreditCard size={22} />, section: 'member' },
    ...(admin ? [
      { path: '/admin/dashboard', label: 'Admin', icon: <Shield size={22} />, section: 'admin' as const },
      { path: '/admin/members', label: organization.member_label_plural || 'Students', icon: <Users size={22} />, section: 'admin' as const },
      { path: '/admin/billing', label: 'Billing', icon: <Wallet size={22} />, section: 'admin' as const },
    ] : []),
  ];

  const handleLogout = async () => {
    setShowLogoutModal(false);
    await logout();
    navigate(`/${orgSlug}/login`, { replace: true });
  };

  const userInitial = user.full_name?.charAt(0)?.toUpperCase() || 'U';
  const firstName = user.full_name?.split(' ')[0] || 'User';

  return (
    <div className="min-h-screen flex flex-col" style={{ background: colors.secondary }}>
      {/* ═══════════ TOP BAR ═══════════ */}
      <header
        className="sticky top-0 z-50"
        style={{
          ...glass.light,
          borderBottom: `1px solid rgba(255, 104, 3, 0.08)`,
        }}
      >
        {/* Subtle top glow line */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${colors.primary}40 30%, ${colors.primary}60 50%, ${colors.primary}40 70%, transparent 100%)`,
          }}
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* ── Left: Logo + Org Name ── */}
          <Link
            to={`${basePath}/dashboard`}
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
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-white leading-tight group-hover:text-orange-200 transition-colors">
                {organization.short_name || organization.name}
              </p>
              <p className="text-[10px] font-medium tracking-wider uppercase" style={{ color: colors.primary }}>
                {APP_NAME}
              </p>
            </div>
          </Link>

          {/* ── Center: Desktop Navigation ── */}
          <nav className="hidden lg:flex items-center gap-1 relative">
            {memberNav.map(item => (
              <NavLink key={item.path} item={item} basePath={basePath} isActive={isActive(item.path)} />
            ))}

            {admin && (
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
                    {admin && (
                      <span
                        className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
                        style={{ background: colors.accentMint, boxShadow: glows.mint.replace('30px', '8px') }}
                      />
                    )}
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

          {/* ── Right: Actions ── */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Notification bell with full panel */}
            <div className="relative">
              <NotificationCenter />
            </div>

            {/* Profile Dropdown */}
            <div ref={profileRef} className="relative">
              <button
                onClick={() => setShowProfileMenu(prev => !prev)}
                className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-2xl transition-all"
                style={{
                  background: showProfileMenu ? 'rgba(255,255,255,0.08)' : 'transparent',
                }}
              >
                {/* Avatar */}
                <div className="relative">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                    style={{
                      background: `linear-gradient(135deg, ${colors.primary}60, ${colors.primary}30)`,
                      color: '#fff',
                      boxShadow: showProfileMenu ? `0 0 0 2px ${colors.primary}` : `0 0 0 2px rgba(255,255,255,0.1)`,
                    }}
                  >
                    {userInitial}
                  </div>
                  {/* Online dot */}
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                    style={{
                      background: colors.accentGreen,
                      borderColor: colors.secondaryLight,
                      boxShadow: `0 0 6px ${colors.accentGreen}80`,
                    }}
                  />
                </div>

                <div className="hidden sm:block text-left">
                  <p className="text-sm font-medium text-white leading-tight">{firstName}</p>
                  {admin && (
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
                  <ChevronDown size={14} style={{ color: colors.textTertiary }} />
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
                      ...glass.strong,
                      boxShadow: `0 20px 60px rgba(0,0,0,0.6), ${glows.amber.replace('30px', '12px').replace('0.5', '0.1')}`,
                    }}
                  >
                    {/* Profile header */}
                    <div className="p-4" style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                          style={{
                            background: `linear-gradient(135deg, ${colors.primary}60, ${colors.primary}30)`,
                            color: '#fff',
                            boxShadow: glows.amber.replace('30px', '12px').replace('0.5', '0.2'),
                          }}
                        >
                          {userInitial}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{user.full_name}</p>
                          <p className="text-xs truncate" style={{ color: colors.textTertiary }}>{user.member_id}</p>
                          {admin && (
                            <span
                              className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase"
                              style={{
                                background: `${colors.primary}20`,
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
                      />
                      <ProfileMenuItem
                        to={`${basePath}/settings`}
                        icon={<Settings size={16} />}
                        label="Settings"
                        onClose={() => setShowProfileMenu(false)}
                      />
                      <ProfileMenuItem
                        to={`${basePath}/change-password`}
                        icon={<UserCog size={16} />}
                        label="Change Password"
                        onClose={() => setShowProfileMenu(false)}
                      />
                    </div>

                    {/* Logout */}
                    <div className="px-1.5 pb-1.5" style={{ borderTop: `1px solid ${colors.borderLight}` }}>
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
          </div>
        </div>
      </header>

      {/* ═══════════ MAIN CONTENT ═══════════ */}
      <main className="flex-1 pb-20 lg:pb-0">
        <Outlet />
      </main>

      {/* ═══════════ MOBILE BOTTOM TAB BAR ═══════════ */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 lg:hidden"
        style={{
          ...glass.strong,
          borderTop: `1px solid rgba(255, 104, 3, 0.08)`,
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

        <div className="flex items-center justify-around px-2 h-16">
          {bottomTabItems.map(item => {
            const active = item.path === '/admin/dashboard'
              ? isActivePrefix('/admin') && !isActive('/admin/members') && !isActive('/admin/billing')
              : isActive(item.path);
            return (
              <Link
                key={item.path}
                to={`${basePath}${item.path}`}
                className="relative flex flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-2xl transition-all"
                style={{ minWidth: '60px' }}
              >
                {/* Active glow background */}
                {active && (
                  <motion.div
                    layoutId="bottomTabGlow"
                    className="absolute inset-0 rounded-2xl"
                    style={{
                      background: `${colors.primary}12`,
                      boxShadow: `0 0 20px ${colors.primary}15`,
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                
                <span
                  className="relative z-10 transition-colors"
                  style={{ color: active ? colors.primary : colors.textTertiary }}
                >
                  {item.icon}
                </span>
                <span
                  className="relative z-10 text-[10px] font-medium transition-colors"
                  style={{ color: active ? colors.primary : colors.textTertiary }}
                >
                  {item.label}
                </span>

                {/* Active dot indicator */}
                {active && (
                  <motion.span
                    layoutId="bottomTabDot"
                    className="absolute -top-0.5 w-1 h-1 rounded-full"
                    style={{
                      background: colors.primary,
                      boxShadow: `0 0 8px ${colors.primary}`,
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

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

/** Profile dropdown menu item */
function ProfileMenuItem({ to, icon, label, onClose }: { to: string; icon: React.ReactNode; label: string; onClose: () => void }) {
  return (
    <Link
      to={to}
      onClick={onClose}
      className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all hover:bg-white/5"
      style={{ color: colors.textSecondary }}
    >
      <span style={{ color: colors.textTertiary }}>{icon}</span>
      {label}
    </Link>
  );
}
