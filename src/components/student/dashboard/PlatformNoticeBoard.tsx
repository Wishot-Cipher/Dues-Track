/**
 * PlatformNoticeBoard — v4: physical plausibility pass
 *
 * What changed from v3 (the five gaps from honest critique)
 * -----------------------------------------------------------
 * 1. REAL PEEKING FRAGMENTS, not one flat rectangle. Up to two other
 *    notices now render behind the active card as actual scaled-down
 *    fragments — their own pin color, their own tilt, their own
 *    slight vertical/horizontal offset — so the board reads as having
 *    several things pinned to it, not one card with a generic shadow
 *    trick behind it.
 *
 * 2. SPRING-PHYSICS NAMEPLATE SWING, not a looping keyframe tween.
 *    useSpring + a one-time impulse on mount (plus a small nudge on
 *    every card-flip, as if the board shook slightly) gives the sign
 *    real decaying, asymmetric motion instead of a perfect metronome
 *    loop. It settles — real hanging objects do, infinite easeInOut
 *    loops don't.
 *
 * 3. BOLDER typographic register difference. Formal notices now jump
 *    a full step in size/weight from casual ones (not a 1.5px nudge),
 *    get a small printed-rule treatment under the kicker, and
 *    celebratory notices get an actual rendered laurel-ish flourish
 *    (two thin curved strokes) instead of three unicode stars, which
 *    read as decoration rather than as "this was written differently."
 *
 * 4. WEATHERING. Each notice gets a deterministic "age" derived from
 *    how far back it sits in the notices array (older notices = lower
 *    index isn't right — instead we derive age from days-since-created,
 *    bucketed into fresh / settled / aged) which very subtly desaturates
 *    the paper and softens the pin's shadow. Newest notice on the board
 *    looks crisp; something that's been up a while looks like it's been
 *    up a while. This is what makes the board feel like it has history,
 *    which matters because "the ledger survives the handover" is the
 *    whole brand thesis elsewhere in this app.
 *
 * 5. Mobile-safe nameplate. Strings + plate now scale and re-anchor at
 *    narrow widths instead of using fixed pixel SVG coordinates that
 *    could clip on a 360px viewport.
 *
 * Colors, pin palette, paper texture, drag-to-advance, and pagination
 * dots are UNCHANGED from v3 — those were already right.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import {
  Megaphone,
  Lightbulb,
  RefreshCw,
  Wrench,
  Trophy,
  ArrowUpRight,
  PinIcon,
} from 'lucide-react';
import { getActiveNotices, type PlatformNotice } from '@/services/PlatformNoticeService';

const MONO = '"JetBrains Mono","Fira Code","Cascadia Code",ui-monospace,monospace';
const SERIF = 'Georgia, "Times New Roman", serif';
const EASE = [0.22, 1, 0.36, 1] as const;
const AUTO_INTERVAL = 6500;

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

// Deterministic per-slot tilt + lateral drift for the ACTIVE card.
const TILT = [-1.6, 1.1, -0.7, 1.8, -1.3, 0.9];

// Deterministic placement for FRAGMENT cards (the peeking ones behind
// the active card). Each fragment slot has its own tilt, x-offset, and
// y-offset so two fragments never look like mirror copies of each other.
const FRAGMENT_SLOTS = [
  { tilt: -7, x: -34, y: 10, scale: 0.94 },
  { tilt: 6.5, x: 30, y: 16, scale: 0.91 },
];

// ── Weathering bucket from notice age ───────────────────────────────
function weatheringFor(createdAt: string): { desaturate: number; paperTint: string; shadowSoften: number } {
  const days = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  if (days < 2) return { desaturate: 0, paperTint: '#FBF7EC', shadowSoften: 0 };
  if (days < 10) return { desaturate: 0.08, paperTint: '#F7F1E2', shadowSoften: 0.15 };
  return { desaturate: 0.18, paperTint: '#F0E8D4', shadowSoften: 0.3 };
}

interface Props {
  theme: 'light' | 'dark';
  orgId: string | null;
}

export default function PlatformNoticeBoard({ theme, orgId }: Props) {
  const reduceMotion = useReducedMotion();
  const isLight = theme === 'light';

  const [notices, setNotices] = useState<PlatformNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [flipDir, setFlipDir] = useState<1 | -1>(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragStartX = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await getActiveNotices(orgId, 6);
      if (!cancelled) { setNotices(data); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  // ── Spring-physics nameplate swing ─────────────────────────────────
  // A single rotation spring that gets IMPULSED (not looped) on mount
  // and on every card flip — like the board getting a small jolt each
  // time something changes on it. The spring's own damping does the
  // settling; we never hand-author the decay curve.
  const swing = useSpring(0, { stiffness: 120, damping: 6, mass: 0.9 });
  const swingDeg = useTransform(swing, (v) => `${v}deg`);
  const impulseSwing = useCallback((strength = 5) => {
    if (reduceMotion) return;
    swing.set(strength);
    // settle back toward 0 — the spring's damping does the oscillation,
    // we just give it a target to fall toward.
    requestAnimationFrame(() => swing.set(0));
  }, [swing, reduceMotion]);

  useEffect(() => {
    // Initial mount jolt, slightly delayed so it reads as "it just got
    // hung up" rather than firing before the element has any visual
    // presence on screen.
    const t = setTimeout(() => impulseSwing(7), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const advance = useCallback((dir: 1 | -1 = 1) => {
    setFlipDir(dir);
    setActiveIdx((i) => (i + dir + notices.length) % notices.length);
    impulseSwing(dir > 0 ? 4 : -4);
  }, [notices.length, impulseSwing]);

  useEffect(() => {
    if (notices.length <= 1 || paused || reduceMotion) return;
    intervalRef.current = setInterval(() => advance(1), AUTO_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [notices.length, paused, advance, reduceMotion]);

  const handlePointerDown = (e: React.PointerEvent) => { dragStartX.current = e.clientX; };
  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragStartX.current === null) return;
    const delta = e.clientX - dragStartX.current;
    dragStartX.current = null;
    if (Math.abs(delta) > 40) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      advance(delta < 0 ? 1 : -1);
    }
  };

  // Board surface — unchanged palette from v3.
  const boardBg = isLight
    ? 'linear-gradient(135deg, #DCD0BC 0%, #CFC1A7 100%)'
    : 'linear-gradient(135deg, #3A332B 0%, #2E2922 100%)';
  const boardGrain = isLight
    ? 'radial-gradient(circle at 1px 1px, rgba(80,64,40,0.07) 1px, transparent 0)'
    : 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.18) 1px, transparent 0)';

  const paperShadowBase = isLight
    ? { offsetY: 14, blur: 28, spread: -10, alpha: 0.32, soft: '0 2px 4px rgba(60,45,20,0.18)' }
    : { offsetY: 16, blur: 32, spread: -10, alpha: 0.55, soft: '0 2px 4px rgba(0,0,0,0.3)' };
  const ink = '#332B22';
  const inkSec = '#5C5040';

  const notice = notices[activeIdx];
  const meta = notice ? (PIN[notice.kind] ?? PIN.announcement) : PIN.announcement;
  const pinColor = isLight ? meta.hex : meta.dark;
  const plateBrass = isLight ? '#B89254' : '#8A6E3C';

  const weather = useMemo(
    () => (notice ? weatheringFor(notice.created_at) : weatheringFor(new Date().toISOString())),
    [notice],
  );
  // Older notices sit slightly flatter against the board — offset and
  // blur both ease back a touch as shadowSoften rises, instead of
  // looking freshly pinned regardless of age.
  const agedOffsetY = Math.max(6, paperShadowBase.offsetY - weather.shadowSoften * 6);
  const agedBlur = Math.max(18, paperShadowBase.blur - weather.shadowSoften * 6);
  const agedAlpha = (paperShadowBase.alpha * (1 - weather.shadowSoften * 0.4)).toFixed(2);
  const paperShadow = `0 ${agedOffsetY}px ${agedBlur}px ${paperShadowBase.spread}px rgba(${isLight ? '60,45,20' : '0,0,0'},${agedAlpha}), ${paperShadowBase.soft}`;

  const dateStamp = useMemo(() => {
    if (!notice) return '';
    return new Date(notice.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase();
  }, [notice]);

  // ── Fragment notices — the OTHER notices peeking from behind,
  // each carrying its own pin color, tilt, and weathering, so the
  // board reads as multiple distinct pinned items, not a decorated
  // single card. We pick up to 2, walking forward from activeIdx so
  // the fragments visually "preview" what's coming up next on advance. ──
  const fragments = useMemo(() => {
    if (notices.length <= 1) return [];
    const out: { notice: PlatformNotice; slot: typeof FRAGMENT_SLOTS[number] }[] = [];
    for (let k = 1; k <= Math.min(2, notices.length - 1); k++) {
      const idx = (activeIdx + k) % notices.length;
      out.push({ notice: notices[idx], slot: FRAGMENT_SLOTS[k - 1] });
    }
    return out.reverse(); // farthest fragment painted first
  }, [notices, activeIdx]);

  if (loading || notices.length === 0) return null;

  const tilt = TILT[activeIdx % TILT.length];

  const titleStyle: React.CSSProperties =
    meta.register === 'formal'
      ? { fontFamily: SERIF, fontWeight: 800, fontSize: '18.5px', letterSpacing: '-0.012em' }
      : meta.register === 'celebratory'
      ? { fontFamily: SERIF, fontWeight: 800, fontSize: '18.5px', fontStyle: 'italic' }
      : { fontFamily: SERIF, fontWeight: 600, fontSize: '14.5px', letterSpacing: '0.002em' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="select-none"
      role="region"
      aria-label="Platform notice board"
      aria-live="polite"
    >
      {/* ── Hanging nameplate — spring-driven swing ───────────────────
          Mobile-safe: strings + plate scale with a percentage-based
          viewBox/flex layout instead of fixed pixel SVG coordinates,
          so nothing clips at 360px. ──────────────────────────────── */}
      <div className="relative flex justify-center" style={{ height: 34, marginBottom: -17, zIndex: 2 }}>
        <svg
          width="100%"
          height="34"
          viewBox="0 0 120 34"
          preserveAspectRatio="xMidYMin meet"
          className="absolute top-0 max-w-[160px]"
          aria-hidden
        >
          <line x1="38" y1="0" x2="44" y2="22" stroke={isLight ? 'rgba(70,55,30,0.35)' : 'rgba(0,0,0,0.45)'} strokeWidth="1.5" />
          <line x1="82" y1="0" x2="76" y2="22" stroke={isLight ? 'rgba(70,55,30,0.35)' : 'rgba(0,0,0,0.45)'} strokeWidth="1.5" />
        </svg>

        <motion.div
          style={{
            top: 18,
            rotate: swingDeg,
            transformOrigin: '50% -40px',
          }}
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
              key={meta.subtitle}
              initial={{ opacity: 0, y: -3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 3 }}
              transition={{ duration: 0.25 }}
              className="text-[9.5px] font-semibold whitespace-nowrap truncate"
              style={{ color: 'rgba(42,32,20,0.75)', fontFamily: MONO }}
            >
              {meta.subtitle}
            </motion.span>
          </AnimatePresence>
        </motion.div>
      </div>

      {/* ── Board surface ────────────────────────────────────────── */}
      <div
        className="relative rounded-[28px] overflow-hidden"
        style={{
          background: boardBg,
          backgroundImage: `${boardGrain}, ${boardBg}`,
          backgroundSize: '13px 13px, cover',
          padding: '28px 20px 24px',
          paddingTop: 34,
          boxShadow: isLight
            ? 'inset 0 2px 6px rgba(60,45,20,0.18), inset 0 -1px 0 rgba(255,255,255,0.15)'
            : 'inset 0 2px 6px rgba(0,0,0,0.4), inset 0 -1px 0 rgba(255,255,255,0.03)',
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0 rounded-[28px] pointer-events-none"
          style={{ border: `3px solid ${isLight ? 'rgba(120,90,50,0.25)' : 'rgba(0,0,0,0.35)'}` }}
        />

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

        {/* ── Stage: fragments behind, active card in front ──────── */}
        <div
          className="relative mx-auto"
          style={{ maxWidth: 460, paddingTop: 8, minHeight: 210 }}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
        >
          {/* Real peeking fragments — each a genuine mini-card with
              its own pin, own tilt, own weathering. Not one flat
              rectangle: up to two distinct objects pinned behind. */}
          {fragments.map(({ notice: fn, slot }) => {
            const fm = PIN[fn.kind] ?? PIN.announcement;
            const fc = isLight ? fm.hex : fm.dark;
            const fw = weatheringFor(fn.created_at);
            return (
              <div
                key={fn.id}
                aria-hidden
                className="absolute left-1/2 top-10 rounded-[6px] overflow-hidden pointer-events-none"
                style={{
                  width: '78%',
                  height: 86,
                  background: fw.paperTint,
                  filter: `saturate(${1 - fw.desaturate})`,
                  transform: `translateX(calc(-50% + ${slot.x}px)) translateY(${slot.y}px) rotate(${slot.tilt}deg) scale(${slot.scale})`,
                  boxShadow: `0 ${10 + fw.shadowSoften * 6}px ${20 + fw.shadowSoften * 10}px -10px rgba(${isLight ? '60,45,20' : '0,0,0'},${0.22 - fw.shadowSoften * 0.06})`,
                  opacity: 0.92 - fw.shadowSoften * 0.15,
                }}
              >
                {/* Tiny pin on the fragment so it reads as its own
                    pinned item, not a generic ghost card. */}
                <div
                  className="absolute -top-2 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full"
                  style={{
                    background: `radial-gradient(circle at 35% 30%, ${fc}, ${fc}cc 60%, #00000044)`,
                  }}
                />
                <div className="px-4 pt-4 flex items-center gap-1.5">
                  <fm.Icon className="w-2.5 h-2.5 shrink-0" style={{ color: fc, opacity: 0.7 }} />
                  <span
                    className="text-[9px] font-bold uppercase tracking-wider truncate"
                    style={{ fontFamily: MONO, color: fc, opacity: 0.7 }}
                  >
                    {fn.title}
                  </span>
                </div>
              </div>
            );
          })}

          {/* ── Active card ──────────────────────────────────────── */}
          <AnimatePresence mode="wait" initial={false} custom={flipDir}>
            <motion.div
              key={notice.id}
              custom={flipDir}
              initial={{ opacity: 0, rotateY: flipDir > 0 ? 38 : -38, y: 10, rotate: tilt * 1.4 }}
              animate={{ opacity: 1, rotateY: 0, y: 0, rotate: tilt }}
              exit={{
                opacity: 0, rotateY: flipDir > 0 ? -38 : 38, y: -6, rotate: tilt * 1.4,
                transition: { duration: 0.22, ease: EASE },
              }}
              transition={{ duration: 0.36, ease: EASE }}
              style={{
                transformStyle: 'preserve-3d',
                transformPerspective: 900,
                background: weather.paperTint,
                filter: `saturate(${1 - weather.desaturate})`,
                borderRadius: 6,
                boxShadow: paperShadow,
                cursor: notices.length > 1 ? 'grab' : 'default',
                position: 'relative',
                zIndex: 1,
              }}
              className="relative px-6 sm:px-7 pt-9 pb-6"
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

              {/* Pin — shadow softened slightly for older notices, as
                  if the pin's grip and shine have dulled a bit. */}
              <div
                className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10"
                style={{ filter: `drop-shadow(0 ${3 - weather.shadowSoften}px 3px rgba(0,0,0,${0.35 - weather.shadowSoften * 0.1}))` }}
                aria-hidden
              >
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

              {/* Title — register difference is now a full size/weight
                  step (14.5px casual vs 18.5px formal/celebratory),
                  plus a printed double-rule under formal kickers and a
                  rendered laurel flourish (two curved strokes) for
                  celebratory notices instead of unicode stars. */}
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

              <p
                className="leading-[1.65]"
                style={{ color: inkSec, fontSize: meta.register === 'casual' ? '13.5px' : '13px' }}
              >
                {notice.body}
              </p>

              {notice.cta_label && notice.cta_url && (
                <div className="mt-3.5">
                  <a
                    href={notice.cta_url}
                    target={notice.cta_url.startsWith('http') ? '_blank' : undefined}
                    rel={notice.cta_url.startsWith('http') ? 'noopener noreferrer' : undefined}
                    className="inline-flex items-center gap-1.5 text-[12px] font-bold rounded-sm px-3 py-1.5 transition-transform hover:-translate-y-0.5"
                    style={{ color: weather.paperTint, background: pinColor, transform: 'rotate(-1deg)' }}
                  >
                    {notice.cta_label}
                    <ArrowUpRight className="w-3 h-3" />
                  </a>
                </div>
              )}

              {notice.org_id && (
                <span
                  className="absolute bottom-3 right-4 text-[8.5px] font-bold uppercase tracking-wider"
                  style={{ fontFamily: MONO, color: 'rgba(110,95,60,0.45)', transform: 'rotate(-3deg)' }}
                >
                  · your org ·
                </span>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {notices.length > 1 && (
          <div className="flex items-center justify-center gap-2.5 mt-5">
            {notices.map((n, i) => {
              const m = PIN[n.kind] ?? PIN.announcement;
              const c = isLight ? m.hex : m.dark;
              const active = i === activeIdx;
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    if (intervalRef.current) clearInterval(intervalRef.current);
                    setFlipDir(i > activeIdx ? 1 : -1);
                    setActiveIdx(i);
                    impulseSwing(i > activeIdx ? 4 : -4);
                  }}
                  aria-label={`Notice ${i + 1} of ${notices.length}: ${m.label}`}
                  aria-current={active}
                  className="relative rounded-full transition-all duration-300 focus-visible:outline-2"
                  style={{
                    width: active ? 11 : 8,
                    height: active ? 11 : 8,
                    background: c,
                    opacity: active ? 1 : 0.45,
                    boxShadow: active ? `0 0 0 3px ${c}28` : 'none',
                    outlineColor: c,
                  }}
                />
              );
            })}
          </div>
        )}

        {notices.length > 1 && (
          <p className="sm:hidden text-center text-[9.5px] mt-2" style={{ color: isLight ? 'rgba(80,60,30,0.4)' : 'rgba(255,255,255,0.25)', fontFamily: MONO }}>
            swipe the card
          </p>
        )}
      </div>
    </motion.div>
  );
}