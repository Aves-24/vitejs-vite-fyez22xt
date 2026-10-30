# Wartung – plan konserwacji sprzętu (szkic do akceptacji)

Status: **projekt, przed kodem**. Lista czynności + teksty (i) do sprawdzenia przez Rafała.
Teksty są po polsku do oceny; w aplikacji będą w DE/EN/PL. Nazwy w nawiasach = nazwa w UI (DE).

## Ustalenia (2026-10-30)

- Miejsce: Einstellungen → Ausrüstung → zestaw → podzakładka **„Wartung”**. Ustawienia **per zestaw**.
- Każda czynność: włącz/wyłącz, data pierwszego przypomnienia, rytm w miesiącach (1/2/3/6/12), ostatnio wykonano.
- **Przy każdej czynności przycisk (i)** z dokładnym opisem: po co, jak, czym, na co uważać, kiedy iść do sklepu.
  (i) jest też przy samych ustawieniach (data startu, rytm, jak działa przypomnienie).
- Przypomnienie = todo „Inne” w kalendarzu (`todo: true`), pojawia się **3 tygodnie przed terminem**,
  z dopiskiem „fällig bis …”. Zawsze najwyżej jedno otwarte na czynność. Stałe ID (reguła + termin) → brak duplikatów.
- Następny termin liczony **od dnia wykonania** („erledigt”), nie od planu.
- (i) z opisem otwiera się też z samego wpisu w kalendarzu.
- Brak pushy (Spark) – widoczne po otwarciu aplikacji.
- FREE: gotowy szablon. PRO: własne czynności. (do potwierdzenia)

---

## Recurve (i barebow – bez Visier, stabilizatorów i klickera)

### 1. Woskowanie cięciwy (Sehne wachsen) – domyślnie co 1 mies.
**Po co:** wosk chroni włókna przed tarciem, wilgocią i wysychaniem. Sucha cięciwa szybciej się przeciera i pęka.
**Kiedy wcześniej:** włókna są matowe, szorstkie albo widać na nich biały „meszek”.
**Jak:**
1. Nałóż cienką warstwę wosku na cięciwę – **tylko na odcinki bez owijki** (między owijką środkową a końcówkami).
2. Wetrzyj palcami albo kawałkiem skóry, szybko, aż wosk się rozgrzeje i wniknie między włókna.
3. Zetrzyj nadmiar – nie może zostać grudek.
**Uwaga:** nie woskuj owijki środkowej (w miejscu nocka) – nock zacznie inaczej trzymać, a owijka może się zsuwać.
Po deszczu wytrzyj cięciwę do sucha i woskuj dopiero, gdy wyschnie.

### 2. Kontrola cięciwy i owijek (Sehne & Wicklung prüfen) – co 1 mies.
**Jak:** przesuń palcami po całej cięciwie i obejrzyj ją w dobrym świetle. Szukaj:
- przetartych lub zerwanych włókien,
- owijki, która się rozchodzi, luzuje albo jest zgnieciona w miejscu nocka,
- przetarć przy pętlach (końcówki na ramionach).
Sprawdź, czy nock zatrzaskuje się na cięciwie tak jak zwykle (wyraźny „klik”, strzała nie spada, ale nie siedzi za ciasno).
**Uwaga:** zerwane włókno = **nie strzelać**, cięciwę wymienić. Pęknięta cięciwa może uszkodzić ramiona i zranić.

### 3. Wysokość cięciwy i tiller (Standhöhe & Tiller) – co 1 mies.
**Po co:** cięciwa się wyciąga, szczególnie nowa. Zmiana wysokości zmienia lot strzały i dźwięk strzału.
**Jak:**
1. Zmierz miarką (Bracemeter) odległość od najgłębszego punktu uchwytu do cięciwy.
2. Zmierz tiller: odległość od cięciwy do nasady górnego i dolnego ramienia.
3. Porównaj z wartościami zapisanymi w zestawie.
**Korekta:** wysokość reguluje się skręcaniem cięciwy (więcej skrętów = wyżej). Tiller – śrubami ramion (tylko jeśli wiesz, co robisz, albo z trenerem).
**Wskazówka:** zapisz swoje wartości w opisie zestawu – bez tego nie ma z czym porównać.

