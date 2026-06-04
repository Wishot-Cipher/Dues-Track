/**
 * OfficeClassGate — one-time forced overlay for legacy Office members.
 *
 * Background
 * ----------
 * The pre-100 bootstrap path auto-created an "Office" class under
 * each dept and parked staff founders there. Mig 100 retired that
 * shortcut: every founder now picks a real class. But existing Office
 * members still sit in those parking classes and need to move out.
 *
 * Detection rule (cheap + accurate)
 * ---------------------------------
 *   user is logged in
 *   AND group.is_staff_office === TRUE   ← transitional flag from mig 099
 *
 * Behavior
 * --------
 * When the gate fires it blocks the rest of the layout with a modal
 * the user can't dismiss (no X). They pick a real class from the
 * dropdown — only kind='class' AND is_staff_office=FALSE classes from
 * their org are listed. The move happens through move_member_to_class
 * (mig 100) which updates group_id + counters in one shot.
 *
 * Why it's a forced gate, not a banner
 * ------------------------------------
 * Office membership pollutes downstream tier-scoped queries (a user
 * shows up in the dept's "staff" rollup but not in any class rollup).
 * Letting them poke around with broken context confuses every
 * tier-aware feature we ship. One screen, one fix, then they're free.
 *
 * After mig 100 + this gate, the column `is_staff_office` exists only
 * as a transition flag. Once every legacy row clears we can drop it.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { GraduationCap, ArrowRight, AlertTriangle } from 'lucide-react';
import { supabase } from '@/config/supabase';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
import ProfessionalDropdown from '@/components/ui/ProfessionalDropdown';

type ClassRow = {
  id: string;
  name: string;
  short_name: string;
  parent_group_id: string | null;
  dept_name?: string;
};

export default function OfficeClassGate() {
  const { user, organization, group, refreshSession } = useMultiTenantAuth();
  const { theme } = useTheme();
  const tt = getDashboardTokens(theme);

  const isParked = Boolean(group?.is_staff_office);

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load real classes (not other Office buckets) once the gate fires.
  useEffect(() => {
    if (!isParked || !organization?.id) return;
    setLoading(true);
    setError(null);
    (async () => {
      // Pull all classes in the org + parent dept names for the picker.
      const { data, error: e } = await supabase
        .from('organization_groups')
        .select('id, name, short_name, parent_group_id, kind, is_staff_office')
        .eq('organization_id', organization.id)
        .eq('kind', 'class')
        .or('is_staff_office.is.null,is_staff_office.eq.false')
        .order('name');
      if (e) { setError(e.message); setLoading(false); return; }
      const rows = (data || []) as ClassRow[];

      // Look up dept names for the description line.
      const deptIds = Array.from(new Set(rows.map((r) => r.parent_group_id).filter(Boolean))) as string[];
      if (deptIds.length) {
        const { data: depts } = await supabase
          .from('organization_groups')
          .select('id, name')
          .in('id', deptIds);
        const map = new Map<string, string>();
        (depts || []).forEach((d) => map.set(d.id as string, d.name as string));
        rows.forEach((r) => { r.dept_name = r.parent_group_id ? map.get(r.parent_group_id) : undefined; });
      }
      setClasses(rows);
      setLoading(false);
    })();
  }, [isParked, organization?.id]);

  const options = useMemo(() => classes.map((c) => ({
    value: c.id,
    label: c.name,
    description: [c.short_name, c.dept_name].filter(Boolean).join(' · '),
  })), [classes]);

  if (!isParked || !user?.id) return null;

  const handleMove = async () => {
    if (!picked) { setError('Pick a class first.'); return; }
    setSubmitting(true);
    setError(null);
    const { data, error: e } = await supabase.rpc('move_member_to_class', {
      p_member_id:      user.id,
      p_target_class_id: picked,
    });
    if (e || !data?.ok) {
      setError((data?.error as string) || e?.message || 'Could not move you to that class.');
      setSubmitting(false);
      return;
    }
    // Refresh the session so `group` reflects the new class.
    await refreshSession();
    // Hard reload so any tier-scoped page cache invalidates cleanly.
    window.location.reload();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{ background: tt.card, border: `1px solid ${tt.cardBorder}` }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ background: `${tt.primary}18`, color: tt.primary }}
          >
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ color: tt.text }}>
              Pick your real class
            </h2>
            <p className="text-[12px]" style={{ color: tt.textSec }}>
              Office classes were retired — every member belongs to a real class now.
            </p>
          </div>
        </div>

        <div
          className="rounded-xl px-3 py-2.5 mb-4 flex items-start gap-2"
          style={{ background: `${tt.amber}12`, border: `1px solid ${tt.amber}30` }}
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: tt.amber }} />
          <p className="text-[12px]" style={{ color: tt.textSec }}>
            You're currently in <strong style={{ color: tt.text }}>{group?.name || 'an Office class'}</strong>.
            Choose the real class you belong to — your exec roles (if any) stay with you, only the class membership moves.
          </p>
        </div>

        <ProfessionalDropdown
          value={picked}
          onChange={(v) => setPicked(Array.isArray(v) ? v[0] : v)}
          placeholder={loading ? 'Loading classes…' : 'Pick a class'}
          searchable
          disabled={loading || options.length === 0}
          options={options}
        />

        {error && (
          <p className="mt-3 text-[12px]" style={{ color: tt.danger }}>{error}</p>
        )}

        <button
          type="button"
          onClick={handleMove}
          disabled={!picked || submitting || loading}
          className="mt-5 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50"
          style={{ background: tt.primary, color: '#fff' }}
        >
          {submitting ? 'Moving you…' : (<>Move me to this class <ArrowRight className="w-4 h-4" /></>)}
        </button>

        <p className="mt-3 text-[11px] text-center" style={{ color: tt.textTer }}>
          Don't see your class? Ask your dept admin to add it first, then refresh.
        </p>
      </motion.div>
    </div>
  );
}
