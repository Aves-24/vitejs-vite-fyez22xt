import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DelayMirrorSeriesTarget from './DelayMirrorSeriesTarget';
import type { TechShot } from './DelayMirrorSeries';
import { getFullCodec } from '../utils/mediaCodecs';
import { drawMirrorOverlay, loadTargetImage } from '../utils/mirrorOverlay';

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
  /** null = klip bez tarczy (sam wycinek, nic do wypalenia). */
  targetType: string | null;
  shots: TechShot[];
  /** Wycinek [start, end] w sekundach oryginalu; null = caly klip. Plik nie
   *  da sie przyciac bez przekodowania, a przekodowanie i tak leci w czasie
   *  rzeczywistym — wiec przegrywamy po prostu tylko ten kawalek. */
  range: { start: number; end: number } | null;
  // Notatki sa JEDYNYM PRO gate w Delay Mirror — wypalanie ich w klip
  // sprawdza to tutaj, nie tylko w UI edycji (obrona przed sytuacja, gdzie
  // user zapisal notatki jako PRO, a potem subskrypcja wygasla).
  isPremium: boolean;
  shareState: 'idle' | 'sharing' | 'saved' | 'error';
  onShare: (out: Blob) => void;
  onClose: () => void;
  onCancel: () => void;
}

// Ta sama tabela co w DelayMirrorView (nagrywanie) — eksport przekodowuje
// klip, ktory moze juz byc w wyzszej rozdzielczosci, wiec sztywne 2 Mbps
// z v1 byloby teraz za niskie.
function bitrateForResolution(w: number, h: number): number {
  const px = w * h;
  // Ta sama tabela co w DelayMirrorView — patrz komentarz tam.
  if (px <= 1280 * 720) return 3_000_000;
  if (px <= 1920 * 1080) return 4_000_000;
  if (px <= 2560 * 1440) return 6_000_000;
  return 8_000_000;
}

