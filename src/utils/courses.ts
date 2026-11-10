import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { settleWrite } from './offlineWrite';

/**
 * [ANIMAL ROUND 2026-11-10] Zapisane trasy (parcours) — `users/{uid}/courses`.
 *
 * Zwierzęta na stałej trasie klubowej zwykle stoją w tym samym miejscu przez
 * sezon, więc trasę zapisuje się raz (nazwa + stanowiska), a przy kolejnym
 * wyjściu nazwy wypełniają się same. Zmiana na trasie (wymienione zwierzę)
 * → „tylko dziś” albo „zapisz w trasie”. FREE: 1 trasa, PRO: bez limitu
 * (decyzja usera, jak zestawy sprzętu). Gość trasy nie zapisuje (dane gościa
 * znikają po 24 h).
 */
export interface CourseStation { name: string; outlineId?: string }
export interface Course { id: string; name: string; stations: CourseStation[]; createdAt: number; updatedAt: number }

export const FREE_COURSES = 1;
export const MAX_STATIONS = 60;

const col = (uid: string) => collection(db, `users/${uid}/courses`);

export async function listCourses(uid: string): Promise<Course[]> {
  const snap = await getDocs(col(uid));
  return snap.docs
    .map(d => ({ id: d.id, ...(d.data() as Omit<Course, 'id'>) }))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/** Stanowiska z serii rundy: nazwa i obrys (puste nazwy zostają puste). */
export function stationsFromEnds(ends: { animal?: string; outlineId?: string }[]): CourseStation[] {
  return ends.slice(0, MAX_STATIONS).map(e => ({
    name: (e.animal || '').slice(0, 40),
    ...(e.outlineId ? { outlineId: e.outlineId } : {}),
  }));
}

/** Zapis (nowa trasa bez `id`). Zwraca id trasy. Offline: trafia do telefonu i wyśle się sam. */
export async function saveCourse(uid: string, c: { id?: string; name: string; stations: CourseStation[]; createdAt?: number }): Promise<string> {
  const ref = c.id ? doc(col(uid), c.id) : doc(col(uid));
  const now = Date.now();
  await settleWrite(setDoc(ref, {
    name: c.name.trim().slice(0, 60),
    stations: c.stations.slice(0, MAX_STATIONS),
    createdAt: c.createdAt || now,
    updatedAt: now,
  }));
  return ref.id;
}

export const deleteCourse = (uid: string, id: string) => settleWrite(deleteDoc(doc(col(uid), id)));

/** Czy wolno dodać kolejną trasę (FREE 1, PRO bez limitu). */
export const canAddCourse = (count: number, isPro: boolean) => isPro || count < FREE_COURSES;

/** Trasa wybrana w Vorbereitung — ekran treningu czyta ją przy starcie rundy. */
export const selectedCourseKey = (uid: string) => `grotX_animalCourse_${uid}`;
