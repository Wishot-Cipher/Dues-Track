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
    if (searchQuery.trim() === '') {
      setFilteredStudents(students);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredStudents(
        students.filter(
          (s) =>
            s.full_name.toLowerCase().includes(query) ||
            s.reg_number.toLowerCase().includes(query) ||
            s.email.toLowerCase().includes(query) ||
            s.level.toLowerCase().includes(query)
        )
      );
    }
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
    <div className="min-h-screen py-6 px-4 relative overflow-hidden" style={{ background: gradients.darkBackground }}>
      {/* Background decorations */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute w-[500px] h-[500px] rounded-full blur-[120px] opacity-20"
          style={{
            background: `radial-gradient(circle, ${colors.primary} 0%, transparent 70%)`,
            top: '-10%',
            right: '-5%',
          }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <button
            onClick={() => navigate('/admin/dashboard')}
            className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg transition-colors"
            style={{ color: colors.textSecondary }}
            onMouseEnter={(e) => (e.currentTarget.style.color = colors.primary)}
            onMouseLeave={(e) => (e.currentTarget.style.color = colors.textSecondary)}
          >
            <ArrowLeft size={20} />
            <span>Back to Admin Dashboard</span>
          </button>

          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: gradients.primary }}
            >
              <UserPlus className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Manage Students</h1>
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
          <GlassCard className="mb-6">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: colors.textSecondary }} />
              <input
                type="text"
                placeholder="Search by name, matric number, email, or level..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-lg text-white focus:outline-none focus:ring-2"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              />
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
                {filteredStudents.length} Student{filteredStudents.length !== 1 ? 's' : ''}
              </h2>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent mx-auto"
                  style={{ borderColor: colors.primary, borderTopColor: 'transparent' }}
                />
                <p className="mt-4" style={{ color: colors.textSecondary }}>Loading students...</p>
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="text-center py-12">
                <User className="w-16 h-16 mx-auto mb-4" style={{ color: colors.textSecondary }} />
                <p className="text-lg font-medium text-white mb-2">No students found</p>
                <p style={{ color: colors.textSecondary }}>
                  {searchQuery ? 'Try a different search term' : 'No students registered yet'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <div className="inline-block min-w-full align-middle">
                  <div className="overflow-hidden">
                    <table className="min-w-full divide-y" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                      <thead>
                        <tr className="border-b" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                          <th className="text-left py-3 px-4 text-sm font-semibold whitespace-nowrap" style={{ color: colors.textSecondary }}>Student</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold whitespace-nowrap hidden md:table-cell" style={{ color: colors.textSecondary }}>Contact</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold whitespace-nowrap hidden lg:table-cell" style={{ color: colors.textSecondary }}>Level</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold whitespace-nowrap hidden xl:table-cell" style={{ color: colors.textSecondary }}>Roles</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold whitespace-nowrap" style={{ color: colors.textSecondary }}>Status</th>
                          <th className="text-right py-3 px-4 text-sm font-semibold whitespace-nowrap" style={{ color: colors.textSecondary }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y" style={{ borderColor: 'rgba(255, 255, 255, 0.05)' }}>
                    {filteredStudents.map((student, index) => (
                      <motion.tr
                        key={student.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
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
            </div>
          </div>
            )}
          </GlassCard>
        </motion.div>
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
