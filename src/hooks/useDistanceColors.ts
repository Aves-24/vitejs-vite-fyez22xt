import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserDistance, distanceColorMap } from '../config/distances';
import { EquipmentSetup } from '../config/equipmentSetups';

export interface DistanceCatalog {
  distances: UserDistance[];
  setups: EquipmentSetup[];
  /** Płaskie `bowType` — dyscyplina kont sprzed zestawów. */
  bowType: string | null;
  /** `distanceId` → hex koloru zestawu (patrz `distanceColorMap`). */
  colors: Map<string, string>;
}

const EMPTY: DistanceCatalog = { distances: [], setups: [], bowType: null, colors: new Map() };

/**
 * Lista dystansów i zestawy właściciela `userId` — u trenera ucznia, więc
 * nazwy i kolory są jego, nie trenera. Jeden odczyt `users/{uid}` na wejście
 * w widok; błąd (brak dostępu, offline) daje pusty katalog, a nie wywrócony
 * ekran.
 */
export function useDistanceCatalog(userId: string): DistanceCatalog {
  const [catalog, setCatalog] = useState<DistanceCatalog>(EMPTY);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    getDoc(doc(db, 'users', userId))
      .then(snap => {
        if (!alive) return;
        const data = snap.data();
        const distances: UserDistance[] = Array.isArray(data?.userDistances) ? data.userDistances : [];
        const setups: EquipmentSetup[] = Array.isArray(data?.setups) ? data.setups : [];
        setCatalog({
          distances,
          setups,
          bowType: data?.bowType ?? null,
          colors: distanceColorMap(distances, setups),
        });
      })
      .catch(() => { if (alive) setCatalog(EMPTY); });
    return () => { alive = false; };
  }, [userId]);

  return catalog;
}

/** [KOLORY] Same kolory zestawów dla kubełków statystyk. */
export function useDistanceColors(userId: string): Map<string, string> {
  return useDistanceCatalog(userId).colors;
}
