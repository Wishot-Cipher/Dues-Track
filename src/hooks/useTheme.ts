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
    setChoiceState(c);
    setThemeState(resolve(c));
    try { localStorage.setItem(STORAGE_KEY, c); } catch { /* noop */ }
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
      blob1:       'rgba(255, 222, 192, 0.55)',  // peach
      blob2:       'rgba(255, 210, 180, 0.40)',
      dot:         'rgba(255, 104, 3, 0.06)',
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
    blob1:       'rgba(255, 104, 3, 0.16)',
    blob2:       'rgba(255, 172, 95, 0.10)',
    dot:         'rgba(255, 255, 255, 0.04)',
  };
}
