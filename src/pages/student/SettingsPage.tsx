import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  ArrowLeft,
  Bell,
  Shield,
  Key,
  Palette,
  ChevronRight,
  CheckCircle2,
  Zap,
  User,
  Volume2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { colors, gradients } from '@/config/colors';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/contexts/SettingsContext';
import GlassCard from '@/components/ui/GlassCard';
import PageWrapper from '@/components/ui/PageWrapper';
import Skeleton from '@/components/ui/Skeleton';

interface SettingSection {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  items: SettingItem[];
}

interface SettingItem {
  id: string;
  label: string;
  description?: string;
  type: 'toggle' | 'select' | 'action';
  value?: boolean;
  options?: { value: string; label: string }[];
  selectedValue?: string;
  disabled?: boolean;
  onChange?: (value: boolean | string) => void;
  onClick?: () => void;
}

// Glass style constant
const glassStyle = {
  background: 'rgba(255, 255, 255, 0.03)',
  backdropFilter: 'blur(10px)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
};

// Settings Skeleton Component
function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3].map((section) => (
        <div key={section} className="rounded-2xl p-5" style={glassStyle}>
          <div className="flex items-center gap-3 mb-4">
            <Skeleton variant="circular" width="40px" height="40px" />
            <div className="flex-1">
              <Skeleton variant="text" width="120px" height="1.25rem" className="mb-1" />
              <Skeleton variant="text" width="200px" height="0.875rem" />
            </div>
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.02)' }}>
                <div className="flex-1">
                  <Skeleton variant="text" width="100px" height="1rem" className="mb-1" />
                  <Skeleton variant="text" width="150px" height="0.75rem" />
                </div>
                <Skeleton variant="rectangular" width="44px" height="24px" className="rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Toggle Switch Component
function ToggleSwitch({ 
  enabled, 
  onChange, 
  disabled = false 
}: { 
  enabled: boolean; 
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <motion.button
      onClick={() => !disabled && onChange(!enabled)}
      className={`relative w-12 h-7 rounded-full transition-colors duration-300 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      style={{ 
        background: enabled ? gradients.primary : 'rgba(255, 255, 255, 0.1)',
        boxShadow: enabled ? '0 0 20px rgba(255, 107, 53, 0.3)' : 'none'
      }}
      whileHover={!disabled ? { scale: 1.05 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
    >
      <motion.div
        className="absolute top-1 w-5 h-5 rounded-full bg-white shadow-md"
        animate={{ left: enabled ? '26px' : '4px' }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </motion.button>
  );
}

// Setting Item Component
function SettingItemRow({ item }: { item: SettingItem }) {
  const [localValue, setLocalValue] = useState(item.value);

  useEffect(() => {
    setLocalValue(item.value);
  }, [item.value]);

  const handleToggle = (value: boolean) => {
    setLocalValue(value);
    item.onChange?.(value);
  };

  return (
    <motion.div
      className={`flex items-center justify-between p-3.5 rounded-xl transition-all duration-200 ${item.disabled ? 'opacity-60' : ''}`}
      style={{ background: 'rgba(255, 255, 255, 0.02)' }}
      whileHover={!item.disabled ? { background: 'rgba(255, 255, 255, 0.05)' } : {}}
    >
      <div className="flex-1 mr-4">
        <p className="text-sm font-medium text-white">{item.label}</p>
        {item.description && (
          <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
            {item.description}
          </p>
        )}
      </div>

      {item.type === 'toggle' && (
        <ToggleSwitch 
          enabled={localValue ?? false} 
          onChange={handleToggle}
          disabled={item.disabled}
        />
      )}

      {item.type === 'action' && (
        <motion.button
          onClick={item.onClick}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
          style={{ 
            color: colors.primary,
            background: 'rgba(255, 107, 53, 0.1)'
          }}
          whileHover={{ background: 'rgba(255, 107, 53, 0.2)' }}
          whileTap={{ scale: 0.95 }}
          disabled={item.disabled}
        >
          <span>Manage</span>
          <ChevronRight size={14} />
        </motion.button>
      )}

      {item.type === 'select' && item.options && (
        <select
          value={item.selectedValue}
          onChange={(e) => item.onChange?.(e.target.value)}
          disabled={item.disabled}
          className="px-3 py-1.5 rounded-lg text-sm font-medium border-none outline-none cursor-pointer"
          style={{ 
            background: 'rgba(255, 255, 255, 0.1)',
            color: colors.textPrimary
          }}
        >
          {item.options.map((option) => (
            <option key={option.value} value={option.value} style={{ background: colors.background }}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </motion.div>
  );
}

// Section Card Component
function SettingSectionCard({ section, index }: { section: SettingSection; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
    >
      <GlassCard className="overflow-hidden">
        {/* Section Header */}
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: `${colors.primary}15` }}
          >
            {section.icon}
          </div>
          <div>
            <h3 className="font-semibold text-white">{section.title}</h3>
            <p className="text-xs" style={{ color: colors.textSecondary }}>
              {section.description}
            </p>
          </div>
        </div>

        {/* Settings Items */}
        <div className="space-y-2">
          {section.items.map((item) => (
            <SettingItemRow key={item.id} item={item} />
          ))}
        </div>
      </GlassCard>
    </motion.div>
  );
}

// Quick Actions Component
function QuickActions({ onChangePassword, onTestSound }: { onChangePassword: () => void; onTestSound: () => void }) {
  const quickActions = [
    {
      icon: <Key size={20} style={{ color: colors.primary }} />,
      label: 'Change Password',
      description: 'Update your account password',
      onClick: onChangePassword,
    },
    {
      icon: <User size={20} style={{ color: colors.accentMint }} />,
      label: 'Edit Profile',
      description: 'Update your personal info',
      onClick: () => window.location.href = '/profile',
    },
    {
      icon: <Volume2 size={20} style={{ color: colors.accentPurple }} />,
      label: 'Test Sound',
      description: 'Play notification sound',
      onClick: onTestSound,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
    >
      <GlassCard>
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: `${colors.accentPurple}15` }}
          >
            <Zap size={20} style={{ color: colors.accentPurple }} />
          </div>
          <div>
            <h3 className="font-semibold text-white">Quick Actions</h3>
            <p className="text-xs" style={{ color: colors.textSecondary }}>
              Frequently used settings
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {quickActions.map((action, idx) => (
            <motion.button
              key={idx}
              onClick={action.onClick}
              className="p-4 rounded-xl text-left transition-all"
              style={{ 
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.05)'
              }}
              whileHover={{ 
                background: 'rgba(255, 255, 255, 0.05)',
                borderColor: 'rgba(255, 107, 53, 0.3)'
              }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                {action.icon}
              </div>
              <p className="text-sm font-medium text-white">{action.label}</p>
              <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                {action.description}
              </p>
            </motion.button>
          ))}
        </div>
      </GlassCard>
    </motion.div>
  );
}

// App Info Component
function AppInfo() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="mt-6"
    >
      <div 
        className="rounded-2xl p-5 text-center"
        style={glassStyle}
      >
        <div 
          className="w-16 h-16 mx-auto mb-3 rounded-2xl flex items-center justify-center"
          style={{ background: gradients.primary }}
        >
          <span className="text-2xl font-bold text-white">ECE</span>
        </div>
        <h4 className="font-semibold text-white mb-1">ECE Class Dues Tracker</h4>
        <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>
          Version 1.0.0
        </p>
        <div className="flex items-center justify-center gap-4 text-xs" style={{ color: colors.textSecondary }}>
          <span>© 2024 ECE Department</span>
          <span>•</span>
          <span>All Rights Reserved</span>
        </div>
      </div>
    </motion.div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { settings, updateSetting, testNotificationSound } = useSettings();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  // Simulate loading for skeleton effect
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(timer);
  }, []);

  // Handler for sound test
  const handleSoundTest = () => {
    testNotificationSound();
  };

  const sections: SettingSection[] = [
    {
      id: 'notifications',
      title: 'Notifications',
      description: 'Manage how you receive updates',
      icon: <Bell size={20} style={{ color: colors.primary }} />,
      items: [
        {
          id: 'push',
          label: 'Push Notifications',
          description: 'Receive notifications on your device',
          type: 'toggle',
          value: settings.notifications.pushEnabled,
          onChange: (v) => updateSetting('notifications', 'pushEnabled', v as boolean),
        },
        {
          id: 'reminders',
          label: 'Payment Reminders',
          description: 'Get reminded about upcoming dues',
          type: 'toggle',
          value: settings.notifications.paymentReminders,
          onChange: (v) => updateSetting('notifications', 'paymentReminders', v as boolean),
        },
        {
          id: 'sounds',
          label: 'Notification Sounds',
          description: 'Play sound for new notifications',
          type: 'toggle',
          value: settings.notifications.soundEnabled,
          onChange: (v) => updateSetting('notifications', 'soundEnabled', v as boolean),
        },
      ],
    },
    {
      id: 'appearance',
      title: 'Appearance',
      description: 'Customize how the app looks',
      icon: <Palette size={20} style={{ color: colors.accentMint }} />,
      items: [
        {
          id: 'compact',
          label: 'Compact Mode',
          description: 'Show more content on screen',
          type: 'toggle',
          value: settings.appearance.compactMode,
          onChange: (v) => updateSetting('appearance', 'compactMode', v as boolean),
        },
        {
          id: 'balance',
          label: 'Show Balance on Dashboard',
          description: 'Display your payment balance prominently',
          type: 'toggle',
          value: settings.appearance.showBalance,
          onChange: (v) => updateSetting('appearance', 'showBalance', v as boolean),
        },
        {
          id: 'animations',
          label: 'Enable Animations',
          description: 'Show smooth animations throughout the app',
          type: 'toggle',
          value: settings.appearance.animationsEnabled,
          onChange: (v) => updateSetting('appearance', 'animationsEnabled', v as boolean),
        },
      ],
    },
    {
      id: 'privacy',
      title: 'Privacy & Security',
      description: 'Control your data and privacy',
      icon: <Shield size={20} style={{ color: colors.accentPurple }} />,
      items: [
        {
          id: 'activity',
          label: 'Show Activity Status',
          description: 'Let others see when you\'re active',
          type: 'toggle',
          value: settings.privacy.showActivity,
          onChange: (v) => updateSetting('privacy', 'showActivity', v as boolean),
        },
        {
          id: 'password',
          label: 'Password & Security',
          description: 'Manage your password and security',
          type: 'action',
          onClick: () => navigate('/change-password'),
        },
      ],
    },
  ];

  return (
    <PageWrapper noPadding>
      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        {/* Header */}
        <motion.div
          className="mb-6 sm:mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-3 sm:gap-4 mb-4">
            <motion.button
              onClick={() => navigate('/dashboard')}
              className="flex items-center justify-center px-3 py-2 rounded-lg transition-all duration-300"
              style={{ 
                color: colors.textSecondary,
                outline: `1px solid ${colors.primary}`,
                background: 'rgba(255, 107, 53, 0.1)'
              }}
              whileHover={{ scale: 1.05, background: 'rgba(255, 107, 53, 0.2)' }}
              whileTap={{ scale: 0.95 }}
            >
              <ArrowLeft size={20} style={{ color: colors.primary }} />
            </motion.button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Settings</h1>
              <p className="text-sm" style={{ color: colors.textSecondary }}>
                Customize your app experience
              </p>
            </div>
          </div>

          {/* User Info Banner */}
          <motion.div
            className="rounded-2xl p-4 flex items-center gap-4"
            style={{
              background: 'rgba(255, 107, 53, 0.1)',
              border: '1px solid rgba(255, 107, 53, 0.2)'
            }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold"
              style={{ background: gradients.primary }}
            >
              {user?.full_name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white truncate">{user?.full_name || 'User'}</p>
              <p className="text-sm truncate" style={{ color: colors.textSecondary }}>
                {user?.reg_number || 'Student'}
              </p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(34, 197, 94, 0.2)' }}>
              <CheckCircle2 size={14} className="text-green-400" />
              <span className="text-xs font-medium text-green-400">Active</span>
            </div>
          </motion.div>
        </motion.div>

        {/* Content */}
        {loading ? (
          <SettingsSkeleton />
        ) : (
          <div className="space-y-5">
            {/* Quick Actions */}
            <QuickActions 
              onChangePassword={() => navigate('/change-password')} 
              onTestSound={handleSoundTest}
            />

            {/* Settings Sections */}
            {sections.map((section, index) => (
              <SettingSectionCard key={section.id} section={section} index={index} />
            ))}

            {/* App Info */}
            <AppInfo />
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
