# TODO — GROT-X Security Hardening — Pozostałe Prace

**Data startu:** 2026-04-22  
**Status:** ✅ Fix A + Fix B ukończone — zostało tylko optymalizacja bundla

---

## 🎯 Pozostałe Kroki (Priorytet: WYSOKI)

### 1. Firebase Re-Login & Deploy Rules
**Status:** ⏳ Pending  
**Czas:** ~5 min  
**Kroki:**
```powershell
cd "C:\Users\Lager 1\OneDrive\Desktop\G-X"
npx firebase login --reauth
# Zaloguj się w przeglądarce na konto Firebase
```
Po zalogowaniu — deploy rules:
```powershell
npx firebase deploy --only firestore:rules
```
**Oczekiwany wynik:**
```
✓  firestore:rules deployed successfully

Deploy complete!
```

**Ważne:** To jest jedynym blokerem. Po zalogowaniu deploy będzie szybki.

---

### 2. Test Coach-Note Feature (Post-Deploy)
**Status:** ⏳ Pending  
**Czas:** ~5 min  
**Cel:** Weryfikacja, że trener może teraz pisać `coachNote`

**Kroki:**
1. Otwórz app w przeglądarce: `http://localhost:5173`
2. Zaloguj się jako **trener** (konto z `coaches` relacją)
3. Wejdź do profilu studenta
4. Spróbuj wpisać tekst w pole "Coach Note"
5. Kliknij Save
6. W DevTools Console — powinno być:
   ```
   (brak błędów)
   ```
7. Przeładuj stronę (`F5`) — notatka powinna być nadal tam

**Oczekiwany wynik:**
```
✅ Coach Note zapisany pomyślnie
```

---

### 3. Fix B — Link Preview UI
**Status:** ⏳ Not started  
**Czas:** ~25-30 min  
**Plik:** `src/views/StatsView.tsx`  
**Funkcja:** `renderWithLinks()` (line 171)

**Cele:**
- Dodać preview kartkę przy hover na link
- Wyświetlić domain + warning dla shortenerów
- Detekcja IDN (Unicode domains)

**Design — Link Preview Card:**
```
┌────────────────────────────────┐
│ 🔗 bit.ly (URL Shortener)      │
│ https://bit.ly/abc123 ↗        │
│ ⚠️ Cel linku jest ukryty       │
│ (Kliknij aby otworzyć)         │
└────────────────────────────────┘
```

**Shorteners do detektu:**
- bit.ly
- tinyurl.com
- t.co
- is.gd
- goo.gl
- ow.ly
- buff.ly
- tiny.cc
- rb.gy
- cutt.ly
- short.io
- s.id

**Implementacja:**
1. Dodać Tooltip/Popover komponent (lub CSS `::after`)
2. Parsing URL do extract domain
3. Checklist shortenerów
4. Checklist IDN (Unicode chars w domain)
5. Conditional warnings

**Pseudokod:**
```typescript
const renderWithLinks = (text: string) => {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  
  return parts.map((part, i) => {
    if (!part.match(urlRegex)) return <span key={i}>{part}</span>;
    
    // URL found — extract domain, detect shortener, detect IDN
    const url = new URL(part);
    const domain = url.hostname;
    const isShortener = SHORTENERS.includes(domain);
    const isIDN = /[^\x00-\x7F]/.test(domain); // non-ASCII chars
    
    return (
      <LinkPreview key={i} url={part} domain={domain} 
                   isShortener={isShortener} isIDN={isIDN} />
    );
  });
};
```

**LinkPreview komponent:**
- Wyświetli link normalnie
- Na hover — pokaż kartę z warningami
- `rel="noopener noreferrer" target="_blank"` bez zmian

---

### 4. Build & Verify
**Status:** ✅ Zrobione (2026-04-22)

---

### 5. Git Commit & Push
**Status:** ⏳ Pending  
**Czas:** ~3 min  

```powershell
git add -A
git commit -m "Security hardening: Firestore rules length limits + coach-note path + link preview UI"
git push origin main
```

**Commit message context:**
- Fix A: Firestore rules length limits (note ≤2000, coachNote ≤500)
- Fix A: New coach-path allowing coachNote+coachEditCount writes
- Fix B: Link preview card with domain + shortener/IDN warnings

