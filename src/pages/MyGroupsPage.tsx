import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronRight,
  Layers,
  Loader2,
  Minus,
  Plus,
  Shield,
  Sparkles,
  Users,
} from 'lucide-react';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useAppNav } from '@/hooks/useAppNav';
import { getDashboardTokens, useTheme } from '@/hooks/useTheme';
import { groupMembershipService, type JoinableGroup, type MyGroup } from '@/services/groupMembershipService';

type GroupTokens = {
  bg: string;
  card: string;
  border: string;
  text: string;
  textSec: string;
  textTer: string;
  primary: string;
  mint: string;
  blue: string;
  purple: string;
  danger: string;
  gradPrimary: string;
};

function buildGroupTokens(theme: 'light' | 'dark'): GroupTokens {
  const dtk = getDashboardTokens(theme);
  return {
    bg: dtk.bg,
    card: dtk.card,
    border: dtk.cardBorder,
    text: dtk.text,
    textSec: dtk.textSec,
    textTer: dtk.textTer,
    primary: dtk.primary,
    mint: dtk.mint,
    blue: dtk.blue,
    purple: dtk.purple,
    danger: dtk.danger,
    gradPrimary: dtk.gradOrange,
  };
}

function kindMeta(kind: string | undefined, tk: GroupTokens) {
  const map: Record<string, { color: string; icon: React.ElementType; label: string }> = {
    faculty: { color: tk.blue, icon: BookOpen, label: 'Faculty' },
    department: { color: tk.primary, icon: Building2, label: 'Department' },
    class: { color: tk.purple, icon: Layers, label: 'Class' },
    year: { color: tk.mint, icon: Users, label: 'Year' },
    level: { color: '#ec4899', icon: Layers, label: 'Level' },
    association: { color: tk.blue, icon: Users, label: 'Association' },
    club: { color: tk.primary, icon: Sparkles, label: 'Club' },
    fellowship: { color: tk.mint, icon: BadgeCheck, label: 'Fellowship' },
    general: { color: tk.primary, icon: Users, label: 'Group' },
  };

  return map[kind?.toLowerCase() || ''] ?? map.general;
}

function hexAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function MyGroupsPage() {
  const { user, organization, group } = useMultiTenantAuth();
  const { go } = useAppNav();
  const { theme } = useTheme();
  const tk = buildGroupTokens(theme);
  const isLight = theme === 'light';

  const [loading, setLoading] = useState(true);
  const [joinableLoading, setJoinableLoading] = useState(false);
  const [myGroups, setMyGroups] = useState<MyGroup[]>([]);
  const [joinableGroups, setJoinableGroups] = useState<JoinableGroup[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [leaveTarget, setLeaveTarget] = useState<MyGroup | null>(null);

  const loadGroups = useCallback(async () => {
    if (!user?.id || !organization?.id) return;
    setLoading(true);
    setError(null);
    try {
      const groups = await groupMembershipService.getMyGroups(user.id);
      setMyGroups(groups);
      setJoinableLoading(true);
      const joinable = await groupMembershipService.listJoinable(
        organization.id,
        groups.map((item) => item.group_id),
      );
      setJoinableGroups(joinable);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load your groups.');
    } finally {
      setLoading(false);
      setJoinableLoading(false);
    }
  }, [organization?.id, user?.id]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  const sortedGroups = useMemo(
    () => [...myGroups].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.name.localeCompare(b.name)),
    [myGroups],
  );
  const primaryGroup = useMemo(() => sortedGroups.find((item) => item.is_primary) ?? group ?? null, [group, sortedGroups]);
  const activeGroupCount = sortedGroups.length;
  const joinableCount = joinableGroups.length;
  const groupLabel = organization?.group_label_plural || 'Groups';

  const handleJoin = useCallback(async (item: JoinableGroup) => {
    if (!user?.id) return;
    setBusyId(item.id);
    setError(null);
    setStatus(null);
    const result = await groupMembershipService.joinGroup(user.id, item.id);
    if (!result.ok) {
      setError(result.error || `Could not join ${item.name}.`);
      setBusyId(null);
      return;
    }
    setStatus(`Joined ${item.name}.`);
    await loadGroups();
    setBusyId(null);
  }, [loadGroups, user?.id]);

  const handleLeave = useCallback(async () => {
    if (!user?.id || !leaveTarget) return;
    setBusyId(leaveTarget.group_id);
    setError(null);
    setStatus(null);
    const result = await groupMembershipService.leaveGroup(user.id, leaveTarget.group_id);
    if (!result.ok) {
      setError(result.error || `Could not leave ${leaveTarget.name}.`);
      setBusyId(null);
      return;
    }
    setStatus(`Left ${leaveTarget.name}.`);
    setLeaveTarget(null);
    await loadGroups();
    setBusyId(null);
  }, [leaveTarget, loadGroups, user?.id]);

  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{ minHeight: '100dvh', background: tk.bg }}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute rounded-full blur-[150px]"
          style={{
            width: 520,
            height: 520,
            background: `radial-gradient(circle, ${tk.primary} 0%, transparent 70%)`,
            top: '-10%',
            right: '-10%',
            opacity: 0.12,
          }}
        />
        <div
          className="absolute rounded-full blur-[150px]"
          style={{
            width: 420,
            height: 420,
            background: `radial-gradient(circle, ${tk.mint} 0%, transparent 70%)`,
            bottom: '2%',
            left: '-8%',
            opacity: 0.09,
          }}
        />
      </div>

      <nav className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => go('/dashboard')}
          className="flex items-center gap-2 text-xs sm:text-sm font-medium transition-colors min-w-0"
          style={{ color: tk.textSec }}
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="truncate">Back to dashboard</span>
        </button>
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-white text-sm"
            style={{ background: tk.gradPrimary }}
          >
            G
          </div>
          <span className="hidden sm:inline text-base font-bold" style={{ color: tk.text }}>
            My Groups
          </span>
        </div>
      </nav>

      <header className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 pt-3 pb-5 sm:pb-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl p-5 sm:p-6 overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${tk.primary}12, ${tk.card})`,
            border: `1px solid ${tk.border}`,
          }}
        >
          <div className="flex items-start gap-4">
            <div
              className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center"
              style={{ background: hexAlpha(tk.primary, 0.12), border: `1px solid ${hexAlpha(tk.primary, 0.24)}` }}
            >
              <Users className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: tk.primary }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.18em] font-semibold mb-1" style={{ color: tk.textTer }}>
                Membership hub
              </p>
              <h1 className="text-[1.35rem] sm:text-3xl font-extrabold leading-[1.12] tracking-tight" style={{ color: tk.text }}>
                Your {groupLabel.toLowerCase()}
              </h1>
              <p className="mt-2 text-sm sm:text-[15px] leading-6 max-w-2xl" style={{ color: tk.textSec }}>
                Keep every group tied to a single account. Join more groups, leave the ones you no longer need, and still see all dues in one place.
              </p>

              <div className="flex flex-wrap gap-2 mt-4">
                <SummaryPill label={`${activeGroupCount} joined`} color={tk.primary} theme={theme} />
                <SummaryPill label={`${joinableCount} joinable`} color={tk.mint} theme={theme} />
                <SummaryPill label={primaryGroup?.name || 'Primary group'} color={tk.blue} theme={theme} />
              </div>
            </div>
          </div>
        </motion.div>
      </header>

      <main className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 pb-20 sm:pb-24 space-y-5">
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl p-4 sm:p-5"
          style={{ background: tk.card, border: `1px solid ${tk.border}` }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold tracking-tight" style={{ color: tk.text }}>
                Group context is now shared.
              </h2>
              <p className="text-xs sm:text-sm mt-1" style={{ color: tk.textSec }}>
                A due created for any of your groups will show up here automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={() => go('/payments')}
              className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold"
              style={{ background: tk.gradPrimary, color: '#fff' }}
            >
              Open dues
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </motion.section>

        {status && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl px-4 py-3 flex items-center gap-3"
            style={{ background: isLight ? '#EAF9F1' : 'rgba(48,255,172,0.10)', border: `1px solid ${isLight ? '#C7F0DC' : 'rgba(48,255,172,0.22)'}` }}
          >
            <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: tk.mint }} />
            <p className="text-sm font-medium" style={{ color: tk.text }}>
              {status}
            </p>
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl px-4 py-3 flex items-start gap-3"
            style={{ background: isLight ? '#FFF0EF' : 'rgba(239,68,68,0.12)', border: `1px solid ${isLight ? '#F8C7C2' : 'rgba(239,68,68,0.24)'}` }}
          >
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: tk.danger }} />
            <p className="text-sm leading-6" style={{ color: tk.text }}>
              {error}
            </p>
          </motion.div>
        )}

        <section className="space-y-3">
          <SectionHeader label="My groups" count={sortedGroups.length} theme={theme} dotColor={tk.primary} />
          {loading ? (
            <div className="grid gap-3">
              <GroupSkeleton theme={theme} />
              <GroupSkeleton theme={theme} />
            </div>
          ) : sortedGroups.length === 0 ? (
            <EmptyCard
              theme={theme}
              icon={<Users className="w-6 h-6" />}
              title={`No ${groupLabel.toLowerCase()} yet`}
              description="Join a group to start seeing its dues and members in this account."
            />
          ) : (
            <div className="grid gap-3">
              {sortedGroups.map((item, index) => {
                const km = kindMeta(item.kind, tk);
                const leaveDisabled = item.is_primary;
                return (
                  <motion.article
                    key={item.group_id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: index * 0.04 }}
                    className="rounded-3xl p-4 sm:p-5"
                    style={{
                      background: tk.card,
                      border: `1px solid ${tk.border}`,
                      boxShadow: isLight ? '0 1px 0 rgba(255,255,255,0.65) inset, 0 8px 22px -14px rgba(15,7,3,0.10)' : '0 1px 0 rgba(255,255,255,0.03) inset',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                        style={{ background: hexAlpha(km.color, 0.12), border: `1px solid ${hexAlpha(km.color, 0.22)}` }}
                      >
                        <km.icon className="w-5 h-5" style={{ color: km.color }} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[15px] sm:text-[16px] font-extrabold tracking-tight" style={{ color: tk.text }}>
                            {item.name}
                          </h3>
                          {item.short_name && (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: hexAlpha(tk.primary, 0.10), color: tk.primary }}>
                              {item.short_name}
                            </span>
                          )}
                          {item.is_primary && (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: hexAlpha(tk.mint, 0.12), color: tk.mint }}>
                              <Shield className="w-3 h-3" />
                              Primary
                            </span>
                          )}
                          {item.is_verified_exec && (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: hexAlpha(tk.blue, 0.12), color: tk.blue }}>
                              <BadgeCheck className="w-3 h-3" />
                              Exec access
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: hexAlpha(km.color, 0.10), color: km.color }}>
                            {km.label}
                          </span>
                          {item.parent_group_id && (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: hexAlpha(tk.textTer, 0.12), color: tk.textSec }}>
                              Linked group
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <p className="text-xs sm:text-sm" style={{ color: tk.textSec }}>
                        {item.is_primary
                          ? 'This is your primary group and stays attached to your core account.'
                          : 'You can leave this group anytime without affecting the others.'}
                      </p>
                      {leaveDisabled ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-semibold" style={{ background: hexAlpha(tk.mint, 0.10), color: tk.mint }}>
                          <CheckCircle2 className="w-4 h-4" />
                          Kept
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setLeaveTarget(item)}
                          className="inline-flex items-center gap-2 rounded-2xl px-3.5 py-2 text-xs font-semibold transition-transform active:scale-[0.98]"
                          style={{ background: hexAlpha(tk.danger, 0.10), color: tk.danger, border: `1px solid ${hexAlpha(tk.danger, 0.16)}` }}
                        >
                          <Minus className="w-4 h-4" />
                          Leave group
                        </button>
                      )}
                    </div>
                  </motion.article>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <SectionHeader label="Join more" count={joinableCount} theme={theme} dotColor={tk.mint} />
          {joinableLoading ? (
            <div className="grid gap-3">
              <GroupSkeleton theme={theme} />
              <GroupSkeleton theme={theme} />
            </div>
          ) : joinableGroups.length === 0 ? (
            <EmptyCard
              theme={theme}
              icon={<Sparkles className="w-6 h-6" />}
              title="Nothing else available"
              description="You’re already in every joinable group available to this account."
            />
          ) : (
            <div className="grid gap-3">
              {joinableGroups.map((item, index) => {
                const km = kindMeta(item.kind, tk);
                const busy = busyId === item.id;
                return (
                  <motion.article
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: index * 0.04 }}
                    className="rounded-3xl p-4 sm:p-5"
                    style={{
                      background: tk.card,
                      border: `1px solid ${tk.border}`,
                      boxShadow: isLight ? '0 1px 0 rgba(255,255,255,0.65) inset, 0 8px 22px -14px rgba(15,7,3,0.10)' : '0 1px 0 rgba(255,255,255,0.03) inset',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                        style={{ background: hexAlpha(km.color, 0.12), border: `1px solid ${hexAlpha(km.color, 0.22)}` }}
                      >
                        <km.icon className="w-5 h-5" style={{ color: km.color }} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[15px] sm:text-[16px] font-extrabold tracking-tight" style={{ color: tk.text }}>
                            {item.name}
                          </h3>
                          {item.short_name && (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: hexAlpha(tk.primary, 0.10), color: tk.primary }}>
                              {item.short_name}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: hexAlpha(km.color, 0.10), color: km.color }}>
                            {km.label}
                          </span>
                          {typeof item.current_member_count === 'number' && (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: hexAlpha(tk.textTer, 0.10), color: tk.textSec }}>
                              <Users className="w-3 h-3" />
                              {item.current_member_count.toLocaleString()} members
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <p className="text-xs sm:text-sm" style={{ color: tk.textSec }}>
                        Add this group to the same account so its dues appear automatically.
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleJoin(item)}
                        disabled={busy}
                        className="inline-flex items-center gap-2 rounded-2xl px-3.5 py-2 text-xs font-semibold transition-transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                        style={{ background: tk.gradPrimary, color: '#fff' }}
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Join group
                      </button>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <AnimatePresence>
        {leaveTarget && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.button
              type="button"
              className="absolute inset-0"
              style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(8px)' }}
              onClick={() => setLeaveTarget(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            />

            <motion.div
              className="relative w-full max-w-md rounded-[28px] overflow-hidden"
              style={{ background: tk.card, border: `1px solid ${tk.border}` }}
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.96 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="p-6">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: hexAlpha(tk.danger, 0.10), border: `1px solid ${hexAlpha(tk.danger, 0.18)}` }}>
                  <AlertTriangle className="w-5 h-5" style={{ color: tk.danger }} />
                </div>

                <h3 className="text-xl font-bold mb-2 tracking-tight" style={{ color: tk.text }}>
                  Leave {leaveTarget.name}?
                </h3>
                <p className="text-sm leading-6" style={{ color: tk.textSec }}>
                  This removes the group from your account. Any dues already published for the group stay in the system, but they will no longer appear in your membership list.
                </p>

                <div className="mt-5 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setLeaveTarget(null)}
                    className="flex-1 rounded-2xl px-4 py-3 text-sm font-semibold"
                    style={{ background: isLight ? '#F3EEEA' : 'rgba(255,255,255,0.06)', color: tk.text }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleLeave()}
                    className="flex-1 rounded-2xl px-4 py-3 text-sm font-semibold text-white"
                    style={{ background: tk.gradPrimary }}
                  >
                    {busyId === leaveTarget.group_id ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Leave group'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SummaryPill({ label, color, theme }: { label: string; color: string; theme: 'light' | 'dark' }) {
  const isLight = theme === 'light';
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-bold"
      style={{
        background: isLight ? hexAlpha(color, 0.10) : hexAlpha(color, 0.16),
        color,
        border: `1px solid ${hexAlpha(color, isLight ? 0.18 : 0.24)}`,
      }}
    >
      {label}
    </span>
  );
}

function SectionHeader({ label, count, dotColor, theme }: { label: string; count: number; dotColor: string; theme: 'light' | 'dark' }) {
  const t = getDashboardTokens(theme);
  return (
    <div className="flex items-center gap-2 px-1">
      <span className="w-2 h-2 rounded-full" style={{ background: dotColor }} />
      <h2 className="text-[14px] font-extrabold" style={{ color: t.text }}>
        {label}
      </h2>
      <span
        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
        style={{
          background: theme === 'light' ? '#F1EDEA' : 'rgba(255,255,255,0.06)',
          color: t.textSec,
        }}
      >
        {count}
      </span>
    </div>
  );
}

function EmptyCard({ theme, icon, title, description }: { theme: 'light' | 'dark'; icon: React.ReactNode; title: string; description: string }) {
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';
  return (
    <div
      className="rounded-3xl p-6 text-center"
      style={{ background: t.card, border: `1px solid ${t.cardBorder}` }}
    >
      <div
        className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center mb-3"
        style={{ background: isLight ? '#FFF1E3' : 'rgba(255,104,3,0.14)', color: t.primary }}
      >
        {icon}
      </div>
      <p className="text-sm font-bold" style={{ color: t.text }}>
        {title}
      </p>
      <p className="text-xs mt-1" style={{ color: t.textSec }}>
        {description}
      </p>
    </div>
  );
}

function GroupSkeleton({ theme }: { theme: 'light' | 'dark' }) {
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';
  return (
    <div className="rounded-3xl p-4 sm:p-5 animate-pulse" style={{ background: t.card, border: `1px solid ${t.cardBorder}` }}>
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl shrink-0" style={{ background: isLight ? '#EEE9E5' : 'rgba(255,255,255,0.05)' }} />
        <div className="flex-1 space-y-2">
          <div className="h-4 rounded w-1/2" style={{ background: isLight ? '#EEE9E5' : 'rgba(255,255,255,0.05)' }} />
          <div className="h-3 rounded w-3/5" style={{ background: isLight ? '#F0EAE6' : 'rgba(255,255,255,0.04)' }} />
          <div className="h-8 rounded w-40 ml-auto" style={{ background: isLight ? '#EEE9E5' : 'rgba(255,255,255,0.05)' }} />
        </div>
      </div>
    </div>
  );
}