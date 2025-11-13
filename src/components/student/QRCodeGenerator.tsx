import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import QRCode from 'qrcode';
import { colors, gradients } from '@/config/colors';
import GlassCard from '@/components/ui/GlassCard';
import {
  QrCode,
  Download,
  RefreshCw,
  CheckCircle2,
  Clock,
  User,
  DollarSign,
  FileText,
  Info
} from 'lucide-react';
import { formatCurrency } from '@/utils/formatters';

interface QRCodeGeneratorProps {
  studentId: string;
  studentName: string;
  studentRegNumber: string;
  paymentTypeId: string;
  paymentTypeName: string;
  amount: number;
  onBack: () => void;
}

export default function QRCodeGenerator({
  studentId,
  studentName,
  studentRegNumber,
  paymentTypeId,
  paymentTypeName,
  amount
}: QRCodeGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [showInstructions, setShowInstructions] = useState(true);
  const [qrTimestamp, setQrTimestamp] = useState(Date.now());

  useEffect(() => {
    const generateQRCode = async () => {
      if (canvasRef.current) {
        try {
          // Generate QR Code Data with timestamp
          const qrData = JSON.stringify({
            type: 'CASH_PAYMENT',
            studentId,
            studentName,
            studentRegNumber,
            paymentTypeId,
            paymentTypeName,
            amount,
            timestamp: qrTimestamp,
            paymentMethod: 'cash'
          });

          // Generate QR code on canvas
          await QRCode.toCanvas(canvasRef.current, qrData, {
            width: 300,
            margin: 2,
            color: {
              dark: '#1A1A2E',
              light: '#FFFFFF'
            },
            errorCorrectionLevel: 'H'
          });

          // Get data URL for download
          const dataUrl = canvasRef.current.toDataURL('image/png');
          setQrDataUrl(dataUrl);
        } catch (error) {
          console.error('Error generating QR code:', error);
        }
      }
    };

    generateQRCode();
  }, [studentId, studentName, studentRegNumber, paymentTypeId, paymentTypeName, amount, qrTimestamp]);

  const handleDownloadQR = () => {
    if (qrDataUrl) {
      const link = document.createElement('a');
      link.download = `payment-qr-${studentRegNumber}-${Date.now()}.png`;
      link.href = qrDataUrl;
      link.click();
    }
  };

  const handleRefreshQR = () => {
    // Regenerate QR code with new timestamp
    setQrTimestamp(Date.now());
  };

  return (
    <div className="space-y-6 w-full flex flex-col items-center justify-center">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <div className="flex items-center justify-center mb-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: gradients.mint }}
          >
            <QrCode className="w-8 h-8 text-white" />
          </div>
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
          Cash Payment QR Code
        </h2>
        <p style={{ color: colors.textSecondary }}>
          Show this code to the treasurer to complete payment
        </p>
      </motion.div>

      {/* Payment Details Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <GlassCard>
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5" style={{ color: colors.primary }} />
              Payment Details
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm mb-1" style={{ color: colors.textSecondary }}>
                  Student Name
                </p>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" style={{ color: colors.primary }} />
                  <p className="font-medium text-white">{studentName}</p>
                </div>
              </div>

              <div>
                <p className="text-sm mb-1" style={{ color: colors.textSecondary }}>
                  Registration Number
                </p>
                <p className="font-medium text-white">{studentRegNumber}</p>
              </div>

              <div>
                <p className="text-sm mb-1" style={{ color: colors.textSecondary }}>
                  Payment Type
                </p>
                <p className="font-medium text-white">{paymentTypeName}</p>
              </div>

              <div>
                <p className="text-sm mb-1" style={{ color: colors.textSecondary }}>
                  Amount
                </p>
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4" style={{ color: colors.accentMint }} />
                  <p className="text-xl font-bold" style={{ color: colors.accentMint }}>
                    {formatCurrency(amount)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </GlassCard>
      </motion.div>

      {/* QR Code Display */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
      >
        <GlassCard className="relative overflow-hidden">
          {/* Animated Border */}
          <motion.div
            className="absolute inset-0 rounded-2xl"
            style={{
              background: `linear-gradient(45deg, ${colors.accentMint}40, ${colors.primary}40)`,
              filter: 'blur(20px)',
              opacity: 0.3
            }}
            animate={{
              scale: [1, 1.05, 1],
              opacity: [0.3, 0.5, 0.3]
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut'
            }}
          />

          <div className="relative z-10 flex flex-col items-center p-8 w-full">
            {/* QR Code */}
            <div className="bg-white p-6 rounded-2xl shadow-2xl mb-6">
              <canvas ref={canvasRef} className="mx-auto" />
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-center gap-3 w-full">
              <button
                onClick={handleDownloadQR}
                className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-white transition-all hover:scale-105"
                style={{ background: gradients.primary }}
              >
                <Download className="w-5 h-5" />
                Download QR Code
              </button>

              <button
                onClick={handleRefreshQR}
                className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all"
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: colors.textPrimary
                }}
              >
                <RefreshCw className="w-5 h-5" />
                Refresh
              </button>
            </div>
          </div>
        </GlassCard>
      </motion.div>

      {/* Instructions */}
      {showInstructions && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <GlassCard>
            <div className="flex items-start gap-4">
              <Info className="w-6 h-6 flex-shrink-0 mt-1" style={{ color: colors.primary }} />
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white mb-3">How to Complete Payment</h3>
                <ol className="space-y-3">
                  <li className="flex items-start gap-3">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                      style={{ background: `${colors.primary}20`, color: colors.primary }}
                    >
                      1
                    </div>
                    <div>
                      <p className="font-medium text-white">Prepare Cash Payment</p>
                      <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                        Have exact amount ({formatCurrency(amount)}) ready in cash
                      </p>
                    </div>
                  </li>

                  <li className="flex items-start gap-3">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                      style={{ background: `${colors.accentMint}20`, color: colors.accentMint }}
                    >
                      2
                    </div>
                    <div>
                      <p className="font-medium text-white">Show QR Code</p>
                      <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                        Present this QR code to the class treasurer or financial secretary
                      </p>
                    </div>
                  </li>

                  <li className="flex items-start gap-3">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                      style={{ background: `${colors.statusPaid}20`, color: colors.statusPaid }}
                    >
                      3
                    </div>
                    <div>
                      <p className="font-medium text-white">Get Instant Confirmation</p>
                      <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                        They'll scan your code and mark payment as received immediately
                      </p>
                    </div>
                  </li>

                  <li className="flex items-start gap-3">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                      style={{ background: `${colors.warning}20`, color: colors.warning }}
                    >
                      4
                    </div>
                    <div>
                      <p className="font-medium text-white">Check Notification</p>
                      <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                        You'll receive instant notification once payment is confirmed
                      </p>
                    </div>
                  </li>
                </ol>

                <button
                  onClick={() => setShowInstructions(false)}
                  className="mt-4 text-sm font-medium"
                  style={{ color: colors.primary }}
                >
                  Hide Instructions
                </button>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* Status Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <GlassCard>
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center animate-pulse"
                style={{ background: `${colors.warning}20` }}
              >
                <Clock className="w-6 h-6" style={{ color: colors.warning }} />
              </div>
            </div>
            <div className="flex-1">
              <p className="font-medium text-white">Waiting for Treasurer Scan</p>
              <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                Your payment will be confirmed instantly once scanned
              </p>
            </div>
            <CheckCircle2 className="w-8 h-8 opacity-30" style={{ color: colors.statusPaid }} />
          </div>
        </GlassCard>
      </motion.div>

      {/* Important Notes */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <GlassCard>
          <div className="p-4 rounded-lg" style={{ background: `${colors.warning}10` }}>
            <p className="text-sm font-medium" style={{ color: colors.warning }}>
              ⚠️ Important: Keep this screen open until the treasurer scans your code and confirms receipt of payment.
            </p>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}