---

## 📋 Checklist Podsumowanie

- [ ] **Firebase login** — `npx firebase login --reauth`
- [ ] **Deploy rules** — `npx firebase deploy --only firestore:rules`
- [ ] **Test coach-note** — weryfikacja w przeglądarce
- [ ] **Implement Fix B** — `renderWithLinks()` rewrite
- [x] **Build check** — `npm run build` ✅
- [x] **Git commit** — wszystkie zmiany zacommitowane ✅
- [x] **Git push** — wypchnięte do main ✅
- [x] **Fix B** — SafeLink preview w `StatsView.tsx` ✅
- [x] **Firebase deploy** — rules live ✅
- [x] **Vercel fix** — `.npmrc` + Install Command ✅
- [x] **Optymalizacja bundla** — code splitting + manualChunks ✅ (-54% initial load)
- [x] **E2E tests T1-T6** — wszystkie reguły przeszły ✅ (2026-04-24)
- [ ] **Memory leak AuthView.tsx:51** — minor, niepilne
- [ ] **App Check debug token dla Edge** — kosmetyczne
- [ ] **T7 UI test** — student odpina trenera (przyszła sesja)

---

---

### 6. Optymalizacja Rozmiaru Bundla (Priorytet: NISKI)
**Status:** ⏳ Pending  
**Czas:** ~30-60 min  
**Kiedy:** Osobna sesja — nie pilne

**Problem:**
```
vendor.js   1523 KiB  →  432 KiB (gzip)   ← za duży
index.js     595 KiB  →  146 KiB (gzip)
```
Przeglądarka ładuje cały kod aplikacji przy starcie — spowalnia pierwsze uruchomienie.

**Rozwiązanie — Code Splitting (lazy loading):**
```typescript
// Zamiast:
import ScoringView from './views/ScoringView';

// Używamy:
const ScoringView = React.lazy(() => import('./views/ScoringView'));
```
Każdy widok ładowany tylko gdy użytkownik go odwiedza.

**Kroki:**
1. W `App.tsx` zamień importy widoków na `React.lazy()`
2. Opakuj router w `<React.Suspense fallback={<LoadingSpinner />}>`
3. Skonfiguruj `manualChunks` w `vite.config.ts` dla Firebase SDK:
```typescript
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        firebase: ['firebase/app', 'firebase/firestore', 'firebase/auth'],
        vendor: ['react', 'react-dom'],
      }
    }
  }
}
```
4. `npm run build` — sprawdź nowe rozmiary

**Oczekiwany efekt:** Pierwsze ładowanie ~2x szybsze

---

## 💡 Notatki

1. **Firebase Login:** Otworzy się przeglądarka. Zaloguj się na: `info@aves-24.de` lub `rafal.woropaj@googlemail.com`
2. **Coach-Note Test:** Wymaga zalogowania się jako trener. Jeśli brakuje relacji coach/student, można ją dodać w Firestore Console lub w UI.
3. **Fix B Timing:** To jest najdłuższy krok. Może być zrobiony niezależnie od deploymentu rules.
4. **Build Timestamp:** Będzie auto-updated przy `npm run build` — sprawdź czy wyświetlił się nowy czas w `HomeView.tsx` line 975

---

## 🎯 Finalna Wizja (Po Ukończeniu)

Aplikacja GROT-X będzie miała:
1. ✅ Wzmocnione Firestore security rules (field-level validation + length limits)
2. ✅ Działającą coach-note feature
3. ✅ Link preview UI z warningami dla shortenerów/IDN
4. ✅ Auto-updating build timestamp
5. ✅ Czysty kod + brak memory leaks
6. ✅ Wszystkie 7 security tests (E1-E7) przeszły
7. ✅ Wszystkie 6 smoke test bugs naprawione

**Bezpieczeństwo:** Expert-level na wszystkich poziomach ✨  
**Wydajność:** Szybkie pierwsze ładowanie dzięki code splitting

---

*Ostatnia aktualizacja:* 2026-04-22  
*Następna sesja:* Jutro — Firebase login + deploy + Fix B
