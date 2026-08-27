// [PERF] Subset fontu Material Symbols — 3,95 MB -> ~83 KB.
//
// Pelny font wariantowy Google zawiera ~4300 ikon i 4 osie zmienne. Aplikacja
// uzywa ~200 ikon. Font byl w <link rel="preload">, wiec na starcie szedl
// z najwyzszym priorytetem i zaglodzil cala reszte polaczenia (596-bajtowy
// theme-init.js pobieral sie 1,35 s). Na slabym zasiegu na strzelnicy to byl
// glowny koszt uruchomienia aplikacji.
//
// RODO: subset jest pobierany z Google TYLKO tutaj, przy recznym uruchomieniu
// przez developera (`npm run icons:update`). Wynikowy plik lezy w public/fonts/
// i jest serwowany z wlasnego origin — IP uzytkownika nadal nigdy nie trafia
// do Google (wyrok LG Munchen I, 3 O 17493/20). Patrz @font-face w tailwind.css.
//
// Tryby:
//   node scripts/icon-font.mjs --update  -> pobiera nowy subset + manifest (wymaga sieci)
//   node scripts/icon-font.mjs --check   -> [w buildzie] weryfikuje, ze zadna
//                                           uzywana ikona nie wypadla z fontu
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'src');
const FONT = join(ROOT, 'public', 'fonts', 'material-symbols-outlined.woff2');
const MANIFEST = join(ROOT, 'scripts', 'icon-font.manifest.json');

// Osie fontu. FILL i GRAD przypiete na 0 (kod nigdzie nie ustawia
// font-variation-settings, wiec uzywana jest tylko wartosc domyslna).
// wght 100..700 ZOSTAJE jako os zmienna — ikony maja klasy Tailwinda
// `font-bold` / `font-black`, ktore realnie zmieniaja grubosc glifu.
const AXES = 'opsz,wght,FILL,GRAD@20..48,100..700,0,0';
const CODEPOINTS_URL =
  'https://raw.githubusercontent.com/google/material-design-icons/master/variablefont/' +
  'MaterialSymbolsOutlined%5BFILL%2CGRAD%2Copsz%2Cwght%5D.codepoints';

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

// Zbiera nazwy ikon uzywanych w kodzie. Celowo NADMIAROWO — falszywie dodana
// nazwa kosztuje ~200 bajtow w foncie, a pominieta = ikona znika z UI.
//   1) dzieci JSX spanow .material-symbols-outlined (statyczne i w ternary),
//   2) KAZDY literal stringowy w src, ktory jest prawidlowa nazwa ikony —
//      lapie ikony podawane posrednio (`{tab.icon}`, `{cfg.icon}`, tablice configu).
// `official` = zbior prawdziwych nazw; filtruje szum z punktu 2.
function collectIcons(official) {
  const found = new Set();
  for (const file of walk(SRC)) {
    const s = readFileSync(file, 'utf8');
    for (const span of s.matchAll(/material-symbols-outlined[\s\S]{0,300}?>([\s\S]{0,200}?)<\//g)) {
      const bare = span[1].trim();
      if (/^[a-z][a-z0-9_]*$/.test(bare) && official.has(bare)) found.add(bare);
      for (const lit of span[1].matchAll(/['"]([a-z][a-z0-9_]*)['"]/g)) {
        if (official.has(lit[1])) found.add(lit[1]);
      }
    }
    for (const lit of s.matchAll(/['"`]([a-z][a-z0-9_]{1,40})['"`]/g)) {
      if (official.has(lit[1])) found.add(lit[1]);
    }
  }
  return [...found].sort();
}

async function update() {
  process.stdout.write('Pobieram liste nazw Material Symbols... ');
  const cpRes = await fetch(CODEPOINTS_URL);
  if (!cpRes.ok) throw new Error(`codepoints: HTTP ${cpRes.status}`);
  const official = new Set(
    (await cpRes.text()).split('\n').map((l) => l.split(' ')[0]).filter(Boolean)
  );
  console.log(`${official.size} nazw`);

  const icons = collectIcons(official);
  console.log(`Ikon uzywanych w src: ${icons.length}`);

  // css2 zwraca woff2 tylko dla nowoczesnego UA — inaczej dostajemy ttf.
  const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const cssUrl =
    'https://fonts.googleapis.com/css2?family=' +
    encodeURIComponent('Material Symbols Outlined:' + AXES) +
    '&icon_names=' + icons.join(',');
  const cssRes = await fetch(cssUrl, { headers: { 'User-Agent': UA } });
  if (!cssRes.ok) throw new Error(`css2: HTTP ${cssRes.status}`);
  const css = await cssRes.text();

  const m = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)\s*format\('woff2'\)/);
  if (!m) throw new Error('Brak URL-a woff2 w odpowiedzi css2:\n' + css.slice(0, 500));
  if (!/font-weight:\s*100\s+700/.test(css)) {
    throw new Error('Subset stracil zmienna os wght — ikony `font-bold` wygladalyby inaczej.');
  }

  const woff2 = Buffer.from(await (await fetch(m[1])).arrayBuffer());
  if (woff2.subarray(0, 4).toString('latin1') !== 'wOF2') throw new Error('To nie jest woff2.');

  writeFileSync(FONT, woff2);
  writeFileSync(MANIFEST, JSON.stringify({ axes: AXES, icons }, null, 1) + '\n');
  console.log(`Zapisano ${FONT} — ${(woff2.length / 1024).toFixed(1)} KB, ${icons.length} ikon.`);
}

function check() {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const inFont = new Set(manifest.icons);
  // Do sprawdzenia uzywamy manifestu jako listy "oficjalnych" nazw — nie mamy
  // (i nie chcemy miec) sieci w buildzie. Skanujemy wiec spany po nazwie
  // dowolnej i porownujemy z zawartoscia fontu.
  const used = new Set();
  for (const file of walk(SRC)) {
    const s = readFileSync(file, 'utf8');
    for (const span of s.matchAll(/material-symbols-outlined[\s\S]{0,300}?>([\s\S]{0,200}?)<\//g)) {
      const bare = span[1].trim();
      if (/^[a-z][a-z0-9_]*$/.test(bare)) used.add(bare);
      for (const lit of span[1].matchAll(/['"]([a-z][a-z0-9_]*)['"]/g)) used.add(lit[1]);
    }
  }
  // `loading` nie jest nazwa Material Symbols i nigdy nia nie byla — renderuje
  // sie jako tekst tak samo w pelnym foncie i w subsetcie (StatsView.tsx).
  const KNOWN_NOT_ICONS = new Set(['loading', 'saved']);
  const missing = [...used].filter((n) => !inFont.has(n) && !KNOWN_NOT_ICONS.has(n));

  if (missing.length) {
    console.error(
      '\nBLAD: ikony uzywane w kodzie, ktorych NIE MA w subsetcie fontu:\n  ' +
      missing.join(', ') +
      '\n\nUruchom `npm run icons:update` i zacommituj nowy public/fonts/*.woff2.\n'
    );
    process.exit(1);
  }
  console.log(`icon-font: OK — ${used.size} ikon w kodzie, wszystkie sa w foncie.`);
}

if (process.argv.includes('--update')) await update();
else check();
