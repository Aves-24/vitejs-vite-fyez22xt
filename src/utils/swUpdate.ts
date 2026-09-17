// [C30] Nowa wersja: sprawdzana raz dziennie po 6:00, włączana dopiero kliknięciem „Odśwież".
const LAST_CHECK_KEY = 'grotX_swLastCheck';
const CHECK_HOUR = 6;
export const SW_UPDATE_EVENT = 'grotx:sw-update-ready';

let registration: ServiceWorkerRegistration | null = null;
let updateReady = false;

export const isUpdateReady = () => updateReady;

function markReady() {
  if (updateReady) return;
  updateReady = true;
  window.dispatchEvent(new Event(SW_UPDATE_EVENT));
}

// Ostatnia minięta 6:00 — dzisiejsza albo, przed 6:00, wczorajsza.
function lastCheckpoint(now: Date): number {
  const d = new Date(now);
  d.setHours(CHECK_HOUR, 0, 0, 0);
  if (now < d) d.setDate(d.getDate() - 1);
  return d.getTime();
}

function nextCheckpoint(now: Date): number {
  const d = new Date(now);
  d.setHours(CHECK_HOUR, 0, 0, 0);
  if (now >= d) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function readLastCheck(): number {
  try { return Number(localStorage.getItem(LAST_CHECK_KEY)) || 0; } catch { return 0; }
}

function checkIfDue() {
  if (!registration) return;
  const now = new Date();
  if (readLastCheck() >= lastCheckpoint(now)) return;
  try { localStorage.setItem(LAST_CHECK_KEY, String(now.getTime())); } catch { /* prywatne okno */ }
  registration.update().catch(() => { /* offline — spróbujemy przy następnej okazji */ });
}

function scheduleNextCheck() {
  const delay = nextCheckpoint(new Date()) - Date.now();
  setTimeout(() => { checkIfDue(); scheduleNextCheck(); }, delay + 1000);
}

function watchInstalling(worker: ServiceWorker | null) {
  if (!worker) return;
  worker.addEventListener('statechange', () => {
    // Bez kontrolera to pierwsza instalacja, a nie aktualizacja.
    if (worker.state === 'installed' && navigator.serviceWorker.controller) markReady();
  });
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      registration = reg;
      if (reg.waiting && navigator.serviceWorker.controller) markReady();
      watchInstalling(reg.installing);
      reg.addEventListener('updatefound', () => watchInstalling(reg.installing));

      checkIfDue();
      scheduleNextCheck();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkIfDue();
      });
    }).catch((err) => {
      console.warn('SW: rejestracja nieudana', err);
    });
  });
}

export function applyUpdate() {
  const waiting = registration?.waiting;
  if (!waiting) { window.location.reload(); return; }
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
  waiting.postMessage('SKIP_WAITING');
}
