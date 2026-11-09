import { findTargetFace } from './targetFaces';

/**
 * [KOLORY KLAWISZY 2026-11-09] Kolor przycisku/pola strzały wg tarczy.
 *
 * Na tarczach WA wartość mówi wszystko (9 = złoto, 6 = niebieski). Na
 * terenowych i IFAA ta sama wartość ma inny kolor (WA Field: 5 żółte; IFAA
 * Field: 5 czarny środek, 4 biały pierścień; IFAA Indoor: 5 biały, reszta
 * niebieska), więc tarcza może podać własną mapę `keyColors`.
 *
 * UWAGA: Tailwind skanuje tylko *.tsx — te napisy to DOKŁADNIE klasy
 * z getArrowStyles (ScoringView/TargetInput), więc na pewno się generują.
 */
export type KeyColor = 'gold' | 'red' | 'blue' | 'black' | 'white';

export const KEY_CLASS: Record<KeyColor, string> = {
  gold: 'bg-[#F2C94C] text-[#333] border-none shadow-sm',
  red: 'bg-[#EB5757] text-white border-none shadow-sm',
  blue: 'bg-[#2F80ED] text-white border-none shadow-sm',
  black: 'bg-[#333333] text-white border-none shadow-sm',
  white: 'bg-white border border-gray-200 text-[#333] shadow-sm',
};

export const KEY_SVG: Record<KeyColor, { bg: string; text: string; stroke: string }> = {
  gold: { bg: '#F2C94C', text: '#333', stroke: '#fff' },
  red: { bg: '#EB5757', text: '#fff', stroke: '#fff' },
  blue: { bg: '#2F80ED', text: '#fff', stroke: '#fff' },
  black: { bg: '#333', text: '#fff', stroke: '#fff' },
  white: { bg: '#fff', text: '#333', stroke: '#e5e7eb' },
};

/** Kolor wartości na danej tarczy albo null (wtedy zwykłe kolory WA). */
export function keyColorFor(targetType: string | null | undefined, v: string): KeyColor | null {
  return findTargetFace(targetType)?.keyColors?.[v] ?? null;
}

export const faceKeyClass = (targetType: string | null | undefined, v: string): string | null => {
  const c = keyColorFor(targetType, v);
  return c ? KEY_CLASS[c] : null;
};

export const faceKeySvg = (targetType: string | null | undefined, v: string) => {
  const c = keyColorFor(targetType, v);
  return c ? KEY_SVG[c] : null;
};
