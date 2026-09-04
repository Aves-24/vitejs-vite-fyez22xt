// [C17] Testy reguł Firestore na emulatorze — model zagrożeń T1-T7 + RODO.
// Uruchamianie: npm run test:rules (firebase emulators:exec + node --test).
// Wymaga Javy (emulator). CI: .github/workflows/ci.yml.
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField } from 'firebase/firestore';

/** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment} */
let env;

const ADMIN_EMAIL = 'info@aves-24.de';
const DAY = 24 * 60 * 60 * 1000;

// Konteksty (uid + claims)
const alice = () => env.authenticatedContext('alice').firestore();
const bob = () => env.authenticatedContext('bob').firestore();
const coach1 = () => env.authenticatedContext('coach1').firestore();
const admin = () =>
  env.authenticatedContext('admin-uid', { email: ADMIN_EMAIL, email_verified: true }).firestore();
const adminUnverified = () =>
  env.authenticatedContext('admin-uid2', { email: ADMIN_EMAIL, email_verified: false }).firestore();
const unauth = () => env.unauthenticatedContext().firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'grotx-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  // Dane bazowe (zapis z pominięciem reguł)
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/alice'), {
      displayName: 'Alice', coaches: ['coach1'], students: [],
    });
    await setDoc(doc(db, 'users/bob'), {
      displayName: 'Bob', coaches: [], students: [],
    });
    await setDoc(doc(db, 'users/coach1'), {
      displayName: 'Coach', coaches: [], students: ['alice'],
    });
    await setDoc(doc(db, 'users/alice/sessions/s1'), {
      note: 'trening', coachNote: '', score: 280,
    });
    await setDoc(doc(db, 'profiles_public/alice'), {
      displayName: 'Alice', club: 'KS Grot', country: 'DE', level: 5,
    });
    await setDoc(doc(db, 'world_stats/alice'), {
      worldWins: 3, worldLosses: 1, worldXP: 250,
    });
    await setDoc(doc(db, 'world_queue/alice'), { userId: 'alice' });
    await setDoc(doc(db, 'battles/b1'), {
      hostId: 'alice', participants: ['alice', 'bob'],
      pendingInvites: [], status: 'ACTIVE', liveScores: {},
    });
    await setDoc(doc(db, 'clubs/c1'), { name: 'KS Grot', city: 'Krefeld' });
  });
});

// ─── T1: Eskalacja uprawnień ─────────────────────────────────────

test('T1: user nie nada sobie isPremium', async () => {
  await assertFails(updateDoc(doc(alice(), 'users/alice'), { isPremium: true }));
});

test('T1: user nie zmieni swojej roli', async () => {
  await assertFails(updateDoc(doc(alice(), 'users/alice'), { role: 'admin' }));
});

test('T1: create konta z polem chronionym (coachLimit) odrzucone', async () => {
  await assertFails(setDoc(doc(bob(), 'users/newbie'), { coachLimit: 99 }));
});

test('T1: trialEndsAt do 31 dni przechodzi przy create', async () => {
  await env.clearFirestore();
  await assertSucceeds(setDoc(doc(alice(), 'users/alice'), {
    displayName: 'Alice', trialEndsAt: Date.now() + 7 * DAY,
  }));
});

test('T1: trialEndsAt 60 dni odrzucone', async () => {
  await env.clearFirestore();
  await assertFails(setDoc(doc(alice(), 'users/alice'), {
    displayName: 'Alice', trialEndsAt: Date.now() + 60 * DAY,
  }));
});

test('T1: raz ustawionego trialEndsAt nie można przedłużyć', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'users/alice'), { trialEndsAt: Date.now() + 1 * DAY });
  });
  await assertFails(updateDoc(doc(alice(), 'users/alice'), { trialEndsAt: Date.now() + 30 * DAY }));
});

// ─── T2: Podszywanie się pod relację trener↔uczeń ────────────────

test('T2: uczeń nie doda sobie trenera bez zaproszenia', async () => {
  await assertFails(updateDoc(doc(bob(), 'users/bob'), { coaches: ['coach1'] }));
});

