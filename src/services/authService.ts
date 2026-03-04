import { supabase } from '@/config/supabase';
import type { Student } from '@/types';
import { getOrgScope } from '@/utils/orgScope';

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
   * Login with registration number and password.
   * Uses authenticate_member RPC for secure credential checking.
   */
  async login(rawRegNumber: string, password: string): Promise<LoginResponse> {
    try {
      const regNumber = rawRegNumber.trim();
      if (!regNumber) throw new Error('Please enter your registration number');
      if (!password) throw new Error('Please enter your password');

      const scope = getOrgScope();
      
      // Use authenticate_member RPC
      const { data, error } = await supabase.rpc('authenticate_member', {
        p_member_id: regNumber,
        p_password: password,
        p_organization_id: scope?.orgId || null,
      });

      if (error) {
        if (import.meta.env.DEV) {
          console.error('[authService.login] RPC error:', error);
        }
        throw new Error('Login failed. Please check your credentials and try again.');
      }

      const member = Array.isArray(data) && data.length > 0 ? data[0] : null;

      if (!member || !member.id) {
        throw new Error(
          'Invalid login credentials. If you recently changed your password, make sure to use your new password.'
        );
      }

      if (member.is_active === false) {
        throw new Error('Your account has been suspended. Please contact your administrator.');
      }

      // Update last login (non-blocking)
      void supabase
        .from('organization_members')
        .update({ last_login: new Date().toISOString() })
        .eq('id', member.id);

      // Map member to Student shape for backward compat
      const student: Student = {
        ...member,
        reg_number: member.member_id,
      };

      this.saveSession(student);

      return {
        student,
        mustChangePassword: member.force_password_change,
      };
    } catch (error: unknown) {
      if (import.meta.env.DEV) {
        console.error('[authService.login] error detail:', error);
      }
      const message = error instanceof Error ? error.message : 'Login failed. Please try again.';
      throw new Error(message);
    }
  },

  /**
   * Change password
   */
  async changePassword(studentId: string, currentPassword: string, newPassword: string): Promise<Student> {
    try {
      const { data, error } = await supabase.rpc('change_member_password', {
        p_member_uuid: studentId,
        p_current_password: currentPassword,
        p_new_password: newPassword,
      });

      if (error) throw error;

      const updated = Array.isArray(data) && data.length > 0 ? data[0] : null;
      if (!updated) throw new Error('Failed to change password');

      const student = { ...updated, reg_number: updated.member_id } as Student;
      this.saveSession(student);

      return student;
    } catch (error) {
      console.error('Change password error:', error);
      throw error;
    }
  },

  /**
   * Update member profile
   */
  async updateProfile(studentId: string, profileData: ProfileUpdateData): Promise<Student> {
    try {
      const { email, phone, section } = profileData;
      const fullName = (profileData as ProfileUpdateData & { full_name?: string }).full_name;
      
      const updateData: Record<string, unknown> = {};
      if (fullName) updateData.full_name = fullName;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (section !== undefined) updateData.section = section;

      const { data, error } = await supabase
        .from('organization_members')
        .update(updateData)
        .eq('id', studentId)
        .select('*')
        .single();

      if (error) throw error;
      if (!data) throw new Error('Failed to update profile');

      const student = { ...data, reg_number: data.member_id } as Student;
      this.saveSession(student);

      return student;
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
      // Clear session from localStorage (only storing id now)
      localStorage.removeItem('auth_session');
      localStorage.removeItem('current_user_id');
      
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
      // Only persist a minimal, non-PII identifier in localStorage
      localStorage.setItem('auth_session', 'active');
      if (student && student.id) {
        localStorage.setItem('current_user_id', student.id);
      }
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

      // Only storing user id in localStorage for privacy
      const userId = localStorage.getItem('current_user_id');
      if (!userId) return null;

      // Verify member still exists and is active in database
      const scope = getOrgScope();
      let memberQ = supabase
        .from('organization_members')
        .select(`
          *,
          member_admins (
            id,
            role,
            can_create_payments,
            can_approve_payments,
            can_manage_members,
            can_view_analytics
          )
        `)
        .eq('id', userId);
      if (scope) memberQ = memberQ.eq('organization_id', scope.orgId);
      const { data, error } = await memberQ.single();

      if (error || !data || !data.is_active) {
        localStorage.removeItem('auth_session');
        localStorage.removeItem('current_user');
        return null;
      }

      // Extract roles from member_admins join
  interface AdminRow { id: string; role: string; can_create_payments?: boolean; can_approve_payments?: boolean; can_manage_members?: boolean; can_view_analytics?: boolean }
  const admins: AdminRow[] = data.member_admins || [];
  // Map multi-tenant roles to legacy role names
  const roles = admins.map((admin: AdminRow) => {
    if (admin.role === 'org_admin' || admin.role === 'org_owner') return 'admin';
    if (admin.role === 'treasurer') return 'finsec';
    if (admin.role === 'group_admin') return 'class_rep';
    return admin.role;
  }) || [];
      const admin_permissions = {
  can_create_payments: admins.some((a: AdminRow) => a.can_create_payments === true),
  can_approve_payments: admins.some((a: AdminRow) => a.can_approve_payments === true),
  can_manage_students: admins.some((a: AdminRow) => a.can_manage_members === true),
  can_view_analytics: admins.some((a: AdminRow) => a.can_view_analytics === true),
      };

      const studentWithRoles = {
        ...data,
        reg_number: data.member_id,
        roles,
        admins,
        admin_permissions,
      };

        // Persist minimal session info (id) only
        this.saveSession(studentWithRoles as LoginResponse['student']);

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
    const adminRoles = ['admin', 'finsec', 'class_rep', 'org_admin', 'org_owner', 'treasurer', 'group_admin', 'event_coordinator'];
    return adminRoles.some(role => this.hasRole(student, role));
  },
};

export default authService;
