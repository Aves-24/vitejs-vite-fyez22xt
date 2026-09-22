// Znak GROT-X wypalany W KLATKI nagrania Delay Mirror.
//
// Celowo w trakcie nagrywania, nie po nim: przekodowanie gotowego klipu
// przez canvas poleglo w tym repo dwa razy (9060cbf -> 00573fd „unstable
// on mobile", 53fb342). Siatka dziala wlasnie dlatego, ze rysuje sie
// w petli rAF razem z klatka — znak jedzie ta sama droga.
//
// Rysowane PO ctx.restore() w petli, wiec uklad wspolrzednych to juz
// gotowy kadr pliku (po ewentualnym obrocie), a nie surowa klatka kamery.

const GOLD = '#fed33e';

/** Rysuje „GROT-X•" w prawym dolnym rogu kadru. */
export function drawBrandOnCanvas(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const minDim = Math.min(w, h);
  // ~5.5% krotszego boku: na 720p daje ~40 px, na 1080p ~59 px — czytelne
  // na telefonie i nadal dyskretne.
  const size = Math.max(14, Math.round(minDim * 0.055));
  const pad = Math.round(minDim * 0.035);
  const dotR = Math.max(2, Math.round(size * 0.11));
  const gap = Math.round(size * 0.22);

  ctx.save();
  ctx.font = `900 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  const wGrot = ctx.measureText('GROT').width;
  const wX = ctx.measureText('-X').width;
  const total = wGrot + wX + gap + dotR * 2;

  const x = w - pad - total;
  const y = h - pad;

  // Cien — bez niego znak ginie na jasnym tle strzelnicy.
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = Math.max(2, Math.round(size * 0.18));
  ctx.shadowOffsetY = Math.max(1, Math.round(size * 0.05));

  ctx.fillStyle = GOLD;
  ctx.fillText('GROT', x, y);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('-X', x + wGrot, y);

  // Kropka marki dokladnie na polowie wysokosci „X". Mierzymy sam glif
  // zamiast mnozyc rozmiar czcionki przez zgadniety wspolczynnik — wysokosc
  // wersalika zalezy od kroju, a na telefonach kroj systemowy bywa inny.
  const capX = ctx.measureText('X').actualBoundingBoxAscent || size * 0.72;
  ctx.beginPath();
  ctx.fillStyle = GOLD;
  ctx.arc(x + wGrot + wX + gap + dotR, y - capX / 2, dotR, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
