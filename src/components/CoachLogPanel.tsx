import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, deleteDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { FOCUS_GOAL_DEFAULT } from '../utils/focus';
import { useTranslation } from 'react-i18next';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { createNotification } from '../services/notificationService';
import { buildCoachLogNotification } from '../utils/notificationTypes';
import TopicPicker from './TopicPicker';
import type { TbCoachEntry } from './tagebuch/TagebuchCards';

// [PROFIL B, oś czasu — 2026-10-30] Dziennik trenera nie ma już własnej listy:
// wpisy leżą na wspólnej osi czasu profilu ucznia (zakładka Tagebuch) w tych
// samych kartach co u ucznia (CoachEntryCard). Tu zostaje formularz nowego wpisu
// i usuwanie. Uczeń czyta te wpisy w swoim Tagebuch (TagebuchView).

type EntryType = 'observation' | 'tip' | 'goal' | 'flag';

// Konfiguracja typów wpisu — kolor, ikona, etykieta
const TYPE_CONFIG: Record<EntryType, { color: string; bg: string; icon: string; labelKey: string; labelDefault: string }> = {
  observation: { color: '#059669', bg: '#d1fae5', icon: 'visibility',     labelKey: 'coachLog.typeObservation', labelDefault: 'BEOBACHTUNG' },
  tip:         { color: '#b45309', bg: '#fef3c7', icon: 'lightbulb',      labelKey: 'coachLog.typeTip',         labelDefault: 'TIPP' },
  goal:        { color: '#2563eb', bg: '#dbeafe', icon: 'flag',           labelKey: 'coachLog.typeGoal',        labelDefault: 'ZIEL' },
  flag:        { color: '#dc2626', bg: '#fee2e2', icon: 'priority_high',  labelKey: 'coachLog.typeFlag',        labelDefault: 'WICHTIG' },
};

const MAX_TEXT = 400;

/** Usunięcie własnego wpisu trenera. */
export async function deleteCoachLogEntry(studentId: string, entryId: string): Promise<void> {
  await deleteDoc(doc(db, `users/${studentId}/coachLog/${entryId}`));
}

