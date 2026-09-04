import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../firebase';
import { collection, query, where, orderBy, getDocs, Timestamp, writeBatch, doc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { seriesKeyFromTitle, sessionDateToISO } from '../utils/tournamentSeries';
import HistoricalStartForm from './HistoricalStartForm';
import { distanceKey, sessionDistanceLabel, distanceMeters } from '../config/distances';

interface RecordSession {
  id: string;
  score?: number;
  arrows?: number;
  scoreArrows?: number;
  distance?: string;
  /** [C25] Kubelek statystyk; brak = sesja sprzed C25 (patrz distanceKey). */
  distanceId?: string;
  /** [C25] Nazwa dystansu z chwili strzalu. */
  distanceLabel?: string;
  date?: string;
  type?: string;
  tournamentName?: string;
  xCount?: number;
  ends?: { arrows?: string[] }[];
  isHistorical?: boolean;
}

interface TournamentRecordsViewProps {
  userId: string;
  isPremium: boolean;
  onNavigate?: (view: string, tab?: string) => void;
}

const CACHE_KEY = (uid: string, premium: boolean) => `grotX_records_${uid}_${premium ? 'pro' : 'free'}`;

function cacheGet(uid: string, premium: boolean): RecordSession[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY(uid, premium));
    if (!raw) return null;
    const { data, expiresAt } = JSON.parse(raw);
    if (Date.now() > expiresAt) { localStorage.removeItem(CACHE_KEY(uid, premium)); return null; }
    return data;
  } catch { return null; }
}

function cacheSet(uid: string, premium: boolean, data: RecordSession[]): void {
  try {
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    localStorage.setItem(CACHE_KEY(uid, premium), JSON.stringify({ data, expiresAt: midnight.getTime() }));
  } catch { /* limit quoty — brak cache tylko spowalnia, nie psuje */ }
}

function cacheClear(uid: string, premium: boolean): void {
  try { localStorage.removeItem(CACHE_KEY(uid, premium)); } catch { /* ignore */ }
}

// Treningi (ScoringView) nie zapisują xCount, mają za to `ends` — turnieje
// odwrotnie, w trybie skrótowym mają samo xCount bez serii. Liczymy więc
// z tego, co jest, żeby rekord nie obejmował wyłącznie zawodów.
const countX = (s: RecordSession): number => {
  if (typeof s.xCount === 'number') return s.xCount;
  if (!s.ends?.length) return 0;
  return s.ends.reduce((sum, end) => sum + (end.arrows?.filter(a => a === 'X').length || 0), 0);
};

const scoringArrows = (s: RecordSession): number => s.scoreArrows || s.arrows || 0;
const avgPerArrow = (s: RecordSession): number => {
  const arrows = scoringArrows(s);
  return arrows > 0 ? (s.score || 0) / arrows : 0;
};

