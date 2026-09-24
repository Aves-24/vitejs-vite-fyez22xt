import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { db, auth } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import DelayMirrorReplay from './DelayMirrorReplay';
import DelayMirrorGrid, { drawGridOnCanvas } from './DelayMirrorGrid';
import { drawBrandOnCanvas } from './DelayMirrorBrand';
import { getFullCodec } from '../utils/mediaCodecs';
import DelayMirrorSeries, { TechSeriesDraft, TechShot } from './DelayMirrorSeries';
import TopicPicker from '../components/TopicPicker';
import { FocusStrip } from '../components/tagebuch/FocusCard';
import { useCurrentFocus } from '../utils/focus';
import { saveTechnicalSession } from '../utils/techSession';

const DEFAULT_DELAY_S = 15;
const MIN_DELAY_S = 1;
const MAX_DELAY_S = 30;
const STORAGE_KEY = 'delayMirror.delaySeconds';
const CLIP_STORAGE_KEY = 'delayMirror.clipMode';
const EXPERT_STORAGE_KEY = 'delayMirror.expert';

// 'review' = sesja zakonczona, pokazujemy powtorke. To NIE jest pauza —
// pauza w trakcie nagrania siedzi w osobnym `recordingPaused`.
type MirrorState = 'idle' | 'requesting' | 'positioning' | 'buffering' | 'live' | 'review' | 'unsupported' | 'error';

// Fazy chwilowej pauzy — patrz toggleRecordingPause.
type PausePhase = 'none' | 'draining' | 'frozen';

interface Props {
  onBack: () => void;
  onUpgrade?: () => void;
  onOpenStats?: () => void;
}

const TECH_NOTE_MAX = 400;

interface TechDraft {
  on: boolean;
  size: number;
  arrows: number;
  topics: string[];
  note: string;
  day: string;
}

const todayKey = () => new Date().toDateString();

// Szkic przezywa wyjscie systemowym "wstecz" (omija podsumowanie), ale tylko
// do konca dnia — wczorajsze strzaly nie moga wpasc do dzisiejszego treningu.
function loadTechDraft(uid: string): TechDraft {
  const empty: TechDraft = { on: false, size: 6, arrows: 0, topics: [], note: '', day: todayKey() };
  try {
    const raw = localStorage.getItem(`grotX_dmTech_${uid}`);
    if (!raw) return empty;
    const d = JSON.parse(raw) as Partial<TechDraft>;
    const size = typeof d.size === 'number' && d.size >= 1 && d.size <= 6 ? d.size : 6;
    if (d.day !== todayKey()) return { ...empty, on: !!d.on, size };
    return {
      on: !!d.on,
      size,
      arrows: typeof d.arrows === 'number' && d.arrows > 0 ? d.arrows : 0,
      topics: Array.isArray(d.topics) ? d.topics : [],
      note: typeof d.note === 'string' ? d.note.slice(0, TECH_NOTE_MAX) : '',
      day: todayKey(),
    };
  } catch {
    return empty;
  }
}


// Codec dla MSE pipeline — musi byc obslugiwany przez MediaRecorder I MediaSource.
function getStreamCodec(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const w = window as unknown as { ManagedMediaSource?: typeof MediaSource; MediaSource?: typeof MediaSource };
  const MS = w.ManagedMediaSource || w.MediaSource;
  if (!MS || typeof MS.isTypeSupported !== 'function') return null;
  const candidates = [
    'video/mp4;codecs="avc1.42E01E"',
    'video/mp4;codecs="avc1.4D401E"',
    'video/mp4;codecs=h264',
    'video/mp4',
    'video/webm;codecs="vp9"',
    'video/webm;codecs="vp8"',
    'video/webm',
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c) && MS.isTypeSupported(c)) return c;
  }
  return null;
}

// Bitrate rosnacy z rozdzielczoscia, ktora faktycznie dostalismy od
// kamery — 1.5 Mbps na 720p wygladalo ok, ale to samo na 1080p+ (odkad
// getUserMedia prosi o wiecej niz 720p) wygladaloby gorzej niz przedtem.
// Progi orientacyjne, nie naukowe — H.264/VP8 przy typowej tresci selfie.
function bitrateForResolution(w: number, h: number): number {
  const px = w * h;
  // 720p 1.5 Mbps -> 3 Mbps: TEST, rozdzielczosc BEZ zmiany (patrz
  // REGRESJA 4K/1080p w pamieci projektu — to wylacznie proba samego
  // bitrate, nie kroku wstecz do wiekszej rozdzielczosci).
  if (px <= 1280 * 720) return 3_000_000;
  if (px <= 1920 * 1080) return 4_000_000;
  if (px <= 2560 * 1440) return 6_000_000;
  return 8_000_000; // 4K i wyzej
}

