import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { StandardTarget } from '../targets/StandardTarget';
import { SpotTarget } from '../targets/SpotTarget';
import {
  createShooterProfiles, generateEnd, sortedValues, expectedAnswer, summarizeGame,
  isBetterResult, configKey, SCHREIBER_FACE_ID,
  type SchreiberConfig, type SchreiberEnd, type SchreiberAnswer, type SchreiberResult,
  type SchreiberLevel, type SchreiberMode, type SchreiberTarget,
} from '../../utils/schreiberGame';

/**
 * [SCHREIBER-TRAINING] Easter egg z Einstellungen (obok „Höchste
 * Wettkampfebene”). Gra edukacyjna: 1–4 symulowanych zawodników na jednej
 * tarczy, gracz liczy w głowie sumę serii każdego z nich. Logika i testy:
 * utils/schreiberGame.ts. Rekordy tylko w localStorage tego urządzenia.
 */

type Shape = 'circle' | 'square' | 'triangle' | 'diamond';
const SHOOTERS: { letter: string; color: string; shape: Shape }[] = [
  { letter: 'A', color: '#84cc16', shape: 'circle' },
  { letter: 'B', color: '#d946ef', shape: 'square' },
  { letter: 'C', color: '#f97316', shape: 'triangle' },
  { letter: 'D', color: '#22d3ee', shape: 'diamond' },
];

const CFG_KEY = 'grotx_schreiber_cfg_v1';
const BEST_KEY = 'grotx_schreiber_best_v1';
const DEFAULT_CFG: SchreiberConfig = { target: 'full', shooters: 2, arrows: 3, level: 'club', mode: 'end', ends: 10 };

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch { return fallback; }
};
const writeJson = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* prywatne okno */ }
};
const readBest = (cfg: SchreiberConfig): SchreiberResult | null => {
  const all = readJson<Record<string, SchreiberResult>>(BEST_KEY, {});
  return all[configKey(cfg)] ?? null;
};

const fmtSec = (ms: number) => (ms / 1000).toFixed(1);

/** Znaczek strzały: kształt + kolor zawodnika, czarna kropka = miejsce trafienia. */
const ArrowMark: React.FC<{ x: number; y: number; shooter: number; dim?: boolean; focus?: boolean }> = ({ x, y, shooter, dim, focus }) => {
  const { color, shape } = SHOOTERS[shooter];
  const s = 4.6;
  const draw = (props: React.SVGProps<SVGElement>) => {
    switch (shape) {
      case 'circle': return <circle cx={x} cy={y} r={s} {...(props as React.SVGProps<SVGCircleElement>)} />;
      case 'square': return <rect x={x - s * 0.85} y={y - s * 0.85} width={s * 1.7} height={s * 1.7} {...(props as React.SVGProps<SVGRectElement>)} />;
      case 'triangle': return <polygon points={`${x},${y - s * 1.15} ${x + s},${y + s * 0.75} ${x - s},${y + s * 0.75}`} {...(props as React.SVGProps<SVGPolygonElement>)} />;
      default: return <polygon points={`${x},${y - s * 1.2} ${x + s},${y} ${x},${y + s * 1.2} ${x - s},${y}`} {...(props as React.SVGProps<SVGPolygonElement>)} />;
    }
  };
  return (
    <g opacity={dim ? 0.18 : 1}>
      {focus && <circle cx={x} cy={y} r={s * 2} fill="none" stroke="#ffffff" strokeWidth={1.4} />}
      {draw({ fill: 'none', stroke: '#ffffff', strokeWidth: 3 })}
      {draw({ fill: color, stroke: '#111111', strokeWidth: 1 })}
      <circle cx={x} cy={y} r={1.1} fill="#111111" />
    </g>
  );
};

const ShooterChip: React.FC<{ shooter: number; label: string }> = ({ shooter, label }) => (
  <span className="inline-flex items-center gap-1.5">
    <svg viewBox="140 140 20 20" className="w-5 h-5" aria-hidden="true"><ArrowMark x={150} y={150} shooter={shooter} /></svg>
    <span>{label}</span>
  </span>
);

const Choice = <T extends string | number>({ value, options, onChange, render }: {
  value: T; options: readonly T[]; onChange: (v: T) => void; render: (v: T) => React.ReactNode;
}) => (
  <div className="flex gap-1.5">
    {options.map(o => (
      <button
        key={String(o)}
        onClick={() => onChange(o)}
        className={`flex-1 py-2.5 rounded-xl font-black text-[11px] border transition-all ${value === o ? 'bg-[#0a3a2a] border-[#0a3a2a] text-white shadow-md' : 'bg-white text-gray-500 border-gray-200'}`}
      >
        {render(o)}
      </button>
    ))}
  </div>
);

