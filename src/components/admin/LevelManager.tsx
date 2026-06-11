/**
 * LevelManager — manage a set's academic level over time (Model B).
 *
 * Shows the set's current level, entry year and (estimated) graduation,
 * plus a permanent level history. Lets a verified exec ADVANCE the level
 * (or correct it) and, for a final-year set, GRADUATE it to alumni.
 *
 * Everything is manual + audited — there is no auto-advance (Nigerian
 * sessions extend unpredictably). All writes go through the SECURITY
 * DEFINER RPCs in mig 123, which re-check permission server-side.
 *
 * Rendered via a portal so it's never trapped by a transformed ancestor.
 */

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, GraduationCap, ArrowUpCircle, History, Loader2, Check, AlertTriangle } from 'lucide-react';
import { supabase } from '@/config/supabase';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
import ProfessionalDropdown from '@/components/ui/ProfessionalDropdown';
import { formatDate } from '@/utils/formatters';

interface GroupRow {
  id: string;
  name: string;
  short_name: string;
  current_level: string | null;
  entry_year: number | null;
  course_duration: number | null;
  graduation_year: number | null;
  is_graduated: boolean | null;
  alumni_label: string | null;
}
interface HistoryRow {
  id: string;
  level_from: string | null;
  level_to: string | null;
  session_label: string | null;
  change_type: string;
  changed_at: string;
}

const LEVEL_OPTIONS = [
  '100L', '200L', '300L', '400L', '500L', '600L', '700L',
  'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5',
  'JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3',
  'Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6',
].map((v) => ({ value: v, label: v }));

