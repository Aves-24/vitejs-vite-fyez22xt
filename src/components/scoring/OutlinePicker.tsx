import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { AnimalOutline } from '../../config/animals/types';
import { loadAnimalOutlines, outlineName } from '../../config/animals/loadOutlines';

// [ANIMAL ROUND 2026-11-10] Obrys zwierzęcia (PRO). Paczka (~105 KB) ładuje się
// dopiero tutaj — strzelcy WA jej nie pobierają (decyzja usera).

const LICENSE_URL: Record<AnimalOutline['license'], string> = {
  'CC0-1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'PDM-1.0': 'https://creativecommons.org/publicdomain/mark/1.0/',
  'CC-BY-3.0': 'https://creativecommons.org/licenses/by/3.0/',
  'CC-BY-4.0': 'https://creativecommons.org/licenses/by/4.0/',
};

/** Sylwetka w ramce (viewBox wg szerokości obrysu, wysokość 300). */
export function OutlineSvg({ o, className = '' }: { o: AnimalOutline; className?: string }) {
  return (
    <svg viewBox={`0 0 ${o.w} 300`} className={className} role="img" aria-label={o.de}>
      <path d={o.d} fill="currentColor" />
    </svg>
  );
}

/** Obrys po id (ładuje paczkę przy pierwszym użyciu); null, dopóki nie ma. */
export function useOutline(id?: string | null): AnimalOutline | null {
  const [all, setAll] = useState<AnimalOutline[] | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    loadAnimalOutlines().then(a => { if (alive) setAll(a); }).catch(() => {});
    return () => { alive = false; };
  }, [id]);
  return id && all ? all.find(o => o.id === id) ?? null : null;
}

export default function OutlinePicker({ value, onPick, onClose }: {
  value?: string | null;
  onPick: (o: AnimalOutline | null) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [all, setAll] = useState<AnimalOutline[] | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState('');
  const [showLic, setShowLic] = useState(false);
  useEffect(() => {
    loadAnimalOutlines().then(setAll).catch(() => setError(true));
  }, []);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const arr = all || [];
    return s ? arr.filter(o => [o.de, o.en, o.pl].some(n => n.toLowerCase().includes(s))) : arr;
  }, [all, q]);

  return createPortal(
    <div className="fixed inset-0 z-[300] bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div role="dialog" aria-label={t('animal.outlineTitle')} className="bg-white w-full sm:max-w-lg max-h-[85dvh] rounded-t-3xl sm:rounded-3xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          <span className="flex-1 text-[14px] font-black text-[#0a3a2a]">{t('animal.outlineTitle')}</span>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center" aria-label={t('common.close', 'Schließen')}>
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div className="px-4 pb-2 flex gap-2">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('animal.outlineSearch')} aria-label={t('animal.outlineSearch')}
            className="flex-1 h-9 px-3 bg-gray-50 rounded-xl text-[13px] font-bold outline-none border border-gray-100" />
          {value && (
            <button onClick={() => onPick(null)} className="h-9 px-3 rounded-xl border border-gray-200 text-[11px] font-black text-gray-500">{t('animal.outlineNone')}</button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-2">
          {error && <p className="text-center text-[12px] font-bold text-gray-400 py-8">{t('animal.outlineOffline')}</p>}
          {!all && !error && <p className="text-center text-[12px] font-bold text-gray-400 py-8">…</p>}
          <div className="grid grid-cols-4 gap-1.5">
            {list.map(o => (
              <button key={o.id} onClick={() => onPick(o)} aria-pressed={value === o.id}
                className={`flex flex-col items-center gap-0.5 p-1.5 rounded-xl border active:scale-95 ${value === o.id ? 'border-[#0a3a2a] bg-emerald-50' : 'border-gray-100'}`}>
                <OutlineSvg o={o} className="w-full h-10 text-[#0a3a2a]" />
                <span className="text-[9px] font-bold text-gray-600 leading-tight text-center line-clamp-2">{outlineName(o, i18n.language)}</span>
              </button>
            ))}
          </div>
        </div>
        {/* Licencje (CC BY wymaga podpisu autora i linku do licencji). */}
        <div className="border-t border-gray-100 px-4 py-2">
          <button onClick={() => setShowLic(v => !v)} className="text-[10px] font-bold text-gray-400 underline" aria-expanded={showLic}>
            {t('animal.licenses')}
          </button>
          {showLic && all && (
            <div className="max-h-40 overflow-y-auto mt-1 text-[9px] text-gray-500 space-y-0.5" data-testid="outline-licenses">
              <p>{t('animal.licensesIntro')}</p>
              {all.map(o => (
                <p key={o.id}>
                  <a href={`https://www.phylopic.org/images/${o.phylopic}`} target="_blank" rel="noreferrer" className="underline">{o.de}</a>
                  {' — '}{o.license === 'CC0-1.0' || o.license === 'PDM-1.0' ? '' : `${o.author}, `}
                  <a href={LICENSE_URL[o.license]} target="_blank" rel="noreferrer" className="underline">{o.license.replace(/-/g, ' ')}</a>
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
