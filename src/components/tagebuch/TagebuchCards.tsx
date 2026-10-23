import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import TopicPicker from '../TopicPicker';
import type { SessionInsight } from './sessionInsights';
import { topicLabel } from '../../constants/trainingTopics';
import TopicLinks from '../TopicLinks';
import { isTopicOpen, type FocusMilestone, type FocusSnapRef, type SessionFocus, type TrainingTopic } from '../../utils/focus';

// --- TYPY WPISÓW OSI CZASU ---
// Read-model złożony z istniejących kolekcji — nic nie jest zapisywane w nowym
// formacie poza opcjonalnym `sessionId` w privateNotes (notatka przypięta do sesji)
// i wpisami `kind: 'focusMilestone'` (ukończony / zakończony fokus, utils/focus.ts).

export interface TbPrivateNote {
  id: string;
  text: string;
  topics: string[];
  sessionId?: string;
  ts: number;
  milestone?: FocusMilestone;   // wpis „fokus ukończony / zakończony” (kind: 'focusMilestone')
  important?: boolean;          // Meilenstein — punkt zwrotny (nowy łuk, ważne wydarzenie)
  shared?: boolean;             // uczeń udostępnił wpis trenerom (privateNotes.shared)
  title?: string;               // Meilenstein: tytuł (text = opis)
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
  endSums: number[];     // wyniki serii (ends[].total_sum); [] = brak serii (np. zawody)
  note: string;
  isNotePublic: boolean;
  editCount: number;
  coachNote: string;
  coachSeen: boolean;    // trener odhaczył notatkę bez odpowiedzi
  topics: string[];
  coachTopics: string[];
  // [DWA FOKUSY] Pod jakie fokusy był trening (FocusSessionRef — liczenie kropek)
  snaps: FocusSnapRef[];
  decided?: boolean;
  focuses: SessionFocus[]; // pełne migawki — przełącznik w dzienniku zapisuje listę z powrotem
  topicId?: string;      // [TEMAT TRENINGU] trening pod ten temat (id wpisu 'topic')
  trainingTopic?: { text: string; topic: string };
  // [ARENA] Trening z bitwy: tryb i wynik (place po zakończeniu gry, live = trwa).
  battle?: { id: string; mode: string; place?: number; players?: number; live?: boolean };
  isTournament?: boolean; // wynik zawodów (type 'Turniej') — ciemnozielona karta jak na Home
  // Zawody: wynik Durchgangów (roundScores albo z serii 1–6 / 7–12) i liczba X/10/9.
  rounds?: number[];
  distanceText?: string;  // zawody: strzelany dystans („70m”, „18m barebow”)
  counts?: { x: number; ten: number; nine: number };
}

export interface TbCoachEntry {
  id: string;
  text: string;
  type: string;
  authorName: string;
  topics: string[];
  ts: number;
  trainingTopic?: TrainingTopic;   // tylko type === 'topic'
}

export const SESSION_NOTE_MAX = 250;   // jak w StatsView/NoteModule
export const SESSION_NOTE_EDITS = 2;   // limit edycji notatki przy sesji
const PRIVATE_NOTE_MAX = 1000;
const MILESTONE_TITLE_MAX = 120;   // LUSTRO: firestore.rules (privateNotes, title ≤ 120)

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
export const CARD_SHAPE = 'tb-card border rounded-l-md rounded-r-2xl shadow-sm';
// Wspólny układ wszystkich wpisów (user 2026-10-15: „jak wpis treningu”):
// mocny pasek z lewej, ikona blisko krawędzi, treść obok, godzina w prawym
// górnym rogu. Ikona mniej odsunięta (pl-2) niż reszta krawędzi.
export const CARD_PAD = 'pl-2 pr-3 py-2.5';

/**
 * Nagłówek wpisu — ten sam układ w każdej karcie (user 2026-10-23): u góry typ
 * (wersaliki w kolorze wpisu), pod nim pogrubiony tytuł, dopiero niżej
 * szczegóły (data, autor, wynik). Godzina w prawym górnym rogu.
 */
export function EntryHeading({ kind, kindCls, title, titleCls = 'text-[#0a3a2a]' }: {
  kind: string;
  kindCls: string;
  title?: React.ReactNode;
  titleCls?: string;
}) {
  return (
    // Typ jako mała etykieta, tytuł pod nią (user 2026-10-23) — tytuły zaczynają
    // się zawsze w tym samym miejscu, jak na karcie fokusu.
    <span className="block min-w-0">
      <span className={`block text-[9px] font-black uppercase tracking-widest leading-tight ${kindCls}`}>{kind}</span>
      {title && <span className={`block text-[13px] font-black leading-snug line-clamp-2 break-words ${titleCls}`}>{title}</span>}
    </span>
  );
}

export function EntryRow({ icon, iconCls, kind, kindCls, title, titleCls, meta, time, extra, children }: {
  icon: string;
  iconCls: string;        // kolor ikony (tło: tb-icon)
  kind: string;           // co to jest: Training, Turnier, Notiz…
  kindCls: string;
  title?: React.ReactNode;
  titleCls?: string;
  meta?: React.ReactNode; // linia pod nagłówkiem: data, autor, grupa
  time?: string;
  extra?: React.ReactNode; // przy godzinie: NEU, kosz
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="tb-icon w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
        <span className={`material-symbols-outlined text-[18px] ${iconCls}`}>{icon}</span>
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-1.5">
          <div className="flex-1 min-w-0"><EntryHeading kind={kind} kindCls={kindCls} title={title} titleCls={titleCls} /></div>
          {extra}
          {time && <span className="tb-time shrink-0 text-[10px] font-bold text-gray-400 mt-0.5">{time}</span>}
        </div>
        {meta && <p className="text-[10px] font-bold text-gray-500 truncate mt-0.5">{meta}</p>}
        {children}
      </div>
    </div>
  );
}

