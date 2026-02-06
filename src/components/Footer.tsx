import { motion } from 'framer-motion';
import { colors } from '@/config/colors';
import { Twitter, Heart } from 'lucide-react';

export default function Footer() {
  return (
    <motion.footer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5 }}
      className="mt-auto py-4 sm:py-6 px-4 border-t"
      style={{ 
        borderColor: 'rgba(255, 104, 3, 0.1)',
        background: 'rgba(15, 7, 3, 0.5)',
        backdropFilter: 'blur(10px)'
      }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center gap-3 sm:gap-4 text-center sm:text-left sm:flex-row sm:justify-between">
          {/* Developer Credit */}
          <motion.div 
            className="flex items-center gap-2 order-1"
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 400 }}
          >
            <p className="text-xs sm:text-sm flex items-center gap-1.5" style={{ color: colors.textSecondary }}>
              Developed with{' '}
              <motion.span 
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Heart className="w-3.5 h-3.5 inline fill-current" style={{ color: colors.primary }} />
              </motion.span>{' '}
              by{' '}
              <a
                href="https://x.com/wishotstudio?s=21"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold bg-clip-text text-transparent bg-linear-to-r from-orange-400 to-orange-600 hover:from-orange-300 hover:to-orange-500 transition-all"
              >
                Dev_Wishot
              </a>
            </p>
          </motion.div>

          {/* Social Links */}
          <motion.div 
            className="flex items-center gap-4 order-2 sm:order-3"
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 400 }}
          >
            <a
              href="https://x.com/wishotstudio?s=21"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all hover:scale-105 active:scale-95"
              style={{ 
                background: 'rgba(255, 104, 3, 0.1)',
                color: colors.textSecondary,
                border: `1px solid rgba(255, 104, 3, 0.2)`
              }}
            >
              <Twitter className="w-3.5 h-3.5 sm:w-4 sm:h-4" style={{ color: colors.primary }} />
              <span className="text-xs sm:text-sm font-medium">@Dev_Wishot</span>
            </a>
          </motion.div>

          {/* Copyright + Version */}
          <p className="text-[10px] sm:text-xs order-3 sm:order-2" style={{ color: colors.textSecondary }}>
            © {new Date().getFullYear()} Class Dues Tracker · <span style={{ color: colors.primary }}>v2.0</span>
          </p>
        </div>
      </div>
    </motion.footer>
  );
}
