/**
 * HandoverButton — "Hand over my role" flow for the profile page.
 *
 * Renders only for active, verified execs. Four steps in a modal:
 *   0. Pick role  — shown ONLY when the exec holds multiple active
 *      verified roles. Single-role execs skip straight to step 1.
 *   1. Confirm    — warning (you keep power until your successor is
 *      verified, then it transfers and you become a regular member)
 *      + optional reason.
 *   2. Search     — find a successor within the role's tier (server
 *      scopes the search: faculty → whole faculty, dept → its classes,
 *      class → that class).
 *   3. Done       — nominee notified; their persistent banner takes over.
 *
 * No role mutation happens here. nominate_successor just records the
 * intent + notifies. The actual transfer is server-side when the
 * nominee's claim is approved (mig 108 / 109 trigger).
 *
 * Multi-role contract:
 *   Each admin_records row is a SEPARATE role. Handing over one role
 *   must never affect the others. The selected role's group_id is
 *   passed explicitly to nominate_successor and searchTierMembers so
 *   the server always scopes to the right tier.
 */

import { useMemo, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRightLeft,
  Search,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  X,
  UserCheck,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useThemeTokens } from '@/hooks/useThemeTokens';
import { useToast } from '@/hooks/useToast';
import handoverService, { type TierMember } from '@/services/handoverService';
import GlassCard from '@/components/ui/GlassCard';

type Step = 'closed' | 'pick_role' | 'confirm' | 'search' | 'done';

type ExecRole = {
  id: string;               // member_admins.id
  role: string;
  role_label: string | null;
  scope_level: string;
  group_id: string | null;
  group_name?: string | null;
  verification_layer: number;
};

function scopeRank(s?: string) {
  return s === 'org' ? 3 : s === 'unit' ? 2 : 1;
}

