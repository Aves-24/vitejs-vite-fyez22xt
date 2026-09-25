// [C20] Anty-flash dark mode: klasa .dark musi być na <html> ZANIM
// wyrenderuje się pierwsza klatka, inaczej apka mignie na biało.
// Osobny plik zamiast inline-skryptu, bo CSP (script-src 'self') blokuje inline.
// Ten sam klucz localStorage co src/utils/theme.ts.
(function () {
  try {
    var t = localStorage.getItem('grotx_theme');
    // Brak wyboru = jasny (user 2026-09-25), jak getThemePreference().
    var dark = t === 'dark' || (t === 'system' &&
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) { /* ignore */ }
})();
