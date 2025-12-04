import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { notificationSound } from '@/utils/notificationSound';

export interface AppSettings {
  notifications: {
    pushEnabled: boolean;
    paymentReminders: boolean;
    soundEnabled: boolean;
  };
  appearance: {
    compactMode: boolean;
    showBalance: boolean;
    animationsEnabled: boolean;
  };
  privacy: {
    showActivity: boolean;
  };
}

interface SettingsContextType {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(
    category: K,
    key: keyof AppSettings[K],
    value: boolean
  ) => void;
  playNotificationSound: (type?: 'success' | 'info' | 'warning' | 'ding') => void;
  testNotificationSound: () => void;
}

const defaultSettings: AppSettings = {
  notifications: {
    pushEnabled: true,
    paymentReminders: true,
    soundEnabled: true,
  },
  appearance: {
    compactMode: false,
    showBalance: true,
    animationsEnabled: true,
  },
  privacy: {
    showActivity: true,
  },
};

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [audioInitialized, setAudioInitialized] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('app_settings_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        setSettings({ ...defaultSettings, ...parsed });
      }
    } catch {
      // Use defaults
    }
  }, []);

  // Save settings to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('app_settings_v2', JSON.stringify(settings));
    } catch {
      // Silent fail
    }
  }, [settings]);

  // Initialize audio on first user interaction
  useEffect(() => {
    const initAudio = () => {
      if (!audioInitialized) {
        // Create a silent audio context to enable sounds
        try {
          const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = new AudioContextClass();
          // Resume the context (required for some browsers)
          if (ctx.state === 'suspended') {
            ctx.resume();
          }
          setAudioInitialized(true);
        } catch {
          // Audio not supported
        }
      }
    };

    // Listen for any user interaction
    document.addEventListener('click', initAudio, { once: true });
    document.addEventListener('touchstart', initAudio, { once: true });
    document.addEventListener('keydown', initAudio, { once: true });

    return () => {
      document.removeEventListener('click', initAudio);
      document.removeEventListener('touchstart', initAudio);
      document.removeEventListener('keydown', initAudio);
    };
  }, [audioInitialized]);

  const updateSetting = useCallback(<K extends keyof AppSettings>(
    category: K,
    key: keyof AppSettings[K],
    value: boolean
  ) => {
    setSettings((prev: AppSettings) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: value,
      },
    }));
  }, []);

  const playNotificationSound = useCallback((type: 'success' | 'info' | 'warning' | 'ding' = 'info') => {
    if (!settings.notifications.soundEnabled) return;
    
    try {
      if (type === 'ding') {
        notificationSound.playDing();
      } else {
        notificationSound.play(type);
      }
    } catch {
      // Sound failed, ignore
    }
  }, [settings.notifications.soundEnabled]);

  const testNotificationSound = useCallback(() => {
    try {
      notificationSound.playDing();
    } catch {
      // Sound failed
    }
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, updateSetting, playNotificationSound, testNotificationSound }}>
      {children}
    </SettingsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings(): SettingsContextType {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

export default SettingsContext;
