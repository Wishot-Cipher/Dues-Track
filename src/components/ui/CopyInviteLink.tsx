/**
 * CopyInviteLink — small button that copies a "create child group"
 * URL to the clipboard with toast feedback.
 *
 * Used on faculty / department / org detail pages so a faculty or
 * org founder can hand a new dept/class founder an exact URL without
 * needing the class-rep-only `OrgMembersPage` invite modal.
 *
 * The URL itself IS the invite: anyone with it lands on the existing
 * AddDepartmentPage (which is gated to org members only at the route
 * level), picks "I'm a student in this <parent>", and bootstraps the
 * child group + claims their exec role.
 *
 * Why not generate an invite code / row? Two reasons:
 *   • The structural bootstrap RPC already validates everything
 *     (member-id uniqueness, parent group existence, role label).
 *     A separate invite row would just duplicate that gate.
 *   • Founders want to share the link in WhatsApp / Telegram /
 *     Slack — a stable, human-readable URL is friendlier than an
 *     opaque code that expires.
 */

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/useToast';

// Minimal token shape — accepts both ThemeTokens (faculty / dept
// detail pages) and DashboardTokens (org overview) without coupling
// to a specific provider. Caller passes whichever tokens it already
// has in scope.
interface MinimalTokens {
  mint:       string;
  textSec:    string;
  cardBorder: string;
}

interface CopyInviteLinkProps {
  /** Full URL to copy. Caller is responsible for building it (e.g. `/${slug}/f/${facShort}/new`). */
  url: string;
  /** Button label — defaults to "Copy invite link". */
  label?: string;
  /** Toast text on success — defaults to a generic message. */
  successText?: string;
  /** Theme tokens for the button style. */
  t: MinimalTokens;
  /**
   * Optional safety hint shown as a small caption next to the button.
   * Use it to explain what the recipient can do with the link and
   * how the platform still gates them (peer vote, parent confirm,
   * etc.). Disclosure beats silence: the user explicitly flagged
   * the "what if they're all wrong people working together" concern.
   */
  hint?: string;
}

export default function CopyInviteLink({ url, label = 'Copy invite link', successText = 'Invite link copied', t, hint }: CopyInviteLinkProps) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const handleCopy = async () => {
    // Use the FULL URL (protocol + host + path). Without origin, a
    // recipient pasting the value into WhatsApp gets `/orgSlug/...`
    // which won't open anywhere.
    const fullUrl = url.startsWith('http')
      ? url
      : `${window.location.origin}${url.startsWith('/') ? url : `/${url}`}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      toast?.success?.(successText);
      // 2s is the standard "copied" affordance window — long enough
      // for the user to read the icon change, short enough that
      // accidentally clicking twice still produces fresh feedback.
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast?.error?.('Could not copy. Try long-pressing the link instead.');
    }
  };

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all"
        style={{
          background: copied ? `${t.mint}14` : 'rgba(255,255,255,0.04)',
          color:      copied ? t.mint     : t.textSec,
          border:     `1px solid ${copied ? `${t.mint}30` : t.cardBorder}`,
        }}
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? 'Copied' : label}
      </button>
      {hint && (
        <p className="text-[10px] max-w-[260px] leading-snug" style={{ color: t.textSec, opacity: 0.7 }}>
          {hint}
        </p>
      )}
    </div>
  );
}
