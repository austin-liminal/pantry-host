/**
 * Theme management — respects system preferences by default.
 *
 * "system" (default): mirrors prefers-color-scheme via matchMedia listener
 * "light" / "dark": manual override, ignores OS preference
 *
 * High contrast is an independent toggle layered on top.
 */

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_KEY = 'theme-preference';
const HC_KEY = 'high-contrast';

export function getThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  return (localStorage.getItem(THEME_KEY) as ThemePreference) || 'system';
}

export function setThemePreference(pref: ThemePreference) {
  if (pref === 'system') {
    localStorage.removeItem(THEME_KEY);
  } else {
    localStorage.setItem(THEME_KEY, pref);
  }
  applyTheme();
}

export function getHighContrast(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(HC_KEY) === 'true';
}

export function setHighContrast(enabled: boolean) {
  if (enabled) {
    localStorage.setItem(HC_KEY, 'true');
  } else {
    localStorage.removeItem(HC_KEY);
  }
  applyTheme();
}

export function applyTheme() {
  if (typeof document === 'undefined') return;

  const pref = getThemePreference();
  const el = document.documentElement;

  let dark: boolean;
  if (pref === 'system') {
    dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  } else {
    dark = pref === 'dark';
  }

  el.classList.toggle('dark', dark);
  el.style.colorScheme = dark ? 'dark' : 'light';

  el.classList.toggle('high-contrast', getHighContrast());
}

let listenerRegistered = false;

export function initTheme() {
  applyTheme();

  if (listenerRegistered) return;
  listenerRegistered = true;

  // Listen for OS preference changes — only matters when preference is "system"
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getThemePreference() === 'system') {
      applyTheme();
    }
  });
}
