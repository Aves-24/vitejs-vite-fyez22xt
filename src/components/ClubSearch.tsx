import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface ClubSearchProps {
  onSelect: (clubName: string, city: string, placeId: string) => void;
  initialValue?: string;
  placeholder?: string;
}

// WPISZ TUTAJ SWÓJ KLUCZ GOOGLE PLACES API
const GOOGLE_MAPS_API_KEY = 'TWOJ_KLUCZ_API';

export default function ClubSearch({ onSelect, initialValue = '', placeholder }: ClubSearchProps) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState(initialValue);
  const [predictions, setPredictions] = useState<any[]>([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const [isManual, setIsManual] = useState(false);
  
  const autocompleteService = useRef<any>(null);
  const sessionToken = useRef<any>(null);

  useEffect(() => {
    // Ładowanie skryptu Google Maps jeśli jeszcze go nie ma
    if (!window.google && !document.getElementById('google-maps-script')) {
      const script = document.createElement('script');
      script.id = 'google-maps-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
      script.async = true;
      document.body.appendChild(script);
      script.onload = () => {
        initAutocomplete();
      };
    } else if (window.google) {
      initAutocomplete();
    }
  }, []);

  const initAutocomplete = () => {
    if (!window.google) return;
    autocompleteService.current = new window.google.maps.places.AutocompleteService();
    sessionToken.current = new window.google.maps.places.AutocompleteSessionToken();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    if (isManual) {
        // Jeśli tryb ręczny, wysyłamy dane na bieżąco bez placeId
        onSelect(value, '', '');
        return;
    }

    if (value.length > 2 && autocompleteService.current) {
      autocompleteService.current.getPlacePredictions(
        {
          input: value,
          types: ['establishment', 'club'], // Szukamy firm/klubów
          sessionToken: sessionToken.current,
        },
        (results: any) => {
          setPredictions(results || []);
          setShowPredictions(true);
        }
      );
    } else {
      setPredictions([]);
      setShowPredictions(false);
    }
  };

  const handleSelectPrediction = (prediction: any) => {
    const mainText = prediction.structured_formatting.main_text;
    const secondaryText = prediction.structured_formatting.secondary_text || '';
    
    setInputValue(mainText);
    setShowPredictions(false);
    setIsManual(false);

    // Wyciągamy miasto z opisu (zazwyczaj pierwszy człon secondary_text)
    const city = secondaryText.split(',')[0].trim();
    
    onSelect(mainText, city, prediction.place_id);
  };

  const enableManualMode = () => {
    setIsManual(true);
    setShowPredictions(false);
    setPredictions([]);
    // Informujemy rodzica o czystym polu ręcznym
    onSelect(inputValue, '', 'MANUAL');
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => predictions.length > 0 && setShowPredictions(true)}
          placeholder={placeholder}
          className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm font-bold text-[#333] outline-none transition-all focus:border-emerald-500"
        />
        {inputValue && !isManual && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-300 text-sm">search</span>
        )}
        {isManual && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-orange-400 text-sm">edit_note</span>
        )}
      </div>

      {showPredictions && predictions.length > 0 && (
        <div className="absolute z-[1000] w-full mt-1 bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden animate-fade-in">
          {predictions.map((p) => (
            <button
              key={p.place_id}
              onClick={() => handleSelectPrediction(p)}
              className="w-full text-left p-3 hover:bg-emerald-50 border-b border-gray-50 last:border-0 transition-colors flex flex-col"
            >
              <span className="text-xs font-black text-[#0a3a2a]">{p.structured_formatting.main_text}</span>
              <span className="text-[10px] text-gray-400 font-bold">{p.structured_formatting.secondary_text}</span>
            </button>
          ))}
          
          <button 
            onClick={enableManualMode}
            className="w-full p-3 bg-gray-50 text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:bg-emerald-100 transition-colors flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">add_circle</span>
            {t('common.noClubManual', 'Nie ma mojego klubu? Wpisz ręcznie')}
          </button>
        </div>
      )}
    </div>
  );
}