type Phase = 'setup' | 'play' | 'result';
interface Feedback { correct: boolean; expected: number; given: number }

const SchreiberGame: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useTranslation();
  const [cfg, setCfg] = useState<SchreiberConfig>(() => readJson(CFG_KEY, DEFAULT_CFG));
  const [phase, setPhase] = useState<Phase>('setup');
  const [ends, setEnds] = useState<SchreiberEnd[]>([]);
  const [endIdx, setEndIdx] = useState(0);
  const [shooterIdx, setShooterIdx] = useState(0);
  const [input, setInput] = useState('');
  const [answers, setAnswers] = useState<SchreiberAnswer[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [result, setResult] = useState<{ res: SchreiberResult; newBest: boolean } | null>(null);
  const [now, setNow] = useState(0);
  const promptStart = useRef(0);
  const elapsedBefore = useRef(0);

  const best = useMemo(() => readBest(cfg), [cfg, result]);
  const update = (patch: Partial<SchreiberConfig>) => setCfg(c => ({ ...c, ...patch }));

  const start = () => {
    writeJson(CFG_KEY, cfg);
    const rand = Math.random;
    const profiles = createShooterProfiles(cfg.shooters, cfg.level, rand);
    setEnds(Array.from({ length: cfg.ends }, () => generateEnd(profiles, cfg.arrows, rand, cfg.target)));
    setEndIdx(0); setShooterIdx(0); setInput(''); setAnswers([]); setFeedback(null); setResult(null);
    elapsedBefore.current = 0;
    promptStart.current = performance.now();
    setPhase('play');
  };

  // Zegar gry: liczy tylko czas liczenia, bez okienka z podpowiedzią.
  useEffect(() => {
    if (phase !== 'play' || feedback) return;
    const id = window.setInterval(() => setNow(performance.now()), 200);
    return () => window.clearInterval(id);
  }, [phase, feedback]);
  const runningMs = phase === 'play'
    ? elapsedBefore.current + (feedback ? 0 : Math.max(0, now - promptStart.current))
    : 0;

  const advance = useCallback((list: SchreiberAnswer[]) => {
    setFeedback(null);
    setInput('');
    const lastShooter = shooterIdx + 1 >= cfg.shooters;
    if (lastShooter && endIdx + 1 >= cfg.ends) {
      const res = summarizeGame(list);
      const newBest = isBetterResult(res, readBest(cfg));
      if (newBest) {
        const all = readJson<Record<string, SchreiberResult>>(BEST_KEY, {});
        writeJson(BEST_KEY, { ...all, [configKey(cfg)]: res });
      }
      setResult({ res, newBest });
      setPhase('result');
      return;
    }
    if (lastShooter) { setShooterIdx(0); setEndIdx(i => i + 1); } else setShooterIdx(i => i + 1);
    promptStart.current = performance.now();
    setNow(promptStart.current);
  }, [shooterIdx, endIdx, cfg]);

  const submit = useCallback(() => {
    if (phase !== 'play' || feedback || input === '') return;
    const ms = Math.round(performance.now() - promptStart.current);
    const expected = expectedAnswer(ends, endIdx, shooterIdx, cfg.mode);
    const given = Number(input);
    const correct = given === expected;
    const list = [...answers, { correct, ms }];
    elapsedBefore.current += ms;
    setAnswers(list);
    setFeedback({ correct, expected, given });
    // Dobra odpowiedź leci dalej sama, zła czeka na „Weiter” — żeby zobaczyć rozpiskę.
    if (correct) window.setTimeout(() => advance(list), 650);
  }, [phase, feedback, input, ends, endIdx, shooterIdx, cfg.mode, answers, advance]);

  const press = useCallback((key: string) => {
    if (feedback) return;
    if (key === 'del') setInput(v => v.slice(0, -1));
    else if (key === 'ok') submit();
    else setInput(v => (v.length >= 3 ? v : (v === '0' ? key : v + key)));
  }, [feedback, submit]);

  // Klawiatura fizyczna (komputer / tablet z klawiaturą).
  useEffect(() => {
    if (phase !== 'play') return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Enter') {
        if (feedback && !feedback.correct) advance(answers);
        else press('ok');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, press, feedback, advance, answers]);

  const end = ends[endIdx];
  const isSpot = cfg.target === 'spot3';
  const letter = SHOOTERS[shooterIdx]?.letter;
  const prevTotal = cfg.mode === 'running' && endIdx > 0 ? expectedAnswer(ends, endIdx - 1, shooterIdx, 'running') : 0;
  const myValues = end && feedback ? sortedValues(end.arrows.filter(a => a.shooter === shooterIdx)) : [];

  // Portal: Einstellungen mają animację z transform, przez co fixed liczyłby
  // się od karty, a nie od ekranu (i dolne menu przykrywało grę).
  return createPortal(
    <div className="fixed inset-0 z-[200000] bg-[#f4f6f5] overflow-y-auto">
      <div className="max-w-md mx-auto px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-black text-[#0a3a2a] leading-tight">{t('schreiber.title')}</h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('schreiber.subtitle')}</p>
          </div>
          <button onClick={onClose} aria-label={t('schreiber.close')} className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-500 active:scale-95">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {phase === 'setup' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
            <p className="text-[11px] font-bold text-gray-500 leading-snug">{t('schreiber.intro')}</p>

            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1 mb-1.5 block">{t('schreiber.target')}</label>
              <Choice<SchreiberTarget> value={cfg.target} options={['full', 'six', 'spot3']} onChange={v => update({ target: v })} render={v => t(`schreiber.targets.${v}`)} />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1 mb-1.5 block">{t('schreiber.shooters')}</label>
              <Choice value={cfg.shooters} options={[1, 2, 3, 4] as const} onChange={v => update({ shooters: v })}
                render={v => <span className="flex items-center justify-center gap-0.5">{SHOOTERS.slice(0, v).map(s => s.letter).join('')}</span>} />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1 mb-1.5 block">{t('schreiber.arrowsPerShooter')}</label>
              {cfg.target === 'spot3'
                ? <p className="text-[11px] font-bold text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">{t('schreiber.spotArrows')}</p>
                : <Choice value={cfg.arrows} options={[3, 6] as const} onChange={v => update({ arrows: v })} render={v => v} />}
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1 mb-1.5 block">{t('schreiber.level')}</label>
              <Choice<SchreiberLevel> value={cfg.level} options={['beginner', 'club', 'elite']} onChange={v => update({ level: v })} render={v => t(`schreiber.levels.${v}`)} />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1 mb-1.5 block">{t('schreiber.mode')}</label>
              <Choice<SchreiberMode> value={cfg.mode} options={['end', 'running']} onChange={v => update({ mode: v })} render={v => t(`schreiber.modes.${v}`)} />
              <p className="text-[10px] font-bold text-gray-400 mt-1.5 ml-1 leading-snug">{t(`schreiber.modeDesc.${cfg.mode}`)}</p>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1 mb-1.5 block">{t('schreiber.ends')}</label>
              <Choice value={cfg.ends} options={[5, 10] as const} onChange={v => update({ ends: v })} render={v => v} />
            </div>

            <div className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
              <span className="text-[10px] font-black text-gray-400 uppercase">{t('schreiber.best')}</span>
              <span className="text-[12px] font-black text-[#0a3a2a]">
                {best ? t('schreiber.bestValue', { correct: best.correct, total: best.total, avg: fmtSec(best.avgMs) }) : t('schreiber.bestNone')}
              </span>
            </div>

            <button onClick={start} className="w-full py-3.5 bg-[#0a3a2a] text-white rounded-xl font-black text-[12px] uppercase tracking-widest shadow-md active:scale-95 transition-all">
              {t('schreiber.start')}
            </button>
          </div>
        )}

        {phase === 'play' && end && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px] font-black text-gray-500 uppercase">
              <span>{t('schreiber.endOf', { n: endIdx + 1, total: cfg.ends })}</span>
              <span className="tabular-nums">⏱ {fmtSec(runningMs)} s</span>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2">
              <svg viewBox={isSpot ? '45 -12 210 424' : '-25 -25 350 350'} className={`h-auto block mx-auto ${isSpot ? 'w-1/2' : 'w-full'}`} role="img" aria-label={t('schreiber.targetLabel')}>
                {isSpot
                  ? <><rect x="45" y="-12" width="210" height="424" rx="14" fill="#d9cba6" /><SpotTarget isVertical /></>
                  : <><rect x="-25" y="-25" width="350" height="350" rx="18" fill="#d9cba6" /><StandardTarget targetType={SCHREIBER_FACE_ID[cfg.target]} /></>}
                {end.arrows.map((a, i) => (
                  <ArrowMark key={i} x={a.x} y={a.y} shooter={a.shooter}
                    dim={!!feedback && a.shooter !== shooterIdx}
                    focus={!!feedback && a.shooter === shooterIdx} />
                ))}
              </svg>
              {cfg.shooters > 1 && (
                <div className="flex justify-center gap-3 pt-1 pb-0.5 text-[10px] font-black text-gray-500">
                  {SHOOTERS.slice(0, cfg.shooters).map((s, i) => <ShooterChip key={s.letter} shooter={i} label={s.letter} />)}
                </div>
              )}
            </div>

            <div className={`rounded-2xl border p-3 transition-colors ${feedback ? (feedback.correct ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200') : 'bg-white border-gray-100 shadow-sm'}`}>
              <div className="flex items-center justify-between">
                <div className="text-[12px] font-black text-[#0a3a2a]">
                  <ShooterChip shooter={shooterIdx} label={t(cfg.mode === 'end' ? 'schreiber.promptEnd' : 'schreiber.promptRunning', { letter })} />
                  {cfg.mode === 'running' && (
                    <div className="text-[10px] font-bold text-gray-400 mt-0.5 ml-6">{t('schreiber.soFar', { total: prevTotal })}</div>
                  )}
                </div>
                <div className={`min-w-[4.5rem] text-right text-3xl font-black tabular-nums ${feedback ? (feedback.correct ? 'text-emerald-600' : 'text-red-600 line-through') : 'text-[#0a3a2a]'}`}>
                  {input || <span className="text-gray-200">0</span>}
                </div>
              </div>
              {feedback && (
                <div className="mt-2 pt-2 border-t border-black/5">
                  <div className={`text-[12px] font-black ${feedback.correct ? 'text-emerald-700' : 'text-red-700'}`}>
                    {feedback.correct ? t('schreiber.correct') : t('schreiber.wrong', { expected: feedback.expected })}
                  </div>
                  <div className="text-[11px] font-bold text-gray-600 mt-0.5 tabular-nums">
                    {myValues.join(' + ')} = {end.sums[shooterIdx]}
                    {cfg.mode === 'running' && <> · {prevTotal} + {end.sums[shooterIdx]} = {feedback.expected}</>}
                  </div>
                  {!feedback.correct && (
                    <button onClick={() => advance(answers)} className="w-full mt-2 py-3 bg-[#0a3a2a] text-white rounded-xl font-black text-[11px] uppercase tracking-widest active:scale-95">
                      {t('schreiber.next')}
                    </button>
                  )}
                </div>
              )}
            </div>

            {!feedback && (
              <div className="grid grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].map(k => (
                  <button key={k} onClick={() => press(k)}
                    aria-label={k === 'del' ? t('schreiber.delete') : k === 'ok' ? t('schreiber.confirm') : k}
                    className={`h-14 rounded-xl font-black text-xl active:scale-95 transition-all flex items-center justify-center ${k === 'ok' ? 'bg-[#0a3a2a] text-white shadow-md' : k === 'del' ? 'bg-gray-100 text-gray-500' : 'bg-white border border-gray-200 text-[#0a3a2a]'}`}>
                    {k === 'del' ? <span className="material-symbols-outlined">backspace</span> : k === 'ok' ? <span className="material-symbols-outlined">check</span> : k}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {phase === 'result' && result && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3 text-center">
            {result.newBest && (
              <div className="inline-block px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-widest">🏆 {t('schreiber.newBest')}</div>
            )}
            <div className="text-4xl font-black text-[#0a3a2a] tabular-nums">{result.res.correct}/{result.res.total}</div>
            <div className="text-[11px] font-bold text-gray-500">{t('schreiber.resultCorrect')}</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-50 rounded-xl p-2.5">
                <div className="text-[9px] font-black text-gray-400 uppercase">{t('schreiber.avgTime')}</div>
                <div className="text-lg font-black text-[#0a3a2a] tabular-nums">{fmtSec(result.res.avgMs)} s</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-2.5">
                <div className="text-[9px] font-black text-gray-400 uppercase">{t('schreiber.totalTime')}</div>
                <div className="text-lg font-black text-[#0a3a2a] tabular-nums">{fmtSec(result.res.totalMs)} s</div>
              </div>
            </div>
            {best && !result.newBest && (
              <div className="text-[10px] font-bold text-gray-400">
                {t('schreiber.best')}: {t('schreiber.bestValue', { correct: best.correct, total: best.total, avg: fmtSec(best.avgMs) })}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setPhase('setup')} className="flex-1 py-3 bg-white border border-gray-200 text-gray-500 rounded-xl font-black text-[11px] uppercase active:scale-95">{t('schreiber.change')}</button>
              <button onClick={start} className="flex-[1.4] py-3 bg-[#0a3a2a] text-white rounded-xl font-black text-[11px] uppercase tracking-widest shadow-md active:scale-95">{t('schreiber.again')}</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default SchreiberGame;
