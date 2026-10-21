import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { doc, getDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import { UserDistance, distanceColorMap, distancesForSetup } from '../config/distances';
import { friendlyTargetName } from '../config/targetFaces';
import { TargetThumbnail } from './targets/TargetThumbnail';
import DistancePicker from './DistancePicker';
import { formatRange, targetFitsDistance } from '../config/targetDistanceRanges';

interface BattleJoinDistanceModalProps {
  userId: string;
  activeDistances: UserDistance[];
  /** Ostatni dystans z przygotowania — zaznaczony z góry. */
  initial?: UserDistance;
  /** Tarcza bitwy — wspólna, tu tylko do pokazania. */
  targetType: string;
  /** Już strzelał w tej grze — „Wracasz do gry"; inaczej potwierdzenie dołączenia. */
  resume?: boolean;
  hostName?: string;
  /** Klub gospodarza (gra klubowa) — wiadomo, do czyjej gry się dołącza. */
  hostClub?: string;
  mode?: string;
  /** Może rzucić (odrzucone dopisanie) — wtedy okno pokazuje błąd. */
  onConfirm: (d: UserDistance) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Dołączenie do bitwy kodem albo z zaproszenia omija lobby, więc tu wybiera się
 * własny dystans (tarcza jest wspólna). Bez tego szło się z ostatnim dystansem
 * z przygotowania — np. 30 m na 122 cm. Lista jak w przygotowaniu: aktywny zestaw.
 */
export default function BattleJoinDistanceModal({ userId, activeDistances, initial, targetType, resume, hostName, hostClub, mode, onConfirm, onCancel }: BattleJoinDistanceModalProps) {
  const { t } = useTranslation();
  // Tylko dystanse, z których strzela się na tarczę bitwy (np. 122 cm: 30–90 m).
  const fits = (d: UserDistance) => targetFitsDistance(targetType, d.m);
  const [options, setOptions] = useState<UserDistance[]>(() => activeDistances.filter(fits));
  const [colors, setColors] = useState<Map<string, string>>(new Map());
  const [selected, setSelected] = useState<UserDistance | undefined>(() => (initial && fits(initial) ? initial : activeDistances.find(fits)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const confirm = async () => {
    if (!selected || busy) return;
    setBusy(true); setError(false);
    try { await onConfirm(selected); }
    catch (e) { console.error('Join battle failed:', e); setError(true); setBusy(false); }
  };

  useEffect(() => {
    let alive = true;
    getDoc(doc(db, 'users', userId))
      .then(snap => {
        if (!alive) return;
        const data = snap.data() || {};
        const setups = Array.isArray(data.setups) ? data.setups : [];
        const list = distancesForSetup(activeDistances, setups, data.activeSetupId ?? null, data.bowType ?? null).filter(fits);
        setOptions(list);
        setColors(distanceColorMap(activeDistances, setups));
        setSelected(prev => (prev && list.some(d => d.id === prev.id) ? prev : list[0]));
      })
      .catch(() => {});
    return () => { alive = false; };
    // Tylko przy otwarciu — App podaje nową tablicę przy każdym renderze.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return createPortal(
    <div className="fixed inset-0 z-[300000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in" onClick={onCancel}>
      {/* Ciemny styl Battle Arena, jak lobby i historia (user 2026-10-21). */}
      <div className="bg-[#111827] border border-white/10 text-white w-full max-w-sm rounded-[28px] p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-black text-white leading-tight">
          {resume ? t('battleJoin.titleBack') : t('battleJoin.title')}
        </h3>
        {mode === 'CLUB' && (
          <p className="text-[12px] font-black text-fuchsia-400 mt-1 flex items-start gap-1">
            <span className="material-symbols-outlined text-[15px] leading-none shrink-0">shield</span>
            <span className="leading-tight">{hostClub || t('battleLobby.club')}</span>
          </p>
        )}
        <p className="text-[11px] font-bold text-gray-500 mt-1 mb-4 truncate">
          {[mode === 'WORLD' ? 'World' : null, hostName ? t('battleJoin.host', { name: hostName }) : null].filter(Boolean).join(' · ')}
        </p>
        <div className="flex items-center gap-3 mb-4 bg-white/5 border border-white/10 rounded-2xl p-2.5">
          <TargetThumbnail targetType={targetType} className="w-10 h-10 shrink-0" />
          <div className="min-w-0">
            <p className="text-[9px] font-black text-indigo-300 uppercase tracking-widest leading-none mb-1">{t('setup.targetTitle')}</p>
            <p className="text-lg font-black text-white leading-none truncate">{friendlyTargetName(targetType, targetType)}</p>
          </div>
        </div>

        <p className="text-[9px] font-black text-indigo-300 uppercase tracking-widest mb-1.5">
          {t('battleLobby.myDistance')}{formatRange(targetType) ? ` · ${formatRange(targetType)}` : ''}
        </p>
        {options.length === 0 ? (
          <p className="text-[11px] font-bold text-gray-400 text-center py-3">{t('battleJoin.noFittingDistance', { target: friendlyTargetName(targetType, targetType), range: formatRange(targetType) })}</p>
        ) : (
          <DistancePicker options={options} colors={colors} selectedId={selected?.id} onPick={setSelected} dark />
        )}
        <p className="text-[9px] font-bold text-gray-500 text-center mt-3">{t('battleLobby.ownDistanceHint')}</p>
        {error && <p className="text-[10px] font-black text-red-400 text-center mt-2">{t('auth.errorGeneral')}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} className="flex-1 py-3 bg-white/10 text-gray-300 rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95">
            {t('battleLobby.cancel')}
          </button>
          <button
            onClick={confirm}
            disabled={!selected || busy}
            className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95 disabled:opacity-50"
          >
            {resume ? t('battleLobby.joinStart') : t('battleJoin.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
