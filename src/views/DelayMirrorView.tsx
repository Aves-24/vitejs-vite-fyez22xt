import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { db, auth } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import DelayMirrorReplay from './DelayMirrorReplay';
import DelayMirrorGrid, { drawGridOnCanvas } from './DelayMirrorGrid';

const DEFAULT_DELAY_S = 15;
const MIN_DELAY_S = 1;
const MAX_DELAY_S = 30;
const STORAGE_KEY = 'delayMirror.delaySeconds';
const CLIP_STORAGE_KEY = 'delayMirror.clipMode';

// 'review' = sesja zakonczona, pokazujemy powtorke. To NIE jest pauza —
// pauza w trakcie nagrania siedzi w osobnym `recordingPaused`.
type MirrorState = 'idle' | 'requesting' | 'positioning' | 'buffering' | 'live' | 'review' | 'unsupported' | 'error';

// Fazy chwilowej pauzy — patrz toggleRecordingPause.
type PausePhase = 'none' | 'draining' | 'frozen';

interface Props {
  onBack: () => void;
  onUpgrade?: () => void;
}

// Pelny codec do "Udostepnij" (kompletny plik) — preferuj mp4 dla WhatsApp/iOS.
function getFullCodec(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'video/mp4;codecs=h264,aac',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=h264',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return null;
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

export default function DelayMirrorView({ onBack, onUpgrade }: Props) {
  const { t } = useTranslation();
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
  // Pauza ma dwie fazy. Po wcisnieciu w buforze siedzi jeszcze material,
  // ktorego user nie widzial — 'draining' dogrywa go z odliczaniem, dopiero
  // potem 'frozen' zatrzymuje obraz na stop-klatce.
  const [pausePhase, setPausePhase] = useState<PausePhase>('none');
  const pausePhaseRef = useRef<PausePhase>('none');
  useEffect(() => { pausePhaseRef.current = pausePhase; }, [pausePhase]);
  const [drainMs, setDrainMs] = useState(0);
  const drainTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activeRecorderRef = useRef<MediaRecorder | null>(null);
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

  // Manualny override rotacji — przycisk pion/poziom
  const [manualLandscape, setManualLandscape] = useState(false);
  // Czy user wybral juz orientacje na ekranie idle (warunek odblokowania Start)
  const [orientationConfirmed, setOrientationConfirmed] = useState(false);

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
        recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_500_000 });
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
        const fullRec = new MediaRecorder(recStream, { mimeType: fullCodec, videoBitsPerSecond: 1_500_000 });
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
  }, []);

  // PAUZA ("idę po strzały"). Nie zamraza obrazu natychmiast: w buforze
  // siedzi jeszcze cale okno opoznienia, ktorego user nie widzial. Wiec
  // najpierw odcinamy doplyw nowych klatek, dogrywamy reszte z odliczaniem
  // ('draining'), a dopiero na koncu zatrzymujemy obraz ('frozen').
  // WZNOWIENIE odbudowuje pipeline od zera — bufor napelnia sie na nowo,
  // dokladnie ta sama sciezka co przy starcie sesji.
  const toggleRecordingPause = useCallback(() => {
    const vid = delayedVideoRef.current;

    if (!recordingPaused) {
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
      setPausePhase('draining');
      pausePhaseRef.current = 'draining';

      const started = Date.now();
      const hardStopMs = delayMsRef.current + 4000; // bezpiecznik na stall
      if (drainTimerRef.current) clearInterval(drainTimerRef.current);
      const freeze = () => {
        if (drainTimerRef.current) { clearInterval(drainTimerRef.current); drainTimerRef.current = null; }
        try { delayedVideoRef.current?.pause(); } catch { /* ignore */ }
        setDrainMs(0);
        setPausePhase('frozen');
        pausePhaseRef.current = 'frozen';
      };
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
      try { fullRecorderRef.current?.resume(); } catch { /* ignore */ }
    }

    setRecordingPaused(false);
    setBufferMs(0);
    timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);

    // runMSE wolane wprost, nie przez pendingMSERef: gdyby pauza wypadla
    // jeszcze w trakcie buforowania, setMirrorState('buffering') nie zmienia
    // stanu i useEffect by nie wystartowal.
    const stream = streamRef.current;
    const codec = getStreamCodec();
    if (stream && codec) runMSE(stream, codec);
  }, [recordingPaused, clipActive, runMSE]);

  // REC w trakcie sesji. Pierwsze uzbrojenie buduje potok klipu; kolejne
  // przelaczenia to pause/resume tego samego recordera, wiec caly material
  // laduje w JEDNYM pliku i wczesniejsze ujecia nie gina.
  const toggleClipRecording = useCallback(() => {
    const fr = fullRecorderRef.current;
    if (!fr) { startClipPipeline(); return; }
    if (clipActive) {
      try { fr.pause(); } catch { /* ignore */ }
      setClipActive(false);
    } else {
      try { fr.resume(); } catch { /* ignore */ }
      setClipActive(true);
    }
  }, [clipActive, startClipPipeline]);

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

  const stopMirror = useCallback(() => {
    cleanup();
    onBack();
  }, [cleanup, onBack]);

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
        <button onClick={onBack} className="absolute top-6 left-5 text-white/50 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-3xl">arrow_back</span>
        </button>
        <span className="material-symbols-outlined text-amber-400 text-5xl mb-4">warning</span>
        <h2 className="text-xl font-black text-white text-center mb-2">{t('delayMirror.unsupportedTitle')}</h2>
        <p className="text-gray-400 text-center text-sm leading-relaxed">
          {t('delayMirror.unsupportedDesc')}
        </p>
        <button onClick={onBack} className="mt-8 px-8 py-3 bg-white/10 text-white rounded-2xl font-bold text-sm active:scale-95 transition-all">
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
        <button onClick={onBack} className="absolute top-6 left-5 text-white/50 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-3xl">arrow_back</span>
        </button>
        <span className="material-symbols-outlined text-red-400 text-5xl mb-4">error</span>
        <h2 className="text-xl font-black text-white text-center mb-2">{t('delayMirror.errorTitle')}</h2>
        <p className="text-gray-400 text-center text-sm leading-relaxed mb-6">{errorMsg}</p>
        <button onClick={onBack} className="px-8 py-3 bg-white/10 text-white rounded-2xl font-bold text-sm active:scale-95 transition-all">
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

  // Kafelek wyboru na ekranie startowym (orientacja + tryb sesji). Jeden
  // wzorzec zamiast czterech kopii tego samego lancucha klas. Celowo drobny:
  // na malych telefonach cztery duze kafle spychaly Start pod krawedz.
  const pickerBtn = (active: boolean) =>
    `flex-1 py-2 px-1.5 rounded-xl font-black text-[10px] uppercase tracking-wider leading-tight text-center active:scale-95 transition-all flex flex-col items-center justify-center gap-0.5 border ${
      active
        ? 'bg-[#fed33e] text-[#0a3a2a] border-[#fed33e] shadow-lg shadow-[#fed33e]/20'
        : 'bg-white/5 text-white/70 border-white/15'
    }`;

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
                {t('delayMirror.positioningStart')}
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
      <div style={screenStyle} className="bg-[#050f0a]">
        <div style={uiRotateStyle} className={`overflow-y-auto ${_displayAsLandscape ? 'flex flex-row items-center justify-center gap-8 px-10 py-4' : 'flex flex-col items-center justify-center px-8 py-6'}`}>
        <button onClick={onBack} className={`absolute text-white/50 active:scale-90 transition-all z-10 ${_displayAsLandscape ? 'top-6 right-5' : 'top-6 left-5'}`}>
          <span className="material-symbols-outlined text-3xl">arrow_back</span>
        </button>

        {/* LEWA KOLUMNA (lub górna w portrait): logo + ikona + tytuł + opóźnienie + privacy */}
        <div className={`flex flex-col items-center ${_displayAsLandscape ? 'flex-1 max-w-xs' : 'w-full'}`}>
          {/* Logo GROT-X z kropką */}
          <div className="flex items-baseline gap-0.5 mb-3">
            <h1 className="text-4xl font-black text-[#fed33e] tracking-tighter leading-none">GROT</h1>
            <h1 className="text-4xl font-black text-white tracking-tighter leading-none">-X</h1>
            <div className="w-2.5 h-2.5 bg-[#fed33e] rounded-full ml-1 relative bottom-[0.48em] shadow-sm" />
          </div>
          <div className="w-14 h-14 bg-[#fed33e]/10 rounded-3xl flex items-center justify-center mb-2">
            <span className="material-symbols-outlined text-[#fed33e] text-4xl">slow_motion_video</span>
          </div>
          <h2 className={`font-black text-white mb-2 ${_displayAsLandscape ? 'text-xl' : 'text-2xl'}`}>{t('delayMirror.title')}</h2>
          <div className="flex items-center gap-2 bg-[#fed33e]/10 rounded-xl px-4 py-2 mb-4">
            <span className="material-symbols-outlined text-[#fed33e] text-base">schedule</span>
            <span className="text-[#fed33e] text-xs font-bold">{t('delayMirror.delayBadge', { seconds: delaySeconds })}</span>
          </div>
          {/* Privacy note — w landscape w lewej kolumnie */}
          {_displayAsLandscape && (
            <div className="flex items-start gap-2 bg-white/5 rounded-xl px-3 py-2 mt-auto">
              <span className="material-symbols-outlined text-[#fed33e]/70 text-sm mt-0.5">lock</span>
              <p className="text-white/50 text-[10px] leading-snug">{t('delayMirror.privacyNote')}</p>
            </div>
          )}
        </div>

        {/* PRAWA KOLUMNA (lub dolna w portrait): suwak + orientacja + start */}
        <div className={`flex flex-col items-stretch ${_displayAsLandscape ? 'flex-1 max-w-xs gap-2.5' : 'w-full max-w-xs gap-3 mt-1'}`}>
          {/* Suwak opóźnienia */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/70 text-xs font-bold uppercase tracking-widest">{t('delayMirror.delayLabel')}</span>
              <span className="text-[#fed33e] text-lg font-black tabular-nums">{delaySeconds}s</span>
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
            <div className="flex justify-between text-[10px] text-white/40 mt-1 font-bold">
              <span>{MIN_DELAY_S}s</span>
              <span>{MAX_DELAY_S}s</span>
            </div>
          </div>

          {/* Wybór orientacji */}
          <div>
            <p className="text-white/70 text-[10px] font-bold uppercase tracking-wider mb-1.5 text-center">
              {t('delayMirror.chooseOrientation')}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setManualLandscape(false); setOrientationConfirmed(true); }}
                className={pickerBtn(orientationConfirmed && !manualLandscape)}
              >
                <span className="material-symbols-outlined text-lg">stay_current_portrait</span>
                {t('delayMirror.orientationPortrait')}
              </button>
              <button
                onClick={() => { setManualLandscape(true); setOrientationConfirmed(true); }}
                className={pickerBtn(orientationConfirmed && manualLandscape)}
              >
                <span className="material-symbols-outlined text-lg">stay_current_landscape</span>
                {t('delayMirror.orientationLandscape')}
              </button>
            </div>
          </div>

          {/* Tryb sesji — samo lustro czy lustro z zapisem klipu */}
          <div>
            <p className="text-white/70 text-[10px] font-bold uppercase tracking-wider mb-1.5 text-center">
              {t('delayMirror.modeLabel')}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setClipMode(false)}
                className={pickerBtn(!clipMode)}
              >
                <span className="material-symbols-outlined text-lg">visibility</span>
                {t('delayMirror.modeMirror')}
              </button>
              <button
                onClick={() => setClipMode(true)}
                className={pickerBtn(clipMode)}
              >
                <span className="material-symbols-outlined text-lg">videocam</span>
                {t('delayMirror.modeRecord')}
              </button>
            </div>
            <p className="text-white/40 text-[10px] leading-snug mt-1.5 text-center">
              {clipMode ? t('delayMirror.modeRecordHint') : t('delayMirror.modeMirrorHint')}
            </p>
          </div>

          <button
            onClick={startRecording}
            disabled={!orientationConfirmed}
            className={`w-full py-4 rounded-2xl font-black text-base uppercase tracking-widest transition-all ${
              orientationConfirmed
                ? 'bg-[#fed33e] text-[#0a3a2a] active:scale-95 shadow-lg shadow-[#fed33e]/20'
                : 'bg-white/10 text-white/30 cursor-not-allowed'
            }`}
          >
            {t('delayMirror.start')}
          </button>

          {/* Privacy note — w portrait pod startem */}
          {!_displayAsLandscape && (
            <div className="flex items-start gap-2 bg-white/5 rounded-xl px-3 py-2">
              <span className="material-symbols-outlined text-[#fed33e]/70 text-sm mt-0.5">lock</span>
              <p className="text-white/50 text-[11px] leading-snug">{t('delayMirror.privacyNote')}</p>
            </div>
          )}
        </div>

        </div>{/* /uiRotateStyle */}
      </div>
      </>
    );
  }

  return (
    <>
    {orientationToggle}
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


      {(mirrorState === 'buffering' || mirrorState === 'live') && (
        <div className={`absolute top-4 z-30 flex items-center gap-2 flex-wrap max-w-[calc(100%-5rem)] ${_uiForceRotate ? 'right-4 flex-row-reverse' : 'left-4'}`}>
          {/* Licznik — tylko gdy klip faktycznie zbiera material. W trybie
              samego lustra czerwona kropka bylaby klamstwem. */}
          {clipActive && (
            <div className="flex items-center gap-1.5 bg-red-600/80 backdrop-blur-sm rounded-xl px-3 py-1.5 border border-red-500/40">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              <span className="text-white text-xs font-bold tabular-nums">{formatTime(recSeconds)}</span>
            </div>
          )}
          {/* REC i siatka dzialaja juz w trakcie buforowania — czekanie
              na bufor to naturalny moment, zeby je ustawic. Tylko suwak
              opoznienia czeka na 'live', bo zmiana w trakcie buforowania
              przestawialaby prog, ktory wlasnie jest odliczany. */}
              {/* REC — czy ten fragment ma trafic do klipu */}
              <button
                onClick={toggleClipRecording}
                disabled={recordingPaused}
                className={`flex items-center gap-1.5 backdrop-blur-sm rounded-xl px-3 py-1.5 active:scale-95 transition-all border ${
                  recordingPaused
                    ? 'bg-white/5 text-white/25 border-white/10'
                    : clipActive
                      ? 'bg-red-600/80 text-white border-red-500/40'
                      : 'bg-black/60 text-white/60 border-white/20'
                }`}
              >
                <span className="material-symbols-outlined text-sm">
                  {clipActive ? 'radio_button_checked' : 'radio_button_unchecked'}
                </span>
                <span className="text-xs font-bold uppercase tracking-wider">
                  {clipActive ? t('delayMirror.recOn') : t('delayMirror.recOff')}
                </span>
              </button>

              {/* Siatka — nakladka na obraz, nagrania nie dotyka */}
              <button
                onClick={() => setShowGrid(v => !v)}
                className={`flex items-center gap-1.5 backdrop-blur-sm rounded-xl px-3 py-1.5 active:scale-95 transition-all border ${
                  showGrid
                    ? 'bg-[#4ade80]/20 text-[#4ade80] border-[#4ade80]/40'
                    : 'bg-black/60 text-white/60 border-white/20'
                }`}
              >
                <span className="material-symbols-outlined text-sm">grid_on</span>
                <span className="text-xs font-bold">{t('delayMirror.grid')}</span>
              </button>

              {/* Opoznienie — ustawienie widoku */}
              {mirrorState === 'live' && (
                <button
                  onClick={() => setShowDelayPicker(true)}
                  className="flex items-center gap-1.5 bg-[#fed33e]/20 backdrop-blur-sm rounded-xl px-3 py-1.5 active:scale-95 transition-all border border-[#fed33e]/40"
                >
                  <span className="material-symbols-outlined text-[#fed33e] text-sm">schedule</span>
                  <span className="text-[#fed33e] text-xs font-bold">-{delaySeconds}s</span>
                  <span className="material-symbols-outlined text-[#fed33e] text-sm">tune</span>
                </button>
              )}
        </div>
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

      {/* DOLNY PASEK = akcje sesji. Ustawienia widoku (siatka, opoznienie)
          i REC siedza na gorze — dzieki temu nic, co tylko zmienia obraz,
          nie stoi obok przycisku konczacego nagranie. */}
      {(mirrorState === 'buffering' || mirrorState === 'live') && (
        <div className="absolute bottom-6 inset-x-0 z-30 flex justify-center items-stretch gap-3 px-8">
          {/* PAUZA — "idę po strzały": zamraza obraz i oszczedza baterie.
              Dziala w obu trybach, bo nie dotyczy klipu tylko mojej obecnosci. */}
          <button
            onClick={toggleRecordingPause}
            className={`flex-1 max-w-[10rem] py-3 px-4 backdrop-blur-sm rounded-2xl active:scale-95 transition-all flex flex-col items-center justify-center gap-0.5 border ${
              recordingPaused
                ? 'bg-[#fed33e]/25 text-[#fed33e] border-[#fed33e]/50'
                : 'bg-white/10 text-white/80 border-white/15'
            }`}
          >
            <span className="material-symbols-outlined text-2xl leading-none">
              {recordingPaused ? 'play_arrow' : 'pause'}
            </span>
            <span className="text-[11px] font-black uppercase tracking-widest leading-tight">
              {recordingPaused ? t('delayMirror.resumePause') : t('delayMirror.pauseBtn')}
            </span>
          </button>

          {/* ZAKONCZ — akcja terminalna. Druga linia mowi, gdzie laduje user:
              z klipem do powtorki, bez klipu prosto do menu. */}
          <button
            onClick={finishRecording}
            className="flex-1 max-w-[10rem] py-3 px-4 bg-red-600/80 backdrop-blur-sm text-white rounded-2xl active:scale-95 transition-all flex flex-col items-center justify-center gap-0.5 border border-red-500/40 shadow-lg shadow-red-900/30"
          >
            <span className="material-symbols-outlined text-2xl leading-none">stop_circle</span>
            <span className="text-[11px] font-black uppercase tracking-widest leading-tight">
              {t('delayMirror.finish')}
            </span>
            <span className="text-[10px] font-bold text-white/60 leading-tight">
              {hasClip ? t('delayMirror.finishToReplay') : t('delayMirror.finishToMenu')}
            </span>
          </button>
        </div>
      )}

      {showDelayPicker && (
        <div
          className="absolute inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-40 px-8"
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
            <div className="flex justify-between text-[10px] text-white/40 mt-1 mb-5 font-bold">
              <span>{MIN_DELAY_S}s</span>
              <span>{MAX_DELAY_S}s</span>
            </div>
            <button
              onClick={() => setShowDelayPicker(false)}
              className="w-full py-3 bg-[#fed33e] text-[#0a3a2a] rounded-2xl font-black text-sm uppercase tracking-widest active:scale-95 transition-all"
            >
              OK
            </button>
          </div>
        </div>
      )}

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
