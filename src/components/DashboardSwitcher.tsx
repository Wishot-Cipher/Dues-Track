import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { colors } from '@/config/colors';
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const isAdmin = user?.admins && user.admins.length > 0;
  const isOnAdminDashboard = location.pathname.startsWith('/admin');

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
    },
  ];

  const currentModeData = modes.find(m => m.id === currentMode) || modes[0];
  const CurrentIcon = currentModeData.icon;

  const handleSwitch = (path: string) => {
    setIsOpen(false);
    navigate(path);
  };

  if (variant === 'compact') {
    return (
      <div className="relative">
        <motion.button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
          style={{
            background: currentModeData.gradient,
            border: `1px solid ${currentModeData.color}40`,
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <CurrentIcon className="w-4 h-4" style={{ color: currentModeData.color }} />
          <span className="text-sm font-medium hidden sm:inline" style={{ color: currentModeData.color }}>
            {currentModeData.label}
          </span>
          <ChevronDown 
            className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
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
                              <span className="text-xs px-1.5 py-0.5 rounded-full" 
                                style={{ background: `${mode.color}30`, color: mode.color }}>
                                Active
                              </span>
                            )}
                          </p>
                          <p className="text-xs" style={{ color: colors.textSecondary }}>
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
      className="inline-flex items-center p-1 rounded-2xl"
      style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}
    >
      {modes.map((mode) => {
        const Icon = mode.icon;
        const isActive = mode.id === currentMode;
        
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
          </motion.button>
        );
      })}
    </div>
  );
}
