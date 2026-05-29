gitimport { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Loader2, Ticket as TicketIcon } from 'lucide-react';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useAppNav } from '@/hooks/useAppNav';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
import { formatDate } from '@/utils/formatters';
import { loadEvents } from '@/components/student/dashboard/EventsSection';
import EventCard, { type EventCardItem } from '@/components/student/dashboard/EventCard';

export default function UpcomingEventsPage() {
  const { user: member } = useMultiTenantAuth();
  const { go } = useAppNav();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const t = useMemo(() => getDashboardTokens(theme), [theme]);

  const orgId = member?.organization?.id ?? '';
  const groupId = member?.group?.id ?? null;

  const [events, setEvents] = useState<EventCardItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      const list = await loadEvents(orgId, groupId);
      if (!cancelled) {
        setEvents(list);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId, groupId]);

  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{ minHeight: '100dvh', background: t.bg }}>
      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-5 pb-16">
        <header className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
            style={{ background: t.card, border: `1px solid ${t.cardBorder}`, color: t.text }}
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] font-bold" style={{ color: t.primary }}>
              Events
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight" style={{ color: t.text }}>
              Upcoming Events
            </h1>
          </div>
        </header>

        <div className="mb-5 flex flex-wrap items-center gap-2 text-xs" style={{ color: t.textSec }}>
          <CalendarDays className="w-4 h-4" style={{ color: t.primary }} />
          <span>All upcoming events for your organization are listed here.</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20" style={{ color: t.textSec }}>
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : events.length === 0 ? (
          <div
            className="rounded-3xl p-8 text-center"
            style={{ background: t.card, border: `1px solid ${t.cardBorder}`, boxShadow: t.shadow }}
          >
            <TicketIcon className="w-11 h-11 mx-auto mb-3" style={{ color: t.textTer }} />
            <p className="text-lg font-bold" style={{ color: t.text }}>
              No upcoming events
            </p>
            <p className="mt-1 text-sm" style={{ color: t.textSec }}>
              When an admin publishes a future event, it will appear here.
            </p>
            <button
              type="button"
              onClick={() => go('/dashboard')}
              className="mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold"
              style={{ background: t.primary, color: '#fff' }}
            >
              Back to dashboard
            </button>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {events.map((event) => (
              <EventCard
                key={event.id}
                theme={theme}
                item={event}
                onGetTicket={(id) => go(`/payment/${id}`)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
