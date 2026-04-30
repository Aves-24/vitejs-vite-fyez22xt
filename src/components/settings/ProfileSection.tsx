import React from 'react';
import ClubPicker from '../ClubPicker';
import { useTranslation } from 'react-i18next';

interface ProfileSectionProps {
  firstName: string; setFirstName: (v: string) => void;
  lastName: string; setLastName: (v: string) => void;
  nickname: string; setNickname: (v: string) => void;
  country: string; setCountry: (v: string) => void;
  clubCity: string; setClubCity: (v: string) => void;
  club: string; setClub: (v: string) => void;
  gender: 'M' | 'K'; setGender: (v: 'M' | 'K') => void;
  bDay: string; setBDay: (v: string) => void;
  bMonth: string; setBMonth: (v: string) => void;
  bYear: string; setBYear: (v: string) => void;
  height: number | ''; setHeight: (v: number | '') => void;
  handedness: 'RH' | 'LH'; setHandedness: (v: 'RH' | 'LH') => void;
  startYear: number; setStartYear: (v: number) => void;
  competitionLevel: string; setCompetitionLevel: (v: string) => void;
  showFullName: boolean; setShowFullName: (v: boolean) => void;
  showClub: boolean; setShowClub: (v: boolean) => void;
  showRegion: boolean; setShowRegion: (v: boolean) => void;
  countryOptions: string[];
  availableCities: string[];
  availableClubs: string[];
  competitionLevels: string[];
  onStartWizard: () => void;
  onLogout: () => void;
}

