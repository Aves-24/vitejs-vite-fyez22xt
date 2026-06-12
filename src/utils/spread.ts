// Analiza rozrzutu grupy: kierunek grupowania (środek) + dominujący błąd (kształt).
// Współdzielone przez StatsView (pojedyncza sesja) i ProStatsView (ostatnie 3 treningi).

export interface SpreadResult {
  hKey: string;   // stats.pro.zones.left|right|center
  vKey: string;   // stats.pro.zones.up|down|center
  errorKey: string; // stats.pro.zones.symm|horiz|vert
}

const is3Spot = (targetType: string) =>
  targetType === '3-Spot' || targetType === 'Vertical 3-Spot' || targetType === '3-Spot (Vertical)';

// Środek tarczy dla danego dot — pełna tarcza = (150,150); 3-spot = najbliższy spot.
function centerFor(targetType: string, x: number, y: number): { cX: number; cY: number } {
  if (is3Spot(targetType)) {
    const cX = x < 150 ? 75 : 225;
    let cY = 333;
    if (y < 133) cY = 66;
    else if (y < 266) cY = 200;
    return { cX, cY };
  }
  return { cX: 150, cY: 150 };
}

function fromOffsets(dxArr: number[], dyArr: number[]): SpreadResult | null {
  if (dxArr.length === 0) return null;
  const avgDx = dxArr.reduce((a, b) => a + b, 0) / dxArr.length;
  const avgDy = dyArr.reduce((a, b) => a + b, 0) / dyArr.length;
  const varX = dxArr.reduce((a, b) => a + Math.pow(b - avgDx, 2), 0) / dxArr.length;
  const varY = dyArr.reduce((a, b) => a + Math.pow(b - avgDy, 2), 0) / dyArr.length;
  const stdX = Math.sqrt(varX);
  const stdY = Math.sqrt(varY);

  let hKey = 'stats.pro.zones.center';
  if (avgDx > 5) hKey = 'stats.pro.zones.right';
  if (avgDx < -5) hKey = 'stats.pro.zones.left';

  let vKey = 'stats.pro.zones.center';
  if (avgDy > 5) vKey = 'stats.pro.zones.down';
  if (avgDy < -5) vKey = 'stats.pro.zones.up';

  let errorKey = 'stats.pro.zones.symm';
  if (stdX > stdY * 1.3) errorKey = 'stats.pro.zones.horiz';
  if (stdY > stdX * 1.3) errorKey = 'stats.pro.zones.vert';

  return { hKey, vKey, errorKey };
}

// Pojedyncza sesja: jeden typ tarczy dla wszystkich serii.
export function calculateSpread(ends: any[], targetType: string): SpreadResult | null {
  const dxArr: number[] = [];
  const dyArr: number[] = [];
  ends.forEach(end => {
    end.dots?.forEach((dot: any) => {
      if (dot.x === null || dot.y === null || dot.x === undefined || dot.y === undefined) return;
      const { cX, cY } = centerFor(targetType, dot.x, dot.y);
      dxArr.push(dot.x - cX);
      dyArr.push(dot.y - cY);
    });
  });
  return fromOffsets(dxArr, dyArr);
}

// Wiele sesji (np. ostatnie 3 treningi): każdą centrujemy względem JEJ typu tarczy.
export function calculateSpreadSessions(sessions: Array<{ ends?: any[]; targetType?: string }>): SpreadResult | null {
  const dxArr: number[] = [];
  const dyArr: number[] = [];
  sessions.forEach(session => {
    const targetType = session.targetType || 'Full';
    session.ends?.forEach((end: any) => {
      end.dots?.forEach((dot: any) => {
        if (dot.x === null || dot.y === null || dot.x === undefined || dot.y === undefined) return;
        const { cX, cY } = centerFor(targetType, dot.x, dot.y);
        dxArr.push(dot.x - cX);
        dyArr.push(dot.y - cY);
      });
    });
  });
  return fromOffsets(dxArr, dyArr);
}
