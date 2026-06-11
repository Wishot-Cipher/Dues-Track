import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { colors } from '@/config/colors';
import {
  Camera,
  CameraOff,
  RefreshCw,
  Loader2,
  ChevronDown,
} from 'lucide-react';

export interface QRScannerProps {
  onScan: (decodedText: string) => void;
  onError?: (error: string) => void;
  scanning: boolean;
}

interface CameraDevice {
  id: string;
  label: string;
}

const CONTAINER_ID = 'qr-scanner-container';

export default function QRScanner({ onScan, onError, scanning }: QRScannerProps) {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraLoading, setCameraLoading] = useState(true);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const [isRestarting, setIsRestarting] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const mountedRef = useRef(true);
  const isProcessingRef = useRef(false);
  const lastScanRef = useRef<string>('');
  const lastScanTimeRef = useRef<number>(0);

  // Mutable mirrors. These let startScanner stay a STABLE callback.
  // The old bug: startScanner depended on `selectedCamera` and lived in
  // the mount effect's deps, so switching cameras (setSelectedCamera)
  // recreated startScanner → re-fired the mount effect → the cleanup
  // stopped + nulled the very camera switchCamera had just started, and
  // the scanner never came back. Reading these from refs breaks that
  // feedback loop so the effect only reacts to `scanning`.
  const selectedCameraRef = useRef<string>('');
  const scanningRef = useRef(scanning);
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  const startingRef = useRef(false); // guards against concurrent .start() races

  useEffect(() => { scanningRef.current = scanning; }, [scanning]);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  // Detect iOS
  const isIOS = useCallback(() => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }, []);

  // Stop scanner safely
  const stopScanner = useCallback(async () => {
    if (!scannerRef.current) return;

    try {
      const state = scannerRef.current.getState();
      if (state === Html5QrcodeScannerState.SCANNING) {
        await scannerRef.current.stop();
      }
      scannerRef.current.clear();
    } catch (err) {
      console.debug('Stop scanner error (non-critical):', err);
    } finally {
      scannerRef.current = null;
    }
  }, []);

  // Start scanner. STABLE callback — no `selectedCamera` / `onScan` /
  // `scanning` deps (those are read from refs), so its identity never
  // changes and the mount effect below won't thrash. `explicitId` is
  // passed when the user consciously picks a camera, so we honor that
  // exact device instead of falling back to facingMode.
  const startScanner = useCallback(async (explicitId?: string) => {
    if (!mountedRef.current || !scanningRef.current) return;
    if (startingRef.current) return; // a start is already in flight
    startingRef.current = true;

    setCameraLoading(true);
    setCameraError(null);

    try {
      // Wait for container
      await new Promise(r => setTimeout(r, 300));
      if (!mountedRef.current || !scanningRef.current) return;

      const container = document.getElementById(CONTAINER_ID);
      if (!container) {
        setCameraError('Scanner container not ready. Please refresh.');
        setCameraLoading(false);
        return;
      }

      // Get available cameras
      let deviceList: CameraDevice[] = [];
      try {
        const cameraDevices = await Html5Qrcode.getCameras();

        // Filter out duplicate cameras (same id) and prefer back camera
        const uniqueCameras = new Map<string, CameraDevice>();
        cameraDevices.forEach(d => {
          // Skip if we already have this camera id
          if (uniqueCameras.has(d.id)) return;

          const label = d.label?.toLowerCase() || '';
          // Determine friendly label
          let friendlyLabel = d.label || `Camera ${d.id.slice(0, 6)}`;
          if (label.includes('back') || label.includes('rear') || label.includes('environment')) {
            friendlyLabel = '📷 Back Camera';
          } else if (label.includes('front') || label.includes('user') || label.includes('selfie')) {
            friendlyLabel = '🤳 Front Camera';
          }

          uniqueCameras.set(d.id, {
            id: d.id,
            label: friendlyLabel
          });
        });

        deviceList = Array.from(uniqueCameras.values());

        // Sort to put back camera first (preferred for QR scanning)
        deviceList.sort((a, b) => {
          if (a.label.includes('Back')) return -1;
          if (b.label.includes('Back')) return 1;
          return 0;
        });

        setCameras(deviceList);
      } catch (camErr) {
        console.debug('Get cameras error:', camErr);
        // On iOS, try with facingMode
        if (isIOS()) {
          deviceList = [{ id: 'environment', label: '📷 Back Camera' }];
          setCameras(deviceList);
        } else {
          throw camErr;
        }
      }

      if (deviceList.length === 0) {
        setCameraError('No cameras found on this device');
        setCameraLoading(false);
        return;
      }

      // Stop existing scanner if any
      await stopScanner();
      if (!mountedRef.current || !scanningRef.current) return;

      // Create new scanner instance
      scannerRef.current = new Html5Qrcode(CONTAINER_ID);

      const cameraToUse = explicitId || selectedCameraRef.current || deviceList[0].id;
      selectedCameraRef.current = cameraToUse;
      setSelectedCamera(cameraToUse);

      // Enhanced config for better QR detection
      const config = {
        fps: 15, // Increased FPS for smoother scanning
        qrbox: { width: 280, height: 280 }, // Slightly larger scan area
        aspectRatio: 1.0,
        disableFlip: false, // Allow mirrored QR codes
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true // Use native barcode API when available
        }
      };

      // Resolve the camera source:
      //   • iOS → facingMode (device ids aren't stable/usable there).
      //   • Explicit user pick → honor the EXACT device id, so switching
      //     between multiple back cameras (wide / ultrawide / tele) on
      //     Android actually changes the lens instead of snapping back
      //     to the OS default via facingMode.
      //   • Initial auto-pick on Android → prefer facingMode:'environment'
      //     for the back camera (better autofocus), else the device id.
      let cameraConfig: string | { facingMode: string };
      if (isIOS()) {
        cameraConfig = { facingMode: 'environment' };
      } else if (explicitId) {
        cameraConfig = explicitId;
      } else {
        const selectedCameraLabel = deviceList.find(c => c.id === cameraToUse)?.label || '';
        if (selectedCameraLabel.includes('Back') || selectedCameraLabel.includes('environment')) {
          cameraConfig = { facingMode: 'environment' };
        } else {
          cameraConfig = cameraToUse;
        }
      }

      await scannerRef.current.start(
        cameraConfig,
        config,
        (decodedText) => {
          // Debounce scans (prevent duplicate rapid scans)
          const now = Date.now();
          if (
            decodedText === lastScanRef.current &&
            now - lastScanTimeRef.current < 3000
          ) {
            return;
          }

          lastScanRef.current = decodedText;
          lastScanTimeRef.current = now;

          if (!isProcessingRef.current) {
            isProcessingRef.current = true;
            onScanRef.current(decodedText);
            // Reset processing flag after a delay
            setTimeout(() => {
              isProcessingRef.current = false;
            }, 2000);
          }
        },
        () => {} // QR code error callback (ignore)
      );

      if (mountedRef.current) {
        setCameraLoading(false);
      }
    } catch (error: unknown) {
      console.error('Camera start error:', error);

      if (!mountedRef.current) return;

      setCameraLoading(false);

      let errorMsg = 'Could not access camera';

      if (error instanceof Error) {
        const msg = error.message.toLowerCase();

        if (msg.includes('permission') || msg.includes('denied') || msg.includes('notallowed')) {
          errorMsg = isIOS()
            ? 'Camera access denied. Go to Settings > Safari > Camera to allow access.'
            : 'Camera permission denied. Please allow camera access in browser settings.';
        } else if (msg.includes('notfound') || msg.includes('no video')) {
          errorMsg = 'No camera found on this device';
        } else if (msg.includes('notreadable') || msg.includes('hardware')) {
          errorMsg = 'Camera is being used by another app. Close other apps and try again.';
        } else if (msg.includes('overconstrained')) {
          errorMsg = 'Camera not supported. Try a different camera.';
        }
      }

      setCameraError(errorMsg);
      onErrorRef.current?.(errorMsg);
    } finally {
      startingRef.current = false;
    }
  }, [isIOS, stopScanner]);

  // Handle camera switch — explicit user pick, so pass the device id.
  const switchCamera = useCallback(async (newCameraId: string) => {
    setIsRestarting(true);
    selectedCameraRef.current = newCameraId;
    setSelectedCamera(newCameraId);
    await stopScanner();
    await new Promise(r => setTimeout(r, 500));
    await startScanner(newCameraId);
    setIsRestarting(false);
  }, [stopScanner, startScanner]);

  // Retry camera
  const retryCamera = useCallback(async () => {
    setIsRestarting(true);
    await stopScanner();
    await new Promise(r => setTimeout(r, 500));
    await startScanner(selectedCameraRef.current || undefined);
    setIsRestarting(false);
  }, [stopScanner, startScanner]);

  // Start/stop driven ONLY by `scanning`. startScanner + stopScanner are
  // stable callbacks, so this effect no longer re-fires when the camera
  // changes — switching a camera can't tear itself down anymore.
  useEffect(() => {
    if (!scanning) {
      stopScanner();
      return;
    }

    // Small delay to ensure DOM is ready
    const timeout = setTimeout(() => {
      startScanner();
    }, 500);

    return () => {
      clearTimeout(timeout);
      stopScanner();
    };
  }, [scanning, startScanner, stopScanner]);

  // True mount/unmount lifecycle — the ONLY place mountedRef flips. The
  // scanning-toggle effect above must NOT touch mountedRef, or a restart
  // scheduled right after a re-render would see mountedRef=false and bail.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopScanner();
    };
  }, [stopScanner]);

  return (
    <div className="space-y-4">
      {/* Camera Selection (if multiple cameras) */}
      {cameras.length > 1 && !cameraError && (
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4" style={{ color: colors.textSecondary }} />
          <select
            value={selectedCamera}
            onChange={(e) => switchCamera(e.target.value)}
            disabled={cameraLoading || isRestarting}
            className="flex-1 px-3 py-2 rounded-lg text-sm"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: colors.textPrimary,
            }}
          >
            {cameras.map((cam) => (
              <option key={cam.id} value={cam.id}>
                {cam.label}
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 pointer-events-none -ml-8" style={{ color: colors.textSecondary }} />
        </div>
      )}

      {/* Scanner Container */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          minHeight: '300px',
        }}
      >
        {/* Scanner Element */}
        <div
          id={CONTAINER_ID}
          className="w-full"
          style={{ minHeight: '300px' }}
        />

        {/* Loading Overlay */}
        <AnimatePresence>
          {(cameraLoading || isRestarting) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-4"
              style={{ background: 'rgba(0, 0, 0, 0.8)' }}
            >
              <Loader2 className="w-10 h-10 animate-spin" style={{ color: colors.primary }} />
              <p className="text-sm" style={{ color: colors.textSecondary }}>
                {isRestarting ? 'Switching camera...' : 'Initializing camera...'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Overlay */}
        <AnimatePresence>
          {cameraError && !cameraLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center"
              style={{ background: 'rgba(0, 0, 0, 0.9)' }}
            >
              <CameraOff className="w-12 h-12" style={{ color: colors.statusUnpaid }} />
              <p className="text-sm whitespace-pre-line" style={{ color: colors.textPrimary }}>
                {cameraError}
              </p>
              <button
                onClick={retryCamera}
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium"
                style={{
                  background: `${colors.primary}20`,
                  border: `1px solid ${colors.primary}40`,
                  color: colors.primary,
                }}
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scanning Overlay (when active) */}
        {!cameraLoading && !cameraError && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Corner brackets */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[250px] h-[250px]">
              {/* Top-left */}
              <div
                className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 rounded-tl-lg"
                style={{ borderColor: colors.primary }}
              />
              {/* Top-right */}
              <div
                className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 rounded-tr-lg"
                style={{ borderColor: colors.primary }}
              />
              {/* Bottom-left */}
              <div
                className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 rounded-bl-lg"
                style={{ borderColor: colors.primary }}
              />
              {/* Bottom-right */}
              <div
                className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 rounded-br-lg"
                style={{ borderColor: colors.primary }}
              />
            </div>

            {/* Animated scan line */}
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 w-[230px] h-0.5"
              style={{
                background: `linear-gradient(90deg, transparent, ${colors.primary}, transparent)`,
                boxShadow: `0 0 10px ${colors.primary}`,
              }}
              initial={{ top: 'calc(50% - 120px)' }}
              animate={{ top: 'calc(50% + 120px)' }}
              transition={{
                duration: 2,
                repeat: Infinity,
                repeatType: 'reverse',
                ease: 'easeInOut',
              }}
            />

            {/* Hint text */}
            <div className="absolute bottom-4 left-0 right-0 text-center">
              <p className="text-xs px-4 py-1.5 rounded-full inline-block"
                 style={{
                   background: 'rgba(0, 0, 0, 0.7)',
                   color: colors.textSecondary
                 }}>
                Position QR code within the frame
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
