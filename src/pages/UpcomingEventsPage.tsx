import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  CalendarDays,
  Search,
  Ticket as TicketIcon,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useAppNav } from '@/hooks/useAppNav';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
import { loadEvents, resolveBillingGroupIds } from '@/components/student/dashboard/EventsSection';
import EventCard, { type EventCardItem } from '@/components/student/dashboard/EventCard';

type FilterType = 'all' | 'available' | 'soldout';

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All Events' },
  { key: 'available', label: 'Available' },
  { key: 'soldout', label: 'Sold Out' },
];

export default function UpcomingEventsPage() {
  const { user: member } = useMultiTenantAuth();
  const { go } = useAppNav();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const t = useMemo(() => getDashboardTokens(theme), [theme]);
  const isLight = theme === 'light';

  const orgId = member?.organization?.id ?? '';
  const memberId = member?.id ?? null;

  const [events, setEvents] = useState<EventCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Resolve the member's billing group chain (class → dept →
      // faculty) so events targeted at a parent unit still show up
      // when the viewer is a class member below it.
      const billingGroupIds = await resolveBillingGroupIds(memberId);
      const list = await loadEvents(orgId, billingGroupIds);
      if (!cancelled) {
        setEvents(list);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orgId, memberId]);

  const filtered = useMemo(() => {
    let result = events;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.event_venue?.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q),
      );
    }
    if (filter === 'available') result = result.filter((e) => !e.isSoldOut && !e.isEnded);
    if (filter === 'soldout') result = result.filter((e) => e.isSoldOut);
    return result;
  }, [events, search, filter]);

  const upcomingCount = events.filter((e) => !e.isEnded && !e.isSoldOut).length;

  return (
    <div
      className="min-h-screen relative overflow-x-hidden"
      style={{ minHeight: '100dvh', background: t.bg }}
    >
      {/* Ambient background glow */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: isLight
            ? `radial-gradient(ellipse 60% 40% at 70% -10%, ${t.primary}18 0%, transparent 70%)`
            : `radial-gradient(ellipse 60% 40% at 70% -10%, ${t.primary}22 0%, transparent 70%)`,
        }}
      />

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-20">

        {/* ── Back + Hero Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mb-5 w-9 h-9 rounded-full flex items-center justify-center transition-colors"
            style={{
              background: t.card,
              border: `1px solid ${t.cardBorder}`,
              color: t.textSec,
            }}
            aria-label="Go back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p
                className="text-[10px] uppercase tracking-[0.18em] font-bold mb-1"
                style={{ color: t.primary }}
              >
                Happening Soon
              </p>
              <h1
                className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-none"
                style={{ color: t.text }}
              >
                Upcoming Events
              </h1>
              <p className="mt-2 text-sm" style={{ color: t.textSec }}>
                All events published for your organization.
              </p>
            </div>

            {/* Event count pill */}
            {!loading && events.length > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="flex items-center gap-2 self-start sm:self-auto rounded-2xl px-4 py-2.5"
                style={{
                  background: t.card,
                  border: `1px solid ${t.cardBorder}`,
                }}
              >
                <TicketIcon className="w-4 h-4" style={{ color: t.primary }} />
                <span className="text-sm font-bold" style={{ color: t.text }}>
                  {upcomingCount} available
                </span>
                <span className="text-xs" style={{ color: t.textTer }}>
                  / {events.length} total
                </span>
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* ── Search + Filter Bar ── */}
        {!loading && events.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.35 }}
            className="mb-6 flex flex-col sm:flex-row gap-3"
          >
            {/* Search input */}
            <div className="relative flex-1">
              <Search
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                style={{ color: t.textTer }}
              />
              <input
                type="text"
                placeholder="Search events, venues…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl pl-10 pr-9 py-2.5 text-sm font-medium outline-none transition-all"
                style={{
                  background: t.card,
                  border: `1px solid ${t.cardBorder}`,
                  color: t.text,
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: t.textTer }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter pills */}
            <div
              className="flex items-center gap-1.5 rounded-xl p-1"
              style={{ background: t.card, border: `1px solid ${t.cardBorder}` }}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 ml-2 shrink-0" style={{ color: t.textTer }} />
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className="rounded-lg px-3 py-1.5 text-xs font-bold transition-all"
                  style={{
                    background: filter === f.key ? t.primary : 'transparent',
                    color: filter === f.key ? '#fff' : t.textSec,
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── States ── */}
        {loading ? (
          <SkeletonGrid isLight={isLight} t={t} />
        ) : filtered.length === 0 ? (
          <EmptyState
            hasEvents={events.length > 0}
            search={search}
            isLight={isLight}
            t={t}
            onClear={() => { setSearch(''); setFilter('all'); }}
            onBack={() => go('/dashboard')}
          />
        ) : (
          <motion.div
            layout
            className="grid gap-5 lg:grid-cols-2"
          >
            <AnimatePresence mode="popLayout">
              {filtered.map((event, i) => (
                <motion.div
                  key={event.id}
                  layout
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.3, delay: i * 0.04 }}
                >
                  <EventCard
                    theme={theme}
                    item={event}
                    onGetTicket={(id) => go(`/payment/${id}`)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ── Result count ── */}
        {!loading && filtered.length > 0 && (filtered.length !== events.length || search) && (
          <p className="mt-6 text-center text-xs" style={{ color: t.textTer }}>
            Showing {filtered.length} of {events.length} events
          </p>
        )}
      </main>
    </div>
  );
}

/* ── Skeleton loader ── */
function SkeletonGrid({ isLight, t }: { isLight: boolean; t: ReturnType<typeof getDashboardTokens> }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.06 }}
          className="rounded-[24px] overflow-hidden"
          style={{
            background: t.card,
            border: `1px solid ${t.cardBorder}`,
            animation: 'skeletonPulse 1.8s ease-in-out infinite',
            animationDelay: `${i * 0.15}s`,
          }}
        >
          <div style={{ height: 176, background: isLight ? '#EDE8E3' : 'rgba(255,255,255,0.05)' }} />
          <div className="p-4 space-y-3">
            <div style={{ height: 14, borderRadius: 6, width: '65%', background: isLight ? '#E8E3DE' : 'rgba(255,255,255,0.06)' }} />
            <div style={{ height: 11, borderRadius: 6, width: '45%', background: isLight ? '#EEE9E4' : 'rgba(255,255,255,0.04)' }} />
            <div style={{ height: 38, borderRadius: 12, marginTop: 12, background: isLight ? '#E8E3DE' : 'rgba(255,255,255,0.06)' }} />
          </div>
        </motion.div>
      ))}
      <style>{`@keyframes skeletonPulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
    </div>
  );
}

/* ── Empty state ── */
function EmptyState({
  hasEvents,
  search,
  isLight,
  t,
  onClear,
  onBack,
}: {
  hasEvents: boolean;
  search: string;
  isLight: boolean;
  t: ReturnType<typeof getDashboardTokens>;
  onClear: () => void;
  onBack: () => void;
}) {
  const isFiltered = hasEvents;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl p-10 text-center flex flex-col items-center gap-4"
      style={{
        background: t.card,
        border: `1px solid ${t.cardBorder}`,
      }}
    >
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: isLight ? '#F5F1ED' : 'rgba(255,255,255,0.05)' }}
      >
        {isFiltered ? (
          <Search className="w-7 h-7" style={{ color: t.textTer }} />
        ) : (
          <CalendarDays className="w-7 h-7" style={{ color: t.textTer }} />
        )}
      </div>
      <div>
        <p className="text-lg font-bold" style={{ color: t.text }}>
          {isFiltered ? 'No matching events' : 'No upcoming events'}
        </p>
        <p className="mt-1 text-sm max-w-xs mx-auto" style={{ color: t.textSec }}>
          {isFiltered
            ? `No events match "${search || 'your filter'}". Try adjusting your search or filters.`
            : 'When an admin publishes a future event, it will appear here.'}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap justify-center">
        {isFiltered && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-xl px-4 py-2 text-sm font-bold transition-all"
            style={{
              background: isLight ? '#F5F1ED' : 'rgba(255,255,255,0.07)',
              color: t.text,
            }}
          >
            Clear filters
          </button>
        )}
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl px-4 py-2 text-sm font-bold"
          style={{ background: t.primary, color: '#fff' }}
        >
          Back to dashboard
        </button>
      </div>
    </motion.div>
  );
}