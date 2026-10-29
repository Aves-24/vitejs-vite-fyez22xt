import React from 'react';
import { useTranslation } from 'react-i18next';
import { isFullFace as isFullFaceType, isSpotFace } from '../config/targetFaces';
import { arrowColorAt } from '../config/arrowColors';
import { groupStats, GROUP_CENTER_RINGS } from '../utils/groupStats';
import { directionKey } from '../utils/arrowStats';

/** Korekta celownika dopiero z tylu strzał i od takiego przesunięcia (w pierścieniach). */
const SIGHT_MIN_DOTS = 12;
const SIGHT_MIN_RINGS = 0.5;

// arrowColors — [KOLORY STRZAŁ] sesja wpisana w kolorowej kolejności: kropka = kolor strzały
// showGroup — [PODSUMOWANIE TRENINGU] środek grupy i koło z 80% strzał + podpis w cm
// (wybrana seria, jeśli jest w tej rundzie, inaczej cała runda) — utils/groupStats.ts
// colorFilter — [KOLORY STRZAŁ] miejsce strzały w serii (0 = zielona): na tarczy tylko
// ta strzała ze wszystkich serii, grupa liczona też tylko z niej (ArrowColorFilter)
// bare — sama tarcza (większa) + podpis grupy, bez ramki i nagłówka: do karty
// „Trefferbild” po treningu, która ma własny nagłówek i przełącznik rund
// sightHint — łuk z celownikiem (recurve/compound): pod grupą podpowiedź korekty celownika
// plainDots — wszystkie kropki na żółto (przytrzymany przycisk: kolory strzał chwilowo off)
// aside — kolumna obok tarczy (pionowy filtr strzał); overlay — przycisk w rogu tarczy
export default function RoundTargetSummary({ title, ends, highlightedEnd, startIndex = 0, targetType = 'Full', onHeatmapClick, arrowColors, showGroup, colorFilter = null, bare = false, sightHint = false, plainDots = false, aside, overlay }: any) {
  const { t, i18n } = useTranslation();
  const isFullFace = isFullFaceType(targetType);
  const is3Spot = isSpotFace(targetType);

  const totalArrows = ends.reduce((acc: number, end: any) => acc + (end.dots?.length || 0), 0);
  const isLargeSession = totalArrows > 18;

  const localSel = highlightedEnd !== null && highlightedEnd !== undefined ? highlightedEnd - startIndex : -1;
  const filtering = arrowColors && colorFilter !== null && colorFilter !== undefined;
  const selEnds = localSel >= 0 && localSel < ends.length ? [ends[localSel]] : ends;
  const groupEnds = filtering ? selEnds.map((e: any) => ({ dots: e.dots?.[colorFilter] ? [e.dots[colorFilter]] : [] })) : selEnds;
  const group = showGroup ? groupStats(groupEnds, targetType) : null;
  const cm = (v: number) => Math.round(Math.abs(v)).toLocaleString(i18n.language);
  // [KOREKTA CELOWNIKA] Tylko gdy łuk ma celownik (sightHint), dla całej rundy
  // (nie jednej serii ani jednego koloru — za mało strzał), przy wyraźnym
  // przesunięciu. Zasada: celownik idzie za strzałą (grupa w prawo → celownik w prawo).
  const showSight = !!sightHint && !!group && !filtering && localSel < 0
    && group.n >= SIGHT_MIN_DOTS && group.offsetRings >= SIGHT_MIN_RINGS;
  const cross = group?.svg
    ? `M ${group.svg.cx - 7} ${group.svg.cy} H ${group.svg.cx + 7} M ${group.svg.cx} ${group.svg.cy - 7} V ${group.svg.cy + 7}`
    : '';

  const renderSpotCircle = (cx: number, cy: number) => (
    <g key={`spot-${cx}-${cy}`}>
      <circle cx={cx} cy={cy} r="62.5" fill="#2F80ED" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="50" fill="#EB5757" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="37.5" fill="#EB5757" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="25" fill="#F2C94C" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="12.5" fill="#F2C94C" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="6.25" fill="#F2C94C" stroke="#333" strokeWidth="0.5" />
    </g>
  );

  return (
    <div className={bare ? 'relative flex flex-col items-center w-full' : 'bg-white rounded-2xl border border-gray-100 p-3 shadow-sm relative flex flex-col items-center h-full'}>
      {!bare && <div className="w-full flex justify-between items-center mb-3">
        <div className="flex flex-col">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">{title}</span>
          <span className="text-[8px] font-bold text-emerald-500 uppercase mt-1">
            {filtering ? `${ends.filter((e: any) => e.dots?.[colorFilter]).length} / ${totalArrows}` : totalArrows} {t('common.arrows')}
          </span>
        </div>
        {onHeatmapClick && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onHeatmapClick();
            }}
            className="flex items-center justify-center w-8 h-8 bg-gray-50 text-orange-500 rounded-lg active:scale-95 transition-all border border-gray-100 hover:bg-gray-100 shadow-sm"
            aria-label={t('stats.zoom.heatmap', 'Heatmap')}
          >
            <span className="material-symbols-outlined text-[18px]">local_fire_department</span>
          </button>
        )}
      </div>}

      <div className="w-full flex items-center gap-1.5">
      <div className="relative flex-1 min-w-0 flex items-center justify-center min-h-[160px]">
        {overlay}
        {/* Zunifikowany viewBox: 3-Spot używa 300x400 (żeby podwójna tarcza ładnie siadła) */}
        <svg viewBox={!isFullFace ? "0 0 300 400" : "0 0 300 300"} className={`w-full h-auto drop-shadow-md ${bare ? 'max-h-[380px]' : 'max-h-[220px]'}`}>
          {/* Tarcza przygaszona do 70% (user 2026-10-29) — strzały lepiej widać. */}
          <g opacity="0.7">
          {isFullFace ? (
            <g>
              <circle cx="150" cy="150" r="150" fill="white" stroke="#333" strokeWidth="1" />
              <circle cx="150" cy="150" r="135" fill="white" stroke="#333" strokeWidth="1" />
              <circle cx="150" cy="150" r="120" fill="#333" stroke="#fff" strokeWidth="1" />
              <circle cx="150" cy="150" r="105" fill="#333" stroke="#fff" strokeWidth="1" />
              <circle cx="150" cy="150" r="90" fill="#2F80ED" stroke="#333" strokeWidth="1" />
              <circle cx="150" cy="150" r="75" fill="#2F80ED" stroke="#333" strokeWidth="1" />
              <circle cx="150" cy="150" r="60" fill="#EB5757" stroke="#333" strokeWidth="1" />
              <circle cx="150" cy="150" r="45" fill="#EB5757" stroke="#333" strokeWidth="1" />
              <circle cx="150" cy="150" r="30" fill="#F2C94C" stroke="#333" strokeWidth="1" />
              <circle cx="150" cy="150" r="15" fill="#F2C94C" stroke="#333" strokeWidth="1" />
              <circle cx="150" cy="150" r="7.5" fill="#F2C94C" stroke="#333" strokeWidth="1" />
            </g>
          ) : is3Spot ? (
            // TUTAJ POPRAWKA: Jeśli is3Spot jest prawda, ZAWSZE rysuj dwie pionowe połówki (Lewa na 75, Prawa na 225)
            <g>
              <rect x="5" y="0" width="140" height="400" fill="#f8f9fa" rx="8" stroke="#ddd" strokeWidth="2" />
              <rect x="155" y="0" width="140" height="400" fill="#f8f9fa" rx="8" stroke="#ddd" strokeWidth="2" />
              {[66, 200, 333].map(cy => renderSpotCircle(75, cy))}
              {[66, 200, 333].map(cy => renderSpotCircle(225, cy))}
            </g>
          ) : (
             // W razie gdyby ktoś kiedyś dodał inny typ (np. zwierzaka 3D), zostawiamy ten fallback 
            <g>
              <rect x="75" y="0" width="150" height="400" fill="#f9f9f9" rx="10" stroke="#eee" strokeWidth="2" />
              {[66, 200, 333].map(cy => renderSpotCircle(150, cy))}
            </g>
          )}
          </g>

          {ends.map((end: any, idx: number) => {
            const globalIdx = startIndex + idx;
            const endOn = highlightedEnd === null || highlightedEnd === undefined || highlightedEnd === globalIdx;

            return end.dots?.map((dot: any, dIdx: number) => {
              if (dot.x === null || dot.y === null) return null;
              // Filtr koloru: na tarczy zostaje tylko wybrana strzała ze wszystkich serii.
              // Filtr koloru: pozostałe strzały nie znikają skokowo, tylko gasną
              // i maleją (to samo przejście co przy zmianie rundy — user 2026-10-29).
              const hidden = filtering && dIdx !== colorFilter;
              const isHighlighted = endOn;
              const radius = hidden ? "0" : isHighlighted ? (isLargeSession ? "4.5" : "6") : "3.5";
              const ac = arrowColors && !plainDots ? arrowColorAt(dIdx) : null;

              return (
                <circle
                  key={`${idx}-${dIdx}`} cx={dot.x} cy={dot.y} r={radius} fill={ac ? ac.hex : plainDots ? '#fed33e' : 'white'}
                  fillOpacity={isHighlighted ? (ac ? 1 : 0.8) : 0.2} stroke={isHighlighted ? "#0a3a2a" : "#aaa"}
                  strokeWidth={isHighlighted ? "1.5" : "0.5"} opacity={hidden ? 0 : isHighlighted ? 1 : 0.3}
                  style={{ transition: 'all 0.35s ease' }}
                />
              );
            });
          })}
          {group?.svg && (
            <g pointerEvents="none">
              {/* Środek i koło grupy płyną do nowego miejsca przy zmianie serii/rundy/filtra. */}
              <circle cx={group.svg.cx} cy={group.svg.cy} r={Math.max(group.svg.r, 4)} fill="none" stroke="#0a3a2a" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.85" style={{ transition: 'all 0.4s ease' }} />
              <path d={cross} stroke="#ffffff" strokeWidth="4" strokeLinecap="round" style={{ transition: 'd 0.4s ease' }} />
              <path d={cross} stroke="#0a3a2a" strokeWidth="2" strokeLinecap="round" style={{ transition: 'd 0.4s ease' }} />
            </g>
          )}
        </svg>
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
      </div>
      {group && (
        <div className="w-full mt-2 pt-2 border-t border-gray-100 text-[10px] font-bold text-gray-500 leading-snug">
          <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest">{t('scoring.group.title')}</span>
          <span className="block text-[#0a3a2a] font-black">
            {group.offsetRings < GROUP_CENTER_RINGS
              ? t('scoring.group.centered')
              : t('scoring.group.offset', { cm: cm(Math.hypot(group.dxCm, group.dyCm)), dir: t(`stats.arrowColors.dir.${directionKey(group.dxCm, group.dyCm)}`) })}
          </span>
          <span className="block">{t('scoring.group.size', { cm: cm(group.diameterCm) })}</span>
          {showSight && (
            <div className="mt-2 flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-2.5 py-2">
              <span className="material-symbols-outlined text-[18px] text-emerald-600 shrink-0">my_location</span>
              <span className="block min-w-0">
                <span className="block text-[11px] font-black text-[#0a3a2a]">
                  {t('scoring.sight.move', { dir: t(`stats.arrowColors.dir.${directionKey(group.dxCm, group.dyCm)}`) })}
                </span>
                <span className="block text-[10px] font-bold text-gray-500">{t('scoring.sight.rule')}</span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}