export default function LevelManager({
  groupId,
  callerMemberId,
  onClose,
  onChanged,
}: {
  groupId: string;
  callerMemberId: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { theme } = useTheme();
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';

  const [group, setGroup] = useState<GroupRow | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'view' | 'advance' | 'graduate'>('view');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // form
  const [newLevel, setNewLevel] = useState('');
  const [session, setSession] = useState('');
  const [alumniLabel, setAlumniLabel] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: g }, { data: h }] = await Promise.all([
      supabase.from('organization_groups')
        .select('id, name, short_name, current_level, entry_year, course_duration, graduation_year, is_graduated, alumni_label')
        .eq('id', groupId).single(),
      supabase.from('group_level_history')
        .select('id, level_from, level_to, session_label, change_type, changed_at')
        .eq('group_id', groupId).order('changed_at', { ascending: false }).limit(20),
    ]);
    setGroup((g as GroupRow) ?? null);
    setHistory((h as HistoryRow[]) ?? []);
    if (g) {
      const gr = g as GroupRow;
      setAlumniLabel(gr.alumni_label || (gr.short_name ? `${gr.short_name} '${String((gr.graduation_year ?? new Date().getFullYear())).slice(-2)}` : ''));
    }
    setLoading(false);
  }, [groupId]);

  useEffect(() => { void load(); }, [load]);

  const runAdvance = async (changeType: 'advancement' | 'correction') => {
    if (!newLevel) { setErr('Pick the new level.'); return; }
    setBusy(true); setErr(null);
    const { data, error } = await supabase.rpc('advance_group_level', {
      p_group_id: groupId, p_caller_member_id: callerMemberId,
      p_new_level: newLevel, p_session_label: session.trim() || null, p_change_type: changeType,
    });
    setBusy(false);
    if (error || !data?.ok) { setErr(error?.message || data?.error || 'Could not update the level.'); return; }
    setMode('view'); setNewLevel(''); setSession('');
    await load(); onChanged?.();
  };

  const runGraduate = async () => {
    setBusy(true); setErr(null);
    const { data, error } = await supabase.rpc('graduate_group', {
      p_group_id: groupId, p_caller_member_id: callerMemberId, p_alumni_label: alumniLabel.trim() || null,
    });
    setBusy(false);
    if (error || !data?.ok) { setErr(error?.message || data?.error || 'Could not graduate the set.'); return; }
    setMode('view'); await load(); onChanged?.();
  };

  const grad = group?.is_graduated;

  return createPortal(
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)' }}
          onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
        <motion.div
          className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
          style={{ background: t.card, border: `1px solid ${t.cardBorder}`, boxShadow: '0 24px 60px rgba(0,0,0,0.5)', maxHeight: '88vh' }}
          initial={{ y: '100%', opacity: 0.6 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 360, damping: 34 }}
        >
          <div className="flex items-start justify-between px-5 pt-5 pb-3 shrink-0">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: t.primary }}>Set &amp; level</p>
              <h2 className="text-lg font-extrabold mt-0.5" style={{ color: t.text }}>{group?.name || 'Loading…'}</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: isLight ? 'rgba(15,7,3,0.05)' : 'rgba(255,255,255,0.06)' }} aria-label="Close">
              <X className="w-4 h-4" style={{ color: t.textSec }} />
            </button>
          </div>

          <div className="px-5 pb-5 overflow-y-auto flex-1">
            {loading ? (
              <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: t.primary }} /></div>
            ) : !group ? (
              <p className="py-10 text-center text-sm" style={{ color: t.textSec }}>Group not found.</p>
            ) : mode === 'view' ? (
              <>
                {/* Level state */}
                <div className="rounded-2xl p-4" style={{ background: t.bgWash, border: `1px solid ${t.cardBorder}` }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.textTer }}>Current level</span>
                    {grad
                      ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${t.mint}1A`, color: t.mint }}>🎓 Alumni{group.alumni_label ? ` · ${group.alumni_label}` : ''}</span>
                      : null}
                  </div>
                  <p className="text-3xl font-extrabold mt-1" style={{ color: grad ? t.mint : t.primary }}>
                    {group.current_level || '—'}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[12px]" style={{ color: t.textSec }}>
                    {group.entry_year && <span>Entry: <b style={{ color: t.text }}>{group.entry_year}</b></span>}
                    {group.course_duration && <span>Duration: <b style={{ color: t.text }}>{group.course_duration}y</b></span>}
                    {group.graduation_year && <span>Est. grad: <b style={{ color: t.text }}>{group.graduation_year}</b></span>}
                  </div>
                </div>

                {/* Actions */}
                {!grad && (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button onClick={() => { setMode('advance'); setErr(null); }}
                      className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold"
                      style={{ background: t.primarySoft, color: t.primary, border: `1px solid ${t.primaryRing}` }}>
                      <ArrowUpCircle className="w-4 h-4" /> Advance level
                    </button>
                    <button onClick={() => { setMode('graduate'); setErr(null); }}
                      className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold"
                      style={{ background: `${t.mint}14`, color: t.mint, border: `1px solid ${t.mint}33` }}>
                      <GraduationCap className="w-4 h-4" /> Graduate set
                    </button>
                  </div>
                )}

                {/* History */}
                <div className="mt-5">
                  <p className="text-[11px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: t.textTer }}>
                    <History className="w-3.5 h-3.5" /> Level history
                  </p>
                  {history.length === 0 ? (
                    <p className="text-[12px]" style={{ color: t.textSec }}>No changes recorded yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {history.map((h) => (
                        <div key={h.id} className="flex items-center gap-2 text-[12px] rounded-lg px-3 py-2"
                          style={{ background: t.bgWash, border: `1px solid ${t.cardBorder}` }}>
                          <Check className="w-3.5 h-3.5 shrink-0" style={{ color: t.mint }} />
                          <span style={{ color: t.text }}>
                            {h.level_from ? `${h.level_from} → ` : ''}<b>{h.level_to}</b>
                            {h.session_label ? ` · ${h.session_label}` : ''}
                          </span>
                          <span className="ml-auto shrink-0" style={{ color: t.textTer }}>
                            {h.change_type} · {formatDate(h.changed_at, 'short')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : mode === 'advance' ? (
              <>
                <p className="text-sm font-bold" style={{ color: t.text }}>Advance / correct level</p>
                <p className="text-[12px] mt-0.5 mb-3" style={{ color: t.textSec }}>
                  Only when your set actually moves up. This updates every member's level, so dues for the new level start to apply.
                </p>
                <ProfessionalDropdown label="New level" value={newLevel} onChange={(v) => setNewLevel(v as string)}
                  options={LEVEL_OPTIONS} placeholder="Select level" searchable variant="outlined" size="md" />
                <div className="mt-3">
                  <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: t.textTer }}>Session (optional)</label>
                  <input value={session} onChange={(e) => setSession(e.target.value)} placeholder="e.g. 2025/2026"
                    className="w-full mt-1 rounded-xl px-3.5 py-2.5 text-sm outline-none"
                    style={{ background: isLight ? '#F8F4F1' : 'rgba(255,255,255,0.04)', border: `1px solid ${t.cardBorder}`, color: t.text }} />
                </div>
                {err && <p className="text-[12px] mt-2 font-semibold" style={{ color: t.danger }}>{err}</p>}
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setMode('view')} className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                    style={{ background: isLight ? '#F1EEEB' : 'rgba(255,255,255,0.06)', color: t.text }}>Cancel</button>
                  <button onClick={() => runAdvance('correction')} disabled={busy} className="px-3 py-2.5 rounded-xl text-sm font-bold"
                    style={{ background: t.bgWash, color: t.textSec, border: `1px solid ${t.cardBorder}` }}>Just a correction</button>
                  <button onClick={() => runAdvance('advancement')} disabled={busy}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold text-white"
                    style={{ background: t.gradOrange }}>
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpCircle className="w-4 h-4" />} Advance
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-2.5 rounded-xl p-3 mb-3" style={{ background: `${t.amber}12`, border: `1px solid ${t.amber}33` }}>
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: t.amber }} />
                  <p className="text-[12px]" style={{ color: t.text }}>
                    Graduating <b>{group.name}</b> turns its members into alumni: they keep login + full payment history, but get <b>no new dues</b> and can't be elected. All financial records are preserved.
                  </p>
                </div>
                <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: t.textTer }}>Alumni label</label>
                <input value={alumniLabel} onChange={(e) => setAlumniLabel(e.target.value)} placeholder="e.g. CSC '27"
                  className="w-full mt-1 rounded-xl px-3.5 py-2.5 text-sm outline-none"
                  style={{ background: isLight ? '#F8F4F1' : 'rgba(255,255,255,0.04)', border: `1px solid ${t.cardBorder}`, color: t.text }} />
                {err && <p className="text-[12px] mt-2 font-semibold" style={{ color: t.danger }}>{err}</p>}
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setMode('view')} className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                    style={{ background: isLight ? '#F1EEEB' : 'rgba(255,255,255,0.06)', color: t.text }}>Cancel</button>
                  <button onClick={runGraduate} disabled={busy}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold text-white"
                    style={{ background: t.mint }}>
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <GraduationCap className="w-4 h-4" />} Confirm graduation
                  </button>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
