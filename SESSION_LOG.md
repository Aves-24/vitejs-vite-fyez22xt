# Session Log — Funkcje Trenerskie

Plik dla kontynuacji pracy na innym komputerze. Zawiera streszczenie wszystkich zmian, decyzji architektonicznych i co jest dalej do zrobienia.

---

## 📅 Status na 2026-05-03

**Wszystkie 4 główne kroki funkcjonalności trenerskiej są UKOŃCZONE i działają na production.**

---

## ✅ Krok 1 — Wspólny dziennik trenerski

**Pliki:**
- `src/components/CoachLogPanel.tsx` — timeline + formularz, props `studentId`, `currentUserId`, `mode: 'coach' | 'student'`
- `firestore.rules` — sekcja `users/{uid}/coachLog` (deployed na production)

**Funkcjonalność:**
- Kolekcja `users/{studentId}/coachLog` — wpisy widoczne dla wszystkich trenerów ucznia
- Typy wpisów: `observation` 🟢 / `tip` 🟡 / `goal` 🔵 / `flag` 🔴
- Max 300 znaków, walidacja serverside w regułach
- Kasować może tylko autor wpisu lub admin
- Uczeń może czytać (mode='student' w MyCoachView)

**Integracja:**
- StudentProfileView → Tab 2 "Tagebuch" (mode='coach')
- MyCoachView → Tab "Tagebuch" (mode='student', read-only)

---

## ✅ Krok 2 — CoachCalendarMirror

**Pliki:**
- `src/utils/coachCalendarMirror.ts` — helper do mirroringu eventów

**API:**
- `mirrorTrenerEventToStudents(event, originEventId, studentIds, coachId)` — kopiuje event do uczniów
- `updateMirroredEvent(originEventId, event, newStudentIds, coachId)` — synchronizuje update
- `deleteMirroredEvent(originEventId, studentIds)` — usuwa mirrored docs

**Schema mirrored doc** (w `users/{studentId}/tournaments`):
```js
{
  title, date, time, address, note,
  category: 'Trener',
  distance, type,
  originCoachId, originCoachName,  // ← coachName cached
  originEventId,
  isMirrored: true,
  createdAt: serverTimestamp()      // ← do detekcji nowych planów
}
```

**Integracja w CalendarView:**
- Przy `addDoc` nowego eventu kategorii 'Trener' → wywoła mirror
- Przy `updateDoc` → sync z `updateMirroredEvent`
- Przy `deleteDoc` → cleanup z `deleteMirroredEvent`
- `coachStudents: 'all'` rozwiązywane na pełną listę `coachStudentsList`

---

## ✅ Krok 3 — MyCoachView (widok ucznia "Mój trener")

**Pliki:**
- `src/views/MyCoachView.tsx` — full screen widok z 3 tabami

**3 taby:**
1. **PLAN** (`event` icon) — `<CoachPlanBanner compact={false} />` — wszystkie nadchodzące eventy trenera
2. **TAGEBUCH** (`edit_note`) — `<CoachLogPanel mode='student' />` (read-only)
3. **TRAINER** (`group`) — lista trenerów (avatar inicjały + klub)

**App.tsx zmiany:**
- Dodano typ `'MY_COACH'` do `AppView`
- Stan `hasCoach` (true gdy `data.coaches.length > 0`)
- Lazy import + render `currentView === 'MY_COACH'`
- `MY_COACH` w `hiddenViews` (widok pełnoekranowy)
- Dolne menu — przycisk po lewej od żółtego (gdy `hasCoach`):
  - Ikona `school` 🎓
  - Etykieta i18n: **Schütze** (DE) / **Łucznik** (PL) / **Archer** (EN)
- Globalny home button (`absolute top-5 left-4`) ukryty na MY_COACH (MyCoachView ma własny back)

---

## ✅ Krok 4 — CoachPlanBanner (banner z planem na dziś/jutro)

**Pliki:**
- `src/components/CoachPlanBanner.tsx` — 2 tryby

