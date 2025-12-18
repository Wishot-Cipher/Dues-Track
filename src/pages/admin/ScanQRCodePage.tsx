/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState, useEffect, useRef, useCallback } from "react";
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
  RefreshCw,
  Keyboard,
  CameraOff,
} from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
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

// Detect iOS
const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

// Detect if secure context (HTTPS)
const isSecureContext = () => {
  return window.isSecureContext || 
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1';
};

export default function ScanQRCodePage() {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const toast = useToast();

  const [scanning, setScanning] = useState(true);
  const [qrData, setQrData] = useState<QRData | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [student, setStudent] = useState<Student | null>(null);
  const [paymentType, setPaymentType] = useState<PaymentType | null>(null);
  
  // Camera state
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraLoading, setCameraLoading] = useState(true);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>("");
  
  // Manual input state
  const [showManualInput, setShowManualInput] = useState(false);
  const [processingManual, setProcessingManual] = useState(false);
  
  // Payment code input state
  const [paymentCodeInput, setPaymentCodeInput] = useState("");
  
  // Critical refs for preventing race conditions
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const mountedRef = useRef(true);
  const scannerInitializedRef = useRef(false);
  const isStoppingRef = useRef(false);
  const startScannerRef = useRef<((cameraId?: string) => Promise<void>) | null>(null);
  const scannerContainerId = "qr-reader-container";

  // Simple async mutex to serialize scanner operations
  const scannerMutexRef = useRef(false);
  const withScannerLock = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    while (scannerMutexRef.current) {
      await new Promise((r) => setTimeout(r, 50));
    }
    scannerMutexRef.current = true;
    try {
      return await fn();
    } finally {
      scannerMutexRef.current = false;
    }
  }, []);

  // Ensure the scanner container exists in the DOM
  const ensureScannerContainer = async () => {
    const maxAttempts = 8;
    let attempts = 0;
    while (attempts < maxAttempts) {
      const el = document.getElementById(scannerContainerId);
      if (el && (el as HTMLElement).clientWidth > 0 && (el as HTMLElement).isConnected && (el as HTMLElement).offsetParent !== null) {
        return el as HTMLElement;
      }
      attempts += 1;
      await new Promise((r) => setTimeout(r, 100));
    }
    const final = document.getElementById(scannerContainerId) as HTMLElement | null;
    if (final && final.clientWidth > 0 && final.isConnected) return final;
    return null;
  };

  // Diagnostic logs
  const [scannerLogs, setScannerLogs] = useState<string[]>([]);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);

  const pushScannerError = useCallback((msg: string) => {
    const entry = `${new Date().toISOString()} - ${String(msg)}`;
    console.warn("Scanner diagnostic:", entry);
    setScannerLogs((prev) => [entry, ...prev].slice(0, 200));
  }, []);

  const copyDiagnostics = useCallback(async () => {
    try {
      const container = document.getElementById(scannerContainerId);
      let state = 'no-instance';
      try {
        const inst = html5QrCodeRef.current;
        state = inst ? String(inst.getState()) : 'null';
      } catch (e) {
        state = 'unknown';
      }

      const diag = {
        timestamp: new Date().toISOString(),
        mounted: Boolean(mountedRef.current),
        scannerInitialized: Boolean(scannerInitializedRef.current),
        html5QrCodeInstance: html5QrCodeRef.current ? 'present' : 'null',
        html5QrCodeState: state,
        selectedCamera,
        cameras,
        cameraLoading,
        cameraError,
        containerPresent: Boolean(container && container.isConnected && container.clientWidth > 0),
        logs: scannerLogs.slice(0, 200),
      };

      const text = JSON.stringify(diag, null, 2);
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        toast.success('Diagnostics copied to clipboard');
      } else {
        // fallback: open in new window
        const w = window.open('', '_blank');
        if (w) { w.document.body.innerText = text; }
        toast.info('Diagnostics opened in a new tab (no clipboard)');
      }
    } catch (err) {
      console.error('Failed to copy diagnostics:', err);
      toast.error('Failed to copy diagnostics');
    }
  }, [scannerLogs, selectedCamera, cameras, cameraLoading, cameraError, toast]);

  const clearLogs = useCallback(() => setScannerLogs([]), []);

  // IMPROVED: Stop scanner safely with better DOM checks
  const stopScanner = useCallback(async () => {
    if (!html5QrCodeRef.current || isStoppingRef.current) return;

    // Early DOM presence check: if container is detached, avoid calling library methods
    const earlyContainerEl = document.getElementById(scannerContainerId);
    if (!earlyContainerEl || !earlyContainerEl.isConnected) {
      // Container removed: stop any orphaned video tracks and clear ref without calling library
      try {
        const videos = Array.from(document.querySelectorAll('video')) as HTMLVideoElement[];
        for (const v of videos) {
          try {
            const stream = v.srcObject as MediaStream | null;
            if (stream) stream.getTracks().forEach(t => { try { t.stop(); } catch { console.debug('stop track error'); } });
          } catch { console.debug('video srcObject read error'); }
          try { if (v.parentNode) v.parentNode.removeChild(v); } catch { console.debug('remove orphaned video error'); }
        }
      } catch (e) { console.debug('early forced video cleanup error', e); }
      html5QrCodeRef.current = null;
      pushScannerError('stopScanner: early container missing — cleared scanner ref');
      return;
    }

    isStoppingRef.current = true;

    try {
      await withScannerLock(async () => {
      try {
        const MAX_RETRIES = 3;
        
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            if (!html5QrCodeRef.current) break;
            
            const state = html5QrCodeRef.current.getState();
            
            // Only stop if actually scanning
            if (state === 2 || state === 1) {
              await html5QrCodeRef.current.stop();
            }
            
            // Try to clear UI
            try {
              html5QrCodeRef.current.clear();
            } catch (clearErr) {
              console.debug('Clear UI error (non-critical):', clearErr);
            }
            
            break;
          } catch (err: unknown) {
            const msg = (err instanceof Error && err.message) ? err.message : String(err);
            
            if (/transition|ongoing|busy|in use/i.test(msg) && attempt < MAX_RETRIES - 1) {
              await new Promise(r => setTimeout(r, 250 + attempt * 200));
              continue;
            }
            
            console.debug("Scanner stop error (non-critical):", err);
            pushScannerError(`stopScanner error: ${String(err)}`);
            break;
          }
        }
        
        // IMPROVED: Safe cleanup of DOM elements
        try {
          const containerEl = document.getElementById(scannerContainerId);
          
          if (!containerEl || !containerEl.isConnected) {
            // Container is gone or detached - just stop video tracks and clear ref
            const videos = Array.from(document.querySelectorAll('video')) as HTMLVideoElement[];
            for (const v of videos) {
              try {
                const stream = v.srcObject as MediaStream | null;
                if (stream) {
                  stream.getTracks().forEach(t => {
                    try {
                      t.stop();
                    } catch (e) {
                      console.debug('stop track error', e);
                    }
                  });
                }
                  } catch { console.debug('video srcObject read error'); }
              
              // IMPROVED: Only remove if parent exists and node is connected
              try {
                if (v.parentNode && v.isConnected && containerEl && containerEl.contains(v)) {
                  v.parentNode.removeChild(v);
                }
              } catch (e) {
                console.debug('remove video node error (non-critical)', e);
              }
            }
            
            html5QrCodeRef.current = null;
            pushScannerError('stopScanner: container missing — cleared scanner ref');
          } else {
            // Container exists - normal cleanup
            html5QrCodeRef.current = null;
          }
        } catch (outer) {
          console.debug('stopScanner cleanup error', outer);
          html5QrCodeRef.current = null;
        }
      } finally {
        isStoppingRef.current = false;
      }
    });
    } finally {
      isStoppingRef.current = false;
    }
  }, [pushScannerError, withScannerLock]);

  // Process QR code data
  const processQRData = useCallback(async (decodedText: string): Promise<boolean> => {
    if (!mountedRef.current) return false;
    
    try {
      const rawData = JSON.parse(decodedText);

      if (rawData.type !== "CASH_PAYMENT") {
        toast.error("Invalid QR code format - not a cash payment QR");
        return false;
      }

      let data: QRData;
      
      if (rawData.paidBy && rawData.students) {
        data = rawData as NewQRData;
      } else if (rawData.studentId) {
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
        return false;
      }

      const qrAge = Date.now() - data.timestamp;
      const maxAge = 24 * 60 * 60 * 1000;
      if (qrAge > maxAge) {
        toast.error("QR code has expired. Please generate a new one.");
        return false;
      }

      if (!data.students || data.students.length === 0) {
        toast.error("No students found in QR code");
        return false;
      }

      await stopScanner();

      const { data: payerData, error: payerError } = await supabase
        .from("students")
        .select("id, full_name, reg_number")
        .eq("id", data.paidBy)
        .single();

      if (payerError || !payerData) {
        toast.error("Payer not found in system");
        return false;
      }

      const { data: paymentTypeData, error: paymentTypeError } = await supabase
        .from("payment_types")
        .select("id, title, amount")
        .eq("id", data.paymentTypeId)
        .single();

      if (paymentTypeError || !paymentTypeData) {
        toast.error("Payment type not found");
        return false;
      }

      const alreadyPaidStudents: string[] = [];
      for (const stu of data.students) {
        const { data: existingPayments } = await supabase
          .from("payments")
          .select("status, amount")
          .eq("student_id", stu.id)
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
        toast.error("All students have already paid for this payment type");
        return false;
      }

      if (alreadyPaidStudents.length > 0) {
        toast.error(`Warning: ${alreadyPaidStudents.join(", ")} already paid`);
      }

      if (!mountedRef.current) return false;

      setQrData(data);
      setStudent(payerData);
      setPaymentType(paymentTypeData);
      setScanning(false);
      setShowManualInput(false);
      return true;
    } catch (error) {
      console.error("Error processing QR code:", error);
      toast.error("Invalid QR code data - could not parse");
      return false;
    }
  }, [toast, stopScanner]);

  // IMPROVED: Extracted retry function to avoid circular dependency
  const retryScanner = useCallback(async (cameraId?: string) => {
    if (!mountedRef.current) return;
    await new Promise(r => setTimeout(r, 1000));
    if (mountedRef.current && !isStoppingRef.current) {
      const startFn = startScannerRef.current;
      if (startFn) startFn(cameraId);
    }
  }, []);

  // Fallback scanner with minimal constraints
  const startScannerFallback = useCallback(async () => {
    if (!mountedRef.current) return;
    
    setCameraLoading(true);
    setCameraError(null);
    
    try {
      const container = await ensureScannerContainer();
      if (!container || !mountedRef.current) throw new Error('Scanner container not found');
      
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode(scannerContainerId);
      } else {
        await stopScanner();
      }

      const config = { fps: 5, qrbox: { width: 200, height: 200 } };
      
        await withScannerLock(async () => {
          const currentContainer = document.getElementById(scannerContainerId);
          if (!currentContainer || !currentContainer.isConnected) {
            throw new Error('Scanner container not available at start time');
          }

          let inst = html5QrCodeRef.current;
          if (!inst) {
            // Create a new instance if it was destroyed meanwhile
            pushScannerError('startScanner: creating new Html5Qrcode instance (was missing)');
            inst = new Html5Qrcode(scannerContainerId);
            html5QrCodeRef.current = inst;
          }

          return inst.start(
            { facingMode: 'environment' },
            config,
            async (decodedText) => {
              if (!mountedRef.current) return;
              await stopScanner();
              const success = await processQRData(decodedText);
              if (!success && mountedRef.current) {
                retryScanner();
              }
            },
            () => {}
          );
        });

      if (mountedRef.current) {
        setCameraLoading(false);
      }
    } catch (err) {
      console.error('Fallback scanner failed:', err);
      if (mountedRef.current) {
        setCameraError('Camera not available. Please use manual input instead.');
        pushScannerError(`fallback start error: ${String(err)}`);
        setCameraLoading(false);
      }
    }
  }, [processQRData, stopScanner, pushScannerError, withScannerLock, retryScanner]);

  // IMPROVED: Start scanner without circular dependency
  const SCANNER_START_TIMEOUT_MS = 10000;
  const startScanner = useCallback(async (cameraId?: string) => {
    if (!mountedRef.current || isStoppingRef.current) return;
    
    setCameraLoading(true);
    setCameraError(null);

    try {
      if (!isSecureContext()) {
        setCameraError("Camera access requires HTTPS. Please use a secure connection.");
        setCameraLoading(false);
        return;
      }

      let devices: { id: string; label: string }[] = [];
      
      try {
        const cameraDevices = await Html5Qrcode.getCameras();
        devices = cameraDevices.map(d => ({ id: d.id, label: d.label || `Camera ${d.id.slice(0, 8)}` }));
        setCameras(devices);
      } catch (err) {
        console.error("Error getting cameras:", err);
        if (isIOS()) {
          devices = [{ id: "environment", label: "Back Camera" }];
          setCameras(devices);
        } else {
          throw err;
        }
      }

      if (devices.length === 0) {
        setCameraError("No cameras found on this device");
        setCameraLoading(false);
        return;
      }

      const container = await ensureScannerContainer();
      if (!container || !mountedRef.current) {
        setCameraError('Scanner UI not initialized yet. Try again in a moment.');
        setCameraLoading(false);
        return;
      }

      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode(scannerContainerId);
      } else {
        await stopScanner();
      }

      const cameraToUse = cameraId || selectedCamera || devices[0].id;
      setSelectedCamera(cameraToUse);

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      };

      const cameraConfig = isIOS() 
        ? { facingMode: "environment" }
        : cameraToUse;

      let startTimeout: number | null = null;
      
      try {
        startTimeout = window.setTimeout(() => {
          if (mountedRef.current && cameraLoading) {
            console.warn('Scanner start timed out');
            setCameraLoading(false);
            setCameraError('Camera start timed out. Check camera permissions or try manual input.');
          }
        }, SCANNER_START_TIMEOUT_MS);

        await withScannerLock(async () => {
          const currentContainer = document.getElementById(scannerContainerId);
          if (!currentContainer || !currentContainer.isConnected) {
            throw new Error('Scanner container not available at start time');
          }

          let inst = html5QrCodeRef.current;
          if (!inst) {
            pushScannerError('startScanner: creating new Html5Qrcode instance (was missing)');
            inst = new Html5Qrcode(scannerContainerId);
            html5QrCodeRef.current = inst;
          }

          return inst.start(
            cameraConfig,
            config,
            async (decodedText) => {
              if (!mountedRef.current) return;
              await stopScanner();
              const success = await processQRData(decodedText);
              if (!success && mountedRef.current) {
                retryScanner(cameraToUse);
              }
            },
            () => {}
          );
        });

        if (startTimeout) {
          clearTimeout(startTimeout);
          startTimeout = null;
        }
        
        if (mountedRef.current) {
          setCameraLoading(false);
        }
      } catch (startErr) {
        console.error('Scanner start exception:', startErr);
        
        if (startTimeout) {
          clearTimeout(startTimeout);
        }
        
        if (!mountedRef.current) return;
        
        setCameraLoading(false);
        pushScannerError(`start scanner failed: ${String(startErr)}`);
        
        if (startErr instanceof Error && /permission|denied|notallowed/i.test(startErr.message)) {
          setCameraError(isIOS() ?
            "Camera access denied. On iOS:\n1. Go to Settings > Safari\n2. Scroll to 'Camera'\n3. Allow camera access\n4. Refresh this page" :
            "Camera permission denied. Please allow camera access in your browser settings and refresh.");
        } else {
          setCameraError('Failed to start camera. Please try manual input or refresh the page.');
        }
      }
    } catch (error: unknown) {
      console.error("Camera start error:", error);
      
      if (!mountedRef.current) return;
      
      setCameraLoading(false);
      
      let errorMsg = "Could not access camera";
      
      if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        
        if (msg.includes("permission") || msg.includes("denied") || msg.includes("notallowed")) {
          errorMsg = isIOS() ?
            "Camera access denied. On iOS:\n1. Go to Settings > Safari\n2. Scroll to 'Camera'\n3. Allow camera access\n4. Refresh this page" :
            "Camera permission denied. Please allow camera access in your browser settings and refresh.";
        } else if (msg.includes("notfound")) {
          errorMsg = "No camera found on this device";
        } else if (msg.includes("notreadable") || msg.includes("hardware")) {
          errorMsg = "Camera is being used by another app. Please close other apps using the camera and try again.";
        } else if (msg.includes("overconstrained")) {
          errorMsg = "Camera configuration not supported. Trying alternative settings...";
          setTimeout(() => startScannerFallback(), 500);
          return;
        } else if (msg.includes("https") || msg.includes("secure")) {
          errorMsg = "Camera requires HTTPS connection for security reasons.";
        } else {
          errorMsg = `Camera error: ${error.message}`;
        }
      }
      
      setCameraError(errorMsg);
      pushScannerError(`startScanner error: ${String(error)}`);
    }
  }, [selectedCamera, processQRData, stopScanner, startScannerFallback, pushScannerError, withScannerLock, retryScanner, cameraLoading]);

  // Keep a ref to the start function for safe retries (avoids globals)
  useEffect(() => {
    startScannerRef.current = startScanner;
    return () => { startScannerRef.current = null; };
  }, [startScanner]);

  // Keep logs visible
  useEffect(() => {
    if (scannerLogs.length > 0) {
      console.debug('scannerLogs (latest):', scannerLogs.slice(0, 5));
    }
  }, [scannerLogs]);

  // Request camera permission
  const requestCameraPermission = useCallback(async (): Promise<boolean> => {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setCameraError('Camera API not supported in this browser');
      return false;
    }
    
    setCameraLoading(true);
    setCameraError(null);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      try {
        stream.getTracks().forEach(t => {
          try {
            t.stop();
          } catch (e) {
            console.debug('stop track error', e);
          }
        });
      } catch (e) {
        console.debug('stop tracks error', e);
      }
      
      setCameraLoading(false);
      setCameraError(null);
      
      if (mountedRef.current) {
        try {
          await startScanner();
        } catch (e) {
          console.debug('startScanner after permission error', e);
        }
      }
      
      return true;
    } catch (err: unknown) {
      console.debug('requestCameraPermission failed', err);
      setCameraLoading(false);
      setCameraError(isIOS() ?
        "Camera access denied. On iOS:\n1. Go to Settings > Safari\n2. Scroll to 'Camera'\n3. Allow camera access\n4. Refresh this page" :
        "Camera permission denied. Please allow camera access in your browser settings and refresh.");
      pushScannerError(`permission request failed: ${String(err)}`);
      return false;
    }
  }, [startScanner, pushScannerError]);

  // IMPROVED: Initialize scanner on mount with better guards
  useEffect(() => {
    mountedRef.current = true;
    scannerInitializedRef.current = false;
    
    const initScanner = async () => {
      if (!scanning || showManualInput || !mountedRef.current || scannerInitializedRef.current) {
        return;
      }
      
      scannerInitializedRef.current = true;
      
      try {
        if (navigator.permissions && typeof navigator.permissions.query === 'function') {
          try {
            const perm = await navigator.permissions.query({ name: 'camera' as PermissionName });
            
            if (!mountedRef.current) return;
            
            if (perm.state === 'granted') {
              await startScanner();
            } else if (perm.state === 'prompt') {
              setCameraLoading(false);
              setCameraError(null);
            } else {
              setCameraLoading(false);
              setCameraError(isIOS() ?
                "Camera access denied. On iOS:\n1. Go to Settings > Safari\n2. Scroll to 'Camera'\n3. Allow camera access\n4. Refresh this page" :
                "Camera permission denied. Please allow camera access in your browser settings and refresh.");
            }
          } catch {
            if (mountedRef.current) {
              await startScanner();
            }
          }
        } else {
          if (mountedRef.current) {
            await startScanner();
          }
        }
      } catch (err) {
        console.debug('initScanner error', err);
      }
    };

    initScanner();

    return () => {
      // Ensure scanner stop starts first while DOM still present
      stopScanner();
      mountedRef.current = false;
      scannerInitializedRef.current = false;
    };
  }, [scanning, showManualInput, startScanner, stopScanner]);

  // Check permissions
  useEffect(() => {
    if (!hasPermission?.("can_approve_payments")) {
      toast.error("You are not authorized to access this page");
      navigate("/admin/dashboard");
    }
  }, [hasPermission, navigate, toast]);

  const handleConfirmPayment = async () => {
    if (!qrData || !user || !student || !paymentType) return;

    if (!hasPermission?.("can_approve_payments")) {
      toast.error("You don't have permission to confirm payments");
      return;
    }

    setConfirming(true);
    try {
      const baseTimestamp = Date.now();
      const successfulPayments: string[] = [];
      const failedPayments: string[] = [];

      for (let i = 0; i < qrData.students.length; i++) {
        const studentToPay = qrData.students[i];
        
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
          continue;
        }

        const transactionRef = `CASH-${studentToPay.regNumber}-${baseTimestamp}-${i}`;

        const paymentResponse = await supabase
          .from("payments")
          .insert({
            student_id: studentToPay.id,
            payment_type_id: qrData.paymentTypeId,
            amount: qrData.amountPerStudent,
            payment_method: "cash",
            transaction_ref: transactionRef,
            status: "approved",
            approved_by: user.id,
            approved_at: new Date().toISOString(),
            notes: qrData.totalStudents > 1 
              ? `Cash payment (paid by ${qrData.paidByName}) verified via QR code scan by ${user.email}`
              : `Cash payment verified via QR code scan by ${user.email}`,
            paid_by: studentToPay.id !== qrData.paidBy ? qrData.paidBy : null,
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

      setTimeout(() => {
        if (mountedRef.current) {
          setQrData(null);
          setStudent(null);
          setPaymentType(null);
          setScanning(true);
        }
      }, 2000);
    } catch (error: unknown) {
      console.error("Error confirming payment:", error);
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
    setShowManualInput(false);
    setPaymentCodeInput("");
  };

  // Handle multi-pay code lookup
  // Continuation of ScanQRCodePage.tsx

const handleMultiPayCode = async (codeInput: string) => {
  try {
    const withoutPrefix = codeInput.substring(3);
    const parts = withoutPrefix.split('-');
    
    if (parts.length < 2) {
      toast.error("Invalid multi-pay code format");
      setProcessingManual(false);
      return;
    }
    
    const paymentPart = parts[0];
    const payerPart = parts[1];
    
    if (!payerPart.startsWith('P')) {
      toast.error("Invalid code: Missing payer identifier");
      setProcessingManual(false);
      return;
    }
    
    const payerSuffix = payerPart.substring(1);
    const otherSuffixes = parts.length > 2 
      ? parts[2].split('.').filter(s => s.length > 0) 
      : [];

    const { data: allPaymentTypes, error: ptError } = await supabase
      .from("payment_types")
      .select("id, title, amount")
      .eq("is_active", true);

    if (ptError) throw ptError;

    const matchingPT = allPaymentTypes?.find(pt => 
      pt.id.replace(/-/g, '').slice(-3).toUpperCase() === paymentPart.toUpperCase()
    );

    if (!matchingPT) {
      toast.error("Payment type not found. The code may be invalid.");
      setProcessingManual(false);
      return;
    }

    const { data: allStudents, error: studentError } = await supabase
      .from("students")
      .select("id, full_name, reg_number");

    if (studentError) throw studentError;

    const findStudentBySuffix = (suffix: string) => {
      return allStudents?.find(stu => {
        const cleanedReg = stu.reg_number.replace(/[^A-Z0-9]/gi, '');
        return cleanedReg.slice(-3).toUpperCase() === suffix.toUpperCase();
      });
    };

    const payerStudent = findStudentBySuffix(payerSuffix);
    
    if (!payerStudent) {
      toast.error("Could not identify the payer. Invalid code.");
      setProcessingManual(false);
      return;
    }

    const otherStudents = otherSuffixes
      .map(suffix => findStudentBySuffix(suffix))
      .filter((s): s is NonNullable<typeof s> => s !== undefined);

    const allRecipients = otherStudents;
    
    if (allRecipients.length < otherSuffixes.length) {
      const missingCount = otherSuffixes.length - allRecipients.length;
      toast.warning(`${missingCount} recipient(s) could not be found. Proceeding with ${allRecipients.length} students.`);
    }
    
    if (allRecipients.length === 0) {
      toast.error("No valid recipients found in the code.");
      setProcessingManual(false);
      return;
    }

    const alreadyPaidStudents: string[] = [];
    const studentsToPay: Array<{ id: string; name: string; regNumber: string }> = [];

    for (const stu of allRecipients) {
      const { data: existingPayments } = await supabase
        .from("payments")
        .select("status, amount")
        .eq("student_id", stu.id)
        .eq("payment_type_id", matchingPT.id);

      const totalPaid = existingPayments
        ?.filter(p => p.status === "approved")
        .reduce((sum, p) => sum + (p.amount || 0), 0) || 0;

      if (totalPaid >= matchingPT.amount) {
        alreadyPaidStudents.push(stu.full_name);
      } else {
        studentsToPay.push({
          id: stu.id,
          name: stu.full_name,
          regNumber: stu.reg_number,
        });
      }
    }

    if (studentsToPay.length === 0) {
      toast.error(`All students have already paid for ${matchingPT.title}`);
      setProcessingManual(false);
      return;
    }

    if (alreadyPaidStudents.length > 0) {
      toast.warning(`${alreadyPaidStudents.join(", ")} already paid and will be skipped`);
    }

    const manualQrData: QRData = {
      type: "CASH_PAYMENT",
      paidBy: payerStudent.id,
      paidByName: payerStudent.full_name,
      paidByRegNumber: payerStudent.reg_number,
      students: studentsToPay,
      totalStudents: studentsToPay.length,
      paymentTypeId: matchingPT.id,
      paymentTypeName: matchingPT.title,
      totalAmount: matchingPT.amount * studentsToPay.length,
      amountPerStudent: matchingPT.amount,
      timestamp: Date.now(),
      paymentMethod: "cash",
    };

    setQrData(manualQrData);
    setStudent({
      id: payerStudent.id,
      full_name: payerStudent.full_name,
      reg_number: payerStudent.reg_number,
    });
    setPaymentType(matchingPT);
    setScanning(false);
    setShowManualInput(false);

    toast.success(`${payerStudent.full_name} paying for ${studentsToPay.length} student(s) - please confirm`);
  } catch (err) {
    console.error('Multi-pay code error:', err);
    toast.error('Failed to process multi-pay code. Please try again.');
    setProcessingManual(false);
  }
};

const formatPaymentCode = (input: string): string => {
  const value = input.toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  
  if (value.startsWith('MP')) {
    if (value.includes('-') && value.split('-').length >= 3) {
      return value;
    }
    
    const stripped = value.replace(/[^A-Z0-9]/g, '').substring(2);
    
    if (stripped.length <= 3) return `MP-${stripped}`;
    
    const paymentPart = stripped.slice(0, 3);
    const rest = stripped.slice(3);
    
    if (rest.length === 0) return `MP-${paymentPart}`;
    
    if (rest.startsWith('P')) {
      if (rest.length <= 4) return `MP-${paymentPart}-${rest}`;
      
      const payerPart = rest.slice(0, 4);
      const otherPart = rest.slice(4);
      
      if (otherPart.length === 0) return `MP-${paymentPart}-${payerPart}`;
      
      const otherSuffixes: string[] = [];
      for (let i = 0; i < otherPart.length; i += 3) {
        otherSuffixes.push(otherPart.slice(i, i + 3));
      }
      
      return `MP-${paymentPart}-${payerPart}-${otherSuffixes.join('.')}`;
    } else {
      if (rest.length <= 3) return `MP-${paymentPart}-P${rest}`;
      
      const payerPart = `P${rest.slice(0, 3)}`;
      const otherPart = rest.slice(3);
      
      if (otherPart.length === 0) return `MP-${paymentPart}-${payerPart}`;
      
      const otherSuffixes: string[] = [];
      for (let i = 0; i < otherPart.length; i += 3) {
        otherSuffixes.push(otherPart.slice(i, i + 3));
      }
      
      return `MP-${paymentPart}-${payerPart}-${otherSuffixes.join('.')}`;
    }
  }
  
  const stripped = value.replace(/[^A-Z0-9]/g, '');
  if (stripped.length <= 3) return stripped;
  if (stripped.length <= 6) return `${stripped.slice(0, 3)}-${stripped.slice(3)}`;
  return `${stripped.slice(0, 3)}-${stripped.slice(3, 6)}-${stripped.slice(6, 10)}`;
};

const handlePaymentCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const formatted = formatPaymentCode(e.target.value);
  setPaymentCodeInput(formatted);
};

const handlePaymentCodeSubmit = async () => {
  if (!paymentCodeInput.trim()) return;
  
  setProcessingManual(true);
  try {
    const codeInput = paymentCodeInput.trim().toUpperCase();
    
    if (codeInput.startsWith('MP-')) {
      await handleMultiPayCode(codeInput);
      return;
    }
    
    const codeParts = codeInput.split('-');
    
    if (codeParts.length !== 3) {
      toast.error("Invalid code format. Single: ABC-DEF-1234 | Multi: MP-XXX-P123-456");
      setProcessingManual(false);
      return;
    }

    const [studentPart, paymentPart] = codeParts;
    
    const { data: allStudents, error: studentError } = await supabase
      .from("students")
      .select("id, full_name, reg_number");

    if (studentError) throw studentError;

    const matchingStudents = allStudents?.filter(s => 
      s.id.replace(/-/g, '').slice(0, 3).toUpperCase() === studentPart
    ) || [];

    if (matchingStudents.length === 0) {
      toast.error("No student found matching this payment code. Please verify the code or ask student to regenerate.");
      setProcessingManual(false);
      return;
    }

    const { data: allPaymentTypes, error: ptError } = await supabase
      .from("payment_types")
      .select("id, title, amount")
      .eq("is_active", true);

    if (ptError) throw ptError;

    const matchingPT = allPaymentTypes?.find(pt => 
      pt.id.replace(/-/g, '').slice(-3).toUpperCase() === paymentPart
    );

    if (!matchingPT) {
      toast.error("Payment type not found. The code may be expired - ask student to regenerate QR code.");
      setProcessingManual(false);
      return;
    }

    const matchedStudent = matchingStudents[0];

    const { data: existingPayments } = await supabase
      .from("payments")
      .select("status, amount")
      .eq("student_id", matchedStudent.id)
      .eq("payment_type_id", matchingPT.id);

    const totalPaid = existingPayments
      ?.filter(p => p.status === "approved")
      .reduce((sum, p) => sum + (p.amount || 0), 0) || 0;

    if (totalPaid >= matchingPT.amount) {
      toast.error(`${matchedStudent.full_name} has already fully paid for ${matchingPT.title}`);
      setProcessingManual(false);
      return;
    }

    const manualQrData: QRData = {
      type: "CASH_PAYMENT",
      paidBy: matchedStudent.id,
      paidByName: matchedStudent.full_name,
      paidByRegNumber: matchedStudent.reg_number,
      students: [{
        id: matchedStudent.id,
        name: matchedStudent.full_name,
        regNumber: matchedStudent.reg_number,
      }],
      totalStudents: 1,
      paymentTypeId: matchingPT.id,
      paymentTypeName: matchingPT.title,
      totalAmount: matchingPT.amount,
      amountPerStudent: matchingPT.amount,
      timestamp: Date.now(),
      paymentMethod: "cash",
    };

    setQrData(manualQrData);
    setStudent(matchedStudent);
    setPaymentType(matchingPT);
    setScanning(false);
    setShowManualInput(false);

    toast.success(`Found payment for ${matchedStudent.full_name} - please confirm`);
  } catch (error) {
    console.error("Error looking up payment code:", error);
    toast.error("Failed to lookup payment code. Please try again.");
  } finally {
    setProcessingManual(false);
  }
};

const switchCamera = async (newCameraId: string) => {
  await stopScanner();
  setSelectedCamera(newCameraId);
  await startScanner(newCameraId);
};

// Continue with the JSX return statement from the original code...
// (The UI rendering part remains the same)

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
      </div>

      <div className="max-w-4xl mx-auto relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <GlassCard className="relative overflow-hidden">
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
                    Scan or paste QR code data to verify cash payments
                  </p>
                </div>
              </div>

              {/* Mode Toggle */}
              <div className="flex items-center justify-center gap-3 mt-6">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowManualInput(false)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all"
                  style={{ 
                    background: !showManualInput ? `${colors.statusPaid}20` : 'rgba(255, 255, 255, 0.05)',
                    border: `1px solid ${!showManualInput ? colors.statusPaid + '40' : 'rgba(255, 255, 255, 0.1)'}`,
                    color: !showManualInput ? colors.statusPaid : colors.textSecondary
                  }}
                >
                  <Camera className="w-4 h-4" />
                  Camera Scan
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { setShowManualInput(true); stopScanner(); }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all"
                  style={{ 
                    background: showManualInput ? `${colors.accentMint}20` : 'rgba(255, 255, 255, 0.05)',
                    border: `1px solid ${showManualInput ? colors.accentMint + '40' : 'rgba(255, 255, 255, 0.1)'}`,
                    color: showManualInput ? colors.accentMint : colors.textSecondary
                  }}
                >
                  <Keyboard className="w-4 h-4" />
                  Manual Input
                </motion.button>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        <AnimatePresence mode="wait">
          {/* Camera Scanner View */}
          {scanning && !showManualInput && (
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
                
                {/* Camera Error State */}
                {cameraError && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center py-8"
                  >
                    <div className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4"
                         style={{ background: `${colors.statusUnpaid}20` }}>
                      <CameraOff className="w-10 h-10" style={{ color: colors.statusUnpaid }} />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Camera Not Available</h3>
                    <p className="text-sm mb-4 whitespace-pre-line max-w-md mx-auto" style={{ color: colors.textSecondary }}>
                      {cameraError}
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={async () => { await requestCameraPermission(); }}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium"
                        style={{ 
                          background: `${colors.primary}20`,
                          border: `1px solid ${colors.primary}40`,
                          color: colors.primary
                        }}
                      >
                        <RefreshCw className="w-4 h-4" />
                        Try Again
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={async () => { setShowManualInput(true); await stopScanner(); }}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium"
                        style={{ 
                          background: `${colors.accentMint}20`,
                          border: `1px solid ${colors.accentMint}40`,
                          color: colors.accentMint
                        }}
                      >
                        <Keyboard className="w-4 h-4" />
                        Use Manual Input
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setShowDiagnostics((s) => !s)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium"
                        style={{ background: `${colors.accentMint}10`, border: `1px solid ${colors.accentMint}20`, color: colors.accentMint }}
                      >
                        <FileText className="w-4 h-4" />
                        {showDiagnostics ? 'Hide Diagnostics' : 'Show Diagnostics'}
                      </motion.button>
                    </div>
                    {showDiagnostics && (
                      <div className="mt-4 text-left text-xs max-w-md mx-auto" style={{ color: colors.textSecondary }}>
                        <div className="flex items-center gap-2 mb-2">
                          <button onClick={copyDiagnostics} className="px-3 py-1 rounded bg-white/5">Copy Diagnostics</button>
                          <button onClick={clearLogs} className="px-3 py-1 rounded bg-white/5">Clear Logs</button>
                        </div>
                        <div className="space-y-1">
                          <div><strong>Mounted:</strong> {String(Boolean(mountedRef.current))}</div>
                          <div><strong>Initialized:</strong> {String(Boolean(scannerInitializedRef.current))}</div>
                          <div><strong>Instance:</strong> {html5QrCodeRef.current ? 'present' : 'null'}</div>
                          <div><strong>Container present:</strong> {String(Boolean(document.getElementById(scannerContainerId)))}</div>
                          <div><strong>Selected camera:</strong> {selectedCamera || 'n/a'}</div>
                        </div>
                        <pre className="max-h-40 overflow-auto p-2 rounded bg-black/10 mt-2" style={{ color: 'white' }}>{scannerLogs.slice(0, 30).join('\n')}</pre>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Camera Loading */}
                {cameraLoading && !cameraError && (
                  <div className="text-center py-12">
                    <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin" style={{ color: colors.accentMint }} />
                    <p className="text-white font-medium">Initializing camera...</p>
                    <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                      Please allow camera access when prompted
                    </p>
                    <div className="flex items-center justify-center gap-3 mt-4">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setShowManualInput(true)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium"
                        style={{ 
                          background: `${colors.accentMint}20`,
                          border: `1px solid ${colors.accentMint}40`,
                          color: colors.accentMint
                        }}
                      >
                        <Keyboard className="w-4 h-4" />
                        Use Manual Input
                      </motion.button>

                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={async () => { await requestCameraPermission(); }}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium"
                        style={{ background: `${colors.primary}20`, border: `1px solid ${colors.primary}40`, color: colors.primary }}
                      >
                        <RefreshCw className="w-4 h-4" />
                        Re-request Permission
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setShowDiagnostics((s) => !s)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium"
                        style={{ background: `${colors.accentMint}10`, border: `1px solid ${colors.accentMint}20`, color: colors.accentMint }}
                      >
                        <FileText className="w-4 h-4" />
                        {showDiagnostics ? 'Hide Diagnostics' : 'Show Diagnostics'}
                      </motion.button>
                    </div>
                    {showDiagnostics && (
                      <div className="mt-4 text-left text-xs max-w-xl mx-auto" style={{ color: colors.textSecondary }}>
                        <div className="flex items-center gap-2 mb-2">
                          <button onClick={copyDiagnostics} className="px-3 py-1 rounded bg-white/5">Copy Diagnostics</button>
                          <button onClick={clearLogs} className="px-3 py-1 rounded bg-white/5">Clear Logs</button>
                        </div>
                        <pre className="max-h-40 overflow-auto p-2 rounded bg-black/10" style={{ color: 'white' }}>{scannerLogs.slice(0, 30).join('\n')}</pre>
                      </div>
                    )}
                  </div>
                )}

                {/* Scanner Container */}
                {!cameraError && (
                  <>
                    <div className="text-center mb-4">
                      <h2 className="text-xl font-bold text-white mb-1">
                        Position QR Code in View
                      </h2>
                      <p style={{ color: colors.textSecondary }}>
                        Hold the QR code steady within the frame
                      </p>
                    </div>

                    {/* Camera Selector */}
                    {cameras.length > 1 && (
                      <div className="flex justify-center mb-4">
                        <select
                          value={selectedCamera}
                          onChange={(e) => switchCamera(e.target.value)}
                          className="px-4 py-2 rounded-lg text-sm"
                          style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            color: 'white'
                          }}
                        >
                          {cameras.map(cam => (
                            <option key={cam.id} value={cam.id} style={{ background: '#1a1a1a' }}>
                              {cam.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div 
                      id={scannerContainerId} 
                      className="rounded-xl overflow-hidden mx-auto"
                      style={{ maxWidth: '400px' }}
                    />

                    {/* Scanning Tips */}
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
                          <ScanLine className="w-5 h-5" style={{ color: colors.primary }} />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-white mb-2">Scanning Tips</p>
                          <ul className="text-sm space-y-1.5" style={{ color: colors.textSecondary }}>
                            <li className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: colors.accentMint }} />
                              Ensure good lighting
                            </li>
                            <li className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: colors.accentMint }} />
                              Hold phone steady, 6-12 inches away
                            </li>
                            <li className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: colors.accentMint }} />
                              Keep QR code flat and centered
                            </li>
                            <li className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: colors.accentMint }} />
                              If camera doesn't work, use Manual Input
                            </li>
                          </ul>
                        </div>
                      </div>
                    </motion.div>
                  </>
                )}
              </GlassCard>
            </motion.div>
          )}

          {/* Manual Input View */}
          {scanning && showManualInput && (
            <motion.div
              key="manual"
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
                  <div className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4"
                       style={{ background: `linear-gradient(135deg, ${colors.accentMint}20, ${colors.primary}20)` }}>
                    <Keyboard className="w-10 h-10" style={{ color: colors.accentMint }} />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">
                    Enter Payment Code
                  </h2>
                  <p style={{ color: colors.textSecondary }}>
                    Ask the student for their payment code to verify
                  </p>
                </div>

                {/* Payment Code Input */}
                <div className="space-y-4">
                  {/* Instructions */}
                  <div className="p-4 rounded-xl"
                       style={{ background: `${colors.primary}10`, border: `1px solid ${colors.primary}20` }}>
                    <p className="text-sm font-medium text-white mb-2">How to use payment code:</p>
                    <ol className="text-sm space-y-1" style={{ color: colors.textSecondary }}>
                      <li>1. Ask the student to read their payment code aloud</li>
                      <li>2. It's shown below the QR code on their screen</li>
                      <li>3. Just type - dashes are added automatically!</li>
                    </ol>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2 text-white">
                      Payment Code
                    </label>
                    <input
                      type="text"
                      value={paymentCodeInput}
                      onChange={handlePaymentCodeChange}
                      placeholder="Enter code (auto-formats)"
                      className="w-full px-4 py-4 rounded-xl text-white font-mono text-lg text-center tracking-widest focus:outline-none focus:ring-2 uppercase"
                      style={{ 
                        background: 'rgba(255, 255, 255, 0.05)', 
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        letterSpacing: '0.1em'
                      }}
                    />
                    <p className="text-xs text-center mt-2" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                      Single: ABC-DEF-1234 | Multi: MP-XXX-P123-456.789
                    </p>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handlePaymentCodeSubmit}
                    disabled={processingManual || !paymentCodeInput.trim()}
                    className="w-full py-3.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ 
                      background: `linear-gradient(135deg, ${colors.primary}, ${colors.accentMint})`,
                      boxShadow: `0 4px 15px ${colors.primary}30`
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
                        Find Payment
                      </>
                    )}
                  </motion.button>

                  <p className="text-xs text-center" style={{ color: colors.textSecondary }}>
                    The payment code is valid for 24 hours from generation
                  </p>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* Confirmation View */}
          {!scanning && qrData && student && paymentType && (
            <motion.div
              key="confirmation"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <GlassCard className="relative overflow-hidden">
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
                      QR Code Verified Successfully
                    </h2>
                    <p style={{ color: colors.textSecondary }}>
                      Verify the details below before confirming payment
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
                          <User className="w-4 h-4" style={{ color: colors.primary }} />
                          <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                            {qrData.totalStudents > 1 ? "Paid By" : "Student Name"}
                          </p>
                        </div>
                        <p className="text-lg font-bold text-white">{qrData.paidByName}</p>
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.15 }}
                        className="p-4 rounded-xl"
                        style={{ background: "rgba(255,255,255,0.05)", border: '1px solid rgba(255,255,255,0.08)' }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <User className="w-4 h-4" style={{ color: colors.primary }} />
                          <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>Reg Number</p>
                        </div>
                        <p className="text-lg font-bold text-white">{qrData.paidByRegNumber}</p>
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        className="p-4 rounded-xl"
                        style={{ background: "rgba(255,255,255,0.05)", border: '1px solid rgba(255,255,255,0.08)' }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="w-4 h-4" style={{ color: colors.accentMint }} />
                          <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>Payment Type</p>
                        </div>
                        <p className="text-lg font-bold text-white">{paymentType.title}</p>
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.25 }}
                        className="p-4 rounded-xl"
                        style={{ background: `${colors.accentMint}10`, border: `1px solid ${colors.accentMint}20` }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <DollarSign className="w-4 h-4" style={{ color: colors.accentMint }} />
                          <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>Total Amount</p>
                        </div>
                        <p className="text-2xl font-bold" style={{ color: colors.accentMint }}>
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
                              <User className="w-4 h-4" style={{ color: colors.primary }} />
                              <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>Total Students</p>
                            </div>
                            <p className="text-lg font-bold text-white">{qrData.totalStudents}</p>
                          </motion.div>

                          <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.35 }}
                            className="p-4 rounded-xl"
                            style={{ background: "rgba(255,255,255,0.05)", border: '1px solid rgba(255,255,255,0.08)' }}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <DollarSign className="w-4 h-4" style={{ color: colors.accentMint }} />
                              <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>Per Student</p>
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
                        <p className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: colors.textSecondary }}>
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
                        <AlertTriangle className="w-5 h-5" style={{ color: colors.warning }} />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-white mb-1">Verify Cash Received</p>
                        <p className="text-sm" style={{ color: colors.textSecondary }}>
                          Make sure you have received the exact amount in cash (
                          <span className="font-semibold" style={{ color: colors.warning }}>{formatCurrency(qrData.totalAmount)}</span>
                          ) from {qrData.paidByName} before confirming.
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