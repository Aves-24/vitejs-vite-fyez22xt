// [C31] Trening przerwany przed koncem (np. 7 z 12 serii). Jego suma punktow
// nie jest porownywalna z pelnym treningiem, wiec sumy, krzywe wynikow
// i "srednia z 3 ostatnich" go pomijaja. Strzaly, XP i srednia na strzale
// licza sie dalej normalnie. Stare sesje nie maja flagi = pelne.

/** Trening w ScoringView to zawsze 2 rundy po 6 serii. */
export const PLANNED_ENDS = 12;

export interface PartialInfo {
  isPartial?: boolean;
  endsShot?: number;
  endsPlanned?: number;
}

export const isPartialSession = (s: PartialInfo | null | undefined): boolean => s?.isPartial === true;

/** Liczby serii do wyboru w Vorbereitung (12 = standard, 2 rundy po 6). */
export const SHORT_END_OPTIONS = [6, 8, 10] as const;

/**
 * Trening z gory zaplanowany jako krotszy (np. 6 serii) i ukonczony. Zapisuje
 * sie z ta sama flaga isPartial, bo jego suma tez nie jest porownywalna
 * z pelnym treningiem — sumy i krzywe zostaja czyste.
 */
export const isShortPlanned = (s: PartialInfo | null | undefined): boolean =>
  isPartialSession(s) && !!s?.endsPlanned && s.endsPlanned < PLANNED_ENDS && s.endsShot === s.endsPlanned;

/** "7/12" do znaczka na liscie sesji. */
export const partialLabel = (s: PartialInfo): string =>
  `${s.endsShot ?? '?'}/${s.endsPlanned ?? PLANNED_ENDS}`;