test('T2: z zaproszeniem uczeń dodaje trenera (Path C)', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'coachInvites/coach1_bob'), {
      coachId: 'coach1', studentId: 'bob',
    });
  });
  await assertSucceeds(updateDoc(doc(bob(), 'users/bob'), { coaches: ['coach1'] }));
});

test('T2: obcy nie wpisze się na students[] trenera bez zaproszenia (Path E)', async () => {
  await assertFails(updateDoc(doc(bob(), 'users/coach1'), { students: ['alice', 'bob'] }));
});

test('T2: nie można podrobić cudzego zaproszenia (coachId != auth)', async () => {
  await assertFails(setDoc(doc(bob(), 'coachInvites/coach1_bob'), {
    coachId: 'coach1', studentId: 'bob',
  }));
});

// ─── T3: Eksploracja cudzych danych ──────────────────────────────

test('T3: obcy nie przeczyta cudzego profilu users/', async () => {
  await assertFails(getDoc(doc(bob(), 'users/alice')));
});

test('T3: trener czyta profil swojego ucznia', async () => {
  await assertSucceeds(getDoc(doc(coach1(), 'users/alice')));
});

test('T3: obcy nie przeczyta cudzej sesji treningowej', async () => {
  await assertFails(getDoc(doc(bob(), 'users/alice/sessions/s1')));
});

test('T3: trener czyta sesję ucznia', async () => {
  await assertSucceeds(getDoc(doc(coach1(), 'users/alice/sessions/s1')));
});

test('T3: world_queue prywatne (obcy odrzucony)', async () => {
  await assertFails(getDoc(doc(bob(), 'world_queue/alice')));
});

test('T3: profiles_public czytelne dla zalogowanych', async () => {
  await assertSucceeds(getDoc(doc(bob(), 'profiles_public/alice')));
});

test('T3: profiles_public NIE dla niezalogowanych', async () => {
  await assertFails(getDoc(doc(unauth(), 'profiles_public/alice')));
});

// ─── T4: Oszustwa rankingowe ─────────────────────────────────────

test('T4: world_stats create ograniczone (max 1 win/loss, 100 XP)', async () => {
  await assertFails(setDoc(doc(bob(), 'world_stats/bob'), {
    worldWins: 50, worldLosses: 0, worldXP: 9999,
  }));
  // Pierwsza bitwa tworzy dokument od razu z wynikiem — musi przejść
  await assertSucceeds(setDoc(doc(bob(), 'world_stats/bob'), {
    userId: 'bob', displayName: 'Bob B.', clubName: 'KS Grot', country: 'DE',
    level: 3, worldWins: 1, worldLosses: 0, worldXP: 15,
  }));
});

test('T4: world_stats — obce pola odrzucone (hasOnly)', async () => {
  await assertFails(setDoc(doc(bob(), 'world_stats/bob'), {
    worldWins: 0, worldLosses: 0, worldXP: 0, email: 'leak@example.com',
  }));
  await assertFails(updateDoc(doc(alice(), 'world_stats/alice'), { hacked: true }));
});

test('T4: world_stats displayName > 80 znaków odrzucone', async () => {
  await assertFails(setDoc(doc(bob(), 'world_stats/bob'), {
    displayName: 'x'.repeat(81), worldWins: 0, worldLosses: 0, worldXP: 0,
  }));
});

test('T4: przyrost XP ograniczony do +100', async () => {
  await assertSucceeds(updateDoc(doc(alice(), 'world_stats/alice'), { worldXP: 350 }));
});

test('T4: skok XP o 101 odrzucony', async () => {
  await assertFails(updateDoc(doc(alice(), 'world_stats/alice'), { worldXP: 351 }));
});

test('T4: dekrementacja porażek odrzucona', async () => {
  await assertFails(updateDoc(doc(alice(), 'world_stats/alice'), { worldLosses: 0 }));
});

test('T4: nie można edytować cudzych world_stats', async () => {
  await assertFails(updateDoc(doc(bob(), 'world_stats/alice'), { worldXP: 251 }));
});

// ─── T5: Manipulacja battles ─────────────────────────────────────

test('T5: uczestnik aktualizuje WYŁĄCZNIE własny liveScore', async () => {
  await assertSucceeds(updateDoc(doc(bob(), 'battles/b1'), {
    liveScores: { bob: 28 },
  }));
});

