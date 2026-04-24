import React, { useEffect, useRef, useState, useCallback } from 'react';
import { db, auth } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

const DELAY_MS = 15_000;

type MirrorState = 'idle' | 'requesting' | 'buffering' | 'live' | 'paused' | 'unsupported' | 'error';

interface Props {
  onBack: () => void;
}

function getCodec(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return null;
}

function recordSegment(stream: MediaStream, mimeType: string, ms: number): Promise<{ blob: Blob; recorder: MediaRecorder }> {
  return new Promise((resolve, reject) => {
    try {
      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_500_000 });
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      recorder.onerror = (e) => reject(e);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
        resolve({ blob, recorder });
      };
      recorder.start();
      setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, ms);
    } catch (err) {
      reject(err);
    }
  });
}

export default function DelayMirrorView({ onBack }: Props) {
  const [isPremium, setIsPremium] = useState(false);
  const [premiumLoading, setPremiumLoading] = useState(true);
  const [mirrorState, setMirrorState] = useState<MirrorState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [recSeconds, setRecSeconds] = useState(0);
  const [bufferMs, setBufferMs] = useState(0);
  const [isPortrait, setIsPortrait] = useState(
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false
  );
  // Fizyczny kąt obrotu urządzenia (0 / 90 / 180 / 270). Potrzebny żeby
  // rotować UI gdy user ma zablokowaną rotację w systemie ale fizycznie
  // obrócił telefon — screen.orientation.angle odczytuje rzeczywistą
  // orientację niezależnie od blokady przeglądarki.
  const [deviceAngle, setDeviceAngle] = useState(0);

  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const delayedVideoRef = useRef<HTMLVideoElement>(null);
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

  // Orientation
  useEffect(() => {
    const update = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
      const so = (screen as Screen & { orientation?: { angle: number } }).orientation;
      if (so && typeof so.angle === 'number') setDeviceAngle(so.angle);
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    const so = (screen as Screen & { orientation?: EventTarget }).orientation;
    so?.addEventListener?.('change', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      so?.removeEventListener?.('change', update);
    };
  }, []);

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
    if ((mirrorState === 'buffering' || mirrorState === 'live') && liveVideoRef.current && streamRef.current) {
      liveVideoRef.current.srcObject = streamRef.current;
      liveVideoRef.current.play().catch(() => { /* autoplay może odmówić */ });
    }
  }, [mirrorState, isPortrait]);

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

  const playBlob = useCallback((blob: Blob) => {
    const vid = delayedVideoRef.current;
    if (!vid) return;
    const url = URL.createObjectURL(blob);
    const oldUrl = currentBlobUrlRef.current;
    currentBlobUrlRef.current = url;
    vid.src = url;
    vid.loop = true;
    vid.play().catch(() => { /* autoplay may fail silently */ });
    // Revoke old URL after a tick to avoid interrupting playback
    if (oldUrl) setTimeout(() => URL.revokeObjectURL(oldUrl), 1000);
  }, []);

  const shareVideo = useCallback(async () => {
    const blob = lastBlobRef.current;
    if (!blob) return;
    setShareState('sharing');
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const today = new Date().toISOString().slice(0, 10);
    const filename = `GROTX_DelayMirror_${today}.${ext}`;
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
          text: `Mój strzał – ${today}`,
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

  const runLoop = useCallback(async (stream: MediaStream, mimeType: string) => {
    // FIRST segment = buffering phase
    setMirrorState('buffering');
    setBufferMs(0);
    bufferTimerRef.current = setInterval(() => {
      setBufferMs(b => Math.min(DELAY_MS, b + 100));
    }, 100);

    try {
      const firstRec = recordSegment(stream, mimeType, DELAY_MS);
      const { blob: firstBlob } = await firstRec;
      if (isPausedRef.current) return;

      if (bufferTimerRef.current) { clearInterval(bufferTimerRef.current); bufferTimerRef.current = null; }

      // Start next recording IMMEDIATELY, then play the just-finished one
      let nextPromise = recordSegment(stream, mimeType, DELAY_MS);
      playBlob(firstBlob);
      setMirrorState('live');

      // Continuous loop
      while (!isPausedRef.current) {
        const { blob } = await nextPromise;
        if (isPausedRef.current) break;
        nextPromise = recordSegment(stream, mimeType, DELAY_MS);
        playBlob(blob);
      }
    } catch (err: unknown) {
      if (!isPausedRef.current) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMsg(`Błąd nagrywania: ${msg}`);
        setMirrorState('error');
      }
    }
  }, [playBlob]);

  const startRecording = useCallback(async () => {
    setMirrorState('requesting');
    setErrorMsg('');

    const codec = getCodec();
    if (!codec) {
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
      setErrorMsg(e.name === 'NotAllowedError' ? 'Brak zgody na kamerę.' : `Błąd kamery: ${e.message || 'nieznany'}`);
      setMirrorState('error');
      return;
    }

    streamRef.current = stream;
    isPausedRef.current = false;

    // Start pełnego nagrywania całej sesji — chunki zbieramy co 1s żeby
    // uniknąć jednego gigantycznego buforu w pamięci.
    try {
      fullChunksRef.current = [];
      fullMimeRef.current = codec.split(';')[0];
      const fullRec = new MediaRecorder(stream, { mimeType: codec, videoBitsPerSecond: 1_500_000 });
      fullRec.ondataavailable = (e) => { if (e.data && e.data.size > 0) fullChunksRef.current.push(e.data); };
      fullRec.start(1000);
      fullRecorderRef.current = fullRec;
      setHasFullBlob(false);
    } catch { /* ignore — segmenty nadal działają */ }

    setRecSeconds(0);
    timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);

    runLoop(stream, codec);
  }, [runLoop]);

  const pauseMirror = useCallback(() => {
    isPausedRef.current = true;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (bufferTimerRef.current) { clearInterval(bufferTimerRef.current); bufferTimerRef.current = null; }
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

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const bufferPct = Math.round((bufferMs / DELAY_MS) * 100);

  // ─── PRO Gate ───────────────────────────────────────────────────────────────
  if (premiumLoading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!isPremium) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center z-50 px-8">
        <button onClick={onBack} className="absolute top-6 left-5 text-white/50 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-3xl">arrow_back</span>
        </button>
        <div className="w-16 h-16 bg-[#fed33e]/10 rounded-2xl flex items-center justify-center mb-5">
          <span className="material-symbols-outlined text-[#fed33e] text-4xl">slow_motion_video</span>
        </div>
        <h2 className="text-2xl font-black text-white text-center mb-2">Delay Mirror</h2>
        <p className="text-gray-400 text-center text-sm mb-1 leading-relaxed">
          Live kamera z opóźnieniem 15s — obserwuj własną technikę strzału zaraz po powrocie od tarczy.
        </p>
        <p className="text-[#fed33e]/80 text-center text-xs mb-8 leading-relaxed">
          Funkcja dostępna w GROT-X PRO
        </p>
        <div className="w-full max-w-xs">
          <div className="bg-white/5 rounded-2xl p-4 mb-4 space-y-2">
            {['15s opóźnienie — "po strzałach" widzisz samego siebie', 'Przednia kamera — ustaw telefon i strzelaj', 'Pauza "Po strzały" — oszczędza baterię', 'Zero uploadu — wideo tylko w RAM'].map(f => (
              <div key={f} className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#fed33e] text-base">check_circle</span>
                <span className="text-white/70 text-xs">{f}</span>
              </div>
            ))}
          </div>
          <button
            onClick={onBack}
            className="w-full py-3 bg-white/10 text-white rounded-2xl font-bold text-sm active:scale-95 transition-all"
          >
            Wróć
          </button>
        </div>
      </div>
    );
  }

  if (mirrorState === 'unsupported') {
    return (
      <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center z-50 px-8">
        <button onClick={onBack} className="absolute top-6 left-5 text-white/50 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-3xl">arrow_back</span>
        </button>
        <span className="material-symbols-outlined text-amber-400 text-5xl mb-4">warning</span>
        <h2 className="text-xl font-black text-white text-center mb-2">Przeglądarka nieobsługiwana</h2>
        <p className="text-gray-400 text-center text-sm leading-relaxed">
          Delay Mirror wymaga Chrome na Androidzie lub Safari na iOS 15+.
        </p>
        <button onClick={onBack} className="mt-8 px-8 py-3 bg-white/10 text-white rounded-2xl font-bold text-sm active:scale-95 transition-all">
          Wróć
        </button>
      </div>
    );
  }

  if (mirrorState === 'error') {
    return (
      <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center z-50 px-8">
        <button onClick={onBack} className="absolute top-6 left-5 text-white/50 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-3xl">arrow_back</span>
        </button>
        <span className="material-symbols-outlined text-red-400 text-5xl mb-4">error</span>
        <h2 className="text-xl font-black text-white text-center mb-2">Błąd</h2>
        <p className="text-gray-400 text-center text-sm leading-relaxed mb-6">{errorMsg}</p>
        <button onClick={onBack} className="px-8 py-3 bg-white/10 text-white rounded-2xl font-bold text-sm active:scale-95 transition-all">
          Wróć
        </button>
      </div>
    );
  }

  if (mirrorState === 'idle') {
    return (
      <div className="fixed inset-0 bg-[#050f0a] flex flex-col items-center justify-center z-50 px-8">
        <button onClick={onBack} className="absolute top-6 left-5 text-white/50 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-3xl">arrow_back</span>
        </button>
        <div className="w-20 h-20 bg-[#fed33e]/10 rounded-3xl flex items-center justify-center mb-6">
          <span className="material-symbols-outlined text-[#fed33e] text-5xl">slow_motion_video</span>
        </div>
        <h2 className="text-3xl font-black text-white mb-1">Delay Mirror</h2>
        <p className="text-gray-400 text-center text-sm mb-2 leading-relaxed">
          Kamera nagrywa na żywo. Po powrocie od tarczy zobaczysz swój strzał z 15 sekund temu.
        </p>
        <div className="flex items-center gap-2 bg-[#fed33e]/10 rounded-xl px-4 py-2 mb-8">
          <span className="material-symbols-outlined text-[#fed33e] text-base">schedule</span>
          <span className="text-[#fed33e] text-xs font-bold">15s opóźnienie · przednia kamera</span>
        </div>
        {isPortrait && (
          <div className="flex items-center gap-2 bg-white/5 rounded-xl px-4 py-2 mb-4">
            <span className="material-symbols-outlined text-white/50 text-base">screen_rotation</span>
            <span className="text-white/50 text-xs">Obróć telefon poziomo dla lepszego widoku</span>
          </div>
        )}
        <button
          onClick={startRecording}
          className="w-full max-w-xs py-4 bg-[#fed33e] text-[#0a3a2a] rounded-2xl font-black text-base uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-[#fed33e]/20"
        >
          Uruchom
        </button>
      </div>
    );
  }

  // Jeśli browser myśli że jest w portrait ale urządzenie fizycznie obrócone
  // (system rotation lock), wymuszamy rotację całego UI w CSS żeby pasowało
  // do rzeczywistej orientacji telefonu.
  const deviceLandscape = deviceAngle === 90 || deviceAngle === 270;
  const forceRotate = isPortrait && deviceLandscape;
  const containerStyle: React.CSSProperties = forceRotate
    ? {
        position: 'fixed',
        top: '50%',
        left: '50%',
        width: '100vh',
        height: '100vw',
        transform: `translate(-50%, -50%) rotate(${deviceAngle === 90 ? -90 : 90}deg)`,
        transformOrigin: 'center center',
      }
    : { position: 'fixed', inset: 0 };

  return (
    <div className="bg-black z-50 overflow-hidden select-none" style={containerStyle}>

      <video
        ref={delayedVideoRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
        playsInline
        muted
      />

      {mirrorState === 'buffering' && (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-10">
          <div className="w-16 h-16 rounded-full border-4 border-white/10 border-t-[#fed33e] animate-spin mb-4" />
          <p className="text-white font-bold text-base mb-2">Buforowanie…</p>
          <p className="text-white/50 text-xs mb-4">Czekaj 15s zanim pojawi się opóźniony obraz</p>
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
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20"
             onClick={resumeMirror}>
          <div className="text-center px-8">
            <span className="material-symbols-outlined text-white/30 text-7xl mb-4 block">pause_circle</span>
            <p className="text-white font-black text-xl mb-1">Pauza</p>
            <p className="text-white/50 text-sm mb-8">Kamera wyłączona · bateria oszczędzana</p>
            <button
              onClick={(e) => { e.stopPropagation(); resumeMirror(); }}
              className="px-10 py-4 bg-[#fed33e] text-[#0a3a2a] rounded-2xl font-black text-base uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-[#fed33e]/20 block mx-auto mb-3"
            >
              Wróciłem
            </button>
            {hasFullBlob && (
              <button
                onClick={(e) => { e.stopPropagation(); shareVideo(); }}
                disabled={shareState === 'sharing'}
                className="px-10 py-3 bg-white/15 text-white rounded-2xl font-bold text-sm active:scale-95 transition-all flex items-center gap-2 mx-auto mb-3 border border-white/20 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-lg">
                  {shareState === 'saved' ? 'check_circle' : shareState === 'error' ? 'error' : 'share'}
                </span>
                {shareState === 'sharing' && 'Udostępnianie…'}
                {shareState === 'saved' && 'Zapisano na dysku'}
                {shareState === 'error' && 'Błąd — spróbuj ponownie'}
                {shareState === 'idle' && 'Udostępnij całą sesję'}
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); stopMirror(); }}
              className="px-10 py-3 bg-white/10 text-white/70 rounded-2xl font-bold text-sm active:scale-95 transition-all"
            >
              Zakończ sesję
            </button>
          </div>
        </div>
      )}

      {(mirrorState === 'buffering' || mirrorState === 'live') && (
        <div className="absolute top-4 right-4 z-30 rounded-xl overflow-hidden border-2 border-white/20 shadow-lg"
             style={{ width: '25vw', maxWidth: 120, aspectRatio: '16/9' }}>
          <video
            ref={liveVideoRef}
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
            playsInline
            muted
          />
          <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[8px] text-white text-center py-0.5 font-bold uppercase tracking-widest">
            LIVE
          </div>
        </div>
      )}

      {(mirrorState === 'buffering' || mirrorState === 'live') && (
        <div className="absolute top-4 left-4 z-30 flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-xl px-3 py-1.5">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-white text-xs font-bold">{formatTime(recSeconds)}</span>
          </div>
          {mirrorState === 'live' && (
            <div className="flex items-center gap-1.5 bg-[#fed33e]/20 backdrop-blur-sm rounded-xl px-3 py-1.5">
              <span className="material-symbols-outlined text-[#fed33e] text-sm">schedule</span>
              <span className="text-[#fed33e] text-xs font-bold">-15s</span>
            </div>
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
            Po strzały
          </button>
          <button
            onClick={pauseMirror}
            className="py-3.5 px-5 bg-white/10 backdrop-blur-sm text-white/60 rounded-2xl font-bold text-sm active:scale-95 transition-all border border-white/10"
            title="Pauza"
          >
            <span className="material-symbols-outlined text-xl">pause</span>
          </button>
        </div>
      )}
    </div>
  );
}
