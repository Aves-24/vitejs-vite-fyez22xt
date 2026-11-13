# GROT-X — Inwentarz danych (RODO + formularze sklepowe)

**Wersja:** 1.4 · 2026-11-06 (11d grupy treningowe `groups/`, DS 2.4 v1.11; usunięcie konta trenera kasuje/opuszcza jego grupy)
**Poprzednio:** 1.3 · 2026-11-06 (11b `groupPlans`, 11c `coachTransfers`)
**Poprzednio:** 1.2 · 2026-07-08 (C22: zgoda opiekuna dla <16 lat — art. 8 RODO)
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
| 4 | Data urodzenia | `users/{uid}/private/profile` (reguły: tylko właściciel+admin) | kategorie wiekowe WA (dystanse/tarcze) | art. 6(1)(b) | właściciel, admin; trener widzi TYLKO wyliczone kategorie (`ageCategory` DSB, np. „Jugend w" + `ageCategoryPL` PZŁucz, np. „kadet w" — wyświetlana zależnie od języka widza) |
| 5 | Płeć | `users/{uid}/private/profile` | kategorie WA | art. 6(1)(b) | właściciel, admin (pośrednio: kategoria wiekowa zawiera wariant m/w) |
| 6 | Klub (nazwa, miasto) | `users/{uid}` | ogłoszenia klubowe, profil | art. 6(1)(b) | wg flag `showClub`/`showRegion` |
| 7 | Sprzęt (łuk, celownik, strzały) | `users/{uid}` | personalizacja | art. 6(1)(b) | właściciel, admin, trenerzy |
| 8 | Sesje treningowe (wyniki, trafienia, notatki) | `users/{uid}/sessions` | core feature | art. 6(1)(b) | właściciel, admin, trenerzy (po akceptacji zaproszenia) |
| 9 | Notatki prywatne | `users/{uid}/privateNotes` | notatki | art. 6(1)(b) | TYLKO właściciel (+admin) — trener NIE |
| 9a | Prywatne notatki treningowe (C36) | `users/{uid}/sessionNotes` | tekst notatki do sesji oznaczonej „Prywatna” | art. 6(1)(b) | TYLKO właściciel (+admin) — trener NIE |
| 9b | Prośba o miejsca trenerskie (C36) | `coachRequests/{id}` | imię, e-mail, liczba uczniów, status | art. 6(1)(b) | TYLKO admin (+właściciel); max 6 mies. (`expiresAt`/TTL), kasowane z kontem |
| 10 | Turnieje, kalendarz | `users/{uid}/tournaments` | planowanie | art. 6(1)(b) | właściciel, admin, trenerzy |
| 11 | Wiadomości trener↔uczeń | `users/{coachId}/studentMessages` | komunikacja | art. 6(1)(a) — relacja za zgodą | obie strony relacji, admin |
| 11a | Prywatne notatki trenera o uczniu: 3 pola z ikonki w nagłówku profilu (mapa `privateStudentNotes`, przywrócona 2026-11-02) + wpisy „Nur für mich” na osi | `users/{coachId}.privateStudentNotes`, `users/{coachId}/coachStudentNotes` | ciągłość szkolenia, notatki trenera | art. 6(1)(f) — uzasadniony interes trenera | TYLKO trener-autor (+admin) — uczeń NIE; kasowane z kontem trenera, NIE z kontem ucznia (dane w przestrzeni trenera) |
| 11c | Baza wiedzy trenera (Wissen, 2026-11-13): linki zapisane do tematów treningu (temat, adres, tytuł, data dodania); reszta widoku liczona z planów grup | `users/{coachId}/knowledgeLinks` | materiały szkoleniowe trenera | art. 6(1)(b) | TYLKO właściciel (+admin); w eksporcie i kasowane z kontem |
| 11b | Plan grupy dla uczniów (2026-11-05): nazwa i symbol grupy, terminy treningów (z odwołaniami/przerwami/Ferien z opisem), skład (`memberIds`, `coachIds`) | `groupPlans/{groupId}` — lustro wybranych pól z `groups/{groupId}` (tematy, notatki i zgody zostają w `groups/`, uczeń ich nie czyta) | uczeń widzi na Home trening swojej grupy | art. 6(1)(b) | członkowie i trenerzy tej grupy, admin; pisze/kasuje tylko trener grupy (reguły wymuszają skład = skład grupy); kasowane razem z grupą |
| 11c | Przekazanie ucznia innemu trenerowi (2026-11-05): uid i imiona starego trenera, nowego trenera i ucznia, notatka dla następcy (≤ 500 znaków), status, czasy (`createdAt`, `acceptedByCoachAt`, `doneAt` = czas serwera), wersja tekstu zgody (`consentVersion`) | `coachTransfers/{id}` | zmiana trenera za zgodą ucznia; po zakończeniu = dowód zgody (art. 7(1)) | art. 6(1)(a) — zgoda ucznia na nowego trenera; dowód zgody: art. 6(1)(c) | uczeń, obaj trenerzy, admin; niezakończone kasuje każda ze stron; zakończone (dowód zgody) tylko uczeń lub admin — usunięcie konta ucznia kasuje wszystkie, usunięcie konta trenera tylko niezakończone (zakończone zostają u ucznia jako jego dowód). Opisane w DS 2.4 (v1.10) |
| 11d | Grupy treningowe (2026-10-27): nazwa, symbol, plan, skład (`memberIds`), trenerzy (`coachIds`, `coachNames`, do 3), tematy treningów, `consentAsked`; historia z prywatnymi notatkami trenerów do treningów | `groups/{groupId}`, `groups/{groupId}/private/training`, zaproszenia współtrenerów `groupInvites/` | organizacja treningu grupowego | art. 6(1)(b); dostęp współtrenera do danych ucznia — art. 6(1)(a) (zgoda przez `coachInvites`, przy odmowie widzi tylko imię w składzie) | TYLKO trenerzy grupy (+admin); uczeń widzi wyłącznie lustro 11b, tematy dostaje jako wpis w dzienniku (12). Usunięcie konta: właściciel → grupy kasowane w całości; współtrener → wychodzi z grupy; uczeń → w `memberIds` zostaje sam uid bez konta (uczeń nie ma prawa zapisu w grupie). DS 2.4 v1.11 |
| 12 | Dziennik trenerski | `users/{uid}/coachLog` | ciągłość szkolenia | art. 6(1)(a) | uczeń, wszyscy jego trenerzy, admin |
| 13 | XP/level/handicap | `users/{uid}`, `world_stats` | gamifikacja, ranking | art. 6(1)(b) | leaderboard: wszyscy zalogowani |
| 14 | Wyniki battles (live) | `battles/{id}` | pojedynki online | art. 6(1)(b) | wszyscy zalogowani (do zawężenia) |
| 16 | Kamera: QR | przetwarzanie lokalne | połączenie z trenerem | permission systemowy | nikt — nie zapisywane |
| 17 | Kamera: wideo (Delay Mirror) | TYLKO lokalnie na urządzeniu | analiza techniki | permission systemowy | nikt — brak uploadu |
| 18 | IP, logi serwera | Firebase Hosting (Google) | dostarczanie, bezpieczeństwo | art. 6(1)(f) | Google (procesor) |
| 19 | Sygnały reCAPTCHA v3 | Google (App Check) | anty-abuse | art. 6(1)(f) | Google (procesor) |
| 20 | Local Storage (aktywna sesja, język, cache Firestore) | urządzenie użytkownika | działanie offline | technicznie niezbędne (§25(2) TDDDG) | nikt |
| 21 | Zgoda na politykę (`privacyConsent`) | `users/{uid}` | rozliczalność (art. 7(1)) | art. 6(1)(c) | właściciel, admin |
| 21a | Akceptacja regulaminu (`termsAccepted {version, acceptedAt}`, C36 2026-10-14) | `users/{uid}` | dowód zawarcia umowy / zgody na zmianę AGB | art. 6(1)(b) | właściciel, admin |
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

