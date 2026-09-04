import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BowType } from '../../config/archeryRules';
import {
  EquipmentSetup,
  SetupSubtab,
  SETUP_SUBTABS,
  SETUP_NOTE_MAX,
  setupLimitFor,
  DEFAULT_SETUP_ID,
} from '../../config/equipmentSetups';

/**
 * [ZESTAWY] Zakładka SPRZĘT — etap 2.
 *
 * Zastępuje dawne ŁUK i STRZAŁY. Sprzęt należy teraz do ZESTAWU, nie do
 * użytkownika, więc kto strzela z dwóch łuków, przestaje sobie nadpisywać
 * ustawienia.
 *
 * Dyscyplina siedzi na poziomie zestawu, NAD podzakładkami — nie w ŁUKU.
 * Powód: dmuchawka (etap 4) nie ma łuku, cięciwy ani stabilizacji, więc
 * dyscyplina nie może mieszkać w zakładce, która dla niej zniknie.
 *
 * Trzech poziomów pól (Podstawa / Strojenie / Szczegóły) tu jeszcze NIE ma —
 * przy 1–3 polach na podzakładkę zwijanie byłoby udawaniem porządku.
 * Wchodzą razem z pełnym kompletem ~35–40 pól.
 */

interface EquipmentSectionProps {
  setups: EquipmentSetup[];
  activeSetupId: string;
  isPremium: boolean;
  onSetupsChange: (next: EquipmentSetup[]) => void;
  onActiveSetupChange: (id: string) => void;
}

const DISCIPLINES: { id: BowType; labelKey: string }[] = [
  { id: 'Klasyczny (Recurve)', labelKey: 'rules.bow_recurve' },
  { id: 'Bloczkowy (Compound)', labelKey: 'rules.bow_compound' },
  { id: 'Goły (Barebow)', labelKey: 'rules.bow_barebow' },
  { id: 'Tradycyjny', labelKey: 'rules.bow_trad' },
];

