/**
 * PlatformNoticeBoard — v8: adds real "wow" polish on top of v7's
 * layout fix, without reintroducing the class of bug v7 eliminated.
 *
 * ════════════════════════════════════════════════════════════════════
 * WHY v5/v6 KEPT BREAKING (kept from v7 — still the load-bearing lesson)
 * ════════════════════════════════════════════════════════════════════
 * v5 and v6 positioned every notice with `position: absolute; left:
 * 50%` plus an animated `x: calc(-50% + Npx)` transform, manually
 * recreating centering with math instead of using real layout. Across
 * three attempted fixes, that one design decision produced three
 * different failure modes — most visibly: front/background cards had
 * DIFFERENT widths, and since `-50%` resolves against an element's OWN
 * (changing) width, animating width and x at the same time made the
 * card drift sideways every time depth changed.
 *
 * v7's fix: no absolute positioning for notice cards, no animated
 * x/left transform anywhere, centering via real CSS layout (`margin:
 * 0 auto` on a normally-flowed block). v7 also left an explicit note
 * for the future: "if you want the scattered-depth look back later,
 * it should be rebuilt using Framer Motion's `layout` prop on elements
 * that are NORMALLY POSITIONED."
 *
 * ════════════════════════════════════════════════════════════════════
 * WHAT v8 ADDS, AND WHY EACH PIECE IS A DIFFERENT RISK CLASS THAN THE
 * ORIGINAL BUG
 * ════════════════════════════════════════════════════════════════════
 *   1. Shared `layoutId` morph (strip row ↔ full card). This is
 *      Framer's own FLIP engine — it measures real getBoundingClientRect
 *      values fresh on every transition, it does not reuse a hand-
 *      written `calc(-50% + Npx)` string. This is exactly the rebuild
 *      path v7's own comment pointed at.
 *   2. Pin-pop entrance + impact ring. These animate scale/y/opacity
 *      on a small, FIXED-SIZE (24×24px, never animated) child element.
 *      Its horizontal centering uses `left:50%` + a STATIC `x:'-50%'`
 *      — a constant offset against a constant width, which can never
 *      drift, and is the same technique v7's pin already used via
 *      Tailwind's `-translate-x-1/2` (just expressed as a motion style
 *      value here so it composes with the new scale/opacity props on
 *      the same element).
 *   3. Milestone sparkle burst. A decorative, `pointer-events: none`
 *      overlay confined inside the already-positioned card. It never
 *      participates in placing the card itself.
 *   4. Per-notice jaunty rotation (front card + strip rows). A STATIC
 *      number derived once from a deterministic hash of the notice id
 *      — never animated, never recalculated against a changing width.
 *
 * None of these touch how the card or the board itself is CENTERED.
 * Deliberately NOT added: pointer-tracking 3D tilt. It would stack a
 * second live transform system onto the same element that's already
 * mid-layoutId-morph, which is the "two clever things touching the
 * same element" shape that caused trouble here before, and it isn't
 * something I can verify by eye from this environment. Worth doing
 * later as its own isolated pass if wanted.
 */

import { useEffect, useState, useMemo } from 'react';
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  useSpring,
  useTransform,
  LayoutGroup,
} from 'framer-motion';
import {
  Megaphone,
  Lightbulb,
  RefreshCw,
  Wrench,
  Trophy,
  ArrowUpRight,
  PinIcon,
  ChevronRight,
} from 'lucide-react';
import { getActiveNotices, type PlatformNotice } from '@/services/PlatformNoticeService';

const MONO = '"JetBrains Mono","Fira Code","Cascadia Code",ui-monospace,monospace';
const SERIF = 'Georgia, "Times New Roman", serif';
const EASE = [0.22, 1, 0.36, 1] as const;
const LAYOUT_SPRING = { type: 'spring' as const, stiffness: 340, damping: 32 };

type NoticeKind = PlatformNotice['kind'];

