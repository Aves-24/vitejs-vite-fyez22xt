// [C11] Generator service workera — uruchamiany po `vite build` (patrz package.json).
// Skanuje dist/, buduje listę precache i zapisuje dist/sw.js.
// Własny SW zamiast vite-plugin-pwa: wersja pluginu zgodna z Vite 2 (0.12.x)
// nie buduje się na współczesnym Node (workbox-build 6 — JSON.parse na pliku JS).
// 80 linii bez zależności > przypięty 4-letni plugin; przeżyje upgrade C16.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist', import.meta.url));

// Pliki do precache: app shell + assety. Fonty (woff2 3.9 MB) celowo POZA
// precache — instalacja SW zostaje lekka, font dociąga się do cache'u
// przy pierwszym użyciu (patrz handler /fonts/ w szablonie SW).
const PRECACHE_EXT = /\.(js|css|html|png|svg|json|webmanifest)$/;
const SKIP = /^(fonts[\\/]|sw\.js$)/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(DIST)
  .map((f) => relative(DIST, f).replace(/\\/g, '/'))
  .filter((f) => PRECACHE_EXT.test(f) && !SKIP.test(f))
  .sort();

const urls = files.map((f) => '/' + f);

// Wersja cache'u = hash zawartości wszystkich plików precache.
// Deploy bez zmian → ten sam hash → przeglądarka nie reinstaluje SW.
const hash = createHash('sha256');
for (const f of files) hash.update(readFileSync(join(DIST, f)));
const version = hash.digest('hex').slice(0, 12);

const sw = `/* GROT-X service worker — generowany przez scripts/generate-sw.mjs. NIE EDYTOWAĆ RĘCZNIE. */
const VERSION = '${version}';
const CACHE = 'grotx-' + VERSION;
const FONT_CACHE = 'grotx-fonts'; // wspólny między wersjami (3.9 MB woff2)
const PRECACHE = ${JSON.stringify(urls, null, 1)};

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('grotx-') && k !== CACHE && k !== FONT_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Tylko własny origin — Firestore/Auth/open-meteo idą prosto do sieci
  // (Firestore ma własny offline persistence w IndexedDB).
  if (url.origin !== self.location.origin) return;

  // Nawigacje (SPA): sieć najpierw (świeży index.html → nowy SW przy deployu),
  // ale z limitem 2.5 s — na wolnym łączu (pierwsze otwarcie dnia, słaby
  // zasięg na strzelnicy) app startuje z cache'u zamiast wisieć na fetchu.
  // Offline → index.html z cache'u.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cached = await caches.match('/index.html');
      if (!cached) return fetch(req); // pierwsza instalacja — nie ma fallbacku
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 2500);
        const res = await fetch(req, { signal: ctrl.signal });
        clearTimeout(t);
        return res;
      } catch {
        return cached;
      }
    })());
    return;
  }

  // Fonty: cache-first do trwałego cache'u (lazy fill przy pierwszym użyciu).
  if (url.pathname.startsWith('/fonts/')) {
    e.respondWith(
      caches.open(FONT_CACHE).then((c) =>
        c.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok) c.put(req, res.clone());
              return res;
            })
        )
      )
    );
    return;
  }

  // Reszta (assety z hashem w nazwie, ikony, legal): cache-first,
  // miss → sieć + dopisanie do cache'u bieżącej wersji.
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
`;

writeFileSync(join(DIST, 'sw.js'), sw);
console.log(`sw.js: ${urls.length} plikow w precache, wersja ${version}`);
