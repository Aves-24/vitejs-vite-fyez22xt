import React, { useEffect, useRef, useState, useCallback } from 'react';
import { db, auth } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

const DELAY_S = 15;
const CHUNK_MS = 500;
const MAX_BUFFER_S = 90; // trim buffer beyond this

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
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c) && MediaSource.isTypeSupported(c)) return c;
  }
  return null;
}

export default function DelayMirrorView({ onBack }: Props) {
  const [isPremium, setIsPremium] = useState(false);
  const [premiumLoading, setPremiumLoading] = useState(true);
  const [mirrorState, setMirrorState] = useState<MirrorState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [recSeconds, setRecSeconds] = useState(0);
  const [bufferPct, setBufferPct] = useState(0); // 0-100 during buffering phase
  const [isPortrait, setIsPortrait] = useState(
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false
  );

  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const delayedVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const appendQueueRef = useRef<ArrayBuffer[]>([]);
  const isAppendingRef = useRef(false);
  const initChunkRef = useRef<ArrayBuffer | null>(null);
  const totalBufferedRef = useRef(0); // seconds appended so far
  const blobUrlRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const codecRef = useRef<string | null>(null);

  // Load isPremium from Firestore
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

  // Orientation listener
  useEffect(() => {
    const update = () => setIsPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  // Auto-pause when app goes to background
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && mirrorState === 'live') {
        pauseMirror();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [mirrorState]);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
    if (delayedVideoRef.current) delayedVideoRef.current.pause();
    try {
      if (mediaSourceRef.current?.readyState === 'open') {
        mediaSourceRef.current.endOfStream();
      }
    } catch { /* ignore */ }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    appendQueueRef.current = [];
    isAppendingRef.current = false;
    initChunkRef.current = null;
    totalBufferedRef.current = 0;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const processQueue = useCallback(() => {
    const sb = sourceBufferRef.current;
    if (!sb || isAppendingRef.current || appendQueueRef.current.length === 0) return;
    isAppendingRef.current = true;
    sb.appendBuffer(appendQueueRef.current.shift()!);
  }, []);

  const startRecording = useCallback(async () => {
    setMirrorState('requesting');
    setErrorMsg('');

    const codec = getCodec();
    if (!codec) {
      setMirrorState('unsupported');
      return;
    }
    codecRef.current = codec;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (err: any) {
      setErrorMsg(err.name === 'NotAllowedError' ? 'Brak zgody na kamerę.' : `Błąd kamery: ${err.message}`);
      setMirrorState('error');
      return;
    }

    streamRef.current = stream;
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = stream;
      liveVideoRef.current.play().catch(() => {});
    }

    // Setup MediaSource for delayed playback
    const ms = new MediaSource();
    mediaSourceRef.current = ms;
    const blobUrl = URL.createObjectURL(ms);
    blobUrlRef.current = blobUrl;
    if (delayedVideoRef.current) {
      delayedVideoRef.current.src = blobUrl;
    }

    ms.addEventListener('sourceopen', () => {
      const sb = ms.addSourceBuffer(codec);
      sourceBufferRef.current = sb;

      sb.addEventListener('updateend', () => {
        isAppendingRef.current = false;

        // Trim old buffer to prevent memory growth
        if (sb.buffered.length > 0) {
          const buffStart = sb.buffered.start(0);
          const buffEnd = sb.buffered.end(0);
          if (buffEnd - buffStart > MAX_BUFFER_S) {
            try { sb.remove(buffStart, buffEnd - MAX_BUFFER_S + 30); } catch { /* ignore */ }
            return;
          }
        }

        // Adjust delayed video playback position
        const vid = delayedVideoRef.current;
        if (vid && sb.buffered.length > 0) {
          const buffEnd = sb.buffered.end(0);
          const target = buffEnd - DELAY_S;
          if (target > 0) {
            if (vid.paused || Math.abs(vid.currentTime - target) > 1.5) {
              vid.currentTime = target;
              vid.play().catch(() => {});
            }
            if (mirrorState !== 'live' && totalBufferedRef.current >= DELAY_S) {
              setMirrorState('live');
            }
          }
        }

        processQueue();
      });

      // Start MediaRecorder
      const recorder = new MediaRecorder(stream, { mimeType: codec, videoBitsPerSecond: 1_500_000 });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size === 0) return;
        e.data.arrayBuffer().then((buf) => {
          totalBufferedRef.current += CHUNK_MS / 1000;
          const pct = Math.min(100, Math.round((totalBufferedRef.current / DELAY_S) * 100));
          setBufferPct(pct);

          if (!initChunkRef.current) {
            initChunkRef.current = buf;
          }
          appendQueueRef.current.push(buf);
          processQueue();
        });
      };

      recorder.start(CHUNK_MS);
      setMirrorState('buffering');
      setRecSeconds(0);
      timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
    });
  }, [mirrorState, processQueue]);

  const pauseMirror = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
    delayedVideoRef.current?.pause();
    // Close MediaSource so it can't be appended to
    try {
      if (mediaSourceRef.current?.readyState === 'open') {
        mediaSourceRef.current.endOfStream();
      }
    } catch { /* ignore */ }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    appendQueueRef.current = [];
    isAppendingRef.current = false;
    initChunkRef.current = null;
    totalBufferedRef.current = 0;
    sourceBufferRef.current = null;
    mediaSourceRef.current = null;
    setMirrorState('paused');
  }, []);

  const resumeMirror = useCallback(() => {
    setMirrorState('idle');
    setBufferPct(0);
    setRecSeconds(0);
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
            {['15s opóźnienie — idealny czas "po strzałach"', 'Kamera tylna, tryb pejzaż', 'Pauza "Po strzały" — oszcza baterię', 'Zero uploadu — wideo tylko w RAM'].map(f => (
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

  // ─── Unsupported browser ────────────────────────────────────────────────────
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

  // ─── Error ──────────────────────────────────────────────────────────────────
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

  // ─── Idle — start screen ────────────────────────────────────────────────────
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
          <span className="text-[#fed33e] text-xs font-bold">15s opóźnienie · kamera tylna</span>
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

  // ─── Main mirror UI (buffering + live + paused) ──────────────────────────────
  return (
    <div className="fixed inset-0 bg-black z-50 overflow-hidden select-none">

      {/* Delayed video — main view */}
      <video
        ref={delayedVideoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
      />

      {/* Buffering overlay */}
      {mirrorState === 'buffering' && (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-10">
          <div className="w-16 h-16 rounded-full border-4 border-white/10 border-t-[#fed33e] animate-spin mb-4" />
          <p className="text-white font-bold text-base mb-2">Buforowanie…</p>
          <p className="text-white/50 text-xs mb-4">Czekaj {DELAY_S}s zanim pojawi się opóźniony obraz</p>
          <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#fed33e] rounded-full transition-all duration-500"
              style={{ width: `${bufferPct}%` }}
            />
          </div>
          <p className="text-[#fed33e] text-xs mt-2 font-bold">{bufferPct}%</p>
        </div>
      )}

      {/* Paused overlay */}
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
            <button
              onClick={(e) => { e.stopPropagation(); stopMirror(); }}
              className="px-10 py-3 bg-white/10 text-white/70 rounded-2xl font-bold text-sm active:scale-95 transition-all"
            >
              Zakończ sesję
            </button>
          </div>
        </div>
      )}

      {/* Live preview PiP — top right */}
      {(mirrorState === 'buffering' || mirrorState === 'live') && (
        <div className="absolute top-4 right-4 z-30 rounded-xl overflow-hidden border-2 border-white/20 shadow-lg"
             style={{ width: '25vw', maxWidth: 120, aspectRatio: '16/9' }}>
          <video
            ref={liveVideoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />
          <div className="absolute bottom-0 inset-x-0 bg-black/50 text-[7px] text-white/70 text-center py-0.5 font-bold uppercase tracking-widest">
            Live
          </div>
        </div>
      )}

      {/* Top status bar */}
      {(mirrorState === 'buffering' || mirrorState === 'live') && (
        <div className="absolute top-4 left-4 z-30 flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-xl px-3 py-1.5">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-white text-xs font-bold">{formatTime(recSeconds)}</span>
          </div>
          {mirrorState === 'live' && (
            <div className="flex items-center gap-1.5 bg-[#fed33e]/20 backdrop-blur-sm rounded-xl px-3 py-1.5">
              <span className="material-symbols-outlined text-[#fed33e] text-sm">schedule</span>
              <span className="text-[#fed33e] text-xs font-bold">-{DELAY_S}s</span>
            </div>
          )}
        </div>
      )}

      {/* Bottom controls */}
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
            onClick={stopMirror}
            className="py-3.5 px-5 bg-white/10 backdrop-blur-sm text-white/60 rounded-2xl font-bold text-sm active:scale-95 transition-all border border-white/10"
          >
            <span className="material-symbols-outlined text-xl">stop</span>
          </button>
        </div>
      )}
    </div>
  );
}
