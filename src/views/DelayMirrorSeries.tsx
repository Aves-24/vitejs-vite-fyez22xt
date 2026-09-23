import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import TargetInput from '../components/targets/TargetInput';
import { isSpotFace, DEFAULT_TARGET_FACE } from '../config/targetFaces';
import { shotDirection } from '../utils/shotDirection';

// Trening techniczny — ekrany A (tarcza) i B (wbijanie strzał).
// Wchodzi sie tu po zakonczeniu serii w trybie z nagraniem. Ekran C
// (powtorka ze znacznikami) dostaje gotowy draft i dokłada czasy.

const SPOT_FACE = '3-Spot';

export interface TechShot {
  n: number;
  x: number;
  y: number;
  score: string;
  spotId: string | null;
  /** Moment w klipie — uzupelniany dopiero na ekranie powtorki. */
  tMs: number | null;
  /** Skad wziety czas. Pole istnieje od v1, zeby pozniejsza detekcja
   *  audio nie wymagala migracji danych. */
  tSource: 'manual' | 'audio' | null;
}

export interface TechSeriesDraft {
  targetType: string;
  arrowCount: number;
  shots: TechShot[];
}

interface Props {
  userId: string;
  /** „Tylko obejrzyj” — pomija analize, idzie prosto do powtorki. */
  onWatchOnly: () => void;
  /** Strzaly wbite — dalej do powtorki ze znacznikami. */
  onReady: (draft: TechSeriesDraft) => void;
  /** Powrot do nagrywania bez analizy. */
  onBack: () => void;
}

// Okragla tarcza z ostatniego treningu zamiast jednej wbitej na sztywno.
// Czytamy ten sam cache co HomeView (`{data, expiresAt}`) — bez zapytania
// do Firestore i bez ruszania dzialajacego pliku.
function lastRoundFace(userId: string): string {
  try {
    const raw = localStorage.getItem(`grotX_lastSession_${userId}`);
    if (raw) {
      const { data, expiresAt } = JSON.parse(raw);
      const tt = data?.targetType;
      if (Date.now() <= expiresAt && typeof tt === 'string' && tt && !isSpotFace(tt)) return tt;
    }
  } catch { /* ignore */ }
  return DEFAULT_TARGET_FACE.id;
}

