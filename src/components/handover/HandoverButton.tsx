/**
 * HandoverButton — "Hand over my role" flow for the profile page.
 *
 * Renders only for active, verified execs. Three steps in a modal:
 *   1. Confirm  — warning (you keep power until your successor is
 *      verified, then it transfers and you become a regular member)
 *      + optional reason.
 *   2. Search   — find a successor within the role's tier (server
 *      scopes the search: faculty → whole faculty, dept → its classes,
 *      class → that class).
 *   3. Done     — nominee notified; their persistent banner takes over.
 *
 * No role mutation happens here. nominate_successor just records the
 * intent + notifies. The actual transfer is server-side when the
 * nominee's claim is approved (mig 108 trigger).
 */

import { useMemo, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRightLeft, Search, Loader2, AlertTriangle, CheckCircle2, X, UserCheck } from 'lucide-react';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useThemeTokens } from '@/hooks/useThemeTokens';
import { useToast } from '@/hooks/useToast';
import handoverService, { type TierMember } from '@/services/handoverService';
import GlassCard from '@/components/ui/GlassCard';

type Step = 'closed' | 'confirm' | 'search' | 'done';

export default function HandoverButton() {
  const t = useThemeTokens();
  const { user } = useMultiTenantAuth();
  const toast = useToast();

  // The active exec role being handed over. We take the highest-scope
  // active+verified row — the same one nominate_successor defaults to.
  const activeExecRole = useMemo(() => {
    const rows = (user?.admin_records ?? []) as Array<{
      is_active?: boolean; verification_layer?: number;
      role_label?: string | null; scope_level?: string; group_id?: string | null;
    }>;
    const eligible = rows
      .filter((r) => r.is_active && (r.verification_layer ?? 0) >= 3)
      .sort((a, b) => {
        const rank = (s?: string) => (s === 'org' ? 3 : s === 'unit' ? 2 : 1);
        return rank(b.scope_level) - rank(a.scope_level);
      });
    return eligible[0] ?? null;
  }, [user?.admin_records]);

  const [step, setStep] = useState<Step>('closed');
  const [reason, setReason] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TierMember[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback((q: string) => {
    setQuery(q);
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      if (!user?.id) return;
      setSearching(true);
      const res = await handoverService.searchTierMembers(user.id, q, activeExecRole?.group_id ?? null);
      setSearching(false);
      if (res.ok) setResults(res.members ?? []);
      else toast?.error?.(res.error || 'Could not search members.');
    }, 300);
  }, [user?.id, activeExecRole?.group_id, toast]);

  const nominate = useCallback(async (nominee: TierMember) => {
    if (!user?.id) return;
    setSubmitting(true);
    const res = await handoverService.nominate(user.id, nominee.member_id, activeExecRole?.group_id ?? null, reason);
    setSubmitting(false);
    if (!res.ok) { toast?.error?.(res.error || 'Could not nominate.'); return; }
    toast?.success?.(`${nominee.full_name} was notified to take over.`);
    setStep('done');
  }, [user?.id, activeExecRole?.group_id, reason, toast]);

  const close = () => { setStep('closed'); setReason(''); setQuery(''); setResults([]); };

  if (!activeExecRole) return null;

  const roleLabel = activeExecRole.role_label || 'your exec role';

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
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: `${t.amber}18` }}>
              <ArrowRightLeft size={16} style={{ color: t.amber }} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold" style={{ color: t.text }}>Stepping down?</h3>
              <p className="text-[11px]" style={{ color: t.textSec }}>
                Hand <span className="font-semibold" style={{ color: t.text }}>{roleLabel}</span> to a successor in your tier.
              </p>
            </div>
          </div>
          <button
            onClick={() => setStep('confirm')}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: `${t.amber}14`, color: t.amber, border: `1px solid ${t.amber}30` }}
          >
            <ArrowRightLeft size={15} /> Hand over my role
          </button>
        </GlassCard>
      </motion.div>

      <AnimatePresence>
        {step !== 'closed' && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}
            role="dialog" aria-modal="true"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              className="w-full max-w-md rounded-2xl p-6 relative"
              style={{ background: t.card, border: `1px solid ${t.cardBorder}`, boxShadow: t.shadowLg }}
            >
              <button onClick={close} className="absolute top-4 right-4 p-1.5 rounded-lg" style={{ color: t.textTer }}>
                <X size={18} />
              </button>

              {/* ── Step: Confirm ── */}
              {step === 'confirm' && (
                <>
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${t.amber}18`, color: t.amber }}>
                      <AlertTriangle size={20} />
                    </div>
                    <h2 className="text-base font-bold" style={{ color: t.text }}>Hand over {roleLabel}?</h2>
                  </div>
                  <div className="rounded-xl px-3.5 py-3 mb-4" style={{ background: `${t.amber}10`, border: `1px solid ${t.amber}25` }}>
                    <p className="text-[12px] leading-relaxed" style={{ color: t.textSec }}>
                      You'll <span className="font-semibold" style={{ color: t.text }}>keep your powers</span> until your successor is verified by the members. Once they pass, the role transfers to them and <span className="font-semibold" style={{ color: t.text }}>you become a regular member</span>. You can cancel any time before it completes.
                    </p>
                  </div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: t.textTer }}>
                    Reason (optional)
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Graduating this session"
                    rows={2}
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none mb-4"
                    style={{ background: t.input, border: `1px solid ${t.inputBorder}`, color: t.text }}
                  />
                  <button
                    onClick={() => setStep('search')}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold"
                    style={{ background: t.primary, color: '#1A0E09' }}
                  >
                    <Search size={15} /> Find my successor
                  </button>
                </>
              )}

              {/* ── Step: Search ── */}
              {step === 'search' && (
                <>
                  <h2 className="text-base font-bold mb-1" style={{ color: t.text }}>Who's taking over?</h2>
                  <p className="text-[12px] mb-3" style={{ color: t.textSec }}>
                    Search members in your tier. They'll be notified to accept and go through verification.
                  </p>
                  <div className="relative mb-3">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: t.textTer }} />
                    <input
                      value={query}
                      onChange={(e) => runSearch(e.target.value)}
                      placeholder="Search by name or ID…"
                      autoFocus
                      className="w-full rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none"
                      style={{ background: t.input, border: `1px solid ${t.inputBorder}`, color: t.text }}
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto -mx-1 px-1 space-y-1.5">
                    {searching && (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 size={18} className="animate-spin" style={{ color: t.primary }} />
                      </div>
                    )}
                    {!searching && query.trim().length >= 2 && results.length === 0 && (
                      <p className="text-center text-[12px] py-6" style={{ color: t.textTer }}>No members found.</p>
                    )}
                    {!searching && results.map((m) => (
                      <button
                        key={m.member_id}
                        onClick={() => nominate(m)}
                        disabled={submitting}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors disabled:opacity-50"
                        style={{ background: t.overlay, border: `1px solid ${t.divider}` }}
                      >
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                          style={{ background: `${t.primary}18`, color: t.primary }}>
                          {m.full_name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate" style={{ color: t.text }}>{m.full_name}</p>
                          <p className="text-[11px] truncate" style={{ color: t.textTer }}>
                            {m.group_name} · {m.human_id}
                          </p>
                        </div>
                        <UserCheck size={16} style={{ color: t.textTer }} />
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* ── Step: Done ── */}
              {step === 'done' && (
                <div className="text-center py-4">
                  <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: `${t.mint}14`, border: `1px solid ${t.mint}30` }}>
                    <CheckCircle2 size={28} style={{ color: t.mint }} />
                  </div>
                  <h2 className="text-base font-bold mb-1.5" style={{ color: t.text }}>Successor nominated</h2>
                  <p className="text-[13px] leading-relaxed mb-5" style={{ color: t.textSec }}>
                    They've been notified to accept. You keep {roleLabel} until they're verified — then it transfers automatically.
                  </p>
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
