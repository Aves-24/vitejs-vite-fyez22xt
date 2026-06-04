import { db } from '../firebase';
import { collection, doc, getDocs, updateDoc, getDoc } from 'firebase/firestore';

/**
 * Jednorazowa migracja modelu strzałów do nowego formatu (v1).
 * Uruchamiana automatycznie przy pierwszym otwarciu aplikacji.
 *
 * Nowy model:
 *   scoreArrows   — strzały z sesji liczone do średniej (z M)
 *   sessionArrows — fizyczne strzały z sesji (= scoreArrows)
 *   practiceArrows — strzały próbne
 *   arrows        — sessionArrows + practiceArrows (do liczników dziennych/mies./rocznych)
 */
export async function migrateArrowModel(userId: string): Promise<void> {
  const userRef = doc(db, 'users', userId);

  // Sprawdź czy migracja już była wykonana
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return;
  if (userSnap.data()?.migrations?.arrowModelV1) return;

  const sessionsRef = collection(db, `users/${userId}/sessions`);
  const snap = await getDocs(sessionsRef);

  const updates: Promise<void>[] = [];

  snap.forEach(docSnap => {
    const data = docSnap.data();

    // Pomiń sesje które już mają nowy model
    if (data.scoreArrows !== undefined) return;

    const sessionRef = doc(db, `users/${userId}/sessions`, docSnap.id);

    let sessionArrows: number;
    let scoreArrows: number;

    if (data.ends && Array.isArray(data.ends) && data.ends.length > 0) {
      // Mamy pełne dane strzałów — przelicz łącznie z M
      let count = 0;
      data.ends.forEach((end: any) => {
        const arrowList: string[] = end.arrows || [];
        arrowList.forEach((a: string) => { if (a && a.length > 0) count++; });
      });
      sessionArrows = count > 0 ? count : (data.arrows || data.totalArrows || 0);
      scoreArrows = sessionArrows;
    } else {
      // Brak danych szczegółowych — użyj istniejącego pola arrows jako best-effort
      sessionArrows = data.arrows || data.totalArrows || 0;
      scoreArrows = sessionArrows;
    }

    const practiceArrows: number = data.practiceArrows || 0;
    const totalArrows = sessionArrows + practiceArrows;

    updates.push(
      updateDoc(sessionRef, {
        scoreArrows,
        sessionArrows,
        arrows: totalArrows,
      })
    );
  });

  // Wykonaj wszystkie aktualizacje (max 500 na raz — Firestore limit)
  const BATCH = 400;
  for (let i = 0; i < updates.length; i += BATCH) {
    await Promise.all(updates.slice(i, i + BATCH));
  }

  // Oznacz migrację jako wykonaną
  await updateDoc(userRef, { 'migrations.arrowModelV1': true });
}
