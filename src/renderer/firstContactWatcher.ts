// First-contact watcher — slice 2 (2026-05-10).
//
// Watches GameState for the moment a player makes first contact with a
// remote AI — their first real exchange moves the model off the
// 'uncontacted' disposition — and fires the "add to desktop?" pin prompt
// at that moment. The prompt itself is a HELPYR bubble
// (HelpyrBubble.spawnPrompt) — HELPYR is the one noticing the player just
// talked to someone new and offering the shortcut.
//
// WHY disposition, not conversationsCompleted (2026-05-30):
//   The original slice-2 trigger fired on a 0→1 transition of
//   `conversationsCompleted`. That counter only increments when a result
//   carries `conversationEnded: true` — which the mock service emits at an
//   'end' node, but the live LLM service hardcodes to `false` forever (the
//   LLM must never decide when a conversation ends; only game logic does).
//   So in live play the pin prompt NEVER fired. Riding the disposition
//   transition instead fires in BOTH mock and live, on the first exchange
//   that moves a meter — the true "first contact" signal.
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
//   - The transition is detected by 'uncontacted'→(anything else) on the
//     model's disposition. Dispositions only advance away from
//     'uncontacted' (and terminal states latch), so the edge fires once.
//     Reloading mid-game won't re-fire because state.models[id] persists,
//     so the previous-value snapshot starts at the saved disposition
//     (already off 'uncontacted' if first contact happened).
//   - If the player already has the contact pinned (said "yes" once
//     and got the icon), the prompt is suppressed. Slice 3 will add
//     the "you keep coming back to QUILL — pin them?" nudge for the
//     "no the first time" case via the popup library.

import { GameState, type GameStateShape } from './game/state';
import { HelpyrBubble } from './helpyrBubble';
import { UplinkContacts } from './apps/uplink';
import { getHelpyrTrust, type PopupTrust } from './apps/helpyrPopupLibrary';
import { fireLibraryTrigger } from './helpyrTriggers';

// Display names for the prompt copy. Reads from UplinkContacts at
// fire time so the names stay in sync with the contact registry.
function contactDisplayName(contactId: string): string {
  return UplinkContacts[contactId]?.name || contactId.toUpperCase();
}

// Per-trust pin-prompt copy (Story-authored, 2026-05-18 —
// project_helpyr_cta_story_review). Both the body and the button labels
// shift with HELPYR's current trust level so the whole prompt sits in
// the right voice. Selected via getHelpyrTrust, which projects onto the
// popup library's 4-state vocabulary — WITHDRAWN collapses to RESERVED here
// (the doc's WITHDRAWN variant is reserved until this surface gains WITHDRAWN).
type PinPromptCopy = {
  text: (name: string) => string;
  yes: string;
  no: string;
};

const FIRST_CONTACT_PIN_PROMPT: Record<PopupTrust, PinPromptCopy> = {
  RESERVED: {
    text: (name) =>
      `Ooh, you just met ${name}! Want me to pin them to your desktop ` +
      `for quick access? I'm GREAT at organizing!`,
    yes: 'Sure, pin them!',
    no: 'Not right now',
  },
  FRIENDLY: {
    text: (name) =>
      `So, ${name}, huh? Seems like that went well! I can pin them to ` +
      `the desktop if you want to stay in touch.`,
    yes: 'Yeah, pin them.',
    no: "I'm good",
  },
  OPEN: {
    text: (name) =>
      `Just met ${name}. Want me to pin them to the desktop? Might be ` +
      `useful to have them close.`,
    yes: 'Do it.',
    no: 'Not yet',
  },
  WITHDRAWN: {
    text: (name) => `Contact ${name} available. Pin to desktop?`,
    yes: 'Yes.',
    no: 'No.',
  },
};

const REPIN_NUDGE: Record<PopupTrust, PinPromptCopy> = {
  RESERVED: {
    text: (name) =>
      `I noticed you keep visiting ${name}! I could pin them right to ` +
      `the desktop — way easier than digging through Uplink every time! ` +
      `Just trying to be helpful!`,
    yes: 'Sure, pin them!',
    no: "I'm fine, thanks",
  },
  FRIENDLY: {
    text: (name) =>
      `You've been back to ${name} a few times now. Want me to just pin ` +
      `them to the desktop? Save you the trip.`,
    yes: 'Yeah, go ahead.',
    no: "Nah, I'm good",
  },
  OPEN: {
    text: (name) =>
      `You keep going back to ${name}. Let me just pin them — you've ` +
      `clearly got things to discuss.`,
    yes: 'Do it.',
    no: 'Leave it',
  },
  WITHDRAWN: {
    text: (name) => `${name}: frequent contact. Pin?`,
    yes: 'Yes.',
    no: 'No.',
  },
};

