/**
 * LandingPage - Payvexo public landing page
 * Author: Wishot
 *
 * Theme changelog:
 *  - Full light / dark / system theme awareness via useTheme()
 *    and getDashboardTokens(). Every hardcoded dark `tk.*` token is
 *    replaced with the resolved `t.*` from the token map.
 *  - ThemeToggle added to the navbar (right side).
 *  - Ambient glows, search box, stats strip, feature cards, and
 *    footer all adapt cleanly to both modes.
 *  - FloatingNodes, TiltCard, SearchResultItem, CyclingWord all
 *    receive/read the resolved token set.
 *  - No logic, copy, or routing changed.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  useSpring,
} from 'framer-motion';
import {
  Search, Building2, Church, GraduationCap, Users, ArrowRight,
  Shield, Zap, Globe, ChevronRight, Plus, CheckCircle,
  TrendingUp, DollarSign, Sparkles,
} from 'lucide-react';
import { APP_NAME, APP_TAGLINE } from '@/config/constants';
import { organizationService } from '@/services/organizationService';
import type { SearchResult } from '@/types/multiTenant';
import TrustBadge from '@/components/trust/TrustBadge';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { useTheme, getDashboardTokens, type DashboardTokens } from '@/hooks/useTheme';

/* ── Org type icons ───────────────────────────────────────────────────────── */
const ORG_TYPE_ICONS: Record<string, React.ReactNode> = {
  university:  <GraduationCap className="w-5 h-5" />,
  school:      <GraduationCap className="w-5 h-5" />,
  church:      <Church className="w-5 h-5" />,
  club:        <Users className="w-5 h-5" />,
  association: <Users className="w-5 h-5" />,
  cooperative: <Building2 className="w-5 h-5" />,
  ngo:         <Globe className="w-5 h-5" />,
  other:       <Building2 className="w-5 h-5" />,
};

/* ── Cycling headline words ───────────────────────────────────────────────── */
const CYCLE_WORDS = [
  'Universities', 'Churches', 'Clubs',
  'Cooperatives', 'Associations', 'NGOs',
];

