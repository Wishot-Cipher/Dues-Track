import { supabase } from '@/config/supabase';
import type { Student } from '@/types';

interface LoginResponse {
  student: Student;
  mustChangePassword: boolean;
}

interface ProfileUpdateData {
  email?: string | null;
  phone?: string | null;
  section?: string | null;
  reg_number?: string;
}

export const authService = {
  /**
   * Login with registration number and password
   * Temporary password rule (since hashing not implemented yet):
   *  - If password_hash is 'default_hash', allow login when:
   *      a) password === reg_number OR
   *      b) password === 'TEMP2024' (for placeholder imported students without full matric)
   * Replace this logic once real hashing is implemented.
   */
  async login(rawRegNumber: string, password: string): Promise<LoginResponse> {
    try {
      // Normalize input
      const regNumber = rawRegNumber.trim();
      if (!regNumber) throw new Error('Please enter your registration number');
      if (!password) throw new Error('Please enter your password');

      // Use secure server-side verification (pgcrypto crypt) via RPC
      const { data, error } = await supabase.rpc('verify_student_login', {
        p_reg_number: regNumber,
        p_password: password,
      });

      if (error) {
        if (import.meta.env.DEV) {
          console.error('[authService.login] RPC error:', error);
        }
        throw new Error('Login failed. Please check your credentials and try again.');
      }

      // RPC returns an array, get the first element
      const student = Array.isArray(data) && data.length > 0 ? data[0] : null;

      // Check if student was found (RPC returns empty array if credentials don't match)
      if (!student || !student.id) {
        // More helpful error message
        throw new Error(
          'Invalid login credentials. If you recently changed your password, make sure to use your new password.'
        );
      }

      // Check if account is active
      if (student.is_active === false) {
        throw new Error('Your account has been suspended. Please contact the class representative or administrator.');
      }

      // Update last login (non-blocking)
      void supabase
        .from('students')
        .update({ last_login: new Date().toISOString() })
        .eq('id', student.id);

      // Save session to localStorage
      this.saveSession(student as Student);

      return {
        student: student as Student,
        mustChangePassword: student.force_password_change,
      };
    } catch (error: unknown) {
      if (import.meta.env.DEV) {
        console.error('[authService.login] error detail:', error);
      }
      // Normalize error output
      const message = error instanceof Error ? error.message : 'Login failed. Please try again.';
      throw new Error(message);
    }
  },

  /**
   * Change password
   */
  async changePassword(studentId: string, currentPassword: string, newPassword: string): Promise<Student> {
    try {
      const { data, error } = await supabase.rpc('change_student_password', {
        p_student_id: studentId,
        p_current_password: currentPassword,
        p_new_password: newPassword,
      });

      if (error) throw error;

      // RPC returns an array, get the first element
      const updated = Array.isArray(data) && data.length > 0 ? data[0] : null;
      if (!updated) throw new Error('Failed to change password');

      // Update stored session with new data
      this.saveSession(updated as Student);

      // RPC now returns the updated student directly (SECURITY DEFINER bypasses RLS)
      return updated as Student;
    } catch (error) {
      console.error('Change password error:', error);
      throw error;
    }
  },

  /**
   * Update student profile
   */
  async updateProfile(studentId: string, profileData: ProfileUpdateData): Promise<Student> {
    try {
      const { email, phone, section, reg_number } = profileData;
      
      const { data, error } = await supabase
        .from('students')
        .update({
          email,
          phone,
          section,
          ...(reg_number && { reg_number }), // Only update if provided
          updated_at: new Date().toISOString(),
        })
        .eq('id', studentId)
        .select()
        .single();

      if (error) throw error;

      // Update stored session with new data
      this.saveSession(data as Student);

      return data as Student;
    } catch (error) {
      console.error('Update profile error:', error);
      throw error;
    }
  },

  /**
   * Check if profile is complete
   */
  isProfileComplete(student: Student | null): boolean {
    if (!student) return false;
    
    return Boolean(
      student.email &&
      student.phone &&
      student.section
    );
  },

  /**
   * Logout
   */
  async logout(): Promise<boolean> {
    try {
      // Clear session from localStorage
      localStorage.removeItem('auth_session');
      localStorage.removeItem('current_user');
      
      // For Supabase Auth (if using in future):
      // const { error } = await supabase.auth.signOut();
      // if (error) throw error;
      
      return true;
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  },

  /**
   * Save user session to localStorage
   */
  saveSession(student: Student): void {
    try {
      localStorage.setItem('auth_session', 'active');
      localStorage.setItem('current_user', JSON.stringify(student));
    } catch (error) {
      console.error('Error saving session:', error);
    }
  },

  /**
   * Get current user with student data
   */
  async getCurrentUser(): Promise<LoginResponse | null> {
    try {
      // Check if there's an active session
      const session = localStorage.getItem('auth_session');
      if (session !== 'active') return null;

      // Get stored user data
      const userDataStr = localStorage.getItem('current_user');
      if (!userDataStr) return null;

      const student = JSON.parse(userDataStr) as Student;

      // Verify student still exists and is active in database
      // Also fetch admin roles
      const { data, error } = await supabase
        .from('students')
        .select(`
          *,
          admins (
            role
          )
        `)
        .eq('id', student.id)
        .single();

      if (error || !data || !data.is_active) {
        // Session invalid, clear it
        localStorage.removeItem('auth_session');
        localStorage.removeItem('current_user');
        return null;
      }

      // Extract roles from admins join
      const roles = data.admins?.map((admin: { role: string }) => admin.role) || [];
      const studentWithRoles = {
        ...data,
        roles,
      };

      // Update stored session with latest data including roles
      this.saveSession(studentWithRoles as Student);

      // Return fresh data from database
      return {
        student: studentWithRoles as Student,
        mustChangePassword: data.force_password_change,
      };
    } catch (error) {
      console.error('Get current user error:', error);
      // Clear invalid session
      localStorage.removeItem('auth_session');
      localStorage.removeItem('current_user');
      return null;
    }
  },

  /**
   * Check if user has specific role
   */
  hasRole(student: Student | null, role: string): boolean {
    if (!student || !student.roles) return false;
    return student.roles.includes(role);
  },

  /**
   * Check if user is admin (any admin role)
   */
  isAdmin(student: Student | null): boolean {
    if (!student) return false;
    const adminRoles = ['admin', 'finsec', 'class_rep', 'event_coordinator'];
    return adminRoles.some(role => this.hasRole(student, role));
  },
};

export default authService;