const PIN: Record<
  NoticeKind,
  {
    hex: string;
    dark: string;
    label: string;
    subtitle: string;
    Icon: React.ElementType;
    register: 'formal' | 'casual' | 'celebratory';
  }
> = {
  announcement: { hex: '#E0483D', dark: '#A02F27', label: 'Announcement', subtitle: 'Org updates',      Icon: Megaphone,  register: 'formal' },
  tip:          { hex: '#3B7DD8', dark: '#28579A', label: 'Tip',          subtitle: 'Worth knowing',    Icon: Lightbulb,  register: 'casual' },
  update:       { hex: '#D89B2E', dark: '#9C6F1E', label: 'Update',       subtitle: 'Platform news',    Icon: RefreshCw,  register: 'formal' },
  maintenance:  { hex: '#6B6258', dark: '#48423B', label: 'Maintenance',  subtitle: 'Heads up',          Icon: Wrench,     register: 'formal' },
  milestone:    { hex: '#C9A227', dark: '#8F721A', label: 'Milestone',    subtitle: 'Worth celebrating', Icon: Trophy,     register: 'celebratory' },
};

function weatheringFor(createdAt: string): { desaturate: number; paperTint: string; shadowSoften: number; isFresh: boolean } {
  const days = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  if (days < 2) return { desaturate: 0, paperTint: '#FBF7EC', shadowSoften: 0, isFresh: true };
  if (days < 10) return { desaturate: 0.08, paperTint: '#F7F1E2', shadowSoften: 0.15, isFresh: false };
  return { desaturate: 0.18, paperTint: '#F0E8D4', shadowSoften: 0.3, isFresh: false };
}

// Deterministic, STATIC per-id jitter — never animated, never
// recalculated against a changing dimension. Computed once and reused
// wherever the same notice appears (front card or strip row), so a
// given notice always tilts the same small amount.
function hashRotation(id: string, spread = 1.6): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ((h % 1000) / 1000) * (spread * 2) - spread;
}

interface Props {
  theme: 'light' | 'dark';
  orgId: string | null;
}

