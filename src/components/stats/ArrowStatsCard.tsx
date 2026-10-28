import React from 'react';
import { useTranslation } from 'react-i18next';
import { ARROW_COLORS } from '../../config/arrowColors';
import { ArrowStatsResult, ARROW_MIN_ENDS, directionKey } from '../../utils/arrowStats';

/**
 * [KOLORY STRZAŁ] Karta „Strzały w porównaniu” (PRO, etap 2).
 *
 * Mała tarcza pokazuje średni punkt każdej strzały względem jej serii —
 * środek = reszta grupy. Pod nią wiersz na strzałę: średnia punktów,
 * kierunek i odległość w cm. Ostrzeżenie dopiero przy stałym, pewnym
 * przesunięciu (utils/arrowStats.ts), żeby nie oskarżać strzały po
 * jednym treningu.
 */

interface Props {
  data: ArrowStatsResult;
}

/** Zasięg wykresu: krawędź małej tarczy = tyle pierścieni odchylenia. */
const PLOT_RINGS = 1.5;

export default function ArrowStatsCard({ data }: Props) {
  const { t, i18n } = useTranslation();
  const fmt = (v: number, digits = 1) =>
    i18n.language === 'en' ? v.toFixed(digits) : v.toFixed(digits).replace('.', ',');
  const withPos = data.arrows.filter(a => a.n > 0);
  const missingEnds = Math.max(0, ARROW_MIN_ENDS - data.minEnds);
  const suspects = data.arrows.filter(a => a.suspect);

  const dirLabel = (dx: number, dy: number) => t(`stats.arrowColors.dir.${directionKey(dx, dy)}`);

  return (
    <div className="bg-white rounded-[24px] border border-gray-100 p-4 shadow-sm">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('stats.arrowColors.title')}</h3>
          <p className="text-[8px] font-bold text-gray-300 uppercase tracking-widest mt-0.5">
            {t('stats.arrowColors.sub', { count: data.sessions })}
          </p>
        </div>
        <div className="flex gap-0.5">
          {ARROW_COLORS.map(c => (
            <span key={c.id} className="w-2 h-2 rounded-full border border-[#0a3a2a]/40" style={{ backgroundColor: c.hex }} />
          ))}
        </div>
      </div>

      {suspects.map(a => (
        <div key={a.index} className="mb-3 bg-red-50 border border-red-100 rounded-2xl p-3 flex gap-2.5 items-start">
          <span className="material-symbols-outlined text-red-500 text-[18px] shrink-0">warning</span>
          <p className="text-[11px] font-bold text-red-700 leading-relaxed">
            {t('stats.arrowColors.suspect', {
              n: a.index + 1,
              color: t(`stats.arrowColors.color.${ARROW_COLORS[a.index].id}`),
              cm: fmt(a.distCm),
              dir: dirLabel(a.dx, a.dy),
            })}
          </p>
        </div>
      ))}

      {withPos.length > 0 && (
        <div className="flex justify-center mb-3">
          {/* Zapas 8 jednostek poza okręgiem 45 — kropka na krawędzi nie jest ucięta. */}
          <svg viewBox="-53 -53 106 106" className="w-40 h-40">
            {[1, 2 / 3, 1 / 3].map((f, i) => (
              <circle key={i} r={45 * f} fill={i === 2 ? '#fef3c7' : 'none'} stroke="#e5e7eb" strokeWidth={0.8} />
            ))}
            <line x1={-45} y1={0} x2={45} y2={0} stroke="#f3f4f6" strokeWidth={0.6} />
            <line x1={0} y1={-45} x2={0} y2={45} stroke="#f3f4f6" strokeWidth={0.6} />
            <circle r={1.5} fill="#9ca3af" />
            {withPos.map(a => {
              const c = ARROW_COLORS[a.index];
              // Poza zasięgiem kropka staje na krawędzi, w swoim kierunku.
              const k = a.dist > PLOT_RINGS ? PLOT_RINGS / a.dist : 1;
              const x = (a.dx * k * 45) / PLOT_RINGS;
              const y = (a.dy * k * 45) / PLOT_RINGS;
              return (
                <g key={a.index}>
                  <circle cx={x} cy={y} r={6} fill={c.hex} stroke={a.suspect ? '#dc2626' : '#0a3a2a'} strokeWidth={a.suspect ? 1.8 : 1} />
                  <text x={x} y={y + 2.6} textAnchor="middle" fontSize={7} fontWeight={900} fill={c.text}>{a.index + 1}</text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      <div className="space-y-1">
        {data.arrows.map(a => {
          const c = ARROW_COLORS[a.index];
          return (
            <div key={a.index} className={`flex items-center gap-2 px-2 py-1.5 rounded-xl ${a.suspect ? 'bg-red-50' : ''}`}>
              <span
                className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black border border-[#0a3a2a] shrink-0"
                style={{ backgroundColor: c.hex, color: c.text }}
              >
                {a.index + 1}
              </span>
              <span className="text-[12px] font-black text-[#0a3a2a] w-10">{fmt(a.avgScore, 2)}</span>
              <span className="flex-1 text-[10px] font-bold text-gray-500 truncate">
                {a.n > 0
                  ? (directionKey(a.dx, a.dy) === 'center'
                    ? t('stats.arrowColors.inGroup')
                    : `${fmt(a.distCm)} cm ${dirLabel(a.dx, a.dy)}`)
                  : '—'}
              </span>
              <span className="text-[9px] font-bold text-gray-300 shrink-0">
                {t('stats.arrowColors.ends', { count: a.n || a.scored })}
              </span>
            </div>
          );
        })}
      </div>

      {missingEnds > 0 && withPos.length > 0 && (
        <p className="mt-3 text-[10px] font-bold text-gray-400 leading-relaxed">
          {t('stats.arrowColors.needMore', { count: missingEnds })}
        </p>
      )}
      {withPos.length === 0 && (
        <p className="mt-3 text-[10px] font-bold text-gray-400 leading-relaxed">{t('stats.arrowColors.noPositions')}</p>
      )}
      <p className="mt-2 text-[9px] font-bold text-gray-300 leading-relaxed">{t('stats.arrowColors.firstArrowNote')}</p>
    </div>
  );
}
