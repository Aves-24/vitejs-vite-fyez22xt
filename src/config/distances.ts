/**
 * [C25] Katalog dystansów — jedyne źródło prawdy.
 *
 * Do 2026-09-04 lista dystansów była ZASZYTA w sześciu miejscach, w dwóch
 * niezgodnych wariantach (App.tsx i SettingsView z 35m, HistoricalStartForm
 * i ProfileWizard bez). Ten plik kończy ten stan — dokładnie tak, jak
 * `config/targetFaces.ts` skończył z rozjazdem tarcz.
 *
 * ── Dlaczego dystans ma `id`, a nie wystarczy sama nazwa ────────────────────
 *
 * Statystyki grupują sesje po dystansie (`ProStatsView`, `TournamentRecordsView`,
 * `xpEngine`). Gdyby kluczem był napis, każda zmiana nazwy przecinałaby historię
 * na pół: stare sesje zostają pod starym napisem, nowe idą pod nowy. Dlatego
 * tożsamością jest `id`, który nie zmienia się NIGDY, a nazwa (`label`) jest
 * dowolna i zmienna. To ten sam wzorzec, co `setupId` + `bowClass`
 * w `utils/setupStamp.ts` — tam też id trzyma tożsamość, a pole nośne przeżywa
 * zmianę nazwy i skasowanie.
 *
 * `m` (metry) jest NIEZMIENNE po utworzeniu wpisu — decyzja usera 2026-09-04.
 * Powód nie jest kosmetyczny: `parseInt(distance)` karmi handicap
 * (`ScoringView`, `ProStatsView`). Gdyby jeden `id` mógł zmienić 18 m na 70 m,
 * wszystkie policzone wcześniej handicapy w tym kubełku stałyby się
 * nieporównywalne i NIKT by tego nie zauważył.
 *
 * ── Dlaczego id standardowych dystansów jest wyliczane z metrów ─────────────
 *
 * Sesje sprzed C25 nie mają `distanceId` — niosą sam napis `18m`. Gdyby
 * standardowe wpisy dostały id z zegara, tamte sesje nie trafiłyby do żadnego
 * kubełka i historia rozpadłaby się dokładnie tak, jak chcemy uniknąć.
 * Dlatego id standardowego dystansu jest DETERMINISTYCZNE (`d_18m`), a stara
 * sesja mapuje się na nie bez żadnego odczytu z bazy (patrz `distanceKey`).
 *
 * Konsekwencja jest dokładnie ta, o którą chodziło: gdy user dołoży DRUGI
 * wpis 18 m (np. „barebow"), dostanie on id z zegara, czyli własny kubełek,
 * a cała dotychczasowa historia 18 m zostaje przy wpisie pierwotnym.
 */

/** Dystanse, które aplikacja proponuje z pudełka. Kolejność = kolejność wyświetlania. */
export const MASTER_DISTANCES = ['18m', '20m', '25m', '30m', '35m', '40m', '50m', '60m', '70m', '90m'];

/** Maksymalna długość etykiety. 10 znaków — ustalone z userem 2026-09-04. */
export const DISTANCE_LABEL_MAX = 10;

/** Sufit liczby dystansów. Lustrzany w firestore.rules — zmieniać OBA miejsca. */
export const MAX_DISTANCES = 30;

/** Zakres metrów, jaki wolno wpisać ręcznie. 3 m to dmuchawka z bliska, 200 m to zapas. */
export const MIN_CUSTOM_METERS = 3;
export const MAX_CUSTOM_METERS = 200;

export interface UserDistance {
  /** Tożsamość. Nadawane raz, nie zmienia się nigdy, nie jest nigdy używane ponownie. */
  id: string;
  /** Metry, format `<liczba>m`. NIEZMIENNE po utworzeniu — patrz nagłówek. */
  m: string;
  /** Opis usera, max `DISTANCE_LABEL_MAX` znaków. Dowolny i zmienny. */
  label?: string;
  active: boolean;
  targetType: string;
  sightExtension?: string;
  sightHeight?: string;
  sightSide?: string;
  sightMark?: string;
}

/** Stempel dystansu na sesji — analogicznie do `SetupStamp`. */
export interface DistanceStamp {
  /** Kubełek statystyk. */
  distanceId?: string;
  /** Nazwa w chwili strzału. Jedyna nazwa, jaka zostaje po skasowaniu wpisu. */
  distanceLabel?: string;
}

/**
 * Id standardowego dystansu — wyliczane, nie losowane.
 * Musi dawać ten sam wynik dla `18m` co klucz starej sesji (patrz `distanceKey`).
 */
export const builtinDistanceId = (m: string): string => `d_${m}`;

/**
 * Id własnego dystansu — z zegara, w base36.
 *
 * Świadomie NIE `max(istniejące) + 1`: skasowanie ostatniego wpisu i dodanie
 * nowego nadałoby mu ten sam numer, a nowy dystans odziedziczyłby historię
 * starego. Zegar tego nie robi. Sufiks losowy chroni przed dwoma kliknięciami
 * w tej samej milisekundzie.
 */
