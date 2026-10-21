import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { doc, getDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import { UserDistance, distanceColorMap, distancesForSetup } from '../config/distances';
import { friendlyTargetName } from '../config/targetFaces';
import { TargetThumbnail } from './targets/TargetThumbnail';
import DistancePicker from './DistancePicker';

interface BattleJoinDistanceModalProps {
  userId: string;
  activeDistances: UserDistance[];
  /** Ostatni dystans z przygotowania — zaznaczony z góry. */
  initial?: UserDistance;
  /** Tarcza bitwy — wspólna, tu tylko do pokazania. */
  targetType: string;
  onConfirm: (d: UserDistance) => void;
  onCancel: () => void;
}

/**
 * Dołączenie do bitwy kodem albo z zaproszenia omija lobby, więc tu wybiera się
 * własny dystans (tarcza jest wspólna). Bez tego szło się z ostatnim dystansem
 * z przygotowania — np. 30 m na 122 cm. Lista jak w przygotowaniu: aktywny zestaw.
 */
export default function BattleJoinDistanceModal({ userId, activeDistances, initial, targetType, onConfirm, onCancel }: BattleJoinDistanceModalProps) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<UserDistance[]>(activeDistances);
  const [colors, setColors] = useState<Map<string, string>>(new Map());
  const [selected, setSelected] = useState<UserDistance | undefined>(initial);

  useEffect(() => {
    let alive = true;
    getDoc(doc(db, 'users', userId))
      .then(snap => {
        if (!alive) return;
        const data = snap.data() || {};
        const setups = Array.isArray(data.setups) ? data.setups : [];
        const list = distancesForSetup(activeDistances, setups, data.activeSetupId ?? null, data.bowType ?? null);
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
      <div className="bg-white w-full max-w-sm rounded-[28px] p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <TargetThumbnail targetType={targetType} className="w-10 h-10 shrink-0" />
          <div className="min-w-0">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">{t('setup.targetTitle')}</p>
            <p className="text-lg font-black text-[#0a3a2a] leading-none truncate">{friendlyTargetName(targetType, targetType)}</p>
          </div>
        </div>

        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">{t('battleLobby.myDistance')}</p>
        {options.length === 0 ? (
          <p className="text-[11px] font-bold text-gray-400 text-center py-3">{t('setup.noDistances')}</p>
        ) : (
          <DistancePicker options={options} colors={colors} selectedId={selected?.id} onPick={setSelected} />
        )}
        <p className="text-[9px] font-bold text-gray-400 text-center mt-3">{t('battleLobby.ownDistanceHint')}</p>

        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95">
            {t('battleLobby.cancel')}
          </button>
          <button
            onClick={() => { if (selected) onConfirm(selected); }}
            disabled={!selected}
            className="flex-1 py-3 bg-[#0a3a2a] text-white rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95 disabled:opacity-50"
          >
            {t('battleLobby.joinStart')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
