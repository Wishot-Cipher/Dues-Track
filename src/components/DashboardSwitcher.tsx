import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { colors } from '@/config/colors';
import { supabase } from '@/config/supabase';
import { appBadge } from '@/utils/appBadge';
import { 
  User, 
  Shield,
  ChevronDown,
  Sparkles
} from 'lucide-react';

interface DashboardSwitcherProps {
  variant?: 'full' | 'compact';
}

export default function DashboardSwitcher({ variant = 'full' }: DashboardSwitcherProps) {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const isAdmin = user?.admins && user.admins.length > 0;
  const canApprovePayments = hasPermission?.('can_approve_payments');
  const isOnAdminDashboard = location.pathname.startsWith('/admin');

  // Fetch pending payment count for admins and update app badge
  useEffect(() => {
    if (!isAdmin || !canApprovePayments) return;

    const fetchPendingCount = async () => {
      try {
        const { count, error } = await supabase
          .from('payments')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');

        if (!error && count !== null) {
          setPendingCount(count);
          // Update PWA app icon badge
          appBadge.setBadge(count);
        }
      } catch (err) {
        console.error('Error fetching pending count:', err);
      }
    };

    fetchPendingCount();

    // Subscribe to payment changes for real-time updates
    const channel = supabase
      .channel('pending-payments-count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments' },
        () => {
          fetchPendingCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, canApprovePayments]);

  // If not an admin, don't show the switcher
  if (!isAdmin) return null;

  const currentMode = isOnAdminDashboard ? 'admin' : 'student';
  
  const modes = [
    {
      id: 'student',
      label: 'Student View',
      description: 'Your personal dashboard',
      icon: User,
      path: '/dashboard',
      color: colors.accentMint,
      gradient: `linear-gradient(135deg, ${colors.accentMint}30, ${colors.accentMint}10)`,
    },
    {
      id: 'admin',
      label: 'Admin Control',
      description: 'Manage class finances',
      icon: Shield,
      path: '/admin/dashboard',
      color: colors.primary,
      gradient: `linear-gradient(135deg, ${colors.primary}30, ${colors.primary}10)`,
      badge: pendingCount, // Show pending payment count on admin button
    },
  ];

  const currentModeData = modes.find(m => m.id === currentMode) || modes[0];
  const CurrentIcon = currentModeData.icon;
  
  // Show badge count for admin option even when on student view
  const adminPendingBadge = !isOnAdminDashboard && pendingCount > 0;

  const handleSwitch = (path: string) => {
    setIsOpen(false);
    navigate(path);
  };

  if (variant === 'compact') {
    return (
      <div className="relative">
        <motion.button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl transition-all relative"
          style={{
            background: adminPendingBadge 
              ? `linear-gradient(135deg, ${colors.primary}30, ${colors.warning}20)` 
              : currentModeData.gradient,
            border: `1px solid ${adminPendingBadge ? colors.warning + '50' : currentModeData.color + '40'}`,
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <CurrentIcon className="w-4 h-4" style={{ color: currentModeData.color }} />
          
          {/* Badge for pending payments */}
          {adminPendingBadge && (
            <motion.span 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold"
              style={{ 
                background: colors.statusUnpaid,
                color: 'white',
                boxShadow: `0 0 0 2px ${colors.background}`
              }}
            >
              {pendingCount > 99 ? '99+' : pendingCount}
            </motion.span>
          )}
          
          <span className="text-xs sm:text-sm font-medium hidden sm:inline" style={{ color: currentModeData.color }}>
            {currentModeData.label}
          </span>
          
          <ChevronDown 
            className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
            style={{ color: currentModeData.color }} 
          />
        </motion.button>

        <AnimatePresence>
          {isOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40"
                onClick={() => setIsOpen(false)}
              />
              
              {/* Dropdown */}
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                className="absolute right-0 mt-2 w-64 rounded-xl border overflow-hidden z-50"
                style={{
                  background: 'rgba(15, 7, 3, 0.98)',
                  backdropFilter: 'blur(20px)',
                  borderColor: 'rgba(255, 104, 3, 0.2)',
                  boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
                }}
              >
                <div className="p-2">
                  <div className="px-3 py-2 mb-2">
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                      Switch Dashboard
                    </p>
                  </div>
                  
                  {modes.map((mode) => {
                    const Icon = mode.icon;
                    const isActive = mode.id === currentMode;
                    
                    return (
                      <motion.button
                        key={mode.id}
                        onClick={() => handleSwitch(mode.path)}
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all relative overflow-hidden"
                        style={{
                          background: isActive ? mode.gradient : 'transparent',
                          border: isActive ? `1px solid ${mode.color}30` : '1px solid transparent',
                        }}
                        whileHover={{ 
                          background: mode.gradient,
                          scale: 1.02 
                        }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {isActive && (
                          <motion.div
                            className="absolute left-0 top-0 bottom-0 w-1 rounded-r-full"
                            style={{ background: mode.color }}
                            layoutId="activeIndicator"
                          />
                        )}
                        
                        <div 
                          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: `${mode.color}20` }}
                        >
                          <Icon className="w-5 h-5" style={{ color: mode.color }} />
                        </div>
                        
                        <div className="flex-1 text-left">
                          <p className="font-medium text-white flex items-center gap-2">
                            {mode.label}
                            {isActive && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide" 
                                style={{ background: `${mode.color}20`, color: mode.color }}>
                                Active
                              </span>
                            )}
                            {/* Show pending badge for admin option */}
                            {mode.id === 'admin' && mode.badge && mode.badge > 0 && !isActive && (
                              <motion.span 
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold"
                                style={{ background: colors.statusUnpaid, color: 'white' }}
                              >
                                {mode.badge > 99 ? '99+' : mode.badge}
                              </motion.span>
                            )}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                            {mode.description}
                          </p>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Full variant - Pill-style toggle
  return (
    <div 
      className="inline-flex items-center p-1 rounded-2xl relative"
      style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}
    >
      {modes.map((mode) => {
        const Icon = mode.icon;
        const isActive = mode.id === currentMode;
        const showBadge = mode.id === 'admin' && mode.badge && mode.badge > 0 && !isActive;
        
        return (
          <motion.button
            key={mode.id}
            onClick={() => handleSwitch(mode.path)}
            className="relative flex items-center gap-2 px-4 py-2 rounded-xl transition-all"
            style={{
              color: isActive ? 'white' : colors.textSecondary,
            }}
            whileHover={{ scale: isActive ? 1 : 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {isActive && (
              <motion.div
                layoutId="dashboardToggle"
                className="absolute inset-0 rounded-xl"
                style={{
                  background: mode.gradient,
                  border: `1px solid ${mode.color}40`,
                  boxShadow: `0 4px 15px ${mode.color}30`,
                }}
                transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
              />
            )}
            
            <Icon className="w-4 h-4 relative z-10" style={{ color: isActive ? mode.color : colors.textSecondary }} />
            <span className="text-sm font-medium relative z-10 hidden sm:inline">
              {mode.id === 'student' ? 'Student' : 'Admin'}
            </span>
            
            {isActive && (
              <Sparkles className="w-3 h-3 relative z-10" style={{ color: mode.color }} />
            )}
            
            {/* Pending payment badge for admin option */}
            {showBadge && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 min-w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white px-1 z-20"
                style={{ 
                  background: colors.statusUnpaid,
                  boxShadow: `0 2px 6px ${colors.statusUnpaid}60`
                }}
              >
                {mode.badge > 99 ? '99+' : mode.badge}
              </motion.span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
