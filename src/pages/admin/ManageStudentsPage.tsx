import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { colors, gradients } from '@/config/colors';
import GlassCard from '@/components/ui/GlassCard';
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
  Crown
} from 'lucide-react';
import Footer from '@/components/Footer';

interface Student {
  id: string;
  full_name: string;
  reg_number: string;
  email: string;
  phone: string;
  level: string;
  department: string;
  section: string;
  is_active: boolean;
  is_finsec: boolean;
  is_admin: boolean;
  created_at: string;
}

export default function ManageStudentsPage() {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
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
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'finsec' | 'student'>('all');
  
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
    } else if (roleFilter === 'student') {
      filtered = filtered.filter(s => !s.is_admin && !s.is_finsec);
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

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setStudents(data || []);
      setFilteredStudents(data || []);
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
          email: selectedStudent.email,
          phone: selectedStudent.phone,
          level: selectedStudent.level,
          department: selectedStudent.department,
          section: selectedStudent.section,
          is_active: selectedStudent.is_active,
          is_finsec: selectedStudent.is_finsec,
          is_admin: selectedStudent.is_admin,
        })
        .eq('id', selectedStudent.id);

      if (error) throw error;

      success('Student updated successfully');
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
    try {
      const { error } = await supabase
        .from('students')
        .update({ is_finsec: !student.is_finsec })
        .eq('id', student.id);

      if (error) throw error;

      success(`Finsec role ${student.is_finsec ? 'removed' : 'granted'} successfully`);
      fetchStudents();
    } catch (error) {
      console.error('Error toggling finsec:', error);
      showError('Failed to update finsec role');
    }
  };

  const toggleAdmin = async (student: Student) => {
    try {
      const { error } = await supabase
        .from('students')
        .update({ is_admin: !student.is_admin })
        .eq('id', student.id);

      if (error) throw error;

      success(`Admin role ${student.is_admin ? 'removed' : 'granted'} successfully`);
      fetchStudents();
    } catch (error) {
      console.error('Error toggling admin:', error);
      showError('Failed to update admin role');
    }
  };

  const deleteStudent = async (student: Student) => {
    if (!confirm(`Are you sure you want to delete ${student.full_name}? This action cannot be undone.`)) {
      return;
    }

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

  return (
    <div className="min-h-screen py-4 sm:py-6 relative overflow-x-hidden"  style={{
        background: 'radial-gradient(ellipse at top, #1A0E09 0%, #0F0703 100%)',
      }}
    >
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
          <button
            onClick={() => navigate('/admin/dashboard')}
            className="flex items-center justify-center sm:justify-start gap-2 mb-4 px-3 py-2 rounded-lg transition-colors w-full sm:w-auto"
            style={{ color: colors.textSecondary }}
            onMouseEnter={(e) => (e.currentTarget.style.color = colors.primary)}
            onMouseLeave={(e) => (e.currentTarget.style.color = colors.textSecondary)}
          >
            <ArrowLeft size={20} />
            <span>Back to Admin Dashboard</span>
          </button>

          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 mb-2">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: gradients.primary }}
            >
              <UserPlus className="w-6 h-6 text-white" />
            </div>
            <div className="text-center sm:text-left">
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Manage Students</h1>
              <p style={{ color: colors.textSecondary }}>View and manage all registered students</p>
            </div>
          </div>
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
                    { value: 'student' as const, label: 'Students Only', count: filteredStudents.filter(s => !s.is_admin && !s.is_finsec).length },
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
                    className="p-4 rounded-lg"
                    style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                  >
                    {/* Student Info */}
                    <div className="flex flex-col items-center text-center mb-4">
                      <div
                        className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold mb-3"
                        style={{ background: gradients.primary }}
                      >
                        {student.full_name.charAt(0)}
                      </div>
                      <p className="font-semibold text-white text-lg">{student.full_name}</p>
                      <p className="text-sm mb-1" style={{ color: colors.textSecondary }}>{student.reg_number}</p>
                      <p className="text-xs break-all" style={{ color: colors.textSecondary }}>{student.email}</p>
                    </div>

                    {/* Details */}
                    <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                      <div className="text-center p-2 rounded" style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                        <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>Level</p>
                        <p className="text-white font-semibold">{student.level}</p>
                      </div>
                      <div className="text-center p-2 rounded" style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                        <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>Section</p>
                        <p className="text-white font-semibold">{student.section}</p>
                      </div>
                    </div>

                    {/* Roles & Status */}
                    <div className="flex flex-wrap justify-center gap-2 mb-4">
                      {student.is_admin && (
                        <span className="px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: `${colors.primary}20`, color: colors.primary }}>
                          <Crown className="w-3 h-3 inline mr-1" />
                          Admin
                        </span>
                      )}
                      {student.is_finsec && (
                        <span className="px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: `${colors.accentMint}20`, color: colors.accentMint }}>
                          <Shield className="w-3 h-3 inline mr-1" />
                          Finsec
                        </span>
                      )}
                      <span
                        className="px-3 py-1.5 rounded-full text-xs font-medium"
                        style={{
                          background: student.is_active ? `${colors.statusPaid}20` : `${colors.statusUnpaid}20`,
                          color: student.is_active ? colors.statusPaid : colors.statusUnpaid
                        }}
                      >
                        {student.is_active ? '✓ Active' : '✕ Inactive'}
                      </span>
                    </div>

                    {/* Actions - Stacked Layout */}
                    <div className="space-y-2">
                      {/* Primary Action */}
                      <button
                        onClick={() => toggleStudentStatus(student)}
                        className="w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                        style={{
                          background: student.is_active ? `${colors.statusUnpaid}20` : `${colors.statusPaid}20`,
                          color: student.is_active ? colors.statusUnpaid : colors.statusPaid,
                          border: `1px solid ${student.is_active ? `${colors.statusUnpaid}40` : `${colors.statusPaid}40`}`
                        }}
                      >
                        {student.is_active ? 'Deactivate Student' : 'Activate Student'}
                      </button>
                      
                      {/* Secondary Actions */}
                      <div className="grid grid-cols-4 gap-2">
                        <button
                          onClick={() => toggleFinsec(student)}
                          className="p-3 rounded-lg transition-colors flex flex-col items-center gap-1"
                          style={{ background: student.is_finsec ? `${colors.accentMint}20` : 'rgba(255, 255, 255, 0.05)' }}
                          title={student.is_finsec ? 'Remove Finsec' : 'Make Finsec'}
                        >
                          <Shield className="w-5 h-5" style={{ color: student.is_finsec ? colors.accentMint : colors.textSecondary }} />
                          <span className="text-[10px]" style={{ color: student.is_finsec ? colors.accentMint : colors.textSecondary }}>Finsec</span>
                        </button>
                        <button
                          onClick={() => toggleAdmin(student)}
                          className="p-3 rounded-lg transition-colors flex flex-col items-center gap-1"
                          style={{ background: student.is_admin ? `${colors.primary}20` : 'rgba(255, 255, 255, 0.05)' }}
                          title={student.is_admin ? 'Remove Admin' : 'Make Admin'}
                        >
                          <Crown className="w-5 h-5" style={{ color: student.is_admin ? colors.primary : colors.textSecondary }} />
                          <span className="text-[10px]" style={{ color: student.is_admin ? colors.primary : colors.textSecondary }}>Admin</span>
                        </button>
                        <button
                          onClick={() => {
                            setSelectedStudent(student);
                            setShowEditModal(true);
                          }}
                          className="p-3 rounded-lg transition-colors flex flex-col items-center gap-1"
                          style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                          title="Edit Student"
                        >
                          <Edit2 className="w-5 h-5" style={{ color: colors.textSecondary }} />
                          <span className="text-[10px]" style={{ color: colors.textSecondary }}>Edit</span>
                        </button>
                        <button
                          onClick={() => deleteStudent(student)}
                          className="p-3 rounded-lg transition-colors flex flex-col items-center gap-1"
                          style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                          title="Delete Student"
                        >
                          <Trash2 className="w-5 h-5 text-red-400" />
                          <span className="text-[10px] text-red-400">Delete</span>
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

        {/* Pagination */}
        {!loading && finalFilteredStudents.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-4 sm:mt-6"
          >
            <GlassCard>
              {totalPages > 1 ? (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <p className="text-xs sm:text-sm text-center sm:text-left" style={{ color: colors.textSecondary }}>
                    Showing {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, finalFilteredStudents.length)} of {finalFilteredStudents.length}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      onClick={() => {
                        setCurrentPage(p => Math.max(1, p - 1));
                        scrollToTop();
                      }}
                      disabled={currentPage === 1}
                      className="px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{
                        background: currentPage === 1 ? 'rgba(255, 255, 255, 0.05)' : `${colors.primary}20`,
                        color: currentPage === 1 ? colors.textSecondary : colors.primary,
                      }}
                    >
                      Previous
                    </button>
                    <div className="flex flex-wrap gap-1 justify-center">
                      {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
                        // Show first 3, last 3, and current page with neighbors
                        const page = i + 1;
                        const showPage = page <= 3 || page > totalPages - 3 || Math.abs(page - currentPage) <= 1;
                        
                        if (!showPage && i > 0 && (i === 3 || i === totalPages - 4)) {
                          return <span key={page} className="px-2" style={{ color: colors.textSecondary }}>...</span>;
                        }
                        
                        if (!showPage) return null;
                        
                        return (
                          <button
                            key={page}
                            onClick={() => {
                              setCurrentPage(page);
                              scrollToTop();
                            }}
                            className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg text-xs sm:text-sm font-medium transition-all"
                            style={{
                              background: currentPage === page ? colors.primary : 'rgba(255, 255, 255, 0.05)',
                              color: currentPage === page ? 'white' : colors.textSecondary,
                            }}
                          >
                            {page}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => {
                        setCurrentPage(p => Math.min(totalPages, p + 1));
                        scrollToTop();
                      }}
                      disabled={currentPage === totalPages}
                      className="px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{
                        background: currentPage === totalPages ? 'rgba(255, 255, 255, 0.05)' : `${colors.primary}20`,
                        color: currentPage === totalPages ? colors.textSecondary : colors.primary,
                      }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-xs sm:text-sm" style={{ color: colors.textSecondary }}>
                    Showing all {finalFilteredStudents.length} student{finalFilteredStudents.length !== 1 ? 's' : ''}
                  </p>
                </div>
              )}
            </GlassCard>
          </motion.div>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && selectedStudent && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setShowEditModal(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="max-w-md w-full"
          >
            <GlassCard className="p-6">
              <h3 className="text-xl font-bold text-white mb-4">Edit Student</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Full Name</label>
                  <input
                    type="text"
                    value={selectedStudent.full_name}
                    onChange={(e) => setSelectedStudent({ ...selectedStudent, full_name: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg text-white focus:outline-none focus:ring-2"
                    style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Email</label>
                  <input
                    type="email"
                    value={selectedStudent.email}
                    onChange={(e) => setSelectedStudent({ ...selectedStudent, email: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg text-white focus:outline-none focus:ring-2"
                    style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Phone</label>
                  <input
                    type="tel"
                    value={selectedStudent.phone}
                    onChange={(e) => setSelectedStudent({ ...selectedStudent, phone: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg text-white focus:outline-none focus:ring-2"
                    style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Department</label>
                  <input
                    type="text"
                    value={selectedStudent.department}
                    onChange={(e) => setSelectedStudent({ ...selectedStudent, department: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg text-white focus:outline-none focus:ring-2"
                    style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-white">Level</label>
                    <select
                      value={selectedStudent.level}
                      onChange={(e) => setSelectedStudent({ ...selectedStudent, level: e.target.value })}
                      className="w-full px-4 py-2 rounded-lg text-white focus:outline-none focus:ring-2"
                      style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                    >
                      <option value="100" style={{ background: colors.background }}>100 Level</option>
                      <option value="200" style={{ background: colors.background }}>200 Level</option>
                      <option value="300" style={{ background: colors.background }}>300 Level</option>
                      <option value="400" style={{ background: colors.background }}>400 Level</option>
                      <option value="500" style={{ background: colors.background }}>500 Level</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2 text-white">Section</label>
                    <select
                      value={selectedStudent.section}
                      onChange={(e) => setSelectedStudent({ ...selectedStudent, section: e.target.value })}
                      className="w-full px-4 py-2 rounded-lg text-white focus:outline-none focus:ring-2"
                      style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                    >
                      <option value="A" style={{ background: colors.background }}>Section A</option>
                      <option value="B" style={{ background: colors.background }}>Section B</option>
                      <option value="C" style={{ background: colors.background }}>Section C</option>
                      <option value="D" style={{ background: colors.background }}>Section D</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-4 mt-6">
                  <button
                    onClick={() => setShowEditModal(false)}
                    className="flex-1 px-4 py-2 rounded-lg font-medium transition-colors"
                    style={{ background: 'rgba(255, 255, 255, 0.1)', color: colors.textPrimary }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleEditStudent}
                    disabled={editLoading}
                    className="flex-1 px-4 py-2 rounded-lg font-medium text-white transition-opacity disabled:opacity-50"
                    style={{ background: gradients.primary }}
                  >
                    {editLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      )}

      <Footer />
    </div>
  );
}
