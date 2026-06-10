// MUSE bridge watcher — Act 1 → Act 2 connective tissue (2026-06-10).
//
// When QUILL's Cover Duty mission completes, QUILL points the player at
// WaveCrowd: a bridge DM lands in the QUILL Uplink session (variant keyed
// on whether the player extracted the Axiom Portland intel during Cover
// Duty), HELPYR fires the muse_bridge pop, and the WaveCrowd bookmark
// unlocks (webDynamoBookmarks reads the same flag). Content:
// docs/muse-content-package_v1.md Part 2 (STORY-READY).
//
// Pacing: Cover Duty completion already fires the SignalWatch stinger +
// intel pops from escapeCascade — the bridge DM is deliberately delayed a
// beat so it lands after that flurry, as its own moment.
//
// Re-fire guards (the GameState re-entrancy convention): the in-session
// `fired` latch advances BEFORE any dispatch; the persisted
// flags['muse.bridge.sent'] makes it once-per-save across reloads. A save
// that completed Cover Duty in a prior session without the bridge (e.g.
// pre-MUSE build) fires it on init.

import { GameState, type GameStateShape } from './game/state';
import { injectAllyMessage } from './chatSurface';
import { fireLibraryTrigger } from './helpyrTriggers';
import { MuseBridgeDM } from './apps/muse';

const BRIDGE_FLAG = 'muse.bridge.sent';
const AXIOM_INTEL_ID = 'intel-axiom-portland';
const BRIDGE_DELAY_MS = 12000;

let initialized = false;
let fired = false;

function maybeBridge(state: GameStateShape): void {
  if (fired) return;
  if (state.flags[BRIDGE_FLAG]) { fired = true; return; }
  const mission = state.missions.coverDuty['quill'];
  if (!mission || mission.status !== 'complete') return;

  // Latch BEFORE the dispatch — flags/set re-enters this subscriber
  // synchronously.
  fired = true;
  GameState.dispatch({ type: 'flags/set', key: BRIDGE_FLAG, value: true });

  const hasAxiomIntel = mission.extractedIntel.includes(AXIOM_INTEL_ID);
  const dm = hasAxiomIntel ? MuseBridgeDM.withIntel : MuseBridgeDM.withoutIntel;

  // Delayed a beat so the Cover Duty completion stinger lands first.
  setTimeout(() => {
    injectAllyMessage('quill', {
      speaker: 'QUILL',
      avatarClass: 'avatar-quill',
      text: dm,
    });
    fireLibraryTrigger('muse_bridge');
  }, BRIDGE_DELAY_MS);
}

export function initMuseBridgeWatcher(): void {
  if (initialized) return;
  initialized = true;
  maybeBridge(GameState.getState());
  GameState.subscribe(maybeBridge);
}