export default function DelayMirrorSeries({ userId, onWatchOnly, onReady, onBack }: Props) {
  const { t } = useTranslation();
  const roundFace = useMemo(() => lastRoundFace(userId), [userId]);

  const [step, setStep] = useState<'target' | 'enter'>('target');
  const [useSpot, setUseSpot] = useState<boolean>(() => {
    try { return localStorage.getItem('delayMirror.seriesSpot') === '1'; } catch { return false; }
  });
  const [arrowCount, setArrowCount] = useState<number>(() => {
    try {
      const n = parseInt(localStorage.getItem('delayMirror.seriesArrows') || '', 10);
      if (!isNaN(n) && n >= 1 && n <= 6) return n;
    } catch { /* ignore */ }
    return 6;
  });
  const pickArrowCount = (n: number) => {
    setArrowCount(n);
    try { localStorage.setItem('delayMirror.seriesArrows', String(n)); } catch { /* ignore */ }
  };
  const [shots, setShots] = useState<TechShot[]>([]);

  // W poziomie tarcza musi skalowac sie do WYSOKOSCI, nie szerokosci —
  // TargetInput domyslnie robi odwrotnie (w-full + maxHeight 58vh), przez co
  // na lezacym telefonie widac tylko gorna czesc tarczy.
  const [landscape, setLandscape] = useState(
    typeof window !== 'undefined' ? window.innerWidth > window.innerHeight : false
  );
  useEffect(() => {
    const update = () => setLandscape(window.innerWidth > window.innerHeight);
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  const targetType = useSpot ? SPOT_FACE : roundFace;

  const pickBtn = (active: boolean) =>
    `flex-1 py-2 px-1.5 rounded-xl font-black text-[10px] uppercase tracking-wider leading-tight text-center active:scale-95 transition-all flex flex-col items-center justify-center gap-0.5 border ${
      active
        ? 'bg-[#fed33e] text-[#0a3a2a] border-[#fed33e] shadow-lg shadow-[#fed33e]/20'
        : 'bg-white/5 text-white/70 border-white/15'
    }`;

  const screenStyle: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 55 };

  // ─── A. Wybor tarczy i liczby strzal ────────────────────────────────────
  if (step === 'target') {
    return (
      <div style={screenStyle} className="bg-[#050f0a] overflow-y-auto flex flex-col items-center px-8 py-6">
        <button onClick={onBack} className="absolute top-6 left-5 text-white/50 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-3xl">arrow_back</span>
        </button>

        <div className="w-full max-w-xs flex flex-col gap-4 mt-12">
          <h2 className="text-white font-black text-xl text-center">{t('delayMirror.seriesTargetTitle')}</h2>

          <div className="flex gap-2">
            <button
              onClick={() => { setUseSpot(true); try { localStorage.setItem('delayMirror.seriesSpot', '1'); } catch { /* ignore */ } }}
              className={pickBtn(useSpot)}
            >
              <span className="material-symbols-outlined text-lg">grid_view</span>
              {t('delayMirror.seriesTargetSpot')}
            </button>
            <button
              onClick={() => { setUseSpot(false); try { localStorage.setItem('delayMirror.seriesSpot', '0'); } catch { /* ignore */ } }}
              className={pickBtn(!useSpot)}
            >
              <span className="material-symbols-outlined text-lg">radio_button_unchecked</span>
              {t('delayMirror.seriesTargetRound')}
              <span className="text-[9px] font-bold opacity-60 normal-case">{roundFace}</span>
            </button>
          </div>

          <div>
            <p className="text-white/70 text-[10px] font-bold uppercase tracking-wider mb-1.5 text-center">
              {t('delayMirror.seriesArrowsTitle')}
            </p>
            <div className="flex gap-2">
              {[3, 6].map(n => (
                <button key={n} onClick={() => pickArrowCount(n)} className={pickBtn(arrowCount === n)}>
                  <span className="text-lg font-black">{n}</span>
                </button>
              ))}
            </div>
            {/* Inne liczby strzal — mniejsze kafelki pod glownymi 3/6, bo
                to rzadszy przypadek (niedostrzelana lub niepelna passa). */}
            <div className="flex gap-1.5 mt-1.5">
              {[1, 2, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => pickArrowCount(n)}
                  className={`flex-1 py-1.5 rounded-lg font-black text-xs transition-all active:scale-95 border ${
                    arrowCount === n
                      ? 'bg-[#fed33e] text-[#0a3a2a] border-[#fed33e]'
                      : 'bg-white/5 text-white/50 border-white/10'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => { setShots([]); setStep('enter'); }}
            className="w-full py-4 rounded-2xl font-black text-base uppercase tracking-widest bg-[#fed33e] text-[#0a3a2a] active:scale-95 shadow-lg shadow-[#fed33e]/20 transition-all"
          >
            {t('delayMirror.seriesGoCollect')}
          </button>

          {/* Bez tej linijki user nie wie, ze ma wziac telefon ze soba —
              „Pfeile holen" brzmialo jak „idz po strzaly i wroc". */}
          <p className="text-white/50 text-[11px] leading-snug text-center -mt-2">
            {t('delayMirror.seriesGoCollectHint')}
          </p>

          <button
            onClick={onWatchOnly}
            className="w-full py-3 rounded-2xl font-bold text-xs uppercase tracking-widest bg-white/5 text-white/60 border border-white/15 active:scale-95 transition-all"
          >
            {t('delayMirror.seriesWatchOnly')}
          </button>

          {/* Ostrzezenie PRZED wlozeniem pracy, nie po. */}
          <div className="flex items-start gap-2 bg-white/5 rounded-xl px-3 py-2">
            <span className="material-symbols-outlined text-[#fed33e]/70 text-sm mt-0.5">info</span>
            <p className="text-white/50 text-[11px] leading-snug">{t('delayMirror.seriesClipWarning')}</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── B. Wbijanie strzal ─────────────────────────────────────────────────
  const currentArrows = shots.map(s => s.score);
  const currentCoords = shots.map(s => ({ x: s.x, y: s.y, spotId: s.spotId }));
  const nextN = shots.length + 1;
  const complete = shots.length >= arrowCount;

  // Celowo BEZ reguly „jedna strzala na spot” z ScoringView: tam druga
  // strzala w ten sam spot to M (zasada zawodow). Tu liczy sie faktyczne
  // polozenie, bo to analiza techniki, a nie punktacja do statystyk.
  const addShot = (score: string, x: number, y: number, spotId: string | null) => {
    if (shots.length >= arrowCount) return;
    setShots(prev => [...prev, { n: prev.length + 1, x, y, score, spotId, tMs: null, tSource: null }]);
  };

  const undo = () => setShots(prev => prev.slice(0, -1));

  // TargetInput w trybie pelnoekranowym jest `fixed inset-0 z-[99999]`, wiec
  // nie da sie go wlozyc w zwykly layout — przykryje wszystko. Zamiast z nim
  // walczyc, zostawiamy mu ekran (tam ma wieksza tarcze i celownik z offsetem),
  // a wlasny pasek kladziemy nad nim. Jego rzad slotow i cofanie sa juz tym,
  // czego potrzebujemy, wiec ich nie dublujemy.
  return (
    <>
      <TargetInput
        onShot={addShot}
        isFullscreen={true}
        onToggleFullscreen={() => setStep('target')}
        currentArrows={currentArrows}
        currentCoords={currentCoords}
        onUndo={undo}
        targetType={targetType}
        embed={{
          // Wyjscie robi wlasny przycisk. Bez tego TargetInput po szostej
          // strzale sam wywoluje onToggleFullscreen i wyrzuca do wyboru tarczy.
          autoExit: false,
          title: t('delayMirror.seriesEnterTitle'),
          padClass: landscape ? 'pb-1' : 'pb-24',
          headerClass: landscape ? 'px-4 pt-2 mb-1' : undefined,
          // Bezwzglednie, nie w procentach — patrz uwaga przy `embed`.
          // 160px = zmierzony naglowek (~56) + pasek z kafelkami kierunku (~97).
          svgStyle: landscape ? { maxHeight: 'calc(100vh - 160px)' } : undefined,
        }}
      />

      {/* Pasek nad tarcza. pl-20 zostawia wolny celownik offsetu w lewym
          dolnym rogu (TargetInput: left-6 bottom-8). W poziomie wszystko
          w jednej linii, bo wysokosc jest tam towarem deficytowym. */}
      <div
        className={`fixed bottom-0 inset-x-0 z-[100001] bg-[#050f0a]/95 backdrop-blur-sm border-t border-white/15 pb-[max(0.5rem,env(safe-area-inset-bottom))] ${
          // W poziomie pl-20/pr-4 to celowa asymetria (tekst po lewej, przycisk
          // po prawej, nic tu nie ma byc scentrowane). W pionie tekst i przycisk
          // MAJA byc na srodku ekranu, wiec oba marginesy musza byc rowne —
          // inaczej "wycentrowany" tekst siedzi wizualnie bardziej w prawo.
          landscape ? 'pl-20 pr-4 pt-1.5 flex items-center gap-3' : 'pl-20 pr-20 pt-2'
        }`}
      >
        <div className={landscape ? 'flex-1 min-w-0' : ''}>
          <p className={`text-white/70 text-[10px] font-black uppercase tracking-wider ${landscape ? 'text-left truncate' : 'text-center mb-1.5'}`}>
            {complete ? t('delayMirror.seriesEnterDone') : t('delayMirror.seriesEnterHint', { n: nextN })}
          </p>

          {/* Odczyt kierunku — informacja, po ktora user tu przyszedl.
              Punkty sa produktem ubocznym, wektor jest sygnalem. */}
          {/* W poziomie JEDEN przewijalny rzad — zawijanie urosloby pasek
              do trzech linii i zjadlo dolna krawedz tarczy. */}
          {shots.length > 0 && (
            <div className={`flex gap-1 ${landscape ? 'flex-nowrap overflow-x-auto mt-0.5 pb-0.5' : 'flex-wrap justify-center mb-2'}`}>
              {shots.map(s => {
                const { clock } = shotDirection(targetType, s.x, s.y);
                return (
                  <span
                    key={s.n}
                    className="text-[10px] font-bold text-white/80 bg-white/10 rounded-lg px-1.5 py-0.5 tabular-nums whitespace-nowrap shrink-0"
                  >
                    <span className="text-[#fed33e]">{s.n}</span>
                    {' '}
                    {clock === null
                      ? t('delayMirror.seriesCenter', { score: s.score })
                      : t('delayMirror.seriesClock', { score: s.score, clock })}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <button
          onClick={() => onReady({ targetType, arrowCount, shots })}
          disabled={shots.length === 0}
          className={`rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
            landscape ? 'shrink-0 py-2.5 px-5' : 'w-full py-3'
          } ${
            shots.length === 0
              ? 'bg-white/10 text-white/30 cursor-not-allowed'
              : 'bg-[#fed33e] text-[#0a3a2a] active:scale-95 shadow-lg shadow-[#fed33e]/20'
          }`}
        >
          {t('delayMirror.seriesToReplay')}
        </button>
      </div>
    </>
  );
}
