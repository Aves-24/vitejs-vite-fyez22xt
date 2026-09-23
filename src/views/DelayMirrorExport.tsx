import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DelayMirrorSeriesTarget, { seriesTargetViewBox } from './DelayMirrorSeriesTarget';
import type { TechShot } from './DelayMirrorSeries';
import { getFullCodec } from '../utils/mediaCodecs';

// Klip z WYPALONA tarcza i znacznikami strzal.
//
// UWAGA HISTORYCZNA: przekodowanie gotowego pliku przez canvas poleglo w tym
// repo dwa razy (9060cbf -> 00573fd „unstable on mobile", 53fb342). Tamta
// droga probowala przemielic material szybciej niz w czasie rzeczywistym
// i rozbijala sie o dekoder na telefonie.
//
// Tutaj jest inaczej: klip LECI NORMALNIE, klatka po klatce trafia na canvas
// razem z nakladka, a MediaRecorder nagrywa ten canvas — dokladnie tak, jak
// przy nagrywaniu z kamery, czyli ta sama sciezka, ktora dziala. Cena: eksport
// trwa tyle, co klip. Dlatego jest osobnym, swiadomym przyciskiem.
//
// Canvas MUSI wisiec w DOM i byc widoczny. Odpiety canvas nie jest malowany,
// a wtedy captureStream() oddaje jedna klatke i plik ma 0,03 s. Przy okazji
// user widzi, co powstaje.

interface Props {
  blob: Blob;
  targetType: string;
  shots: TechShot[];
  shareState: 'idle' | 'sharing' | 'saved' | 'error';
  onShare: (out: Blob) => void;
  onClose: () => void;
  onCancel: () => void;
}

const GOLD = '#fed33e';
// Obwodka aktywnej strzaly NA TARCZY musi byc kolorem, ktorego nie ma na
// zadnym polu tarczy WA (zloto/zolty, czerwony, niebieski, czarny, bialy) —
// inaczej strzala w dziesiatce dostaje zolta obwodke na zoltym tle i znika.
// Reszta nakladki (pasek czasu, znaczniki) zostaje na GOLD — tam nie stoi
// na tle pierscieni tarczy, wiec problem tam nie wystepuje.
const HIGHLIGHT = '#4ade80';

