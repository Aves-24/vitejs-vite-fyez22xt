# Testy e2e — mapa pokrycia (stan 2026-11-06)

Uruchamianie (PowerShell):

```powershell
$env:JAVA_TOOL_OPTIONS="-Djdk.net.unixdomain.tmpdir=C:/Users/Public"; npm run test:e2e
```

Podgląd krok po kroku: `npm run test:e2e:ui`. W CI: co dwa dni (workflow E2E) + ręcznie w Actions — NIE blokują deployu.

## Pokryte

| Obszar | Plik | Co sprawdza |
|---|---|---|
| Logowanie | auth | rejestracja + zgoda RODO w bazie, wylogowanie, błędne hasło, logowanie |
| Trening | training | gość: zapis, Home, reload, Tagebuch; anulowanie; szybkie wpisywanie; szybki start (dystans) |
| Zawodnik — dym | smoke-athlete | wszystkie ekrany i zakładki (Kalender, Tagebuch, Stats ×3, Einst. ×8, kafelki Home, Delay Mirror na sztucznej kamerze) z danymi |
| Zawodnik — zapisy | athlete-flows | fokus, trening techniczny (strzały, podtemat, notatka), licznik strzał, notatka/kamień milowy, termin zawodów |
| Ustawienia | settings-flows | profil, zestaw sprzętowy, język, eksport JSON, gość → konto, usunięcie konta |
| Trener — dym | smoke-coach | Übersicht, Termine, Gruppen, Einst., Schüler, podgląd ucznia, pełny profil (3 zakładki + okienka), powrót do Schütze |
| Trener ↔ uczeń | coach, coach-flows | zaproszenie + akceptacja, grupa + temat widoczny u ucznia, komentarz trenera w Tagebuchu ucznia |
| Multiplayer | battle | arena, dołączenie kodem, 6 Passen obu graczy, ranking |
| Poprawki 2026-11-05 | fixes-2026-11-05 | klawiatura 3-Spot, PRO gościa → trial po założeniu konta, zmiana klasy wiekowej (+ zgoda rodzica < 16) |
| Termine + czat | coach-schedule | stały trening grupy (4 tygodnie, Übersicht „Heute Training”, odwołanie; uczeń widzi trening i odwołanie na Home; Ferien/przerwa z opisem), czat uczeń ↔ trener na żywo |
| Tarcza | target-input | 3-Spot: mysz trafia w miejsce kliku, obie kolumny; dotyk z odsunięciem celownika |
| Zawody | tournament | termin na dziś, karta wyników, statystyki (tarcza 122cm), Tagebuch, Rekorde, niemieckie daty |
| Fokus + wiadomość | coach-focus | fokus od trenera (Home i Tagebuch ucznia, trening pod fokus), wiadomość ✉ do całej grupy w dzwoneczku ucznia |
| Współtrener | co-coach | 3 konta: zaproszenie drugiego trenera do grupy, przyjęcie, zgoda ucznia, współtrener widzi ucznia |
| Gra Verein | club-battle | gra klubowa na liście „Vereinsspiele”, dołączenie, ranking na ślepo (przed Passe toast, po Passe wynik innego tylko do tej samej liczby strzał) |
| Delay Mirror | delay-mirror | nagrywanie z opóźnieniem 2 s (WebM — Chromium testowy nie odtwarza H.264 w MSE), Passe na tarczy, powtórka, stopklatka z tarczą, znaczniki + notatka, licznik strzał |
| Offline | offline | trening zapisany bez sieci widać od razu (Home, Tagebuch), po powrocie sieci trafia do bazy |
| Pierwsze uruchomienie | onboarding | Profil-Assistent 7 kroków (dane w bazie: data ur. tylko w private), zgoda opiekuna dla 13-latki po kreatorze; TermsGate po zmianie wersji regulaminu (tekst „aktualisiert”, akceptacja zapisuje wersję) |
| Hala 2×30 + Rekorde | tournament-indoor | turniej 18 m: format 2×30 domyślnie, 60 szybkich strzał (nic nie ginie), D1/D2, zapis; REKORDY: start z zeszłego roku dopisany ręcznie, seria 2 starty, rekord, +22 |
| Tarcza 122 cm | target-full | 70 m: X/9/8/7/6/1 myszą, lupa przy przeciąganiu (strzała tam, gdzie puszczono), Technikfehler (dawniej „Fehlschuss”) w bazie |
| Statystyki PRO | stats-pro | 3 treningi → pierwsza ranga („Dein erster Rang”), PRO Progress, eksport PDF (%PDF) i CSV (nagłówek po niemiecku), każda Passe w bazie |
| Termine + Gesehen | coach-termine | stały trening „alle 2 Wochen” (2 terminy w 4 tygodniach), odwołanie „Absagen und verschieben” (tematy +1 termin w bazie, uczeń: Heute abgesagt + następny za 14 dni); notatka ucznia → trener „Gesehen” → uczeń „Dein Trainer hat deine Notiz gelesen” |
| Inne | smoke-extras | Schreiber-Training (start, klawiatura), Admin Center (4 zakładki) |

