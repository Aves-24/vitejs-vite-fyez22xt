import { BowType } from './archeryRules';

/**
 * Id pierwszego (i do 2026-09-01 jedynego) zestawu.
 *
 * Stała mieszka TUTAJ, a `utils/setupStamp.ts` ją re-eksportuje — nie odwrotnie.
 * Powód: ten plik to czysty config bez zależności, a `setupStamp` importuje
 * `firebase`, więc odwrotny kierunek ciągnąłby inicjalizację App Check do
 * każdego miejsca, które chce tylko typ zestawu.
 */
export const DEFAULT_SETUP_ID = 'default';

/**
 * [ZESTAWY] Model zestawu sprzętowego — etap 1 (fundament).
 *
 * Do tej pory sprzęt leżał PŁASKO na `users/{uid}`: `bowType`, `lbs`, `riser`,
 * `limbs`, `stabilizers`, `sight`. Jeden użytkownik = jeden komplet sprzętu.
 * Kto strzela z dwóch łuków, nadpisywał sobie ustawienia w kółko.
 *
 * Zestawy siedzą w TABLICY na dokumencie użytkownika, nie w podkolekcji —
 * świadomie. Trener już dziś czyta cały `users/{uid}` i widzi sprzęt ucznia;
 * przeniesienie do podkolekcji odebrałoby mu ten wgląd po cichu, a to zmiana
 * produktowa, której nikt nie zamawiał. Lista ma sufit 4 pozycji (PRO), więc
 * dokument nie spuchnie.
 *
 * UWAGA RODO: cokolwiek ma zostać przed trenerem ukryte, NIE może tu trafić —
 * idzie do `users/{uid}/private/` (ścieżka istnieje, trzyma już datę urodzenia).
 */

/**
 * [DMUCHAWKA] Dmuchawka jest DYSCYPLINĄ, nie klasą łuku.
 *
 * Celowo NIE rozszerzamy `BowType` w `archeryRules.ts` — tamten typ karmi
 * rekomendacje dystansów, regulaminy i kreator profilu, a dla dmuchawki
 * nic z tego nie ma sensu. Zamiast tego zestaw ma szerszy typ `Discipline`,
 * a stare, płaskie `bowType` na użytkowniku dostaje wartość tylko wtedy,
 * gdy dyscyplina naprawdę jest klasą łuku.
 */
export const BLOWGUN_DISCIPLINE = 'Dmuchawka (Blasrohr)' as const;
export type Discipline = BowType | typeof BLOWGUN_DISCIPLINE;

export function isBlowgun(d?: string | null): boolean {
  return d === BLOWGUN_DISCIPLINE;
}

/** Zawęża dyscyplinę do klasy łuku — `null`, gdy to dmuchawka. */
export function asBowType(d?: string | null): BowType | null {
  return !d || isBlowgun(d) ? null : (d as BowType);
}

/**
 * Podzakładki, które NIE dotyczą dmuchawki. Rura i strzałki to nie łuk:
 * nie ma majdanu, ramion, cięciwy ani stabilizacji.
 */
export const SUBTABS_HIDDEN_FOR_BLOWGUN = ['bow', 'string', 'stabilization'] as const;

/** Ile zestawów wolno trzymać. */
export const SETUP_LIMIT_FREE = 1;
export const SETUP_LIMIT_PRO = 4;

export function setupLimitFor(isPremium: boolean): number {
  return isPremium ? SETUP_LIMIT_PRO : SETUP_LIMIT_FREE;
}

/**
 * Podzakładki SPRZĘTU. Kolejność jest kolejnością w UI.
 * Dla dmuchawki część z nich znika — patrz `SUBTABS_HIDDEN_FOR_BLOWGUN`.
 */
export const SETUP_SUBTABS = ['archer', 'bow', 'string', 'arrows', 'sight', 'stabilization'] as const;
export type SetupSubtab = typeof SETUP_SUBTABS[number];

export interface SetupArcher {
  /** Długość naciągu w calach. Jedyne pole przeniesione z martwego ProfileView. */
  drawLength?: number;
}

export interface SetupBow {
  riser?: string;
  limbs?: string;
  /** Siła w funtach — historycznie `lbs` na użytkowniku. */
  lbs?: number;
}

export interface SetupString {
  model?: string;
  strands?: string;
  nockingPoint?: string;
}

export interface SetupArrows {
  model?: string;
  spine?: string;
  length?: string;
}

export interface SetupSight {
  model?: string;
}

export interface SetupStabilization {
  /** Historycznie jedno pole tekstowe `stabilizers` na użytkowniku. */
  description?: string;
}

