// Potrace SVG (PhyloPic) → jedna ścieżka w układzie wysokości 300, liczby całkowite, ruchy względne liczone z zaokrąglonych pozycji bezwzględnych (bez dryfu).
const fs = require('fs');
const P = process.argv[2], OUT = process.argv[3];
const sel = JSON.parse(fs.readFileSync(P + '/selected.json', 'utf8'));
const NAMES = JSON.parse(fs.readFileSync(P + '/names.json', 'utf8'));

const r1 = v => Math.round(v);
const fmt = v => { const s = String(Math.round(v)); return s === "-0" ? "0" : s; };

function convert(svg) {
  const vb = svg.match(/viewBox="([\d. ]+)"/)[1].split(/\s+/).map(Number);
  const [, , W, H] = vb;
  const tr = svg.match(/<g transform="translate\(([-\d.]+),([-\d.]+)\) scale\(([-\d.]+),([-\d.]+)\)"/);
  const tx = +tr[1], ty = +tr[2], sx = +tr[3], sy = +tr[4];
  const s = 300 / H;
  const map = (x, y) => [(tx + sx * x) * s, (ty + sy * y) * s];
  const paths = [...svg.matchAll(/<path d="([^"]+)"/g)].map(m => m[1]);
  let out = '';
  let cur = [0, 0], start = [0, 0];               // dokładne (w układzie źródła)
  let emitted = [0, 0];                           // zaokrąglona pozycja (wynik)
  for (const d of paths) {
    const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g);
    let i = 0, cmd = '';
    while (i < toks.length) {
      if (/[a-zA-Z]/.test(toks[i])) { cmd = toks[i++]; if (cmd === 'z' || cmd === 'Z') { out += 'z'; cur = start.slice(); emitted = [r1(map(...cur)[0]), r1(map(...cur)[1])]; continue; } }
      const rel = cmd === cmd.toLowerCase();
      const C = cmd.toLowerCase();
      const n = C === 'c' ? 3 : 1;
      const pts = [];
      for (let k = 0; k < n; k++) { const x = +toks[i++], y = +toks[i++]; pts.push(rel ? [cur[0] + x, cur[1] + y] : [x, y]); }
      const base = emitted.slice();
      const rp = pts.map(p => { const [X, Y] = map(...p); return [r1(X), r1(Y)]; });
      if (C === 'm') {
        out += 'M' + fmt(rp[0][0]) + ' ' + fmt(rp[0][1]);
        start = pts[0];
        if (cmd === 'm' || cmd === 'M') cmd = rel ? 'l' : 'L'; // kolejne pary = linie
      } else {
        out += (C === 'c' ? 'c' : 'l') + rp.map(q => fmt(q[0] - base[0]) + ' ' + fmt(q[1] - base[1])).join(' ').replace(/ -/g, '-');
      }
      cur = pts[pts.length - 1];
      emitted = rp[rp.length - 1];
    }
  }
  out = out.replace(/ -/g, '-');
  return { w: Math.round(W * s), d: out };
}

const items = sel.map(x => {
  const svg = fs.readFileSync(P + '/vec/' + x.id + '.svg', 'utf8');
  const { w, d } = convert(svg);
  const nm = NAMES[x.name];
  if (!nm) throw new Error('brak nazwy ' + x.name);
  const lic = /zero/.test(x.license) ? 'CC0-1.0' : /mark/.test(x.license) ? 'PDM-1.0' : /by\/4/.test(x.license) ? 'CC-BY-4.0' : 'CC-BY-3.0';
  return { id: nm.id, de: x.name, en: nm.en, pl: nm.pl, w, d, license: lic, author: x.attribution, phylopic: x.id };
});
const ids = new Set(); items.forEach(i => { if (ids.has(i.id)) throw new Error('dup ' + i.id); ids.add(i.id); });

fs.writeFileSync(OUT, JSON.stringify({ source: "https://www.phylopic.org", generated: "2026-11-10", height: 300, outlines: items }));
console.log("zapisano", items.length, "KB", Math.round(fs.statSync(OUT).size / 1024));