### 4. Punkt siodełka (Nockpunkt) – co 2 mies.
**Po co:** nawet 1 mm przesunięcia zmienia strojenie i grupy na tarczy.
**Jak:** sprawdź Bracemeterem wysokość punktu nad podstawką i porównaj z zapisaną. Sprawdź, czy punkt (owijka/mosiężny zacisk) nie jest luźny ani przetarty.
**Uwaga:** wymień punkt, zanim się rozpadnie – nie czekaj, aż spadnie na treningu albo zawodach.

### 5. Śruby ramion (Wurfarmschrauben) – co 1 mies.
**Jak:** sprawdź, czy śruby ramion i ewentualne śruby blokujące są dokręcone. **Ręcznie/kluczem bez siły** – mają być pewnie, nie „na maksa”.
**Uwaga:** nie przekręcaj samych śrub regulacji siły – to zmienia siłę naciągu i tiller. Jeśli śruba sama się luzuje, powiedz trenerowi albo w sklepie.

### 6. Kontrola ramion (Wurfarme prüfen) – co 2 mies.
**Jak:** obejrzyj oba ramiona z obu stron, szczególnie przy nasadzie i na końcach, gdzie leży cięciwa. Szukaj:
- pęknięć, odprysków, rys w lakierze,
- rozwarstwienia (laminat się rozchodzi),
- skręcenia ramienia (cięciwa nie idzie środkiem ramion).
**Uwaga:** z uszkodzonym ramieniem **nie strzelać**. Ramię może pęknąć przy naciągu.
**Przechowywanie:** łuk przechowuj ze zdjętą cięciwą, nie opieraj go na jednym ramieniu, nie zostawiaj w gorącym samochodzie.

### 7. Celownik (Visier prüfen) – co 1 mies.
**Po co:** drgania przy każdym strzale luzują śruby. Luźny celownik = grupy „pływają” bez powodu.
**Jak:** sprawdź po kolei: mocowanie do majdanu, ramię celownika, blok/przesuw, tunel lub pin. Nic nie może się ruszać.
Sprawdź, czy skala się nie przesunęła i czy ustawienia na Twoich dystansach się zgadzają.
**Uwaga:** gwinty są często w aluminium – dokręcaj z wyczuciem, za mocno = zerwany gwint.
**Wskazówka:** zapisz ustawienia celownika na dystansach w opisie zestawu albo zrób zdjęcie skali.

### 8. Stabilizatory (Stabilisatoren) – co 1 mies.
**Jak:** dokręć stabilizator długi, V-bar, boczne, przedłużki i ciężarki. Sprawdź tłumiki drgań (czy nie pękły).
**Uwaga:** luźny gwint słychać często jako „brzęk” przy strzale – to dobry sygnał, żeby sprawdzić.

### 9. Podstawka i button (Pfeilauflage & Button) – co 2 mies.
**Jak:**
- Podstawka: nie odkleja się, ramię podstawki nie jest wygięte, strzała leży stabilnie.
- Button (plunger): wciśnij końcówkę – ma chodzić płynnie, bez zacinania. Kontrnakrętka dokręcona.
- Środek strzały ma wypadać na środku końcówki buttona.
**Uwaga:** piasek i kurz zacinają button – wyczyść go suchą szmatką. Nie zmieniaj twardości sprężyny bez potrzeby (to strojenie).

### 10. Klicker (Klicker prüfen) – co 2 mies.
**Jak:** blaszka nie jest wygięta ani pęknięta, śruba mocująca dokręcona, pozycja się nie przesunęła. Klicker ma lekko dociskać strzałę, ale nie wciskać buttona.

