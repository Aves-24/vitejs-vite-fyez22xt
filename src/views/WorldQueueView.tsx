// src/views/WorldQueueView.tsx
// Ekran oczekiwania na rywala w trybie WORLD

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  joinWorldQueue,
  leaveWorldQueue,
  tryMatchOpponent,
  expandSearchRadius,
  formatWorldDisplayName,
  MATCH_TIMEOUT_MS,
  EXPAND_TO_2_MS,
  EXPAND_TO_3_MS,
} from '../utils/worldMatchmakingService';
import { TARGET_RANKS } from '../utils/rankEngine';

interface Props {
  userId:      string;
  firstName:   string;
  lastName:    string;
  clubName:    string;
  country:     string;
  userLevel:   number;
  distance:    string;
  targetType:  string;
  onMatchFound: (battleId: string) => void;
  onCancel:     () => void;
}

// Czas (ms) → "MM:SS"
const formatTime = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function WorldQueueView({
  userId, firstName, lastName, clubName, country,
  userLevel, distance, targetType,
  onMatchFound, onCancel,
}: Props) {
  const { t } = useTranslation();

  const [elapsed, setElapsed]           = useState(0);
  const [searchRadius, setSearchRadius] = useState<1 | 2 | 3>(1);
  const [statusMsg, setStatusMsg]       = useState('searching');
  const [dots, setDots]                 = useState('');

  const startTimeRef    = useRef(Date.now());
  const matchedRef      = useRef(false);
  const expansionDone2  = useRef(false);
  const expansionDone3  = useRef(false);
  const unsubQueueRef   = useRef<(() => void) | null>(null);

  const rank = TARGET_RANKS.find(r => r.level === userLevel) ?? TARGET_RANKS[0];

  // ── Animacja kropek ────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 500);
    return () => clearInterval(id);
  }, []);

  // ── Główna logika kolejki ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const myDisplayName = formatWorldDisplayName(firstName, lastName);

    const start = async () => {
      // 1. Dołącz do kolejki
      await joinWorldQueue(userId, firstName, lastName, clubName, country, userLevel);
      if (cancelled) { await leaveWorldQueue(userId); return; }

      // 2. Natychmiastowa pierwsza próba — czy ktoś już czeka?
      const immediateMatch = await tryMatchOpponent(userId, myDisplayName, clubName, country, userLevel, 1, distance, targetType);
      if (immediateMatch && !cancelled) {
        matchedRef.current = true;
        onMatchFound(immediateMatch);
        return;
      }

      // 3. Nasłuchuj własnego dokumentu w kolejce
      const queueRef = doc(db, 'world_queue', userId);
      unsubQueueRef.current = onSnapshot(queueRef, (snap) => {
        if (!snap.exists() || cancelled) return;
        const data = snap.data();
        if (data.status === 'matched' && data.battleId && !matchedRef.current) {
          matchedRef.current = true;
          onMatchFound(data.battleId);
        }
      });
    };

    start();

    return () => {
      cancelled = true;
      unsubQueueRef.current?.();
      if (!matchedRef.current) leaveWorldQueue(userId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Zegar + rozszerzanie zakresu + timeout ─────────────────────────────────
  useEffect(() => {
    const tick = setInterval(async () => {
      if (matchedRef.current) { clearInterval(tick); return; }

      const now     = Date.now();
      const elapsed = now - startTimeRef.current;
      setElapsed(elapsed);

      // Timeout 5 min
      if (elapsed >= MATCH_TIMEOUT_MS) {
        clearInterval(tick);
        await leaveWorldQueue(userId);
        setStatusMsg('timeout');
        return;
      }

      const myDisplayName = formatWorldDisplayName(firstName, lastName);

      // Rozszerzenie do ±2 po 90 s
      if (elapsed >= EXPAND_TO_2_MS && !expansionDone2.current) {
        expansionDone2.current = true;
        setSearchRadius(2);
        setStatusMsg('expanding');
        await expandSearchRadius(userId, 2);
        const m = await tryMatchOpponent(userId, myDisplayName, clubName, country, userLevel, 2, distance, targetType);
        if (m && !matchedRef.current) { matchedRef.current = true; onMatchFound(m); return; }
      }

      // Rozszerzenie do ±3 po 180 s
      if (elapsed >= EXPAND_TO_3_MS && !expansionDone3.current) {
        expansionDone3.current = true;
        setSearchRadius(3);
        setStatusMsg('expandingMore');
        await expandSearchRadius(userId, 3);
        const m = await tryMatchOpponent(userId, myDisplayName, clubName, country, userLevel, 3, distance, targetType);
        if (m && !matchedRef.current) { matchedRef.current = true; onMatchFound(m); return; }
      }

      // Co 30 s aktywna próba dopasowania (dla gracza 1 czekającego)
      if (elapsed % 30000 < 1000) {
        const m = await tryMatchOpponent(userId, myDisplayName, clubName, country, userLevel, searchRadius, distance, targetType);
        if (m && !matchedRef.current) { matchedRef.current = true; onMatchFound(m); return; }
      }
    }, 1000);

    return () => clearInterval(tick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchRadius]);

  const isExpired  = elapsed >= MATCH_TIMEOUT_MS;
  const remaining  = MATCH_TIMEOUT_MS - elapsed;
  const timerColor = remaining < 60_000 ? 'text-red-400' : remaining < 120_000 ? 'text-yellow-400' : 'text-emerald-400';

  // Zakres rang widocznych w wyszukiwaniu
  const minLevel = Math.max(1,  userLevel - searchRadius);
  const maxLevel = Math.min(10, userLevel + searchRadius);
  const rangeLabel = TARGET_RANKS
    .filter(r => r.level >= minLevel && r.level <= maxLevel)
    .map(r => r.name)
    .join(', ');

  const handleCancel = async () => {
    matchedRef.current = true; // blokuj dalsze dopasowania
    unsubQueueRef.current?.();
    await leaveWorldQueue(userId);
    onCancel();
  };

  const scanPct = Math.min(100, Math.round((elapsed / MATCH_TIMEOUT_MS) * 100));

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden font-mono"
         style={{ background: 'radial-gradient(ellipse at 50% 40%, #051a0e 0%, #030e07 60%, #010905 100%)' }}>

      {/* Scanlines overlay */}
      <div className="absolute inset-0 pointer-events-none z-0"
           style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,200,255,0.025) 2px, rgba(0,200,255,0.025) 4px)' }} />

      {/* Poziome linie dekoracyjne — top */}
      <div className="absolute top-0 left-0 right-0 h-px bg-emerald-500/30" />
      <div className="absolute top-1 left-0 right-0 h-px bg-emerald-500/10" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-emerald-500/30" />

      {/* Narożniki ramki HUD */}
      {[['top-3 left-3', 'border-t-2 border-l-2'],
        ['top-3 right-3', 'border-t-2 border-r-2'],
        ['bottom-3 left-3', 'border-b-2 border-l-2'],
        ['bottom-3 right-3', 'border-b-2 border-r-2'],
      ].map(([pos, border], i) => (
        <div key={i} className={`absolute ${pos} w-6 h-6 border-emerald-400/60 ${border}`} />
      ))}

      {/* Header */}
      <div className="relative z-10 text-center mb-6">
        <p className="text-[10px] text-emerald-400/60 tracking-[0.4em] uppercase mb-1">
          {t('worldQueue.network')}
        </p>
        <h1 className="text-2xl font-black tracking-[0.2em] uppercase"
            style={{ color: '#34d399', textShadow: '0 0 20px rgba(52,211,153,0.6), 0 0 40px rgba(52,211,153,0.3)' }}>
          {t('worldQueue.title')}
        </h1>
        <p className="text-[10px] text-emerald-400/40 tracking-[0.3em] uppercase mt-0.5">
          {t('worldQueue.protocol')}
        </p>
      </div>

      {/* Radar */}
      <div className="relative z-10 w-44 h-44 mb-6">
        {/* Pierścienie */}
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="absolute rounded-full border border-emerald-500/20"
               style={{ inset: `${i * 12}%` }} />
        ))}
        {/* Krzyżyk */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-full h-px bg-emerald-500/15" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-px h-full bg-emerald-500/15" />
        </div>
        {/* Obracający się sweep */}
        <div className="absolute inset-0 rounded-full overflow-hidden animate-spin"
             style={{ animationDuration: '3s' }}>
          <div className="absolute inset-0" style={{
            background: 'conic-gradient(from 270deg, rgba(52,211,153,0) 0deg, rgba(52,211,153,0.35) 60deg, rgba(52,211,153,0) 90deg)',
          }} />
        </div>
        {/* Zewnętrzny pierścień aktywny */}
        <div className="absolute inset-0 rounded-full border-2 border-emerald-400/40 animate-pulse" />
        {/* Odznaka rangi w centrum */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 flex items-center justify-center border-2"
               style={{
                 background: rank.color,
                 borderColor: rank.border,
                 boxShadow: `0 0 16px ${rank.border}88`,
                 clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
               }}>
            <span className="text-xl font-black" style={{ color: rank.textColor }}>{userLevel}</span>
          </div>
        </div>
        {/* Blips — losowe punkty na radarze */}
        {[[30, 25], [70, 60], [55, 80], [20, 65]].map(([x, y], i) => (
          <div key={i} className="absolute w-1.5 h-1.5 rounded-full bg-emerald-300"
               style={{ left: `${x}%`, top: `${y}%`, opacity: 0.4 + (i % 3) * 0.2,
                        boxShadow: '0 0 4px rgba(52,211,153,0.8)',
                        animation: `pulse ${1.5 + i * 0.4}s ease-in-out infinite` }} />
        ))}
      </div>

      {/* Ranga */}
      <p className="relative z-10 text-[10px] tracking-[0.3em] uppercase mb-0.5"
         style={{ color: 'rgba(52,211,153,0.5)' }}>
        {t('worldQueue.combatRating')}
      </p>
      <p className="relative z-10 text-lg font-black tracking-[0.15em] uppercase mb-5"
         style={{ color: rank.color, textShadow: `0 0 12px ${rank.border}` }}>
        {rank.name}
      </p>

      {/* Status */}
      <div className="relative z-10 mb-4 text-center min-h-[24px]">
        {!isExpired ? (
          <p className="text-sm font-bold tracking-widest uppercase"
             style={{ color: '#34d399', textShadow: '0 0 8px rgba(52,211,153,0.5)' }}>
            {t(`worldQueue.${statusMsg}`)}<span className="animate-pulse">{dots}</span>
          </p>
        ) : (
          <p className="text-sm font-bold tracking-widest uppercase text-red-400"
             style={{ textShadow: '0 0 8px rgba(255,50,50,0.5)' }}>
            {t('worldQueue.noMatchFound')}
          </p>
        )}
      </div>

      {/* Zakres wyszukiwania */}
      <div className="relative z-10 w-full max-w-xs mb-4 border border-emerald-500/20 bg-emerald-950/30"
           style={{ clipPath: 'polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)' }}>
        <div className="px-5 py-2.5 text-center">
          <p className="text-[9px] tracking-[0.4em] uppercase mb-1" style={{ color: 'rgba(52,211,153,0.4)' }}>
            {t('worldQueue.scanRadius', { n: searchRadius })}
          </p>
          <p className="text-xs font-bold tracking-wider" style={{ color: 'rgba(52,211,153,0.8)' }}>
            {rangeLabel}
          </p>
        </div>
        {/* Progress bar zakresu */}
        <div className="h-px w-full bg-emerald-900/50">
          <div className="h-full bg-emerald-400/60 transition-all duration-1000"
               style={{ width: `${(searchRadius / 3) * 100}%`, boxShadow: '0 0 6px rgba(52,211,153,0.8)' }} />
        </div>
      </div>

      {/* Timer + pasek postępu */}
      {!isExpired && (
        <div className="relative z-10 flex flex-col items-center mb-5 w-full max-w-xs">
          <p className="text-[9px] tracking-[0.4em] uppercase mb-1" style={{ color: 'rgba(52,211,153,0.35)' }}>
            {t('worldQueue.timeRemaining')}
          </p>
          <p className="text-5xl font-black tabular-nums mb-3"
             style={{
               color: remaining < 60_000 ? '#ff4444' : remaining < 120_000 ? '#ffd600' : '#34d399',
               textShadow: remaining < 60_000 ? '0 0 20px rgba(255,50,50,0.6)' : '0 0 20px rgba(52,211,153,0.5)',
             }}>
            {formatTime(remaining)}
          </p>
          {/* Pasek timeout */}
          <div className="w-full h-1 bg-emerald-950/60 border border-emerald-900/40">
            <div className="h-full transition-all duration-1000"
                 style={{
                   width: `${100 - scanPct}%`,
                   background: remaining < 60_000 ? '#ff4444' : remaining < 120_000 ? '#ffd600' : '#34d399',
                   boxShadow: '0 0 6px currentColor',
                 }} />
          </div>
        </div>
      )}

      {/* Dystans / tarcza */}
      <div className="relative z-10 flex gap-3 mb-6">
        {[distance, targetType].map((tag, i) => (
          <span key={i} className="text-[10px] font-bold tracking-widest uppercase px-3 py-1 border border-emerald-500/30"
                style={{ color: 'rgba(52,211,153,0.6)', background: 'rgba(52,211,153,0.05)',
                         clipPath: 'polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)' }}>
            {tag}
          </span>
        ))}
      </div>

      {/* Przycisk */}
      <button
        onClick={isExpired ? onCancel : handleCancel}
        className="relative z-10 px-10 py-3 font-black text-xs tracking-[0.3em] uppercase transition-all active:scale-95 border"
        style={{
          background: isExpired ? 'rgba(255,50,50,0.1)' : 'rgba(52,211,153,0.05)',
          borderColor: isExpired ? 'rgba(255,80,80,0.5)' : 'rgba(52,211,153,0.4)',
          color: isExpired ? '#ff6b6b' : 'rgba(52,211,153,0.8)',
          clipPath: 'polygon(10px 0%, 100% 0%, calc(100% - 10px) 100%, 0% 100%)',
          boxShadow: isExpired ? '0 0 12px rgba(255,50,50,0.2)' : '0 0 12px rgba(52,211,153,0.15)',
        }}
      >
        {isExpired ? t('worldQueue.abort') : t('worldQueue.abortSearch')}
      </button>
    </div>
  );
}