export default function PlatformNoticeBoard({ theme, orgId }: Props) {
  const reduceMotion = !!useReducedMotion();
  const isLight = theme === 'light';

  const [notices, setNotices] = useState<PlatformNotice[]>([]);
  const [loading, setLoading] = useState(true);
  // `frontId` is just the id of whichever notice is currently shown
  // full-size. Switching it is a plain state update — no position
  // math, no transform recalculation, nothing that can drift. The
  // shared layoutId on PinnedNoticeCard / NoticeStripRow is what turns
  // that plain swap into a visible morph.
  const [frontId, setFrontId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await getActiveNotices(orgId, 6);
      if (cancelled) return;
      setNotices(data);
      setFrontId(data[0]?.id ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  // ── Spring-physics nameplate swing — unchanged from earlier
  // versions, this was never implicated in the bug. ──────────────────
  const swing = useSpring(0, { stiffness: 120, damping: 6, mass: 0.9 });
  const swingDeg = useTransform(swing, (v) => `${v}deg`);
  useEffect(() => {
    if (reduceMotion) return;
    const t = setTimeout(() => {
      swing.set(7);
      requestAnimationFrame(() => swing.set(0));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const noticeById = useMemo(() => {
    const m = new Map<string, PlatformNotice>();
    notices.forEach((n) => m.set(n.id, n));
    return m;
  }, [notices]);

  const others = useMemo(
    () => notices.filter((n) => n.id !== frontId),
    [notices, frontId],
  );

  const boardBg = isLight
    ? 'linear-gradient(135deg, #DCD0BC 0%, #CFC1A7 100%)'
    : 'linear-gradient(135deg, #3A332B 0%, #2E2922 100%)';
  const boardGrain = isLight
    ? 'radial-gradient(circle at 1px 1px, rgba(80,64,40,0.07) 1px, transparent 0)'
    : 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.18) 1px, transparent 0)';
  const plateBrass = isLight ? '#B89254' : '#8A6E3C';

  const frontNotice = frontId ? noticeById.get(frontId) : undefined;
  const frontMeta = frontNotice ? (PIN[frontNotice.kind] ?? PIN.announcement) : PIN.announcement;
  const isEmpty = !loading && notices.length === 0;

  if (loading) return null;

  return (
    // Scoped per board instance (by orgId) so two boards rendered at
    // once never share layoutId namespaces with each other — front
    // card and strip rows WITHIN one instance still freely share ids
    // with each other, which is what the morph needs.
    <LayoutGroup id={`pvx-board-${orgId ?? 'global'}`}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="select-none relative"
        role="region"
        aria-label="Platform notice board"
        aria-live="polite"
      >
        {/* ── Ambient mounted-on-a-wall shadow ── */}
        <div
          aria-hidden
          className="absolute left-3 right-3 rounded-[32px] pointer-events-none"
          style={{
            top: 18, bottom: -10,
            background: isLight ? 'rgba(40,28,12,0.10)' : 'rgba(0,0,0,0.35)',
            filter: 'blur(22px)',
            zIndex: 0,
          }}
        />

        {/* ── Hanging nameplate ── */}
        <div className="relative flex justify-center" style={{ height: 34, marginBottom: -17, zIndex: 3 }}>
          <svg width="100%" height="34" viewBox="0 0 120 34" preserveAspectRatio="xMidYMin meet" className="absolute top-0 max-w-[160px]" aria-hidden>
            <line x1="38" y1="0" x2="44" y2="22" stroke={isLight ? 'rgba(70,55,30,0.35)' : 'rgba(0,0,0,0.45)'} strokeWidth="1.5" />
            <line x1="82" y1="0" x2="76" y2="22" stroke={isLight ? 'rgba(70,55,30,0.35)' : 'rgba(0,0,0,0.45)'} strokeWidth="1.5" />
          </svg>

          <motion.div
            style={{ top: 18, rotate: swingDeg, transformOrigin: '50% -40px' }}
            className="relative px-4 py-1.5 rounded-[3px] flex items-center gap-2 max-w-[88%]"
          >
            <div
              className="absolute inset-0 rounded-[3px] -z-10"
              style={{
                background: `linear-gradient(165deg, ${plateBrass} 0%, ${isLight ? '#9C7A42' : '#6B5630'} 100%)`,
                boxShadow: '0 6px 14px -6px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.25)',
                border: `1px solid ${isLight ? 'rgba(60,45,20,0.3)' : 'rgba(0,0,0,0.4)'}`,
              }}
            />
            <PinIcon className="w-2.5 h-2.5 shrink-0" style={{ color: 'rgba(255,255,255,0.7)' }} />
            <span
              className="text-[10px] font-extrabold uppercase tracking-[0.18em] whitespace-nowrap shrink-0"
              style={{ color: '#2A2014', fontFamily: MONO, textShadow: '0 1px 0 rgba(255,255,255,0.2)' }}
            >
              Payvexo
            </span>
            <span className="w-px h-2.5 shrink-0" style={{ background: 'rgba(42,32,20,0.35)' }} />
            <AnimatePresence mode="wait">
              <motion.span
                key={isEmpty ? 'empty' : frontMeta.subtitle}
                initial={{ opacity: 0, y: -3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 3 }}
                transition={{ duration: 0.25 }}
                className="text-[9.5px] font-semibold whitespace-nowrap truncate"
                style={{ color: 'rgba(42,32,20,0.75)', fontFamily: MONO }}
              >
                {isEmpty ? 'Quiet for now' : frontMeta.subtitle}
              </motion.span>
            </AnimatePresence>
          </motion.div>
        </div>

        {/* ── Board surface ──────────────────────────────────────────────
            Plain block layout from here down. Nothing in this section
            is `position: absolute` for the purpose of PLACING a card,
            nothing centers a card via a computed transform — every
            card's position comes from normal document flow plus
            `margin: 0 auto`. Decorative absolutely-positioned children
            (screws, ambient light wash, sparkles, the pin) are confined
            inside an already-positioned parent and never carry layout
            responsibility for the cards themselves. */}
        <div
          className="relative rounded-[28px] overflow-hidden"
          style={{
            background: boardBg,
            backgroundImage: `${boardGrain}, ${boardBg}`,
            backgroundSize: '13px 13px, cover',
            padding: '34px 20px 26px',
            boxShadow: isLight
              ? 'inset 0 2px 6px rgba(60,45,20,0.18), inset 0 -1px 0 rgba(255,255,255,0.15)'
              : 'inset 0 2px 6px rgba(0,0,0,0.4), inset 0 -1px 0 rgba(255,255,255,0.03)',
            zIndex: 1,
          }}
        >
          <div
            aria-hidden
            className="absolute inset-0 rounded-[28px] pointer-events-none"
            style={{
              border: `3px solid ${isLight ? 'rgba(120,90,50,0.25)' : 'rgba(0,0,0,0.35)'}`,
              boxShadow: `inset 0 0 0 1px ${isLight ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.04)'}`,
            }}
          />

          {/* Ambient drifting light — purely decorative opacity pulse,
              never participates in positioning anything. */}
          {!reduceMotion && (
            <motion.div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                background: isLight
                  ? 'radial-gradient(circle at 30% 18%, rgba(255,250,230,0.4), transparent 60%)'
                  : 'radial-gradient(circle at 30% 18%, rgba(255,220,160,0.07), transparent 60%)',
              }}
              animate={{ opacity: [0.55, 1, 0.55] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}

          {[{ top: 10, left: 14 }, { top: 10, right: 14 }].map((pos, i) => (
            <div
              key={i}
              aria-hidden
              className="absolute w-2.5 h-2.5 rounded-full"
              style={{
                ...pos,
                background: `radial-gradient(circle at 35% 30%, ${isLight ? '#8A7556' : '#5C4F38'}, ${isLight ? '#5C4A2E' : '#2E2519'} 70%)`,
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.3), 0 1px 1px rgba(255,255,255,0.15)',
              }}
            />
          ))}

          {/* ── Stage: normal flow, real width, genuinely centered ──── */}
          <div className="relative mx-auto w-full" style={{ maxWidth: 420 }}>
            {isEmpty ? (
              <EmptyBoardStub isLight={isLight} reduceMotion={reduceMotion} />
            ) : frontNotice ? (
              <>
                <PinnedNoticeCard
                  key={frontNotice.id}
                  notice={frontNotice}
                  isLight={isLight}
                  layoutId={`pvx-notice-${frontNotice.id}`}
                  reduceMotion={reduceMotion}
                />

                {/* ── Other notices — always-visible strip. Tapping one
                    morphs it directly into the card above via the
                    shared layoutId — the small note visibly grows and
                    flies into place rather than just crossfading. ── */}
                {others.length > 0 && (
                  <div className="mt-4">
                    <p
                      className="text-[10px] font-bold uppercase tracking-[0.14em] mb-2 px-1"
                      style={{ fontFamily: MONO, color: isLight ? 'rgba(60,45,20,0.5)' : 'rgba(255,255,255,0.35)' }}
                    >
                      {others.length} more pinned
                    </p>
                    <div className="flex flex-col gap-2">
                      {others.map((n) => (
                        <NoticeStripRow
                          key={n.id}
                          notice={n}
                          isLight={isLight}
                          layoutId={`pvx-notice-${n.id}`}
                          rotate={hashRotation(n.id, 1.1)}
                          reduceMotion={reduceMotion}
                          onSelect={() => setFrontId(n.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      </motion.div>
    </LayoutGroup>
  );
}

// ════════════════════════════════════════════════════════════════════
// PinnedNoticeCard — the front notice, full-size and readable. Always
// rendered in normal document flow, centered by the stage's own
// `mx-auto`. The ONLY transform-driven placement on this element is
// the `layoutId` shared transition, which Framer computes from real
// measured rects every time — not a hand-written percentage.
// ════════════════════════════════════════════════════════════════════
function PinnedNoticeCard({
  notice, isLight, layoutId, reduceMotion,
}: {
  notice: PlatformNotice;
  isLight: boolean;
  layoutId: string;
  reduceMotion: boolean;
}) {
  const meta = PIN[notice.kind] ?? PIN.announcement;
  const pinColor = isLight ? meta.hex : meta.dark;
  const weather = useMemo(() => weatheringFor(notice.created_at), [notice.created_at]);
  const ink = '#332B22';
  const inkSec = '#5C5040';

  // Static, per-notice jaunty angle — derived once from the id, never
  // animated, never recalculated against a changing dimension. Gives
  // each notice a consistent "hand-pinned" tilt instead of every card
  // sharing the exact same angle.
  const baseRotate = useMemo(() => -1.2 + hashRotation(notice.id, 0.7), [notice.id]);

  const dateStamp = useMemo(
    () => new Date(notice.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase(),
    [notice.created_at],
  );

  const titleStyle: React.CSSProperties =
    meta.register === 'formal'
      ? { fontFamily: SERIF, fontWeight: 800, fontSize: '18.5px', letterSpacing: '-0.012em' }
      : meta.register === 'celebratory'
      ? { fontFamily: SERIF, fontWeight: 800, fontSize: '18.5px', fontStyle: 'italic' }
      : { fontFamily: SERIF, fontWeight: 600, fontSize: '14.5px' };

  const agedShadowAlpha = (0.32 * (1 - weather.shadowSoften * 0.4)).toFixed(2);
  const paperShadow = `0 ${Math.max(6, 14 - weather.shadowSoften * 6)}px ${Math.max(18, 28 - weather.shadowSoften * 6)}px -10px rgba(${isLight ? '60,45,20' : '0,0,0'},${agedShadowAlpha}), 0 2px 4px rgba(${isLight ? '60,45,20' : '0,0,0'},0.18)`;

  return (
    <motion.div
      layoutId={layoutId}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.32, ease: EASE, layout: reduceMotion ? { duration: 0 } : LAYOUT_SPRING }}
      className="relative rounded-[6px] overflow-hidden mx-auto"
      style={{
        width: '100%',
        maxWidth: 392,
        background: weather.paperTint,
        filter: `saturate(${1 - weather.desaturate})`,
        boxShadow: paperShadow,
        rotate: baseRotate,
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none rounded-[6px]"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(110,95,60,0.05) 28px)' }}
      />
      <div
        aria-hidden
        className="absolute top-0 left-0 right-0 h-1.5"
        style={{ background: `repeating-linear-gradient(100deg, ${weather.paperTint} 0 5px, rgba(110,95,60,0.10) 5px 6px)` }}
      />

      {/* Milestone sparkle burst — decorative only, never positions
          anything, plays once when this notice becomes the front card. */}
      {!reduceMotion && notice.kind === 'milestone' && (
        <MilestoneSparkles seed={notice.id} color={pinColor} />
      )}

      {/* Freshness badge — surfaces weatheringFor's existing "how new
          is this" signal as something the member can actually see,
          instead of only ever affecting tint/shadow under the hood. */}
      {weather.isFresh && (
        <span
          className="absolute -top-1.5 -right-1.5 z-20 text-[8px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
          style={{
            background: pinColor, color: weather.paperTint, fontFamily: MONO,
            boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
          }}
        >
          New
        </span>
      )}

      {/* Pin — fixed 24×24px size, never animated in size, so its
          `left:50%` + static `x:'-50%'` centering can never drift.
          Scale/y/opacity pop-in plus a brief expanding impact ring are
          layered on top, independent of that centering math. */}
      <motion.div
        className="absolute -top-3.5 z-10"
        style={{ left: '50%', x: '-50%' }}
        initial={reduceMotion ? false : { scale: 0, y: -10, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 13, delay: 0.1 }}
        aria-hidden
      >
        <div className="relative">
          {!reduceMotion && (
            <motion.span
              className="absolute rounded-full pointer-events-none"
              style={{ left: '50%', top: '50%', x: '-50%', y: '-50%', border: `1.5px solid ${pinColor}` }}
              initial={{ width: 4, height: 4, opacity: 0.85 }}
              animate={{ width: 32, height: 32, opacity: 0 }}
              transition={{ duration: 0.55, delay: 0.16, ease: 'easeOut' }}
            />
          )}
          <div
            className="w-6 h-6 rounded-full relative"
            style={{
              background: `radial-gradient(circle at 35% 30%, ${pinColor}, ${pinColor}cc 60%, #00000044)`,
              border: `1px solid ${isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.1)'}`,
            }}
          >
            <div
              className="absolute rounded-full"
              style={{ top: '22%', left: '28%', width: 5, height: 5, background: `rgba(255,255,255,${0.55 - weather.shadowSoften * 0.2})` }}
            />
          </div>
        </div>
      </motion.div>

      <div className="px-6 sm:px-7 pt-9 pb-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-1.5">
            <meta.Icon className="w-3 h-3" style={{ color: pinColor }} />
            <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: MONO, color: pinColor }}>
              {meta.label}
            </span>
          </div>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-sm"
            style={{ fontFamily: MONO, color: inkSec, background: 'rgba(110,95,60,0.10)', letterSpacing: '0.05em' }}
          >
            {dateStamp}
          </span>
        </div>

        <div className="flex items-start gap-2 mb-1.5">
          {notice.emoji && <span className="text-lg leading-tight shrink-0" aria-hidden>{notice.emoji}</span>}
          <div className="min-w-0 flex-1">
            {meta.register === 'celebratory' && (
              <svg width="56" height="12" viewBox="0 0 56 12" className="mb-1" aria-hidden>
                <path d="M2 10 Q14 -2 27 6" stroke={pinColor} strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.6" />
                <path d="M54 10 Q42 -2 29 6" stroke={pinColor} strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.6" />
                <circle cx="28" cy="6" r="1.6" fill={pinColor} opacity="0.8" />
              </svg>
            )}
            <h3 className="leading-snug tracking-tight" style={{ ...titleStyle, color: ink }}>
              {notice.title}
            </h3>
            {meta.register === 'formal' && (
              <div className="mt-1.5 flex flex-col gap-[2px]" aria-hidden>
                <span className="block w-10 h-px" style={{ background: pinColor }} />
                <span className="block w-6 h-px" style={{ background: pinColor, opacity: 0.5 }} />
              </div>
            )}
          </div>
        </div>

        <p className="leading-[1.65]" style={{ color: inkSec, fontSize: meta.register === 'casual' ? '13.5px' : '13px' }}>
          {notice.body}
        </p>

        {notice.cta_label && notice.cta_url && (
          <div className="mt-3.5">
            <a
              href={notice.cta_url}
              target={notice.cta_url.startsWith('http') ? '_blank' : undefined}
              rel={notice.cta_url.startsWith('http') ? 'noopener noreferrer' : undefined}
              className="inline-flex items-center gap-1.5 text-[12px] font-bold rounded-sm px-3 py-1.5 transition-transform hover:-translate-y-0.5"
              style={{ color: weather.paperTint, background: pinColor }}
            >
              {notice.cta_label}
              <ArrowUpRight className="w-3 h-3" />
            </a>
          </div>
        )}

        {notice.org_id && (
          <span
            className="absolute bottom-3 right-4 text-[8.5px] font-bold uppercase tracking-wider"
            style={{ fontFamily: MONO, color: 'rgba(110,95,60,0.45)' }}
          >
            · your org ·
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════════════════
// MilestoneSparkles — decorative-only overlay confined inside the
// already-positioned card. Particle offsets are STATIC, derived once
// from the notice id via a tiny seeded RNG, so they never reshuffle
// on re-render and never depend on any element's width.
// ════════════════════════════════════════════════════════════════════
function MilestoneSparkles({ seed, color }: { seed: string; color: string }) {
  const particles = useMemo(() => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    const rand = () => { h = (h * 1103515245 + 12345) >>> 0; return (h % 1000) / 1000; };
    return Array.from({ length: 7 }).map((_, i) => ({
      id: i,
      x: 10 + rand() * 80,
      y: 12 + rand() * 65,
      delay: rand() * 0.3,
      size: 3 + rand() * 4,
    }));
  }, [seed]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible z-20" aria-hidden>
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-full"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size, background: color, boxShadow: `0 0 6px 1px ${color}99` }}
          initial={{ opacity: 0, scale: 0, y: 0 }}
          animate={{ opacity: [0, 1, 0], scale: [0, 1.2, 0.6], y: -14 }}
          transition={{ duration: 1.1, delay: p.delay, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// NoticeStripRow — compact, always-visible row for a non-front notice.
// Shares its layoutId with the PinnedNoticeCard for the same notice id,
// so selecting it morphs it directly into the big card above — Framer
// measures both elements' real rects and animates between them; this
// is not the same mechanism as the hand-rolled centering that broke
// before. `rotate` here is a static prop computed once by the parent.
// ════════════════════════════════════════════════════════════════════
function NoticeStripRow({
  notice, isLight, layoutId, rotate, reduceMotion, onSelect,
}: {
  notice: PlatformNotice;
  isLight: boolean;
  layoutId: string;
  rotate: number;
  reduceMotion: boolean;
  onSelect: () => void;
}) {
  const meta = PIN[notice.kind] ?? PIN.announcement;
  const c = isLight ? meta.hex : meta.dark;

  return (
    <motion.button
      layoutId={layoutId}
      type="button"
      onClick={onSelect}
      whileHover={reduceMotion ? undefined : { y: -2, rotate: 0 }}
      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
      transition={{ layout: reduceMotion ? { duration: 0 } : LAYOUT_SPRING }}
      style={{
        rotate,
        background: isLight ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.2)',
        border: `1px solid ${isLight ? 'rgba(60,45,20,0.14)' : 'rgba(255,255,255,0.08)'}`,
        boxShadow: isLight ? '0 2px 6px -2px rgba(60,45,20,0.18)' : '0 2px 6px -2px rgba(0,0,0,0.4)',
      }}
      className="relative w-full flex items-center gap-2.5 rounded-lg pl-3 pr-3 py-2.5 text-left overflow-hidden"
    >
      <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: c }} />
      <span
        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
        style={{ background: `${c}22`, color: c }}
      >
        <meta.Icon className="w-3 h-3" />
      </span>
      <span
        className="flex-1 min-w-0 truncate text-[12.5px] font-semibold"
        style={{ fontFamily: SERIF, color: isLight ? '#332B22' : '#EDE6D6' }}
      >
        {notice.title}
      </span>
      <ChevronRight
        className="w-3.5 h-3.5 shrink-0"
        style={{ color: isLight ? 'rgba(60,45,20,0.4)' : 'rgba(255,255,255,0.35)' }}
      />
    </motion.button>
  );
}

function EmptyBoardStub({ isLight, reduceMotion }: { isLight: boolean; reduceMotion: boolean }) {
  return (
    <div className="mx-auto" style={{ maxWidth: 300 }}>
      <div
        className="rounded-[6px] px-5 py-7 text-center"
        style={{
          border: `1.5px dashed ${isLight ? 'rgba(80,60,30,0.28)' : 'rgba(255,255,255,0.16)'}`,
          background: isLight ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
        }}
      >
        <motion.div
          className="w-3 h-3 rounded-full mx-auto mb-3"
          style={{ border: `1.5px solid ${isLight ? 'rgba(80,60,30,0.3)' : 'rgba(255,255,255,0.18)'}` }}
          animate={reduceMotion ? undefined : { scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
        <p
          className="text-[11px] font-semibold"
          style={{ fontFamily: MONO, color: isLight ? 'rgba(80,60,30,0.5)' : 'rgba(255,255,255,0.32)' }}
        >
          Nothing pinned yet
        </p>
      </div>
    </div>
  );
}