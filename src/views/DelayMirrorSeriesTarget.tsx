import React from 'react';
import { resolveTargetFace, isSpotFace, isVerticalSpotFace } from '../config/targetFaces';
import { StandardTarget } from '../components/targets/StandardTarget';
import { SpotTarget } from '../components/targets/SpotTarget';
import type { TechShot } from './DelayMirrorSeries';

// Tarcza TYLKO DO ODCZYTU — obok wideo na ekranie podsumowania passy.
// Osobny plik, bo TargetInput jest pelnoekranowy (`fixed inset-0 z-[99999]`)
// i interaktywny; tutaj potrzebny jest sam rysunek ze strzalami, ktory da
// sie wcisnac w kolumne o szerokosci kilku centymetrow.
//
// Uklad wspolrzednych i wyglad znacznikow sa TAKIE SAME jak w TargetInput
// (viewBox 340 jednostek, kolka r=6 z numerem) — inaczej strzala wbita na
// tarczy ladowalaby tu w innym miejscu.

interface Props {
  targetType: string;
  shots: TechShot[];
  className?: string;
  /** Podswietlona strzala — np. ta, ktorej znacznik user wlasnie ustawia. */
  activeN?: number | null;
  onPick?: (n: number) => void;
}

/** Kadr tarczy w jednostkach SVG. Eksportowane, bo wypalanie tarczy w klip
 *  musi przeliczyc x/y strzaly na piksele canvasa tym SAMYM kadrem — inaczej
 *  strzala na wypalonej tarczy siedzialaby gdzie indziej niz w aplikacji. */
export function seriesTargetViewBox(targetType: string): { x: number; y: number; w: number; h: number } {
  const face = resolveTargetFace(targetType);
  // Tarcze bez zewnetrznych pierscieni (6-Ring, 3-5-7) rysuja sie mniejsze
  // niz pelne 300 jednostek, wiec dostaja ciasniejszy viewBox.
  const isCompactFace = face.rings.length > 0 && face.rings[0].r < 150;
  if (isSpotFace(targetType)) return { x: -20, y: -40, w: 340, h: 480 };
  if (isCompactFace) return { x: -20, y: -30, w: 340, h: 360 };
  return { x: -20, y: 0, w: 340, h: 300 };
}

export default function DelayMirrorSeriesTarget({ targetType, shots, className, activeN = null, onPick }: Props) {
  const is3Spot = isSpotFace(targetType);
  const isVertical = isVerticalSpotFace(targetType);

  const vb = seriesTargetViewBox(targetType);
  const viewBox = `${vb.x} ${vb.y} ${vb.w} ${vb.h}`;

  return (
    <svg viewBox={viewBox} className={className}>
      {/* `preview` — obie kolumny 3-Spota pelne. Przygaszanie w TargetInput
          prowadzi usera przez kolejne strzaly; w podsumowaniu nie ma czego
          prowadzic, a przygaszona polowa wygladalaby na blad. */}
      {is3Spot ? <SpotTarget isVertical={isVertical} preview /> : <StandardTarget targetType={targetType} />}
      {shots.map(s => {
        const active = activeN === s.n;
        return (
          <g
            key={s.n}
            onClick={onPick ? () => onPick(s.n) : undefined}
            style={onPick ? { cursor: 'pointer' } : undefined}
          >
            {/* Aktywna strzala: NIE zloty/zolty — w dziesiatce (zlote pole)
                zolty znacznik znika. Ten sam kolor co obwodka w wypalonym
                eksporcie (DelayMirrorExport), zeby sie zgadzalo. */}
            <circle
              cx={s.x}
              cy={s.y}
              r={active ? 8 : 6}
              fill={active ? '#4ade80' : 'white'}
              stroke="black"
              strokeWidth="1.5"
            />
            <text
              x={s.x}
              y={s.y + (active ? 3 : 2.5)}
              fontSize={active ? 9 : 7}
              fontWeight="bold"
              textAnchor="middle"
              fill="black"
            >
              {s.n}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
