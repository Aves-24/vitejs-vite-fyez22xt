import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next'; // <--- DODANE

interface WeatherProps {
  userId?: string;
  refreshTrigger?: number;
  variant?: 'horizontal' | 'compact-vertical';
}

export default function Weather({ userId, refreshTrigger = 0, variant = 'horizontal' }: WeatherProps) {
  const { t } = useTranslation(); // <--- DODANE
  const [weather, setWeather] = useState<{temp: number | null, wind: number | null}>({ temp: null, wind: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&current=temperature_2m,wind_speed_10m`
          );
          const data = await res.json();
          const temp = Math.round(data.current.temperature_2m);
          const wind = Math.round(data.current.wind_speed_10m);
          
          setWeather({ temp, wind });

          if (userId) {
            await setDoc(doc(db, 'users', userId), {
              lastWeather: {
                temp: temp,
                wind: wind,
                timestamp: new Date().toISOString()
              }
            }, { merge: true });
          }

        } catch (e) {
          console.error(t('weather.error'), e); // <--- ZMIANA (korzysta z i18n)
        }
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [refreshTrigger, userId, t]); // <--- DODANO t do zależności

  if (loading) return <span className="animate-pulse text-gray-400 font-bold text-[10px]">...</span>;

  // Układ dopasowany do górnego paska w ScoringView
  if (variant === 'compact-vertical') {
    return (
      <div className="flex flex-col items-center justify-center gap-1 text-[10px] text-gray-500 font-black uppercase">
        <div className="flex items-center gap-1">
          <span className="material-symbols-outlined text-[12px]">air</span> 
          {weather.wind}
        </div>
        <div className="flex items-center gap-1">
          <span className="material-symbols-outlined text-[12px]">thermostat</span> 
          {weather.temp}°
        </div>
      </div>
    );
  }

  // Układ domyślny (poziomy)
  return (
    <div className="flex items-center gap-2 text-[10px] text-gray-500 font-manrope font-extrabold uppercase">
      <div className="flex items-center gap-1">
        <span className="material-symbols-outlined text-sm">air</span>{' '}
        {weather.wind} {t('weather.windUnit')} {/* <--- ZMIANA (dynamiczna jednostka) */}
      </div>
      <div className="flex items-center gap-1">
        <span className="material-symbols-outlined text-sm ml-1">
          thermostat
        </span>{' '}
        {weather.temp}°
      </div>
    </div>
  );
}