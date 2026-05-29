import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Calendar, CheckCircle2, CreditCard, Loader2, MapPin, Ticket as TicketIcon, User, Mail, Phone } from 'lucide-react';
import { supabase } from '@/config/supabase';
import { useThemeTokens } from '@/hooks/useThemeTokens';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { useToast } from '@/hooks/useToast';
import paystackService from '@/services/paystackService';

interface PublicEventTier {
  id: string;
  name: string;
  description: string | null;
  price: number;
  quantity: number | null;
  sold_count: number | null;
  sort_order: number | null;
}

interface PublicEvent {
  id: string;
  title: string;
  description: string | null;
  amount: number;
  color: string | null;
  event_date: string | null;
  event_venue: string | null;
  event_cover_url: string | null;
  is_public: boolean;
  is_active: boolean;
  accepts_paystack: boolean;
  event_ticket_tiers: PublicEventTier[] | null;
}

interface PublicOrg {
  id: string;
  name: string;
  slug: string;
  short_name: string | null;
}

function isSoldOut(tier: PublicEventTier): boolean {
  return tier.quantity !== null && Number(tier.sold_count || 0) >= Number(tier.quantity);
}

export default function PublicEventCheckoutPage() {
  const t = useThemeTokens();
  const navigate = useNavigate();
  const toast = useToast();
  const { orgSlug, eventId } = useParams<{ orgSlug: string; eventId: string }>();

  const [org, setOrg] = useState<PublicOrg | null>(null);
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [selectedTierId, setSelectedTierId] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);

      if (!orgSlug || !eventId) {
        if (!cancelled) setLoading(false);
        return;
      }

      const { data: orgRow } = await supabase
        .from('organizations')
        .select('id, name, slug, short_name')
        .eq('slug', orgSlug)
        .maybeSingle();

      if (!orgRow) {
        if (!cancelled) {
          setOrg(null);
          setEvent(null);
          setLoading(false);
        }
        return;
      }

      const { data: eventRow } = await supabase
        .from('payment_types')
        .select(`
          id,
          title,
          description,
          amount,
          color,
          event_date,
          event_venue,
          event_cover_url,
          is_public,
          is_active,
          accepts_paystack,
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
        .eq('organization_id', orgRow.id)
        .eq('id', eventId)
        .eq('category', 'event')
        .maybeSingle();

      if (cancelled) return;

      setOrg(orgRow as PublicOrg);
      setEvent((eventRow as PublicEvent | null) || null);
      setSelectedTierId((eventRow?.event_ticket_tiers || [])[0]?.id || '');
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [orgSlug, eventId]);

  const tiers = useMemo(() => {
    return (event?.event_ticket_tiers || [])
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [event?.event_ticket_tiers]);

  const selectedTier = useMemo(
    () => tiers.find((tier) => tier.id === selectedTierId) || null,
    [tiers, selectedTierId],
  );

  const baseAmount = selectedTier ? Number(selectedTier.price || 0) : Number(event?.amount || 0);
  const soldOut = tiers.length > 0 ? tiers.every(isSoldOut) : false;
  const eventEnded = event?.event_date ? new Date(event.event_date).getTime() < Date.now() : false;
  const canBuy = Boolean(event?.is_public && event?.is_active && event?.accepts_paystack && !eventEnded && !soldOut);

  const coverStyle = event?.event_cover_url
    ? { backgroundImage: `linear-gradient(180deg, rgba(15,7,3,0.18), rgba(15,7,3,0.78)), url(${event.event_cover_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundImage: `linear-gradient(135deg, ${event?.color || t.primary}33, rgba(255,255,255,0.03))` };

  async function handleSubmit() {
    if (!event || !org) return;
    if (!canBuy) return;
    if (!buyerName.trim() || !buyerEmail.trim()) {
      toast.error('Add your name and email to continue');
      return;
    }
    if (tiers.length > 0) {
      if (!selectedTier) {
        toast.error('Choose a ticket type');
        return;
      }
      if (isSoldOut(selectedTier)) {
        toast.error('That ticket type is sold out');
        return;
      }
    }

    setSubmitting(true);
    try {
      const result = await paystackService.initialize({
        paymentTypeId: event.id,
        tierId: selectedTier?.id || undefined,
        guestName: buyerName.trim(),
        guestEmail: buyerEmail.trim(),
        guestPhone: buyerPhone.trim() || undefined,
        callbackPath: `/${org.slug}/payments/verify`,
      });

      if (!result.ok || !result.authorization_url) {
        toast.error(result.error || 'Could not start checkout');
        return;
      }

      window.location.href = result.authorization_url;
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: t.bg }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: t.primary }} />
      </div>
    );
  }

  if (!org || !event || !event.is_public) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center" style={{ background: t.bg }}>
        <div className="max-w-sm">
          <TicketIcon className="w-10 h-10 mx-auto mb-4" style={{ color: t.textTer }} />
          <h1 className="text-2xl font-extrabold text-white mb-2">Event not available</h1>
          <p className="text-sm mb-6" style={{ color: t.textSec }}>
            This event is not open for public checkout, or the link is incorrect.
          </p>
          <button
            type="button"
            onClick={() => navigate(`/${orgSlug || ''}/contribute`)}
            className="px-4 py-2 rounded-xl font-semibold"
            style={{ background: t.primary, color: '#fff' }}
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ minHeight: '100dvh', background: t.bg }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-8">
        <button
          type="button"
          onClick={() => navigate(`/${org.slug}/events`)}
          className="inline-flex items-center gap-2 text-sm font-medium mb-5"
          style={{ color: t.textSec }}
        >
          <ArrowLeft className="w-4 h-4" /> Back to events
        </button>

        <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-5 lg:gap-6 items-start">
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-[28px] border"
            style={{ background: t.card, borderColor: t.cardBorder, boxShadow: t.shadowLg }}
          >
            <div className="relative min-h-[240px] p-6 sm:p-8 flex flex-col justify-end" style={coverStyle}>
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold mb-3" style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>
                  <TicketIcon className="w-3.5 h-3.5" /> Public event checkout
                </div>
                <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white max-w-xl">{event.title}</h1>
                <p className="mt-3 text-sm sm:text-base max-w-2xl" style={{ color: 'rgba(255,255,255,0.82)' }}>
                  {event.description || 'Secure your ticket with a guest checkout. No login required.'}
                </p>
                <div className="flex flex-wrap gap-3 mt-4 text-sm text-white/85">
                  {event.event_date && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur">
                      <Calendar className="w-3.5 h-3.5" /> {formatDate(event.event_date, 'long')}
                    </span>
                  )}
                  {event.event_venue && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur">
                      <MapPin className="w-3.5 h-3.5" /> {event.event_venue}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-8 space-y-6">
              {eventEnded && (
                <div className="rounded-2xl p-4 border" style={{ background: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.20)' }}>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 mt-0.5" style={{ color: '#ef4444' }} />
                    <div>
                      <p className="font-semibold text-white">This event has ended</p>
                      <p className="text-sm" style={{ color: t.textSec }}>Tickets are no longer available for this event.</p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs uppercase tracking-[0.18em] font-bold mb-3" style={{ color: t.textTer }}>Choose ticket</p>
                {tiers.length > 0 ? (
                  <div className="grid gap-3">
                    {tiers.map((tier) => {
                      const active = selectedTierId === tier.id;
                      const sold = isSoldOut(tier);
                      return (
                        <button
                          key={tier.id}
                          type="button"
                          onClick={() => setSelectedTierId(tier.id)}
                          disabled={sold}
                          className="w-full text-left rounded-2xl p-4 border transition-all"
                          style={{
                            background: active ? 'rgba(255,104,3,0.08)' : 'rgba(255,255,255,0.03)',
                            borderColor: active ? t.primary : t.cardBorder,
                            opacity: sold ? 0.55 : 1,
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">{tier.name}</p>
                              {tier.description && <p className="text-sm mt-1" style={{ color: t.textSec }}>{tier.description}</p>}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-bold text-white">{formatCurrency(tier.price)}</p>
                              <p className="text-xs mt-1" style={{ color: sold ? '#ef4444' : t.textTer }}>{sold ? 'Sold out' : 'Available'}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl p-4 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: t.cardBorder }}>
                    <p className="text-sm text-white">General admission</p>
                    <p className="text-xs mt-1" style={{ color: t.textSec }}>Standard entry at {formatCurrency(event.amount || 0)}.</p>
                  </div>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-xs uppercase tracking-[0.16em] font-bold mb-2" style={{ color: t.textTer }}>Full name</span>
                  <div className="flex items-center gap-2 rounded-2xl px-4 py-3 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: t.cardBorder }}>
                    <User className="w-4 h-4" style={{ color: t.textTer }} />
                    <input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} className="w-full bg-transparent outline-none text-white placeholder:text-white/35" placeholder="Your full name" />
                  </div>
                </label>

                <label className="block">
                  <span className="block text-xs uppercase tracking-[0.16em] font-bold mb-2" style={{ color: t.textTer }}>Email</span>
                  <div className="flex items-center gap-2 rounded-2xl px-4 py-3 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: t.cardBorder }}>
                    <Mail className="w-4 h-4" style={{ color: t.textTer }} />
                    <input value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} type="email" className="w-full bg-transparent outline-none text-white placeholder:text-white/35" placeholder="name@example.com" />
                  </div>
                </label>

                <label className="block sm:col-span-2">
                  <span className="block text-xs uppercase tracking-[0.16em] font-bold mb-2" style={{ color: t.textTer }}>Phone number</span>
                  <div className="flex items-center gap-2 rounded-2xl px-4 py-3 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: t.cardBorder }}>
                    <Phone className="w-4 h-4" style={{ color: t.textTer }} />
                    <input value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} className="w-full bg-transparent outline-none text-white placeholder:text-white/35" placeholder="0800 000 0000" />
                  </div>
                </label>
              </div>
            </div>
          </motion.section>

          <motion.aside
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="sticky top-4 rounded-[28px] p-5 sm:p-6 border"
            style={{ background: t.card, borderColor: t.cardBorder, boxShadow: t.shadow }}
          >
            <p className="text-xs uppercase tracking-[0.18em] font-bold mb-3" style={{ color: t.textTer }}>Summary</p>
            <h2 className="text-xl font-extrabold text-white">{org.short_name || org.name}</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span style={{ color: t.textSec }}>Event</span>
                <span className="text-white font-medium text-right">{event.title}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span style={{ color: t.textSec }}>Ticket</span>
                <span className="text-white font-medium text-right">{selectedTier?.name || 'General admission'}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span style={{ color: t.textSec }}>Amount</span>
                <span className="text-white font-bold">{formatCurrency(baseAmount)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canBuy || submitting}
              className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 font-bold transition-opacity disabled:cursor-not-allowed"
              style={{ background: canBuy ? t.primary : 'rgba(255,255,255,0.08)', color: canBuy ? '#fff' : 'rgba(255,255,255,0.45)' }}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
              {submitting ? 'Starting checkout…' : `Pay ${formatCurrency(baseAmount)}`}
            </button>

            <p className="mt-4 text-xs leading-5" style={{ color: t.textTer }}>
              After payment, you will be sent to your ticket page. Keep the ticket link safe or screenshot it.
            </p>
          </motion.aside>
        </div>
      </div>
    </div>
  );
}