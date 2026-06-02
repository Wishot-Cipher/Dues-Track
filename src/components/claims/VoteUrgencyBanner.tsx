/**
 * VoteUrgencyBanner — compact banner that surfaces pending claim votes.
 *
 * Appears only when the current member has at least one open claim
 * to vote on. Now theme-aware (light + dark) and ships with a thin
 * progress bar so the vote-progress is visible at a glance, not just
 * spelled out in the subtitle.
 *
 * This is the SINGLE source of truth for "you have votes to cast" on
 * the dashboard — the bigger VoteInbox card was removed to avoid
 * the duplicate-banner problem.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Vote as VoteIcon } from 'lucide-react';
import { organizationService } from '@/services/organizationService';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';

interface Claim {
  id: string;
  full_name: string;
  position_title: string;
  votes_required: number;
  votes_received: number;
  // Tier hints — populated from the claim row, used to label what
  // kind of role the voter is being asked to confirm. Without this
  // the banner reads identically for a class-rep claim and a
  // faculty-treasurer claim, which is confusing.
  claimed_scope?: 'org' | 'unit' | 'group';
  claimed_group_id?: string | null;
  claimed_unit_group_id?: string | null;
}

export default function VoteUrgencyBanner({ orgSlug: orgSlugProp }: { orgSlug?: string }) {
  const { user } = useMultiTenantAuth();
  const { orgSlug: orgSlugParam } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const dt = getDashboardTokens(theme);

  const orgSlug = orgSlugProp || orgSlugParam;
  const memberId = user?.id;

  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!memberId) {
      setClaims([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    organizationService.listOpenClaimsForVoter(memberId)
      .then((list) => {
        if (!active) return;
        setClaims(list as Claim[]);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setClaims([]);
        setLoading(false);
      });
    return () => { active = false; };
  }, [memberId]);

  if (loading || claims.length === 0) return null;

  const top = claims[0];
  const extra = claims.length - 1;
  const pct = Math.min(100, Math.round((top.votes_received / Math.max(1, top.votes_required)) * 100));

  const handleReview = () => {
    if (!orgSlug) return;
    navigate(`/${orgSlug}/claim/${top.id}/decide`);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl px-4 py-4 flex items-start gap-3"
      style={{
        background: `linear-gradient(135deg, ${dt.primarySoft} 0%, ${theme === 'light' ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.02)'} 100%)`,
        border: `1px solid ${dt.cardBorder}`,
        boxShadow: theme === 'light'
          ? '0 10px 30px rgba(15, 7, 3, 0.06)'
          : '0 10px 30px rgba(0, 0, 0, 0.18)',
      }}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: dt.primarySoft, color: dt.primary }}
      >
        <VoteIcon className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        <p className="text-sm font-semibold truncate" style={{ color: dt.text }}>
          {top.full_name} claimed to be {top.position_title}
        </p>
        <p className="text-[11px]" style={{ color: dt.textSec }}>
          {/* Tier hint inline, so a voter immediately sees whether this
              is a class / dept / faculty / org claim. The exec label
              chooses the most specific term we can without an extra
              fetch (we don't have the target group's kind here). */}
          <span
            className="inline-flex items-center gap-1 mr-1 px-1.5 py-0.5 rounded-md text-[9.5px] font-bold uppercase tracking-wider align-middle"
            style={{ background: `${dt.primary}18`, color: dt.primary, border: `1px solid ${dt.primary}30` }}
          >
            {top.claimed_scope === 'org'   ? 'Org'
              : top.claimed_scope === 'unit'  ? 'Faculty / Dept'
              : top.claimed_scope === 'group' ? 'Class'
              : 'Role'}
          </span>
          {top.votes_received} of {top.votes_required} confirmations • {pct}% complete
          {extra > 0 ? ` • +${extra} more` : ''}
        </p>

        <div className="w-full">
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ background: theme === 'light' ? 'rgba(15, 7, 3, 0.08)' : 'rgba(255, 255, 255, 0.08)' }}
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.max(6, pct)}%`,
                background: `linear-gradient(90deg, ${dt.primary} 0%, ${dt.mint} 100%)`,
              }}
            />
          </div>
        </div>
      </div>

      <motion.button
        type="button"
        onClick={handleReview}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
        style={{
          background: `linear-gradient(135deg, ${dt.mint}22 0%, ${dt.mint}10 100%)`,
          color: dt.mint,
          border: `1px solid ${dt.mint}40`,
        }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        Review
        <ArrowRight className="w-3.5 h-3.5" />
      </motion.button>
    </motion.section>
  );
}
