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

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const allFiles = walk(DIST)
  .map((f) => relative(DIST, f).replace(/\\/g, '/'))
  .sort();

// ── PRECACHE = SAM APP SHELL ────────────────────────────────────────────────
// [PERF] Wcześniej precache brał WSZYSTKIE .js/.css/.png/.html z dist — 28 plików,
// ~2,9 MB (pdf-vendor, html5-qrcode, html2canvas, każdy lazy widok, icon-512).
// `addAll()` ściągało to równolegle z uruchamianiem aplikacji i powtarzało się
// po KAŻDYM deployu (nowy hash wersji). Na słabym zasięgu na strzelnicy SW
// konkurował o pasmo z appką, którą miał przyspieszać.
//
// Teraz precache'ujemy tylko to, co realnie blokuje pierwszy render. Listę
// czytamy z wygenerowanego index.html — czyli dokładnie to, co Vite uznał za
// ścieżkę krytyczną (entry + modulepreload + stylesheet). Dzięki temu nie
// trzeba jej ręcznie aktualizować przy zmianie code splittingu.
//
// Reszta (lazy widoki, pdf-vendor, skaner QR, /legal/*) dociąga się przy
// pierwszym użyciu i wpada do tego samego cache'u — handler niżej jest
// cache-first, więc offline na strzelnicy działa tak samo jak wcześniej,
// o ile widok był raz otwarty.
const indexHtml = readFileSync(join(DIST, 'index.html'), 'utf8');
const shellFromHtml = [
  ...indexHtml.matchAll(/<script[^>]+src="(\/[^"]+)"/g),
  ...indexHtml.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="(\/[^"]+)"/g),
  ...indexHtml.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="(\/[^"]+)"/g),
].map((m) => m[1]);

const EXTRA_SHELL = ['/index.html', '/manifest.json', '/icon-192.png'];

const urls = [...new Set([...EXTRA_SHELL, ...shellFromHtml])]
  .filter((u) => allFiles.includes(u.slice(1)))
  .sort();

// Wersja cache'u = hash zawartości CAŁEGO dist (nie tylko shella) — deploy,
// który zmienia wyłącznie lazy widok, też musi unieważnić stary cache.
// Deploy bez zmian → ten sam hash → przeglądarka nie reinstaluje SW.
const hash = createHash('sha256');
for (const f of allFiles) hash.update(readFileSync(join(DIST, f)));
const version = hash.digest('hex').slice(0, 12);

const sw = `/* GROT-X service worker — generowany przez scripts/generate-sw.mjs. NIE EDYTOWAĆ RĘCZNIE. */
const VERSION = '${version}';
const CACHE = 'grotx-' + VERSION;
const FONT_CACHE = 'grotx-fonts'; // wspólny między wersjami
const PRECACHE = ${JSON.stringify(urls, null, 1)};

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

// Uwaga: BEZ skipWaiting()/clients.claim(). Nowy SW czeka, aż zniknie ostatnia
// karta obsługiwana przez starego, i dopiero wtedy aktywuje się i kasuje stary
// cache. Gdyby przejmował sterowanie w trakcie sesji, skasowałby chunki, z
// których korzysta AKTUALNIE otwarta strona (lazy widoki dociągane w locie) —
// a stare hashe nie istnieją już na Vercelu. Skutek: przy nawigacji cache-first
// nowa wersja dociera do użytkownika przy NASTĘPNYM uruchomieniu aplikacji.
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('grotx-') && k !== CACHE && k !== FONT_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Tylko własny origin — Firestore/Auth/open-meteo idą prosto do sieci
  // (Firestore ma własny offline persistence w IndexedDB).
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Nawigacja do PRAWDZIWEGO pliku (/legal/datenschutz.html, /legal/impressum.html)
    // — nie shell SPA. Te strony mają skutki prawne, więc zostaje przy nich
    // stare zachowanie: sieć najpierw, cache tylko jako fallback offline.
    if (/\\.[a-z0-9]+$/i.test(url.pathname)) {
      e.respondWith(fetch(req).catch(() => caches.match(req).then((hit) => hit || Response.error())));
      return;
    }

    // [PERF] Trasy SPA: stale-while-revalidate. Wcześniej było network-first
    // z limitem 2,5 s — czyli KAŻDY start aplikacji czekał na sieciowy
    // index.html, na słabym łączu pełne 2,5 s, mimo że wszystko leżało już
    // w cache. Teraz shell idzie z cache'u natychmiast, a świeży index.html
    // pobiera się w tle i wchodzi przy następnym uruchomieniu.
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match('/index.html');
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) cache.put('/index.html', res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        e.waitUntil(fresh); // odświeżenie nie blokuje odpowiedzi
        return cached;
      }
      // Pierwsza instalacja — nie ma jeszcze czego serwować z cache'u.
      return (await fresh) || Response.error();
    })());
    return;
  }

  // Fonty: cache-first do trwałego cache'u (lazy fill przy pierwszym użyciu).
  // Poza precache, bo Roboto-*.ttf (2 x 147 KB) potrzebuje tylko eksport PDF.
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
const bytes = urls.reduce((n, u) => n + statSync(join(DIST, u.slice(1))).size, 0);
console.log(
  `sw.js: ${urls.length} plikow w precache (${(bytes / 1024).toFixed(0)} KB), wersja ${version}`
);
