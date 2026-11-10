import type { AnimalOutline } from './types';

/**
 * [ANIMAL ROUND 2026-11-10] Paczka obrysów zwierząt (~105 KB gzip) pobiera się
 * DOPIERO w trybie zwierząt — strzelcom WA niepotrzebna (decyzja usera).
 * Service worker trzyma `/animals/*` w trwałym cache (jak fonty), więc po
 * pierwszym pobraniu działa offline i przeżywa aktualizacje aplikacji.
 *
 * Plik generuje `scripts/animals/convert.cjs` z PhyloPic — licencje i autorzy
 * są w każdym wpisie (strona „Lizenzen”).
 */
export const OUTLINES_URL = '/animals/outlines.json';

let pending: Promise<AnimalOutline[]> | null = null;

export function loadAnimalOutlines(): Promise<AnimalOutline[]> {
  if (!pending) {
    pending = fetch(OUTLINES_URL)
      .then(r => { if (!r.ok) throw new Error(`outlines ${r.status}`); return r.json(); })
      .then((j: { outlines: AnimalOutline[] }) => j.outlines)
      .catch(e => { pending = null; throw e; }); // bez zasięgu — spróbuje przy następnym razie
  }
  return pending;
}

/** Nazwa obrysu w języku aplikacji (de/en/pl), inaczej niemiecka. */
export const outlineName = (o: AnimalOutline, lang: string): string =>
  (lang.startsWith('pl') ? o.pl : lang.startsWith('en') ? o.en : o.de) || o.de;
