import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { colors, gradients } from '@/config/colors';
import GlassCard from '@/components/ui/GlassCard';
import AnimatedCounter from '@/components/ui/AnimatedCounter';
import Modal from '@/components/ui/Modal';
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
  X,
  AlertTriangle,
} from 'lucide-react';
import Footer from '@/components/Footer';
import { useAuth } from '@/hooks/useAuth';
import authService from '@/services/authService';

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
  is_classrep?: boolean; // computed from admins
  created_at: string;
}

export default function ManageStudentsPage() {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const { hasPermission, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Quick filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'finsec' | 'classrep' | 'student'>('all');
  
  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'delete' | 'admin' | 'finsec' | 'classrep' | null;
    student: Student | null;
    action: 'grant' | 'remove' | 'delete';
  }>({ isOpen: false, type: null, student: null, action: 'grant' });
  
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
    } else if (roleFilter === 'classrep') {
      filtered = filtered.filter(s => s.is_classrep);
    } else if (roleFilter === 'student') {
      filtered = filtered.filter(s => !s.is_admin && !s.is_finsec && !s.is_classrep);
    }
    
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

  interface AdminRecord {
    id: string;
    role: string;
    can_create_payments: boolean;
    can_approve_payments: boolean;
    can_manage_students: boolean;
    can_view_analytics: boolean;
  }

  const computeRoleFlags = (s: Partial<Student> & { admins?: AdminRecord[] }): Student => {
    const admins = s.admins || [];
    return {
      ...(s as Student),
      admins,
      is_admin: admins.some(a => a.role === 'admin'),
      is_finsec: admins.some(a => a.role === 'finsec'),
      is_classrep: admins.some(a => a.role === 'classrep'),
    } as Student;
  };

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('students')
        .select(`*, admins (id, role, can_create_payments, can_approve_payments, can_manage_students, can_view_analytics)`)
        .order('created_at', { ascending: false });

      if (error) throw error;

  const mapped = (data || []).map((s: Partial<Student> & { admins?: AdminRecord[] }) => computeRoleFlags(s));
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

    try {
      setEditLoading(true);
      const { error } = await supabase
        .from('students')
        .update({
          full_name: selectedStudent.full_name,
          reg_number: selectedStudent.reg_number,
          email: selectedStudent.email,
          phone: selectedStudent.phone,
          level: selectedStudent.level,
          department: selectedStudent.department,
          section: selectedStudent.section,
          force_password_change: selectedStudent.force_password_change ?? false,
          is_active: selectedStudent.is_active,
        })
        .eq('id', selectedStudent.id);

      if (error) {
        // Handle unique constraint on reg_number gracefully
        const msg = (error.message || '').toString().toLowerCase();
        const details = (error.details || '').toString().toLowerCase();
        if (
          error.code === '23505' ||
          msg.includes('duplicate') ||
          msg.includes('unique') ||
          details.includes('duplicate') ||
          details.includes('already exist') ||
          details.includes('already exists')
        ) {
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
          await supabase.from('notifications').insert({
            recipient_id: selectedStudent.id,
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
    try {
      const { error } = await supabase
        .from('students')
        .update({ is_active: !student.is_active })
        .eq('id', student.id);

      if (error) throw error;

      success(`Student ${student.is_active ? 'deactivated' : 'activated'} successfully`);
      fetchStudents();
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
      
      // Check if already has finsec role using RPC function
      const { data: existingRole, error: fetchError } = await supabase
        .rpc('has_admin_role', { p_student_id: student.id, p_role: 'finsec' });

      if (fetchError) {
        console.error('Error checking finsec status:', fetchError);
        throw fetchError;
      }

      if (existingRole && existingRole.length > 0) {
        // Remove existing finsec role using RPC function
        const { data: removed, error } = await supabase
          .rpc('remove_admin_role', { p_admin_id: existingRole[0].admin_id });
        
        if (error) {
          console.error('Delete error:', error);
          throw error;
        }
        
        if (!removed) {
          throw new Error('Failed to remove role - no rows affected');
        }
        
        success('Finsec role removed successfully');
        
        // Notify the user
        await supabase.from('notifications').insert({
          recipient_id: student.id,
          type: 'role_removed',
          title: 'Finsec Role Removed',
          message: 'Your Finsec role has been removed. Contact admin for more details.',
          link: '/profile',
        });
      } else {
        // Add finsec role using RPC function
        const { error } = await supabase.rpc('add_admin_role', {
          p_student_id: student.id,
          p_role: 'finsec',
          p_can_create_payments: true,
          p_can_approve_payments: true,
          p_can_manage_students: false,
          p_can_view_analytics: true,
        });
        
        if (error) throw error;
        success('Finsec role granted successfully');
        await supabase.from('notifications').insert({
          recipient_id: student.id,
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
      
      // Check if admin record exists using RPC function
      const { data: existingRole, error: fetchError } = await supabase
        .rpc('has_admin_role', { p_student_id: student.id, p_role: 'admin' });

      if (fetchError) {
        console.error('Error checking admin status:', fetchError);
        throw fetchError;
      }

      if (existingRole && existingRole.length > 0) {
        // Remove existing admin role using RPC function
        const { data: removed, error } = await supabase
          .rpc('remove_admin_role', { p_admin_id: existingRole[0].admin_id });
        
        if (error) {
          console.error('Delete error:', error);
          throw error;
        }
        
        if (!removed) {
          throw new Error('Failed to remove role - no rows affected');
        }
        
        success('Admin role removed successfully');
        
        await supabase.from('notifications').insert({
          recipient_id: student.id,
          type: 'role_removed',
          title: 'Admin Role Removed',
          message: 'Your Admin role has been removed. Contact admin for more details.',
          link: '/profile',
        });
      } else {
        // Add admin role using RPC function
        const { error } = await supabase.rpc('add_admin_role', {
          p_student_id: student.id,
          p_role: 'admin',
          p_can_create_payments: true,
          p_can_approve_payments: true,
          p_can_manage_students: true,
          p_can_view_analytics: true,
        });
        
        if (error) throw error;
        success('Admin role granted successfully');
        await supabase.from('notifications').insert({
          recipient_id: student.id,
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
      type: 'classrep',
      student,
      action: student.is_classrep ? 'remove' : 'grant'
    });
  };

  const executeToggleClassRep = async (student: Student) => {
    try {
      if (!hasPermission('can_manage_students')) {
        showError('You do not have permission to manage student roles');
        return;
      }
      
      // Check if classrep record exists using RPC function
      const { data: existingRole, error: fetchError } = await supabase
        .rpc('has_admin_role', { p_student_id: student.id, p_role: 'classrep' });

      if (fetchError) {
        console.error('Error checking classrep status:', fetchError);
        throw fetchError;
      }

      if (existingRole && existingRole.length > 0) {
        // Remove existing classrep role using RPC function
        const { data: removed, error } = await supabase
          .rpc('remove_admin_role', { p_admin_id: existingRole[0].admin_id });
        
        if (error) {
          console.error('Delete error:', error);
          throw error;
        }
        
        if (!removed) {
          throw new Error('Failed to remove role - no rows affected');
        }
        
        success('class_rep role removed successfully');
        
        await supabase.from('notifications').insert({
          recipient_id: student.id,
          type: 'role_removed',
          title: 'class_rep Role Removed',
          message: 'Your Class Rep role has been removed. Contact admin for more details.',
          link: '/profile',
        });
      } else {
        // Add classrep role using RPC function
        const { error } = await supabase.rpc('add_admin_role', {
          p_student_id: student.id,
          p_role: 'class_rep',
          p_can_create_payments: false,
          p_can_approve_payments: false,
          p_can_manage_students: false,
          p_can_view_analytics: true,
        });
        
        if (error) throw error;
        success('Class Rep role granted successfully');
        await supabase.from('notifications').insert({
          recipient_id: student.id,
          type: 'role_assigned',
          title: 'Class Rep Role Granted',
          message: 'You have been granted Class Rep permissions. You can now view class analytics and represent your classmates.',
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
    try {
      // First delete from auth.users
      const { error: authError } = await supabase.auth.admin.deleteUser(student.id);
      
      if (authError) {
        console.error('Auth deletion error:', authError);
        // Continue even if auth deletion fails (user might not exist in auth)
      }

      // Then delete from students table
      const { error: studentError } = await supabase
        .from('students')
        .delete()
        .eq('id', student.id);

      if (studentError) throw studentError;

      success('Student deleted successfully');
      fetchStudents();
    } catch (error) {
      console.error('Error deleting student:', error);
      showError('Failed to delete student');
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
      case 'classrep':
        return {
          title: confirmModal.action === 'grant' ? 'Grant Class Rep Role' : 'Remove Class Rep Role',
          message: confirmModal.action === 'grant'
            ? `Grant class representative privileges to "${student.full_name}"? They will be able to view class analytics.`
            : `Remove class representative privileges from "${student.full_name}"?`,
          icon: <Users className="w-8 h-8" />,
          color: confirmModal.action === 'grant' ? colors.accentMint : colors.warning,
          buttonText: confirmModal.action === 'grant' ? 'Grant Class Rep' : 'Remove Class Rep'
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
                  <p className="text-2xl font-bold" style={{ color: colors.warning }}><AnimatedCounter value={filteredStudents.filter(s => s.is_classrep).length} /></p>
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
                    { value: 'classrep' as const, label: 'Class Reps', count: filteredStudents.filter(s => s.is_classrep).length },
                    { value: 'student' as const, label: 'Students Only', count: filteredStudents.filter(s => !s.is_admin && !s.is_finsec && !s.is_classrep).length },
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
                  className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: `${colors.statusUnpaid}20`,
                    border: `1px solid ${colors.statusUnpaid}40`,
                    color: colors.statusUnpaid,
                  }}
                >
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
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">
                {finalFilteredStudents.length} Student{finalFilteredStudents.length !== 1 ? 's' : ''}
              </h2>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent mx-auto"
                  style={{ borderColor: colors.primary, borderTopColor: 'transparent' }}
                />
                <p className="mt-4" style={{ color: colors.textSecondary }}>Loading students...</p>
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
                            {student.is_classrep && (
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
                              style={{ background: student.is_classrep ? `${colors.warning}20` : 'rgba(255, 255, 255, 0.05)' }}
                              title={student.is_classrep ? 'Remove Class Rep' : 'Make Class Rep'}
                            >
                              <Users className="w-4 h-4" style={{ color: student.is_classrep ? colors.warning : colors.textSecondary }} />
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
                            : student.is_classrep
                              ? `linear-gradient(135deg, ${colors.warning}15, transparent)`
                              : 'transparent'
                      }}
                    >
                      <div
                        className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0"
                        style={{ 
                          background: student.is_admin 
                            ? gradients.primary 
                            : student.is_finsec 
                              ? `linear-gradient(135deg, ${colors.accentMint}, ${colors.accentMint}80)`
                              : student.is_classrep
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
                        className="px-2 py-1 rounded-full text-[10px] font-medium flex-shrink-0"
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
                        {student.is_classrep && (
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
                        {!student.is_admin && !student.is_finsec && !student.is_classrep && (
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
                            background: student.is_classrep ? `${colors.warning}20` : 'rgba(255, 255, 255, 0.05)',
                            border: student.is_classrep ? `1px solid ${colors.warning}40` : '1px solid rgba(255, 255, 255, 0.1)'
                          }}
                        >
                          <Users className="w-5 h-5" style={{ color: student.is_classrep ? colors.warning : colors.textSecondary }} />
                          <span className="text-[10px] font-medium" style={{ color: student.is_classrep ? colors.warning : colors.textSecondary }}>
                            {student.is_classrep ? '✓ Rep' : 'Class Rep'}
                          </span>
                        </button>
                      </div>

                      {/* Edit/Delete Buttons */}
                      <div className="grid grid-cols-2 gap-2">
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
                          <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>Edit Profile</span>
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
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
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
                        <label className="block text-sm font-medium mb-2 text-white">Level</label>
                        <select
                          value={selectedStudent.level}
                          onChange={(e) => setSelectedStudent({ ...selectedStudent, level: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl text-white focus:outline-none focus:ring-2 transition-all"
                          style={{ 
                            background: 'rgba(255, 255, 255, 0.05)', 
                            border: '1px solid rgba(255, 255, 255, 0.1)' 
                          }}
                        >
                          <option value="100L" style={{ background: colors.background }}>100 Level</option>
                          <option value="200L" style={{ background: colors.background }}>200 Level</option>
                          <option value="300L" style={{ background: colors.background }}>300 Level</option>
                          <option value="400L" style={{ background: colors.background }}>400 Level</option>
                          <option value="500L" style={{ background: colors.background }}>500 Level</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2 text-white">Section</label>
                        <select
                          value={selectedStudent.section}
                          onChange={(e) => setSelectedStudent({ ...selectedStudent, section: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl text-white focus:outline-none focus:ring-2 transition-all"
                          style={{ 
                            background: 'rgba(255, 255, 255, 0.05)', 
                            border: '1px solid rgba(255, 255, 255, 0.1)' 
                          }}
                        >
                          <option value="A" style={{ background: colors.background }}>Section A</option>
                          <option value="B" style={{ background: colors.background }}>Section B</option>
                          <option value="C" style={{ background: colors.background }}>Section C</option>
                          <option value="D" style={{ background: colors.background }}>Section D</option>
                        </select>
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
                            <div className="absolute top-[2px] left-[2px] w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200"
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

      <Footer />
    </div>
  );
}
