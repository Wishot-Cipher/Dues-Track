import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
import { formatCurrency } from '@/utils/formatters';
import GlassCard from '@/components/ui/GlassCard';
import HoldToConfirm from '@/components/student/HoldToConfirm';
import FileUploader from '@/components/ui/FileUploader';
import {
  ArrowLeft,
  Building2,
  CreditCard,
  Copy,
  Check,
  Upload,
  FileText,
  Users,
  AlertTriangle,
  CheckCircle,
  Receipt,
  Banknote,
  ArrowRight,
} from 'lucide-react';

interface Student {
  id: string;
  full_name: string;
  reg_number: string;
  level?: string;
  outstanding?: number;
}

interface PaymentSubmissionFlowProps {
  paymentMethod: 'bank_transfer' | 'pos';
  paymentType: {
    id: string;
    title: string;
    amount: number;
    bank_name?: string;
    account_name?: string;
    account_number?: string;
    deadline?: string;
    late_fee_per_day?: number;
  };
  currentUserOutstanding: number;
  accumulatedLateFees: number;
  allowPartial: boolean;
  selectedStudents: Student[];
  includeSelf: boolean;
  currentUser: Student;
  onBack: () => void;
  onSubmit: (data: {
    transactionRef: string;
    receiptFile: File | null;
    notes: string;
    paymentOption: 'full' | 'partial';
    amount: number;
  }) => Promise<void>;
  submitting: boolean;
}

