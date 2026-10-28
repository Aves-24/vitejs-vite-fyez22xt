import { arrowColorAt } from '../config/arrowColors';

/**
 * [KOLORY STRZAŁ] Kolory strzał w Delay Mirror — osobny przełącznik
 * w Expertenmodus (user 2026-10-28).
 *
 * Trzymany w localStorage, a nie w propach: znaczniki rysuje kilka ekranów
 * (wpisywanie, tarcza obok wideo, oś czasu, wypalony eksport), a przełącznik
 * zmienia się tylko przed startem lustra, kiedy żaden z nich nie jest
 * zamontowany. Brak wpisu = idź za opcją z zestawu (SPRZĘT → STRZAŁY).
 */
const KEY = 'grotx-mirror-arrow-colors';

/** null = user jeszcze nie wybrał, decyduje zestaw. */
export function readMirrorArrowColors(): boolean | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
}

export function writeMirrorArrowColors(on: boolean): void {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ }
}

/** Kolor znacznika strzały nr `n` (1..6) albo null, gdy kolory są wyłączone. */
export function mirrorShotColor(n: number): { hex: string; text: string } | null {
  return readMirrorArrowColors() ? arrowColorAt(n - 1) : null;
}