// Zieleń paska rośnie z dystansem: do 18 m, 20–30, 40–50, 60–70, 90 m.
function distanceTier(meters: number): string {
  if (!meters) return 'tb-d2';
  if (meters <= 18) return 'tb-d1';
  if (meters <= 30) return 'tb-d2';
  if (meters <= 50) return 'tb-d3';
  if (meters <= 70) return 'tb-d4';
  return 'tb-d5';
}

export function TopicChips({ topics, tone = 'emerald' }: { topics: string[]; tone?: 'emerald' | 'indigo' | 'amber' | 'onTint' }) {
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
          {topicLabel(id, t)}
        </span>
      ))}
    </div>
  );
}

// --- EDYTOR NOTATKI ---
// Używany na górze dziennika (zawsze prywatna) i przy sesji („+ Notiz",
// z przełącznikiem widoczności, jeśli sesję da się jeszcze opisać dla trenera).
export function NoteComposer({ allowShare, autoFocus, onSave, onCancel, allowMilestone = false, bare = false, initial, shareKeepsLength = false }: {
  allowShare: boolean;
  autoFocus?: boolean;
  onSave: (text: string, topics: string[], shared: boolean, important: boolean, title: string) => Promise<void>;
  onCancel?: () => void;
  allowMilestone?: boolean; // przełącznik „Meilenstein” (nowy wpis z „+”)
  bare?: boolean;           // bez własnej ramki — w oknie NoteSheet
  initial?: { text: string; topics: string[]; important?: boolean; shared?: boolean; title?: string }; // edycja wpisu
  // Udostępnienie samego wpisu (privateNotes.shared) — bez skracania do limitu notatki sesji.
  shareKeepsLength?: boolean;
}) {
  const { t } = useTranslation();
  // Meilenstein ma tytuł i opis (user 2026-10-23); zwykła notatka — sam tekst.
  const [title, setTitle] = useState(initial?.title ?? '');
  const [text, setText] = useState(initial?.text ?? '');
  const [topics, setTopics] = useState<string[]>(initial?.topics ?? []);
  const [showTopics, setShowTopics] = useState(false);
  const [shared, setShared] = useState(!!initial?.shared);
  const [important, setImportant] = useState(!!initial?.important);
  const [showInfo, setShowInfo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const max = shared && !shareKeepsLength ? SESSION_NOTE_MAX : PRIVATE_NOTE_MAX;

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

  const asMilestone = allowMilestone && important;
  // Tytuł w każdym wpisie z okna (bare): przy notatce opcjonalny, przy Meilenstein wymagany.
  const withTitle = bare && allowMilestone;
  const cleanTitle = withTitle ? title.trim().slice(0, MILESTONE_TITLE_MAX) : '';
  // Meilenstein: wymagany tytuł, opis opcjonalny; notatka: wymagany tekst.
  const canSave = asMilestone ? !!cleanTitle : !!(text.trim() || cleanTitle);

  const handleSave = async () => {
    const clean = text.trim().slice(0, max);
    if (!canSave || isSaving) return;
    setIsSaving(true);
    setError(false);
    try {
      await onSave(clean, topics, shared, important, cleanTitle);
      setTitle('');
      setText('');
      setTopics([]);
      setShowTopics(false);
      setShared(false);
      setImportant(false);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } catch (e) {
      console.error('Tagebuch: błąd zapisu notatki', e);
      setError(true);
    }
    setIsSaving(false);
  };

  return (
    <div className={bare ? '' : `bg-white rounded-2xl border p-3 transition-colors ${voice.isListening ? 'border-red-300' : 'border-gray-200'}`}>
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
      {/* Tytuł (user 2026-10-23): w każdym wpisie, przy Meilenstein wymagany; niżej opis. */}
      {withTitle && (
        <input
          value={title}
          autoFocus={autoFocus}
          onChange={e => setTitle(e.target.value.slice(0, MILESTONE_TITLE_MAX))}
          placeholder={t(asMilestone ? 'tagebuch.milestoneTitlePlaceholder' : 'tagebuch.noteTitlePlaceholder')}
          maxLength={MILESTONE_TITLE_MAX}
          className="w-full mb-2 bg-gray-50 border border-gray-100 focus:border-emerald-300 focus:bg-white rounded-xl px-3 py-2.5 text-[14px] font-black text-[#0a3a2a] placeholder-gray-300 outline-none transition-colors"
        />
      )}
      <textarea
        ref={textareaRef}
        autoFocus={autoFocus && !withTitle}
        value={text}
        onChange={e => { setText(e.target.value.slice(0, max)); grow(); }}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave(); }}
        placeholder={t(withTitle ? 'tagebuch.milestoneDescPlaceholder' : 'tagebuch.notePlaceholder')}
        rows={bare ? 4 : 2}
        className={bare
          ? 'w-full bg-gray-50 border border-gray-100 focus:border-emerald-300 focus:bg-white rounded-xl px-3 py-2.5 text-[14px] font-medium text-gray-700 placeholder-gray-300 resize-none outline-none leading-relaxed transition-colors'
          : 'w-full text-[13px] font-medium text-gray-700 placeholder-gray-300 resize-none outline-none leading-relaxed'}
        style={{ minHeight: bare ? '104px' : '44px', maxHeight: bare ? '40vh' : undefined }}
      />

      {/* [MEILENSTEIN] (user 2026-10-23) Punkt zwrotny — wyróżniony w dzienniku
          i w filtrach; „i” wyjaśnia, na co to jest (naprawdę ważne wydarzenia). */}
      {allowMilestone && (
        <div className="mt-2">
          <div className={`flex items-center gap-1 rounded-xl border pl-1 pr-1 py-1 transition-colors ${important ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-100'}`}>
            <button
              type="button"
              role="switch"
              aria-checked={important}
              onClick={() => setImportant(v => !v)}
              className="flex-1 min-w-0 flex items-center gap-2 text-left active:scale-[0.99] transition-all"
            >
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${important ? 'bg-[#fed33e] text-[#0a3a2a]' : 'bg-white text-gray-400 border border-gray-200'}`}>
                <span className="material-symbols-outlined text-[18px]">star</span>
              </span>
              <span className="flex-1 min-w-0">
                <span className={`block text-[12px] font-black ${important ? 'text-amber-900' : 'text-gray-600'}`}>{t('tagebuch.milestoneToggle')}</span>
                <span className="block text-[10px] font-bold text-gray-400 truncate">{t('tagebuch.milestoneHint')}</span>
              </span>
              <span className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${important ? 'bg-amber-500' : 'bg-gray-300'}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${important ? 'left-[18px]' : 'left-0.5'}`} />
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowInfo(v => !v)}
              className={`w-8 h-8 shrink-0 flex items-center justify-center rounded-lg transition-colors ${showInfo ? 'text-amber-700 bg-white' : 'text-gray-400'}`}
              aria-label={t('tagebuch.milestoneInfoLabel')}
              aria-expanded={showInfo}
            >
              <span className="material-symbols-outlined text-[18px]">info</span>
            </button>
          </div>
          {showInfo && (
            <p className="mt-1.5 px-2.5 py-2 rounded-xl bg-amber-50/60 text-[11px] font-medium text-amber-900 leading-relaxed">
              {t('tagebuch.milestoneInfo')}
            </p>
          )}
        </div>
      )}

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
            onClick={() => { setShared(true); if (!shareKeepsLength) setText(prev => prev.slice(0, SESSION_NOTE_MAX)); }}
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
          disabled={!canSave || isSaving}
          className="shrink-0 bg-[#0a3a2a] text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl disabled:opacity-40 active:scale-95 transition-all"
        >
          {t('tagebuch.save')}
        </button>
      </div>
    </div>
  );
}

