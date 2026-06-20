/**
 * PlatformNoticeBoard — v3: a board worth looking up at
 *
 * What changed from v2
 * ---------------------
 * v2 nailed the artifact (cork board, pinned paper, thumbtacks) but
 * the board itself had no presence — just a tiny mono caption reading
 * "Notice board" in the corner, easy to miss, no different from a
 * div's aria-label made visible. Every real noticeboard — the one
 * outside a departmental office, a church vestibule, a hostel common
 * room — has a NAMEPLATE: something mounted or stamped at the top
 * that tells you whose board this is before you read what's pinned
 * to it. That's the missing piece, not a redesign of the card.
 *
 * Added in this pass:
 *   1. A hanging nameplate — a small suspended sign (two "string"
 *      lines + a plate) sitting astride the top edge of the board,
 *      like a board that's mounted with actual hardware. Reads
 *      "PAYVEXO" + a rotating subtitle describing what's pinned
 *      right now ("Org updates", "Platform news" etc, derived from
 *      the active notice's kind) — so the header itself responds to
 *      content instead of being static chrome.
 *   2. Per-kind typographic personality — Announcements now render
 *      their title in a heavier, slightly larger serif with a thin
 *      rule under it (the "this matters" register); Milestones get
 *      a small laurel-style flourish instead of just a trophy icon;
 *      Tips render in a slightly smaller, more casual hand. The kind
 *      was previously ONLY expressed through pin color + a label
 *      chip — now it's expressed through the typography of the card
 *      itself, which is what actually varies on a real board (a
 *      hand-written tip looks different from a typed announcement).
 *   3. Board "hardware" — two corner screws (radial-gradient circles)
 *      at the top corners of the frame, reinforcing the mounted-object
 *      read rather than "rounded div with a background image."
 *
 * Everything else (pin colors, paper texture, flip transition, drag-
 * to-advance, pagination pins) is unchanged from v2 — those were
 * already doing real work.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
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

// ── Pin colors + per-kind voice. "subtitle" feeds the nameplate so
// the header itself describes what's currently pinned. "register"
// drives the typographic personality of the card body. ─────────────
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
  announcement: { hex: '#E0483D', dark: '#A02F27', label: 'Announcement', subtitle: 'Org updates',     Icon: Megaphone,  register: 'formal' },
  tip:          { hex: '#3B7DD8', dark: '#28579A', label: 'Tip',          subtitle: 'Worth knowing',   Icon: Lightbulb,  register: 'casual' },
  update:       { hex: '#D89B2E', dark: '#9C6F1E', label: 'Update',       subtitle: 'Platform news',   Icon: RefreshCw,  register: 'formal' },
  maintenance:  { hex: '#6B6258', dark: '#48423B', label: 'Maintenance',  subtitle: 'Heads up',         Icon: Wrench,     register: 'formal' },
  milestone:    { hex: '#C9A227', dark: '#8F721A', label: 'Milestone',    subtitle: 'Worth celebrating',Icon: Trophy,     register: 'celebratory' },
};

// Fixed per-slot rotation + offset so cards feel hand-pinned, not
// computed. Deterministic by index, not random — re-renders don't jitter.
const TILT = [-1.6, 1.1, -0.7, 1.8, -1.3, 0.9];

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

  const advance = useCallback((dir: 1 | -1 = 1) => {
    setFlipDir(dir);
    setActiveIdx((i) => (i + dir + notices.length) % notices.length);
  }, [notices.length]);

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

  // Board surface — warm umber felt, distinct from the app's own
  // dt.card/dt.bgWash so it reads as a different material.
  const boardBg = isLight
    ? 'linear-gradient(135deg, #DCD0BC 0%, #CFC1A7 100%)'
    : 'linear-gradient(135deg, #3A332B 0%, #2E2922 100%)';
  const boardGrain = isLight
    ? 'radial-gradient(circle at 1px 1px, rgba(80,64,40,0.07) 1px, transparent 0)'
    : 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.18) 1px, transparent 0)';

  // Paper — fixed, theme-independent. Paper doesn't go dark mode.
  const paper = '#FBF7EC';
  const paperShadow = isLight
    ? '0 14px 28px -10px rgba(60,45,20,0.32), 0 2px 4px rgba(60,45,20,0.18)'
    : '0 16px 32px -10px rgba(0,0,0,0.55), 0 2px 4px rgba(0,0,0,0.3)';
  const ink = '#332B22';
  const inkSec = '#5C5040';

  const notice = notices[activeIdx];
  const meta = notice ? (PIN[notice.kind] ?? PIN.announcement) : PIN.announcement;
  const pinColor = isLight ? meta.hex : meta.dark;
  const plateBrass = isLight ? '#B89254' : '#8A6E3C';

  const dateStamp = useMemo(() => {
    if (!notice) return '';
    return new Date(notice.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase();
  }, [notice]);

  if (loading || notices.length === 0) return null;

  const tilt = TILT[activeIdx % TILT.length];

  // ── Title typography varies by register — this is the "different
  // hands wrote different notices" cue, expressed structurally rather
  // than just via the pin's color chip. ──────────────────────────────
  const titleStyle: React.CSSProperties =
    meta.register === 'formal'
      ? { fontFamily: SERIF, fontWeight: 800, fontSize: '17px', letterSpacing: '-0.01em' }
      : meta.register === 'celebratory'
      ? { fontFamily: SERIF, fontWeight: 800, fontSize: '17px', fontStyle: 'italic' }
      : { fontFamily: SERIF, fontWeight: 700, fontSize: '15.5px' };

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
      {/* ── Hanging nameplate ────────────────────────────────────────
          Two "strings" + a brass plate, sitting astride the board's
          top edge like real mounted signage. The plate's subtitle
          updates with the active notice's kind, so the header itself
          is alive, not static chrome above an unrelated card. ────── */}
      <div className="relative flex justify-center" style={{ height: 34, marginBottom: -17, zIndex: 2 }}>
        {/* Strings */}
        <svg width="120" height="34" viewBox="0 0 120 34" className="absolute top-0" aria-hidden>
          <line x1="38" y1="0" x2="44" y2="22" stroke={isLight ? 'rgba(70,55,30,0.35)' : 'rgba(0,0,0,0.45)'} strokeWidth="1.5" />
          <line x1="82" y1="0" x2="76" y2="22" stroke={isLight ? 'rgba(70,55,30,0.35)' : 'rgba(0,0,0,0.45)'} strokeWidth="1.5" />
        </svg>

        {/* Plate */}
        <motion.div
          initial={{ rotate: -2 }}
          animate={{ rotate: [-1.4, 1.2, -1.4] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          className="relative px-4 py-1.5 rounded-[3px] flex items-center gap-2"
          style={{
            top: 18,
            background: `linear-gradient(165deg, ${plateBrass} 0%, ${isLight ? '#9C7A42' : '#6B5630'} 100%)`,
            boxShadow: '0 6px 14px -6px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.25)',
            border: `1px solid ${isLight ? 'rgba(60,45,20,0.3)' : 'rgba(0,0,0,0.4)'}`,
          }}
        >
          <PinIcon className="w-2.5 h-2.5 shrink-0" style={{ color: 'rgba(255,255,255,0.7)' }} />
          <span
            className="text-[10px] font-extrabold uppercase tracking-[0.18em] whitespace-nowrap"
            style={{ color: '#2A2014', fontFamily: MONO, textShadow: '0 1px 0 rgba(255,255,255,0.2)' }}
          >
            Payvexo
          </span>
          <span className="w-px h-2.5" style={{ background: 'rgba(42,32,20,0.35)' }} />
          <AnimatePresence mode="wait">
            <motion.span
              key={meta.subtitle}
              initial={{ opacity: 0, y: -3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 3 }}
              transition={{ duration: 0.25 }}
              className="text-[9.5px] font-semibold whitespace-nowrap"
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
        {/* Board frame edge — thin "wood" border */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-[28px] pointer-events-none"
          style={{ border: `3px solid ${isLight ? 'rgba(120,90,50,0.25)' : 'rgba(0,0,0,0.35)'}` }}
        />

        {/* Corner hardware — two screws reinforcing "this is mounted",
            paired with the nameplate above for a coherent object. */}
        {[
          { top: 10, left: 14 },
          { top: 10, right: 14 },
        ].map((pos, i) => (
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

        {/* ── The pinned card, centered on the board ─────────────── */}
        <div
          className="relative mx-auto"
          style={{ maxWidth: 460, paddingTop: 8 }}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
        >
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
                background: paper,
                borderRadius: 6,
                boxShadow: paperShadow,
                cursor: notices.length > 1 ? 'grab' : 'default',
              }}
              className="relative px-6 sm:px-7 pt-9 pb-6"
            >
              {/* Paper fiber lines */}
              <div
                aria-hidden
                className="absolute inset-0 pointer-events-none rounded-[6px]"
                style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(110,95,60,0.05) 28px)' }}
              />

              {/* Torn/deckled top edge */}
              <div
                aria-hidden
                className="absolute top-0 left-0 right-0 h-1.5"
                style={{ background: `repeating-linear-gradient(100deg, ${paper} 0 5px, rgba(110,95,60,0.10) 5px 6px)` }}
              />

              {/* Pin */}
              <div
                className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10"
                style={{ filter: 'drop-shadow(0 3px 3px rgba(0,0,0,0.35))' }}
                aria-hidden
              >
                <div
                  className="w-6 h-6 rounded-full relative"
                  style={{
                    background: `radial-gradient(circle at 35% 30%, ${pinColor}, ${pinColor}cc 60%, #00000044)`,
                    border: `1px solid ${isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.1)'}`,
                  }}
                >
                  <div className="absolute rounded-full" style={{ top: '22%', left: '28%', width: 5, height: 5, background: 'rgba(255,255,255,0.55)' }} />
                </div>
              </div>

              {/* Kind label + date stamp */}
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

              {/* Title — typographic register now varies by kind.
                  Milestones get a small flourish either side instead
                  of relying purely on the trophy icon. */}
              <div className="flex items-start gap-2 mb-1.5">
                {notice.emoji && <span className="text-lg leading-tight shrink-0" aria-hidden>{notice.emoji}</span>}
                <div className="min-w-0">
                  {meta.register === 'celebratory' && (
                    <span className="block text-[10px] mb-0.5" style={{ color: pinColor, letterSpacing: '0.3em' }} aria-hidden>
                      ✦ ✦ ✦
                    </span>
                  )}
                  <h3 className="leading-snug tracking-tight" style={{ ...titleStyle, color: ink }}>
                    {notice.title}
                  </h3>
                  {meta.register === 'formal' && (
                    <span className="block mt-1.5 w-8 h-px" style={{ background: pinColor }} aria-hidden />
                  )}
                </div>
              </div>

              {/* Body */}
              <p
                className="leading-[1.65]"
                style={{
                  color: inkSec,
                  fontSize: meta.register === 'casual' ? '13.5px' : '13px',
                  fontStyle: meta.register === 'casual' ? 'normal' : 'normal',
                }}
              >
                {notice.body}
              </p>

              {/* CTA */}
              {notice.cta_label && notice.cta_url && (
                <div className="mt-3.5">
                  <a
                    href={notice.cta_url}
                    target={notice.cta_url.startsWith('http') ? '_blank' : undefined}
                    rel={notice.cta_url.startsWith('http') ? 'noopener noreferrer' : undefined}
                    className="inline-flex items-center gap-1.5 text-[12px] font-bold rounded-sm px-3 py-1.5 transition-transform hover:-translate-y-0.5"
                    style={{ color: paper, background: pinColor, transform: 'rotate(-1deg)' }}
                  >
                    {notice.cta_label}
                    <ArrowUpRight className="w-3 h-3" />
                  </a>
                </div>
              )}

              {/* Org-scoped stamp */}
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

        {/* Peeking stack */}
        {notices.length > 1 && (
          <div aria-hidden className="absolute inset-0 pointer-events-none">
            {notices.length > 2 && (
              <div
                className="absolute mx-auto rounded-[6px]"
                style={{
                  top: 34, left: '50%', maxWidth: 460, width: '88%', height: 64,
                  background: paper, opacity: 0.5,
                  transform: 'translateX(-50%) rotate(-3.4deg) translateY(2px)',
                  boxShadow: '0 8px 16px -6px rgba(0,0,0,0.25)',
                }}
              />
            )}
          </div>
        )}

        {/* Pin-dot pagination */}
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