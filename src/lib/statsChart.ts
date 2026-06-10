// Wspólne helpery wykresów statystyk (QuickStats / ProStats)

// Kolor słupka wg udziału w maksimum (czerwony → ciemnozielony)
export function getScaleColor(value: number, max: number): string {
  const ratio = max > 0 ? value / max : 0;
  if (ratio <= 0.1) return '#dc2626';
  if (ratio <= 0.3) return '#f97316';
  if (ratio <= 0.5) return '#facc15';
  if (ratio <= 0.7) return '#84cc16';
  if (ratio <= 0.9) return '#22c55e';
  return '#065f46';
}

// Etykieta tygodnia jako numer tygodnia kalendarzowego (ISO-8601), np. "KW 23".
// i: indeks 0..11 (11 = bieżący tydzień, 0 = 11 tygodni temu).
export function getWeekLabelKW(i: number): string {
  const weeksAgo = 11 - i;
  const d = new Date();
  d.setDate(d.getDate() - weeksAgo * 7);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff); // poniedziałek danego tygodnia
  // Numer tygodnia ISO: czwartek tego tygodnia decyduje o roku
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `KW ${week}`;
}
