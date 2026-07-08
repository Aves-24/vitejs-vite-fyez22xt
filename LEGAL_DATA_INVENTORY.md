# GROT-X — Inwentarz danych (RODO + formularze sklepowe)

**Wersja:** 1.2 · 2026-07-08 (C22: zgoda opiekuna dla <16 lat — art. 8 RODO)
**Poprzednio:** 1.1 · 2026-07-08 (C21: e-mail/DOB/płeć poza zasięgiem relacji trener↔uczeń)
**Cel:** jedno źródło prawdy dla (a) polityki prywatności, (b) Google Play
„Data safety", (c) Apple „App Privacy" (Nutrition Labels).
**Zasada:** każda zmiana w zbieranych danych = aktualizacja tego pliku,
polityki prywatności (wersja!) i obu formularzy sklepowych.

---

## 1. Pełny inwentarz

| # | Dane | Gdzie | Cel | Podstawa RODO | Widoczne dla |
|---|------|-------|-----|---------------|--------------|
| 1 | E-mail | TYLKO Firebase Auth (od C21 nie jest przechowywany w Firestore; legacy pole usuwane migracją) | konto, logowanie | art. 6(1)(b) | właściciel, admin (konsola Auth) |
| 2 | Hasło (hash) | Firebase Auth | logowanie | art. 6(1)(b) | nikt (hash) |
| 3 | Imię/nazwisko/pseudonim | `users/{uid}` | profil, funkcje społ. | art. 6(1)(b) | właściciel, admin, trenerzy, uczestnicy battles/leaderboard (nazwa wyświetlana wg flag; WORLD zawsze z inicjałem nazwiska) |
| 4 | Data urodzenia | `users/{uid}/private/profile` (reguły: tylko właściciel+admin) | kategorie wiekowe WA (dystanse/tarcze) | art. 6(1)(b) | właściciel, admin; trener widzi TYLKO wyliczoną kategorię (`ageCategory`, np. „Jugend w") |
| 5 | Płeć | `users/{uid}/private/profile` | kategorie WA | art. 6(1)(b) | właściciel, admin (pośrednio: kategoria wiekowa zawiera wariant m/w) |
| 6 | Klub (nazwa, miasto) | `users/{uid}` | ogłoszenia klubowe, profil | art. 6(1)(b) | wg flag `showClub`/`showRegion` |
| 7 | Sprzęt (łuk, celownik, strzały) | `users/{uid}` | personalizacja | art. 6(1)(b) | właściciel, admin, trenerzy |
| 8 | Sesje treningowe (wyniki, trafienia, notatki) | `users/{uid}/sessions` | core feature | art. 6(1)(b) | właściciel, admin, trenerzy (po akceptacji zaproszenia) |
| 9 | Notatki prywatne | `users/{uid}/privateNotes` | notatki | art. 6(1)(b) | TYLKO właściciel (+admin) — trener NIE |
| 10 | Turnieje, kalendarz | `users/{uid}/tournaments` | planowanie | art. 6(1)(b) | właściciel, admin, trenerzy |
| 11 | Wiadomości trener↔uczeń | `users/{coachId}/studentMessages` | komunikacja | art. 6(1)(a) — relacja za zgodą | obie strony relacji, admin |
| 12 | Dziennik trenerski | `users/{uid}/coachLog` | ciągłość szkolenia | art. 6(1)(a) | uczeń, wszyscy jego trenerzy, admin |
| 13 | XP/level/handicap | `users/{uid}`, `world_stats` | gamifikacja, ranking | art. 6(1)(b) | leaderboard: wszyscy zalogowani |
| 14 | Wyniki battles (live) | `battles/{id}` | pojedynki online | art. 6(1)(b) | wszyscy zalogowani (do zawężenia) |
| 15 | Lokalizacja (współrzędne) | NIE zapisywana — tylko transmisja do Open-Meteo | pogoda | art. 6(1)(a) — permission systemowy | nikt; zapisywane tylko temp+wiatr |
| 16 | Kamera: QR | przetwarzanie lokalne | połączenie z trenerem | permission systemowy | nikt — nie zapisywane |
| 17 | Kamera: wideo (Delay Mirror) | TYLKO lokalnie na urządzeniu | analiza techniki | permission systemowy | nikt — brak uploadu |
| 18 | IP, logi serwera | Firebase Hosting (Google) | dostarczanie, bezpieczeństwo | art. 6(1)(f) | Google (procesor) |
| 19 | Sygnały reCAPTCHA v3 | Google (App Check) | anty-abuse | art. 6(1)(f) | Google (procesor) |
| 20 | Local Storage (aktywna sesja, język, cache Firestore) | urządzenie użytkownika | działanie offline | technicznie niezbędne (§25(2) TDDDG) | nikt |
| 21 | Zgoda na politykę (`privacyConsent`) | `users/{uid}` | rozliczalność (art. 7(1)) | art. 6(1)(c) | właściciel, admin |
| 22 | Zgoda opiekuna dla <16 lat (`parentalConsent`: wersja, timestamp, data ur. w chwili zgody) | `users/{uid}/private/profile` | rozliczalność zgody dla małoletnich (art. 8) | art. 6(1)(c) + art. 8 | właściciel, admin |
| 23 | E-mail rodzica/opiekuna (dowód zgody <16) | `users/{uid}/private/profile` | weryfikacja zgody opiekuna (art. 8(2) — „reasonable efforts") | art. 6(1)(c) + art. 8 | właściciel, admin |

**Małoletni (art. 8 RODO):** próg zgody cyfrowej = **16 lat** (Niemcy i Polska;
używamy 16 na sztywno — surowszy próg pokrywa też kraje z niższym progiem 13–15).
Poniżej 16 lat aplikacja wymaga oświadczenia rodzica/opiekuna + jego e-maila
(bramka `ParentalConsentGate`) — proporcjonalne „reasonable efforts" dla usługi
niskiego ryzyka bez danych zdrowotnych/płatniczych. Twarda weryfikacja (link
mailowy do opiekuna) planowana z Cloud Functions (Blaze). Aplikacja z założenia
obsługuje młodzież (kategorie WA Schüler C/B/A), więc małoletni to grupa docelowa.

**NIE zbieramy:** analytics/trackerów reklamowych, kontaktów, zdjęć z galerii,
danych zdrowotnych, danych płatniczych (premium = przyszłość, wtedy aktualizacja!).

## 2. Procesory (art. 28 RODO)

| Procesor | Usługa | Transfer poza EOG | Zabezpieczenie |
|----------|--------|-------------------|----------------|
| Google Ireland Ltd. | Firebase: Auth, Firestore, Hosting, App Check | możliwy (Google LLC, USA) | EU-US DPF + SCC; DPA: Google Cloud Data Processing Addendum (zaakceptować w konsoli!) |
| Open-Meteo | API pogodowe | — | brak konta/cookies; tylko współrzędne+IP |

⚠️ **Do zrobienia ręcznie:** zaakceptować Data Processing Addendum w Google Cloud
Console (Firebase) — wymóg art. 28 RODO.

## 3. Mapowanie: Google Play „Data safety"

- **Personal info:** Name ✔ (collected), Email ✔ (collected, app functionality, required)
- **Personal info → Other:** data urodzenia, płeć, klub (app functionality)
- **Location:** Approximate location ✔ (optional, app functionality, NOT shared*, ephemeral — not stored)
  - *uwaga: transmisja do Open-Meteo może wymagać oznaczenia „shared" — zaznaczyć
    „Data is processed ephemerally" i opisać w polityce
- **Messages:** In-app messages ✔ (coach↔student)
- **App activity:** dane treningowe jako „Other user-generated content"
- **Photos/Videos:** NIE (Delay Mirror nie opuszcza urządzenia → wg definicji
  Google „collected" = transmitted off device → NOT collected)
- **Data deleted:** ✔ in-app account deletion (wymóg Play od 2024!)
- **Encryption in transit:** ✔ TLS

## 4. Mapowanie: Apple „App Privacy"

- **Contact Info:** Email Address — linked to user, App Functionality
- **User Content:** Other User Content (treningi, notatki, wiadomości) — linked
- **Identifiers:** User ID (Firebase UID) — linked
- **Location:** Coarse Location — App Functionality, NOT linked (nie zapisujemy)
- **Diagnostics:** brak (nie używamy Crashlytics/Analytics)
- **Tracking (ATT):** BRAK trackingu → „Data Not Used to Track You"

## 5. Wersjonowanie zgód

- Polityka prywatności: **v1.0** (2026-06-11)
- Pole w profilu: `privacyConsent: { version: '1.0', acceptedAt: <timestamp> }`
- Przy istotnej zmianie polityki → podbić wersję → appka prosi o ponowną akceptację.
