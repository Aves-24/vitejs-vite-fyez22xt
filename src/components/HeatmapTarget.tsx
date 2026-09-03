import { useState, useEffect, useMemo } from 'react';
import { isFullFace as isFullFaceType, isSpotFace, isDoubleSpotFace } from '../config/targetFaces';

// ─────────────────────────────────────────────────────────────────────────────
// HEATMAPA ROZRZUTU — efekt kamery termowizyjnej + kontur dyspersji.
// Wyodrębnione z ProStatsView, by współdzielić z podglądem rundy w StatsView.
// ─────────────────────────────────────────────────────────────────────────────

const FF_RINGS = [
  { r: 150, label: '1'  }, { r: 135, label: '2'  },
  { r: 120, label: '3'  }, { r: 105, label: '4'  },
  { r: 90,  label: '5'  }, { r: 75,  label: '6'  },
  { r: 60,  label: '7'  }, { r: 45,  label: '8'  },
  { r: 30,  label: '9'  }, { r: 15,  label: '10' },
  { r: 7.5, label: 'X'  },
];
// 3-spot rings
const SPOT_RINGS = [
  { r: 62.5, label: '6'  }, { r: 50,   label: '7'  },
  { r: 37.5, label: '8'  }, { r: 25,   label: '9'  },
  { r: 12.5, label: '10' }, { r: 6.25, label: 'X'  },
];

