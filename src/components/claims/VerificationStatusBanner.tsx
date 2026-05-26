/**
 * VerificationStatusBanner — surfaces the user's current verification state
 * and the next clear action they should take.
 *
 * Four shapes (the component hides itself in any other state):
 *
 *  ┌─ REGULAR STUDENT (no exec claim, no admin row) ─────────────┐
 *  │ "You created this org — invite your people"                  │
 *  │ Invite panel with WhatsApp, Copy, Share                      │
 *  │ Dismissable after first view                                 │
 *  └──────────────────────────────────────────────────────────────┘
 *
 *  ┌─ NOT ADMIN (hasn't claimed yet) ────────────────────────────┐
 *  │ "Want to manage this organization?"                          │
 *  │ Brief explainer + [Claim a role →] button                    │
 *  │ + Invite panel below (always visible even without exec role) │
 *  └──────────────────────────────────────────────────────────────┘
 *
 *  ┌─ ADMIN, NOT YET VERIFIED (layer 0–2) ───────────────────────┐
 *  │ "Your [Founder / Treasurer / ...] role is pending"           │
 *  │ Progress: Layer X of 4 · "Money unlocks at Layer N"          │
 *  │ [Submit verification →]                                      │
 *  │ + Invite panel                                               │
 *  └──────────────────────────────────────────────────────────────┘
 *
 *  ┌─ ADMIN, PEER-VOTED BUT WAITING FOR PARENT (layer 3) ────────┐
 *  │ "Your role is peer-verified. Waiting for [parent role]."     │
 *  │ + Invite panel (bootstrap path only)                         │
 *  └──────────────────────────────────────────────────────────────┘
 *
 * Hidden entirely when the user is layer >= 4 (fully verified).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Copy,
  Hourglass,
  Link2,
  Loader2,
  MessageCircle,
  PartyPopper,
  Share2,
  ShieldCheck,
  Users,
  Vote as VoteIcon,
  X as XIcon,
} from 'lucide-react';
import { APP_NAME } from '@/config/constants';
import { supabase } from '@/config/supabase';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
import organizationService from '@/services/organizationService';

// ─────────────────────────────────────────────────────────────────────────
// Local types
// ─────────────────────────────────────────────────────────────────────────
type AdminRow = {
  id: string;
  role_label: string | null;
  role: string;
  verification_layer: number;
  verification_status: string | null;
  scope_level: string;
};

type PendingClaim = {
  id: string;
  position_title: string;
  bootstrap_path: boolean;
  votes_received: number;
  votes_required: number;
  current_layer: number;
  required_layer: number;
};

type BannerTokens = {
  primary:    string;
  amber:      string;
  mint:       string;
  blue:       string;
  border:     string;
  text:       string;
  textSec:    string;
  textTer:    string;
  danger:     string;
  card:       string;
  gradOrange: string;
  cardBorder: string;
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/** Case-insensitive partial keyword match against org type string */
function orgTypeIs(orgType: string, keywords: string[]): boolean {
  const lower = orgType.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

/**
 * Resolves a human-readable label for what was created.
 * e.g. "your 300L Civil Engineering class" or "your Mechanical Engineering department"
 */
function resolveOrgLabel({
  orgName,
  orgType,
  level,
  department,
  session,
}: {
  orgName:    string;
  orgType:    string;
  level?:     string | null;
  department?: string | null;
  session?:   string | null;
}): string {
  const sessionTag = session ? ` (${session})` : '';

  if (orgTypeIs(orgType, ['class', 'set', 'level'])) {
    const lvl = level ? `${level} ` : '';
    const dep = department ? `${department} ` : '';
    return `the *${lvl}${dep}class${sessionTag}*`;
  }
  if (orgTypeIs(orgType, ['department', 'dept'])) {
    return `the *${orgName} department${sessionTag}*`;
  }
  if (orgTypeIs(orgType, ['faculty', 'college', 'school', 'university', 'academic'])) {
    return `the *${orgName}${sessionTag}*`;
  }
  if (orgTypeIs(orgType, ['church', 'chapel', 'parish', 'mosque', 'fellowship', 'ministry'])) {
    return `*${orgName}*`;
  }
  if (orgTypeIs(orgType, ['club', 'association', 'society', 'union', 'ngo', 'cooperative'])) {
    return `*${orgName}*`;
  }
  return `*${orgName}*`;
}

/**
 * Builds a rich, dynamic WhatsApp message.
 *
 * Two modes:
 *   isExec = true  → person is claiming/has claimed an exec role
 *   isExec = false → regular student who just created the org,
 *                    just wants people to join
 *
 * Org-type branches: Academic · Church · Club/NGO · Corporate · Default
 * The invite link is embedded inside the body — no duplicate URL append.
 */
function buildWhatsAppMessage({
  orgName,
  orgType,
  orgDisplayLabel,
  inviteLink,
  inviteCode,
  memberName,
  appName,
  votesRequired,
  isExec,
  level,
  department,
  session,
}: {
  orgName:         string;
  orgType:         string;
  orgDisplayLabel: string;
  inviteLink:      string;
  inviteCode:      string;
  memberName:      string;
  appName:         string;
  votesRequired:   number;
  isExec:          boolean;
  level?:          string | null;
  department?:     string | null;
  session?:        string | null;
}): string {
  const codeLine  = inviteCode  ? `\n\n🔑 Or enter code manually: *${inviteCode}*` : '';
  const linkLine  = inviteLink  ? `\n\n👉 ${inviteLink}`                           : '';
  const lvlTag    = level       ? ` ${level}`                                       : '';
  const sessionTag = session    ? ` — ${session}`                                   : '';

  // ── ACADEMIC ───────────────────────────────────────────────────────────
  if (orgTypeIs(orgType, ['university', 'school', 'academic', 'department',
                           'dept', 'faculty', 'college', 'class', 'set', 'level'])) {
    if (!isExec) {
      // Regular student who created the org — just wants people to join
      return `Hey everyone 👋

I just created ${orgDisplayLabel} on *${appName}* — a platform for managing our dues and payments digitally.

What this means for us:
✅ Pay dues from your phone in seconds
✅ Get an instant receipt — no uploads, no drama
✅ See exactly what's owed and what's been paid
✅ No more cash stress or "did you pay?" arguments

I'm not the class rep — but someone needs to set this up before dues season hits. Join now so we're ready when exams approach and money starts moving.${linkLine}

Once enough of us are in, whoever is our exec can claim the org and we go live immediately 🚀${codeLine}

— ${memberName}${lvlTag}${department ? `, ${department}` : ''}${sessionTag}`;
    }

    // Exec claiming their role
    return `Hey everyone 👋

I just set up ${orgDisplayLabel} on *${appName}* — a platform that handles our dues and payments digitally. No more cash, no more spreadsheets, no more "I sent it, check again."

Here's what it means for you:
✅ Pay your dues from your phone in seconds
✅ Get an instant receipt — no uploads, no drama
✅ See exactly what's been collected and what's outstanding
✅ No more chasing anyone for proof of payment

Before we go live I need you to *confirm me* as your exec. It takes literally *10 seconds* — just tap the link below and hit confirm.${linkLine}

Once we hit *${votesRequired} confirmations* our org goes live automatically and dues collection begins.

Please do this now — it's the only thing standing between us and a properly organised system 🙏${codeLine}

— ${memberName}${lvlTag}${department ? `, ${department}` : ''}${sessionTag}`;
  }

  // ── CHURCH / RELIGIOUS ─────────────────────────────────────────────────
  if (orgTypeIs(orgType, ['church', 'chapel', 'parish', 'mosque',
                           'fellowship', 'ministry', 'religious',
                           'cathedral', 'diocese', 'synagogue'])) {
    if (!isExec) {
      return `Greetings family 🙏

I just created *${orgName}* on *${appName}* — a platform that makes it easy to manage our tithes, offerings, dues, and contributions digitally.

What this means for our family:
✅ Give from anywhere — phone, anytime
✅ Every contribution recorded and receipted automatically
✅ Full transparency for all members
✅ No more manual cash counting or lost records

Join us using the link below — it takes *30 seconds* to get set up.${linkLine}

Once our leadership is in place and verified, we'll be fully live. Come join the family 🙏${codeLine}

— ${memberName}`;
    }

    return `Greetings family 🙏

We've set up *${orgName}* on *${appName}* — a platform that makes it easy to manage our tithes, offerings, dues, and contributions digitally. Every kobo accounted for, every member receipted.

What this means for our family:
✅ Give from anywhere — phone, anytime
✅ Every contribution recorded and receipted automatically
✅ Full transparency for leadership and members alike
✅ No more manual cash counting, lost records, or disputes

I need you to *confirm my role* as your exec before we can go live. It only takes *10 seconds* — just tap the link below.${linkLine}

Together we build something that honours how we steward what we've been given. Please tap and confirm — God bless you 🙏${codeLine}

— ${memberName}`;
  }

  // ── CLUB / ASSOCIATION / NGO / COOPERATIVE ─────────────────────────────
  if (orgTypeIs(orgType, ['club', 'association', 'ngo', 'society',
                           'union', 'cooperative', 'community',
                           'foundation', 'network'])) {
    if (!isExec) {
      return `Hello everyone 👋

I just set up *${orgName}* on *${appName}* — a platform for managing our dues and payments properly.

What you get:
✅ Pay dues digitally — no cash, no queues
✅ Instant receipts for every payment
✅ Full financial transparency for all members
✅ No more disputes over who paid and who didn't

Join using the link below — it's free and takes *30 seconds.*${linkLine}

Once our exec is set up and verified, we go fully live. The more of us that join early, the faster everything moves 💪${codeLine}

— ${memberName}`;
    }

    return `Hello everyone 👋

We're taking *${orgName}* to the next level — our dues and payments are now managed on *${appName}*.

Here's why this matters:
✅ Pay your dues digitally — no cash, no queues
✅ Instant receipts for every payment
✅ Full financial transparency for all members
✅ Executives can track who has paid at a glance
✅ No more disputes over "I paid already"

To get started I need *your confirmation* — just tap below and confirm my role. Takes *10 seconds.*${linkLine}

I need *${votesRequired} confirmations* to unlock the platform. Once we're live, everything changes for the better 💪${codeLine}

— ${memberName}`;
  }

  // ── CORPORATE / PROFESSIONAL ───────────────────────────────────────────
  if (orgTypeIs(orgType, ['company', 'corporate', 'professional',
                           'firm', 'enterprise', 'business',
                           'agency', 'bureau', 'institute'])) {
    if (!isExec) {
      return `Hi team,

I've set up *${orgName}* on *${appName}* to streamline how we manage dues, contributions, and internal payments.

Benefits for the team:
✅ Digital payments — no cash handling
✅ Automated receipts and records for every transaction
✅ Real-time financial visibility
✅ Eliminates manual reconciliation entirely

Please join using the link below — takes *under a minute.*${linkLine}

Once leadership is verified we'll be fully operational.${codeLine}

— ${memberName}`;
    }

    return `Hi team,

I've set up *${orgName}* on *${appName}* to streamline how we manage dues, contributions, and internal payments going forward.

Benefits for the team:
✅ Digital payments — no cash handling
✅ Automated receipts and records for every transaction
✅ Real-time financial visibility for leadership
✅ Audit-ready transaction history
✅ Eliminates manual reconciliation entirely

To activate the platform I need your confirmation of my role. Please tap the link below — it takes *under a minute.*${linkLine}

I need *${votesRequired} confirmations* to go live. Your support is appreciated.${codeLine}

— ${memberName}`;
  }

  // ── DEFAULT FALLBACK ───────────────────────────────────────────────────
  if (!isExec) {
    return `Hello! 👋

I just created *${orgName}* on *${appName}* — the smarter way to manage group dues and payments.

✅ Pay digitally — no cash needed
✅ Instant receipts for every payment
✅ Full financial transparency
✅ No more manual records or disputes

Join using the link below — it's free and takes *30 seconds.*${linkLine}

Once our exec is set up, we go fully live 🚀${codeLine}

— ${memberName}`;
  }

  return `Hello! 👋

*${orgName}* is now on *${appName}* — the smarter way to manage group dues and payments.

✅ Pay digitally — no cash needed
✅ Instant receipts for every payment
✅ Full financial transparency
✅ No more manual records or disputes

I need *${votesRequired} members* to confirm my exec role. Tap the link — takes *10 seconds.*${linkLine}

Thank you! 🙏${codeLine}

— ${memberName}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────
export default function VerificationStatusBanner() {
  const navigate   = useNavigate();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { user, organization, group } = useMultiTenantAuth();
  const memberId = user?.id;
  const orgId    = organization?.id;

  // ── Theme ──────────────────────────────────────────────────────────────
  const { theme } = useTheme();
  const t  = getDashboardTokens(theme);
  const tk: BannerTokens = {
    primary:    t.primary,
    amber:      t.amber,
    mint:       t.mint,
    blue:       t.blue,
    border:     t.cardBorder,
    text:       t.text,
    textSec:    t.textSec,
    textTer:    t.textTer,
    danger:     t.danger,
    card:       t.card,
    gradOrange: t.gradOrange,
    cardBorder: t.cardBorder,
  };

  const [adminRow,      setAdminRow]      = useState<AdminRow | null>(null);
  const [pendingClaim,  setPendingClaim]  = useState<PendingClaim | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [dismissed,     setDismissed]     = useState(false);
  const [lastSeenVotes, setLastSeenVotes] = useState<number | null>(null);
  const [inviteLink,    setInviteLink]    = useState('');
  const [inviteCode,    setInviteCode]    = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCopied,  setInviteCopied]  = useState(false);
  const [inviteError,   setInviteError]   = useState('');

  // ── Storage keys ───────────────────────────────────────────────────────
  const dismissKey = memberId && orgId
    ? `pvx_claim_banner_dismissed_${orgId}_${memberId}`
    : null;

  const progressKey = pendingClaim && memberId
    ? `pvx_claim_progress_${pendingClaim.id}_${memberId}`
    : null;

  const inviteStorageKey = orgId && memberId
    ? `pvx_invite_${orgId}_${memberId}`
    : null;

  // ── Data fetching ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!memberId || !orgId) { setLoading(false); return; }

    (async () => {
      setLoading(true);

      const { data: admins } = await supabase
        .from('member_admins')
        .select('id, role, role_label, verification_layer, verification_status, scope_level')
        .eq('member_id', memberId)
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('verification_layer', { ascending: false })
        .order('created_at',         { ascending: false })
        .limit(1);

      const { data: claims } = await supabase
        .from('claim_requests')
        .select('id, position_title, bootstrap_path, votes_received, votes_required, current_layer, required_layer')
        .eq('claimant_user_id', memberId)
        .eq('organization_id', orgId)
        .in('status', ['awaiting_votes', 'submitted', 'under_review'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (!cancelled) {
        setAdminRow((admins  ?? [])[0] as AdminRow    | null ?? null);
        setPendingClaim((claims ?? [])[0] as PendingClaim | null ?? null);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [memberId, orgId]);

  // ── Persist dismiss ────────────────────────────────────────────────────
  useEffect(() => {
    if (!dismissKey) return;
    try { setDismissed(localStorage.getItem(dismissKey) === '1'); } catch { /* ignore */ }
  }, [dismissKey]);

  // ── Vote progress tracking ─────────────────────────────────────────────
  useEffect(() => {
    if (!progressKey) { setLastSeenVotes(null); return; }
    try {
      const stored = localStorage.getItem(progressKey);
      setLastSeenVotes(stored ? Number(stored) : 0);
    } catch { setLastSeenVotes(0); }
  }, [progressKey]);

  useEffect(() => {
    if (!progressKey || !pendingClaim || lastSeenVotes === null) return;
    if (pendingClaim.votes_received > lastSeenVotes) {
      try { localStorage.setItem(progressKey, String(pendingClaim.votes_received)); }
      catch { /* ignore */ }
    }
  }, [progressKey, pendingClaim, lastSeenVotes]);

  // ── Cached invite link ─────────────────────────────────────────────────
  useEffect(() => {
    if (!inviteStorageKey) return;
    try {
      const raw = localStorage.getItem(inviteStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { code?: string; link?: string };
      if (parsed?.link) { setInviteLink(parsed.link); setInviteCode(parsed.code || ''); }
    } catch { /* ignore */ }
  }, [inviteStorageKey]);

  // ── Variant resolution ─────────────────────────────────────────────────
  const variant = useMemo(() => {
    if (loading) return 'hidden';
    // Fully verified — banner not needed at all
    if (adminRow && adminRow.verification_layer >= 4) return 'hidden';
    if (pendingClaim)  return 'in_progress';
    if (adminRow && adminRow.verification_layer < 4) return 'unverified_admin';
    return 'not_admin'; // covers both regular students and non-exec org creators
  }, [loading, adminRow, pendingClaim]);

  // Whether to show the invite panel (always true — even for non-execs)
  const showInvitePanel = true;

  // Is this person acting as / trying to be an exec?
  const isExec = Boolean(adminRow || pendingClaim);

  const goToClaim = () => navigate(`/${orgSlug}/claim`);

  const handleDismiss = () => {
    if (!dismissKey) return;
    try { localStorage.setItem(dismissKey, '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  // ── Org display label (human-readable description of what was created) ─
  const orgDisplayLabel = useMemo(() => resolveOrgLabel({
    orgName:    organization?.name    || '',
    orgType:    organization?.organization_type || '',
    level:      user?.level           || group?.levels?.[0] || null,
    department: group?.name           || null,
    session:    null, // wire in academic session when available
  }), [organization, user?.level, group]);

  // ── Dynamic WhatsApp message ───────────────────────────────────────────
  const whatsAppMessage = useMemo(() => {
    if (!organization || !inviteLink) return '';
    return buildWhatsAppMessage({
      orgName:         organization.name,
      orgType:         organization.organization_type || '',
      orgDisplayLabel,
      inviteLink,
      inviteCode,
      memberName:      user?.full_name  || 'A member',
      appName:         APP_NAME,
      votesRequired:   pendingClaim?.votes_required ?? 7,
      isExec,
      level:           user?.level      || group?.levels?.[0] || null,
      department:      group?.name      || null,
      session:         null,
    });
  }, [
    organization, inviteLink, inviteCode,
    user?.full_name, user?.level,
    pendingClaim?.votes_required,
    isExec, orgDisplayLabel, group,
  ]);

  // Short plain-text message for native share sheet (no markdown)
  const inviteMessage = useMemo(() => {
    if (!organization) return '';
    const code = inviteCode ? ` Use code: ${inviteCode}.` : '';
    return `You're invited to join ${organization.name} on ${APP_NAME}.${code}`;
  }, [organization, inviteCode]);

  // ── Invite link helpers ────────────────────────────────────────────────
  const saveInvite = useCallback((code: string, link: string) => {
    setInviteCode(code);
    setInviteLink(link);
    if (!inviteStorageKey) return;
    try { localStorage.setItem(inviteStorageKey, JSON.stringify({ code, link })); }
    catch { /* ignore */ }
  }, [inviteStorageKey]);

  const generateInviteLink = useCallback(async () => {
    if (!organization) return;
    // For non-execs, adminRow may be null — pass the member's own id as creator
    const createdBy = adminRow?.id || memberId;
    if (!createdBy) return;
    setInviteLoading(true);
    setInviteError('');
    try {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const invite = await organizationService.createInvite({
        organization_id: organization.id,
        group_id:        group?.id,
        invite_type:     'bulk',
        max_uses:        200,
        expires_at:      expiresAt,
        created_by:      createdBy,
      });
      if (!invite?.invite_code) {
        setInviteError('Unable to create invite link right now.');
        return;
      }
      const link = `${window.location.origin}/${organization.slug}/join?code=${invite.invite_code}`;
      saveInvite(invite.invite_code, link);
    } catch {
      setInviteError('Unable to create invite link right now.');
    } finally {
      setInviteLoading(false);
    }
  }, [organization, adminRow, memberId, group?.id, saveInvite]);

  const copyInviteLink = useCallback(async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
    } catch {
      const el = document.createElement('textarea');
      el.value = inviteLink;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  }, [inviteLink]);

  const shareInviteLink = useCallback(async () => {
    if (!inviteLink) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: organization ? `Join ${organization.name}` : 'Join',
          text:  inviteMessage,
          url:   inviteLink,
        });
        return;
      } catch { /* cancelled */ }
    }
    await copyInviteLink();
  }, [inviteLink, inviteMessage, organization, copyInviteLink]);

  // WhatsApp — rich formatted message with embedded link
  const shareInviteWhatsapp = useCallback(() => {
    if (!inviteLink || !whatsAppMessage) return;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(whatsAppMessage.trim())}`,
      '_blank',
      'noopener,noreferrer',
    );
  }, [inviteLink, whatsAppMessage]);

  // ── Auto-generate invite for admins + all non-exec org creators ────────
  useEffect(() => {
    if (inviteLink || inviteLoading) return;
    // Always auto-generate — every user on this banner should have an invite link
    void generateInviteLink();
  }, [inviteLink, inviteLoading, generateInviteLink]);

  if (variant === 'hidden') return null;
  if (variant === 'not_admin' && dismissed) return null;

  // ── Shared invite panel props ──────────────────────────────────────────
  const invitePanelProps = {
    tk,
    inviteLink,
    inviteCode,
    inviteLoading,
    inviteCopied,
    inviteError,
    onGenerate:  generateInviteLink,
    onCopy:      copyInviteLink,
    onShare:     shareInviteLink,
    onWhatsapp:  shareInviteWhatsapp,
    canGenerate: showInvitePanel,
    whatsAppMessage,
    orgType:     organization?.organization_type || '',
    isExec,
  };

  // ── Variant: in-progress claim ─────────────────────────────────────────
  if (variant === 'in_progress' && pendingClaim) {
    if (lastSeenVotes === null) return null;
    if (pendingClaim.votes_received <= lastSeenVotes) return null;

    const pct = Math.min(100, Math.round(
      (pendingClaim.votes_received / Math.max(1, pendingClaim.votes_required)) * 100,
    ));
    const stillNeeds = Math.max(0, pendingClaim.votes_required - pendingClaim.votes_received);

    return (
      <BannerShell
        accent={tk.amber}
        icon={<Hourglass className="w-4 h-4" />}
        eyebrow="Verification in progress"
        tk={tk}
      >
        <p className="text-sm font-bold mb-1" style={{ color: tk.text }}>
          Your claim as{' '}
          <span style={{ color: tk.amber }}>{pendingClaim.position_title}</span>{' '}
          is awaiting confirmation
        </p>
        <p className="text-xs leading-5 mb-3" style={{ color: tk.textSec }}>
          {pendingClaim.bootstrap_path ? (
            <>
              You need{' '}
              <span className="font-semibold" style={{ color: tk.text }}>{stillNeeds}</span>{' '}
              more member {stillNeeds === 1 ? 'confirmation' : 'confirmations'} to unlock
              admin access. Share the link below to speed this up.
            </>
          ) : (
            <>
              Peer votes:{' '}
              <span className="font-semibold" style={{ color: tk.text }}>
                {pendingClaim.votes_received}
              </span>
              /
              <span className="font-semibold" style={{ color: tk.text }}>
                {pendingClaim.votes_required}
              </span>
              . Your verified parent-org exec will confirm once they review — money unlocks then.
            </>
          )}
        </p>

        {/* Progress bar */}
        <div className="h-1 rounded-full overflow-hidden mb-1" style={{ background: t.cardBorder }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: `linear-gradient(90deg, ${tk.amber}, ${tk.mint})` }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
        <p className="text-[10px] mb-3" style={{ color: tk.textTer }}>
          {pendingClaim.votes_received} of {pendingClaim.votes_required} confirmations received
        </p>

        <InviteMembersPanel {...invitePanelProps} />
      </BannerShell>
    );
  }

  // ── Variant: admin but unverified ──────────────────────────────────────
  if (variant === 'unverified_admin' && adminRow) {
    const roleLabel = adminRow.role_label || adminRow.role || 'admin';
    return (
      <BannerShell
        accent={tk.amber}
        icon={<ShieldCheck className="w-4 h-4" />}
        eyebrow="Verify your role"
        onClick={goToClaim}
        tk={tk}
      >
        <p className="text-sm font-bold mb-1" style={{ color: tk.text }}>
          Your <span style={{ color: tk.amber }}>{roleLabel}</span> role isn't verified yet
        </p>
        <p className="text-xs leading-5 mb-3" style={{ color: tk.textSec }}>
          You're set up as an admin but can't publish dues or move money until you verify.
          Submit your verification, get members to confirm you, and you're unlocked.
        </p>
        <Cta label="Submit verification" accent={tk.amber} />
        <InviteMembersPanel {...invitePanelProps} />
      </BannerShell>
    );
  }

  // ── Variant: not_admin — covers both regular students AND non-exec
  //    org creators. Always shows invite panel. Dismissable.
  return (
    <BannerShell
      accent={tk.primary}
      icon={isExec ? <VoteIcon className="w-4 h-4" /> : <PartyPopper className="w-4 h-4" />}
      eyebrow={isExec ? 'Help run this organization' : 'You created this org 🎉'}
      onDismiss={handleDismiss}
      tk={tk}
    >
      {isExec ? (
        <>
          <p className="text-sm font-bold mb-1" style={{ color: tk.text }}>
            Are you the{' '}
            {organization?.payment_label?.toLowerCase().includes('tithe')
              ? 'treasurer'
              : 'class rep'}
            , a treasurer, or another exec?
          </p>
          <p className="text-xs leading-5 mb-3" style={{ color: tk.textSec }}>
            Claim your role and we'll get your fellow members to confirm you. Once verified,
            you can publish dues, manage members, and track payments — all in one place.
          </p>
          <div className="mb-4" onClick={goToClaim} style={{ cursor: 'pointer' }}>
            <Cta label="Claim a role" accent={tk.primary} />
          </div>
        </>
      ) : (
        <>
          <p className="text-sm font-bold mb-1" style={{ color: tk.text }}>
            {orgDisplayLabel} is ready — now get your people in
          </p>
          <p className="text-xs leading-5 mb-3" style={{ color: tk.textSec }}>
            You created this org but you don't have to be the exec. Share the link below
            so your classmates or members can join — and whoever is the actual rep can claim
            the org once they're in. You can also claim a role yourself anytime.
          </p>
          <div className="mb-4" onClick={goToClaim} style={{ cursor: 'pointer' }}>
            <Cta label="Claim a role yourself" accent={tk.primary} />
          </div>
        </>
      )}

      {/* Invite panel — always shown regardless of exec status */}
      <InviteMembersPanel {...invitePanelProps} />
    </BannerShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// BannerShell
// ─────────────────────────────────────────────────────────────────────────
function BannerShell({
  accent, icon, eyebrow, children, onClick, onDismiss, tk,
}: {
  accent:     string;
  icon:       React.ReactNode;
  eyebrow:    string;
  children:   React.ReactNode;
  onClick?:   () => void;
  onDismiss?: () => void;
  tk:         BannerTokens;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onClick={onClick}
      className="rounded-3xl p-5 sm:p-6 relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${accent}14 0%, ${tk.card} 100%)`,
        border:     `1px solid ${accent}30`,
        cursor:     onClick ? 'pointer' : 'default',
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 50% 60% at 100% 0%, ${accent}28, transparent)`,
        }}
      />
      <div className="relative">
        {onDismiss && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            className="absolute right-0 top-0 p-1 rounded-lg transition-opacity hover:opacity-70"
            style={{ color: `${accent}AA` }}
            aria-label="Dismiss"
          >
            <XIcon className="w-4 h-4" />
          </button>
        )}
        <div className="flex items-center gap-2 mb-2">
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: `${accent}22`, color: accent }}
          >
            {icon}
          </span>
          <p className="text-[10px] uppercase tracking-[0.18em] font-bold" style={{ color: accent }}>
            {eyebrow}
          </p>
        </div>
        {children}
      </div>
    </motion.section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Cta
// ─────────────────────────────────────────────────────────────────────────
function Cta({ label, accent }: { label: string; accent: string }) {
  return (
    <motion.span
      className="inline-flex items-center gap-1.5 text-xs font-bold"
      whileHover={{ x: 2 }}
      style={{ color: accent }}
    >
      {label}
      <ArrowRight className="w-3.5 h-3.5" />
    </motion.span>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// InviteMembersPanel
// ─────────────────────────────────────────────────────────────────────────
function InviteMembersPanel({
  tk, inviteLink, inviteCode, inviteLoading, inviteCopied,
  inviteError, onGenerate, onCopy, onShare, onWhatsapp,
  canGenerate, whatsAppMessage, orgType, isExec,
}: {
  tk:              BannerTokens;
  inviteLink:      string;
  inviteCode:      string;
  inviteLoading:   boolean;
  inviteCopied:    boolean;
  inviteError:     string;
  onGenerate:      () => void;
  onCopy:          () => void | Promise<void>;
  onShare:         () => void | Promise<void>;
  onWhatsapp:      () => void;
  canGenerate:     boolean;
  whatsAppMessage: string;
  orgType:         string;
  isExec:          boolean;
}) {
  const [showPreview, setShowPreview] = useState(false);

  // Sub-heading copy changes per org type and exec status
  const panelSubheading = (() => {
    if (!isExec) {
      if (orgTypeIs(orgType, ['church', 'chapel', 'fellowship', 'ministry'])) {
        return 'Share the link with your family so they can join and be ready when dues go live.';
      }
      if (orgTypeIs(orgType, ['company', 'corporate', 'firm', 'professional'])) {
        return 'Share the link with your team so they can join before your exec sets things up.';
      }
      return 'Share the link with your classmates or members so they can join while things get set up.';
    }
    if (orgTypeIs(orgType, ['church', 'chapel', 'fellowship', 'ministry'])) {
      return 'Share with the family — the more who join and confirm you, the faster your org goes live.';
    }
    if (orgTypeIs(orgType, ['company', 'corporate', 'firm', 'professional'])) {
      return 'Share with the team — confirmations get you verified and the platform live.';
    }
    return 'Share with your group — the more who confirm you, the faster your org goes live.';
  })();

  return (
    <div
      className="mt-4 rounded-2xl p-4 relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${tk.primary}12 0%, ${tk.card} 100%)`,
        border:     `1px solid ${tk.primary}30`,
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 50% 60% at 100% 0%, ${tk.primary}22, transparent)`,
        }}
      />
      <div className="relative">
        {/* Panel header */}
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: `${tk.primary}22`, color: tk.primary }}
          >
            <Users className="w-4 h-4" />
          </span>
          <p className="text-[10px] uppercase tracking-[0.18em] font-bold" style={{ color: tk.primary }}>
            {isExec ? 'Invite members' : 'Invite your people'}
          </p>
        </div>

        <p className="text-xs leading-5 mb-3" style={{ color: tk.textSec }}>
          {panelSubheading}
        </p>

        {/* No link yet */}
        {!inviteLink ? (
          <button
            type="button"
            onClick={onGenerate}
            disabled={inviteLoading || !canGenerate}
            className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl transition-all"
            style={{
              background: `${tk.primary}18`,
              color:      tk.primary,
              border:     `1px solid ${tk.primary}35`,
              opacity:    inviteLoading || !canGenerate ? 0.6 : 1,
            }}
          >
            {inviteLoading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Link2   className="w-3.5 h-3.5" />}
            {inviteLoading ? 'Creating link…' : 'Generate invite link'}
          </button>
        ) : (
          <div className="grid gap-3">

            {/* Link pill */}
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border:     `1px solid ${tk.primary}20`,
              }}
            >
              <Link2 className="w-3 h-3 shrink-0" style={{ color: tk.primary }} />
              <p className="flex-1 text-[10px] font-mono truncate" style={{ color: tk.textSec }}>
                {inviteLink}
              </p>
              {inviteCode && (
                <span
                  className="shrink-0 px-1.5 py-0.5 rounded-lg text-[10px] font-bold tracking-wider"
                  style={{ background: `${tk.primary}18`, color: tk.primary }}
                >
                  {inviteCode}
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {/* WhatsApp — primary CTA */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onWhatsapp(); }}
                className="inline-flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: 'rgba(37,211,102,0.14)',
                  color:      '#25D366',
                  border:     '1px solid rgba(37,211,102,0.28)',
                }}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                WhatsApp
              </button>

              {/* Copy */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); void onCopy(); }}
                className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: inviteCopied ? 'rgba(16,185,129,0.14)' : `${tk.primary}14`,
                  color:      inviteCopied ? '#10B981'               : tk.primary,
                  border:     `1px solid ${inviteCopied ? 'rgba(16,185,129,0.3)' : `${tk.primary}28`}`,
                }}
              >
                <Copy className="w-3.5 h-3.5" />
                {inviteCopied ? 'Copied!' : 'Copy link'}
              </button>

              {/* Native share */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); void onShare(); }}
                className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: 'rgba(139,92,246,0.12)',
                  color:      '#8B5CF6',
                  border:     '1px solid rgba(139,92,246,0.25)',
                }}
              >
                <Share2 className="w-3.5 h-3.5" />
                Share
              </button>
            </div>

            {/* Message preview */}
            {whatsAppMessage && (
              <div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowPreview((v) => !v); }}
                  className="text-[10px] font-medium transition-opacity hover:opacity-80"
                  style={{ color: tk.textTer }}
                >
                  {showPreview ? '▲ Hide message preview' : '▼ Preview the WhatsApp message'}
                </button>
                {showPreview && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-2 p-3 rounded-xl text-[10px] leading-relaxed overflow-y-auto max-h-48"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border:     `1px solid ${tk.primary}18`,
                      color:      tk.textSec,
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak:  'break-word',
                    }}
                  >
                    {whatsAppMessage}
                  </motion.div>
                )}
              </div>
            )}
          </div>
        )}

        {inviteError && (
          <p className="text-[10px] mt-2" style={{ color: tk.danger }}>{inviteError}</p>
        )}
      </div>
    </div>
  );
}