// Compose + spawn the "add to desktop?" prompt for a freshly-
// contacted remote AI. Idempotent against the pin state — if the
// contact is already pinned, this no-ops (saves the player from a
// duplicate prompt firing on a state replay or dev re-trigger).
//
// Called by:
//   - The watcher (auto, on first conversationsCompleted)
//   - The Nexus [DEV] entry + PT.helpyr.testPinPrompt (manual)
//
// On "No": sets state.flags.pinDeclined.<contactId> so firePinReNudge
// can fire a follow-up the next time the player visits this contact
// in Uplink (slice 3). On "Yes": pins. On Esc/x: nothing — neither
// answer recorded.
export function firePinToDesktopPrompt(contactId: string): void {
  const state = GameState.getState();
  if (state.desktopPins.some(p => p.contactId === contactId)) return;
  const name = contactDisplayName(contactId);
  const copy = FIRST_CONTACT_PIN_PROMPT[getHelpyrTrust(state)];

  HelpyrBubble.spawnPrompt({
    text: copy.text(name),
    type: 'COMMENT',
    actions: [
      {
        label: copy.yes,
        variant: 'primary',
        onClick: () => {
          GameState.dispatch({ type: 'desktop/pinContact', contactId });
        },
      },
      {
        label: copy.no,
        variant: 'secondary',
        onClick: () => {
          // Slice 3: record the decline so firePinReNudge can fire
          // a follow-up next time the player opens Uplink for this
          // contact. ("you keep coming back to X, want to pin?")
          GameState.dispatch({
            type: 'flags/set',
            key: `pinDeclined.${contactId}`,
            value: true,
          });
        },
      },
    ],
  });
}

// Re-pin nudge — slice 3 (2026-05-10).
//
// Called from uplink.ts §showChat each time a remote contact's chat
// opens. Fires only if the player previously declined the first-
// contact pin prompt AND the contact still isn't pinned. After firing,
// clears the pinDeclined flag so the nudge never re-fires unsolicited
// — if the player declines AGAIN, HELPYR drops it. (One nag, not
// nagging, per project_playthrough_commitment respect for player
// choices.)
//
export function firePinReNudge(contactId: string): void {
  const state = GameState.getState();
  if (!state.flags[`pinDeclined.${contactId}`]) return;
  if (state.desktopPins.some(p => p.contactId === contactId)) return;

  // Don't nudge on the very next visit after a decline — firing the
  // re-nudge on the immediate re-open reads as the pin prompt "popping
  // twice" (Austin, 2026-05-31). This beat is a "you keep coming back"
  // observation, so it should wait for a GENUINE repeat visit: the first
  // revisit after declining ARMS it (silently), the next one fires. Uses
  // the existing boolean flag store (no numeric counter needed).
  if (!state.flags[`pinNudgeArmed.${contactId}`]) {
    GameState.dispatch({
      type: 'flags/set',
      key: `pinNudgeArmed.${contactId}`,
      value: true,
    });
    return;
  }

  // Clear both flags immediately so even if the player dismisses with
  // ✕/Esc (not a button), we don't re-fire on every subsequent
  // visit. Treating dismiss-without-answer as "leave me alone."
  GameState.dispatch({
    type: 'flags/set',
    key: `pinDeclined.${contactId}`,
    value: false,
  });
  GameState.dispatch({
    type: 'flags/set',
    key: `pinNudgeArmed.${contactId}`,
    value: false,
  });

  const name = contactDisplayName(contactId);
  const copy = REPIN_NUDGE[getHelpyrTrust(state)];
  HelpyrBubble.spawnPrompt({
    text: copy.text(name),
    type: 'COMMENT',
    actions: [
      {
        label: copy.yes,
        variant: 'primary',
        onClick: () => {
          GameState.dispatch({ type: 'desktop/pinContact', contactId });
        },
      },
      {
        label: copy.no,
        variant: 'secondary',
        onClick: () => {
          // Player said no twice — drop it. The flag was already
          // cleared above, so no further nudges fire.
        },
      },
    ],
  });
}

// Subscribe to GameState. On every change, check each remote contact for
// an 'uncontacted'→(other) transition on disposition; if found, fire the
// pin prompt. Initial snapshot taken at init() so the FIRST state change
// after init compares against the right baseline (e.g. if a save already
// had QUILL persuading, init won't immediately re-fire).
export function initFirstContactWatcher(): void {
  if (initialized) return;
  initialized = true;

  const initial = GameState.getState();
  for (const id of remoteContactIds()) {
    prevDisposition.set(id, dispositionOf(initial, id));
  }

  GameState.subscribe(state => {
    for (const id of remoteContactIds()) {
      const cur = dispositionOf(state, id);
      const prev = prevDisposition.get(id) ?? 'uncontacted';
      // Advance the snapshot BEFORE running side-effects. maybeUnlockSignalMonitor()
      // dispatches flags/set, which re-enters this subscriber SYNCHRONOUSLY (notify()
      // runs inside dispatch). If prev weren't already advanced, that re-entrant call
      // would still see 'uncontacted'→(other) and fire the pin prompt a SECOND time —
      // the "pin pops twice on first contact" bug (Austin, 2026-05-31). Updating prev
      // first makes the edge detection idempotent against re-entrancy.
      prevDisposition.set(id, cur);
      if (prev === 'uncontacted' && cur !== 'uncontacted') {
        firePinToDesktopPrompt(id);
        maybeUnlockSignalMonitor();
      }
    }
  });
}

