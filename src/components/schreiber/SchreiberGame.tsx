import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { StandardTarget } from '../targets/StandardTarget';
import { SpotTarget } from '../targets/SpotTarget';
import {
  createShooterProfiles, generateEnd, summarizeGame, isBetterResult, configKey,
  expectedRow, sameArrowSet, sumCellsFor, arrowsFor, standings, SCHREIBER_FACE_ID,
  type SchreiberConfig, type SchreiberEnd, type SchreiberAnswer, type SchreiberResult,
  type SchreiberLevel, type SchreiberTarget, type SumCell,
} from '../../utils/schreiberGame';

/**
 * [SCHREIBER-TRAINING] Easter egg z Einstellungen (obok „Höchste
 * Wettkampfebene”). Gra edukacyjna: 1–4 symulowanych zawodników na jednej
 * tarczy. Dla każdego zawodnika w każdej serii, jak na zawodach:
 *   1. odczyt strzał z tarczy — klawiatura jak przy wpisywaniu treningu,
 *      program NIE sumuje;
 *   2. sumy na Schützenzettel (suma 1–3, suma 4–6, Summe, Übertrag).
 * Logika i testy: utils/schreiberGame.ts. Rekordy tylko w localStorage.
 */

type Shape = 'circle' | 'square' | 'triangle' | 'diamond';
const SHOOTERS: { letter: string; color: string; shape: Shape }[] = [
  { letter: 'A', color: '#84cc16', shape: 'circle' },
  { letter: 'B', color: '#d946ef', shape: 'square' },
  { letter: 'C', color: '#f97316', shape: 'triangle' },
  { letter: 'D', color: '#22d3ee', shape: 'diamond' },
];

// Kolory klawiszy 1:1 z ScoringView (getArrowStyles) — ta sama klawiatura co w treningu.
const getArrowStyles = (val: string) => {
  if (['X', '10', '9'].includes(val)) return 'bg-[#F2C94C] text-[#333] border-none shadow-sm';
  if (['8', '7'].includes(val)) return 'bg-[#EB5757] text-white border-none shadow-sm';
  if (['6', '5'].includes(val)) return 'bg-[#2F80ED] text-white border-none shadow-sm';
  if (['4', '3'].includes(val)) return 'bg-[#333333] text-white border-none shadow-sm';
  if (['2', '1'].includes(val)) return 'bg-white border border-gray-200 text-[#333] shadow-sm';
  if (val === 'M') return 'bg-indigo-900 text-white border-none shadow-sm';
  return 'bg-[#F9F9F9] border border-gray-100 text-transparent';
};

const CFG_KEY = 'grotx_schreiber_cfg_v2';
const BEST_KEY = 'grotx_schreiber_best_v2';
const DEFAULT_CFG: SchreiberConfig = { target: 'full', shooters: 2, arrows: 6, level: 'club', ends: 3 };
const LEVELS: SchreiberLevel[] = ['beginner', 'club', 'mixed'];
const TARGETS: SchreiberTarget[] = ['full', 'six', 'spot3'];
const END_OPTIONS = [3, 6] as const;

/** Lupa: powiększenie tarczy po stuknięciu. */
const ZOOM = 2.5;
/** Przesunięcie palca poniżej tylu px to stuknięcie, a nie przeciąganie. */
const TAP_SLOP = 6;
/** Symulacja durchgangu: tyle trwa strzelanie jednej grupy (AB albo CD). */
const VOLLEY_MS = 1000;

/** Grupy jak na zawodach: AB strzelają razem, potem CD. */
const shooterGroups = (count: number): number[][] =>
  count <= 2 ? [[0, 1].slice(0, count)] : [[0, 1], [2, 3].slice(0, count - 2)];

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch { return fallback; }
};
const writeJson = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* prywatne okno */ }
};
const readCfg = (): SchreiberConfig => {
  const c = readJson(CFG_KEY, DEFAULT_CFG);
  return {
    ...c,
    level: LEVELS.includes(c.level) ? c.level : DEFAULT_CFG.level,
    target: TARGETS.includes(c.target) ? c.target : DEFAULT_CFG.target,
    ends: (END_OPTIONS as readonly number[]).includes(c.ends) ? c.ends : DEFAULT_CFG.ends,
  };
};
const readBest = (cfg: SchreiberConfig): SchreiberResult | null => {
  const all = readJson<Record<string, SchreiberResult>>(BEST_KEY, {});
  return all[configKey(cfg)] ?? null;
};

