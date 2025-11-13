import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { colors, gradients } from '@/config/colors';
import GlassCard from '@/components/ui/GlassCard';
import { formatCurrency } from '@/utils/formatters';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import {
  Search,
  X,
  FileText,
  AlertCircle,
  CheckCircle,
  User as UserIcon,
  ArrowLeft,
  Bell,
  BellOff,
} from 'lucide-react';
import Footer from '@/components/Footer';
import notificationService from '@/services/notificationService';

interface Student {
  id: string;
  full_name: string;
  reg_number: string;
  level: string;
  department: string;
  email?: string;
}

interface PaymentType {
  id: string;
  title: string;
  amount: number;
  description: string;
  deadline: string;
}

export default function WaivePaymentPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { success, error: showError } = useToast();
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([]);
  const [selectedPaymentType, setSelectedPaymentType] = useState<string>('');
  const [waiverReason, setWaiverReason] = useState('');
  const [customNotes, setCustomNotes] = useState('');
  const [notifyStudent, setNotifyStudent] = useState(true);
  const [searching, setSearching] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Load payment types and student's existing payments when student is selected
  useEffect(() => {
    if (selectedStudent) {
      loadPaymentTypesAndStudentPayments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudent]);

  const loadPaymentTypesAndStudentPayments = async () => {
    if (!selectedStudent) return;

    try {
      // Fetch all active payment types for student's level
      const { data: allPaymentTypes, error: ptError } = await supabase
        .from('payment_types')
        .select('id, title, amount, description, deadline')
        .eq('is_active', true)
        .contains('target_levels', [selectedStudent.level]);

      if (ptError) throw ptError;

      // Fetch student's existing payments
      const { data: existingPayments, error: paymentsError } = await supabase
        .from('payments')
        .select('payment_type_id, status, amount')
        .eq('student_id', selectedStudent.id);

      if (paymentsError) throw paymentsError;

      // Filter out payment types that are already fully paid or pending
      const paidOrPendingTypeIds = new Set(
        (existingPayments || [])
          .filter(p => p.status === 'approved' || p.status === 'pending')
          .map(p => p.payment_type_id)
      );

      const unpaidTypes = (allPaymentTypes || []).filter(
        pt => !paidOrPendingTypeIds.has(pt.id)
      );

      setPaymentTypes(unpaidTypes);
    } catch (error) {
      console.error('Error loading payment types:', error);
    }
  };

  // Search students
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      setSearching(true);
      const { data, error } = await supabase
        .from('students')
        .select('id, full_name, reg_number, level, department, email')
        .or(`full_name.ilike.%${searchQuery}%,reg_number.ilike.%${searchQuery}%`)
        .eq('is_active', true)
        .limit(10);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Error searching students:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleWaivePayment = async () => {
    if (!selectedStudent || !selectedPaymentType || !waiverReason) {
      showError('Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);

      // Find the selected payment type details
      const paymentType = paymentTypes.find(pt => pt.id === selectedPaymentType);
      if (!paymentType) throw new Error('Payment type not found');

      // Get reason label for notification
      const reasonLabels: Record<string, string> = {
        'financial_hardship': 'Financial Hardship',
        'medical_emergency': 'Medical Emergency',
        'class_executive': 'Class Executive Role',
        'scholarship': 'Scholarship/Sponsorship',
        'departmental_support': 'Departmental Support',
        'other': 'Other',
      };

      const reasonLabel = reasonLabels[waiverReason] || waiverReason;

      // Create a waived payment record
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          student_id: selectedStudent.id,
          payment_type_id: selectedPaymentType,
          amount: paymentType.amount,
          payment_method: 'cash', // Using cash method for waived payments
          status: 'approved',
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
          notes: `✅ WAIVED BY ADMIN\n\nReason: ${reasonLabel}\n${customNotes ? `Additional Notes: ${customNotes}` : ''}\n\nThis payment has been waived and you are not required to pay.`,
          transaction_ref: `WAIVED-${Date.now()}`,
          receipt_url: '', // Empty string for waived payments
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      // Send notification to student if requested
      if (notifyStudent) {
        const reasonLabel = reasonLabels[waiverReason] || waiverReason;
        const fullReason = customNotes 
          ? `${reasonLabel}. ${customNotes}` 
          : reasonLabel;

        await notificationService.sendPaymentWaivedNotification(
          selectedStudent.id,
          selectedStudent.full_name,
          paymentType.title,
          paymentType.amount,
          fullReason
        );
      }

      // Show success message
      success(`Payment waived successfully for ${selectedStudent.full_name}`);
      setShowSuccess(true);
      setTimeout(() => {
        navigate('/admin/dashboard');
      }, 2000);
    } catch (error) {
      console.error('Error waiving payment:', error);
      showError('Failed to waive payment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedStudent(null);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedPaymentType('');
    setWaiverReason('');
    setCustomNotes('');
    setNotifyStudent(true);
  };

  return (
    <div 
      className="min-h-screen pb-20 relative overflow-hidden"
      style={{ background: gradients.darkBackground }}
    >
      {/* ECE Background Logo */}
      <div className="hidden lg:block fixed right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-[0.08] pointer-events-none z-0">
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

      {/* Header */}
      <motion.div
        className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 mb-6"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <button
          onClick={() => navigate('/admin/dashboard')}
          className="flex items-center gap-2 mb-4 px-4 py-2 rounded-lg transition-colors"
          style={{ 
            color: colors.textSecondary,
            background: 'rgba(255, 255, 255, 0.05)',
          }}
        >
          <ArrowLeft size={20} />
          <span>Back to Dashboard</span>
        </button>

        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
          Waive Payment Fee
        </h1>
        <p className="text-base sm:text-lg" style={{ color: colors.textSecondary }}>
          Waive payment fees for students with financial hardship or special circumstances
        </p>
      </motion.div>

      {/* Success Modal */}
      {showSuccess && (
        <motion.div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
          >
            <GlassCard className="max-w-md w-full p-8 text-center">
              <motion.div
                className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ background: colors.statusPaid }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2 }}
              >
                <CheckCircle size={32} className="text-white" />
              </motion.div>
              <h3 className="text-xl font-bold text-white mb-2">Payment Waived!</h3>
              <p style={{ color: colors.textSecondary }}>
                The payment fee has been successfully waived for {selectedStudent?.full_name}
              </p>
            </GlassCard>
          </motion.div>
        </motion.div>
      )}

      {/* Main Content */}
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <GlassCard className="p-6 sm:p-8">
          {/* Step 1: Search and Select Student */}
          <div className="mb-8">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <UserIcon size={20} style={{ color: colors.primary }} />
              Select Student
            </h2>

            {!selectedStudent ? (
              <>
                {/* Search Bar */}
                <div className="flex gap-2 mb-4">
                  <div className="flex-1 relative">
                    <Search 
                      size={20} 
                      className="absolute left-3 top-1/2 -translate-y-1/2"
                      style={{ color: colors.textSecondary }}
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                      placeholder="Search by name or registration number..."
                      className="w-full pl-10 pr-4 py-3 rounded-xl border text-white placeholder-gray-400"
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        borderColor: 'rgba(255, 104, 3, 0.2)',
                      }}
                    />
                  </div>
                  <button
                    onClick={handleSearch}
                    disabled={searching || !searchQuery.trim()}
                    className="px-6 py-3 rounded-xl font-medium text-white transition-opacity disabled:opacity-50"
                    style={{ background: gradients.primary }}
                  >
                    {searching ? 'Searching...' : 'Search'}
                  </button>
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="space-y-2">
                    {searchResults.map((student) => (
                      <motion.button
                        key={student.id}
                        onClick={() => {
                          setSelectedStudent(student);
                          setSearchResults([]);
                          setSearchQuery('');
                        }}
                        className="w-full p-4 rounded-lg border text-left transition-colors"
                        style={{
                          background: 'rgba(255, 255, 255, 0.03)',
                          borderColor: 'rgba(255, 104, 3, 0.2)',
                        }}
                        whileHover={{
                          background: 'rgba(255, 104, 3, 0.1)',
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-white">{student.full_name}</p>
                            <p className="text-sm" style={{ color: colors.textSecondary }}>
                              {student.reg_number} • {student.level} • {student.department}
                            </p>
                          </div>
                          <UserIcon size={20} style={{ color: colors.primary }} />
                        </div>
                      </motion.button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="p-4 rounded-lg border flex items-center justify-between" style={{
                background: 'rgba(255, 104, 3, 0.1)',
                borderColor: 'rgba(255, 104, 3, 0.3)',
              }}>
                <div>
                  <p className="font-medium text-white">{selectedStudent.full_name}</p>
                  <p className="text-sm" style={{ color: colors.textSecondary }}>
                    {selectedStudent.reg_number} • {selectedStudent.level} • {selectedStudent.department}
                  </p>
                </div>
                <button
                  onClick={resetForm}
                  className="p-2 rounded-lg transition-colors"
                  style={{ background: 'rgba(255, 255, 255, 0.1)' }}
                >
                  <X size={20} style={{ color: colors.textSecondary }} />
                </button>
              </div>
            )}
          </div>

          {/* Step 2: Select Payment Type */}
          {selectedStudent && (
            <motion.div
              className="mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <FileText size={20} style={{ color: colors.primary }} />
                Select Payment to Waive
              </h2>

              {paymentTypes.length === 0 ? (
                <div className="p-6 rounded-xl border text-center" style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderColor: 'rgba(255, 104, 3, 0.2)',
                }}>
                  <CheckCircle size={48} className="mx-auto mb-3" style={{ color: colors.statusPaid }} />
                  <p className="text-white font-medium mb-1">No Outstanding Payments</p>
                  <p className="text-sm" style={{ color: colors.textSecondary }}>
                    This student has no unpaid dues that can be waived
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-3 p-3 rounded-lg" style={{
                    background: 'rgba(6, 182, 212, 0.1)',
                    border: '1px solid rgba(6, 182, 212, 0.3)',
                  }}>
                    <p className="text-sm" style={{ color: colors.accentMint }}>
                      💡 Showing {paymentTypes.length} unpaid dues for {selectedStudent.full_name}
                    </p>
                  </div>

                  <div className="space-y-2">
                    {paymentTypes.map((paymentType) => (
                      <motion.button
                        key={paymentType.id}
                        onClick={() => setSelectedPaymentType(paymentType.id)}
                        className="w-full p-4 rounded-lg border text-left transition-all"
                        style={{
                          background: selectedPaymentType === paymentType.id 
                            ? 'rgba(255, 104, 3, 0.2)' 
                            : 'rgba(255, 255, 255, 0.03)',
                          borderColor: selectedPaymentType === paymentType.id 
                            ? colors.primary 
                            : 'rgba(255, 104, 3, 0.2)',
                          borderWidth: selectedPaymentType === paymentType.id ? '2px' : '1px',
                        }}
                        whileHover={{
                          background: 'rgba(255, 104, 3, 0.1)',
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-white mb-1">{paymentType.title}</p>
                            <p className="text-sm mb-2" style={{ color: colors.textSecondary }}>
                              {paymentType.description}
                            </p>
                            {paymentType.deadline && (
                              <p className="text-xs" style={{ color: colors.warning }}>
                                ⏰ Due: {new Date(paymentType.deadline).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                          <div className="ml-4 text-right">
                            <p className="font-bold text-lg" style={{ color: colors.primary }}>
                              {formatCurrency(paymentType.amount)}
                            </p>
                            <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                              Amount to waive
                            </p>
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* Step 3: Waiver Details */}
          {selectedStudent && selectedPaymentType && (
            <motion.div
              className="mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <AlertCircle size={20} style={{ color: colors.primary }} />
                Waiver Details
              </h2>

              {/* Waiver Reason */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-white mb-2">
                  Waiver Reason <span style={{ color: colors.statusUnpaid }}>*</span>
                </label>
                <div className="relative">
                  <select
                    value={waiverReason}
                    onChange={(e) => setWaiverReason(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border text-white appearance-none cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-orange-500"
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      borderColor: 'rgba(255, 104, 3, 0.2)',
                    }}
                  >
                    <option value="" style={{ background: '#1A0E09' }}>Select reason...</option>
                    <option value="financial_hardship" style={{ background: '#1A0E09' }}>💰 Financial Hardship</option>
                    <option value="medical_emergency" style={{ background: '#1A0E09' }}>🏥 Medical Emergency</option>
                    <option value="class_executive" style={{ background: '#1A0E09' }}>👔 Class Executive Role</option>
                    <option value="scholarship" style={{ background: '#1A0E09' }}>🎓 Scholarship/Sponsorship</option>
                    <option value="departmental_support" style={{ background: '#1A0E09' }}>🏫 Departmental Support</option>
                    <option value="other" style={{ background: '#1A0E09' }}>📝 Other</option>
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M5 7.5L10 12.5L15 7.5" stroke="#FF6803" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
              </div>

              {/* Custom Notes */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-white mb-2">
                  Additional Notes (Optional)
                </label>
                <textarea
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  placeholder="Add any additional context or details that will be shared with the student..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border text-white placeholder-gray-400 resize-none transition-all focus:outline-none focus:ring-2 focus:ring-orange-500"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderColor: 'rgba(255, 104, 3, 0.2)',
                  }}
                />
              </div>

              {/* Notification Toggle */}
              <div className="mb-4">
                <div className="p-4 rounded-xl border" style={{
                  background: notifyStudent ? 'rgba(6, 182, 212, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                  borderColor: notifyStudent ? 'rgba(6, 182, 212, 0.3)' : 'rgba(255, 104, 3, 0.2)',
                }}>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyStudent}
                      onChange={(e) => setNotifyStudent(e.target.checked)}
                      className="w-5 h-5 mt-0.5 rounded accent-orange-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {notifyStudent ? (
                          <Bell size={18} style={{ color: colors.accentMint }} />
                        ) : (
                          <BellOff size={18} style={{ color: colors.textSecondary }} />
                        )}
                        <span className="font-medium text-white">
                          {notifyStudent ? 'Notification Enabled' : 'Notification Disabled'}
                        </span>
                      </div>
                      <p className="text-sm" style={{ color: colors.textSecondary }}>
                        {notifyStudent 
                          ? `${selectedStudent.full_name} will receive a notification about this waiver with the reason and notes you provided.`
                          : 'The student will not be notified about this waiver.'
                        }
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Waiver Preview */}
              {waiverReason && (
                <div className="p-4 rounded-xl" style={{
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                }}>
                  <p className="text-sm font-medium mb-2" style={{ color: colors.statusPaid }}>
                    ✅ Waiver Preview
                  </p>
                  <p className="text-sm text-white">
                    The student will see this payment marked as "WAIVED" with the reason displayed in their payment history.
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* Action Buttons */}
          {selectedStudent && selectedPaymentType && waiverReason && (
            <motion.div
              className="flex gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <button
                onClick={resetForm}
                disabled={loading}
                className="flex-1 px-6 py-3 rounded-xl font-medium transition-opacity disabled:opacity-50"
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: colors.textPrimary,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleWaivePayment}
                disabled={loading}
                className="flex-1 px-6 py-3 rounded-xl font-medium text-white transition-opacity disabled:opacity-50"
                style={{ background: gradients.primary }}
              >
                {loading ? 'Processing...' : 'Waive Payment'}
              </button>
            </motion.div>
          )}
        </GlassCard>
      </div>
      <Footer />
    </div>
  );
}
