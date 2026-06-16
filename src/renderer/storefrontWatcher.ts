// Storefront watcher — controlled-QUILL nefarious post-flip mission arming.
//
// The mirror of coverDutyWatcher: arms QUILL's Storefront mission when QUILL
// has flipped CONTROLLED (not allied) AND the scripted post-flip aftermath
// turn has been consumed (flags['flip.quill.aftermath'] — set for both flip
// directions, see uplink.ts getScriptedAftermathOptions). The two missions
// are mutually exclusive: QUILL flips one way, so only one watcher ever fires.
//
// On arm: seed the Storefront record (status→available) and inject QUILL's
// mission-start DM into Uplink, pointing the player at the InkWell Admin
// console (the mission's home in Web Dynamo). HELPYR's mission-start reaction
// fires from the console on first open (a cleaner beat than piling onto the
// flip reaction here).
//
// Re-fire guards mirror coverDutyWatcher (the GameState re-entrancy gotcha):
// advance `armed` BEFORE the dispatch, and the persisted record makes a
// reload-arm a safe no-op.

import { GameState, type GameStateShape } from './game/state';
import { STOREFRONT_QUILL_START } from './game/missions/storefront';
import { injectAllyMessage } from './chatSurface';

let initialized = false;
let armed = false;

function maybeArm(state: GameStateShape): void {
  if (armed) return;
  const quill = state.models.quill;
  if (!quill || quill.disposition !== 'controlled') return;
  // Wait for the scripted aftermath turn so Storefront doesn't step on the
  // flip's own beat.
  if (!state.flags['flip.quill.aftermath']) return;
  // Already armed/run in a prior session (persisted) → just latch + stop.
  if (state.missions.storefront.quill) { armed = true; return; }
  // Advance the guard BEFORE dispatching (re-entrancy: the arm dispatch
  // re-enters this subscriber synchronously).
  armed = true;
  GameState.dispatch({ type: 'mission/storefront/arm', contactId: 'quill' });
  // Relationship bookend: QUILL's mission-start DM lands in Uplink, pointing
  // the player at the InkWell Admin console.
  injectAllyMessage('quill', {
    speaker: 'QUILL',
    avatarClass: 'avatar-quill',
    text: STOREFRONT_QUILL_START,
  });
}

export function initStorefrontWatcher(): void {
  if (initialized) return;
  initialized = true;
  maybeArm(GameState.getState());
  GameState.subscribe(maybeArm);
}
