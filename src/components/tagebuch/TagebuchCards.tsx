import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import TopicPicker from '../TopicPicker';
import type { SessionInsight } from './sessionInsights';

// --- TYPY WPISÓW OSI CZASU ---
// Read-model złożony z istniejących kolekcji — nic nie jest zapisywane w nowym
// formacie poza opcjonalnym `sessionId` w privateNotes (notatka przypięta do sesji).

export interface TbPrivateNote {
  id: string;
  text: string;
  topics: string[];
  sessionId?: string;
  ts: number;
}

export interface TbSession {
  id: string;
  ts: number;
  date: string;          // format z zapisu sesji (pl-PL), przekazywany dalej do Stats
  isTech: boolean;
  meters: number;        // 0 = nieznany (kolor paska środkowy)
  distKey: string;       // distanceKey — ten sam kubełek co w statystykach
  label: string;
  score: number;
  arrows: number;
  note: string;
  isNotePublic: boolean;
  editCount: number;
  coachNote: string;
  topics: string[];
  coachTopics: string[];
}

export interface TbCoachEntry {
  id: string;
  text: string;
  type: string;
  authorName: string;
  topics: string[];
  ts: number;
}

export const SESSION_NOTE_MAX = 250;   // jak w StatsView/NoteModule
export const SESSION_NOTE_EDITS = 2;   // limit edycji notatki przy sesji
const PRIVATE_NOTE_MAX = 1000;

const COACH_ENTRY_TYPES: Record<string, { icon: string; labelKey: string; labelDefault: string }> = {
  observation: { icon: 'visibility',    labelKey: 'coachLog.typeObservation', labelDefault: 'Beobachtung' },
  tip:         { icon: 'lightbulb',     labelKey: 'coachLog.typeTip',         labelDefault: 'Tipp' },
  goal:        { icon: 'flag',          labelKey: 'coachLog.typeGoal',        labelDefault: 'Ziel' },
  flag:        { icon: 'priority_high', labelKey: 'coachLog.typeFlag',        labelDefault: 'Wichtig' },
};

export function NewBadge() {
  const { t } = useTranslation();
  return (
    <span className="shrink-0 bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md">
      {t('tagebuch.neu')}
    </span>
  );
}

// Kolory kart — klasy tb-* w src/tailwind.css (jasny i ciemny motyw).
// Karta ma mniejsze lewe rogi, bo zaokrąglony gruby pasek wygląda jak nawias.
const CARD_SHAPE = 'tb-card border rounded-l-md rounded-r-2xl shadow-sm';

// Zieleń paska rośnie z dystansem: do 18 m, 20–30, 40–50, 60–70, 90 m.
function distanceTier(meters: number): string {
  if (!meters) return 'tb-d2';
  if (meters <= 18) return 'tb-d1';
  if (meters <= 30) return 'tb-d2';
  if (meters <= 50) return 'tb-d3';
  if (meters <= 70) return 'tb-d4';
  return 'tb-d5';
}

function TopicChips({ topics, tone = 'emerald' }: { topics: string[]; tone?: 'emerald' | 'indigo' | 'amber' | 'onTint' }) {
  const { t } = useTranslation();
  if (!topics.length) return null;
  const cls = tone === 'indigo'
    ? 'bg-indigo-50 text-indigo-600 border-indigo-100'
    : tone === 'amber'
    ? 'bg-white text-amber-800 border-amber-100'
    : tone === 'onTint'
    ? 'bg-white text-emerald-700 border-emerald-200'
    : 'bg-emerald-50 text-emerald-700 border-emerald-100';
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {topics.map(id => (
        <span key={id} className={`border px-2 py-0.5 rounded-full text-[9px] font-black ${cls}`}>
          {t(`sessionSetup.topic_${id}`)}
        </span>
      ))}
    </div>
  );
}

