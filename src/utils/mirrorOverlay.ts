import type { TechShot } from '../views/DelayMirrorSeries';
import { seriesTargetViewBox } from '../views/DelayMirrorSeriesTarget';
import { mirrorShotColor } from './mirrorArrowColors';

// Nakladka Delay Mirror rysowana w canvasie: tarcza ze strzalami, notatka do
// strzalu i os czasu ze znacznikami. Wspolna dla eksportu klipu
// (DelayMirrorExport) i stopklatki (DelayMirrorReplay) — zdjecie ma wygladac
// dokladnie jak klatka z wypalonego klipu.

const GOLD = '#fed33e';
// Obwodka aktywnej strzaly NA TARCZY musi byc kolorem, ktorego nie ma na
// zadnym polu tarczy WA (zloto/zolty, czerwony, niebieski, czarny, bialy) —
// inaczej strzala w dziesiatce dostaje zolta obwodke na zoltym tle i znika.
// Reszta nakladki (pasek czasu, znaczniki) zostaje na GOLD — tam nie stoi
// na tle pierscieni tarczy, wiec problem tam nie wystepuje.
const HIGHLIGHT = '#4ade80';

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

/** Tarcza jedzie do canvasa jako obrazek z tego samego SVG, ktore widac
 *  w aplikacji — zero drugiego renderera do rozjechania sie. `holder` to
 *  ukryta instancja DelayMirrorSeriesTarget BEZ podswietlenia, zeby
 *  serializowany SVG byl deterministyczny. */
export async function loadTargetImage(holder: HTMLElement | null, targetType: string): Promise<HTMLImageElement | null> {
  const svgNode = holder?.querySelector('svg');
  if (!svgNode) return null;
  const clone = svgNode.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute('class');
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const vb = seriesTargetViewBox(targetType);
  clone.setAttribute('width', String(vb.w));
  clone.setAttribute('height', String(vb.h));
  const svgUrl = 'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(new XMLSerializer().serializeToString(clone));
  return new Promise<HTMLImageElement | null>(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = svgUrl;
  });
}

export type ClipSeg = { start: number; end: number };

/** Strzal, ktorego notatka obowiazuje w chwili `now`: ostatni oznaczony
 *  strzal, ktory juz padl. Notatka trwa do nastepnego strzalu. */
export function noteShotAt(shots: TechShot[], now: number): TechShot | null {
  let cur: TechShot | null = null;
  shots
    .filter(s => s.tMs !== null)
    .sort((a, b) => (a.tMs as number) - (b.tMs as number))
    .forEach(s => { if ((s.tMs as number) / 1000 <= now + 0.05) cur = s; });
  return cur;
}

/** Zakres minus wyciete fragmenty = kawalki, ktore ida do klipu. */
export function keepSegments(range: ClipSeg, cuts: ClipSeg[]): ClipSeg[] {
  const out: ClipSeg[] = [];
  let pos = range.start;
  cuts
    .filter(c => c.end > range.start && c.start < range.end)
    .sort((a, b) => a.start - b.start)
    .forEach(c => {
      if (c.start > pos) out.push({ start: pos, end: Math.min(c.start, range.end) });
      pos = Math.max(pos, c.end);
    });
  if (pos < range.end) out.push({ start: pos, end: range.end });
  return out.filter(g => g.end - g.start > 0.05);
}

/** Czas oryginalu -> czas klipu sklejonego z kawalkow (null = wyciete). */
export function keptTime(segs: ClipSeg[], t: number): number | null {
  let acc = 0;
  for (const g of segs) {
    if (t < g.start) return null;
    if (t <= g.end) return acc + (t - g.start);
    acc += g.end - g.start;
  }
  return null;
}

interface OverlayOpts {
  W: number;
  H: number;
  /** Czas w ORYGINALNYM klipie (s) — od niego zaleza aktywna strzala i notatka. */
  now: number;
  targetImg: HTMLImageElement | null;
  targetType: string | null;
  shots: TechShot[];
  // Notatki sa jedynym PRO gate w Delay Mirror — sprawdzane tutaj, nie tylko
  // w UI edycji (subskrypcja mogla wygasnac po zapisaniu notatek).
  isPremium: boolean;
  /** Os czasu: kawalki oryginalu, ktore ida do klipu (wycinek minus
   *  wyciete fragmenty). null = bez osi (stopklatka). */
  bar: ClipSeg[] | null;
}

