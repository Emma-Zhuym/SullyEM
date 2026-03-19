/**
 * Service Worker: Background Keep-Alive + Proactive Timer
 *
 * A) Keep-alive: prevent browser from suspending during long AI fetch requests
 * B) Proactive timer: periodically notify the main thread to trigger an AI message
 *    (the main thread handles the actual API call via normal triggerAI flow)
 */

const PING_INTERVAL = 15_000;
const MAX_ALIVE_MS = 5 * 60_000;

// ─── Keep-Alive ───
let pingTimer = null;
let keepAliveStartedAt = 0;

function stopKeepAlive() {
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  keepAliveStartedAt = 0;
}

function startKeepAlive() {
  stopKeepAlive();
  keepAliveStartedAt = Date.now();
  pingTimer = setInterval(() => {
    if (Date.now() - keepAliveStartedAt > MAX_ALIVE_MS) {
      console.log('[SW] Keep-alive auto-stopped (max duration)');
      stopKeepAlive();
      return;
    }
    self.registration.active && self.registration.active.postMessage({ type: 'ping' });
  }, PING_INTERVAL);
}

// ─── Proactive Timer ───
// SW only manages the timer; it does NOT call AI APIs or access DB.
// On each tick it posts 'proactive-trigger' to all open clients.
// The main thread handles the full triggerAI flow with proper context.

let proactiveTimer = null;
let proactiveIntervalMs = 0;
let proactiveCharId = null;

async function notifyClients(data) {
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) {
    client.postMessage(data);
  }
}

function fireProactiveTrigger() {
  console.log('[SW] Proactive trigger fired for', proactiveCharId);
  notifyClients({ type: 'proactive-trigger', charId: proactiveCharId });
}

function startProactive(config) {
  stopProactive();
  proactiveCharId = config.charId;
  proactiveIntervalMs = config.intervalMs;

  console.log(`[SW] Proactive timer started: ${config.charId}, every ${config.intervalMs / 60000}min`);

  proactiveTimer = setInterval(fireProactiveTrigger, config.intervalMs);

  // Keep SW alive while proactive is running
  if (!pingTimer) startKeepAlive();
}

function stopProactive() {
  if (proactiveTimer) {
    clearInterval(proactiveTimer);
    proactiveTimer = null;
  }
  proactiveCharId = null;
  proactiveIntervalMs = 0;
}

// ─── Message handler ───
self.addEventListener('message', (event) => {
  const { type } = event.data || {};

  switch (type) {
    case 'keepalive-start':
      startKeepAlive();
      break;
    case 'keepalive-stop':
      stopKeepAlive();
      break;
    case 'proactive-start':
      startProactive(event.data.config);
      break;
    case 'proactive-stop':
      stopProactive();
      break;
  }
});

// ─── Lifecycle ───
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
