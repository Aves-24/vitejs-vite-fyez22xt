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
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

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

test('T4: world_stats create tylko z zerami', async () => {
  await assertFails(setDoc(doc(bob(), 'world_stats/bob'), {
    worldWins: 50, worldLosses: 0, worldXP: 9999,
  }));
  await assertSucceeds(setDoc(doc(bob(), 'world_stats/bob'), {
    worldWins: 0, worldLosses: 0, worldXP: 0,
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