### 11. Strzały (Pfeile prüfen) – co 1 mies.
**Jak:** sprawdź każdą strzałę:
- **Lotki:** nie odklejone, nie pęknięte, nie pogniecione.
- **Nocki:** nie pęknięte, ustawione prosto, dobrze trzymają cięciwę.
- **Groty:** dobrze osadzone, nie luźne.
- **Brzechwa:** delikatnie zegnij karbonową strzałę i obróć ją przy uchu – trzeszczenie = pęknięcie.
**Uwaga:** strzały z pękniętą brzechwą lub nockiem **nie wolno strzelać** – karbon może się rozpaść przy strzale i zranić rękę.
**Wskazówka:** ponumeruj strzały – łatwiej znaleźć tę, która ciągle „ucieka”.

### 12. Tab / rękawica (Tab prüfen) – co 2 mies.
**Jak:** skóra nie jest przetarta ani nie ma głębokich rowków od cięciwy. Śruby płytki dokręcone, przekładka między palcami cała.
Skóra nie powinna wystawać za daleko za palce – w razie potrzeby przytnij ją równo.
**Wskazówka:** zużytą skórę wymień na nową tego samego rodzaju – inna skóra = inne wypuszczenie.

### 13. Wymiana cięciwy (Sehne erneuern) – co 12 mies.
**Po co:** cięciwa z czasem się wyciąga i słabnie, nawet jeśli wygląda dobrze.
**Jak:** nową cięciwę zakładaj z tymi samymi parametrami (długość, liczba skrętów). Pierwsze ~100 strzałów cięciwa się „układa” – potem jeszcze raz sprawdź wysokość i punkt siodełka.
**Wskazówka:** miej zawsze jedną zapasową, wstrzelaną cięciwę – na zawody obowiązkowo.

### 14. Zestaw zapasowy (Ersatzteile prüfen) – co 6 mies.
**Jak:** sprawdź, czy w torbie jest: zapasowa cięciwa, nocki, punkt siodełka, podstawka, imbusy, wosk, Bracemeter, zapasowy tab.

### 15. Przegląd w sklepie (Inspektion Fachhändler) – co 12 mies.
**Po co:** raz w roku warto oddać łuk do sprawdzenia przez fachowca – zobaczy rzeczy, których nie widać w domu.

---

## Compound – dodatkowo / inaczej

- **1. Woskowanie** – co 1 mies.: woskuj **cięciwę i kable**. Nie woskuj okolic peepa (peep zacznie się obracać) ani owijek.
- **5. Śruby ramion** – co 1 mies.: tylko sprawdź, czy się nie luzują. **Nie kręć** – to zmienia siłę naciągu i strojenie.
- **3. Wysokość / tiller** – zastąpione punktem 16.

### 16. Peep (Peep prüfen) – co 1 mies.
**Jak:** peep siedzi mocno, nie przesuwa się w górę/dół i nie obraca się przy pełnym naciągu.
**Uwaga:** obracający się peep to często znak, że cięciwa się wyciągnęła – sprawdź też punkt 17.

### 17. Synchronizacja kół (Timing prüfen) – co 3 mies.
**Jak:** wiele kół ma znaczniki – sprawdź, czy cięciwa i kable leżą na znacznikach. Sprawdź, czy draw stop dotyka kabli w tym samym momencie.
**Uwaga:** jeśli timing się nie zgadza – do sklepu. Do regulacji potrzebna jest prasa do łuku.

### 18. D-loop (D-Loop prüfen) – co 2 mies.
**Jak:** pętla nie jest przetarta ani spłaszczona, węzły się nie przesuwają. Zużytą wymień od razu – zerwanie przy naciągu to strzał „w powietrze”.

### 19. Release (Release prüfen) – co 2 mies.
**Jak:** spust działa płynnie, szczęka/hak się nie zacina, śruby dokręcone, pasek nie przetarty.