export default function HandoverButton() {
  const t = useThemeTokens();
  const { user } = useMultiTenantAuth();
  const toast = useToast();

  // All active verified exec roles this member holds — each is independent.
  const eligibleRoles = useMemo((): ExecRole[] => {
    const rows = (user?.admin_records ?? []) as unknown as Array<Record<string, unknown>>;
    return rows
      .filter((r) => r.is_active && (r.verification_layer as number ?? 0) >= 3)
      .map((r) => ({
        id:                 r.id as string,
        role:               r.role as string,
        role_label:         r.role_label as string | null,
        scope_level:        r.scope_level as string,
        group_id:           r.group_id as string | null,
        group_name:         r.group_name as string | null,
        verification_layer: r.verification_layer as number,
      }))
      .sort((a, b) => scopeRank(b.scope_level) - scopeRank(a.scope_level));
  }, [user?.admin_records]);

  // The role the exec has selected to hand over. When there's only one
  // eligible role it is pre-selected — the picker step never shows.
  const [selectedRole, setSelectedRole] = useState<ExecRole | null>(null);

  const [step, setStep]           = useState<Step>('closed');
  const [reason, setReason]       = useState('');
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState<TierMember[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = useCallback(() => {
    if (eligibleRoles.length === 0) return;
    if (eligibleRoles.length === 1) {
      // Single role — pre-select it and skip straight to confirm.
      setSelectedRole(eligibleRoles[0]);
      setStep('confirm');
    } else {
      // Multiple roles — show the picker first so the exec explicitly
      // chooses which role they're handing over.
      setSelectedRole(null);
      setStep('pick_role');
    }
  }, [eligibleRoles]);

  const pickRole = useCallback((role: ExecRole) => {
    setSelectedRole(role);
    setStep('confirm');
  }, []);

  const runSearch = useCallback((q: string) => {
    setQuery(q);
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      if (!user?.id || !selectedRole) return;
      setSearching(true);
      // Pass the selected role's group_id explicitly — never the highest
      // scope by default — so the search is always tier-scoped correctly.
      const res = await handoverService.searchTierMembers(
        user.id,
        q,
        selectedRole.group_id,
      );
      setSearching(false);
      if (res.ok) setResults(res.members ?? []);
      else toast?.error?.(res.error || 'Could not search members.');
    }, 300);
  }, [user?.id, selectedRole, toast]);

  const nominate = useCallback(async (nominee: TierMember) => {
    if (!user?.id || !selectedRole) return;
    setSubmitting(true);
    const res = await handoverService.nominate(
      user.id,
      nominee.member_id,
      selectedRole.group_id,   // explicit — never falls back to highest scope
      reason,
    );
    setSubmitting(false);
    if (!res.ok) { toast?.error?.(res.error || 'Could not nominate.'); return; }
    toast?.success?.(`${nominee.full_name} was notified to take over.`);
    setStep('done');
  }, [user?.id, selectedRole, reason, toast]);

  const close = useCallback(() => {
    setStep('closed');
    setSelectedRole(null);
    setReason('');
    setQuery('');
    setResults([]);
  }, []);

  if (eligibleRoles.length === 0) return null;

  const roleLabel = selectedRole?.role_label || 'your exec role';

  return (
    <>
      <motion.div
        className="mt-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <GlassCard>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: `${t.amber}18` }}
            >
              <ArrowRightLeft size={16} style={{ color: t.amber }} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold" style={{ color: t.text }}>Stepping down?</h3>
              <p className="text-[11px]" style={{ color: t.textSec }}>
                {eligibleRoles.length === 1 ? (
                  <>Hand over <span className="font-semibold" style={{ color: t.text }}>{eligibleRoles[0].role_label || 'your role'}</span> to a successor in your tier.</>
                ) : (
                  <>You hold <span className="font-semibold" style={{ color: t.text }}>{eligibleRoles.length} roles</span> — choose which one to hand over.</>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={open}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: `${t.amber}14`, color: t.amber, border: `1px solid ${t.amber}30` }}
          >
            <ArrowRightLeft size={15} /> Hand over a role
          </button>
        </GlassCard>
      </motion.div>

      <AnimatePresence>
        {step !== 'closed' && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              className="w-full max-w-md rounded-2xl p-6 relative"
              style={{
                background: t.card,
                border: `1px solid ${t.cardBorder}`,
                boxShadow: t.shadowLg,
              }}
            >
              <button
                onClick={close}
                className="absolute top-4 right-4 p-1.5 rounded-lg"
                style={{ color: t.textTer }}
              >
                <X size={18} />
              </button>

              {/* ── Step 0: Pick role ── */}
              {step === 'pick_role' && (
                <>
                  <div className="flex items-center gap-2.5 mb-1">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: `${t.amber}18`, color: t.amber }}
                    >
                      <ArrowRightLeft size={20} />
                    </div>
                    <h2 className="text-base font-bold" style={{ color: t.text }}>
                      Which role are you handing over?
                    </h2>
                  </div>
                  <p className="text-[12px] mb-4" style={{ color: t.textSec }}>
                    Each role transfers independently. Your other roles are not affected.
                  </p>
                  <div className="space-y-2">
                    {eligibleRoles.map((role) => (
                      <button
                        key={role.id}
                        onClick={() => pickRole(role)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-opacity hover:opacity-80"
                        style={{
                          background: `${t.amber}0A`,
                          border: `1px solid ${t.amber}25`,
                        }}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: `${t.amber}18`, color: t.amber }}
                        >
                          <ShieldCheck size={15} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold" style={{ color: t.text }}>
                            {role.role_label || role.role}
                          </p>
                          <p className="text-[11px]" style={{ color: t.textTer }}>
                            {role.scope_level === 'org'
                              ? 'Organisation-wide'
                              : role.scope_level === 'unit'
                              ? 'Faculty / unit level'
                              : role.group_name || 'Group level'}
                          </p>
                        </div>
                        <ChevronRight size={15} style={{ color: t.textTer }} />
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* ── Step 1: Confirm ── */}
              {step === 'confirm' && selectedRole && (
                <>
                  <div className="flex items-center gap-2.5 mb-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: `${t.amber}18`, color: t.amber }}
                    >
                      <AlertTriangle size={20} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-bold" style={{ color: t.text }}>
                        Hand over {roleLabel}?
                      </h2>
                      {eligibleRoles.length > 1 && (
                        <p className="text-[11px]" style={{ color: t.textTer }}>
                          Your other roles are not affected.
                        </p>
                      )}
                    </div>
                  </div>
                  <div
                    className="rounded-xl px-3.5 py-3 mb-4"
                    style={{ background: `${t.amber}10`, border: `1px solid ${t.amber}25` }}
                  >
                    <p className="text-[12px] leading-relaxed" style={{ color: t.textSec }}>
                      You'll{' '}
                      <span className="font-semibold" style={{ color: t.text }}>
                        keep your powers
                      </span>{' '}
                      until your successor is verified by the members. Once they pass, this
                      role transfers to them and{' '}
                      <span className="font-semibold" style={{ color: t.text }}>
                        you become a regular member for this role
                      </span>
                      . You can cancel any time before it completes.
                    </p>
                  </div>
                  <label
                    className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: t.textTer }}
                  >
                    Reason (optional)
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Graduating this session"
                    rows={2}
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none mb-4"
                    style={{
                      background: t.input,
                      border: `1px solid ${t.inputBorder}`,
                      color: t.text,
                    }}
                  />
                  <div className="flex gap-2">
                    {eligibleRoles.length > 1 && (
                      <button
                        onClick={() => setStep('pick_role')}
                        className="px-4 py-3 rounded-xl text-sm font-semibold"
                        style={{
                          background: t.overlay,
                          color: t.textSec,
                          border: `1px solid ${t.divider}`,
                        }}
                      >
                        Back
                      </button>
                    )}
                    <button
                      onClick={() => setStep('search')}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold"
                      style={{ background: t.primary, color: '#1A0E09' }}
                    >
                      <Search size={15} /> Find my successor
                    </button>
                  </div>
                </>
              )}

              {/* ── Step 2: Search ── */}
              {step === 'search' && selectedRole && (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-base font-bold" style={{ color: t.text }}>
                      Who's taking over?
                    </h2>
                  </div>
                  <p className="text-[12px] mb-3" style={{ color: t.textSec }}>
                    Searching members in{' '}
                    <span className="font-semibold" style={{ color: t.text }}>
                      {selectedRole.group_name || selectedRole.role_label || 'your tier'}
                    </span>
                    . They'll be notified to accept and go through verification.
                  </p>
                  <div className="relative mb-3">
                    <Search
                      size={15}
                      className="absolute left-3 top-1/2 -translate-y-1/2"
                      style={{ color: t.textTer }}
                    />
                    <input
                      value={query}
                      onChange={(e) => runSearch(e.target.value)}
                      placeholder="Search by name or ID…"
                      autoFocus
                      className="w-full rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none"
                      style={{
                        background: t.input,
                        border: `1px solid ${t.inputBorder}`,
                        color: t.text,
                      }}
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto -mx-1 px-1 space-y-1.5">
                    {searching && (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 size={18} className="animate-spin" style={{ color: t.primary }} />
                      </div>
                    )}
                    {!searching && query.trim().length >= 2 && results.length === 0 && (
                      <p className="text-center text-[12px] py-6" style={{ color: t.textTer }}>
                        No members found.
                      </p>
                    )}
                    {!searching && results.map((m) => (
                      <button
                        key={m.member_id}
                        onClick={() => nominate(m)}
                        disabled={submitting}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors disabled:opacity-50"
                        style={{ background: t.overlay, border: `1px solid ${t.divider}` }}
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                          style={{ background: `${t.primary}18`, color: t.primary }}
                        >
                          {m.full_name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate" style={{ color: t.text }}>
                            {m.full_name}
                          </p>
                          <p className="text-[11px] truncate" style={{ color: t.textTer }}>
                            {m.group_name} · {m.human_id}
                          </p>
                        </div>
                        {submitting
                          ? <Loader2 size={14} className="animate-spin" style={{ color: t.textTer }} />
                          : <UserCheck size={16} style={{ color: t.textTer }} />
                        }
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setStep('confirm')}
                    className="mt-3 text-[12px] font-semibold"
                    style={{ color: t.textSec }}
                  >
                    ← Back
                  </button>
                </>
              )}

              {/* ── Step 3: Done ── */}
              {step === 'done' && (
                <div className="text-center py-4">
                  <div
                    className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                    style={{ background: `${t.mint}14`, border: `1px solid ${t.mint}30` }}
                  >
                    <CheckCircle2 size={28} style={{ color: t.mint }} />
                  </div>
                  <h2 className="text-base font-bold mb-1.5" style={{ color: t.text }}>
                    Successor nominated
                  </h2>
                  <p className="text-[13px] leading-relaxed mb-2" style={{ color: t.textSec }}>
                    They've been notified to accept. You keep{' '}
                    <span className="font-semibold" style={{ color: t.text }}>{roleLabel}</span>{' '}
                    until they're verified — then it transfers automatically.
                  </p>
                  {eligibleRoles.length > 1 && (
                    <p className="text-[12px] mb-5" style={{ color: t.textTer }}>
                      Your other roles are unaffected.
                    </p>
                  )}
                  <button
                    onClick={close}
                    className="w-full px-4 py-3 rounded-xl text-sm font-bold"
                    style={{ background: t.primary, color: '#1A0E09' }}
                  >
                    Done
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}