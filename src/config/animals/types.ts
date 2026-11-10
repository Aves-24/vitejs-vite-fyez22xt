/** [ANIMAL ROUND] Obrys zwierzęcia (PhyloPic) — ścieżka w układzie wysokości 300. */
export interface AnimalOutline {
  id: string;
  de: string;
  en: string;
  pl: string;
  /** Szerokość obrysu przy wysokości 300 (viewBox `0 0 w 300`). */
  w: number;
  d: string;
  license: 'CC0-1.0' | 'PDM-1.0' | 'CC-BY-3.0' | 'CC-BY-4.0';
  author: string;
  /** UUID obrazka na PhyloPic (https://www.phylopic.org/images/<uuid>). */
  phylopic: string;
}
