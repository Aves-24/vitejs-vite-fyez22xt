// [PERF/i18n] Zapadka dla dynamicznego ładowania tłumaczeń.
//
// src/i18n.ts pobiera TYLKO paczkę języka, którego user używa. To działa, bo
// pl i de mają komplet kluczy z en — fallbackLng: 'en' nigdy nie musi sięgnąć
// po paczkę, której nie ma w pamięci. Ten skrypt tego pilnuje: jeśli ktoś doda
// klucz wyłącznie do en, build padnie, zamiast pokazać surowy klucz
// (np. "stats.newThing") polskiemu albo niemieckiemu użytkownikowi.
//
// Pliki locales/*.ts to czyste obiekty danych bez importów i adnotacji typów,
// wiec wystarczy zdjac 'export ' i odpalic je jako modul — bez transpilera.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LANGS = ['pl', 'en', 'de'];
const BASE = 'en'; // fallbackLng w src/i18n.ts

async function load(lang) {
  const src = readFileSync(join(ROOT, 'src', 'locales', `${lang}.ts`), 'utf8');
  if (/^\s*import\s/m.test(src)) {
    throw new Error(`locales/${lang}.ts ma importy — ten prosty loader ich nie obsluzy.`);
  }
  const body = src.replace(/^export\s+const\s/gm, 'const ') + '\n;return { views, components };';
  return new Function(body)();
}

function flatten(obj, prefix = '', out = []) {
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) flatten(val, `${prefix}${key}.`, out);
    else out.push(prefix + key);
  }
  return out;
}

const keys = {};
for (const lang of LANGS) {
  const { views, components } = await load(lang);
  keys[lang] = new Set([...flatten(views), ...flatten(components)]);
}

let failed = false;
for (const lang of LANGS.filter((l) => l !== BASE)) {
  const missing = [...keys[BASE]].filter((k) => !keys[lang].has(k)).sort();
  if (missing.length) {
    failed = true;
    console.error(
      `\nBLAD: klucze obecne w ${BASE}, brakujace w ${lang} (${missing.length}):\n  ` +
      missing.slice(0, 40).join('\n  ') +
      (missing.length > 40 ? `\n  ...i ${missing.length - 40} wiecej` : '')
    );
  }
}

if (failed) {
  console.error(
    '\nTlumaczenia sa ladowane per-jezyk (src/i18n.ts), wiec brakujacy klucz ' +
    'wyswietli sie userowi jako surowy identyfikator zamiast tekstu.\n' +
    'Uzupelnij brakujace klucze w src/locales/.\n'
  );
  process.exit(1);
}

console.log(
  `i18n-parity: OK — ${keys[BASE].size} kluczy w ${BASE}, ` +
  LANGS.filter((l) => l !== BASE).map((l) => `${l}=${keys[l].size}`).join(', ') + '.'
);