export function CoachLogComposer({ studentId, currentUserId, onSaved, onCancel }: {
  studentId: string;
  currentUserId: string;
  onSaved: (entry: TbCoachEntry & { authorId: string }) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [authorName, setAuthorName] = useState('');
  const [text, setText] = useState('');
  const [type, setType] = useState<EntryType>('observation');
  const [logTopics, setLogTopics] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const voice = useVoiceInput({
    onResult: (result) => setText(prev => (prev + ' ' + result).trim().slice(0, MAX_TEXT)),
    append: true,
  });

  // --- WŁASNE IMIĘ (podpis wpisu) ---
  useEffect(() => {
    if (!currentUserId) return;
    const cacheKey = `grotX_userName_${currentUserId}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) { setAuthorName(cached); return; }
    getDoc(doc(db, 'users', currentUserId)).then(userDoc => {
      if (!userDoc.exists()) return;
      const d = userDoc.data();
      const name = `${d.firstName || ''} ${d.lastName || ''}`.trim() || t('coachLog.defaultCoachName', { defaultValue: 'Trainer' });
      setAuthorName(name);
      try { localStorage.setItem(cacheKey, name); } catch { /* ignore */ }
    }).catch(e => console.error('CoachLog: błąd pobierania imienia', e));
  }, [currentUserId, t]);

  // --- ZAPIS NOWEGO WPISU ---
  const handleSave = async () => {
    const cleanText = text.trim().slice(0, MAX_TEXT);
    if (!cleanText) return;
    setIsSaving(true);
    const name = authorName || t('coachLog.defaultCoachName', { defaultValue: 'Trainer' });
    try {
      const docRef = await addDoc(collection(db, `users/${studentId}/coachLog`), {
        authorId: currentUserId,
        authorName: name,
        text: cleanText,
        type,
        topics: logTopics,
        // [DWA FOKUSY] fokus trenera ma własną liczbę treningów (zmiana w panelu fokusu)
        ...(type === 'goal' ? { goal: FOCUS_GOAL_DEFAULT } : {}),
        createdAt: serverTimestamp(),
      });
      onSaved({ id: docRef.id, authorId: currentUserId, authorName: name, text: cleanText, type, topics: logTopics, ts: Date.now() });

      // Powiadomienie u ucznia (dzwonek na Home) — trener dodał wpis w Tagebuch.
      // Idempotentne po id wpisu; best-effort.
      const { id, payload } = buildCoachLogNotification({ entryId: docRef.id, coachId: currentUserId, coachName: name });
      createNotification(studentId, id, payload).catch(() => { /* best effort */ });
    } catch (e) {
      console.error('CoachLog: błąd zapisu', e);
    }
    setIsSaving(false);
  };

  return (
    <div className="tb-card tb-coach border rounded-l-md rounded-r-2xl shadow-sm pl-3 pr-3 py-3 space-y-2 tb-fade-in">
      <p className="text-[10px] font-semibold text-gray-500 leading-snug">
        {t('coachLog.hint', { defaultValue: 'Notiere hier, woran zuletzt mit dem Schüler gearbeitet wurde und worauf in den nächsten Trainings der Fokus liegen soll.' })}
      </p>

      {/* Wybór typu wpisu */}
      <div className="grid grid-cols-4 gap-1.5">
        {(Object.keys(TYPE_CONFIG) as EntryType[]).map(key => {
          const cfg = TYPE_CONFIG[key];
          const isActive = type === key;
          return (
            <button
              key={key}
              onClick={() => setType(key)}
              className={`p-2 rounded-lg flex flex-col items-center gap-0.5 transition-all border ${isActive ? 'shadow-sm' : 'opacity-60 border-transparent bg-gray-50'}`}
              style={isActive ? { backgroundColor: cfg.bg, borderColor: cfg.color } : {}}
            >
              <span className="material-symbols-outlined text-[16px]" style={{ color: cfg.color }}>{cfg.icon}</span>
              <span className="text-[7px] font-black uppercase tracking-widest" style={{ color: cfg.color }}>
                {t(cfg.labelKey, { defaultValue: cfg.labelDefault })}
              </span>
            </button>
          );
        })}
      </div>

      {/* Liczbą lekcji, podglądem obecnego fokusu i zakończeniem przed
          czasem zarządza CoachFocusModal (klik na pasek fokusu w profilu
          ucznia) — tu tylko treść wpisu, jak przy innych typach. */}
      {type === 'goal' && (
        <p className="text-[9px] font-semibold text-gray-400 leading-snug px-0.5">
          {t('coachLog.focusHint', { defaultValue: 'Liczbą lekcji i zakończeniem fokusu zarządzasz w panelu fokusu — kliknij pasek „Fokus” w profilu ucznia.' })}
        </p>
      )}

      {/* Treść + przycisk mikrofonu */}
      <div className="relative">
        <textarea
          value={text}
          onChange={e => setText(e.target.value.slice(0, MAX_TEXT))}
          maxLength={MAX_TEXT}
          autoFocus
          placeholder={t('coachLog.placeholder', { defaultValue: 'Schreibe einen Eintrag für die anderen Trainer…' })}
          className="w-full bg-white border border-gray-200 rounded-lg p-2.5 text-[11px] font-bold text-[#333] outline-none focus:border-[#0a3a2a] resize-none h-20 leading-snug pr-12"
        />
        {voice.isSupported && (
          <button
            onClick={voice.isListening ? voice.stopListening : () => voice.startListening()}
            className={`absolute right-2 top-2 p-2.5 rounded-lg transition-all font-black text-[10px] flex items-center gap-1 ${
              voice.isListening
                ? 'bg-red-500 text-white shadow-lg scale-110 animate-pulse'
                : 'bg-[#fed33e] text-[#0a3a2a] hover:shadow-md active:scale-95'
            }`}
            title={voice.isListening ? 'Stop recording' : 'Record voice'}
          >
            <span className="material-symbols-outlined text-[16px]">
              {voice.isListening ? 'mic' : 'mic_none'}
            </span>
          </button>
        )}
      </div>
      {voice.error && (
        <p className="text-[8px] font-bold text-red-500 mt-1">{voice.error}</p>
      )}

      {/* Picker tematów */}
      <div className="pt-1">
        <TopicPicker selectedTopics={logTopics} onChange={setLogTopics} />
      </div>

      {/* Stopka — licznik + przyciski */}
      <div className="flex justify-between items-center">
        <span className={`text-[8px] font-bold ${text.length >= MAX_TEXT ? 'text-red-500' : 'text-gray-400'}`}>{text.length}/{MAX_TEXT}</span>
        <div className="flex gap-2">
          <button onClick={onCancel} className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-2">
            {t('coachLog.cancel', { defaultValue: 'Abbrechen' })}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !text.trim()}
            className="text-[9px] font-black bg-[#0a3a2a] text-[#fed33e] px-4 py-1.5 rounded-lg uppercase tracking-widest disabled:opacity-50 active:scale-95 transition-all"
          >
            {isSaving ? t('coachLog.saving', { defaultValue: '…' }) : t('coachLog.save', { defaultValue: 'Speichern' })}
          </button>
        </div>
      </div>
    </div>
  );
}
