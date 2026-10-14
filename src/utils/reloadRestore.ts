import i18n from '../i18n';
import { reloadToLatest } from './swUpdate';

/**
 * Powrót na ten sam ekran po samoczynnym przeładowaniu (lazyWithRetry).
 *
 * PROBLEM (user 2026-10-14): deploy w trakcie otwartej aplikacji → stara
 * wersja prosi o chunk widoku, którego serwer już nie ma → hard reload.
 * Wyglądało to jak wylogowanie: mignięcie splasha/logowania i lądowanie na
 * Home zamiast na profilu ucznia.
 *
 * ROZWIĄZANIE: App rejestruje źródło stanu nawigacji; przed reloadem
 * zapisujemy je w sessionStorage i zasłaniamy ekran planszą „Aktualisiere…”
 * (ten sam zielony + ikona co splash). Po starcie App czyta punkt powrotu
 * (ważny 60 s) i otwiera ten sam widok.
 */

export interface RestorePoint {
  view: string;
  studentId?: string | null;
  settingsTab?: string;
}

const KEY = 'grotX_reloadRestore';
const MAX_AGE_MS = 60_000;

let source: (() => RestorePoint) | null = null;

/** App podaje funkcję zwracającą bieżący widok (czytaną dopiero przy reloadzie). */
export function registerRestoreSource(fn: () => RestorePoint) {
  source = fn;
}

/** Przeładowanie z zapamiętaniem ekranu i planszą zamiast mignięcia. */
export function reloadKeepingView() {
  try {
    if (source) {
      sessionStorage.setItem(KEY, JSON.stringify({ ...source(), at: Date.now() }));
    }
  } catch { /* prywatne okno — przeładujemy bez powrotu */ }
  showUpdatingOverlay();
  reloadToLatest();
}

/** Jednorazowy odczyt — kolejne uruchomienia startują normalnie. */
export function takeRestorePoint(): RestorePoint | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const p = JSON.parse(raw) as RestorePoint & { at?: number };
    if (!p.at || Date.now() - p.at > MAX_AGE_MS || typeof p.view !== 'string') return null;
    return { view: p.view, studentId: p.studentId ?? null, settingsTab: p.settingsTab };
  } catch {
    return null;
  }
}

/** Tekst planszy — i18n jest już załadowane, bo przeładowanie idzie z działającej appki. */
export function updatingText(): string {
  return i18n.t('common.updating');
}

// Zwykły DOM, nie React: wywołujemy to w trakcie lazy-importu, a reload
// i tak zaraz wyrzuci całe drzewo.
function showUpdatingOverlay() {
  try {
    const el = document.createElement('div');
    el.setAttribute('style', [
      'position:fixed', 'inset:0', 'z-index:2147483647', 'background:#0a3a2a',
      'display:flex', 'align-items:center', 'justify-content:center',
    ].join(';'));
    const img = document.createElement('img');
    img.src = '/icon-512.png';
    img.alt = '';
    img.setAttribute('style', 'width:160px;height:160px');
    const txt = document.createElement('div');
    txt.textContent = updatingText();
    // Tekst absolutnie pod ikoną — ikona zostaje dokładnie na środku, jak
    // w index.html i splashu App, więc przejście nie skacze.
    txt.setAttribute('style', [
      'position:absolute', 'left:0', 'right:0', 'top:calc(50% + 100px)', 'text-align:center',
      'color:rgba(255,255,255,.75)', 'font:900 11px/1.4 system-ui,sans-serif',
      'letter-spacing:.2em', 'text-transform:uppercase',
    ].join(';'));
    el.append(img, txt);
    document.body.appendChild(el);
  } catch { /* bez planszy — reload i tak nastąpi */ }
}
