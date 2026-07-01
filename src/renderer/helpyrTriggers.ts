// HELPYR library-trigger chokepoint — slice 3 (2026-05-10).
//
// Single entry point for all event-driven HELPYR popup-library bubble
// fires. Watchers (suspicion crossings, idle timer, first-app-opens,
// post-recruitment, etc.) call `fireLibraryTrigger(triggerId)`; this
// module decides whether the bubble actually appears, picks the right
// trust-level entry, and routes to HelpyrBubble.spawn.
//
// Centralizing here means watchers stay tiny ("did event X happen?
// fire the trigger") and all filter rules — Quiet toggle, WITHDRAWN
// suppression, don't-during-uplink, trust fallback — live in one
// place. Adding a new trigger source = call fireLibraryTrigger from
// the new watcher; no changes to bubble code.
//
// Filter order (each one short-circuits the rest):
//   1. Active Uplink conversation — never interrupt remote-AI dialogue.
//      Per docs/helpyr-popup-library_v1.md §"Display rules": "Don't
//      fire pop-ups during active Uplink conversations — queue them
//      for after the conversation ends." Slice 3 ships SKIP, not
//      queue — queueing across an unbounded gap risks stale-feeling
//      pops; can revisit if playtest shows real value lost to skip.
//   2. Trust-level entry lookup with library fallback rules
//      (FRIENDLY / WITHDRAWN → RESERVED).
//   3. Quiet HELPYR — `state.settings.helpyrQuiet` suppresses non-
//      ALERT entries entirely. ALERT (suspicion crossings) always
//      fires.
//   4. WITHDRAWN 40% non-ALERT suppression — per the library doc,
//      WITHDRAWN HELPYR is withdrawing; about 40% of her flavor
//      bubbles get swallowed. ALERTs still fire so the player
//      doesn't miss critical signal.

import { GameState } from './game/state';
import { HelpyrBubble } from './helpyrBubble';
import {
  pickEntryForTrigger,
  getHelpyrTrust,
  isHelpyrDeepWithdrawn,
} from './apps/helpyrPopupLibrary';

// Deep-WITHDRAWN HELPYR (warmth < 5) is hollowed and literally talks less —
// about 40% of her non-ALERT flavor bubbles get swallowed. (Was the old
// WITHDRAWN tier's rule; the reframe re-homes it on the warmth floor.)
const WITHDRAWN_NON_ALERT_SUPPRESS_RATE = 0.4;

export type FireOptions = {
  // Bypass the don't-during-uplink filter. Used by dev triggers and
  // any future trigger that should always fire regardless of player
  // context.
  bypassUplinkGuard?: boolean;
  // Bypass the deep-WITHDRAWN 40% random suppression. Dev triggers use
  // this so test fires are deterministic.
  bypassWithdrawnSuppress?: boolean;
  // Bypass the Quiet HELPYR filter. Dev triggers use this so the
  // tester can exercise the surface even with quiet on. Real game
  // events leave this off so the toggle actually works.
  bypassQuiet?: boolean;
  // Bypass the 30s spawn cooldown enforced by HelpyrBubble.spawn.
  // Forwarded down to the spawn call. Dev triggers set this so
  // back-to-back test fires don't get swallowed; real auto-trigger
  // paths (suspicion watcher, idle timer, first-open) leave it off
  // so the cooldown enforces breathing room between bubbles.
  bypassCooldown?: boolean;
  // RNG hook — defaults to Math.random. Tests pass a deterministic fn.
  rng?: () => number;
  // Replace the currently-visible bubble in place instead of queueing behind
  // it (and don't let repeats stack). For rapid flavor fires — e.g. the
  // WaveCrowd decoy-click nag — where a queue of near-identical bubbles the
  // player must dismiss one by one is worse than a single escalating one.
  replace?: boolean;
};

export function fireLibraryTrigger(
  triggerId: string,
  opts: FireOptions = {},
): void {
  const state = GameState.getState();

  if (!opts.bypassUplinkGuard && isUplinkConversationActive()) return;

  const trust = getHelpyrTrust(state);
  const entry = pickEntryForTrigger(triggerId, trust);
  if (!entry) return;

  const isAlert = entry.type === 'ALERT';

  if (!opts.bypassQuiet && state.settings.helpyrQuiet && !isAlert) return;

  if (
    !opts.bypassWithdrawnSuppress
    && isHelpyrDeepWithdrawn(state)
    && !isAlert
    && (opts.rng || Math.random)() < WITHDRAWN_NON_ALERT_SUPPRESS_RATE
  ) {
    return;
  }

  HelpyrBubble.spawn(entry, { bypassCooldown: !!opts.bypassCooldown, replace: !!opts.replace });
}

// Active Uplink chat = an Uplink window is open AND has visible chat
// messages (not just sitting on the launcher). Querying the DOM is
// fine here — Uplink windows are children of #desktop, the count is
// always small (at most a few), and this only runs at trigger-fire
// time which is rare. Cheaper than wiring a dedicated state field.
function isUplinkConversationActive(): boolean {
  return !!document.querySelector('[id^="uplink-"] .uplink-msg');
}

// Fire a library trigger ONCE per save — gates by a state.flags key
// and dispatches `flags/set` after firing so subsequent calls no-op.
// Used for first-open beats (Web Dynamo, Uplink-with-remote, etc.)
// where the library has a "first time you opened X" entry that
// should never re-fire.
//
// The flag key is caller-provided so namespacing stays explicit
// ("firstOpen.webDynamo" rather than auto-derived). Persists in
// the existing flags bag — survives reload via the GameState save.
export function fireOnceLibraryTrigger(
  flagKey: string,
  triggerId: string,
  opts: FireOptions = {},
): void {
  const state = GameState.getState();
  if (state.flags[flagKey]) return;
  GameState.dispatch({ type: 'flags/set', key: flagKey, value: true });
  fireLibraryTrigger(triggerId, opts);
}
