import { GROUP_ICONS } from '../constants/groupIcons';

// Siatka 5×3 do wyboru ikony grupy (okno tworzenia i edycji grupy).
export default function GroupIconPicker({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  return (
    <div className="grid grid-cols-5 gap-1.5 mb-5" role="radiogroup">
      {GROUP_ICONS.map(icon => {
        const on = icon === value;
        return (
          <button
            key={icon}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={icon}
            onClick={() => onChange(icon)}
            className={`aspect-square rounded-xl flex items-center justify-center border-2 active:scale-90 transition-all ${
              on ? 'bg-rose-100 border-rose-500' : 'bg-gray-50 border-transparent'
            }`}
          >
            <span className={`material-symbols-outlined text-[22px] ${on ? 'text-rose-600' : 'text-gray-400'}`}>{icon}</span>
          </button>
        );
      })}
    </div>
  );
}
