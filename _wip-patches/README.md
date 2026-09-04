# Porzucona robota z worktree'ow agenta

Zrzucone 2026-09-04 przed sprzataniem `.claude/worktrees/`.
Same worktree'e mozna kasowac — tu jest wszystko, co w nich bylo niezacommitowane.

**To NIE sa gotowe latki do wklejenia.** Kazda siedzi 148-205 commitow za `main`,
wiec `git apply` sie wywali. Traktowac jak notatki: przeczytac pomysl,
napisac na nowo na aktualnym kodzie.

| plik | baza | za main | co rusza |
|---|---|---|---|
| `bold-liskov-6ddb2a.patch` | `5f0e7e9` | 163 | `CoachDashboardView` — kamera QR na iOS Safari |
| `ecstatic-brahmagupta-f71ffe.patch` | `a88ceec` | 148 | `ProfileWizard` + tlumaczenia x3 |
| `silly-babbage-04680f.patch` | `f89bb69` | 191 | `lazyWithRetry` |
| `thirsty-robinson-960b2f.patch` | `a88ceec` | 148 | same tlumaczenia x3 |
| `zealous-pascal-cee9e0.patch` | `91ef8a6` | 205 | `ScoringView`, `StatsView` + tlumaczenia x3 |

## Jedyna rzecz warta uwagi

`bold-liskov` — obsluga kamery przy skanowaniu QR na iOS Safari:
enumeracja kamer i wybor tylnej po etykiecie zamiast `facingMode: "environment"`
(ktore na iOS rzuca `OverconstrainedError`), plus straznik `isSecureContext`.

Stan `main` na 2026-09-04: ma juz `getCameras` i `facingMode`, **nie ma**
`isSecureContext` ani wyboru kamery po etykiecie. Czyli `main` poszedl wlasna
droga, ale straznik bezpiecznego kontekstu nadal moze byc wart doniesienia.

Patche z samymi tlumaczeniami sa najpewniej martwe — slownik przeszedl
1 wrzesnia pelna przebudowe terminologii w 3 jezykach.

## Co bylo puste

`competent-mclean`, `distracted-galileo`, `sweet-chandrasekhar`,
`suspicious-beaver` — tylko `.claude/settings.local.json`, nic merytorycznego.
`modest-blackburn`, `sweet-tereshkova`, `xenodochial-driscoll` — czyste.
