import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { colors, gradients } from '@/config/colors';
import GlassCard from '@/components/ui/GlassCard';
import { supabase } from '@/config/supabase';
import { useToast } from '@/hooks/useToast';
import {
  X,
  Search,
  Users,
  DollarSign,
  CheckCircle,
  UserPlus,
  Trash2,
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import { formatCurrency } from '@/utils/formatters';

interface Student {
  id: string;
  full_name: string;
  reg_number: string;
  level: string;
}

interface PayForOthersModalProps {
  isOpen: boolean;
  onClose: () => void;
  paymentTypeId: string;
  paymentTypeName: string;
  amount: number;
  currentStudentId: string;
  currentUserHasPaid: boolean;
  onProceed: (selectedStudents: Student[], totalAmount: number, includeSelf: boolean) => void;
}

export default function PayForOthersModal({
  isOpen,
  onClose,
  paymentTypeId,
  paymentTypeName,
  amount,
  currentUserHasPaid,
  onProceed
}: PayForOthersModalProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<Student[]>([]);
  const [includeSelf, setIncludeSelf] = useState(!currentUserHasPaid);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const { error: showError } = useToast();

  useEffect(() => {
    if (isOpen) {
      fetchStudents();
    }
  }, [isOpen, paymentTypeId]);

  const fetchStudents = async () => {
    try {
      setLoading(true);

      // Get all students (including current user)
      const { data: allStudents, error: studentsError } = await supabase
        .from('students')
        .select('id, full_name, reg_number, level')
        .order('full_name');

      if (studentsError) throw studentsError;

      // Get students who already paid for this payment type
      const { data: paidPayments, error: paymentsError } = await supabase
        .from('payments')
        .select('student_id')
        .eq('payment_type_id', paymentTypeId)
        .eq('status', 'approved');

      if (paymentsError) throw paymentsError;

      const paidStudentIds = new Set(paidPayments?.map(p => p.student_id) || []);

      // Filter out students who already paid
      const unpaidStudents = allStudents?.filter(s => !paidStudentIds.has(s.id)) || [];

      setStudents(unpaidStudents);
    } catch (error) {
      console.error('Error fetching students:', error);
      showError('Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  const toggleStudent = (student: Student) => {
    setSelectedStudents(prev => {
      const exists = prev.find(s => s.id === student.id);
      if (exists) {
        return prev.filter(s => s.id !== student.id);
      } else {
        return [...prev, student];
      }
    });
  };

  const removeStudent = (studentId: string) => {
    setSelectedStudents(prev => prev.filter(s => s.id !== studentId));
  };

  const filteredStudents = students.filter(student =>
    student.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.reg_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalAmount = (selectedStudents.length + (includeSelf && !currentUserHasPaid ? 1 : 0)) * amount;

  const handleProceed = () => {
    if (selectedStudents.length === 0 && !includeSelf) {
      showError('Please select at least one student or include yourself');
      return;
    }
    if (selectedStudents.length === 0 && includeSelf && currentUserHasPaid) {
      showError('You have already paid. Please select other students.');
      return;
    }
    onProceed(selectedStudents, totalAmount, includeSelf && !currentUserHasPaid);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0, 0, 0, 0.8)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-5xl max-h-[90vh] overflow-hidden"
        >
          <GlassCard>
            <div className="flex flex-col h-full max-h-[85vh]">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{ background: `${colors.primary}20` }}
                  >
                    <Users className="w-6 h-6" style={{ color: colors.primary }} />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-white">
                      Pay for Fellow Students
                    </h2>
                    <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                      {paymentTypeName} • {formatCurrency(amount)} per student
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg transition-colors"
                  style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                >
                  <X className="w-6 h-6" style={{ color: colors.textSecondary }} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left: Student Selection */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-bold text-white mb-3">Select Students</h3>
                      
                      {/* Include Self Checkbox */}
                      {!currentUserHasPaid && (
                        <div className="mb-4 p-3 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.05)', border: `1px solid ${includeSelf ? colors.primary : 'rgba(255, 255, 255, 0.1)'}` }}>
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={includeSelf}
                              onChange={(e) => setIncludeSelf(e.target.checked)}
                              className="w-5 h-5 rounded"
                              style={{ accentColor: colors.primary }}
                            />
                            <div className="flex-1">
                              <p className="font-medium text-white">Include myself in this payment</p>
                              <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                                Pay for yourself along with selected students
                              </p>
                            </div>
                            {includeSelf && (
                              <span className="text-sm font-medium" style={{ color: colors.primary }}>
                                +{formatCurrency(amount)}
                              </span>
                            )}
                          </label>
                        </div>
                      )}
                      
                      {/* Search */}
                      <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: colors.textSecondary }} />
                        <input
                          type="text"
                          placeholder="Search by name or reg number..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2"
                          style={{ 
                            background: 'rgba(255, 255, 255, 0.05)', 
                            border: '1px solid rgba(255, 255, 255, 0.1)'
                          }}
                        />
                      </div>
                    </div>

                    {/* Students List */}
                    <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                      {loading ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-4 border-t-transparent" 
                               style={{ borderColor: colors.primary, borderTopColor: 'transparent' }} />
                        </div>
                      ) : filteredStudents.length === 0 ? (
                        <div className="text-center py-8">
                          <AlertCircle className="w-12 h-12 mx-auto mb-3" style={{ color: colors.textSecondary }} />
                          <p style={{ color: colors.textSecondary }}>
                            {searchTerm ? 'No students found' : 'All students have paid'}
                          </p>
                        </div>
                      ) : (
                        filteredStudents.map(student => {
                          const isSelected = selectedStudents.some(s => s.id === student.id);
                          
                          return (
                            <button
                              key={student.id}
                              onClick={() => toggleStudent(student)}
                              className="w-full text-left p-4 rounded-lg transition-all"
                              style={{
                                background: isSelected ? `${colors.primary}20` : 'rgba(255, 255, 255, 0.05)',
                                border: `1px solid ${isSelected ? colors.primary : 'rgba(255, 255, 255, 0.1)'}`
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <p className="font-medium text-white">{student.full_name}</p>
                                  <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                                    {student.reg_number} • {student.level}
                                  </p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-medium" style={{ color: colors.primary }}>
                                    {formatCurrency(amount)}
                                  </span>
                                  {isSelected ? (
                                    <CheckCircle className="w-5 h-5" style={{ color: colors.statusPaid }} />
                                  ) : (
                                    <UserPlus className="w-5 h-5" style={{ color: colors.textSecondary }} />
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Right: Selected Students Summary */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-white">
                        Selected ({selectedStudents.length})
                      </h3>
                      {selectedStudents.length > 0 && (
                        <button
                          onClick={() => setSelectedStudents([])}
                          className="text-sm font-medium"
                          style={{ color: colors.statusUnpaid }}
                        >
                          Clear All
                        </button>
                      )}
                    </div>

                    {selectedStudents.length === 0 ? (
                      <div
                        className="p-8 rounded-lg border-2 border-dashed text-center"
                        style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}
                      >
                        <Users className="w-12 h-12 mx-auto mb-3" style={{ color: colors.textSecondary }} />
                        <p style={{ color: colors.textSecondary }}>
                          No students selected yet
                        </p>
                        <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                          Select students from the list to continue
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                          {selectedStudents.map(student => (
                            <div
                              key={student.id}
                              className="p-3 rounded-lg flex items-center justify-between"
                              style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                            >
                              <div className="flex-1">
                                <p className="font-medium text-white text-sm">{student.full_name}</p>
                                <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                                  {student.reg_number}
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm" style={{ color: colors.primary }}>
                                  {formatCurrency(amount)}
                                </span>
                                <button
                                  onClick={() => removeStudent(student.id)}
                                  className="p-1 rounded transition-colors hover:bg-red-500/20"
                                >
                                  <Trash2 className="w-4 h-4" style={{ color: colors.statusUnpaid }} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Include Self Indicator */}
                        {includeSelf && !currentUserHasPaid && (
                          <div
                            className="p-3 rounded-lg flex items-center gap-2"
                            style={{ background: `${colors.primary}20`, border: `1px solid ${colors.primary}` }}
                          >
                            <CheckCircle className="w-5 h-5" style={{ color: colors.primary }} />
                            <div className="flex-1">
                              <p className="font-medium text-white text-sm">You are included</p>
                              <p className="text-xs" style={{ color: colors.textSecondary }}>+{formatCurrency(amount)}</p>
                            </div>
                          </div>
                        )}

                        {/* Total Summary */}
                        <div
                          className="p-4 rounded-lg"
                          style={{ background: gradients.primary }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-white font-medium">Total Students:</span>
                            <span className="text-white font-bold">{selectedStudents.length + (includeSelf && !currentUserHasPaid ? 1 : 0)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-white font-medium">Total Amount:</span>
                            <div className="flex items-center gap-2">
                              <DollarSign className="w-5 h-5 text-white" />
                              <span className="text-2xl font-bold text-white">
                                {formatCurrency(totalAmount)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Breakdown */}
                        <div
                          className="p-3 rounded-lg text-sm"
                          style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                        >
                          <p style={{ color: colors.textSecondary }}>
                            {selectedStudents.length + (includeSelf && !currentUserHasPaid ? 1 : 0)} student{(selectedStudents.length + (includeSelf && !currentUserHasPaid ? 1 : 0)) !== 1 ? 's' : ''} × {formatCurrency(amount)} = {formatCurrency(totalAmount)}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                <div className="flex items-center justify-between gap-4">
                  <button
                    onClick={onClose}
                    className="px-6 py-3 rounded-lg font-medium transition-all"
                    style={{ background: 'rgba(255, 255, 255, 0.05)', color: colors.textPrimary }}
                  >
                    Cancel
                  </button>
                  
                  <button
                    onClick={handleProceed}
                    disabled={selectedStudents.length === 0}
                    className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: gradients.primary }}
                  >
                    <span>Proceed to Payment</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