⚠️ **Do zrobienia ręcznie:** zaakceptować Data Processing Addendum w Google Cloud
Console (Firebase) — wymóg art. 28 RODO.

## 3. Mapowanie: Google Play „Data safety"

- **Personal info:** Name ✔ (collected), Email ✔ (collected, app functionality, required)
- **Personal info → Other:** data urodzenia, płeć, klub (app functionality)
- **Location:** NIE (2026-09-25: pogoda / Open-Meteo usunięta — lokalizacja nie jest pobierana)
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

- Polityka prywatności: **v1.1** (2026-07-08) — dodano sekcję o zgodzie opiekuna <16 (C22). Poprzednio v1.0 (2026-06-11).
- Źródło wersji w kodzie: `PRIVACY_POLICY_VERSION` w `src/utils/legalLinks.ts` (używane przy zapisie `privacyConsent` i `parentalConsent`).
- Pole w profilu: `privacyConsent: { version: '1.1', acceptedAt: <timestamp> }`
- Zgoda opiekuna: `parentalConsent: { version: '1.1', acceptedAt, guardianEmail, birthDateAtConsent }` w `users/{uid}/private/profile`.
- Przy istotnej zmianie polityki → podbić wersję → bramka zgody opiekuna prosi małoletnich o ponowną akceptację (ogólnej zgody na razie nie wymuszamy ponownie).
