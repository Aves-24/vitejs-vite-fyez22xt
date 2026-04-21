import React from 'react';
import { useTranslation } from 'react-i18next';
import { BowType } from '../../config/archeryRules';

interface BowSectionProps {
  bowType: BowType;
  setBowType: (v: BowType) => void;
  lbs: number;
  setLbs: (v: number) => void;
  riser: string; setRiser: (v: string) => void;
  limbs: string; setLimbs: (v: string) => void;
  stabilizers: string; setStabilizers: (v: string) => void;
  sight: string; setSight: (v: string) => void;
}

const BowSection: React.FC<BowSectionProps> = (props) => {
  const { t } = useTranslation();

  const renderField = (label: string, value: string, onChange: (v: string) => void, placeholder: string) => (
    <div>
      <label className="text-[10px] font-black text-gray-400 uppercase block mb-1 ml-1">{label}</label>
      <input 
        type="text" 
        value={value} 
        onChange={(e) => onChange(e.target.value)} 
        className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm font-bold text-[#333] outline-none focus:border-emerald-500 transition-all" 
        placeholder={placeholder} 
      />
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4 animate-fade-in-up shadow-sm">
      {/* Wybór Typu Łuku */}
      <div className="grid grid-cols-2 gap-1.5">
        {[
          { id: 'Klasyczny (Recurve)', label: t('rules.bow_recurve') },
          { id: 'Bloczkowy (Compound)', label: t('rules.bow_compound') },
          { id: 'Goły (Barebow)', label: t('rules.bow_barebow') },
          { id: 'Tradycyjny', label: t('rules.bow_trad') }
        ].map(bow => (
          <button 
            key={bow.id} 
            onClick={() => props.setBowType(bow.id as BowType)} 
            className={`py-2 rounded-xl font-black text-[10px] border transition-all ${props.bowType === bow.id ? 'bg-emerald-50 text-emerald-700 border-emerald-400 shadow-sm' : 'bg-white text-gray-400 border-gray-100'}`}
          >
            {bow.label}
          </button>
        ))}
      </div>

      {/* Siła Naciągu */}
      <div className="pt-2 border-t border-gray-50">
        <label className="text-[10px] font-bold text-[#0a3a2a] uppercase block mb-2 ml-1">
          {t('settings.bow.drawWeight')}: {props.lbs} lbs
        </label>
        <div className="flex flex-wrap gap-1">
          {[20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 55, 60].map(val => (
            <button 
              key={val} 
              onClick={() => props.setLbs(val)} 
              className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-[11px] border transition-all ${props.lbs === val ? 'bg-[#0a3a2a] text-white border-[#0a3a2a] scale-105 shadow-md' : 'bg-white text-gray-400 border-gray-100 active:scale-95'}`}
            >
              {val}
            </button>
          ))}
        </div>
      </div>

      {/* Szczegóły Sprzętu */}
      <div className="pt-2 border-t border-gray-50 space-y-3">
        {renderField(t('settings.bow.riser'), props.riser, props.setRiser, t('settings.bow.riserPh'))}
        {renderField(t('settings.bow.limbs'), props.limbs, props.setLimbs, t('settings.bow.limbsPh'))}
        {renderField("Stabilizatory", props.stabilizers, props.setStabilizers, "np. Win&Win HMC+")}
        {renderField("Celownik", props.sight, props.setSight, "np. Shibuya Ultima CPX")}
      </div>
    </div>
  );
};

export default BowSection;