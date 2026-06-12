// [C20] Dark mode — zarządzanie motywem (jasny / ciemny / systemowy).
// Klasa `dark` na <html> aktywuje remap kolorów w tailwind.css.
// Anty-flash: index.html ma inline-skrypt czytający ten sam klucz localStorage.

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'grotx_theme';

export function getThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch { /* ignore */ }
  return 'system';
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function isDarkActive(pref: ThemePreference = getThemePreference()): boolean {
  return pref === 'dark' || (pref === 'system' && systemPrefersDark());
}

// theme-color meta zostaje brandowe #0a3a2a — pasuje do obu motywów
function applyDom(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
}

export function setThemePreference(pref: ThemePreference) {
  try { localStorage.setItem(STORAGE_KEY, pref); } catch { /* ignore */ }
  applyDom(isDarkActive(pref));
}

// Wywołać raz przy starcie appki: aplikuje motyw i nasłuchuje zmian
// systemowych (istotne tylko w trybie 'system').
export function initTheme() {
  applyDom(isDarkActive());
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (getThemePreference() === 'system') applyDom(isDarkActive());
    });
  }
}
