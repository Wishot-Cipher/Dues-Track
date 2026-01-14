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
      } else if (e.key === 'current_user_id' && e.newValue) {
        // User id updated in another tab; re-check session and refresh user data
        checkUser();
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
      
      // Get all roles from admins array
      const adminRoles = user.admins?.map(a => a.role) || [];
      const userRoles = user.roles || [];
      
      // Check if user has specific role
      const isAdmin = adminRoles.includes('admin') || userRoles.includes('admin');
      const isClassRep = adminRoles.includes('class_rep') || userRoles.includes('class_rep');
      const isFinsec = adminRoles.includes('finsec') || adminRoles.includes('financial_secretary') || userRoles.includes('finsec');
      
      // ADMIN: Full access to everything
      if (isAdmin) return true;
      
      // CLASS REP: Full access to everything (same as admin)
      if (isClassRep) return true;
      
      // FINSEC: Can do everything EXCEPT manage students
      if (isFinsec) {
        // Finsec cannot manage students
        if (permission === 'can_manage_students') {
          return false;
        }
        // Finsec can do all other things (payments, expenses, analytics)
        return true;
      }
      
      // For other users, check explicit permissions from admin_permissions
      if (user.admin_permissions && user.admin_permissions[permission]) return true;
      
      // Check explicit permissions from admins array
      const hasExplicitPermission = user.admins?.some(admin => {
        switch (permission) {
          case 'can_create_payments': return admin.can_create_payments;
          case 'can_approve_payments': return admin.can_approve_payments;
          case 'can_manage_students': return admin.can_manage_students;
          case 'can_view_analytics': return admin.can_view_analytics;
          default: return false;
        }
      });
      
      return hasExplicitPermission || false;
    },
    refreshSession: function (): Promise<void> {
      throw new Error('Function not implemented.');
    }
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