export default function DelayMirrorView({ onBack, onUpgrade, onOpenStats }: Props) {
  const { t } = useTranslation();
  const uid = auth.currentUser?.uid || '';

  // ─── Trening techniczny ────────────────────────────────────────────────
  // Strzaly licza sie seriami: kazda pauza / koniec serii dodaje `size`,
  // a strzaly wbite w analizie serii zastepuja te liczbe faktyczna.
  const [techDraft] = useState(() => loadTechDraft(uid));
  const [techOn, setTechOn] = useState(techDraft.on);
  const [techSize, setTechSize] = useState(techDraft.size);
  const [techArrows, setTechArrows] = useState(techDraft.arrows);
  const [techTopics, setTechTopics] = useState<string[]>(techDraft.topics);
  const [techNote, setTechNote] = useState(techDraft.note);
  const [showTechPanel, setShowTechPanel] = useState(false);
  const [showTechSummary, setShowTechSummary] = useState(false);
  const [isSavingTech, setIsSavingTech] = useState(false);
  const [techSaveError, setTechSaveError] = useState(false);
  const focusState = useCurrentFocus(uid);
  const activeFocus = focusState?.focus ?? null;
  const focusTopic = activeFocus?.topic || '';
  const techOnRef = useRef(techOn);
  useEffect(() => { techOnRef.current = techOn; }, [techOn]);
  const techSizeRef = useRef(techSize);
  useEffect(() => { techSizeRef.current = techSize; }, [techSize]);
  // Ile dodala ostatnia seria — analiza serii koryguje o roznice.
  const lastSeriesAddRef = useRef(0);
  // Seria liczy sie dopiero, gdy lustro choc raz weszlo na zywo od startu
  // albo wznowienia — pauza w trakcie buforowania to nie oddana seria.
  const liveReachedRef = useRef(false);

  useEffect(() => {
    if (!uid) return;
    try {
      const d: TechDraft = { on: techOn, size: techSize, arrows: techArrows, topics: techTopics, note: techNote, day: todayKey() };
      localStorage.setItem(`grotX_dmTech_${uid}`, JSON.stringify(d));
    } catch { /* ignore */ }
  }, [uid, techOn, techSize, techArrows, techTopics, techNote]);

  const countSeries = useCallback(() => {
    if (!techOnRef.current || !liveReachedRef.current) return;
    liveReachedRef.current = false;
    const n = techSizeRef.current;
    lastSeriesAddRef.current = n;
    setTechArrows(a => a + n);
  }, []);

  const toggleTech = () => {
    const next = !techOn;
    if (next && focusTopic) setTechTopics(prev => prev.length ? prev : [focusTopic]);
    setTechOn(next);
  };

  const resetTech = () => {
    setTechArrows(0);
    setTechTopics([]);
    setTechNote('');
    lastSeriesAddRef.current = 0;
  };

  const [isPremium, setIsPremium] = useState(false);
  const [delaySeconds, setDelaySeconds] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const n = parseInt(saved, 10);
        if (!isNaN(n) && n >= MIN_DELAY_S && n <= MAX_DELAY_S) return n;
      }
    } catch { /* ignore */ }
    return DEFAULT_DELAY_S;
  });
  const delayMsRef = useRef<number>(delaySeconds * 1000);
  // Tryb wybrany na ekranie startowym: czy w ogole zapisujemy klip.
  // false = samo lustro — pelny recorder i potok canvas w ogole nie powstaja,
  // wiec nie ma rosnacego bloba w RAM ani petli rAF rysujacej kazda klatke.
  const [clipMode, setClipMode] = useState<boolean>(() => {
    try { return localStorage.getItem(CLIP_STORAGE_KEY) === '1'; } catch { return false; }
  });
  // Tryb prosty vs ekspercki. Prosty to samo lustro: 15 s, poziomo, nic nie
  // zapisuje i nie pokazuje zadnych ustawien. Ekspercki odslania suwak
  // opoznienia, orientacje, nagrywanie i analize serii.
  const [expert, setExpert] = useState<boolean>(() => {
    try { return localStorage.getItem(EXPERT_STORAGE_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(EXPERT_STORAGE_KEY, expert ? '1' : '0'); } catch { /* ignore */ }
  }, [expert]);
  // Czy klip zbiera dane w tej chwili (REC uzbrojony i nie na pauzie).
  const [clipActive, setClipActive] = useState(false);
  // Czy w tej sesji powstal juz jakikolwiek material do klipu — decyduje,
  // czy "Zakoncz" prowadzi do powtorki, czy prosto do menu. Ref czyta
  // finishRecording (deps []), stan renderuje etykiete przycisku.
  const hasClipRef = useRef(false);
  const [hasClip, setHasClip] = useState(false);
  const [premiumLoading, setPremiumLoading] = useState(true);
  const [mirrorState, setMirrorState] = useState<MirrorState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [recSeconds, setRecSeconds] = useState(0);
  const [bufferMs, setBufferMs] = useState(0);
  const [isPortrait, setIsPortrait] = useState(
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false
  );

  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const delayedVideoRef = useRef<HTMLVideoElement>(null);
  const mseCleanupRef = useRef<(() => void) | null>(null);
  const mseRafRef = useRef<number | null>(null);
  // Pending MSE — czekamy az DOM zamontuje delayedVideoRef po przejsciu
  // ze stanu 'positioning' do 'buffering', dopiero potem odpalamy pipeline.
  const pendingMSERef = useRef<{ stream: MediaStream; codec: string } | null>(null);
  const [showSetupInstructions, setShowSetupInstructions] = useState(false);
  // Zoom (szerokokat 0.5x na frontowej) — zalezy od track capabilities.
  // Wsparcie: Chrome Android na flagowcach z front ultra-wide. iOS Safari i
  // wiekszosc telefonow bez ultra-wide po prostu nie wystawi zoom < 1 i UI
  // sie nie pokaze.
  const [zoomCaps, setZoomCaps] = useState<{ min: number; max: number; step: number } | null>(null);
  const [cameraZoom, setCameraZoom] = useState<number>(1);
  const [showDelayPicker, setShowDelayPicker] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  // Ref dla petli rysujacej nagranie — siatke mozna przelaczac w trakcie
  const showGridRef = useRef(showGrid);
  useEffect(() => { showGridRef.current = showGrid; }, [showGrid]);
  const [recordingPaused, setRecordingPaused] = useState(false);
  // Pauza bez klipu ma dwie fazy. Po wcisnieciu w buforze siedzi jeszcze
  // material, ktorego user nie widzial — 'draining' dogrywa go z odliczaniem,
  // dopiero potem 'frozen' zatrzymuje obraz na stop-klatce. Z klipem
  // ('Passę zakończ') idziemy prosto do 'frozen' — patrz toggleRecordingPause.
  const [pausePhase, setPausePhase] = useState<PausePhase>('none');
  const pausePhaseRef = useRef<PausePhase>('none');
  useEffect(() => { pausePhaseRef.current = pausePhase; }, [pausePhase]);
  useEffect(() => { recordingPausedRef.current = recordingPaused; }, [recordingPaused]);
  // Analiza otwiera sie na stop-klatce. Z klipem to moment wcisniecia
  // przycisku, bo ogon bufora czeka w pliku, nie na ekranie.
  useEffect(() => {
    if (pausePhase === 'frozen' && hasClipRef.current) setShowSeries(true);
  }, [pausePhase]);
  const [drainMs, setDrainMs] = useState(0);
  const drainTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Analiza serii (tarcza + wbijanie strzal). Otwiera sie po zamrozeniu
  // obrazu, ale tylko w trybie z nagraniem — w samym lustrze nie ma klipu,
  // do ktorego te strzaly mialyby sie odnosic.
  const [showSeries, setShowSeries] = useState(false);
  // Podsumowanie passy: nagranie tej passy + tarcza z wbitymi strzalami.
  // Draft moze byc null — user mogl pominac analize i chciec samo wideo.
  const [showPassReview, setShowPassReview] = useState(false);
  const [passDraft, setPassDraft] = useState<TechSeriesDraft | null>(null);
  // Id wpisu w localStorage — po nim dopisujemy czasy z osi czasu.
  const passDraftIdRef = useRef<string | null>(null);
  // Refy dla handlera visibilitychange — ten efekt nie zalezy od tych stanow,
  // wiec bez refow czytalby wartosci z momentu podpiecia.
  const showSeriesRef = useRef(false);
  useEffect(() => { showSeriesRef.current = showSeries; }, [showSeries]);
  const recordingPausedRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const activeRecorderRef = useRef<MediaRecorder | null>(null);
  // Ustawiany raz po getUserMedia wg realnej rozdzielczosci toru — patrz
  // bitrateForResolution. Czytaja go oba recordery (MSE i pelny klip).
  const videoBitrateRef = useRef<number>(3_000_000);
  const isPausedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bufferTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);
  // Drugi, ciągły recorder — nagrywa całą sesję od startu do pauzy/stopu
  // równolegle z segmentowym loopem. Dzięki temu "Udostępnij" daje pełny
  // filmik, nie tylko ostatnie 15s.
  const fullRecorderRef = useRef<MediaRecorder | null>(null);
  const fullChunksRef = useRef<BlobPart[]>([]);
  const fullMimeRef = useRef<string>('video/webm');
  // Cleanup pipeline'u canvas-rotate (tryb poziomy): rAF + hidden video + canvas stream
  const rotateCleanupRef = useRef<(() => void) | null>(null);
  const [lastBlob, setLastBlob] = useState<Blob | null>(null);

  // Persist delay setting + sync ref
  useEffect(() => {
    delayMsRef.current = delaySeconds * 1000;
    // Jedno ustawienie wspolne dla obu trybow — 15 s jest wartoscia
    // poczatkowa, nie ograniczeniem trybu prostego.
    try { localStorage.setItem(STORAGE_KEY, String(delaySeconds)); } catch { /* ignore */ }
  }, [delaySeconds]);

  // Persist wybor trybu nagrywania
  useEffect(() => {
    try { localStorage.setItem(CLIP_STORAGE_KEY, clipMode ? '1' : '0'); } catch { /* ignore */ }
  }, [clipMode]);

  // PRO gate
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) { setPremiumLoading(false); return; }
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        const bought = d.isPremium || false;
        const promo = d.isPremiumPromo || false;
        const trial = d.trialEndsAt ? new Date(d.trialEndsAt).getTime() > Date.now() : false;
        setIsPremium(bought || promo || trial);
      }
      setPremiumLoading(false);
    });
    return () => unsub();
  }, []);

  // Orientation — tylko portrait/landscape z rozmiaru viewportu
  useEffect(() => {
    const update = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  // Manualny override rotacji — przycisk pion/poziom. Domyslnie poziomo:
  // to jedyna orientacja, w ktorej lucznik faktycznie nagrywa (telefon
  // stoi na statywie pionowo, obraz i tak leci przez force-rotate).
  const [manualLandscape, setManualLandscape] = useState(true);
  // Czy user wybral juz orientacje na ekranie idle (warunek odblokowania Start).
  // Poziomo jest domyslne, wiec ekran startowy nie musi juz o to pytac.
  const [orientationConfirmed, setOrientationConfirmed] = useState(true);

  const cleanup = useCallback(() => {
    isPausedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    if (bufferTimerRef.current) clearInterval(bufferTimerRef.current);
    if (drainTimerRef.current) clearInterval(drainTimerRef.current);
    timerRef.current = null;
    bufferTimerRef.current = null;
    drainTimerRef.current = null;
    setPausePhase('none');
    pausePhaseRef.current = 'none';
    setDrainMs(0);
    try {
      if (activeRecorderRef.current && activeRecorderRef.current.state !== 'inactive') {
        activeRecorderRef.current.stop();
      }
    } catch { /* ignore */ }
    activeRecorderRef.current = null;
    try {
      const fr = fullRecorderRef.current;
      if (fr && fr.state !== 'inactive') fr.stop();
    } catch { /* ignore */ }
    fullRecorderRef.current = null;
    fullChunksRef.current = [];
    setClipActive(false);
    hasClipRef.current = false;
    setHasClip(false);
    if (rotateCleanupRef.current) {
      try { rotateCleanupRef.current(); } catch { /* ignore */ }
      rotateCleanupRef.current = null;
    }
    setLastBlob(null);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (mseRafRef.current !== null) {
      cancelAnimationFrame(mseRafRef.current);
      mseRafRef.current = null;
    }
    if (mseCleanupRef.current) {
      try { mseCleanupRef.current(); } catch { /* ignore */ }
      mseCleanupRef.current = null;
    }
    if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
    if (delayedVideoRef.current) {
      delayedVideoRef.current.pause();
      delayedVideoRef.current.removeAttribute('src');
      delayedVideoRef.current.load();
    }
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // Przypisz strumień do live video ZA KAŻDYM RAZEM gdy video się
  // zrenderuje (np. po zmianie stanu na 'buffering'/'live', albo
  // po rotacji która remontuje drzewo). Bez tego ref jest null w momencie
  // wywołania getUserMedia i PiP pozostaje czarny.
  useEffect(() => {
    if (mirrorState === 'positioning' && liveVideoRef.current && streamRef.current) {
      liveVideoRef.current.srcObject = streamRef.current;
      liveVideoRef.current.play().catch(() => { /* autoplay może odmówić */ });
    }
  }, [mirrorState, isPortrait]);

  // Auto-pause on background
  useEffect(() => {
    const onVisibility = () => {
      // Wstrzymana sesja NIE moze ginac w tle: user idzie z telefonem do
      // tarczy wbic strzaly, ekran po drodze gasnie. Przed tym warunkiem
      // wracal do menu i traci cala serie.
      if (recordingPausedRef.current || showSeriesRef.current) return;
      if (document.hidden && (mirrorState === 'live' || mirrorState === 'buffering')) {
        finishRecording();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mirrorState]);

  // MSE pipeline — jeden ciagly stream, brak segmentow.
  const runMSE = useCallback((stream: MediaStream, mimeType: string) => {
    const video = delayedVideoRef.current;
    if (!video) return;

    setMirrorState('buffering');
    setBufferMs(0);

    const w = window as unknown as { ManagedMediaSource?: typeof MediaSource; MediaSource?: typeof MediaSource };
    const MSCtor = w.ManagedMediaSource || w.MediaSource;
    if (!MSCtor) {
      setErrorMsg('MediaSource API niedostepny');
      setMirrorState('error');
      return;
    }
    const ms = new MSCtor();
    const objUrl = URL.createObjectURL(ms);
    if (currentBlobUrlRef.current) URL.revokeObjectURL(currentBlobUrlRef.current);
    currentBlobUrlRef.current = objUrl;

    // disableRemotePlayback — wymagane przez ManagedMediaSource (iOS 17.1+)
    const v = video as HTMLVideoElement & { disableRemotePlayback?: boolean };
    v.disableRemotePlayback = true;
    video.src = objUrl;
    video.muted = true;

    let sb: SourceBuffer | null = null;
    let recorder: MediaRecorder | null = null;
    let stopped = false;
    let switchedToLive = false;
    const queue: ArrayBuffer[] = [];

    const pump = () => {
      if (stopped || !sb || sb.updating || queue.length === 0) return;
      const chunk = queue.shift()!;
      try { sb.appendBuffer(chunk); } catch { /* QuotaExceeded — drop */ }
    };

    const onUpdateEnd = () => {
      if (stopped || !sb) return;
      // Eviction: trzymaj okno ~ delay + 10s, usuwaj starsze.
      try {
        if (sb.buffered.length > 0) {
          const startB = sb.buffered.start(0);
          const endB = sb.buffered.end(sb.buffered.length - 1);
          const keep = (delayMsRef.current / 1000) + 10;
          if (endB - startB > keep + 5 && !sb.updating) {
            sb.remove(startB, endB - keep);
            return; // dalszy pump po kolejnym updateend
          }
        }
      } catch { /* ignore */ }
      pump();
    };

    const onSourceOpen = () => {
      try {
        sb = ms.addSourceBuffer(mimeType);
        sb.mode = 'sequence';
        sb.addEventListener('updateend', onUpdateEnd);
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        setErrorMsg(`SourceBuffer: ${m}`);
        setMirrorState('error');
        return;
      }

      try {
        recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: videoBitrateRef.current });
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        setErrorMsg(`MediaRecorder: ${m}`);
        setMirrorState('error');
        return;
      }
      recorder.ondataavailable = (e) => {
        if (!e.data || e.data.size === 0 || stopped) return;
        e.data.arrayBuffer().then((buf) => {
          if (stopped) return;
          queue.push(buf);
          pump();
        }).catch(() => { /* ignore */ });
      };
      // 500ms timeslice — Android Chrome MSE preferuje wieksze chunki,
      // mniej updateend events = mniej szansy na decoder hiccup.
      recorder.start(500);
      activeRecorderRef.current = recorder;
    };
    ms.addEventListener('sourceopen', onSourceOpen, { once: true });

    // Inicjalny seek raz: gdy buffer >= delay, ustaw currentTime = liveEnd-delay
    // i zacznij play. Pozniej NIE ruszamy playbackRate ani currentTime —
    // decoder gra 1x, recorder produkuje 1x, delay sam sie utrzymuje.
    // Korekta drftu byla zrodlem mikro-cofniec na Android.
    const tick = () => {
      mseRafRef.current = requestAnimationFrame(tick);
      // W pauzie pętla musi milczeć. Bez tego "pilnowanie autoplay" ponizej
      // wciska play z powrotem w kazdej klatce i pauza jest nie do zauwazenia.
      if (stopped || isPausedRef.current || pausePhaseRef.current !== 'none') return;
      if (!sb || !delayedVideoRef.current) return;
      const vid = delayedVideoRef.current;
      let buffered: TimeRanges;
      try { buffered = sb.buffered; } catch { return; }
      if (buffered.length === 0) return;
      const endB = buffered.end(buffered.length - 1);
      const startB = buffered.start(0);
      const delaySec = delayMsRef.current / 1000;
      setBufferMs(Math.min(delayMsRef.current, Math.round(endB * 1000)));

      if (!switchedToLive) {
        if (endB >= delaySec) {
          const tgt = Math.max(startB, endB - delaySec);
          vid.currentTime = tgt;
          const p = vid.play();
          if (p && typeof p.catch === 'function') p.catch(() => { /* ignore */ });
          switchedToLive = true;
          liveReachedRef.current = true;
          setMirrorState('live');
        }
        return;
      }

      // Po przejsciu na live tylko pilnuj autoplay (gdyby system zatrzymal).
      if (vid.paused) {
        const p = vid.play();
        if (p && typeof p.catch === 'function') p.catch(() => { /* ignore */ });
      }
    };
    mseRafRef.current = requestAnimationFrame(tick);

    // Twardy fallback: gdy video naprawde stalluje (waiting > 1.5s),
    // przeskocz na live edge - delay. Nie ruszamy w innych sytuacjach.
    let waitingTimer: ReturnType<typeof setTimeout> | null = null;
    const onWaiting = () => {
      if (waitingTimer) return;
      waitingTimer = setTimeout(() => {
        waitingTimer = null;
        // Ten sam powod co w tick(): w pauzie nie wolno wznawiac gry,
        // bo fallback rozjechalby stop-klatke.
        if (stopped || pausePhaseRef.current !== 'none') return;
        if (!sb || !delayedVideoRef.current) return;
        const vid2 = delayedVideoRef.current;
        try {
          if (sb.buffered.length === 0) return;
          const endB2 = sb.buffered.end(sb.buffered.length - 1);
          const startB2 = sb.buffered.start(0);
          vid2.currentTime = Math.max(startB2, endB2 - delayMsRef.current / 1000);
          const p = vid2.play();
          if (p && typeof p.catch === 'function') p.catch(() => { /* ignore */ });
        } catch { /* ignore */ }
      }, 1500);
    };
    const onPlaying = () => {
      if (waitingTimer) { clearTimeout(waitingTimer); waitingTimer = null; }
    };
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);

    mseCleanupRef.current = () => {
      stopped = true;
      if (waitingTimer) { clearTimeout(waitingTimer); waitingTimer = null; }
      try { video.removeEventListener('waiting', onWaiting); } catch { /* ignore */ }
      try { video.removeEventListener('playing', onPlaying); } catch { /* ignore */ }
      try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch { /* ignore */ }
      recorder = null;
      try { if (sb) sb.removeEventListener('updateend', onUpdateEnd); } catch { /* ignore */ }
      try { if (ms.readyState === 'open') ms.endOfStream(); } catch { /* ignore */ }
      sb = null;
    };
  }, []);

  // Zoom capability detection — sprawdz czy track obsluguje zoom < 1
  // (= ultra-wide na froncie). Wsparcie: Chrome Android, niektore flagowce.
  const detectZoomCaps = useCallback((stream: MediaStream) => {
    try {
      const track = stream.getVideoTracks()[0];
      if (!track || !('getCapabilities' in track)) {
        setZoomCaps(null);
        return;
      }
      const caps = track.getCapabilities() as MediaTrackCapabilities & { zoom?: { min: number; max: number; step: number } };
      const settings = track.getSettings() as MediaTrackSettings & { zoom?: number };
      if (caps.zoom && typeof caps.zoom.min === 'number' && caps.zoom.min < 1) {
        setZoomCaps({ min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1 });
        setCameraZoom(settings.zoom ?? 1);
      } else {
        setZoomCaps(null);
      }
    } catch {
      setZoomCaps(null);
    }
  }, []);

  // Krok 1: pobierz kamere i pokaz live preview (positioning).
  // Druga klatka <video> z liveVideoRef jest aktywna TYLKO w tym kroku
  // — pozniej ja wylaczamy zeby nie konkurowala z MSE decoderem (na
  // Androidzie dwa <video> z tym samym streamem powodowaly klatkowanie).
  const startRecording = useCallback(async () => {
    setMirrorState('requesting');
    setErrorMsg('');

    const streamCodec = getStreamCodec();
    const fullCodec = getFullCodec();
    if (!streamCodec || !fullCodec) {
      setMirrorState('unsupported');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // PROBOWANE i WYCOFANE: ideal 3840x2160, potem 1920x1080 — obie
        // wersje wywalaly aplikacje na buforowaniu (czarny ekran, potem
        // crash). To znaczy, ze problem NIE jest w konkretnej liczbie, a w
        // samym fakcie zadania wyzszej rozdzielczosci na tym pipeline (dwa
        // rownolegle kodery z tego samego strumienia — MSE podglad +
        // canvas pelnego klipu). Wraca do 1280x720, jedynej wartosci
        // potwierdzonej jako stabilna. NIE zwiekszac bez najpierw
        // przetestowania osobno samego bitrate (bez zmiany rozdzielczosci).
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      setErrorMsg(e.name === 'NotAllowedError' ? t('delayMirror.permissionDenied') : `${t('delayMirror.cameraError')}: ${e.message || '?'}`);
      setMirrorState('error');
      return;
    }

    streamRef.current = stream;
    isPausedRef.current = false;
    // Bitrate MUSI rosnac z rozdzielczoscia, ktora faktycznie dostalismy —
    // 1.5 Mbps na 1080p+ wygladaloby gorzej niz przedtem na 720p, mimo
    // wiekszej rozdzielczosci. Odczyt z realnych ustawien toru, nie z
    // `ideal` powyzej (telefon moze dac mniej niz poprosilismy).
    try {
      const settings = stream.getVideoTracks()[0]?.getSettings();
      if (settings?.width && settings?.height) {
        videoBitrateRef.current = bitrateForResolution(settings.width, settings.height);
      }
    } catch { /* ignore */ }
    detectZoomCaps(stream);
    setMirrorState('positioning');
  }, [t, detectZoomCaps]);

  const applyZoom = useCallback(async (value: number) => {
    const stream = streamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] });
      setCameraZoom(value);
    } catch { /* ignore — niektore telefony odrzucaja srodkowe wartosci */ }
  }, []);

  // Potok klipu: canvas (rotacja + wypalona siatka) -> MediaRecorder.
  // Wydzielony z beginDelayedRecording, bo startuje albo razem z sesja
  // (tryb "Lustro + nagranie"), albo dopiero gdy user uzbroi REC w trakcie.
  // W trybie samego lustra nie powstaje wcale — nie ma ani rosnacego bloba
  // w RAM, ani petli rAF przerysowujacej kazda klatke.
  const startClipPipeline = useCallback(() => {
    const stream = streamRef.current;
    const fullCodec = getFullCodec();
    if (!stream || !fullCodec) return;
    if (fullRecorderRef.current) return; // juz leci
    try {
      fullChunksRef.current = [];
      fullMimeRef.current = fullCodec.split(';')[0];
      const startFullRec = (recStream: MediaStream) => {
        const fullRec = new MediaRecorder(recStream, { mimeType: fullCodec, videoBitsPerSecond: videoBitrateRef.current });
        fullRec.ondataavailable = (e) => { if (e.data && e.data.size > 0) fullChunksRef.current.push(e.data); };
        // Brak timeslice — encoder produkuje jeden kompletny plik z prawidlowym
        // moov/duration zamiast fragmentow fMP4. Rozwiazuje problem iOS/WhatsApp
        // gdzie timeslice=1000ms dawalo moov z duration ~3s.
        fullRec.start();
        fullRecorderRef.current = fullRec;
        hasClipRef.current = true;
        setHasClip(true);
        setClipActive(true);
      };
      // Pelny recorder ZAWSZE nagrywa z canvasa (nie z surowego streamu):
      // 1. Tryb poziomy przy zablokowanym portrait: kamera daje klatki pionowe,
      //    a UI tylko obraca je CSS-em — plik bez obrotu bylby polozony na boku.
      // 2. Siatka pozycjonowania: wypalana w klatki gdy wlaczona (mozna
      //    przelaczac w trakcie nagrania — czytamy ref, nie state).
      const rotateFile = manualLandscape && isPortrait;
      const hv = document.createElement('video');
      hv.muted = true;
      hv.playsInline = true;
      hv.srcObject = stream;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      let raf = 0;
      const draw = () => {
        raf = requestAnimationFrame(draw);
        if (!ctx || hv.videoWidth === 0) return;
        const doRotate = rotateFile && hv.videoHeight > hv.videoWidth;
        const cw = doRotate ? hv.videoHeight : hv.videoWidth;
        const ch = doRotate ? hv.videoWidth : hv.videoHeight;
        if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
        if (doRotate) {
          ctx.save();
          ctx.translate(cw, 0);
          ctx.rotate(Math.PI / 2);
          ctx.drawImage(hv, 0, 0);
          ctx.restore();
        } else {
          ctx.drawImage(hv, 0, 0);
        }
        if (showGridRef.current) drawGridOnCanvas(ctx, cw, ch);
        // Znak marki ZAWSZE — klip ma byc rozpoznawalny po udostepnieniu.
        drawBrandOnCanvas(ctx, cw, ch);
      };
      // Recorder startuje dopiero gdy znamy wymiary klatki — inaczej
      // pierwsze chunki mialyby domyslny rozmiar canvasa 300x150.
      hv.onloadedmetadata = () => {
        if (rotateCleanupRef.current === null) return; // pauza zanim kamera ruszyla
        draw();
        const cStream = canvas.captureStream(30);
        startFullRec(cStream);
        const prevCleanup = rotateCleanupRef.current;
        rotateCleanupRef.current = () => {
          prevCleanup();
          cStream.getTracks().forEach(tr => tr.stop());
        };
      };
      rotateCleanupRef.current = () => {
        cancelAnimationFrame(raf);
        hv.pause();
        hv.srcObject = null;
      };
      hv.play().catch(() => { /* autoplay — i tak rysujemy z rAF */ });
      setLastBlob(null);
    } catch { /* ignore — MSE delay nadal dziala */ }
  }, [manualLandscape, isPortrait]);

  // Krok 2: po kliknieciu "Start" w positioning — odlacz live preview,
  // odpal MSE pipeline i (tylko w trybie z nagraniem) potok klipu.
  const beginDelayedRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const streamCodec = getStreamCodec();
    const fullCodec = getFullCodec();
    if (!streamCodec || !fullCodec) {
      setMirrorState('unsupported');
      return;
    }

    // Odepnij live preview <video> ZANIM odpalimy MSE — zeby decoder
    // mial stream tylko dla siebie.
    if (liveVideoRef.current) {
      liveVideoRef.current.pause();
      liveVideoRef.current.srcObject = null;
    }

    if (clipMode) startClipPipeline();

    liveReachedRef.current = false;
    setRecSeconds(0);
    timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);

    // Stan -> buffering, runMSE odpalamy w useEffect po commit (delayedVideoRef
    // dopiero wtedy bedzie zamontowany).
    pendingMSERef.current = { stream, codec: streamCodec };
    setMirrorState('buffering');
    setBufferMs(0);
  }, [clipMode, startClipPipeline]);

  useEffect(() => {
    if (mirrorState === 'buffering' && pendingMSERef.current && delayedVideoRef.current) {
      const { stream, codec } = pendingMSERef.current;
      pendingMSERef.current = null;
      runMSE(stream, codec);
    }
  }, [mirrorState, runMSE]);

  // Konczy sesje: zatrzymuje kamere, MSE i klip. Nazwa celowo bez slowa
  // "pause" — chwilowa pauza to osobne `toggleRecordingPause`.
  const finishRecording = useCallback(() => {
    // Wyjscie w trakcie strzelania konczy tez biezaca serie.
    if (!recordingPausedRef.current) countSeries();
    isPausedRef.current = true;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (bufferTimerRef.current) { clearInterval(bufferTimerRef.current); bufferTimerRef.current = null; }
    if (drainTimerRef.current) { clearInterval(drainTimerRef.current); drainTimerRef.current = null; }
    setPausePhase('none');
    pausePhaseRef.current = 'none';
    setDrainMs(0);
    if (mseRafRef.current !== null) { cancelAnimationFrame(mseRafRef.current); mseRafRef.current = null; }
    if (mseCleanupRef.current) {
      try { mseCleanupRef.current(); } catch { /* ignore */ }
      mseCleanupRef.current = null;
    }
    try {
      if (activeRecorderRef.current && activeRecorderRef.current.state !== 'inactive') {
        activeRecorderRef.current.stop();
      }
    } catch { /* ignore */ }
    activeRecorderRef.current = null;
    // Zatrzymaj pełny recorder — po onstop scalimy chunki w jeden blob
    try {
      const fr = fullRecorderRef.current;
      if (fr && fr.state !== 'inactive') {
        fr.onstop = () => {
          if (fullChunksRef.current.length > 0) {
            setLastBlob(new Blob(fullChunksRef.current, { type: fullMimeRef.current }));
          }
          // Canvas-rotate pipeline zwalniamy dopiero po flushu recordera
          if (rotateCleanupRef.current) {
            try { rotateCleanupRef.current(); } catch { /* ignore */ }
            rotateCleanupRef.current = null;
          }
        };
        fr.stop();
      } else if (rotateCleanupRef.current) {
        try { rotateCleanupRef.current(); } catch { /* ignore */ }
        rotateCleanupRef.current = null;
      }
    } catch { /* ignore */ }
    fullRecorderRef.current = null;
    setClipActive(false);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
    delayedVideoRef.current?.pause();
    setRecordingPaused(false);
    // Bez klipu nie ma czego ogladac — wracamy prosto do menu startowego.
    setMirrorState(hasClipRef.current ? 'review' : 'idle');
  }, [countSeries]);

  // Zamyka klip biezacej passy jako KOMPLETNY plik. Recorder jedzie bez
  // timeslice (patrz startClipPipeline), wiec dane wychodza dopiero na
  // stop() — bez tego nie ma czego pokazac zaraz po passie.
  // requestData() odpada: na iOS daje fragmentowany MP4 z popsutym moov,
  // czyli dokladnie ten blad, ktory rezygnacja z timeslice naprawila.
  // Refy zerujemy SYNCHRONICZNIE, zeby restart potoku po wznowieniu nie
  // trafil na stary recorder; potok canvasa gasimy dopiero po flushu.
  const closePassClip = useCallback(() => {
    const fr = fullRecorderRef.current;
    fullRecorderRef.current = null;
    const cleanupCanvas = rotateCleanupRef.current;
    rotateCleanupRef.current = null;
    try {
      if (fr && fr.state !== 'inactive') {
        fr.onstop = () => {
          if (fullChunksRef.current.length > 0) {
            setLastBlob(new Blob(fullChunksRef.current, { type: fullMimeRef.current }));
          }
          if (cleanupCanvas) { try { cleanupCanvas(); } catch { /* ignore */ } }
        };
        fr.stop();
        return;
      }
    } catch { /* ignore */ }
    if (cleanupCanvas) { try { cleanupCanvas(); } catch { /* ignore */ } }
  }, []);

  // PAUZA ("idę po strzały") / KONIEC PASY. Odcinamy doplyw nowych klatek,
  // a potem zalezy od trybu: z klipem obraz staje od razu ('frozen'), bo
  // ogon bufora jest juz w pliku; bez klipu dogrywamy go najpierw z
  // odliczaniem ('draining'), bo inaczej przepadlby bezpowrotnie.
  // WZNOWIENIE odbudowuje pipeline od zera — bufor napelnia sie na nowo,
  // dokladnie ta sama sciezka co przy starcie sesji.
  const toggleRecordingPause = useCallback(() => {
    const vid = delayedVideoRef.current;

    if (!recordingPaused) {
      countSeries();
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      // Odetnij doplyw do MSE — bufor przestaje rosnac, wiec konczy sie
      // dokladnie na momencie wcisniecia pauzy.
      try {
        const ar = activeRecorderRef.current;
        if (ar && ar.state === 'recording') ar.pause();
      } catch { /* ignore */ }
      // Klip zatrzymuje sie na momencie wcisniecia — ogon, ktory user
      // wlasnie oglada, jest juz w pliku.
      try { fullRecorderRef.current?.pause(); } catch { /* nie wszystkie przegladarki wspieraja */ }

      setRecordingPaused(true);

      if (drainTimerRef.current) clearInterval(drainTimerRef.current);
      const freeze = () => {
        if (drainTimerRef.current) { clearInterval(drainTimerRef.current); drainTimerRef.current = null; }
        // Ref PRZED pause(): petla MSE sprawdza go przy kazdej klatce i bez
        // tego zdazylaby wznowic odtwarzanie tuz po zatrzymaniu.
        pausePhaseRef.current = 'frozen';
        try { delayedVideoRef.current?.pause(); } catch { /* ignore */ }
        setDrainMs(0);
        setPausePhase('frozen');
      };

      // Z klipem („Passę zakończ”) obraz staje NATYCHMIAST. Ogon bufora nie
      // przepada — siedzi w pliku klipu, wiec user obejrzy go w analizie
      // i w powtorce. Dogrywanie go tutaj na zywo tylko kazaloby czekac
      // cale okno opoznienia przed ekranem wpisywania strzal.
      // Bez klipu dogrywanie zostaje: tam bufor to jedyna szansa, zeby
      // w ogole zobaczyc ostatnie strzaly.
      if (hasClipRef.current) {
        freeze();
        // Passa konczy sie wlasnym, kompletnym plikiem — to on leci na
        // ekran podsumowania obok tarczy.
        closePassClip();
        return;
      }

      setPausePhase('draining');
      pausePhaseRef.current = 'draining';

      const started = Date.now();
      const hardStopMs = delayMsRef.current + 4000; // bezpiecznik na stall
      drainTimerRef.current = setInterval(() => {
        const v2 = delayedVideoRef.current;
        if (!v2) { freeze(); return; }
        // Pauza wcisnieta jeszcze w buforowaniu: obraz nie gra, wiec nie ma
        // czego dogrywac — zamrazamy od razu zamiast czekac na bezpiecznik.
        if (v2.paused) { freeze(); return; }
        let end = 0;
        try { end = v2.buffered.length ? v2.buffered.end(v2.buffered.length - 1) : 0; } catch { /* ignore */ }
        const remain = Math.max(0, end - v2.currentTime);
        setDrainMs(Math.round(remain * 1000));
        if (remain <= 0.25 || Date.now() - started > hardStopMs) freeze();
      }, 200);
      return;
    }

    // ─── Wznowienie ───────────────────────────────────────────────────────
    if (drainTimerRef.current) { clearInterval(drainTimerRef.current); drainTimerRef.current = null; }
    setDrainMs(0);
    setPausePhase('none');
    pausePhaseRef.current = 'none';

    // Zburz stary pipeline MSE i zbuduj od nowa — bufor napelnia sie
    // od zera, zamiast wznawiac gre ze starego, juz nieaktualnego okna.
    if (mseRafRef.current !== null) { cancelAnimationFrame(mseRafRef.current); mseRafRef.current = null; }
    if (mseCleanupRef.current) {
      try { mseCleanupRef.current(); } catch { /* ignore */ }
      mseCleanupRef.current = null;
    }
    activeRecorderRef.current = null;
    if (vid) {
      try { vid.pause(); vid.removeAttribute('src'); vid.load(); } catch { /* ignore */ }
    }

    // Wznawiamy klip TYLKO jesli byl uzbrojony przed pauza — inaczej pauza
    // po wylaczeniu REC po cichu wlaczylaby nagrywanie z powrotem.
    if (clipActive) {
      if (fullRecorderRef.current) {
        try { fullRecorderRef.current.resume(); } catch { /* ignore */ }
      } else {
        // Passa zostala zamknieta jako osobny plik (closePassClip), wiec
        // nastepna dostaje wlasny potok od zera. Bez tego recorder jest juz
        // 'inactive' i kolejne passy nie nagralyby sie wcale.
        startClipPipeline();
      }
    }

    setRecordingPaused(false);
    setBufferMs(0);
    liveReachedRef.current = false;
    // Kazde wznowienie z klipem startuje NOWA passe (closePassClip zawsze
    // zamyka poprzedni plik i zeruje fullRecorderRef PRZED tym momentem —
    // patrz komentarz wyzej), wiec licznik tez musi wrocic do zera. Bez
    // tego pokazywal czas z KONCA poprzedniej passy i liczyl dalej od niego,
    // mimo ze to juz zupelnie nowy plik.
    setRecSeconds(0);
    timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);

    // runMSE wolane wprost, nie przez pendingMSERef: gdyby pauza wypadla
    // jeszcze w trakcie buforowania, setMirrorState('buffering') nie zmienia
    // stanu i useEffect by nie wystartowal.
    const stream = streamRef.current;
    const codec = getStreamCodec();
    if (stream && codec) runMSE(stream, codec);
  }, [recordingPaused, clipActive, runMSE, closePassClip, startClipPipeline, countSeries]);

  // Zapis analizy serii. Celowo localStorage, nie Firestore: nowa kolekcja
  // wymagalaby wdrozenia regul, a bez nich zapis cicho odbija. Ksztalt jest
  // docelowy, wiec przeniesienie do Firestore przy ekranie ze znacznikami
  // to podmiana samego zapisu.
  const seriesKey = () => `grotX_techSeries_${auth.currentUser?.uid || 'anon'}`;

  // Zapis od razu po wbiciu strzal, nie na wyjsciu z podsumowania: gdyby
  // apka zginela w tle na ekranie powtorki, seria przepadlaby w calosci.
  // Zwracane id sluzy pozniejszemu dopisaniu czasow z osi.
  const saveSeriesDraft = useCallback((draft: TechSeriesDraft): string => {
    const id = `${Date.now()}`;
    try {
      const key = seriesKey();
      const prev = JSON.parse(localStorage.getItem(key) || '[]');
      prev.push({ ...draft, id, createdAt: new Date().toISOString() });
      // Trzymamy ostatnie 50 serii — to kilkadziesiat kB, nie ma po co wiecej.
      localStorage.setItem(key, JSON.stringify(prev.slice(-50)));
    } catch { /* ignore — brak miejsca nie moze wywalic sesji */ }
    return id;
  }, []);

  // Dopisanie `tMs` po oznaczeniu strzal na osi. Podmieniamy wpis po id,
  // a nie dokladamy drugi — inaczej kazde stukniecie robiloby nowa serie.
  const updateSeriesShots = useCallback((id: string, shots: TechShot[]) => {
    try {
      const key = seriesKey();
      const prev = JSON.parse(localStorage.getItem(key) || '[]');
      const i = prev.findIndex((e: { id?: string }) => e.id === id);
      if (i < 0) return;
      prev[i] = { ...prev[i], shots };
      localStorage.setItem(key, JSON.stringify(prev));
    } catch { /* ignore */ }
  }, []);

  const resumeMirror = useCallback(() => {
    setMirrorState('idle');
    setBufferMs(0);
    setRecSeconds(0);
    setLastBlob(null);
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
    startRecording();
  }, [startRecording]);

  // Kazde wyjscie z narzedzia idzie tedy: z policzonymi strzalami najpierw
  // podsumowanie treningu technicznego, zeby nic nie zapisalo sie przypadkiem.
  const requestExit = useCallback(() => {
    cleanup();
    if (techOn && techArrows > 0) {
      setMirrorState('idle');
      setShowTechPanel(false);
      setTechSaveError(false);
      setShowTechSummary(true);
      return;
    }
    onBack();
  }, [cleanup, onBack, techOn, techArrows]);

  const stopMirror = requestExit;

  const saveTech = async () => {
    if (!uid) return;
    setIsSavingTech(true);
    setTechSaveError(false);
    try {
      await saveTechnicalSession(uid, { arrows: techArrows, note: techNote.trim(), topics: techTopics, focusState, source: 'DELAY_MIRROR' });
      resetTech();
      setShowTechSummary(false);
      (onOpenStats ?? onBack)();
    } catch (e) {
      console.error('Delay Mirror: zapis treningu technicznego', e);
      setTechSaveError(true);
    } finally {
      setIsSavingTech(false);
    }
  };

  const discardTech = () => {
    resetTech();
    setShowTechSummary(false);
    onBack();
  };

  // End session — zostan w DelayMirror, wroc do menu idle (zachowaj
  // wybrana orientacje, zeby user nie musial znow klikac).
  const endSession = useCallback(() => {
    cleanup();
    setBufferMs(0);
    setRecSeconds(0);
    isPausedRef.current = false;
    setMirrorState('idle');
  }, [cleanup]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const bufferPct = Math.round((bufferMs / delayMsRef.current) * 100);

  // ─── Rotation wrapper ──────────────────────────────────────────────────────
  // Strategia: kamera (background <video>) NIE rotuje się — zostaje w natywnej
  // orientacji żeby stream nie był zniekształcony. UI overlays (zegar, przyciski,
  // PiP, pause menu) rotują się gdy user wcisnął landscape w portretowym viewporcie.
  // Dzięki temu po obróceniu telefonu fizycznie (browser zablokowany w portrait)
  // user widzi UI poprawnie zorientowane, a kamera pokazuje to co fizycznie widzi.
  const _uiForceRotate = manualLandscape && isPortrait;
  const _displayAsLandscape = !isPortrait || manualLandscape;
  const liveAspect = _displayAsLandscape ? '16/9' : '9/16';
  const screenStyle: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 50 };
  // Wrapper na UI overlays — opcjonalnie rotowany.
  const uiRotateStyle: React.CSSProperties = _uiForceRotate
    ? {
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: '100vh',
        height: '100vw',
        transform: 'translate(-50%, -50%) rotate(90deg)',
        transformOrigin: 'center center',
      }
    : { position: 'absolute', inset: 0 };

  // Toggle pion/poziom — renderowany POZA rotującym kontenerem (jako sibling
  // w fragmencie), dzięki czemu zawsze siedzi w tym samym fizycznym rogu
  // ekranu (top-right viewportu), niezależnie od obrotu UI.
  const orientationToggle = (
    <button
      onClick={() => setManualLandscape(v => !v)}
      className="fixed top-4 right-4 z-[70] w-11 h-11 bg-black/60 backdrop-blur-sm rounded-xl border border-white/20 flex items-center justify-center active:scale-90 transition-all"
      title={manualLandscape ? t('delayMirror.toPortrait') : t('delayMirror.toLandscape')}
    >
      <span className="material-symbols-outlined text-white text-xl">
        {manualLandscape ? 'stay_current_portrait' : 'stay_current_landscape'}
      </span>
    </button>
  );

  // ─── PRO Gate ───────────────────────────────────────────────────────────────
  if (premiumLoading) {
    return (
      <>
        {orientationToggle}
        <div style={screenStyle} className="bg-black flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      </>
    );
  }

  if (mirrorState === 'unsupported') {
    return (
      <>
      {orientationToggle}
      <div style={screenStyle} className="bg-[#0a0a0a] flex flex-col items-center justify-center px-8">
        <button onClick={requestExit} className="absolute top-6 left-5 text-white/50 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-3xl">arrow_back</span>
        </button>
        <span className="material-symbols-outlined text-amber-400 text-5xl mb-4">warning</span>
        <h2 className="text-xl font-black text-white text-center mb-2">{t('delayMirror.unsupportedTitle')}</h2>
        <p className="text-gray-400 text-center text-sm leading-relaxed">
          {t('delayMirror.unsupportedDesc')}
        </p>
        <button onClick={requestExit} className="mt-8 px-8 py-3 bg-white/10 text-white rounded-2xl font-bold text-sm active:scale-95 transition-all">
          {t('delayMirror.back')}
        </button>
      </div>
      </>
    );
  }

  if (mirrorState === 'error') {
    return (
      <>
      {orientationToggle}
      <div style={screenStyle} className="bg-[#0a0a0a] flex flex-col items-center justify-center px-8">
        <button onClick={requestExit} className="absolute top-6 left-5 text-white/50 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-3xl">arrow_back</span>
        </button>
        <span className="material-symbols-outlined text-red-400 text-5xl mb-4">error</span>
        <h2 className="text-xl font-black text-white text-center mb-2">{t('delayMirror.errorTitle')}</h2>
        <p className="text-gray-400 text-center text-sm leading-relaxed mb-6">{errorMsg}</p>
        <button onClick={requestExit} className="px-8 py-3 bg-white/10 text-white rounded-2xl font-bold text-sm active:scale-95 transition-all">
          {t('delayMirror.back')}
        </button>
      </div>
      </>
    );
  }

  const gridOverlay = showGrid ? <DelayMirrorGrid /> : null;

  const gridToggleBtn = (
    <button
      onClick={() => setShowGrid(v => !v)}
      className={`py-3.5 px-5 backdrop-blur-sm rounded-2xl font-bold text-sm active:scale-95 transition-all border ${
        showGrid
          ? 'bg-[#4ade80]/20 text-[#4ade80] border-[#4ade80]/40'
          : 'bg-white/10 text-white/60 border-white/10'
      }`}
      title={t('delayMirror.grid')}
    >
      <span className="material-symbols-outlined text-xl">grid_on</span>
    </button>
  );

  // Suwak opoznienia w modalu. Wydzielony, bo uzywaja go dwa ekrany:
  // startowy (odznaka w trybie prostym) i sesja na zywo (chip eksperta).
  // `fixed`, zeby dzialal niezaleznie od kontenera, w ktorym go osadzimy.
  const delayPickerModal = showDelayPicker ? (
    <div
      className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-[60] px-8"
      onClick={() => setShowDelayPicker(false)}
    >
      <div
        className="bg-[#0a0a0a] border border-white/15 rounded-3xl p-6 w-full max-w-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-white/70 text-xs font-bold uppercase tracking-widest">{t('delayMirror.delayLabel')}</span>
          <span className="text-[#fed33e] text-2xl font-black tabular-nums">{delaySeconds}s</span>
        </div>
        <input
          type="range"
          min={MIN_DELAY_S}
          max={MAX_DELAY_S}
          step={1}
          value={delaySeconds}
          onChange={(e) => setDelaySeconds(parseInt(e.target.value, 10))}
          className="w-full accent-[#fed33e]"
          style={{ height: 24 }}
        />
        <div className="flex justify-between text-[10px] text-white/40 mt-1 mb-4 font-bold">
          <span>{MIN_DELAY_S}s</span>
          <span>{MAX_DELAY_S}s</span>
        </div>
        {/* Powrot do standardu jednym dotknieciem — bez tego user, ktory
            raz przesunal suwak, musi trafic w 15 palcem. */}
        {delaySeconds !== DEFAULT_DELAY_S && (
          <button
            onClick={() => setDelaySeconds(DEFAULT_DELAY_S)}
            className="w-full py-2 mb-2 rounded-xl font-bold text-[11px] uppercase tracking-widest bg-white/5 text-white/60 border border-white/15 active:scale-95 transition-all"
          >
            {t('delayMirror.delayReset', { seconds: DEFAULT_DELAY_S })}
          </button>
        )}
        <button
          onClick={() => setShowDelayPicker(false)}
          className="w-full py-3 bg-[#fed33e] text-[#0a3a2a] rounded-2xl font-black text-sm uppercase tracking-widest active:scale-95 transition-all"
        >
          OK
        </button>
      </div>
    </div>
  ) : null;

  // Kafelek wyboru na ekranie startowym (orientacja + tryb sesji). Jeden
  // wzorzec zamiast czterech kopii tego samego lancucha klas. Celowo drobny:
  // na malych telefonach cztery duze kafle spychaly Start pod krawedz.
  // W ciasnym ukladzie ikona stoi OBOK napisu, nie nad nim — kafel schodzi
  // z ~48px do ~28px wysokosci.
  const pickerBtn = (active: boolean) =>
    `flex-1 rounded-xl font-black uppercase tracking-wider leading-tight text-center active:scale-95 transition-all border flex items-center justify-center ${
      _compactExpert ? 'text-[11px] py-2.5 px-2 flex-row gap-1.5' : 'text-[10px] py-2 px-1.5 flex-col gap-0.5'
    } ${
      active
        ? 'bg-[#fed33e] text-[#0a3a2a] border-[#fed33e] shadow-lg shadow-[#fed33e]/20'
        : 'bg-white/5 text-white/70 border-white/15'
    }`;

  // Poziomo + ekspercko to najciasniejszy przypadek w PIONIE: obrocony
  // kontener ma 100vw wysokosci (~335px), za to 100vh szerokosci (~757px).
  // Wysokosc oszczedzamy (zwarte bloki, bez duzej ikony), szerokosc mamy
  // w nadmiarze — obie kolumny dostaja staly, szeroki rozmiar i siedza
  // wysrodkowane obok siebie zamiast rozjezdzac sie po krawedziach.
  const _compactExpert = _displayAsLandscape && expert;

  // Bloki ustawien wydzielone, bo w kazdym ukladzie ladują w innej kolumnie.
  // Zwarty wariant: skrajne wartosci suwaka odpadaja, etykieta i wartosc
  // stoja w jednym wierszu NAD suwakiem — tak jak w kazdym innym bloku,
  // dzieki czemu wszystkie krawedzie kolumny sa w jednej linii.
  const delayBlock = (
    <div>
      <div className={`flex items-center justify-between ${_compactExpert ? 'mb-1' : 'mb-1.5'}`}>
        <span className={`text-white/70 font-bold uppercase tracking-wider ${_compactExpert ? 'text-[10px]' : 'text-[10px]'}`}>{t('delayMirror.delayLabel')}</span>
        <span className={`text-[#fed33e] font-black tabular-nums ${_compactExpert ? 'text-sm' : 'text-base'}`}>{delaySeconds}s</span>
      </div>
      <input
        type="range"
        min={MIN_DELAY_S}
        max={MAX_DELAY_S}
        step={1}
        value={delaySeconds}
        onChange={(e) => setDelaySeconds(parseInt(e.target.value, 10))}
        className="w-full accent-[#fed33e] block"
        style={{ height: _compactExpert ? 20 : 24 }}
      />
      {!_compactExpert && (
        <div className="flex justify-between text-[10px] text-white/40 mt-1 font-bold">
          <span>{MIN_DELAY_S}s</span>
          <span>{MAX_DELAY_S}s</span>
        </div>
      )}
    </div>
  );

  const orientationBlock = (
    <div>
      <p className={`text-white/70 font-bold uppercase tracking-wider text-center ${_compactExpert ? "text-[10px] mb-1" : "text-[9px] mb-1.5"}`}>
        {t('delayMirror.chooseOrientation')}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => { setManualLandscape(false); setOrientationConfirmed(true); }}
          className={pickerBtn(orientationConfirmed && !manualLandscape)}
        >
          <span className={`material-symbols-outlined ${_compactExpert ? "text-base" : "text-lg"}`}>stay_current_portrait</span>
          {t('delayMirror.orientationPortrait')}
        </button>
        <button
          onClick={() => { setManualLandscape(true); setOrientationConfirmed(true); }}
          className={pickerBtn(orientationConfirmed && manualLandscape)}
        >
          <span className={`material-symbols-outlined ${_compactExpert ? "text-base" : "text-lg"}`}>stay_current_landscape</span>
          {t('delayMirror.orientationLandscape')}
        </button>
      </div>
    </div>
  );

  const modeBlock = (
    <div>
      <p className={`text-white/70 font-bold uppercase tracking-wider text-center ${_compactExpert ? "text-[10px] mb-1" : "text-[9px] mb-1.5"}`}>
        {t('delayMirror.modeLabel')}
      </p>
      <div className="flex gap-2">
        <button onClick={() => setClipMode(false)} className={pickerBtn(!clipMode)}>
          <span className={`material-symbols-outlined ${_compactExpert ? "text-base" : "text-lg"}`}>visibility</span>
          {t('delayMirror.modeMirror')}
        </button>
        <button onClick={() => setClipMode(true)} className={pickerBtn(clipMode)}>
          {/* Dwie ikonki: ten tryb nagrywa, ale zwierciadlo dziala w nim
              tez — "Spiegel + Aufnahme" bez oka wygladalo jak sama kamera. */}
          <span className="flex items-center gap-0.5">
            <span className={`material-symbols-outlined ${_compactExpert ? "text-base" : "text-lg"}`}>visibility</span>
            <span className={`material-symbols-outlined ${_compactExpert ? "text-base" : "text-lg"}`}>videocam</span>
          </span>
          {t('delayMirror.modeRecord')}
        </button>
      </div>
      {/* Objasnienie trybu odpada w ciasnym ukladzie — kafle sa podpisane. */}
      {!_compactExpert && (
        <p className="text-white/40 text-[10px] leading-snug mt-1.5 text-center">
          {clipMode ? t('delayMirror.modeRecordHint') : t('delayMirror.modeMirrorHint')}
        </p>
      )}
    </div>
  );

  const privacyNote = (
    <div className="flex items-start gap-2 bg-white/5 rounded-xl px-3 py-2">
      <span className="material-symbols-outlined text-[#fed33e]/70 text-sm mt-0.5">lock</span>
      <p className="text-white/50 text-[10px] leading-snug">{t('delayMirror.privacyNote')}</p>
    </div>
  );

  // ─── Trening techniczny: przycisk + panel + podsumowanie ─────────────────
  const techCheckbox = (
    <span className={`w-5 h-5 shrink-0 rounded-md border-2 flex items-center justify-center ${techOn ? 'bg-sky-400 border-sky-400' : 'border-white/40'}`}>
      {techOn && <span className="material-symbols-outlined text-[16px] text-[#050f0a] font-black">check</span>}
    </span>
  );

  const techRow = (
    <div className={`w-full flex gap-1.5 ${_compactExpert ? 'mb-1' : 'mb-3'}`}>
      <button
        onClick={toggleTech}
        aria-pressed={techOn}
        className={`flex-1 min-w-0 flex items-center gap-2 rounded-xl px-2.5 py-2 border active:scale-95 transition-all ${
          techOn ? 'bg-sky-500/15 border-sky-400/50 text-sky-100' : 'bg-white/5 border-white/15 text-white/60'
        }`}
      >
        {techCheckbox}
        <span className="text-[10px] font-black uppercase tracking-wider truncate">{t('delayMirror.techToggle')}</span>
        {techOn && techArrows > 0 && (
          <span className="ml-auto shrink-0 text-xs font-black tabular-nums text-white bg-sky-500/40 rounded-md px-1.5">{techArrows}</span>
        )}
      </button>
      <button
        onClick={() => setShowTechPanel(true)}
        aria-label={t('delayMirror.techToggle')}
        className={`shrink-0 w-10 rounded-xl border flex items-center justify-center active:scale-95 transition-all ${
          techOn ? 'bg-sky-500/15 border-sky-400/50 text-sky-100' : 'bg-white/5 border-white/15 text-white/60'
        }`}
      >
        <span className="material-symbols-outlined text-xl">expand_more</span>
      </button>
    </div>
  );

  const techTopicsAndNotes = (
    <>
      {activeFocus && focusState && (
        <div className="mb-3">
          <FocusStrip focus={activeFocus} dots={focusState.dots} goal={focusState.goal} count={focusState.count} variant="glass" />
        </div>
      )}
      <div className="mb-3">
        <TopicPicker selectedTopics={techTopics} onChange={setTechTopics} markedTopic={focusTopic} onDark />
      </div>
      <div className="mb-4">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[9px] font-black text-white/50 uppercase tracking-widest">{t('sessionSetup.techNotes')}</span>
          <span className={`text-[9px] font-bold ${techNote.length >= TECH_NOTE_MAX ? 'text-red-400' : 'text-white/30'}`}>{techNote.length}/{TECH_NOTE_MAX}</span>
        </div>
        <textarea
          value={techNote}
          onChange={e => setTechNote(e.target.value)}
          maxLength={TECH_NOTE_MAX}
          placeholder={t('sessionSetup.notePlaceholder')}
          className="w-full bg-white/10 border border-white/20 p-3 rounded-xl font-bold text-sm text-white placeholder:text-white/40 focus:border-sky-400 outline-none transition-all h-24 resize-none"
        />
      </div>
    </>
  );

  const techSheet = (content: React.ReactNode, onClose: () => void) => (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[80] flex items-start justify-center p-3 pt-[calc(env(safe-area-inset-top)+16px)] overflow-y-auto" onClick={onClose}>
      <div className="bg-[#0a0a0a] border border-white/15 border-t-4 border-t-sky-500 rounded-[28px] p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
        {content}
      </div>
    </div>
  );

  const techSheetHeader = (title: string, onClose: () => void) => (
    <div className="flex justify-between items-center mb-4 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="material-symbols-outlined text-sky-400 text-lg">psychology</span>
        <h2 className="text-base font-black text-white uppercase truncate">{title}</h2>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] font-black text-sky-200 bg-sky-500/20 px-2 py-1 rounded-lg uppercase tracking-widest">{t('delayMirror.title')}</span>
        <button onClick={onClose} className="text-white/50 p-1 active:scale-90 transition-all"><span className="material-symbols-outlined text-lg">close</span></button>
      </div>
    </div>
  );

  const sizeBtn = (n: number, big: boolean) => (
    <button
      key={n}
      onClick={() => setTechSize(n)}
      className={`flex-1 rounded-xl font-black active:scale-95 transition-all border ${big ? 'py-2 text-lg' : 'py-1.5 text-xs'} ${
        techSize === n ? 'bg-[#fed33e] text-[#0a3a2a] border-[#fed33e]' : 'bg-white/5 text-white/60 border-white/10'
      }`}
    >
      {n}
    </button>
  );

  const techPanelModal = showTechPanel ? techSheet(
    <>
      {techSheetHeader(t('stats.techSessionTitle'), () => setShowTechPanel(false))}

      <button
        onClick={toggleTech}
        aria-pressed={techOn}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 mb-3 active:scale-95 transition-all ${
          techOn ? 'bg-sky-500/15 border-sky-400/60 text-sky-100' : 'bg-white/5 border-white/15 text-white/60'
        }`}
      >
        {techCheckbox}
        <span className="text-xs font-black uppercase tracking-wider">{t('delayMirror.techToggle')}</span>
      </button>

      <div className="bg-white/5 rounded-[20px] border border-white/10 px-3 py-2.5 mb-3">
        <p className="text-[10px] font-black text-white/70 uppercase tracking-widest text-center mb-1.5">{t('delayMirror.seriesArrowsTitle')}</p>
        <div className="flex gap-2">{[3, 6].map(n => sizeBtn(n, true))}</div>
        <div className="flex gap-1.5 mt-1.5">{[1, 2, 4, 5].map(n => sizeBtn(n, false))}</div>
        <p className="text-white/40 text-[10px] leading-snug text-center mt-2">{t('delayMirror.techSeriesHint')}</p>
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/10">
          <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">{t('delayMirror.techArrowsSoFar')}</span>
          <span className="text-lg font-black text-white tabular-nums">{techArrows}</span>
        </div>
      </div>

      {techTopicsAndNotes}

      <button
        onClick={() => setShowTechPanel(false)}
        className="w-full py-3.5 rounded-2xl font-black uppercase tracking-widest bg-sky-600 text-white active:scale-95 transition-all"
      >
        {t('delayMirror.techDone')}
      </button>
    </>,
    () => setShowTechPanel(false),
  ) : null;

  const techSummaryModal = showTechSummary ? techSheet(
    <>
      {techSheetHeader(t('delayMirror.techSummaryTitle'), () => setShowTechSummary(false))}

      <div className="bg-white/5 rounded-[20px] border border-white/10 px-3 py-2 mb-3">
        <span className="text-[10px] font-black text-white/70 uppercase tracking-widest block mb-1.5 text-center">{t('delayMirror.techArrowsSoFar')}</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setTechArrows(a => Math.max(0, a - 1))}
            className="flex-1 py-2 bg-red-500/15 text-red-300 rounded-xl font-black text-sm active:scale-95 transition-all border border-red-400/20"
          >−1</button>
          <div className="flex-1 py-2 bg-sky-600 text-white rounded-xl font-black text-xl flex items-center justify-center tabular-nums">{techArrows}</div>
          <button
            onClick={() => setTechArrows(a => a + 1)}
            className="flex-1 py-2 bg-sky-500/20 text-sky-200 rounded-xl font-black text-sm active:scale-95 transition-all"
          >+1</button>
        </div>
      </div>

      {techTopicsAndNotes}

      {techSaveError && (
        <p className="text-red-400 text-xs font-bold text-center mb-2">{t('delayMirror.techSaveError')}</p>
      )}
      <button
        onClick={saveTech}
        disabled={isSavingTech || techArrows === 0}
        className="w-full py-4 rounded-2xl font-black uppercase tracking-widest bg-sky-600 text-white active:scale-95 transition-all disabled:opacity-50 mb-2"
      >
        {isSavingTech ? t('common.saving') : t('sessionSetup.saveBtn')}
      </button>
      <button
        onClick={discardTech}
        disabled={isSavingTech}
        className="w-full py-3 rounded-2xl font-bold text-xs uppercase tracking-widest bg-white/5 text-white/60 border border-white/15 active:scale-95 transition-all"
      >
        {t('delayMirror.techDiscard')}
      </button>
    </>,
    () => setShowTechSummary(false),
  ) : null;

  if (mirrorState === 'positioning') {
    return (
      <>
      {orientationToggle}
      <div style={screenStyle} className="bg-black">
        {/* Live preview pelnoekranowy — uzywany TYLKO do ustawienia urzadzenia.
            Po starcie nagrywania ten <video> jest odpinany (srcObject=null) zeby
            nie konkurowal z MSE decoderem na Android. */}
        <video
          ref={liveVideoRef}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
          playsInline
          muted
        />
        {gridOverlay}
        <div style={uiRotateStyle}>
          {/* Dol: zoom switcher (jezeli wsparte) + start button + grid toggle */}
          <div className="absolute bottom-8 inset-x-0 px-6 z-10 flex flex-col items-center gap-3">
            {zoomCaps && (
              <div className="flex gap-2 bg-black/55 backdrop-blur-sm rounded-2xl p-1.5 border border-white/10">
                {[
                  { v: zoomCaps.min, label: `${zoomCaps.min}x` },
                  { v: 1, label: '1x' },
                ].map(opt => (
                  <button
                    key={opt.label}
                    onClick={() => applyZoom(opt.v)}
                    className={`px-4 py-2 rounded-xl text-xs font-black tabular-nums transition-all active:scale-95 ${
                      Math.abs(cameraZoom - opt.v) < 0.05
                        ? 'bg-[#fed33e] text-[#0a3a2a]'
                        : 'text-white/70'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-3 items-center">
              {gridToggleBtn}
              <button
                onClick={beginDelayedRecording}
                className="px-10 py-4 bg-[#fed33e] text-[#0a3a2a] rounded-2xl font-black text-base uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-[#fed33e]/30 flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-xl">play_arrow</span>
                {clipMode ? t('delayMirror.positioningStart') : t('delayMirror.positioningStartMirror')}
              </button>
            </div>
          </div>
          {/* Back button */}
          <button onClick={stopMirror} className={`absolute text-white active:scale-90 transition-all z-10 bg-black/40 backdrop-blur-sm rounded-full p-2 ${_displayAsLandscape ? 'top-6 right-5' : 'top-6 left-5'}`}>
            <span className="material-symbols-outlined text-2xl">arrow_back</span>
          </button>
          {/* Setup instructions button */}
          <button
            onClick={() => setShowSetupInstructions(true)}
            className="absolute top-4 inset-x-0 mx-auto w-fit z-20 flex items-center gap-1.5 bg-black/80 text-white rounded-xl px-3 py-1.5 active:scale-95 transition-all border border-white/30 animate-pulse shadow-md"
          >
            <span className="material-symbols-outlined text-base">info</span>
            <span className="text-xs font-bold">{t('delayMirror.setupInstructionsTitle')}</span>
          </button>

          {/* Modal instrukcji — musi byc w tym samym return co przycisk */}
          {showSetupInstructions && (
            <div
              className="absolute inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-40 px-6"
              onClick={() => setShowSetupInstructions(false)}
            >
              <div
                className="bg-[#0a0a0a] border border-white/15 rounded-3xl p-6 w-full max-w-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-white font-black text-lg mb-4 text-center">{t('delayMirror.setupInstructionsTitle')}</h2>
                <div className="text-white/80 text-sm leading-relaxed whitespace-pre-line mb-5 max-h-80 overflow-y-auto">
                  {t('delayMirror.setupInstructions')}
                </div>
                <button
                  onClick={() => setShowSetupInstructions(false)}
                  className="w-full py-3 bg-[#fed33e] text-[#0a3a2a] rounded-2xl font-black text-sm uppercase tracking-widest active:scale-95 transition-all"
                >
                  {t('delayMirror.setupInstructionsClose')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      </>
    );
  }

  if (mirrorState === 'idle') {
    return (
      <>
      {orientationToggle}
      {delayPickerModal}
      {techPanelModal}
      {techSummaryModal}
      <div style={screenStyle} className="bg-[#050f0a]">
        <div style={uiRotateStyle} className={`overflow-y-auto ${_displayAsLandscape ? `flex flex-row items-center justify-center ${_compactExpert ? 'gap-8 px-6 py-3' : 'gap-8 px-10 py-4'}` : 'flex flex-col items-center justify-center px-8 py-6'}`}>
        {/* Powrot musi uciec spod przycisku orientacji (fixed top-4 right-4,
            z-70). Przy wymuszonym obrocie UI ten fizyczny rog to LEWY GORNY
            rog obroconego ukladu, wiec powrot idzie wtedy w prawy; bez obrotu
            jest odwrotnie. */}
        <button onClick={requestExit} className={`absolute text-white/50 active:scale-90 transition-all z-10 ${_displayAsLandscape ? (_uiForceRotate ? 'top-6 right-5' : 'top-6 left-5') : 'top-6 left-5'}`}>
          <span className="material-symbols-outlined text-3xl">arrow_back</span>
        </button>

        {/* LEWA KOLUMNA (lub górna w portrait): logo + ikona + tytuł + opóźnienie + privacy.
            W ciasnym ukladzie marka sie kurczy, ale zostaje — ustawienia
            trzymamy w calosci po prawej. */}
        <div className={`flex flex-col items-center ${_compactExpert ? 'w-[18rem] shrink-0' : _displayAsLandscape ? 'flex-1 max-w-[13rem]' : 'w-full'}`}>
          {/* Logo GROT-X z kropką */}
          <div className={`flex items-baseline gap-0.5 ${_compactExpert ? 'mb-2' : 'mb-3'}`}>
            <h1 className={`${_compactExpert ? 'text-3xl' : 'text-4xl'} font-black text-[#fed33e] tracking-tighter leading-none`}>GROT</h1>
            <h1 className={`${_compactExpert ? 'text-3xl' : 'text-4xl'} font-black text-white tracking-tighter leading-none`}>-X</h1>
            <div className={`w-2.5 h-2.5 bg-[#fed33e] rounded-full ml-1 relative bottom-[0.48em] shadow-sm`} />
          </div>
          {!_compactExpert && (
            <div className="w-14 h-14 bg-[#fed33e]/10 rounded-3xl flex items-center justify-center mb-2">
              <span className="material-symbols-outlined text-[#fed33e] text-4xl">slow_motion_video</span>
            </div>
          )}
          <h2 className={`font-black text-white mb-2 ${_compactExpert ? 'text-lg' : _displayAsLandscape ? 'text-xl' : 'text-2xl'}`}>{t('delayMirror.title')}</h2>
          {/* W trybie prostym odznaka jest jedynym wejsciem do opoznienia —
              ekspert ma suwak, wiec tam zostaje zwyklym napisem. */}
          {expert ? (
            <div className={`flex items-center gap-2 bg-[#fed33e]/10 rounded-xl ${_compactExpert ? 'px-4 py-2 mb-2.5' : 'px-4 py-2 mb-4'}`}>
              <span className={`material-symbols-outlined text-[#fed33e] text-base`}>schedule</span>
              <span className={`text-[#fed33e] font-bold text-center leading-tight ${_compactExpert ? 'text-[11px]' : 'text-xs'}`}>{t('delayMirror.delayBadge', { seconds: delaySeconds })}</span>
            </div>
          ) : (
            <button
              onClick={() => setShowDelayPicker(true)}
              className="flex items-center gap-2 bg-[#fed33e]/10 border border-[#fed33e]/30 rounded-xl px-4 py-2 mb-4 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[#fed33e] text-base">schedule</span>
              <span className="text-[#fed33e] text-xs font-bold">{t('delayMirror.delayBadge', { seconds: delaySeconds })}</span>
              <span className="material-symbols-outlined text-[#fed33e] text-base">tune</span>
            </button>
          )}
          {techRow}
          {_displayAsLandscape && <div className={`w-full ${_compactExpert ? "mt-1" : "mt-auto"}`}>{privacyNote}</div>}
        </div>

        {/* PRAWA KOLUMNA (lub dolna w portrait): suwak + orientacja + start */}
        {/* Staly rozmiar zamiast flex-1: przy 757px szerokosci obroconego
            ekranu flex-1 rozciagal kolumne na ~500px, a zawartosc plywala
            w jej srodku — stad dziura w polowie ekranu i martwy pas przy
            krawedzi. Dwie kolumny o stalej szerokosci justify-center stawia
            obok siebie i centruje jako calosc. */}
        <div className={`flex flex-col items-stretch ${_compactExpert ? 'w-[18rem] shrink-0 gap-2' : _displayAsLandscape ? 'flex-1 max-w-xs gap-2.5' : 'w-full max-w-xs gap-3 mt-1'}`}>
          {/* Ustawienia eksperckie — ukryte, dopoki user sam ich nie zazada.
              Tryb prosty ma byc jednym przyciskiem, nie formularzem.
              Wszystkie trzy zostaja razem w tej kolumnie; w poziomie
              zmieszczenie zalatwia zwarty wariant kazdego bloku. */}
          {expert && (
            <>
              {delayBlock}
              {orientationBlock}
              {modeBlock}
            </>
          )}

          <button
            onClick={() => {
              // Tryb prosty narzuca poziom i brak klipu. Opoznienia NIE
              // narzuca — 15 s to wartosc poczatkowa, ale user moze ja
              // zmienic odznaka nad przyciskiem.
              if (!expert) {
                setClipMode(false);
                setManualLandscape(true);
                setOrientationConfirmed(true);
              }
              startRecording();
            }}
            disabled={expert && !orientationConfirmed}
            className={`w-full ${_compactExpert ? 'py-3.5 text-base' : 'py-4 text-base'} rounded-2xl font-black uppercase tracking-widest transition-all ${
              !expert || orientationConfirmed
                ? 'bg-[#fed33e] text-[#0a3a2a] active:scale-95 shadow-lg shadow-[#fed33e]/20'
                : 'bg-white/10 text-white/30 cursor-not-allowed'
            }`}
          >
            {t('delayMirror.start')}
          </button>

          {!expert && (
            <p className="text-white/40 text-[11px] leading-snug text-center -mt-1">
              {t('delayMirror.simpleHint', { seconds: delaySeconds })}
            </p>
          )}

          <button
            onClick={() => setExpert(v => !v)}
            className={`w-full ${_compactExpert ? "py-2" : "py-2.5"} rounded-2xl font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-1.5 border ${
              expert
                ? 'bg-[#fed33e]/15 text-[#fed33e] border-[#fed33e]/40'
                : 'bg-white/5 text-white/60 border-white/15'
            }`}
          >
            <span className="material-symbols-outlined text-base">{expert ? 'expand_less' : 'tune'}</span>
            {t('delayMirror.expertMode')}
          </button>

          {/* Privacy note — w pionie pod startem. W poziomie siedzi w lewej
              kolumnie, wiec tutaj bylby drugi raz. */}
          {!_displayAsLandscape && privacyNote}
        </div>

        </div>{/* /uiRotateStyle */}
      </div>
      </>
    );
  }

  return (
    <>
    {orientationToggle}

    {/* Analiza serii — POZA kontenerem rotujacym UI lustra. Rotacja sluzy
        podgladowi kamery; przy wbijaniu strzal user trzyma telefon w rece
        jak chce, a `position: fixed` w TargetInput rozwiazuje sie wzgledem
        przodka z transformacja i caly ekran wychodzi przekrecony. */}
    {showSeries && (
      <DelayMirrorSeries
        userId={auth.currentUser?.uid || ''}
        /* Strzalka wstecz = rezygnacja z analizy, wracamy prosto do nagrywania. */
        onBack={() => { setShowSeries(false); toggleRecordingPause(); }}
        /* „Pomin analize" i „Obejrzyj i zaznacz" prowadza w to samo miejsce:
           nagranie tej passy. Roznica jest tylko w tym, czy obok jest tarcza
           z wbitymi strzalami. */
        onWatchOnly={() => { setShowSeries(false); setPassDraft(null); setShowPassReview(true); }}
        onReady={(draft) => {
          // Faktyczna liczba z tarczy zastepuje N doliczone przy pauzie.
          if (techOn && lastSeriesAddRef.current > 0) {
            const diff = draft.shots.length - lastSeriesAddRef.current;
            lastSeriesAddRef.current = draft.shots.length;
            setTechArrows(a => Math.max(0, a + diff));
          }
          passDraftIdRef.current = saveSeriesDraft(draft); setShowSeries(false); setPassDraft(draft); setShowPassReview(true); }}
      />
    )}

    <div className="bg-black overflow-hidden select-none" style={screenStyle}>
      {/* Camera video — natywna orientacja, NIE rotuje się z togglem.
          MSE pipeline: jeden ciagly stream, zero segmentow = brak migania. */}
      <video
        ref={delayedVideoRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
        playsInline
        muted
      />

      {/* UI overlays — opcjonalnie rotowane dla manual landscape */}
      <div style={uiRotateStyle}>

      {/* Grid overlay — minimalist dot grid + corner brackets */}
      {(mirrorState === 'live' || mirrorState === 'buffering') && gridOverlay}

      {mirrorState === 'buffering' && (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-10">
          <div className="w-16 h-16 rounded-full border-4 border-white/10 border-t-[#fed33e] animate-spin mb-4" />
          <p className="text-white font-bold text-base mb-2">{t('delayMirror.buffering')}</p>
          <p className="text-white/50 text-xs mb-4">{t('delayMirror.bufferingHint', { seconds: delaySeconds })}</p>
          <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#fed33e] rounded-full transition-all duration-100"
              style={{ width: `${bufferPct}%` }}
            />
          </div>
          <p className="text-[#fed33e] text-xs mt-2 font-bold">{bufferPct}%</p>
        </div>
      )}

      {mirrorState === 'review' && (
        <DelayMirrorReplay
          blob={lastBlob}
          displayAsLandscape={_displayAsLandscape}
          showGridInitial={showGrid}
          onResume={resumeMirror}
          onEndSession={endSession}
          isPremium={isPremium}
          onUpgrade={() => onUpgrade?.()}
        />
      )}

      {/* Podsumowanie passy. Wlasny z-40, bo sesja formalnie trwa (mirrorState
          dalej 'live') i dolny pasek akcji ma z-30 — bez tego przebijalby
          sie przez nagranie. */}
      {showPassReview && mirrorState === 'live' && (
        <div className="absolute inset-0 z-40">
          <DelayMirrorReplay
            blob={lastBlob}
            displayAsLandscape={_displayAsLandscape}
            showGridInitial={showGrid}
            passMode
            series={passDraft}
            onShotsChange={(shots) => {
              // Celowo BEZ setPassDraft: `series` jest propem wejsciowym
              // powtorki, a jej zmiana zresetowalaby tam stan oznaczania.
              if (passDraftIdRef.current) updateSeriesShots(passDraftIdRef.current, shots);
            }}
            onResume={() => { setShowPassReview(false); toggleRecordingPause(); }}
            onEndSession={() => { setShowPassReview(false); endSession(); }}
            isPremium={isPremium}
            onUpgrade={() => onUpgrade?.()}
          />
        </div>
      )}


      {/* Caly klaster kontrolek nagrywania siedzi w JEDNYM rogu — logiczny
          top-right kontenera uiRotateStyle, czyli TO SAMO miejsce (wzgledem
          kadru), w ktorym DelayMirrorExport rysuje wypalona tarcze (patrz
          panelX/panelY tam). Dzieki temu lucznik od razu kadruje z pominieciem
          tego rogu, zamiast dowiadywac sie po fakcie, ze tarcza cos zaslania.
          Odsuniete od physical top-right, bo tam zawsze siedzi orientationToggle
          (poza tym kontenerem, fizyczny rog) — w force-rotate te dwa rogi sa
          rozne (patrz komentarz przy uiRotateStyle), w native landscape sa
          te same, stad wiekszy odstep od gory tylko w tym drugim przypadku. */}
      {(mirrorState === 'buffering' || mirrorState === 'live') && (
        <div className={`absolute z-30 flex flex-col items-stretch gap-1.5 w-[27%] max-w-[11rem] min-w-[7.5rem] right-4 ${_uiForceRotate ? 'top-4' : 'top-20'}`}>
          <div className="flex flex-wrap gap-1.5 justify-end">
            {/* Licznik — tylko gdy klip faktycznie zbiera material. W trybie
                samego lustra czerwona kropka bylaby klamstwem. */}
            {clipActive && !recordingPaused && (
              <div className="flex items-center gap-1.5 bg-red-600/80 backdrop-blur-sm rounded-xl px-2.5 py-1.5 border border-red-500/40">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                <span className="text-white text-xs font-bold tabular-nums">{formatTime(recSeconds)}</span>
              </div>
            )}
            {/* Siatka dziala juz w trakcie buforowania — czekanie na bufor
                to naturalny moment, zeby ja ustawic. Tylko suwak opoznienia
                czeka na 'live', bo zmiana w trakcie buforowania przestawialaby
                prog, ktory wlasnie jest odliczany.
                BYL TU przelacznik REC wlacz/wylacz w trakcie passy — usuniety:
                wybor "Lustro + nagranie" na ekranie startowym juz oznacza
                cala passe, a mid-pass toggle polegal na MediaRecorder
                pause()/resume() na strumieniu z canvasa, co na czesci
                telefonow nie wykluczalo wstrzymanego fragmentu z pliku
                (user zglosil: "wylaczam Nimmt auf i tak nagrywa dalej").
                Realna naprawa (osobne segmenty sklejane w jeden plik) jest
                niebezpieczna — zlepienie dwoch kompletnych plikow wideo w
                jeden Blob najczesciej nie odtworzy sie poprawnie. Zamiast
                tego: jesli wybrales nagranie, nagrywa sie cala passa, koniec
                zdejmujesz przyciskiem "Koniec serii". */}

                {techOn && (
                  <div className="flex items-center gap-1.5 bg-sky-600/70 backdrop-blur-sm rounded-xl px-2.5 py-1.5 border border-sky-400/40">
                    <span className="material-symbols-outlined text-white text-sm">psychology</span>
                    <span className="text-white text-xs font-bold tabular-nums">{techArrows}</span>
                  </div>
                )}

                {/* Siatka — nakladka na obraz, nagrania nie dotyka */}
                <button
                  onClick={() => setShowGrid(v => !v)}
                  className={`flex items-center gap-1.5 backdrop-blur-sm rounded-xl px-2.5 py-1.5 active:scale-95 transition-all border ${
                    showGrid
                      ? 'bg-[#4ade80]/20 text-[#4ade80] border-[#4ade80]/40'
                      : 'bg-black/60 text-white/60 border-white/20'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">grid_on</span>
                  <span className="text-xs font-bold">{t('delayMirror.grid')}</span>
                </button>

                {/* Opoznienie — ustawienie widoku, tylko dla eksperta */}
                {expert && mirrorState === 'live' && (
                  <button
                    onClick={() => setShowDelayPicker(true)}
                    className="flex items-center gap-1.5 bg-[#fed33e]/20 backdrop-blur-sm rounded-xl px-2.5 py-1.5 active:scale-95 transition-all border border-[#fed33e]/40"
                  >
                    <span className="material-symbols-outlined text-[#fed33e] text-sm">schedule</span>
                    <span className="text-[#fed33e] text-xs font-bold">-{delaySeconds}s</span>
                    <span className="material-symbols-outlined text-[#fed33e] text-sm">tune</span>
                  </button>
                )}
          </div>

          {/* PAUZA — "idę po strzały": zamraza obraz i oszczedza baterie.
              Dziala w obu trybach, bo nie dotyczy klipu tylko mojej obecnosci. */}
          <button
            onClick={toggleRecordingPause}
            className={`w-full py-2.5 px-3 backdrop-blur-sm rounded-2xl active:scale-95 transition-all flex flex-col items-center justify-center gap-0.5 border ${
              recordingPaused
                ? 'bg-[#fed33e]/25 text-[#fed33e] border-[#fed33e]/50'
                : 'bg-white/10 text-white/80 border-white/15'
            }`}
          >
            <span className="material-symbols-outlined text-xl leading-none">
              {recordingPaused ? 'play_arrow' : hasClip ? 'flag' : 'pause'}
            </span>
            {/* Z klipem pauza konczy serie i otwiera analize, wiec „Pauza”
                przestalaby opisywac, co ten przycisk robi. */}
            <span className="text-[10px] font-black uppercase tracking-widest leading-tight text-center">
              {recordingPaused
                ? t('delayMirror.resumePause')
                : hasClip ? t('delayMirror.endSeries') : t('delayMirror.pauseBtn')}
            </span>
            {!recordingPaused && hasClip && (
              <span className="text-[9px] font-bold text-white/50 leading-tight">
                {t('delayMirror.endSeriesSub')}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Wyjscie z calej sesji — jedna cicha ikona, nie drugi przycisk
          obok "Koniec serii" z podobnie brzmiaca etykieta (byla to glowna
          skarga: "Passe beenden" i "Beenden" nie do odroznienia). Bez
          etykiety = bez konfliktu slownego, wiec ladzie osobno od gornego
          panelu. Rog logiczny bottom-left, bo top-right zajmuje juz panel
          wyzej, a top-left pod force-rotate wypadlby pod orientationToggle
          (ten sam fizyczny-vs-logiczny unik, co przy przycisku powrotu na
          ekranie idle — patrz komentarz tam). Dziala identycznie w obu
          trybach: z klipem konczy sesje i pokazuje pelna powtorke, bez
          klipu wraca prosto do menu. */}
      {(mirrorState === 'buffering' || mirrorState === 'live') && (
        <button
          onClick={finishRecording}
          title={t('delayMirror.finish')}
          className="absolute bottom-5 left-5 z-30 text-white/70 active:scale-90 transition-all bg-black/40 backdrop-blur-sm rounded-full p-2.5"
        >
          <span className="material-symbols-outlined text-2xl">arrow_back</span>
        </button>
      )}

      {/* Pasek pauzy — bez niego user odchodzi od telefonu myslac, ze skonczyl */}
      {recordingPaused && (mirrorState === 'live' || mirrorState === 'buffering') && (
        <div className="absolute top-1/2 -translate-y-1/2 inset-x-0 z-30 flex justify-center px-8 pointer-events-none">
          <div className="flex flex-col items-center gap-1 bg-[#fed33e]/20 backdrop-blur-sm rounded-2xl px-5 py-3 border border-[#fed33e]/50">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#fed33e] text-xl">pause</span>
              <span className="text-[#fed33e] text-sm font-black uppercase tracking-widest">
                {t('delayMirror.pausedBanner')}
              </span>
            </div>
            {/* Dogrywanie reszty bufora — bez tego user widzi ruchomy obraz
                pod napisem "wstrzymane" i nie wie, czy pauza zadzialala. */}
            {pausePhase === 'draining' && (
              <span className="text-[#fed33e]/80 text-xs font-bold tabular-nums">
                {t('delayMirror.drainHint', { seconds: Math.ceil(drainMs / 1000) })}
              </span>
            )}
          </div>
        </div>
      )}

      {delayPickerModal}

      {showSetupInstructions && (
        <div
          className="absolute inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-40 px-6 overflow-y-auto py-8"
          onClick={() => setShowSetupInstructions(false)}
        >
          <div
            className="bg-[#0a0a0a] border border-white/15 rounded-3xl p-8 w-full max-w-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-white font-black text-2xl mb-6 text-center">{t('delayMirror.setupInstructionsTitle')}</h2>
            <div className="text-white/80 text-sm leading-relaxed whitespace-pre-line mb-6 max-h-96 overflow-y-auto">
              {t('delayMirror.setupInstructions')}
            </div>
            <button
              onClick={() => setShowSetupInstructions(false)}
              className="w-full py-3 bg-[#fed33e] text-[#0a3a2a] rounded-2xl font-black text-sm uppercase tracking-widest active:scale-95 transition-all"
            >
              {t('delayMirror.setupInstructionsClose')}
            </button>
          </div>
        </div>
      )}
      </div>{/* /uiRotateStyle */}
    </div>
    </>
  );
}
