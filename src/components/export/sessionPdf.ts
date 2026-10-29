import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { TFunction } from 'i18next';
import { getStats } from '../../utils/endStats';
import { groupStats, GROUP_CENTER_RINGS } from '../../utils/groupStats';
import { directionKey } from '../../utils/arrowStats';
import { countBad } from '../../utils/badShots';
import { handicapOfSession } from '../../utils/rankEngine';
import { arrowColorAt } from '../../config/arrowColors';
import { isFullFace, isSpotFace, friendlyTargetName } from '../../config/targetFaces';
import { sessionDistanceLabel } from '../../config/distances';

/**
 * [PDF 2026-10-29] Raport treningu w układzie nowego podsumowania: nagłówek
 * z wynikiem, tabele rund (kolory pól jak tarcza), Bilanz, Trainings-Trend,
 * Trefferbild z grupą i miejsce na notatki — jedna strona A4.
 *
 * Czcionka Roboto (self-hosted) — bez znaków spoza niej: „⌀” zamieniamy na „Ø”,
 * strzałki ▲▼ na +/−.
 */

type RGB = [number, number, number];
const FOREST: RGB = [10, 58, 42];
const GREY: RGB = [110, 120, 115];
const LINE: RGB = [225, 230, 228];
const GOLD: RGB = [254, 211, 62];

// Kolory pól i tarczy „przygaszone” jak w aplikacji (70% krycia na białym).
const RING = {
  white: [255, 255, 255] as RGB,
  black: [112, 112, 112] as RGB,
  blue: [109, 166, 242] as RGB,
  red: [241, 137, 137] as RGB,
  gold: [246, 217, 129] as RGB,
};
const cellFill = (v: string): RGB => {
  if (v === 'X' || v === '10' || v === '9') return [250, 232, 170];
  if (v === '8' || v === '7') return [248, 196, 196];
  if (v === '6' || v === '5') return [190, 214, 248];
  if (v === '4' || v === '3') return [160, 160, 160];
  if (v === 'M') return [196, 180, 214];
  return [255, 255, 255];
};
const hexRgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const clean = (s: string) => s.replace(/⌀/g, 'Ø').replace(/▲/g, '+').replace(/▼/g, '−').replace(/★/g, '');

export interface SessionPdfOptions {
  t: TFunction;
  lang: string;
  roundSize: number;
  targetType: string;
  sightHint?: boolean;
  note?: string;
}

