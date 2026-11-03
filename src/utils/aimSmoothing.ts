/**
 * [STABILIZACJA] Wygładzanie krzyżyka (user 2026-11-03: „celownik drga”,
 * potem „widać skoki”). Filtr One Euro (Casiez i in., 2012) w pikselach ekranu:
 * gdy palec stoi, odcięcie jest niskie i drżenie znika; im szybszy ruch, tym
 * wyższe odcięcie i mniejsze opóźnienie. Bez progów i przeskoków — krzyżyk
 * jedzie płynnie. Wołany co klatkę, więc po zatrzymaniu palca dojeżdża do niego.
 */
export interface Pt { x: number; y: number }

const MIN_CUTOFF = 0.3; // Hz — przy staniu palca (dobrane symulacją drżenia 10 Hz)
const BETA = 0.01;      // przyrost odcięcia na każdy px/s prędkości
const D_CUTOFF = 1.0;   // Hz — wygładzanie samej prędkości

const alpha = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export interface AimFilter { x: Pt; dx: Pt; t: number }

export function startAim(p: Pt, t: number): AimFilter {
  return { x: { ...p }, dx: { x: 0, y: 0 }, t };
}

/** Przesuwa filtr do chwili t w stronę surowego punktu raw. */
export function stepAim(f: AimFilter, raw: Pt, t: number): AimFilter {
  const dt = Math.max(1, t - f.t) / 1000;
  const ad = alpha(D_CUTOFF, dt);
  const vx = (raw.x - f.x.x) / dt, vy = (raw.y - f.x.y) / dt;
  const dx = { x: f.dx.x + ad * (vx - f.dx.x), y: f.dx.y + ad * (vy - f.dx.y) };
  const a = alpha(MIN_CUTOFF + BETA * Math.hypot(dx.x, dx.y), dt);
  return { x: { x: f.x.x + a * (raw.x - f.x.x), y: f.x.y + a * (raw.y - f.x.y) }, dx, t };
}