**Tryb compact (HomeView):**
- Pokazuje TYLKO eventy na dziś/jutro
- Ciemny gradient banner z żółtą ikoną sports
- Pokazuje tytuł, godzinę, nazwisko trenera
- `+N` badge gdy jest więcej eventów
- onClick → MY_COACH

**Tryb full (MyCoachView Tab PLAN):**
- Pokazuje WSZYSTKIE nadchodzące eventy (`date >= today`)
- Lista białych kart z pełnymi szczegółami
- Pokazuje opis (note), miejsce, godzinę, trenera

**Format daty (`formatDateLabel`):**
- Dzisiaj → "Heute"
- Jutro → "Morgen"
- Ten rok → "Mi · 15. Aug" (skrócony format)
- Inny rok → "15. Aug 2027"
- Auto-detect języka z `i18n.language`

**Query optimization:**
- Tylko 1 prosty filtr `where('category', '==', 'Trener')` (żeby uniknąć composite index w Firestore)
- Reszta filtrowania i sortowania lokalnie

---

## 🔔 Powiadomienia (dzwoneczek)

**HomeView state:**
- `newAnnouncementType: 'none' | 'coach' | 'system'` — kolor badge
- `hasNewCoachPlan: boolean` — czy jest nowy plan trenera (z tournaments)
- `hasCoachAnnouncement: boolean` — czy są nowe announcements od trenera

**Logika detekcji:**
- Fetch `users/{userId}/tournaments` z `category=='Trener'`
- Compare `data.createdAt > localStorage.last_seen_coach_plan_${userId}`
- Tylko events z `date >= today` liczy się jako "nowy"

**Klik dzwoneczka — inteligentne kierowanie:**
- Jeśli `hasCoachAnnouncement` lub system → ANNOUNCEMENTS
- Jeśli tylko `hasNewCoachPlan` → MY_COACH (PLAN tab)
- Po kliknięciu zapis `last_seen_coach_plan` (badge znika)

---

## 🎤 Voice-to-text (cross-cutting)

**Pliki:**
- `src/hooks/useVoiceInput.ts` — centralny hook Web Speech API

**Auto-detect języka z `i18n.language`:**
- de → de-DE
- pl → pl-PL
- en → en-US

**Style przycisku:**
- Normalnie: żółty `#fed33e`
- Recording: czerwony + `animate-pulse` + `scale-105`

**Dodane w 3 miejscach:**
1. `CoachLogPanel` — formularz dziennika
2. `CoachNoteModule` (w StudentProfileView) — notatka per sesja (max 100 znaków)
3. `PrivateNoteModal` (w StudentProfileView) — 3 prywatne notatki (max 200 znaków każda)

---

## 🎨 StudentProfileView — Refactor UI

**Header:**
- Gradient `from-[#0a3a2a] to-[#0d4a36]` zamiast solid
- Łagodniejsze rounded-b-[36px]
- Glass cards (`bg-white/[0.07] backdrop-blur-sm`) bez ostrych borderów

**Layout statystyk:**
- Rząd 1: 3 kafelki kompaktowo [⚡ strzały/m] [🎯 avg14] [🏆 ostatni wynik]
- Rząd 2: Ergebniskurve pełna szerokość, 75% wykres + 25% legenda

**3 taby (zastąpiły scroll-all):**
1. **ÜBERBLICK** (`space_dashboard`) — turniej + karuzela sesji
2. **TAGEBUCH** (`edit_note`) — CoachLogPanel
3. **ANALYTIK** (`monitoring`) — pełna StatsView

**Tab bar styl:**
- Pill style — szare tło, aktywny tab = zielona pigułka z żółtymi ikonami

**Trend Modal (klik wykresu Ergebniskurve):**
- Identyczny jak HomeView ucznia
- Duży SVG z gradient fill + żółtą linią
- Lista sesji z datą, dystansem, wynikiem
- **Pokazuje nazwę turnieju** zamiast generic "Turnier" (`sess.title || sess.tournamentName`)

---

## 📋 CoachDashboardView — preview ostatniego wpisu

