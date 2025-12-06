import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { colors, gradients } from '@/config/colors';
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
  AlertCircle,
  Sparkles,
  Heart,
  UserCheck
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
  currentStudentId,
  currentUserHasPaid,
  onProceed
}: PayForOthersModalProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<Student[]>([]);
  const [includeSelf, setIncludeSelf] = useState(!currentUserHasPaid);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const { error: showError } = useToast();

  const fetchStudents = async () => {
    try {
      setLoading(true);

      // Get all students EXCEPT the current user (who is the one paying)
      const { data: allStudents, error: studentsError } = await supabase
        .from('students')
        .select('id, full_name, reg_number, level')
        .neq('id', currentStudentId) // Exclude current user from the list
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

  useEffect(() => {
    if (isOpen) {
      fetchStudents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, paymentTypeId, currentStudentId]);

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
        style={{ background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, y: 20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.9, y: 20, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-3xl"
          style={{ 
            background: 'linear-gradient(180deg, #1A0E09 0%, #0F0703 100%)',
            border: '1px solid rgba(255, 107, 53, 0.15)',
            boxShadow: '0 25px 80px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 107, 53, 0.1)'
          }}
        >
          <div className="flex flex-col h-full max-h-[85vh]">
            {/* Header */}
            <div 
              className="flex items-center justify-between p-6 border-b relative overflow-hidden" 
              style={{ 
                borderColor: 'rgba(255, 255, 255, 0.08)',
                background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.08) 0%, transparent 100%)'
              }}
            >
              {/* Decorative glow */}
              <div className="absolute -top-20 -left-20 w-40 h-40 rounded-full" style={{ background: `${colors.primary}20`, filter: 'blur(40px)' }} />
              
              <div className="relative z-10 flex items-center gap-4">
                <motion.div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center relative"
                  style={{ 
                    background: `linear-gradient(135deg, ${colors.primary}25 0%, ${colors.primary}10 100%)`,
                    border: `1px solid ${colors.primary}30`
                  }}
                  whileHover={{ scale: 1.05, rotate: -5 }}
                >
                  <Users className="w-7 h-7" style={{ color: colors.primary }} />
                  <motion.div
                    className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: gradients.primary }}
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                  >
                    <Heart className="w-3.5 h-3.5 text-white" />
                  </motion.div>
                </motion.div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-xl sm:text-2xl font-bold text-white">
                      Pay for Fellow Students
                    </h2>
                    <span 
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                      style={{ background: `${colors.accentMint}20`, color: colors.accentMint }}
                    >
                      Helper Mode
                    </span>
                  </div>
                  <p className="text-sm" style={{ color: colors.textSecondary }}>
                    {paymentTypeName} • <span style={{ color: colors.primary, fontWeight: 600 }}>{formatCurrency(amount)}</span> per student
                  </p>
                </div>
              </div>
              <motion.button
                onClick={onClose}
                className="relative z-10 p-2.5 rounded-xl transition-colors"
                style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                whileHover={{ scale: 1.05, background: 'rgba(255, 255, 255, 0.1)' }}
                whileTap={{ scale: 0.95 }}
              >
                <X className="w-5 h-5" style={{ color: colors.textSecondary }} />
              </motion.button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Student Selection */}
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <UserPlus className="w-5 h-5" style={{ color: colors.primary }} />
                      <h3 className="text-lg font-bold text-white">Select Students</h3>
                    </div>
                    
                    {/* Include Self Checkbox */}
                    {!currentUserHasPaid && (
                      <motion.div 
                        className="mb-4 p-4 rounded-xl cursor-pointer transition-all"
                        style={{ 
                          background: includeSelf 
                            ? `linear-gradient(135deg, ${colors.primary}15 0%, ${colors.primary}05 100%)`
                            : 'rgba(255, 255, 255, 0.03)',
                          border: `1px solid ${includeSelf ? colors.primary + '50' : 'rgba(255, 255, 255, 0.08)'}`,
                        }}
                        whileHover={{ scale: 1.01 }}
                        onClick={() => setIncludeSelf(!includeSelf)}
                      >
                        <label className="flex items-center gap-3 cursor-pointer">
                          <div 
                            className="w-6 h-6 rounded-lg flex items-center justify-center transition-all"
                            style={{ 
                              background: includeSelf ? gradients.primary : 'rgba(255, 255, 255, 0.1)',
                              border: `1px solid ${includeSelf ? colors.primary : 'rgba(255, 255, 255, 0.2)'}`
                            }}
                          >
                            {includeSelf && <CheckCircle className="w-4 h-4 text-white" />}
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-white">Include myself in this payment</p>
                            <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                              Pay for yourself along with selected students
                            </p>
                          </div>
                          {includeSelf && (
                            <span className="text-sm font-bold px-3 py-1 rounded-lg" style={{ background: `${colors.primary}20`, color: colors.primary }}>
                              +{formatCurrency(amount)}
                            </span>
                          )}
                        </label>
                      </motion.div>
                    )}
                    
                    {/* Search */}
                    <div className="relative mb-4">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: colors.textSecondary }} />
                      <input
                        type="text"
                        placeholder="Search by name or reg number..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full rounded-xl pl-12 pr-4 py-3.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 transition-all"
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.05)', 
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)'
                        }}
                      />
                    </div>
                  </div>

                  {/* Students List */}
                  <div 
                    className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar pr-2 rounded-xl p-3"
                    style={{ background: 'rgba(0, 0, 0, 0.2)' }}
                  >
                    {loading ? (
                      <div className="flex flex-col items-center justify-center py-12">
                        <motion.div 
                          className="w-12 h-12 rounded-full border-4 border-t-transparent"
                          style={{ borderColor: colors.primary, borderTopColor: 'transparent' }}
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                        />
                        <p className="mt-4 text-sm" style={{ color: colors.textSecondary }}>Loading students...</p>
                      </div>
                    ) : filteredStudents.length === 0 ? (
                      <motion.div 
                        className="text-center py-12"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <div 
                          className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                          style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                        >
                          <AlertCircle className="w-8 h-8" style={{ color: colors.textSecondary }} />
                        </div>
                        <p className="font-medium text-white mb-1">
                          {searchTerm ? 'No students found' : 'All students have paid'}
                        </p>
                        <p className="text-sm" style={{ color: colors.textSecondary }}>
                          {searchTerm ? 'Try a different search term' : 'Great! Everyone is up to date'}
                        </p>
                      </motion.div>
                    ) : (
                      filteredStudents.map((student, index) => {
                        const isSelected = selectedStudents.some(s => s.id === student.id);
                        
                        return (
                          <motion.button
                            key={student.id}
                            onClick={() => toggleStudent(student)}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.02 }}
                            className="w-full text-left p-4 rounded-xl transition-all"
                            style={{
                              background: isSelected 
                                ? `linear-gradient(135deg, ${colors.statusPaid}15 0%, ${colors.statusPaid}05 100%)`
                                : 'rgba(255, 255, 255, 0.03)',
                              border: `1px solid ${isSelected ? colors.statusPaid + '50' : 'rgba(255, 255, 255, 0.06)'}`,
                            }}
                            whileHover={{ 
                              scale: 1.01,
                              background: isSelected 
                                ? `linear-gradient(135deg, ${colors.statusPaid}20 0%, ${colors.statusPaid}08 100%)`
                                : 'rgba(255, 255, 255, 0.06)'
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div 
                                  className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold"
                                  style={{ 
                                    background: isSelected ? `${colors.statusPaid}20` : 'rgba(255, 255, 255, 0.08)',
                                    color: isSelected ? colors.statusPaid : colors.textSecondary
                                  }}
                                >
                                  {student.full_name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-medium text-white">{student.full_name}</p>
                                  <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                                    {student.reg_number} • {student.level}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-semibold" style={{ color: colors.primary }}>
                                  {formatCurrency(amount)}
                                </span>
                                <motion.div
                                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                                  style={{ 
                                    background: isSelected ? colors.statusPaid : 'rgba(255, 255, 255, 0.1)',
                                  }}
                                  animate={{ scale: isSelected ? [1, 1.2, 1] : 1 }}
                                >
                                  {isSelected ? (
                                    <CheckCircle className="w-4 h-4 text-white" />
                                  ) : (
                                    <UserPlus className="w-4 h-4" style={{ color: colors.textSecondary }} />
                                  )}
                                </motion.div>
                              </div>
                            </div>
                          </motion.button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Right: Selected Students Summary */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-5 h-5" style={{ color: colors.accentMint }} />
                      <h3 className="text-lg font-bold text-white">
                        Selected <span style={{ color: colors.accentMint }}>({selectedStudents.length})</span>
                      </h3>
                    </div>
                    {selectedStudents.length > 0 && (
                      <motion.button
                        onClick={() => setSelectedStudents([])}
                        className="text-sm font-medium px-3 py-1 rounded-lg transition-all"
                        style={{ background: `${colors.statusUnpaid}15`, color: colors.statusUnpaid }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        Clear All
                      </motion.button>
                    )}
                  </div>

                  {selectedStudents.length === 0 && !includeSelf ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="p-8 rounded-2xl border-2 border-dashed text-center"
                      style={{ borderColor: 'rgba(255, 255, 255, 0.1)', background: 'rgba(255, 255, 255, 0.02)' }}
                    >
                      <motion.div 
                        className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                        style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                        animate={{ y: [0, -5, 0] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                      >
                        <Users className="w-8 h-8" style={{ color: colors.textSecondary }} />
                      </motion.div>
                      <p className="font-medium text-white mb-1">No students selected yet</p>
                      <p className="text-sm" style={{ color: colors.textSecondary }}>
                        Select students from the list to help them out!
                      </p>
                    </motion.div>
                  ) : (
                    <>
                      <div 
                        className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-2 rounded-xl p-3"
                        style={{ background: 'rgba(0, 0, 0, 0.2)' }}
                      >
                        <AnimatePresence>
                          {selectedStudents.map((student, index) => (
                            <motion.div
                              key={student.id}
                              initial={{ opacity: 0, x: 20, scale: 0.9 }}
                              animate={{ opacity: 1, x: 0, scale: 1 }}
                              exit={{ opacity: 0, x: -20, scale: 0.9 }}
                              transition={{ delay: index * 0.05 }}
                              className="p-3 rounded-xl flex items-center justify-between group"
                              style={{ 
                                background: 'rgba(255, 255, 255, 0.04)',
                                border: '1px solid rgba(255, 255, 255, 0.06)'
                              }}
                            >
                              <div className="flex items-center gap-3">
                                <div 
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                                  style={{ background: `${colors.statusPaid}20`, color: colors.statusPaid }}
                                >
                                  {student.full_name.charAt(0)}
                                </div>
                                <div>
                                  <p className="font-medium text-white text-sm">{student.full_name}</p>
                                  <p className="text-xs" style={{ color: colors.textSecondary }}>
                                    {student.reg_number}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold" style={{ color: colors.primary }}>
                                  {formatCurrency(amount)}
                                </span>
                                <motion.button
                                  onClick={() => removeStudent(student.id)}
                                  className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                  style={{ background: `${colors.statusUnpaid}15` }}
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                >
                                  <Trash2 className="w-3.5 h-3.5" style={{ color: colors.statusUnpaid }} />
                                </motion.button>
                              </div>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>

                      {/* Include Self Indicator */}
                      {includeSelf && !currentUserHasPaid && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-4 rounded-xl flex items-center gap-3"
                          style={{ 
                            background: `linear-gradient(135deg, ${colors.primary}15 0%, ${colors.primary}05 100%)`,
                            border: `1px solid ${colors.primary}40`
                          }}
                        >
                          <div 
                            className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{ background: `${colors.primary}25` }}
                          >
                            <CheckCircle className="w-5 h-5" style={{ color: colors.primary }} />
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-white text-sm">You are included</p>
                            <p className="text-xs" style={{ color: colors.textSecondary }}>Paying for yourself too</p>
                          </div>
                          <span className="font-bold" style={{ color: colors.primary }}>+{formatCurrency(amount)}</span>
                        </motion.div>
                      )}

                      {/* Total Summary Card */}
                      <motion.div
                        className="p-5 rounded-2xl relative overflow-hidden"
                        style={{ 
                          background: gradients.primary,
                          boxShadow: `0 8px 32px ${colors.primary}30`
                        }}
                        whileHover={{ scale: 1.01 }}
                      >
                        {/* Decorative shine */}
                        <div className="absolute inset-0 opacity-20" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 50%)' }} />
                        
                        <div className="relative z-10">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-5 h-5 text-white" />
                              <span className="text-white font-medium">Total Students</span>
                            </div>
                            <span className="text-2xl font-bold text-white">{selectedStudents.length + (includeSelf && !currentUserHasPaid ? 1 : 0)}</span>
                          </div>
                          <div className="h-px bg-white/20 my-3" />
                          <div className="flex items-center justify-between">
                            <span className="text-white font-medium">Total Amount</span>
                            <div className="flex items-center gap-2">
                              <DollarSign className="w-6 h-6 text-white" />
                              <span className="text-3xl font-bold text-white">
                                {formatCurrency(totalAmount)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </motion.div>

                      {/* Breakdown */}
                      <div
                        className="p-4 rounded-xl text-sm"
                        style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)' }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <DollarSign className="w-4 h-4" style={{ color: colors.textSecondary }} />
                          <span className="font-medium" style={{ color: colors.textSecondary }}>Breakdown</span>
                        </div>
                        <p style={{ color: colors.textPrimary }}>
                          <span className="font-bold">{selectedStudents.length + (includeSelf && !currentUserHasPaid ? 1 : 0)}</span> student{(selectedStudents.length + (includeSelf && !currentUserHasPaid ? 1 : 0)) !== 1 ? 's' : ''} × <span className="font-bold">{formatCurrency(amount)}</span> = <span className="font-bold" style={{ color: colors.primary }}>{formatCurrency(totalAmount)}</span>
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div 
              className="p-6 border-t"
              style={{ 
                borderColor: 'rgba(255, 255, 255, 0.08)',
                background: 'rgba(0, 0, 0, 0.3)'
              }}
            >
              <div className="flex items-center justify-between gap-4">
                <motion.button
                  onClick={onClose}
                  className="px-6 py-3 rounded-xl font-medium transition-all"
                  style={{ 
                    background: 'rgba(255, 255, 255, 0.05)', 
                    color: colors.textPrimary,
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}
                  whileHover={{ scale: 1.02, background: 'rgba(255, 255, 255, 0.1)' }}
                  whileTap={{ scale: 0.98 }}
                >
                  Cancel
                </motion.button>
                
                <motion.button
                  onClick={handleProceed}
                  disabled={selectedStudents.length === 0 && !includeSelf}
                  className="flex items-center gap-3 px-8 py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ 
                    background: gradients.primary,
                    boxShadow: `0 4px 20px ${colors.primary}40`
                  }}
                  whileHover={{ scale: 1.02, boxShadow: `0 6px 25px ${colors.primary}50` }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span>Proceed to Payment</span>
                  <ArrowRight className="w-5 h-5" />
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
