import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardTokens, type ResolvedTheme } from '@/hooks/useTheme';
import { supabase } from '@/config/supabase';
import EventCard, { type EventCardItem, type EventTier } from '@/components/student/dashboard/EventCard';

export interface EventsSectionProps {
  theme: ResolvedTheme;
  orgId: string;
  groupId?: string | null;
  currencySymbol?: string;
  onGetTicket?: (id: string) => void;
  maxItems?: number;
  showAllHref?: string | null;
}

export async function loadEvents(orgId: string, groupId?: string | null): Promise<EventCardItem[]> {
  if (!orgId) return [];

  const { data, error } = await supabase
    .from('payment_types')
    .select(`
      id,
      title,
      description,
      amount,
      color,
      group_id,
      event_date,
      event_venue,
      event_cover_url,
      event_max_attendees,
      event_ticket_tiers (
        id,
        name,
        description,
        price,
        quantity,
        sold_count,
        sort_order
      )
    `)
    .eq('organization_id', orgId)
    .eq('category', 'event')
    .eq('is_active', true)
    .limit(24);

  if (error || !data) return [];

  const now = new Date().toISOString();
  const deduped = new Map<string, {
    id: string;
    title: string;
    description: string | null;
    amount: number;
    color: string | null;
    group_id: string | null;
    event_date: string | null;
    event_venue: string | null;
    event_cover_url: string | null;
    event_max_attendees: number | null;
    event_ticket_tiers: Array<{
      id: string;
      name: string;
      description: string | null;
      price: number;
      quantity: number | null;
      sold_count: number | null;
      sort_order: number | null;
    }> | null;
  }>();

  (data as Array<{
    id: string;
    title: string;
    description: string | null;
    amount: number;
    color: string | null;
    group_id: string | null;
    event_date: string | null;
    event_venue: string | null;
    event_cover_url: string | null;
    event_max_attendees: number | null;
    event_ticket_tiers: Array<{
      id: string;
      name: string;
      description: string | null;
      price: number;
      quantity: number | null;
      sold_count: number | null;
      sort_order: number | null;
    }> | null;
  }>)
    .filter((event) => {
      const isUpcoming = !event.event_date || event.event_date >= now;
      const isInScope = !groupId || event.group_id === null || event.group_id === groupId;
      return isUpcoming && isInScope;
    })
    .sort((a, b) => {
      const ad = a.event_date ? new Date(a.event_date).getTime() : Number.MAX_SAFE_INTEGER;
      const bd = b.event_date ? new Date(b.event_date).getTime() : Number.MAX_SAFE_INTEGER;
      return ad - bd;
    })
    .slice(0, 12)
    .forEach((event) => {
      const signature = [
        event.title.trim().toLowerCase(),
        event.event_date ?? '',
        event.event_venue?.trim().toLowerCase() ?? '',
        String(event.amount ?? 0),
        event.event_cover_url ?? '',
      ].join('|');

      if (!deduped.has(signature)) deduped.set(signature, event);
    });

  return [...deduped.values()].map((event) => {
    const tiers: EventTier[] = (event.event_ticket_tiers || [])
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((tier) => ({
        id: tier.id,
        name: tier.name,
        price: Number(tier.price || 0),
        quantity: tier.quantity,
        sold_count: tier.sold_count ?? 0,
      }));

    const isSoldOut = tiers.length > 0
      ? tiers.every((tier) => tier.quantity !== null && tier.sold_count >= tier.quantity)
      : false;

    return {
      id: event.id,
      title: event.title,
      description: event.description,
      event_cover_url: event.event_cover_url,
      event_date: event.event_date,
      event_venue: event.event_venue,
      amount: Number(event.amount || 0),
      tiers: tiers.length > 0 ? tiers : undefined,
      isSoldOut,
      isEnded: event.event_date ? new Date(event.event_date).getTime() < Date.now() : false,
      color: event.color,
    } satisfies EventCardItem;
  });
}

export default function EventsSection({
  theme,
  orgId,
  groupId,
  currencySymbol = '₦',
  onGetTicket,
  maxItems = 2,
  showAllHref,
}: EventsSectionProps) {
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventCardItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    (async () => {
      const data = await loadEvents(orgId, groupId);
      if (mounted) {
        setEvents(data);
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [orgId, groupId]);

  if (!loading && events.length === 0) return null;

  const visibleEvents = typeof maxItems === 'number' ? events.slice(0, maxItems) : events;
  const showAll = Boolean(showAllHref && events.length > visibleEvents.length);

  return (
    <section className="relative mb-1">
      <header className="px-1 mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] font-bold" style={{ color: t.primary }}>
            Happening Soon
          </p>
          <h2 className="text-base sm:text-lg font-extrabold tracking-tight" style={{ color: t.text }}>
            Upcoming Events
          </h2>
        </div>
        {showAll && (
          <button
            type="button"
            onClick={() => navigate(showAllHref)}
            className="text-xs font-bold rounded-full px-3 py-1.5 transition-colors"
            style={{ color: t.primary, background: isLight ? '#FFF4EB' : 'rgba(255,104,3,0.12)' }}
          >
            View all
          </button>
        )}
      </header>

      {loading && (
        <div className="grid gap-3" style={{ maxWidth: 760, marginInline: 'auto' }}>
          {[0, 1].map((i) => (
            <div
              key={i}
              className="rounded-[24px] overflow-hidden"
              style={{
                width: '100%',
                background: isLight ? '#F5F1ED' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isLight ? 'rgba(15,7,3,0.06)' : 'rgba(255,255,255,0.06)'}`,
                animation: 'pulse 2s infinite',
              }}
            >
              <div style={{ height: 168, background: isLight ? '#EDE8E3' : 'rgba(255,255,255,0.06)' }} />
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ height: 16, borderRadius: 6, background: isLight ? '#EDE8E3' : 'rgba(255,255,255,0.06)', width: '72%' }} />
                <div style={{ height: 12, borderRadius: 6, background: isLight ? '#F0ECE8' : 'rgba(255,255,255,0.04)', width: '54%' }} />
                <div style={{ height: 36, borderRadius: 12, marginTop: 8, background: isLight ? '#EDE8E3' : 'rgba(255,255,255,0.06)' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && events.length > 0 && (
        <div
          style={{
            display: 'grid',
            gap: 16,
            gridTemplateColumns: '1fr',
            maxWidth: 760,
            marginInline: 'auto',
          }}
        >
          {visibleEvents.map((event) => (
            <div key={event.id} style={{ width: '100%' }}>
              <EventCard
                theme={theme}
                item={event}
                currencySymbol={currencySymbol}
                onGetTicket={onGetTicket}
              />
            </div>
          ))}
        </div>
      )}

      <style>{`\n        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.55} }\n      `}</style>
    </section>
  );
}