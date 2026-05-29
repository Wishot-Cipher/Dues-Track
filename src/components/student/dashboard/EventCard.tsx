import { motion } from 'framer-motion';
import { CalendarDays, ChevronRight, MapPin, Sparkles, Ticket } from 'lucide-react';
import { getDashboardTokens, type ResolvedTheme } from '@/hooks/useTheme';
import { formatDate } from '@/utils/formatters';

export interface EventTier {
  id: string;
  name: string;
  price: number;
  quantity: number | null;
  sold_count: number;
}

export interface EventCardItem {
  id: string;
  title: string;
  description: string | null;
  event_cover_url: string | null;
  event_date: string | null;
  event_venue: string | null;
  amount: number;
  tiers?: EventTier[];
  isSoldOut: boolean;
  isEnded: boolean;
  color: string | null;
}

export interface EventCardProps {
  theme: ResolvedTheme;
  item: EventCardItem;
  currencySymbol?: string;
  fixedWidth?: boolean;
  onGetTicket?: (id: string) => void;
}

function formatMoney(amount: number, currencySymbol: string): string {
  return `${currencySymbol}${amount.toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function hexAlpha(color: string, alpha: number): string {
  if (!color.startsWith('#') || color.length !== 7) return color;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function EventCard({
  theme,
  item,
  currencySymbol = '₦',
  fixedWidth = false,
  onGetTicket,
}: EventCardProps) {
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';
  const accent = item.color || t.primary;
  const cover = item.event_cover_url;
  const tiers = item.tiers || [];
  const minTierPrice = tiers.length > 0 ? Math.min(...tiers.map((tier) => Number(tier.price || 0))) : null;
  const displayPrice = minTierPrice !== null && Number.isFinite(minTierPrice) ? minTierPrice : Number(item.amount || 0);
  const isEnded = item.isEnded || Boolean(item.event_date && new Date(item.event_date).getTime() < Date.now());
  const topLabel = tiers.length > 0 ? `${tiers.length} ticket type${tiers.length > 1 ? 's' : ''}` : 'General entry';
  const ticketActionLabel = isEnded ? 'Ended' : item.isSoldOut ? 'Sold out' : 'Get Ticket';

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`relative overflow-hidden rounded-[24px] ${fixedWidth ? 'w-[280px] sm:w-full' : 'w-full'}`}
      style={{
        background: t.card,
        border: `1px solid ${t.cardBorder}`,
        boxShadow: isLight
          ? '0 1px 0 rgba(255,255,255,0.75) inset, 0 10px 28px -16px rgba(15,7,3,0.16)'
          : '0 1px 0 rgba(255,255,255,0.02) inset',
      }}
    >
      <div className="relative h-40 sm:h-44 overflow-hidden">
        {cover ? (
          <img
            src={cover}
            alt={item.title}
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              objectPosition: 'center center',
            }}
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${hexAlpha(accent, 0.92)}, ${hexAlpha(t.primary, 0.76)})`,
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/38 via-black/8 to-transparent" />
        <div className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] backdrop-blur-md"
             style={{
               background: isLight ? 'rgba(255,255,255,0.78)' : 'rgba(15,7,3,0.42)',
               color: isLight ? t.text : '#FFFFFF',
               border: `1px solid ${isLight ? 'rgba(15,7,3,0.08)' : 'rgba(255,255,255,0.10)'}`,
             }}>
          <Sparkles className="w-3 h-3" />
          Event
        </div>
        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3 text-white">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80">{topLabel}</p>
            <p className="text-[18px] sm:text-[20px] font-extrabold leading-tight line-clamp-2">
              {item.title}
            </p>
          </div>
          <div
            className="shrink-0 rounded-2xl px-3 py-2 text-right backdrop-blur-md"
            style={{ background: 'rgba(0,0,0,0.28)' }}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">From</p>
            <p className="text-[14px] font-extrabold leading-none">{formatMoney(displayPrice, currencySymbol)}</p>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        <p className="text-sm leading-relaxed line-clamp-2" style={{ color: t.textSec }}>
          {item.description || 'Tap to view ticket options and secure your seat.'}
        </p>

        <div className="flex flex-wrap gap-2">
          {item.event_date && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold" style={{ background: `${t.primarySoft}`, color: t.primary }}>
              <CalendarDays className="w-3.5 h-3.5" />
              {formatDate(item.event_date, 'short')}
            </span>
          )}
          {item.event_venue && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold truncate max-w-full" style={{ background: `${t.mint}12`, color: t.mint }}>
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{item.event_venue}</span>
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: t.textTer }}>
                {isEnded ? 'Status' : item.isSoldOut ? 'Availability' : 'Tickets'}
            </p>
            <p className="text-sm font-semibold" style={{ color: item.isSoldOut ? t.danger : t.text }}>
                {isEnded
                  ? 'Ended'
                  : item.isSoldOut
                    ? 'Sold out'
                    : `${tiers.length || 1} option${(tiers.length || 1) > 1 ? 's' : ''}`}
            </p>
          </div>

          <motion.button
            type="button"
            whileHover={{ scale: item.isSoldOut || isEnded ? 1 : 1.02 }}
            whileTap={{ scale: item.isSoldOut || isEnded ? 1 : 0.98 }}
            onClick={() => onGetTicket?.(item.id)}
            disabled={item.isSoldOut || isEnded || !onGetTicket}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background: item.isSoldOut || isEnded ? `${t.danger}12` : t.gradOrange,
              color: item.isSoldOut || isEnded ? t.danger : '#FFFFFF',
              boxShadow: item.isSoldOut || isEnded ? 'none' : `0 8px 20px ${t.primary}28`,
            }}
          >
            <Ticket className="w-4 h-4" />
            {ticketActionLabel}
            {!item.isSoldOut && !isEnded && <ChevronRight className="w-4 h-4" />}
          </motion.button>
        </div>
      </div>
    </motion.article>
  );
}