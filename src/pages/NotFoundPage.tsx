import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Home, ArrowLeft, Search, AlertTriangle } from 'lucide-react';
import { colors, gradients } from '@/config/colors';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse at top, #1A0E09 0%, #0F0703 100%)',
      }}
    >
      {/* Background Effects */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(${colors.primary}20 1px, transparent 1px),
            linear-gradient(90deg, ${colors.primary}20 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />
      
      {/* Floating orbs */}
      <motion.div
        className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full blur-3xl opacity-20"
        style={{ background: colors.primary }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.1, 0.2, 0.1],
        }}
        transition={{ duration: 4, repeat: Infinity }}
      />
      <motion.div
        className="absolute bottom-1/4 right-1/4 w-48 h-48 rounded-full blur-3xl opacity-20"
        style={{ background: colors.accentMint }}
        animate={{
          scale: [1.2, 1, 1.2],
          opacity: [0.15, 0.1, 0.15],
        }}
        transition={{ duration: 5, repeat: Infinity }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 text-center max-w-md mx-auto"
      >
        {/* 404 Illustration */}
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', damping: 15 }}
          className="mb-8"
        >
          {/* Animated 404 */}
          <div className="relative inline-block">
            <motion.div
              className="text-[120px] font-black leading-none"
              style={{ 
                background: gradients.primary,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                textShadow: `0 0 80px ${colors.primary}40`,
              }}
              animate={{ 
                opacity: [0.8, 1, 0.8],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              404
            </motion.div>
            
            {/* Floating icon */}
            <motion.div
              className="absolute -top-4 -right-4 w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ 
                background: `${colors.warning}20`,
                border: `1px solid ${colors.warning}30`,
              }}
              animate={{ 
                y: [-5, 5, -5],
                rotate: [-5, 5, -5],
              }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <AlertTriangle className="w-8 h-8" style={{ color: colors.warning }} />
            </motion.div>
          </div>
        </motion.div>

        {/* Message */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mb-8"
        >
          <h1 className="text-2xl font-bold text-white mb-3">
            Page Not Found
          </h1>
          <p className="text-base" style={{ color: colors.textSecondary }}>
            Oops! The page you're looking for doesn't exist or may have been moved.
          </p>
        </motion.div>

        {/* Search hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mb-8 p-4 rounded-xl"
          style={{ 
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div className="flex items-center gap-3 text-left">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${colors.primary}15` }}
            >
              <Search className="w-5 h-5" style={{ color: colors.primary }} />
            </div>
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              Try going back to the dashboard or check if the URL is correct.
            </p>
          </div>
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex flex-col sm:flex-row gap-3 justify-center"
        >
          <motion.button
            onClick={() => navigate(-1)}
            className="px-6 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: colors.textPrimary,
            }}
            whileHover={{ 
              scale: 1.02,
              background: 'rgba(255, 255, 255, 0.08)',
            }}
            whileTap={{ scale: 0.98 }}
          >
            <ArrowLeft className="w-5 h-5" />
            Go Back
          </motion.button>
          
          <motion.button
            onClick={() => navigate('/dashboard')}
            className="px-6 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
            style={{
              background: gradients.primary,
              color: 'white',
              boxShadow: `0 4px 20px ${colors.primary}40`,
            }}
            whileHover={{ 
              scale: 1.02,
              boxShadow: `0 6px 30px ${colors.primary}60`,
            }}
            whileTap={{ scale: 0.98 }}
          >
            <Home className="w-5 h-5" />
            Back to Dashboard
          </motion.button>
        </motion.div>

        {/* Footer hint */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 text-xs"
          style={{ color: colors.textMuted }}
        >
          If you believe this is an error, please contact support.
        </motion.p>
      </motion.div>
    </div>
  );
}
