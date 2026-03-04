/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "react-router-dom";
import { useAppNav } from '@/hooks/useAppNav';
import { useAppAuth as useAuth } from '@/hooks/useAppAuth';
import { supabase } from "@/config/supabase";
import { getOrgScope } from "@/utils/orgScope";
import { colors, gradients } from "@/config/colors";
import GlassCard from "@/components/ui/GlassCard";
import { useToast } from "@/hooks/useToast";
import { formatCurrency } from "@/utils/formatters";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  User,
  DollarSign,
  AlertTriangle,
  Loader2,
  ScanLine,
  Shield,
  RefreshCw,
  Keyboard,
  CameraOff,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import Footer from "@/components/Footer";

// QR Data interfaces
interface QRData {
  type: string;
  organizationId?: string | null;
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
  late_fee_per_day?: number;
}

const SCANNER_CONTAINER_ID = "qr-scanner";

export default function ScanQRCodePage() {
  const { go: navigate } = useAppNav();
  const location = useLocation();
  const { user, hasPermission } = useAuth();
  const toast = useToast();

  // Main state
  const [mode, setMode] = useState<"scan" | "manual" | "confirm">("scan");
  const [qrData, setQrData] = useState<QRData | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [paymentType, setPaymentType] = useState<PaymentType | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Scanner state
  const [cameraLoading, setCameraLoading] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCamera, setSelectedCamera] = useState("");
  const [scanCount, setScanCount] = useState(0);

  // Manual input state
  const [paymentCode, setPaymentCode] = useState("");
  const [processingManual, setProcessingManual] = useState(false);

  // Refs
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const mountedRef = useRef(true);
  const processingRef = useRef(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Check permissions
  useEffect(() => {
    if (!hasPermission?.("can_approve_payments")) {
      toast.error("You are not authorized to access this page");
      navigate("/admin/dashboard");
    }
  }, [hasPermission, navigate, toast]);

  // Detect iOS
  const isIOS = () => {
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  };

  // Force stop all camera media tracks
  const forceStopCamera = useCallback(() => {
    try {
      // Stop any stored media stream
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => {
          track.stop();
          console.debug("Stopped track:", track.kind);
        });
        mediaStreamRef.current = null;
      }

      // Find and stop all video elements in the scanner container
      const container = document.getElementById(SCANNER_CONTAINER_ID);
      if (container) {
        const videos = container.querySelectorAll("video");
        videos.forEach((video) => {
          if (video.srcObject instanceof MediaStream) {
            video.srcObject.getTracks().forEach((track) => {
              track.stop();
              console.debug("Stopped video track:", track.kind);
            });
            video.srcObject = null;
          }
          video.remove();
        });
        container.innerHTML = "";
      }

      // Also try to stop all active video tracks on the page
      document.querySelectorAll("video").forEach((video) => {
        if (video.srcObject instanceof MediaStream) {
          video.srcObject.getTracks().forEach((track) => {
            if (track.readyState === "live") {
              track.stop();
            }
          });
        }
      });
    } catch (err) {
      console.debug("Force stop camera error:", err);
    }
  }, []);

  // Stop scanner safely with complete camera release
  const stopScanner = useCallback(async () => {
    try {
      // First, try to stop the scanner properly
      if (scannerRef.current) {
        try {
          const state = scannerRef.current.getState();
          if (state === Html5QrcodeScannerState.SCANNING) {
            await scannerRef.current.stop();
          }
        } catch {
          // Ignore state errors
        }
        
        try {
          scannerRef.current.clear();
        } catch {
          // Ignore clear errors
        }
        
        scannerRef.current = null;
      }
      
      // Force release all camera resources
      forceStopCamera();
      
    } catch (err) {
      console.debug("Stop scanner error:", err);
      // Even if there's an error, force stop the camera
      forceStopCamera();
    }
  }, [forceStopCamera]);

  // Process QR data
  const processQRData = useCallback(
    async (decodedText: string): Promise<boolean> => {
      if (!mountedRef.current || processingRef.current) return false;

      processingRef.current = true;

      try {
        const rawData = JSON.parse(decodedText);

        if (rawData.type !== "CASH_PAYMENT") {
          toast.error("Invalid QR code - not a cash payment");
          return false;
        }

        // Normalize data (handle legacy and new formats)
        let data: QRData;

        if (rawData.paidBy && rawData.students) {
          // New multi-student format
          data = rawData as QRData;
        } else if (rawData.studentId) {
          // Legacy single-student format
          data = {
            type: rawData.type,
            organizationId: rawData.organizationId || null,
            paidBy: rawData.studentId,
            paidByName: rawData.studentName,
            paidByRegNumber: rawData.studentRegNumber,
            students: [
              {
                id: rawData.studentId,
                name: rawData.studentName,
                regNumber: rawData.studentRegNumber,
              },
            ],
            totalStudents: 1,
            paymentTypeId: rawData.paymentTypeId,
            paymentTypeName: rawData.paymentTypeName,
            totalAmount: rawData.amount,
            amountPerStudent: rawData.amount,
            timestamp: rawData.timestamp,
            paymentMethod: rawData.paymentMethod,
          };
        } else {
          toast.error("Invalid QR code structure");
          return false;
        }

        // Check expiry (24 hours)
        const qrAge = Date.now() - data.timestamp;
        if (qrAge > 24 * 60 * 60 * 1000) {
          toast.error("QR code has expired. Please generate a new one.");
          return false;
        }

        // Verify QR belongs to this organization
        const scope = getOrgScope();
        if (scope && data.organizationId && data.organizationId !== scope.orgId) {
          toast.error("This QR code belongs to a different organization");
          return false;
        }

        // Verify payer exists
        let payerQ = supabase
          .from("organization_members")
          .select("id, full_name, reg_number")
          .eq("id", data.paidBy);
        if (scope) payerQ = payerQ.eq('organization_id', scope.orgId);
        const { data: payerData, error: payerError } = await payerQ;

        if (payerError || !payerData) {
          toast.error("Payer not found in system");
          return false;
        }

        // Verify payment type exists
        let ptQ = supabase
          .from("payment_types")
          .select("id, title, amount")
          .eq("id", data.paymentTypeId);
        if (scope) ptQ = ptQ.eq('organization_id', scope.orgId);
        const { data: paymentTypeData, error: paymentTypeError } = await ptQ
          .single();

        if (paymentTypeError || !paymentTypeData) {
          toast.error("Payment type not found");
          return false;
        }

        // Check for already paid students
        const alreadyPaidStudents: string[] = [];
        for (const stu of data.students) {
          const { data: existingPayments } = await supabase
            .from("payments")
            .select("status, amount")
            .eq("member_id", stu.id)
            .eq("payment_type_id", data.paymentTypeId);

          const totalPaid =
            existingPayments
              ?.filter((p) => p.status === "approved")
              .reduce((sum, p) => sum + p.amount, 0) || 0;

          if (totalPaid >= paymentTypeData.amount) {
            alreadyPaidStudents.push(stu.name);
          }
        }

        if (alreadyPaidStudents.length === data.students.length) {
          toast.error("All students have already paid for this");
          return false;
        }

        if (alreadyPaidStudents.length > 0) {
          toast.error(`Note: ${alreadyPaidStudents.join(", ")} already paid`);
        }

        // Stop scanner and show confirmation
        await stopScanner();
        
        // Play success sound
        try {
          const audio = new Audio("/sounds/notification.mp3");
          audio.volume = 0.5;
          audio.play().catch(() => {});
        } catch {
          // Ignore audio errors
        }
        
        // Vibrate on mobile (success pattern)
        if (navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }

        setQrData(data);
        setStudent(payerData[0]);
        setPaymentType(paymentTypeData);
        setMode("confirm");
        setScanCount((c) => c + 1);

        toast.success(`Found: ${data.paidByName}`);

        return true;
      } catch (error) {
        console.error("QR processing error:", error);
        toast.error("Invalid QR code data");
        return false;
      } finally {
        setTimeout(() => {
          processingRef.current = false;
        }, 1000);
      }
    },
    [toast, stopScanner]
  );

  // Start scanner
  const startScanner = useCallback(
    async (cameraId?: string) => {
      if (!mountedRef.current || mode !== "scan") return;

      setCameraLoading(true);
      setCameraError(null);

      // Wait for container to be ready (increased time for slower devices)
      await new Promise((r) => setTimeout(r, 800));

      const container = document.getElementById(SCANNER_CONTAINER_ID);
      if (!container) {
        setCameraError("Scanner container not ready. Please refresh.");
        setCameraLoading(false);
        return;
      }

      try {
        // Get available cameras
        let deviceList: { id: string; label: string }[] = [];
        try {
          const cameraDevices = await Html5Qrcode.getCameras();
          deviceList = cameraDevices.map((d) => ({
            id: d.id,
            label: d.label || `Camera ${d.id.slice(0, 6)}`,
          }));
          setCameras(deviceList);
        } catch {
          if (isIOS()) {
            deviceList = [{ id: "environment", label: "Back Camera" }];
            setCameras(deviceList);
          } else {
            throw new Error("Could not access cameras");
          }
        }

        if (deviceList.length === 0) {
          setCameraError("No cameras found");
          setCameraLoading(false);
          return;
        }

        // Stop existing scanner
        await stopScanner();

        // Create new scanner
        scannerRef.current = new Html5Qrcode(SCANNER_CONTAINER_ID);

        const cameraToUse = cameraId || selectedCamera || deviceList[0].id;
        setSelectedCamera(cameraToUse);

        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        };

        const cameraConfig = isIOS()
          ? { facingMode: "environment" }
          : cameraToUse;

        await scannerRef.current.start(
          cameraConfig,
          config,
          async (decodedText) => {
            const success = await processQRData(decodedText);
            if (!success && mountedRef.current && mode === "scan") {
              // Restart scanner for next attempt
              await new Promise((r) => setTimeout(r, 1500));
              if (mountedRef.current && mode === "scan") {
                startScanner(cameraToUse);
              }
            }
          },
          () => {} // Ignore scan errors
        );

        if (mountedRef.current) {
          setCameraLoading(false);
        }
      } catch (error: unknown) {
        console.error("Camera error:", error);

        if (!mountedRef.current) return;

        setCameraLoading(false);

        let errorMsg = "Could not access camera";

        if (error instanceof Error) {
          const msg = error.message.toLowerCase();

          if (msg.includes("permission") || msg.includes("denied") || msg.includes("notallowed")) {
            errorMsg = isIOS()
              ? "Camera access denied. Go to Settings > Safari > Camera to allow."
              : "Camera permission denied. Allow camera access in browser settings.";
          } else if (msg.includes("notfound") || msg.includes("no camera")) {
            errorMsg = "No camera found on this device";
          } else if (msg.includes("notreadable") || msg.includes("in use")) {
            errorMsg = "Camera is being used by another app. Close other apps and try again.";
          } else if (msg.includes("overconstrained")) {
            errorMsg = "Camera resolution not supported. Try a different camera.";
          } else {
            errorMsg = `Camera error: ${error.message}`;
          }
        }

        setCameraError(errorMsg);
      }
    },
    [mode, selectedCamera, processQRData, stopScanner]
  );

  // Switch camera
  const switchCamera = async (newCameraId: string) => {
    setSelectedCamera(newCameraId);
    await stopScanner();
    await new Promise((r) => setTimeout(r, 300));
    await startScanner(newCameraId);
  };

  // Handle page visibility changes - stop camera when page is hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.debug("Page hidden - stopping camera");
        stopScanner();
      }
    };

    const handleBeforeUnload = () => {
      console.debug("Page unloading - stopping camera");
      stopScanner();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handleBeforeUnload);
    };
  }, [stopScanner]);

  // Stop camera when navigating away
  useEffect(() => {
    return () => {
      console.debug("Route changed - stopping camera");
      stopScanner();
    };
  }, [location.pathname, stopScanner]);

  // Initialize scanner when mode is "scan"
  useEffect(() => {
    mountedRef.current = true;

    if (mode === "scan") {
      const timeout = setTimeout(() => {
        startScanner();
      }, 800);

      return () => {
        clearTimeout(timeout);
        stopScanner();
      };
    } else {
      // When not in scan mode, ensure camera is stopped
      stopScanner();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [mode, startScanner, stopScanner]);

  // Cleanup on unmount - comprehensive cleanup
  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      console.debug("Component unmounting - full cleanup");
      mountedRef.current = false;
      stopScanner();
      
      // Extra safety: force stop all video tracks after a delay
      setTimeout(() => {
        document.querySelectorAll("video").forEach((video) => {
          if (video.srcObject instanceof MediaStream) {
            video.srcObject.getTracks().forEach((track) => track.stop());
            video.srcObject = null;
          }
        });
      }, 100);
    };
  }, [stopScanner]);

  // Confirm payment
  const handleConfirmPayment = async () => {
    if (!qrData || !user || !student || !paymentType) return;

    setConfirming(true);
    try {
      const baseTimestamp = Date.now();
      const successfulPayments: string[] = [];

      for (let i = 0; i < qrData.students.length; i++) {
        const studentToPay = qrData.students[i];

        // Check if already paid
        const { data: existingPayments } = await supabase
          .from("payments")
          .select("status, amount")
          .eq("member_id", studentToPay.id)
          .eq("payment_type_id", qrData.paymentTypeId);

        const totalPaid =
          existingPayments
            ?.filter((p) => p.status === "approved")
            .reduce((sum, p) => sum + p.amount, 0) || 0;

        if (totalPaid >= paymentType.amount) {
          continue; // Skip already paid
        }

        const transactionRef = `CASH-${studentToPay.regNumber}-${baseTimestamp}-${i}`;

        // Insert payment (use per-student outstanding if available)
        const amountToInsert = (studentToPay as any).outstanding ?? qrData.amountPerStudent ?? paymentType.amount;
        const scope = getOrgScope();
        const payInsert: Record<string, unknown> = {
          member_id: studentToPay.id,
          payment_type_id: qrData.paymentTypeId,
          amount: amountToInsert,
          payment_method: "cash",
          transaction_ref: transactionRef,
          status: "approved",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          notes:
            qrData.totalStudents > 1
              ? `Cash payment (paid by ${qrData.paidByName}) via QR scan`
              : `Cash payment via QR scan`,
          paid_by: studentToPay.id !== qrData.paidBy ? qrData.paidBy : null,
          receipt_url: "",
        };
        if (scope) payInsert.organization_id = scope.orgId;
        const { error: insertError } = await supabase.from("payments").insert(payInsert);

        if (insertError) {
          console.error("Payment insert error:", insertError);
          continue;
        }

        successfulPayments.push(studentToPay.name);

        // Send notification
        await supabase.from("notifications").insert({
          member_id: studentToPay.id,
          ...(scope ? { organization_id: scope.orgId } : {}),
          type: "payment_approved",
          title: `Cash Payment Received - ${qrData.paymentTypeName}`,
          message:
            qrData.totalStudents > 1
              ? `Your cash payment of ${formatCurrency(amountToInsert)} has been received.\nPaid by: ${qrData.paidByName}`
              : `Your cash payment of ${formatCurrency(amountToInsert)} has been received.`,
          link: "/payments",
        });
      }

      if (successfulPayments.length > 0) {
        toast.success(
          successfulPayments.length === 1
            ? `Payment confirmed for ${successfulPayments[0]}!`
            : `Payment confirmed for ${successfulPayments.length} students!`
        );
      }

      // Reset and go back to scanning
      setTimeout(() => {
        if (mountedRef.current) {
          setQrData(null);
          setStudent(null);
          setPaymentType(null);
          setMode("scan");
        }
      }, 2000);
    } catch (error) {
      console.error("Confirm payment error:", error);
      toast.error("Failed to confirm payment");
    } finally {
      setConfirming(false);
    }
  };

  // Cancel and go back to scanning
  const handleCancel = () => {
    setQrData(null);
    setStudent(null);
    setPaymentType(null);
    setPaymentCode("");
    setMode("scan");
  };

  // Handle manual payment code
  const handleManualSubmit = async () => {
    if (!paymentCode.trim()) return;

    setProcessingManual(true);
    try {
      const code = paymentCode.trim().toUpperCase();
      const parts = code.split("-");

      if (parts.length < 3) {
        toast.error("Invalid code format. Expected: ABC-DEF-1234");
        return;
      }

      const [studentPart, paymentPart] = parts;

      // Find member
      const scope = getOrgScope();
      let memQ = supabase
        .from("organization_members")
        .select("id, full_name, member_id");
      if (scope) memQ = memQ.eq('organization_id', scope.orgId);
      const { data: allStudents } = await memQ;

      const matchingStudent = allStudents?.find(
        (s) =>
          s.id.replace(/-/g, "").slice(0, 3).toUpperCase() === studentPart
      );

      if (!matchingStudent) {
        toast.error("Student not found");
        return;
      }

      // Find payment type
      let ptManQ = supabase
        .from("payment_types")
        .select("id, title, amount")
        .eq("is_active", true);
      if (scope) ptManQ = ptManQ.eq('organization_id', scope.orgId);
      const { data: allPaymentTypes } = await ptManQ;

      const matchingPaymentType = allPaymentTypes?.find(
        (pt) =>
          pt.id.replace(/-/g, "").slice(-3).toUpperCase() === paymentPart
      );

      if (!matchingPaymentType) {
        toast.error("Payment type not found");
        return;
      }

      // Compute outstanding (including late fees) for this student
      try {
        let fullPTQ = supabase
          .from('payment_types')
          .select('id, title, amount, deadline, late_fee_per_day')
          .eq('id', matchingPaymentType.id);
        if (scope) fullPTQ = fullPTQ.eq('organization_id', scope.orgId);
        const { data: fullPT } = await fullPTQ.single();

        let pmtDataQ = supabase
          .from('payments')
          .select('member_id, amount, status, transaction_ref')
          .eq('payment_type_id', matchingPaymentType.id)
          .eq('member_id', matchingStudent.id);
        if (scope) pmtDataQ = pmtDataQ.eq('organization_id', scope.orgId);
        const { data: paymentsData } = await pmtDataQ;

        const paidForType = (paymentsData || [])
          .filter((p: any) => p.status === 'approved' && !p.transaction_ref?.startsWith('WAIVED-'))
          .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

        const now = new Date();
        const deadlineDate = fullPT?.deadline ? new Date(fullPT.deadline) : null;
        const perDay = Number(fullPT?.late_fee_per_day || 0);
        let accumulated = 0;
        try {
          if (deadlineDate && now > deadlineDate && perDay > 0) {
            // Check how much was paid before deadline
            const paidBeforeDeadline = (paymentsData || [])
              .filter((p: any) => p.status === 'approved' && !p.transaction_ref?.startsWith('WAIVED-'))
              .reduce((sum: number, p: any) => {
                const submittedAt = p.submitted_at ? new Date(p.submitted_at) : (p.created_at ? new Date(p.created_at) : null);
                if (submittedAt && deadlineDate && submittedAt.getTime() <= deadlineDate.getTime()) {
                  return sum + Number(p.amount || 0);
                }
                return sum;
              }, 0);
            const remainingAtDeadline = Math.max(0, (fullPT?.amount || matchingPaymentType.amount) - paidBeforeDeadline);
            // Only apply late fees if student still owed at deadline
            if (remainingAtDeadline > 0) {
              const daysOverdue = Math.floor((now.getTime() - deadlineDate.getTime()) / (1000 * 60 * 60 * 24));
              if (daysOverdue > 0) accumulated = daysOverdue * perDay;
            }
          }
        // eslint-disable-next-line no-empty
        } catch (e) {}

        const baseOutstanding = Math.max(0, (fullPT?.amount || matchingPaymentType.amount) - paidForType);
        const outstanding = baseOutstanding + accumulated;

        // Create QR data structure including outstanding per-student
        const data: QRData = {
          type: "CASH_PAYMENT",
          paidBy: matchingStudent.id,
          paidByName: matchingStudent.full_name,
          paidByRegNumber: matchingStudent.member_id,
          students: [
            {
              id: matchingStudent.id,
              name: matchingStudent.full_name,
              regNumber: matchingStudent.member_id,
              outstanding,
            } as any,
          ],
          totalStudents: 1,
          paymentTypeId: matchingPaymentType.id,
          paymentTypeName: matchingPaymentType.title,
          totalAmount: outstanding,
          amountPerStudent: matchingPaymentType.amount,
          timestamp: Date.now(),
          paymentMethod: "cash",
        };

        setQrData(data);
        setStudent({ ...matchingStudent, reg_number: matchingStudent.member_id } as any);
        setPaymentType(matchingPaymentType);
        setMode("confirm");
      } catch (err) {
        console.error('Failed to compute outstanding for manual QR (new):', err);
        // fallback to simple payload
        const data: QRData = {
          type: "CASH_PAYMENT",
          paidBy: matchingStudent.id,
          paidByName: matchingStudent.full_name,
          paidByRegNumber: matchingStudent.member_id,
          students: [
            {
              id: matchingStudent.id,
              name: matchingStudent.full_name,
              regNumber: matchingStudent.member_id,
            },
          ],
          totalStudents: 1,
          paymentTypeId: matchingPaymentType.id,
          paymentTypeName: matchingPaymentType.title,
          totalAmount: matchingPaymentType.amount,
          amountPerStudent: matchingPaymentType.amount,
          timestamp: Date.now(),
          paymentMethod: "cash",
        };

        setQrData(data);
        setStudent({ ...matchingStudent, reg_number: matchingStudent.member_id } as any);
        setPaymentType(matchingPaymentType);
        setMode("confirm");
      }
    } catch (error) {
      console.error("Manual lookup error:", error);
      toast.error("Failed to look up payment code");
    } finally {
      setProcessingManual(false);
    }
  };

  // Safe navigation - stop camera before navigating
  const handleNavigateBack = async () => {
    await stopScanner();
    navigate("/admin/dashboard");
  };

  return (
    <div
      className="min-h-screen py-6 px-4"
      style={{
        background: "radial-gradient(ellipse at top, #1A0E09 0%, #0F0703 100%)",
      }}
    >
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <GlassCard>
            <div className="flex items-center gap-4">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleNavigateBack}
                className="p-2 rounded-lg"
                style={{ background: "rgba(255, 255, 255, 0.05)" }}
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </motion.button>

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold"
                    style={{
                      background: `${colors.accentMint}20`,
                      border: `1px solid ${colors.accentMint}40`,
                      color: colors.accentMint,
                    }}
                  >
                    <Shield className="w-3 h-3" />
                    CASH VERIFICATION
                  </div>
                  {scanCount > 0 && (
                    <div
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold"
                      style={{
                        background: `${colors.statusPaid}20`,
                        border: `1px solid ${colors.statusPaid}40`,
                        color: colors.statusPaid,
                      }}
                    >
                      <Zap className="w-3 h-3" />
                      {scanCount} scanned
                    </div>
                  )}
                </div>
                <h1 className="text-2xl font-bold text-white">Scan QR Code</h1>
                <p style={{ color: colors.textSecondary }} className="text-sm">
                  Verify cash payments by scanning student QR codes
                </p>
              </div>
            </div>

            {/* Mode Toggle */}
            {mode !== "confirm" && (
              <div className="flex gap-2 mt-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setMode("scan")}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all"
                  style={{
                    background:
                      mode === "scan"
                        ? `${colors.statusPaid}20`
                        : "rgba(255, 255, 255, 0.05)",
                    border: `1px solid ${mode === "scan" ? colors.statusPaid + "40" : "rgba(255, 255, 255, 0.1)"}`,
                    color: mode === "scan" ? colors.statusPaid : colors.textSecondary,
                  }}
                >
                  <Camera className="w-4 h-4" />
                  Camera
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={async () => {
                    await stopScanner();
                    setMode("manual");
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all"
                  style={{
                    background:
                      mode === "manual"
                        ? `${colors.accentMint}20`
                        : "rgba(255, 255, 255, 0.05)",
                    border: `1px solid ${mode === "manual" ? colors.accentMint + "40" : "rgba(255, 255, 255, 0.1)"}`,
                    color:
                      mode === "manual" ? colors.accentMint : colors.textSecondary,
                  }}
                >
                  <Keyboard className="w-4 h-4" />
                  Manual
                </motion.button>
              </div>
            )}
          </GlassCard>
        </motion.div>

        <AnimatePresence mode="wait">
          {/* Scanner Mode */}
          {mode === "scan" && (
            <motion.div
              key="scanner"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <GlassCard>
                {/* Camera selector */}
                {cameras.length > 1 && !cameraError && (
                  <div className="mb-4">
                    <select
                      value={selectedCamera}
                      onChange={(e) => switchCamera(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg text-sm"
                      style={{
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        color: "white",
                      }}
                    >
                      {cameras.map((cam) => (
                        <option
                          key={cam.id}
                          value={cam.id}
                          style={{ background: "#1a1a1a" }}
                        >
                          {cam.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Scanner container */}
                <div
                  className="relative rounded-xl overflow-hidden"
                  style={{
                    background: "rgba(0, 0, 0, 0.3)",
                    minHeight: "300px",
                  }}
                >
                  <div
                    id={SCANNER_CONTAINER_ID}
                    className="w-full"
                    style={{ minHeight: "300px" }}
                  />

                  {/* Loading overlay */}
                  {cameraLoading && !cameraError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80">
                      <Loader2
                        className="w-10 h-10 animate-spin"
                        style={{ color: colors.primary }}
                      />
                      <p className="text-white">Initializing camera...</p>
                    </div>
                  )}

                  {/* Error overlay */}
                  {cameraError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/90 p-6 text-center">
                      <CameraOff
                        className="w-12 h-12"
                        style={{ color: colors.statusUnpaid }}
                      />
                      <p className="text-white">{cameraError}</p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => startScanner()}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg"
                          style={{
                            background: `${colors.primary}20`,
                            border: `1px solid ${colors.primary}40`,
                            color: colors.primary,
                          }}
                        >
                          <RefreshCw className="w-4 h-4" />
                          Retry
                        </button>
                        <button
                          onClick={async () => {
                            await stopScanner();
                            setMode("manual");
                          }}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg"
                          style={{
                            background: `${colors.accentMint}20`,
                            border: `1px solid ${colors.accentMint}40`,
                            color: colors.accentMint,
                          }}
                        >
                          <Keyboard className="w-4 h-4" />
                          Manual Input
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Scan frame overlay */}
                  {!cameraLoading && !cameraError && (
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[250px] h-[250px]">
                        <div
                          className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 rounded-tl-lg"
                          style={{ borderColor: colors.primary }}
                        />
                        <div
                          className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 rounded-tr-lg"
                          style={{ borderColor: colors.primary }}
                        />
                        <div
                          className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 rounded-bl-lg"
                          style={{ borderColor: colors.primary }}
                        />
                        <div
                          className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 rounded-br-lg"
                          style={{ borderColor: colors.primary }}
                        />
                      </div>

                      <motion.div
                        className="absolute left-1/2 -translate-x-1/2 w-[230px] h-0.5"
                        style={{
                          background: `linear-gradient(90deg, transparent, ${colors.primary}, transparent)`,
                          boxShadow: `0 0 10px ${colors.primary}`,
                        }}
                        initial={{ top: "calc(50% - 120px)" }}
                        animate={{ top: "calc(50% + 120px)" }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          repeatType: "reverse",
                          ease: "easeInOut",
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Tips */}
                <div
                  className="mt-4 p-4 rounded-xl"
                  style={{
                    background: `${colors.primary}10`,
                    border: `1px solid ${colors.primary}20`,
                  }}
                >
                  <div className="flex items-start gap-3">
                    <ScanLine
                      className="w-5 h-5 mt-0.5"
                      style={{ color: colors.primary }}
                    />
                    <div>
                      <p className="font-medium text-white text-sm">
                        Scanning Tips
                      </p>
                      <ul
                        className="text-xs mt-1 space-y-1"
                        style={{ color: colors.textSecondary }}
                      >
                        <li>• Ensure good lighting</li>
                        <li>• Hold phone steady, 6-12 inches away</li>
                        <li>• Keep QR code flat and centered</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* Manual Input Mode */}
          {mode === "manual" && (
            <motion.div
              key="manual"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <GlassCard>
                <div className="text-center mb-6">
                  <div
                    className="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4"
                    style={{ background: `${colors.accentMint}20` }}
                  >
                    <Keyboard
                      className="w-8 h-8"
                      style={{ color: colors.accentMint }}
                    />
                  </div>
                  <h2 className="text-xl font-bold text-white mb-2">
                    Enter Payment Code
                  </h2>
                  <p className="text-sm" style={{ color: colors.textSecondary }}>
                    Students can find their payment code below their QR code
                  </p>
                </div>

                <div className="space-y-4">
                  <input
                    type="text"
                    value={paymentCode}
                    onChange={(e) => setPaymentCode(e.target.value.toUpperCase())}
                    placeholder="ABC-DEF-1234"
                    className="w-full px-4 py-3 rounded-xl text-center text-lg font-mono tracking-wider"
                    style={{
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      color: "white",
                    }}
                  />

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleManualSubmit}
                    disabled={processingManual || !paymentCode.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium"
                    style={{
                      background: gradients.primary,
                      opacity:
                        processingManual || !paymentCode.trim() ? 0.5 : 1,
                    }}
                  >
                    {processingManual ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Looking up...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        Verify Code
                      </>
                    )}
                  </motion.button>
                </div>

                <div
                  className="mt-6 p-4 rounded-xl"
                  style={{
                    background: `${colors.warning}10`,
                    border: `1px solid ${colors.warning}20`,
                  }}
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle
                      className="w-5 h-5 mt-0.5"
                      style={{ color: colors.warning }}
                    />
                    <div>
                      <p
                        className="font-medium text-sm"
                        style={{ color: colors.warning }}
                      >
                        Code Format
                      </p>
                      <p
                        className="text-xs mt-1"
                        style={{ color: colors.textSecondary }}
                      >
                        Single payment: ABC-DEF-1234
                        <br />
                        Multi-pay: MP-XXX-P123-456.789
                      </p>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* Confirmation Mode */}
          {mode === "confirm" && qrData && student && paymentType && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <GlassCard>
                <div className="text-center mb-6">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 10 }}
                    className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4"
                    style={{
                      background: `linear-gradient(135deg, ${colors.statusPaid}30, ${colors.statusPaid}10)`,
                    }}
                  >
                    <CheckCircle2
                      className="w-10 h-10"
                      style={{ color: colors.statusPaid }}
                    />
                  </motion.div>
                  <h2 className="text-2xl font-bold text-white mb-2">
                    Confirm Payment
                  </h2>
                  <p style={{ color: colors.textSecondary }}>
                    Review the details below
                  </p>
                </div>

                {/* Payer Info */}
                <div
                  className="p-4 rounded-xl mb-4"
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center"
                      style={{ background: `${colors.primary}20` }}
                    >
                      <User
                        className="w-6 h-6"
                        style={{ color: colors.primary }}
                      />
                    </div>
                    <div>
                      <p
                        className="text-xs"
                        style={{ color: colors.textSecondary }}
                      >
                        Paid by
                      </p>
                      <p className="text-white font-medium">
                        {qrData.paidByName}
                      </p>
                      <p
                        className="text-sm"
                        style={{ color: colors.textSecondary }}
                      >
                        {qrData.paidByRegNumber}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Students being paid for */}
                {qrData.totalStudents > 1 && (
                  <div
                    className="p-4 rounded-xl mb-4"
                    style={{
                      background: `${colors.accentMint}10`,
                      border: `1px solid ${colors.accentMint}20`,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <Users
                        className="w-5 h-5"
                        style={{ color: colors.accentMint }}
                      />
                      <span className="font-medium text-white">
                        Paying for {qrData.totalStudents} students
                      </span>
                    </div>
                    <div className="space-y-2">
                      {qrData.students.map((stu, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-white">{stu.name}</span>
                          <span style={{ color: colors.textSecondary }}>
                            {stu.regNumber}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Payment Details */}
                <div
                  className="p-4 rounded-xl mb-6"
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                  }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center"
                      style={{ background: `${colors.accentMint}20` }}
                    >
                      <DollarSign
                        className="w-6 h-6"
                        style={{ color: colors.accentMint }}
                      />
                    </div>
                    <div>
                      <p
                        className="text-xs"
                        style={{ color: colors.textSecondary }}
                      >
                        Payment Type
                      </p>
                      <p className="text-white font-medium">
                        {qrData.paymentTypeName}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t border-white/10">
                    <span
                      className="text-lg font-medium"
                      style={{ color: colors.textSecondary }}
                    >
                      Total Amount
                    </span>
                    <span
                      className="text-2xl font-bold"
                      style={{ color: colors.statusPaid }}
                    >
                      {formatCurrency(qrData.totalAmount)}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleCancel}
                    disabled={confirming}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium"
                    style={{
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      color: colors.textPrimary,
                    }}
                  >
                    <X className="w-5 h-5" />
                    Cancel
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleConfirmPayment}
                    disabled={confirming}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium text-white"
                    style={{
                      background: gradients.primary,
                      opacity: confirming ? 0.7 : 1,
                    }}
                  >
                    {confirming ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        Confirm Payment
                      </>
                    )}
                  </motion.button>
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
