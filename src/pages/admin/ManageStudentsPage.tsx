import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {  } from 'react-router-dom';
import { useAppNav } from '@/hooks/useAppNav';
import { supabase } from '@/config/supabase';
import { getOrgScope } from '@/utils/orgScope';
import { colors, gradients } from '@/config/colors';
import GlassCard from '@/components/ui/GlassCard';
import AnimatedCounter from '@/components/ui/AnimatedCounter';
import Modal from '@/components/ui/Modal';
import ProfessionalDropdown from '@/components/ui/ProfessionalDropdown';
import { useToast } from '@/hooks/useToast';
import {
  Search,
  Edit2,
  Trash2,
  UserPlus,
  ArrowLeft,
  Shield,
  User,
  CheckCircle,
  XCircle,
  Crown,
  Sparkles,
  Users,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  AlertTriangle,
  Download,
  FileText,
  FileSpreadsheet,
  Key,
  Copy,
  Plus,
  Loader2,
  GraduationCap,
} from 'lucide-react';
import Footer from '@/components/Footer';
import { useAuth } from '@/hooks/useAppAuth';
import authService from '@/services/authService';
import { exportStudentsToPDF } from '@/utils/htmlPrintExports';
import BulkStudentImport from '@/components/admin/BulkStudentImport';

interface Student {
  id: string;
  full_name: string;
  reg_number: string;
  force_password_change?: boolean;
  email: string;
  phone: string;
  level: string;
  department: string;
  section: string;
  is_active: boolean;
  // Admin roles are stored in the separate `admins` table in the database.
  // We'll fetch the `admins` relation and compute the booleans client-side.
  admins?: Array<{
    id: string;
    role: string;
    can_create_payments: boolean;
    can_approve_payments: boolean;
    can_manage_students: boolean;
    can_view_analytics: boolean;
  }>;
  is_finsec?: boolean; // computed from admins
  is_admin?: boolean; // computed from admins
  is_class_rep?: boolean; // computed from admins
  created_at: string;
}