test('T5: uczestnik nie nadpisze cudzego liveScore', async () => {
  await assertFails(updateDoc(doc(bob(), 'battles/b1'), {
    liveScores: { alice: 0 },
  }));
});

test('T5: nie-host nie zmieni statusu battle', async () => {
  await assertFails(updateDoc(doc(bob(), 'battles/b1'), { status: 'FINISHED' }));
});

test('T5: host ma pełną kontrolę nad swoim battle', async () => {
  await assertSucceeds(updateDoc(doc(alice(), 'battles/b1'), { status: 'FINISHED' }));
});

// ─── T6: Zapisy do cudzych subkolekcji ───────────────────────────

test('T6: obcy nie zapisze do cudzych sessions', async () => {
  await assertFails(setDoc(doc(bob(), 'users/alice/sessions/hack'), { note: 'spam' }));
});

test('T6: właściciel zapisuje własną sesję', async () => {
  await assertSucceeds(setDoc(doc(alice(), 'users/alice/sessions/s2'), { note: 'ok' }));
});

test('T6: trener dopisze coachNote (limit 500 znaków)', async () => {
  await assertSucceeds(updateDoc(doc(coach1(), 'users/alice/sessions/s1'), {
    coachNote: 'dobra praca', coachEditCount: 1,
  }));
  await assertFails(updateDoc(doc(coach1(), 'users/alice/sessions/s1'), {
    coachNote: 'x'.repeat(501), coachEditCount: 2,
  }));
});

test('T6: trener nie ruszy nut treningowych ucznia (note)', async () => {
  await assertFails(updateDoc(doc(coach1(), 'users/alice/sessions/s1'), {
    note: 'przejmuje notatke',
  }));
});

test('T6: privateNotes niedostępne dla trenera (by design)', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/alice/privateNotes/p1'), { text: 'sekret' });
  });
  await assertFails(getDoc(doc(coach1(), 'users/alice/privateNotes/p1')));
});

// ─── T7: Podszywanie się pod admina ──────────────────────────────

test('T7: zwykły user nie opublikuje ogłoszenia globalnego', async () => {
  await assertFails(setDoc(doc(bob(), 'announcements/a1'), {
    type: 'global', title: 'fałszywka', authorId: 'bob',
  }));
});

test('T7: admin z weryfikowanym mailem publikuje ogłoszenie', async () => {
  await assertSucceeds(setDoc(doc(admin(), 'announcements/a2'), {
    type: 'global', title: 'oficjalne',
  }));
});

test('T7: admin BEZ email_verified odrzucony (ochrona przed rejestracją na cudzy mail)', async () => {
  await assertFails(setDoc(doc(adminUnverified(), 'announcements/a3'), {
    type: 'global', title: 'podszywka',
  }));
  await assertFails(updateDoc(doc(adminUnverified(), 'users/alice'), { isPremium: true }));
});

test('T7: zwykły user nie edytuje klubów', async () => {
  await assertFails(updateDoc(doc(bob(), 'clubs/c1'), { name: 'przejęty' }));
});

test('T7: default deny — nieznana kolekcja zablokowana', async () => {
  await assertFails(setDoc(doc(admin(), 'random_collection/x'), { a: 1 }));
});

// ─── RODO: eksport/usuwanie konta + profiles_public ──────────────

test('RODO: właściciel usuwa własny dokument users/ (art. 17)', async () => {
  await assertSucceeds(deleteDoc(doc(alice(), 'users/alice')));
});

test('RODO: właściciel usuwa własny world_stats', async () => {
  await assertSucceeds(deleteDoc(doc(alice(), 'world_stats/alice')));
});

test('RODO: obcy NIE usunie cudzego konta', async () => {
  await assertFails(deleteDoc(doc(bob(), 'users/alice')));
});

test('profiles_public: whitelist pól — dodatkowe pole odrzucone', async () => {
  await assertFails(setDoc(doc(alice(), 'profiles_public/alice'), {
    displayName: 'Alice', email: 'leak@example.com',
  }));
});