// Przecinek po niemiecku/polsku (0,7 s), kropka po angielsku.
const fmtSec = (ms: number) => (ms / 1000).toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Znaczek strzały: kształt + kolor zawodnika, czarna kropka = miejsce trafienia. */
const ArrowMark: React.FC<{ x: number; y: number; shooter: number; dim?: boolean; focus?: boolean; label?: string }> = ({ x, y, shooter, dim, focus, label }) => {
  const { color, shape } = SHOOTERS[shooter];
  const s = 6.5;
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
      {focus && <circle cx={x} cy={y} r={s * 1.9} fill="none" stroke="#ffffff" strokeWidth={1.6} />}
      {draw({ fill: 'none', stroke: '#ffffff', strokeWidth: 3 })}
      {draw({ fill: color, stroke: '#111111', strokeWidth: 1 })}
      <circle cx={x} cy={y} r={1.3} fill="#111111" />
      {label && (
        <g>
          <rect x={x + 7} y={y - 17} width={label.length > 1 ? 17 : 12} height={12} rx={3} fill="#111111" />
          <text x={x + 7 + (label.length > 1 ? 8.5 : 6)} y={y - 8} textAnchor="middle" fontSize="9" fontWeight="900" fill="#ffffff">{label}</text>
        </g>
      )}
    </g>
  );
};

