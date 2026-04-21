export type BowType = 'Klasyczny (Recurve)' | 'Bloczkowy (Compound)' | 'Goły (Barebow)' | 'Tradycyjny';
export type Season = 'Hala (Indoor)' | 'Tory (Outdoor)';

export interface TargetRecommendation {
  distance: string;
  targetType: string; // Używamy konkretnych nazw dla UI: '3-Spot', '40cm', '60cm', '80cm', '122cm'
  targetFaceSize: string; 
}

export const getRecommendation = (
  bowType: BowType, 
  birthYear: number, 
  season: Season,
  gender: 'M' | 'K' = 'M'
): TargetRecommendation => {
  
  const currentYear = new Date().getFullYear(); // Rok 2026 [cite: 2]
  const age = currentYear - birthYear;

  // ----------------------------------------------------
  // HALA (INDOOR) - 18 METRÓW [cite: 13, 22, 34]
  // ----------------------------------------------------
  if (season === 'Hala (Indoor)') {
    
    // COMPOUND: Wszystkie klasy (od Seniorów po Schüler A) -> 40cm 3-Spot (6-10) [cite: 23, 57]
    if (bowType === 'Bloczkowy (Compound)') {
      return { distance: '18m', targetType: '3-Spot', targetFaceSize: '40cm' };
    }

    // BAREBOW: Wszystkie klasy (od Seniorów po Schüler A) -> Pełna 40cm [cite: 35, 36]
    if (bowType === 'Goły (Barebow)') {
      return { distance: '18m', targetType: '40cm', targetFaceSize: '40cm' };
    }
    
    // RECURVE:
    if (bowType === 'Klasyczny (Recurve)') {
      // Schüler B (11-12 lat) -> Pełna 60cm 
      if (age >= 11 && age <= 12) {
        return { distance: '18m', targetType: '60cm', targetFaceSize: '60cm' };
      }
      // Herren/Damen (21-49) & Junioren (18-20) -> 3-Spot 40cm (3x20cm) [cite: 4, 14, 57]
      if (age >= 18 && age <= 49) {
        return { distance: '18m', targetType: '3-Spot', targetFaceSize: '40cm' };
      }
      // Jugend (15-17), Master (50-65), Senioren (>=66) oraz Schüler A (13-14) -> Pełna 40cm [cite: 4, 14]
      return { distance: '18m', targetType: '40cm', targetFaceSize: '40cm' };
    }
  }

  // ----------------------------------------------------
  // TORY (OUTDOOR) - RUNDA OLIMPIJSKA [cite: 6, 18, 30]
  // ----------------------------------------------------
  if (season === 'Tory (Outdoor)') {

    if (bowType === 'Bloczkowy (Compound)') {
      // Tarcza 80cm Spot (6-10) dla wszystkich klas [cite: 19]
      if (age <= 12) return { distance: '25m', targetType: '80cm (6-Ring)', targetFaceSize: '60cm' }; // Schüler B [cite: 20]
      if (age <= 14) return { distance: '30m', targetType: '80cm (6-Ring)', targetFaceSize: '60cm' }; // Schüler A [cite: 20]
      if (age <= 17) return { distance: '40m', targetType: '80cm (6-Ring)', targetFaceSize: '80cm' }; // Jugend [cite: 20]
      return { distance: '50m', targetType: '80cm (6-Ring)', targetFaceSize: '80cm' }; // Herren/Master/Senior [cite: 20]
    }

    if (bowType === 'Goły (Barebow)') {
      if (age <= 12) return { distance: '20m', targetType: '80cm', targetFaceSize: '80cm' }; // Schüler B [cite: 32]
      if (age <= 14) return { distance: '30m', targetType: '80cm', targetFaceSize: '80cm' }; // Schüler A [cite: 32]
      if (age <= 17) return { distance: '35m', targetType: '122cm', targetFaceSize: '122cm' }; // Jugend [cite: 31]
      return { distance: '50m', targetType: '122cm', targetFaceSize: '122cm' }; // Herren/Master/Senior [cite: 31, 50]
    }

    if (bowType === 'Klasyczny (Recurve)') {
      // Tarcza 122cm dla wszystkich klas Recurve (z wyjątkiem Schüler B) [cite: 7]
      if (age >= 11 && age <= 12) return { distance: '25m', targetType: '60cm', targetFaceSize: '60cm' }; // Schüler B 
      if (age >= 13 && age <= 14) return { distance: '40m', targetType: '122cm', targetFaceSize: '122cm' }; // Schüler A 
      
      if (gender === 'M') {
        if (age >= 66) return { distance: '50m', targetType: '122cm', targetFaceSize: '122cm' }; // Senioren m [cite: 4, 8]
        if (age >= 50 || age <= 17) return { distance: '60m', targetType: '122cm', targetFaceSize: '122cm' }; // Master m / Jugend m [cite: 4, 8]
        return { distance: '70m', targetType: '122cm', targetFaceSize: '122cm' }; // Herren / Junior m [cite: 4, 8]
      } else {
        if (age >= 66) return { distance: '40m', targetType: '122cm', targetFaceSize: '122cm' }; // Senioren w [cite: 4, 8]
        if (age >= 50 || age <= 17) return { distance: '50m', targetType: '122cm', targetFaceSize: '122cm' }; // Master w / Jugend w [cite: 4, 8]
        return { distance: '70m', targetType: '122cm', targetFaceSize: '122cm' }; // Damen / Junior w [cite: 4, 8]
      }
    }
  }

  return { distance: '70m', targetType: '122cm', targetFaceSize: '122cm' };
};