import { motion } from 'framer-motion';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';

/**
 * Footer — professional product footer.
 *
 * The previous version read as a personal portfolio ("Developed with
 * ❤️ by Dev_Wishot" + a Twitter handle). Fine on a hobby project,
 * wrong on a SaaS that collects money. This one is theme-aware,
 * neutral, and surfaces the things a real user might need: support
 * email, version, copyright. Personal credit lives in the about /
 * platform-admin pages instead.
 */
export default function Footer() {
  const { theme } = useTheme();
  const tt = getDashboardTokens(theme);
  const year = new Date().getFullYear();

  return (
    <motion.footer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4 }}
      className="mt-auto pt-6 pb-5 px-4 relative"
      style={{
        borderTop: `1px solid ${tt.cardBorder}`,
        color: tt.textSec,
      }}
    >
      <div className="max-w-5xl mx-auto flex flex-col items-center sm:flex-row sm:items-center sm:justify-between gap-3 text-center sm:text-left">
        {/* Brand mark — left */}
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-extrabold"
            style={{ background: tt.primarySoft, color: tt.primary, border: `1px solid ${tt.primaryRing}` }}
            aria-hidden
          >
            P
          </div>
          <span className="text-xs font-bold" style={{ color: tt.text }}>
            Payvexo
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md" style={{ background: tt.primarySoft, color: tt.primary }}>
            v2.0
          </span>
        </div>

        {/* Legal / support links — center on desktop, stacks below on mobile */}
        <nav
          className="flex items-center flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] font-semibold"
          aria-label="Footer"
        >
          <a
            href="mailto:support@payvexo.com"
            className="transition-opacity hover:opacity-80"
            style={{ color: tt.textSec }}
          >
            Support
          </a>
          <a
            href="/privacy"
            className="transition-opacity hover:opacity-80"
            style={{ color: tt.textSec }}
          >
            Privacy
          </a>
          <a
            href="/terms"
            className="transition-opacity hover:opacity-80"
            style={{ color: tt.textSec }}
          >
            Terms
          </a>
        </nav>

        {/* Copyright — right */}
        <p className="text-[11px]" style={{ color: tt.textTer }}>
          © {year} Payvexo. All rights reserved.
        </p>
      </div>
    </motion.footer>
  );
}