const EquipmentSection: React.FC<EquipmentSectionProps> = ({
  setups, activeSetupId, isPremium, onSetupsChange, onActiveSetupChange,
}) => {
  const { t } = useTranslation();
  const [subtab, setSubtab] = useState<SetupSubtab>('archer');

  const limit = setupLimitFor(isPremium);
  const active = setups.find(s => s.id === activeSetupId) ?? setups[0];

  if (!active) return null;

  /** Nadpisuje aktywny zestaw, zostawiając resztę listy nietkniętą. */
  const patchActive = (patch: Partial<EquipmentSetup>) => {
    onSetupsChange(
      setups.map(s =>
        s.id === active.id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s,
      ),
    );
  };

  /** Nadpisuje jedną podsekcję (bow/string/arrows/…) aktywnego zestawu. */
  const patchSection = <K extends 'archer' | 'bow' | 'string' | 'arrows' | 'sight' | 'stabilization'>(
    key: K,
    patch: Partial<NonNullable<EquipmentSetup[K]>>,
  ) => {
    patchActive({ [key]: { ...(active[key] ?? {}), ...patch } } as Partial<EquipmentSetup>);
  };

  const addSetup = () => {
    if (setups.length >= limit) return;
    const id = `setup-${Date.now()}`;
    const now = new Date().toISOString();
    const next: EquipmentSetup = {
      id,
      name: t('settings.equipment.newSetupName', { n: setups.length + 1 }),
      discipline: active.discipline,
      createdAt: now,
      updatedAt: now,
    };
    onSetupsChange([...setups, next]);
    onActiveSetupChange(id);
  };

  const removeSetup = (id: string) => {
    // Zestawu #1 nie kasujemy: sesje sprzed zestawów niosą `setupId: 'default'`
    // i zostałyby bez czegokolwiek, na co wskazują.
    if (id === DEFAULT_SETUP_ID || setups.length <= 1) return;
    const next = setups.filter(s => s.id !== id);
    onSetupsChange(next);
    if (activeSetupId === id) onActiveSetupChange(next[0].id);
  };

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    placeholder = '',
  ) => (
    <div key={label}>
      <label className="text-[10px] font-black text-gray-400 uppercase block mb-1 ml-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm font-bold text-[#333] outline-none focus:border-emerald-500 transition-all"
      />
    </div>
  );

  const renderSubtab = () => {
    switch (subtab) {
      case 'archer':
        return (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase block mb-1 ml-1">
                {t('profile.drawLength')}
              </label>
              <input
                type="number"
                step="0.5"
                value={active.archer?.drawLength ?? ''}
                onChange={e =>
                  patchSection('archer', {
                    drawLength: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
                placeholder={t('profile.placeholderDraw')}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm font-bold text-[#333] outline-none focus:border-emerald-500 transition-all"
              />
            </div>
          </div>
        );

      case 'bow':
        return (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-[#0a3a2a] uppercase block mb-2 ml-1">
                {t('settings.bow.drawWeight')}: {active.bow?.lbs ?? '—'} lbs
              </label>
              <div className="flex flex-wrap gap-1">
                {[20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 55, 60].map(val => (
                  <button
                    key={val}
                    onClick={() => patchSection('bow', { lbs: val })}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-[11px] border transition-all ${active.bow?.lbs === val ? 'bg-[#0a3a2a] text-white border-[#0a3a2a] scale-105 shadow-md' : 'bg-white text-gray-400 border-gray-100 active:scale-95'}`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3 pt-2 border-t border-gray-50">
              {field(t('settings.bow.riser'), active.bow?.riser ?? '', v => patchSection('bow', { riser: v }), t('settings.bow.riserPh'))}
              {field(t('settings.bow.limbs'), active.bow?.limbs ?? '', v => patchSection('bow', { limbs: v }), t('settings.bow.limbsPh'))}
            </div>
          </div>
        );

      case 'string':
        return (
          <div className="space-y-3">
            {field(t('settings.equipment.string.model'), active.string?.model ?? '', v => patchSection('string', { model: v }), t('settings.equipment.string.modelPh'))}
            {field(t('settings.equipment.string.strands'), active.string?.strands ?? '', v => patchSection('string', { strands: v }), t('settings.equipment.string.strandsPh'))}
            {field(t('settings.equipment.string.nockingPoint'), active.string?.nockingPoint ?? '', v => patchSection('string', { nockingPoint: v }), t('settings.equipment.string.nockingPointPh'))}
          </div>
        );

      case 'arrows':
        return (
          <div className="space-y-3">
            {field(t('settings.arrows.model'), active.arrows?.model ?? '', v => patchSection('arrows', { model: v }), t('settings.arrows.modelPh'))}
            {field(t('settings.arrows.spine'), active.arrows?.spine ?? '', v => patchSection('arrows', { spine: v }), t('settings.arrows.spinePh'))}
            {field(t('settings.arrows.length'), active.arrows?.length ?? '', v => patchSection('arrows', { length: v }), t('settings.arrows.lengthPh'))}
          </div>
        );

      case 'sight':
        return (
          <div className="space-y-3">
            {field(t('settings.bow.sight'), active.sight?.model ?? '', v => patchSection('sight', { model: v }), t('settings.bow.sightPh'))}
          </div>
        );

      case 'stabilization':
        return (
          <div className="space-y-3">
            {field(t('settings.bow.stabilizers'), active.stabilization?.description ?? '', v => patchSection('stabilization', { description: v }), t('settings.bow.stabilizersPh'))}
          </div>
        );
    }
  };

  const noteLen = (active.note ?? '').length;

  return (
    <div className="space-y-3 animate-fade-in-up">
      {/* Przełącznik zestawów */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
            {t('settings.equipment.setups')} {setups.length}/{limit}
          </span>
          {setups.length < limit ? (
            <button
              onClick={addSetup}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-black uppercase active:scale-95 transition-all"
            >
              + {t('settings.equipment.addSetup')}
            </button>
          ) : (
            !isPremium && (
              <span className="text-[9px] font-black text-[#F2C94C] uppercase flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">diamond</span>
                {t('settings.equipment.proForMore')}
              </span>
            )
          )}
        </div>

        <div className="flex gap-1 overflow-x-auto hide-scrollbar">
          {setups.map(s => (
            <button
              key={s.id}
              onClick={() => onActiveSetupChange(s.id)}
              className={`px-3 py-2 rounded-xl text-[10px] font-black whitespace-nowrap border transition-all ${s.id === active.id ? 'bg-emerald-50 text-emerald-700 border-emerald-400 shadow-sm' : 'bg-white text-gray-400 border-gray-100'}`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {/* Nazwa + dyscyplina zestawu */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4 shadow-sm">
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase block mb-1 ml-1">
            {t('settings.equipment.setupName')}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              maxLength={40}
              value={active.name}
              onChange={e => patchActive({ name: e.target.value })}
              className="flex-1 min-w-0 bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm font-bold text-[#333] outline-none focus:border-emerald-500 transition-all"
            />
            {active.id !== DEFAULT_SETUP_ID && setups.length > 1 && (
              <button
                onClick={() => removeSetup(active.id)}
                aria-label={t('settings.equipment.removeSetup')}
                className="px-3 rounded-xl bg-red-50 text-red-500 border border-red-100 active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase block mb-2 ml-1">
            {t('settings.equipment.discipline')}
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {DISCIPLINES.map(d => (
              <button
                key={d.id}
                onClick={() => patchActive({ discipline: d.id })}
                className={`py-2 rounded-xl font-black text-[10px] border transition-all ${active.discipline === d.id ? 'bg-emerald-50 text-emerald-700 border-emerald-400 shadow-sm' : 'bg-white text-gray-400 border-gray-100'}`}
              >
                {t(d.labelKey)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Podzakładki */}
      <div className="flex gap-1 overflow-x-auto hide-scrollbar">
        {SETUP_SUBTABS.map(id => (
          <button
            key={id}
            onClick={() => setSubtab(id)}
            className={`px-2.5 py-2 rounded-xl text-[9px] font-black tracking-widest whitespace-nowrap transition-all ${subtab === id ? 'bg-white border border-gray-100 text-[#0a3a2a] shadow-sm' : 'text-gray-400 bg-transparent'}`}
          >
            {t(`settings.equipment.subtab.${id}`)}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
        {renderSubtab()}

        {/* Notatka do podzakładki — limit twardy, bo trener to czyta */}
        <div className="mt-4 pt-3 border-t border-gray-50">
          <div className="flex items-center justify-between mb-1 ml-1">
            <label className="text-[10px] font-black text-gray-400 uppercase">
              {t('settings.equipment.note')}
            </label>
            <span className={`text-[9px] font-black ${noteLen >= SETUP_NOTE_MAX ? 'text-red-400' : 'text-gray-300'}`}>
              {noteLen}/{SETUP_NOTE_MAX}
            </span>
          </div>
          <input
            type="text"
            maxLength={SETUP_NOTE_MAX}
            value={active.note ?? ''}
            onChange={e => patchActive({ note: e.target.value })}
            placeholder={t('settings.equipment.notePh')}
            className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm font-bold text-[#333] outline-none focus:border-emerald-500 transition-all"
          />
        </div>
      </div>
    </div>
  );
};

export default EquipmentSection;
