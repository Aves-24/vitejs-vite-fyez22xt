import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DelayMirrorGrid from './DelayMirrorGrid';
import DelayMirrorSeriesTarget from './DelayMirrorSeriesTarget';
import DelayMirrorExport from './DelayMirrorExport';
import type { TechSeriesDraft, TechShot } from './DelayMirrorSeries';

interface Props {
  blob: Blob | null;
  displayAsLandscape: boolean;
  showGridInitial?: boolean;
  onResume: () => void;
  onEndSession: () => void;
  /** Podsumowanie passy zamiast konca sesji: inne napisy, wyjscie wraca
   *  do nagrywania nastepnej passy zamiast budzic zapauzowana kamere. */
  passMode?: boolean;
  /** Wbite strzaly — rysowane na malej tarczy obok wideo. */
  series?: TechSeriesDraft | null;
  /** Strzaly po oznaczeniu czasow na osi — do zapisu w rodzicu. */
  onShotsChange?: (shots: TechShot[]) => void;
  // FREE ma pełny podgląd i replay; zapis/udostępnienie klipu to jedyny gate PRO.
  isPremium?: boolean;
  onUpgrade?: () => void;
}

export default function DelayMirrorReplay({ blob, displayAsLandscape, showGridInitial = false, onResume, onEndSession, passMode = false, series = null, onShotsChange, isPremium = true, onUpgrade }: Props) {
  const { t } = useTranslation();
  const replayVideoRef = useRef<HTMLVideoElement>(null);
  const replayBoxRef = useRef<HTMLDivElement>(null);
  const replayBlobUrlRef = useRef<string | null>(null);
  const [replayRate, setReplayRate] = useState<number>(1);
  // Pasek predkosci w poziomie: zamiast piatki przyciskow na stale, pokazujemy
  // tylko aktualna i wysuwamy reszte do gory na stuknieciu — pasek na dole
  // byl za szeroki na jeden rzad z transportem i akcjami sesji.
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [replayTime, setReplayTime] = useState(0);
  const [replayDuration, setReplayDuration] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  // Wrapper na video w replay landscape — mierzymy aby dac pixele do video
  // (vw/vh nie dziala w manual landscape bo outer container jest rotowany).
  const [replayBox, setReplayBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [shareState, setShareState] = useState<'idle' | 'sharing' | 'saved' | 'error'>('idle');
  // Orientacja klatek nagrania (z metadanych) — decyduje czy player musi obracac
  const [sourceIsPortrait, setSourceIsPortrait] = useState(false);
  // Siatka pozycjonowania — dziedziczy stan z nagrywania, przelaczalna
  const [showGrid, setShowGrid] = useState(showGridInitial);

  // Mierz wrapper replay video — wymagane bo vw/vh nie dziala wewnatrz manual
  // landscape (outer wrapper jest rotowany przez transform).
  useEffect(() => {
    const el = replayBoxRef.current;
    if (!el) return;
    const update = () => {
      setReplayBox({ w: el.offsetWidth, h: el.offsetHeight });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  });

  // Ustaw src playera replay z pełnego nagrania, żeby user mógł
  // przewijać i oglądać slow-motion. Blob URL zwalniamy przy unmount/zmianie.
  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    if (replayBlobUrlRef.current) URL.revokeObjectURL(replayBlobUrlRef.current);
    replayBlobUrlRef.current = url;
    // replayTime/replayDuration zyja tylko z eventow <video> (onTimeUpdate/
    // onLoadedMetadata) — bez tego resetu suwak i licznik zostawialy pozycje
    // z POPRZEDNIEGO klipu (np. 0:45 z konca passy 1), mimo ze nowy plik
    // faktycznie gral juz od 0. Wygladalo to jak "nowy klip zaczyna sie w
    // polowie", choc obraz byl poprawny — tylko cyfry sie nie zgadzaly.
    setReplayTime(0);
    setReplayDuration(0);
    const v = replayVideoRef.current;
    if (v) {
      v.src = url;
      v.playbackRate = replayRate;
      v.currentTime = 0;
      v.play().catch(() => { /* autoplay may fail */ });
    }
    return () => {
      URL.revokeObjectURL(url);
      if (replayBlobUrlRef.current === url) replayBlobUrlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob]);

  // Sync playback rate
  useEffect(() => {
    if (replayVideoRef.current) replayVideoRef.current.playbackRate = replayRate;
  }, [replayRate]);

  // ─── Oznaczanie strzal na osi czasu ─────────────────────────────────────
  // Czasy powstaja TYLKO tutaj i tylko recznie. Detekcja z dzwieku odpada,
  // bo klip nagrywa canvas.captureStream() — w pliku nie ma sciezki audio.
  // `tSource` w modelu danych czeka na to od v1.
  const [shots, setShots] = useState<TechShot[]>(series?.shots ?? []);
  const [marking, setMarking] = useState(false);
  // Strzala, do ktorej user wlasnie moze wpisac notatke — ta OSTATNIO
  // oznaczona, nie ta aktualnie aktywna na osi (user zdazyl juz odjechac
  // dalej suwakiem, a notatka ma zostac przy strzale ktora wlasnie oznaczyl).
  const [lastMarkedN, setLastMarkedN] = useState<number | null>(null);
  // Eksport z wypalona tarcza — osobny, swiadomy krok, bo trwa tyle co klip.
  const [exporting, setExporting] = useState(false);
  // Nowa passa = nowy komplet strzal. Rodzic nie oddaje tych zmian z powrotem
  // (zapisuje je tylko do localStorage), wiec to nie zapetli sie z markShot.
  useEffect(() => { setShots(series?.shots ?? []); setMarking(false); setLastMarkedN(null); }, [series]);

  const nextIdx = shots.findIndex(s => s.tMs === null);
  const markedCount = shots.filter(s => s.tMs !== null).length;

  const pushShots = (next: TechShot[]) => {
    setShots(next);
    onShotsChange?.(next);
  };

  const markShot = () => {
    const v = replayVideoRef.current;
    if (!v || nextIdx < 0) return;
    const tMs = Math.round(v.currentTime * 1000);
    const n = shots[nextIdx].n;
    pushShots(shots.map((s, i) => (i === nextIdx ? { ...s, tMs, tSource: 'manual' as const } : s)));
    setLastMarkedN(n);
    // Ostatnia strzala konczy tryb sama — inaczej user zostawalby w nim
    // bez zadnego przycisku do klikniecia.
    if (nextIdx === shots.length - 1) setMarking(false);
  };

  const setShotNote = (n: number, note: string) => {
    pushShots(shots.map(s => (s.n === n ? { ...s, note: note.slice(0, 60) || null } : s)));
  };

  const undoMark = () => {
    let lastI = -1;
    shots.forEach((s, i) => { if (s.tMs !== null) lastI = i; });
    if (lastI < 0) return;
    if (shots[lastI].n === lastMarkedN) setLastMarkedN(null);
    pushShots(shots.map((s, i) => (i === lastI ? { ...s, tMs: null, tSource: null, note: null } : s)));
  };

  const seekToShot = (n: number) => {
    const s = shots.find(x => x.n === n);
    const v = replayVideoRef.current;
    if (!s || s.tMs === null || !v) return;
    v.currentTime = s.tMs / 1000;
    setReplayTime(s.tMs / 1000);
    // Stuknieta strzala otwiera/odswieza swoj edytor notatki — bez tego
    // po oznaczeniu OSTATNIEGO strzalu (tryb marking sam sie zamykal) albo
    // po przejsciu do nastepnego strzalu notatka poprzedniego byla juz
    // nigdzie nie do edycji.
    setLastMarkedN(n);
  };

  // Podswietlona strzala = ostatnia, ktorej moment juz minal. Dzieki temu
  // podczas odtwarzania tarcza sama pokazuje, ktory strzal wlasnie leci.
  const activeN = (() => {
    let cur: number | null = null;
    shots
      .filter(s => s.tMs !== null)
      .sort((a, b) => (a.tMs as number) - (b.tMs as number))
      .forEach(s => { if ((s.tMs as number) / 1000 <= replayTime + 0.05) cur = s.n; });
    return cur;
  })();

  // Notatka widoczna NA PODGLADZIE, nie tylko w polu edycji — user pisal
  // tekst, a potem puszczajac klip od nowa nigdzie go nie widzial. Ta sama
  // logika okna co w wypalanym eksporcie (DelayMirrorExport): notatka do
  // strzalu N pokazuje sie PRZED nim, od konca poprzedniego strzalu (albo
  // 0:00 dla pierwszego) do jego wlasnego momentu.
  const previewNote = (() => {
    const byTime = shots
      .filter(s => s.tMs !== null)
      .sort((a, b) => (a.tMs as number) - (b.tMs as number));
    for (let i = 0; i < byTime.length; i++) {
      const s = byTime[i];
      const windowEnd = (s.tMs as number) / 1000;
      const windowStart = i === 0 ? 0 : (byTime[i - 1].tMs as number) / 1000;
      if (replayTime >= windowStart && replayTime <= windowEnd + 0.05) return s.note ?? null;
    }
    return null;
  })();

  const replaySeek = (delta: number) => {
    const v = replayVideoRef.current;
    if (!v) return;
    const dur = isFinite(v.duration) ? v.duration : 0;
    const nt = Math.max(0, Math.min(dur || 1e9, v.currentTime + delta));
    v.currentTime = nt;
  };

  const replayRestart = () => {
    const v = replayVideoRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.play().catch(() => { /* ignore */ });
  };

  // `source` pozwala wyslac wersje z wypalona tarcza zamiast surowego klipu.
  const shareVideo = async (source?: Blob) => {
    const out = source ?? blob;
    if (!out) return;
    setShareState('sharing');
    const ext = out.type.includes('mp4') ? 'mp4' : 'webm';
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const filename = `GROTX_DelayMirror_${dateStr}_${hh}${mm}.${ext}`;
    try {
      const nav = navigator as Navigator & {
        canShare?: (data: { files: File[] }) => boolean;
        share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
      };
      const file = new File([out], filename, { type: out.type });
      if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
        await nav.share({
          files: [file],
          title: 'GROT-X Delay Mirror',
        });
        setShareState('idle');
        return;
      }
      // Fallback – pobranie na dysk
      const url = URL.createObjectURL(out);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setShareState('saved');
      setTimeout(() => setShareState('idle'), 2500);
    } catch (err: unknown) {
      const e = err as { name?: string };
      if (e.name === 'AbortError') {
        setShareState('idle');
        return;
      }
      setShareState('error');
      setTimeout(() => setShareState('idle'), 2500);
    }
  };

  const fmtT = (s: number) => {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const hasFullBlob = blob !== null;
  // Rotacja tylko gdy plik ma PIONOWE klatki a UI jest poziome. Nagrania
  // z trybu poziomego sa juz obrocone w pliku (canvas-rotate pipeline),
  // wiec dodatkowy obrot by je polozyl na boku.
  const needsRotate = displayAsLandscape && sourceIsPortrait;

  // Tarcza tej passy. Celowo mala — ma pokazac uklad trafien obok nagrania,
  // nie zajac miejsce suwakowi i przyciskom, ktore w poziomie sa na styk.
  // `max-h-full` nie jest ozdoba: 3-Spot ma viewBox 340x480, wiec przy
  // szerokosci kolumny bylby WYZSZY niz rzad z wideo i wylazlby poza ekran.
  // Z limitem wysokosci SVG skaluje sie w dol i siedzi wysrodkowany.
  const targetPanel = passMode && series && shots.length > 0 ? (
    <DelayMirrorSeriesTarget
      targetType={series.targetType}
      shots={shots}
      activeN={activeN}
      onPick={seekToShot}
      className={displayAsLandscape ? 'absolute inset-0 w-full h-full' : 'w-44'}
    />
  ) : null;

  // W poziomie menu lezy PASKIEM NA DOLE, nie kolumna po prawej. Kolumna
  // zabierala 30% szerokosci na przyciski, ktore i tak sa niskie — wideo
  // dostawalo ~330 px zamiast ~580. Pasek kosztuje ~50 px wysokosci.
  const wide = displayAsLandscape && hasFullBlob;

  const videoBox = (
          <div
            ref={replayBoxRef}
            className={`relative ${displayAsLandscape ? '' : 'w-full mb-3 rounded-2xl overflow-hidden border border-white/15'} bg-black flex items-center justify-center`}
            style={
              displayAsLandscape
                ? { width: '100%', flex: '1 1 auto', minHeight: 0, minWidth: 0, alignSelf: 'stretch' }
                : undefined
            }
          >
            <div
              style={
                needsRotate
                  ? {
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%) rotate(90deg)',
                      transformOrigin: 'center center',
                      lineHeight: 0,
                    }
                  : { display: 'inline-block', lineHeight: 0, position: 'relative' }
              }
            >
              <video
                ref={replayVideoRef}
                className="block bg-black"
                style={{
                  // Pre-rotate: width = visual height, height = visual width.
                  // Uzywamy zmierzonego boxa parenta (px) zamiast vw/vh.
                  width: needsRotate ? `${replayBox.h}px` : displayAsLandscape ? `${replayBox.w}px` : undefined,
                  height: needsRotate ? `${replayBox.w}px` : displayAsLandscape ? `${replayBox.h}px` : undefined,
                  maxWidth: needsRotate ? undefined : '100%',
                  maxHeight: needsRotate || displayAsLandscape ? undefined : '40vh',
                  objectFit: 'contain',
                  display: 'block',
                  // BEZ lustra. Wczesniej powtorka odbijala obraz, zeby zgadzac
                  // sie z podgladem na zywo — ale plik jest nieodbity, wiec
                  // wypalony znak GROT-X wychodzil tu lustrzany. Powtorka
                  // pokazuje teraz dokladnie to, co siedzi w pliku; lustro
                  // zostaje tam, gdzie ma sens, czyli w widoku na zywo.
                  transform: undefined,
                }}
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  setReplayDuration(v.duration || 0);
                  setSourceIsPortrait(v.videoHeight > v.videoWidth);
                }}
                onTimeUpdate={(e) => setReplayTime(e.currentTarget.currentTime)}
                onPlay={() => setReplayPlaying(true)}
                onPause={() => setReplayPlaying(false)}
                onClick={() => {
                  const v = replayVideoRef.current;
                  if (!v) return;
                  if (v.paused) v.play().catch(() => { /* ignore */ });
                  else v.pause();
                }}
                playsInline
              />
              {/* Siatka pozycjonowania — identyczna jak przy nagrywaniu,
                  procentowa wiec pokrywa sie 1:1 z kadrem video */}
              {showGrid && <DelayMirrorGrid />}
            </div>
            {/* Notatka na PODGLADZIE, nie tylko w polu edycji — user pisal
                tekst i po puszczeniu klipu od nowa nigdzie go nie widzial.
                Wzgledem outer boxa, nie rotowanego wrappera — user i tak
                widzi to jako "gorny lewy rog filmiku", wystarczajaco
                dokladnie na podglad (dokladna pozycja jest w eksporcie). */}
            {previewNote && (
              <div className="absolute top-2 left-2 z-10 max-w-[70%] px-2.5 py-1.5 rounded-lg bg-black/70 text-white text-[11px] font-bold pointer-events-none truncate">
                {previewNote}
              </div>
            )}
          </div>
  );

  // Transport: play/pauza, siatka, czas i suwak. W poziomie wchodzi w pasek
  // na dole, w pionie zostaje pod filmikiem.
  const transportRow = (
          <div className={`${wide ? 'flex items-center gap-2 flex-1 min-w-0' : 'w-full flex items-center gap-2 px-2 mt-2 mb-3'}`}>
            <button
              onClick={() => {
                const v = replayVideoRef.current;
                if (!v) return;
                if (v.paused) v.play().catch(() => { /* ignore */ });
                else v.pause();
              }}
              className="w-9 h-9 rounded-full bg-[#fed33e] text-[#0a3a2a] flex items-center justify-center active:scale-90 transition-all flex-shrink-0"
            >
              <span className="material-symbols-outlined text-xl">{replayPlaying ? 'pause' : 'play_arrow'}</span>
            </button>
            <button
              onClick={() => setShowGrid(v => !v)}
              className={`w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all flex-shrink-0 border ${
                showGrid
                  ? 'bg-[#4ade80]/20 text-[#4ade80] border-[#4ade80]/40'
                  : 'bg-white/10 text-white/60 border-white/10'
              }`}
              title={t('delayMirror.grid')}
            >
              <span className="material-symbols-outlined text-lg">grid_on</span>
            </button>
            <span className="text-white/70 text-[10px] font-bold tabular-nums flex-shrink-0">{fmtT(replayTime)}</span>
            {/* Suwak + znaczniki strzal. Numerki leza NAD torem i tylko one
                lapia dotyk — gdyby przykrywaly tor, w tych miejscach nie dalo
                by sie przeciagnac suwaka. */}
            <div className="relative flex-1 min-w-0">
              <input
                type="range"
                min={0}
                max={replayDuration || 1}
                step={0.05}
                value={Math.min(replayTime, replayDuration || 1)}
                onChange={(e) => {
                  const v = replayVideoRef.current;
                  if (!v) return;
                  const nt = parseFloat(e.target.value);
                  v.currentTime = nt;
                  setReplayTime(nt);
                }}
                className="w-full accent-[#fed33e] block"
              />
              {replayDuration > 0 && shots.filter(s => s.tMs !== null).map(s => {
                const pct = Math.max(0, Math.min(100, ((s.tMs as number) / 1000 / replayDuration) * 100));
                return (
                  <button
                    key={s.n}
                    onClick={() => seekToShot(s.n)}
                    style={{ left: `${pct}%` }}
                    title={t('delayMirror.markShotN', { n: s.n })}
                    className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full text-[8px] font-black flex items-center justify-center border border-black/40 shadow transition-all ${
                      activeN === s.n ? 'bg-[#fed33e] text-[#0a3a2a] scale-125' : 'bg-white text-black'
                    }`}
                  >
                    {s.n}
                  </button>
                );
              })}
            </div>
            <span className="text-white/70 text-[10px] font-bold tabular-nums flex-shrink-0">{fmtT(replayDuration)}</span>
          </div>
  );

  // Kolumna tarczy — tuz obok nagrania, po prawej.
  // 13 rem to nie przypadek: przy 757x335 obraz klipu 16:9 i tak konczy sie
  // na 451 px (ogranicza go wysokosc rzedu), a na wideo zostaje 476 px — wiec
  // az do tej szerokosci tarcza rosnie NIE zabierajac nic nagraniu.
  // Sterowanie oznaczaniem siedzi POD tarcza, nie w dolnym pasku: tam nie ma
  // juz miejsca (698 z 733 px zajete), a tutaj user i tak patrzy na numery
  // strzal, ktore zaraz bedzie oznaczal.
  // Notatka do OSTATNIO oznaczonej/stukniete strzaly — wydzielona spod
  // `marking`, bo oznaczenie OSTATNIEGO strzalu samo zamyka tryb marking
  // (patrz markShot) i notatka do wlasnie tego strzalu bylaby wtedy
  // nigdzie nieedytowalna. Dziala zawsze, gdy lastMarkedN wskazuje na
  // istniejacy strzal — takze po wyjsciu z marking (stuknieta strzala na
  // osi/tarczy w seekToShot rowniez ustawia lastMarkedN, wiec kazda juz
  // oznaczona strzala jest do edycji w kazdej chwili).
  const noteEditor = lastMarkedN !== null ? (
    <div className="w-full flex gap-1.5">
      <input
        type="text"
        value={shots.find(s => s.n === lastMarkedN)?.note ?? ''}
        onChange={(e) => setShotNote(lastMarkedN, e.target.value)}
        // Wideo lecialo dalej podczas pisania — user tracil orientacje,
        // gdzie akurat jest, i po wpisaniu notatki zastawal chaos na
        // ekranie. Pauza na focus, zeby czas stal w miejscu na czas
        // pisania.
        onFocus={() => replayVideoRef.current?.pause()}
        maxLength={60}
        placeholder={t('delayMirror.noteInputPlaceholder', { n: lastMarkedN })}
        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/15 text-white text-[11px] placeholder-white/30 focus:outline-none focus:border-[#fed33e]/50"
      />
      {/* Odznacz "gotowe" i wznow odtwarzanie jednym stukniecem — bez
          tego user musial siegac po play/pauze w transportRow, daleko
          od miejsca, gdzie wlasnie pisal. */}
      <button
        onClick={() => replayVideoRef.current?.play().catch(() => { /* ignore */ })}
        title={t('delayMirror.noteDoneHint')}
        className="shrink-0 w-9 h-9 rounded-lg bg-[#4ade80]/20 text-[#4ade80] border border-[#4ade80]/40 flex items-center justify-center active:scale-95 transition-all"
      >
        <span className="material-symbols-outlined text-lg">check</span>
      </button>
    </div>
  ) : null;

  const markControls = targetPanel ? (
    marking ? (
      <div className="shrink-0 w-full flex flex-col items-center gap-1">
        {/* Przewijanie WLASNIE TU: przy 3-minutowym klipie czekanie na
            kazdy strzal w 1x jest zbyt dlugie. Przytrzymanie »4x zamiast
            przelacznika — user chce puscic przycisk dokladnie w momencie
            strzalu i od razu trafic markShot w normalnej predkosci, bez
            dodatkowego stuknieca "wroc do 1x". */}
        <div className="w-full flex gap-1.5">
          <button
            onClick={markShot}
            className="flex-1 py-2 rounded-xl bg-[#fed33e] text-[#0a3a2a] font-black text-xs uppercase tracking-widest active:scale-95 transition-all"
          >
            {t('delayMirror.markShotN', { n: nextIdx >= 0 ? shots[nextIdx].n : shots.length })}
          </button>
          <button
            onPointerDown={() => setReplayRate(4)}
            onPointerUp={() => setReplayRate(1)}
            onPointerLeave={() => setReplayRate(1)}
            onPointerCancel={() => setReplayRate(1)}
            title={t('delayMirror.ffHoldHint')}
            className={`shrink-0 w-14 py-2 rounded-xl font-black text-xs uppercase tracking-wider transition-all border select-none touch-none ${
              replayRate === 4
                ? 'bg-[#fed33e] text-[#0a3a2a] border-[#fed33e] scale-95'
                : 'bg-white/10 text-white/80 border-white/15 active:scale-95'
            }`}
          >
            »4x
          </button>
        </div>
        {noteEditor}
        <div className="w-full flex gap-1">
          <button
            onClick={undoMark}
            disabled={markedCount === 0}
            className="flex-1 py-1.5 rounded-lg bg-white/10 text-white/70 text-[10px] font-bold uppercase tracking-wider active:scale-95 transition-all disabled:opacity-30"
          >
            {t('delayMirror.markUndo')}
          </button>
          <button
            onClick={() => setMarking(false)}
            className="flex-1 py-1.5 rounded-lg bg-white/10 text-white/70 text-[10px] font-bold uppercase tracking-wider active:scale-95 transition-all"
          >
            {t('delayMirror.markFinish')}
          </button>
        </div>
        {/* Licznik dopiero po pierwszym stuknieciu — zanim cokolwiek jest
            zaznaczone, user potrzebuje instrukcji, nie stanu „0 z 6". */}
        <p className="text-white/40 text-[9px] leading-tight text-center">
          {markedCount > 0
            ? t('delayMirror.markDone', { done: markedCount, total: shots.length })
            : t('delayMirror.markHint')}
        </p>
      </div>
    ) : (
      <div className="shrink-0 w-full flex flex-col items-center gap-1">
        {/* Poza trybem marking, ale notatka do ostatnio dotknietej strzaly
            zostaje edytowalna — inaczej po zaznaczeniu OSTATNIEGO strzalu
            (marking sam sie zamyka) nie dalo sie jej wpisac wcale. */}
        {noteEditor}
        <button
          onClick={() => { setMarking(true); replayRestart(); }}
          className="w-full py-2 rounded-xl bg-white/10 text-white/70 border border-white/15 text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all"
        >
          {markedCount > 0 ? t('delayMirror.markRedo') : t('delayMirror.markShots')}
        </button>
      </div>
    )
  ) : null;

  // Nakladka eksportu — ten sam element w obu ukladach, wiec wychodzi poza
  // oba `return`. Zostaje na ekranie po zbudowaniu klipu: user udostepnia
  // wypalona wersje STAD, bo powtorka pod nia ma tylko surowy blob wejsciowy
  // i po powrocie wypalona tarcza bylaby nie do odzyskania.
  const exportOverlay = exporting && blob && series ? (
    <DelayMirrorExport
      blob={blob}
      targetType={series.targetType}
      shots={shots}
      shareState={shareState}
      onShare={(out) => shareVideo(out)}
      onClose={() => setExporting(false)}
      onCancel={() => setExporting(false)}
    />
  ) : null;

  const targetColumn = targetPanel ? (
    <div className={`shrink-0 flex flex-col items-center justify-center gap-1.5 ${wide ? 'w-[13rem] h-full min-h-0' : 'w-44'}`}>
      <div className={wide ? 'flex-1 min-h-0 w-full relative' : 'w-full flex justify-center'}>
        {targetPanel}
      </div>
      {!marking && (
        <p className="shrink-0 text-white font-black text-sm text-center">{t('delayMirror.passReviewTitle')}</p>
      )}
      {markControls}
    </div>
  ) : null;

  // ─── Poziomo: wideo + tarcza u gory, menu paskiem na dole ────────────────
  if (wide) {
    return (
      <div className="absolute inset-0 bg-black/95 z-20 flex flex-col px-3 py-2.5 gap-2">
        <div className="flex-1 min-h-0 flex flex-row items-stretch gap-3">
          <div className="flex-1 min-w-0 flex items-stretch">{videoBox}</div>
          {targetColumn}
        </div>

        {/* Jeden rzad: transport, predkosc, akcje. Dwa rzedy zjadlyby
            ~50 px wysokosci, czyli caly zysk z przeniesienia menu w dol. */}
        <div className="shrink-0 flex items-center gap-2">
          {transportRow}

          {/* Przewijanie ±5 s i restart odpadaja — suwak obok robi to samo,
              a w pasku licza sie piksele. Predkosc: tylko AKTUALNA na stale,
              reszta wysuwa sie do gory po stuknieciu — piatka przyciskow na
              stale zjadala za duzo szerokosci w jednym rzedzie z transportem
              i akcjami sesji. */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowSpeedMenu(v => !v)}
              className={`flex items-center gap-0.5 px-2.5 py-1.5 rounded-lg text-[11px] font-black tabular-nums transition-all active:scale-95 border ${
                showSpeedMenu
                  ? 'bg-[#fed33e] text-[#0a3a2a] border-[#fed33e]'
                  : 'bg-white/10 text-white/70 border-white/15'
              }`}
            >
              {replayRate}x
              <span className="material-symbols-outlined text-sm">expand_less</span>
            </button>
            {showSpeedMenu && (
              <div className="absolute bottom-full mb-2 left-0 flex flex-col gap-1 bg-[#0a0a0a] border border-white/15 rounded-xl p-1.5 shadow-xl z-20">
                {[0.25, 0.5, 1, 2, 4].map(rate => (
                  <button
                    key={rate}
                    onClick={() => { setReplayRate(rate); setShowSpeedMenu(false); }}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-black tabular-nums transition-all active:scale-95 whitespace-nowrap ${
                      replayRate === rate ? 'bg-[#fed33e] text-[#0a3a2a]' : 'text-white/70 active:bg-white/10'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={onResume}
            className="shrink-0 px-4 py-2.5 bg-[#fed33e] text-[#0a3a2a] rounded-xl font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all"
          >
            {passMode ? t('delayMirror.passReviewNext') : t('delayMirror.resumeBtn')}
          </button>

          {/* JEDEN przycisk "Udostepnij" — wczesniej samotna ikona "adjust"
              (wypalanie tarczy) nic nie mowila, a to najwazniejsza akcja na
              tym ekranie. Z tarcza do wypalenia idzie przez ekran eksportu
              (ten juz ma wlasny Udostepnij na koncu, patrz DelayMirrorExport);
              bez tarczy (nic do wypalenia) idzie prosto do shareVideo. */}
          {isPremium ? (
            <button
              onClick={() => { if (targetPanel) setExporting(true); else shareVideo(); }}
              disabled={shareState === 'sharing'}
              title={t('delayMirror.shareIdle')}
              className="shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 bg-white/15 text-white rounded-xl active:scale-95 transition-all border border-white/20 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-lg">
                {shareState === 'saved' ? 'check_circle' : shareState === 'error' ? 'error' : 'share'}
              </span>
              <span className="text-[11px] font-black uppercase tracking-widest">
                {t('delayMirror.shareIdle')}
              </span>
            </button>
          ) : (
            <button
              onClick={onUpgrade}
              title={t('delayMirror.savePro', { defaultValue: 'Zapisz wideo — PRO' })}
              className="shrink-0 w-10 h-10 bg-[#fed33e]/15 text-[#fed33e] rounded-xl active:scale-95 transition-all flex items-center justify-center border border-[#fed33e]/30"
            >
              <span className="material-symbols-outlined text-lg">diamond</span>
            </button>
          )}

          {/* Koniec sesji — sama ikonka domku, nie kolejny przycisk z
              "beenden"/"Zakoncz" (patrz wczesniejszy fix na ekranie live). */}
          <button
            onClick={onEndSession}
            title={t('delayMirror.endSession')}
            className="shrink-0 w-10 h-10 bg-white/10 text-white/70 rounded-xl active:scale-95 transition-all flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-lg">home</span>
          </button>
        </div>
        {exportOverlay}
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-black/95 z-20 overflow-y-auto py-4 px-4 flex flex-col items-center">
      {hasFullBlob ? (
        <div className="w-full max-w-md">
          {videoBox}
          {transportRow}
        </div>
      ) : (
        !displayAsLandscape && (
          <span className="material-symbols-outlined text-white/30 text-6xl mb-4 mt-4 block">pause_circle</span>
        )
      )}

      <div className="w-full max-w-md flex flex-col items-center gap-2 mt-2">
        {/* W pionie tarcza (z tytulem i oznaczaniem) ladzie nad przyciskami,
            bo obok wideo nie ma miejsca. W poziomie ma wlasna kolumne. */}
        {targetColumn}

        {!targetColumn && (
          <p className="text-white font-black text-lg mt-1">
            {passMode ? t('delayMirror.passReviewTitle') : t('delayMirror.pauseTitle')}
          </p>
        )}
        {(!passMode || !targetPanel) && (
          <p className="text-white/50 text-xs text-center mb-2">
            {passMode ? t('delayMirror.passReviewNoShots') : t('delayMirror.pauseHint')}
          </p>
        )}

        {hasFullBlob && (
          <div className="w-full">
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-1 text-center">
              {t('delayMirror.replaySpeed')}
            </p>
            <div className="flex justify-center gap-2 mb-2">
              {[0.25, 0.5, 1, 2, 4].map(rate => (
                <button
                  key={rate}
                  onClick={() => setReplayRate(rate)}
                  className={`px-3 py-2 rounded-xl text-xs font-black tabular-nums transition-all active:scale-95 ${
                    replayRate === rate
                      ? 'bg-[#fed33e] text-[#0a3a2a] shadow-lg shadow-[#fed33e]/20'
                      : 'bg-white/10 text-white/70 border border-white/15'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>
            <div className="flex justify-center gap-2 mb-3">
              <button
                onClick={() => replaySeek(-5)}
                className="px-3 py-2 rounded-xl bg-white/10 text-white/80 border border-white/15 text-xs font-bold active:scale-95 transition-all flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-base">replay_5</span>
              </button>
              <button
                onClick={replayRestart}
                className="px-3 py-2 rounded-xl bg-white/10 text-white/80 border border-white/15 text-xs font-bold active:scale-95 transition-all flex items-center gap-1"
                title={t('delayMirror.replayRestart')}
              >
                <span className="material-symbols-outlined text-base">restart_alt</span>
              </button>
              <button
                onClick={() => replaySeek(5)}
                className="px-3 py-2 rounded-xl bg-white/10 text-white/80 border border-white/15 text-xs font-bold active:scale-95 transition-all flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-base">forward_5</span>
              </button>
            </div>
          </div>
        )}

        <button
          onClick={onResume}
          className={`w-full max-w-xs py-3.5 bg-[#fed33e] text-[#0a3a2a] rounded-2xl font-black text-sm uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-[#fed33e]/20`}
        >
          {passMode ? t('delayMirror.passReviewNext') : t('delayMirror.resumeBtn')}
        </button>
        {isPremium && targetPanel && (
          <button
            onClick={() => setExporting(true)}
            className="w-full max-w-xs py-3 bg-white/10 text-[#fed33e] rounded-2xl font-bold text-sm active:scale-95 transition-all flex items-center justify-center gap-2 border border-[#fed33e]/30"
          >
            <span className="material-symbols-outlined text-lg">adjust</span>
            {t('delayMirror.exportWithTarget')}
          </button>
        )}
        {hasFullBlob && (
          isPremium ? (
            <button
              onClick={() => shareVideo()}
              disabled={shareState === 'sharing'}
              className={`w-full max-w-xs py-3 bg-white/15 text-white rounded-2xl font-bold text-sm active:scale-95 transition-all flex items-center justify-center gap-2 border border-white/20 disabled:opacity-50`}
            >
              <span className="material-symbols-outlined text-lg">
                {shareState === 'saved' ? 'check_circle' : shareState === 'error' ? 'error' : 'share'}
              </span>
              {shareState === 'sharing' && t('delayMirror.shareSharing')}
              {shareState === 'saved' && t('delayMirror.shareSaved')}
              {shareState === 'error' && t('delayMirror.shareError')}
              {shareState === 'idle' && t('delayMirror.shareIdle')}
            </button>
          ) : (
            <button
              onClick={onUpgrade}
              className={`w-full max-w-xs py-3 bg-[#fed33e]/15 text-[#fed33e] rounded-2xl font-bold text-sm active:scale-95 transition-all flex items-center justify-center gap-2 border border-[#fed33e]/30`}
            >
              <span className="material-symbols-outlined text-lg">diamond</span>
              {t('delayMirror.savePro', { defaultValue: 'Zapisz wideo — PRO' })}
            </button>
          )
        )}
        <button
          onClick={onEndSession}
          className={`w-full max-w-xs py-3 bg-white/10 text-white/70 rounded-2xl font-bold text-sm active:scale-95 transition-all`}
        >
          {t('delayMirror.endSession')}
        </button>
      </div>
      {exportOverlay}
    </div>
  );
}
