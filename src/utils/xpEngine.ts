// src/utils/xpEngine.ts

export const ARCHERY_RANKS = [
  { level: 1, name: "Adept Cięciwy", minXp: 0, color: "#94a3b8" },
  { level: 2, name: "Uczeń Karbu", minXp: 500, color: "#4ade80" },
  { level: 3, name: "Strażnik Majdanu", minXp: 1500, color: "#22d3ee" },
  { level: 4, name: "Mistrz Balistyki", minXp: 3500, color: "#818cf8" },
  { level: 5, name: "Grot Wyborowy", minXp: 7000, color: "#fbbf24" },
  { level: 6, name: "Sokole Oko", minXp: 12000, color: "#f87171" },
  { level: 7, name: "Srebrny Promień", minXp: 20000, color: "#e2e8f0" },
  { level: 8, name: "Złoty Środek", minXp: 35000, color: "#fbbf24" },
  { level: 9, name: "Legenda Torów", minXp: 60000, color: "#c084fc" },
  { level: 10, name: "Arcymistrz GROT-X", minXp: 100000, color: "#0a3a2a" },
];

/**
 * Główna funkcja licząca XP z różnych źródeł
 */
export const calculateTotalXP = (sessions: any[], techShots: any[] = []) => {
  let totalXP = 0;

  // 1. XP z sesji punktowanych
  sessions.forEach(s => {
    // Podstawa: 3 XP za strzałę + 0.2 XP za każdy punkt
    let sessionXP = ((s.arrows || 0) * 3) + ((s.score || 0) * 0.2);

    // Mnożnik za ambicję (Arena/Turniej/Klub = 1.2x)
    const isSpecial = s.type === 'Arena' || s.type === 'Turniej' || s.type === 'Klub' || s.type === 'CLUB';
    if (isSpecial) {
      sessionXP *= 1.2;
    }
    totalXP += sessionXP;
  });

  // 2. XP ze strzałów technicznych (Tech Shots)
  // Każdy strzał techniczny to 4 XP (bo to czysta praca nad formą)
  techShots.forEach(ts => {
    totalXP += (ts.count || 0) * 4;
  });

  // 3. Bonusy za rekordy życiowe (PB)
  // Za każdy unikalny dystans, na którym użytkownik ma sesję, dajemy bonus za progres
  const uniqueDistances = new Set(sessions.map(s => s.distance));
  totalXP += (uniqueDistances.size * 250); // Bonus za wszechstronność dystansową

  return Math.round(totalXP);
};

export const getRankProgress = (totalXp: number) => {
  const currentRank = [...ARCHERY_RANKS].reverse().find(r => totalXp >= r.minXp) || ARCHERY_RANKS[0];
  const nextRank = ARCHERY_RANKS[currentRank.level] || null;

  let progress = 100;
  if (nextRank) {
    const range = nextRank.minXp - currentRank.minXp;
    const currentPos = totalXp - currentRank.minXp;
    progress = Math.min(Math.round((currentPos / range) * 100), 100);
  }

  return { currentRank, nextRank, progress, totalXp };
};