const ProfileSection: React.FC<ProfileSectionProps> = (props) => {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-3 animate-fade-in-up">
      {/* Przycisk Magicznego Kreatora */}
      <button 
        onClick={props.onStartWizard} 
        className="w-full bg-gradient-to-r from-[#0a3a2a] to-emerald-800 p-4 rounded-xl flex gap-3 items-center shadow-lg active:scale-95 transition-all relative overflow-hidden group"
      >
        <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-xl -mr-6 -mt-6 group-hover:bg-white/20 transition-all"></div>
        <span className="material-symbols-outlined text-[#F2C94C] text-3xl">magic_button</span>
        <div className="text-left relative z-10">
          <h3 className="text-white font-black text-xs tracking-wide mb-0.5">{t('settings.wizard.btnStart')}</h3>
          <p className="text-emerald-100 text-[9px] font-medium leading-tight pr-4">{t('settings.wizard.btnDesc')}</p>
        </div>
      </button>

      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-3">
        <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest border-b border-gray-50 pb-1.5 mb-1">{t('settings.wizard.titlePersonal')}</h3>
        
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
             <label className="text-[10px] font-black text-gray-400 uppercase ml-1">{t('settings.wizard.firstName')} *</label>
             <input type="text" value={props.firstName} onChange={(e) => props.setFirstName(e.target.value)} placeholder={t('settings.wizard.firstName')} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-sm font-bold outline-none focus:border-emerald-500" />
          </div>
          <div className="space-y-1">
             <label className="text-[10px] font-black text-gray-400 uppercase ml-1">{t('settings.wizard.lastName')}</label>
             <input type="text" value={props.lastName} onChange={(e) => props.setLastName(e.target.value)} placeholder={t('settings.wizard.lastName')} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-sm font-bold outline-none focus:border-emerald-500" />
          </div>
        </div>

        <div className="space-y-1 mt-1">
           <label className="text-[10px] font-black text-gray-400 uppercase ml-1">{t('settings.nicknameLabel')}</label>
           <input type="text" value={props.nickname} onChange={(e) => props.setNickname(e.target.value)} placeholder={t('settings.nicknamePlaceholder')} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-sm font-bold outline-none focus:border-emerald-500" />
        </div>
        
        <div className="pt-2 border-t border-gray-50 space-y-2.5">
           <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">{t('settings.wizard.team')}</h3>
           <div className="relative">
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1">1. {t('settings.wizard.country')}</label>
              <select value={props.country} onChange={e=>props.setCountry(e.target.value)} className="w-full mt-0.5 bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-emerald-500">
                {props.countryOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
           </div>
           <div className="relative">
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1">2. {t('settings.wizard.clubCity')}</label>
              <input list="profile-cities" type="text" value={props.clubCity} onChange={e => { props.setClubCity(e.target.value); props.setClub(''); }} placeholder={t('common.clubCityPlaceholder')} className="w-full mt-0.5 bg-gray-50 border border-gray-100 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-emerald-500" />
              <datalist id="profile-cities">{props.availableCities.map(c => <option key={c} value={c} />)}</datalist>
           </div>
           <div>
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1 block mb-0.5">3. {t('settings.wizard.clubName')}</label>
              <ClubPicker
                value={props.club}
                onChange={props.setClub}
                availableClubs={props.availableClubs}
                citySelected={!!props.clubCity.trim()}
              />
           </div>
        </div>

        <div className="flex gap-2 pt-2 border-t border-gray-50">
          <button onClick={() => props.setGender('M')} className={`flex-1 py-2.5 rounded-xl font-black text-xs border transition-all ${props.gender === 'M' ? 'bg-[#0a3a2a] border-[#0a3a2a] text-white shadow-md' : 'bg-white text-gray-500 border-gray-200'}`}>{t('settings.wizard.genderM')}</button>
          <button onClick={() => props.setGender('K')} className={`flex-1 py-2.5 rounded-xl font-black text-xs border transition-all ${props.gender === 'K' ? 'bg-[#0a3a2a] border-[#0a3a2a] text-white shadow-md' : 'bg-white text-gray-500 border-gray-200'}`}>{t('settings.wizard.genderF')}</button>
        </div>
        
        <div className="space-y-2 mt-4">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t('settings.wizard.birthDate')}</label>
          <div className="flex gap-2">
            <div className="flex-1 flex flex-col gap-1">
              <input type="number" placeholder="DD" className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-center font-black text-lg focus:bg-emerald-50 focus:border-emerald-500 outline-none" value={props.bDay} onChange={e => props.setBDay(e.target.value.slice(0,2))} />
              <span className="text-[8px] text-center font-bold text-gray-300 uppercase">{t('common.day')}</span>
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <input type="number" placeholder="MM" className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-center font-black text-lg focus:bg-emerald-50 focus:border-emerald-500 outline-none" value={props.bMonth} onChange={e => props.setBMonth(e.target.value.slice(0,2))} />
              <span className="text-[8px] text-center font-bold text-gray-300 uppercase">Msc</span>
            </div>
            <div className="flex-[1.5] flex flex-col gap-1">
              <input type="number" placeholder="YYYY" className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-center font-black text-lg focus:bg-emerald-50 focus:border-emerald-500 outline-none" value={props.bYear} onChange={e => props.setBYear(e.target.value.slice(0,4))} />
              <span className="text-[8px] text-center font-bold text-gray-300 uppercase">Rok</span>
            </div>
          </div>
        </div>

        {/* PRZYWRÓCONE POLA: WZROST I RĘKA */}
        <div className="space-y-1 mt-4 pt-2 border-t border-gray-50">
           <label className="text-[10px] font-black text-gray-400 uppercase ml-1">{t('settings.wizard.height')}</label>
           <input type="number" value={props.height} onChange={(e) => props.setHeight(Number(e.target.value) || '')} placeholder="np. 180" className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-sm font-bold text-center outline-none focus:border-emerald-500" />
        </div>

        <div className="flex gap-2 mt-2">
          <button onClick={() => props.setHandedness('RH')} className={`flex-1 py-2.5 rounded-xl font-black text-[11px] border transition-all ${props.handedness === 'RH' ? 'bg-[#0a3a2a] border-[#0a3a2a] text-white shadow-md' : 'bg-white text-gray-500 border-gray-200'}`}>{t('profile.handednessRH')}</button>
          <button onClick={() => props.setHandedness('LH')} className={`flex-1 py-2.5 rounded-xl font-black text-[11px] border transition-all ${props.handedness === 'LH' ? 'bg-[#0a3a2a] border-[#0a3a2a] text-white shadow-md' : 'bg-white text-gray-500 border-gray-200'}`}>{t('profile.handednessLH')}</button>
        </div>

        <div className="pt-2 border-t border-gray-50">
          <div className="flex justify-between items-end mb-1">
            <label className="text-[10px] font-black uppercase text-gray-400 ml-1">{t('settings.wizard.yearsShooting')}</label>
            <span className="text-[11px] font-black text-[#0a3a2a] bg-gray-50 px-2 py-0.5 rounded-md">
              {props.startYear === currentYear ? t('settings.wizard.lessThanYear') : `${currentYear - props.startYear} ${t('settings.wizard.yearsSuffix')}`}
            </span>
          </div>
          <input type="range" min="0" max="50" value={currentYear - props.startYear} onChange={(e) => props.setStartYear(currentYear - Number(e.target.value))} className="w-full accent-[#0a3a2a] h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer mt-1" />
        </div>

        <div className="pt-2 border-t border-gray-50 pb-1">
          <label className="text-[10px] font-black text-gray-400 uppercase ml-1 mb-1.5 block">{t('settings.wizard.highestLevel')}</label>
          <div className="flex flex-col gap-1">
            {props.competitionLevels.map(lvl => (
              <button key={lvl} onClick={() => props.setCompetitionLevel(lvl)} className={`w-full text-left px-3 py-2.5 rounded-xl font-bold text-[11px] border transition-all ${props.competitionLevel === lvl ? 'bg-[#0a3a2a] border-[#0a3a2a] text-white shadow-sm' : 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-white'}`}>
                <div className="flex items-center justify-between">
                  <span>{lvl}</span>
                  {props.competitionLevel === lvl && <span className="material-symbols-outlined text-emerald-400 text-[13px]">check_circle</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-gray-50 space-y-2">
           <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">{t('settings.privacySection')}</h3>
           
           <label className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-100 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
             <input type="checkbox" checked={props.showFullName} onChange={e => props.setShowFullName(e.target.checked)} className="w-5 h-5 rounded border-gray-300 text-[#0a3a2a] focus:ring-0" />
             <div className="flex flex-col">
               <span className="text-[11px] font-black text-[#333]">{t('settings.showFullName')}</span>
               <span className="text-[9px] font-bold text-gray-400 leading-tight mt-0.5">{t('settings.showFullNameDesc')}</span>
             </div>
           </label>

           <label className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-100 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
             <input type="checkbox" checked={props.showClub} onChange={e => props.setShowClub(e.target.checked)} className="w-5 h-5 rounded border-gray-300 text-[#0a3a2a] focus:ring-0" />
             <div className="flex flex-col">
               <span className="text-[11px] font-black text-[#333]">{t('settings.showClub')}</span>
             </div>
           </label>
        </div>

        <div className="pt-4 border-t border-gray-50">
          <button onClick={props.onLogout} className="w-full py-3 bg-red-50 text-red-600 rounded-xl font-black text-[10px] uppercase tracking-widest border border-red-100 active:scale-95 transition-all flex items-center justify-center gap-1.5">
            <span className="material-symbols-outlined text-base">logout</span> {t('settings.wizard.logout')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileSection;