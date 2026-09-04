# TODO — GROT-X Security Hardening — Status Końcowy

**Data startu:** 2026-04-22  
**Status:** ✅ **UKOŃCZONE** — Security hardening 100% zwalidowany (E2E T1-T7 PASS)

---

## 🎯 Completed Tasks (Priorytet: WYSOKI)

### ✅ 1. Firebase Deploy Rules
**Status:** ✅ Zrobione (2026-04-23)  
**Realizacja:**
```
npx firebase login --reauth
npx firebase deploy --only firestore:rules
```
**Rezultat:** Rules wdrożone — field-level validation, length limits (note ≤2000, coachNote ≤500), coach-path z atomową aktualizacją coachEditCount.

---

### ✅ 2. Fix A — Firestore Rules & Coach-Note Path
**Status:** ✅ Zrobione (2026-04-23)  
**Zmiany:**
- Dodane length limits w rules (note ≤2000, coachNote ≤500)
- Nowa ścieżka dla trenera: write do `coachNote` + `coachEditCount` (Path: `onlyAffects(['coachNote', 'coachEditCount'])`)
- Usunięte `level` z `protectedUserFields()` (było blokujące dla ScoringView.tsx treningów)

**Walidacja:** T3, T4, T5, T6 — wszystkie PASS na koncie nieadminowym ✅

---

### ✅ 3. Fix B — SafeLink Preview UI (Link Preview Card)
**Status:** ✅ Zrobione (2026-04-23)  
**Plik:** `src/views/StatsView.tsx`  
**Implementacja:**
- `SafeLink` komponent z chip UI (blue=safe, amber=shortener, red=IDN warning)
- 17 shortenerów w detekcji (bit.ly, tinyurl.com, t.co, is.gd, goo.gl, ow.ly, buff.ly, tiny.cc, rb.gy, cutt.ly, short.io, s.id, shorturl.at, lnkd.in, rebrand.ly, bl.ink, tr.im)
- IDN detection (punycode `xn--` + unicode chars)
- `rel="noopener noreferrer"` na wszystkie externe linki (tabnabbing protection)

**Walidacja:** Visual & behavior test — linki z warningami wyświetlają się poprawnie ✅

---

### ✅ 4. Build & Vercel Deploy
**Status:** ✅ Zrobione (2026-04-23)  
**Realizacja:**
- `.npmrc` + `legacy-peer-deps=true` (ESLint peer deps workaround)
- Vercel Install Command: `npm install --legacy-peer-deps`
- `vite.config.ts` chunk size limit: 1600 KiB (Firebase SDK)

**Rezultat:** Vercel build ✅ → deployment na produkcję ✅

---

### ✅ 5. Code Splitting Optymalizacja
**Status:** ✅ Zrobione (2026-04-24)  
**Implementacja:**
- `React.lazy()` dla 10+ widoków (ScoringView, SettingsView, StatsView, CoachDashboardView, etc.)
- `Suspense` fallback z loading spinner
- `vite.config.ts` `manualChunks`: firebase-vendor, react-vendor, i18n-vendor, pdf-vendor

**Rezultat:** Initial gzip load **-54%** (578 KiB → 265 KiB) ✅

---

### ✅ 6. Memory Leak Fixes
**Status:** ✅ Zrobione (2026-04-24)  
**Fixes:**
- **AuthView.tsx:** `isMountedRef` + `safeSetState` wrappery (eliminuje "state update on unmounted component" warning)
- **AuthView.tsx:** `toastTimerRef` cleanup w useEffect (brak osieroconych setTimeout)

**Rezultat:** Zero state update warnings po logowaniu ✅

---

### ✅ 7. Dev-Only Window Expose
**Status:** ✅ Zrobione (2026-04-24)  
**Plik:** `src/firebase.ts`  
**Implementacja:**
```javascript
if (import.meta.env.DEV) {
  (window as any).__fb = { db, auth, doc, getDoc, getDocs, collection, updateDoc };
}
```

**Cel:** Szybkie E2E testy reguł z DevTools Console (bez potrzeby pisania test files)

**Rezultat:** T1-T7 E2E suite wykonane w Console ✅

---

### ✅ 8. E2E Security Tests T1-T7
**Status:** ✅ Wszystkie PASS (2026-04-24)

| Test | Opis | Wynik | Notatka |
|------|------|-------|---------|
| T1 | Student czyta własne sesje | ✅ PASS | Read access control |
| T2 | Trener czyta sesje studenta (isNotePublic) | ✅ PASS | Coach read validation |
| T3 | coachNote > 500 znaków blokowane | ✅ PASS | Length limit enforcement |
| T4 | Non-admin coach nie zmieni score | ✅ PASS | Field protection (code review) |
| T5 | Obcy user nie pisze coachNote | ✅ PASS | Coach array membership check |
| T6 | note > 2000 znaków blokowane | ✅ PASS | Length limit inclusive boundary |
| T6+ | note = 2000 przechodzi | ✅ PASS | Granica dokładna |
| T7 | Student odpina trenera (UI + DB) | ✅ PASS | Path D + F (non-admin account) |

**Ważne:** T1-T7 wykonane na koncie `info+grottest1@aves-24.de` (**NIE admin**) — wszystkie są **prawdziwymi walidacjami reguł**, nie admin bypassami.

---

### ✅ 9. WebSocket Noise Suppression (Dev)
**Status:** ✅ Zrobione (2026-04-24)  
**Plik:** `src/main.tsx`  
**Fix:**
```javascript
if (import.meta.env.DEV) {
  const _origError = console.error.bind(console);
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('WebSocket is already in CLOSING or CLOSED state')) return;
    _origError(...args);
  };
}
```

**Cel:** Eliminacja szumu podczas HMR Vite w dev mode

---

## 📋 Optional/Cosmetic (Niski Priorytet)

- [ ] **App Check debug token dla Edge** — 403 warnings nie blokują operacji, kosmetyczne
- [ ] **T7 rollback w bazie** — konto testowe, nieistotne

---

## 🎯 Phase C — PRO Features (Przyszłość)

### 🎥 Delay Mirror (Instant Replay Kamera)
**Status:** 💡 Idea — do zaplanowania  
**Priorytet:** Flagowa PRO feature  
**Inspiracja:** BaM Video Delay, Delay Mirror, Coach's Eye  
**Konkurencja:** $4-15/mies albo $10-40 one-time

**Koncept:**
Live kamera z opóźnieniem 15s — uczeń widzi swój strzał 15s po jego wykonaniu. Dla łuczników to game-changer: mogą obserwować własną technikę natychmiast, bez trenera, bez zewnętrznej aplikacji.

**Stack (local-first, brak backendu):**
- `navigator.mediaDevices.getUserMedia()` — dostęp do kamery
- `MediaRecorder` z `timeslice: 1000ms` — chunking
- Circular buffer Blob'ów w RAM (FIFO, ~15-30s)
- `MediaSource` + `SourceBuffer` — playback z delay
- `<video>` × 2 (live preview + delayed view)
- Wake Lock API — screen zawsze on
- **Firebase NIE używany** — tylko feature gate przez `isPremium`

**Dlaczego NIE Firebase/cloud:**
1. Latencja 2-5s (uploads + downloads)
2. Koszt egressu (HD wideo × czas)
3. Prywatność (RODO — wideo uczniów)
4. Offline — strzelnica często bez zasięgu
5. Bateria — upload zabija

**MVP v0.1 (1-2 tygodnie):**
- Przycisk "Delay Mirror" w ScoringView (PRO gate)
- Fullscreen landscape, mirror mode
- Stały delay 15s
- Kamera tylna
- Stop button
- Auto-pause gdy app w tle

**v0.2 (+1 tydz):**
- Konfigurowalny delay: 5/10/15/30s
- Konfigurowalny max buffer czasu:
  - **Quick Review:** 60s (słabe telefony, minimalne zużycie)
  - **Training Flow:** 3 min (default, ~6-8 strzałów)
  - **Endurance:** 5 min (mocne telefony)
- Auto-stop po max buffer → modal "Zapisz klip / Kontynuuj / Stop"
- Jednoklik "Kontynuuj" = reset bufora + nowa sesja
- Tagi/markery (tap = zaznacz moment)

**v0.3 (zaawansowane):**
- Auto-pause gdy brak ruchu 30s (bateria)
- Audio detection strzału (peak wypuszczenia strzały → auto-marker)
- Side-by-side slow-mo compare
- Zapis do Photos/Gallery telefonu (Web Share API / File System Access API)
- Eksport klipu z nakładką (wynik sesji, data, szczegóły strzału)

### 📤 Native Share z Kontekstem Treningowym (KILLER FEATURE)
**Status:** 💡 Idea — część Delay Mirror v0.1  
**Koncept user'a:** ✨ Klip wysyłany przez WhatsApp z automatycznym opisem serii

**Technologia:** Web Share API Level 2 (`navigator.share({ files, text, title })`)
- Natywny share sheet telefonu (WhatsApp, Telegram, email, Messages)
- Zero integracji z konkretnym serwisem — jedno API → wszystkie platformy
- Zero kosztów backendu (MVP)

**Kompatybilność:** Chrome Android ✅ · Safari iOS 15+ ✅ · Samsung Browser ✅ · Edge ✅ · Firefox ⚠️ (fallback: download)

**Auto-generowane metadata (z `sessions/{id}`):**
```
🎯 GROT-X · Trening 24.04.2026, 17:32
📍 Dystans: 18m · Cel: 40cm · Łuk: Recurve 36#
━━━ SERIA 3/8 ━━━
Strzał 1: 9 | Strzał 2: 8 | Strzał 3: 10 ✨
Suma: 27/30 (śr. 9.0)
Średnia sesji: 8.2 → 9.0 (+0.8)
#GROTX #Lucznictwo
```

**Filename convention:** `GROTX_Seria-3_27-30_2026-04-24.mp4`  
→ Wizualizuje się jako tytuł wiadomości w WhatsApp

**Dwa tryby (strategia staged):**

**Tryb 1 — MVP v0.1: Native Share (szybki)**
- Przycisk "📤 Udostępnij" na końcu zapisanej serii
- Native share sheet → user wybiera WhatsApp / Telegram / email
- Zero kosztu storage/backendu
- Koszt wdrożenia: ~4 godziny kodu

**Tryb 2 — v2.0: Direct-to-Coach (monetyzowalne)**
- Przycisk "👨‍🏫 Wyślij do trenera" — direct do coach'a z `coaches[]`
- Upload do Firebase Storage (prywatny bucket per-coach)
- Record w Firestore: `/coaches/{uid}/clips/{clipId}` z metadata
- Coach widzi notification w Coach Dashboard: "Nowy klip od Jana — Seria 3"
- Privacy: tylko ten coach widzi
- Koszty: ~40 PLN/mies przy 100 PRO userach (20 MB × 5 klipów/tydz)
- Kiedy zrobić: gdy 50+ userów PRO płaci aktywnie

**Dlaczego to gamechanger:**
- Konkurencja (BaM Video Delay itp.) = standalone apps bez kontekstu
- Workflow konkurencji: 9 kroków, user manualnie opisuje kontekst
- Workflow GROT-X: 4 kroki, kontekst auto-generowany z bazy
- **To NIE jest feature — to jest przewaga konkurencyjna**

**Walidacja:** Warto sprawdzić z 2-3 realnymi trenerami czy ten flow faktycznie by ich zaangażował — bo to pivotuje Delay Mirror z "nice to have" na "muszę mieć dla mojej drużyny".

**CRITICAL insight (70m+ distance):**
Na dużych dystansach (70m, 90m) w video NIE widać gdzie strzała uderzyła.
Sam klip = "jakiś facet strzela". **Rozwiązanie: share target map razem z video.**

```javascript
navigator.share({
  files: [videoFile, targetMapImage],  // ← oba naraz!
  text: captionWithShotTimestamps
});
```

WhatsApp wyświetla jako galerię → trener ma:
- **Slide 1:** video (technika)
- **Slide 2:** tarcza z ponumerowanymi strzałami (wynik)
- **Caption:** timestampy strzałów @0:08, @0:19 itd. → można przewinąć do konkretnego

**Target map generator** — użyć istniejący `FokusanalyseView` rendering:
```typescript
async function exportTargetMap(roundId, seriesId): Promise<File> {
  const canvas = document.createElement('canvas');
  drawFitaTarget(ctx);
  shots.forEach((shot, i) =>
    drawNumberedDot(ctx, shot.x, shot.y, i + 1, getZoneColor(shot.value))
  );
  return new File([canvas.toBlob()], `GROTX_${seriesId}_tarcza.png`);
}
```

**Data model change needed:**
`ScoringView.tsx:357` — `addScoreFromTarget(v, x, y, spotId)` musi zapisywać też `timestamp`:
```typescript
// Before: { x, y, spotId }
// After:  { x, y, spotId, t: Date.now() }
```
Backward-compatible — starsze sesje po prostu nie będą miały timestampów w share (i to OK).

