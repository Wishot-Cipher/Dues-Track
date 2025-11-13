import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { colors, gradients } from '@/config/colors';
import GlassCard from '@/components/ui/GlassCard';
import {
  Building2,
  Smartphone,
  Wallet,
  CreditCard,
  QrCode,
  Upload,
  CheckCircle,
  Users
} from 'lucide-react';

export type PaymentMethod = 'bank_transfer' | 'cash' | 'pos';

interface PaymentMethodSelectorProps {
  selectedMethod: PaymentMethod | null;
  onMethodSelect: (method: PaymentMethod) => void;
  onPayForOthers?: () => void;
  showPayForOthers?: boolean;
}

function PaymentMethodSelector({
  selectedMethod,
  onMethodSelect,
  onPayForOthers,
  showPayForOthers = true
}: PaymentMethodSelectorProps) {
  const [hoveredMethod, setHoveredMethod] = useState<PaymentMethod | null>(null);

  const paymentMethods = [
    {
      id: 'bank_transfer' as PaymentMethod,
      name: 'Bank Transfer',
      description: 'Transfer to class account and upload proof',
      icon: Building2,
      process: [
        'Transfer to provided account',
        'Upload payment receipt',
        'Wait for admin verification',
        'Get confirmation notification'
      ],
      color: colors.primary,
      gradient: gradients.primary
    },
    {
      id: 'cash' as PaymentMethod,
      name: 'Cash Payment',
      description: 'Pay cash and get instant QR confirmation',
      icon: Wallet,
      process: [
        'Generate payment QR code',
        'Show code to class treasurer',
        'Make cash payment',
        'Get instant confirmation'
      ],
      color: colors.accentMint,
      gradient: gradients.mint
    },
    {
      id: 'pos' as PaymentMethod,
      name: 'POS Payment',
      description: 'Pay via POS and upload receipt',
      icon: CreditCard,
      process: [
        'Make payment via POS',
        'Upload POS receipt',
        'Wait for admin verification',
        'Get confirmation notification'
      ],
      color: colors.warning,
      gradient: gradients.warning
    }
  ];

  return (
    <div className="space-y-6 w-full overflow-hidden px-4 sm:px-0">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
          Choose Payment Method
        </h2>
        <p style={{ color: colors.textSecondary }}>
          Select how you'd like to make this payment
        </p>
      </motion.div>

      {/* Payment Methods Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {paymentMethods.map((method, index) => {
          const Icon = method.icon;
          const isSelected = selectedMethod === method.id;
          const isHovered = hoveredMethod === method.id;

          return (
            <motion.div
              key={method.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              onMouseEnter={() => setHoveredMethod(method.id)}
              onMouseLeave={() => setHoveredMethod(null)}
            >
              <button
                onClick={() => onMethodSelect(method.id)}
                className="w-full text-left relative group"
              >
                <GlassCard className="relative overflow-hidden h-full">
                  {/* Selection Indicator */}
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute top-4 right-4 z-10"
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center"
                        style={{ background: method.gradient }}
                      >
                        <CheckCircle className="w-5 h-5 text-white" />
                      </div>
                    </motion.div>
                  )}

                  {/* Background Gradient on Hover/Select */}
                  <AnimatePresence>
                    {(isSelected || isHovered) && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0"
                        style={{ background: method.gradient }}
                      />
                    )}
                  </AnimatePresence>

                  <div className="relative z-10 p-4 space-y-3">
                    {/* Icon & Title in one row */}
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: `${method.color}20` }}
                      >
                        <Icon className="w-6 h-6" style={{ color: method.color }} />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-white mb-0.5">
                          {method.name}
                        </h3>
                        <p className="text-xs" style={{ color: colors.textSecondary }}>
                          {method.description}
                        </p>
                      </div>
                    </div>

                    {/* Process Steps - More Compact */}
                    <div className="space-y-1.5">
                      {method.process.map((step, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                            style={{
                              background: `${method.color}20`,
                              color: method.color
                            }}
                          >
                            {i + 1}
                          </span>
                          <span className="text-xs" style={{ color: colors.textSecondary }}>
                            {step}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Special Icon for Method */}
                    <div className="flex items-center gap-2 pt-2">
                      {method.id === 'bank_transfer' && (
                        <Upload className="w-4 h-4" style={{ color: method.color }} />
                      )}
                      {method.id === 'cash' && (
                        <QrCode className="w-4 h-4" style={{ color: method.color }} />
                      )}
                      {method.id === 'pos' && (
                        <Smartphone className="w-4 h-4" style={{ color: method.color }} />
                      )}
                      <span className="text-xs font-medium" style={{ color: method.color }}>
                        {method.id === 'bank_transfer' && 'Upload Required'}
                        {method.id === 'cash' && 'Instant Verification'}
                        {method.id === 'pos' && 'Upload Required'}
                      </span>
                    </div>
                  </div>
                </GlassCard>
              </button>
            </motion.div>
          );
        })}
      </div>

      {/* Pay for Others Option */}
      {showPayForOthers && onPayForOthers && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
            <button
            onClick={onPayForOthers}
            className="w-full group"
          >
            <GlassCard className="relative overflow-hidden md:hover:scale-[1.02] transition-transform">
              <div className="flex items-center justify-between p-6">
                <div className="flex items-center gap-4">
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center"
                    style={{ background: `${colors.primary}20` }}
                  >
                    <Users className="w-7 h-7" style={{ color: colors.primary }} />
                  </div>
                  <div className="text-left">
                    <h3 className="text-lg font-bold text-white mb-1">
                      Pay for Fellow Students
                    </h3>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                      Make payment for multiple students at once
                    </p>
                  </div>
                </div>
                <motion.div
                  className="text-white"
                  animate={{ x: [0, 5, 0] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                >
                  →
                </motion.div>
              </div>
            </GlassCard>
          </button>
        </motion.div>
      )}

      {/* Selected Method Summary */}
      <AnimatePresence>
        {selectedMethod && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <GlassCard>
              <div className="flex items-center gap-4 p-4">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ background: gradients.primary }}
                >
                  <CheckCircle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-sm" style={{ color: colors.textSecondary }}>
                    Selected Method:
                  </p>
                  <p className="text-lg font-bold text-white">
                    {paymentMethods.find(m => m.id === selectedMethod)?.name}
                  </p>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default PaymentMethodSelector;
