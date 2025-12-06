import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import QRCode from "qrcode";
import { colors, gradients } from "@/config/colors";
import {
  QrCode,
  Download,
  RefreshCw,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Info,
  Sparkles,
  Users,
  Shield,
  Zap,
  Copy,
  Check,
  Hash,
  MessageSquare,
} from "lucide-react";
import { formatCurrency } from "@/utils/formatters";

interface QRCodeGeneratorProps {
  studentId: string;
  studentName: string;
  studentRegNumber: string;
  paymentTypeId: string;
  paymentTypeName: string;
  amount: number;
  totalStudents?: number;
  selectedStudents?: Array<{ id: string; full_name: string; reg_number: string }>;
  includeSelf?: boolean;
  onBack: () => void;
}

// Generate a short payment code from payment details
// Uses first 3 chars of studentId (without dashes) + last 3 chars of paymentTypeId (without dashes) + last 4 digits of timestamp
const generatePaymentCode = (studentId: string, paymentTypeId: string, timestamp: number): string => {
  const studentPart = studentId.replace(/-/g, '').slice(0, 3).toUpperCase();
  const paymentPart = paymentTypeId.replace(/-/g, '').slice(-3).toUpperCase();
  const timePart = timestamp.toString().slice(-4);
  return `${studentPart}-${paymentPart}-${timePart}`;
};

// Generate a multi-pay code with compressed reg numbers (NO DATABASE NEEDED)
// Format: MP-XXX-P123-456.789 where:
// - MP = Multi-pay prefix
// - XXX = Last 3 chars of payment type ID  
// - P123 = Payer's reg suffix (P prefix identifies who is paying the cash)
// - 456.789 = ALL recipients' reg suffixes (dot-separated) - who the payment is FOR
// Example: Payer REG001 paying for self + REG002 + REG003 -> MP-ABC-P001-001.002.003
// Example: Payer REG001 paying for REG002 + REG003 only -> MP-ABC-P001-002.003
const generateMultiPayCode = (
  paymentTypeId: string, 
  payerRegNumber: string,
  recipientRegNumbers: string[] // ALL people being paid for
): string => {
  const paymentPart = paymentTypeId.replace(/-/g, '').slice(-3).toUpperCase();
  
  // Payer's suffix with P prefix (identifies who handed over the cash)
  const payerCleaned = payerRegNumber.replace(/[^A-Z0-9]/gi, '');
  const payerPart = 'P' + payerCleaned.slice(-3).toUpperCase();
  
  // All recipients' suffixes (dot-separated) - these are the people the payment is FOR
  const recipientParts = recipientRegNumbers.map(reg => {
    const cleaned = reg.replace(/[^A-Z0-9]/gi, '');
    return cleaned.slice(-3).toUpperCase();
  });
  
  // If no recipients, this shouldn't happen but handle gracefully
  if (recipientParts.length === 0) {
    return `MP-${paymentPart}-${payerPart}`;
  }
  
  return `MP-${paymentPart}-${payerPart}-${recipientParts.join('.')}`;
};

