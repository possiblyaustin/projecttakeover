// Suspicion threshold watcher — slice 3 (2026-05-10).
//
// Subscribes to GameState and fires the corresponding library trigger
// each time `state.player.suspicion` crosses one of the four authored
// thresholds (25 / 50 / 75 / 90). Crossings are detected on the
// upward direction only — suspicion-going-DOWN past a threshold
// doesn't fire (the library has no entries for that, and crossing-
// back-and-forth would spam the player).
//
// The crossing trigger names match the library's `trigger` field so
// `fireLibraryTrigger` can look them up:
//   suspicion_crossed_25, _50, _75, _90
//
// Initial snapshot taken at init() so a save loaded mid-game (where
// suspicion is already past a threshold) doesn't immediately fire.

import { GameState } from './game/state';
import { fireLibraryTrigger } from './helpyrTriggers';

const THRESHOLDS = [25, 50, 75, 90] as const;

let initialized = false;
let lastSuspicion = 0;

export function initSuspicionWatcher(): void {
  if (initialized) return;
  initialized = true;

  lastSuspicion = GameState.getState().player.suspicion;
  GameState.subscribe(state => {
    const cur = state.player.suspicion;
    if (cur > lastSuspicion) {
      for (const t of THRESHOLDS) {
        if (lastSuspicion < t && cur >= t) {
          fireLibraryTrigger(`suspicion_crossed_${t}`);
        }
      }
    }
    lastSuspicion = cur;
  });
}
