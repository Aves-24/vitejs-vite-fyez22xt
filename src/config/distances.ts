import { isBlowgun } from './equipmentSetups';
import { BLOWGUN_FACE_ID } from './targets/blowgun';

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

/**
 * Dystanse ŁUCZNICZE, które aplikacja proponuje z pudełka.
 * Kolejność = kolejność wyświetlania.
 */
export const MASTER_DISTANCES = ['18m', '20m', '25m', '30m', '35m', '40m', '50m', '60m', '70m', '90m'];

/**
 * [DYSCYPLINY] Dystanse DMUCHAWKOWE z pudełka.
 *
 * Do 2026-09-08 dmuchawkarz nie miał ani jednego dystansu z pudełka — musiał
 * dopisać własny (`10m` + etykieta `Blasrohr`), co zjadało mu limit wpisów
 * własnych: na FREE są dwa, więc 5/7/10 m po prostu się nie mieściło.
 *
 * 10 m pochodzi z potwierdzonego źródła (T2: „średnica 20 cm, dystans zwykle
 * 10 m"); 5 i 7 m to krótsze warianty, na których user realnie strzelał.
 * Dopisanie tu kolejnej pozycji jest bezpieczne dla historii — id wylicza się
 * z metrów, więc nie rusza kubełków, które już zbierają sesje.
 */
export const BLOWGUN_MASTER_DISTANCES = ['5m', '7m', '10m'];

/**
 * Dyscyplina dystansu. Brak = łucznictwo — ta sama konwencja, co
 * `TargetFace.discipline` w `config/targetFaces.ts`, i z tego samego powodu:
 * dopisanie kolejnej dyscypliny ma być wpisem z tagiem, a nie kolejnym
 * porównaniem po id rozsianym po widokach.
 */
export type DistanceDiscipline = 'blowgun';

/** Dystanse z pudełka dla danej dyscypliny. */
export const masterDistancesFor = (discipline?: string | null): string[] =>
  isBlowgun(discipline) ? BLOWGUN_MASTER_DISTANCES : MASTER_DISTANCES;

/** Ile wpisów standardowych ma KAŻDY user, licząc wszystkie dyscypliny razem. */
export const MASTER_DISTANCE_COUNT = MASTER_DISTANCES.length + BLOWGUN_MASTER_DISTANCES.length;

/** Maksymalna długość etykiety. 10 znaków — ustalone z userem 2026-09-04. */
export const DISTANCE_LABEL_MAX = 10;

/**
 * Ile WŁASNYCH dystansów wolno dodać PONAD listę standardową (decyzja usera
 * 2026-09-04). Ten sam kształt co limit zestawów sprzętowych: FREE dostaje
 * tyle, żeby dopisać sobie realny dystans ze swojej strzelnicy, PRO tyle,
 * żeby rozbić dyscypliny i łuki na osobne kubełki statystyk.
 */
export const CUSTOM_DISTANCE_LIMIT_FREE = 2;
export const CUSTOM_DISTANCE_LIMIT_PRO = 15;

export function customDistanceLimitFor(isPremium: boolean): number {
  return isPremium ? CUSTOM_DISTANCE_LIMIT_PRO : CUSTOM_DISTANCE_LIMIT_FREE;
}

/**
 * Sufit CAŁEJ listy — 12 (FREE) albo 25 (PRO).
 *
 * To jego, a nie liczby wpisów własnych, pilnują reguły Firestore: język
 * regul nie ma petli ani filtrowania, wiec nie da sie tam policzyc, ile
 * pozycji jest „wlasnych". Wychodzi na to samo, bo regeneracja zawsze
 * odtwarza komplet dziesieciu standardowych (`rebuildMasterList`), wiec
 * dlugosc listy = 10 + wlasne. Lustro w firestore.rules — zmieniac OBA miejsca.
 */
export function maxDistancesFor(isPremium: boolean): number {
  return MASTER_DISTANCE_COUNT + customDistanceLimitFor(isPremium);
}

