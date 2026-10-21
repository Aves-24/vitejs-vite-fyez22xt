// ═══════════════════════════════════════════════════════════════════
//  [ARENA] Grafika rankingu do udostępnienia (user 2026-10-21)
//
//  Rysowana od zera na canvasie (1080×1350, pion pod Instagram/WhatsApp),
//  a nie „zdjęcie” ekranu — wygląda tak samo na każdym telefonie i zawsze
//  ma logo GROT-X oraz adres. Powstaje w telefonie z danych już widocznych
//  na ekranie: zero odczytów Firestore.
// ═══════════════════════════════════════════════════════════════════

export interface ShareRow {
  name: string;
  country?: string;   // kod kraju, np. „DE” — rysowany jako emoji flagi
  distance?: string;  // własny dystans gracza, np. „60m”
  score: number;
  x: number; t: number; n: number;
  isMe?: boolean;
}

export interface ShareRanking {
  title: string;      // np. „ARENA RANKING”
  subtitle: string;   // np. „Vereins-Wettkampf • 70m”
  club?: string;      // klub gospodarza (gra klubowa)
  meta: string;       // data + tarcza
  accent: string;     // kolor trybu (hex)
  meLabel: string;    // „Ty” / „Du” / „You”
  rows: ShareRow[];
}

const W = 1080, H = 1350;
const MEDALS = ['#F2C94C', '#C0C4CC', '#CD7F32'];

const flag = (code?: string) => {
  const c = (code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return '';
  return String.fromCodePoint(...c.split('').map(ch => 127397 + ch.charCodeAt(0)));
};

/** Przycina tekst do szerokości, dodając „…”. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1);
  return s + '…';
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Rysuje ranking i zwraca JPG. */
export async function renderRankingImage(data: ShareRanking): Promise<Blob> {
  // Ta sama czcionka co aplikacja — czekamy, aż się wczyta, inaczej canvas wziąłby zastępczą.
  try { await document.fonts?.ready; } catch { /* brak API — rysujemy tym, co jest */ }
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif';

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d unavailable');

  // Tło areny + poświata w kolorze trybu.
  ctx.fillStyle = '#0a0f1a';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 700);
  glow.addColorStop(0, data.accent + '66');
  glow.addColorStop(1, data.accent + '00');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 700);

  // Logo GROT-X z żółtą kropką.
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 64px ${font}`;
  ctx.textAlign = 'left';
  const logo = 'GROT-X';
  const lw = ctx.measureText(logo).width;
  const lx = (W - lw - 22) / 2;
  ctx.fillText(logo, lx, 130);
  ctx.fillStyle = '#fed33e';
  ctx.beginPath(); ctx.arc(lx + lw + 14, 112, 9, 0, Math.PI * 2); ctx.fill();

  // Nagłówek.
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 58px ${font}`;
  ctx.fillText(data.title, W / 2, 235);
  ctx.fillStyle = data.accent;
  ctx.font = `800 30px ${font}`;
  ctx.fillText(fit(ctx, data.subtitle.toUpperCase(), W - 160), W / 2, 285);
  let y = 285;
  if (data.club) {
    y += 46;
    ctx.fillStyle = '#e5e7eb';
    ctx.font = `800 30px ${font}`;
    ctx.fillText(fit(ctx, data.club, W - 160), W / 2, y);
  }
  y += 42;
  ctx.fillStyle = '#9ca3af';
  ctx.font = `700 26px ${font}`;
  ctx.fillText(data.meta, W / 2, y);

  // Wiersze rankingu — wysokość dopasowana, żeby 12 graczy się zmieściło.
  const top = y + 40, bottom = H - 130;
  const rows = data.rows.slice(0, 12);
  const gap = 12;
  const rowH = Math.min(118, (bottom - top - gap * (rows.length - 1)) / Math.max(rows.length, 1));
  const big = rowH >= 90;
  rows.forEach((r, i) => {
    const ry = top + i * (rowH + gap);
    const x = 70, w = W - 140;
    roundRect(ctx, x, ry, w, rowH, 26);
    ctx.fillStyle = r.isMe ? 'rgba(79,70,229,0.28)' : 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.strokeStyle = r.isMe ? 'rgba(129,140,248,0.7)' : 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2;
    ctx.stroke();
    const cy = ry + rowH / 2;

    // Miejsce: medal dla 1–3.
    const rad = big ? 30 : 22;
    ctx.beginPath(); ctx.arc(x + 30 + rad, cy, rad, 0, Math.PI * 2);
    ctx.fillStyle = i < 3 && r.score > 0 ? MEDALS[i] : 'rgba(255,255,255,0.1)';
    ctx.fill();
    ctx.fillStyle = i < 3 && r.score > 0 ? '#1f2937' : '#9ca3af';
    ctx.font = `900 ${big ? 30 : 24}px ${font}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), x + 30 + rad, cy + (big ? 11 : 9));

    // Nazwa (+ „Ty”) i pod nią flaga, kraj, dystans.
    const nx = x + 30 + rad * 2 + 26;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${big ? 36 : 28}px ${font}`;
    const nameMax = w - (nx - x) - 230;
    const name = fit(ctx, r.name, nameMax - (r.isMe ? 80 : 0));
    ctx.fillText(name, nx, cy - (big ? 4 : 2));
    if (r.isMe) {
      const tw = ctx.measureText(name).width;
      ctx.font = `900 20px ${font}`;
      const bw = ctx.measureText(data.meLabel.toUpperCase()).width + 20;
      roundRect(ctx, nx + tw + 14, cy - (big ? 34 : 28), bw, 30, 8);
      ctx.fillStyle = '#4f46e5'; ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(data.meLabel.toUpperCase(), nx + tw + 24, cy - (big ? 12 : 6));
    }
    ctx.font = `800 ${big ? 24 : 20}px ${font}`;
    ctx.fillStyle = '#9ca3af';
    // Sama flaga (emoji); bez emoji — kod kraju. Oba naraz dawały „DE DE” tam, gdzie
    // system rysuje flagi jako litery (Windows).
    const sub = [flag(r.country) || (r.country || '').toUpperCase(), r.distance].filter(Boolean).join('   ');
    ctx.fillText(sub, nx, cy + (big ? 32 : 24));

    // Wynik i X/10/9.
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${big ? 56 : 42}px ${font}`;
    ctx.fillText(String(r.score), x + w - 34, cy + (big ? 8 : 6));
    ctx.fillStyle = '#6b7280';
    ctx.font = `800 ${big ? 20 : 17}px ${font}`;
    ctx.fillText(`X:${r.x} 10:${r.t} 9:${r.n}`, x + w - 34, cy + (big ? 40 : 30));
  });

  // Stopka z adresem — każde udostępnienie prowadzi do aplikacji.
  ctx.textAlign = 'center';
  ctx.fillStyle = '#6b7280';
  ctx.font = `800 28px ${font}`;
  ctx.fillText('grot-x.web.app', W / 2, H - 60);

  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92));
}

/** Udostępnia JPG (telefon: arkusz „Udostępnij”), a bez tego API pobiera plik. */
export async function shareOrDownloadImage(blob: Blob, filename: string, title: string): Promise<'shared' | 'saved' | 'cancelled'> {
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string }) => Promise<void>;
  };
  const file = new File([blob], filename, { type: 'image/jpeg' });
  try {
    if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], title });
      return 'shared';
    }
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') return 'cancelled';
    // inny błąd udostępniania — spadamy do pobrania
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'saved';
}
