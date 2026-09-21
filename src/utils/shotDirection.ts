import { centerFor } from './spread';

// Kierunek pojedynczej strzały względem środka — „7 na czwartej”.
//
// Dlaczego godzina, a nie strefa: spread.ts liczy to samo, ale uśrednione po
// całej grupie i spłaszczone do siatki 3×3 (left/right/center × up/down/center).
// Do treningu technicznego liczy się pojedyncza strzała, a siódemka na czwartej
// i na jedenastej to dwie różne wady — ta sama liczba punktów.
//
// Godzina, nie stopnie: przy wbijaniu palcem na telefonie stopnie udawałyby
// precyzję, której w danych nie ma.

export interface ShotDirection {
  /** 1–12; null gdy strzała praktycznie w środku i kierunek nic nie znaczy. */
  clock: number | null;
  /** Odległość od środka w jednostkach układu 300×300. */
  distance: number;
}

// Poniżej tego promienia kierunek jest szumem, nie sygnałem.
const DEAD_ZONE = 8;

export function shotDirection(targetType: string, x: number, y: number): ShotDirection {
  const { cX, cY } = centerFor(targetType, x, y);
  const dx = x - cX;
  // Ekranowe y rośnie w dół, zegarowe w górę — stąd odwrócenie.
  const dy = cY - y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance < DEAD_ZONE) return { clock: null, distance };

  // atan2 liczy od osi X przeciwnie do zegara; godzina 12 to góra i idzie
  // zgodnie z zegarem, stąd obrót o 90° i zmiana kierunku.
  let deg = 90 - (Math.atan2(dy, dx) * 180) / Math.PI;
  deg = ((deg % 360) + 360) % 360;
  // 30° na godzinę. Dokładne połówki (4:30, 7:30) idą zgodnie z zegarem —
  // Math.round zaokrągla .5 w górę, więc 4:30 → 5 i 7:30 → 8. Konsekwentne.
  const clock = (Math.round(deg / 30) % 12) || 12;
  return { clock, distance };
}
