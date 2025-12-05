import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/config/supabase";
import { colors } from "@/config/colors";
import GlassCard from "@/components/ui/GlassCard";
import { useToast } from "@/hooks/useToast";
import { formatCurrency } from "@/utils/formatters";
import {
  QrCode,
  ArrowLeft,
  Camera,
  CheckCircle2,
  User,
  DollarSign,
  FileText,
  AlertTriangle,
  Loader2,
  ScanLine,
  Sparkles,
  Shield,
} from "lucide-react";
import { Html5QrcodeScanner, Html5QrcodeScanType, Html5QrcodeSupportedFormats } from "html5-qrcode";
import Footer from "@/components/Footer";

// New multi-student QR format
interface NewQRData {
  type: string;
  paidBy: string;
  paidByName: string;
  paidByRegNumber: string;
  students: Array<{ id: string; name: string; regNumber: string }>;
  totalStudents: number;
  paymentTypeId: string;
  paymentTypeName: string;
  totalAmount: number;
  amountPerStudent: number;
  timestamp: number;
  paymentMethod: string;
}

// Legacy single-student QR format (for backwards compatibility)
interface LegacyQRData {
  type: string;
  studentId: string;
  studentName: string;
  studentRegNumber: string;
  paymentTypeId: string;
  paymentTypeName: string;
  amount: number;
  timestamp: number;
  paymentMethod: string;
}

// Normalized format for internal use
interface QRData {
  type: string;
  paidBy: string;
  paidByName: string;
  paidByRegNumber: string;
  students: Array<{ id: string; name: string; regNumber: string }>;
  totalStudents: number;
  paymentTypeId: string;
  paymentTypeName: string;
  totalAmount: number;
  amountPerStudent: number;
  timestamp: number;
  paymentMethod: string;
}

interface Student {
  id: string;
  full_name: string;
  reg_number: string;
}

interface PaymentType {
  id: string;
  title: string;
  amount: number;
}

// Scanner configuration for optimal QR scanning
const getScannerConfig = () => ({
  fps: 15,
  qrbox: { width: 280, height: 280 },
  supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
  aspectRatio: 1.0,
  showTorchButtonIfSupported: true,
  showZoomSliderIfSupported: true,
  defaultZoomValueIfSupported: 1.5,
  formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
  experimentalFeatures: {
    useBarCodeDetectorIfSupported: true
  },
  rememberLastUsedCamera: true,
  videoConstraints: {
    facingMode: "environment",
    width: { min: 640, ideal: 1280, max: 1920 },
    height: { min: 480, ideal: 720, max: 1080 }
  }
});