export default function DelayMirrorExport({ blob, targetType, shots, range, isPremium, shareState, onShare, onClose, onCancel }: Props) {
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
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const resultVideoRef = useRef<HTMLVideoElement>(null);
  // Powiekszony podglad = wiecej wysokosci dla wideo (do 70vh), ale WCIAZ
  // w tym samym ekranie — NIE prawdziwy Fullscreen API. User: requestFullscreen/
  // webkitEnterFullscreen wywolywalo systemowe powiadomienie na telefonie
  // (potencjalne zrodlo problemow w przyszlosci), a przy tym chowalo
  // przyciski Udostepnij/Powrot pod natywnym odtwarzaczem. Plus tego
  // podejscia: przyciski zostaja widoczne na dole NAWET w powiekszeniu.
  const [enlarged, setEnlarged] = useState(false);

  // Klip gotowy = mozna go obejrzec jeszcze raz, nie tylko udostepnic —
  // user chcial sprawdzic wynik przed wyslaniem. URL na WYNIKOWYM blobie
  // (juz z wypalona tarcza i notatkami), nie na hidden <video> uzywanym
  // do rysowania — ten drugi jest tylko zrodlem klatek, nie do odtwarzania.
  useEffect(() => {
    if (!result) return;
    const url = URL.createObjectURL(result);
    setResultUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result]);

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
        if (!canvas || !codec) { setFailed(true); return; }
        if (cancelled) return;

        let targetImg: HTMLImageElement | null = null;
        if (targetType) {
          targetImg = await loadTargetImage(holder, targetType);
          if (!targetImg) { setFailed(true); return; }
        }
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

        const fullDur = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
        // Wycinek albo caly klip. Bez znanej dlugosci (fullDur 0) wycinek
        // i tak ma sensowne granice z UI, a caly klip konczy event `ended`.
        const clipStart = range ? Math.max(0, range.start) : 0;
        const clipEnd = range ? (fullDur > 0 ? Math.min(range.end, fullDur) : range.end) : fullDur;
        const dur = Math.max(0, clipEnd - clipStart);

        const draw = () => {
          const v = video;
          if (!v || !ctx) return;
          ctx.drawImage(v, 0, 0, W, H);

          const now = v.currentTime;
          drawMirrorOverlay(ctx, {
            W, H, now, targetImg, targetType, shots, isPremium,
            bar: dur > 0 ? { start: clipStart, end: clipEnd } : null,
          });

          if (dur > 0) setProgress(Math.max(0, Math.min(1, (now - clipStart) / dur)));

          // Koniec liczymy z czasu odtwarzania, nie z eventu `ended`. Event
          // potrafi nie przyjsc, gdy przegladarka przydusi <video> poza
          // widokiem — wtedy nagrywanie jechalo do bezpiecznika i plik mial
          // 15 s zamrozonej ostatniej klatki zamiast 6 s klipu.
          if (dur > 0 && now >= clipEnd - 0.05) { finish(); return; }

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

        // Najpierw przewijamy na poczatek wycinka i CZEKAMY na klatke — inaczej
        // pierwsze rysowania zlapalyby klatke z 0:00 i plik zaczynalby sie
        // mignieciem z poczatku nagrania.
        if (clipStart > 0) {
          await new Promise<void>(resolve => {
            const v = video;
            if (!v) { resolve(); return; }
            v.addEventListener('seeked', () => resolve(), { once: true });
            // Bezpiecznik: telefon potrafi zgubic `seeked` — wtedy jedziemy
            // dalej zamiast wisiec na ekranie eksportu bez konca.
            setTimeout(resolve, 3000);
            v.currentTime = clipStart;
          });
          if (cancelled || !video) { cleanup(); return; }
        } else {
          video.currentTime = 0;
        }

        draw();
        drawTimer = setInterval(draw, 33);
        // Bez timeslice — kompletny moov, ta sama zasada co przy nagrywaniu.
        rec.start();
        lastMoveAt = Date.now();
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
    <div className="absolute inset-0 z-[60] bg-black/95 flex flex-col px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] gap-3">
      {/* Ukryta instancja tarczy — zrodlo obrazka do wypalenia. Zawsze bez
          podswietlenia, zeby serializowany SVG byl deterministyczny. */}
      {targetType && (
        <div ref={hiddenTargetRef} className="absolute w-0 h-0 overflow-hidden opacity-0 pointer-events-none">
          <DelayMirrorSeriesTarget targetType={targetType} shots={shots} className="w-[300px]" />
        </div>
      )}

      {/* Wideo/canvas w GORNEJ, elastycznej czesci — kontrolki zawsze na
          dole (shrink-0 nizej), zamiast calego bloku wysrodkowanego na
          ekranie. Bez tego maly wynikowy <video> (mniej tresci niz canvas
          z pasem eksportu) przesuwal caly ukrywany widok za wysoko. */}
      <div className="flex-1 min-h-0 flex items-center justify-center">
        {/* Po zbudowaniu klipu podglad przechodzi z zamrozonego canvasa na
            prawdziwe <video> na wynikowym blobie — juz z wypalona tarcza i
            notatkami w pikselach, wiec do odtworzenia nie trzeba przerysowywac
            nakladki. Canvas zostaje widoczny tylko w trakcie/po niepowodzeniu. */}
        {result && resultUrl ? (
          <video
            ref={resultVideoRef}
            src={resultUrl}
            playsInline
            /* dvh, nie vh: na mobile pasek adresu chowa/pokazuje sie i vh
               liczy sie od maksymalnej wysokosci, wiec video+przyciski
               wystawaly za faktyczny widoczny ekran (dvh sledzi realny viewport). */
            className={`max-w-full rounded-xl border border-white/15 transition-all ${enlarged ? 'max-h-[68dvh]' : 'max-h-[42dvh]'}`}
            onEnded={() => setEnlarged(false)}
          />
        ) : (
          <canvas ref={canvasRef} className="max-w-full max-h-[55%] rounded-xl border border-white/15" />
        )}
      </div>

      <div className="shrink-0 flex flex-col items-center gap-2">
        {result ? (
          <>
            {/* Tytul + wszystkie 4 akcje w JEDNYM wierszu, tytul po lewej —
                osobny wiersz na tytul (nad rzedem przyciskow) razem z wideo
                wystawal za gorna krawedz ekranu, zwlaszcza w powiekszeniu. */}
            <div className="w-full max-w-xs flex items-center gap-2">
              <p className="shrink-0 text-white font-black text-[10px] uppercase tracking-wider leading-tight">
                {t('delayMirror.exportDone')}
              </p>
              <button
                onClick={() => resultVideoRef.current?.play().catch(() => { /* ignore */ })}
                title={t('delayMirror.watchAgain')}
                className="shrink-0 w-10 h-10 rounded-xl bg-white/10 text-white flex items-center justify-center active:scale-95 transition-all border border-white/15"
              >
                <span className="material-symbols-outlined text-lg">play_arrow</span>
              </button>
              {/* Powiekszenie DO 70vh w tym samym ekranie, NIE prawdziwy
                  Fullscreen API — patrz komentarz przy stanie `enlarged`. */}
              <button
                onClick={() => setEnlarged(v => !v)}
                title={t('delayMirror.watchFullscreen')}
                className="shrink-0 w-10 h-10 rounded-xl bg-white/10 text-white flex items-center justify-center active:scale-95 transition-all border border-white/15"
              >
                <span className="material-symbols-outlined text-lg">{enlarged ? 'fullscreen_exit' : 'fullscreen'}</span>
              </button>
              <button
                onClick={() => onShare(result)}
                disabled={shareState === 'sharing'}
                className="flex-1 min-w-0 h-10 px-2 bg-[#fed33e] text-[#0a3a2a] rounded-xl font-black text-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-lg shrink-0">
                  {shareState === 'saved' ? 'check_circle' : shareState === 'error' ? 'error' : 'share'}
                </span>
                <span className="truncate">
                  {shareState === 'sharing' && t('delayMirror.shareSharing')}
                  {shareState === 'saved' && t('delayMirror.shareSaved')}
                  {shareState === 'error' && t('delayMirror.shareError')}
                  {shareState === 'idle' && t('delayMirror.shareIdle')}
                </span>
              </button>
              <button
                onClick={onClose}
                title={t('delayMirror.exportBack')}
                className="shrink-0 w-10 h-10 rounded-xl bg-white/10 text-white/70 flex items-center justify-center active:scale-95 transition-all border border-white/15"
              >
                <span className="material-symbols-outlined text-lg">arrow_back</span>
              </button>
            </div>
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
    </div>
  );
}