test('profiles_public: displayName > 80 znaków odrzucone', async () => {
  await assertFails(setDoc(doc(alice(), 'profiles_public/alice'), {
    displayName: 'x'.repeat(81),
  }));
});

test('profiles_public: tylko właściciel pisze swoje lustro', async () => {
  await assertFails(setDoc(doc(bob(), 'profiles_public/alice'), {
    displayName: 'podmieniony',
  }));
  await assertSucceeds(setDoc(doc(alice(), 'profiles_public/alice'), {
    displayName: 'Alice', club: 'KS Grot', country: 'DE', level: 6, updatedAt: Date.now(),
  }));
});

// ─── RODO C21: pola wrażliwe (email/birthDate/gender) poza users/{uid} ──

test('C21: private/profile — właściciel i admin czytają, trener w relacji NIE', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/alice/private/profile'), {
      birthDate: '2010-05-01', gender: 'K',
    });
  });
  await assertSucceeds(getDoc(doc(alice(), 'users/alice/private/profile')));
  await assertSucceeds(getDoc(doc(admin(), 'users/alice/private/profile')));
  await assertFails(getDoc(doc(coach1(), 'users/alice/private/profile')));
  await assertFails(getDoc(doc(bob(), 'users/alice/private/profile')));
});

test('C21: private/profile pisze tylko właściciel', async () => {
  await assertSucceeds(setDoc(doc(alice(), 'users/alice/private/profile'), {
    birthDate: '2010-05-01', gender: 'K',
  }));
  await assertFails(setDoc(doc(bob(), 'users/alice/private/profile'), {
    birthDate: '1900-01-01',
  }));
});

test('C21: nie można dodać email/birthDate/gender do users/{uid}', async () => {
  await assertFails(updateDoc(doc(alice(), 'users/alice'), { birthDate: '1990-01-01' }));
  await assertFails(updateDoc(doc(alice(), 'users/alice'), { email: 'x@y.z' }));
  await assertFails(updateDoc(doc(alice(), 'users/alice'), { gender: 'M' }));
});

test('C21: create users/{uid} z polem wrażliwym odrzucone', async () => {
  await env.clearFirestore();
  await assertFails(setDoc(doc(alice(), 'users/alice'), {
    displayName: 'Alice', email: 'a@b.c',
  }));
  await assertFails(setDoc(doc(alice(), 'users/alice'), {
    displayName: 'Alice', birthDate: '1990-01-01',
  }));
});

test('C21: migracja — usunięcie pól wrażliwych + zapis ageCategory przechodzi', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'users/alice'), {
      email: 'old@x.de', birthDate: '2000-01-01', gender: 'K',
    });
  });
  await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), {
    email: deleteField(), birthDate: deleteField(), gender: deleteField(),
    ageCategory: 'Damen',
  }));
});

test('C21: legacy doc — zapis profilu NIE dotykający pól wrażliwych przechodzi', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'users/alice'), { birthDate: '2000-01-01' });
  });
  await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), { clubName: 'Nowy Klub' }));
  // ...ale zmiana wartości pola wrażliwego — odrzucona
  await assertFails(updateDoc(doc(alice(), 'users/alice'), { birthDate: '1999-12-31' }));
});

// ─── RODO art. 8: zgoda opiekuna (parentalConsent) ──────────────

test('C22: parentalConsent + e-mail opiekuna w private/profile — obcy/trener nie czyta', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/alice/private/profile'), {
      birthDate: '2014-03-01',
      parentalConsent: { version: '1.0', acceptedAt: Date.now(),
        guardianEmail: 'parent@example.com', birthDateAtConsent: '2014-03-01' },
    });
  });
  await assertSucceeds(getDoc(doc(alice(), 'users/alice/private/profile')));
  await assertFails(getDoc(doc(coach1(), 'users/alice/private/profile')));
  await assertFails(getDoc(doc(bob(), 'users/alice/private/profile')));
});

test('C22: właściciel zapisuje własną zgodę opiekuna', async () => {
  await assertSucceeds(setDoc(doc(alice(), 'users/alice/private/profile'), {
    parentalConsent: { version: '1.0', acceptedAt: Date.now(),
      guardianEmail: 'parent@example.com', birthDateAtConsent: '2014-03-01' },
  }, { merge: true }));
  // obcy nie zapisze zgody w cudzym dokumencie
  await assertFails(setDoc(doc(bob(), 'users/alice/private/profile'), {
    parentalConsent: { version: '1.0', acceptedAt: Date.now(),
      guardianEmail: 'attacker@example.com', birthDateAtConsent: '2014-03-01' },
  }, { merge: true }));
});