const ShooterIcon: React.FC<{ shooter: number; className?: string }> = ({ shooter, className = 'w-9 h-9' }) => (
  <svg viewBox="140 140 20 20" className={className} aria-hidden="true"><ArrowMark x={150} y={150} shooter={shooter} /></svg>
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

/** Stan jednego wiersza Schützenzettel (zawodnik × seria). */
interface RowState {
  /** Prawidłowe wartości (od najwyższej) — po odczycie wpisane do arkusza. */
  values: string[];
  /** Co gracz odczytał, gdy się pomylił (pokazujemy przekreślone). */
  misread?: string[];
  cells: Partial<Record<SumCell, { given: number; ok: boolean }>>;
}

type Phase = 'setup' | 'play' | 'result';
type Step = 'arrows' | 'sums';

const PEN = 'text-[#1e3a8a]';

/** Schützenzettel jednego zawodnika — układ jak na papierowej karcie DSB. */
const ScoreSheet: React.FC<{
  rows: (RowState | undefined)[];
  ends: number;
  arrows: number;
  expected: (end: number) => Record<SumCell, number>;
  activeEnd: number;
  activeCell: SumCell | null;
  input: string;
}> = ({ rows, ends, arrows, expected, activeEnd, activeCell, input }) => {
  const { t } = useTranslation();
  const six = arrows === 6;
  const activeRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => { activeRef.current?.scrollIntoView({ block: 'nearest' }); }, [activeEnd]);

  const sumCell = (end: number, cell: SumCell, extra = '', rowSpan?: number) => {
    const row = rows[end];
    const entry = row?.cells[cell];
    const isActive = end === activeEnd && activeCell === cell;
    return (
      <td rowSpan={rowSpan} className={`border-black text-center tabular-nums ${extra} ${isActive ? 'bg-amber-100' : ''}`}>
        {isActive ? (
          <span className={`font-black ${PEN}`}>{input}<span className="animate-pulse">|</span></span>
        ) : entry ? (
          entry.ok
            ? <span className={`font-black ${PEN}`}>{entry.given}</span>
            : <span className="leading-none inline-flex flex-col items-center">
                <span className="text-red-500 line-through text-[10px] font-bold">{entry.given}</span>
                <span className="text-emerald-700 font-black">{expected(end)[cell]}</span>
              </span>
        ) : null}
      </td>
    );
  };

  const arrowCells = (end: number, from: number, extra: string) => {
    const row = rows[end];
    return Array.from({ length: 3 }, (_, i) => {
      const v = row?.values[from + i];
      return (
        <td key={i} className={`border-black text-center font-black ${extra} ${row?.misread ? 'text-red-600' : PEN}`}>{v ?? ''}</td>
      );
    });
  };

  const cellBase = 'border-[1.5px]';
  return (
    <table className="w-full border-collapse bg-white text-[13px] select-none">
      <thead>
        <tr className="text-[10px] font-bold text-gray-800">
          <th className={`${cellBase} border-black w-7`} rowSpan={2}></th>
          <th className={`${cellBase} border-black py-0.5`} colSpan={3}>{t('schreiber.sheet.arrows')}</th>
          <th className={`${cellBase} border-black`} colSpan={six ? 2 : 1} rowSpan={2}>{t('schreiber.sheet.sum')}</th>
          <th className={`${cellBase} border-black border-[2.5px] text-[9px]`} rowSpan={2}>{t('schreiber.sheet.carry')}</th>
        </tr>
        <tr className="text-[9px] font-bold text-red-700">
          <th className={`${cellBase} border-black`}>1</th>
          <th className={`${cellBase} border-black`}>2</th>
          <th className={`${cellBase} border-black`}>3</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: ends }, (_, end) => {
          const label = (n: number) => <td className={`${cellBase} border-black text-[9px] font-bold text-gray-700 text-right pr-1 align-top`}>{n}</td>;
          const isActive = end === activeEnd;
          if (!six) {
            return (
              <tr key={end} ref={isActive ? activeRef : undefined} className={`h-9 ${isActive ? 'outline outline-2 outline-amber-400 -outline-offset-2' : ''}`}>
                {label((end + 1) * 3)}
                {arrowCells(end, 0, cellBase)}
                {sumCell(end, 'sum', cellBase)}
                {sumCell(end, 'carry', `${cellBase} border-[2.5px]`)}
              </tr>
            );
          }
          return (
            <React.Fragment key={end}>
              <tr ref={isActive ? activeRef : undefined} className={`h-8 ${isActive ? 'bg-amber-50/60' : ''}`}>
                {label(end * 6 + 3)}
                {arrowCells(end, 0, `${cellBase} border-b-0 border-b-transparent`)}
                {sumCell(end, 't1', `${cellBase} border-b border-b-gray-500 border-dotted`)}
                {sumCell(end, 'sum', cellBase + ' align-middle', 2)}
                {sumCell(end, 'carry', `${cellBase} border-[2.5px]`, 2)}
              </tr>
              <tr className={`h-8 ${isActive ? 'bg-amber-50/60' : ''}`}>
                {label(end * 6 + 6)}
                {arrowCells(end, 3, `${cellBase} border-t border-t-gray-500 border-dotted`)}
                {sumCell(end, 't2', cellBase)}
              </tr>
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
};

const SchreiberGame: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useTranslation();
  const [cfg, setCfg] = useState<SchreiberConfig>(readCfg);
  const [phase, setPhase] = useState<Phase>('setup');
  const [ends, setEnds] = useState<SchreiberEnd[]>([]);
  const [endIdx, setEndIdx] = useState(0);
  const [shooterIdx, setShooterIdx] = useState(0);
  const [step, setStep] = useState<Step>('arrows');
  const [entered, setEntered] = useState<string[]>([]);
  const [arrowCheck, setArrowCheck] = useState<null | boolean>(null);
  const [sheets, setSheets] = useState<RowState[][]>([]);
  const [cellIdx, setCellIdx] = useState(0);
  const [input, setInput] = useState('');
  const [rowDone, setRowDone] = useState<null | boolean>(null);
  const [answers, setAnswers] = useState<SchreiberAnswer[]>([]);
  const [result, setResult] = useState<{ res: SchreiberResult; newBest: boolean } | null>(null);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  /** Symulacja strzelania przed odczytem: która grupa strzela i ile jej strzał już widać. */
  const [volley, setVolley] = useState<{ group: number; shown: number } | null>(null);
  const [now, setNow] = useState(0);
  const drag = useRef<{ px: number; py: number; cx: number; cy: number; moved: boolean } | null>(null);
  const promptStart = useRef(0);
  const elapsedBefore = useRef(0);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Odpowiedzi także w refie — koniec gry czyta je synchronicznie (bez efektów w updaterze stanu).
  const answersRef = useRef<SchreiberAnswer[]>([]);
  const record = (a: SchreiberAnswer) => { answersRef.current = [...answersRef.current, a]; setAnswers(answersRef.current); };

  const arrowsPer = arrowsFor(cfg.target, cfg.arrows);
  const cells = sumCellsFor(arrowsPer);
  // Rekord czytamy na nowo po każdej grze (result) — stąd ta zależność.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const best = useMemo(() => readBest(cfg), [cfg, result]);
  const update = (patch: Partial<SchreiberConfig>) => setCfg(c => ({ ...c, ...patch }));

  const start = () => {
    writeJson(CFG_KEY, cfg);
    const rand = Math.random;
    const profiles = createShooterProfiles(cfg.shooters, cfg.level, rand);
    setEnds(Array.from({ length: cfg.ends }, () => generateEnd(profiles, cfg.arrows, rand, cfg.target)));
    setSheets(Array.from({ length: cfg.shooters }, () => []));
    setEndIdx(0); setShooterIdx(0); setStep('arrows'); setEntered([]); setArrowCheck(null);
    setCellIdx(0); setInput(''); setRowDone(null); answersRef.current = []; setAnswers([]); setResult(null); setZoom(null);
    elapsedBefore.current = 0;
    promptStart.current = performance.now();
    setVolley({ group: 0, shown: 0 });
    setPhase('play');
  };

  const waiting = arrowCheck !== null || rowDone !== null || volley !== null;
  useEffect(() => {
    if (phase !== 'play' || waiting) return;
    const id = window.setInterval(() => setNow(performance.now()), 200);
    return () => window.clearInterval(id);
  }, [phase, waiting]);
  const runningMs = phase === 'play'
    ? elapsedBefore.current + (waiting ? 0 : Math.max(0, now - promptStart.current))
    : 0;

  /** Czas od ostatniego sprawdzenia — doliczany do zegara gry. */
  const lap = () => {
    const ms = Math.round(performance.now() - promptStart.current);
    elapsedBefore.current += ms;
    return ms;
  };
  const resume = () => { promptStart.current = performance.now(); setNow(promptStart.current); };

  // ── Symulacja durchgangu: AB strzelają (~1 s), potem CD; zegar stoi ──
  const end = ends[endIdx];
  /** Kolejność pojawiania się strzał w każdej grupie: na zmianę A, B, A, B… */
  const volleyOrder = useMemo(() => {
    if (!end) return [];
    return shooterGroups(cfg.shooters).map(group => {
      const per = group.map(s => end.arrows.map((a, i) => (a.shooter === s ? i : -1)).filter(i => i >= 0));
      const out: number[] = [];
      const longest = Math.max(...per.map(p => p.length));
      for (let k = 0; k < longest; k++) per.forEach(p => { if (p[k] !== undefined) out.push(p[k]); });
      return out;
    });
  }, [end, cfg.shooters]);

  useEffect(() => {
    if (!volley) return;
    const order = volleyOrder[volley.group] ?? [];
    let delay: number;
    let next: { group: number; shown: number } | null;
    if (volley.shown < order.length) {
      // Najpierw chwila na napis „AB schießen”, potem strzały w równych odstępach.
      delay = volley.shown === 0 ? 250 : VOLLEY_MS / order.length;
      next = { group: volley.group, shown: volley.shown + 1 };
    } else if (volley.group + 1 < volleyOrder.length) {
      delay = 350;
      next = { group: volley.group + 1, shown: 0 };
    } else {
      delay = 450;
      next = null;
    }
    const id = window.setTimeout(() => { setVolley(next); if (!next) resume(); }, delay);
    return () => window.clearTimeout(id);
  }, [volley, volleyOrder]);

  /** Strzały widoczne na tarczy — podczas symulacji tylko te już wystrzelone. */
  const visibleArrows = useMemo(() => {
    if (!volley) return null;
    const set = new Set<number>();
    volleyOrder.forEach((order, g) => {
      if (g < volley.group) order.forEach(i => set.add(i));
      else if (g === volley.group) order.slice(0, volley.shown).forEach(i => set.add(i));
    });
    return set;
  }, [volley, volleyOrder]);
  const volleyLetters = volley ? (shooterGroups(cfg.shooters)[volley.group] ?? []) : [];

  const setRow = (patch: (row: RowState) => RowState) => setSheets(prev => prev.map((rows, s) => {
    if (s !== shooterIdx) return rows;
    const next = [...rows];
    next[endIdx] = patch(next[endIdx] ?? { values: [], cells: {} });
    return next;
  }));

  // ── Krok 1: odczyt strzał ──
  const goToSums = useCallback(() => {
    setArrowCheck(null); setStep('sums'); setCellIdx(0); setInput(''); setZoom(null); resume();
  }, []);

  const addArrow = (v: string) => {
    if (volley || arrowCheck !== null || entered.length >= arrowsPer) return;
    const list = [...entered, v];
    setEntered(list);
    if (list.length < arrowsPer) return;
    const exp = expectedRow(ends, endIdx, shooterIdx);
    const ok = sameArrowSet(list, exp.values);
    record({ kind: 'arrows', correct: ok, ms: lap() });
    setRow(() => ({ values: exp.values, misread: ok ? undefined : list, cells: {} }));
    setArrowCheck(ok);
    if (ok) window.setTimeout(goToSums, 600);
  };

  // ── Krok 2: sumy na arkuszu ──
  const nextRow = useCallback(() => {
    setRowDone(null);
    const lastShooter = shooterIdx + 1 >= cfg.shooters;
    if (lastShooter && endIdx + 1 >= cfg.ends) {
      const res = summarizeGame(answersRef.current, cfg.ends * cfg.shooters);
      const newBest = isBetterResult(res, readBest(cfg));
      if (newBest) {
        const all = readJson<Record<string, SchreiberResult>>(BEST_KEY, {});
        writeJson(BEST_KEY, { ...all, [configKey(cfg)]: res });
      }
      setResult({ res, newBest });
      setPhase('result');
      return;
    }
    if (lastShooter) { setShooterIdx(0); setEndIdx(i => i + 1); setVolley({ group: 0, shown: 0 }); } else setShooterIdx(i => i + 1);
    setStep('arrows'); setEntered([]); setZoom(null); resume();
  }, [shooterIdx, endIdx, cfg]);

  const submitSum = useCallback(() => {
    if (step !== 'sums' || rowDone !== null || input === '') return;
    const cell = cells[cellIdx];
    const exp = expectedRow(ends, endIdx, shooterIdx).cells[cell];
    const given = Number(input);
    const ok = given === exp;
    record({ kind: 'sum', correct: ok, ms: lap() });
    setRow(row => ({ ...row, cells: { ...row.cells, [cell]: { given, ok } } }));
    setInput('');
    if (cellIdx + 1 < cells.length) { setCellIdx(i => i + 1); resume(); return; }
    const rowOk = ok && cells.slice(0, -1).every(c => sheets[shooterIdx]?.[endIdx]?.cells[c]?.ok);
    setRowDone(rowOk);
    if (rowOk) window.setTimeout(nextRow, 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, rowDone, input, cells, cellIdx, ends, endIdx, shooterIdx, sheets, nextRow]);

  const pressDigit = useCallback((key: string) => {
    if (step !== 'sums' || rowDone !== null) return;
    if (key === 'del') setInput(v => v.slice(0, -1));
    else if (key === 'ok') submitSum();
    else setInput(v => (v.length >= 3 ? v : (v === '0' ? key : v + key)));
  }, [step, rowDone, submitSum]);

  // Klawiatura fizyczna przy sumach (komputer / tablet z klawiaturą).
  useEffect(() => {
    if (phase !== 'play' || step !== 'sums') return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) pressDigit(e.key);
      else if (e.key === 'Backspace') pressDigit('del');
      else if (e.key === 'Enter') {
        if (rowDone === false) nextRow();
        else pressDigit('ok');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, step, pressDigit, rowDone, nextRow]);

  // ── Lupa: stuknięcie powiększa 2,5× w tym miejscu, przeciąganie przesuwa, drugie stuknięcie wraca ──
  // Pozycję liczymy z getBoundingClientRect (wcześniej getScreenCTM — u usera lupa
  // zawsze lądowała w prawym górnym rogu).
  const isSpot = cfg.target === 'spot3';
  const base = isSpot ? { x: 45, y: -12, w: 210, h: 424 } : { x: -25, y: -25, w: 350, h: 350 };
  const zoomW = base.w / ZOOM;
  const zoomH = base.h / ZOOM;
  const clampCenter = (x: number, y: number) => ({
    x: Math.min(Math.max(x, base.x + zoomW / 2), base.x + base.w - zoomW / 2),
    y: Math.min(Math.max(y, base.y + zoomH / 2), base.y + base.h - zoomH / 2),
  });
  const viewBox = zoom
    ? `${zoom.x - zoomW / 2} ${zoom.y - zoomH / 2} ${zoomW} ${zoomH}`
    : `${base.x} ${base.y} ${base.w} ${base.h}`;
  const onTargetDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (zoom) e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, cx: zoom?.x ?? 0, cy: zoom?.y ?? 0, moved: false };
  };
  const onTargetMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!d || !zoom || !rect) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (!d.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
    d.moved = true;
    setZoom(clampCenter(d.cx - (dx / rect.width) * zoomW, d.cy - (dy / rect.height) * zoomH));
  };
  const onTargetUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!d || d.moved || !rect) return;
    if (zoom) { setZoom(null); return; }
    setZoom(clampCenter(
      base.x + ((e.clientX - rect.left) / rect.width) * base.w,
      base.y + ((e.clientY - rect.top) / rect.height) * base.h,
    ));
  };

  const letter = SHOOTERS[shooterIdx]?.letter;
  const expectedFor = (e: number) => expectedRow(ends, e, shooterIdx).cells;
  const arrowAnswers = answers.filter(a => a.kind === 'arrows');
  const sumAnswers = answers.filter(a => a.kind === 'sum');

  return createPortal(
    // Portal: Einstellungen mają animację z transform, przez co fixed liczyłby
    // się od karty, a nie od ekranu (i dolne menu przykrywało grę).
    <div className="fixed inset-0 z-[200000] bg-[#f4f6f5] overflow-y-auto">
      <div className="max-w-md mx-auto px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-6">
        <div className="flex items-center justify-between mb-2">
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
              <Choice<SchreiberTarget> value={cfg.target} options={TARGETS} onChange={v => update({ target: v })} render={v => t(`schreiber.targets.${v}`)} />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1 mb-1.5 block">{t('schreiber.shooters')}</label>
              <Choice value={cfg.shooters} options={[1, 2, 3, 4] as const} onChange={v => update({ shooters: v })}
                render={v => (
                  <span className="flex flex-col items-center leading-tight">
                    <span className="text-lg font-black">{v}</span>
                    <span className="text-[9px] font-bold opacity-70 tracking-widest">{SHOOTERS.slice(0, v).map(s => s.letter).join('')}</span>
                  </span>
                )} />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1 mb-1.5 block">{t('schreiber.arrowsPerShooter')}</label>
              {isSpot
                ? <p className="text-[11px] font-bold text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">{t('schreiber.spotArrows')}</p>
                : <Choice value={cfg.arrows} options={[3, 6] as const} onChange={v => update({ arrows: v })} render={v => v} />}
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1 mb-1.5 block">{t('schreiber.level')}</label>
              <Choice<SchreiberLevel> value={cfg.level} options={LEVELS} onChange={v => update({ level: v })} render={v => t(`schreiber.levels.${v}`)} />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1 mb-1.5 block">{t('schreiber.ends')}</label>
              <Choice value={cfg.ends} options={END_OPTIONS} onChange={v => update({ ends: v })} render={v => v} />
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
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-sm pl-2 pr-3 py-1.5">
              <div className="flex items-center gap-2">
                <ShooterIcon shooter={shooterIdx} />
                <div className="leading-tight">
                  <div className="text-[13px] font-black text-[#0a3a2a]">{t('schreiber.shooterLabel', { letter })}</div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase">
                    {t('schreiber.endOf', { n: endIdx + 1, total: cfg.ends })} · {t(volley ? 'schreiber.stepShooting' : step === 'arrows' ? 'schreiber.stepArrows' : 'schreiber.stepSums')}
                  </div>
                </div>
              </div>
              <span className="text-[12px] font-black text-gray-500 tabular-nums">⏱ {fmtSec(runningMs)} s</span>
            </div>

            {step === 'arrows' && (
              <>
                <div className="relative bg-white rounded-2xl border border-gray-100 shadow-sm p-1.5">
                  <style>{`@keyframes schreiberHit{0%{transform:scale(2.4);opacity:0}60%{opacity:1}100%{transform:scale(1);opacity:1}}.schreiber-hit{transform-box:fill-box;transform-origin:center;animation:schreiberHit .18s ease-out}`}</style>
                  <svg ref={svgRef} viewBox={viewBox}
                    onPointerDown={onTargetDown} onPointerMove={onTargetMove} onPointerUp={onTargetUp}
                    onPointerCancel={() => { drag.current = null; }}
                    style={{ touchAction: zoom ? 'none' : 'auto' }}
                    className={`h-auto block mx-auto ${zoom ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'} ${isSpot ? 'w-1/2' : 'w-full max-w-[340px]'}`}
                    role="img" aria-label={t('schreiber.targetLabel')}>
                    <rect x={base.x} y={base.y} width={base.w} height={base.h} rx="16" fill="#d9cba6" />
                    {isSpot ? <SpotTarget isVertical /> : <StandardTarget targetType={SCHREIBER_FACE_ID[cfg.target]} />}
                    {end.arrows.map((a, i) => (visibleArrows && !visibleArrows.has(i)) ? null : (
                      <g key={i} className={volley ? 'schreiber-hit' : undefined}>
                        <ArrowMark x={a.x} y={a.y} shooter={a.shooter}
                          dim={arrowCheck !== null && a.shooter !== shooterIdx}
                          focus={arrowCheck !== null && a.shooter === shooterIdx}
                          label={arrowCheck === false && a.shooter === shooterIdx ? a.value : undefined} />
                      </g>
                    ))}
                  </svg>
                  {volley ? (
                    <div className="absolute inset-x-0 top-3 flex justify-center pointer-events-none">
                      <div className="flex items-center gap-1.5 bg-[#0a3a2a]/90 text-white rounded-full pl-2 pr-3 py-1 shadow-lg">
                        {volleyLetters.map(s => <ShooterIcon key={s} shooter={s} className="w-6 h-6" />)}
                        <span className="text-[12px] font-black uppercase tracking-widest">
                          {t('schreiber.shooting', { letters: volleyLetters.map(s => SHOOTERS[s].letter).join('') })}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <span className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-white/90 border border-gray-200 flex items-center justify-center text-gray-500 pointer-events-none">
                      <span className="material-symbols-outlined text-[16px]">{zoom ? 'zoom_out' : 'zoom_in'}</span>
                    </span>
                  )}
                  {zoom && (
                    <p className="text-center text-[10px] font-bold text-gray-400 pt-1">{t('schreiber.zoomHint')}</p>
                  )}
                  {cfg.shooters > 1 && (
                    <div className="flex justify-center gap-3 pt-1 text-[11px] font-black text-gray-500">
                      {SHOOTERS.slice(0, cfg.shooters).map((s, i) => (
                        <span key={s.letter} className="inline-flex items-center gap-0.5"><ShooterIcon shooter={i} className="w-5 h-5" />{s.letter}</span>
                      ))}
                    </div>
                  )}
                </div>

                <div className={`rounded-2xl border p-2 ${arrowCheck === null ? 'bg-white border-gray-100 shadow-sm' : arrowCheck ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="flex gap-1">
                    {Array.from({ length: arrowsPer }, (_, i) => (
                      <div key={i} className={`flex-1 h-7 border-[1.5px] border-black bg-white flex items-center justify-center font-black text-[15px] ${arrowCheck === false ? 'text-red-500 line-through' : PEN}`}>
                        {entered[i] ?? ''}
                      </div>
                    ))}
                  </div>
                  {arrowCheck !== null && (
                    <div className="mt-1.5">
                      <div className={`text-[12px] font-black ${arrowCheck ? 'text-emerald-700' : 'text-red-700'}`}>
                        {arrowCheck ? t('schreiber.arrowsOk') : t('schreiber.arrowsWrong', { values: expectedRow(ends, endIdx, shooterIdx).values.join(' ') })}
                      </div>
                      {!arrowCheck && (
                        <button onClick={goToSums} className="w-full mt-1.5 py-3 bg-[#0a3a2a] text-white rounded-xl font-black text-[11px] uppercase tracking-widest active:scale-95">
                          {t('schreiber.next')}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {arrowCheck === null && (
                  <div className={`flex flex-col gap-1 h-[164px] transition-opacity ${volley ? 'opacity-30 pointer-events-none' : ''}`}>
                    {[['X', '10', '9'], ['8', '7', '6'], ['5', '4', '3']].map(rowKeys => (
                      <div key={rowKeys[0]} className="grid grid-cols-3 gap-1 flex-1">
                        {rowKeys.map(v => <button key={v} onClick={() => addArrow(v)} className={`rounded-lg font-bold text-base active:scale-95 transition-all ${getArrowStyles(v)}`}>{v}</button>)}
                      </div>
                    ))}
                    <div className="grid grid-cols-3 gap-1 flex-1">
                      <button onClick={() => addArrow('2')} className={`rounded-lg font-bold text-base active:scale-95 transition-all ${getArrowStyles('2')}`}>2</button>
                      <button onClick={() => addArrow('1')} className={`rounded-lg font-bold text-base active:scale-95 transition-all ${getArrowStyles('1')}`}>1</button>
                      <div className="grid grid-cols-2 gap-1">
                        <button onClick={() => addArrow('M')} className={`rounded-lg font-bold text-base active:scale-95 transition-all ${getArrowStyles('M')}`}>M</button>
                        <button onClick={() => setEntered(l => l.slice(0, -1))} aria-label={t('schreiber.delete')} className="rounded-lg bg-white border border-red-100 text-red-500 shadow-sm flex items-center justify-center active:scale-95 transition-all"><span className="material-symbols-outlined text-lg font-black">undo</span></button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {step === 'sums' && (
              <>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2">
                  <div className="max-h-[380px] overflow-y-auto">
                    <ScoreSheet
                      rows={sheets[shooterIdx] ?? []}
                      ends={cfg.ends}
                      arrows={arrowsPer}
                      expected={expectedFor}
                      activeEnd={endIdx}
                      activeCell={rowDone === null ? cells[cellIdx] : null}
                      input={input}
                    />
                  </div>
                  {rowDone !== null && (
                    <div className={`mt-2 rounded-xl p-2 ${rowDone ? 'bg-emerald-50' : 'bg-red-50'}`}>
                      <div className={`text-[12px] font-black ${rowDone ? 'text-emerald-700' : 'text-red-700'}`}>
                        {rowDone ? t('schreiber.rowOk') : t('schreiber.rowWrong')}
                      </div>
                      {!rowDone && (
                        <button onClick={nextRow} className="w-full mt-1.5 py-3 bg-[#0a3a2a] text-white rounded-xl font-black text-[11px] uppercase tracking-widest active:scale-95">
                          {t('schreiber.next')}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {rowDone === null && (
                  <div className="grid grid-cols-3 gap-1">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].map(k => (
                      <button key={k} onClick={() => pressDigit(k)}
                        aria-label={k === 'del' ? t('schreiber.delete') : k === 'ok' ? t('schreiber.confirm') : k}
                        className={`h-10 rounded-lg font-black text-lg active:scale-95 transition-all flex items-center justify-center ${k === 'ok' ? 'bg-[#0a3a2a] text-white shadow-md' : k === 'del' ? 'bg-gray-100 text-gray-500' : 'bg-white border border-gray-200 text-[#0a3a2a]'}`}>
                        {k === 'del' ? <span className="material-symbols-outlined">backspace</span> : k === 'ok' ? <span className="material-symbols-outlined">check</span> : k}
                      </button>
                    ))}
                  </div>
                )}
              </>
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
                <div className="text-[9px] font-black text-gray-400 uppercase">{t('schreiber.resultArrows')}</div>
                <div className="text-lg font-black text-[#0a3a2a] tabular-nums">{arrowAnswers.filter(a => a.correct).length}/{arrowAnswers.length}</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-2.5">
                <div className="text-[9px] font-black text-gray-400 uppercase">{t('schreiber.resultSums')}</div>
                <div className="text-lg font-black text-[#0a3a2a] tabular-nums">{sumAnswers.filter(a => a.correct).length}/{sumAnswers.length}</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-2.5">
                <div className="text-[9px] font-black text-gray-400 uppercase">{t('schreiber.avgTime')}</div>
                <div className="text-lg font-black text-[#0a3a2a] tabular-nums">{fmtSec(result.res.avgMs)} s</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-2.5">
                <div className="text-[9px] font-black text-gray-400 uppercase">{t('schreiber.totalTime')}</div>
                <div className="text-lg font-black text-[#0a3a2a] tabular-nums">{fmtSec(result.res.totalMs)} s</div>
              </div>
            </div>
            {cfg.shooters > 1 && (
              <div className="text-left">
                <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">{t('schreiber.standings')}</div>
                <div className="space-y-1">
                  {standings(ends, cfg.shooters).map(s => (
                    <div key={s.shooter} className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 ${s.place === 1 ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}>
                      <span className="w-5 text-center text-[13px] font-black text-gray-500 tabular-nums">{s.place === 1 ? '🏆' : `${s.place}.`}</span>
                      <ShooterIcon shooter={s.shooter} className="w-6 h-6" />
                      <span className="text-[13px] font-black text-[#0a3a2a]">{t('schreiber.shooterLabel', { letter: SHOOTERS[s.shooter].letter })}</span>
                      <span className="ml-auto text-[10px] font-bold text-gray-400 tabular-nums">{t('schreiber.tensXs', { tens: s.tens, xs: s.xs })}</span>
                      <span className="w-9 text-right text-[15px] font-black text-[#0a3a2a] tabular-nums">{s.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
