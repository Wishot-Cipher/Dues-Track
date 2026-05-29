import { motion } from 'framer-motion';
import type { ElementType, ReactNode } from 'react';
import { consoleColors } from './consoleTheme';

export default function ConsoleStatCard({
  label,
  value,
  icon: Icon,
  color,
  subtext,
}: {
  label: string;
  value: string | number;
  icon: ElementType;
  color: string;
  subtext?: ReactNode;
}) {
  return (
    <motion.div
      className="p-4 rounded-xl relative overflow-hidden"
      style={{ background: consoleColors.cardBg, border: `1px solid ${consoleColors.cardBorder}` }}
      whileHover={{ scale: 1.02 }}
    >
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: color }} />
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-[10px] sm:text-xs font-medium uppercase tracking-wider"
          style={{ color: consoleColors.textSecondary }}
        >
          {label}
        </span>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${color}15` }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <p className="text-xl sm:text-2xl font-bold text-white">{value}</p>
      {subtext && (
        <p className="text-[10px] mt-1" style={{ color: consoleColors.textSecondary }}>
          {subtext}
        </p>
      )}
    </motion.div>
  );
}