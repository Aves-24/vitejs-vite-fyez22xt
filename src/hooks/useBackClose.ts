import { useEffect, useRef } from 'react';

// [WSTECZ] Jedna historia dla widoków i okienek (user 2026-11-02: „cofnij”
// ma cofać o jedno okienko, nie na Home). Każdy wpis ma numer `idx`; okienko
// (modal, karta ucznia, ekran grupy) dokłada własny wpis z `ovl: true`.
// Systemowe „wstecz” zamyka wtedy najwyższe okienko, a zamknięcie okienka
// krzyżykiem/tłem zdejmuje jego wpis (history.go), żeby kolejne „wstecz”
// nie trafiało w pustkę.

type Entry = { idx: number; close: () => void };

const live: Entry[] = [];
let stack: any[] = [];
let curIdx = 0;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let goInFlight = false;
// Nawigacja w trakcie zdejmowania martwych wpisów czeka na popstate, inaczej
// spóźniony popstate cofnąłby świeżo otwarty widok.
let pendingPush: Record<string, any> | null = null;
let suppressAppPop = false;
/** App: ten popstate to tylko sprzątanie historii — widoku nie zmieniać. */
export const navConsumeSuppress = () => { const s = suppressAppPop; suppressAppPop = false; return s; };

const ownerAt = (idx: number) => live.some(e => e.idx === idx);

export const navState = () => stack[curIdx];
export const navPrevState = () => (curIdx > 0 ? stack[curIdx - 1] : undefined);

export function navReplace(state: Record<string, any>) {
  const s = { ...state, idx: curIdx };
  stack[curIdx] = s;
  window.history.replaceState(s, '');
}

export function navPush(state: Record<string, any>) {
  if (goInFlight) { pendingPush = state; return; }
  // Przejście na inny widok prosto z okienka (np. „Profil” w karcie ucznia):
  // wpis okienka zastępujemy nowym widokiem — „wstecz” wraca wtedy do listy
  // pod okienkiem. Ekran grupy (`keep`) zostaje, bo do niego chcemy wrócić.
  const top = stack[curIdx];
  if (top?.ovl && !top.keep) { navReplace(state); return; }
  curIdx += 1;
  stack = stack.slice(0, curIdx);
  const s = { ...state, idx: curIdx };
  stack.push(s);
  window.history.pushState(s, '');
}

export function navInit(state: Record<string, any>) {
  curIdx = 0;
  stack = [];
  navReplace(state);
}

export const navBack = () => window.history.back();

// Zejście z martwych wpisów okienek (zamkniętych bez „wstecz”) do najbliższego
// żywego wpisu. Jeden timer na wszystkie zamknięcia z jednego kliknięcia.
function scheduleSync() {
  if (syncTimer) return;
  syncTimer = setTimeout(() => {
    syncTimer = null;
    if (goInFlight) return;
    let target = curIdx;
    while (target > 0 && stack[target]?.ovl && !ownerAt(target)) target -= 1;
    if (target < curIdx) { goInFlight = true; window.history.go(target - curIdx); }
  }, 0);
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', (e: PopStateEvent) => {
    const wasSync = goInFlight;
    goInFlight = false;
    const idx = typeof e.state?.idx === 'number' ? e.state.idx : 0;
    if (e.state) stack[idx] = e.state;
    curIdx = idx;
    // Zamykamy od góry; wpis zdejmujemy przed close(), żeby sprzątanie
    // efektu nie cofało historii drugi raz.
    const closing = live.filter(x => x.idx > idx).sort((a, b) => b.idx - a.idx);
    closing.forEach(x => live.splice(live.indexOf(x), 1));
    closing.forEach(x => x.close());
    if (wasSync && pendingPush) {
      const s = pendingPush;
      pendingPush = null;
      suppressAppPop = true;
      navPush(s);
      return;
    }
    // Martwy wpis okienka (np. po powrocie z innego widoku): przeskocz,
    // chyba że okienko po zamontowaniu go przejmie (ekran grupy).
    if (e.state?.ovl) setTimeout(() => { if (curIdx === idx && !ownerAt(idx)) scheduleSync(); }, 400);
  });
}

/**
 * Okienko z własnym krokiem w historii: gdy `open`, systemowe „wstecz” woła
 * `close`. `key` (z `value`) pozwala przejąć istniejący wpis po powrocie
 * z innego widoku — wtedy okienko nie dokłada nowego.
 */
export function useBackClose(open: boolean, close: () => void, opts?: { key?: string; value?: any }) {
  const closeRef = useRef(close);
  closeRef.current = close;
  const key = opts?.key;
  const value = opts?.value;
  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const entry: Entry = { idx: 0, close: () => closeRef.current() };
    const top = stack[curIdx];
    if (key && top?.ovl && top.key === key && top.value === value && !ownerAt(curIdx)) {
      entry.idx = curIdx;
    } else {
      const base = { ...(top || {}) };
      delete base.key; delete base.value; delete base.keep;
      // Martwy wpis właśnie zamkniętego okienka (okienko → okienko jednym
      // kliknięciem) podmieniamy, zamiast dokładać nad nim.
      const reuse = !!top?.ovl && !ownerAt(curIdx);
      if (!reuse) { curIdx += 1; stack = stack.slice(0, curIdx); }
      const s = { ...base, idx: curIdx, ovl: true, ...(key ? { key, value, keep: true } : {}) };
      stack[curIdx] = s;
      if (reuse) window.history.replaceState(s, ''); else window.history.pushState(s, '');
      entry.idx = curIdx;
    }
    live.push(entry);
    return () => {
      const i = live.indexOf(entry);
      if (i === -1) return; // zamknięte przez „wstecz”
      live.splice(i, 1);
      scheduleSync();
    };
  }, [open, key, value]);
}

/** Wartość wpisu okienka `key`, jeśli właśnie na nim stoimy (odtworzenie po powrocie). */
export const navOverlayValue = (key: string) => {
  const s = stack[curIdx];
  return s?.ovl && s.key === key ? s.value : undefined;
};
