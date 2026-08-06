// Seria turniejowa — czyli kolejne edycje tej samej imprezy (np. "Apfelturnier"
// strzelany co roku). Wpisy w terminarzu są wolnym tekstem, więc ta sama impreza
// bywa zapisana raz z rokiem, raz bez, raz z inną wielkością liter.
//
// Klucz świadomie NIE zawiera dystansu: jeśli po zmianie kategorii wiekowej
// strzelasz tę samą imprezę z 70m na 50m, ma ona pozostać jedną serią,
// a dystans jest wymiarem wewnątrz niej.

const COMBINING_MARKS = /[̀-ͯ]/g;
const YEAR_IN_NAME = /\b(19|20)\d{2}\b/g;

/** Znormalizowana nazwa imprezy, wspólna dla wszystkich jej edycji. */
export const seriesKeyFromTitle = (title: string): string =>
  (title || '')
    .toLowerCase()
    // ß i ł nie rozkładają się przez NFD, trzeba je podmienić ręcznie
    .replace(/ß/g, 'ss')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(YEAR_IN_NAME, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Sesje zapisują datę w formacie pl-PL ("5.08.2026"), wydarzenia w ISO. */
export const sessionDateToISO = (d: string): string => {
  if (!d) return '';
  const p = d.split('.');
  return p.length === 3 ? `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}` : d;
};

export type SeriesSource = { title: string; date: string; distance?: string };

/**
 * Zwija listę startów do jednej pozycji na serię, zachowując najnowszą
 * użytą pisownię nazwy i dystans z ostatniej edycji — to one trafiają
 * do podpowiedzi w formularzu.
 */
export const collectSeries = <T extends SeriesSource>(items: T[]): T[] => {
  const newest = new Map<string, T>();
  items.forEach(item => {
    const key = seriesKeyFromTitle(item.title);
    if (!key) return;
    const prev = newest.get(key);
    if (!prev || item.date > prev.date) newest.set(key, item);
  });
  return Array.from(newest.values()).sort((a, b) => b.date.localeCompare(a.date));
};