W liście uczniów pod nazwiskiem pokazuje się **ostatni wpis trenera z coachLog**:
- Mała kropka kolorem typu wpisu (observation/tip/goal/flag)
- Tekst skrócony (`truncate`)
- Pojawia się tylko gdy istnieje wpis
- Fetch równoległy `Promise.all` po załadowaniu listy uczniów

---

## 🔥 Firestore Rules — co teraz zezwala

**`/users/{uid}/coachLog/{entryId}`:**
- read: właściciel, admin, lub trenerzy ucznia (z `coaches[]`)
- create: tylko trenerzy ucznia, walidacja długości tekstu (1-300), validacja typu
- update: zablokowane (immutable wpisy)
- delete: tylko autor lub admin

**`/users/{uid}/sessions/{sessionId}`:**
- Trenerzy mogą edytować tylko `coachNote` + `coachEditCount`

**Wszystko zdeployowane:** `firebase deploy --only firestore:rules`

---

## 🔮 Co dalej? (przyszłe kroki)

### Możliwe enhancements:
- [ ] Pole "Opis treningu" w formularzu CalendarView (obecnie nie ma — trener nie może pisać szczegółów planu)
- [ ] Push notifications (FCM) dla nowych planów
- [ ] Web view dla trenera (desktop layout — komponenty są reusable)
- [ ] Cloud Functions dla bezpieczeństwa (premium grants, server-side coach add)

### Architektura web dla trenera:
- Logika biznesowa (Firestore queries, hooks, useVoiceInput) — łatwo reuse'ować
- Layout całkiem inny (sidebar/2-column zamiast mobile tabs)
- Firestore rules już wspierają trenera — bez zmian
- Komponenty React można brać i zmieniać tylko styling

---

## 🛠️ Setup na nowym komputerze

```bash
git clone https://github.com/Aves-24/vitejs-vite-fyez22xt.git G-X
cd G-X
npm install
npm run dev
```

**Firebase:**
- Projekt: `grotx-fb8f8`
- Reguły są w `firestore.rules`, deploy: `firebase deploy --only firestore:rules`
- Auth: Firebase login z konta admin (info@aves-24.de lub rafal.woropaj@googlemail.com)

---

## 📦 Główne pliki funkcjonalności trenerskiej

```
src/
├── App.tsx                        # routing, hasCoach state, dolne menu
├── components/
│   ├── CoachLogPanel.tsx          # dziennik trenerski
│   └── CoachPlanBanner.tsx        # banner planu (compact + full)
├── hooks/
│   └── useVoiceInput.ts           # Web Speech API
├── utils/
│   └── coachCalendarMirror.ts     # mirror eventów do uczniów
├── views/
│   ├── CoachDashboardView.tsx     # lista uczniów (z preview wpisu)
│   ├── StudentProfileView.tsx     # profil ucznia (3 taby)
│   ├── MyCoachView.tsx            # widok ucznia "Mój trener" (3 taby)
│   ├── HomeView.tsx               # banner planu + dzwoneczek
│   └── CalendarView.tsx           # tworzenie eventów + mirror integration
└── locales/
    ├── de.ts                      # nav.myCoach: "Schütze"
    ├── pl.ts                      # nav.myCoach: "Łucznik"
    └── en.ts                      # nav.myCoach: "Archer"

firestore.rules                     # reguły bezpieczeństwa
```

---

## 🐛 Naprawione bugi w tej sesji

1. **PLAN tab pusty** — query `where('date', 'in', [...]) + orderBy` wymagał composite index → uproszczono do 1 filtru + sort lokalnie
2. **`originCoachName` nie zapisywane** — dodano fetch z cache w `coachCalendarMirror`
3. **Dzwoneczek prowadził na ANNOUNCEMENTS** — gdy źródło to plan trenera, idzie na MY_COACH
4. **"Morgen" dla wszystkich eventów** — `formatDateLabel` rozróżnia dzisiaj/jutro/inny dzień
5. **Globalny home button nakładał się na MyCoachView header** — dodano MY_COACH do hiddenViews
6. **Sport icon w MyCoachView header** → zmieniono na `school` (rozróżnienie ucznia od trenera)
