/**
 * ShareClassLinkCard — surfaces a "Share this class" call-out on the
 * student dashboard.
 *
 * Why it exists: under the opt-in claim model, the founder of a class
 * is just a member — they have no admin row, so the old
 * organizationService.createInvite() couldn't help them. This card
 * calls the new SECURITY DEFINER RPC `create_member_join_invite()`,
 * which lets ANY class member share a join code for THEIR class
 * (member-only, no role grant). It unblocks app growth: even a class
 * that no one has claimed can still take on new members.
 *
 * UX flow:
 *   1. Tap "Share class link" → spinner → RPC returns an 8-char code
 *   2. Modal opens with the code, a copy-to-clipboard, and a
 *      pre-built /join?code=XXX URL the user can paste anywhere
 *   3. Native Web Share API if available (mobile)
 *
 * The card is theme-aware. The CTA is the brand orange so it reads
 * as a primary action.
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Share2, Copy, Check, Loader2, X, Link as LinkIcon, Info, ShieldCheck, Users, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { getDashboardTokens, type ResolvedTheme } from '@/hooks/useTheme';

export interface ShareClassLinkCardProps {
  theme: ResolvedTheme;
  /** organization_members.id of the caller (the current user) */
  memberId: string;
  /** organization_groups.id of the class the user is in */
  groupId: string | null;
  /** Org slug — used to build the public /join URL */
  orgSlug: string;
  /** Friendly class name to show on the card */
  className?: string;
  /** Full organization name. Surfaces in the share modal + message so
   *  the founder can never mistake a class code for a church code,
   *  even when they founded multiple orgs from the same account. */
  orgName?: string;
}

type InviteResult = {
  ok: boolean;
  code?: string;
  invite_code?: string;
  expires_at?: string;
  max_uses?: number;
  detail?: string;
};

type InviteStatus = {
  is_member: boolean;
  is_founder: boolean;
  has_admin: boolean;
  /** Layer 2+ acting admin whose scope covers this class. */
  caller_is_acting_admin?: boolean;
  /** Layer 4+ fully-verified admin — only this gate unlocks /admin/members. */
  caller_is_full_admin?: boolean;
  /** Legacy alias = caller_is_acting_admin. Kept for backwards-compat. */
  caller_is_admin?: boolean;
  founder_name: string | null;
  can_share: boolean;
};