export function buildSessionPdf(doc: jsPDF, session: any, o: SessionPdfOptions): void {
  const { t } = o;
  const ends: any[] = session.ends || [];
  const all = getStats(ends);
  const avg = all.count ? all.score / all.count : 0;
  const num = (v: number, d = 2) => v.toLocaleString(o.lang, { minimumFractionDigits: d, maximumFractionDigits: d });
  const L = 12, R = 198;                 // marginesy strony
  const colL = L, colLW = 100;           // lewa kolumna: tabele
  const colR = 120, colRW = R - 120;     // prawa: Bilanz, trend, tarcza

  // --- NAGŁÓWEK ---
  doc.setFont('Roboto', 'bold'); doc.setFontSize(18); doc.setTextColor(...FOREST);
  doc.text('GROT-X', L, 18);
  doc.setFontSize(10); doc.setFont('Roboto', 'normal'); doc.setTextColor(...GREY);
  doc.text(t('export.pdfScorecard', 'Karta Wyników'), L + 30, 18);
  const meta = [session.date, sessionDistanceLabel(session), friendlyTargetName(o.targetType, o.targetType), `${all.count} ${t('common.arrows')}`].filter(Boolean).join('  ·  ');
  doc.setFontSize(9); doc.text(meta, L, 25);
  // Wynik po prawej, żółta plakietka jak „Gesamtringzahl”
  doc.setFillColor(...GOLD); doc.roundedRect(R - 52, 9, 52, 20, 3, 3, 'F');
  doc.setFont('Roboto', 'bold'); doc.setTextColor(...FOREST);
  doc.setFontSize(22); doc.text(String(all.score), R - 4, 22, { align: 'right' });
  doc.setFontSize(7); doc.text(`Ø ${num(avg)}  ·  X/10/9 ${all.x}/${all.t}/${all.n}`, R - 48, 26);
  doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(L, 31, R, 31);

  // --- LEWA KOLUMNA: TABELE RUND ---
  let yL = 36;
  const rounds = [ends.slice(0, o.roundSize), ends.slice(o.roundSize)].filter(r => r.length);
  rounds.forEach((round, ri) => {
    const start = ri === 0 ? 0 : o.roundSize;
    let run = 0;
    const body = round.map((e: any, i: number) => {
      run += e.total_sum || 0;
      const arr: string[] = e.arrows || [];
      return [String(start + i + 1), ...Array.from({ length: 6 }, (_, k) => arr[k] || ''), String(e.total_sum ?? ''), String(run)];
    });
    const st = getStats(round);
    autoTable(doc, {
      startY: yL,
      margin: { left: colL },
      tableWidth: colLW,
      theme: 'grid',
      styles: { font: 'Roboto', fontSize: 8, cellPadding: 1.4, halign: 'center', lineColor: LINE, lineWidth: 0.1, textColor: [30, 30, 30] },
      headStyles: { fillColor: FOREST, textColor: [255, 255, 255], fontStyle: 'bold' },
      head: [
        [{ content: `${t('export.pdfRound', 'Runda')} ${ri + 1}`, colSpan: 7, styles: { halign: 'left' } }, { content: `${st.score}`, colSpan: 2, styles: { halign: 'right' } }],
        ['P', '1', '2', '3', '4', '5', '6', t('export.pdfSum', 'Suma'), t('export.pdfTotal', 'Wynik')],
      ],
      body,
      columnStyles: { 0: { textColor: GREY, cellWidth: 9 }, 7: { fontStyle: 'bold', cellWidth: 14 }, 8: { fontStyle: 'bold', cellWidth: 14 } },
      didParseCell: (d: any) => {
        if (d.section === 'body' && d.column.index >= 1 && d.column.index <= 6) d.cell.styles.fillColor = cellFill(String(d.cell.raw || ''));
      },
    });
    yL = (doc as any).lastAutoTable.finalY + 2;
    doc.setFont('Roboto', 'normal'); doc.setFontSize(7); doc.setTextColor(...GREY);
    doc.text(`X/10/9 ${st.x}/${st.t}/${st.n}   ·   Ø ${st.avg}   ·   ${st.count} ${t('common.arrows')}`, colL, yL + 2.5);
    yL += 7;
  });

  // --- PRAWA KOLUMNA: BILANZ ---
  let yR = 36;
  const label = (txt: string, y: number) => { doc.setFont('Roboto', 'bold'); doc.setFontSize(7); doc.setTextColor(...GREY); doc.text(txt.toUpperCase(), colR, y); };
  const value = (txt: string, y: number, color: RGB = FOREST) => { doc.setFont('Roboto', 'bold'); doc.setFontSize(9); doc.setTextColor(...color); doc.text(clean(txt), R, y, { align: 'right' }); };
  doc.setFont('Roboto', 'bold'); doc.setFontSize(10); doc.setTextColor(...FOREST);
  doc.text(t('scoring.bilanz.title'), colR, yR); yR += 6;

  const r1 = getStats(ends.slice(0, o.roundSize));
  const r2 = getStats(ends.slice(o.roundSize));
  label(t('scoring.bilanz.rounds'), yR);
  const diff = r2.count && r1.count === r2.count ? r2.score - r1.score : null;
  value(`R1 ${r1.score}${r2.count ? `   R2 ${r2.score}` : ''}${diff ? `   (${diff > 0 ? '+' : '−'}${Math.abs(diff)})` : ''}`, yR); yR += 5.5;

  const hc = handicapOfSession({ score: all.score, scoreArrows: all.count, distance: session.distance, targetType: o.targetType, bowClass: session.bowClass });
  if (hc !== null) { label(t('scoring.bilanz.handicap'), yR); value(String(hc), yR); yR += 5.5; }

  const sums = ends.map(e => e.total_sum || 0);
  if (sums.length >= 3) {
    const mean = sums.reduce((a, b) => a + b, 0) / sums.length;
    const sd = Math.sqrt(sums.reduce((a, b) => a + (b - mean) ** 2, 0) / sums.length);
    const steady = sd <= 2 ? 'steadyHigh' : sd <= 4 ? 'steadyMid' : 'steadyLow';
    label(t('scoring.bilanz.ends'), yR); value(`${Math.min(...sums)}–${Math.max(...sums)} · ${t(`scoring.bilanz.${steady}`)}`, yR); yR += 5.5;
  }
  const bad = countBad(ends);
  if (bad > 0) { label(t('scoring.badShot.label'), yR); value(`${bad} · ${t('scoring.badShot.excluded')}`, yR, [200, 40, 40]); yR += 5.5; }
  if (session.focusResult && session.focus?.text) {
    label(t('scoring.focusResult.title'), yR); value(t(`scoring.focusResult.short.${session.focusResult}`), yR); yR += 5.5;
  }

  // Ringverteilung: pasek + legenda
  label(t('scoring.bilanz.hits'), yR); yR += 2;
  const order = ['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'M'];
  const counts = new Map<string, number>();
  ends.forEach(e => (e.arrows || []).forEach((v: string) => v && counts.set(v, (counts.get(v) || 0) + 1)));
  let x = colR;
  order.forEach(v => {
    const n = counts.get(v); if (!n || !all.count) return;
    const w = (n / all.count) * colRW;
    doc.setFillColor(...cellFill(v)); doc.rect(x, yR, w, 3.2, 'F'); x += w;
  });
  doc.setDrawColor(...LINE); doc.rect(colR, yR, colRW, 3.2, 'S');
  yR += 7;
  doc.setFont('Roboto', 'normal'); doc.setFontSize(7); doc.setTextColor(...GREY);
  doc.text(order.filter(v => counts.get(v)).map(v => `${v}×${counts.get(v)}`).join('   '), colR, yR); yR += 7;

  // --- TRAINIGS-TREND ---
  doc.setFont('Roboto', 'bold'); doc.setFontSize(10); doc.setTextColor(...FOREST);
  doc.text(t('scoring.trendTitle'), colR, yR); yR += 2;
  if (sums.length) {
    const h = 26, best = Math.max(...sums), worst = Math.min(...sums);
    const span = Math.max(4, best - worst), lo = Math.max(0, worst - span * 0.35);
    const slots = Math.max(sums.length, o.roundSize * 2);
    const bw = colRW / slots;
    const mean = sums.reduce((a, b) => a + b, 0) / sums.length;
    const yOf = (v: number) => yR + 4 + h - (0.12 + 0.88 * ((v - lo) / (best - lo || 1))) * h;
    sums.forEach((v, i) => {
      const top = yOf(v);
      doc.setFillColor(...(v === best ? GOLD : [52, 211, 153] as RGB));
      doc.rect(colR + i * bw + 0.4, top, bw - 0.8, yR + 4 + h - top, 'F');
      doc.setFont('Roboto', 'bold'); doc.setFontSize(5.5); doc.setTextColor(...(v === worst ? [200, 40, 40] as RGB : GREY));
      doc.text(String(v), colR + i * bw + bw / 2, top - 0.8, { align: 'center' });
      doc.setFont('Roboto', 'normal'); doc.setTextColor(...GREY);
      doc.text(String(i + 1), colR + i * bw + bw / 2, yR + 4 + h + 3, { align: 'center' });
    });
    doc.setDrawColor(140, 150, 145); doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(colR, yOf(mean), R, yOf(mean)); doc.setLineDashPattern([], 0);
    yR += h + 11;
  }

  // --- TREFFERBILD ---
  const hasDots = ends.some(e => (e.dots || []).some((d: any) => d?.x != null && d?.y != null));
  if (hasDots) {
    doc.setFont('Roboto', 'bold'); doc.setFontSize(10); doc.setTextColor(...FOREST);
    doc.text(t('scoring.targetCard'), colR, yR); yR += 3;
    const full = isFullFace(o.targetType);
    const size = colRW * (full ? 0.8 : 0.62);
    const sc = size / 300;
    const ox = colR + (colRW - size) / 2, oy = yR;
    const P = (vx: number, vy: number): [number, number] => [ox + vx * sc, oy + vy * sc];
    doc.setLineWidth(0.15);
    if (full) {
      const rings: Array<[number, RGB, RGB]> = [[150, RING.white, [60, 60, 60]], [135, RING.white, [60, 60, 60]], [120, RING.black, [255, 255, 255]], [105, RING.black, [255, 255, 255]], [90, RING.blue, [60, 60, 60]], [75, RING.blue, [60, 60, 60]], [60, RING.red, [60, 60, 60]], [45, RING.red, [60, 60, 60]], [30, RING.gold, [60, 60, 60]], [15, RING.gold, [60, 60, 60]], [7.5, RING.gold, [60, 60, 60]]];
      rings.forEach(([r, fill, stroke]) => { doc.setFillColor(...fill); doc.setDrawColor(...stroke); const [cx, cy] = P(150, 150); doc.circle(cx, cy, r * sc, 'FD'); });
    } else if (isSpotFace(o.targetType)) {
      const spot = (vx: number, vy: number) => {
        ([[62.5, RING.blue], [50, RING.red], [37.5, RING.red], [25, RING.gold], [12.5, RING.gold], [6.25, RING.gold]] as Array<[number, RGB]>)
          .forEach(([r, fill]) => { doc.setFillColor(...fill); doc.setDrawColor(60, 60, 60); const [cx, cy] = P(vx, vy); doc.circle(cx, cy, r * sc, 'FD'); });
      };
      [66, 200, 333].forEach(vy => { spot(75, vy); spot(225, vy); });
    }
    // Strzały: kolor strzały (tryb kolorów), inaczej biała; zły strzał = pusty czerwony obrys.
    ends.forEach(e => (e.dots || []).forEach((d: any, i: number) => {
      if (d?.x == null || d?.y == null) return;
      const [cx, cy] = P(d.x, d.y);
      if (d.bad) { doc.setDrawColor(220, 38, 38); doc.setLineWidth(0.3); doc.circle(cx, cy, 1.1, 'S'); doc.setLineWidth(0.15); return; }
      const ac = session.arrowColors ? arrowColorAt(i) : null;
      doc.setFillColor(...(ac ? hexRgb(ac.hex) : [255, 255, 255] as RGB)); doc.setDrawColor(...FOREST);
      doc.circle(cx, cy, 1.1, 'FD');
    }));
    const g = groupStats(ends, o.targetType);
    if (g?.svg) {
      const [gx, gy] = P(g.svg.cx, g.svg.cy);
      doc.setDrawColor(...FOREST); doc.setLineWidth(0.35); doc.setLineDashPattern([1, 0.8], 0);
      doc.circle(gx, gy, Math.max(g.svg.r, 4) * sc, 'S'); doc.setLineDashPattern([], 0);
      doc.line(gx - 2, gy, gx + 2, gy); doc.line(gx, gy - 2, gx, gy + 2); doc.setLineWidth(0.15);
    }
    yR += (full ? 300 : 400) * sc + 4;
    if (g) {
      const dir = t(`stats.arrowColors.dir.${directionKey(g.dxCm, g.dyCm)}`);
      const lines = [
        g.offsetRings < GROUP_CENTER_RINGS ? t('scoring.group.centered') : t('scoring.group.offset', { cm: Math.round(Math.hypot(g.dxCm, g.dyCm)), dir }),
        t('scoring.group.size', { cm: Math.round(g.diameterCm) }),
        ...(g.axis ? [`${t(`scoring.group.axis.${g.axis}`)} · ${t(`scoring.group.axisHint.${g.axis}`)}`] : []),
        ...(o.sightHint && g.n >= 12 && g.offsetRings >= 0.5 ? [t('scoring.sight.move', { dir })] : []),
      ];
      doc.setFont('Roboto', 'bold'); doc.setFontSize(7); doc.setTextColor(...GREY);
      doc.text(t('scoring.group.title').toUpperCase(), colR, yR); yR += 3.5;
      doc.setFont('Roboto', 'normal'); doc.setFontSize(8); doc.setTextColor(...FOREST);
      lines.forEach(l => { const w = doc.splitTextToSize(clean(l), colRW); doc.text(w, colR, yR); yR += 4 * w.length; });
    }
  }

  // --- NOTATKI ---
  let y = Math.max(yL, yR) + 6;
  if (y > 255) { doc.addPage(); y = 20; }
  doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(L, y, R, y);
  doc.setFont('Roboto', 'bold'); doc.setFontSize(10); doc.setTextColor(...FOREST);
  doc.text(t('export.pdfCoachNotes', 'Notatki z treningu (Twoje uwagi)'), L, y + 7);
  y += 12;
  if (o.note) {
    doc.setFont('Roboto', 'normal'); doc.setFontSize(9); doc.setTextColor(40, 40, 40);
    const w = doc.splitTextToSize(o.note, R - L); doc.text(w, L, y); y += 5 * w.length + 2;
  }
  doc.setDrawColor(230, 230, 230);
  for (let i = 0; i < 5 && y + i * 8 < 290; i++) doc.line(L, y + 4 + i * 8, R, y + 4 + i * 8);
}
