import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { db, auth } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

const DEFAULT_DELAY_S = 15;
const MIN_DELAY_S = 1;
const MAX_DELAY_S = 30;
const STORAGE_KEY = 'delayMirror.delaySeconds';

type MirrorState = 'idle' | 'requesting' | 'positioning' | 'buffering' | 'live' | 'paused' | 'unsupported' | 'error' | 'freeLive';

interface Props {
  onBack: () => void;
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

export default function DelayMirrorView({ onBack }: Props) {
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
  const replayVideoRef = useRef<HTMLVideoElement>(null);
  const replayBlobUrlRef = useRef<string | null>(null);
  const mseCleanupRef = useRef<(() => void) | null>(null);
  const mseRafRef = useRef<number | null>(null);
  // Pending MSE — czekamy az DOM zamontuje delayedVideoRef po przejsciu
  // ze stanu 'positioning' do 'buffering', dopiero potem odpalamy pipeline.
  const pendingMSERef = useRef<{ stream: MediaStream; codec: string } | null>(null);
  const [replayRate, setReplayRate] = useState<number>(1);
  const [replayTime, setReplayTime] = useState(0);
  const [replayDuration, setReplayDuration] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [showSetupInstructions, setShowSetupInstructions] = useState(false);
  // Zoom (szerokokat 0.5x na frontowej) — zalezy od track capabilities.
  // Wsparcie: Chrome Android na flagowcach z front ultra-wide. iOS Safari i
  // wiekszosc telefonow bez ultra-wide po prostu nie wystawi zoom < 1 i UI
  // sie nie pokaze.
  const [zoomCaps, setZoomCaps] = useState<{ min: number; max: number; step: number } | null>(null);
  const [cameraZoom, setCameraZoom] = useState<number>(1);
  // Wrapper na video w replay landscape — mierzymy aby dac pixele do video
  // (vw/vh nie dziala w manual landscape bo outer container jest rotowany).
  const replayBoxRef = useRef<HTMLDivElement>(null);
  const [replayBox, setReplayBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [showDelayPicker, setShowDelayPicker] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const activeRecorderRef = useRef<MediaRecorder | null>(null);
  const isPausedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bufferTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);
  const lastBlobRef = useRef<Blob | null>(null);
  // Drugi, ciągły recorder — nagrywa całą sesję od startu do pauzy/stopu
  // równolegle z segmentowym loopem. Dzięki temu "Udostępnij" daje pełny
  // filmik, nie tylko ostatnie 15s.
  const fullRecorderRef = useRef<MediaRecorder | null>(null);
  const fullChunksRef = useRef<BlobPart[]>([]);
  const fullMimeRef = useRef<string>('video/webm');
  const [hasFullBlob, setHasFullBlob] = useState(false);
  const [shareState, setShareState] = useState<'idle' | 'sharing' | 'saved' | 'error'>('idle');

  // Persist delay setting + sync ref
  useEffect(() => {
    delayMsRef.current = delaySeconds * 1000;
    try { localStorage.setItem(STORAGE_KEY, String(delaySeconds)); } catch { /* ignore */ }
  }, [delaySeconds]);

  // Mierz wrapper replay video — wymagane bo vw/vh nie dziala wewnatrz manual
  // landscape (outer wrapper jest rotowany przez transform).
  useEffect(() => {
    const el = replayBoxRef.current;
    if (!el) return;
    const update = () => {
      // offsetWidth/Height = layout dims, niezalezne od transform parenta
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
    timerRef.current = null;
    bufferTimerRef.current = null;
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
    lastBlobRef.current = null;
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
    if (replayBlobUrlRef.current) {
      URL.revokeObjectURL(replayBlobUrlRef.current);
      replayBlobUrlRef.current = null;
    }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // Przypisz strumień do live video ZA KAŻDYM RAZEM gdy video się
  // zrenderuje (np. po zmianie stanu na 'buffering'/'live', albo
  // po rotacji która remontuje drzewo). Bez tego ref jest null w momencie
  // wywołania getUserMedia i PiP pozostaje czarny.
  useEffect(() => {
    if ((mirrorState === 'positioning' || mirrorState === 'freeLive') && liveVideoRef.current && streamRef.current) {
      liveVideoRef.current.srcObject = streamRef.current;
      liveVideoRef.current.play().catch(() => { /* autoplay może odmówić */ });
    }
  }, [mirrorState, isPortrait]);

  // Po pauzie — ustaw src playera replay z pełnego nagrania, żeby user mógł
  // przewijać i oglądać slow-motion. Blob URL zwalniamy przy resume/cleanup.
  useEffect(() => {
    if (mirrorState !== 'paused' || !hasFullBlob || !lastBlobRef.current) return;
    const url = URL.createObjectURL(lastBlobRef.current);
    if (replayBlobUrlRef.current) URL.revokeObjectURL(replayBlobUrlRef.current);
    replayBlobUrlRef.current = url;
    const v = replayVideoRef.current;
    if (v) {
      v.src = url;
      v.playbackRate = replayRate;
      v.currentTime = 0;
      v.play().catch(() => { /* autoplay may fail */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mirrorState, hasFullBlob]);

  // Sync playback rate
  useEffect(() => {
    if (replayVideoRef.current) replayVideoRef.current.playbackRate = replayRate;
  }, [replayRate]);

  // Auto-pause on background
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && (mirrorState === 'live' || mirrorState === 'buffering')) {
        pauseMirror();
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
      if (stopped || isPausedRef.current || !sb || !delayedVideoRef.current) return;
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
        if (stopped || !sb || !delayedVideoRef.current) return;
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

  const shareVideo = useCallback(async () => {
    const blob = lastBlobRef.current;
    if (!blob) return;
    setShareState('sharing');
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
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
      const file = new File([blob], filename, { type: blob.type });
      if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
        await nav.share({
          files: [file],
          title: 'GROT-X Delay Mirror',
        });
        setShareState('idle');
        return;
      }
      // Fallback – pobranie na dysk
      const url = URL.createObjectURL(blob);
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

  // Krok 2: po kliknieciu "Start" w positioning — odlacz live preview,
  // odpal pelny recorder i MSE pipeline.
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

    try {
      fullChunksRef.current = [];
      fullMimeRef.current = fullCodec.split(';')[0];
      const fullRec = new MediaRecorder(stream, { mimeType: fullCodec, videoBitsPerSecond: 1_500_000 });
      fullRec.ondataavailable = (e) => { if (e.data && e.data.size > 0) fullChunksRef.current.push(e.data); };
      fullRec.start(1000);
      fullRecorderRef.current = fullRec;
      setHasFullBlob(false);
    } catch { /* ignore — MSE delay nadal dziala */ }

    setRecSeconds(0);
    timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);

    // Stan -> buffering, runMSE odpalamy w useEffect po commit (delayedVideoRef
    // dopiero wtedy bedzie zamontowany).
    pendingMSERef.current = { stream, codec: streamCodec };
    setMirrorState('buffering');
    setBufferMs(0);
  }, []);

  useEffect(() => {
    if (mirrorState === 'buffering' && pendingMSERef.current && delayedVideoRef.current) {
      const { stream, codec } = pendingMSERef.current;
      pendingMSERef.current = null;
      runMSE(stream, codec);
    }
  }, [mirrorState, runMSE]);

  // Tryb FREE — samo getUserMedia, bez MediaRecorder, bez delay
  const startFreeLive = useCallback(async () => {
    setMirrorState('requesting');
    setErrorMsg('');
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
    setRecSeconds(0);
    timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
    setMirrorState('freeLive');
  }, [t, detectZoomCaps]);

  const pauseMirror = useCallback(() => {
    isPausedRef.current = true;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (bufferTimerRef.current) { clearInterval(bufferTimerRef.current); bufferTimerRef.current = null; }
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
            lastBlobRef.current = new Blob(fullChunksRef.current, { type: fullMimeRef.current });
            setHasFullBlob(true);
          }
        };
        fr.stop();
      }
    } catch { /* ignore */ }
    fullRecorderRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
    delayedVideoRef.current?.pause();
    setMirrorState('paused');
  }, []);

  const resumeMirror = useCallback(() => {
    setMirrorState('idle');
    setBufferMs(0);
    setRecSeconds(0);
    setReplayRate(1);
    setReplayTime(0);
    setReplayDuration(0);
    setReplayPlaying(false);
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
    if (replayBlobUrlRef.current) {
      URL.revokeObjectURL(replayBlobUrlRef.current);
      replayBlobUrlRef.current = null;
    }
    if (replayVideoRef.current) {
      replayVideoRef.current.pause();
      replayVideoRef.current.removeAttribute('src');
      replayVideoRef.current.load();
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
    setHasFullBlob(false);
    setBufferMs(0);
    setRecSeconds(0);
    setReplayRate(1);
    setShareState('idle');
    isPausedRef.current = false;
    setMirrorState('idle');
  }, [cleanup]);

  const replaySeek = useCallback((delta: number) => {
    const v = replayVideoRef.current;
    if (!v) return;
    const dur = isFinite(v.duration) ? v.duration : 0;
    const t = Math.max(0, Math.min(dur || 1e9, v.currentTime + delta));
    v.currentTime = t;
  }, []);

  const replayRestart = useCallback(() => {
    const v = replayVideoRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.play().catch(() => { /* ignore */ });
  }, []);

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

  if (!isPremium && mirrorState !== 'freeLive' && mirrorState !== 'requesting' && mirrorState !== 'error') {
    return (
      <>
      {orientationToggle}
      <div style={screenStyle} className="bg-[#0a0a0a] flex flex-col items-center justify-center px-8">
        <button onClick={onBack} className="absolute top-6 left-5 text-white/50 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-3xl">arrow_back</span>
        </button>
        <div className="w-16 h-16 bg-[#fed33e]/10 rounded-2xl flex items-center justify-center mb-5">
          <span className="material-symbols-outlined text-[#fed33e] text-4xl">slow_motion_video</span>
        </div>
        <h2 className="text-2xl font-black text-white text-center mb-2">{t('delayMirror.title')}</h2>
        <p className="text-gray-400 text-center text-sm mb-1 leading-relaxed">
          {t('delayMirror.description', { seconds: delaySeconds })}
        </p>
        <p className="text-[#fed33e]/80 text-center text-xs mb-8 leading-relaxed">
          {t('delayMirror.proRequired')}
        </p>
        <div className="w-full max-w-xs">
          <div className="bg-white/5 rounded-2xl p-4 mb-4 space-y-2">
            {[t('delayMirror.feature1', { seconds: delaySeconds }), t('delayMirror.feature2'), t('delayMirror.feature3'), t('delayMirror.feature4')].map(f => (
              <div key={f} className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#fed33e] text-base">check_circle</span>
                <span className="text-white/70 text-xs">{f}</span>
              </div>
            ))}
          </div>
          <button
            onClick={startFreeLive}
            className="w-full py-3 mb-2 bg-white/15 text-white rounded-2xl font-bold text-sm active:scale-95 transition-all flex items-center justify-center gap-2 border border-white/20"
          >
            <span className="material-symbols-outlined text-lg">videocam</span>
            {t('delayMirror.livePreviewBtn')}
          </button>
          <button
            onClick={onBack}
            className="w-full py-3 bg-white/10 text-white rounded-2xl font-bold text-sm active:scale-95 transition-all"
          >
            {t('delayMirror.back')}
          </button>
        </div>
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
        <div style={uiRotateStyle}>
          {/* Dol: zoom switcher (jezeli wsparte) + start button */}
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
            <button
              onClick={beginDelayedRecording}
              className="px-10 py-4 bg-[#fed33e] text-[#0a3a2a] rounded-2xl font-black text-base uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-[#fed33e]/30 flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-xl">play_arrow</span>
              {t('delayMirror.positioningStart')}
            </button>
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
        <div className={`flex flex-col items-stretch ${_displayAsLandscape ? 'flex-1 max-w-xs gap-3' : 'w-full max-w-xs gap-4 mt-2'}`}>
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
            <p className="text-white/70 text-xs font-bold uppercase tracking-widest mb-2 text-center">
              {t('delayMirror.chooseOrientation')}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setManualLandscape(false); setOrientationConfirmed(true); }}
                className={`flex-1 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all flex flex-col items-center gap-1 border-2 ${
                  orientationConfirmed && !manualLandscape
                    ? 'bg-[#fed33e] text-[#0a3a2a] border-[#fed33e] shadow-lg shadow-[#fed33e]/20'
                    : 'bg-white/5 text-white/70 border-white/15'
                }`}
              >
                <span className="material-symbols-outlined text-2xl">stay_current_portrait</span>
                {t('delayMirror.orientationPortrait')}
              </button>
              <button
                onClick={() => { setManualLandscape(true); setOrientationConfirmed(true); }}
                className={`flex-1 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all flex flex-col items-center gap-1 border-2 ${
                  orientationConfirmed && manualLandscape
                    ? 'bg-[#fed33e] text-[#0a3a2a] border-[#fed33e] shadow-lg shadow-[#fed33e]/20'
                    : 'bg-white/5 text-white/70 border-white/15'
                }`}
              >
                <span className="material-symbols-outlined text-2xl">stay_current_landscape</span>
                {t('delayMirror.orientationLandscape')}
              </button>
            </div>
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

  // Tryb FREE — czarne tło, tylko mała kamerka live + CTA upgrade
  if (mirrorState === 'freeLive') {
    return (
      <>
      {orientationToggle}
      <div style={screenStyle} className="bg-black flex flex-col items-center justify-center px-8">
        <div className="rounded-2xl overflow-hidden border-2 border-[#fed33e]/40 shadow-2xl mb-6 relative"
             style={{ width: _displayAsLandscape ? '60vw' : '50vw', maxWidth: _displayAsLandscape ? 280 : 200, aspectRatio: liveAspect }}>
          <video
            ref={liveVideoRef}
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
            playsInline
            muted
          />
          <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            <span className="text-white text-[10px] font-bold uppercase tracking-widest">LIVE</span>
          </div>
          <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[10px] text-white text-center py-1 font-bold uppercase tracking-widest">
            {formatTime(recSeconds)}
          </div>
        </div>
        {zoomCaps && (
          <div className="flex gap-2 bg-black/55 backdrop-blur-sm rounded-2xl p-1.5 border border-white/10 mb-3">
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
        <p className="text-[#fed33e]/90 text-center text-xs font-bold mb-1">{t('delayMirror.proRequired')}</p>
        <p className="text-white/50 text-center text-xs mb-6 px-4 leading-relaxed">{t('delayMirror.livePreviewInfo')}</p>
        <button
          onClick={stopMirror}
          className="px-10 py-3 bg-white/15 text-white rounded-2xl font-bold text-sm active:scale-95 transition-all border border-white/20"
        >
          {t('delayMirror.stop')}
        </button>
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

      {mirrorState === 'paused' && (
        <div className={`absolute inset-0 bg-black/95 z-20 overflow-y-auto py-4 px-4 ${
          _displayAsLandscape && hasFullBlob
            ? 'flex flex-row items-stretch gap-4'
            : 'flex flex-col items-center'
        }`}>
          {/* Lewa kolumna w landscape = filmik. W portrait = wszystko na górze. */}
          {hasFullBlob ? (
            (() => {
              // W widoku poziomym blob nie ma metadanych rotacji — wymuszamy
              // +90deg cw na wrapper div. Custom scrubber ponizej (nie rotowany)
              // zeby pasek postepu byl na dole zamiast po prawej.
              const needsRotate = _displayAsLandscape;
              const fmtT = (s: number) => {
                if (!isFinite(s)) return '0:00';
                const m = Math.floor(s / 60);
                const sec = Math.floor(s % 60);
                return `${m}:${String(sec).padStart(2, '0')}`;
              };
              return (
                <div className={`${_displayAsLandscape ? 'flex-1 flex flex-col items-center justify-center min-w-0 gap-2' : 'w-full max-w-md'}`}>
                  <div
                    ref={replayBoxRef}
                    className={`${_displayAsLandscape ? 'relative' : 'w-full mb-3 rounded-2xl overflow-hidden border border-white/15'} bg-black flex items-center justify-center`}
                    style={
                      _displayAsLandscape
                        ? { width: '100%', flex: '1 1 auto', minHeight: 0, alignSelf: 'stretch' }
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
                          : { display: 'inline-block', lineHeight: 0 }
                      }
                    >
                      <video
                        ref={replayVideoRef}
                        className="block bg-black"
                        style={{
                          // Pre-rotate: width = visual height, height = visual width.
                          // Uzywamy zmierzonego boxa parenta (px) zamiast vw/vh.
                          width: needsRotate ? `${replayBox.h}px` : undefined,
                          height: needsRotate ? `${replayBox.w}px` : undefined,
                          maxWidth: needsRotate ? undefined : '100%',
                          maxHeight: needsRotate ? undefined : '40vh',
                          objectFit: 'contain',
                          display: 'block',
                          // Mirror — live preview ma scaleX(-1), recording surowy.
                          // Po parent rotate(90deg) scaleY(-1) na childu = poziomy flip
                          // wizualny. W portrait (bez rotate) potrzeba scaleX(-1).
                          transform: needsRotate ? 'scaleY(-1)' : 'scaleX(-1)',
                        }}
                        onLoadedMetadata={(e) => {
                          const v = e.currentTarget;
                          setReplayDuration(v.duration || 0);
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
                        loop
                      />
                    </div>
                  </div>

                  {/* Custom scrubber + play/pause + czas — na dole w landscape,
                      zawsze niezaleznie od rotacji video */}
                  <div className={`${_displayAsLandscape ? 'w-full flex items-center gap-2 px-2' : 'w-full flex items-center gap-2 px-2 mt-2 mb-3'}`}>
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
                    <span className="text-white/70 text-[10px] font-bold tabular-nums flex-shrink-0">{fmtT(replayTime)}</span>
                    <input
                      type="range"
                      min={0}
                      max={replayDuration || 1}
                      step={0.05}
                      value={Math.min(replayTime, replayDuration || 1)}
                      onChange={(e) => {
                        const v = replayVideoRef.current;
                        if (!v) return;
                        const t = parseFloat(e.target.value);
                        v.currentTime = t;
                        setReplayTime(t);
                      }}
                      className="flex-1 accent-[#fed33e]"
                    />
                    <span className="text-white/70 text-[10px] font-bold tabular-nums flex-shrink-0">{fmtT(replayDuration)}</span>
                  </div>
                </div>
              );
            })()
          ) : (
            !_displayAsLandscape && (
              <span className="material-symbols-outlined text-white/30 text-6xl mb-4 mt-4 block">pause_circle</span>
            )
          )}

          {/* Prawa kolumna w landscape = menu/kontrolki. W portrait = poniżej filmiku. */}
          <div className={`${
            _displayAsLandscape
              ? 'w-[30%] max-w-xs flex flex-col items-stretch gap-2 overflow-y-auto max-h-full py-2'
              : 'w-full max-w-md flex flex-col items-center gap-2 mt-2'
          }`}>
            <p className={`text-white font-black ${_displayAsLandscape ? 'text-base text-center mb-0' : 'text-lg mt-1'}`}>
              {t('delayMirror.pauseTitle')}
            </p>
            <p className={`text-white/50 text-xs text-center ${_displayAsLandscape ? 'mb-1' : 'mb-2'}`}>
              {t('delayMirror.pauseHint')}
            </p>

            {hasFullBlob && (
              <div className="w-full">
                <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-1 text-center">
                  {t('delayMirror.replaySpeed')}
                </p>
                <div className="flex justify-center gap-2 mb-2">
                  {[0.25, 0.5, 1, 2].map(rate => (
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
              onClick={resumeMirror}
              className={`${_displayAsLandscape ? 'w-full' : 'w-full max-w-xs'} py-3.5 bg-[#fed33e] text-[#0a3a2a] rounded-2xl font-black text-sm uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-[#fed33e]/20`}
            >
              {t('delayMirror.resumeBtn')}
            </button>
            {hasFullBlob && (
              <button
                onClick={shareVideo}
                disabled={shareState === 'sharing'}
                className={`${_displayAsLandscape ? 'w-full' : 'w-full max-w-xs'} py-3 bg-white/15 text-white rounded-2xl font-bold text-sm active:scale-95 transition-all flex items-center justify-center gap-2 border border-white/20 disabled:opacity-50`}
              >
                <span className="material-symbols-outlined text-lg">
                  {shareState === 'saved' ? 'check_circle' : shareState === 'error' ? 'error' : 'share'}
                </span>
                {shareState === 'sharing' && t('delayMirror.shareSharing')}
                {shareState === 'saved' && t('delayMirror.shareSaved')}
                {shareState === 'error' && t('delayMirror.shareError')}
                {shareState === 'idle' && t('delayMirror.shareIdle')}
              </button>
            )}
            <button
              onClick={endSession}
              className={`${_displayAsLandscape ? 'w-full' : 'w-full max-w-xs'} py-3 bg-white/10 text-white/70 rounded-2xl font-bold text-sm active:scale-95 transition-all`}
            >
              {t('delayMirror.endSession')}
            </button>
          </div>
        </div>
      )}


      {(mirrorState === 'buffering' || mirrorState === 'live') && (
        <div className={`absolute top-4 z-30 flex items-center gap-2 ${_uiForceRotate ? 'right-4 flex-row-reverse' : 'left-4'}`}>
          <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-xl px-3 py-1.5">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-white text-xs font-bold">{formatTime(recSeconds)}</span>
          </div>
          {mirrorState === 'live' && (
            <button
              onClick={() => setShowDelayPicker(true)}
              className="flex items-center gap-1.5 bg-[#fed33e]/20 backdrop-blur-sm rounded-xl px-3 py-1.5 active:scale-95 transition-all border border-[#fed33e]/40"
              title={t('delayMirror.delayLabel')}
            >
              <span className="material-symbols-outlined text-[#fed33e] text-sm">schedule</span>
              <span className="text-[#fed33e] text-xs font-bold">-{delaySeconds}s</span>
              <span className="material-symbols-outlined text-[#fed33e] text-sm">tune</span>
            </button>
          )}
        </div>
      )}

      {(mirrorState === 'buffering' || mirrorState === 'live') && (
        <div className="absolute bottom-6 inset-x-0 z-30 flex justify-center gap-3 px-8">
          <button
            onClick={pauseMirror}
            className="flex-1 max-w-[160px] py-3.5 bg-white/15 backdrop-blur-sm text-white rounded-2xl font-black text-sm uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 border border-white/20"
          >
            <span className="material-symbols-outlined text-lg">directions_walk</span>
            {t('delayMirror.afterShots')}
          </button>
          <button
            onClick={pauseMirror}
            className="py-3.5 px-5 bg-white/10 backdrop-blur-sm text-white/60 rounded-2xl font-bold text-sm active:scale-95 transition-all border border-white/10"
            title={t('delayMirror.pauseTooltip')}
          >
            <span className="material-symbols-outlined text-xl">pause</span>
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
