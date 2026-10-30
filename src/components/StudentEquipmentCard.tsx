import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  EquipmentSetup,
  SetupSubtab,
  DISCIPLINES,
  isBlowgun,
  visibleSubtabsFor,
  noteFor,
  resolveSetupColors,
  setupColorHex,
  buildSetupFromLegacy,
} from '../config/equipmentSetups';
import { distancesForSetup, displayDistance } from '../config/distances';

/**
 * Karta sprzętu ucznia oczami trenera (życzenie usera 2026-09-10).
 *
 * Wcześniej modal czytał stare, płaskie pola (`lbs`, `riser`…) i nie widział
 * zestawów ani cięciwy, strzał i notatek z Ustawień → SPRZĘT. Teraz każdy
 * zestaw to zwijany wiersz: zwinięty pokazuje tylko to, co trener chce
 * zobaczyć od razu (siła naciągu, długość naciągu, spine — dla dmuchawki
 * rura i strzałki), rozwinięty — wszystkie wypełnione pola, notatki
 * podzakładek i nastawy celownika tego zestawu.
 *
 * Konto sprzed zestawów (uczeń nie otworzył Ustawień od migracji) dostaje
 * zestaw zbudowany w locie ze starych pól — tylko do odczytu, bez zapisu.
 */
export default function StudentEquipmentCard({ student }: { student: any }) {
  const { t } = useTranslation();

  const realSetups: EquipmentSetup[] = Array.isArray(student?.setups) ? student.setups : [];
  const setups = realSetups.length > 0
    ? realSetups
    : [buildSetupFromLegacy(student ?? {}, t('settings.equipment.defaultSetupName'))];
  const activeId = realSetups.some(s => s.id === student?.activeSetupId)
    ? student.activeSetupId
    : setups[0].id;
  // Aktywny zestaw na górze — to z niego uczeń dziś strzela.
  const ordered = [...setups].sort((a, b) => Number(b.id === activeId) - Number(a.id === activeId));
  const colors = resolveSetupColors(setups);

  const [openId, setOpenId] = useState<string | null>(null);

  const disciplineLabel = (s: EquipmentSetup) => {
    const d = DISCIPLINES.find(x => x.id === s.discipline);
    return d ? t(d.labelKey) : s.discipline;
  };

  /** Najważniejsze dane, widoczne bez rozwijania. */
  const keyFacts = (s: EquipmentSetup): string[] => {
    if (isBlowgun(s.discipline)) {
      return [s.blowgun?.model, s.arrows?.model].filter((v): v is string => !!v);
    }
    const out: string[] = [];
    if (s.bow?.lbs) out.push(`${s.bow.lbs} lbs`);
    if (s.archer?.drawLength) out.push(`${t('studentProfile.drawLengthShort')} ${s.archer.drawLength}″`);
    if (s.arrows?.spine) out.push(`Spine ${s.arrows.spine}`);
    return out;
  };

  /** Wypełnione pola podzakładki jako pary [etykieta, wartość]. */
  const rowsFor = (s: EquipmentSetup, tab: SetupSubtab): [string, string][] => {
    const rows = ((): [string, unknown][] => {
      switch (tab) {
        case 'archer': return [[t('profile.drawLength'), s.archer?.drawLength ? `${s.archer.drawLength}″` : '']];
        case 'blowgun': return [[t('settings.equipment.blowgun.model'), s.blowgun?.model]];
        case 'bow': return [
          [t('settings.bow.drawWeight'), s.bow?.lbs ? `${s.bow.lbs} lbs` : ''],
          [t('settings.bow.riser'), s.bow?.riser],
          [t('settings.bow.limbs'), s.bow?.limbs],
        ];
        case 'string': return [
          [t('settings.equipment.string.model'), s.string?.model],
          [t('settings.equipment.string.strands'), s.string?.strands],
          [t('settings.equipment.string.nockingPoint'), s.string?.nockingPoint],
        ];
        case 'arrows': return [
          [t('settings.arrows.model'), s.arrows?.model],
          [t('settings.arrows.spine'), s.arrows?.spine],
          [t('settings.arrows.length'), s.arrows?.length],
        ];
        case 'sight': return [[t('settings.bow.sight'), s.sight?.model]];
        case 'stabilization': return [[t('settings.bow.stabilizers'), s.stabilization?.description]];
      }
    })();
    return rows
      .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
      .map(([l, v]) => [l, String(v)]);
  };

  const renderDetails = (s: EquipmentSetup) => {
    const tabs = visibleSubtabsFor(s.discipline);
    const sections = tabs
      .map((tab, i) => ({ tab, rows: rowsFor(s, tab), note: noteFor(s, tab, i === 0).trim() }))
      .filter(x => x.rows.length > 0 || x.note);
    // Nastawy tego zestawu — ta sama reguła, co przy starcie treningu ucznia.
    const marks = distancesForSetup(
      Array.isArray(student?.userDistances) ? student.userDistances : [],
      realSetups, s.id, student?.bowType ?? null,
    ).filter((d: any) => d.active);

    return (
      <div className="px-3 pb-3 pt-2 space-y-3 border-t border-gray-100">
        {sections.length === 0 && (
          <p className="text-[10px] font-bold text-gray-400 uppercase text-center py-2">{t('studentProfile.hardwareEmpty')}</p>
        )}
        {sections.map(({ tab, rows, note }) => (
          <div key={tab}>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{t(`settings.equipment.subtab.${tab}`)}</p>
            <div className="bg-gray-50 rounded-xl px-3 py-1.5 border border-gray-100">
              {rows.map(([label, value]) => (
                <div key={label} className="flex justify-between items-baseline gap-3 py-1 border-b border-gray-100 last:border-b-0">
                  <span className="text-[10px] font-bold text-gray-500 shrink-0">{label}</span>
                  <span className="text-[11px] font-black text-[#0a3a2a] text-right break-words min-w-0">{value}</span>
                </div>
              ))}
              {note && (
                <p className={`text-[10px] font-medium italic text-gray-500 break-words ${rows.length > 0 ? 'pt-1.5 pb-0.5' : 'py-1'}`}>„{note}”</p>
              )}
            </div>
          </div>
        ))}

        {!isBlowgun(s.discipline) && (
          <div>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{t('studentProfile.hardwareSightMarks')}</p>
            {marks.length > 0 ? (
              <div className="bg-gray-50 rounded-xl px-3 py-1.5 border border-gray-100">
                <div className="grid grid-cols-[minmax(0,1.6fr)_1fr_1fr_1fr] gap-2 text-[8px] font-black text-gray-400 uppercase pb-1 border-b border-gray-100">
                  <span />
                  <span className="text-center">{t('studentProfile.sightExtShort')}</span>
                  <span className="text-center">{t('studentProfile.sightUDShort')}</span>
                  <span className="text-center">{t('studentProfile.sightLRShort')}</span>
                </div>
                {marks.map((d: any, i: number) => (
                  <div key={d.id || i} className="grid grid-cols-[minmax(0,1.6fr)_1fr_1fr_1fr] gap-2 items-center py-1 border-b border-gray-100 last:border-b-0">
                    <span className="min-w-0">
                      <span className="block text-[11px] font-black text-[#0a3a2a] truncate">{displayDistance(d)}</span>
                      <span className="block text-[8px] font-bold text-gray-400 uppercase truncate">{d.targetType || '122cm'}</span>
                    </span>
                    <span className="text-center text-[11px] font-black text-[#333]">{d.sightExtension || '–'}</span>
                    <span className="text-center text-[11px] font-black text-[#333]">{d.sightHeight || d.sightMark || '–'}</span>
                    <span className="text-center text-[11px] font-black text-[#333]">{d.sightSide || '–'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] font-bold text-gray-400 uppercase text-center py-2 bg-gray-50 rounded-xl border border-dashed border-gray-200">{t('studentProfile.hardwareNoSight')}</p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {ordered.map(s => {
        const open = openId === s.id;
        const facts = keyFacts(s);
        return (
          <div key={s.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : s.id)}
              aria-expanded={open}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left active:bg-gray-50 transition-all"
            >
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: setupColorHex(colors.get(s.id)) }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-black text-[#0a3a2a] text-[13px] leading-tight truncate">{s.name}</span>
                  {s.id === activeId && realSetups.length > 1 && (
                    <span className="shrink-0 bg-emerald-50 text-emerald-700 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded">{t('studentProfile.hardwareActive')}</span>
                  )}
                </div>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest truncate mt-0.5">
                  {disciplineLabel(s)}{facts.length > 0 && <span className="text-[#0a3a2a]"> · {facts.join(' · ')}</span>}
                </p>
              </div>
              <span className="material-symbols-outlined text-[18px] text-gray-400 shrink-0">{open ? 'expand_less' : 'expand_more'}</span>
            </button>
            {open && renderDetails(s)}
          </div>
        );
      })}
    </div>
  );
}
