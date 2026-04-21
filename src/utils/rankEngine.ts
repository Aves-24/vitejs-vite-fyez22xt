// ─────────────────────────────────────────────────────────────────────────────
// GROT-X "THE TARGET SERIES" — System Rang
// ─────────────────────────────────────────────────────────────────────────────

export interface RankDef {
  level: number;
  name: string;
  color: string;       // kolor wypełnienia odznaki
  border: string;      // kolor obramowania odznaki
  textColor: string;   // kolor cyfry na odznace
  xpThreshold: number;
  minAvg: number | null; // null = niewymagane (level 1–6)
}

export interface RankResult {
  level: number;
  rankName: string;
  color: string;
  border: string;
  textColor: string;
  rollingAvg: number;
  progress: number;    // % do następnego poziomu (0–100)
  xpToNext: number;
  nextRankName: string | null;
  nextRankMinAvg: number | null;
  totalXp: number;
}

export const TARGET_RANKS: RankDef[] = [
  { level: 1,  name: 'WHITE I',  color: '#F0F0F0', border: '#cccccc', textColor: '#555555', xpThreshold: 0,     minAvg: null },
  { level: 2,  name: 'WHITE II', color: '#F0F0F0', border: '#cccccc', textColor: '#555555', xpThreshold: 500,   minAvg: null },
  { level: 3,  name: 'BLACK I',  color: '#222222', border: '#444444', textColor: '#ffffff', xpThreshold: 1500,  minAvg: null },
  { level: 4,  name: 'BLACK II', color: '#222222', border: '#444444', textColor: '#ffffff', xpThreshold: 3000,  minAvg: null },
  { level: 5,  name: 'BLUE I',   color: '#0099FF', border: '#007acc', textColor: '#ffffff', xpThreshold: 6000,  minAvg: null },
  { level: 6,  name: 'BLUE II',  color: '#0099FF', border: '#007acc', textColor: '#ffffff', xpThreshold: 10000, minAvg: null },
  { level: 7,  name: 'RED I',    color: '#FF3300', border: '#cc2900', textColor: '#ffffff', xpThreshold: 18000, minAvg: 7.8  },
  { level: 8,  name: 'RED II',   color: '#FF3300', border: '#cc2900', textColor: '#ffffff', xpThreshold: 30000, minAvg: 8.2  },
  { level: 9,  name: 'GOLD I',   color: '#FFCC00', border: '#e0a800', textColor: '#7a5c00', xpThreshold: 50000, minAvg: 8.8  },
  { level: 10, name: 'GOLD II',  color: '#FFCC00', border: '#e0a800', textColor: '#7a5c00', xpThreshold: 80000, minAvg: 9.2  },
];

/**
 * XP za jedną sesję:
 *   sessionXp = (strzały × 1) + (średnia × 10)
 */
export function calculateSessionXp(arrows: number, score: number): number {
  if (arrows <= 0) return 0;
  const avg = score / arrows;
  return Math.round(arrows * 1 + avg * 10);
}

/**
 * Główna funkcja wyznaczania rangi.
 *
 * @param totalXp        - całkowite skumulowane XP użytkownika
 * @param last10Avgs     - tablica max 10 ostatnich śr. punktowych (score/arrows) per sesja
 *
 * Logika:
 *  - Poziomy 1–6: stałe — wystarczy XP
 *  - Poziomy 7–10: dynamiczne — XP + rollingAvg (śr. z last10Avgs) >= minAvg
 *  - Iterujemy przez rangi w kolejności; przerywamy gdy XP niewystarczające LUB
 *    (poziom >= 7 i rollingAvg < minAvg). Ranga = ostatnia spełniona.
 */
export function calculateRank(totalXp: number, last10Avgs: number[]): RankResult {
  const valid = last10Avgs.filter(a => a > 0);
  const rollingAvg = valid.length > 0
    ? Math.round((valid.reduce((s, a) => s + a, 0) / valid.length) * 100) / 100
    : 0;

  let finalRank = TARGET_RANKS[0];

  for (const rank of TARGET_RANKS) {
    if (totalXp < rank.xpThreshold) break;
    if (rank.minAvg !== null && rollingAvg < rank.minAvg) break;
    finalRank = rank;
  }

  // nextRank: level jest 1-indexed, TARGET_RANKS tablica 0-indexed
  // więc TARGET_RANKS[finalRank.level] = element o level = finalRank.level + 1
  const nextRank: RankDef | undefined = TARGET_RANKS[finalRank.level];

  let progress = 100;
  let xpToNext = 0;

  if (nextRank) {
    const range = nextRank.xpThreshold - finalRank.xpThreshold;
    const earned = totalXp - finalRank.xpThreshold;
    progress = Math.min(100, Math.max(0, Math.round((earned / range) * 100)));
    xpToNext = Math.max(0, nextRank.xpThreshold - totalXp);
  }

  return {
    level: finalRank.level,
    rankName: finalRank.name,
    color: finalRank.color,
    border: finalRank.border,
    textColor: finalRank.textColor,
    rollingAvg,
    progress,
    xpToNext,
    nextRankName: nextRank?.name ?? null,
    nextRankMinAvg: nextRank?.minAvg ?? null,
    totalXp,
  };
}

/**
 * Tygodniowa aktualizacja rang (dla użytkowników poziom 7+).
 * Wywołana z admin panelu lub auto w niedzielę.
 *
 * @param userDoc - obiekt z pola users/{id} zawierający xp, last10Avgs, level
 * @returns nowy RankResult lub null jeśli ranga się nie zmieniła
 */
export function recalcUserRank(userDoc: any): RankResult | null {
  const xp = userDoc.xp || 0;
  const last10Avgs: number[] = userDoc.last10Avgs || [];
  const result = calculateRank(xp, last10Avgs);
  if (result.level !== (userDoc.level || 1)) return result;
  return null; // bez zmiany
}