export default function ShareClassLinkCard({
  theme,
  memberId,
  groupId,
  orgSlug,
  className,
  orgName,
}: ShareClassLinkCardProps) {
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ code: string; expiresAt?: string; maxUses?: number } | null>(null);
  const [copied, setCopied] = useState<'code' | 'link' | 'message' | null>(null);
  const [status, setStatus] = useState<InviteStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  // Resolve the caller's relationship to this class so we know whether
  // to render the share card, the founder hint, or nothing at all.
  // We also fully reset the local invite / error / copied state on every
  // context switch — without this, a founder who flips between two orgs
  // they created sees the previous org's code lingering in the modal,
  // which makes it look like the codes have collided across orgs.
  useEffect(() => {
    let cancelled = false;
    setInvite(null);
    setError(null);
    setCopied(null);
    if (!memberId || !groupId) {
      setStatusLoading(false);
      setStatus(null);
      return;
    }
    (async () => {
      setStatusLoading(true);
      const { data, error: rpcErr } = await supabase.rpc('get_class_invite_status', {
        p_caller_member_id: memberId,
        p_group_id: groupId,
      });
      if (cancelled) return;
      if (rpcErr || !data) {
        setStatus(null);
      } else {
        setStatus(data as InviteStatus);
      }
      setStatusLoading(false);
    })();
    return () => { cancelled = true; };
  }, [memberId, groupId]);

  const joinUrl = invite
    ? `${window.location.origin}/${orgSlug}/join?code=${invite.code}`
    : '';

  async function generate() {
    // Optimistic: if the caller is the founder, let them attempt.
    // The RPC is the authority — it will return admin_exists,
    // too_many_active, etc. with a clear message if the action
    // shouldn't go through.
    if (!status?.is_founder || loading) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('create_member_join_invite', {
        p_caller_member_id: memberId,
        p_group_id: groupId,
      });
      if (rpcErr) {
        // Surface what the server actually said so we can debug
        // instead of staring at "could not create a code".
        console.error('[ShareClassLinkCard] RPC error', rpcErr);
        setError(`Server error: ${rpcErr.message || rpcErr.code || 'unknown'}`);
        return;
      }
      const result = data as InviteResult;
      if (!result?.ok) {
        console.warn('[ShareClassLinkCard] RPC returned not-ok', result);
        const map: Record<string, string> = {
          not_a_member: "You're not a member of this class.",
          not_founder: 'Only the class founder can share an invite link right now.',
          group_invalid: 'That class no longer exists.',
          org_mismatch: 'Mismatched organization. Refresh and try again.',
          admin_exists: 'Your class has an exec now — invites go through them.',
          too_many_active: 'You already have an active code — share that one, or wait for it to expire.',
        };
        // Surface the raw server detail on 'unknown' so the next bug
        // doesn't show as a mystery to the user.
        const friendly = map[result?.code ?? ''];
        if (friendly) {
          setError(friendly);
        } else if (result?.detail) {
          setError(`Couldn't create code: ${result.detail}`);
        } else {
          setError(`Couldn't create code (${result?.code ?? 'unknown'}).`);
        }
        return;
      }
      setInvite({
        code: (result.invite_code || '').toUpperCase(),
        expiresAt: result.expires_at,
        maxUses: result.max_uses,
      });
    } catch (e) {
      console.error('[ShareClassLinkCard] generate threw', e);
      setError('Network hiccup. Try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── Share template ──
  // Used by Web Share + "Copy message" — keeps the outgoing message
  // friendly + branded instead of dumping a bare 8-char code into a
  // WhatsApp thread. We name BOTH the org and the group so the
  // recipient knows exactly which community they're being invited
  // into (a founder may run a class AND a church on the same app).
  function buildShareMessage(code: string, url: string): string {
    const where = orgName && className && orgName !== className
      ? `${className} (${orgName})`
      : (className || orgName || 'our group');
    return (
`📣 You're invited to ${where} on Payvexo

Join in 30 seconds — the easiest way to keep track of dues, events and payments together.

🔑 Code: ${code}
🔗 Link: ${url}

This invite expires in 14 days.`
    );
  }

  async function copy(value: string, kind: 'code' | 'link' | 'message') {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError('Could not copy. Long-press to copy manually.');
    }
  }

  async function nativeShare() {
    if (!invite || typeof navigator.share !== 'function') return;
    try {
      const message = buildShareMessage(invite.code, joinUrl);
      await navigator.share({
        title: `Join ${className || 'our class'} on Payvexo`,
        // Web Share spec lets us pass text + url; most chat apps
        // pre-fill both. Falls back to text-only on apps that ignore url.
        text: message,
        url: joinUrl,
      });
    } catch {
      // User cancelled — no-op
    }
  }

  // While status loads, render a skeleton so the layout doesn't jump
  // and the user sees we're working — not just an inert button.
  if (statusLoading) {
    return (
      <div
        className="w-full rounded-2xl p-4 sm:p-5"
        style={{
          background: t.card,
          border: `1px solid ${t.cardBorder}`,
          boxShadow: isLight ? '0 1px 0 rgba(255,255,255,0.85) inset' : 'none',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl shrink-0 animate-pulse"
            style={{ background: isLight ? '#F1EDEA' : 'rgba(255,255,255,0.04)' }}
          />
          <div className="flex-1 space-y-2">
            <div
              className="h-3.5 w-2/5 rounded animate-pulse"
              style={{ background: isLight ? '#F1EDEA' : 'rgba(255,255,255,0.04)' }}
            />
            <div
              className="h-2.5 w-3/4 rounded animate-pulse"
              style={{ background: isLight ? '#F5F1ED' : 'rgba(255,255,255,0.03)' }}
            />
          </div>
        </div>
      </div>
    );
  }

  // If status never resolved (network error etc.), show a calm retry
  // state so the user isn't stuck staring at a dead grey button.
  if (!status) {
    return (
      <div
        className="w-full rounded-2xl p-4 sm:p-5 flex items-center gap-3"
        style={{
          background: t.card,
          border: `1px solid ${t.cardBorder}`,
          boxShadow: isLight ? '0 1px 0 rgba(255,255,255,0.85) inset' : 'none',
        }}
      >
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: isLight ? 'rgba(245,158,11,0.10)' : 'rgba(245,158,11,0.14)',
            color: t.amber,
            border: `1px solid ${isLight ? 'rgba(245,158,11,0.20)' : 'rgba(245,158,11,0.30)'}`,
          }}
        >
          <Info size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: t.text }}>
            Couldn't check invite status
          </p>
          <p className="text-xs mt-0.5" style={{ color: t.textTer }}>
            Tap to retry.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="text-[11px] font-bold px-3 py-1.5 rounded-full"
          style={{ color: t.primary, background: t.primarySoft }}
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Full-admin override ──
  // Only when the caller is a FULL admin (Layer 4+, scope covers
  // this class) do we route them to /admin/members — that page is
  // gated on requireVerified. An email-verified Layer-2 founder can't
  // reach it; if we route them there they'd just be bounced back to
  // /dashboard with nowhere to invite from. So Layer 2 and Layer 3
  // founders keep the bootstrap share card as their working path.
  if (status.caller_is_full_admin) {
    return (
      <button
        type="button"
        onClick={() => navigate(`/${orgSlug}/admin/members`)}
        className="group relative w-full text-left rounded-2xl p-4 sm:p-5 overflow-hidden transition-all active:scale-[0.995]"
        style={{
          background: t.card,
          border: `1px solid ${t.cardBorder}`,
          boxShadow: isLight
            ? '0 1px 0 rgba(255,255,255,0.85) inset, 0 6px 18px -10px rgba(15,7,3,0.10)'
            : '0 1px 0 rgba(255,255,255,0.02) inset',
        }}
      >
        <span
          aria-hidden
          className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full pointer-events-none"
          style={{ background: t.blob1, filter: 'blur(40px)' }}
        />
        <div className="relative flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: t.primarySoft,
              border: `1px solid ${t.primaryRing}`,
              color: t.primary,
            }}
          >
            <Users size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-bold" style={{ color: t.text }}>
                {className ? `Manage invites · ${className}` : 'Manage invites'}
              </p>
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{ background: `${t.primary}18`, color: t.primary }}
              >
                <ShieldCheck className="w-3 h-3" /> Admin
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: t.textTer }}>
              You can invite members, admins, and run bulk codes from the member tools.
            </p>
          </div>
          <ArrowRight
            size={18}
            className="shrink-0 transition-transform group-hover:translate-x-0.5"
            style={{ color: t.primary }}
          />
        </div>
      </button>
    );
  }

  // Class has an admin OTHER than the caller — the gatekeeper has
  // taken over. Card hides; admin invites flow through /admin/members.
  if (status.has_admin && !status.is_founder) return null;
  // Founder + has_admin (their own admin row) is fine — they keep
  // their share button. The has_admin flag from the server is
  // specifically "other than the founder" now (mig 083).

  // Non-founders get a quiet hint pointing at the founder, not a CTA.
  if (!status.can_share && !status.is_founder) {
    return (
      <div
        className="relative w-full rounded-2xl p-4 sm:p-5 overflow-hidden"
        style={{
          background: t.card,
          border: `1px solid ${t.cardBorder}`,
          boxShadow: isLight
            ? '0 1px 0 rgba(255,255,255,0.85) inset, 0 6px 18px -10px rgba(15,7,3,0.10)'
            : '0 1px 0 rgba(255,255,255,0.02) inset',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: isLight ? 'rgba(91, 155, 255, 0.10)' : 'rgba(91, 155, 255, 0.14)',
              border: `1px solid ${isLight ? 'rgba(91, 155, 255, 0.22)' : 'rgba(91, 155, 255, 0.30)'}`,
              color: t.blue,
            }}
          >
            <Info size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold" style={{ color: t.text }}>
              {className ? `Inviting to ${className}` : 'Invite classmates'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: t.textSec }}>
              While your class is finding its exec, only{' '}
              <span className="font-semibold" style={{ color: t.text }}>
                {status?.founder_name ?? 'the founder'}
              </span>{' '}
              can share the join code. Ask them for it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── The card ─────────────────────────────────────────── */}
      <motion.button
        type="button"
        onClick={generate}
        disabled={!status?.is_founder || loading}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.99 }}
        className="relative w-full text-left rounded-2xl p-4 sm:p-5 overflow-hidden disabled:opacity-60 disabled:cursor-not-allowed transition-all"
        style={{
          background: t.card,
          border: `1px solid ${t.cardBorder}`,
          boxShadow: isLight
            ? '0 1px 0 rgba(255,255,255,0.85) inset, 0 6px 18px -10px rgba(15,7,3,0.10)'
            : '0 1px 0 rgba(255,255,255,0.02) inset',
        }}
      >
        {/* Soft brand wash bottom-right */}
        <span
          aria-hidden
          className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full pointer-events-none"
          style={{ background: t.blob1, filter: 'blur(40px)' }}
        />

        <div className="relative flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: t.primarySoft,
              border: `1px solid ${t.primaryRing}`,
              color: t.primary,
            }}
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : <Share2 size={20} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-bold" style={{ color: t.text }}>
                {className ? `Invite to ${className}` : 'Invite classmates'}
              </p>
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{ background: `${t.primary}18`, color: t.primary }}
              >
                <ShieldCheck className="w-3 h-3" /> Founder
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: t.textTer }}>
              Bootstrap mode — your code, up to 20 uses, 14 days. Stops automatically once your class has an exec.
            </p>
          </div>
          <span
            className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-full"
            style={{ background: t.gradOrange, color: '#FFFFFF' }}
          >
            {loading ? 'Working…' : 'Share link'}
          </span>
        </div>

        {error && (
          <p className="mt-2 text-[11px] font-semibold" style={{ color: t.danger }}>
            {error}
          </p>
        )}
      </motion.button>

      {/* ── Reveal modal ─────────────────────────────────────── */}
      <AnimatePresence>
        {invite && (
          <motion.div
            className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0"
              style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
              onClick={() => setInvite(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className="relative w-full sm:max-w-md rounded-3xl overflow-hidden"
              style={{
                background: t.card,
                border: `1px solid ${t.cardBorder}`,
                boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
                color: t.text,
              }}
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            >
              <div className="px-5 pt-5 pb-3 flex items-start justify-between">
                <div className="min-w-0 pr-2">
                  <p
                    className="text-[10px] font-bold uppercase tracking-[0.18em] truncate"
                    style={{ color: t.primary }}
                  >
                    {orgName ? `${orgName} · Share to grow` : 'Share to grow'}
                  </p>
                  <h3
                    className="text-lg font-extrabold mt-0.5 truncate"
                    style={{ color: t.text }}
                  >
                    {className ? `${className} — join code` : 'Join code'}
                  </h3>
                </div>
                <button
                  onClick={() => setInvite(null)}
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: isLight ? 'rgba(15,7,3,0.04)' : 'rgba(255,255,255,0.05)' }}
                  aria-label="Close"
                >
                  <X className="w-4 h-4" style={{ color: t.textSec }} />
                </button>
              </div>

              {/* Code chip — big, monospaced, copy-on-tap */}
              <div className="px-5">
                <button
                  type="button"
                  onClick={() => copy(invite.code, 'code')}
                  className="w-full rounded-2xl p-4 text-left transition-all active:scale-[0.99]"
                  style={{
                    background: t.primarySoft,
                    border: `1px dashed ${t.primaryRing}`,
                  }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: t.primary }}>
                    Tap to copy code
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span
                      className="text-[28px] sm:text-[32px] font-extrabold tracking-[0.28em]"
                      style={{ color: t.text, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                    >
                      {invite.code}
                    </span>
                    {copied === 'code' ? (
                      <Check className="w-5 h-5" style={{ color: t.mint }} />
                    ) : (
                      <Copy className="w-5 h-5" style={{ color: t.primary }} />
                    )}
                  </div>
                </button>
              </div>

              {/* Link row */}
              <div className="px-5 mt-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1" style={{ color: t.textTer }}>
                  Or share this link
                </p>
                <button
                  type="button"
                  onClick={() => copy(joinUrl, 'link')}
                  className="w-full rounded-xl px-3 py-2.5 flex items-center gap-2 text-left transition-all active:scale-[0.99]"
                  style={{
                    background: isLight ? '#F8F4F1' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${t.cardBorder}`,
                  }}
                >
                  <LinkIcon className="w-4 h-4 shrink-0" style={{ color: t.textSec }} />
                  <span
                    className="text-[12px] truncate flex-1"
                    style={{ color: t.textSec, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                  >
                    {joinUrl}
                  </span>
                  {copied === 'link' ? (
                    <Check className="w-4 h-4 shrink-0" style={{ color: t.mint }} />
                  ) : (
                    <Copy className="w-4 h-4 shrink-0" style={{ color: t.textSec }} />
                  )}
                </button>
              </div>

              {/* Ready-made message — what gets pasted into WhatsApp etc.
                  Preview is shown so the founder knows exactly what their
                  classmates will see, and they can tweak it locally if
                  they want. Tap copies the whole template. */}
              <div className="px-5 mt-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1" style={{ color: t.textTer }}>
                  Or send this message
                </p>
                <button
                  type="button"
                  onClick={() => copy(buildShareMessage(invite.code, joinUrl), 'message')}
                  className="w-full rounded-xl px-3 py-3 text-left transition-all active:scale-[0.99]"
                  style={{
                    background: isLight ? '#F8F4F1' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${t.cardBorder}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: t.textSec }}>
                      Tap to copy
                    </span>
                    {copied === 'message' ? (
                      <Check className="w-4 h-4 shrink-0" style={{ color: t.mint }} />
                    ) : (
                      <Copy className="w-4 h-4 shrink-0" style={{ color: t.textSec }} />
                    )}
                  </div>
                  <pre
                    className="text-[11.5px] leading-snug whitespace-pre-wrap break-words"
                    style={{ color: t.text, fontFamily: 'inherit', margin: 0 }}
                  >
                    {buildShareMessage(invite.code, joinUrl)}
                  </pre>
                </button>
              </div>

              {/* Meta */}
              <p className="px-5 mt-3 text-[11px]" style={{ color: t.textTer }}>
                {invite.maxUses ? `Up to ${invite.maxUses} people` : 'Multiple uses'} ·
                {' '}
                {invite.expiresAt
                  ? `Expires ${new Date(invite.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                  : 'Expires in 14 days'}
              </p>

              {/* Actions */}
              <div className="p-5 pt-4 flex gap-2">
                {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                  <button
                    type="button"
                    onClick={nativeShare}
                    className="flex-1 py-3 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-all active:scale-[0.99]"
                    style={{
                      background: t.gradOrange,
                      color: '#FFFFFF',
                      boxShadow: `0 8px 22px -8px ${t.primary}`,
                    }}
                  >
                    <Share2 className="w-4 h-4" />
                    Share
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setInvite(null)}
                  className="flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.99]"
                  style={{
                    background: isLight ? '#F1EEEB' : 'rgba(255,255,255,0.06)',
                    color: t.text,
                    border: `1px solid ${t.cardBorder}`,
                  }}
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