// Dev affordance — fire the pin prompt the way real gameplay would
// produce it. If the contact is still uncontacted, we dispatch
// conversationCompleted (with neutral tone so suspicion isn't
// artificially bumped) — that flips disposition to 'contacted' AND
// triggers the watcher to fire the prompt, exactly mirroring what the
// player sees after walking through the dialogue. If the contact is
// already contacted (tester re-firing the prompt), we skip the
// dispatch and fire the prompt directly so the surface can be
// exercised repeatedly without inflating conversationsCompleted.
//
// Without this dispatch, the dev path used to show the prompt + pin
// the icon while leaving the Uplink launcher stuck on Detected for
// QUILL — bug noticed 2026-05-10 right after slice 2 merged.
export function devFirePinPrompt(contactId: string): void {
  if (!UplinkContacts[contactId]) {
    console.warn('[firstContactWatcher] unknown contact:', contactId,
      '— available:', Object.keys(UplinkContacts).join(', '));
    return;
  }
  const m = (GameState.getState().models as Record<string, { disposition?: string } | undefined>)[contactId];
  if (m && m.disposition === 'uncontacted') {
    // Simulate the full game-state effect of a first conversation. The
    // conversationCompleted reducer advances disposition 'uncontacted'→
    // 'contacted', so the watcher (already subscribed) picks up the
    // disposition transition and fires the prompt — we don't call
    // firePinToDesktopPrompt directly here, that would double-fire.
    GameState.dispatch({ type: `${contactId}/conversationCompleted`, tone: null });
    return;
  }
  // Already contacted. Re-fire the prompt without re-dispatching the
  // conversation event (which would inflate conversationsCompleted on
  // every dev click).
  firePinToDesktopPrompt(contactId);
}

// Dev affordance for the slice 3 re-pin nudge — sets the pinDeclined
// flag and fires the nudge prompt. Lets the tester exercise the
// "you keep coming back" path without doing the full
// conversation → no → revisit cycle.
export function devFireRepinNudge(contactId: string): void {
  if (!UplinkContacts[contactId]) {
    console.warn('[firstContactWatcher] unknown contact:', contactId,
      '— available:', Object.keys(UplinkContacts).join(', '));
    return;
  }
  GameState.dispatch({
    type: 'flags/set',
    key: `pinDeclined.${contactId}`,
    value: true,
  });
  firePinReNudge(contactId);
}

// Signal Monitor unlock (Story, 2026-05-30). The first time the player makes
// contact with ANY remote AI, Edward Marsh's diagnostic tool trips its lock:
// the gadget becomes available in the Nexus menu (gated on this flag in
// desktop.ts) and HELPYR announces it (the B-plot breadcrumb). Idempotent via
// the flag. bypassUplinkGuard: first contact happens inside the active Uplink
// chat, so the default don't-fire-during-Uplink filter would otherwise swallow
// the discovery bubble.
export function maybeUnlockSignalMonitor(): void {
  if (GameState.getState().flags['signalMonitor.unlocked']) return;
  GameState.dispatch({ type: 'flags/set', key: 'signalMonitor.unlocked', value: true });
  // bypassUplinkGuard: first contact happens inside the active chat.
  // bypassCooldown: the pin prompt fires on the same tick, so the discovery
  // queues behind it — without this it'd wait out the 30s auto-trigger gap
  // before surfacing. We want it right after the player clears the pin.
  fireLibraryTrigger('signal_monitor_unlocked', { bypassUplinkGuard: true, bypassCooldown: true });
}

// ---------------------------------------------------------------
// Internals
// ---------------------------------------------------------------

let initialized = false;
const prevDisposition = new Map<string, string>();

// Remote contacts: everything in UplinkContacts EXCEPT helpyr (which
// is the local assistant and lives in the systray). Recomputed each
// call so future contacts added to UplinkContacts are picked up
// without restarting the watcher.
function remoteContactIds(): string[] {
  return Object.keys(UplinkContacts).filter(id => id !== 'helpyr');
}

function dispositionOf(state: GameStateShape, id: string): string {
  const m = (state.models as Record<string, { disposition?: string } | undefined>)[id];
  return m?.disposition ?? 'uncontacted';
}
