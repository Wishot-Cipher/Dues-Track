/**
 * ExpensesPage — record + review + approve org-wide expenses.
 *
 * Chrome matches the new exec dashboards:
 *   • soft brand-blob backdrop (no animated radial orbs)
 *   • chip → H1 → subtitle hero with tier-aware copy
 *   • max-w-5xl container
 *   • theme-aware everywhere via getDashboardTokens
 *
 * Tier-aware copy adapts to the active role so an org owner /
 * faculty exec / dept exec / class rep each sees the scope they're
 * recording into. The body delegates to RecordExpense + ExpenseList +
 * ExpenseApprovalQueue — those components are own-tier scoped (each
 * tier sees only the expenses/dues IT created, never the tiers below)
 * via getOwnedTierScope / applyOwnedTierScope.
 */

import { motion } from 'framer-motion';
import {
  ArrowLeft,
  TrendingDown,
  ShieldCheck,
  LayoutGrid,
} from 'lucide-react';
import RecordExpense from '@/components/admin/RecordExpense';
import ExpenseList from '@/components/admin/ExpenseList';
import ExpenseApprovalQueue from '@/components/admin/ExpenseApprovalQueue';
import Footer from '@/components/Footer';
import { useAuth } from '@/hooks/useAppAuth';
import { useAppNav } from '@/hooks/useAppNav';
import { useActiveRole } from '@/hooks/useActiveRole';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';

export default function ExpensesPage() {
  const { hasPermission } = useAuth();
  const { go: navigate } = useAppNav();
  const { user, organization } = useMultiTenantAuth();
  const { activeRole } = useActiveRole({
    orgId: organization?.id,
    memberId: user?.id,
  });
  const { theme } = useTheme();
  const tt = getDashboardTokens(theme);

  // Tier-aware copy. A dept exec records expenses at the dept tier;
  // a class rep at the class tier; same shape, different scope.
  const scopeCopy = (() => {
    if (!activeRole || activeRole.kind !== 'exec') {
      return {
        chip: 'Expenses',
        title: 'Expenses',
        subtitle:
          'Record, review, and audit money flowing out of your scope. Every entry is timestamped and attributed.',
      };
    }
    if (activeRole.scopeLevel === 'org') {
      return {
        chip: 'Org-wide expenses',
        title: 'Organisation expenses',
        subtitle:
          "The organisation's own spending, funded by org-wide dues. Each faculty, department, and class tracks its own expenses separately.",
      };
    }
    if (activeRole.scopeLevel === 'unit') {
      return {
        chip: 'Faculty / dept expenses',
        title: "Your tier's expenses",
        subtitle:
          'Record and review what your faculty or department spent, funded by your own dues. Classes under you manage their expenses separately. Every entry is timestamped and audited.',
      };
    }
    return {
      chip: 'Class expenses',
      title: "Your class's expenses",
      subtitle:
        "Record what your class spent and let your members see where the money went. Every entry is auditable.",
    };
  })();

  return (
    <div
      className="min-h-screen relative overflow-hidden py-6 px-4 pb-20"
      style={{ background: tt.bgWash, color: tt.text }}
    >
      {/* Soft brand blobs — matches the exec-dashboard chrome. The
          legacy page layered a 50px diagonal grid + two pulsing
          radial orbs in danger + mint. Replaced with the same
          soft-blob pattern used across every other admin page. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-24 w-[520px] h-[520px] rounded-full"
        style={{ background: tt.blob1, filter: 'blur(120px)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-32 w-[420px] h-[420px] rounded-full"
        style={{ background: tt.blob2, filter: 'blur(110px)' }}
      />

      <div className="relative z-10 max-w-5xl mx-auto space-y-5">
        {/* ── Header ────────────────────────────────────────────── */}
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          {/* Back link as a quiet text chip — not an orange button */}
          <button
            type="button"
            onClick={() => navigate('/admin/dashboard')}
            className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition-opacity hover:opacity-80"
            style={{ color: tt.textTer }}
          >
            <ArrowLeft className="w-3 h-3" />
            Back to dashboard
          </button>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] px-2 py-1 rounded-full"
                style={{
                  background: `${tt.danger}18`,
                  color: tt.danger,
                  border: `1px solid ${tt.danger}40`,
                }}
              >
                <TrendingDown className="w-3 h-3" />
                {scopeCopy.chip}
              </span>
            </div>

            {/* Trust chips — small, theme-aware */}
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full"
                style={{
                  background: `${tt.mint}14`,
                  color: tt.mint,
                  border: `1px solid ${tt.mint}30`,
                }}
              >
                <ShieldCheck className="w-3 h-3" />
                Audit trail
              </span>
              <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: tt.textTer }}
              >
                <LayoutGrid className="w-3 h-3" />
                Category tracking
              </span>
            </div>
          </div>

          <h1
            className="text-2xl sm:text-[28px] font-extrabold tracking-tight"
            style={{ color: tt.text }}
          >
            {scopeCopy.title}
          </h1>
          <p className="text-sm" style={{ color: tt.textSec }}>
            {scopeCopy.subtitle}
          </p>
        </motion.header>

        {/* ── Body: record on the left, list on the right ─────────
            The form sticks on desktop so a treasurer can fire off
            multiple entries without scrolling back up. RecordExpense
            + ExpenseList carry their own theme tokens; this page
            owns the layout only. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5 items-start"
        >
          <div className="lg:sticky lg:top-6">
            <RecordExpense />
          </div>
          <div>
            <ExpenseList />
          </div>
        </motion.div>

        {/* ── Approval queue (pending expenses needing a sign-off) ── */}
        {hasPermission('can_manage_students') && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16 }}
          >
            <ExpenseApprovalQueue />
          </motion.div>
        )}
      </div>

      <Footer />
    </div>
  );
}