export interface EquipmentSetup {
  /**
   * Pierwszy zestaw MUSI mieć id `'default'`. Sesje są stemplowane od 2026-09-01
   * (`setupStamp.ts`) i wszystkie dotychczasowe niosą `setupId: 'default'` —
   * inne id osierociłoby całą dotychczasową historię.
   */
  id: string;
  name: string;
  /**
   * Klasa sprzętu. W etapie 4 pole zmienia znaczenie na „dyscyplina"
   * i przyjmie też dmuchawkę — dlatego typ jest tu osobno, a nie `BowType`
   * wprost w sygnaturach.
   */
  discipline: Discipline;
  archer?: SetupArcher;
  bow?: SetupBow;
  string?: SetupString;
  arrows?: SetupArrows;
  sight?: SetupSight;
  stabilization?: SetupStabilization;
  /** Notatka użytkownika, limit 100 znaków (egzekwowany w UI i w regułach). */
  note?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const SETUP_NOTE_MAX = 100;

/** Kształt starego, płaskiego zapisu sprzętu na `users/{uid}`. */
export interface LegacyEquipmentFields {
  bowType?: string;
  lbs?: number;
  riser?: string;
  limbs?: string;
  stabilizers?: string;
  sight?: string;
  drawLength?: number;
}

/**
 * Dokument `users/{uid}` w zakresie, który obchodzi zestawy.
 * Firestore oddaje `DocumentData` (czyli `any` pod spodem), więc zawężamy tu
 * do tego, co faktycznie czytamy — reszta pól dokumentu nas nie interesuje.
 */
export type UserDocLike =
  | (LegacyEquipmentFields & { setups?: EquipmentSetup[]; activeSetupId?: string })
  | null
  | undefined;

const DEFAULT_DISCIPLINE: Discipline = 'Klasyczny (Recurve)';

/**
 * Usuwa klucze o wartości `undefined` — Firestore ich NIE przyjmuje i wywala
 * cały `setDoc` błędem `invalid-argument`. Puste podsekcje (np. zestaw bez
 * cięciwy) i wyczyszczone pola liczbowe produkują dokładnie takie klucze,
 * więc bez tego zapis zestawu pada.
 */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(v => stripUndefined(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

/** Zestawy gotowe do zapisu w Firestore. Wołać ZAWSZE przed `setDoc`. */
export function sanitizeSetups(setups: EquipmentSetup[]): EquipmentSetup[] {
  return stripUndefined(setups);
}

/** Puste stringi nie trafiają do bazy — inaczej „brak danych" wygląda jak dane. */
function clean<T extends object>(obj: T): T | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return Object.keys(out).length > 0 ? (out as T) : undefined;
}

/**
 * Buduje zestaw #1 ze starych, płaskich pól użytkownika.
 *
 * NIE kasuje pól źródłowych — stare `bowType`/`lbs`/… zostają na dokumencie
 * nietknięte. Dopóki tam są, każdy błąd migracji jest odwracalny, a kod sprzed
 * zestawów (np. wersja w cache przeglądarki użytkownika) dalej działa.
 * Sprzątanie dopiero, gdy zestawy odleżą swoje na produkcji.
 */
export function buildSetupFromLegacy(
  legacy: LegacyEquipmentFields,
  // Fallback tylko dla wywołań bez dostępu do i18n — UI zawsze podaje własną.
  name = 'Setup 1',
): EquipmentSetup {
  const discipline = (legacy.bowType as Discipline) || DEFAULT_DISCIPLINE;
  const now = new Date().toISOString();

  // Cięciwy nie było w aplikacji w ogóle, a zakładka STRZAŁY miała inputy bez
  // `value`/`onChange` — obu sekcji nie ma czego wypełniać. Klucze o wartości
  // `undefined` są tu usuwane, bo Firestore odrzuca cały zapis, gdy je zobaczy.
  return stripUndefined({
    id: DEFAULT_SETUP_ID,
    name,
    discipline,
    archer: clean({ drawLength: legacy.drawLength }),
    bow: clean({ riser: legacy.riser, limbs: legacy.limbs, lbs: legacy.lbs }),
    sight: clean({ model: legacy.sight }),
    stabilization: clean({ description: legacy.stabilizers }),
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Czy dokument użytkownika wymaga migracji.
 * Idempotentne: gdy `setups` już jest niepuste, nie ruszamy niczego.
 */
export function needsSetupMigration(userData: UserDocLike): boolean {
  if (!userData) return false;
  return !Array.isArray(userData.setups) || userData.setups.length === 0;
}

/**
 * Zwraca pola do dopisania (merge) na `users/{uid}`, albo `null` gdy nie ma
 * czego migrować. Wołający robi `setDoc(..., { merge: true })`.
 */
export function buildMigrationPayload(
  userData: UserDocLike,
  /**
   * Nazwa zestawu #1. Wołający podaje ją przetłumaczoną — inaczej Niemiec
   * dostaje w interfejsie polskie „Mój zestaw" (złapane na żywo 2026-09-04).
   */
  name?: string,
): { setups: EquipmentSetup[]; activeSetupId: string } | null {
  if (!needsSetupMigration(userData)) return null;
  return {
    setups: [buildSetupFromLegacy(userData ?? {}, name)],
    activeSetupId: DEFAULT_SETUP_ID,
  };
}

/** Aktywny zestaw, z sensownym zachowaniem gdy `activeSetupId` wskazuje w pustkę. */
export function resolveActiveSetup(userData: UserDocLike): EquipmentSetup | null {
  const setups = Array.isArray(userData?.setups) ? userData.setups : [];
  if (setups.length === 0) return null;
  return setups.find(s => s.id === userData?.activeSetupId) ?? setups[0];
}