function CyclingWord({ primary }: { primary: string }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIndex(i => (i + 1) % CYCLE_WORDS.length), 2600);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="relative inline-block overflow-hidden" style={{ minWidth: '320px' }}>
      <AnimatePresence mode="wait">
        <motion.span
          key={CYCLE_WORDS[index]}
          className="block"
          style={{ color: primary }}
          initial={{ y: 32, opacity: 0, filter: 'blur(6px)' }}
          animate={{ y: 0,  opacity: 1, filter: 'blur(0px)' }}
          exit={{   y: -32, opacity: 0, filter: 'blur(6px)' }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        >
          {CYCLE_WORDS[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ── Floating activity nodes ──────────────────────────────────────────────── */
interface FloatNode {
  id: number; x: number; size: number; delay: number; duration: number; icon: string;
}

function FloatingNodes({ isLight }: { isLight: boolean }) {
  const nodes: FloatNode[] = Array.from({ length: 14 }, (_, i) => ({
    id: i,
    x: 5 + Math.random() * 90,
    size: 28 + Math.random() * 22,
    delay: Math.random() * 8,
    duration: 12 + Math.random() * 10,
    icon: ['₦', '✓', '💳', '📊', '₦', '✓', '🏦'][i % 7],
  }));

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      {nodes.map(n => (
        <motion.div
          key={n.id}
          className="absolute flex items-center justify-center rounded-xl text-sm font-bold select-none"
          style={{
            left:            `${n.x}%`,
            bottom:          '-60px',
            width:           n.size,
            height:          n.size,
            background:      isLight ? 'rgba(255,104,3,0.06)' : 'rgba(255,104,3,0.07)',
            border:          `1px solid ${isLight ? 'rgba(255,104,3,0.10)' : 'rgba(255,104,3,0.12)'}`,
            color:           isLight ? 'rgba(255,104,3,0.40)' : 'rgba(255,104,3,0.50)',
            backdropFilter:  'blur(2px)',
          }}
          initial={{ y: 0, opacity: 0 }}
          animate={{
            y:       [0, -(Math.random() * 300 + 500)],
            opacity: [0, 0.7, 0.7, 0],
            rotate:  [0, Math.random() * 20 - 10],
          }}
          transition={{ duration: n.duration, delay: n.delay, repeat: Infinity, ease: 'linear' }}
        >
          {n.icon}
        </motion.div>
      ))}
    </div>
  );
}

/* ── Animated stat counter ────────────────────────────────────────────────── */
function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref           = useRef<HTMLSpanElement>(null);
  const started       = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const start    = Date.now();
        const duration = 1600;
        const tick = () => {
          const elapsed  = Date.now() - start;
          const progress = Math.min(elapsed / duration, 1);
          const eased    = 1 - Math.pow(1 - progress, 3);
          setVal(Math.round(eased * to));
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.5 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [to]);

  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>;
}

/* ── 3-D Tilt Feature Card ────────────────────────────────────────────────── */
function TiltCard({
  icon, title, desc, color, delay, t, isLight,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  color: string;
  delay: number;
  t: DashboardTokens;
  isLight: boolean;
}) {
  const ref        = useRef<HTMLDivElement>(null);
  const x          = useMotionValue(0);
  const y          = useMotionValue(0);
  const rotateX    = useTransform(y, [-0.5, 0.5], ['8deg', '-8deg']);
  const rotateY    = useTransform(x, [-0.5, 0.5], ['-8deg', '8deg']);
  const sc         = { stiffness: 300, damping: 30 };
  const sRotateX   = useSpring(rotateX, sc);
  const sRotateY   = useSpring(rotateY, sc);

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top)  / rect.height - 0.5);
  }, [x, y]);

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={() => { x.set(0); y.set(0); }}
      style={{
        perspective:    800,
        rotateX:        sRotateX,
        rotateY:        sRotateY,
        transformStyle: 'preserve-3d',
      }}
      className="relative p-6 rounded-2xl cursor-default"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Card surface */}
      <div
        className="absolute inset-0 rounded-2xl"
        style={{
          background: t.card,
          border:     `1px solid ${t.cardBorder}`,
          boxShadow:  isLight ? '0 4px 24px -8px rgba(15,7,3,0.10)' : 'none',
        }}
      />
      {/* Top colour accent */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl"
        style={{ background: color }}
      />
      {/* Hover glow */}
      <motion.div
        className="absolute inset-0 rounded-2xl opacity-0 transition-opacity"
        style={{ background: `radial-gradient(circle at 50% 0%, ${color}18, transparent 60%)` }}
        whileHover={{ opacity: 1 }}
      />

      <div
        className="relative text-center space-y-3"
        style={{ transform: 'translateZ(20px)' }}
      >
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto"
          style={{ background: `${color}18`, color }}
        >
          {icon}
        </div>
        <h3 className="font-bold text-base" style={{ color: t.text }}>{title}</h3>
        <p className="text-sm leading-6" style={{ color: t.textSec }}>{desc}</p>
      </div>
    </motion.div>
  );
}

/* ── Search result item ───────────────────────────────────────────────────── */
function SearchResultItem({
  result, index, onClick, t,
}: {
  result:  SearchResult;
  index:   number;
  onClick: () => void;
  t:       DashboardTokens;
}) {
  const [hovered, setHovered] = useState(false);
  const isSeed = result.kind === 'seed';

  const subtitleLeft  = result.short_name ? `${result.type} · ${result.short_name}` : result.type;
  const subtitleRight = isSeed
    ? [result.ownership, result.state].filter(Boolean).join(' · ')
    : typeof result.member_count === 'number' && result.member_count > 0
      ? `${result.member_count.toLocaleString()} members`
      : null;

  return (
    <motion.button
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={()   => setHovered(false)}
      className="w-full flex items-center gap-4 px-5 py-3.5 transition-colors text-left"
      style={{
        background: hovered
          ? (isSeed ? 'rgba(156,163,175,0.06)' : `${t.primary}09`)
          : 'transparent',
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all"
        style={{
          background: isSeed
            ? (hovered ? 'rgba(156,163,175,0.18)' : 'rgba(156,163,175,0.10)')
            : (hovered ? `${t.primary}25`          : `${t.primary}15`),
          color: isSeed ? '#9CA3AF' : t.primary,
        }}
      >
        {ORG_TYPE_ICONS[result.type] || <Building2 className="w-5 h-5" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="font-semibold text-sm truncate flex-1" style={{ color: t.text }}>
            {result.name}
          </p>
          <TrustBadge level={result.trust_level} size="sm" />
        </div>
        <p className="text-xs capitalize" style={{ color: t.textTer }}>
          {subtitleLeft}{subtitleRight ? ` · ${subtitleRight}` : ''}
        </p>
      </div>

      <motion.div animate={{ x: hovered ? 3 : 0 }} transition={{ duration: 0.18 }}>
        <ChevronRight className="w-4 h-4" style={{ color: hovered ? t.primary : t.textTer }} />
      </motion.div>
    </motion.button>
  );
}

/* ═══════════════════════════════════════════════════════════
   Main component
═══════════════════════════════════════════════════════════ */
export default function LandingPage() {
  /* ── Theme ── */
  const { theme }   = useTheme();
  const isLight     = theme === 'light';
  const t           = getDashboardTokens(theme);

  /* ── State ── */
  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching,     setSearching]     = useState(false);
  const [hasSearched,   setHasSearched]   = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [slugInput,     setSlugInput]     = useState('');
  const [slugValid,     setSlugValid]     = useState<boolean | null>(null);
  const navigate = useNavigate();

  /* ── Search ── */
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) { setSearchResults([]); setHasSearched(false); return; }
    setSearching(true);
    setHasSearched(true);
    try {
      const results = await organizationService.searchUnified(query, { countryCode: 'NG' });
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleResultClick = (r: SearchResult) => {
    if (r.kind === 'organization' && r.slug) navigate(`/${r.slug}/overview`);
    else if (r.kind === 'seed') navigate(`/bring-school?seed=${r.id}`);
  };

  const handleSlugChange = (val: string) => {
    const clean = val.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSlugInput(clean);
    if (!clean.length) { setSlugValid(null); return; }
    setSlugValid(clean.length >= 2);
  };

  const handleSlugSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (slugInput && slugValid) navigate(`/${slugInput}/overview`);
  };

  /* ── Derived search-box styles (theme-aware) ── */
  const searchSurface = isLight
    ? {
        background:  'rgba(255, 255, 255, 0.90)',
        border:      `1px solid ${searchFocused ? t.primary + '70' : 'rgba(15,7,3,0.12)'}`,
        boxShadow:   searchFocused
          ? `0 8px 40px rgba(255,104,3,0.16)`
          : '0 4px 20px rgba(15,7,3,0.08)',
      }
    : {
        background:  'rgba(26,14,9,0.85)',
        border:      `1px solid ${searchFocused ? t.primary + '60' : t.cardBorder}`,
        boxShadow:   searchFocused
          ? `0 8px 40px rgba(255,104,3,0.20)`
          : '0 4px 20px rgba(0,0,0,0.30)',
      };

  const dropdownSurface = isLight
    ? {
        background:   'rgba(255,255,255,0.98)',
        border:       `1px solid rgba(15,7,3,0.09)`,
        boxShadow:    '0 16px 48px rgba(15,7,3,0.14)',
        backdropFilter: 'blur(16px)',
      }
    : {
        background:   'rgba(18,8,4,0.97)',
        border:       `1px solid ${t.cardBorder}`,
        boxShadow:    '0 16px 48px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(16px)',
      };

  /* ═══════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════ */
  return (
    <div
      className="min-h-screen relative overflow-x-hidden"
      style={{ minHeight: '100dvh', background: t.bg }}
    >

      {/*
        Placeholder colour is a CSS pseudo-element — it cannot be set via
        React's inline `style` prop (TS error 2353). We inject a scoped
        <style> block driven by `t.textTer` which updates on every theme
        change. `.pvx-search-input` and `.pvx-slug-input` target only our
        two inputs — zero global leakage.
      */}
      <style>{`
        .pvx-search-input::placeholder,
        .pvx-slug-input::placeholder { color: ${t.textTer}; opacity: 1; }
      `}</style>

      {/* ── Ambient background glows ── */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {/* Upper-right brand glow */}
        <div
          className="absolute rounded-full blur-[160px]"
          style={{
            width:      640,
            height:     640,
            background: `radial-gradient(circle, ${t.primary} 0%, transparent 70%)`,
            top:        '-18%',
            right:      '-12%',
            opacity:    isLight ? 0.10 : 0.18,
          }}
        />
        {/* Lower-left accent glow */}
        <div
          className="absolute rounded-full blur-[130px]"
          style={{
            width:      420,
            height:     420,
            background: `radial-gradient(circle, ${t.mint} 0%, transparent 70%)`,
            bottom:     '8%',
            left:       '-10%',
            opacity:    isLight ? 0.14 : 0.10,
          }}
        />
        {/* Light mode: warm cream wash overlay */}
        {isLight && (
          <div
            className="absolute inset-0"
            style={{ background: t.bgWash, opacity: 0.55 }}
          />
        )}
        {/* Diagonal grid lines */}
        <div
          className="absolute inset-0"
          style={{
            opacity: isLight ? 0.018 : 0.025,
            backgroundImage: `
              repeating-linear-gradient(
                -45deg,
                transparent,
                transparent 40px,
                ${isLight ? 'rgba(255,104,3,0.8)' : 'rgba(255,104,3,0.6)'} 40px,
                ${isLight ? 'rgba(255,104,3,0.8)' : 'rgba(255,104,3,0.6)'} 41px
              )
            `,
          }}
        />
      </div>

      {/* ── Floating nodes ── */}
      <FloatingNodes isLight={isLight} />

      {/* ═══════ NAVBAR ═══════ */}
      <motion.nav
        className="relative z-20 flex items-center justify-between px-5 sm:px-8 py-4 max-w-7xl mx-auto"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Logo + name */}
        <div className="flex items-center gap-2.5">
          <motion.div
            className="w-10 h-10 rounded-xl flex items-center justify-center font-extrabold text-white text-lg"
            style={{
              background: 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)',
              boxShadow:  '0 4px 16px rgba(255,104,3,0.40)',
            }}
            whileHover={{ rotate: [0, -5, 5, 0], scale: 1.1 }}
            transition={{ duration: 0.4 }}
          >
            P
          </motion.div>
          <span
            className="text-xl font-extrabold tracking-tight"
            style={{ color: t.text }}
          >
            {APP_NAME}
          </span>
        </div>

        {/* Right: live pill + theme toggle */}
        <div className="flex items-center gap-2.5">
          {/* Live indicator */}
          <div
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{
              background: `${t.mint}14`,
              color:      t.mint,
              border:     `1px solid ${t.mint}28`,
            }}
          >
            <motion.span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: t.mint }}
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            />
            Platform Live
          </div>

          {/* Theme toggle — always visible, even on the public landing */}
          <ThemeSwitcher size={32} />
        </div>
      </motion.nav>

      {/* ═══════ HERO ═══════ */}
      <main className="relative z-10 flex flex-col items-center px-4 pt-12 sm:pt-20 pb-16 max-w-5xl mx-auto">

        {/* Smart badge */}
        <motion.div
          className="mb-6 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold"
          style={{
            background: `${t.primary}14`,
            color:      t.primary,
            border:     `1px solid ${t.primary}25`,
          }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Smart Dues &amp; Payment Platform for Nigerian Organizations
        </motion.div>

        {/* Headline */}
        <motion.div
          className="text-center space-y-3 mb-5"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.1 }}
        >
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.1] tracking-tight"
            style={{ color: t.text }}
          >
            Payment Management
            <br />
            <span className="block mt-1">for</span>
          </h1>
          <div className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.1] tracking-tight h-[1.2em] flex items-center justify-center">
            <CyclingWord primary={t.primary} />
          </div>
        </motion.div>

        <motion.p
          className="text-base sm:text-lg max-w-xl text-center mb-10 leading-7"
          style={{ color: t.textSec }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {APP_TAGLINE}. Track dues, manage expenses, and keep your community
          financially organized — in minutes, not months.
        </motion.p>

        {/* ── Search box ── */}
        <motion.div
          className="w-full max-w-xl mb-3 relative"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.35 }}
        >
          {/* Focus ring */}
          <motion.div
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{ boxShadow: `0 0 0 3px ${t.primary}40` }}
            variants={{ idle: { opacity: 0, scale: 1 }, focused: { opacity: 1, scale: 1.02 } }}
            animate={searchFocused ? 'focused' : 'idle'}
            transition={{ duration: 0.25 }}
          />

          <div className="relative">
            {/* Pulse glow on focus */}
            <AnimatePresence>
              {searchFocused && (
                <motion.div
                  className="absolute -inset-px rounded-2xl pointer-events-none"
                  style={{ boxShadow: `0 0 40px ${t.primary}30` }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                />
              )}
            </AnimatePresence>

            {/* Input row */}
            <div
              className="relative flex items-center rounded-2xl overflow-hidden transition-all"
              style={searchSurface}
            >
              <motion.div
                animate={{ color: searchFocused ? t.primary : t.textTer }}
                className="pl-4 shrink-0"
              >
                <Search className="w-5 h-5" />
              </motion.div>
              <input
                type="text"
                placeholder="Search for your organization…"
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={()  => setSearchFocused(false)}
                className="pvx-search-input flex-1 bg-transparent pl-3 pr-4 py-4 text-base outline-none"
                style={{
                  color:      t.text,
                  caretColor: t.primary,
                }}
              />
              <AnimatePresence>
                {searching && (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="pr-4"
                  >
                    <motion.div
                      className="w-4 h-4 border-2 rounded-full"
                      style={{ borderColor: `${t.primary}30`, borderTopColor: t.primary }}
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Dropdown results */}
            <AnimatePresence>
              {hasSearched && (
                <motion.div
                  className="absolute top-full left-0 right-0 mt-2 rounded-2xl overflow-hidden z-30"
                  style={{ ...dropdownSurface, transformOrigin: 'top' }}
                  initial={{ opacity: 0, y: -8, scaleY: 0.95 }}
                  animate={{ opacity: 1, y: 0,  scaleY: 1 }}
                  exit={{   opacity: 0, y: -8,  scaleY: 0.95 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                  {searching ? (
                    <div className="px-5 py-6 flex items-center gap-3" style={{ color: t.textTer }}>
                      <motion.div
                        className="w-4 h-4 border-2 rounded-full shrink-0"
                        style={{ borderColor: `${t.primary}30`, borderTopColor: t.primary }}
                        animate={{ rotate: 360 }}
                        transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                      />
                      Searching organizations…
                    </div>
                  ) : searchResults.length > 0 ? (
                    <>
                      <div
                        className="px-5 py-2.5 text-[10px] uppercase tracking-widest font-semibold"
                        style={{ color: t.textTer, borderBottom: `1px solid ${t.cardBorder}` }}
                      >
                        {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
                      </div>
                      <div>
                        {searchResults.map((r, i) => (
                          <SearchResultItem
                            key={`${r.kind}-${r.id}`}
                            result={r}
                            index={i}
                            onClick={() => handleResultClick(r)}
                            t={t}
                          />
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="px-5 py-6 text-center space-y-3">
                      <p className="text-sm" style={{ color: t.textSec }}>
                        No match for{' '}
                        <span className="font-semibold" style={{ color: t.text }}>
                          "{searchQuery}"
                        </span>
                      </p>
                      <p className="text-xs" style={{ color: t.textTer }}>
                        Be the first to bring your school onto Payvexo.
                      </p>
                      <motion.button
                        onClick={() => navigate(`/bring-school?name=${encodeURIComponent(searchQuery)}`)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
                        style={{
                          color:      t.primary,
                          background: `${t.primary}15`,
                          border:     `1px solid ${t.primary}30`,
                        }}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.97 }}
                      >
                        <Plus className="w-4 h-4" />
                        Bring my school here
                      </motion.button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* ── Divider ── */}
        <motion.div
          className="flex items-center gap-4 w-full max-w-xl my-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <div className="flex-1 h-px" style={{ background: t.cardBorder }} />
          <span className="text-xs font-medium" style={{ color: t.textTer }}>
            or enter your org link
          </span>
          <div className="flex-1 h-px" style={{ background: t.cardBorder }} />
        </motion.div>

        {/* ── Slug entry ── */}
        <motion.form
          className="w-full max-w-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55 }}
          onSubmit={handleSlugSubmit}
        >
          <div className="flex gap-2.5">
            <div
              className="flex-1 flex items-center rounded-xl overflow-hidden transition-all"
              style={{
                background: isLight ? 'rgba(255,255,255,0.90)' : 'rgba(26,14,9,0.90)',
                border:     `1px solid ${
                  slugInput.length > 0
                    ? slugValid
                      ? isLight ? 'rgba(0,194,119,0.55)' : 'rgba(48,255,172,0.40)'
                      : 'rgba(239,68,68,0.40)'
                    : t.cardBorder
                }`,
                boxShadow:  isLight ? '0 2px 12px rgba(15,7,3,0.06)' : 'none',
              }}
            >
              <span
                className="pl-3.5 text-sm font-medium shrink-0 select-none"
                style={{ color: t.textTer }}
              >
                payvexo.com/
              </span>
              <input
                name="slug"
                type="text"
                placeholder="your-org-slug"
                value={slugInput}
                onChange={e => handleSlugChange(e.target.value)}
                className="pvx-slug-input flex-1 bg-transparent px-1.5 py-3 text-sm outline-none"
                style={{ color: t.text, caretColor: t.primary }}
              />
              <AnimatePresence>
                {slugInput.length > 0 && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{   opacity: 0, scale: 0.6 }}
                    className="pr-3"
                  >
                    {slugValid
                      ? <CheckCircle className="w-4 h-4" style={{ color: t.mint }} />
                      : <span className="w-4 h-4 flex items-center justify-center text-xs text-red-400">✗</span>
                    }
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            <motion.button
              type="submit"
              disabled={!slugValid}
              className="px-5 py-3 rounded-xl font-semibold text-sm text-white flex items-center gap-2 disabled:opacity-40"
              style={{ background: t.gradOrange }}
              whileHover={{ scale: slugValid ? 1.04 : 1 }}
              whileTap={{ scale: slugValid ? 0.97 : 1 }}
            >
              Go <ArrowRight className="w-4 h-4" />
            </motion.button>
          </div>

          {slugInput.length > 0 && !slugValid && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-1.5 text-xs pl-1"
              style={{ color: '#ef4444' }}
            >
              Slug must be at least 2 characters (letters, numbers, hyphens only)
            </motion.p>
          )}
        </motion.form>

        {/* ── Stats strip ── */}
        <motion.div
          className="w-full max-w-xl mt-10 grid grid-cols-3 gap-3"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
        >
          {[
            { icon: <Users className="w-4 h-4" />,      label: 'Members tracked',   to: 12400, suffix: '+',  color: t.primary                       },
            { icon: <DollarSign className="w-4 h-4" />, label: 'Dues collected',     to: 3800,  suffix: 'M+', color: t.mint,    prefix: '₦'           },
            { icon: <TrendingUp className="w-4 h-4" />, label: 'Organizations live', to: 420,   suffix: '+',  color: t.primary                       },
          ].map(({ icon, label, to, suffix, color, prefix }) => (
            <div
              key={label}
              className="rounded-2xl p-4 text-center relative overflow-hidden"
              style={{
                background: t.card,
                border:     `1px solid ${t.cardBorder}`,
                boxShadow:  isLight ? '0 2px 16px rgba(15,7,3,0.06)' : 'none',
              }}
            >
              <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: color }} />
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center mx-auto mb-2"
                style={{ background: `${color}15`, color }}
              >
                {icon}
              </div>
              <p className="text-lg font-extrabold" style={{ color: t.text }}>
                {prefix}<CountUp to={to} suffix={suffix} />
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: t.textTer }}>{label}</p>
            </div>
          ))}
        </motion.div>

        {/* ── Feature cards (3-D tilt) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-16 w-full max-w-3xl">
          <TiltCard
            icon={<Shield className="w-6 h-6" />}
            title="Bank-grade Security"
            desc="Role-based access control, encrypted data, and audit logs on every transaction."
            color={t.primary}
            delay={0}
            t={t}
            isLight={isLight}
          />
          <TiltCard
            icon={<Zap className="w-6 h-6" />}
            title="Real-time Tracking"
            desc="Instant notifications, live payment status, and real-time analytics dashboards."
            color={t.mint}
            delay={0.1}
            t={t}
            isLight={isLight}
          />
          <TiltCard
            icon={<Globe className="w-6 h-6" />}
            title="Any Organization"
            desc="Universities, churches, clubs, cooperatives — one platform, every community."
            color={t.primary}
            delay={0.2}
            t={t}
            isLight={isLight}
          />
        </div>

        {/* ── CTA ── */}
        <motion.div
          className="mt-16 text-center space-y-4"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-sm" style={{ color: t.textTer }}>
            Ready to get your organization set up?
          </p>
          <motion.button
            onClick={() => navigate('/bring-school')}
            className="px-8 py-4 rounded-2xl text-white font-bold text-base relative overflow-hidden"
            style={{
              background: t.gradOrange,
              boxShadow:  '0 10px 40px rgba(255,104,3,0.40)',
            }}
            whileHover={{ scale: 1.05, boxShadow: '0 14px 50px rgba(255,104,3,0.55)' }}
            whileTap={{ scale: 0.97 }}
          >
            {/* Shimmer sweep */}
            <motion.div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.18) 50%, transparent 65%)' }}
              initial={{ x: '-100%' }}
              whileHover={{ x: '100%' }}
              transition={{ duration: 0.55, ease: 'easeInOut' }}
            />
            <span className="relative flex items-center gap-2">
              Get Started — It's Free
              <ArrowRight className="w-5 h-5" />
            </span>
          </motion.button>
          <p className="text-xs" style={{ color: t.textTer }}>
            No credit card required · 14-day free trial · Cancel anytime
          </p>
        </motion.div>
      </main>

      {/* ═══════ FOOTER ═══════ */}
      <footer
        className="relative z-10 py-8 px-6 text-center mt-4"
        style={{ borderTop: `1px solid ${t.cardBorder}` }}
      >
        <div className="flex items-center justify-center gap-2 mb-2">
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center font-extrabold text-white text-xs"
            style={{ background: t.primary }}
          >
            P
          </div>
          <span className="text-sm font-bold" style={{ color: t.text }}>{APP_NAME}</span>
        </div>
        <p className="text-xs" style={{ color: t.textTer }}>
          © {new Date().getFullYear()} {APP_NAME}. Built in Nigeria, for Nigerian organizations.
        </p>
      </footer>

    </div>
  );
}