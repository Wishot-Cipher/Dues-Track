/**
 * TrustBadge — visual indicator of an organization's trust level.
 *
 * Trust levels (from migration 012 — see docs/PAYVEXO_MASTER_BLUEPRINT.md §7):
 *   seed        — pre-loaded from NUC/Wikidata; not yet a live org
 *   community   — user-created; nobody has claimed exec status yet
 *   recognized  — verified exec OR 50+ members
 *   verified    — verified exec + verified email domain
 *   official    — platform-admin-approved
 *
 * The badge is intentionally compact so it can sit inside search result rows,
 * org cards, and headers without dominating the layout. For headers, use
 * size="lg" to get the larger pill with the explanatory tooltip.
 */

import { motion } from 'framer-motion';
import {
  Sparkles,
  Users,
  ShieldCheck,
  BadgeCheck,
  Sprout,
  Info,
} from 'lucide-react';
import type { TrustLevel } from '@/types/multiTenant';
import { useState } from 'react';

interface TrustBadgeProps {
  level: TrustLevel;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;     // hide the text on tight rows
  showTooltip?: boolean;   // hover tooltip explaining what this level means
  className?: string;
}

const META: Record<TrustLevel, {
  label: string;
  short: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ElementType;
  description: string;
}> = {
  official: {
    label: 'Officially Verified',
    short: 'Official',
    color: '#FFD24A',
    bg: 'rgba(255,210,74,0.10)',
    border: 'rgba(255,210,74,0.30)',
    icon: BadgeCheck,
    description:
      'Manually approved by the Payvexo team. Reserved for top-tier institutions and partners.',
  },
  verified: {
    label: 'Verified',
    short: 'Verified',
    color: '#30FFAC',
    bg: 'rgba(48,255,172,0.10)',
    border: 'rgba(48,255,172,0.30)',
    icon: ShieldCheck,
    description:
      'An executive of this organization has verified their institutional email domain.',
  },
  recognized: {
    label: 'Recognized',
    short: 'Recognized',
    color: '#5B9BFF',
    bg: 'rgba(91,155,255,0.10)',
    border: 'rgba(91,155,255,0.28)',
    icon: Sparkles,
    description:
      'Has a verified executive OR more than 50 active members — well established.',
  },
  community: {
    label: 'Community',
    short: 'Community',
    color: '#FF6803',
    bg: 'rgba(255,104,3,0.12)',
    border: 'rgba(255,104,3,0.30)',
    icon: Users,
    description:
      'Created by a member of the community. No executive has claimed it yet — anyone can.',
  },
  seed: {
    label: 'Not yet on Payvexo',
    short: 'Available',
    color: '#9CA3AF',
    bg: 'rgba(156,163,175,0.10)',
    border: 'rgba(156,163,175,0.25)',
    icon: Sprout,
    description:
      'Listed by NUC / NBTE but not yet activated on Payvexo. Be the first to bring your school here.',
  },
};

const SIZE: Record<NonNullable<TrustBadgeProps['size']>, {
  padding: string;
  text: string;
  icon: number;
  gap: string;
  radius: string;
}> = {
  sm: { padding: 'px-2 py-0.5',   text: 'text-[10px]', icon: 11, gap: 'gap-1',   radius: 'rounded-md' },
  md: { padding: 'px-2.5 py-1',   text: 'text-[11px]', icon: 12, gap: 'gap-1.5', radius: 'rounded-lg' },
  lg: { padding: 'px-3.5 py-1.5', text: 'text-xs',     icon: 14, gap: 'gap-2',   radius: 'rounded-xl' },
};

export default function TrustBadge({
  level,
  size = 'md',
  showLabel = true,
  showTooltip = false,
  className = '',
}: TrustBadgeProps) {
  const m = META[level];
  const s = SIZE[size];
  const Icon = m.icon;
  const [tipOpen, setTipOpen] = useState(false);

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <motion.span
        className={`inline-flex items-center font-semibold tracking-wide ${s.padding} ${s.text} ${s.gap} ${s.radius}`}
        style={{
          color: m.color,
          background: m.bg,
          border: `1px solid ${m.border}`,
        }}
        whileHover={showTooltip ? { y: -1 } : undefined}
        onHoverStart={() => showTooltip && setTipOpen(true)}
        onHoverEnd={() => showTooltip && setTipOpen(false)}
      >
        <Icon style={{ width: s.icon, height: s.icon }} />
        {showLabel && <span>{size === 'sm' ? m.short : m.label}</span>}
        {showTooltip && (
          <Info
            style={{ width: s.icon - 2, height: s.icon - 2, opacity: 0.5 }}
          />
        )}
      </motion.span>

      {showTooltip && tipOpen && (
        <motion.span
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute left-0 top-full mt-2 z-30 max-w-xs px-3 py-2 rounded-lg text-xs leading-5"
          style={{
            background: 'rgba(15,7,3,0.97)',
            color: 'rgba(255,255,255,0.85)',
            border: `1px solid ${m.border}`,
            backdropFilter: 'blur(8px)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
            width: 260,
          }}
        >
          {m.description}
        </motion.span>
      )}
    </span>
  );
}
