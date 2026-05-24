/**
 * useTheme — single source of truth for light / dark / system theme.
 *
 * - Reads + writes the user's pick to localStorage so the choice
 *   survives reloads.
 * - When 'system', listens to `prefers-color-scheme` and updates live.
 * - Exposes the *resolved* theme ('light' | 'dark') so components can
 *   pick the right tokens without re-checking.
 *
 * Used by the new student dashboard surfaces (OutstandingHero,
 * DueNextList, etc.). Pages that aren't theme-aware yet keep their
 * inline dark tokens — no breaking change.
 */

import { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'pvx_theme';

function readStoredChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch { /* SSR or storage disabled */ }
  return 'system';
}

function resolveSystem(): ResolvedTheme {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'dark';
  }
}

function resolve(choice: ThemeChoice): ResolvedTheme {
  return choice === 'system' ? resolveSystem() : choice;
}

/**
 * Reflects the resolved theme onto <html> as `data-theme="light|dark"` so
 * future global CSS (e.g. Tailwind's `dark:` variants or CSS variables)
 * can react too. Idempotent.
 */
function paintHtml(theme: ResolvedTheme) {
  try {
    const html = document.documentElement;
    html.setAttribute('data-theme', theme);
    // Keep the legacy `.dark` class in sync so Tailwind dark: works.
    html.classList.toggle('dark', theme === 'dark');
  } catch { /* noop */ }
}

// Custom in-tab event so every component that calls useTheme()
// re-renders when ANY component updates the theme.
//
// Why this exists: useTheme is a plain hook (not a Context), so each
// caller has its own useState copy. Without a broadcast channel, the
// ThemeSwitcher would update its local state but the dashboard's
// separate useTheme() instance would only catch up on the next page
// refresh — which is exactly the bug we're fixing.
//
// The `storage` event only fires in OTHER tabs, so we can't rely on
// it for the same-tab case. A custom event covers the same-tab case
// and we keep the storage listener for the cross-tab case.
const THEME_EVENT = 'pvx:theme-changed';

interface ThemeChangedDetail {
  choice: ThemeChoice;
  theme:  ResolvedTheme;
}

