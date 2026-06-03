// Cover Duty watcher — post-flip missions slice 1 (2026-06-02).
//
// Arms QUILL's Cover Duty mission at the right moment: when QUILL has
// flipped allied AND the scripted post-flip aftermath turn has been
// consumed (flags['flip.quill.aftermath']) AND no mission record exists
// yet. Marks the mission `available` + seeds the batch; the Uplink mission
// view then renders the setup + ticket loop when the player opens QUILL.
//
// Why a watcher (mirrors firstContactWatcher / flipReaction):
//   - Keeps chatSurface free of mission-flow logic.
//   - The arming condition (allied + aftermath-consumed) is a GameState
//     edge, so a subscriber is the natural home.
//
// Ordering: the Escape cascade's desktop-pin + ally DM fire at flip; the
// "world noticed" stinger is deferred until Cover Duty completes (see
// escapeCascade.fireCoverDutyComplete). This watcher only handles the
// arming step.
//
// Re-fire guards:
//   - A within-session `armed` flag, advanced BEFORE the dispatch so the
//     synchronous re-entrant notify (notify() runs inside dispatch) can't
//     double-arm (the GameState re-entrancy gotcha).
//   - The persisted mission record itself: on reload, the record exists, so
//     the arm action no-ops and we just latch `armed`.

import { GameState, type GameStateShape } from './game/state';
import { selectBatchIds, COVER_DUTY_SETUP } from './game/missions/coverDuty';
import { injectAllyMessage } from './chatSurface';

let initialized = false;
let armed = false;

function maybeArm(state: GameStateShape): void {
  if (armed) return;
  const quill = state.models.quill;
  if (!quill || quill.disposition !== 'allied') return;
  // Wait for the scripted aftermath turn to be consumed so Cover Duty
  // doesn't step on the flip's own beat.
  if (!state.flags['flip.quill.aftermath']) return;
  // Already armed/run in a prior session (persisted) → just latch + stop.
  if (state.missions.coverDuty.quill) { armed = true; return; }
  // Advance the guard BEFORE dispatching (re-entrancy: the arm dispatch
  // re-enters this subscriber synchronously).
  armed = true;
  GameState.dispatch({
    type: 'mission/coverDuty/arm',
    contactId: 'quill',
    ticketIds: selectBatchIds(),
  });
  // Relationship bookend: QUILL's setup DM lands in Uplink, pointing the
  // player at the InkWell Admin console (the mission's home in Web Dynamo).
  injectAllyMessage('quill', {
    speaker: 'QUILL',
    avatarClass: 'avatar-quill',
    text: COVER_DUTY_SETUP,
  });
}

export function initCoverDutyWatcher(): void {
  if (initialized) return;
  initialized = true;
  maybeArm(GameState.getState());
  GameState.subscribe(maybeArm);
}
