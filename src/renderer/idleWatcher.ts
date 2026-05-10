// Idle / ambient timer — slice 3 (2026-05-10).
//
// Fires the library 'idle' trigger after the player has been
// inactive for IDLE_THRESHOLD_MS. "Inactive" = no mousemove, keydown,
// or click in the window. After firing, the timer resets — so the
// next idle bubble can fire IDLE_THRESHOLD_MS later if the player
// stays idle. The 30s spawn cooldown on HelpyrBubble keeps idle
// bubbles from stacking with other auto-triggers.
//
// IDLE_THRESHOLD_MS = 3 minutes per
// docs/helpyr-popup-library_v1.md §"Category 4: Idle / Ambient":
// "These fire when the player hasn't taken a meaningful action for
// 3+ minutes." Tunable per project_helpyr_bubble_balance — playtest
// will tell us if this is the right beat.
//
// Listeners use capture-phase + passive: true so we don't conflict
// with Cursor.ts mousemove handling and don't slow down the
// scrollers. Activity reset is a single timestamp write — cheap.

import { fireLibraryTrigger } from './helpyrTriggers';

const IDLE_THRESHOLD_MS = 3 * 60 * 1000; // 3 min
const POLL_INTERVAL_MS = 30 * 1000;       // check every 30s

let initialized = false;
let lastActivity = 0;
let pollTimer: number | null = null;

export function initIdleWatcher(): void {
  if (initialized) return;
  initialized = true;

  lastActivity = Date.now();
  const reset = () => { lastActivity = Date.now(); };
  // Capture phase — don't depend on event bubbling reaching window,
  // and don't get blocked if a deeper handler stops propagation.
  window.addEventListener('mousemove', reset, { capture: true, passive: true });
  window.addEventListener('keydown', reset, { capture: true, passive: true });
  window.addEventListener('click', reset, { capture: true, passive: true });
  // Touch covers Deck-touchscreen scenarios.
  window.addEventListener('touchstart', reset, { capture: true, passive: true });

  schedulePoll();
}

function schedulePoll(): void {
  if (pollTimer !== null) window.clearTimeout(pollTimer);
  pollTimer = window.setTimeout(() => {
    pollTimer = null;
    if (Date.now() - lastActivity >= IDLE_THRESHOLD_MS) {
      fireLibraryTrigger('idle');
      // Reset so the next idle fire is another full threshold away.
      // Without this, the timer would re-fire every poll interval
      // while the player stays idle.
      lastActivity = Date.now();
    }
    schedulePoll();
  }, POLL_INTERVAL_MS);
}

// Dev affordance — force the idle trigger to fire immediately,
// without waiting 3 minutes. Bypasses cooldown so repeated test
// clicks aren't silently swallowed.
export function devFireIdleTrigger(): void {
  fireLibraryTrigger('idle', { bypassCooldown: true });
  lastActivity = Date.now();
}
