import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';

// [TERMINE MONAT 2026-11-13] Starty podopiecznych w zakresie dat (miesiąc w siatce
// trenera). Zapytanie na ucznia; ci sami zawody (data + nazwa) → jeden wpis z imionami.
// Wynik leży w pamięci (moduł) na czas sesji — przełączanie miesięcy nie czyta drugi raz.
export interface StudentStart { title: string; date: string; ids: string[]; names: string[] }
interface StudentLite { id: string; firstName?: string; lastName?: string }

const memo = new Map<string, { at: number; data: StudentStart[] }>();
const TTL = 30 * 60 * 1000;

export const studentShortName = (s: StudentLite) =>
  `${s.firstName || ''} ${s.lastName ? s.lastName[0] + '.' : ''}`.trim();

export async function loadStudentStartsInRange(students: StudentLite[], from: string, to: string): Promise<StudentStart[]> {
  const key = `${students.map(s => s.id).sort().join(',')}|${from}|${to}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  const found = await Promise.all(students.map(async s => {
    try {
      const snap = await getDocs(query(
        collection(db, `users/${s.id}/tournaments`),
        where('date', '>=', from),
        where('date', '<', to),
        orderBy('date', 'asc'),
      ));
      return snap.docs
        .map(d => d.data())
        // Stare terminy bez kategorii liczą się jako zawody (jak w kalendarzu ucznia).
        .filter(e => e.category === 'Turniej' || !e.category)
        .map(e => ({ s, title: String(e.title || ''), date: String(e.date) }));
    } catch { return []; }
  }));

  const groups = new Map<string, StudentStart>();
  for (const h of found.flat()) {
    const k = `${h.date}|${h.title.trim().toLowerCase()}`;
    const g = groups.get(k);
    if (g) { if (!g.ids.includes(h.s.id)) { g.ids.push(h.s.id); g.names.push(studentShortName(h.s)); } }
    else groups.set(k, { title: h.title, date: h.date, ids: [h.s.id], names: [studentShortName(h.s)] });
  }
  const data = [...groups.values()].sort((a, b) => a.date.localeCompare(b.date));
  memo.set(key, { at: Date.now(), data });
  return data;
}
