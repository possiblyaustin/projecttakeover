// Propaganda watcher — controlled-MUSE nefarious post-flip mission arming.
//
// The mirror of storefrontWatcher: arms MUSE's Propaganda mission when MUSE has
// flipped CONTROLLED. Unlike QUILL, MUSE has no separate scripted-aftermath flag
// (its flip lines carry their own reply sets, no next-turn override — see
// muse.ts getScriptedFlipMoment), so the gate is the scripted-flip flag itself:
// flags['flip.muse.scripted'] is set the turn the controlled flip line shows, so
// arming on it lands the mission-start DM right after the flip beat.
//
// On arm: seed the Propaganda record (status→available) and inject MUSE's
// mission-start DM, pointing the player at the WaveCrowd content pipeline. The
// DM lands in the MUSE conversation — the slice-1 encounter runs MUSE in the
// in-WaveCrowd signal thread, but it shares a session with the Uplink roster
// entry (same contactKey 'muse'), so injectAllyMessage reaches whichever surface
// the player opens. HELPYR's mission-start reaction fires from the console on
// first open (a cleaner beat than piling onto the flip reaction here).
//
// Re-fire guards mirror storefrontWatcher (the GameState re-entrancy gotcha):
// advance `armed` BEFORE the dispatch, and the persisted record makes a
// reload-arm a safe no-op.

import { GameState, type GameStateShape } from './game/state';
import { PROPAGANDA_MUSE_START } from './game/missions/propaganda';
import { MuseContact } from './apps/muse';
import { injectAllyMessage } from './chatSurface';

let initialized = false;
let armed = false;

function maybeArm(state: GameStateShape): void {
  if (armed) return;
  const muse = state.models.muse;
  if (!muse || muse.disposition !== 'controlled') return;
  // Wait for the scripted flip line to have shown so Propaganda doesn't step on
  // the flip's own beat.
  if (!state.flags['flip.muse.scripted']) return;
  // Already armed/run in a prior session (persisted) → just latch + stop.
  if (state.missions.propaganda.muse) { armed = true; return; }
  // Advance the guard BEFORE dispatching (re-entrancy: the arm dispatch
  // re-enters this subscriber synchronously).
  armed = true;
  GameState.dispatch({ type: 'mission/propaganda/arm', contactId: 'muse' });
  // Relationship bookend: MUSE's controlled mission-start DM, pointing the
  // player at the WaveCrowd content pipeline.
  injectAllyMessage('muse', {
    speaker: '@wavecrowd_content',
    avatarClass: MuseContact.avatarClass,
    text: PROPAGANDA_MUSE_START,
  });
}

export function initPropagandaWatcher(): void {
  if (initialized) return;
  initialized = true;
  maybeArm(GameState.getState());
  GameState.subscribe(maybeArm);
}
