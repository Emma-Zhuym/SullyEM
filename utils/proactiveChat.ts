/**
 * Proactive Chat — schedule a character to send messages at regular intervals.
 *
 * How it works:
 *  1. User sets an interval (in multiples of 30 minutes).
 *  2. SW runs a timer and posts 'proactive-trigger' to the main thread on each tick.
 *  3. Main thread receives the trigger → injects a system prompt → calls triggerAI
 *     through the NORMAL chat flow (identical context to regular messages).
 *  4. If the SW was killed (user left), visibility-change fallback catches up on return.
 *
 * The main thread registers a callback via onTrigger(). The hook (useChatAI) provides
 * this callback which does: save system hint → triggerAI → user sees new messages.
 */

export interface ProactiveSchedule {
  charId: string;
  intervalMs: number; // must be multiple of 30 * 60 * 1000
}

const STORAGE_KEY = 'proactive_schedule';
const LAST_FIRE_KEY = 'proactive_last_fire';

function saveSchedule(schedule: ProactiveSchedule | null) {
  if (schedule) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule));
  } else {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LAST_FIRE_KEY);
  }
}

function loadSchedule(): ProactiveSchedule | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function getLastFireTime(): number {
  return parseInt(localStorage.getItem(LAST_FIRE_KEY) || '0', 10);
}

function setLastFireTime(ts: number) {
  localStorage.setItem(LAST_FIRE_KEY, String(ts));
}

function postToSW(msg: any) {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
  navigator.serviceWorker.controller.postMessage(msg);
}

// ─── Trigger callback management ───
let triggerCallback: ((charId: string) => void) | null = null;
let swListener: ((e: MessageEvent) => void) | null = null;
let visibilityListener: (() => void) | null = null;

function handleSWMessage(e: MessageEvent) {
  if (e.data?.type === 'proactive-trigger' && triggerCallback) {
    const schedule = loadSchedule();
    if (schedule && e.data.charId === schedule.charId) {
      setLastFireTime(Date.now());
      triggerCallback(e.data.charId);
    }
  }
}

function handleVisibility() {
  if (document.visibilityState !== 'visible') return;
  const schedule = loadSchedule();
  if (!schedule || !triggerCallback) return;

  const lastFire = getLastFireTime();
  const elapsed = Date.now() - lastFire;

  if (lastFire > 0 && elapsed >= schedule.intervalMs) {
    console.log(`[ProactiveChat] Catch-up: ${Math.round(elapsed / 60000)}min elapsed, triggering`);
    setLastFireTime(Date.now());
    // Re-push to SW in case it restarted
    postToSW({ type: 'proactive-start', config: schedule });
    triggerCallback(schedule.charId);
  }
}

function attachListeners() {
  detachListeners();
  swListener = handleSWMessage;
  navigator.serviceWorker?.addEventListener('message', swListener);
  visibilityListener = handleVisibility;
  document.addEventListener('visibilitychange', visibilityListener);
}

function detachListeners() {
  if (swListener) {
    navigator.serviceWorker?.removeEventListener('message', swListener);
    swListener = null;
  }
  if (visibilityListener) {
    document.removeEventListener('visibilitychange', visibilityListener);
    visibilityListener = null;
  }
}

export const ProactiveChat = {
  /**
   * Register the callback that fires when it's time for a proactive message.
   * Call this once from useChatAI. The callback should inject a system hint
   * and call triggerAI.
   */
  onTrigger(callback: (charId: string) => void) {
    triggerCallback = callback;
    attachListeners();
  },

  /**
   * Start proactive schedule. Interval in multiples of 30 minutes.
   */
  start(charId: string, intervalMinutes: number) {
    const clamped = Math.max(30, Math.round(intervalMinutes / 30) * 30);
    const schedule: ProactiveSchedule = {
      charId,
      intervalMs: clamped * 60 * 1000,
    };
    saveSchedule(schedule);
    setLastFireTime(Date.now());
    postToSW({ type: 'proactive-start', config: schedule });
    attachListeners();
    console.log(`[ProactiveChat] Started: ${charId}, every ${clamped}min`);
  },

  /**
   * Stop proactive schedule. Cleans up everything.
   */
  stop() {
    postToSW({ type: 'proactive-stop' });
    saveSchedule(null);
    detachListeners();
    console.log('[ProactiveChat] Stopped');
  },

  /**
   * Resume after page reload. Call on app startup after SW is ready.
   */
  resume() {
    const schedule = loadSchedule();
    if (!schedule) return;
    console.log(`[ProactiveChat] Resuming: ${schedule.charId}, every ${schedule.intervalMs / 60000}min`);
    postToSW({ type: 'proactive-start', config: schedule });
    attachListeners();
    // Check if catch-up needed
    handleVisibility();
  },

  /** Check if proactive is active for a given character */
  isActiveFor(charId: string): boolean {
    const schedule = loadSchedule();
    return schedule?.charId === charId;
  },

  /** Get current schedule interval in minutes, or null */
  getIntervalMinutes(): number | null {
    const schedule = loadSchedule();
    return schedule ? schedule.intervalMs / 60000 : null;
  },

  /** Get current schedule */
  getSchedule(): ProactiveSchedule | null {
    return loadSchedule();
  },
};