// Ta sama tabela co w DelayMirrorView (nagrywanie) — eksport przekodowuje
// klip, ktory moze juz byc w wyzszej rozdzielczosci, wiec sztywne 2 Mbps
// z v1 byloby teraz za niskie.
function bitrateForResolution(w: number, h: number): number {
  const px = w * h;
  if (px <= 1280 * 720) return 1_500_000;
  if (px <= 1920 * 1080) return 4_000_000;
  if (px <= 2560 * 1440) return 6_000_000;
  return 8_000_000;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

export default function DelayMirrorExport({ blob, targetType, shots, shareState, onShare, onClose, onCancel }: Props) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenTargetRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  // Klip zostaje na TYM ekranie po zbudowaniu — zamrozona ostatnia klatka
  // canvasa jest jedynym dowodem, ze wypalanie sie udalo, a user chcial
  // udostepniac wlasnie z tego miejsca, nie z powtorki (tam ma tylko surowy
  // blob wejsciowy).
  const [result, setResult] = useState<Blob | null>(null);

  useEffect(() => {
    // Flaga per URUCHOMIENIE efektu, nie ref. W trybie deweloperskim React
    // montuje, sprzata i montuje ponownie — ref przezylby to sprzatanie
    // i drugie uruchomienie od razu by sie poddalo.
    let cancelled = false;
    // Wykrywanie zaciecia odtwarzania — patrz petla rysujaca.
    let stalled = false;
    let lastT = -1;
    let lastMoveAt = Date.now();
    // Petla rysujaca chodzi na setInterval, nie na requestAnimationFrame.
    // rAF jest wiazany z kompozytorem i potrafi zwolnic do pojedynczych
    // klatek, gdy okno jest przyslonione — wtedy eksport wychodzi jako
    // jedna klatka. Interwal gorzej trafia w vsync, ale zawsze czyta
    // v.currentTime, wiec zgubiona klatka nie rozjezdza nakladki z obrazem.
    let drawTimer: ReturnType<typeof setInterval> | null = null;
    let video: HTMLVideoElement | null = null;
    let rec: MediaRecorder | null = null;
    let url: string | null = null;
    let hardStop: ReturnType<typeof setTimeout> | null = null;

    // Zamkniecie nagrania — jedna droga dla wszystkich trzech wyzwalaczy
    // (czas odtwarzania, event `ended`, bezpiecznik), zeby nie dalo sie
    // zatrzymac petli bez zatrzymania recordera.
    const finish = () => {
      if (drawTimer) { clearInterval(drawTimer); drawTimer = null; }
      if (hardStop) { clearTimeout(hardStop); hardStop = null; }
      try { if (rec && rec.state !== 'inactive') rec.stop(); } catch { /* ignore */ }
    };

    const cleanup = () => {
      if (drawTimer) { clearInterval(drawTimer); drawTimer = null; }
      if (hardStop) clearTimeout(hardStop);
      try { if (rec && rec.state !== 'inactive') rec.stop(); } catch { /* ignore */ }
      if (video) { try { video.pause(); } catch { /* ignore */ } video.remove(); }
      if (url) URL.revokeObjectURL(url);
    };

    (async () => {
      try {
        const canvas = canvasRef.current;
        const holder = hiddenTargetRef.current;
        const codec = getFullCodec();
        if (!canvas || !holder || !codec) { setFailed(true); return; }
        if (cancelled) return;

        // Tarcza jedzie do canvasa jako obrazek z tego samego SVG, ktore
        // widac w aplikacji — zero drugiego renderera do rozjechania sie.
        const svgNode = holder.querySelector('svg');
        if (!svgNode) { setFailed(true); return; }
        const clone = svgNode.cloneNode(true) as SVGSVGElement;
        clone.removeAttribute('class');
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        const vb = seriesTargetViewBox(targetType);
        clone.setAttribute('width', String(vb.w));
        clone.setAttribute('height', String(vb.h));
        const svgUrl = 'data:image/svg+xml;charset=utf-8,' +
          encodeURIComponent(new XMLSerializer().serializeToString(clone));
        const targetImg = await new Promise<HTMLImageElement | null>(resolve => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = svgUrl;
        });
        if (!targetImg) { setFailed(true); return; }
        if (cancelled) return;

        url = URL.createObjectURL(blob);
        video = document.createElement('video');
        video.src = url;
        video.muted = true;
        video.playsInline = true;
        // iOS potrafi nie dekodowac <video> spoza drzewa dokumentu.
        video.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none';
        document.body.appendChild(video);

        await new Promise<void>(resolve => {
          const done = () => resolve();
          if (video && video.readyState >= 1) done();
          else video?.addEventListener('loadedmetadata', done, { once: true });
        });
        // Sprzatamy TU, a nie tylko w cleanupie: przy anulowaniu w trakcie
        // awaita cleanup zdazyl juz przejsc, zanim <video> powstalo.
        if (cancelled || !video) { cleanup(); return; }

        const W = video.videoWidth || 720;
        const H = video.videoHeight || 1280;
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        if (!ctx) { setFailed(true); return; }

        const dur = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;

        // Panel tarczy w gornym prawym rogu — po przekatnej od znaku GROT-X,
        // ktory siedzi w pliku w prawym dolnym.
        const pad = Math.round(Math.min(W, H) * 0.035);
        const panelW = Math.round(W * 0.26);
        const panelH = Math.round(panelW * (vb.h / vb.w));
        const panelX = W - pad - panelW;
        const panelY = pad;

        const marked = shots.filter(s => s.tMs !== null);
        const barX = pad;
        const barW = Math.round(W * 0.62);
        const barY = H - pad - Math.round(Math.min(W, H) * 0.02);
        const barH = Math.max(3, Math.round(Math.min(W, H) * 0.008));
        const pinR = Math.max(6, Math.round(Math.min(W, H) * 0.018));

        const draw = () => {
          const v = video;
          if (!v || !ctx) return;
          ctx.drawImage(v, 0, 0, W, H);

          const now = v.currentTime;
          let activeN: number | null = null;
          const byTime = marked.slice().sort((a, b) => (a.tMs as number) - (b.tMs as number));
          byTime.forEach(s => { if ((s.tMs as number) / 1000 <= now + 0.05) activeN = s.n; });

          // Notatka do strzalu N ma byc widoczna PRZED nim, nie po — to
          // komentarz/przypomnienie na czas przygotowania i naciagu, nie
          // podsumowanie po fakcie. Okno: od konca poprzedniego strzalu
          // (albo od 0:00 dla pierwszego) do WLASNEGO momentu tego strzalu.
          // Osobne od activeN (obwodka na tarczy), ktora ma zostac na
          // strzale, ktory WLASNIE trafil.
          let noteShot: TechShot | null = null;
          for (let i = 0; i < byTime.length; i++) {
            const s = byTime[i];
            const windowEnd = (s.tMs as number) / 1000;
            const windowStart = i === 0 ? 0 : (byTime[i - 1].tMs as number) / 1000;
            if (now >= windowStart && now <= windowEnd + 0.05) { noteShot = s; break; }
          }

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

          // Notatka do strzalu (np. "Arm zu hoch") — top-left, po przekatnej
          // od panelu tarczy. Okno czasowe: noteShot, patrz wyzej.
          if (noteShot && noteShot.note) {
            const note = noteShot.note;
            ctx.save();
            ctx.font = `700 ${Math.round(pad * 0.9)}px system-ui, -apple-system, sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            const textW = ctx.measureText(note).width;
            const boxPadX = pad * 0.7;
            const boxH = pad * 1.9;
            const boxW = textW + boxPadX * 2;
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            roundRect(ctx, pad, pad, boxW, boxH, boxH / 2);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(note, pad + boxPadX, pad + boxH / 2 + 1);
            ctx.restore();
          }

          // Os czasu ze znacznikami — tylko gdy cokolwiek oznaczono.
          if (dur > 0 && marked.length > 0) {
            ctx.save();
            ctx.fillStyle = 'rgba(255,255,255,0.28)';
            roundRect(ctx, barX, barY, barW, barH, barH / 2);
            ctx.fillStyle = GOLD;
            roundRect(ctx, barX, barY, Math.max(barH, barW * Math.min(1, now / dur)), barH, barH / 2);
            marked.forEach(s => {
              const px = barX + barW * Math.min(1, (s.tMs as number) / 1000 / dur);
              const on = s.n === activeN;
              ctx.beginPath();
              ctx.fillStyle = on ? GOLD : '#ffffff';
              ctx.arc(px, barY + barH / 2, on ? pinR * 1.25 : pinR, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = '#0a3a2a';
              ctx.font = `900 ${Math.round(pinR * 1.2)}px system-ui, -apple-system, sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(String(s.n), px, barY + barH / 2 + 1);
            });
            ctx.restore();
          }

          if (dur > 0) setProgress(Math.min(1, now / dur));

          // Koniec liczymy z czasu odtwarzania, nie z eventu `ended`. Event
          // potrafi nie przyjsc, gdy przegladarka przydusi <video> poza
          // widokiem — wtedy nagrywanie jechalo do bezpiecznika i plik mial
          // 15 s zamrozonej ostatniej klatki zamiast 6 s klipu.
          if (dur > 0 && now >= dur - 0.05) { finish(); return; }

          // Przegladarka potrafi wstrzymac odtwarzanie, gdy strona przestaje
          // byc rysowana (zgaszony ekran, okno w tle). Bez tego wychodzilby
          // plik zlozony z jednej zamrozonej klatki — lepiej powiedziec
          // wprost, ze nie wyszlo, niz oddac takie cos do wyslania.
          if (Math.abs(now - lastT) > 0.01) { lastT = now; lastMoveAt = Date.now(); }
          else if (Date.now() - lastMoveAt > 4000) {
            stalled = true;
            setFailed(true);
            finish();
          }
        };

        const stream = canvas.captureStream(30);
        rec = new MediaRecorder(stream, { mimeType: codec, videoBitsPerSecond: bitrateForResolution(W, H) });
        const chunks: BlobPart[] = [];
        rec.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
        rec.onstop = () => {
          stream.getTracks().forEach(tr => tr.stop());
          if (cancelled || stalled) return;
          if (chunks.length === 0) { setFailed(true); return; }
          setResult(new Blob(chunks, { type: codec.split(';')[0] }));
        };

        draw();
        drawTimer = setInterval(draw, 33);
        // Bez timeslice — kompletny moov, ta sama zasada co przy nagrywaniu.
        rec.start();
        lastMoveAt = Date.now();
        video.currentTime = 0;
        video.playbackRate = 1;
        await video.play().catch(() => { /* i tak rysujemy z rAF */ });

        video.addEventListener('ended', finish, { once: true });

        // Bezpiecznik: gdyby odtwarzanie utknelo na dobre, konczymy sami
        // zamiast zostawiac usera na ekranie eksportu bez wyjscia.
        hardStop = setTimeout(finish, Math.round((dur || 30) * 1000 * 1.6) + 6000);
      } catch {
        setFailed(true);
      }
    })();

    return () => { cancelled = true; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0 z-[60] bg-black/95 flex flex-col items-center justify-center px-6 gap-3">
      {/* Ukryta instancja tarczy — zrodlo obrazka do wypalenia. Zawsze bez
          podswietlenia, zeby serializowany SVG byl deterministyczny. */}
      <div ref={hiddenTargetRef} className="absolute w-0 h-0 overflow-hidden opacity-0 pointer-events-none">
        <DelayMirrorSeriesTarget targetType={targetType} shots={shots} className="w-[300px]" />
      </div>

      <canvas ref={canvasRef} className="max-w-full max-h-[55%] rounded-xl border border-white/15" />

      {result ? (
        <>
          <p className="text-white font-black text-sm uppercase tracking-widest">{t('delayMirror.exportDone')}</p>
          <button
            onClick={() => onShare(result)}
            disabled={shareState === 'sharing'}
            className="w-full max-w-xs py-3 bg-[#fed33e] text-[#0a3a2a] rounded-2xl font-black text-sm active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-lg">
              {shareState === 'saved' ? 'check_circle' : shareState === 'error' ? 'error' : 'share'}
            </span>
            {shareState === 'sharing' && t('delayMirror.shareSharing')}
            {shareState === 'saved' && t('delayMirror.shareSaved')}
            {shareState === 'error' && t('delayMirror.shareError')}
            {shareState === 'idle' && t('delayMirror.shareIdle')}
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white/10 text-white/70 font-bold text-xs active:scale-95 transition-all"
          >
            {t('delayMirror.exportBack')}
          </button>
        </>
      ) : failed ? (
        <>
          <p className="text-white/70 text-sm text-center">{t('delayMirror.exportFailed')}</p>
          <button
            onClick={onCancel}
            className="px-6 py-3 rounded-2xl bg-white/10 text-white font-bold text-sm active:scale-95 transition-all"
          >
            {t('delayMirror.finishToMenu')}
          </button>
        </>
      ) : (
        <>
          <p className="text-white font-black text-sm uppercase tracking-widest">{t('delayMirror.exportRunning')}</p>
          <div className="w-full max-w-xs h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-[#fed33e] rounded-full transition-all duration-100" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="text-white/40 text-[11px] text-center leading-snug">{t('delayMirror.exportHint')}</p>
          <button
            onClick={onCancel}
            className="px-5 py-2 rounded-xl bg-white/10 text-white/70 font-bold text-xs active:scale-95 transition-all"
          >
            {t('delayMirror.exportCancel')}
          </button>
        </>
      )}
    </div>
  );
}