export default function PaymentSubmissionFlow({
  paymentMethod,
  paymentType,
  currentUserOutstanding,
  accumulatedLateFees,
  allowPartial,
  selectedStudents,
  includeSelf,
  currentUser,
  onBack,
  onSubmit,
  submitting,
}: PaymentSubmissionFlowProps) {
  const { theme } = useTheme();
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';

  // Theme-aware surface helpers — replaces the old hardcoded dark glass so
  // the manual flow reads cleanly in BOTH light and dark mode (it used to be
  // white-on-white in light mode).
  const fieldBg = isLight ? '#F7F3EF' : 'rgba(255,255,255,0.05)';
  const subtleBg = isLight ? 'rgba(15,7,3,0.03)' : 'rgba(255,255,255,0.03)';
  const hairline = t.cardBorder;

  const [currentStep, setCurrentStep] = useState(1);
  const [paymentOption, setPaymentOption] = useState<'full' | 'partial'>('full');
  const [partialAmount, setPartialAmount] = useState(0);
  const [transactionRef, setTransactionRef] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [copied, setCopied] = useState(false);
  const [validationError, setValidationError] = useState('');

  const isTransfer = paymentMethod === 'bank_transfer';

  // Calculate total based on all students being paid for
  const studentsPayingFor = [...selectedStudents];
  if (includeSelf || selectedStudents.length === 0) {
    studentsPayingFor.push({ ...currentUser, outstanding: currentUserOutstanding });
  }

  const totalOutstanding = studentsPayingFor.reduce(
    (sum, s) => sum + (s.outstanding ?? currentUserOutstanding),
    0
  );

  const totalToPay = paymentOption === 'full' ? totalOutstanding : partialAmount;

  const steps = isTransfer
    ? [
        { id: 1, title: 'Bank Details', icon: Building2 },
        { id: 2, title: 'Amount', icon: Banknote },
        { id: 3, title: 'Upload Proof', icon: Upload },
        { id: 4, title: 'Confirm', icon: CheckCircle },
      ]
    : [
        { id: 1, title: 'POS Info', icon: CreditCard },
        { id: 2, title: 'Amount', icon: Banknote },
        { id: 3, title: 'Upload Receipt', icon: Receipt },
        { id: 4, title: 'Confirm', icon: CheckCircle },
      ];

  const copyAccountNumber = () => {
    navigator.clipboard.writeText(paymentType.account_number || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const canProceedToNext = () => {
    switch (currentStep) {
      case 1:
        return true;
      case 2:
        return paymentOption === 'full' || (paymentOption === 'partial' && partialAmount > 0);
      case 3:
        return transactionRef.trim().length > 0 && receiptFile !== null;
      case 4:
        return true;
      default:
        return false;
    }
  };

  // Get validation message for current step
  const getValidationMessage = () => {
    if (currentStep === 3) {
      const missing: string[] = [];
      if (!transactionRef.trim()) missing.push('transaction reference');
      if (!receiptFile) missing.push('receipt image');
      if (missing.length > 0) {
        return `Please provide: ${missing.join(' and ')}`;
      }
    }
    if (currentStep === 2 && paymentOption === 'partial' && partialAmount <= 0) {
      return 'Please enter a valid partial amount';
    }
    return '';
  };

  // Handle continue with validation feedback
  const handleContinue = () => {
    const message = getValidationMessage();
    if (message) {
      setValidationError(message);
      return;
    }
    setValidationError('');
    setCurrentStep(currentStep + 1);
  };

  const handleSubmit = async () => {
    await onSubmit({
      transactionRef,
      receiptFile,
      notes,
      paymentOption,
      amount: totalToPay,
    });
  };

  return (
    <div className="space-y-6 relative" style={{ color: t.text }}>
      {/* Loading Overlay */}
      <AnimatePresence>
        {submitting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0, 0, 0, 0.55)', backdropFilter: 'blur(8px)' }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center gap-4 p-8 rounded-2xl"
              style={{ background: t.card, border: `1px solid ${hairline}` }}
            >
              <motion.div
                className="w-12 h-12 border-3 rounded-full"
                style={{ borderColor: `${t.primary}30`, borderTopColor: t.primary }}
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
              <div className="text-center">
                <p className="font-semibold text-lg" style={{ color: t.text }}>Processing Payment</p>
                <p className="text-sm mt-1" style={{ color: t.textSec }}>Please wait while we submit your payment...</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header with Back Button */}
      <div className="flex items-center gap-4">
        <motion.button
          onClick={onBack}
          disabled={submitting}
          className="flex items-center justify-center w-10 h-10 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: fieldBg, border: `1px solid ${hairline}` }}
          whileHover={submitting ? {} : { scale: 1.05 }}
          whileTap={submitting ? {} : { scale: 0.95 }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: t.textSec }} />
        </motion.button>
        <div>
          <h2 className="text-xl font-bold" style={{ color: t.text }}>
            {isTransfer ? 'Bank Transfer' : 'POS Payment'}
          </h2>
          <p className="text-sm" style={{ color: t.textSec }}>
            {paymentType.title}
          </p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between px-0 sm:px-2 overflow-hidden">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isActive = currentStep === step.id;
          const isCompleted = currentStep > step.id;

          return (
            <div key={step.id} className="flex items-center min-w-0">
              <div className="flex flex-col items-center min-w-0">
                <motion.div
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center relative shrink-0"
                  style={{
                    background: isCompleted
                      ? t.mint
                      : isActive
                      ? t.gradOrange
                      : fieldBg,
                    border: isActive ? 'none' : `1px solid ${hairline}`,
                  }}
                  animate={isActive ? { scale: [1, 1.1, 1] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  ) : (
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: isActive ? 'white' : t.textSec }} />
                  )}
                </motion.div>
                <span
                  className="text-[9px] sm:text-[10px] mt-1 sm:mt-1.5 font-medium text-center truncate max-w-[60px] sm:max-w-none"
                  style={{ color: isActive ? t.primary : t.textSec }}
                >
                  {step.title}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className="w-5 sm:w-12 h-0.5 mx-0.5 sm:mx-1 shrink-0"
                  style={{
                    background: currentStep > step.id ? t.mint : hairline,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Amount Summary Banner */}
      <motion.div
        className="p-4 rounded-xl relative overflow-hidden"
        style={{
          background: t.primarySoft,
          border: `1px solid ${t.primaryRing}`,
        }}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="absolute top-0 left-0 w-full h-1" style={{ background: t.gradOrange }} />
        <div className="flex items-center justify-between gap-3 min-w-0">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider" style={{ color: t.textSec }}>
              Total to Pay
            </p>
            <p className="text-xl sm:text-2xl font-bold truncate" style={{ color: t.text }}>{formatCurrency(totalToPay)}</p>
            {accumulatedLateFees > 0 && (
              <p className="text-xs mt-1" style={{ color: t.amber }}>
                Includes {formatCurrency(accumulatedLateFees)} in late fees
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 justify-end">
              <Users className="w-4 h-4" style={{ color: t.mint }} />
              <span className="text-sm font-semibold" style={{ color: t.text }}>
                {studentsPayingFor.length} Student{studentsPayingFor.length > 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        {/* Step 1: Bank/POS Details */}
        {currentStep === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <GlassCard>
              {isTransfer ? (
                <>
                  <div className="flex items-center gap-3 mb-6">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ background: `${t.primary}20` }}
                    >
                      <Building2 className="w-6 h-6" style={{ color: t.primary }} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold" style={{ color: t.text }}>Transfer to This Account</h3>
                      <p className="text-sm" style={{ color: t.textSec }}>
                        Copy the details below and make your transfer
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Bank Name */}
                    <div className="p-4 rounded-xl" style={{ background: subtleBg }}>
                      <p className="text-xs uppercase tracking-wider mb-1" style={{ color: t.textSec }}>
                        Bank Name
                      </p>
                      <p className="text-lg font-semibold" style={{ color: t.text }}>{paymentType.bank_name}</p>
                    </div>

                    {/* Account Name */}
                    <div className="p-4 rounded-xl" style={{ background: subtleBg }}>
                      <p className="text-xs uppercase tracking-wider mb-1" style={{ color: t.textSec }}>
                        Account Name
                      </p>
                      <p className="text-lg font-semibold" style={{ color: t.text }}>{paymentType.account_name}</p>
                    </div>

                    {/* Account Number with Copy */}
                    <div
                      className="p-4 rounded-xl relative overflow-hidden"
                      style={{ background: t.primarySoft, border: `1px solid ${t.primaryRing}` }}
                    >
                      <div className="absolute top-0 left-0 w-1 h-full" style={{ background: t.primary }} />
                      <p className="text-xs uppercase tracking-wider mb-1" style={{ color: t.primary }}>
                        Account Number
                      </p>
                      <div className="flex items-center justify-between gap-2 sm:gap-3">
                        <p className="text-lg sm:text-2xl font-bold tracking-wider truncate min-w-0" style={{ color: t.text }}>
                          {paymentType.account_number}
                        </p>
                        <motion.button
                          onClick={copyAccountNumber}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium"
                          style={{
                            background: copied ? t.mint : `${t.primary}20`,
                            color: copied ? 'white' : t.primary,
                          }}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          {copied ? (
                            <>
                              <Check className="w-4 h-4" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              Copy
                            </>
                          )}
                        </motion.button>
                      </div>
                    </div>

                    {/* Amount to Transfer */}
                    <div
                      className="p-4 rounded-xl"
                      style={{ background: isLight ? 'rgba(48,255,172,0.10)' : 'rgba(48,255,172,0.10)', border: `1px solid ${isLight ? '#CCF2DE' : 'rgba(48,255,172,0.30)'}` }}
                    >
                      <p className="text-xs uppercase tracking-wider mb-1" style={{ color: t.mint }}>
                        Amount to Transfer
                      </p>
                      <p className="text-xl sm:text-2xl font-bold" style={{ color: t.mint }}>
                        {formatCurrency(totalToPay)}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-6">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ background: `${t.primary}20` }}
                    >
                      <CreditCard className="w-6 h-6" style={{ color: t.primary }} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold" style={{ color: t.text }}>POS Payment</h3>
                      <p className="text-sm" style={{ color: t.textSec }}>
                        Pay via POS terminal and upload the receipt
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Instructions */}
                    <div className="p-4 rounded-xl" style={{ background: subtleBg }}>
                      <h4 className="font-semibold mb-3" style={{ color: t.text }}>How to Pay</h4>
                      <ol className="space-y-3">
                        {[
                          'Locate a Financial Secretary or Class Rep with POS',
                          `Request to pay ${formatCurrency(totalToPay)} for ${paymentType.title}`,
                          'Complete the POS transaction',
                          'Collect and photograph your receipt',
                          'Upload the receipt in the next step',
                        ].map((instruction, i) => (
                          <li key={i} className="flex items-start gap-3">
                            <span
                              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                              style={{ background: `${t.primary}20`, color: t.primary }}
                            >
                              {i + 1}
                            </span>
                            <span className="text-sm" style={{ color: t.textSec }}>
                              {instruction}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    {/* Amount Box */}
                    <div
                      className="p-4 rounded-xl text-center"
                      style={{ background: 'rgba(48,255,172,0.10)', border: `1px solid ${isLight ? '#CCF2DE' : 'rgba(48,255,172,0.30)'}` }}
                    >
                      <p className="text-xs uppercase tracking-wider mb-1" style={{ color: t.mint }}>
                        Amount to Pay
                      </p>
                      <p className="text-2xl sm:text-3xl font-bold" style={{ color: t.mint }}>
                        {formatCurrency(totalToPay)}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </GlassCard>
          </motion.div>
        )}

        {/* Step 2: Amount Selection */}
        {currentStep === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <GlassCard>
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: `${t.primary}20` }}
                >
                  <Banknote className="w-6 h-6" style={{ color: t.primary }} />
                </div>
                <div>
                  <h3 className="text-lg font-bold" style={{ color: t.text }}>Payment Amount</h3>
                  <p className="text-sm" style={{ color: t.textSec }}>
                    {allowPartial && selectedStudents.length === 0 ? 'Choose full or partial payment' : 'Confirm your payment amount'}
                  </p>
                </div>
              </div>

              {/* Students List */}
              {studentsPayingFor.length > 0 && (
                <div className="mb-6 p-4 rounded-xl" style={{ background: subtleBg }}>
                  <p className="text-xs uppercase tracking-wider mb-3" style={{ color: t.textSec }}>
                    Paying for {studentsPayingFor.length} Student{studentsPayingFor.length > 1 ? 's' : ''}
                  </p>
                  <div className="space-y-2">
                    {studentsPayingFor.map((s, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2 rounded-lg"
                        style={{ background: subtleBg }}
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4" style={{ color: t.mint }} />
                          <span className="text-sm" style={{ color: t.text }}>{s.full_name}</span>
                        </div>
                        <span className="text-sm font-semibold" style={{ color: t.primary }}>
                          {formatCurrency(s.outstanding ?? currentUserOutstanding)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Full Payment Option */}
              <motion.button
                onClick={() => setPaymentOption('full')}
                className="w-full p-4 rounded-xl mb-3 text-left relative overflow-hidden"
                style={{
                  background: paymentOption === 'full' ? t.primarySoft : subtleBg,
                  border: `2px solid ${paymentOption === 'full' ? t.primary : hairline}`,
                }}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                {paymentOption === 'full' && (
                  <motion.div
                    className="absolute top-0 left-0 w-1 h-full"
                    style={{ background: t.primary }}
                    layoutId="paymentIndicator"
                  />
                )}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold" style={{ color: t.text }}>Pay Full Amount</p>
                    <p className="text-sm mt-1" style={{ color: t.textSec }}>
                      Complete payment in one transaction
                    </p>
                  </div>
                  <p className="text-xl font-bold" style={{ color: t.primary }}>
                    {formatCurrency(totalOutstanding)}
                  </p>
                </div>
              </motion.button>

              {/* Partial Payment Option */}
              {allowPartial && selectedStudents.length === 0 && (
                <>
                  <motion.button
                    onClick={() => setPaymentOption('partial')}
                    className="w-full p-4 rounded-xl text-left relative overflow-hidden"
                    style={{
                      background: paymentOption === 'partial' ? t.primarySoft : subtleBg,
                      border: `2px solid ${paymentOption === 'partial' ? t.primary : hairline}`,
                    }}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                  >
                    {paymentOption === 'partial' && (
                      <motion.div
                        className="absolute top-0 left-0 w-1 h-full"
                        style={{ background: t.primary }}
                        layoutId="paymentIndicator"
                      />
                    )}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold" style={{ color: t.text }}>Pay Partial Amount</p>
                        <p className="text-sm mt-1" style={{ color: t.textSec }}>
                          Pay what you can now, complete later
                        </p>
                      </div>
                      <p className="text-sm" style={{ color: t.textSec }}>
                        Custom
                      </p>
                    </div>
                  </motion.button>

                  {/* Partial Amount Input */}
                  <AnimatePresence>
                    {paymentOption === 'partial' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-4"
                      >
                        <label className="block text-sm font-medium mb-2" style={{ color: t.text }}>
                          Enter Amount (Max: {formatCurrency(totalOutstanding)})
                        </label>
                        <input
                          type="number"
                          value={partialAmount || ''}
                          onChange={(e) =>
                            setPartialAmount(
                              Math.min(parseFloat(e.target.value) || 0, totalOutstanding)
                            )
                          }
                          max={totalOutstanding}
                          min={0}
                          className="w-full px-4 py-3 rounded-xl text-lg font-semibold focus:outline-none focus:ring-2"
                          style={{
                            background: fieldBg,
                            border: `1px solid ${hairline}`,
                            color: t.text,
                          }}
                          placeholder="0.00"
                        />
                        {partialAmount > 0 && (
                          <p className="text-sm mt-2" style={{ color: t.textSec }}>
                            Remaining after this: {formatCurrency(Math.max(0, totalOutstanding - partialAmount))}
                          </p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </GlassCard>
          </motion.div>
        )}

        {/* Step 3: Upload Proof */}
        {currentStep === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <GlassCard>
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: `${t.primary}20` }}
                >
                  <Upload className="w-6 h-6" style={{ color: t.primary }} />
                </div>
                <div>
                  <h3 className="text-lg font-bold" style={{ color: t.text }}>Upload Payment Proof</h3>
                  <p className="text-sm" style={{ color: t.textSec }}>
                    Provide your transaction details and receipt
                  </p>
                </div>
              </div>

              <div className="space-y-5">
                {/* Transaction Reference */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: t.text }}>
                    Transaction Reference <span style={{ color: t.danger }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2"
                    style={{
                      background: fieldBg,
                      border: `1px solid ${transactionRef ? t.mint + '80' : hairline}`,
                      color: t.text,
                    }}
                    placeholder={isTransfer ? 'e.g., TRF/2024/11/12345' : 'POS receipt number'}
                  />
                  <p className="text-xs mt-1" style={{ color: t.textSec }}>
                    {isTransfer
                      ? 'The reference number from your bank transfer confirmation'
                      : 'The transaction ID on your POS receipt'}
                  </p>
                </div>

                {/* Receipt Upload */}
                <div>
                  <FileUploader
                    onFileSelect={(file) => {
                      if (file && !Array.isArray(file)) {
                        setReceiptFile(file);
                      }
                    }}
                    accept="image/jpeg,image/jpg,image/png,application/pdf"
                    maxSize={5 * 1024 * 1024}
                    label={`Upload ${isTransfer ? 'Transfer Receipt' : 'POS Receipt'} *`}
                    description="Accepted: JPG, PNG, PDF (Max 5MB)"
                    showPreview={true}
                    multiple={false}
                  />
                  {/* Receipt upload status */}
                  {receiptFile && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-3 p-3 rounded-xl flex items-center gap-3"
                      style={{
                        background: 'rgba(48,255,172,0.10)',
                        border: `1px solid ${isLight ? '#CCF2DE' : 'rgba(48,255,172,0.30)'}`,
                      }}
                    >
                      <CheckCircle className="w-5 h-5" style={{ color: t.mint }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: t.text }}>{receiptFile.name}</p>
                        <p className="text-xs" style={{ color: t.textSec }}>
                          {(receiptFile.size / 1024).toFixed(1)} KB • Ready to upload
                        </p>
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: t.text }}>
                    Additional Notes <span style={{ color: t.textSec }}>(Optional)</span>
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2"
                    style={{
                      background: fieldBg,
                      border: `1px solid ${hairline}`,
                      color: t.text,
                    }}
                    placeholder="Any additional information for the reviewer..."
                  />
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Step 4: Confirmation */}
        {currentStep === 4 && (
          <motion.div
            key="step4"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <GlassCard>
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(48,255,172,0.18)' }}
                >
                  <CheckCircle className="w-6 h-6" style={{ color: t.mint }} />
                </div>
                <div>
                  <h3 className="text-lg font-bold" style={{ color: t.text }}>Review & Submit</h3>
                  <p className="text-sm" style={{ color: t.textSec }}>
                    Verify your payment details before submitting
                  </p>
                </div>
              </div>

              {/* Summary Grid */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="p-3 rounded-xl" style={{ background: subtleBg }}>
                  <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: t.textSec }}>
                    Payment Method
                  </p>
                  <p className="text-sm font-semibold" style={{ color: t.text }}>
                    {isTransfer ? 'Bank Transfer' : 'POS'}
                  </p>
                </div>
                <div className="p-3 rounded-xl" style={{ background: subtleBg }}>
                  <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: t.textSec }}>
                    Amount
                  </p>
                  <p className="text-sm font-semibold" style={{ color: t.primary }}>
                    {formatCurrency(totalToPay)}
                  </p>
                </div>
                <div className="p-3 rounded-xl col-span-2" style={{ background: subtleBg }}>
                  <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: t.textSec }}>
                    Transaction Reference
                  </p>
                  <p className="text-sm font-semibold break-all" style={{ color: t.text }}>{transactionRef}</p>
                </div>
              </div>

              {/* Students Summary */}
              <div className="mb-6 p-4 rounded-xl" style={{ background: t.primarySoft }}>
                <p className="text-xs uppercase tracking-wider mb-2" style={{ color: t.primary }}>
                  Payment For
                </p>
                <div className="space-y-1">
                  {studentsPayingFor.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" style={{ color: t.mint }} />
                      <span className="text-sm" style={{ color: t.text }}>{s.full_name}</span>
                      <span className="text-xs" style={{ color: t.textSec }}>
                        ({s.reg_number})
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Receipt Preview */}
              {receiptFile && (
                <div className="mb-6 p-4 rounded-xl" style={{ background: subtleBg }}>
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4" style={{ color: t.mint }} />
                    <p className="text-sm font-medium" style={{ color: t.text }}>Receipt Attached</p>
                  </div>
                  <p className="text-xs truncate" style={{ color: t.textSec }}>
                    {receiptFile.name}
                  </p>
                </div>
              )}

              {/* Warning */}
              <div
                className="p-4 rounded-xl flex items-start gap-3"
                style={{ background: isLight ? 'rgba(245,158,11,0.10)' : 'rgba(245,158,11,0.10)', border: `1px solid ${isLight ? '#F5D9A8' : 'rgba(245,158,11,0.30)'}` }}
              >
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: t.amber }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: t.text }}>Before Submitting</p>
                  <p className="text-xs mt-1" style={{ color: t.textSec }}>
                    Ensure your payment proof is clear and the transaction reference matches.
                    Your submission will be reviewed by an admin.
                  </p>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Validation Error Message */}
      <AnimatePresence>
        {validationError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 rounded-xl flex items-center gap-2"
            style={{
              background: isLight ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.12)',
              border: `1px solid ${t.danger}40`,
            }}
          >
            <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: t.danger }} />
            <p className="text-sm" style={{ color: t.danger }}>{validationError}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation Buttons */}
      <div className="flex gap-2 sm:gap-3">
        {currentStep > 1 && (
          <motion.button
            onClick={() => {
              setValidationError('');
              setCurrentStep(currentStep - 1);
            }}
            disabled={submitting}
            className="flex-1 py-3 px-4 sm:py-4 sm:px-6 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed min-w-0"
            style={{
              background: fieldBg,
              border: `1px solid ${hairline}`,
              color: t.textSec,
            }}
            whileHover={submitting ? {} : { scale: 1.02 }}
            whileTap={submitting ? {} : { scale: 0.98 }}
          >
            Back
          </motion.button>
        )}

        {currentStep < 4 ? (
          <motion.button
            onClick={handleContinue}
            className="flex-1 py-3 px-4 sm:py-4 sm:px-6 rounded-xl font-semibold flex items-center justify-center gap-2 min-w-0"
            style={{
              background: canProceedToNext() ? t.gradOrange : fieldBg,
              color: canProceedToNext() ? 'white' : t.textSec,
            }}
            whileHover={canProceedToNext() ? { scale: 1.02 } : {}}
            whileTap={canProceedToNext() ? { scale: 0.98 } : {}}
          >
            Continue
            <ArrowRight className="w-5 h-5" />
          </motion.button>
        ) : (
          <HoldToConfirm
            onConfirm={handleSubmit}
            loading={submitting}
            holdDuration={1500}
            label="Hold to Submit Payment"
            confirmLabel="Submitting..."
            color={t.primary}
            className="flex-1 min-w-0"
          />
        )}
      </div>
    </div>
  );
}