// ---------------------------------------------------------------------------
// [ZESTAWY] Limit zestawów sprzętowych: 1 FREE / 4 PRO.
// UI już go pilnuje, ale UI nie jest granicą bezpieczeństwa — bez reguły
// każdy wpisze sobie dowolną liczbę zestawów z konsoli i ominie płatną różnicę
// między FREE a PRO.
// ---------------------------------------------------------------------------

const mkSetups = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: i === 0 ? 'default' : `setup-${i}`,
    name: `Zestaw ${i + 1}`,
    discipline: 'Klasyczny (Recurve)',
  }));

/** Podnosi konto do PRO z pominięciem reguł (isPremium to pole chronione). */
const makePremium = async (uid) => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${uid}`), { isPremium: true }, { merge: true });
  });
};

test('ZESTAWY: FREE zapisuje 1 zestaw', async () => {
  await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), {
    setups: mkSetups(1), activeSetupId: 'default',
  }));
});

test('ZESTAWY: FREE NIE zapisze 2 zestawów', async () => {
  await assertFails(updateDoc(doc(alice(), 'users/alice'), {
    setups: mkSetups(2), activeSetupId: 'default',
  }));
});

test('ZESTAWY: PRO zapisuje 4 zestawy', async () => {
  await makePremium('alice');
  await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), {
    setups: mkSetups(4), activeSetupId: 'default',
  }));
});

test('ZESTAWY: PRO NIE zapisze 5 zestawów', async () => {
  await makePremium('alice');
  await assertFails(updateDoc(doc(alice(), 'users/alice'), {
    setups: mkSetups(5), activeSetupId: 'default',
  }));
});

test('ZESTAWY: FREE nie obejdzie limitu, podnosząc sobie isPremium w tym samym zapisie', async () => {
  // Gdyby limit czytał `request.resource`, ten zapis by przeszedł.
  await assertFails(updateDoc(doc(alice(), 'users/alice'), {
    isPremium: true, setups: mkSetups(4),
  }));
});

test('ZESTAWY: setups musi być listą, activeSetupId stringiem', async () => {
  await assertFails(updateDoc(doc(alice(), 'users/alice'), {
    setups: { nie: 'lista' },
  }));
  await assertFails(updateDoc(doc(alice(), 'users/alice'), {
    setups: mkSetups(1), activeSetupId: 42,
  }));
});

test('ZESTAWY: zapis bez pola setups działa jak dotąd', async () => {
  // Regresja: walidacja nie może blokować zwykłej edycji profilu.
  await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), { displayName: 'Alicja' }));
});

test('ZESTAWY: wygasniecie PRO nie zamurowuje konta z 4 zestawami', async () => {
  // Konto bylo PRO i ma 4 zestawy, potem spada na FREE (limit 1).
  // `setups` jedzie w kazdym merge'u z Ustawien, wiec bez furtki na TRZYMANIE
  // nadmiaru uzytkownik nie zapisalby nawet wlasnego nazwiska.
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/alice'),
      { setups: mkSetups(4), isPremium: false }, { merge: true });
  });

  // Trzymanie nadmiaru — wolno.
  await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), {
    setups: mkSetups(4), displayName: 'Alicja',
  }));
  // Zmniejszanie — wolno.
  await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), { setups: mkSetups(2) }));
  // Przybywanie ponad limit — nadal zakazane.
  await assertFails(updateDoc(doc(alice(), 'users/alice'), { setups: mkSetups(5) }));
});

// ---------------------------------------------------------------------------
// [C25] Limit własnych dystansów: 2 FREE / 15 PRO, ponad 10 standardowych.
// W regułach zapisany jako sufit CAŁEJ listy (12 / 25) — język reguł nie ma
// pętli ani filtrowania, więc nie policzy, ile wpisów jest „własnych".
// Wychodzi na to samo, bo klient zawsze odtwarza komplet dziesięciu
// standardowych (`rebuildMasterList` w src/config/distances.ts).
// Bez tej reguły limit pilnowałoby wyłącznie UI, a UI nie jest granicą
// bezpieczeństwa — własne dystanse są funkcją płatną.
// ---------------------------------------------------------------------------

// Lustro MASTER_DISTANCES z src/config/distances.ts — tu tylko po to,
// żeby wpisy testowe miały realne id (`d_18m`), a nie wymyślone.
const MASTER = ['18m', '20m', '25m', '30m', '35m', '40m', '50m', '60m', '70m', '90m'];

/** n wpisów w kształcie, w jakim zapisuje je aplikacja. */
const mkDistances = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: i < 10 ? `d_${MASTER[i]}` : `d_custom${i}`,
    m: i < 10 ? MASTER[i] : `${100 + i}m`,
    active: i === 0,
    targetType: '122cm',
    sightExtension: '', sightHeight: '', sightSide: '', sightMark: '',
  }));

test('C25: FREE zapisuje 12 dystansów (10 standardowych + 2 własne)', async () => {
  await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), {
    userDistances: mkDistances(12),
  }));
});

test('C25: FREE NIE zapisze 13 dystansów', async () => {
  await assertFails(updateDoc(doc(alice(), 'users/alice'), {
    userDistances: mkDistances(13),
  }));
});

test('C25: PRO zapisuje 25 dystansów (10 standardowych + 15 własnych)', async () => {
  await makePremium('alice');
  await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), {
    userDistances: mkDistances(25),
  }));
});

test('C25: PRO NIE zapisze 26 dystansów', async () => {
  await makePremium('alice');
  await assertFails(updateDoc(doc(alice(), 'users/alice'), {
    userDistances: mkDistances(26),
  }));
});

test('C25: FREE nie obejdzie limitu, podnosząc sobie isPremium w tym samym zapisie', async () => {
  // Limit czyta `resource` (stan PRZED zapisem), nie `request.resource` —
  // gdyby czytał to drugie, ten zapis by przeszedł.
  await assertFails(updateDoc(doc(alice(), 'users/alice'), {
    isPremium: true, userDistances: mkDistances(25),
  }));
});

test('C25: userDistances musi być listą', async () => {
  await assertFails(updateDoc(doc(alice(), 'users/alice'), {
    userDistances: { nie: 'lista' },
  }));
});

test('C25: zapis bez pola userDistances działa jak dotąd', async () => {
  // Regresja: walidacja nie może blokować zwykłej edycji profilu.
  await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), { displayName: 'Alicja' }));
});

test('C25: nowe konto zakłada się z 12 dystansami, ale nie z 13', async () => {
  // Przy create limit to zawsze 12: `isPremium` jest polem chronionym,
  // więc nowy dokument nie może przyjść jako PRO.
  const newbie = () => env.authenticatedContext('newbie').firestore();
  await assertFails(setDoc(doc(newbie(), 'users/newbie'), {
    displayName: 'Nowy', userDistances: mkDistances(13),
  }));
  await assertSucceeds(setDoc(doc(newbie(), 'users/newbie'), {
    displayName: 'Nowy', userDistances: mkDistances(12),
  }));
});

test('C25: wygasniecie PRO nie zamurowuje konta z 25 dystansami', async () => {
  // Konto bylo PRO i ma 25 dystansow, potem spada na FREE (limit 12).
  // `userDistances` jedzie w kazdym merge'u z Ustawien, wiec bez furtki na
  // TRZYMANIE nadmiaru uzytkownik nie zapisalby nawet wlasnego nazwiska.
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/alice'),
      { userDistances: mkDistances(25), isPremium: false }, { merge: true });
  });

  // Trzymanie nadmiaru — wolno.
  await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), {
    userDistances: mkDistances(25), displayName: 'Alicja',
  }));
  // Zmniejszanie — wolno.
  await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), {
    userDistances: mkDistances(14),
  }));
  // Przybywanie ponad stan sprzed zapisu — nadal zakazane.
  await assertFails(updateDoc(doc(alice(), 'users/alice'), {
    userDistances: mkDistances(26),
  }));
});