function buildDispersionPath(dots: any[]): { mx: number; my: number; path: string } | null {
  if (dots.length < 2) return null;
  const mx = dots.reduce((s, d) => s + d.x, 0) / dots.length;
  const my = dots.reduce((s, d) => s + d.y, 0) / dots.length;
  const globalAvg = dots.reduce((s, d) => s + Math.sqrt((d.x - mx) ** 2 + (d.y - my) ** 2), 0) / dots.length;

  const N = 32;
  const sums = Array(N).fill(0);
  const counts = Array(N).fill(0);
  for (const dot of dots) {
    let ang = Math.atan2(dot.y - my, dot.x - mx);
    if (ang < 0) ang += 2 * Math.PI;
    const idx = Math.min(Math.floor((ang / (2 * Math.PI)) * N), N - 1);
    sums[idx] += Math.sqrt((dot.x - mx) ** 2 + (dot.y - my) ** 2);
    counts[idx]++;
  }

  const radii = sums.map((s, i) => counts[i] > 0 ? s / counts[i] : 0);
  for (let i = 0; i < N; i++) {
    if (radii[i] === 0) {
      let pi = -1, ni = -1;
      for (let j = 1; j <= N; j++) {
        if (pi < 0 && radii[(i - j + N) % N] > 0) pi = (i - j + N) % N;
        if (ni < 0 && radii[(i + j) % N] > 0) ni = (i + j) % N;
        if (pi >= 0 && ni >= 0) break;
      }
      if (pi >= 0 && ni >= 0) {
        const pd = (i - pi + N) % N, nd = (ni - i + N) % N, tot = pd + nd;
        radii[i] = (radii[pi] * nd + radii[ni] * pd) / tot;
      } else {
        radii[i] = globalAvg;
      }
    }
  }

  let sm = [...radii];
  for (let p = 0; p < 3; p++) {
    sm = sm.map((r, i) =>
      sm[(i - 2 + N) % N] * 0.1 + sm[(i - 1 + N) % N] * 0.2 + r * 0.4 +
      sm[(i + 1) % N] * 0.2 + sm[(i + 2) % N] * 0.1
    );
  }

  const pts = sm.map((r, i) => {
    const a = (i / N) * 2 * Math.PI - Math.PI / 2;
    return { x: mx + r * Math.cos(a), y: my + r * Math.sin(a) };
  });

  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const s0 = mid(pts[N - 1], pts[0]);
  let path = `M ${s0.x.toFixed(2)} ${s0.y.toFixed(2)}`;
  for (let i = 0; i < N; i++) {
    const e = mid(pts[i], pts[(i + 1) % N]);
    path += ` Q ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)} ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  }
  path += ' Z';
  return { mx, my, path };
}

function DispersionContour({ mx, my, path }: { mx: number; my: number; path: string }) {
  return (
    <g>
      <path d={path} fill="none" stroke="#0a3a2a" strokeWidth="3.5" strokeDasharray="6 3" opacity="0.6" />
      <path d={path} fill="none" stroke="#16a34a" strokeWidth="1.8" strokeDasharray="6 3" opacity="0.95" />
      <circle cx={mx} cy={my} r="7" fill="white" opacity="0.35" />
      <circle cx={mx} cy={my} r="5" fill="#0a3a2a" opacity="0.9" />
      <circle cx={mx} cy={my} r="3" fill="#16a34a" />
      <circle cx={mx} cy={my} r="1.2" fill="white" />
    </g>
  );
}

// Thermal palette — all alpha=255, black=no effect with screen blend mode
function thermalColor(t: number): [number, number, number] {
  if (t <= 0) return [0, 0, 0];
  const stops: [number, number, number, number][] = [
    [0.00,   0,   0,   0],
    [0.10,  30,   0,  80],
    [0.25,  80,   0, 180],
    [0.40,   0,  80, 255],
    [0.55,   0, 210, 230],
    [0.67,   0, 230,  50],
    [0.78, 230, 230,   0],
    [0.88, 255, 120,   0],
    [0.94, 255,  30,   0],
    [1.00, 255, 255, 255],
  ];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break; }
  }
  const f = (hi[0] - lo[0]) > 0 ? (t - lo[0]) / (hi[0] - lo[0]) : 0;
  return [
    Math.round(lo[1] + f * (hi[1] - lo[1])),
    Math.round(lo[2] + f * (hi[2] - lo[2])),
    Math.round(lo[3] + f * (hi[3] - lo[3])),
  ];
}

function useHeatmapDataURL(dots: any[], vbW: number, vbH: number): string {
  const [dataURL, setDataURL] = useState('');
  useEffect(() => {
    if (!dots.length) { setDataURL(''); return; }
    const SCALE = 0.5;
    const W = Math.round(vbW * SCALE);
    const H = Math.round(vbH * SCALE);
    // Tight kernel — only areas actually hit get coloured
    const sigma = 8 * SCALE;
    const twoSigmaSq = 2 * sigma * sigma;
    const range = Math.ceil(3 * sigma);
    const density = new Float32Array(W * H);
    for (const dot of dots) {
      const cx = Math.round(dot.x * SCALE);
      const cy = Math.round(dot.y * SCALE);
      for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
          const px = cx + dx, py = cy + dy;
          if (px >= 0 && px < W && py >= 0 && py < H) {
            density[py * W + px] += Math.exp(-(dx * dx + dy * dy) / twoSigmaSq);
          }
        }
      }
    }
    let maxD = 0;
    for (let i = 0; i < W * H; i++) if (density[i] > maxD) maxD = density[i];
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(W, H);
    const d = imgData.data;
    // Power curve: suppresses low-density areas, amplifies hot spots
    for (let i = 0; i < W * H; i++) {
      const raw = maxD > 0 ? density[i] / maxD : 0;
      const t = Math.min(Math.pow(raw, 0.55), 1);  // gamma < 1 → sharper hot/cold contrast
      const [r, g, b] = thermalColor(t);
      d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b;
      // Alpha: transparent where cold, opaque where hot — target always peeks through cold areas
      d[i * 4 + 3] = t < 0.05 ? 0 : Math.min(Math.round(t * 195), 195);
    }
    ctx.putImageData(imgData, 0, 0);
    setDataURL(canvas.toDataURL('image/png'));
  }, [dots, vbW, vbH]);
  return dataURL;
}

function MonochromeFullFace() {
  return (
    <g>
      {FF_RINGS.map((ring, i) => {
        const innerR = i + 1 < FF_RINGS.length ? FF_RINGS[i + 1].r : 0;
        const midR = (ring.r + innerR) / 2;
        const ringW = ring.r - innerR;
        const fs = Math.max(Math.min(ringW * 0.55, 9), 4);
        const fill = i % 2 === 0 ? '#f5f5f5' : '#e8e8e8';
        return (
          <g key={ring.label}>
            <circle cx="150" cy="150" r={ring.r} fill={fill} stroke="#aaa" strokeWidth="0.6" />
            {/* label at 3-o'clock and 9-o'clock */}
            <text x={150 + midR} y="150" fontSize={fs} fontWeight="bold" fill="#555" textAnchor="middle" dominantBaseline="middle">{ring.label}</text>
            <text x={150 - midR} y="150" fontSize={fs} fontWeight="bold" fill="#555" textAnchor="middle" dominantBaseline="middle">{ring.label}</text>
          </g>
        );
      })}
    </g>
  );
}

function MonochromeSpot({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      {SPOT_RINGS.map((ring, i) => {
        const innerR = i + 1 < SPOT_RINGS.length ? SPOT_RINGS[i + 1].r : 0;
        const midR = (ring.r + innerR) / 2;
        const ringW = ring.r - innerR;
        const fs = Math.max(Math.min(ringW * 0.55, 8), 3.5);
        const fill = i % 2 === 0 ? '#f5f5f5' : '#e8e8e8';
        return (
          <g key={`${cx}-${cy}-${ring.label}`}>
            <circle cx={cx} cy={cy} r={ring.r} fill={fill} stroke="#aaa" strokeWidth="0.5" />
            <text x={cx + midR} y={cy} fontSize={fs} fontWeight="bold" fill="#555" textAnchor="middle" dominantBaseline="middle">{ring.label}</text>
            <text x={cx - midR} y={cy} fontSize={fs} fontWeight="bold" fill="#555" textAnchor="middle" dominantBaseline="middle">{ring.label}</text>
          </g>
        );
      })}
    </g>
  );
}

export default function HeatmapTarget({ dots, targetType }: { dots: any[], targetType: string }) {
  const isFullFace = isFullFaceType(targetType);
  const is3Spot = isSpotFace(targetType);
  const vbW = 300, vbH = isFullFace ? 300 : 400;
  const heatURL = useHeatmapDataURL(dots, vbW, vbH);

  // CROSSFADE: trzymamy poprzednią klatkę pod spodem, nowa wjeżdża fade-inem
  // (ważne przy Play — przejścia między treningami są płynne, nie skokowe).
  const [frames, setFrames] = useState<{ url: string; key: number }[]>([]);
  useEffect(() => {
    if (!heatURL) { setFrames([]); return; }
    setFrames(prev => [...prev.slice(-1), { url: heatURL, key: Date.now() }]);
  }, [heatURL]);
  useEffect(() => {
    if (frames.length > 1) {
      const id = setTimeout(() => setFrames(p => p.slice(-1)), 850);
      return () => clearTimeout(id);
    }
  }, [frames]);

  // Dispersion contour — single for full face, per-spot for spot targets
  const dispersion = useMemo(() => {
    if (dots.length < 2) return null;

    if (!isFullFace) {
      // Spot targets: group dots by nearest spot centre, build one contour per spot
      const spotCenters: [number, number][] = isDoubleSpotFace(targetType)
        ? [[75,66],[75,200],[75,333],[225,66],[225,200],[225,333]]
        : [[150,66],[150,200],[150,333]]; // Vertical 3-Spot / other single-column spot

      const groups: any[][] = spotCenters.map(() => []);
      dots.forEach(dot => {
        let minDist = Infinity, nearest = 0;
        spotCenters.forEach(([cx, cy], i) => {
          const d = (dot.x - cx) ** 2 + (dot.y - cy) ** 2;
          if (d < minDist) { minDist = d; nearest = i; }
        });
        groups[nearest].push(dot);
      });

      const spots = groups
        .map(grp => buildDispersionPath(grp))
        .filter((r): r is { mx: number; my: number; path: string } => r !== null);

      return spots.length > 0 ? { type: 'spots' as const, spots } : null;
    }

    // Full-face single contour — unchanged logic
    const single = buildDispersionPath(dots);
    return single ? { type: 'single' as const, ...single } : null;
  }, [dots, isFullFace, targetType]);

  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} className="w-full h-auto max-h-[340px]">
      {/* MONOCHROME TARGET WITH NUMBERS */}
      {isFullFace ? (
        <MonochromeFullFace />
      ) : is3Spot && isDoubleSpotFace(targetType) ? (
        <g>
          <rect x="5"   y="0" width="140" height="400" fill="#f0f0f0" rx="8" stroke="#bbb" strokeWidth="1" />
          <rect x="155" y="0" width="140" height="400" fill="#f0f0f0" rx="8" stroke="#bbb" strokeWidth="1" />
          {[66, 200, 333].map(cy => <MonochromeSpot key={`l${cy}`} cx={75}  cy={cy} />)}
          {[66, 200, 333].map(cy => <MonochromeSpot key={`r${cy}`} cx={225} cy={cy} />)}
        </g>
      ) : (
        <g>
          <rect x="75" y="0" width="150" height="400" fill="#f0f0f0" rx="8" stroke="#bbb" strokeWidth="1" />
          {[66, 200, 333].map(cy => <MonochromeSpot key={cy} cx={150} cy={cy} />)}
        </g>
      )}

      {/* THERMAL HEATMAP — prawdziwy crossfade: stara klatka wygasza się
          (fade-out), nowa wjeżdża fade-inem; oba po 0.8s, ease-in-out */}
      <style>{`
        @keyframes gxHeatFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes gxHeatFadeOut { from { opacity: 1; } to { opacity: 0; } }
      `}</style>
      {frames.map((f, i) => {
        const isCurrent = i === frames.length - 1;
        const anim = frames.length > 1
          ? (isCurrent ? 'gxHeatFadeIn 0.8s ease-in-out forwards' : 'gxHeatFadeOut 0.8s ease-in-out forwards')
          : undefined;
        return (
          <image key={f.key} href={f.url} x="0" y="0" width={vbW} height={vbH}
            style={{ imageRendering: 'auto', animation: anim }} />
        );
      })}

      {/* DISPERSION CONTOUR — single for full face, per-spot for spot targets;
          keyed by path so each change fades in alongside the heat layer */}
      {dispersion?.type === 'single' && (
        <g key={dispersion.path} style={{ animation: 'gxHeatFadeIn 0.8s ease-in-out' }}>
          <DispersionContour mx={dispersion.mx} my={dispersion.my} path={dispersion.path} />
        </g>
      )}
      {dispersion?.type === 'spots' && (
        <g key={dispersion.spots.map(s => s.path).join('|')} style={{ animation: 'gxHeatFadeIn 0.8s ease-in-out' }}>
          {dispersion.spots.map((s, i) => (
            <DispersionContour key={i} mx={s.mx} my={s.my} path={s.path} />
          ))}
        </g>
      )}
    </svg>
  );
}
