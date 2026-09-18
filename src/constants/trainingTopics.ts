// term = niemiecki termin techniczny (źródło nazw DE). Już NIE wyświetlany jako
// podpis pod PL/EN — user uznał niemieckie nazwy pod polskimi za błąd (2026-09-15).
export const TRAINING_TOPICS = [
  {
    id: 'fundamenty',
    num: '1',
    subtopics: [
      { id: 'fusstellung',      term: 'Fußstellung' },
      { id: 'tform',            term: 'T-Form' },
      { id: 'gewicht',          term: 'Gewichtsverteilung' },
      { id: 'kopf',             term: 'Kopfhaltung' },
      { id: 'mindset',          term: 'Mentale Einstellung' },
    ],
  },
  {
    id: 'naciag',
    num: '2',
    subtopics: [
      { id: 'voranschlag',      term: 'Vorspannung' },
      { id: 'bogengriff',       term: 'Bogengriff' },
      { id: 'bogenarm',         term: 'Bogenarmhaltung' },
      { id: 'ellenbogen',       term: 'Ellenbogenrotation' },
      { id: 'hook',             term: 'Sehnengriff' },
      { id: 'auszug',           term: 'Auszug' },
      { id: 'schulter',         term: 'Schulter tief' },
      { id: 'anker',            term: 'Ankerpunkt' },
      { id: 'sehne',            term: 'Sehnenschatten' },
    ],
  },
  {
    id: 'celowanie',
    num: '3',
    subtopics: [
      { id: 'zielen',           term: 'Zielen' },
      { id: 'rucken',           term: 'Rückenspannung' },
      { id: 'expansion',        term: 'Expansion' },
      { id: 'klicker',          term: 'Klickerkontrolle' },
      { id: 'atem',             term: 'Atemtechnik' },
      { id: 'visual',           term: 'Visualisierung' },
    ],
  },
  {
    id: 'zwolnienie',
    num: '4',
    subtopics: [
      { id: 'losen',            term: 'Lösen' },
      { id: 'panik',            term: 'Scheibenpanik' },
      { id: 'nachhalten',       term: 'Nachhalten' },
      { id: 'rhythmus',         term: 'Schussrhythmus' },
    ],
  },
  {
    id: 'taktyka',
    num: '5',
    subtopics: [
      { id: 'visier',           term: 'Visiereinstellung' },
      { id: 'wind',             term: 'Windschießen' },
      { id: 'zeit',             term: 'Zeitmanagement' },
      { id: 'psycho',           term: 'Drucksituationen' },
      { id: 'routine',          term: 'Schussroutine' },
      { id: 'bogeneinstellung', term: 'Bogeneinstellung' },
      { id: 'pfeilabstimmung',  term: 'Pfeilabstimmung' },
      { id: 'stabilisator',     term: 'Stabilisator' },
      { id: 'nockpunkt',        term: 'Nockpunkt' },
    ],
  },
];

// ─── [C39] Własne tematy trenera ────────────────────────────────────────────
// Własny temat „niesie” swoją nazwę w ID (`c:Praca na klikerze`), więc wyświetli
// się wszędzie — także u ucznia, któremu trener wpisał go w fokus albo termin —
// bez czytania dokumentu trenera i bez zmian w regułach. Sama lista (do wyboru
// w pickerze) leży w `users/{coachId}.customTopics` i jest prywatna dla trenera.
// Zmiana nazwy = nowy temat; stare wpisy zachowują starą nazwę.

/** Szósta kategoria w pickerze — tematy spoza piątki. */
export const CUSTOM_CATEGORY_ID = 'wlasne';
export const CUSTOM_TOPIC_PREFIX = 'c:';
export const CUSTOM_TOPIC_MAX_LEN = 40;
/** Techniczny sufit (bez podziału FREE/PRO — decyzja usera 2026-09-18). */
export const CUSTOM_TOPICS_MAX = 50;

export interface CustomTopic {
  id: string;   // `c:<nazwa>`
  cat: string;  // id jednej z 5 kategorii albo CUSTOM_CATEGORY_ID
}

const CATEGORY_IDS = [...TRAINING_TOPICS.map(c => c.id), CUSTOM_CATEGORY_ID];

export const isCustomTopic = (id: string) => id.startsWith(CUSTOM_TOPIC_PREFIX);

export function normalizeTopicName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, CUSTOM_TOPIC_MAX_LEN);
}

export const customTopicId = (name: string) => CUSTOM_TOPIC_PREFIX + normalizeTopicName(name);

/** Etykieta tematu — wbudowany z tłumaczeń, własny ze swojego ID. */
export function topicLabel(id: string, t: (k: string) => string): string {
  return isCustomTopic(id) ? id.slice(CUSTOM_TOPIC_PREFIX.length) : t(`sessionSetup.topic_${id}`);
}

const BUILTIN_IDS = new Set(TRAINING_TOPICS.flatMap(c => c.subtopics.map(s => s.id)));

/** Czy ID da się wyświetlić (wbudowany albo własny) — śmieci ze starych danych pomijamy. */
export const isKnownTopic = (id: unknown): id is string =>
  typeof id === 'string' && (BUILTIN_IDS.has(id) || (isCustomTopic(id) && id.length > CUSTOM_TOPIC_PREFIX.length));

/** Bezpieczne czytanie `customTopics` z dokumentu (pole pisze klient). */
export function parseCustomTopics(raw: unknown): CustomTopic[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CustomTopic[] = [];
  for (const x of raw) {
    if (!x || typeof x.id !== 'string' || !isCustomTopic(x.id) || seen.has(x.id)) continue;
    if (x.id.length <= CUSTOM_TOPIC_PREFIX.length) continue;
    seen.add(x.id);
    out.push({ id: x.id, cat: CATEGORY_IDS.includes(x.cat) ? x.cat : CUSTOM_CATEGORY_ID });
  }
  return out.slice(0, CUSTOM_TOPICS_MAX);
}
