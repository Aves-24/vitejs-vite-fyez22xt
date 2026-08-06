import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { guestExpiryFields } from '../utils/guestMode';
import { seriesKeyFromTitle } from '../utils/tournamentSeries';

interface HistoricalStartFormProps {
  userId: string;
  isPremium: boolean;
  /** Nazwy dotychczasowych imprez — żeby dopisany start trafił do istniejącej serii. */
  knownSeries: { name: string; distance?: string }[];
  onClose: () => void;
  onSaved: () => void;
}

const DISTANCES = ['18m', '20m', '25m', '30m', '40m', '50m', '60m', '70m', '90m'];

export default function HistoricalStartForm({ userId, isPremium, knownSeries, onClose, onSaved }: HistoricalStartFormProps) {
  const { t } = useTranslation();

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [distance, setDistance] = useState('70m');
  const [score, setScore] = useState('');
  const [arrows, setArrows] = useState('72');
  const [xCount, setXCount] = useState('');
  const [tenCount, setTenCount] = useState('');
  const [nineCount, setNineCount] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Zakres dat: wstecz tyle, ile sięga historia w danym planie; w przód nigdy —
  // to formularz na starty, które już się odbyły.
  const { minDate, maxDate } = useMemo(() => {
    const max = new Date();
    max.setDate(max.getDate() - 1);
    const min = new Date();
    min.setFullYear(min.getFullYear() - (isPremium ? 5 : 1));
    return { minDate: min.toISOString().split('T')[0], maxDate: max.toISOString().split('T')[0] };
  }, [isPremium]);

  const suggestions = useMemo(() => {
    const typed = seriesKeyFromTitle(title);
    if (!typed) return knownSeries.slice(0, 6);
    return knownSeries
      .filter(s => {
        const key = seriesKeyFromTitle(s.name);
        return key !== typed && key.includes(typed);
      })
      .slice(0, 6);
  }, [knownSeries, title]);

  const scoreNum = parseInt(score) || 0;
  const arrowsNum = parseInt(arrows) || 0;
  const canSave = !!title.trim() && !!date && scoreNum > 0 && arrowsNum > 0 && !isSaving;

  const save = async () => {
    setError('');
    if (!canSave) return;

    if (date < minDate || date > maxDate) {
      setError(t('stats.records.form.errorDateRange'));
      return;
    }
    // Maksimum to 10 punktów na strzałę — wyłapuje literówkę w rodzaju 6480.
    if (scoreNum > arrowsNum * 10) {
      setError(t('stats.records.form.errorScoreTooHigh'));
      return;
    }

    setIsSaving(true);
    try {
      const [y, m, d] = date.split('-').map(Number);
      // Południe, żeby przesunięcie strefy nie przerzuciło wpisu na sąsiedni dzień.
      const startDate = new Date(y, m - 1, d, 12, 0, 0);

      await addDoc(collection(db, 'users', userId, 'sessions'), {
        // timestamp = data historyczna, nie moment zapisu. Dzięki temu wszystkie
        // istniejące zapytania sortowane po tym polu układają wpis we właściwym
        // miejscu historii i stary start nie staje się "ostatnią sesją".
        timestamp: Timestamp.fromDate(startDate),
        date: startDate.toLocaleDateString('pl-PL'),
        type: 'Turniej',
        tournamentName: title.trim(),
        distance,
        score: scoreNum,
        scoreArrows: arrowsNum,
        sessionArrows: arrowsNum,
        practiceArrows: 0,
        arrows: arrowsNum,
        xCount: parseInt(xCount) || 0,
        tenCount: parseInt(tenCount) || 0,
        nineCount: parseInt(nineCount) || 0,
        ends: [],
        inputMode: 'SUMMARY',
        targetType: distance === '18m' ? '3-Spot' : 'Full',
        // Wpis dopisany ręcznie po fakcie. NIE aktualizujemy totalArrows,
        // monthlyArrows ani dailyStats — te liczniki opisują bieżącą aktywność.
        isHistorical: true,
        ...guestExpiryFields(),
      });

      onSaved();
      onClose();
    } catch {
      setError(t('stats.records.form.errorSave'));
      setIsSaving(false);
    }
  };

  const numField = (label: string, value: string, setter: (v: string) => void, placeholder?: string) => (
    <div className="flex-1 space-y-1">
      <label className="text-[9px] font-black text-gray-400 uppercase ml-1 block">{label}</label>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        placeholder={placeholder}
        value={value}
        onChange={e => setter(e.target.value)}
        className="w-full bg-gray-50 border border-gray-100 rounded-xl p-2.5 text-center text-sm font-black text-[#0a3a2a] outline-none focus:ring-2 focus:ring-emerald-400"
      />
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[130] flex items-start justify-center pt-16 px-4">
      <div className="bg-white w-full max-w-sm rounded-[32px] p-5 shadow-2xl animate-fade-in-up max-h-[85vh] overflow-y-auto">

        <div className="flex justify-between items-start mb-4">
          <div>
            <span className="inline-block px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest mb-1.5 bg-[#0a3a2a] text-white">
              {t('stats.records.form.badge')}
            </span>
            <h2 className="text-lg font-black text-[#0a3a2a] leading-tight">{t('stats.records.form.title')}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 bg-red-50 text-red-500 rounded-full active:scale-90 shrink-0 transition-colors">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            placeholder={t('stats.records.form.namePlaceholder')}
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 text-sm font-bold text-[#0a3a2a] placeholder:text-emerald-300 outline-none focus:ring-2 focus:ring-emerald-400"
          />

          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map(s => (
                <button
                  key={s.name}
                  onClick={() => { setTitle(s.name); if (s.distance) setDistance(s.distance); }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-black border bg-gray-50 border-transparent text-gray-500 active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-[13px] text-gray-300">history</span>
                  {s.name}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[9px] font-black text-gray-400 uppercase ml-1 block">{t('stats.records.form.dateLabel')}</label>
            <input
              type="date"
              value={date}
              min={minDate}
              max={maxDate}
              onChange={e => setDate(e.target.value)}
              className="w-full bg-[#fed33e] border border-[#e5bd38] rounded-xl p-2.5 text-center font-black text-sm text-[#5d4a00] outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-gray-400 uppercase ml-1 block">{t('calendar.formDistLabel')}</label>
            <div className="grid grid-cols-5 gap-1">
              {DISTANCES.map(d => (
                <button
                  key={d}
                  onClick={() => setDistance(d)}
                  className={`py-2 rounded-xl text-[10px] font-black border transition-all ${distance === d ? 'bg-emerald-100 border-emerald-500 text-emerald-700' : 'bg-gray-50 border-transparent text-gray-400'}`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            {numField(t('stats.records.form.scoreLabel'), score, setScore, '648')}
            {numField(t('stats.records.form.arrowsLabel'), arrows, setArrows, '72')}
          </div>

          <div className="flex gap-2">
            {numField('X', xCount, setXCount, '0')}
            {numField('10', tenCount, setTenCount, '0')}
            {numField('9', nineCount, setNineCount, '0')}
          </div>

          <p className="text-[9px] font-bold text-gray-400 leading-snug px-1">
            {t('stats.records.form.countersNote')}
          </p>

          {error && <p className="text-[10px] font-bold text-red-500 text-center">{error}</p>}

          <button
            onClick={save}
            disabled={!canSave}
            className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all ${canSave ? 'bg-[#0a3a2a] text-white' : 'bg-gray-200 text-gray-400'}`}
          >
            {isSaving ? t('stats.records.saving') : t('stats.records.save')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