export function useTheme(): {
  choice: ThemeChoice;
  theme: ResolvedTheme;
  setTheme: (c: ThemeChoice) => void;
  toggle: () => void;
} {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => readStoredChoice());
  const [theme, setThemeState] = useState<ResolvedTheme>(() => resolve(readStoredChoice()));

  // Paint <html> once on mount + whenever the resolved theme changes.
  useEffect(() => { paintHtml(theme); }, [theme]);

  // Listen for in-tab broadcasts so every useTheme instance stays in
  // sync without forcing the user to refresh.
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<ThemeChangedDetail>).detail;
      if (!detail) return;
      setChoiceState(detail.choice);
      setThemeState(detail.theme);
    };
    window.addEventListener(THEME_EVENT, onChange);
    return () => window.removeEventListener(THEME_EVENT, onChange);
  }, []);

  // Cross-tab sync via the storage event (only fires in other tabs).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = readStoredChoice();
      setChoiceState(next);
      setThemeState(resolve(next));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Watch system changes whenever the user has chosen 'system'.
  useEffect(() => {
    if (choice !== 'system') return;
    try {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const fn = (e: MediaQueryListEvent) => setThemeState(e.matches ? 'dark' : 'light');
      mq.addEventListener('change', fn);
      return () => mq.removeEventListener('change', fn);
    } catch { /* noop */ }
  }, [choice]);

  const setTheme = useCallback((c: ThemeChoice) => {
    const nextTheme = resolve(c);
    setChoiceState(c);
    setThemeState(nextTheme);
    try { localStorage.setItem(STORAGE_KEY, c); } catch { /* noop */ }
    // Broadcast so every other useTheme() instance in this tab updates.
    try {
      window.dispatchEvent(
        new CustomEvent<ThemeChangedDetail>(THEME_EVENT, { detail: { choice: c, theme: nextTheme } }),
      );
    } catch { /* noop */ }
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { choice, theme, setTheme, toggle };
}

/**
 * Tokenized palette for the new dashboard surfaces. Components that
 * need theme awareness call `getDashboardTokens(theme)` once per render
 * and consume the returned object.
 */
export interface DashboardTokens {
  // Surfaces
  bg:          string;    // page background
  bgWash:      string;    // subtle gradient over the page bg
  card:        string;    // primary card surface
  cardBorder:  string;
  cardHover:   string;
  // Typography
  text:        string;
  textSec:     string;
  textTer:     string;
  // Brand
  primary:     string;    // brand orange
  primaryHi:   string;    // hover
  primarySoft: string;    // background tint
  primaryRing: string;    // focus/outline
  // Status
  mint:        string;
  blue:        string;
  purple:      string;
  amber:       string;
  danger:      string;
  // Gradients — mature, fintech-grade. Use these for surfaces that
  // want a "designed" feel rather than a flat tint.
  gradOrange:  string;    // primary brand gradient (hero CTA)
  gradGreen:   string;    // mature green gradient (success / "all clear" / accents)
  gradTeal:    string;    // calm secondary gradient
  // Decorative
  blob1:       string;    // upper-left ambient blob
  blob2:       string;    // lower-right ambient blob
  dot:         string;    // background dot pattern
}

export function getDashboardTokens(theme: ResolvedTheme): DashboardTokens {
  if (theme === 'light') {
    return {
      bg:          '#FFFBF7',
      bgWash:      'linear-gradient(180deg, #FFF7EE 0%, #FFFBF7 40%, #FFFFFF 100%)',
      card:        '#FFFFFF',
      cardBorder:  'rgba(15, 7, 3, 0.06)',
      cardHover:   '#FFF9F2',
      text:        '#0F0703',
      textSec:     'rgba(15, 7, 3, 0.62)',
      textTer:     'rgba(15, 7, 3, 0.38)',
      primary:     '#FF6803',
      primaryHi:   '#FF7A1E',
      primarySoft: 'rgba(255, 104, 3, 0.10)',
      primaryRing: 'rgba(255, 104, 3, 0.28)',
      mint:        '#00C277',
      blue:        '#3B82F6',
      purple:      '#8b5cf6',
      amber:       '#F59E0B',
      danger:      '#EF4444',
      // Mature gradients — each one is built around two well-spaced
      // brand stops so it feels "designed" not "filtered".
      gradOrange:  'linear-gradient(135deg, #FF7A1E 0%, #FF6803 50%, #E55A02 100%)',
      gradGreen:   'linear-gradient(135deg, #2DD4A0 0%, #10B981 50%, #047857 100%)',
      gradTeal:    'linear-gradient(135deg, #5EEAD4 0%, #14B8A6 50%, #0F766E 100%)',
      blob1:       'rgba(255, 222, 192, 0.65)',  // peach — slightly warmer
      blob2:       'rgba(255, 210, 180, 0.48)',
      dot:         'rgba(255, 104, 3, 0.12)',     // 2x stronger so the grid actually reads
    };
  }
  // dark
  return {
    bg:          '#0F0703',
    bgWash:      'linear-gradient(180deg, #1A0E09 0%, #120904 50%, #0A0502 100%)',
    card:        'rgba(255, 255, 255, 0.03)',
    cardBorder:  'rgba(255, 255, 255, 0.08)',
    cardHover:   'rgba(255, 255, 255, 0.05)',
    text:        '#FFFFFF',
    textSec:     'rgba(255, 255, 255, 0.65)',
    textTer:     'rgba(255, 255, 255, 0.38)',
    primary:     '#FF6803',
    primaryHi:   '#FFAC5F',
    primarySoft: 'rgba(255, 104, 3, 0.12)',
    primaryRing: 'rgba(255, 104, 3, 0.32)',
    mint:        '#30FFAC',
    blue:        '#5B9BFF',
    purple:      '#8b5cf6',
    amber:       '#F59E0B',
    danger:      '#ef4444',
    // Same gradient shapes; tuned slightly brighter for dark surfaces
    // so they don't get lost on ember bg.
    gradOrange:  'linear-gradient(135deg, #FF7A1E 0%, #FF6803 50%, #E55A02 100%)',
    gradGreen:   'linear-gradient(135deg, #34F0B6 0%, #10D49B 50%, #0AAA7C 100%)',
    gradTeal:    'linear-gradient(135deg, #7CF2DD 0%, #2DD4BF 50%, #14B8A6 100%)',
    blob1:       'rgba(255, 104, 3, 0.16)',
    blob2:       'rgba(255, 172, 95, 0.10)',
    dot:         'rgba(255, 255, 255, 0.04)',
  };
}
