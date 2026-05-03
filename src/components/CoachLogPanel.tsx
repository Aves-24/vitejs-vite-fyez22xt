import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, getDocs, addDoc, deleteDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';

// --- TYPY WPISÓW ---
type EntryType = 'observation' | 'tip' | 'goal' | 'flag';

// --- WEB SPEECH API SETUP ---
type SpeechRecognitionEvent = Event & { results: SpeechRecognitionResultList };
type SpeechRecognitionErrorEvent = Event & { error: string };
interface SpeechRecognitionStatic {
  new (): SpeechRecognition;
}
interface SpeechRecognition {
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
}

const SpeechRecognition = (typeof window !== 'undefined' && (window as any).SpeechRecognition) ||
  (typeof window !== 'undefined' && (window as any).webkitSpeechRecognition) || null;

const LANGUAGE_MAP: Record<string, string> = {
  de: 'de-DE',
  pl: 'pl-PL',
  en: 'en-US',
};

interface CoachLogEntry {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  type: EntryType;
  createdAt: number;
}

interface CoachLogPanelProps {
  studentId: string;
  currentUserId: string;
  mode: 'coach' | 'student';
}

// Konfiguracja typów wpisu — kolor, ikona, etykieta
const TYPE_CONFIG: Record<EntryType, { color: string; bg: string; icon: string; labelKey: string; labelDefault: string }> = {
  observation: { color: '#059669', bg: '#d1fae5', icon: 'visibility',     labelKey: 'coachLog.typeObservation', labelDefault: 'BEOBACHTUNG' },
  tip:         { color: '#b45309', bg: '#fef3c7', icon: 'lightbulb',      labelKey: 'coachLog.typeTip',         labelDefault: 'TIPP' },
  goal:        { color: '#2563eb', bg: '#dbeafe', icon: 'flag',           labelKey: 'coachLog.typeGoal',        labelDefault: 'ZIEL' },
  flag:        { color: '#dc2626', bg: '#fee2e2', icon: 'priority_high',  labelKey: 'coachLog.typeFlag',        labelDefault: 'WICHTIG' },
};

const MAX_TEXT = 300;

