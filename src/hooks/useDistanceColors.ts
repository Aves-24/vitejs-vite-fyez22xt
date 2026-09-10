import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { distanceColorMap } from '../config/distances';

/**
 * [KOLORY] Kolory zestawów dla kubełków statystyk właściciela `userId`.
 *
 * `userId` to osoba, której statystyki oglądamy — u trenera uczeń, więc kolory
 * są jego, nie trenera. Jeden odczyt `users/{uid}` na wejście w widok; błąd
 * (brak dostępu, offline) daje pustą mapę, czyli statystyki bez kropek, a nie
 * wywrócony ekran.
 */
export function useDistanceColors(userId: string): Map<string, string> {
  const [colors, setColors] = useState<Map<string, string>>(() => new Map());

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    getDoc(doc(db, 'users', userId))
      .then(snap => {
        if (!alive) return;
        const data = snap.data();
        setColors(distanceColorMap(data?.userDistances, data?.setups));
      })
      .catch(() => { if (alive) setColors(new Map()); });
    return () => { alive = false; };
  }, [userId]);

  return colors;
}
