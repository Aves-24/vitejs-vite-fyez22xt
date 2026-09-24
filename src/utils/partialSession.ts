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

/** "7/12" do znaczka na liscie sesji. */
export const partialLabel = (s: PartialInfo): string =>
  `${s.endsShot ?? '?'}/${s.endsPlanned ?? PLANNED_ENDS}`;