export const newDistanceId = (): string =>
  `d_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Metry jako liczba. `18m` → 18. Zwraca 0, gdy się nie da. */
export const distanceMeters = (m?: string | null): number => {
  const n = parseInt(String(m ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Metry z powrotem do kanonicznego napisu. 18 → `18m`. */
export const formatDistance = (meters: number): string => `${Math.round(meters)}m`;

/** Co user widzi na przycisku: `18m` albo `18m barebow`. */
export const displayDistance = (d: Pick<UserDistance, 'm' | 'label'>): string =>
  d.label ? `${d.m} ${d.label}` : d.m;

/** Etykieta przycięta i oczyszczona; pusta → `undefined` (nie pusty string). */
export const normalizeLabel = (raw?: string | null): string | undefined => {
  const s = String(raw ?? '').trim().slice(0, DISTANCE_LABEL_MAX);
  return s.length > 0 ? s : undefined;
};

/**
 * Klucz kubełka statystyk dla sesji.
 *
 * Sesje sprzed C25 nie mają `distanceId` — spadają na id wyliczone z napisu,
 * czyli lądują w tym samym kubełku co dystans, na którym realnie padły.
 */
export const distanceKey = (s: { distanceId?: string | null; distance?: string | null }): string =>
  s.distanceId || builtinDistanceId(String(s.distance ?? ''));

/**
 * Nazwa dystansu do pokazania przy sesji.
 *
 * Bierze stempel, nie listę użytkownika — bo trener ogląda statystyki UCZNIA
 * (`StatsView` ma `viewingStudentId`), a rozwiązywanie id po własnej liście
 * pokazałoby mu cudze nazwy.
 */
export const sessionDistanceLabel = (s: { distanceLabel?: string | null; distance?: string | null }): string =>
  s.distanceLabel || String(s.distance ?? '');

/** Stempel do rozłożenia w payloadzie sesji (`...distanceStamp(d)`). */
export const distanceStamp = (d?: Pick<UserDistance, 'id' | 'm' | 'label'> | null): DistanceStamp => {
  if (!d?.id) return {};
  // Etykietę zapisujemy tylko wtedy, gdy wnosi coś ponad same metry —
  // bez niej `sessionDistanceLabel` czyta po prostu pole `distance`.
  return d.label ? { distanceId: d.id, distanceLabel: displayDistance(d) } : { distanceId: d.id };
};

/** Sortowanie: rosnąco po metrach, przy remisie po etykiecie. */
export const compareDistances = (a: UserDistance, b: UserDistance): number =>
  distanceMeters(a.m) - distanceMeters(b.m) || (a.label ?? '').localeCompare(b.label ?? '');

/**
 * Nadaje id wpisom, które ich jeszcze nie mają (konta sprzed C25).
 *
 * Zwraca `changed: true`, gdy cokolwiek dopisano — wołający zapisuje wtedy
 * listę z powrotem, żeby id utrwaliło się raz, a nie było zgadywane co wejście.
 * Standardowe metry dostają id wyliczone, żeby stare sesje trafiły do nich
 * same z siebie; duplikat metrów dostaje id z zegara.
 */
export function ensureDistanceIds(list: any[]): { list: UserDistance[]; changed: boolean } {
  const seen = new Set<string>();
  let changed = false;

  const out = (Array.isArray(list) ? list : []).map((d: any) => {
    const entry: UserDistance = { active: false, targetType: '122cm', ...d };
    if (!entry.id) {
      const builtin = builtinDistanceId(entry.m);
      entry.id = seen.has(builtin) ? newDistanceId() : builtin;
      changed = true;
    }
    seen.add(entry.id);
    return entry;
  });

  return { list: out, changed };
}

/** Wpis dla dystansu z listy standardowej, z zachowaniem tego, co user już miał. */
export function buildDistanceEntry(m: string, existing?: Partial<UserDistance>): UserDistance {
  return {
    id: existing?.id || builtinDistanceId(m),
    m,
    ...(existing?.label ? { label: existing.label } : {}),
    active: !!existing?.active,
    targetType: existing?.targetType || '122cm',
    sightExtension: existing?.sightExtension || '',
    sightHeight: existing?.sightHeight || '',
    sightSide: existing?.sightSide || '',
    sightMark: existing?.sightMark || '',
  };
}

/** Id wpisów standardowych — po nich poznajemy, czego regeneracja może dotknąć. */
const MASTER_IDS = new Set(MASTER_DISTANCES.map(builtinDistanceId));

/** Wpis dodany przez usera, nie pochodzący z listy standardowej. */
export const isCustomDistance = (d: UserDistance): boolean => !MASTER_IDS.has(d.id);

/**
 * Przebudowa listy standardowej Z ZACHOWANIEM własnych wpisów.
 *
 * Regeneracja dystansów (zapis profilu, kreator, zmiana roku w
 * `SmartSeasonUpdater`) do tej pory NADPISYWAŁA całą listę dziesięcioma
 * pozycjami standardowymi. Po C25 to by kasowało własne dystanse usera —
 * łącznie z tym, na którym realnie strzela z dmuchawki. Wpisy własne
 * przechodzą przez regenerację nietknięte.
 */
export function rebuildMasterList(
  existing: UserDistance[],
  make: (m: string, prev?: UserDistance) => UserDistance,
): UserDistance[] {
  const byId = new Map((existing || []).map(d => [d.id, d]));
  const rebuilt = MASTER_DISTANCES.map(m => make(m, byId.get(builtinDistanceId(m))));
  const customs = (existing || []).filter(isCustomDistance);
  return [...rebuilt, ...customs].sort(compareDistances);
}

/**
 * Czy taki dystans już istnieje na liście.
 * Duplikatem jest para (metry, etykieta) — dwa gołe „30m" tak, ale
 * „18m recurve" obok „18m barebow" to dwa różne, poprawne wpisy.
 */
export function isDuplicateDistance(list: UserDistance[], m: string, label?: string): boolean {
  const l = normalizeLabel(label);
  return list.some(d => d.m === m && normalizeLabel(d.label) === l);
}
