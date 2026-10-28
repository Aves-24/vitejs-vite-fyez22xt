/**
 * [KOLORY STRZAŁ] Stała kolejność strzał w serii (pomysł usera 2026-10-28).
 *
 * Łucznik znaczy strzały grubym pisakiem przy lotkach: numer + kolor.
 * Zielona idzie ZAWSZE pierwsza, dalej kolory tarczy od zewnątrz: biała,
 * czarna, niebieska, czerwona, żółta. Strzela i wpisuje w tej kolejności,
 * więc miejsce strzały w serii (`dots[i]` / `rawArrows[i]`) = która to
 * strzała. Dzięki temu statystyka „per strzała” nie potrzebuje żadnego
 * dodatkowego kliknięcia przy wpisywaniu.
 *
 * Opcja włączana w zestawie (STRZAŁY), domyślnie wyłączona — nie każdy chce
 * się w to bawić. Sesja dostaje `arrowColors: true` w stemplu zestawu, żeby
 * statystyka liczyła tylko treningi wpisane tą metodą.
 */
export const ARROW_COLORS = [
  { id: 'green', hex: '#22A06B', text: '#ffffff' },
  { id: 'white', hex: '#ffffff', text: '#0a3a2a' },
  { id: 'black', hex: '#222222', text: '#ffffff' },
  { id: 'blue', hex: '#2F80ED', text: '#ffffff' },
  { id: 'red', hex: '#EB5757', text: '#ffffff' },
  { id: 'yellow', hex: '#F2C94C', text: '#0a3a2a' },
] as const;

export type ArrowColorId = typeof ARROW_COLORS[number]['id'];

/** Kolor strzały o danym miejscu w serii (0 = pierwsza). Poza zakresem → null. */
export const arrowColorAt = (index: number) => ARROW_COLORS[index] ?? null;