export function drawMirrorOverlay(ctx: CanvasRenderingContext2D, o: OverlayOpts) {
  const { W, H, now, targetImg, targetType, shots, isPremium, bar } = o;

  // Panel tarczy w gornym prawym rogu — po przekatnej od znaku GROT-X,
  // ktory siedzi w pliku w prawym dolnym.
  const pad = Math.round(Math.min(W, H) * 0.035);
  const barX = pad;
  const barW = Math.round(W * 0.62);
  const barY = H - pad - Math.round(Math.min(W, H) * 0.02);
  const barH = Math.max(3, Math.round(Math.min(W, H) * 0.008));
  const pinR = Math.max(6, Math.round(Math.min(W, H) * 0.018));

  const marked = shots.filter(s => s.tMs !== null);
  const byTime = marked.slice().sort((a, b) => (a.tMs as number) - (b.tMs as number));
  let activeN: number | null = null;
  byTime.forEach(s => { if ((s.tMs as number) / 1000 <= now + 0.05) activeN = s.n; });

  // Notatka do strzalu N widoczna PO nim (user 2026-11-04): od momentu
  // strzalu N do strzalu N+1 (ostatnia — do konca klipu).
  const noteShot = noteShotAt(shots, now);

  if (targetImg && targetType) {
    const vb = seriesTargetViewBox(targetType);
    // 0.32 szerokosci kadru (bylo 0.26) — na telefonie ok. pol centymetra
    // wiecej tarczy w gotowym klipie i na stopklatce (user 2026-11-04).
    // Limit wysokosci: wysoki 3-Spot w klipie poziomym zajalby prawie caly kadr.
    const panelW = Math.round(Math.min(W * 0.32, H * 0.6 * (vb.w / vb.h)));
    const panelH = Math.round(panelW * (vb.h / vb.w));
    const panelX = W - pad - panelW;
    const panelY = pad;

    // Podklad panelu — bez niego biala tarcza na jasnym tle traci krawedz.
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, panelX - 6, panelY - 6, panelW + 12, panelH + 12, 14);
    ctx.restore();
    ctx.drawImage(targetImg, panelX, panelY, panelW, panelH);

    // Obwodka aktywnej strzaly rysowana w canvasie, a nie w SVG:
    // dzieki temu obrazek tarczy serializujemy RAZ, a nie co klatke.
    if (activeN !== null) {
      const s = shots.find(x => x.n === activeN);
      if (s) {
        const sx = panelX + ((s.x - vb.x) / vb.w) * panelW;
        const sy = panelY + ((s.y - vb.y) / vb.h) * panelH;
        ctx.save();
        ctx.strokeStyle = HIGHLIGHT;
        ctx.lineWidth = Math.max(2, panelW * 0.012);
        ctx.beginPath();
        ctx.arc(sx, sy, panelW * 0.045, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // Notatka do strzalu (np. "Arm zu hoch") — user chcial ja NAD
  // paskiem postepu (dol kadru), nie w gornym lewym rogu. X
  // wyrownany z barX, Y nad pinami znacznikow (pinR*2 daje im
  // zapas, zeby capsula nie nachodzila na numerki na pasku).
  if (isPremium && noteShot && noteShot.note) {
    const note = noteShot.note;
    ctx.save();
    ctx.font = `700 ${Math.round(pad * 0.9)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const textW = ctx.measureText(note).width;
    const boxPadX = pad * 0.7;
    const boxH = pad * 1.9;
    const boxW = textW + boxPadX * 2;
    const noteY = barY - boxH - Math.round(pinR * 2 + pad * 0.4);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, barX, noteY, boxW, boxH, boxH / 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(note, barX + boxPadX, noteY + boxH / 2 + 1);
    ctx.restore();
  }

  // Os czasu ze znacznikami — tylko gdy w wycinku cokolwiek oznaczono.
  // Liczona od poczatku WYCINKA, nie oryginalu.
  if (!bar || bar.length === 0) return;
  const dur = bar.reduce((sum, g) => sum + (g.end - g.start), 0);
  const inRange = marked.filter(s => keptTime(bar, (s.tMs as number) / 1000) !== null);
  if (dur <= 0 || inRange.length === 0) return;
  // Os liczona po SKLEJONYM klipie — wyciete kawalki na niej nie istnieja.
  let lastKept = 0;
  const frac = (t: number) => {
    const k = keptTime(bar, t);
    if (k !== null) lastKept = k;
    return Math.max(0, Math.min(1, (k ?? lastKept) / dur));
  };
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.fillStyle = GOLD;
  roundRect(ctx, barX, barY, Math.max(barH, barW * frac(now)), barH, barH / 2);
  inRange.forEach(s => {
    const px = barX + barW * frac((s.tMs as number) / 1000);
    const on = s.n === activeN;
    // [KOLORY STRZAŁ] Pin w kolorze strzały; aktywny dostaje złotą obwódkę.
    const ac = mirrorShotColor(s.n);
    ctx.beginPath();
    ctx.fillStyle = ac ? ac.hex : on ? GOLD : '#ffffff';
    ctx.arc(px, barY + barH / 2, on ? pinR * 1.25 : pinR, 0, Math.PI * 2);
    ctx.fill();
    if (ac) {
      ctx.strokeStyle = on ? GOLD : 'rgba(0,0,0,0.5)';
      ctx.lineWidth = on ? Math.max(2, pinR * 0.3) : 1;
      ctx.stroke();
    }
    ctx.fillStyle = ac ? ac.text : '#0a3a2a';
    ctx.font = `900 ${Math.round(pinR * 1.2)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(s.n), px, barY + barH / 2 + 1);
  });
  ctx.restore();
}