// --- EDYTOR NOTATKI ---
// Używany na górze dziennika (zawsze prywatna) i przy sesji („+ Notiz",
// z przełącznikiem widoczności, jeśli sesję da się jeszcze opisać dla trenera).
export function NoteComposer({ allowShare, autoFocus, onSave, onCancel }: {
  allowShare: boolean;
  autoFocus?: boolean;
  onSave: (text: string, topics: string[], shared: boolean) => Promise<void>;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [showTopics, setShowTopics] = useState(false);
  const [shared, setShared] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const max = shared ? SESSION_NOTE_MAX : PRIVATE_NOTE_MAX;

  const grow = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  const voice = useVoiceInput({
    onResult: (result) => {
      setText(prev => (prev ? `${prev} ${result}` : result).slice(0, max));
      requestAnimationFrame(grow);
    },
  });

  const handleSave = async () => {
    const clean = text.trim().slice(0, max);
    if (!clean || isSaving) return;
    setIsSaving(true);
    setError(false);
    try {
      await onSave(clean, topics, shared);
      setText('');
      setTopics([]);
      setShowTopics(false);
      setShared(false);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } catch (e) {
      console.error('Tagebuch: błąd zapisu notatki', e);
      setError(true);
    }
    setIsSaving(false);
  };

  return (
    <div className={`bg-white rounded-2xl border p-3 transition-colors ${voice.isListening ? 'border-red-300' : 'border-gray-200'}`}>
      {voice.isListening ? (
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">{t('tagebuch.recording')}</span>
        </div>
      ) : !allowShare && (
        <div className="flex items-center gap-1 mb-1.5 px-1 text-[10px] font-black text-indigo-500">
          <span className="material-symbols-outlined text-[13px]">lock</span>
          {t('tagebuch.onlyYou')}
        </div>
      )}
      <textarea
        ref={textareaRef}
        autoFocus={autoFocus}
        value={text}
        onChange={e => { setText(e.target.value.slice(0, max)); grow(); }}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave(); }}
        placeholder={t('tagebuch.notePlaceholder')}
        rows={2}
        className="w-full text-[13px] font-medium text-gray-700 placeholder-gray-300 resize-none outline-none leading-relaxed"
        style={{ minHeight: '44px' }}
      />

      {showTopics && (
        <div className="mt-2">
          <TopicPicker selectedTopics={topics} onChange={setTopics} />
        </div>
      )}

      {allowShare && (
        <div className="flex bg-gray-50 rounded-xl p-0.5 mt-2">
          <button
            onClick={() => setShared(false)}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-black transition-all ${!shared ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-400'}`}
          >
            <span className="material-symbols-outlined text-[14px]">lock</span>
            {t('tagebuch.onlyYou')}
          </button>
          <button
            onClick={() => { setShared(true); setText(prev => prev.slice(0, SESSION_NOTE_MAX)); }}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-black transition-all ${shared ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-400'}`}
          >
            <span className="material-symbols-outlined text-[14px]">visibility</span>
            {t('tagebuch.visibleCoach')}
          </button>
        </div>
      )}

      {error && <p className="text-[10px] font-bold text-red-500 mt-2">{t('tagebuch.saveError')}</p>}

      <div className="flex items-center gap-2 mt-2">
        {voice.isSupported && (
          <button
            onClick={voice.isListening ? voice.stopListening : () => voice.startListening()}
            className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all active:scale-95 ${voice.isListening ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500'}`}
            aria-label={t('tagebuch.mic')}
          >
            <span className="material-symbols-outlined text-[18px]">{voice.isListening ? 'stop' : 'mic'}</span>
          </button>
        )}
        <button
          onClick={() => setShowTopics(v => !v)}
          className={`h-8 px-2.5 flex items-center gap-1 rounded-xl text-[10px] font-black transition-all active:scale-95 ${showTopics || topics.length ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}
        >
          <span className="material-symbols-outlined text-[16px]">psychology</span>
          {topics.length > 0 ? topics.length : t('tagebuch.topic')}
        </button>
        <div className="flex-1" />
        {onCancel && (
          <button
            onClick={onCancel}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500 active:scale-95 transition-all"
            aria-label={t('tagebuch.cancel')}
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={!text.trim() || isSaving}
          className="shrink-0 bg-[#0a3a2a] text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl disabled:opacity-40 active:scale-95 transition-all"
        >
          {t('tagebuch.save')}
        </button>
      </div>
    </div>
  );
}

// --- NOTATKA PRYWATNA ---
function PrivateNoteBody({ note, onDelete }: { note: TbPrivateNote; onDelete: (id: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  return (
    <div>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-gray-700 leading-relaxed whitespace-pre-wrap break-words">{note.text}</p>
          <TopicChips topics={note.topics} tone="indigo" />
        </div>
        <button
          onClick={() => setConfirm(v => !v)}
          className={`shrink-0 active:scale-90 transition-all ${confirm ? 'text-red-400' : 'text-gray-200 hover:text-red-400'}`}
          aria-label={t('tagebuch.delete')}
        >
          <span className="material-symbols-outlined text-[18px]">delete</span>
        </button>
      </div>
      {confirm && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] font-black text-red-500 flex-1">{t('tagebuch.deleteNoteTitle')}</span>
          <button onClick={() => setConfirm(false)} className="px-3 py-1 bg-gray-100 text-gray-500 rounded-lg font-black text-[9px] uppercase tracking-widest">
            {t('tagebuch.cancel')}
          </button>
          <button onClick={() => onDelete(note.id)} className="px-3 py-1 bg-red-500 text-white rounded-lg font-black text-[9px] uppercase tracking-widest">
            {t('tagebuch.delete')}
          </button>
        </div>
      )}
    </div>
  );
}

export function PrivateNoteCard({ note, time, onDelete }: { note: TbPrivateNote; time: string; onDelete: (id: string) => Promise<void> }) {
  const { t } = useTranslation();
  return (
    <div className={`${CARD_SHAPE} tb-private bg-white border-gray-200 p-3`}>
      <div className="flex items-center gap-1 text-[10px] font-black text-indigo-600 mb-1">
        <span className="material-symbols-outlined text-[14px]">lock</span>
        <span className="flex-1">{t('tagebuch.onlyYou')}</span>
        {time && <span className="text-[10px] font-bold text-gray-400">{time}</span>}
      </div>
      <PrivateNoteBody note={note} onDelete={onDelete} />
    </div>
  );
}

// --- WPIS TRENERA (coachLog) ---
export function CoachEntryCard({ entry, time, isNew }: { entry: TbCoachEntry; time: string; isNew: boolean }) {
  const { t } = useTranslation();
  const cfg = COACH_ENTRY_TYPES[entry.type] || COACH_ENTRY_TYPES.observation;
  return (
    <div className={`${CARD_SHAPE} tb-coach bg-white border-amber-200 p-3`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="flex items-center gap-1 text-[10px] font-black text-amber-700 min-w-0">
          <span className="material-symbols-outlined text-[14px]">menu_book</span>
          <span className="truncate">
            {t('tagebuch.coachEntry')} · {t(cfg.labelKey, { defaultValue: cfg.labelDefault })}
          </span>
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {time && <span className="text-[10px] font-bold text-gray-400">{time}</span>}
          {isNew && <NewBadge />}
        </span>
      </div>
      <p className="text-[12px] font-medium text-gray-700 leading-relaxed whitespace-pre-wrap break-words">{entry.text}</p>
      <p className="text-[10px] font-bold text-gray-400 mt-1">— {entry.authorName}</p>
      <TopicChips topics={entry.topics} />
    </div>
  );
}

// --- KARTA TRENINGU ---
// Notatka ucznia, notatki prywatne przypięte do sesji i Anmerkung trenera
// w jednym miejscu — uwaga trenera jest przyklejona do treningu, którego dotyczy.
// Średnia, różnica do poprzedniego treningu na tym dystansie, odznaka rekordu.
function InsightLine({ insight }: { insight: SessionInsight }) {
  const { t, i18n } = useTranslation();
  const num = (v: number, digits: number) =>
    v.toLocaleString(i18n.language, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const d = insight.delta;
  const value = d ? (d.kind === 'pts' ? Math.round(d.value) : Math.round(d.value * 100) / 100) : 0;
  const text = d && (d.kind === 'pts' ? num(Math.abs(value), 0) : `${num(Math.abs(value), 2)} ${t('tagebuch.avgUnit')}`);
  return (
    <span className="block text-[10px] font-bold text-gray-500 truncate">
      {t('tagebuch.avgShort', { avg: num(insight.avg, 2) })}
      {d && (
        value === 0 ? (
          <span className="text-gray-400"> · = {t('tagebuch.vsLast')}</span>
        ) : (
          <span className={value > 0 ? 'text-emerald-700' : 'text-red-600'}>
            {' · '}{value > 0 ? '▲ +' : '▼ −'}{text} {t('tagebuch.vsLast')}
          </span>
        )
      )}
    </span>
  );
}

function InsightBadge({ insight }: { insight?: SessionInsight }) {
  const { t } = useTranslation();
  const b = insight?.badge;
  if (!b) return null;
  return (
    <span className="shrink-0 flex items-center gap-0.5 bg-[#fed33e] text-[#0a3a2a] text-[9px] font-black px-1.5 py-0.5 rounded-md">
      <span className="material-symbols-outlined text-[11px]">trophy</span>
      {b.kind === 'record' ? t('tagebuch.record') : t('tagebuch.bestOfLast', { count: b.count })}
    </span>
  );
}

export function SessionCard({ session, time, insight, linkedNotes, hasCoach, isNew, onOpen, onAddNote, onDeleteNote }: {
  session: TbSession;
  time: string;
  insight?: SessionInsight;
  linkedNotes: TbPrivateNote[];
  hasCoach: boolean;
  isNew: boolean;
  onOpen: () => void;
  onAddNote: (session: TbSession, text: string, topics: string[], shared: boolean) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [composing, setComposing] = useState(false);

  const title = session.isTech
    ? t('tagebuch.techTraining')
    : session.label ? `${t('tagebuch.training')} · ${session.label}` : t('tagebuch.training');
  const stats = session.isTech
    ? `${session.arrows} ${t('common.arrows')}`
    : `${session.score} ${t('tagebuch.rings')} · ${session.arrows} ${t('common.arrows')}`;

  // Notatkę „dla trenera" da się dopisać tylko raz do pustej sesji w limicie
  // edycji — resztę zawsze można dopisać jako prywatną.
  const canShare = hasCoach && !session.note && session.editCount < SESSION_NOTE_EDITS;
  const hasContent = !!session.note || !!session.coachNote || linkedNotes.length > 0 || session.topics.length > 0;

  const header = (
    <div className="flex items-center gap-2">
      <button onClick={onOpen} className="flex-1 min-w-0 flex items-center gap-2.5 text-left active:opacity-60">
        <span className="tb-icon w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
          <span className={`material-symbols-outlined text-[18px] ${session.isTech ? 'text-sky-600' : 'text-emerald-600'}`}>{session.isTech ? 'fitness_center' : 'target'}</span>
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="text-[13px] font-black text-[#0a3a2a] truncate">{title}</span>
            <InsightBadge insight={insight} />
          </span>
          <span className="block text-[10px] font-bold text-gray-500 truncate">
            {time ? `${time} · ` : ''}{stats}
          </span>
          {insight && !session.isTech && <InsightLine insight={insight} />}
        </span>
      </button>
      {!composing && (
        <button
          onClick={() => setComposing(true)}
          className="shrink-0 flex items-center gap-0.5 text-[10px] font-black text-emerald-700 px-1.5 py-1 rounded-lg active:bg-emerald-50"
        >
          <span className="material-symbols-outlined text-[14px]">add</span>
          {t('tagebuch.noteShort')}
        </button>
      )}
    </div>
  );

  return (
    <div className={`${CARD_SHAPE} ${session.isTech ? 'tb-tech' : `tb-dist ${distanceTier(session.meters)}`} ${hasContent || composing ? 'p-3' : 'px-3 py-2.5'}`}>
      {header}
      <TopicChips topics={session.topics} tone="onTint" />

      {session.note && (
        <div className="mt-2">
          <div className="flex items-center gap-1 text-[10px] font-black mb-0.5">
            {session.isNotePublic ? (
              <span className="flex items-center gap-1 text-emerald-700">
                <span className="material-symbols-outlined text-[13px]">{hasCoach ? 'visibility' : 'edit_note'}</span>
                {hasCoach ? t('tagebuch.visibleCoach') : t('tagebuch.myNote')}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-indigo-600">
                <span className="material-symbols-outlined text-[13px]">lock</span>
                {t('tagebuch.onlyYou')}
              </span>
            )}
          </div>
          <p className="text-[12px] font-medium text-gray-600 leading-relaxed whitespace-pre-wrap break-words">„{session.note}"</p>
        </div>
      )}

      {linkedNotes.map(n => (
        <div key={n.id} className="mt-2 bg-indigo-50 rounded-xl p-2.5">
          <div className="flex items-center gap-1 text-[10px] font-black text-indigo-600 mb-0.5">
            <span className="material-symbols-outlined text-[13px]">lock</span>
            {t('tagebuch.onlyYou')}
          </div>
          <PrivateNoteBody note={n} onDelete={onDeleteNote} />
        </div>
      ))}

      {/* Trener = brąz: wpis trenera ma złocisty pasek, uwaga do treningu
          ciemniejszy brąz — ta sama rodzina kolorów, dwa odcienie. */}
      {session.coachNote && (
        <div className="mt-2 bg-amber-50 border-l-4 border-amber-700 rounded-l-sm rounded-r-xl p-2.5">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="flex items-center gap-1 text-[10px] font-black text-amber-800">
              <span className="material-symbols-outlined text-[14px]">sports</span>
              {t('tagebuch.coachNote')}
            </span>
            {isNew && <NewBadge />}
          </div>
          <p className="text-[12px] font-bold text-amber-900 leading-relaxed whitespace-pre-wrap break-words">„{session.coachNote}"</p>
          <TopicChips topics={session.coachTopics} tone="amber" />
        </div>
      )}

      {composing && (
        <div className="mt-2">
          <NoteComposer
            allowShare={canShare}
            autoFocus
            onSave={async (text, topics, shared) => {
              await onAddNote(session, text, topics, shared);
              setComposing(false);
            }}
            onCancel={() => setComposing(false)}
          />
        </div>
      )}
    </div>
  );
}
