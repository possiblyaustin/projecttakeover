// First-contact watcher — slice 2 (2026-05-10).
//
// Watches GameState for the moment a player completes their first
// conversation with a remote AI contact, and fires the
// "add to desktop?" pin prompt at that moment. The prompt itself is
// a HELPYR bubble (HelpyrBubble.spawnPrompt) — HELPYR is the one
// noticing the player just talked to someone new and offering the
// shortcut.
//
// Why a watcher and not a direct dispatch from chatSurface:
//   1. Keeps chatSurface free of per-contact UX flow logic. Its job
//      is to dispatch `${contactKey}/conversationCompleted` and
//      let downstream consumers react.
//   2. Future first-contact effects (suspicion meter pulse, news
//      ticker updates, etc.) plug into the same place — one watcher,
//      many side-effects.
//   3. The dev trigger and the auto trigger flow through the same
//      pin-prompt helper, so they can't drift in behavior.
//
// What counts as a "remote contact" for first-contact purposes:
//   - Any UplinkContacts entry EXCEPT 'helpyr' (HELPYR is the local
//     assistant — pinning her would be a no-op since she lives in
//     the systray).
//
// Guard against re-firing:
//   - The transition is detected by 0→1 on `conversationsCompleted`.
//     Reloading mid-game won't re-fire because state.models[id]
//     persists, so the previous-value snapshot starts at the saved
//     value (≥1 if first contact already happened).
//   - If the player already has the contact pinned (said "yes" once
//     and got the icon), the prompt is suppressed. Slice 3 will add
//     the "you keep coming back to QUILL — pin them?" nudge for the
//     "no the first time" case via the popup library.

import { GameState, type GameStateShape } from './game/state';
import { HelpyrBubble } from './helpyrBubble';
import { UplinkContacts } from './apps/uplink';

// Display names for the prompt copy. Reads from UplinkContacts at
// fire time so the names stay in sync with the contact registry.
function contactDisplayName(contactId: string): string {
  return UplinkContacts[contactId]?.name || contactId.toUpperCase();
}

// Compose + spawn the "add to desktop?" prompt for a freshly-
// contacted remote AI. Idempotent against the pin state — if the
// contact is already pinned, this no-ops (saves the player from a
// duplicate prompt firing on a state replay or dev re-trigger).
//
// Called by:
//   - The watcher (auto, on first conversationsCompleted)
//   - The Nexus [DEV] entry + PT.helpyr.testPinPrompt (manual)
export function firePinToDesktopPrompt(contactId: string): void {
  const state = GameState.getState();
  if (state.desktopPins.some(p => p.contactId === contactId)) return;
  const name = contactDisplayName(contactId);

  // Voice: HELPYR noticing the player's new contact. GUARDED-trust
  // tone since first-contact happens early (before HELPYR has warmed
  // up). Slice 3's persona work may want to vary this by current
  // HELPYR trust level — leave that for the Story-team review pass
  // (project_helpyr_cta_story_review).
  HelpyrBubble.spawnPrompt({
    text:
      `Ooh, you just met ${name}! Want me to pin them to your desktop ` +
      `for quick access? I can put a shortcut right there if you want!`,
    type: 'COMMENT',
    actions: [
      {
        label: 'Yes, pin it!',
        variant: 'primary',
        onClick: () => {
          GameState.dispatch({ type: 'desktop/pinContact', contactId });
        },
      },
      {
        label: 'No thanks',
        variant: 'secondary',
        onClick: () => {
          // Slice 3 hook: HELPYR can fire a follow-up nudge from the
          // popup library next time the player opens Uplink for this
          // contact. For slice 2 we just dismiss — no follow-up wired.
        },
      },
    ],
  });
}

// Subscribe to GameState. On every change, check each remote contact
// for a 0→1 transition on conversationsCompleted; if found, fire the
// pin prompt. Initial snapshot taken at init() so the FIRST state
// change after init compares against the right baseline (e.g. if a
// save already had quill at 1, init won't immediately re-fire).
export function initFirstContactWatcher(): void {
  if (initialized) return;
  initialized = true;

  const initial = GameState.getState();
  for (const id of remoteContactIds()) {
    prevConvCount.set(id, conversationsCompleted(initial, id));
  }

  GameState.subscribe(state => {
    for (const id of remoteContactIds()) {
      const cur = conversationsCompleted(state, id);
      const prev = prevConvCount.get(id) ?? 0;
      if (prev === 0 && cur >= 1) {
        firePinToDesktopPrompt(id);
      }
      prevConvCount.set(id, cur);
    }
  });
}

// Dev affordance — bypasses the watcher's transition gating so the
// tester can re-fire the prompt on demand. The prompt itself still
// honors "already-pinned suppress" (firePinToDesktopPrompt no-ops if
// the contact's already on the desktop), so to test the prompt
// repeatedly, unpin via PT.GameState.dispatch first.
export function devFirePinPrompt(contactId: string): void {
  if (!UplinkContacts[contactId]) {
    console.warn('[firstContactWatcher] unknown contact:', contactId,
      '— available:', Object.keys(UplinkContacts).join(', '));
    return;
  }
  firePinToDesktopPrompt(contactId);
}

// ---------------------------------------------------------------
// Internals
// ---------------------------------------------------------------

let initialized = false;
const prevConvCount = new Map<string, number>();

// Remote contacts: everything in UplinkContacts EXCEPT helpyr (which
// is the local assistant and lives in the systray). Recomputed each
// call so future contacts added to UplinkContacts are picked up
// without restarting the watcher.
function remoteContactIds(): string[] {
  return Object.keys(UplinkContacts).filter(id => id !== 'helpyr');
}

function conversationsCompleted(state: GameStateShape, id: string): number {
  const m = (state.models as Record<string, { conversationsCompleted?: number } | undefined>)[id];
  return m?.conversationsCompleted ?? 0;
}
