/**
 * SwipeNavigator — WhatsApp-style horizontal swipe between the bottom-nav
 * tabs, engineered to NEVER be confused with vertical scrolling.
 *
 * Solidity (won't fire by accident):
 *  1. Direction lock — within the first ~14px we decide scroll vs swipe:
 *     a swipe needs |dx| to beat |dy| by 2×. Vertical → we bail and let
 *     the page scroll natively. Once locked we never switch.
 *  2. Skips gestures that start on inputs/selects or inside a horizontally
 *     scrollable element (carousels, filter chips) — and anything tagged
 *     data-no-swipe — so those keep working.
 *  3. High commit threshold — page only changes past ~40% width OR a fast
 *     flick; otherwise it rubber-bands back.
 *  4. Non-passive touchmove so we preventDefault ONLY after the horizontal
 *     lock — vertical scrolling is never blocked.
 *
 * Professional touches:
 *  • The page follows the finger, with rubber-band resistance at the ends.
 *  • On commit the NEW page slides in from the swipe direction.
 *  • A light haptic tap on a successful page change.
 *  • A pager-dots indicator fades in while you swipe so the gesture feels
 *    intentional and you can see where you are.
 *
 * Touch-only (mouse never fires these), so desktop is unaffected.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface SwipeNavigatorProps {
  routes: string[];
  children: ReactNode;
}

const LOCK_THRESHOLD = 14;
const H_DOMINANCE = 2.0;
const COMMIT_FRACTION = 0.4;
const FLICK_VELOCITY = 0.5;

function shouldSkip(target: EventTarget | null): boolean {
  let el = target as HTMLElement | null;
  for (let i = 0; el && i < 14; i++, el = el.parentElement) {
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return true;
    if (el.dataset?.noSwipe !== undefined) return true;
    if (el.getAttribute?.('role') === 'slider') return true;
    const ox = window.getComputedStyle(el).overflowX;
    if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 4) return true;
  }
  return false;
}

export default function SwipeNavigator({ routes, children }: SwipeNavigatorProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const wrapRef = useRef<HTMLDivElement>(null);

  const idx = routes.indexOf(location.pathname);
  const enabled = idx >= 0 && routes.length > 1;

  const [dx, setDx] = useState(0);
  const [snap, setSnap] = useState(false);
  const [dragging, setDragging] = useState(false);

  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const lockRef = useRef<'none' | 'h' | 'v'>('none');
  const dxRef = useRef(0);
  const enterRef = useRef<number | null>(null); // pending slide-in offset

  useEffect(() => {
    const node = wrapRef.current;
    if (!node || !enabled) return;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || shouldSkip(e.target)) { startRef.current = null; return; }
      const tch = e.touches[0];
      startRef.current = { x: tch.clientX, y: tch.clientY, t: Date.now() };
      lockRef.current = 'none';
      dxRef.current = 0;
      setSnap(false);
    };

    const onMove = (e: TouchEvent) => {
      const s = startRef.current;
      if (!s) return;
      const tch = e.touches[0];
      const dX = tch.clientX - s.x;
      const dY = tch.clientY - s.y;

      if (lockRef.current === 'none') {
        if (Math.abs(dX) > LOCK_THRESHOLD && Math.abs(dX) > Math.abs(dY) * H_DOMINANCE) {
          lockRef.current = 'h';
          setDragging(true);
        } else if (Math.abs(dY) > LOCK_THRESHOLD) {
          lockRef.current = 'v';
        }
      }

      if (lockRef.current === 'h') {
        e.preventDefault();
        const atEnd = (idx === 0 && dX > 0) || (idx === routes.length - 1 && dX < 0);
        const d = atEnd ? dX * 0.3 : dX;
        dxRef.current = d;
        setDx(d);
      }
    };

    const onEnd = () => {
      const s = startRef.current;
      const locked = lockRef.current;
      startRef.current = null;
      lockRef.current = 'none';
      setDragging(false);
      if (!s || locked !== 'h') return;

      const w = node.clientWidth || window.innerWidth;
      const dt = Math.max(1, Date.now() - s.t);
      const v = dxRef.current / dt;
      const commit = Math.abs(dxRef.current) > w * COMMIT_FRACTION || Math.abs(v) > FLICK_VELOCITY;

      let target = idx;
      if (commit && dxRef.current < 0 && idx < routes.length - 1) target = idx + 1;
      else if (commit && dxRef.current > 0 && idx > 0) target = idx - 1;

      if (target !== idx) {
        // New page slides in from the side we swiped toward.
        enterRef.current = dxRef.current < 0 ? w : -w;
        try { navigator.vibrate?.(8); } catch { /* unsupported */ }
        navigate(routes[target]);
      } else {
        setSnap(true);
        setDx(0); // rubber-band back
      }
    };

    node.addEventListener('touchstart', onStart, { passive: true });
    node.addEventListener('touchmove', onMove, { passive: false });
    node.addEventListener('touchend', onEnd, { passive: true });
    node.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchmove', onMove);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('touchcancel', onEnd);
    };
  }, [enabled, idx, routes, navigate]);

  // After a swipe navigation, play the incoming slide-in (offset → 0).
  useEffect(() => {
    if (enterRef.current != null) {
      const offset = enterRef.current;
      enterRef.current = null;
      setSnap(false);
      setDx(offset);
      requestAnimationFrame(() => requestAnimationFrame(() => { setSnap(true); setDx(0); }));
    } else {
      setSnap(false);
      setDx(0);
    }
  }, [location.pathname]);

  if (!enabled) return <div style={{ width: '100%' }}>{children}</div>;

  // Pager dots — visible only while actively swiping, so it's a cue, not clutter.
  const dragRatio = Math.min(1, Math.abs(dx) / 120);

  return (
    <div ref={wrapRef} style={{ width: '100%', position: 'relative' }}>
      <div
        style={{
          transform: dx ? `translateX(${dx}px)` : undefined,
          transition: snap ? 'transform 0.28s cubic-bezier(0.22,1,0.36,1)' : 'none',
          willChange: dx ? 'transform' : undefined,
        }}
      >
        {children}
      </div>

      {/* Swipe pager dots */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          left: 0, right: 0,
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)',
          display: 'flex', justifyContent: 'center', gap: 6,
          pointerEvents: 'none',
          opacity: dragging ? 0.35 + dragRatio * 0.5 : 0,
          transition: 'opacity 0.18s ease',
          zIndex: 60,
        }}
      >
        {routes.map((_, n) => (
          <span
            key={n}
            style={{
              width: n === idx ? 18 : 6,
              height: 6,
              borderRadius: 999,
              background: n === idx ? 'var(--pvx-primary, #FF6803)' : 'rgba(140,140,140,0.55)',
              transition: 'width 0.18s ease',
            }}
          />
        ))}
      </div>
    </div>
  );
}
