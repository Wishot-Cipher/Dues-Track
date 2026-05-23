/**
 * VoteUrgencyBanner — compact banner that surfaces pending claim votes.
 * Appears only when the user has at least one open claim to vote on.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Vote as VoteIcon } from 'lucide-react';
import { organizationService } from '@/services/organizationService';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';

const tk = {
  primary: '#FF6803',
  mint: '#30FFAC',
  border: 'rgba(255,255,255,0.10)',
  text: '#FFFFFF',
  textSec: 'rgba(255,255,255,0.65)',
};

interface Claim {
  id: string;
  full_name: string;
  position_title: string;
  votes_required: number;
  votes_received: number;
}

export default function VoteUrgencyBanner({ orgSlug: orgSlugProp }: { orgSlug?: string }) {
  const { user } = useMultiTenantAuth();
  const { orgSlug: orgSlugParam } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();

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
      className="rounded-2xl px-4 py-3 flex items-center gap-3"
      style={{
        background: `linear-gradient(135deg, ${tk.primary}18 0%, rgba(255,255,255,0.02) 100%)`,
        border: `1px solid ${tk.primary}30`,
      }}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${tk.primary}22`, color: tk.primary }}
      >
        <VoteIcon className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">
          {top.full_name} claimed to be {top.position_title}
        </p>
        <p className="text-[11px]" style={{ color: tk.textSec }}>
          {top.votes_received} of {top.votes_required} confirmations • {pct}% complete
          {extra > 0 ? ` • +${extra} more` : ''}
        </p>
      </div>

      <motion.button
        type="button"
        onClick={handleReview}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
        style={{
          background: `linear-gradient(135deg, ${tk.mint}22 0%, ${tk.mint}10 100%)`,
          color: tk.mint,
          border: `1px solid ${tk.mint}40`,
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