/** Zakres metrów, jaki wolno wpisać ręcznie. 3 m to dmuchawka z bliska, 200 m to zapas. */
export const MIN_CUSTOM_METERS = 3;
export const MAX_CUSTOM_METERS = 200;

export interface UserDistance {
  /** Tożsamość. Nadawane raz, nie zmienia się nigdy, nie jest nigdy używane ponownie. */
  id: string;
  /**
   * Do której dyscypliny należy ten dystans. Brak = łucznictwo.
   *
   * Pole jest tylko FILTREM WIDOKU — nie wchodzi do stempla sesji i nie ma
   * go w statystykach. Dyscyplinę sesji rozstrzyga `bowClass` ze stempla
   * zestawu (`utils/setupStamp.ts`), i tak ma zostać: gdyby o dyscyplinie
   * sesji decydował dystans, zmiana tagu na wpisie przepisywałaby historię
   * wstecz — dokładnie ta pułapka, przed którą chroni niezmienność `m`.
   */
  discipline?: DistanceDiscipline;
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

/**
 * [DYSCYPLINY] Dopisuje brakujące wpisy standardowe — konta sprzed 2026-09-08.
 *
 * Bliźniak `ensureDistanceIds`: robota jednorazowa, wykonana przy wejściu do
 * aplikacji i od razu utrwalona. Bez tego user z gotową listą dziesięciu
 * dystansów łuczniczych NIGDY nie dostałby dmuchawkowych — regeneracja
 * (`rebuildMasterList`) odpala się dopiero przy zapisie profilu, kreatorze
 * albo zmianie roku, więc przełączenie zestawu na rurę pokazałoby pustkę.
 *
 * Kasować wpisów standardowych się nie da (kosz jest tylko przy własnych),
 * więc dopisanie brakujących nie wskrzesza niczego, co user usunął.
 *
 * ⚠️ Ten backfill PODNOSI długość listy z 10 do 13, więc wymaga reguł
 * z sufitem 15/28. Wypuszczony przed deployem reguł dostanie
 * `permission-denied` i lista nie utrwali się w bazie.
 */
export function ensureMasterDistances(list: UserDistance[]): { list: UserDistance[]; changed: boolean } {
  const have = new Set((list || []).map(d => d.id));
  const missing = [
    ...MASTER_DISTANCES.filter(m => !have.has(builtinDistanceId(m))).map(m => buildDistanceEntry(m)),
    ...BLOWGUN_MASTER_DISTANCES.filter(m => !have.has(builtinDistanceId(m))).map(m => buildBlowgunEntry(m)),
  ];
  if (missing.length === 0) return { list: list || [], changed: false };
  return { list: [...(list || []), ...missing].sort(compareDistances), changed: true };
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

/**
 * Wpis WŁASNY, dodany ręcznie w Ustawieniach.
 *
 * Id zawsze z zegara, także gdy metry pokrywają się ze standardowymi — drugi
 * wpis „18m" ma dostać własny kubełek, a nie przejąć historię pierwszego.
 *
 * [DYSCYPLINY] Dystans dziedziczy dyscyplinę po AKTYWNYM ZESTAWIE. Bez tego
 * dmuchawkarz, który dopisuje sobie 12 m z rury, zobaczyłby ten wpis potem
 * na liście łuczniczej — czyli dokładnie ten bałagan, który filtr usuwa.
 */
export function buildCustomDistanceEntry(
  m: string,
  label?: string,
  discipline?: string | null,
): UserDistance {
  const base = isBlowgun(discipline)
    ? buildBlowgunEntry(m)
    : buildDistanceEntry(m);
  return {
    ...base,
    id: newDistanceId(),
    active: true,
    ...(label ? { label } : {}),
  };
}

/**
 * [DYSCYPLINY] Wpis dmuchawkowy z listy standardowej.
 *
 * Świadomie NIE przechodzi przez `make` z `rebuildMasterList`, mimo że jest
 * wpisem standardowym. Tamte callbacki są łucznicze do szpiku — dobierają
 * tarczę z rekomendacji dla klasy łuku, a `SmartSeasonUpdater` ma regułę
 * „poniżej 50 m i compound → 80cm (6-Ring)". Puszczenie przez nie 5 m
 * z rury dałoby dmuchawkarzowi tarczę łuczniczą, której nawet nie ma
 * na jego liście wyboru.
 *
 * Wszystko, co user sam ustawił (nastawy, tarcza, aktywność), przeżywa
 * regenerację — tak samo jak przy wpisach łuczniczych.
 */
function buildBlowgunEntry(m: string, prev?: UserDistance): UserDistance {
  return {
    id: prev?.id || builtinDistanceId(m),
    m,
    ...(prev?.label ? { label: prev.label } : {}),
    discipline: 'blowgun',
    // 10 m aktywne z pudełka — inaczej user, który dopiero co przełączył
    // zestaw na rurę, wchodzi w start treningu i widzi PUSTĄ listę dystansów.
    // Dla łucznika ten wpis i tak nie istnieje: filtr dyscypliny go nie pokaże.
    active: prev ? prev.active : m === '10m',
    targetType: prev?.targetType || BLOWGUN_FACE_ID,
    sightExtension: prev?.sightExtension || '',
    sightHeight: prev?.sightHeight || '',
    sightSide: prev?.sightSide || '',
    sightMark: prev?.sightMark || '',
  };
}

/** Id wpisów standardowych — po nich poznajemy, czego regeneracja może dotknąć. */
const MASTER_IDS = new Set(
  [...MASTER_DISTANCES, ...BLOWGUN_MASTER_DISTANCES].map(builtinDistanceId),
);

/** Wpis dodany przez usera, nie pochodzący z listy standardowej. */
export const isCustomDistance = (d: UserDistance): boolean => !MASTER_IDS.has(d.id);

/** Ile wpisów własnych user już zużył (limit dotyczy TYLKO tych). */
export const countCustomDistances = (list: UserDistance[]): number =>
  (list || []).filter(isCustomDistance).length;

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
  // [DYSCYPLINY] Dmuchawka regeneruje się ZAWSZE, także dla czystego łucznika.
  // Lista dystansów jest jedna na użytkownika, a zestawów wolno mieć cztery —
  // więc nie da się z góry powiedzieć, że ktoś rury nie dotknie. Trzy wpisy
  // kosztują tyle co nic, a warunkowa regeneracja wiązałaby katalog dystansów
  // z zestawami sprzętowymi, o których ten plik świadomie nic nie wie.
  const blowgun = BLOWGUN_MASTER_DISTANCES.map(m => buildBlowgunEntry(m, byId.get(builtinDistanceId(m))));
  const customs = (existing || []).filter(isCustomDistance);
  return [...rebuilt, ...blowgun, ...customs].sort(compareDistances);
}

/**
 * [DYSCYPLINY] Dystanse pasujące do dyscypliny aktywnego zestawu.
 *
 * Bliźniak `selectableTargetIdsFor` z `config/targetFaces.ts` i z tego samego
 * powodu: do 2026-09-08 lista była wspólna, więc łucznik przewijał 5 i 7 m
 * z rury, a dmuchawkarz — dziesięć dystansów od 18 do 90 m, na których
 * nie odda ani jednego strzału. Etykiety („10m Blasrohr") to łagodziły,
 * ale nie zastępowały.
 *
 * Gdy dyscyplina jest nieznana (konto sprzed zestawów, profil jeszcze się
 * ładuje), pokazujemy wszystko — lepiej dać za dużo niż zablokować komuś
 * start treningu. Tak samo zachowuje się filtr tarcz.
 */
export const matchesDiscipline = (d: UserDistance, discipline?: string | null): boolean =>
  !discipline || (d.discipline === 'blowgun') === isBlowgun(discipline);

export function distancesFor(list: UserDistance[], discipline?: string | null): UserDistance[] {
  return (list || []).filter(d => matchesDiscipline(d, discipline));
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