export default function ScanQRCodePage() {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const toast = useToast();

  const [scanning, setScanning] = useState(true);
  const [qrData, setQrData] = useState<QRData | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [scanner, setScanner] = useState<Html5QrcodeScanner | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [paymentType, setPaymentType] = useState<PaymentType | null>(null);

  const onScanSuccess = async (decodedText: string) => {
    try {
      // Parse QR Code data (supports both old and new format)
      const rawData = JSON.parse(decodedText);

      // Validate QR code type
      if (rawData.type !== "CASH_PAYMENT") {
        toast.error("Invalid QR code format");
        return;
      }

      // Normalize to new format (support legacy QR codes)
      let data: QRData;
      
      if (rawData.paidBy && rawData.students) {
        // New multi-student format
        data = rawData as NewQRData;
      } else if (rawData.studentId) {
        // Legacy single-student format - convert to new format
        const legacyData = rawData as LegacyQRData;
        data = {
          type: legacyData.type,
          paidBy: legacyData.studentId,
          paidByName: legacyData.studentName,
          paidByRegNumber: legacyData.studentRegNumber,
          students: [{
            id: legacyData.studentId,
            name: legacyData.studentName,
            regNumber: legacyData.studentRegNumber,
          }],
          totalStudents: 1,
          paymentTypeId: legacyData.paymentTypeId,
          paymentTypeName: legacyData.paymentTypeName,
          totalAmount: legacyData.amount,
          amountPerStudent: legacyData.amount,
          timestamp: legacyData.timestamp,
          paymentMethod: legacyData.paymentMethod,
        };
      } else {
        toast.error("Invalid QR code data structure");
        return;
      }

      // Validate timestamp (not older than 24 hours)
      const qrAge = Date.now() - data.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      if (qrAge > maxAge) {
        toast.error("QR code has expired. Please generate a new one.");
        return;
      }

      // Validate that we have at least one student to process
      if (!data.students || data.students.length === 0) {
        toast.error("No students found in QR code");
        return;
      }

      // Stop scanner
      if (scanner) {
        await scanner.clear();
      }

      // Fetch payer details (the person who generated the QR)
      const { data: payerData, error: payerError } = await supabase
        .from("students")
        .select("id, full_name, reg_number")
        .eq("id", data.paidBy)
        .single();

      if (payerError || !payerData) {
        toast.error("Payer not found");
        return;
      }

      // Fetch payment type details
      const { data: paymentTypeData, error: paymentTypeError } = await supabase
        .from("payment_types")
        .select("id, title, amount")
        .eq("id", data.paymentTypeId)
        .single();

      if (paymentTypeError || !paymentTypeData) {
        toast.error("Payment type not found");
        return;
      }

      // Check if any student already fully paid
      const alreadyPaidStudents: string[] = [];
      for (const student of data.students) {
        const { data: existingPayments } = await supabase
          .from("payments")
          .select("status, amount")
          .eq("student_id", student.id)
          .eq("payment_type_id", data.paymentTypeId);

        const totalPaid =
          existingPayments
            ?.filter((p) => p.status === "approved")
            .reduce((sum, p) => sum + p.amount, 0) || 0;

        if (totalPaid >= paymentTypeData.amount) {
          alreadyPaidStudents.push(student.name);
        }
      }

      if (alreadyPaidStudents.length === data.students.length) {
        toast.error("All students have already paid for this payment type");
        return;
      }

      if (alreadyPaidStudents.length > 0) {
        toast.error(`Warning: ${alreadyPaidStudents.join(", ")} already paid`);
      }

      // Set data for confirmation
      setQrData(data);
      setStudent(payerData);
      setPaymentType(paymentTypeData);
      setScanning(false);
    } catch (error) {
      console.error("Error processing QR code:", error);
      toast.error("Invalid QR code data");
    }
  };

  const onScanError = (errorMessage: string) => {
    // Ignore scan errors (they happen frequently during scanning)
    console.debug("Scan error:", errorMessage);
  };

  useEffect(() => {
    // Initialize QR Scanner with improved settings for better scanning
    const qrScanner = new Html5QrcodeScanner(
      "qr-reader",
      getScannerConfig(),
      false
    );

    qrScanner.render(onScanSuccess, onScanError);
    setScanner(qrScanner);

    return () => {
      qrScanner.clear().catch(console.error);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Redirect if the current user does not have permission to approve payments
    if (!hasPermission?.("can_approve_payments")) {
      toast.error("You are not authorized to access this page");
      navigate("/admin/dashboard");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPermission]);

  const handleConfirmPayment = async () => {
    if (!qrData || !user || !student || !paymentType) return;

    // Ensure current user has permission to approve
    if (!hasPermission?.("can_approve_payments")) {
      toast.error("You don't have permission to confirm payments");
      return;
    }

    setConfirming(true);
    try {
      const baseTimestamp = Date.now();
      const successfulPayments: string[] = [];
      const failedPayments: string[] = [];

      // Process payment for each student in the QR code
      for (let i = 0; i < qrData.students.length; i++) {
        const studentToPay = qrData.students[i];
        
        // Check if student already fully paid (skip if so)
        const { data: existingPayments } = await supabase
          .from("payments")
          .select("status, amount")
          .eq("student_id", studentToPay.id)
          .eq("payment_type_id", qrData.paymentTypeId);

        const totalPaid =
          existingPayments
            ?.filter((p) => p.status === "approved")
            .reduce((sum, p) => sum + p.amount, 0) || 0;

        if (totalPaid >= paymentType.amount) {
          // Student already fully paid, skip
          continue;
        }

        // Generate unique transaction reference for each payment
        const transactionRef = `CASH-${studentToPay.regNumber}-${baseTimestamp}-${i}`;

        // Create payment record for this student
        const paymentResponse = await supabase
          .from("payments")
          .insert({
            student_id: studentToPay.id,
            payment_type_id: qrData.paymentTypeId,
            amount: qrData.amountPerStudent,
            payment_method: "cash",
            transaction_ref: transactionRef,
            status: "approved", // Auto-approve cash payments
            approved_by: user.id,
            approved_at: new Date().toISOString(),
            notes: qrData.totalStudents > 1 
              ? `Cash payment (paid by ${qrData.paidByName}) verified via QR code scan by ${user.email}`
              : `Cash payment verified via QR code scan by ${user.email}`,
            paid_by: studentToPay.id !== qrData.paidBy ? qrData.paidBy : null, // Track who paid on behalf
            receipt_url: "",
          })
          .select()
          .single();

        if (paymentResponse?.error) {
          console.error("Supabase payment insert error:", paymentResponse.error);
          failedPayments.push(studentToPay.name);
          continue;
        }

        successfulPayments.push(studentToPay.name);

        // Send notification to student
        await supabase.from("notifications").insert({
          recipient_id: studentToPay.id,
          type: "payment_approved",
          title: `Cash Payment Received - ${qrData.paymentTypeName}`,
          message: qrData.totalStudents > 1
            ? `Your cash payment of ${formatCurrency(qrData.amountPerStudent)} has been received and approved.\n\nPaid by: ${qrData.paidByName}\nTransaction Ref: ${transactionRef}\n\nThank you!`
            : `Your cash payment of ${formatCurrency(qrData.amountPerStudent)} has been received and approved.\n\nTransaction Ref: ${transactionRef}\n\nThank you for your payment!`,
          link: "/payments",
        });
      }

      // Show appropriate success/error message
      if (successfulPayments.length > 0 && failedPayments.length === 0) {
        const message = successfulPayments.length === 1
          ? `Payment confirmed for ${successfulPayments[0]}!`
          : `Payment confirmed for ${successfulPayments.length} students!`;
        toast.success(message);
      } else if (successfulPayments.length > 0 && failedPayments.length > 0) {
        toast.success(`Payment confirmed for ${successfulPayments.length} students, but failed for ${failedPayments.length}`);
      } else {
        throw new Error("No payments were processed successfully");
      }

      // Reset and restart scanner
      setTimeout(() => {
        setQrData(null);
        setStudent(null);
        setPaymentType(null);
        setScanning(true);

        // Reinitialize scanner with optimal config
        const newScanner = new Html5QrcodeScanner(
          "qr-reader",
          getScannerConfig(),
          false
        );
        newScanner.render(onScanSuccess, onScanError);
        setScanner(newScanner);
      }, 2000);
    } catch (error: unknown) {
      console.error("Error confirming payment:", error);
      // Try to surface useful error message
      let message = "Failed to confirm payment";
      if (error && typeof error === "object") {
        const errObj = error as { message?: string };
        if (errObj.message) message = errObj.message;
      }
      toast.error(message);
    } finally {
      setConfirming(false);
    }
  };

  const handleCancel = () => {
    setQrData(null);
    setStudent(null);
    setPaymentType(null);
    setScanning(true);

    // Restart scanner with optimal config
    const newScanner = new Html5QrcodeScanner(
      "qr-reader",
      getScannerConfig(),
      false
    );
    newScanner.render(onScanSuccess, onScanError);
    setScanner(newScanner);
  };

  return (
    <div
      className="min-h-screen py-6 px-4 relative overflow-hidden"
      style={{
        background: "radial-gradient(ellipse at top, #1A0E09 0%, #0F0703 100%)",
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
          backgroundSize: "50px 50px",
        }}
      />

      {/* Animated Gradient Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute w-[500px] h-[500px] rounded-full blur-[120px] opacity-30 animate-pulse"
          style={{
            background: `radial-gradient(circle, ${colors.primary} 0%, transparent 70%)`,
            top: "-10%",
            right: "-5%",
            animationDuration: "4s",
          }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full blur-[100px] opacity-20"
          style={{
            background: `radial-gradient(circle, ${colors.accentMint} 0%, transparent 70%)`,
            bottom: "-5%",
            left: "-5%",
            animation: "pulse 6s ease-in-out infinite",
          }}
        />

        {/* ECE Logo Background - Creative Element */}
        <div className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-[0.08] pointer-events-none">
          <img
            src="/Ece picture.jpg"
            alt="ECE Background"
            className="w-full h-full object-contain"
            style={{
              filter: "grayscale(0.5) brightness(0.8)",
              mixBlendMode: "soft-light",
            }}
          />
        </div>
      </div>

      <div className="max-w-4xl mx-auto relative z-10">
        {/* Enhanced Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <GlassCard className="relative overflow-hidden">
            {/* Decorative Elements */}
            <div className="absolute top-0 right-0 w-48 h-48 opacity-5 pointer-events-none">
              <QrCode className="w-full h-full" style={{ color: colors.accentMint }} />
            </div>
            <div 
              className="absolute top-0 left-0 w-full h-1"
              style={{ background: `linear-gradient(90deg, ${colors.accentMint}, ${colors.primary}, transparent)` }}
            />

            <div className="relative z-10">
              <motion.button
                whileHover={{ x: -4 }}
                onClick={() => navigate("/admin/dashboard")}
                className="flex items-center gap-2 mb-4 px-4 py-2 rounded-xl transition-all"
                style={{ 
                  background: `${colors.primary}15`,
                  border: `1px solid ${colors.primary}30`,
                  color: colors.primary 
                }}
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="font-medium">Back to Dashboard</span>
              </motion.button>

              <div className="flex flex-col sm:flex-row items-center gap-4">
                <motion.div
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  className="w-16 h-16 rounded-2xl flex items-center justify-center relative shrink-0"
                  style={{ 
                    background: `linear-gradient(135deg, ${colors.accentMint}30, ${colors.accentMint}10)`,
                    border: `1px solid ${colors.accentMint}40`,
                    boxShadow: `0 4px 20px ${colors.accentMint}30`
                  }}
                >
                  <QrCode className="w-8 h-8" style={{ color: colors.accentMint }} />
                  <Sparkles className="w-4 h-4 absolute -top-1 -right-1" style={{ color: colors.primary }} />
                </motion.div>
                <div className="text-center sm:text-left">
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
                    <Shield className="w-3 h-3" />
                    CASH VERIFICATION
                  </motion.div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-white">
                    Scan QR Code
                  </h1>
                  <p style={{ color: colors.textSecondary }}>
                    Scan student QR codes to verify and approve cash payments
                  </p>
                </div>
              </div>

              {/* Quick Status */}
              <div className="flex items-center justify-center gap-4 mt-6">
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl"
                     style={{ background: `${colors.statusPaid}15`, border: `1px solid ${colors.statusPaid}30` }}>
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: colors.statusPaid }} />
                  <span className="text-sm font-medium" style={{ color: colors.statusPaid }}>Scanner Active</span>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl"
                     style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <Camera className="w-4 h-4" style={{ color: colors.textSecondary }} />
                  <span className="text-sm" style={{ color: colors.textSecondary }}>Camera Ready</span>
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        <AnimatePresence mode="wait">
          {scanning && (
            <motion.div
              key="scanner"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <GlassCard className="relative overflow-hidden">
                <div 
                  className="absolute top-0 left-0 w-full h-1"
                  style={{ background: `linear-gradient(90deg, ${colors.accentMint}, ${colors.primary}, transparent)` }}
                />
                <div className="text-center mb-6">
                  <motion.div 
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4"
                    style={{ background: `linear-gradient(135deg, ${colors.accentMint}20, ${colors.primary}20)` }}
                  >
                    <Camera
                      className="w-10 h-10"
                      style={{ color: colors.accentMint }}
                    />
                  </motion.div>
                  <h2 className="text-2xl font-bold text-white mb-2">
                    Position QR Code in View
                  </h2>
                  <p style={{ color: colors.textSecondary }}>
                    Hold the student's QR code in front of the camera
                  </p>
                </div>

                {/* QR Scanner */}
                <div id="qr-reader" className="rounded-xl overflow-hidden" />

                {/* Instructions */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="mt-6 p-4 rounded-xl"
                  style={{ background: `linear-gradient(135deg, ${colors.primary}10, ${colors.accentMint}05)`, border: `1px solid ${colors.primary}20` }}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                         style={{ background: `${colors.primary}15` }}>
                      <ScanLine
                        className="w-5 h-5"
                        style={{ color: colors.primary }}
                      />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-white mb-2">
                        Scanning Tips
                      </p>
                      <ul
                        className="text-sm space-y-1.5"
                        style={{ color: colors.textSecondary }}
                      >
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: colors.accentMint }} />
                          Ensure good lighting
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: colors.accentMint }} />
                          Hold phone steady
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: colors.accentMint }} />
                          Keep QR code centered
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: colors.accentMint }} />
                          Wait for automatic scan
                        </li>
                      </ul>
                    </div>
                  </div>
                </motion.div>
              </GlassCard>
            </motion.div>
          )}

          {!scanning && qrData && student && paymentType && (
            <motion.div
              key="confirmation"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <GlassCard className="relative overflow-hidden">
                {/* Gradient Header */}
                <div 
                  className="absolute top-0 left-0 w-full h-24"
                  style={{ 
                    background: `linear-gradient(135deg, ${colors.statusPaid}20 0%, ${colors.accentMint}20 50%, transparent 100%)`,
                  }}
                />
                <div 
                  className="absolute top-0 left-0 w-full h-1"
                  style={{ background: `linear-gradient(90deg, ${colors.statusPaid}, ${colors.accentMint})` }}
                />

                <div className="relative z-10">
                  <div className="text-center mb-6">
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", bounce: 0.5 }}
                      className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4"
                      style={{ 
                        background: `linear-gradient(135deg, ${colors.statusPaid}, ${colors.accentMint})`,
                        boxShadow: `0 4px 20px ${colors.statusPaid}40`
                      }}
                    >
                      <CheckCircle2 className="w-10 h-10 text-white" />
                    </motion.div>
                    <h2 className="text-2xl font-bold text-white mb-2">
                      QR Code Scanned Successfully
                    </h2>
                    <p style={{ color: colors.textSecondary }}>
                      Verify the details below before confirming
                    </p>
                  </div>

                  {/* Payment Details */}
                  <div className="space-y-4 mb-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        className="p-4 rounded-xl"
                        style={{ background: "rgba(255,255,255,0.05)", border: '1px solid rgba(255,255,255,0.08)' }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <User
                            className="w-4 h-4"
                            style={{ color: colors.primary }}
                          />
                          <p
                            className="text-xs font-medium"
                            style={{ color: colors.textSecondary }}
                          >
                            {qrData.totalStudents > 1 ? "Paid By" : "Student Name"}
                          </p>
                        </div>
                        <p className="text-lg font-bold text-white">
                          {qrData.paidByName}
                        </p>
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.15 }}
                        className="p-4 rounded-xl"
                        style={{ background: "rgba(255,255,255,0.05)", border: '1px solid rgba(255,255,255,0.08)' }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <User
                            className="w-4 h-4"
                            style={{ color: colors.primary }}
                          />
                          <p
                            className="text-xs font-medium"
                            style={{ color: colors.textSecondary }}
                          >
                            Reg Number
                          </p>
                        </div>
                        <p className="text-lg font-bold text-white">
                          {qrData.paidByRegNumber}
                        </p>
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        className="p-4 rounded-xl"
                        style={{ background: "rgba(255,255,255,0.05)", border: '1px solid rgba(255,255,255,0.08)' }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <FileText
                            className="w-4 h-4"
                            style={{ color: colors.accentMint }}
                          />
                          <p
                            className="text-xs font-medium"
                            style={{ color: colors.textSecondary }}
                          >
                            Payment Type
                          </p>
                        </div>
                        <p className="text-lg font-bold text-white">
                          {paymentType.title}
                        </p>
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.25 }}
                        className="p-4 rounded-xl"
                        style={{ background: `${colors.accentMint}10`, border: `1px solid ${colors.accentMint}20` }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <DollarSign
                            className="w-4 h-4"
                            style={{ color: colors.accentMint }}
                          />
                          <p
                            className="text-xs font-medium"
                            style={{ color: colors.textSecondary }}
                          >
                            Total Amount
                          </p>
                        </div>
                        <p
                          className="text-2xl font-bold"
                          style={{ color: colors.accentMint }}
                        >
                          {formatCurrency(qrData.totalAmount)}
                        </p>
                      </motion.div>
                      
                      {qrData.totalStudents > 1 && (
                        <>
                          <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                            className="p-4 rounded-xl"
                            style={{ background: "rgba(255,255,255,0.05)", border: '1px solid rgba(255,255,255,0.08)' }}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <User
                                className="w-4 h-4"
                                style={{ color: colors.primary }}
                              />
                              <p
                                className="text-xs font-medium"
                                style={{ color: colors.textSecondary }}
                              >
                                Total Students
                              </p>
                            </div>
                            <p className="text-lg font-bold text-white">
                              {qrData.totalStudents}
                            </p>
                          </motion.div>

                          <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.35 }}
                            className="p-4 rounded-xl"
                            style={{ background: "rgba(255,255,255,0.05)", border: '1px solid rgba(255,255,255,0.08)' }}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <DollarSign
                                className="w-4 h-4"
                                style={{ color: colors.accentMint }}
                              />
                              <p
                                className="text-xs font-medium"
                                style={{ color: colors.textSecondary }}
                              >
                                Per Student
                              </p>
                            </div>
                            <p className="text-lg font-bold" style={{ color: colors.accentMint }}>
                              {formatCurrency(qrData.amountPerStudent)}
                            </p>
                          </motion.div>
                        </>
                      )}
                    </div>
                    
                    {/* List of students being paid for (multi-student only) */}
                    {qrData.totalStudents > 1 && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="p-4 rounded-xl"
                        style={{ background: "rgba(255,255,255,0.05)", border: '1px solid rgba(255,255,255,0.08)' }}
                      >
                        <p
                          className="text-xs font-semibold mb-3 uppercase tracking-wide"
                          style={{ color: colors.textSecondary }}
                        >
                          Students ({qrData.students.length}):
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {qrData.students.map((s, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm p-2 rounded-lg"
                                 style={{ background: 'rgba(255,255,255,0.03)' }}>
                              <CheckCircle2 className="w-4 h-4" style={{ color: colors.statusPaid }} />
                              <span className="text-white font-medium">{s.name}</span>
                              <span style={{ color: colors.textSecondary }}>({s.regNumber})</span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {/* Warning */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.45 }}
                      className="flex items-start gap-3 p-4 rounded-xl"
                      style={{ background: `${colors.warning}10`, border: `1px solid ${colors.warning}30` }}
                    >
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                           style={{ background: `${colors.warning}15` }}>
                        <AlertTriangle
                          className="w-5 h-5"
                          style={{ color: colors.warning }}
                        />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-white mb-1">
                          Verify Cash Received
                        </p>
                        <p
                          className="text-sm"
                          style={{ color: colors.textSecondary }}
                        >
                          Make sure you have received the exact amount in cash (
                          <span className="font-semibold" style={{ color: colors.warning }}>{formatCurrency(qrData.totalAmount)}</span>) from {qrData.paidByName} before
                          confirming.
                        </p>
                      </div>
                    </motion.div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleCancel}
                      disabled={confirming}
                      className="flex-1 py-3.5 rounded-xl font-medium transition-all disabled:opacity-50"
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        color: colors.textSecondary,
                        border: "1px solid rgba(255,255,255,0.1)",
                      }}
                    >
                      Cancel
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleConfirmPayment}
                      disabled={confirming || !hasPermission?.("can_approve_payments")}
                      className="flex-1 py-3.5 rounded-xl font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      style={{
                        background: `linear-gradient(135deg, ${colors.statusPaid}, ${colors.accentMint})`,
                        color: "white",
                        boxShadow: `0 4px 15px ${colors.statusPaid}40`
                      }}
                    >
                      {confirming ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Confirming...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-5 h-5" />
                          Confirm Payment
                        </>
                      )}
                    </motion.button>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <Footer />
    </div>
  );
}