export default function ManageStudentsPage() {
  const { go: navigate } = useAppNav();
  const { success, error: showError } = useToast();
  const { hasPermission, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Quick filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'finsec' | 'class_rep' | 'student'>('all');
  
  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'delete' | 'admin' | 'finsec' | 'class_rep' | 'password_reset' | null;
    student: Student | null;
    action: 'grant' | 'remove' | 'delete' | 'reset';
  }>({ isOpen: false, type: null, student: null, action: 'grant' });
  
  // Password reset result modal
  const [passwordResetResult, setPasswordResetResult] = useState<{
    isOpen: boolean;
    studentName: string;
    tempPassword: string;
  } | null>(null);
  
  // Add Student Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [newStudent, setNewStudent] = useState({
    full_name: '',
    reg_number: '',
    email: '',
    phone: '',
    level: '200L',
    department: 'ECE',
    section: 'A',
  });
  const [addResult, setAddResult] = useState<{
    isOpen: boolean;
    studentName: string;
    regNumber: string;
    tempPassword: string;
  } | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  
  // Apply filters and pagination
  const getFilteredStudents = () => {
    let filtered = [...filteredStudents];
    
    // Apply status filter
    if (statusFilter === 'active') {
      filtered = filtered.filter(s => s.is_active);
    } else if (statusFilter === 'inactive') {
      filtered = filtered.filter(s => !s.is_active);
    }
    
    // Apply role filter
    if (roleFilter === 'admin') {
      filtered = filtered.filter(s => s.is_admin);
    } else if (roleFilter === 'finsec') {
      filtered = filtered.filter(s => s.is_finsec);
    } else if (roleFilter === 'class_rep') {
      filtered = filtered.filter(s => s.is_class_rep);
    } else if (roleFilter === 'student') {
      filtered = filtered.filter(s => !s.is_admin && !s.is_finsec && !s.is_class_rep);
    }
    
    // Sort alphabetically by name (A-Z)
    filtered.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
    
    return filtered;
  };
  
  const finalFilteredStudents = getFilteredStudents();
  const totalPages = Math.ceil(finalFilteredStudents.length / itemsPerPage);
  const paginatedStudents = finalFilteredStudents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Scroll to top helper function
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const fetchStudents = async () => {
    if (!navigator.onLine) return;
    try {
      setLoading(true);
      const scope = getOrgScope();
      let fetchQ = supabase
        .from('organization_members')
        .select(`*, member_admins (id, role, can_create_payments, can_approve_payments, can_manage_members, can_view_analytics)`)
        .order('created_at', { ascending: false });
      if (scope) fetchQ = fetchQ.eq('organization_id', scope.orgId);
      const { data, error } = await fetchQ;

      if (error) throw error;

  interface MemberAdminRecord { role: string; can_create_payments?: boolean; can_approve_payments?: boolean; can_manage_members?: boolean; can_view_analytics?: boolean }
  const mapped = (data || []).map((s: Record<string, unknown>) => {
    const admins = (s.member_admins || []) as MemberAdminRecord[];
    return {
      ...s,
      reg_number: s.member_id || s.reg_number,
      department: s.section || s.department || '',
      admins,
      roles: admins.map((a: MemberAdminRecord) => a.role),
      admin_permissions: {
        can_create_payments: admins.some((a: MemberAdminRecord) => a.can_create_payments),
        can_approve_payments: admins.some((a: MemberAdminRecord) => a.can_approve_payments),
        can_manage_students: admins.some((a: MemberAdminRecord) => a.can_manage_members),
        can_view_analytics: admins.some((a: MemberAdminRecord) => a.can_view_analytics),
      },
      is_admin: admins.some((a: MemberAdminRecord) => ['admin', 'org_admin', 'org_owner', 'super_admin'].includes(a.role)),
      is_finsec: admins.some((a: MemberAdminRecord) => a.role === 'treasurer'),
      is_class_rep: admins.some((a: MemberAdminRecord) => a.role === 'group_admin'),
    } as unknown as Student;
  });
  setStudents(mapped);
  setFilteredStudents(mapped);
    } catch (error) {
      console.error('Error fetching students:', error);
      showError('Failed to fetch students');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lock body scroll when any modal is open
  useEffect(() => {
    const isAnyModalOpen = showEditModal || showAddModal || showBulkModal || confirmModal.isOpen || !!passwordResetResult?.isOpen || !!addResult?.isOpen;
    
    if (isAnyModalOpen) {
      // Save current scroll position
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.overflow = 'hidden';
    } else {
      // Restore scroll position
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0', 10) * -1);
      }
    }
    
    // Cleanup on unmount
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
    };
  }, [showEditModal, showAddModal, showBulkModal, confirmModal.isOpen, passwordResetResult?.isOpen, addResult?.isOpen]);

  useEffect(() => {
    // Debounce search to prevent blank screen during typing
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim() === '') {
        setFilteredStudents(students);
      } else {
        const query = searchQuery.toLowerCase().trim();
        const filtered = students.filter(
          (s) =>
            s.full_name?.toLowerCase().includes(query) ||
            s.reg_number?.toLowerCase().includes(query) ||
            s.email?.toLowerCase().includes(query) ||
            s.level?.toLowerCase().includes(query)
        );
        setFilteredStudents(filtered);
      }
    }, 150); // 150ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchQuery, students]);

  const handleEditStudent = async () => {
    if (!selectedStudent) return;

    // Check permission before proceeding
    if (!hasPermission('can_manage_students')) {
      showError('You do not have permission to edit students');
      return;
    }

    try {
      setEditLoading(true);
      
      // Direct update on organization_members table
      const scope = getOrgScope();
      const updateData: Record<string, unknown> = {
        full_name: selectedStudent.full_name,
        member_id: selectedStudent.reg_number,
        email: selectedStudent.email,
        phone: selectedStudent.phone,
        level: selectedStudent.level,
        section: selectedStudent.department || selectedStudent.section,
        force_password_change: selectedStudent.force_password_change ?? false,
        is_active: selectedStudent.is_active,
      };
      let updateQ = supabase
        .from('organization_members')
        .update(updateData)
        .eq('id', selectedStudent.id);
      if (scope) updateQ = updateQ.eq('organization_id', scope.orgId);
      const { error } = await updateQ;

      if (error) {
        console.error('Update error:', error);
        if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
          showError('Registration number already exists. Choose another one.');
          setEditLoading(false);
          return;
        }
        throw error;
      }

      success('Student updated successfully');
      // If admin forced a password change, notify the student
      try {
        if (selectedStudent.force_password_change) {
          const scopeN = getOrgScope();
          await supabase.from('notifications').insert({
            member_id: selectedStudent.id,
            organization_id: scopeN?.orgId,
            type: 'force_password',
            title: 'Password Reset Required',
            message: 'An administrator has required you to change your password. Please update it on next login.',
            link: '/change-password',
          });
        }
      } catch (e) {
        // non-fatal
        console.warn('Failed to create force-password notification', e);
      }
      setShowEditModal(false);
      setSelectedStudent(null);
      fetchStudents();
    } catch (error) {
      console.error('Error updating student:', error);
      showError('Failed to update student');
    } finally {
      setEditLoading(false);
    }
  };

  const toggleStudentStatus = async (student: Student) => {
    // Check permission before proceeding
    if (!hasPermission('can_manage_students')) {
      showError('You do not have permission to change student status');
      return;
    }

    try {
      // Direct update on organization_members
      const scope = getOrgScope();
      const newStatus = !student.is_active;
      let toggleQ = supabase
        .from('organization_members')
        .update({
          is_active: newStatus,
          is_suspended: !newStatus,
          suspension_reason: newStatus ? null : 'Suspended by admin',
          suspended_at: newStatus ? null : new Date().toISOString(),
        })
        .eq('id', student.id);
      if (scope) toggleQ = toggleQ.eq('organization_id', scope.orgId);
      const { error } = await toggleQ;

      if (error) {
        console.error('Update error:', error);
        throw error;
      }

      success(newStatus ? 'Student activated' : 'Student suspended');
      await fetchStudents();
    } catch (error) {
      console.error('Error toggling student status:', error);
      showError('Failed to update student status');
    }
  };

  const toggleFinsec = async (student: Student) => {
    // Show confirmation modal
    setConfirmModal({
      isOpen: true,
      type: 'finsec',
      student,
      action: student.is_finsec ? 'remove' : 'grant'
    });
  };

  const executeToggleFinsec = async (student: Student) => {
    try {
      if (!hasPermission('can_manage_students')) {
        showError('You do not have permission to manage student roles');
        return;
      }
      
      // Resolve org scope once with fallback
      const scope = getOrgScope();
      let orgId = scope?.orgId || null;
      if (!orgId) {
        const { data: memberRow } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('id', student.id)
          .single();
        orgId = memberRow?.organization_id || null;
      }
      if (!orgId) {
        showError('No org scope available. Please re-login.');
        return;
      }

      // Check if already has finsec role directly
      const { data: existingRole, error: fetchError } = await supabase
        .from('member_admins')
        .select('id')
        .eq('member_id', student.id)
        .eq('role', 'treasurer')
        .eq('organization_id', orgId);

      if (fetchError) {
        console.error('Error checking finsec status:', fetchError);
        throw fetchError;
      }

      if (existingRole && existingRole.length > 0) {
        // Remove existing finsec role directly
        const { error } = await supabase
          .from('member_admins')
          .delete()
          .eq('id', existingRole[0].id);
        
        if (error) {
          console.error('Delete error:', error);
          throw error;
        }
        
        success('Finsec role removed successfully');
        
        // Notify the user
        await supabase.from('notifications').insert({
          member_id: student.id,
          organization_id: orgId,
          type: 'role_removed',
          title: 'Finsec Role Removed',
          message: 'Your Finsec role has been removed. Contact admin for more details.',
          link: '/profile',
        });
      } else {
        // Add finsec role directly
        const { error } = await supabase.from('member_admins').insert({
          member_id: student.id,
          organization_id: orgId,
          role: 'treasurer',
          can_create_payments: true,
          can_approve_payments: true,
          can_manage_members: false,
          can_view_analytics: true,
        });
        
        if (error) throw error;
        success('Finsec role granted successfully');
        await supabase.from('notifications').insert({
          member_id: student.id,
          organization_id: orgId,
          type: 'role_assigned',
          title: 'Finsec Role Granted',
          message: 'You have been granted Finsec permissions. You can now approve and create payments.',
          link: '/admin/dashboard',
        });
      }
      
      // Refresh the students list
      await fetchStudents();
      
      // If current user was updated, refresh their session
      if (user?.id === student.id) {
        await authService.getCurrentUser();
        window.location.reload();
      }
    } catch (error) {
      console.error('Error toggling finsec:', error);
      showError('Failed to update finsec role');
    }
  };

  const toggleAdmin = async (student: Student) => {
    // Show confirmation modal
    setConfirmModal({
      isOpen: true,
      type: 'admin',
      student,
      action: student.is_admin ? 'remove' : 'grant'
    });
  };

  const executeToggleAdmin = async (student: Student) => {
    try {
      if (!hasPermission('can_manage_students')) {
        showError('You do not have permission to manage student roles');
        return;
      }
      
      // Resolve org scope once with fallback
      const scope = getOrgScope();
      let orgId = scope?.orgId || null;
      if (!orgId) {
        const { data: memberRow } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('id', student.id)
          .single();
        orgId = memberRow?.organization_id || null;
      }
      if (!orgId) {
        showError('No org scope available. Please re-login.');
        return;
      }

      // Check if admin record exists directly
      const { data: existingRole, error: fetchError } = await supabase
        .from('member_admins')
        .select('id')
        .eq('member_id', student.id)
        .in('role', ['admin', 'org_admin'])
        .eq('organization_id', orgId);

      if (fetchError) {
        console.error('Error checking admin status:', fetchError);
        throw fetchError;
      }

      if (existingRole && existingRole.length > 0) {
        // Remove existing admin role directly
        const { error } = await supabase
          .from('member_admins')
          .delete()
          .eq('id', existingRole[0].id);
        
        if (error) {
          console.error('Delete error:', error);
          throw error;
        }
        
        success('Admin role removed successfully');
        
        await supabase.from('notifications').insert({
          member_id: student.id,
          organization_id: orgId,
          type: 'role_removed',
          title: 'Admin Role Removed',
          message: 'Your Admin role has been removed. Contact admin for more details.',
          link: '/profile',
        });
      } else {
        // Add admin role directly
        const { error } = await supabase.from('member_admins').insert({
          member_id: student.id,
          organization_id: orgId,
          role: 'org_admin',
          can_create_payments: true,
          can_approve_payments: true,
          can_manage_members: true,
          can_view_analytics: true,
        });
        
        if (error) throw error;
        success('Admin role granted successfully');
        await supabase.from('notifications').insert({
          member_id: student.id,
          organization_id: orgId,
          type: 'role_assigned',
          title: 'Admin Role Granted',
          message: 'You have been granted Admin permissions. You can now manage students, create payments, and view analytics.',
          link: '/admin/dashboard',
        });
      }
      
      // Refresh the students list
      await fetchStudents();
      
      // If current user was updated, refresh their session
      if (user?.id === student.id) {
        await authService.getCurrentUser();
      }
    } catch (error) {
      console.error('Error toggling admin:', error);
      showError('Failed to update admin role');
    }
  };

  const toggleClassRep = async (student: Student) => {
    // Show confirmation modal
    setConfirmModal({
      isOpen: true,
      type: 'class_rep',
      student,
      action: student.is_class_rep ? 'remove' : 'grant'
    });
  };

  const executeToggleClassRep = async (student: Student) => {
    try {
      if (!hasPermission('can_manage_students')) {
        showError('You do not have permission to manage student roles');
        return;
      }
      
      // Resolve org scope once with fallback
      const scope = getOrgScope();
      let orgId = scope?.orgId || null;
      if (!orgId) {
        const { data: memberRow } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('id', student.id)
          .single();
        orgId = memberRow?.organization_id || null;
      }
      if (!orgId) {
        showError('No org scope available. Please re-login.');
        return;
      }

      // Check if class_rep record exists directly
      const { data: existingRole, error: fetchError } = await supabase
        .from('member_admins')
        .select('id')
        .eq('member_id', student.id)
        .eq('role', 'group_admin')
        .eq('organization_id', orgId);

      if (fetchError) {
        console.error('Error checking classrep status:', fetchError);
        throw fetchError;
      }

      if (existingRole && existingRole.length > 0) {
        // Remove existing classrep role directly
        const { error } = await supabase
          .from('member_admins')
          .delete()
          .eq('id', existingRole[0].id);
        
        if (error) {
          console.error('Delete error:', error);
          throw error;
        }
        
        success('Class Rep role removed successfully');
        
        await supabase.from('notifications').insert({
          member_id: student.id,
          organization_id: orgId,
          type: 'role_removed',
          title: 'Class Rep Role Removed',
          message: 'Your Class Rep role has been removed. Contact admin for more details.',
          link: '/profile',
        });
      } else {
        // Add classrep role directly
        const { error } = await supabase.from('member_admins').insert({
          member_id: student.id,
          organization_id: orgId,
          role: 'group_admin',
          can_create_payments: true,
          can_approve_payments: true,
          can_manage_members: true,
          can_view_analytics: true,
        });
        
        if (error) throw error;
        success('Class Rep role granted successfully');
        await supabase.from('notifications').insert({
          member_id: student.id,
          organization_id: orgId,
          type: 'role_assigned',
          title: 'Class Rep Role Granted',
          message: 'You have been granted Class Rep permissions with full admin access. You can now manage students, create and approve payments, and view analytics.',
          link: '/admin/dashboard',
        });
      }
      
      // Refresh the students list
      await fetchStudents();
      
      // If current user was updated, refresh their session
      if (user?.id === student.id) {
        await authService.getCurrentUser();
      }
    } catch (error) {
      console.error('Error toggling class rep:', error);
      showError('Failed to update class rep role');
    }
  };

  const deleteStudent = async (student: Student) => {
    // Show confirmation modal
    setConfirmModal({
      isOpen: true,
      type: 'delete',
      student,
      action: 'delete'
    });
  };

  const executeDeleteStudent = async (student: Student) => {
    // Check permission before proceeding
    if (!hasPermission('can_manage_students')) {
      showError('You do not have permission to delete students');
      return;
    }

    try {
      // Direct delete from organization_members (cascades to member_admins, payments, notifications)
      const scope = getOrgScope();
      let delQ = supabase
        .from('organization_members')
        .delete()
        .eq('id', student.id);
      if (scope) delQ = delQ.eq('organization_id', scope.orgId);
      const { error } = await delQ;

      if (error) {
        console.error('Delete error:', error);
        throw error;
      }

      success('Student deleted successfully');
      await fetchStudents();
    } catch (error) {
      console.error('Error deleting student:', error);
      showError('Failed to delete student');
    }
  };

  // Trigger password reset confirmation
  const handlePasswordReset = (student: Student) => {
    if (!hasPermission('can_manage_students')) {
      showError('You do not have permission to reset passwords');
      return;
    }
    setConfirmModal({
      isOpen: true,
      type: 'password_reset',
      student,
      action: 'reset'
    });
  };

  // Execute password reset via API
  const executePasswordReset = async (student: Student) => {
    if (!hasPermission('can_manage_students')) {
      showError('You do not have permission to reset passwords');
      return;
    }

    try {
      // Generate a temp password and hash it via PostgreSQL
      const tempPassword = student.full_name.split(' ')[0].toLowerCase() + Math.random().toString(36).slice(2, 6);
      const { data: hashResult, error: hashError } = await supabase
        .rpc('hash_password', { p_password: tempPassword });

      if (hashError) {
        if (hashError.message.includes('function') || hashError.code === '42883') {
          showError('Password hash function not found. Please run the SQL migration in Supabase.');
          return;
        }
        throw new Error(hashError.message);
      }

      // Update the member's password
      const scope = getOrgScope();
      let resetQ = supabase
        .from('organization_members')
        .update({
          password_hash: hashResult,
          force_password_change: true,
        })
        .eq('id', student.id);
      if (scope) resetQ = resetQ.eq('organization_id', scope.orgId);
      const { error: updateError } = await resetQ;

      if (updateError) throw new Error(updateError.message);

      // Create notification for the student
      try {
        const scopeN = getOrgScope();
        await supabase.from('notifications').insert({
          member_id: student.id,
          organization_id: scopeN?.orgId,
          type: 'force_password',
          title: 'Password Reset by Admin',
          message: 'Your password was reset by an administrator. Please use the temporary password provided to you and change it immediately upon login.',
          link: '/login',
        });
      } catch {
        // Non-fatal
      }

      setPasswordResetResult({
        isOpen: true,
        studentName: student.full_name,
        tempPassword: tempPassword
      });

      success(`Password reset for ${student.full_name}`);
    } catch (err) {
      console.error('Error resetting password:', err);
      showError(err instanceof Error ? err.message : 'Failed to reset password');
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    setExporting(true);
    try {
      const dataToExport = getFilteredStudents();
      
      // Helper function to escape CSV fields
      const escapeCSV = (field: string | number | boolean | null | undefined): string => {
        if (field === null || field === undefined) return '';
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const lines: string[] = [];
      
      // Header info
      lines.push('PAYVEXO - MEMBER DIRECTORY');
      lines.push('Powered by Payvexo | payvexo.com');
      lines.push('');
      lines.push(`Generated Date,${new Date().toLocaleDateString('en-US', { dateStyle: 'full', timeStyle: 'short' })}`);
      lines.push(`Total Students,${dataToExport.length}`);
      lines.push(`Active Students,${dataToExport.filter(s => s.is_active).length}`);
      lines.push(`Inactive Students,${dataToExport.filter(s => !s.is_active).length}`);
      if (statusFilter !== 'all') lines.push(`Status Filter,${statusFilter}`);
      if (roleFilter !== 'all') lines.push(`Role Filter,${roleFilter}`);
      lines.push('');
      lines.push('');
      
      // Column headers
      lines.push('S/N,Full Name,Registration Number,Email,Phone,Level,Department,Section,Status,Roles,Created Date');
      
      // Data rows
      dataToExport.forEach((student, index) => {
        const roles = [
          student.is_admin ? 'Admin' : '',
          student.is_finsec ? 'FinSec' : '',
          student.is_class_rep ? 'Class Rep' : ''
        ].filter(Boolean).join(' | ') || 'Student';
        
        lines.push([
          escapeCSV(index + 1),
          escapeCSV(student.full_name),
          escapeCSV(student.reg_number),
          escapeCSV(student.email || 'N/A'),
          escapeCSV(student.phone || 'N/A'),
          escapeCSV(student.level || 'N/A'),
          escapeCSV(student.department || 'N/A'),
          escapeCSV(student.section || 'N/A'),
          escapeCSV(student.is_active ? 'Active' : 'Inactive'),
          escapeCSV(roles),
          escapeCSV(new Date(student.created_at).toLocaleDateString()),
        ].join(','));
      });

      // Create and download file
      const csvContent = lines.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `students_directory_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      success('CSV exported successfully!');
      setShowExportMenu(false);
    } catch (err) {
      console.error('Export error:', err);
      showError('Failed to export CSV');
    } finally {
      setExporting(false);
    }
  };

  // Export to PDF
  const handleExportPDF = () => {
    setExporting(true);
    try {
      const dataToExport = getFilteredStudents();
      exportStudentsToPDF(dataToExport, {
        status: statusFilter !== 'all' ? statusFilter : undefined,
        role: roleFilter !== 'all' ? roleFilter : undefined,
      });
      success('PDF exported successfully!');
      setShowExportMenu(false);
    } catch (err) {
      console.error('Export error:', err);
      showError('Failed to export PDF');
    } finally {
      setExporting(false);
    }
  };

  // Add New Student
  const handleAddStudent = async () => {
    if (!hasPermission('can_manage_students')) {
      showError('You do not have permission to add students');
      return;
    }

    // Validate required fields
    if (!newStudent.full_name.trim()) {
      showError('Full name is required');
      return;
    }
    if (!newStudent.reg_number.trim()) {
      showError('Registration number is required');
      return;
    }

    try {
      setAddLoading(true);
      
      // Direct insert into organization_members with hashed password
      const scope = getOrgScope();
      const tempPassword = newStudent.reg_number.trim().toUpperCase();
      const { data: hashResult, error: hashError } = await supabase
        .rpc('hash_password', { p_password: tempPassword });

      if (hashError) {
        console.error('Hash error:', hashError);
        if (hashError.message.includes('function') || hashError.code === '42883') {
          showError('Password hash function not found. Please run the SQL migration.');
          return;
        }
        throw hashError;
      }

      // Get member's group
      let groupId: string | null = null;
      if (scope) {
        const { data: memberData } = await supabase
          .from('organization_members')
          .select('group_id')
          .eq('id', user?.id)
          .single();
        groupId = memberData?.group_id || null;
      }

      const insertData: Record<string, unknown> = {
        full_name: newStudent.full_name.trim(),
        member_id: newStudent.reg_number.trim().toUpperCase(),
        email: newStudent.email.trim() || null,
        phone: newStudent.phone.trim() || null,
        level: newStudent.level,
        section: newStudent.section || newStudent.department,
        password_hash: hashResult,
        force_password_change: true,
        is_active: true,
      };
      if (scope) {
        insertData.organization_id = scope.orgId;
        if (groupId) insertData.group_id = groupId;
      }

      const { error } = await supabase
        .from('organization_members')
        .insert(insertData);

      if (error) {
        console.error('Insert error:', error);
        if (error.message?.includes('duplicate') || error.message?.includes('unique') || error.code === '23505') {
          showError('Member ID already exists. Choose another one.');
          return;
        }
        throw error;
      }

      // Show success modal with temp password
      setAddResult({
        isOpen: true,
        studentName: newStudent.full_name.trim(),
        regNumber: newStudent.reg_number.trim().toUpperCase(),
        tempPassword: tempPassword,
      });

      // Reset form
      setNewStudent({
        full_name: '',
        reg_number: '',
        email: '',
        phone: '',
        level: '200L',
        department: 'ECE',
        section: 'A',
      });
      setShowAddModal(false);

      // Refresh student list
      await fetchStudents();
      success('Student added successfully!');

    } catch (err) {
      console.error('Error adding student:', err);
      showError(err instanceof Error ? err.message : 'Failed to add student');
    } finally {
      setAddLoading(false);
    }
  };

  // Handle confirmation modal action
  const handleConfirmAction = async () => {
    if (!confirmModal.student) return;
    
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
    
    switch (confirmModal.type) {
      case 'finsec':
        await executeToggleFinsec(confirmModal.student);
        break;
      case 'admin':
        await executeToggleAdmin(confirmModal.student);
        break;
      case 'class_rep':
        await executeToggleClassRep(confirmModal.student);
        break;
      case 'delete':
        await executeDeleteStudent(confirmModal.student);
        break;
      case 'password_reset':
        await executePasswordReset(confirmModal.student);
        break;
    }
  };

  // Get confirmation modal content
  const getConfirmModalContent = () => {
    if (!confirmModal.student) return { title: '', message: '', icon: null, color: '' };
    
    const student = confirmModal.student;
    
    switch (confirmModal.type) {
      case 'delete':
        return {
          title: 'Delete Student',
          message: `Are you sure you want to permanently delete "${student.full_name}"? This action cannot be undone and will remove all associated data.`,
          icon: <Trash2 className="w-8 h-8" />,
          color: '#ef4444',
          buttonText: 'Delete Student'
        };
      case 'admin':
        return {
          title: confirmModal.action === 'grant' ? 'Grant Admin Role' : 'Remove Admin Role',
          message: confirmModal.action === 'grant' 
            ? `Grant admin privileges to "${student.full_name}"? They will be able to manage students, create payments, and view analytics.`
            : `Remove admin privileges from "${student.full_name}"? They will lose access to admin features.`,
          icon: <Shield className="w-8 h-8" />,
          color: confirmModal.action === 'grant' ? colors.accentMint : colors.warning,
          buttonText: confirmModal.action === 'grant' ? 'Grant Admin' : 'Remove Admin'
        };
      case 'finsec':
        return {
          title: confirmModal.action === 'grant' ? 'Grant Finsec Role' : 'Remove Finsec Role',
          message: confirmModal.action === 'grant'
            ? `Grant financial secretary privileges to "${student.full_name}"? They will be able to approve and create payments.`
            : `Remove financial secretary privileges from "${student.full_name}"? They will lose payment approval access.`,
          icon: <Crown className="w-8 h-8" />,
          color: confirmModal.action === 'grant' ? colors.primary : colors.warning,
          buttonText: confirmModal.action === 'grant' ? 'Grant Finsec' : 'Remove Finsec'
        };
      case 'class_rep':
        return {
          title: confirmModal.action === 'grant' ? 'Grant Class Rep Role' : 'Remove Class Rep Role',
          message: confirmModal.action === 'grant'
            ? `Grant class representative privileges to "${student.full_name}"? They will be able to view class analytics.`
            : `Remove class representative privileges from "${student.full_name}"?`,
          icon: <Users className="w-8 h-8" />,
          color: confirmModal.action === 'grant' ? colors.accentMint : colors.warning,
          buttonText: confirmModal.action === 'grant' ? 'Grant Class Rep' : 'Remove Class Rep'
        };
      case 'password_reset':
        return {
          title: 'Reset Password',
          message: `Reset password for "${student.full_name}"? A temporary password will be generated that you can share with them. They will be required to change it on next login.`,
          icon: <Key className="w-8 h-8" />,
          color: colors.warning,
          buttonText: 'Reset Password'
        };
      default:
        return { title: '', message: '', icon: null, color: '', buttonText: '' };
    }
  };

  const modalContent = getConfirmModalContent();

  return (
    <div className="min-h-screen py-4 sm:py-6 relative overflow-x-hidden"  style={{
        background: 'radial-gradient(ellipse at top, #1A0E09 0%, #0F0703 100%)',
      }}
    >
      {/* Confirmation Modal */}
      <Modal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        title={
          <div className="flex items-center gap-3">
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: `${modalContent.color}20`, color: modalContent.color }}
            >
              {modalContent.icon}
            </div>
            <span>{modalContent.title}</span>
          </div>
        }
        size="sm"
        footer={
          <div className="flex items-center gap-3 w-full">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
              className="flex-1 py-3 px-4 rounded-xl font-medium transition-all"
              style={{ 
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: colors.textSecondary
              }}
            >
              Cancel
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleConfirmAction}
              className="flex-1 py-3 px-4 rounded-xl font-semibold text-white transition-all"
              style={{ 
                background: confirmModal.type === 'delete' 
                  ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                  : confirmModal.action === 'remove'
                    ? `linear-gradient(135deg, ${colors.warning}, #d97706)`
                    : `linear-gradient(135deg, ${modalContent.color}, ${colors.primary})`,
                boxShadow: `0 4px 15px ${modalContent.color}40`
              }}
            >
              {modalContent.buttonText}
            </motion.button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Student info card */}
          {confirmModal.student && (
            <div 
              className="p-4 rounded-xl flex items-center gap-4"
              style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}
            >
              <div 
                className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold shrink-0"
                style={{ background: `${colors.primary}20`, color: colors.primary }}
              >
                {confirmModal.student.full_name.charAt(0)}
              </div>
              <div>
                <p className="font-semibold text-white text-lg">{confirmModal.student.full_name}</p>
                <p className="text-sm" style={{ color: colors.textSecondary }}>{confirmModal.student.reg_number}</p>
                <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>{confirmModal.student.email}</p>
              </div>
            </div>
          )}
          
          {/* Warning message */}
          <div 
            className="p-4 rounded-xl flex items-start gap-3"
            style={{ 
              background: confirmModal.type === 'delete' ? 'rgba(239, 68, 68, 0.1)' : `${modalContent.color}10`,
              border: `1px solid ${confirmModal.type === 'delete' ? 'rgba(239, 68, 68, 0.2)' : modalContent.color + '20'}`
            }}
          >
            <AlertTriangle 
              className="w-5 h-5 mt-0.5 shrink-0" 
              style={{ color: confirmModal.type === 'delete' ? '#ef4444' : modalContent.color }} 
            />
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              {modalContent.message}
            </p>
          </div>
        </div>
      </Modal>

      {/* Password Reset Result Modal */}
      <Modal
        isOpen={!!passwordResetResult?.isOpen}
        onClose={() => setPasswordResetResult(null)}
        title={
          <div className="flex items-center gap-3">
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: `${colors.accentMint}20`, color: colors.accentMint }}
            >
              <CheckCircle className="w-8 h-8" />
            </div>
            <span>Password Reset Successful</span>
          </div>
        }
        size="sm"
        footer={
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setPasswordResetResult(null)}
            className="w-full py-3 px-4 rounded-xl font-semibold text-white transition-all"
            style={{ 
              background: `linear-gradient(135deg, ${colors.accentMint}, ${colors.primary})`,
              boxShadow: `0 4px 15px ${colors.accentMint}40`
            }}
          >
            Done
          </motion.button>
        }
      >
        <div className="space-y-4">
          <p className="text-sm" style={{ color: colors.textSecondary }}>
            Password has been reset for <strong className="text-white">{passwordResetResult?.studentName}</strong>.
          </p>
          
          {/* Temporary Password Display */}
          <div 
            className="p-4 rounded-xl"
            style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}
          >
            <p className="text-xs mb-2" style={{ color: colors.textSecondary }}>Temporary Password:</p>
            <div className="flex items-center gap-3">
              <code 
                className="flex-1 text-xl font-mono font-bold tracking-wider py-2 px-4 rounded-lg text-center"
                style={{ 
                  background: `${colors.primary}20`, 
                  color: colors.primary,
                  border: `1px solid ${colors.primary}40`
                }}
              >
                {passwordResetResult?.tempPassword}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(passwordResetResult?.tempPassword || '');
                  success('Password copied!');
                }}
                className="p-3 rounded-lg transition-colors hover:bg-white/10"
                style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                title="Copy Password"
              >
                <Copy className="w-5 h-5" style={{ color: colors.textSecondary }} />
              </button>
            </div>
          </div>

          {/* Instructions */}
          <div 
            className="p-4 rounded-xl flex items-start gap-3"
            style={{ 
              background: `${colors.warning}10`,
              border: `1px solid ${colors.warning}20`
            }}
          >
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" style={{ color: colors.warning }} />
            <div className="text-sm" style={{ color: colors.textSecondary }}>
              <p className="font-medium text-white mb-1">Important:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Share this password securely with the student</li>
                <li>The student must change it on next login</li>
                <li>This password will not be shown again</li>
              </ul>
            </div>
          </div>
        </div>
      </Modal>

      {/* Add Student Success Modal */}
      <Modal
        isOpen={!!addResult?.isOpen}
        onClose={() => setAddResult(null)}
        title={
          <div className="flex items-center gap-3">
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: `${colors.accentMint}20`, color: colors.accentMint }}
            >
              <GraduationCap className="w-8 h-8" />
            </div>
            <span>Student Added Successfully!</span>
          </div>
        }
        size="sm"
        footer={
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setAddResult(null)}
            className="w-full py-3 px-4 rounded-xl font-semibold text-white transition-all"
            style={{ 
              background: `linear-gradient(135deg, ${colors.accentMint}, ${colors.primary})`,
              boxShadow: `0 4px 15px ${colors.accentMint}40`
            }}
          >
            Done
          </motion.button>
        }
      >
        <div className="space-y-4">
          {/* Student Info Card */}
          <div 
            className="p-4 rounded-xl"
            style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}
          >
            <div className="flex items-center gap-4 mb-3">
              <div 
                className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold"
                style={{ background: `${colors.primary}20`, color: colors.primary }}
              >
                {addResult?.studentName?.charAt(0)?.toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-white text-lg">{addResult?.studentName}</p>
                <p className="text-sm" style={{ color: colors.textSecondary }}>{addResult?.regNumber}</p>
              </div>
            </div>
          </div>

          {/* Login Credentials */}
          <div 
            className="p-4 rounded-xl"
            style={{ background: `${colors.primary}10`, border: `1px solid ${colors.primary}20` }}
          >
            <p className="text-xs mb-3 font-semibold uppercase tracking-wider" style={{ color: colors.primary }}>
              Login Credentials
            </p>
            
            <div className="space-y-3">
              <div>
                <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>Username:</p>
                <div className="flex items-center gap-2">
                  <code 
                    className="flex-1 text-sm font-mono font-semibold py-2 px-3 rounded-lg"
                    style={{ background: 'rgba(255, 255, 255, 0.05)', color: colors.textPrimary }}
                  >
                    {addResult?.regNumber}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(addResult?.regNumber || '');
                      success('Username copied!');
                    }}
                    className="p-2 rounded-lg transition-colors hover:bg-white/10"
                    style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                    title="Copy Username"
                  >
                    <Copy className="w-4 h-4" style={{ color: colors.textSecondary }} />
                  </button>
                </div>
              </div>
              
              <div>
                <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>Password:</p>
                <div className="flex items-center gap-2">
                  <code 
                    className="flex-1 text-lg font-mono font-bold tracking-wider py-2 px-3 rounded-lg text-center"
                    style={{ 
                      background: `${colors.accentMint}15`, 
                      color: colors.accentMint,
                      border: `1px solid ${colors.accentMint}30`
                    }}
                  >
                    {addResult?.tempPassword}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(addResult?.tempPassword || '');
                      success('Password copied!');
                    }}
                    className="p-2 rounded-lg transition-colors hover:bg-white/10"
                    style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                    title="Copy Password"
                  >
                    <Copy className="w-4 h-4" style={{ color: colors.textSecondary }} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div 
            className="p-4 rounded-xl flex items-start gap-3"
            style={{ 
              background: `${colors.warning}10`,
              border: `1px solid ${colors.warning}20`
            }}
          >
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" style={{ color: colors.warning }} />
            <div className="text-sm" style={{ color: colors.textSecondary }}>
              <p className="font-medium text-white mb-1">Share With Student:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>The password is their registration number</li>
                <li>They must change it on first login</li>
                <li>These credentials will not be shown again</li>
              </ul>
            </div>
          </div>
        </div>
      </Modal>

      {/* Background Grid Pattern */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(${colors.primary}40 1px, transparent 1px),
            linear-gradient(90deg, ${colors.primary}40 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />

      {/* Animated Gradient Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute w-[500px] h-[500px] rounded-full blur-[120px] opacity-30 animate-pulse"
          style={{
            background: `radial-gradient(circle, ${colors.primary} 0%, transparent 70%)`,
            top: '-10%',
            right: '-5%',
            animationDuration: '4s',
          }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full blur-[100px] opacity-20"
          style={{
            background: `radial-gradient(circle, ${colors.accentMint} 0%, transparent 70%)`,
            bottom: '-5%',
            left: '-5%',
            animation: 'pulse 6s ease-in-out infinite',
          }}
        />
        
        {/* ECE Logo Background - Creative Element */}
        <div className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-[0.08] pointer-events-none">
          <img 
            src="/Ece picture.jpg" 
            alt="ECE Background"
            className="w-full h-full object-contain"
            style={{
              filter: 'grayscale(0.5) brightness(0.8)',
              mixBlendMode: 'soft-light',
            }}
          />
        </div>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 sm:mb-6"
        >
          <GlassCard className="relative overflow-hidden">
            {/* Decorative Elements */}
            <div className="absolute top-0 right-0 w-64 h-64 opacity-5 pointer-events-none">
              <Users className="w-full h-full" style={{ color: colors.accentMint }} />
            </div>
            <div 
              className="absolute top-0 left-0 w-full h-1"
              style={{ background: `linear-gradient(90deg, ${colors.accentMint}, ${colors.primary}, transparent)` }}
            />
            
            <div className="relative z-10">
              <motion.button
                whileHover={{ x: -4 }}
                onClick={() => navigate('/admin/dashboard')}
                className="flex items-center justify-center sm:justify-start gap-2 mb-4 px-4 py-2 rounded-xl transition-all"
                style={{ 
                  background: `${colors.primary}15`,
                  border: `1px solid ${colors.primary}30`,
                  color: colors.primary 
                }}
              >
                <ArrowLeft size={16} />
                <span className="font-medium">Back to Dashboard</span>
              </motion.button>

              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 mb-2">
                <motion.div
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
                  style={{ 
                    background: `linear-gradient(135deg, ${colors.accentMint}30, ${colors.accentMint}10)`,
                    border: `1px solid ${colors.accentMint}40`,
                    boxShadow: `0 4px 15px ${colors.accentMint}20`
                  }}
                >
                  <UserPlus className="w-7 h-7" style={{ color: colors.accentMint }} />
                </motion.div>
                <div className="text-center sm:text-left">
                  {/* Badge */}
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-2"
                    style={{ 
                      background: `linear-gradient(135deg, ${colors.accentMint}30, ${colors.accentMint}10)`,
                      border: `1px solid ${colors.accentMint}40`,
                      color: colors.accentMint,
                    }}
                  >
                    <Sparkles className="w-3 h-3" />
                    STUDENT MANAGEMENT
                  </motion.div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-white">Manage Students</h1>
                  <p className="flex items-center justify-center sm:justify-start gap-2" style={{ color: colors.textSecondary }}>
                    <Filter className="w-4 h-4" />
                    View and manage all registered students
                  </p>
                </div>
                
                {/* Add Student Button - Right Side */}
                {hasPermission('can_manage_students') && (
                  <div className="relative sm:ml-auto mt-3 sm:mt-0">
                    <motion.button
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setShowAddMenu(!showAddMenu)}
                      className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-white transition-all"
                      style={{ 
                        background: `linear-gradient(135deg, ${colors.accentMint}, ${colors.primary})`,
                        boxShadow: `0 4px 20px ${colors.accentMint}40`
                      }}
                    >
                      <Plus className="w-5 h-5" />
                      <span>Add Students</span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${showAddMenu ? 'rotate-180' : ''}`} />
                    </motion.button>

                    <AnimatePresence>
                      {showAddMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: -8, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -8, scale: 0.95 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-0 top-full mt-2 w-64 rounded-xl overflow-hidden shadow-2xl z-50"
                          style={{
                            background: 'linear-gradient(135deg, rgba(30, 20, 15, 0.98), rgba(20, 12, 8, 0.98))',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            backdropFilter: 'blur(20px)',
                          }}
                        >
                          <div className="p-2">
                            <motion.button
                              whileHover={{ x: 4 }}
                              onClick={() => { setShowAddMenu(false); setShowAddModal(true); }}
                              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all hover:bg-white/5"
                            >
                              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${colors.primary}20` }}>
                                <UserPlus className="w-4 h-4" style={{ color: colors.primary }} />
                              </div>
                              <div className="text-left">
                                <p className="text-sm font-medium text-white">Single Student</p>
                                <p className="text-[10px]" style={{ color: colors.textSecondary }}>Add one student manually</p>
                              </div>
                            </motion.button>
                            <motion.button
                              whileHover={{ x: 4 }}
                              onClick={() => { setShowAddMenu(false); setShowBulkModal(true); }}
                              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all hover:bg-white/5"
                            >
                              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${colors.accentMint}20` }}>
                                <Users className="w-4 h-4" style={{ color: colors.accentMint }} />
                              </div>
                              <div className="text-left">
                                <p className="text-sm font-medium text-white">Bulk Import</p>
                                <p className="text-[10px]" style={{ color: colors.textSecondary }}>Upload CSV with multiple students</p>
                              </div>
                            </motion.button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {showAddMenu && <div className="fixed inset-0 z-40" onClick={() => setShowAddMenu(false)} />}
                  </div>
                )}
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
                <div className="p-3 rounded-xl text-center" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <p className="text-2xl font-bold text-white"><AnimatedCounter value={filteredStudents.length} /></p>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Total</p>
                </div>
                <div className="p-3 rounded-xl text-center" style={{ background: `${colors.statusPaid}10`, border: `1px solid ${colors.statusPaid}20` }}>
                  <p className="text-2xl font-bold" style={{ color: colors.statusPaid }}><AnimatedCounter value={filteredStudents.filter(s => s.is_active).length} /></p>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Active</p>
                </div>
                <div className="p-3 rounded-xl text-center" style={{ background: `${colors.primary}10`, border: `1px solid ${colors.primary}20` }}>
                  <p className="text-2xl font-bold" style={{ color: colors.primary }}><AnimatedCounter value={filteredStudents.filter(s => s.is_admin).length} /></p>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Admins</p>
                </div>
                <div className="p-3 rounded-xl text-center" style={{ background: `${colors.accentMint}10`, border: `1px solid ${colors.accentMint}20` }}>
                  <p className="text-2xl font-bold" style={{ color: colors.accentMint }}><AnimatedCounter value={filteredStudents.filter(s => s.is_finsec).length} /></p>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Finsecs</p>
                </div>
                <div className="p-3 rounded-xl text-center" style={{ background: `${colors.warning}10`, border: `1px solid ${colors.warning}20` }}>
                  <p className="text-2xl font-bold" style={{ color: colors.warning }}><AnimatedCounter value={filteredStudents.filter(s => s.is_class_rep).length} /></p>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Class Reps</p>
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        {/* Search Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <GlassCard className="mb-4 sm:mb-6">
            <div className="relative mb-4">
              <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5" style={{ color: colors.textSecondary }} />
              <input
                type="text"
                placeholder="Search by name, reg number, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 rounded-lg text-sm sm:text-base text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}
              />
            </div>

            {/* Quick Filters */}
            <div className="space-y-3">
              {/* Status Filter */}
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: colors.textSecondary }}>Status</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'all' as const, label: 'All', count: filteredStudents.length },
                    { value: 'active' as const, label: 'Active', count: filteredStudents.filter(s => s.is_active).length },
                    { value: 'inactive' as const, label: 'Inactive', count: filteredStudents.filter(s => !s.is_active).length },
                  ].map(({ value, label, count }) => (
                    <button
                      key={value}
                      onClick={() => {
                        setStatusFilter(value);
                        setCurrentPage(1);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all"
                      style={{
                        background: statusFilter === value ? `${colors.primary}30` : 'rgba(255, 255, 255, 0.05)',
                        border: `1px solid ${statusFilter === value ? colors.primary + '60' : 'transparent'}`,
                        color: statusFilter === value ? colors.primary : colors.textSecondary,
                      }}
                    >
                      {label} ({count})
                    </button>
                  ))}
                </div>
              </div>

              {/* Role Filter */}
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: colors.textSecondary }}>Role</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'all' as const, label: 'All Roles', count: filteredStudents.length },
                    { value: 'admin' as const, label: 'Admins', count: filteredStudents.filter(s => s.is_admin).length },
                    { value: 'finsec' as const, label: 'Finsecs', count: filteredStudents.filter(s => s.is_finsec).length },
                    { value: 'class_rep' as const, label: 'Class Reps', count: filteredStudents.filter(s => s.is_class_rep).length },
                    { value: 'student' as const, label: 'Students Only', count: filteredStudents.filter(s => !s.is_admin && !s.is_finsec && !s.is_class_rep).length },
                  ].map(({ value, label, count }) => (
                    <button
                      key={value}
                      onClick={() => {
                        setRoleFilter(value);
                        setCurrentPage(1);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all"
                      style={{
                        background: roleFilter === value ? `${colors.accentMint}30` : 'rgba(255, 255, 255, 0.05)',
                        border: `1px solid ${roleFilter === value ? colors.accentMint + '60' : 'transparent'}`,
                        color: roleFilter === value ? colors.accentMint : colors.textSecondary,
                      }}
                    >
                      {label} ({count})
                    </button>
                  ))}
                </div>
              </div>

              {/* Clear Filters */}
              {(statusFilter !== 'all' || roleFilter !== 'all' || searchQuery !== '') && (
                <button
                  onClick={() => {
                    setStatusFilter('all');
                    setRoleFilter('all');
                    setSearchQuery('');
                    setCurrentPage(1);
                  }}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
                  style={{
                    background: `${colors.statusUnpaid}20`,
                    border: `1px solid ${colors.statusUnpaid}40`,
                    color: colors.statusUnpaid,
                  }}
                >
                  <X className="w-4 h-4" />
                  Clear All Filters
                </button>
              )}
            </div>
          </GlassCard>
        </motion.div>

        {/* Students List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <GlassCard>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
              <h2 className="text-xl font-bold text-white">
                {finalFilteredStudents.length} Student{finalFilteredStudents.length !== 1 ? 's' : ''}
              </h2>
              
              {/* Export Dropdown */}
              <div className="relative">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  disabled={exporting || finalFilteredStudents.length === 0}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: `linear-gradient(135deg, ${colors.primary}20, ${colors.primary}10)`,
                    border: `1px solid ${colors.primary}40`,
                    color: colors.primary,
                  }}
                >
                  {exporting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      <span>Exporting...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Export</span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
                    </>
                  )}
                </motion.button>

                {/* Export Menu Dropdown */}
                <AnimatePresence>
                  {showExportMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-56 rounded-xl overflow-hidden shadow-2xl z-50"
                      style={{
                        background: 'linear-gradient(135deg, rgba(30, 20, 15, 0.98), rgba(20, 12, 8, 0.98))',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        backdropFilter: 'blur(20px)',
                      }}
                    >
                      <div className="p-2">
                        <p className="text-xs font-semibold px-3 py-2 uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                          Export Format
                        </p>
                        
                        {/* PDF Export */}
                        <motion.button
                          whileHover={{ x: 4 }}
                          onClick={() => {
                            setShowExportMenu(false);
                            handleExportPDF();
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all hover:bg-white/5"
                        >
                          <div 
                            className="w-9 h-9 rounded-lg flex items-center justify-center"
                            style={{ background: `${colors.statusUnpaid}20` }}
                          >
                            <FileText className="w-4 h-4" style={{ color: colors.statusUnpaid }} />
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-medium text-white">PDF Document</p>
                            <p className="text-xs" style={{ color: colors.textSecondary }}>Professional formatted report</p>
                          </div>
                        </motion.button>

                        {/* CSV Export */}
                        <motion.button
                          whileHover={{ x: 4 }}
                          onClick={() => {
                            setShowExportMenu(false);
                            handleExportCSV();
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all hover:bg-white/5"
                        >
                          <div 
                            className="w-9 h-9 rounded-lg flex items-center justify-center"
                            style={{ background: `${colors.accentMint}20` }}
                          >
                            <FileSpreadsheet className="w-4 h-4" style={{ color: colors.accentMint }} />
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-medium text-white">CSV Spreadsheet</p>
                            <p className="text-xs" style={{ color: colors.textSecondary }}>Excel compatible format</p>
                          </div>
                        </motion.button>
                      </div>

                      {/* Info Footer */}
                      <div 
                        className="px-4 py-3 border-t"
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.02)',
                          borderColor: 'rgba(255, 255, 255, 0.08)' 
                        }}
                      >
                        <p className="text-xs" style={{ color: colors.textSecondary }}>
                          Exporting {finalFilteredStudents.length} student{finalFilteredStudents.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Click outside to close */}
                {showExportMenu && (
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowExportMenu(false)}
                  />
                )}
              </div>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin rounded-full h-10 w-10 border-3 border-t-transparent"
                    style={{ borderColor: colors.primary, borderTopColor: 'transparent' }}
                  />
                  <p className="text-sm" style={{ color: colors.textSecondary }}>Loading members...</p>
                </div>
              </div>
            ) : finalFilteredStudents.length === 0 ? (
              <div className="text-center py-12">
                <User className="w-16 h-16 mx-auto mb-4" style={{ color: colors.textSecondary }} />
                <p className="text-lg font-medium text-white mb-2">No students found</p>
                <p style={{ color: colors.textSecondary }}>
                  {searchQuery ? 'Try a different search term' : 'No students registered yet'}
                </p>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="min-w-full divide-y" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                    <thead>
                      <tr className="border-b" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                        <th className="text-left py-3 px-4 text-sm font-semibold whitespace-nowrap" style={{ color: colors.textSecondary }}>Student</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold whitespace-nowrap" style={{ color: colors.textSecondary }}>Contact</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold whitespace-nowrap" style={{ color: colors.textSecondary }}>Level</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold whitespace-nowrap" style={{ color: colors.textSecondary }}>Roles</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold whitespace-nowrap" style={{ color: colors.textSecondary }}>Status</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold whitespace-nowrap" style={{ color: colors.textSecondary }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'rgba(255, 255, 255, 0.05)' }}>
                    {paginatedStudents.map((student, index) => (
                      <motion.tr
                        key={student.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(index * 0.02, 0.3) }}
                        className="border-b hover:bg-white/5 transition-colors"
                        style={{ borderColor: 'rgba(255, 255, 255, 0.05)' }}
                      >
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                              style={{ background: gradients.primary }}
                            >
                              {student.full_name.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-white truncate">{student.full_name}</p>
                              <p className="text-sm truncate" style={{ color: colors.textSecondary }}>{student.reg_number}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4 hidden md:table-cell">
                          <p className="text-sm text-white truncate">{student.email}</p>
                          <p className="text-sm" style={{ color: colors.textSecondary }}>{student.phone}</p>
                        </td>
                        <td className="py-4 px-4 hidden lg:table-cell">
                          <p className="text-sm text-white">{student.level}</p>
                          <p className="text-sm" style={{ color: colors.textSecondary }}>Section {student.section}</p>
                        </td>
                        <td className="py-4 px-4 hidden xl:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {student.is_admin && (
                              <span className="px-2 py-1 rounded text-xs font-medium whitespace-nowrap" style={{ background: `${colors.primary}20`, color: colors.primary }}>
                                <Crown className="w-3 h-3 inline mr-1" />
                                Admin
                              </span>
                            )}
                            {student.is_finsec && (
                              <span className="px-2 py-1 rounded text-xs font-medium whitespace-nowrap" style={{ background: `${colors.accentMint}20`, color: colors.accentMint }}>
                                <Shield className="w-3 h-3 inline mr-1" />
                                Finsec
                              </span>
                            )}
                            {student.is_class_rep && (
                              <span className="px-2 py-1 rounded text-xs font-medium whitespace-nowrap" style={{ background: `${colors.warning}20`, color: colors.warning }}>
                                <Users className="w-3 h-3 inline mr-1" />
                                Class Rep
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <button
                            onClick={() => toggleStudentStatus(student)}
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap"
                            style={{
                              background: student.is_active ? `${colors.statusPaid}20` : `${colors.statusUnpaid}20`,
                              color: student.is_active ? colors.statusPaid : colors.statusUnpaid
                            }}
                          >
                            {student.is_active ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            <span className="hidden sm:inline">{student.is_active ? 'Active' : 'Inactive'}</span>
                          </button>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center justify-end gap-1 sm:gap-2">
                            <button
                              onClick={() => toggleFinsec(student)}
                              className="p-2 rounded-lg transition-colors"
                              style={{ background: student.is_finsec ? `${colors.accentMint}20` : 'rgba(255, 255, 255, 0.05)' }}
                              title={student.is_finsec ? 'Remove Finsec' : 'Make Finsec'}
                            >
                              <Shield className="w-4 h-4" style={{ color: student.is_finsec ? colors.accentMint : colors.textSecondary }} />
                            </button>
                            <button
                              onClick={() => toggleAdmin(student)}
                              className="p-2 rounded-lg transition-colors"
                              style={{ background: student.is_admin ? `${colors.primary}20` : 'rgba(255, 255, 255, 0.05)' }}
                              title={student.is_admin ? 'Remove Admin' : 'Make Admin'}
                            >
                              <Crown className="w-4 h-4" style={{ color: student.is_admin ? colors.primary : colors.textSecondary }} />
                            </button>
                            <button
                              onClick={() => toggleClassRep(student)}
                              className="p-2 rounded-lg transition-colors"
                              style={{ background: student.is_class_rep ? `${colors.warning}20` : 'rgba(255, 255, 255, 0.05)' }}
                              title={student.is_class_rep ? 'Remove Class Rep' : 'Make Class Rep'}
                            >
                              <Users className="w-4 h-4" style={{ color: student.is_class_rep ? colors.warning : colors.textSecondary }} />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedStudent(student);
                                setShowEditModal(true);
                              }}
                              className="p-2 rounded-lg transition-colors hover:bg-white/10"
                              style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                              title="Edit Student"
                            >
                              <Edit2 className="w-4 h-4" style={{ color: colors.textSecondary }} />
                            </button>
                            <button
                              onClick={() => handlePasswordReset(student)}
                              className="p-2 rounded-lg transition-colors hover:bg-amber-500/20"
                              style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                              title="Reset Password"
                            >
                              <Key className="w-4 h-4" style={{ color: colors.warning }} />
                            </button>
                            <button
                              onClick={() => deleteStudent(student)}
                              className="p-2 rounded-lg transition-colors hover:bg-red-500/20"
                              style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                              title="Delete Student"
                            >
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="lg:hidden space-y-4">
                {paginatedStudents.map((student, index) => (
                  <motion.div
                    key={student.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.02, 0.3) }}
                    className="rounded-xl overflow-hidden"
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}
                  >
                    {/* Header with Avatar and Name */}
                    <div 
                      className="p-4 flex items-center gap-4"
                      style={{ 
                        background: student.is_admin 
                          ? `linear-gradient(135deg, ${colors.primary}15, transparent)` 
                          : student.is_finsec 
                            ? `linear-gradient(135deg, ${colors.accentMint}15, transparent)`
                            : student.is_class_rep
                              ? `linear-gradient(135deg, ${colors.warning}15, transparent)`
                              : 'transparent'
                      }}
                    >
                      <div
                        className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
                        style={{ 
                          background: student.is_admin 
                            ? gradients.primary 
                            : student.is_finsec 
                              ? `linear-gradient(135deg, ${colors.accentMint}, ${colors.accentMint}80)`
                              : student.is_class_rep
                                ? `linear-gradient(135deg, ${colors.warning}, ${colors.warning}80)`
                                : gradients.primary
                        }}
                      >
                        {student.full_name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white text-base truncate">{student.full_name}</p>
                        <p className="text-sm truncate" style={{ color: colors.textSecondary }}>{student.reg_number}</p>
                        <p className="text-xs truncate" style={{ color: colors.textSecondary }}>{student.email}</p>
                      </div>
                      {/* Status Badge */}
                      <div
                        className="px-2 py-1 rounded-full text-[10px] font-medium shrink-0"
                        style={{
                          background: student.is_active ? `${colors.statusPaid}20` : `${colors.statusUnpaid}20`,
                          color: student.is_active ? colors.statusPaid : colors.statusUnpaid,
                          border: `1px solid ${student.is_active ? `${colors.statusPaid}40` : `${colors.statusUnpaid}40`}`
                        }}
                      >
                        {student.is_active ? '● Active' : '○ Inactive'}
                      </div>
                    </div>

                    {/* Role Badges */}
                    <div className="px-4 pb-3">
                      <div className="flex flex-wrap gap-2">
                        {student.is_admin && (
                          <span 
                            className="px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5"
                            style={{ 
                              background: `${colors.primary}25`, 
                              color: colors.primary,
                              border: `1px solid ${colors.primary}40`
                            }}
                          >
                            <Crown className="w-3.5 h-3.5" />
                            Admin
                          </span>
                        )}
                        {student.is_finsec && (
                          <span 
                            className="px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5"
                            style={{ 
                              background: `${colors.accentMint}25`, 
                              color: colors.accentMint,
                              border: `1px solid ${colors.accentMint}40`
                            }}
                          >
                            <Shield className="w-3.5 h-3.5" />
                            Financial Sec
                          </span>
                        )}
                        {student.is_class_rep && (
                          <span 
                            className="px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5"
                            style={{ 
                              background: `${colors.warning}25`, 
                              color: colors.warning,
                              border: `1px solid ${colors.warning}40`
                            }}
                          >
                            <Users className="w-3.5 h-3.5" />
                            Class Rep
                          </span>
                        )}
                        {!student.is_admin && !student.is_finsec && !student.is_class_rep && (
                          <span 
                            className="px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5"
                            style={{ 
                              background: 'rgba(255, 255, 255, 0.05)', 
                              color: colors.textSecondary,
                              border: '1px solid rgba(255, 255, 255, 0.1)'
                            }}
                          >
                            <User className="w-3.5 h-3.5" />
                            Student
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Details Grid */}
                    <div className="px-4 pb-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2.5 rounded-lg text-center" style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                          <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: colors.textSecondary }}>Level</p>
                          <p className="text-white font-semibold text-sm">{student.level}</p>
                        </div>
                        <div className="p-2.5 rounded-lg text-center" style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                          <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: colors.textSecondary }}>Section</p>
                          <p className="text-white font-semibold text-sm">{student.section || 'N/A'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="p-4 pt-2 space-y-3" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      {/* Activate/Deactivate Button */}
                      <button
                        onClick={() => toggleStudentStatus(student)}
                        className="w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-all active:scale-[0.98]"
                        style={{
                          background: student.is_active ? `${colors.statusUnpaid}15` : `${colors.statusPaid}15`,
                          color: student.is_active ? colors.statusUnpaid : colors.statusPaid,
                          border: `1px solid ${student.is_active ? `${colors.statusUnpaid}30` : `${colors.statusPaid}30`}`
                        }}
                      >
                        {student.is_active ? '⏸ Deactivate Student' : '▶ Activate Student'}
                      </button>
                      
                      {/* Role Toggle Buttons */}
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => toggleFinsec(student)}
                          className="p-3 rounded-xl transition-all active:scale-[0.95] flex flex-col items-center gap-1.5"
                          style={{ 
                            background: student.is_finsec ? `${colors.accentMint}20` : 'rgba(255, 255, 255, 0.05)',
                            border: student.is_finsec ? `1px solid ${colors.accentMint}40` : '1px solid rgba(255, 255, 255, 0.1)'
                          }}
                        >
                          <Shield className="w-5 h-5" style={{ color: student.is_finsec ? colors.accentMint : colors.textSecondary }} />
                          <span className="text-[10px] font-medium" style={{ color: student.is_finsec ? colors.accentMint : colors.textSecondary }}>
                            {student.is_finsec ? '✓ Finsec' : 'Finsec'}
                          </span>
                        </button>
                        <button
                          onClick={() => toggleAdmin(student)}
                          className="p-3 rounded-xl transition-all active:scale-[0.95] flex flex-col items-center gap-1.5"
                          style={{ 
                            background: student.is_admin ? `${colors.primary}20` : 'rgba(255, 255, 255, 0.05)',
                            border: student.is_admin ? `1px solid ${colors.primary}40` : '1px solid rgba(255, 255, 255, 0.1)'
                          }}
                        >
                          <Crown className="w-5 h-5" style={{ color: student.is_admin ? colors.primary : colors.textSecondary }} />
                          <span className="text-[10px] font-medium" style={{ color: student.is_admin ? colors.primary : colors.textSecondary }}>
                            {student.is_admin ? '✓ Admin' : 'Admin'}
                          </span>
                        </button>
                        <button
                          onClick={() => toggleClassRep(student)}
                          className="p-3 rounded-xl transition-all active:scale-[0.95] flex flex-col items-center gap-1.5"
                          style={{ 
                            background: student.is_class_rep ? `${colors.warning}20` : 'rgba(255, 255, 255, 0.05)',
                            border: student.is_class_rep ? `1px solid ${colors.warning}40` : '1px solid rgba(255, 255, 255, 0.1)'
                          }}
                        >
                          <Users className="w-5 h-5" style={{ color: student.is_class_rep ? colors.warning : colors.textSecondary }} />
                          <span className="text-[10px] font-medium" style={{ color: student.is_class_rep ? colors.warning : colors.textSecondary }}>
                            {student.is_class_rep ? '✓ Rep' : 'Class Rep'}
                          </span>
                        </button>
                      </div>

                      {/* Edit/Password Reset/Delete Buttons */}
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => {
                            setSelectedStudent(student);
                            setShowEditModal(true);
                          }}
                          className="p-3 rounded-xl transition-all active:scale-[0.95] flex items-center justify-center gap-2"
                          style={{ 
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.1)'
                          }}
                        >
                          <Edit2 className="w-4 h-4" style={{ color: colors.textSecondary }} />
                          <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>Edit</span>
                        </button>
                        <button
                          onClick={() => handlePasswordReset(student)}
                          className="p-3 rounded-xl transition-all active:scale-[0.95] flex items-center justify-center gap-2"
                          style={{ 
                            background: 'rgba(245, 158, 11, 0.1)',
                            border: '1px solid rgba(245, 158, 11, 0.2)'
                          }}
                        >
                          <Key className="w-4 h-4" style={{ color: colors.warning }} />
                          <span className="text-xs font-medium" style={{ color: colors.warning }}>Reset</span>
                        </button>
                        <button
                          onClick={() => deleteStudent(student)}
                          className="p-3 rounded-xl transition-all active:scale-[0.95] flex items-center justify-center gap-2"
                          style={{ 
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.2)'
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                          <span className="text-xs font-medium text-red-400">Delete</span>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
              </>
            )}
          </GlassCard>
        </motion.div>

        {/* Enhanced Pagination */}
        {!loading && finalFilteredStudents.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-4 sm:mt-6"
          >
            <GlassCard className="relative overflow-hidden">
              <div 
                className="absolute bottom-0 left-0 w-full h-1"
                style={{ background: `linear-gradient(90deg, ${colors.accentMint}, ${colors.primary}, transparent)` }}
              />
              {totalPages > 1 ? (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                         style={{ background: `${colors.primary}15`, border: `1px solid ${colors.primary}30` }}>
                      <Users className="w-5 h-5" style={{ color: colors.primary }} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        Page {currentPage} of {totalPages}
                      </p>
                      <p className="text-xs" style={{ color: colors.textSecondary }}>
                        Showing {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, finalFilteredStudents.length)} of {finalFilteredStudents.length} students
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setCurrentPage(p => Math.max(1, p - 1));
                        scrollToTop();
                      }}
                      disabled={currentPage === 1}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{
                        background: currentPage === 1 ? 'rgba(255, 255, 255, 0.05)' : `${colors.primary}20`,
                        border: `1px solid ${currentPage === 1 ? 'transparent' : `${colors.primary}40`}`,
                        color: currentPage === 1 ? colors.textSecondary : colors.primary,
                      }}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span className="hidden sm:inline">Previous</span>
                    </motion.button>
                    <div className="flex gap-1">
                      {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                        let page: number;
                        if (totalPages <= 5) {
                          page = i + 1;
                        } else if (currentPage <= 3) {
                          page = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          page = totalPages - 4 + i;
                        } else {
                          page = currentPage - 2 + i;
                        }
                        
                        return (
                          <motion.button
                            key={page}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => {
                              setCurrentPage(page);
                              scrollToTop();
                            }}
                            className="w-10 h-10 rounded-xl text-sm font-semibold transition-all"
                            style={{
                              background: currentPage === page 
                                ? `linear-gradient(135deg, ${colors.primary}, ${colors.accentMint})`
                                : 'rgba(255, 255, 255, 0.05)',
                              color: currentPage === page ? 'white' : colors.textSecondary,
                              boxShadow: currentPage === page ? `0 4px 15px ${colors.primary}40` : 'none',
                            }}
                          >
                            {page}
                          </motion.button>
                        );
                      })}
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setCurrentPage(p => Math.min(totalPages, p + 1));
                        scrollToTop();
                      }}
                      disabled={currentPage === totalPages}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{
                        background: currentPage === totalPages ? 'rgba(255, 255, 255, 0.05)' : `${colors.primary}20`,
                        border: `1px solid ${currentPage === totalPages ? 'transparent' : `${colors.primary}40`}`,
                        color: currentPage === totalPages ? colors.textSecondary : colors.primary,
                      }}
                    >
                      <span className="hidden sm:inline">Next</span>
                      <ChevronRight className="w-4 h-4" />
                    </motion.button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-3 py-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                       style={{ background: `${colors.statusPaid}15` }}>
                    <CheckCircle className="w-4 h-4" style={{ color: colors.statusPaid }} />
                  </div>
                  <p className="text-sm" style={{ color: colors.textSecondary }}>
                    Showing all <span className="font-semibold text-white">{finalFilteredStudents.length}</span> student{finalFilteredStudents.length !== 1 ? 's' : ''}
                  </p>
                </div>
              )}
            </GlassCard>
          </motion.div>
        )}
      </div>

      {/* Enhanced Edit Modal */}
      <AnimatePresence>
        {showEditModal && selectedStudent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto overscroll-contain"
            onClick={() => setShowEditModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-md w-full max-h-[90vh] overflow-y-auto"
            >
              <GlassCard className="relative overflow-hidden">
                {/* Modal Header */}
                <div 
                  className="absolute top-0 left-0 w-full h-24"
                  style={{ 
                    background: `linear-gradient(135deg, ${colors.accentMint}30 0%, ${colors.primary}30 50%, transparent 100%)`,
                  }}
                />
                <div 
                  className="absolute top-0 left-0 w-full h-1"
                  style={{ background: `linear-gradient(90deg, ${colors.accentMint}, ${colors.primary})` }}
                />
                
                <div className="relative z-10">
                  {/* Close Button */}
                  <motion.button
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setShowEditModal(false)}
                    className="absolute top-0 right-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                    style={{ background: 'rgba(255, 255, 255, 0.1)' }}
                  >
                    <X className="w-4 h-4" style={{ color: colors.textSecondary }} />
                  </motion.button>

                  {/* Header Content */}
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center shadow-lg"
                         style={{ 
                           background: `linear-gradient(135deg, ${colors.accentMint}30, ${colors.accentMint}10)`,
                           border: `1px solid ${colors.accentMint}40`,
                           boxShadow: `0 4px 15px ${colors.accentMint}20`
                         }}>
                      <Edit2 className="w-7 h-7" style={{ color: colors.accentMint }} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Edit Student</h3>
                      <p className="text-sm" style={{ color: colors.textSecondary }}>
                        Update {selectedStudent.full_name}'s information
                      </p>
                    </div>
                  </div>
                
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2 text-white">Full Name</label>
                      <input
                        type="text"
                        value={selectedStudent.full_name}
                        onChange={(e) => setSelectedStudent({ ...selectedStudent, full_name: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl text-white focus:outline-none focus:ring-2 transition-all"
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.05)', 
                          border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-white">Reg Number</label>
                      <input
                        type="text"
                        value={selectedStudent.reg_number}
                        onChange={(e) => setSelectedStudent({ ...selectedStudent, reg_number: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl text-white focus:outline-none focus:ring-2 transition-all"
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.05)', 
                          border: '1px solid rgba(255, 255, 255, 0.1)' 
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-white">Email</label>
                      <input
                        type="email"
                        value={selectedStudent.email}
                        onChange={(e) => setSelectedStudent({ ...selectedStudent, email: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl text-white focus:outline-none focus:ring-2 transition-all"
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.05)', 
                          border: '1px solid rgba(255, 255, 255, 0.1)' 
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-white">Phone</label>
                      <input
                        type="tel"
                        value={selectedStudent.phone}
                        onChange={(e) => setSelectedStudent({ ...selectedStudent, phone: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl text-white focus:outline-none focus:ring-2 transition-all"
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.05)', 
                          border: '1px solid rgba(255, 255, 255, 0.1)' 
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-white">Department</label>
                      <input
                        type="text"
                        value={selectedStudent.department}
                        onChange={(e) => setSelectedStudent({ ...selectedStudent, department: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl text-white focus:outline-none focus:ring-2 transition-all"
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.05)', 
                          border: '1px solid rgba(255, 255, 255, 0.1)' 
                        }}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <ProfessionalDropdown
                          label="Level"
                          value={selectedStudent.level}
                          onChange={(val) => setSelectedStudent({ ...selectedStudent, level: val as string })}
                          variant="filled"
                          size="md"
                          options={[
                            { value: "100L", label: "100 Level" },
                            { value: "200L", label: "200 Level" },
                            { value: "300L", label: "300 Level" },
                            { value: "400L", label: "400 Level" },
                            { value: "500L", label: "500 Level" },
                          ]}
                        />
                      </div>

                      <div>
                        <ProfessionalDropdown
                          label="Section"
                          value={selectedStudent.section}
                          onChange={(val) => setSelectedStudent({ ...selectedStudent, section: val as string })}
                          variant="filled"
                          size="md"
                          options={[
                            { value: "A", label: "Section A" },
                            { value: "B", label: "Section B" },
                            { value: "C", label: "Section C" },
                            { value: "D", label: "Section D" },
                          ]}
                        />
                      </div>
                    </div>

                    {/* Force Password Change Option */}
                    <div className="p-4 rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                               style={{ background: `${colors.accentMint}15` }}>
                            <Shield className="w-5 h-5" style={{ color: colors.accentMint }} />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">Force Password Change</p>
                            <p className="text-xs" style={{ color: colors.textSecondary }}>
                              Require password reset on next login
                            </p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!selectedStudent.force_password_change}
                            onChange={(e) => setSelectedStudent({ ...selectedStudent, force_password_change: e.target.checked })}
                            disabled={!hasPermission('can_manage_students')}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 rounded-full peer transition-colors duration-200"
                               style={{ 
                                 background: selectedStudent.force_password_change ? colors.accentMint : 'rgba(255, 255, 255, 0.1)'
                               }}
                          >
                            <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200"
                                 style={{ 
                                   transform: selectedStudent.force_password_change ? 'translateX(20px)' : 'translateX(0)'
                                 }}
                            />
                          </div>
                        </label>
                      </div>
                      {!hasPermission('can_manage_students') && (
                        <p className="text-xs mt-2 px-2 py-1 rounded-lg inline-block"
                           style={{ background: `${colors.statusUnpaid}15`, color: colors.statusUnpaid }}>
                          Requires manage-students permission
                        </p>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-4">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setShowEditModal(false)}
                        className="flex-1 px-4 py-3 rounded-xl font-medium transition-colors"
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.1)', 
                          color: colors.textPrimary,
                          border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}
                      >
                        Cancel
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleEditStudent}
                        disabled={editLoading}
                        className="flex-1 px-4 py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-50"
                        style={{ 
                          background: `linear-gradient(135deg, ${colors.accentMint}, ${colors.primary})`,
                          boxShadow: `0 4px 15px ${colors.accentMint}30`
                        }}
                      >
                        {editLoading ? (
                          <span className="flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Saving...
                          </span>
                        ) : (
                          'Save Changes'
                        )}
                      </motion.button>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Student Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto overscroll-contain"
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-md w-full max-h-[90vh] overflow-y-auto"
            >
              <GlassCard className="relative overflow-hidden">
                {/* Modal Header Gradient */}
                <div 
                  className="absolute top-0 left-0 w-full h-24"
                  style={{ 
                    background: `linear-gradient(135deg, ${colors.primary}30 0%, ${colors.accentMint}30 50%, transparent 100%)`,
                  }}
                />
                <div 
                  className="absolute top-0 left-0 w-full h-1"
                  style={{ background: `linear-gradient(90deg, ${colors.primary}, ${colors.accentMint})` }}
                />
                
                <div className="relative z-10">
                  {/* Close Button */}
                  <motion.button
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setShowAddModal(false)}
                    className="absolute top-0 right-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                    style={{ background: 'rgba(255, 255, 255, 0.1)' }}
                  >
                    <X className="w-4 h-4" style={{ color: colors.textSecondary }} />
                  </motion.button>

                  {/* Header Content */}
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center shadow-lg"
                         style={{ 
                           background: `linear-gradient(135deg, ${colors.primary}30, ${colors.primary}10)`,
                           border: `1px solid ${colors.primary}40`,
                           boxShadow: `0 4px 15px ${colors.primary}20`
                         }}>
                      <UserPlus className="w-7 h-7" style={{ color: colors.primary }} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Add New Student</h3>
                      <p className="text-sm" style={{ color: colors.textSecondary }}>
                        Create a new student account
                      </p>
                    </div>
                  </div>

                  {/* Info Banner */}
                  <div 
                    className="p-3 rounded-xl mb-4 flex items-start gap-3"
                    style={{ 
                      background: `${colors.info}10`,
                      border: `1px solid ${colors.info}20`
                    }}
                  >
                    <Key className="w-5 h-5 mt-0.5 shrink-0" style={{ color: colors.info }} />
                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                      The student's password will be set to their <strong className="text-white">registration number</strong>. 
                      They will be required to change it on first login.
                    </p>
                  </div>
                
                  <div className="space-y-4">
                    {/* Full Name */}
                    <div>
                      <label className="block text-sm font-medium mb-2 text-white">
                        Full Name <span style={{ color: colors.statusUnpaid }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={newStudent.full_name}
                        onChange={(e) => setNewStudent({ ...newStudent, full_name: e.target.value })}
                        placeholder="e.g., John Doe"
                        className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 transition-all"
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.05)', 
                          border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}
                      />
                    </div>

                    {/* Registration Number */}
                    <div>
                      <label className="block text-sm font-medium mb-2 text-white">
                        Registration Number <span style={{ color: colors.statusUnpaid }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={newStudent.reg_number}
                        onChange={(e) => setNewStudent({ ...newStudent, reg_number: e.target.value.toUpperCase() })}
                        placeholder="e.g., FE/20/12345678"
                        className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 transition-all uppercase"
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.05)', 
                          border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}
                      />
                      <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                        This will also be the student's username and initial password
                      </p>
                    </div>

                    {/* Email */}
                    <div>
                      <label className="block text-sm font-medium mb-2 text-white">Email (Optional)</label>
                      <input
                        type="email"
                        value={newStudent.email}
                        onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })}
                        placeholder="e.g., john.doe@example.com"
                        className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 transition-all"
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.05)', 
                          border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}
                      />
                    </div>

                    {/* Phone */}
                    <div>
                      <label className="block text-sm font-medium mb-2 text-white">Phone (Optional)</label>
                      <input
                        type="tel"
                        value={newStudent.phone}
                        onChange={(e) => setNewStudent({ ...newStudent, phone: e.target.value })}
                        placeholder="e.g., +234 801 234 5678"
                        className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 transition-all"
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.05)', 
                          border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}
                      />
                    </div>

                    {/* Department */}
                    <div>
                      <label className="block text-sm font-medium mb-2 text-white">Department</label>
                      <input
                        type="text"
                        value={newStudent.department}
                        onChange={(e) => setNewStudent({ ...newStudent, department: e.target.value })}
                        placeholder="e.g., ECE, EEE, Computer Science"
                        className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 transition-all"
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.05)', 
                          border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}
                      />
                    </div>

                    {/* Level and Section Grid */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <ProfessionalDropdown
                          label="Level"
                          value={newStudent.level}
                          onChange={(val) => setNewStudent({ ...newStudent, level: val as string })}
                          variant="filled"
                          size="md"
                          options={[
                            { value: "100L", label: "100 Level" },
                            { value: "200L", label: "200 Level" },
                            { value: "300L", label: "300 Level" },
                            { value: "400L", label: "400 Level" },
                            { value: "500L", label: "500 Level" },
                          ]}
                        />
                      </div>

                      <div>
                        <ProfessionalDropdown
                          label="Section"
                          value={newStudent.section}
                          onChange={(val) => setNewStudent({ ...newStudent, section: val as string })}
                          variant="filled"
                          size="md"
                          options={[
                            { value: "A", label: "Section A" },
                            { value: "B", label: "Section B" },
                            { value: "C", label: "Section C" },
                            { value: "D", label: "Section D" },
                          ]}
                        />
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-4">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          setShowAddModal(false);
                          setNewStudent({
                            full_name: '',
                            reg_number: '',
                            email: '',
                            phone: '',
                            level: '200L',
                            department: 'ECE',
                            section: 'A',
                          });
                        }}
                        className="flex-1 px-4 py-3 rounded-xl font-medium transition-colors"
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.1)', 
                          color: colors.textPrimary,
                          border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}
                      >
                        Cancel
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleAddStudent}
                        disabled={addLoading || !newStudent.full_name.trim() || !newStudent.reg_number.trim()}
                        className="flex-1 px-4 py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ 
                          background: `linear-gradient(135deg, ${colors.primary}, ${colors.accentMint})`,
                          boxShadow: `0 4px 15px ${colors.primary}30`
                        }}
                      >
                        {addLoading ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Creating...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <UserPlus className="w-4 h-4" />
                            Add Student
                          </span>
                        )}
                      </motion.button>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Import Modal */}
      <AnimatePresence>
        {showBulkModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto overscroll-contain"
            onClick={() => setShowBulkModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-lg w-full max-h-[90vh] overflow-y-auto"
            >
              <GlassCard className="relative overflow-hidden">
                {/* Header Gradient */}
                <div className="absolute top-0 left-0 w-full h-24"
                  style={{ background: `linear-gradient(135deg, ${colors.accentMint}30 0%, ${colors.primary}30 50%, transparent 100%)` }} />
                <div className="absolute top-0 left-0 w-full h-1"
                  style={{ background: `linear-gradient(90deg, ${colors.accentMint}, ${colors.primary})` }} />

                <div className="relative z-10">
                  <motion.button
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setShowBulkModal(false)}
                    className="absolute top-0 right-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                    style={{ background: 'rgba(255, 255, 255, 0.1)' }}
                  >
                    <X className="w-4 h-4" style={{ color: colors.textSecondary }} />
                  </motion.button>

                  <div className="flex items-center gap-4 mb-5">
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center shadow-lg"
                      style={{
                        background: `linear-gradient(135deg, ${colors.accentMint}30, ${colors.accentMint}10)`,
                        border: `1px solid ${colors.accentMint}40`,
                        boxShadow: `0 4px 15px ${colors.accentMint}20`
                      }}>
                      <Users className="w-7 h-7" style={{ color: colors.accentMint }} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Bulk Import</h3>
                      <p className="text-sm" style={{ color: colors.textSecondary }}>
                        Import multiple students via CSV
                      </p>
                    </div>
                  </div>

                  <BulkStudentImport
                    onComplete={fetchStudents}
                    onClose={() => setShowBulkModal(false)}
                  />
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />
    </div>
  );
}
