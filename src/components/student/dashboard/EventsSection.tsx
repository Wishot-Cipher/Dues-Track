import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardTokens, type ResolvedTheme } from '@/hooks/useTheme';
import { supabase } from '@/config/supabase';
import EventCard, { type EventCardItem, type EventTier } from '@/components/student/dashboard/EventCard';

export interface EventsSectionProps {
  theme: ResolvedTheme;
  orgId: string;
  memberId?: string | null;
  groupId?: string | null;
  currencySymbol?: string;
  onGetTicket?: (id: string) => void;
  maxItems?: number;
  showAllHref?: string | null;
}

/**
 * Set of payment_type_ids (events) the member has already paid for
 * in this org. "Paid" here means an APPROVED payment that isn't a
 * waiver (transaction_ref doesn't start with "WAIVED-"). Used so
 * the dashboard can show "Ticket secured" on cards the member
 * already bought without removing them — they can still grab
 * another for a friend. Empty set when the query fails, so we
 * don't silently hide everyone's tickets if RLS misbehaves.
 */
export async function loadPaidEventIds(memberId: string, orgId: string): Promise<Set<string>> {
  if (!memberId || !orgId) return new Set();
  try {
    const { data } = await supabase
      .from('payments')
      .select('payment_type_id, transaction_ref, status')
      .eq('member_id', memberId)
      .eq('organization_id', orgId)
      .eq('status', 'approved');
    const ids = new Set<string>();
    for (const row of (data || []) as Array<{ payment_type_id: string | null; transaction_ref: string | null }>) {
      if (!row.payment_type_id) continue;
      if (row.transaction_ref?.startsWith('WAIVED-')) continue;
      ids.add(row.payment_type_id);
    }
    return ids;
  } catch {
    return new Set();
  }
}

export async function resolveBillingGroupIds(memberId: string | null | undefined): Promise<string[] | null> {
  if (!memberId) return null;
  try {
    const { data } = await supabase.rpc('get_my_billing_group_ids', { p_member_id: memberId });
    const ids = data && (data as { ok?: boolean }).ok
      ? (data as { group_ids?: string[] }).group_ids
      : null;
    if (Array.isArray(ids) && ids.length) return ids.filter(Boolean);
  } catch {
    // RPC not deployed — fall through.
  }
  return null;
}

export async function loadEvents(
  orgId: string,
  billingGroupIds: string[] | null,
): Promise<EventCardItem[]> {
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
        price,
        quantity,
        sold_count,
        sort_order
      )
    `)
    .eq('organization_id', orgId)
    .eq('category', 'event')
    .eq('is_active', true)
    .gte('event_date', new Date().toISOString())
    .order('event_date', { ascending: true })
    .limit(12);

  if (error || !data) return [];

  const allowedGroupIds = billingGroupIds && billingGroupIds.length > 0
    ? new Set(billingGroupIds)
    : null;

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
      price: number;
      quantity: number | null;
      sold_count: number | null;
      sort_order: number | null;
    }> | null;
  }>)
    .filter((event) => {
      const isInScope = !allowedGroupIds
        || event.group_id === null
        || allowedGroupIds.has(event.group_id);
      return isInScope;
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
      isEnded: false,
      color: event.color,
    } satisfies EventCardItem;
  });
}

export default function EventsSection({
  theme,
  orgId,
  memberId,
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
  // Set of payment_type_ids the member has already paid for. Used
  // to render a "Ticket secured" badge on event cards they already
  // bought + flip the CTA to "Buy another" — so a member can pick
  // up tickets for friends without us removing the event from
  // their dashboard. Empty set when memberId isn't known yet.
  const [paidEventIds, setPaidEventIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    (async () => {
      const billingGroupIds = memberId
        ? await resolveBillingGroupIds(memberId)
        : (groupId ? [groupId] : null);
      // Events + member's existing tickets in parallel. The two
      // queries don't depend on each other, so paying the latency
      // for them serially would just slow the dashboard down.
      const [data, paidSet] = await Promise.all([
        loadEvents(orgId, billingGroupIds),
        memberId ? loadPaidEventIds(memberId, orgId) : Promise.resolve(new Set<string>()),
      ]);
      if (mounted) {
        setEvents(data);
        setPaidEventIds(paidSet);
        setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [orgId, memberId, groupId]);

  if (!loading && events.length === 0) return null;

  const visibleEvents = typeof maxItems === 'number' ? events.slice(0, maxItems) : events;
  const showAll = Boolean(showAllHref && events.length > visibleEvents.length);
  const hasMultiple = visibleEvents.length > 1;

  return (
    <section className="relative mb-1">
      <header className="px-1 mb-3 flex items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="w-1.5 h-7 rounded-full"
            style={{ background: `linear-gradient(180deg, ${t.primary}, ${t.primary}55)` }}
          />
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold" style={{ color: t.primary }}>
              Happening soon
            </p>
            <h2 className="text-base sm:text-lg font-extrabold tracking-tight" style={{ color: t.text }}>
              Upcoming events
            </h2>
          </div>
        </div>
        {showAll && (
          <button
            type="button"
            onClick={() => showAllHref && navigate(showAllHref)}
            className="text-xs font-bold rounded-full px-3 py-1.5 transition-colors inline-flex items-center gap-1"
            style={{ color: t.primary, background: isLight ? '#FFF4EB' : 'rgba(255,104,3,0.12)' }}
          >
            View all
            <span aria-hidden>→</span>
          </button>
        )}
      </header>

      {loading && (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: hasMultiple ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr' }}
        >
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
          className="grid gap-4"
          style={{
            gridTemplateColumns: hasMultiple ? 'repeat(auto-fit, minmax(320px, 1fr))' : 'minmax(0, 760px)',
            justifyContent: hasMultiple ? 'stretch' : 'center',
          }}
        >
          {visibleEvents.map((event) => (
            <div key={event.id} style={{ width: '100%' }}>
              <EventCard
                theme={theme}
                item={event}
                currencySymbol={currencySymbol}
                onGetTicket={onGetTicket}
                alreadyPurchased={paidEventIds.has(event.id)}
              />
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.55} }`}</style>
    </section>
  );
}