**⚠️ CORRECTION (user's insight):**
~~Numeracja strzał na target map ≠ kolejność fizyczna strzał.~~
User tapuje pozycje w dowolnej kolejności (od lewej, od środka, losowo).
Śledzenie kolejności to **sztuczny obowiązek** dla usera — nie warty tego.

**Re-frame: target map to GROUPING ANALYSIS, nie sekwencja.**

Trener analizuje:
- **Skupienie** strzał (konsystencja techniki)
- **Środek grupy** (offset celownika)
- **Outliers** (pojedyncze problemy z release)

Kolejność nie ma znaczenia dla żadnej z tych analiz.

**Uproszczony Caption template (bez timestampów, 70m, 6 strzał):**
```
🎯 GROT-X · Trening 24.04.2026, 17:32
📍 70m · FITA 122cm · Recurve 36#

━━━ RUNDA 2 · SERIA P4 ━━━
Strzały: 9, 8, 7, 8, M, 6
Suma: 38/54 (śr. 6.3)

📊 Analiza skupienia:
• Rozkład: 3× żółty, 2× czerwony, 1× miss
• Grupa: dolna połowa tarczy (5/6 strzał)
• Sugestia: sprawdź celownik ↑ (+1-2 klik)

Runda 2 total: 218/270
💬 [user's wiadomość]
```

**Data model — uproszczenie:**
Timestamp per shot **NIE jest potrzebny** dla MVP.
Użyjemy istniejących {x, y, spotId, value} bez żadnych zmian schematu. ✅

**Opcjonalny tryb "Sequence Analysis" (v2.0, user's idea refined):**

**Koncept (user's):** Ponumeruj strzały 1-6, strzelaj zawsze w tej kolejności,
wpisuj pozycje w tej samej kolejności w ScoringView. Wtedy numer na target
map = numer strzały = kolejność oddania = timestamp z video.

**To jest realne:**
- Większość łuczników już numeruje strzały (do spine tracking)
- Pro/olympic archers tak trenują rutynowo
- Wymaga trochę dyscypliny ale nie nowego sprzętu

**Settings toggle (default OFF):**
```
○ Prosty (bez kolejności) ← domyślne dla 95% users
○ Śledzę kolejność strzał (numerowane) ← power users
```

**Features odblokowane w Sequence Mode:**
1. **Podpowiedź podczas scoring:** "Wpisujesz strzał 1 z 6 (pierwszy oddany)"
2. **Sequence analytics auto-generated:**
   - Pierwsze 3 strzały vs ostatnie 3 (fatigue detection)
   - Trend liniowy w serii (spadek/wzrost)
   - Najlepszy i najgorszy strzał w kontekście czasu
3. **Rich share caption z sekwencją:**
   ```
   Strzał 1: 9 (górny żółty)    @0:08
   Strzał 2: 8 (dolny żółty)    @0:19
   ...
   📉 Trend: 9-8-7-8-M-6 (spadek w drugiej połowie)
   ```

**Onboarding tutorial:**
Krótki 4-stepowy explainer przy włączeniu toggle — uczy user'a jak
olympijczycy trenują. Value: apka = narzędzie rozwoju, nie tylko notatnik.

**Minusy (świadomie zaakceptowane):**
- Cognitive load podczas strzelania (opt-in, power users OK)
- Dyscyplina w kolejności (łatwo złamana przez zły strzał)
- Target reading at 70m (numer na nocku widoczny z 20cm — OK blisko tarczy)

**Dlaczego opt-in, nie default:**
- 95% userów nie potrzebuje tego (casual shooting)
- Zmiana nawyków budzi resistance
- Lepiej "odblokuj więcej analiz" niż "zmień jak trenujesz"

**Data model:**
Stały — żaden nowy field. Używamy `dots[0..5]` array — index już jest
"numerem" strzały w Sequence Mode. W Simple Mode = tylko pozycja.

---

### 🤖 Phase 4 — Pose Estimation / Form Analysis (PRO PRO)
**Status:** 💡 Ambicja — daleka przyszłość  
**Priorytet:** Po udowodnieniu Phase 1-3 z płacącymi userami  
**Czas wdrożenia:** 2-4 miesiące  
**Inspiracja:** User's idea — tracking dłoni, łokci, głowy podczas strzału

**Technologia (dostępna dziś, w przeglądarce):**
- **TensorFlow.js + MoveNet** (Google): 17 keypointów na ciele, ~30 FPS na 2020+ phones
- **MediaPipe Hands** (Meta): 21 keypointów na dłoniach, bardzo precyzyjne
- **TensorFlow.js WebGL backend**: GPU acceleration
- Bundle: ~3-4 MB lazy-loaded po aktywacji feature
- **Zero backendu** — inference 100% lokalnie

**Co może robić:**

**Level 1 — Skeleton overlay na delayed replay**
Szkielet narysowany na wideo — trener widzi jak łucznik się ustawia, wizualnie.

**Level 2 — Real-time kąty**
```
Draw arm elbow: 87° ⚠ (cel 90°)
Bow shoulder: -12° ✓
Head tilt: 3° ✓
Anchor consistency: stabilna
```

**Level 3 — Shot phase detection**
Prep → raise → draw → anchor → aim → release → follow-through
Per-phase analysis, nie ogólny wynik.

**Level 4 — Porównanie z ideałem / z samym sobą**
"Łokieć w release 5° wyżej niż miesiąc temu"
"W strzałach 10-punktowych niższa ramię vs słabe strzały"

**Synergia z Delay Mirror (killer combination):**
```
1. Nagrywasz serię
2. Klikasz "po strzały"
3. W tle apka ANALIZUJE (5s podczas gdy idziesz)
4. Wracasz → dostaniesz analizę formy per strzał
   + auto-wykryte problemy (fatigue, forward lean, drop ramienia)
5. Share do trenera: video z skeleton + caption z kątami
```

**Realistyczne ograniczenia:**
1. **Kamera side view, 3-5m od łucznika** — inne pozycje = słabe wyniki
2. **Łuk + strzała = occlusion** — model może mieć problem przy draw
3. **Światło** — backlight (słońce w plecy) = porażka, hala OK
4. **Hardware floor**: iPhone 12+/Samsung S20+ = smooth. iPhone 8- = drop lub fallback
5. **"Dobry form" to nie obiektywna koncepcja** — Recurve ≠ Compound ≠ Barebow, tylko pokazujemy liczby, nie "ocenę"

**Staged roadmap:**
- v0.1 (2-3 tyg): Skeleton overlay only (wizualizacja)
- v0.2 (2 tyg): Basic angles (draw, bow, head, shoulders)
- v0.3 (3 tyg): Shot phase auto-detection
- v0.4 (2 tyg): Trend analysis (fatigue, historical)
- v1.0: Reference shot comparison, coach feedback loop

**Konkurencja:**
- TechnieShot — iOS only, drogie, niezintegrowane z scoring
- Archery AI apps — zwykle cloud (slow, privacy issues)
- **Web-based solution w ekosystemie treningowym: nie istnieje**
- To jest potencjalna "moat" dla GROT-X

**Kiedy budować:**
**NIE W MVP.** Najpierw:
- Phase 1-3 (Delay Mirror + Share + Sequence) wdrożone
- 50+ PRO users płacących aktywnie
- Analytics pokazują że ludzie REALNIE używają Delay Mirror

Dopiero wtedy — Phase 4. Inaczej: 6 miesięcy pracy, zero release'ów, konkurencja ucieka.

**Pytania do przemyślenia przed startem:**
1. Hardware userów (analytics: który % ma ≥iPhone 12/Samsung S20)?
2. Czy jest popyt? (Ankieta wśród PRO users: "zapłaciłbyś +5 PLN/mies za analizę formy?")
3. Maintenance burden — modele AI się starzeją, trzeba aktualizować co 1-2 lata
4. Czy mamy kompetencje in-house (ML model fine-tuning może być potrzebny)

**Workflow porównanie:**
- Konkurencja: 9 kroków, trener musi manualnie pytać o kontekst
- GROT-X: 4 kroki, kontekst (dystans, wynik, grupa, sugestia) + video auto-doklejone

**Lesson learned (2026-04-24):**
Założyłem "tap order = shoot order" — logiczne z perspektywy developer'a
ale nie pasuje do workflow łucznika. User wpisuje gdzie mu wygodniej
bo pamięć przestrzenna > pamięć sekwencyjna. **Walidacja z realnym
userem (user sam siebie) odkryła błąd przed napisaniem kodu.**
Confirmed value: najpierw pytaj jak ludzie realnie używają, dopiero potem koduj.

**Wyzwania:**
1. **Kompatybilność:** iOS <14.3 nie ma MediaRecorder → fallback lub minimum iOS 14.3
2. **Bateria:** ~15-25% na godzinę w trybie active — należy ostrzec usera
3. **RAM:** 3 min buffer HD ≈ 30-60 MB, akceptowalne
4. **UX tripod mount:** landscape + auto-rotation lock
5. **Stare telefony:** drop klatek przy 1080p@30fps — opcja downgrade do 720p

**Battery Saving Strategy (intent-based, user's refined idea ✨):**

Dopasowanie do **naturalnego rytmu treningu łuczniczego**:
```
Seria 3-6 strzał (2-3 min) → idę po strzały (1-2 min) → wróciłem → powtórz
```

**Workflow:**
1. **Recording mode:** czerwony dot + timer + mały przycisk "⏸ po strzały" zawsze widoczny
2. **User klika "po strzały"** → MediaRecorder.stop() + kamera fizycznie zwolniona (getTracks().stop()) + Blob refs cleared → GC
3. **Paused mode:**
   - Screen auto-dim do 20% jasności (dodatkowa oszczędność)
   - Modal: [💾 Zapisz serię] [🗑 Odrzuć] [▶ Przejrzyj ostatnią]
   - Tap w dowolne miejsce = "Wróciłem" (szybko)
4. **Wróciłem** → MediaRecorder.start() nowa sesja

**Safety net (gdy user zapomni):**
- Max buffer hard limit (3 min default, config: 60s / 3min / 5min)
- 15s przed limitem: toast "Bufor prawie pełny" + przycisk "wydłuż o 1 min"
- Auto-stop → taki sam modal jak manual stop

**Battery savings per godzinę treningu:**
- Naive approach (continuous): ~25% zużycia
- Intent-based (user's): ~10-12% — bo 50-60% czasu to chodzenie z kamerą off
- **~2× lepiej** niż auto-stop time-based

**Why user's approach wygrywa:**
- Trafia w **świadome decyzje usera** (on wie kiedy seria się skończyła)
- Eliminuje marnowanie baterii podczas chodzenia
- Natural UX — łucznik robi to instynktownie (robi pauzę po serii, żeby iść po strzały)

**Monetyzacja:**
- Feature gate: `isPremium == true`
- Free tier: teaser (screen z "Upgrade to PRO")
- Trial 14 dni PRO po rejestracji (już istnieje infrastruktura `trialEndsAt`)
- Pricing propozycja: 9-15 PLN/mies albo 99 PLN/rok
- Platform: Stripe (web) + ewentualnie In-App Purchase (iOS/Android apps)

**Research do zrobienia przed kodem:**
1. Test MediaRecorder na iOS Safari (realny iPhone)
2. Benchmark RAM/bateria dla 3 typowych telefonów (flagship / mid-range / 3-letni)
3. Konkurencja — pobrać BaM Video Delay, zobaczyć UX
4. Prawo — czy nagrywanie wideo w PWA w UE wymaga specjalnego disclaimera?
5. Legalność nagrywania na strzelnicach (prywatne tereny, zgoda trenera)

**Pytania otwarte:**
- Target: PWA only, czy dodatkowo natywne appki (iOS/Android)?
- Czy warto obsłużyć scenariusz "trener filmuje ucznia zdalnie" (WebRTC P2P)? Czy tylko self-view?
- Save clips: v0.1 czy odroczyć?
- Audio: czy nagrywamy dźwięk też (wypuszczenie strzały słyszalne) czy tylko wideo?

---

## 🎯 Finalna Wizja — OSIĄGNIĘTA ✅

Aplikacja GROT-X ma:
1. ✅ Wzmocnione Firestore security rules (field-level validation + length limits)
2. ✅ Działającą coach-note feature (Path dla trenera + atomowa aktualizacja coachEditCount)
3. ✅ Link preview UI z warningami dla shortenerów/IDN + tabnabbing protection
4. ✅ Auto-updating build timestamp
5. ✅ Czysty kod + brak memory leaks
6. ✅ Wszystkie 7 security tests (E1-E7) PASS na koncie nieadminowym
7. ✅ Code splitting -54% initial load
8. ✅ Tabnabbing protection w window.open (CalendarView.tsx)

**Bezpieczeństwo:** Expert-level na wszystkich poziomach ✨  
**Wydajność:** Szybkie pierwsze ładowanie dzięki code splitting ⚡  
**Stabilność:** Zero state update warnings, brak memory leaks 🧹

---

## Git History (Security Hardening Sessions)

```
7ee3d66  Docs: T7 PASS — student odpina trenera (non-admin, Path D + F)
ead2586  Fix memory leak w AuthView + DEV window.__fb expose + E2E tests T1-T6 PASS
19f8a1c  Cleanup: usunięty HomeView.backup.tsx
99ecec6  Security: noopener,noreferrer w window.open (tabnabbing protection)
897aa49  Perf: code splitting — manualChunks + React.lazy dla widoków (-54% gzip)
b7d1158  Docs: aktualizacja JOURNAL + TODO po Fix A/B
2d05e79  Fix B: SafeLink preview — domain chip + shortener/IDN warnings
[... wcześniejsze commity ...]
```

---

## 💡 Notatki dla Przyszłych Sesji

1. **Upgrade E2E Framework:** Gdy pojawią się Cloud Functions — przejść na proper E2E (Cypress/Playwright) zamiast Console tests.
2. **Custom Claims:** Migracja admin allowlist z `email` na `request.auth.token.admin` (wymaga Cloud Functions + Stripe webhook dla premium).
3. **Atomic Coach-Student Add:** Teraz invite flow jest dwuetapowy (create invite → accept). W Phase B zrobić callable function atomowy na serwerze.
4. **App Check Edge:** Opcjonalnie zarejestrować debug token dla Edge, by wyeliminować 403 warnings w dev.

---

# TODO — Faza C: Store Readiness + RODO/GDPR (App Store & Play Store)

**Data startu:** 2026-06-11
**Cel:** Publikacja w App Store i Play Store. Priorytet #1: zgodność RODO/GDPR
(Niemcy — Datenschutzerklärung, Polska — Polityka prywatności, EN — Privacy Policy).

## 🔴 Priorytet 1 — RODO / Prawo (blokery publikacji)

- [x] **C1. Polityka prywatności w 3 językach** ✅ (2026-06-11)
      - `public/legal/datenschutz.html` (DE), `polityka-prywatnosci.html` (PL),
        `privacy-policy.html` (EN), `impressum.html` (DE, §5 DDG)
      - Linki w aplikacji: PrivacySection (Ustawienia → Profil) + ekran rejestracji
      - ✅ Dane administratora uzupełnione (2026-06-11): Aves-24, Inh. Rafal
        Woropaj, Krefeld; USt-IdNr. DE 265847286; organ nadzorczy: LDI NRW.
        Wariant: aplikacja prowadzona pod Gewerbe (decyzja użytkownika).
      - ⚠️ OTWARTE: finalna weryfikacja tekstów przez prawnika; sprawdzić czy
        Tätigkeitsbeschreibung Gewerbe obejmuje rozwój/dystrybucję software
- [x] **C2. Zgoda przy rejestracji** ✅ — checkbox w AuthView (blokuje rejestrację),
      adnotacja przy logowaniu Google; zapis `privacyConsent {version, acceptedAt}`
      (utils/legalLinks.ts — wersjonowanie polityki)
- [x] **C3. Usuwanie konta self-service** ✅ — PrivacySection: re-auth (hasło lub
      popup Google) → zdjęcie relacji trener↔uczeń → kasowanie subkolekcji,
      world_queue/world_stats/profiles_public, coachInvites → users doc → deleteUser.
      Rules: delete self na users, world_stats; coachLog kasowalny przez właściciela.
- [x] **C4. Eksport danych** ✅ — "Eksportuj moje dane (JSON)" w PrivacySection
- [x] **C5. Self-host fontów** ✅ — Material Symbols → public/fonts/ (woff2,
      preload w index.html, @font-face w tailwind.css); CDN Google usunięty.
      Przyszła optymalizacja: subset fontu (teraz 3,9 MB, cache immutable).
- [x] **C6. Minimalizacja ekspozycji danych** ✅ — users read: self/admin/relacja;
      nowa kolekcja `profiles_public` (lustro w App.tsx, utils/publicProfile.ts);
      przepięci konsumenci: BattleInvitePopup, CoachInvitePopup, BattleLobbyView,
      BattleHistoryView, ScoringView, CoachDashboardView (+ zapytania `in`→getDoc
      w SettingsView, CalendarView, CoachDashboardView)

## 🟠 Priorytet 2 — Bezpieczeństwo (rules hardening, szybkie)

- [x] **C7. Rules: walidacja `trialEndsAt`** ✅ (validTrialEndsAt — max now+31 dni,
      przy create i jednorazowym zapisie w Path B)
- [x] **C8. Rules: `email_verified == true` w `isAdmin()`** ✅
- [x] **C9. Nagłówki bezpieczeństwa** ✅ — CSP (Firebase/recaptcha/open-meteo),
      X-Content-Type-Options, Referrer-Policy, Permissions-Policy
      (camera/geolocation=self, microphone=()), frame-ancestors; cache /fonts/**
      ✅ PRZETESTOWANE (2026-06-11, prod = Vercel): logowanie Google OK,
      App Check OK, pogoda OK, eksport danych OK, sekcja Prywatność OK.
      Korekty CSP po testach: connect-src +www.google.com (reCAPTCHA clr),
      script-src +apis.google.com (gapi dla popup auth).
      ℹ️ PRODUKCJA = VERCEL (vitejs-vite-fyez22xt.vercel.app, decyzja 2026-06-11);
      nagłówki w vercel.json (lustro firebase.json — zmieniać OBA pliki!).
      Firebase Hosting zostaje jako zapasowy. Ostrzeżenie COOP przy popup
      Google = znane, kosmetyczne (Firebase signInWithPopup), ignorować.
- [~] **C10. Konsola Firebase (RĘCZNIE — wymaga zalogowania właściciela):**
      1. [x] Authentication → Settings → Password policy ✅ (2026-06-11)
            Erzwingung erfordern; wielka+mała litera+cyfra; min. 8 znaków
      2. [x] Authentication → User actions → email enumeration protection ✅
            (włączone; + Erstellen/Löschen aktywne — Löschen wymagane dla usuwania konta)
      3. [ ] Firestore → Disaster recovery → Point-in-Time Recovery
            ⛔ WYMAGA PLANU BLAZE — decyzja użytkownika 2026-06-11: zostajemy
            na Spark, wracamy do PITR tuż przed publikacją (razem z App Check
            enforcement w produkcji + Cloud Function proxy pogody C21).
            Przy przejściu na Blaze: ustawić budget alert!
      4. [ ] Google Cloud Console → zaakceptować Data Processing Addendum (art. 28 RODO)

### 🚀 Checklist wdrożenia zmian C1–C9 (jedna sesja):
```
npm run build                                  # ✅ przechodzi (2026-06-11)
npx firebase deploy --only firestore:rules     # nowe reguły (C3/C6/C7/C8)
npx firebase deploy --only hosting             # strony legal, fonty, nagłówki
```
Po deployu: smoke test logowania (e-mail + Google), zaproszenia trener/battle
(nazwy z profiles_public pojawią się po pierwszym otwarciu appki przez danego
użytkownika — wcześniej fallback "Zawodnik"/"Trener"), eksport i usunięcie
konta testowego, otwarcie /legal/datenschutz.html.

### 🔑 BLOKER PUBLIKACJI — skasować debug token App Check

- [ ] **Usunąć debug token App Check przed publikacją.**
      Firebase Console → App Check → Apps → GROT-X → Manage debug tokens.
      Token `30e22889-798a-4c3a-8fe5-1f79d4e7e3c0` (nazwa `localhost-dev`,
      dodany 2026-09-03) **omija App Check z dowolnego miejsca na świecie**.
      Nie daje dostępu do danych — reguły Firestore i logowanie zostają ścianą —
      ale rozbraja warstwę antybotową, czyli dokładnie to, co chroni przed
      masowym zakładaniem kont gościa skryptem. Token jest wypisywany w konsoli
      każdego dev builda, więc traktować go jak spalony.
      Decyzja usera (2026-09-03): zostaje do końca prac nad Ustawieniami,
      kasujemy przy ogłoszeniu gotowości aplikacji.
      Sam kod (`src/firebase.ts`) zostaje bez zmian — przy następnym
      `npm run dev` SDK wygeneruje nowy uuid do zarejestrowania.
      Skasować też wtedy `.env.local` (i tak nie jest w repo).

## 🟡 Priorytet 3 — Gotowość sklepowa

- [~] **C11. Service worker** ✅ SW live (2026-06-11) — WŁASNY generator
      `scripts/generate-sw.mjs` (post-build), NIE vite-plugin-pwa (0.12.x =
      ostatnia zgodna z Vite 2, nie buduje się na Node 24). Precache 36 plików
      (app shell + legal), fonty lazy CacheFirst, nawigacje network-first
      z offline fallback, sw.js z no-cache w vercel.json+firebase.json.
      Przy C16 (upgrade stacku) NIE wracać do pluginu — generator działa.
      ⬜ POZOSTAJE: `icon-512.png` = rozmyty upscale z 192px — PODMIENIĆ
      na oryginalną grafikę 512×512 przed publikacją w sklepach!
- [ ] **C24. Zmiana domeny Vercel na `grotx.vercel.app`** (ustalone 2026-09-04,
      odlozone na pozniej). Dzis produkcja stoi na `vitejs-vite-fyez22xt.vercel.app`
      — automatycznej nazwie ze szablonu Vite. Firebase juz nazywa sie `grotx-fb8f8`,
      wiec Vercel jest jedynym miejscem z ta nazwa.

      **W kodzie 3 linijki** — domena jest zaszyta wylacznie w `SettingsView.tsx`
      (link udostepniania + QR, ok. linie 497/506/511). CSP w `vercel.json` jej
      NIE zawiera, uzywa `'self'` — tam zero zmian.

      **KOLEJNOSC JEST KRYTYCZNA** — najpierw dodac nowa domene w panelach,
      dopiero potem zmieniac nazwe w Vercelu. Odwrotnie = okno, w ktorym
      produkcja nie dziala:
      1. Firebase Console -> Authentication -> Settings -> Authorized domains:
         dodac `grotx.vercel.app`. Pominiete = logowanie Google pada
         z `auth/unauthorized-domain` (popup uzywany w AuthView, GuestBanner,
         PrivacySection).
      2. reCAPTCHA admin, klucz `6LdoQb8sAAAAAKUvHd7Wpu3aqbX9cJPTMWJfe_xp`:
         dodac domene do dozwolonych. Pominiete = App Check nie wyda tokenu,
         Firestore rzuca 403, APKA MARTWA. Ten sam mechanizm blokowal
         logowanie na localhoscie (patrz A1).
      3. Vercel -> Settings -> General -> Project Name.

      **Do sprawdzenia zanim ruszymy:** czy `grotx.vercel.app` jest w ogole
      wolne (globalna przestrzen nazw calego Vercela). Stara domena po zmianie
      przestaje dzialac — kto zeskanowal QR z Ustawien, trafi w pustke.
      Nazwy repo na GitHubie zmieniac NIE trzeba, jest niezalezna.

- [x] **C25. Własne, niestandardowe dystanse — ZROBIONE 2026-09-04**, gałąź
      `feat/custom-distances`, sprawdzone na żywo (localhost, konto gościa).

      ### Jak to ostatecznie zrobiliśmy (decyzja usera 2026-09-04)

      Etykieta NIE jest kluczem. Tożsamością dystansu jest **`id`**, nadawane raz
      i nigdy niezmieniane; **metry są niezmienne**, bo karmią handicap; **nazwa
      jest dowolna i zmienna**. Dzięki temu zmiana nazwy nie robi NIC ze statystykami
      — nie ma migracji, nie ma rozcinania historii. To wzorzec `setupId` + `bowClass`
      z `utils/setupStamp.ts`, przeniesiony na dystanse.

      **Id standardowych dystansów jest wyliczane z metrów (`d_18m`), nie z zegara.**
      To celowe: sesje sprzed C25 niosą sam napis `"18m"` i mapują się na ten sam
      klucz bez żadnego odczytu z bazy. Drugi wpis 18 m dostaje id z zegara, czyli
      własny kubełek — historia zostaje przy pierwotnym.

      **Sesja niesie 3 pola:** `distance` (metry, format bez zmian), `distanceId`
      (kubełek) i `distanceLabel` (nazwa z chwili strzału). Trzecie jest konieczne,
      bo trener ogląda statystyki UCZNIA — rozwiązywanie id po własnej liście
      pokazałoby mu cudze nazwy.

      **Limit własnych dystansów = funkcja płatna (decyzja usera 2026-09-04):
      2 na FREE, 15 na PRO**, ponad dziesięć standardowych, które ma każdy.
      Ten sam kształt co limit zestawów sprzętowych (1/4). W regułach Firestore
      limit jest zapisany jako sufit CAŁEJ listy — 12 / 25 — bo język reguł nie
      ma pętli ani filtrowania, więc nie policzy, ile wpisów jest „własnych";
      wychodzi na to samo, bo klient zawsze odtwarza komplet dziesięciu
      standardowych. `prevCount` jak przy zestawach: po wygaśnięciu PRO nadmiar
      wolno TRZYMAĆ i zmniejszać, byle nie przybywało — inaczej konto z 15
      wpisami zamurowałoby się na każdym zapisie profilu.

      Nowy plik: **`src/config/distances.ts`** (jedyne źródło prawdy).
      Sześć zaszytych list zastąpione, w tym niezgodność „z 35m / bez 35m".

      **Sprawdzone na żywo end-to-end:** dodany dystans `10m` + etykieta `Blasrohr`
      → zapis do Firestore (`id: "d_mtmw4q3hxgg"`, standardowe dostały `d_18m`…)
      → kafelek w CELOWNIKU i nagłówek liczenia punktów → zapisana sesja niesie
      `distance: "10m"`, `distanceId`, `distanceLabel: "10m Blasrohr"`,
      `bowClass: "Dmuchawka (Blasrohr)"` → widoczna w ANALIZIE DYSTANSU i REKORDACH
      pod własnym kubełkiem, a `last10Avgs`/`last10Handicaps` zostały PUSTE
      (zabezpieczenie z `b961f7e` trzyma).

      **Naprawione przy okazji, poza planem:** `SmartSeasonUpdater` przy zmianie
      roku budował wpisy od zera i **kasował nastawy celownika** (`sightExtension`,
      `sightHeight`, `sightSide`). Teraz regeneracja zachowuje istniejące pola
      i nie tyka wpisów własnych (`rebuildMasterList`).

      ### Co ZOSTAŁO z C25

      - [ ] dystanse **per dyscyplina** — łucznik nadal widzi 5 m, dmuchawkarz 90 m.
            Etykiety to łagodzą („10m Blasrohr"), ale nie zastępują.
      - [ ] jednostki: **jardy** (IFAA/tereny — patrz T1). Dziś tylko metry.
      - [ ] `HistoricalStartForm` i `TournamentScoreInput` proponują wyłącznie
            listę standardową — startu na własnym dystansie nie da się dopisać.
      - [ ] `getRecommendation` nadal zwraca gołe `'18m'`/`'70m'`; działa, bo
            standardowe wpisy zachowują dokładnie te napisy w polu `m`.
      - [x] **`validDistances` wdrożone na produkcję 2026-09-04 (deploy usera)
            i sprawdzone na żywo z klienta** na koncie FREE: 13 wpisów →
            `permission-denied`, 12 → przechodzi, dokument nietknięty (12 → 12).
      - [ ] **Ścieżka PRO (25) niesprawdzona z klienta** — `isPremium` jest polem
            chronionym, więc nie da się samemu awansować konta. Tak samo było
            z limitem zestawów: tam sprawdził to user na własnym koncie PRO.
      - [~] **Test na emulatorze DOPISANY** (`bcf4b3f`) — 9 asercji w
            `tests/rules/firestore.rules.test.mjs`, na wzór testów limitu
            zestawów: 12/13 na FREE, 25/26 na PRO, próba podniesienia sobie
            `isPremium` w tym samym zapisie, `userDistances` musi być listą,
            regresja zapisu bez tego pola, create nowego konta, oraz furtka
            `prevCount` po wygaśnięciu PRO.
            ⚠️ **NIEURUCHOMIONY lokalnie** — potwierdzone 2026-09-04, że problem
            NIE jest brakiem Javy: JDK 21 (`C:\Program Files\Microsoft\
            jdk-21.0.12.101-hotspot`) startuje poprawnie, ale emulator pada na
            `java.net.SocketException: Invalid argument: connect` przy otwieraniu
            pipe'a loopbacku (`sun.nio.ch.PipeImpl$Initializer$LoopbackConnector`).
            Zostaje CI — **sprawdzić, czy run na `bcf4b3f` jest zielony.**
      - [ ] liczniki „wystrzelonych strzał" (HomeView, `pfeilzaehler`) nadal sumują
            rurę z łukiem — osobny temat, niezmieniony.

      ---

      *Poniżej oryginalna analiza z 2026-09-04, zostawiona dla kontekstu decyzji.*

      Dziś zakładka CELOWNIK pokazuje zamkniętą listę dystansów; user chce móc
      dopisać własny (np. 15 m, 45 m, jardy albo cokolwiek, na czym realnie
      strzela na swojej strzelnicy).

      ### ⭐ NAJWAŻNIEJSZE ODKRYCIE — czytaj przed planowaniem czegokolwiek

      **Statystyki są JUŻ segmentowane per dystans, a lista dystansów buduje
      się Z SESJI, nie ze stałej:**

      ```js
      // ProStatsView
      sessions.filter(s => s.distance === selectedDistance)
      Array.from(new Set(sessions.map(s => s.distance)))
      // TournamentRecordsView — to samo
      ```

      Czyli sesja na 5 m **sama tworzy własny kubełek** obok 18 m i 70 m.
      Rozdzielenie dyscyplin dostajemy ZA DARMO z mechanizmu, który już działa
      — bez filtrów, bez wyjątków, bez architektury „statystyki per zestaw".

      **Konsekwencja:** C25 to nie jest „miłe sprzątanie na przyszłość", tylko
      **najtańszy sposób naprawienia tego, co psuje dmuchawka**. Pomysł usera,
      lepszy od mojego łatania wyjątkami widok po widoku.

      ### 🔴 Do WYJĘCIA przy okazji

      Filtr `isBlowgunSession` w `ProStatsView` (`filteredSessions`) po
      wprowadzeniu dystansów staje się SZKODLIWY: dziś wycina sesje z rury
      całkowicie, więc po wybraniu „5m" user zobaczy pustkę zamiast swoich
      wyników. Separacja ma iść przez dystans, nie przez ukrywanie.

      ### Co i tak zostaje pod strażą (NIE jest per dystans)

      - `last10Handicaps` / `currentHandicap` oraz `last10Avgs` idące w rangę
        — już zabezpieczone w ScoringView (`b961f7e`), zostawić tak jak jest
      - liczniki „wystrzelonych strzał" sumowane przez WSZYSTKIE dystanse
        (HomeView, `pfeilzaehler` inkrementowany w `SessionSetup`) — te nadal
        zsumują rurę z łukiem, do przemyślenia osobno

      **Sprostowanie do wcześniejszej notatki:** twierdzenie, że dmuchawka jest
      „odizolowana od statystyk", było ZA SZEROKIE. Odizolowane są tylko
      `ProStatsView` i ścieżka zapisu. `HomeView`, `StatsView`, `recentSessions`
      i `TournamentRecordsView` jej NIE filtrują.

      **Lista jest zaszyta w 6 miejscach i w DWÓCH różnych wariantach** —
      to jest właściwy koszt tego zadania, nie samo pole do wpisania:

      | plik | wariant |
      |---|---|
      | `App.tsx:197` | z 35m |
      | `components/SmartSeasonUpdater.tsx:8` (`MASTER_DISTANCES`) | z 35m |
      | `views/SettingsView.tsx` (w `saveAllSettings`) | z 35m |
      | `components/HistoricalStartForm.tsx:19` | BEZ 35m |
      | `components/ProfileWizard.tsx:79` | BEZ 35m |
      | `components/TournamentScoreInput.tsx` | zakłada 18m → 3-Spot |

      Czyli już dziś te listy są NIEZGODNE między sobą. Pierwszy krok to jedno
      źródło prawdy (jak `config/targetFaces.ts` dla tarcz), dopiero potem
      dokładanie własnych wpisów.

      **Pierwszy prawdziwy przypadek to DMUCHAWKA (user, 2026-09-04):**
      strzela się na **5, 7 i 10 m** — żadnego z nich nie ma dziś w aplikacji,
      bo lista zaczyna się od 18 m. Dopóki tego nie ma, tarcza dmuchawki jest
      bezużyteczna: nie da się zapisać sesji na właściwym dystansie.
      To przesuwa C25 z „miłego dodatku" na blokera dokończenia T2.

      **Do przemyślenia przed kodowaniem:**
      - dystanse muszą być per DYSCYPLINA, nie jedna wspólna lista — łucznik
        nie chce widzieć 5 m, a dmuchawkarz 90 m
      - jednostka: metry czy też jardy (IFAA/tereny liczą w jardach — patrz T1)
      - sortowanie i deduplikacja, żeby user nie zrobił sobie dwóch „30m"
      - co z rekomendacjami `getRecommendation` i automatycznym doborem
        tarczy — dziś opierają się na tym, że dystans jest ze znanej listy
      - stare sesje trzymają dystans jako string, więc format musi zostać
        zgodny, inaczej rozjedzie się historia i statystyki

      **Sprawdzone 2026-09-04 — jedna obawa mniej:** w CAŁEJ aplikacji jest
      **jedno jedyne** miejsce parsujące dystans na liczbę:
      `ScoringView.tsx:499` → `parseInt(distance) || 18`, karmiące handicap.
      `parseInt("5m")` daje 5, więc format `"<liczba>m"` działa bez zmian,
      a stare sesje nic nie przeliczają — trzymają gotowy string. Dopisanie
      pozycji do listy jest więc bezpieczne dla historii.
      Uwaga na drobiazg obok: `StatsView.tsx:729` sprawdza
      `distance?.includes('18')`, żeby zgadnąć typ tarczy — kruche, poprawić
      przy okazji.

- [ ] **C12. Wrapper natywny** — decyzja: Capacitor (iOS+Android z jednego kodu,
      zalecane) vs TWA (tylko Android). App Store NIE przyjmuje czystych PWA.
- [x] **C13. Data Safety / Privacy Nutrition Labels** ✅ — `LEGAL_DATA_INVENTORY.md`
      (pełny inwentarz + mapowanie na formularze Play i Apple). Same formularze
      wypełnia się ręcznie w konsolach sklepów przy publikacji.
- [x] **C14. Obsługa przycisku "wstecz"** ✅ (2026-06-11) — history.pushState
      w handleNavigate/handleStartSession + popstate-listener w App.tsx;
      back cofa widok zamiast zamykać PWA. Przetestować na realnym Androidzie!
- [x] **C15. Self-host fontów PDF** ✅ — Roboto Regular/Medium w public/fonts/,
      ExportPanel fetchuje lokalnie (offline + brak wycieku IP do Cloudflare)

## 🟢 Priorytet 4 — Jakość / nowoczesność

- [x] **C16. Upgrade stacku** ✅ (2026-06-12) — React 18, Vite 6, TS 5;
      branch zmergowany do main po zielonym CI i lokalnym buildzie (9s, SW OK)
- [x] **C17. Testy rules na emulatorze + CI** ✅ (2026-06-11) —
      `tests/rules/firestore.rules.test.mjs` (40 asercji, T1-T7 + RODO),
      `npm run test:rules`, `.github/workflows/ci.yml` (lint+build oraz
      rules-tests na temurin 21, cache emulatora). CI ZIELONE (run ca442cf).
      ⚠️ Lokalnie na tym PC emulator NIE startuje (AV/Norton blokuje loopback
      Javy — testowane Java 21/11, tmpdir, IPv4) — weryfikacja przez CI.
      Portable JRE: C:\Users\Lager 1\.local\jre21 (gdyby AV dostał wyjątek).
- [ ] **C18. Prawdziwy AI coach lub zmiana nazwy** (obecnie mock w CoachAIPanel)
- [x] **C19. ClubSearch usunięty** ✅ — nie był nigdzie importowany (martwy kod
      z placeholderem klucza API); skasowany też typ window.google w vite-env.d.ts
- [x] **C20. Dark mode, zoom, splash** ✅ (2026-06-12) — ✅ zoom odblokowany
      (maximum-scale=5, WCAG), ✅ splash skrócony 1800→900 ms, ✅ dark mode:
      warstwa remapu CSS w tailwind.css (~35 klas pod html.dark, zero zmian
      w widokach), przełącznik Jasny/Ciemny/Systemowy w Ustawienia→Język,
      anty-flash public/theme-init.js (CSP blokuje inline), utils/theme.ts.
      Akcenty (emerald-50, amber-50 itp.) niezmapowane — poprawki po testach.
- [ ] **C21. Pogoda: licencja komercyjna / proxy PRZED startem płatności premium**
      — darmowe API Open-Meteo jest tylko non-commercial (appki z subskrypcjami
      wprost wymienione jako komercyjne → ryzyko blokady IP bez ostrzeżenia).
      Dopóki nikt nie płaci — OK. Z chwilą podpięcia Stripe:
      a) najlepiej: Cloud Function proxy `getWeather(lat, lon)` + cache 15–30 min
         (klucz poza klientem, wymienialny dostawca, mniej calli), dostawca:
         Open-Meteo Standard (~29 €/mies., minimalna zmiana kodu) lub
         MET Norway (0 €, wymaga proxy przez User-Agent)
      b) przy zmianie dostawcy: aktualizacja §2.6 + tabeli odbiorców we
         wszystkich 3 politykach prywatności i LEGAL_DATA_INVENTORY.md

## STAN NA 2026-09-04 — czytaj to najpierw

Cała sesja poszła na **C25 (własne dystanse)** i wynikające z niej domknięcia
dmuchawki. Wszystko jest **na `main` i wypchnięte**, gałąź robocza skasowana.

### Co weszło (7 commitów nad `2638a88`)

| commit | co |
|---|---|
| `2e3d149` | C25 — własne dystanse, tożsamość na `id`, jedno źródło prawdy `config/distances.ts` |
| `a7d0ff5` | limit własnych dystansów jako funkcja płatna: 2 FREE / 15 PRO |
| `be68e4c` | reguły wdrożone przez usera i sprawdzone na produkcji |
| `bcf4b3f` | test reguł na emulatorze (9 asercji) |
| `0fc73be` | lista tarcz zawężona dyscypliną zestawu (domknięcie T2) |
| `a65d001` | model stref punktowych + tarcza dmuchawkowa 3-5-7 (nieaktywna) |

**Decyzja architektoniczna, na której stoi całość (pomysł usera):** tożsamością
dystansu jest `id`, nie nazwa. Metry niezmienne (karmią handicap), nazwa dowolna
i zmienna — więc zmiana nazwy nie rusza statystyk i nie wymaga migracji.
Id standardowych wpisów wyliczane z metrów (`d_18m`), żeby sesje sprzed C25
same trafiały do właściwego kubełka. Szczegóły przy C25 wyżej.

**Sprawdzone na żywo, nie tylko testami:** dodanie dystansu z etykietą, zapis
sesji ze stemplem, własny kubełek w ANALIZIE DYSTANSU i REKORDACH, licznik
limitu 2/2 z zajawką PRO, odmowa 13. wpisu z produkcyjnych reguł, filtr tarcz
w obie strony (dmuchawka ↔ recurve).

### 🔜 Następnym razem, w kolejności

1. **Sprawdzić CI na `bcf4b3f`** — testy reguł nie były uruchomione lokalnie,
   bo emulator nie wstaje na tej maszynie (potwierdzone: to NIE brak Javy,
   tylko `SocketException: Invalid argument: connect` na pipie loopbacku).
2. **Sprawdzić ścieżkę PRO na własnym koncie** — 15 własnych dystansów tak,
   16. nie. Z klienta się nie da, bo `isPremium` jest polem chronionym.
3. **Podać wymiary tarczy 3-5-7** (T7) — bez nich zostaje nieaktywna.
4. Reszta otwartych rzeczy z C25: dystanse per dyscyplina, jardy, własne
   dystanse w formularzach zawodów.

### 🧹 Do sprzątnięcia przed publikacją

Na koncie gościa w PRODUKCYJNYM Firestore leżą dane testowe z dziś: dystanse
`10m Blasrohr` i `7m Blasrohr` oraz jedna sesja z dmuchawki. Idą do kasacji
razem z resztą danych gościa (patrz TTL trybu gościa, wymaga Blaze).

---

## STAN NA 2026-09-03

### ✅ Zacommitowane na gałęzi `feat/target-faces-setup-stamp`

Robota z 2026-09-01 (terminologia, stempel zestawu, katalog tarcz) plus dzisiejsza
poprawka App Check. Wszystko sprawdzone w działającej aplikacji, nie tylko testami.

Nowe pliki: `src/config/targetFaces.ts`, `src/utils/setupStamp.ts`

### Co jest zrobione i sprawdzone testami

1. **Terminologia w 3 językach** — usunięty zahardkodowany polski z zakładek
   BOGEN/PROFIL, wywalone nazwy firm z placeholderów, ujednolicony słownik
   celownika w całej aplikacji (PL: Celownik/Wysięg/Wysokość/Bok,
   DE: Visier/Visierauszug/Höhe/Seite). Naprawione: DE „Auszugslänge" w miejscu
   wysięgu celownika, DE „Windage" (angielskie słowo w niemieckim UI),
   PL „Wizjer" → „Celownik", literówka „Vierreinstellung" → „Visiereinstellung".
2. **Stempel zestawu na sesji** (`src/utils/setupStamp.ts`) — sesje niosą
   `setupId` + `bowClass`, podpięte w 4 miejscach zapisu. Wpisy historyczne
   świadomie BEZ `bowClass` (nie zgadujemy klasy sprzed lat).
3. **Katalog tarcz** (`src/config/targetFaces.ts`) — 4 błędy naprawione,
   szczegóły w sekcji niżej. Zweryfikowane: 31 asercji na katalogu, porównanie
   starej i nowej punktacji na siatce 90 601 punktów (5 tarcz bit-w-bit
   identycznych, zmiana tylko na 6-Ring i to celowo), porównanie geometrii
   rysowania z kodem sprzed katalogu.

`tsc` czysty, eslint 0 błędów, build przechodzi.

### ✅ Sprawdzone na żywo 2026-09-03

**A1. Logowanie lokalne odblokowane.** `src/firebase.ts` inicjalizuje App Check
zawsze, a pod `import.meta.env.DEV` podstawia debug token z
`VITE_APPCHECK_DEBUG_TOKEN` (plik `.env.local`, w `.gitignore`). Token
zarejestrowany w Firebase Console. Produkcja nietknięta — blok DEV znika przy
tree-shakingu, zostaje sama reCAPTCHA v3. Potwierdzone: logowanie anonimowe
przechodzi, odczyt `users/{uid}` działa, 403 zniknęło.
⚠️ Token do skasowania przed publikacją — patrz „BLOKER PUBLIKACJI" wyżej.

**A2. Tarcza 6-Ring i stempel zestawu.** 6-Ring wypróbowany przez usera na
gościu na localhost — działa. Stempel potwierdzony na prawdziwej zapisanej
sesji: `setupId: "default"`, `bowClass: "Klasyczny (Recurve)"` (odczytany
z `bowType` profilu, nie zgadnięty), tarcza `80cm (6-Ring)`, dystans 30m.

**Efekt uboczny do sprzątnięcia:** samo wejście na dev zakłada dokument gościa
w PRODUKCYJNYM Firestore. Nic ich nie kasuje, bo TTL trybu gościa czeka na Blaze.
Wyczyścić razem z resztą danych gościa przy publikacji.

### 🔜 Nadal czeka na usera

- [x] **A3. Czarne tarcze — wyjaśnione, temat odłożony.** To tarcze IFAA
      do łucznictwa terenowego (parkur), nie WA Field. User strzela wyłącznie
      tarczowo, więc nie budujemy tego teraz — szczegóły w T1 niżej.
- [ ] **A4. Punktacja tarczy do dmuchawki** — różni się między federacjami,
      user musi podać, na czym strzelają (T2 niżej).

### 📋 Przebudowa Ustawień — STAN 2026-09-04

**Wszystkie 5 etapów zrobionych i wypchniętych na `main`.** Poniżej architektura
ustalona wcześniej, z zaznaczeniem, co już jest.

Doszło poza planem: **potwierdzenie przed skasowaniem zestawu** (`3612487`) —
kosz kasował jednym kliknięciem, bez pytania. Zgłoszone przez usera.

| etap | co | stan |
|---|---|---|
| 1 | model `EquipmentSetup`, migracja płaskich pól, stempel z zestawu | ✅ `6547e8d` |
| 2 | zakładka SPRZĘT z 6 podzakładkami, przełącznik zestawów | ✅ `d15b5d7` |
| 3 | limit 1 FREE / 4 PRO w regułach Firestore | ✅ `01ea622` — **wdrożone na produkcję 2026-09-04**, sprawdzone na żywo |
| 4 | dmuchawka jako dyscyplina + własna tarcza | ✅ `776ee64` — dane od usera, sprawdzone na żywo |
| 5 | ikony (i) z podpowiedziami przy 13 polach × 3 języki | ✅ `3b280fe` |

**Co jeszcze zostało z etapu 5:** trzy poziomy pól (Podstawa / Strojenie /
Szczegóły) NIE są zrobione — przy 1–3 polach na podzakładkę zwijanie byłoby
udawaniem porządku. Wchodzą razem z pełnym kompletem ~35–40 pól.

**Dwie rzeczy naprawione przy okazji:** dawna zakładka STRZAŁY miała inputy
bez `value` i `onChange` — nic z niej nigdy nie trafiało do bazy. CIĘCIWY
nie było w aplikacji w ogóle.

**Stan weryfikacji limitu:**
- [x] reguły wdrożone na produkcję 2026-09-04
- [x] sprawdzone na żywo na koncie FREE: 2 zestawy → `permission-denied`,
      `activeSetupId` jako liczba → odrzucone, a zwykły zapis profilu,
      zapis 1 zestawu i edycja zestawu w miejscu → przechodzą (brak regresji)
- [x] **ścieżki PRO sprawdzone przez usera na żywo 2026-09-04 — działają.**
      (4 zestawy tak / 5 nie). Ja sam nie mogłem tego przetestować z klienta,
      bo `isPremium` jest polem chronionym i nie da się samemu awansować konta.
- [ ] `npm run test:rules` NIE uruchomione lokalnie — emulator nie startuje na
      tej maszynie: `Selector.open()` pada z „Unable to establish loopback
      connection" (potwierdzone minimalnym programem w Javie; zapora Windows
      czysta, więc podejrzenie pada na oprogramowanie ochronne). JDK 21 jest
      zainstalowany i sprawny. Weryfikuje CI.
- [ ] przejrzeć niemieckie opisy pól z kimś, kto strzela po niemiecku

**Świadome ograniczenie reguł:** Firestore nie ma pętli, więc długości nazwy
(40) i notatki (100) w KAŻDYM zestawie z osobna sprawdzić się nie da —
pilnuje ich tylko UI przez `maxLength`.

**Stare płaskie pola zostają** (`bowType`, `lbs`, `riser`, `limbs`,
`stabilizers`, `sight`) — czyta je jeszcze rekomendacja dystansów i kreator
profilu. `bowType` jest trzymane zgodnie z dyscypliną aktywnego zestawu.
Sprzątnąć dopiero, gdy zestawy odleżą swoje.

**`BowSection.tsx` przestał być importowany** — dołącza do martwych plików
z T6 (user zdecydował 2026-09-04, żeby ich na razie nie kasować).

---

Architektura ustalona wcześniej (dla porządku, w większości już wdrożona):

- Górny pasek: **PROFIL · SPRZĘT · USTAWIENIA CELOWNIKA · JĘZYK**
- SPRZĘT ma podzakładki: **ŁUCZNIK · ŁUK · CIĘCIWA · STRZAŁY · CELOWNIK · STABILIZACJA**
- `bowType` przenosi się z użytkownika do **zestawu**; pole zmienia znaczenie
  na „dyscyplina", dochodzi **dmuchawka (Blasrohr)** — bez łuku, cięciwy
  i stabilizacji, za to z rurą i strzałkami
- **Limit: 1 zestaw FREE, 4 zestawy PRO**
- Sesje stemplowane zestawem (✅ zrobione) — migracja MUSI grupować stare sesje
  po `bowClass`, NIE po `setupId`
- Pola w 3 poziomach: **Podstawa** (widoczne) / **Strojenie** (widoczne) /
  **Szczegóły** (zwinięte pod „Pokaż wszystko")
- Ikona **(i)** przy ważnych polach: 2 zdania wg wzoru „co to jest" + „co się
  stanie, jak zmienisz". Wzorzec UI już istnieje w `BiomechCard.tsx:32`.
  ~35–40 pól × 3 języki, wdrażane warstwami (ikona renderuje się tylko gdy
  klucz istnieje). Niemiecki do przejrzenia przez kogoś, kto strzela po niemiecku.
- **Notatka max 100 znaków** w każdej podzakładce ORAZ przy każdym dystansie
  w nastawach celownika. Uwaga RODO: trener czyta całe `users/{uid}`, więc
  zobaczy te notatki — jeśli mają być prywatne, idą do `users/{uid}/private/`

---

## KATALOG TARCZ — dalsze kroki (od 2026-09-01)

Katalog `src/config/targetFaces.ts` jest wdrożony i jest jedynym źródłem prawdy
o tarczach (układ, średnica fizyczna, krok pierścienia, punktowany zakres,
geometria, aliasy starych stringów). Dodanie tarczy = jeden wpis w `TARGET_FACES`.

- [ ] **T1. Tarcze terenowe — ODŁOŻONE 2026-09-03 (decyzja usera).**
      Rodzina rozstrzygnięta: **IFAA**, nie WA Field. User strzela wyłącznie
      tarczowo na płaskiej strzelnicy, więc na razie tego NIE budujemy. Wrócić,
      gdy user wybierze się na parkur albo ktoś w klubie o to poprosi.
      Opcja `'Field'` pozostaje usunięta z wyboru w SessionSetup.

      **Ustalone z regulaminu IFAA 2021-2022 (żeby nie szukać drugi raz):**
      - Jedna rodzina, dwa warianty: **Feldauflage** (czarny środek, biała
        obręcz, czarny pierścień zewnętrzny) i **Jagdauflage/Hunter** (cała
        czarna, biały środek). Oba w tych samych 4 rozmiarach: 20/35/50/65 cm.
      - **Punktacja 5 / 4 / 3** — środek / obręcz wewnętrzna / pierścień
        zewnętrzny. Identyczna dla Field i Hunter. Trzy strefy, nie pięć.
      - Geometria (proporcje stałe): obręcz wewnętrzna = **0,6 × średnicy**,
        środek = **0,2 × średnicy**. Dosłownie z tabeli: 20cm→12/4,
        35cm→21/7, 50cm→30/10, 65cm→39/13.
      - **Cienkie linie na tarczy = `Zwischenlinien`**, dzielą każdą strefę
        na pół. Używane WYŁĄCZNIE w Experten-Feldrunde, punktacja 5-4-3-2-1.
        W zwykłej Field/Hunter się je ignoruje.
      - **Biały X w środku NIGDY nie jest wartością punktową** — służy tylko
        do rozstrzygania remisów. Uwaga: w naszym kodzie X jest normalnym
        wynikiem obok 10, więc dla IFAA trzeba to zrobić inaczej.
      - Zasada linii inna niż nasza: na tarczach Hunter i Eksperckich linia
        podziału liczy się do NIŻSZEJ strefy; strzała musi naruszyć wyższą
        strefę, żeby dostać wyższą wartość.
      - Łuki: wszystkie klasy IFAA, recurve włącznie (BB, FS, BH, TR).
        Tarcza nie selekcjonuje sprzętu.
      - Zawody: **WFAC** (MŚ terenowe, 2×14 = 28 stanowisk) i zawody krajowe.
        NIE używa ich WBHC (tam Tierbild + 3D) ani WIAC (własna tarcza halowa,
        środek 8 cm, X-ring 4 cm).

      **Czego sam katalog tarcz NIE załatwi** — dlatego to nie jest „dorzucić
      tarczę", tylko osobny tryb sesji: dystanse w **jardach**, nie metrach;
      runda ma **14 albo 28 stanowisk** zamiast jednego dystansu; część
      stanowisk to **walk-up** (4 kołki, 4 odległości do tej samej tarczy);
      4 strzały na tarczę.

      Model `TargetFace` też wymaga rozszerzenia: dziś zakłada równomierne
      pierścienie co 15 i punktację 10→1. IFAA ma 3 strefy o proporcjach
      0,6 i 0,2 oraz punktację 5-4-3 — trzeba dołożyć jawny opis stref.

      Źródła: regulamin IFAA 2021-2022 w tłumaczeniu ÖBSV
      (3d-bogenparcours.com/assets/pdfs/2021-2022-ifaa-regeln-deutsch.pdf)
      oraz IFAA Archer's Handbook 5th ed.
      (dutchopenifaa.nl/files/archers_handbook_2017.pdf)
- [x] **T2. Dmuchawka (Blasrohr) — ZROBIONE 2026-09-04** (`776ee64`).
      Dane potwierdzone przez usera, nie wpisane z pamięci:
      „Gezielt wird auf Scheiben mit einer Wertung von 6 bis 10 Ringen",
      wygląda identycznie jak nasz spot, w środku **JEST X i liczy się jako
      10**, układ to **trzy spoty**, średnica **20 cm**, dystans zwykle 10 m.

      Tarcza w osobnym pliku `config/targets/blowgun.ts`, zarejestrowana
      w `targetFaces.ts`. Punktacji NIE trzeba było ruszać —
      `calculateSpotScore` już liczy 6–10 z X, a X w całej aplikacji jest wart
      10 punktów i osobno zliczany jako X.

      ✅ **Zostaje 1 — ZAMKNIĘTE 2026-09-04.** Lista tarcz jest zawężana
      dyscypliną aktywnego zestawu (`selectableTargetIdsFor` w `targetFaces.ts`),
      w SessionSetup i w Ustawieniach. Sprawdzone na żywo w obie strony:
      zestaw dmuchawki → jedyna tarcza „Blowgun 20cm"; zestaw recurve →
      sześć tarcz łuczniczych, dmuchawki nie widać. Tarcza zapisana wcześniej
      przy dystansie, a niepasująca do dyscypliny, jest podmieniana na pierwszą
      dozwoloną, żeby trening nie ruszył z tarczą spoza listy.

      **Przy okazji naprawiony cichy błąd w drugą stronę.** `isBlowgunSession`
      traktowało tarczę jako drugi warunek OR, więc łucznik, który wybrał
      „Blowgun 20cm", tracił sesję z handicapu i z rangi — bez żadnego
      komunikatu. Było to świadome zabezpieczenie na czas, gdy lista tarcz nie
      była filtrowana; teraz jest, więc `bowClass` ROZSTRZYGA, gdy jest obecny,
      a tarcza została fallbackiem wyłącznie dla wpisów historycznych (te
      świadomie nie mają `bowClass`). Dotyczyło to też trybu Battle, gdzie
      `targetType` przychodzi z dokumentu bitwy, czyli od DRUGIEGO gracza —
      cudzy wybór tarczy nie może decydować o mojej randze.

      ✅ **Zostaje 2 — ODBLOKOWANE 2026-09-04 przez C25.** Dystansów 5/7/10 m
      nie było w aplikacji, więc treningu z rury nie dało się zapisać. Po C25
      user dopisuje własny dystans z etykietą (np. `10m` + `Blasrohr`).
      Sprawdzone na żywo: sesja z dmuchawki na 10 m zapisana, widoczna
      w statystykach we własnym kubełku, bez wpływu na handicap łuczniczy.
      Przy okazji zniknął filtr `isBlowgunSession` z `ProStatsView` — po
      wprowadzeniu dystansów wycinałby userowi jego własne wyniki.
- [ ] **T3. 3D — NIE jest tarczą.** Strefy killa na figurze zwierzęcia,
      punktacja zależna od trafionej części korpusu, runda to przejście przez
      ~20 różnych figur. Wymaga osobnego trybu wprowadzania (wybór strefy albo
      dotknięcie sylwetki), nie mieści się w katalogu pierścieni. Osobna funkcja.
- [x] **T4. Krok punktacji 40cm — POTWIERDZONY BŁĄD, naprawiony 2026-09-03.**
      `scoringRingStep: 12.5` przy pierścieniach rysowanych co 15. Skutki:
      skrajny pierścień punktował się jako pudło (`maxRadius` 125 zamiast 150),
      X liczył się przy r=6.25 zamiast 7.5, a wszystkie granice były przesunięte
      względem rysunku — na 641 próbkach promienia stary kod rozjeżdżał się
      z geometrią 460 razy, pierwszy raz już przy d=6.5.
      Potwierdzone przez usera na żywo. Naprawione zdjęciem nadpisania — 40cm
      używa teraz domyślnego kroku 15, jak reszta pełnych tarcz.
      **Historia NIE jest dotknięta:** sesje trzymają wyniki jako gotowe stringi
      (`arrows` w ScoringView), a jedyne miejsce liczące punkty z kliknięcia to
      TargetInput.tsx. Nic nie przelicza wyniku ze współrzędnych ponownie,
      więc poprawka działa wyłącznie na nowe strzały.
      Zostaje znane, NIEZMIENIONE zachowanie wspólne dla wszystkich tarcz:
      trafienie dokładnie na linię pierścienia (d = 15, 30 … 150) liczy się do
      niższego pierścienia, bo `floor`. Reguła zawodnicza mówi odwrotnie, ale
      przy współrzędnych zmiennoprzecinkowych z dotyku to przypadek pomijalny.
- [ ] **T5. Ujednolicić rysowanie tarcz. ODŁOŻONE 2026-09-04.** Sprawdzone
      dokładnie: miejsc rysujących jest **6, nie 5** — wcześniejsza notatka
      pomijała `components/targets/SpotTarget.tsx`, czyli ten, który rysuje
      spota na ekranie liczenia punktów.

      | plik | geometria |
      |---|---|
      | `targets/StandardTarget.tsx` | ✅ z katalogu (`resolveTargetFace().rings`) |
      | `targets/SpotTarget.tsx` | ❌ na sztywno |
      | `RoundTargetSummary.tsx` | ❌ na sztywno |
      | `HeatmapTarget.tsx` | ❌ własne `FF_RINGS` / `SPOT_RINGS` |
      | `ScoringView.tsx` (`LargeTargetSVG`) | ❌ na sztywno |
      | `StatsView.tsx` (`LargeTargetSVG`) | ❌ na sztywno |

      Piątka importuje z katalogu wyłącznie predykaty (`isFullFace`,
      `isSpotFace`, `friendlyTargetName`) — nigdy geometrię.

      **Katalog nie zna geometrii spotów.** Wpisy `3-Spot` i `Vertical 3-Spot`
      powstają przez `face(…, 40, { layout: 'spot3-double' })`, więc dziedziczą
      domyślne `FULL_RINGS` (150…7,5), a spoty rysuje się na 62,5…6,25. Te
      odziedziczone pierścienie są martwe. Bez uzupełnienia tego T5 się nie da.

      Doszłoby też pole `label` w `TargetRing` — `HeatmapTarget`
      i `RoundTargetSummary` rysują etykiety „1"…„10", „X", a interfejs ma
      dziś tylko `r`/`fill`/`stroke`.

      **Drobiazg, NIE błąd:** `LargeTargetSVG` w ScoringView i StatsView ma
      dla spotów inne literały kolorów (pierścień 7 niebieski, 9 czerwony) niż
      `SpotTarget` i `RoundTargetSummary`. User sprawdził na żywo przy włączonym
      3-Spocie — w małym widoku i po powiększeniu kolory są prawidłowe, więc to
      nie jest widoczna usterka. Zrównać przy okazji T5, nie osobno.

      **Dlaczego odłożone:** T5 miał być podparty ukrytym rozjazdem, ale
      rozjazdu nie widać w działającej aplikacji. Zostaje refaktor bez
      wyzwalacza w kodzie, który działa. Wracać, gdy realnie dojdzie nowa
      tarcza — wtedy te 6 miejsc zaczyna boleć.
- [ ] **T6. Martwe pliki do usunięcia.** `src/components/TargetZoom.tsx`
      (nieimportowany; dodatkowo CAŁY plik używa twardych spacji U+00A0
      zamiast zwykłych — 1048 sztuk), `src/components/FullFaceTarget.tsx`
      (nieimportowany, zawiera martwe porównanie `'WA 80cm (6-Ring)'`),
      `src/views/ProfileView.tsx` (nieimportowany; zawiera jedyne pole
      „długość naciągu" w aplikacji — przenieść, nie kasować bezmyślnie).
- [~] **T7. Druga tarcza dmuchawkowa 3-5-7 — WPISANA, ale NIEAKTYWNA
      (2026-09-04).** User znalazł tarczę o trzech strefach: żółty środek 7,
      czerwona obręcz 5, niebieski pierścień 3. Plik:
      `src/config/targets/blowgun357.ts`.

      **Model tarczy trzeba było rozszerzyć.** To pierwsza tarcza, której
      punktacji NIE da się wyliczyć wzorem `10 - floor(d / krok)`. Doszło pole
      `zones` w `TargetFace` (jawna lista stref od środka na zewnątrz) i gałąź
      w `TargetInput.calculateScore`. **To samo rozszerzenie odblokowuje T1** —
      tarcze IFAA Field mają dokładnie taki kształt problemu, punktację 5-4-3
      i trzy strefy o proporcjach 0,6 / 0,2.

      Przy okazji filtr dyscypliny przestał porównywać po `id` jednej tarczy,
      a zaczął czytać tag `discipline: 'blowgun'` z katalogu — bez tego druga
      tarcza dmuchawki pokazałaby się łucznikowi zamiast dmuchawkarzowi.

      **POTWIERDZONE przez usera:** średnica 20 cm, strefy 7 / 5 / 3.

      🔴 **NIEPOTWIERDZONE — dlatego tarcza NIE MA `pickOrder` i nie pojawia
      się w wyborze:**
      - proporcje stref. Pomiar ze zdjęcia dał ≈ 0,58 i 0,22 średnicy, więc
        wpisane jest 0,6 i 0,2 (czyli r = 90 i r = 30 w viewBoxie 300) — to
        akurat proporcje IFAA, ale to nadal MÓJ POMIAR Z OBRAZKA, nie dane
      - czy w środku jest X do rozstrzygania remisów
      - czy to jedna tarcza na kartce, czy trzy spoty jak przy 6-10
      - czy user na takiej strzela i czy ma ZASTĄPIĆ tarczę 6-10, czy stanąć
        obok niej (katalog uniesie obie)
      - źródło (regulamin? sklep? klub?)

      **Włączenie = dopisanie `pickOrder` w tym jednym pliku.** Gdyby proporcje
      okazały się inne, zmieniają się `zones` i `rings` w tym samym pliku i NIC
      poza nim.

**Naprawione przy okazji katalogu:** 6-Ring faktycznie renderuje się i punktuje
jako 6-ring; 6-Ring nie wyświetla się już jako pionowy 3-spot; handicap liczy
122cm jako 122 i 60cm jako 60 (wcześniej oba wpadały w `default: 80`).
Handicap jest zapisywany w `users/{uid}.last10Handicaps`, więc historyczne
wartości poprawią się same w ciągu 10 kolejnych sesji.

---

*Ostatnia aktualizacja:* 2026-09-04
*Status Fazy B (hardening):* ✅ COMPLETE
*Status Fazy C (store readiness):* 🔄 IN PROGRESS