Każdy test łapie też: wyjątki JS, ekran błędu widoku, odrzucenia reguł Firestore i odpowiedzi HTTP ≥ 400.

## Jeszcze NIE pokryte

- Delay Mirror: eksport klipu / Teilen (navigator.share), wycinanie fragmentów
- Wartung (konserwacja sprzętu), dmuchawka jako dyscyplina
- WORLD (wyłączone „Bald verfügbar”)
- Offline na buildzie produkcyjnym z service workerem (w dev moduły ładujemy wcześniej), ciemny motyw, języki PL/EN poza przełącznikiem

## Znalezione błędy (naprawione)

1. Uczeń nie pojawiał się u trenera po akceptacji do przeładowania (wyścig zapisów → writeBatch)
2. Okienko „Schüler hinzufügen” z kamerą zostawało otwarte po wysłaniu zaproszenia
3. Strzała wpisana < 600 ms po szóstej przepadała (cała Passe przy szybkim wpisywaniu)
4. Szybkie „Training” po wejściu w Vorbereitung zapisywało łucznikowi 10 m dmuchawki / Blowgun 20cm
5. Podgląd ucznia u trenera: dni paska 14 dni przesunięte przez zmianę czasu (2× „25. Okt.”)
6. „Frohes neues Jahr” + przeliczenie dystansów przy pierwszej dacie urodzenia (w listopadzie)
7. Usuwanie konta: App próbował odtworzyć profil w trakcie usuwania (PERMISSION_DENIED)
8. Ekran błędu widoku po polsku dla wszystkich języków
9. Lobby Areny: łucznik bez historii dostawał 10 m dmuchawki / Blowgun 20cm

10. Czat uczeń ↔ trener: odpowiedź pojawiała się dopiero po ponownym otwarciu (jednorazowy odczyt → nasłuch)
11. Tarcza myszą: celownik odsunięty jak dla palca — klik w środek lądował ~55 px wyżej
12. Kalendarz/daty po angielsku („Thu 5”, „05/11/2026”) dla języka z przeglądarki (de-DE ≠ de)
13. Karta zawodów w statystykach: surowy alias tarczy „Full” zamiast „122cm”
14. (2026-11-06) KAŻDE powiadomienie do innego konta (trener→uczeń, uczeń→trener, →admin) przepadało: createNotification czytał cudzą skrzynkę (reguła: tylko odbiorca) → PERMISSION_DENIED
15. (2026-11-06) Wiadomość ✉ trenera do grupy nie tworzyła powiadomienia — uczeń nigdzie jej nie widział
16. (2026-11-06) Kreator krok 3: podpowiedź wzrostu po polsku („np. 180”) w każdym języku
17. (2026-11-06) Kreator krok 5: łucznik dostawał na liście nastaw „10m Blowgun 20cm”
18. (2026-11-06) TermsGate po zmianie AGB mówił „GROT-X hat jetzt Nutzungsbedingungen” zamiast o aktualizacji
19. (2026-11-06) Karta zawodów: strzała wpisana w 150 ms po pełnym wierszu przepadała (z 30 szybkich zostawało 24)
20. (2026-11-06) Trening: zapis tuż po ostatniej strzale — ostatnia Passe była w sumie, ale NIE w ends (tarcza, statystyki, eksport bez niej)
21. (2026-11-06) Eksport CSV: nagłówek zawsze po polsku

## Do omówienia (partia 2)

- ZROBIONE 2026-11-05: uczeń widzi na Home najbliższy trening grupy (Heute Training / Heute abgesagt + następny / Nächstes Training) — lustro groupPlans/
- ZROBIONE 2026-11-05: „Ohne Training seit 14+ Tagen” liczone od dołączenia ucznia (coachStudentSince)

## Do omówienia — ZROBIONE 2026-11-05

- 3-Spot: klawiatura tylko X, 10–6, M (6-Ring: X–5, dmuchawka 3-5-7: same strefy)
- Gość: PRO tylko na czas życia konta (bez trialu); po założeniu konta trial 40 dni; reguły pilnują (anonimowy + expiresAt ≤ 25 h)
- Przycisk „Schüler hinzufügen” na liście uczniów (bez miejsc → Einst.)
- Pusta grupa: przycisk „Mitglieder hinzufügen” zamiast odsyłacza „niżej”
- Okno połączenia: „Deine eindeutige ID” zamiast „Schüler-ID”
- Klasa wiekowa: dystanse przeliczane przy każdej zmianie klasy (Nowy Rok albo poprawiona data urodzenia — okienko „Neue Altersklasse”); Nowy Rok bez zmiany klasy nie rusza dystansów
