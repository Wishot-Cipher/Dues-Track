import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import authService from '@/services/authService';
import type { AuthContextType, Student } from '@/types';

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUser();

    // Listen for storage changes (logout in another tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'auth_session' && e.newValue === null) {
        // User logged out in another tab
        setUser(null);
      } else if (e.key === 'current_user' && e.newValue) {
        // User data updated in another tab
        try {
          const updatedUser = JSON.parse(e.newValue) as Student;
          setUser(updatedUser);
        } catch (error) {
          console.error('Error parsing user data from storage:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const checkUser = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser?.student || null);
    } catch (error) {
      console.error('Auth check error:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (regNumber: string, password: string) => {
    try {
      const result = await authService.login(regNumber, password);
      // Re-fetch full current user record to include admin roles & permissions
      const current = await authService.getCurrentUser();
      setUser(current?.student || result.student);
      return result;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const changePassword = async (studentId: string, currentPassword: string, newPassword: string) => {
    try {
      const updated = await authService.changePassword(studentId, currentPassword, newPassword);
      // Update user in context with the returned data (includes force_password_change = false)
      setUser(updated);
    } catch (error) {
      console.error('Change password error:', error);
      throw error;
    }
  };

  const updateProfile = async (profileData: Partial<Student>) => {
    try {
      if (!user?.id) {
        throw new Error('No user session found');
      }
      const updated = await authService.updateProfile(user.id, profileData);
      setUser(updated);
      return updated;
    } catch (error) {
      console.error('Update profile error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    login,
    logout,
    changePassword,
    updateProfile,
    isAuthenticated: !!user,
    isProfileComplete: user ? authService.isProfileComplete(user) : false,
    needsPasswordChange: user?.force_password_change || false,
  hasPermission: (permission: 'can_create_payments' | 'can_approve_payments' | 'can_manage_students' | 'can_view_analytics') => {
      if (!user) return false;
      if (user.roles?.includes('admin')) return true; // full admin
      return Boolean(user.admin_permissions && user.admin_permissions[permission]);
    },
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