export default function TournamentRecordsView({ userId, isPremium, onNavigate }: TournamentRecordsViewProps) {
  const { t, i18n } = useTranslation();
  const [sessions, setSessions] = useState<RecordSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDistance, setSelectedDistance] = useState<string>('');
  const [openSeries, setOpenSeries] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  const load = useCallback(async (useCache: boolean) => {
    if (!userId) return;

    if (useCache) {
      const cached = cacheGet(userId, isPremium);
      if (cached) { setSessions(cached); setIsLoading(false); return; }
    }

    // Okno historii: free rok wstecz, PRO pięć lat — tak samo jak archiwum
    // zawodów w Terminarzu.
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - (isPremium ? 5 : 1));

    try {
      const snap = await getDocs(query(
        collection(db, 'users', userId, 'sessions'),
        where('timestamp', '>=', Timestamp.fromDate(cutoff)),
        orderBy('timestamp', 'desc')
      ));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as RecordSession));
      setSessions(data);
      cacheSet(userId, isPremium, data);
    } catch { /* brak danych pokaże pusty stan */ }
    setIsLoading(false);
  }, [userId, isPremium]);

  useEffect(() => { load(true); }, [load]);

  // Poprawka literówki w nazwie. Zmiana obejmuje wszystkie starty w serii,
  // niezależnie od aktywnego filtra dystansu — inaczej seria rozpadłaby się
  // na starą i nową nazwę. Jeśli nowa nazwa normalizuje się do klucza innej
  // serii, obie po prostu zlewają się w jedną.
  const seriesSessions = useCallback(
    (key: string) => sessions.filter(
      s => s.type === 'Turniej' && !!s.tournamentName && seriesKeyFromTitle(s.tournamentName) === key
    ),
    [sessions]
  );

  const applyRename = async () => {
    const next = renameValue.trim();
    if (!renamingKey || !next || isRenaming) return;
    setIsRenaming(true);
    try {
      const affected = seriesSessions(renamingKey);
      const batch = writeBatch(db);
      affected.forEach(s => batch.update(doc(db, 'users', userId, 'sessions', s.id), { tournamentName: next }));
      await batch.commit();
      cacheClear(userId, isPremium);
      await load(false);
      // Stary klucz przestaje istnieć (a przy scaleniu znika cała pozycja),
      // więc rozwinięcie trzeba zwinąć, żeby nie wskazywało w próżnię.
      setOpenSeries(null);
      setRenamingKey(null);
    } catch { /* nieudany zapis zostawia okno otwarte */ }
    setIsRenaming(false);
  };

  // Sesje techniczne i bez wyniku nie biorą udziału w żadnym rekordzie.
  const scored = useMemo(
    () => sessions.filter(s => s.type !== 'TECHNICAL' && (s.score || 0) > 0 && !!s.distance && s.distance !== 'TECH'),
    [sessions]
  );

  // [C25] Kubelki po `distanceId`, nie po napisie — dwa wpisy o tych samych
  // metrach ("18m recurve" / "18m barebow") to dwa rozne zestawy rekordow.
  // Nazwa ze stempla najnowszej sesji w kubelku (dziala tez w widoku trenera).
  const distances = useMemo(() => {
    const buckets = new Map<string, { key: string; label: string; meters: number }>();
    scored.forEach(sess => {
      const key = distanceKey(sess);
      if (!buckets.has(key)) {
        buckets.set(key, { key, label: sessionDistanceLabel(sess), meters: distanceMeters(sess.distance) });
      }
    });
    return Array.from(buckets.values()).sort((a, b) => a.meters - b.meters);
  }, [scored]);

  const inDistance = useMemo(
    () => selectedDistance ? scored.filter(s => distanceKey(s) === selectedDistance) : scored,
    [scored, selectedDistance]
  );

  const records = useMemo(() => {
    const best = (items: RecordSession[], value: (s: RecordSession) => number): { s: RecordSession; v: number } | null => {
      let top: { s: RecordSession; v: number } | null = null;
      items.forEach(s => {
        const v = value(s);
        if (v > 0 && (!top || v > top.v)) top = { s, v };
      });
      return top;
    };
    const tournaments = inDistance.filter(s => s.type === 'Turniej');
    const trainings = inDistance.filter(s => s.type !== 'Turniej');
    return {
      tournament: best(tournaments, s => s.score || 0),
      training: best(trainings, s => s.score || 0),
      avg: best(inDistance, avgPerArrow),
      x: best(inDistance, countX),
    };
  }, [inDistance]);

  const series = useMemo(() => {
    const grouped = new Map<string, { name: string; editions: RecordSession[] }>();
    inDistance
      .filter(s => s.type === 'Turniej' && !!s.tournamentName)
      .forEach(s => {
        const key = seriesKeyFromTitle(s.tournamentName as string);
        if (!key) return;
        const entry = grouped.get(key);
        if (entry) entry.editions.push(s);
        else grouped.set(key, { name: s.tournamentName as string, editions: [s] });
      });
    return Array.from(grouped.entries())
      .map(([key, v]) => ({ key, name: v.name, editions: v.editions }))
      .sort((a, b) => b.editions.length - a.editions.length);
  }, [inDistance]);

  // Podpowiedzi w formularzu biorą wszystkie imprezy, niezależnie od
  // aktywnego filtra dystansu.
  const knownSeries = useMemo(() => {
    const byKey = new Map<string, { name: string; distance?: string }>();
    scored
      .filter(s => s.type === 'Turniej' && !!s.tournamentName)
      .forEach(s => {
        const key = seriesKeyFromTitle(s.tournamentName as string);
        if (key && !byKey.has(key)) byKey.set(key, { name: s.tournamentName as string, distance: s.distance });
      });
    return Array.from(byKey.values());
  }, [scored]);

  // Nowa nazwa może normalizować się do klucza innej, już istniejącej serii —
  // wtedy zapis połączy obie. Uprzedzamy o tym, zamiast robić to po cichu.
  const titleMergesInto = (candidate: string, ownKey: string): string | null => {
    const key = seriesKeyFromTitle(candidate);
    if (!key || key === ownKey) return null;
    return knownSeries.find(s => seriesKeyFromTitle(s.name) === key)?.name || null;
  };

  const fmtAvg = (v: number) => v.toFixed(2).replace('.', i18n.language === 'en' ? '.' : ',');

  if (isLoading) {
    return <div className="p-10 text-center animate-pulse text-gray-400 mt-10">{t('stats.loading')}</div>;
  }

  const RecordTile = ({ label, value, name, sub, icon, dark }: { label: string; value: string; name?: string; sub?: string; icon: string; dark?: boolean }) => (
    <div className={`rounded-[20px] p-3 border shadow-sm flex flex-col justify-between ${dark ? 'bg-[#0a3a2a] border-[#0a3a2a]' : 'bg-white border-gray-100'}`}>
      <div className="flex items-center gap-1 mb-1.5">
        <span className={`material-symbols-outlined text-[14px] ${dark ? 'text-[#fed33e]' : 'text-gray-300'}`}>{icon}</span>
        <span className={`text-[8px] font-black uppercase tracking-widest leading-none ${dark ? 'text-emerald-100/60' : 'text-gray-400'}`}>{label}</span>
      </div>
      <span className={`text-2xl font-black leading-none ${dark ? 'text-white' : 'text-[#0a3a2a]'}`}>{value}</span>
      {name && (
        <span className={`text-[9px] font-black mt-1 leading-tight truncate ${dark ? 'text-[#fed33e]' : 'text-[#0a3a2a]'}`} title={name}>
          {name}
        </span>
      )}
      {sub && <span className={`text-[8px] font-bold mt-0.5 leading-none ${dark ? 'text-emerald-100/50' : 'text-gray-400'}`}>{sub}</span>}
    </div>
  );

  return (
    <div className="px-5 pb-6 space-y-4">

      {/* PRZEŁĄCZNIK DYSTANSU */}
      {distances.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-3">
          <button
            onClick={() => setSelectedDistance('')}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black border transition-all ${!selectedDistance ? 'bg-emerald-100 border-emerald-500 text-emerald-700' : 'bg-gray-50 border-transparent text-gray-400'}`}
          >
            {t('stats.records.allDistances')}
          </button>
          {distances.map(d => (
            <button
              key={d.key}
              onClick={() => setSelectedDistance(d.key)}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black border transition-all ${selectedDistance === d.key ? 'bg-emerald-100 border-emerald-500 text-emerald-700' : 'bg-gray-50 border-transparent text-gray-400'}`}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}

      {/* REKORDY ŻYCIOWE */}
      <div className="space-y-2">
        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">{t('stats.records.lifetimeTitle')}</p>
        {scored.length === 0 ? (
          <p className="text-center text-[10px] font-bold text-gray-300 uppercase py-6">{t('stats.records.noData')}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <RecordTile
              dark
              icon="emoji_events"
              label={t('stats.records.bestTournament')}
              value={records.tournament ? String(records.tournament.s.score) : '—'}
              name={records.tournament?.s.tournamentName || undefined}
              sub={records.tournament ? `${sessionDistanceLabel(records.tournament.s)} · ${records.tournament.s.date}` : undefined}
            />
            <RecordTile
              icon="fitness_center"
              label={t('stats.records.bestTraining')}
              value={records.training ? String(records.training.s.score) : '—'}
              sub={records.training ? `${sessionDistanceLabel(records.training.s)} · ${records.training.s.date}` : undefined}
            />
            <RecordTile
              icon="speed"
              label={t('stats.records.bestAvg')}
              value={records.avg ? fmtAvg(records.avg.v) : '—'}
              sub={records.avg ? `${t('stats.records.perArrow')} · ${sessionDistanceLabel(records.avg.s)}` : undefined}
            />
            <RecordTile
              icon="my_location"
              label={t('stats.records.mostX')}
              value={records.x ? String(records.x.v) : '—'}
              sub={records.x ? `${sessionDistanceLabel(records.x.s)} · ${records.x.s.date}` : undefined}
            />
          </div>
        )}
      </div>

      {/* HISTORIA STARTÓW */}
      <div className="space-y-2">
        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">{t('stats.records.historyTitle')}</p>
        {series.length === 0 ? (
          <p className="text-center text-[10px] font-bold text-gray-300 uppercase py-6">{t('stats.records.noTournaments')}</p>
        ) : (
          <div className="space-y-1.5">
            {series.map(ser => {
              // Data sesji jest w formacie pl-PL ("5.08.2026"), więc sortowanie
              // wprost po niej byłoby leksykograficzne — najpierw na ISO.
              const sorted = [...ser.editions].sort(
                (a, b) => sessionDateToISO(b.date || '').localeCompare(sessionDateToISO(a.date || ''))
              );
              const seriesBest = Math.max(...sorted.map(s => s.score || 0));
              const isOpen = openSeries === ser.key;
              return (
                <div key={ser.key} className="rounded-[20px] border border-gray-100 bg-white shadow-sm overflow-hidden">
                  <div className="w-full flex items-center gap-2.5 p-3">
                    <button
                      onClick={() => setOpenSeries(isOpen ? null : ser.key)}
                      className="flex items-center gap-2.5 flex-1 min-w-0 text-left active:opacity-70 transition-opacity"
                    >
                      <div className="w-9 h-9 bg-[#0a3a2a] rounded-xl flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[#fed33e] text-[18px]">emoji_events</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-black text-[#0a3a2a] text-[13px] leading-tight truncate">{ser.name}</h3>
                        <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                          {t('stats.records.starts')}: {sorted.length} · {t('stats.records.seriesBest')} {seriesBest}
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={() => { setRenamingKey(ser.key); setRenameValue(ser.name); }}
                      className="p-1.5 rounded-lg text-gray-300 active:bg-gray-100 active:scale-90 transition-all shrink-0"
                      aria-label={t('stats.records.rename.title')}
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                    <button
                      onClick={() => setOpenSeries(isOpen ? null : ser.key)}
                      className="text-gray-300 shrink-0 active:scale-90 transition-transform"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {isOpen ? 'expand_less' : 'expand_more'}
                      </span>
                    </button>
                  </div>

                  {isOpen && (
                    <div className="px-3 pb-3 space-y-1">
                      {sorted.map((ed, idx) => {
                        // Porównujemy tylko z poprzednim startem na TYM SAMYM dystansie —
                        // różnica między 70m a 50m nie mówi nic o formie.
                        const prev = sorted.slice(idx + 1).find(p => distanceKey(p) === distanceKey(ed));
                        const delta = prev ? (ed.score || 0) - (prev.score || 0) : null;
                        const isBest = (ed.score || 0) === seriesBest;
                        return (
                          <div key={ed.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-2.5 py-2">
                            <span className="text-[9px] font-black text-gray-400 w-[62px] shrink-0">{ed.date}</span>
                            <span className="bg-gray-200 text-gray-600 text-[8px] font-black px-1.5 py-0.5 rounded-md leading-none shrink-0">{sessionDistanceLabel(ed)}</span>
                            <span className="flex-1 text-right text-sm font-black text-[#0a3a2a] leading-none">
                              {ed.score}
                              <span className="text-[8px] font-bold text-gray-400 ml-1">{fmtAvg(avgPerArrow(ed))}</span>
                            </span>
                            {isBest && <span className="material-symbols-outlined text-[#fed33e] text-[14px] shrink-0">star</span>}
                            {delta !== null && (
                              <span className={`text-[9px] font-black w-[34px] text-right shrink-0 ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-400' : 'text-gray-300'}`}>
                                {delta > 0 ? `+${delta}` : delta}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* POPRAWKA NAZWY SERII */}
      {renamingKey && (() => {
        const affected = seriesSessions(renamingKey);
        const merges = titleMergesInto(renameValue, renamingKey);
        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[130] flex items-start justify-center pt-24 px-4">
            <div className="bg-white w-full max-w-sm rounded-[32px] p-5 shadow-2xl animate-fade-in-up">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-base font-black text-[#0a3a2a]">{t('stats.records.rename.title')}</h2>
                <button onClick={() => setRenamingKey(null)} className="p-1.5 bg-red-50 text-red-500 rounded-full active:scale-90 transition-colors">
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>

              <input
                type="text"
                autoFocus
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                className="w-full bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 text-sm font-bold text-[#0a3a2a] outline-none focus:ring-2 focus:ring-emerald-400"
              />

              <p className="text-[9px] font-bold text-gray-400 leading-snug mt-2 px-1">
                {t('stats.records.rename.hint')} {t('stats.records.rename.affected')} {affected.length}
              </p>

              {merges && (
                <p className="text-[9px] font-black text-amber-600 leading-snug mt-1.5 px-1">
                  {t('stats.records.rename.mergeWarning', { name: merges })}
                </p>
              )}

              <button
                onClick={applyRename}
                disabled={!renameValue.trim() || isRenaming}
                className={`w-full mt-3 py-3.5 rounded-2xl font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all ${renameValue.trim() && !isRenaming ? 'bg-[#0a3a2a] text-white' : 'bg-gray-200 text-gray-400'}`}
              >
                {isRenaming ? t('stats.records.saving') : t('stats.records.save')}
              </button>
            </div>
          </div>
        );
      })()}

      {/* DOPISANIE STARTU Z PRZESZŁOŚCI */}
      <button
        onClick={() => setShowAddForm(true)}
        className="w-full py-3 bg-gray-50 border border-gray-100 text-gray-500 font-black text-[10px] uppercase tracking-widest rounded-2xl active:bg-gray-100 transition-all flex items-center justify-center gap-1.5"
      >
        <span className="material-symbols-outlined text-[15px] text-gray-300">add_circle</span>
        {t('stats.records.form.openBtn')}
      </button>

      {showAddForm && (
        <HistoricalStartForm
          userId={userId}
          isPremium={isPremium}
          knownSeries={knownSeries}
          onClose={() => setShowAddForm(false)}
          onSaved={() => { cacheClear(userId, isPremium); load(false); }}
        />
      )}

      {/* ZAJAWKA PRO */}
      {!isPremium && (
        <button
          onClick={() => onNavigate?.('SETTINGS', 'PRO')}
          className="w-full bg-[#0a3a2a] rounded-[20px] p-3.5 flex items-center gap-3 shadow-lg active:scale-[0.98] transition-all text-left"
        >
          <span className="material-symbols-outlined text-[#fed33e] text-[22px] shrink-0">diamond</span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-black text-white leading-tight">{t('stats.records.freeLimitTitle')}</p>
            <p className="text-[9px] font-bold text-emerald-100/60 leading-tight mt-0.5">{t('stats.records.freeLimitDesc')}</p>
          </div>
          <span className="bg-[#fed33e] text-[#5d4a00] text-[9px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg shrink-0">
            {t('stats.unlockBtn')}
          </span>
        </button>
      )}
    </div>
  );
}
