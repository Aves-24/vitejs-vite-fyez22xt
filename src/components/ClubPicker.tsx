import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface ClubPickerProps {
  value: string;
  onChange: (v: string) => void;
  availableClubs: string[];
  citySelected: boolean;
  placeholder?: string;
}

export default function ClubPicker({ value, onChange, availableClubs, citySelected, placeholder = 'np. SFT 1926' }: ClubPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync query when value changes externally
  useEffect(() => { setQuery(value); }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = availableClubs.filter(c => c.toLowerCase().includes(query.toLowerCase()));
  const isNewClub = query.trim() !== '' && !availableClubs.some(c => c.toLowerCase() === query.trim().toLowerCase());
  const isExactMatch = availableClubs.some(c => c.toLowerCase() === query.trim().toLowerCase());

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    onChange(v);
    setOpen(true);
  };

  const handleSelect = (name: string) => {
    setQuery(name);
    onChange(name);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={() => setOpen(true)}
          placeholder={!citySelected ? 'Najpierw wybierz miasto' : placeholder}
          disabled={!citySelected}
          className={`w-full bg-gray-50 border rounded-xl p-3 text-sm font-bold text-[#333] outline-none transition-all pr-9 ${
            !citySelected
              ? 'opacity-40 cursor-not-allowed border-gray-100'
              : isExactMatch
                ? 'border-emerald-400 bg-emerald-50/30'
                : isNewClub
                  ? 'border-orange-300 bg-orange-50/30'
                  : 'border-gray-200 focus:border-emerald-500'
          }`}
        />
        {/* Status icon */}
        {citySelected && query.trim() !== '' && (
          <span className={`absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[18px] ${
            isExactMatch ? 'text-emerald-500' : 'text-orange-400'
          }`}>
            {isExactMatch ? 'check_circle' : 'warning'}
          </span>
        )}
      </div>

      {/* Dropdown */}
      {open && citySelected && (
        <div className="absolute z-[500] w-full mt-1 bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
          {filtered.length > 0 ? (
            filtered.map(name => (
              <button
                key={name}
                type="button"
                onMouseDown={() => handleSelect(name)}
                className="w-full text-left px-4 py-3 text-sm font-bold text-[#0a3a2a] hover:bg-emerald-50 border-b border-gray-50 last:border-0 transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-emerald-500 text-[16px]">corporate_fare</span>
                {name}
              </button>
            ))
          ) : (
            availableClubs.length > 0 && (
              <div className="px-4 py-3 text-[11px] font-bold text-gray-400">{t('common.noClubsFound', 'Brak pasujących klubów')}</div>
            )
          )}
        </div>
      )}

      {/* Warning — nowy klub */}
      {citySelected && isNewClub && availableClubs.length > 0 && (
        <div className="mt-1.5 flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
          <span className="material-symbols-outlined text-orange-500 text-[16px] shrink-0 mt-0.5">warning</span>
          <p className="text-[10px] font-bold text-orange-700 leading-snug">
            {t('common.clubNameWarning', 'Tej nazwy nie ma w bazie. Podaj nazwę klubu jak najdokładniej, aby mogła zostać poprawnie dodana i żeby inni członkowie nie wpisali tego samego klubu pod inną nazwą.')}
          </p>
        </div>
      )}

      {/* Info — pierwszy klub w mieście */}
      {citySelected && isNewClub && availableClubs.length === 0 && query.trim() !== '' && (
        <div className="mt-1.5 flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
          <span className="material-symbols-outlined text-blue-500 text-[16px] shrink-0 mt-0.5">info</span>
          <p className="text-[10px] font-bold text-blue-700 leading-snug">
            {t('common.firstClubInCity', 'Jesteś pierwszą osobą z tego miasta/klubu — zostanie dodany do bazy. Wpisz nazwę klubu jak najdokładniej, żeby inni członkowie nie dodali tego samego klubu pod inną nazwą.')}
          </p>
        </div>
      )}

      {/* Klub wybrany z listy */}
      {isExactMatch && (
        <div className="mt-1.5 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
          <span className="material-symbols-outlined text-emerald-500 text-[16px] shrink-0">check_circle</span>
          <p className="text-[10px] font-bold text-emerald-700 leading-snug">Klub znaleziony w bazie ✓</p>
        </div>
      )}
    </div>
  );
}