// --- NOTATKA PRYWATNA ---
function PrivateNoteBody({ note, onDelete, onEdit, strong = false, privacyLine = false }: {
  note: TbPrivateNote;
  onDelete: (id: string) => Promise<void>;
  onEdit?: () => void;    // ołówek — okno edycji (NoteSheet)
  strong?: boolean;       // Meilenstein: tekst pogrubiony jak tytuł
  privacyLine?: boolean;  // „Nur für dich” pod tekstem (karta samej notatki)
}) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  return (
    <div>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {note.text && <p className={`leading-relaxed whitespace-pre-wrap break-words ${strong ? 'text-[13px] font-black text-[#0a3a2a]' : 'text-[12px] font-medium text-gray-700'}`}>{note.text}</p>}
          {/* Najpierw treść, potem kto widzi: tylko ty albo też trener (user 2026-10-23). */}
          {privacyLine && (note.shared ? (
            <p className="flex items-center gap-1 mt-0.5 text-[10px] font-bold text-emerald-700">
              <span className="material-symbols-outlined text-[12px]">visibility</span>{t('tagebuch.visibleCoach')}
            </p>
          ) : (
            <p className="flex items-center gap-1 mt-0.5 text-[10px] font-bold text-gray-400">
              <span className="material-symbols-outlined text-[12px]">lock</span>{t('tagebuch.onlyYou')}
            </p>
          ))}
          <TopicChips topics={note.topics} tone="indigo" />
        </div>
        <span className="shrink-0 flex items-center gap-1">
          {onEdit && (
            <button
              onClick={onEdit}
              className="text-gray-300 hover:text-emerald-600 active:scale-90 transition-all"
              aria-label={t('tagebuch.editEntry')}
            >
              <span className="material-symbols-outlined text-[18px]">edit</span>
            </button>
          )}
          <button
            onClick={() => setConfirm(v => !v)}
            className={`active:scale-90 transition-all ${confirm ? 'text-red-400' : 'text-gray-200 hover:text-red-400'}`}
            aria-label={t('tagebuch.delete')}
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </span>
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

export function PrivateNoteCard({ note, time, onDelete, onEdit }: { note: TbPrivateNote; time: string; onDelete: (id: string) => Promise<void>; onEdit?: () => void }) {
  const { t } = useTranslation();
  // Meilenstein — złoty pasek i gwiazdka; tytuł pod etykietą, opis pod nim.
  // Starsze bez tytułu: tekst pogrubiony jak tytuł.
  return note.important ? (
    <div className={`${CARD_SHAPE} tb-mark ${CARD_PAD}`}>
      <EntryRow icon="star" iconCls="text-[#b8860b]" kind={t('tagebuch.kindMilestone')} kindCls="text-[#a07400]" title={note.title || undefined} time={time}>
        <div className="mt-0.5"><PrivateNoteBody note={note} onDelete={onDelete} onEdit={onEdit} strong={!note.title} privacyLine /></div>
      </EntryRow>
    </div>
  ) : (
    <div className={`${CARD_SHAPE} tb-private ${CARD_PAD}`}>
      <EntryRow icon={note.shared ? 'visibility' : 'lock'} iconCls="text-indigo-500" kind={t('tagebuch.kindNote')} kindCls="text-indigo-600" title={note.title || undefined} time={time}>
        <div className="mt-0.5"><PrivateNoteBody note={note} onDelete={onDelete} onEdit={onEdit} privacyLine /></div>
      </EntryRow>
    </div>
  );
}

/**
 * [NOWY WPIS] (user 2026-10-23) „+” otwiera okno od dołu zamiast pola na
 * górze dziennika — z przełącznikiem „Meilenstein” dla ważnych wydarzeń.
 * Z `initial` to samo okno służy do edycji istniejącego wpisu.
 */
export function NoteSheet({ onSave, onClose, initial, canShare = false, standalone = true }: {
  onSave: (text: string, topics: string[], important: boolean, shared: boolean, title: string) => Promise<void>;
  onClose: () => void;
  initial?: { text: string; topics: string[]; important?: boolean; shared?: boolean; title?: string };
  canShare?: boolean;    // uczeń ma trenera — przełącznik „Für Trainer sichtbar”
  standalone?: boolean;  // false = notatka przypięta do treningu/zawodów: bez Meilenstein i udostępniania
}) {
  const { t } = useTranslation();
  const title = t(initial ? 'tagebuch.editEntry' : 'tagebuch.newEntry');
  const share = canShare && standalone;
  return createPortal(
    // U góry jak inne okna aplikacji (FocusModal), nie od dołu (user 2026-10-23) —
    // klawiatura telefonu nie zasłania pola.
    <div className="fixed inset-0 z-[120] flex items-start justify-center p-4 pt-[calc(env(safe-area-inset-top)+16px)]">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm tb-fade-in" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-[400px] bg-white rounded-[32px] shadow-2xl p-5 max-h-[85dvh] overflow-y-auto tb-fade-in"
      >
        <div className="flex items-center gap-2.5 mb-3">
          <span className="w-9 h-9 rounded-xl bg-[#0a3a2a] text-[#fed33e] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[20px]">edit_note</span>
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-black text-[#0a3a2a] leading-tight">{title}</p>
            {/* Z trenerem o widoczności decyduje przełącznik niżej. */}
            {!share && (
              <p className="text-[10px] font-bold text-gray-400 flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">lock</span>{t('tagebuch.onlyYou')}
              </p>
            )}
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center active:scale-90 transition-all" aria-label={t('tagebuch.cancel')}>
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <NoteComposer
          bare
          allowShare={share}
          shareKeepsLength
          allowMilestone={standalone}
          autoFocus
          initial={initial}
          onSave={async (text, topics, shared, important, title) => { await onSave(text, topics, important, share && shared, title); onClose(); }}
        />
      </div>
    </div>,
    document.body,
  );
}

// --- WPIS TRENERA (coachLog) ---
export function CoachEntryCard({ entry, time, isNew }: { entry: TbCoachEntry; time: string; isNew: boolean }) {
  const { t } = useTranslation();
  const cfg = COACH_ENTRY_TYPES[entry.type] || COACH_ENTRY_TYPES.observation;
  return (
    <div className={`${CARD_SHAPE} tb-coach ${CARD_PAD}`}>
      <EntryRow
        icon="menu_book"
        iconCls="text-amber-600"
        kind={t('tagebuch.coachEntry')}
        kindCls="text-amber-700"
        title={t(cfg.labelKey, { defaultValue: cfg.labelDefault })}
        meta={`— ${entry.authorName}`}
        time={time}
        extra={isNew ? <NewBadge /> : undefined}
      >
        <p className="text-[12px] font-medium text-gray-700 leading-relaxed whitespace-pre-wrap break-words mt-1">{entry.text}</p>
        <TopicChips topics={entry.topics} />
      </EntryRow>
    </div>
  );
}

/**
 * [TEMAT TRENINGU] Wpis „na treningu było…” (user 2026-10-15), fioletowy.
 * Otwarty (dziś) — sam temat. Zamknięty: ✓ trenowane (trening pod ten temat),
 * ✓ zapoznany (ackAt) albo przycisk „Zapoznałem się”.
 */
export function TrainingTopicCard({ entry, time, isNew, trained, onAck, autoOpen = false }: {
  entry: TbCoachEntry;
  time: string;
  isNew: boolean;
  trained: boolean;
  onAck: () => Promise<void>;
  // Wejście z karty tematu (Home, Vorbereitung) — opis i linki od razu rozwinięte (user 2026-10-23).
  autoOpen?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  // Opis i linki zwinięte (user 2026-10-22) — w zwiniętym widać tylko, ŻE są.
  const [more, setMore] = useState(autoOpen);
  useEffect(() => { if (autoOpen) setMore(true); }, [autoOpen]);
  const tt = entry.trainingTopic!;
  const open = isTopicOpen(tt);
  const day = new Date(`${tt.day}T12:00:00`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
  const linkCount = tt.links?.length || 0;
  const hasMore = !!tt.desc || linkCount > 0;
  // Status po zamknięciu tematu — mały, w stopce po prawej zamiast dużego przycisku.
  const status = open ? null : trained ? (
    <span className="shrink-0 whitespace-nowrap inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
      <span className="material-symbols-outlined text-[13px]">check</span>{t('tagebuch.topicTrained')}
    </span>
  ) : tt.ackAt ? (
    <span className="shrink-0 whitespace-nowrap inline-flex items-center gap-1 text-[10px] font-black text-violet-700 bg-white border border-violet-200 rounded-full px-2 py-0.5">
      <span className="material-symbols-outlined text-[13px]">visibility</span>{t('tagebuch.topicAcked')}
    </span>
  ) : (
    <button
      onClick={async () => { setBusy(true); try { await onAck(); } finally { setBusy(false); } }}
      disabled={busy}
      className="shrink-0 whitespace-nowrap inline-flex items-center gap-1 text-[10px] font-black text-white bg-violet-500 rounded-full px-2.5 py-1 active:scale-95 transition-all disabled:opacity-50"
    >
      <span className="material-symbols-outlined text-[13px]">visibility</span>{t('tagebuch.topicAck')}
    </button>
  );
  return (
    // Całe pole rozwija opis i linki (user 2026-10-22); przyciski w środku nie.
    <div
      className={`${CARD_SHAPE} tb-topic ${CARD_PAD} ${hasMore ? 'cursor-pointer' : ''}`}
      onClick={hasMore ? () => setMore(m => !m) : undefined}
      role={hasMore ? 'button' : undefined}
      aria-expanded={hasMore ? more : undefined}
    >
      <EntryRow
        icon="sports"
        iconCls="text-violet-600"
        kind={t('tagebuch.topicLabel')}
        kindCls="text-violet-700"
        title={entry.text}
        time={time}
        extra={isNew ? <NewBadge /> : undefined}
      >
      {/* Dzień i autor, a po prawej znak, że jest coś więcej (opis / linki) — bez osobnej stopki. */}
      <div className="flex items-center gap-2 mt-0.5">
        <p className="flex-1 min-w-0 truncate text-[10px] font-bold text-gray-500">{day} · {entry.authorName}</p>
        {hasMore && (
          <span
            className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-black text-violet-600"
            aria-label={[tt.desc ? t('tagebuch.topicDesc') : '', linkCount ? t('tagebuch.topicLinks', { count: linkCount }) : ''].filter(Boolean).join(', ')}
          >
            {!more && tt.desc && <span className="material-symbols-outlined text-[16px]">notes</span>}
            {!more && linkCount > 0 && (
              <span className="inline-flex items-center">
                <span className="material-symbols-outlined text-[16px]">link</span>{linkCount > 1 ? linkCount : null}
              </span>
            )}
            <span className={`material-symbols-outlined text-[16px] transition-transform ${more ? 'rotate-180' : ''}`}>expand_more</span>
          </span>
        )}
      </div>
      {/* Temat z listy po lewej, status / „Zapoznałem się” po prawej — w tym samym rzędzie. */}
      {(entry.topics.length > 0 || status) && (
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0"><TopicChips topics={entry.topics} /></div>
          {status && <div className="shrink-0 mt-1.5" onClick={e => e.stopPropagation()}>{status}</div>}
        </div>
      )}
      {more && (
        <div className="mt-2 pt-2 border-t border-violet-200/70 space-y-2" onClick={e => e.stopPropagation()}>
          {tt.desc && (
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-[16px] text-violet-500 shrink-0 mt-px">notes</span>
              <p className="flex-1 min-w-0 text-[12px] font-medium text-[#333] leading-snug whitespace-pre-wrap break-words">{tt.desc}</p>
            </div>
          )}
          {linkCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-violet-500 shrink-0">link</span>
              <TopicLinks links={tt.links} titles={tt.linkTitles} />
            </div>
          )}
        </div>
      )}
      </EntryRow>
    </div>
  );
}

/** [PROWADZONY TRENING] Trening, który użytkownik poprowadził jako trener. */
export interface TbLedTraining {
  id: string;           // `<groupId>_<day>`
  groupName: string;
  day: string;
  text: string;
  topic: string;
  note: string;         // prywatna notatka trenera z historii treningów
  ts: number;
}

/**
 * [PROWADZONY TRENING] (user 2026-10-15) Różowy = rola trenera (panel Gruppen
 * też różowy); fiolet zostaje dla tematów, które dostaje się od swojego trenera.
 */
export function LedTrainingCard({ entry, time }: { entry: TbLedTraining; time: string }) {
  const { t, i18n } = useTranslation();
  const day = new Date(`${entry.day}T12:00:00`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <div className={`${CARD_SHAPE} tb-led ${CARD_PAD}`}>
      <EntryRow icon="sports" iconCls="text-rose-600" kind={t('tagebuch.ledTraining')} kindCls="text-rose-700" title={entry.text} meta={`${entry.groupName} · ${day}`} time={time}>
        <TopicChips topics={entry.topic ? [entry.topic] : []} />
        {entry.note && (
          <p className="mt-1.5 flex items-start gap-1 text-[11px] font-medium text-gray-600 leading-relaxed whitespace-pre-wrap break-words">
            <span className="material-symbols-outlined text-[13px] text-rose-400 mt-0.5">lock</span>
            <span>„{entry.note}”</span>
          </p>
        )}
      </EntryRow>
    </div>
  );
}

/**
 * [ZALEGŁY TURNIEJ] (user 2026-10-23) Zawody z kalendarza, które już minęły,
 * a nie mają wyniku — stoją w dniu zawodów i pozwalają dopisać wynik później.
 */
export function MissedTournamentCard({ title, date, time, onEnter, onSkip }: { title: string; date: string; time: string; onEnter: () => void; onSkip: () => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const day = new Date(`${date}T12:00:00`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <div className={`${CARD_SHAPE} tb-tourney ${CARD_PAD}`}>
      <EntryRow icon="emoji_events" iconCls="text-[#0a3a2a]" kind={t('tagebuch.tournament')} kindCls="text-emerald-800" title={title} meta={`${day} · ${t('tagebuch.missedTournament')}`} time={time}>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            onClick={onEnter}
            className="inline-flex items-center gap-1 bg-[#fed33e] text-[#5d4a00] text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[15px]">edit_note</span>
            {t('calendar.modalEnterScore')}
          </button>
          {/* Choroba, wyjazd… (user 2026-10-23) — zawody zostają w dzienniku jako „nie startowałem”. */}
          <button
            onClick={async () => { setBusy(true); try { await onSkip(); } finally { setBusy(false); } }}
            disabled={busy}
            className="inline-flex items-center gap-1 bg-white border border-gray-200 text-gray-600 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl active:scale-95 transition-all disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[15px]">event_busy</span>
            {t('tagebuch.notStarted')}
          </button>
        </div>
      </EntryRow>
    </div>
  );
}

/**
 * [NIE STARTOWAŁEM] Zawody oznaczone „Nicht gestartet” zostają w dzienniku
 * w swoim dniu — z prywatnymi notatkami (privateNotes z sessionId = id terminu;
 * trener ich nie widzi, bo powodem bywa choroba) i cofnięciem.
 */
export function SkippedTournamentCard({ title, date, time, notes, onAddNote, onDeleteNote, onEditNote, onUndo }: {
  title: string;
  date: string;
  time: string;
  notes: TbPrivateNote[];
  onAddNote: (text: string, topics: string[]) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  onEditNote?: (note: TbPrivateNote) => void;
  onUndo: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const [composing, setComposing] = useState(false);
  const [busy, setBusy] = useState(false);
  const day = new Date(`${date}T12:00:00`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <div className={`${CARD_SHAPE} tb-skipped ${CARD_PAD}`}>
      <EntryRow icon="event_busy" iconCls="text-gray-500" kind={t('tagebuch.tournament')} kindCls="text-gray-500" title={title} titleCls="text-gray-600" meta={`${day} · ${t('tagebuch.notStarted')}`} time={time}>
        {notes.map(n => (
          <div key={n.id} className="mt-2 bg-indigo-50 rounded-xl p-2.5">
            <div className="flex items-center gap-1 text-[10px] font-black text-indigo-600 mb-0.5">
              <span className="material-symbols-outlined text-[13px]">lock</span>
              {t('tagebuch.onlyYou')}
            </div>
            <PrivateNoteBody note={n} onDelete={onDeleteNote} onEdit={onEditNote ? () => onEditNote(n) : undefined} />
          </div>
        ))}
        {composing ? (
          <div className="mt-2">
            <NoteComposer
              allowShare={false}
              autoFocus
              onSave={async (text, topics) => { await onAddNote(text, topics); setComposing(false); }}
              onCancel={() => setComposing(false)}
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => setComposing(true)}
              className="flex items-center gap-0.5 text-[10px] font-black text-indigo-600 bg-white border border-indigo-200 px-2.5 py-1.5 rounded-full active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              {t('tagebuch.noteShort')}
            </button>
            <div className="flex-1" />
            <button
              onClick={async () => { setBusy(true); try { await onUndo(); } finally { setBusy(false); } }}
              disabled={busy}
              className="text-[10px] font-black text-gray-400 px-2 py-1.5 rounded-full active:bg-white/60 disabled:opacity-50"
            >
              {t('tagebuch.notStartedUndo')}
            </button>
          </div>
        )}
      </EntryRow>
    </div>
  );
}

/**
 * Zawody po rozwinięciu — jak metryczka z zawodów (user 2026-10-23: „wszystko
 * jest, ale nie wygląda dobrze”). Jedna hierarchia zamiast pięciu kolorowych
 * pudełek: na górze suma (największa) i X / 10 / 9, pod nią tabela —
 * wiersz na Durchgang: sześć pass i suma Durchgangu na końcu wiersza.
 * Kolor tylko tam, gdzie coś znaczy: najlepsza passa i X.
 */
function TournamentSummary({ session }: { session: TbSession }) {
  const { t } = useTranslation();
  const c = session.counts;
  const ends = session.endSums;
  const best = ends.length ? Math.max(...ends) : -1;
  // Wiersze tabeli: passy z serii (12 = 2×6); bez serii same sumy Durchgangów.
  const rows = session.rounds
    ? session.rounds.map((sum, i) => ({ label: `D${i + 1}`, title: t(`tournamentInput.durchgang${i + 1}`), sum, ends: ends.slice(i * 6, i * 6 + 6) }))
    : [];
  const stat = (label: string, value: number, cls: string) => (
    <div className="text-center min-w-[30px]">
      <span className={`block text-[9px] font-black leading-none ${cls}`}>{label}</span>
      <span className="block text-[15px] font-black text-[#0a3a2a] leading-tight mt-0.5">{value}</span>
    </div>
  );
  return (
    <div className="mt-1">
      <div className="flex items-end justify-between gap-3 pb-2">
        <div className="min-w-0">
          <span className="block text-[9px] font-black uppercase tracking-widest text-gray-400">{t('tournamentInput.totalScore')}</span>
          <span className="block text-[32px] font-black text-[#0a3a2a] leading-none mt-1 tabular-nums">{session.score}</span>
        </div>
        {c && (
          <div className="flex items-end gap-2.5 shrink-0">
            {stat('X', c.x, 'text-[#b8860b]')}
            {stat('10', c.ten, 'text-gray-400')}
            {stat('9', c.nine, 'text-gray-400')}
          </div>
        )}
      </div>
      {rows.length > 0 && (
        <div className="border-t border-gray-100">
          {rows.map(r => (
            <div key={r.label} className="flex items-center gap-2 py-1.5 border-b border-gray-100" title={r.title}>
              <span className="w-6 shrink-0 text-[10px] font-black text-gray-400">{r.label}</span>
              {r.ends.length > 0 ? (
                <div className="flex-1 grid grid-cols-6 gap-0.5">
                  {r.ends.map((sum, i) => (
                    <span
                      key={i}
                      className={`text-center text-[12px] font-bold tabular-nums rounded-md py-0.5 ${sum === best ? 'bg-[#fed33e]/40 font-black text-[#0a3a2a]' : 'text-gray-600'}`}
                    >
                      {sum}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="flex-1 text-[11px] font-bold text-gray-400 truncate">{r.title}</span>
              )}
              <span className="w-10 shrink-0 text-right text-[15px] font-black text-[#0a3a2a] tabular-nums">{r.sum}</span>
            </div>
          ))}
        </div>
      )}
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

// „Pracowałem nad fokusem" — dopisuje/zdejmuje temat fokusu w session.topics.
function FocusToggle({ topic, marked, onToggle }: { topic: string; marked: boolean; onToggle: () => Promise<void> }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try { await onToggle(); } catch (e) { console.error('Tagebuch: błąd zaznaczenia fokusu', e); }
        setBusy(false);
      }}
      className={`mt-2 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black border transition-all active:scale-95 disabled:opacity-50 ${
        marked ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-gray-200 text-gray-500'
      }`}
      disabled={busy}
      aria-pressed={marked}
    >
      <span className="material-symbols-outlined text-[14px]">{marked ? 'check_circle' : 'radio_button_unchecked'}</span>
      {t('tagebuch.focusChip')}: {topicLabel(topic, t)}
    </button>
  );
}

// Wyniki serii w rozwiniętej karcie; najlepsza seria wyróżniona.
// Passy jak w metryczce zawodów (user 2026-10-23: wszystko podobnie) — same
// liczby w wierszach po 6, bez kafelków; najlepsza passa na jasnożółtym.
function EndsGrid({ sums }: { sums: number[] }) {
  const { t } = useTranslation();
  const best = Math.max(...sums);
  const rows: number[][] = [];
  for (let i = 0; i < sums.length; i += 6) rows.push(sums.slice(i, i + 6));
  return (
    <div className="mt-2">
      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">{t('tagebuch.ends')}</p>
      <div className="border-t border-gray-100">
        {rows.map((row, ri) => (
          <div key={ri} className="grid grid-cols-6 gap-0.5 py-1 border-b border-gray-100">
            {row.map((sum, i) => (
              <span
                key={i}
                className={`text-center text-[12px] tabular-nums rounded-md py-0.5 ${sum === best ? 'bg-[#fed33e]/40 font-black text-[#0a3a2a]' : 'font-bold text-gray-600'}`}
              >
                {sum}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Karta treningu: zwinięta = wynik i porównanie, rozwinięta (dotknięcie) =
// serie, notatki, uwaga trenera i akcje. Do statystyk prowadzi osobny
// przycisk — wcześniej każde dotknięcie wyrzucało z dziennika.
export function SessionCard({ session, time, insight, focus, expanded, onToggle, linkedNotes, hasCoach, isNew, onOpenStats, onAddNote, onDeleteNote, onEditNote }: {
  session: TbSession;
  time: string;
  insight?: SessionInsight;
  focus?: { topic: string; marked: boolean; onToggle: () => Promise<void> };
  expanded: boolean;
  onToggle: () => void;
  linkedNotes: TbPrivateNote[];
  hasCoach: boolean;
  isNew: boolean;
  onOpenStats: () => void;
  onAddNote: (session: TbSession, text: string, topics: string[], shared: boolean) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  onEditNote?: (note: TbPrivateNote) => void; // ołówek przy przypiętej notatce
}) {
  const { t } = useTranslation();
  const [composing, setComposing] = useState(false);

  // [ARENA] Trening z bitwy podpisany jej trybem zamiast ogólnego „Training”.
  // Zawody (user 2026-10-23): „Turnier · nazwa”, ciemna zieleń i żółty puchar jak karta zawodów na Home.
  const tourney = !session.isTech && !session.battle && !!session.isTournament;
  const kind = session.battle
    ? (session.battle.mode === 'CLUB' ? t('tagebuch.clubGame') : session.battle.mode === 'WORLD' ? 'World' : t('tagebuch.duel'))
    : tourney ? t('tagebuch.tournament') : t('tagebuch.training');
  // Nagłówek „TYP: tytuł” jak w każdym wpisie (EntryHeading): technika bez tytułu.
  const headKind = session.isTech ? t('tagebuch.techTraining') : kind;
  const headTitle = session.isTech ? undefined : session.label || undefined;
  const headCls = session.isTech ? 'text-sky-700' : session.battle ? 'text-fuchsia-700' : tourney ? 'text-[#0a3a2a]' : 'text-emerald-700';
  const stats = session.isTech
    ? `${session.arrows} ${t('common.arrows')}`
    : `${tourney && session.distanceText ? `${session.distanceText} · ` : ''}${session.score} ${t('tagebuch.rings')} · ${session.arrows} ${t('common.arrows')}`;

  // Notatkę „dla trenera" da się dopisać tylko raz do pustej sesji w limicie
  // edycji — resztę zawsze można dopisać jako prywatną.
  const canShare = hasCoach && !session.note && session.editCount < SESSION_NOTE_EDITS;
  const visibleTopics = session.topics.filter(x => x !== focus?.topic && x !== session.trainingTopic?.topic);
  const noteCount = (session.note ? 1 : 0) + linkedNotes.length;

  const header = (
    <button onClick={onToggle} className="w-full flex items-stretch gap-2.5 text-left active:opacity-60" aria-expanded={expanded}>
      <span className={`${tourney ? 'tb-tourney-icon' : 'tb-icon'} w-8 h-8 rounded-lg flex items-center justify-center shrink-0 self-start`}>
        <span className={`material-symbols-outlined text-[18px] ${session.isTech ? 'text-sky-600' : session.battle ? 'text-fuchsia-600' : tourney ? 'tb-tourney-accent' : 'text-emerald-600'}`}>{session.isTech ? 'fitness_center' : session.battle ? 'shield' : tourney ? 'emoji_events' : 'target'}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-1.5 min-w-0">
          <span className="min-w-0"><EntryHeading kind={headKind} kindCls={headCls} title={headTitle} /></span>
          <InsightBadge insight={insight} />
        </span>
        <span className="block text-[10px] font-bold truncate text-gray-500 mt-0.5">{stats}</span>
        {/* [ARENA] Miejsce po zakończeniu gry, wcześniej „gra trwa”. */}
        {session.battle?.place ? (
          <span className="flex items-center gap-1 mt-0.5 text-[10px] font-black text-fuchsia-700">
            <span className="material-symbols-outlined text-[13px]">emoji_events</span>
            {t('tagebuch.battlePlace', { place: session.battle.place, players: session.battle.players })}
          </span>
        ) : session.battle?.live ? (
          <span className="flex items-center gap-1 mt-0.5 text-[10px] font-bold text-gray-400">
            <span className="material-symbols-outlined text-[13px]">schedule</span>{t('tagebuch.battleLive')}
          </span>
        ) : null}
        {insight && !session.isTech && <InsightLine insight={insight} />}
        {/* Temat od trenera, pod który był trening — fiolet = od trenera. */}
        {session.trainingTopic && (session.trainingTopic.text || session.trainingTopic.topic) && (
          <span className="flex items-center gap-1 mt-0.5 min-w-0 text-[10px] font-bold text-violet-700">
            <span className="material-symbols-outlined text-[13px] shrink-0">sports</span>
            <span className="truncate">{session.trainingTopic.text || topicLabel(session.trainingTopic.topic, t)}</span>
          </span>
        )}
      </span>
      {/* Godzina w prawym górnym rogu, strzałka w prawym dolnym (user 2026-10-15). */}
      <span className="shrink-0 flex flex-col items-end justify-between gap-1">
        {time ? <span className="tb-time text-[10px] font-bold text-gray-400 leading-none mt-0.5">{time}</span> : <span />}
        <span className="flex items-center gap-1">
      {/* Zwinięta: znaczki, że w środku coś jest (trener, notatki). */}
      {!expanded && (session.coachNote || noteCount > 0 || session.coachSeen) && (
        <span className="shrink-0 flex items-center gap-1">
          {session.coachNote && (
            <span className={`flex items-center justify-center w-6 h-6 rounded-full ${isNew ? 'bg-emerald-600 text-white' : 'bg-amber-50 text-amber-800'}`}>
              <span className="material-symbols-outlined text-[14px]">sports</span>
            </span>
          )}
          {session.coachSeen && !session.coachNote && (
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-50 text-amber-800" title={t('tagebuch.coachSeen')}>
              <span className="material-symbols-outlined text-[14px]">done_all</span>
            </span>
          )}
          {noteCount > 0 && (
            <span className="flex items-center gap-0.5 h-6 px-1.5 rounded-full tb-icon text-gray-500 text-[10px] font-black">
              <span className="material-symbols-outlined text-[14px]">edit_note</span>
              {noteCount > 1 && noteCount}
            </span>
          )}
        </span>
      )}
      <span className={`material-symbols-outlined text-[20px] text-gray-400 shrink-0 -mr-1 transition-transform ${expanded ? 'rotate-180' : ''}`}>expand_more</span>
        </span>
      </span>
    </button>
  );

  return (
    <div className={`${CARD_SHAPE} ${session.isTech ? 'tb-tech' : tourney ? 'tb-tourney' : distanceTier(session.meters)} ${CARD_PAD}`}>
      {header}
      {focus && (
        <FocusToggle topic={focus.topic} marked={focus.marked} onToggle={focus.onToggle} />
      )}

      {expanded && <div>
      {/* Temat fokusu pokazuje już przełącznik — bez dublowania w chipach. */}
      <TopicChips topics={visibleTopics} />

      {tourney && <TournamentSummary session={session} />}

      {/* Zawody mają passy w swojej tabeli (TournamentSummary). */}
      {session.endSums.length > 0 && !(tourney && session.rounds) && <EndsGrid sums={session.endSums} />}

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
          {/* Trener odhaczył „Widziałem” w karcie ucznia (bez odpowiedzi). */}
          {session.isNotePublic && session.coachSeen && !session.coachNote && (
            <p className="mt-1 flex items-center gap-1 text-[10px] font-black text-amber-800">
              <span className="material-symbols-outlined text-[14px]">done_all</span>
              {t('tagebuch.coachSeen')}
            </p>
          )}
        </div>
      )}

      {linkedNotes.map(n => (
        <div key={n.id} className="mt-2 bg-indigo-50 rounded-xl p-2.5">
          <div className="flex items-center gap-1 text-[10px] font-black text-indigo-600 mb-0.5">
            <span className="material-symbols-outlined text-[13px]">lock</span>
            {t('tagebuch.onlyYou')}
          </div>
          <PrivateNoteBody note={n} onDelete={onDeleteNote} onEdit={onEditNote ? () => onEditNote(n) : undefined} />
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

      {composing ? (
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
      ) : (
        <div className="flex items-center gap-2 mt-2.5">
          <button
            onClick={() => setComposing(true)}
            className="flex items-center gap-0.5 text-[10px] font-black text-emerald-700 bg-white border border-emerald-200 px-2.5 py-1.5 rounded-full active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[14px]">add</span>
            {t('tagebuch.noteShort')}
          </button>
          <div className="flex-1" />
          <button
            onClick={onOpenStats}
            className="flex items-center gap-0.5 text-[10px] font-black text-gray-500 px-2 py-1.5 rounded-full active:bg-white/60"
          >
            {t('tagebuch.showStats')}
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          </button>
        </div>
      )}
      </div>}
    </div>
  );
}