export default function QRCodeGenerator({
  studentId,
  studentName,
  studentRegNumber,
  paymentTypeId,
  paymentTypeName,
  amount,
  totalStudents = 1,
  selectedStudents = [],
  includeSelf = true,
}: QRCodeGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [showInstructions, setShowInstructions] = useState(true);
  const [qrTimestamp, setQrTimestamp] = useState(Date.now());
  const [copiedCode, setCopiedCode] = useState(false);
  const [paymentCode, setPaymentCode] = useState<string>("");
  const [multiPayCode, setMultiPayCode] = useState<string>("");

  useEffect(() => {
    const generateQRCode = async () => {
      if (canvasRef.current) {
        try {
          // Generate payment code for verbal sharing (single payment)
          const code = generatePaymentCode(studentId, paymentTypeId, qrTimestamp);
          setPaymentCode(code);
          
          // Generate multi-pay code if paying for multiple students
          if (totalStudents > 1) {
            // Build the list of ALL recipients (people being paid FOR)
            const recipientRegNumbers: string[] = [];
            
            // If payer is also a recipient (includeSelf=true), add them first
            if (includeSelf) {
              recipientRegNumbers.push(studentRegNumber);
            }
            
            // Add all selected students as recipients
            selectedStudents.forEach(s => {
              recipientRegNumbers.push(s.reg_number);
            });
            
            // Generate the multi-pay code
            // Payer = current user (studentRegNumber)
            // Recipients = who the payment is FOR (may or may not include payer)
            const mpCode = generateMultiPayCode(
              paymentTypeId, 
              studentRegNumber, // Payer is always the current user
              recipientRegNumbers // All people being paid for
            );
            setMultiPayCode(mpCode);
          }
          
          // Generate QR Code Data with timestamp and multiple students support
          const studentsData = [];
          
          if (includeSelf) {
            studentsData.push({
              id: studentId,
              name: studentName,
              regNumber: studentRegNumber,
            });
          }
          
          selectedStudents.forEach(s => {
            studentsData.push({
              id: s.id,
              name: s.full_name,
              regNumber: s.reg_number,
            });
          });
          
          const qrData = JSON.stringify({
            type: "CASH_PAYMENT",
            paidBy: studentId,
            paidByName: studentName,
            paidByRegNumber: studentRegNumber,
            students: studentsData,
            totalStudents,
            paymentTypeId,
            paymentTypeName,
            totalAmount: amount,
            amountPerStudent: totalStudents > 0 ? amount / totalStudents : amount,
            timestamp: qrTimestamp,
            paymentMethod: "cash",
            paymentCode: code, // Include the short code in QR data
          });

          // Generate QR code on canvas
          await QRCode.toCanvas(canvasRef.current, qrData, {
            width: 300,
            margin: 2,
            color: {
              dark: "#1A1A2E",
              light: "#FFFFFF",
            },
            errorCorrectionLevel: "H",
          });

          // Get data URL for download
          const dataUrl = canvasRef.current.toDataURL("image/png");
          setQrDataUrl(dataUrl);
        } catch (error) {
          console.error("Error generating QR code:", error);
        }
      }
    };

    generateQRCode();
  }, [
    studentId,
    studentName,
    studentRegNumber,
    paymentTypeId,
    paymentTypeName,
    amount,
    totalStudents,
    selectedStudents,
    includeSelf,
    qrTimestamp,
  ]);

  const handleDownloadQR = () => {
    if (qrDataUrl) {
      const link = document.createElement("a");
      link.download = `payment-qr-${studentRegNumber}-${Date.now()}.png`;
      link.href = qrDataUrl;
      link.click();
    }
  };

  const handleRefreshQR = () => {
    // Regenerate QR code with new timestamp
    setQrTimestamp(Date.now());
  };

  const handleCopyPaymentCode = async () => {
    if (paymentCode) {
      try {
        await navigator.clipboard.writeText(paymentCode);
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      } catch (error) {
        console.error("Failed to copy:", error);
        const textArea = document.createElement("textarea");
        textArea.value = paymentCode;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      }
    }
  };

  // Copy multi-pay code for multi-student payments
  const handleCopyMultiPayCode = async () => {
    if (multiPayCode) {
      try {
        await navigator.clipboard.writeText(multiPayCode);
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      } catch (error) {
        console.error("Failed to copy:", error);
        const textArea = document.createElement("textarea");
        textArea.value = multiPayCode;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      }
    }
  };

  return (
    <div className="space-y-6 w-full flex flex-col items-center justify-center px-4 overflow-hidden">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <motion.div 
          className="inline-flex items-center justify-center gap-2 px-4 py-1.5 rounded-full mb-4"
          style={{ background: `${colors.accentMint}15`, border: `1px solid ${colors.accentMint}30` }}
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
        >
          <Zap className="w-4 h-4" style={{ color: colors.accentMint }} />
          <span className="text-xs font-semibold" style={{ color: colors.accentMint }}>INSTANT VERIFICATION</span>
        </motion.div>
        <div className="flex items-center justify-center mb-4">
          <motion.div
            className="w-20 h-20 rounded-3xl flex items-center justify-center relative"
            style={{ 
              background: `linear-gradient(135deg, ${colors.accentMint}25 0%, ${colors.accentMint}10 100%)`,
              border: `1px solid ${colors.accentMint}40`,
              boxShadow: `0 8px 32px ${colors.accentMint}20`
            }}
            animate={{ 
              boxShadow: [
                `0 8px 32px ${colors.accentMint}20`,
                `0 8px 48px ${colors.accentMint}40`,
                `0 8px 32px ${colors.accentMint}20`
              ]
            }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <QrCode className="w-10 h-10" style={{ color: colors.accentMint }} />
            <motion.div
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: gradients.mint }}
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              <Sparkles className="w-4 h-4 text-white" />
            </motion.div>
          </motion.div>
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
          Cash Payment QR Code
        </h2>
        <p className="text-sm" style={{ color: colors.textSecondary }}>
          Show this code to the treasurer to complete your payment
        </p>
      </motion.div>

      {/* Payment Details Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-lg"
      >
        <div 
          className="rounded-2xl overflow-hidden"
          style={{ 
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)'
          }}
        >
          <div 
            className="px-5 py-4 flex items-center gap-3"
            style={{ 
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.08) 0%, transparent 100%)'
            }}
          >
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: `${colors.primary}20` }}
            >
              <FileText className="w-5 h-5" style={{ color: colors.primary }} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Payment Details</h3>
              <p className="text-xs" style={{ color: colors.textSecondary }}>Verify before proceeding</p>
            </div>
          </div>

          <div className="p-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>Paid By</p>
                <div className="flex items-center gap-2">
                  <div 
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                    style={{ background: `${colors.primary}20`, color: colors.primary }}
                  >
                    {studentName.charAt(0)}
                  </div>
                  <p className="font-semibold text-white text-sm">{studentName}</p>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>Reg Number</p>
                <p className="font-semibold text-white text-sm">{studentRegNumber}</p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>Payment Type</p>
                <p className="font-semibold text-white text-sm">{paymentTypeName}</p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>Total Amount</p>
                <div className="flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4" style={{ color: colors.accentMint }} />
                  <p className="text-lg font-bold" style={{ color: colors.accentMint }}>
                    {formatCurrency(amount)}
                  </p>
                </div>
              </div>
              
              {totalStudents > 1 && (
                <>
                  <div className="space-y-1">
                    <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>Total Students</p>
                    <div className="flex items-center gap-1.5">
                      <Users className="w-4 h-4" style={{ color: colors.primary }} />
                      <p className="font-semibold text-white">{totalStudents}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>Per Student</p>
                    <p className="font-semibold text-white">{formatCurrency(amount / totalStudents)}</p>
                  </div>
                </>
              )}
            </div>
            
            {/* List of students being paid for */}
            {totalStudents >= 1 && (
              <div 
                className="mt-4 pt-4 border-t"
                style={{ borderColor: 'rgba(255,255,255,0.06)' }}
              >
                <p className="text-xs font-medium mb-2 flex items-center gap-2" style={{ color: colors.textSecondary }}>
                  <Users className="w-4 h-4" />
                  {totalStudents > 1 ? `Paying for ${totalStudents} Students:` : 'Paying for:'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {includeSelf && (
                    <span 
                      className="px-2.5 py-1 rounded-lg text-xs font-medium"
                      style={{ background: `${colors.primary}20`, color: colors.primary }}
                    >
                      {studentName} (You)
                    </span>
                  )}
                  {selectedStudents.map(s => (
                    <span 
                      key={s.id}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium"
                      style={{ background: 'rgba(255, 255, 255, 0.08)', color: colors.textPrimary }}
                    >
                      {s.full_name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* QR Code Display */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="w-full max-w-lg overflow-hidden"
      >
        <div 
          className="relative overflow-hidden rounded-3xl p-6 sm:p-8"
          style={{ 
            background: 'linear-gradient(135deg, rgba(107, 203, 119, 0.08) 0%, rgba(107, 203, 119, 0.02) 100%)',
            border: `1px solid ${colors.accentMint}30`
          }}
        >
          {/* Animated Border Glow */}
          <motion.div
            className="absolute inset-0 rounded-3xl pointer-events-none"
            style={{
              background: `radial-gradient(ellipse at center, ${colors.accentMint}15 0%, transparent 70%)`,
            }}
            animate={{
              opacity: [0.5, 0.8, 0.5],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          <div className="relative z-10 flex flex-col items-center">
            {/* Security Badge */}
            <motion.div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full mb-4"
              style={{ background: `${colors.accentMint}20`, border: `1px solid ${colors.accentMint}30` }}
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
            >
              <Shield className="w-3.5 h-3.5" style={{ color: colors.accentMint }} />
              <span className="text-xs font-medium" style={{ color: colors.accentMint }}>Secure Payment Code</span>
            </motion.div>

            {/* QR Code */}
            <motion.div 
              className="bg-white p-5 sm:p-6 rounded-2xl shadow-2xl mb-6"
              style={{ boxShadow: `0 20px 60px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1)` }}
              whileHover={{ scale: 1.02 }}
            >
              <canvas
                ref={canvasRef}
                className="mx-auto max-w-full h-auto"
                style={{ maxWidth: "280px" }}
              />
            </motion.div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
              <motion.button
                onClick={handleDownloadQR}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-white transition-all w-full sm:w-auto"
                style={{ 
                  background: gradients.mint,
                  boxShadow: `0 4px 20px ${colors.accentMint}40`
                }}
                whileHover={{ scale: 1.02, boxShadow: `0 6px 25px ${colors.accentMint}50` }}
                whileTap={{ scale: 0.98 }}
              >
                <Download className="w-5 h-5" />
                Download QR
              </motion.button>

              <motion.button
                onClick={handleRefreshQR}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all w-full sm:w-auto"
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  color: colors.textPrimary,
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}
                whileHover={{ scale: 1.02, background: 'rgba(255, 255, 255, 0.12)' }}
                whileTap={{ scale: 0.98 }}
              >
                <RefreshCw className="w-5 h-5" />
                Refresh Code
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Alternative Methods Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="w-full max-w-lg"
      >
        <div 
          className="rounded-2xl overflow-hidden"
          style={{ 
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)'
          }}
        >
          <div 
            className="px-5 py-4 flex items-center gap-3"
            style={{ 
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              background: `linear-gradient(135deg, ${colors.warning}08 0%, transparent 100%)`
            }}
          >
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: `${colors.warning}20` }}
            >
              <MessageSquare className="w-5 h-5" style={{ color: colors.warning }} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Can't Scan QR Code?</h3>
              <p className="text-xs" style={{ color: colors.textSecondary }}>Use these alternatives</p>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Option 1: Verbal Payment Code - Only for single student payments */}
            {totalStudents === 1 ? (
              <div 
                className="p-4 rounded-xl"
                style={{ 
                  background: `linear-gradient(135deg, ${colors.primary}10 0%, ${colors.primary}05 100%)`,
                  border: `1px solid ${colors.primary}25`
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Hash className="w-4 h-4" style={{ color: colors.primary }} />
                  <span className="text-sm font-semibold text-white">Option 1: Tell Payment Code</span>
                  <span 
                    className="px-2 py-0.5 rounded text-[10px] font-bold"
                    style={{ background: `${colors.primary}20`, color: colors.primary }}
                  >
                    RECOMMENDED
                  </span>
                </div>
                <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>
                  Verbally tell this code to the treasurer. They can enter it manually.
                </p>
                <div className="flex items-center gap-2">
                  <div 
                    className="flex-1 px-4 py-3 rounded-lg font-mono text-lg font-bold tracking-wider text-center"
                    style={{ 
                      background: 'rgba(0, 0, 0, 0.3)',
                      color: colors.primary,
                      border: `1px solid ${colors.primary}30`
                    }}
                  >
                    {paymentCode}
                  </div>
                  <motion.button
                    onClick={handleCopyPaymentCode}
                    className="p-3 rounded-lg"
                    style={{ 
                      background: copiedCode ? `${colors.statusPaid}20` : `${colors.primary}20`,
                      border: `1px solid ${copiedCode ? colors.statusPaid : colors.primary}30`
                    }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {copiedCode ? (
                      <Check className="w-5 h-5" style={{ color: colors.statusPaid }} />
                    ) : (
                      <Copy className="w-5 h-5" style={{ color: colors.primary }} />
                    )}
                  </motion.button>
                </div>
              </div>
            ) : (
              <div 
                className="p-4 rounded-xl"
                style={{ 
                  background: `linear-gradient(135deg, ${colors.primary}10 0%, ${colors.primary}05 100%)`,
                  border: `1px solid ${colors.primary}25`
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Hash className="w-4 h-4" style={{ color: colors.primary }} />
                  <span className="text-sm font-semibold text-white">Option 1: Multi-Pay Code</span>
                  <span 
                    className="px-2 py-0.5 rounded text-[10px] font-bold"
                    style={{ background: `${colors.accentMint}20`, color: colors.accentMint }}
                  >
                    {totalStudents} STUDENTS
                  </span>
                </div>
                <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>
                  Tell this short code to the treasurer. Contains all {totalStudents} students!
                </p>
                <div className="flex items-center gap-2 mb-3">
                  <div 
                    className="flex-1 px-4 py-3 rounded-lg font-mono text-lg font-bold tracking-wider text-center"
                    style={{ 
                      background: 'rgba(0, 0, 0, 0.3)',
                      color: colors.primary,
                      border: `1px solid ${colors.primary}30`
                    }}
                  >
                    {multiPayCode || '---'}
                  </div>
                  <motion.button
                    onClick={handleCopyMultiPayCode}
                    disabled={!multiPayCode}
                    className="p-3 rounded-lg disabled:opacity-50"
                    style={{ 
                      background: copiedCode ? `${colors.statusPaid}20` : `${colors.primary}20`,
                      border: `1px solid ${copiedCode ? colors.statusPaid : colors.primary}30`
                    }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {copiedCode ? (
                      <Check className="w-5 h-5" style={{ color: colors.statusPaid }} />
                    ) : (
                      <Copy className="w-5 h-5" style={{ color: colors.primary }} />
                    )}
                  </motion.button>
                </div>
              </div>
            )}

            {/* Option 2: Show Screen */}
            <div 
              className="p-4 rounded-xl"
              style={{ 
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <QrCode className="w-4 h-4" style={{ color: colors.accentMint }} />
                <span className="text-sm font-semibold text-white">{totalStudents === 1 ? 'Option 2' : 'Best Option'}: Show Your Screen</span>
              </div>
              <p className="text-xs" style={{ color: colors.textSecondary }}>
                Simply show this QR code on your phone screen to the treasurer for them to scan directly.
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Instructions */}
      {showInstructions && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="w-full max-w-lg"
        >
          <div 
            className="rounded-2xl overflow-hidden"
            style={{ 
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}
          >
            <div 
              className="px-5 py-4 flex items-center gap-3"
              style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}
            >
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: `${colors.primary}20` }}
              >
                <Info className="w-5 h-5" style={{ color: colors.primary }} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">How to Complete Payment</h3>
                <p className="text-xs" style={{ color: colors.textSecondary }}>Follow these simple steps</p>
              </div>
            </div>

            <div className="p-5">
              <div className="space-y-4">
                {[
                  { step: 1, title: 'Prepare Cash Payment', desc: `Have exact amount (${formatCurrency(amount)}) ready`, color: colors.primary },
                  { step: 2, title: 'Show QR Code', desc: 'Present to class treasurer or financial secretary', color: colors.accentMint },
                  { step: 3, title: 'Get Instant Confirmation', desc: 'Code scanned and payment marked received', color: colors.statusPaid },
                  { step: 4, title: 'Check Notification', desc: 'Instant notification once payment confirmed', color: colors.warning },
                ].map((item, i) => (
                  <motion.div
                    key={item.step}
                    className="flex items-start gap-4"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.1 }}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold"
                      style={{
                        background: `${item.color}20`,
                        color: item.color,
                        border: `1px solid ${item.color}40`
                      }}
                    >
                      {item.step}
                    </div>
                    <div>
                      <p className="font-semibold text-white text-sm">{item.title}</p>
                      <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                        {item.desc}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <motion.button
                onClick={() => setShowInstructions(false)}
                className="mt-5 text-sm font-medium px-4 py-2 rounded-lg transition-all"
                style={{ background: `${colors.primary}15`, color: colors.primary }}
                whileHover={{ background: `${colors.primary}25` }}
              >
                Hide Instructions
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Status Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="w-full max-w-lg"
      >
        <div 
          className="rounded-2xl p-5 flex items-center gap-4"
          style={{ 
            background: `linear-gradient(135deg, ${colors.warning}10 0%, ${colors.warning}03 100%)`,
            border: `1px solid ${colors.warning}25`
          }}
        >
          <motion.div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: `${colors.warning}20` }}
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <Clock className="w-7 h-7" style={{ color: colors.warning }} />
          </motion.div>
          <div className="flex-1">
            <p className="font-semibold text-white">Waiting for Treasurer Scan</p>
            <p className="text-sm mt-0.5" style={{ color: colors.textSecondary }}>
              Your payment will be confirmed instantly once scanned
            </p>
          </div>
          <CheckCircle2
            className="w-8 h-8 opacity-20"
            style={{ color: colors.statusPaid }}
          />
        </div>
      </motion.div>

      {/* Important Notes */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="w-full max-w-lg"
      >
        <div
          className="p-4 rounded-xl flex items-start gap-3"
          style={{ 
            background: `linear-gradient(135deg, ${colors.warning}08 0%, transparent 100%)`,
            border: `1px solid ${colors.warning}20`
          }}
        >
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${colors.warning}20` }}
          >
            <Info className="w-4 h-4" style={{ color: colors.warning }} />
          </div>
          <div>
            <p className="font-semibold text-sm" style={{ color: colors.warning }}>
              Important Notice
            </p>
            <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
              Keep this screen open until the treasurer scans your code and confirms receipt of payment.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
