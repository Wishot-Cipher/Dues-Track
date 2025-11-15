import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/config/supabase";
import { colors, gradients } from "@/config/colors";
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
} from "lucide-react";
import { Html5QrcodeScanner, Html5QrcodeScanType } from "html5-qrcode";
import Footer from "@/components/Footer";

interface QRData {
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
      // Parse QR Code data
      const data: QRData = JSON.parse(decodedText);

      // Validate QR code type
      if (data.type !== "CASH_PAYMENT") {
        toast.error("Invalid QR code format");
        return;
      }

      // Validate timestamp (not older than 24 hours)
      const qrAge = Date.now() - data.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      if (qrAge > maxAge) {
        toast.error("QR code has expired. Please generate a new one.");
        return;
      }

      // Stop scanner
      if (scanner) {
        await scanner.clear();
      }

      // Fetch student details
      const { data: studentData, error: studentError } = await supabase
        .from("students")
        .select("id, full_name, reg_number")
        .eq("id", data.studentId)
        .single();

      if (studentError || !studentData) {
        toast.error("Student not found");
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

      // Check if student already paid
      const { data: existingPayments } = await supabase
        .from("payments")
        .select("status, amount")
        .eq("student_id", data.studentId)
        .eq("payment_type_id", data.paymentTypeId);

      const totalPaid =
        existingPayments
          ?.filter((p) => p.status === "approved")
          .reduce((sum, p) => sum + p.amount, 0) || 0;

      if (totalPaid >= paymentTypeData.amount) {
        toast.error("Student has already paid for this payment type");
        return;
      }

      // Set data for confirmation
      setQrData(data);
      setStudent(studentData);
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
    // Initialize QR Scanner
    const qrScanner = new Html5QrcodeScanner(
      "qr-reader",
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
        aspectRatio: 1.0,
        showTorchButtonIfSupported: true,
      },
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
      // Generate transaction reference
      const transactionRef = `CASH-${student.reg_number}-${Date.now()}`;

      // Create payment record
      const paymentResponse = await supabase
        .from("payments")
        .insert({
          student_id: qrData.studentId,
          payment_type_id: qrData.paymentTypeId,
          amount: qrData.amount,
          payment_method: "cash",
          transaction_ref: transactionRef,
          status: "approved", // Auto-approve cash payments
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          notes: `Cash payment verified via QR code scan by ${user.email}`,
          // receipts are optional for cash flow in UI, but DB requires a non-null value for now
          receipt_url: "",
        })
        .select()
        .single();

      if (paymentResponse?.error) {
        console.error("Supabase payment insert error:", paymentResponse.error);
        throw paymentResponse.error;
      }

      // Send notification to student
      const notifResponse = await supabase.from("notifications").insert({
        recipient_id: qrData.studentId,
        type: "payment_approved",
        title: `Cash Payment Received - ${qrData.paymentTypeName}`,
        message: `Your cash payment of ${formatCurrency(
          qrData.amount
        )} has been received and approved.\n\nTransaction Ref: ${transactionRef}\n\nThank you for your payment!`,
        link: "/payments",
      });

      if (notifResponse?.error) {
        console.error(
          "Supabase notification insert error:",
          notifResponse.error
        );
        // don't block success for notification failures, but show a warning
        toast.error("Payment saved but failed to send notification.");
      }

      toast.success(`Payment confirmed for ${student.full_name}!`);

      // Reset and restart scanner
      setTimeout(() => {
        setQrData(null);
        setStudent(null);
        setPaymentType(null);
        setScanning(true);

        // Reinitialize scanner
        const newScanner = new Html5QrcodeScanner(
          "qr-reader",
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
            aspectRatio: 1.0,
            showTorchButtonIfSupported: true,
          },
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

    // Restart scanner
    const newScanner = new Html5QrcodeScanner(
      "qr-reader",
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
        aspectRatio: 1.0,
        showTorchButtonIfSupported: true,
      },
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
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <button
            onClick={() => navigate("/admin/dashboard")}
            className="flex items-center justify-center sm:justify-start gap-2 mb-4 px-3 py-2 rounded-lg transition-colors w-auto outline outline-orange-500 "
            style={{ color: colors.textSecondary }}
            onMouseEnter={(e) => (e.currentTarget.style.color = colors.primary)}
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = colors.textSecondary)
            }
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Back to Dashboard</span>
          </button>

          <div className="flex items-center gap-4 mb-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: gradients.mint }}
            >
              <QrCode className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white mb-1">
                Scan QR Code
              </h1>
              <p style={{ color: colors.textSecondary }}>
                Scan student QR codes to verify cash payments
              </p>
            </div>
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {scanning && (
            <motion.div
              key="scanner"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <GlassCard>
                <div className="text-center mb-6">
                  <div className="flex items-center justify-center mb-4">
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center animate-pulse"
                      style={{ background: `${colors.primary}20` }}
                    >
                      <Camera
                        className="w-8 h-8"
                        style={{ color: colors.primary }}
                      />
                    </div>
                  </div>
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
                <div
                  className="mt-6 p-4 rounded-xl"
                  style={{ background: `${colors.primary}10` }}
                >
                  <div className="flex items-start gap-3">
                    <ScanLine
                      className="w-5 h-5 shrink-0 mt-0.5"
                      style={{ color: colors.primary }}
                    />
                    <div className="flex-1">
                      <p className="font-medium text-white mb-1">
                        Scanning Tips
                      </p>
                      <ul
                        className="text-sm space-y-1"
                        style={{ color: colors.textSecondary }}
                      >
                        <li>• Ensure good lighting</li>
                        <li>• Hold phone steady</li>
                        <li>• Keep QR code centered</li>
                        <li>• Wait for automatic scan</li>
                      </ul>
                    </div>
                  </div>
                </div>
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
              <GlassCard>
                <div className="text-center mb-6">
                  <div className="flex items-center justify-center mb-4">
                    <div
                      className="w-20 h-20 rounded-full flex items-center justify-center"
                      style={{ background: gradients.mint }}
                    >
                      <CheckCircle2 className="w-10 h-10 text-white" />
                    </div>
                  </div>
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
                    <div
                      className="p-4 rounded-xl"
                      style={{ background: "rgba(255,255,255,0.05)" }}
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
                          Student Name
                        </p>
                      </div>
                      <p className="text-lg font-bold text-white">
                        {student.full_name}
                      </p>
                    </div>

                    <div
                      className="p-4 rounded-xl"
                      style={{ background: "rgba(255,255,255,0.05)" }}
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
                        {student.reg_number}
                      </p>
                    </div>

                    <div
                      className="p-4 rounded-xl"
                      style={{ background: "rgba(255,255,255,0.05)" }}
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
                    </div>

                    <div
                      className="p-4 rounded-xl"
                      style={{ background: "rgba(255,255,255,0.05)" }}
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
                          Amount
                        </p>
                      </div>
                      <p
                        className="text-2xl font-bold"
                        style={{ color: colors.accentMint }}
                      >
                        {formatCurrency(qrData.amount)}
                      </p>
                    </div>
                  </div>

                  {/* Warning */}
                  <div
                    className="flex items-start gap-3 p-4 rounded-xl"
                    style={{ background: `${colors.warning}15` }}
                  >
                    <AlertTriangle
                      className="w-5 h-5 shrink-0 mt-0.5"
                      style={{ color: colors.warning }}
                    />
                    <div className="flex-1">
                      <p className="font-medium text-white mb-1">
                        Verify Cash Received
                      </p>
                      <p
                        className="text-sm"
                        style={{ color: colors.textSecondary }}
                      >
                        Make sure you have received the exact amount in cash (
                        {formatCurrency(qrData.amount)}) from the student before
                        confirming.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={handleCancel}
                    disabled={confirming}
                    className="flex-1 py-3 rounded-xl font-medium transition-all disabled:opacity-50"
                    style={{
                      background: "rgba(255,255,255,0.1)",
                      color: colors.textSecondary,
                      border: "1px solid rgba(255,255,255,0.2)",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmPayment}
                    disabled={confirming || !hasPermission?.("can_approve_payments")}
                    className="flex-1 py-3 rounded-xl font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{
                      background: gradients.mint,
                      color: "white",
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
                        Confirm Payment Received
                      </>
                    )}
                  </button>
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