### 20. Koła i osie (Cams & Achsen) – co 3 mies.
**Jak:** koła bez pęknięć i zadziorów, cięciwa nie wychodzi z rowka, osie czyste. Nie smaruj samodzielnie, jeśli producent tego nie zaleca.

- **13. Wymiana** – co 12 mies.: wymieniaj **cięciwę i kable razem** (rozciągają się różnie). Po wymianie – przegląd timingu w sklepie.

---

## Tradycyjny – dodatkowo / inaczej

- Bez Visier, stabilizatorów, buttona i klickera.
- **11. Strzały** – przy drewnianych dodatkowo: prostość (obróć na dłoni), pęknięcia drewna przy nocku, lotki z piór (wyczesać, wymienić zniszczone).
- **12. Tab** → **Tab / rękawica**.

### 21. Konserwacja drewna (Holzpflege) – co 6 mies.
**Jak:** sprawdź lakier na majdanie i ramionach. Zarysowania zabezpiecz woskiem lub olejem zalecanym przez producenta. Drewno chroń przed wilgocią i upałem.

### 22. Uchwyt i półka (Griff & Pfeilauflage) – co 3 mies.
**Jak:** skórzany uchwyt się nie odkleja, futerko/podkładka na półce nie jest wytarte. Wytartą podkładkę wymień – strzała zacznie „skakać”.

---

## Dmuchawka (Blasrohr)

Uwaga: źródeł o dmuchawkach sportowych jest mało – punkty z praktyki, do sprawdzenia przez Rafała.

### 23. Czyszczenie lufy (Rohr reinigen) – co 1 mies.
**Po co:** oddech zostawia w lufie wilgoć – brud i wilgoć spowalniają strzałkę i psują celność.
**Jak:** przeciągnij przez lufę suchą szmatkę lub wycior, potem zostaw lufę otwartą do wyschnięcia. Bez agresywnych środków.

### 24. Ustnik (Mundstück) – co 1 mies.
**Jak:** umyj ciepłą wodą, sprawdź pęknięcia i czy dobrze przylega. Ze względów higienicznych nie pożyczaj ustnika. Zużyty wymień.

### 25. Strzałki (Darts prüfen) – co 1 mies.
**Jak:** stożki nie są zgniecione, igły proste i dobrze osadzone. Zgięte strzałki odrzuć – lecą krzywo i niszczą tarczę.

### 26. Połączenia i osprzęt (Verbindungen) – co 3 mies.
**Jak:** jeśli lufa jest składana – połączenia ciasne, bez luzu. Celownik i osłony dobrze zamocowane.

---

## Źródła (research 2026-10-30)

- Elite Archery – Bow Maintenance 101: https://elitearchery.com/blogs/technical-tools/bow-maintenance-101
- Archery 360 – Take Care of Recurve Equipment: https://archery360.com/2025/09/11/take-care-of-recurve-equipment/
- Bowhunters United – maintenance checklist: https://bowhuntersunited.com/2023/06/20/a-comprehensive-bow-maintenance-checklist
- 60X Custom Strings – When to Replace Bow Strings: https://60xcustomstrings.com/blog/when-to-replace-bow-strings
- Grand View Outdoors – when to replace strings and cables: https://www.grandviewoutdoors.com/bowhunting/when-to-replace-bowstrings-and-cables
- Bear Archery – Maintaining Your Compound Bow: https://www.beararchery.com/blogs/base-camp-archery-blog/maintaining-your-bow
- Bow International – winter archery maintenance: https://www.bow-international.com/features/top-tips-for-winter-archery-maintenance/
- Southampton Uni Archery – Equipment Troubleshooting: https://archery.susu.org/archery-info/maintenance/equipment-troubleshooting/
- 4komma5 – Bedienungsanleitung Compoundbogen: https://www.4komma5.de/Bedienungsanleitungen/Bedienungsanleitung-Compoundbogen.pdf
- Frankonia – Bedienungsanleitung (Bogen): https://www.frankonia.de/images/multimedia/pdf/p2007906-bedienungsanleitung-de-DE.pdf
