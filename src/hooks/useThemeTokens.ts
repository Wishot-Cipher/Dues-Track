/**
 * useThemeTokens — the one hook every page calls to become theme-aware.
 *
 *   const t = useThemeTokens();
 *   <div style={{ background: t.bg, color: t.text }}>
 *
 * It resolves the active theme and returns the full light/dark token palette
 * (from getDashboardTokens) plus a couple of extra surfaces pages commonly
 * need (input background, elevated shadow, divider). Light theme is a
 * first-class, modern surface — not an afterthought.
 */

import { useTheme, getDashboardTokens, type DashboardTokens, type ResolvedTheme } from '@/hooks/useTheme';

export interface ThemeTokens extends DashboardTokens {
  theme: ResolvedTheme;
  isLight: boolean;
  /** Form control surface (inputs, selects, textareas). */
  input: string;
  inputBorder: string;
  /** A hairline divider that reads on both themes. */
  divider: string;
  /** Soft elevation shadow for cards/menus. */
  shadow: string;
  shadowLg: string;
  /** Subtle pressed/hover overlay. */
  overlay: string;
}

export function useThemeTokens(): ThemeTokens {
  const { theme } = useTheme();
  const base = getDashboardTokens(theme);
  const isLight = theme === 'light';

  return {
    ...base,
    theme,
    isLight,
    input:       isLight ? '#FFFFFF' : 'rgba(0,0,0,0.25)',
    inputBorder: isLight ? 'rgba(15,7,3,0.12)' : 'rgba(255,255,255,0.10)',
    divider:     isLight ? 'rgba(15,7,3,0.08)' : 'rgba(255,255,255,0.08)',
    shadow:      isLight ? '0 6px 20px rgba(15,7,3,0.06)' : '0 6px 20px rgba(0,0,0,0.35)',
    shadowLg:    isLight ? '0 20px 50px rgba(15,7,3,0.12)' : '0 24px 60px rgba(0,0,0,0.5)',
    overlay:     isLight ? 'rgba(15,7,3,0.04)' : 'rgba(255,255,255,0.05)',
  };
}

export default useThemeTokens;