export default function CoachLogPanel({ studentId, currentUserId, mode }: CoachLogPanelProps) {
  const { t, i18n } = useTranslation();

  const [entries, setEntries] = useState<CoachLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [authorName, setAuthorName] = useState('');

  const [isAdding, setIsAdding] = useState(false);
  const [text, setText] = useState('');
  const [type, setType] = useState<EntryType>('observation');
  const [isSaving, setIsSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);

  // --- POBIERANIE WPISÓW ---
  useEffect(() => {
    if (!studentId) return;
    setIsLoading(true);
    const fetchEntries = async () => {
      try {
        const snap = await getDocs(query(
          collection(db, `users/${studentId}/coachLog`),
          orderBy('createdAt', 'desc')
        ));
        const list: CoachLogEntry[] = snap.docs.map(d => {
          const data = d.data();
          const createdAt = data.createdAt?.toMillis ? data.createdAt.toMillis()
                         : data.createdAt?.seconds  ? data.createdAt.seconds * 1000
                         : (typeof data.createdAt === 'number' ? data.createdAt : 0);
          return {
            id: d.id,
            authorId: data.authorId || '',
            authorName: data.authorName || 'Coach',
            text: data.text || '',
            type: (data.type as EntryType) || 'observation',
            createdAt,
          };
        });
        setEntries(list);
      } catch (e) {
        console.error('CoachLog: błąd pobierania', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchEntries();
  }, [studentId]);

  // --- POBIERANIE WŁASNEGO IMIENIA (tylko mode='coach') ---
  useEffect(() => {
    if (mode !== 'coach' || !currentUserId) return;
    const cacheKey = `grotX_userName_${currentUserId}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) { setAuthorName(cached); return; }
    const fetchName = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', currentUserId));
        if (userDoc.exists()) {
          const d = userDoc.data();
          const name = `${d.firstName || ''} ${d.lastName || ''}`.trim() || t('coachLog.defaultCoachName', { defaultValue: 'Trainer' });
          setAuthorName(name);
          try { localStorage.setItem(cacheKey, name); } catch { /* ignore */ }
        }
      } catch (e) { console.error('CoachLog: błąd pobierania imienia', e); }
    };
    fetchName();
  }, [mode, currentUserId, t]);

  // --- ZAPIS NOWEGO WPISU ---
  const handleSave = async () => {
    const cleanText = text.trim().slice(0, MAX_TEXT);
    if (!cleanText) return;
    setIsSaving(true);
    try {
      const docRef = await addDoc(collection(db, `users/${studentId}/coachLog`), {
        authorId: currentUserId,
        authorName: authorName || t('coachLog.defaultCoachName', { defaultValue: 'Trainer' }),
        text: cleanText,
        type,
        createdAt: serverTimestamp(),
      });
      // Optymistyczna aktualizacja — wpis pojawia się od razu, bez refetchu
      setEntries(prev => [{
        id: docRef.id,
        authorId: currentUserId,
        authorName: authorName || t('coachLog.defaultCoachName', { defaultValue: 'Trainer' }),
        text: cleanText,
        type,
        createdAt: Date.now(),
      }, ...prev]);
      setText('');
      setType('observation');
      setIsAdding(false);
    } catch (e) {
      console.error('CoachLog: błąd zapisu', e);
    }
    setIsSaving(false);
  };

  // --- USUWANIE WPISU ---
  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, `users/${studentId}/coachLog/${id}`));
      setEntries(prev => prev.filter(en => en.id !== id));
    } catch (e) {
      console.error('CoachLog: błąd usuwania', e);
    }
    setConfirmDelete(null);
  };

  // --- VOICE TO TEXT ---
  const startListening = () => {
    if (!SpeechRecognition) {
      setSpeechError('Voice input not supported in your browser');
      return;
    }

    const recognition = new SpeechRecognition();
    const speechLang = LANGUAGE_MAP[i18n.language] || 'de-DE';

    recognition.lang = speechLang;
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
      setSpeechError(null);
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        setText(prev => (prev + ' ' + finalTranscript).trim().slice(0, MAX_TEXT));
      }
    };

    recognition.onerror = (event: any) => {
      setSpeechError(event.error);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const stopListening = () => {
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.stop();
    }
  };

  const formatDate = (ts: number) => {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString(i18n.language, { day: '2-digit', month: 'short' });
  };

  return (
    <div className="bg-white rounded-[20px] border border-gray-100 shadow-sm overflow-hidden">
      {/* NAGŁÓWEK */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#0a3a2a] rounded-lg flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[#fed33e] text-[15px]">menu_book</span>
          </div>
          <div className="leading-tight">
            <h3 className="text-sm font-black text-[#0a3a2a]">{t('coachLog.title', { defaultValue: 'Trainer-Tagebuch' })}</h3>
            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">{t('coachLog.subtitle', { defaultValue: 'Sichtbar für alle Trainer' })} · {entries.length}</p>
          </div>
        </div>
        {mode === 'coach' && !isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="bg-[#0a3a2a] text-[#fed33e] px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center gap-1 shrink-0"
          >
            <span className="material-symbols-outlined text-[14px]">add</span>
            {t('coachLog.addBtn', { defaultValue: 'Eintrag' })}
          </button>
        )}
      </div>

      {/* FORMULARZ DODAWANIA */}
      {mode === 'coach' && isAdding && (
        <div className="p-3 bg-gray-50 border-b border-gray-100 space-y-2 animate-fade-in">
          {/* Wybór typu wpisu */}
          <div className="grid grid-cols-4 gap-1.5">
            {(Object.keys(TYPE_CONFIG) as EntryType[]).map(key => {
              const cfg = TYPE_CONFIG[key];
              const isActive = type === key;
              return (
                <button
                  key={key}
                  onClick={() => setType(key)}
                  className={`p-2 rounded-lg flex flex-col items-center gap-0.5 transition-all border ${isActive ? 'shadow-sm' : 'opacity-60 border-transparent bg-white'}`}
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

          {/* Treść */}
          <div className="relative">
            <textarea
              value={text}
              onChange={e => setText(e.target.value.slice(0, MAX_TEXT))}
              maxLength={MAX_TEXT}
              placeholder={t('coachLog.placeholder', { defaultValue: 'Schreibe einen Eintrag für die anderen Trainer…' })}
              className="w-full bg-white border border-gray-200 rounded-lg p-2.5 text-[11px] font-bold text-[#333] outline-none focus:border-[#0a3a2a] resize-none h-20 leading-snug pr-10"
            />
            {SpeechRecognition && (
              <button
                onClick={isListening ? stopListening : startListening}
                className={`absolute right-2 top-2 p-2 rounded-lg transition-all ${
                  isListening
                    ? 'bg-red-100 text-red-500'
                    : 'text-gray-400 hover:text-[#0a3a2a] hover:bg-gray-100'
                }`}
                title={isListening ? 'Stop recording' : 'Start voice input'}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {isListening ? 'mic' : 'mic_none'}
                </span>
              </button>
            )}
          </div>
          {speechError && (
            <p className="text-[8px] font-bold text-red-500 mt-1">{speechError}</p>
          )}

          {/* Stopka — licznik + przyciski */}
          <div className="flex justify-between items-center">
            <span className={`text-[8px] font-bold ${text.length >= MAX_TEXT ? 'text-red-500' : 'text-gray-400'}`}>{text.length}/{MAX_TEXT}</span>
            <div className="flex gap-2">
              <button
                onClick={() => { setIsAdding(false); setText(''); }}
                className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-2"
              >
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
      )}

      {/* LISTA WPISÓW */}
      <div className="divide-y divide-gray-50">
        {isLoading ? (
          <div className="p-6 text-center">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('coachLog.loading', { defaultValue: 'Lädt…' })}</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="p-6 text-center">
            <span className="material-symbols-outlined text-gray-200 text-3xl mb-1 block">history_edu</span>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('coachLog.empty', { defaultValue: 'Noch keine Einträge' })}</p>
            {mode === 'coach' && (
              <p className="text-[9px] font-medium text-gray-300 mt-1">{t('coachLog.emptyCoachHint', { defaultValue: 'Hinterlasse den ersten Eintrag für das Trainerteam' })}</p>
            )}
          </div>
        ) : (
          entries.map(entry => {
            const cfg = TYPE_CONFIG[entry.type] || TYPE_CONFIG.observation;
            const canDelete = mode === 'coach' && entry.authorId === currentUserId;
            return (
              <div key={entry.id} className="p-3 flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: cfg.bg }}>
                  <span className="material-symbols-outlined text-[14px]" style={{ color: cfg.color }}>{cfg.icon}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 mb-0.5">
                    <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: cfg.color }}>
                      {t(cfg.labelKey, { defaultValue: cfg.labelDefault })}
                    </span>
                    <span className="text-[8px] font-bold text-gray-400 shrink-0">{formatDate(entry.createdAt)}</span>
                  </div>
                  <p className="text-[11px] font-bold text-[#333] leading-snug whitespace-pre-wrap break-words">{entry.text}</p>
                  <p className="text-[9px] font-bold text-gray-400 mt-1">— {entry.authorName}</p>
                </div>

                {canDelete && (
                  <button
                    onClick={() => setConfirmDelete(entry.id)}
                    className="text-gray-300 hover:text-red-500 transition-colors shrink-0 p-0.5"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* MODAL POTWIERDZENIA USUNIĘCIA */}
      {confirmDelete && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[400000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-[24px] p-6 max-w-sm w-full text-center shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="material-symbols-outlined text-red-500">delete</span>
            </div>
            <h3 className="text-base font-black text-[#0a3a2a] mb-2">{t('coachLog.deleteTitle', { defaultValue: 'Eintrag löschen?' })}</h3>
            <p className="text-[11px] font-bold text-gray-500 mb-5 leading-relaxed">{t('coachLog.deleteDesc', { defaultValue: 'Diese Aktion kann nicht rückgängig gemacht werden.' })}</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl font-black uppercase text-[10px] tracking-widest">{t('coachLog.cancel', { defaultValue: 'Abbrechen' })}</button>
              <button onClick={() => handleDelete(confirmDelete)} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-black uppercase text-[10px] tracking-widest">{t('coachLog.delete', { defaultValue: 'Löschen' })}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <style>{`
        .animate-fade-in { animation: fadeIn 0.2s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
