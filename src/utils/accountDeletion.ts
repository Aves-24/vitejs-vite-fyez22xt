// [RODO] Znacznik „trwa usuwanie konta”. Między skasowaniem dokumentu
// users/{uid} a deleteUser() nasłuch profilu w App.tsx widział brak dokumentu
// i próbował założyć profil od nowa (jak dla świeżego konta). Reguły to
// odrzucały, ale w konsoli/Sentry zostawał błąd PERMISSION_DENIED — a gdyby
// reguły kiedyś to puściły, po usunięciu konta zostałby „zombie” profil.
// Wykryte testem e2e 2026-11-05.
// Znacznik trzyma uid — nowe konto założone potem w tej samej karcie
// (inny uid) normalnie dostaje swój profil.
let deletingUid: string | null = null;

export const markAccountDeletion = (uid: string | null) => { deletingUid = uid; };
export const isAccountDeletionInProgress = (uid: string) => deletingUid === uid;
