import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import GlassCard  from '../ui/GlassCard';

const colors = {
  primary: '#6366f1',
  accentMint: '#34d399',
  statusPaid: '#10b981',
  warning: '#f59e0b',
  statusUnpaid: '#ef4444',
  textSecondary: 'rgba(255, 255, 255, 0.6)',
};

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  iconColor: string;
  delay?: number;
}

export function StatCard({ title, value, icon: Icon, iconColor, delay = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <GlassCard>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs sm:text-sm mb-1 sm:mb-2" style={{ color: colors.textSecondary }}>
              {title}
            </p>
            <p className="text-xl sm:text-2xl md:text-3xl font-bold text-white">{value}</p>
          </div>
          <div
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shrink-0"
            style={{ background: `${iconColor}20` }}
          >
            <Icon size={20} className="sm:w-6 sm:h-6" style={{ color: iconColor }} />
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}
