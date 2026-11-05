# Testy e2e — mapa pokrycia (stan 2026-11-05)

Uruchamianie (PowerShell):

```powershell
$env:JAVA_TOOL_OPTIONS="-Djdk.net.unixdomain.tmpdir=C:/Users/Public"; npm run test:e2e
```

Podgląd krok po kroku: `npm run test:e2e:ui`. W CI testy blokują deploy.

## Pokryte (24 testy)

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
| Inne | smoke-extras | Schreiber-Training (start, klawiatura), Admin Center (4 zakładki) |

Każdy test łapie też: wyjątki JS, ekran błędu widoku, odrzucenia reguł Firestore i odpowiedzi HTTP ≥ 400.

## Jeszcze NIE pokryte

- Termine trenera: stały trening grupy, odwołania/przerwy, przesuwanie tematów
- Fokus ustawiany przez trenera, „Widziałem”, wiadomości ✉ (uczeń ↔ trener, cała grupa)
- Współtrenerzy grupy (zaproszenie drugiego trenera)
- Wpisywanie strzał na TARCZY (kropki, lupa, 3-Spot „jedna strzała na spot”), Fehlschuss
- Zawody: wynik zawodów, REKORDY rok do roku
- Delay Mirror: nagrywanie, stopklatka, eksport/Teilen (tylko otwarcie ekranu)
- Statystyki PRO z większą ilością danych, eksport PDF
- Wartung (konserwacja sprzętu), dmuchawka jako dyscyplina
- Gry klubowe (Verein, ranking na ślepo), WORLD, powiadomienia
- Wizard profilu, zgoda opiekuna < 16 lat, TermsGate po zmianie regulaminu
- Tryb offline, ciemny motyw, języki PL/EN poza przełącznikiem

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

## Do omówienia (nie zmieniane)

- 3-Spot (pierścienie 6–10): klawiatura pokazuje też 5, 4, 3, 2, 1
- Dodawanie ucznia tylko w Einst. panelu trenera — pusta lista „Schüler” nie ma przycisku
- Ekran grupy: „Füge zuerst Schüler zur Gruppe hinzu (unten bei »Mitglieder«)” — Mitglieder są w Einst., nie niżej
- Gość dostaje „PRO · noch 40 Tage”, choć konto gościa żyje 24 h
- Okno dołączania do pojedynku nazywa ID gracza „Schüler-ID”
- Admin Center tylko po polsku (dla admina OK)
- Nowy Rok: jeśli klasa wiekowa się NIE zmieniła, dystanse nie są już przeliczane (wcześniej zawsze) — potwierdzić, że tak ma być
