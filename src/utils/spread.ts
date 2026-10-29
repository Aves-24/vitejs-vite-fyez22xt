import { isSpotFace, resolveTargetFace } from '../config/targetFaces';

// Analiza rozrzutu grupy: kierunek grupowania (środek) + dominujący błąd (kształt).
// Współdzielone przez StatsView (pojedyncza sesja) i ProStatsView (ostatnie 3 treningi).

export interface SpreadResult {
  hKey: string;   // stats.pro.zones.left|right|center
  vKey: string;   // stats.pro.zones.up|down|center
  errorKey: string; // stats.pro.zones.symm|horiz|vert
}

const is3Spot = (targetType: string) => isSpotFace(targetType);

// Środek tarczy dla danego dot — pełna tarcza = (150,150); 3-spot = najbliższy spot.
// Eksportowane, bo kierunek strzały (godzina) liczy się względem TEGO środka —
// bez tego każda strzała na dolnym spocie wychodziłaby „na szóstej”.
export function centerFor(targetType: string, x: number, y: number): { cX: number; cY: number } {
  if (is3Spot(targetType)) {
    const cX = x < 150 ? 75 : 225;
    let cY = 333;
    if (y < 133) cY = 66;
    else if (y < 266) cY = 200;
    return { cX, cY };
  }
  return { cX: 150, cY: 150 };
}

/** Szerokość pierścienia w jednostkach SVG — jak ringScale (arrowStats), bez importu w kółko. */
const ringUnit = (targetType: string): number =>
  isSpotFace(targetType) ? 12.5 : (resolveTargetFace(targetType).scoringRingStep || 15);

/** Do środka (w pierścieniach) grupa jest „Mitte” — jak GROUP_CENTER_RINGS w groupStats. */
const CENTER_RINGS = 0.3;
const AXIS_RATIO = 1.3;

const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Przesunięcia w pierścieniach (x w prawo, y w dół).
function fromOffsets(dxArr: number[], dyArr: number[]): SpreadResult | null {
  if (dxArr.length === 0) return null;
  const mx = median(dxArr);
  const my = median(dyArr);
  const sx = Math.sqrt(dxArr.reduce((a, b) => a + (b - mx) ** 2, 0) / dxArr.length);
  const sy = Math.sqrt(dyArr.reduce((a, b) => a + (b - my) ** 2, 0) / dyArr.length);

  const hKey = Math.abs(mx) < CENTER_RINGS ? 'stats.pro.zones.center' : mx > 0 ? 'stats.pro.zones.right' : 'stats.pro.zones.left';
  const vKey = Math.abs(my) < CENTER_RINGS ? 'stats.pro.zones.center' : my > 0 ? 'stats.pro.zones.down' : 'stats.pro.zones.up';
  const errorKey = sx > sy * AXIS_RATIO ? 'stats.pro.zones.horiz' : sy > sx * AXIS_RATIO ? 'stats.pro.zones.vert' : 'stats.pro.zones.symm';
  return { hKey, vKey, errorKey };
}

// Wiele sesji (np. ostatnie 3 treningi): każdą centrujemy względem JEJ typu tarczy
// i przeliczamy na pierścienie tej tarczy, żeby 122 cm i 3-Spot dało się zsumować.
export function calculateSpreadSessions(sessions: Array<{ ends?: any[]; targetType?: string }>): SpreadResult | null {
  const dxArr: number[] = [];
  const dyArr: number[] = [];
  sessions.forEach(session => {
    const targetType = session.targetType || 'Full';
    const unit = ringUnit(targetType);
    session.ends?.forEach((end: any) => {
      end.dots?.forEach((dot: any) => {
        if (dot.x === null || dot.y === null || dot.x === undefined || dot.y === undefined || dot.bad) return;
        const { cX, cY } = centerFor(targetType, dot.x, dot.y);
        dxArr.push((dot.x - cX) / unit);
        dyArr.push((dot.y - cY) / unit);
      });
    });
  });
  return fromOffsets(dxArr, dyArr);
}
