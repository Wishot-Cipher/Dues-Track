import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { colors, gradients } from '@/config/colors';
import {
  Building2,
  Smartphone,
  Wallet,
  CreditCard,
  QrCode,
  Upload,
  CheckCircle,
  Users,
  Sparkles,
  ArrowRight
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
      badge: 'Most Popular',
      badgeColor: colors.primary,
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
      badge: 'Instant',
      badgeColor: colors.accentMint,
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
      badge: 'Secure',
      badgeColor: colors.warning,
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
        <div className="inline-flex items-center justify-center gap-2 px-4 py-1.5 rounded-full mb-4" style={{ background: `${colors.primary}15`, border: `1px solid ${colors.primary}30` }}>
          <Sparkles className="w-4 h-4" style={{ color: colors.primary }} />
          <span className="text-xs font-semibold" style={{ color: colors.primary }}>STEP 1 OF 2</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
          Choose Payment Method
        </h2>
        <p style={{ color: colors.textSecondary }}>
          Select your preferred way to complete this payment
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
                <div 
                  className="relative overflow-hidden rounded-2xl p-5 h-full transition-all duration-300"
                  style={{ 
                    background: isSelected 
                      ? `linear-gradient(135deg, ${method.color}15 0%, ${method.color}05 100%)`
                      : 'rgba(255, 255, 255, 0.03)',
                    border: isSelected 
                      ? `2px solid ${method.color}60` 
                      : '1px solid rgba(255, 255, 255, 0.08)',
                    boxShadow: isSelected 
                      ? `0 8px 32px ${method.color}20, inset 0 1px 0 rgba(255, 255, 255, 0.05)` 
                      : 'none',
                    transform: isHovered && !isSelected ? 'translateY(-2px)' : 'none',
                  }}
                >
                  {/* Badge */}
                  <div 
                    className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                    style={{ 
                      background: `${method.badgeColor}20`,
                      color: method.badgeColor,
                      border: `1px solid ${method.badgeColor}30`
                    }}
                  >
                    {method.badge}
                  </div>

                  {/* Selection Indicator */}
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1 -left-1 z-10"
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center shadow-lg"
                        style={{ 
                          background: method.gradient,
                          boxShadow: `0 4px 15px ${method.color}50`
                        }}
                      >
                        <CheckCircle className="w-5 h-5 text-white" />
                      </div>
                    </motion.div>
                  )}

                  {/* Glow Effect on Hover/Select */}
                  <AnimatePresence>
                    {(isSelected || isHovered) && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 pointer-events-none"
                        style={{ 
                          background: `radial-gradient(ellipse at top, ${method.color}15 0%, transparent 70%)`,
                        }}
                      />
                    )}
                  </AnimatePresence>

                  <div className="relative z-10 space-y-4">
                    {/* Icon & Title */}
                    <div className="flex items-start gap-4">
                      <motion.div
                        className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 relative overflow-hidden"
                        style={{ 
                          background: `linear-gradient(135deg, ${method.color}25 0%, ${method.color}10 100%)`,
                          border: `1px solid ${method.color}30`
                        }}
                        whileHover={{ scale: 1.05, rotate: 3 }}
                      >
                        <Icon className="w-7 h-7" style={{ color: method.color }} />
                        {/* Shine effect */}
                        <div 
                          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ 
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 50%)'
                          }}
                        />
                      </motion.div>
                      <div className="flex-1 pt-1">
                        <h3 className="text-lg font-bold text-white mb-1">
                          {method.name}
                        </h3>
                        <p className="text-xs leading-relaxed" style={{ color: colors.textSecondary }}>
                          {method.description}
                        </p>
                      </div>
                    </div>

                    {/* Process Steps */}
                    <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.06)' }}>
                      {method.process.map((step, i) => (
                        <motion.div 
                          key={i} 
                          className="flex items-center gap-2.5"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 + i * 0.05 }}
                        >
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold"
                            style={{
                              background: `${method.color}15`,
                              color: method.color,
                              border: `1px solid ${method.color}30`
                            }}
                          >
                            {i + 1}
                          </span>
                          <span className="text-xs" style={{ color: colors.textSecondary }}>
                            {step}
                          </span>
                        </motion.div>
                      ))}
                    </div>

                    {/* Method Indicator */}
                    <div 
                      className="flex items-center gap-2 pt-3 mt-2 border-t"
                      style={{ borderColor: 'rgba(255, 255, 255, 0.06)' }}
                    >
                      {method.id === 'bank_transfer' && (
                        <Upload className="w-4 h-4" style={{ color: method.color }} />
                      )}
                      {method.id === 'cash' && (
                        <QrCode className="w-4 h-4" style={{ color: method.color }} />
                      )}
                      {method.id === 'pos' && (
                        <Smartphone className="w-4 h-4" style={{ color: method.color }} />
                      )}
                      <span className="text-xs font-semibold" style={{ color: method.color }}>
                        {method.id === 'bank_transfer' && 'Upload Required'}
                        {method.id === 'cash' && 'Instant Verification'}
                        {method.id === 'pos' && 'Receipt Required'}
                      </span>
                      {isSelected && (
                        <motion.div 
                          className="ml-auto"
                          animate={{ x: [0, 3, 0] }}
                          transition={{ repeat: Infinity, duration: 1.2 }}
                        >
                          <ArrowRight className="w-4 h-4" style={{ color: method.color }} />
                        </motion.div>
                      )}
                    </div>
                  </div>
                </div>
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
            <div 
              className="relative overflow-hidden rounded-2xl p-5 transition-all duration-300 md:hover:scale-[1.01]"
              style={{ 
                background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.08) 0%, rgba(255, 172, 95, 0.04) 100%)',
                border: '1px solid rgba(255, 107, 53, 0.2)',
              }}
            >
              {/* Animated gradient background */}
              <motion.div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ 
                  background: `linear-gradient(135deg, ${colors.primary}10 0%, transparent 60%)`,
                }}
              />
              
              <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <motion.div
                    className="w-14 h-14 rounded-xl flex items-center justify-center relative"
                    style={{ 
                      background: `linear-gradient(135deg, ${colors.primary}25 0%, ${colors.primary}10 100%)`,
                      border: `1px solid ${colors.primary}30`
                    }}
                    whileHover={{ scale: 1.05, rotate: -3 }}
                  >
                    <Users className="w-7 h-7" style={{ color: colors.primary }} />
                    <motion.div
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: gradients.primary }}
                      animate={{ scale: [1, 1.15, 1] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    >
                      <Sparkles className="w-3 h-3 text-white" />
                    </motion.div>
                  </motion.div>
                  <div className="text-left">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-bold text-white">
                        Pay for Fellow Students
                      </h3>
                      <span 
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                        style={{ background: `${colors.accentMint}20`, color: colors.accentMint }}
                      >
                        Helpful
                      </span>
                    </div>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                      Make payment for multiple students at once with one transaction
                    </p>
                  </div>
                </div>
                <motion.div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: `${colors.primary}15` }}
                  animate={{ x: [0, 5, 0] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                >
                  <ArrowRight className="w-5 h-5" style={{ color: colors.primary }} />
                </motion.div>
              </div>
            </div>
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
            <div 
              className="rounded-2xl p-5 flex items-center gap-4"
              style={{ 
                background: `linear-gradient(135deg, ${colors.statusPaid}10 0%, ${colors.statusPaid}05 100%)`,
                border: `1px solid ${colors.statusPaid}30`
              }}
            >
              <motion.div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ 
                  background: gradients.primary,
                  boxShadow: `0 4px 20px ${colors.primary}40`
                }}
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 15 }}
              >
                <CheckCircle className="w-6 h-6 text-white" />
              </motion.div>
              <div className="flex-1">
                <p className="text-xs font-medium mb-0.5" style={{ color: colors.textSecondary }}>
                  Selected Payment Method
                </p>
                <p className="text-lg font-bold text-white">
                  {paymentMethods.find(m => m.id === selectedMethod)?.name}
                </p>
              </div>
              <motion.div
                animate={{ x: [0, 5, 0] }}
                transition={{ repeat: Infinity, duration: 1.2 }}
              >
                <ArrowRight className="w-5 h-5" style={{ color: colors.statusPaid }} />
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default PaymentMethodSelector;
