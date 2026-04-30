import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  blob: Blob | null;
  displayAsLandscape: boolean;
  onResume: () => void;
  onEndSession: () => void;
}

export default function DelayMirrorReplay({ blob, displayAsLandscape, onResume, onEndSession }: Props) {
  const { t } = useTranslation();
  const replayVideoRef = useRef<HTMLVideoElement>(null);
  const replayBoxRef = useRef<HTMLDivElement>(null);
  const replayBlobUrlRef = useRef<string | null>(null);
  const [replayRate, setReplayRate] = useState<number>(1);
  const [replayTime, setReplayTime] = useState(0);
  const [replayDuration, setReplayDuration] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  // Wrapper na video w replay landscape — mierzymy aby dac pixele do video
  // (vw/vh nie dziala w manual landscape bo outer container jest rotowany).
  const [replayBox, setReplayBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [shareState, setShareState] = useState<'idle' | 'sharing' | 'saved' | 'error'>('idle');

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

  const shareVideo = async () => {
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
  };

  const fmtT = (s: number) => {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const hasFullBlob = blob !== null;
  const needsRotate = displayAsLandscape;

  return (
    <div className={`absolute inset-0 bg-black/95 z-20 overflow-y-auto py-4 px-4 ${
      displayAsLandscape && hasFullBlob
        ? 'flex flex-row items-stretch gap-4'
        : 'flex flex-col items-center'
    }`}>
      {/* Lewa kolumna w landscape = filmik. W portrait = wszystko na górze. */}
      {hasFullBlob ? (
        <div className={`${displayAsLandscape ? 'flex-1 flex flex-col items-center justify-center min-w-0 gap-2' : 'w-full max-w-md'}`}>
          <div
            ref={replayBoxRef}
            className={`${displayAsLandscape ? 'relative' : 'w-full mb-3 rounded-2xl overflow-hidden border border-white/15'} bg-black flex items-center justify-center`}
            style={
              displayAsLandscape
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
          <div className={`${displayAsLandscape ? 'w-full flex items-center gap-2 px-2' : 'w-full flex items-center gap-2 px-2 mt-2 mb-3'}`}>
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
                const nt = parseFloat(e.target.value);
                v.currentTime = nt;
                setReplayTime(nt);
              }}
              className="flex-1 accent-[#fed33e]"
            />
            <span className="text-white/70 text-[10px] font-bold tabular-nums flex-shrink-0">{fmtT(replayDuration)}</span>
          </div>
        </div>
      ) : (
        !displayAsLandscape && (
          <span className="material-symbols-outlined text-white/30 text-6xl mb-4 mt-4 block">pause_circle</span>
        )
      )}

      {/* Prawa kolumna w landscape = menu/kontrolki. W portrait = poniżej filmiku. */}
      <div className={`${
        displayAsLandscape && hasFullBlob
          ? 'w-[30%] max-w-xs flex flex-col items-stretch gap-2 overflow-y-auto max-h-full py-2'
          : 'w-full max-w-md flex flex-col items-center gap-2 mt-2'
      }`}>
        <p className={`text-white font-black ${displayAsLandscape && hasFullBlob ? 'text-base text-center mb-0' : 'text-lg mt-1'}`}>
          {t('delayMirror.pauseTitle')}
        </p>
        <p className={`text-white/50 text-xs text-center ${displayAsLandscape && hasFullBlob ? 'mb-1' : 'mb-2'}`}>
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
          onClick={onResume}
          className={`${displayAsLandscape && hasFullBlob ? 'w-full' : 'w-full max-w-xs'} py-3.5 bg-[#fed33e] text-[#0a3a2a] rounded-2xl font-black text-sm uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-[#fed33e]/20`}
        >
          {t('delayMirror.resumeBtn')}
        </button>
        {hasFullBlob && (
          <button
            onClick={shareVideo}
            disabled={shareState === 'sharing'}
            className={`${displayAsLandscape ? 'w-full' : 'w-full max-w-xs'} py-3 bg-white/15 text-white rounded-2xl font-bold text-sm active:scale-95 transition-all flex items-center justify-center gap-2 border border-white/20 disabled:opacity-50`}
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
          onClick={onEndSession}
          className={`${displayAsLandscape && hasFullBlob ? 'w-full' : 'w-full max-w-xs'} py-3 bg-white/10 text-white/70 rounded-2xl font-bold text-sm active:scale-95 transition-all`}
        >
          {t('delayMirror.endSession')}
        </button>
      </div>
    </div>
  );
}
