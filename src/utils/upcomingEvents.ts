import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

/** Ten sam klucz kasuje `CalendarView` po każdym zapisie i usunięciu terminu. */
const cacheKey = (userId: string) => `grotX_tournaments_${userId}`;
const TTL = 10 * 60 * 1000;

/**
 * Nadchodzące terminy usera (`users/{uid}/tournaments`, od dziś, rosnąco po
 * dacie) — wszystkie kategorie, filtruje wywołujący. Wspólna pamięć ekranu
 * głównego i pulpitu trenera: jeden odczyt na 10 minut zamiast osobnego
 * w każdym widoku.
 */
export async function loadUpcomingEvents(userId: string): Promise<any[]> {
  const key = cacheKey(userId);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const { data, expiresAt } = JSON.parse(raw);
      if (Date.now() <= expiresAt) return data;
      localStorage.removeItem(key);
    }
  } catch { /* uszkodzony wpis — czytamy z bazy */ }

  const today = new Date().toISOString().split('T')[0];
  const snap = await getDocs(query(
    collection(db, `users/${userId}/tournaments`),
    where('date', '>=', today),
    orderBy('date', 'asc')
  ));
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  try {
    localStorage.setItem(key, JSON.stringify({ data: all, expiresAt: Date.now() + TTL }));
  } catch { /* ignore */ }
  return all;
}
