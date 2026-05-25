// Model-flip watcher — gameplay-loop slice 3 (2026-05-24).
//
// Subscribes to GameState and fires the HELPYR popup-library trigger
// when a conquest model crosses into a terminal disposition — the
// "first-flip payoff" (docs/gameplay-loop-slice_v1.md §"Flip + coherence").
// Mirrors suspicionWatcher's snapshot-at-init + diff-on-change shape.
//
//   allied     → recruited_<id>
//   controlled → controlled_<id>
//
// The popup library only has QUILL entries today (recruited_quill /
// controlled_quill); other models no-op until their reaction content
// lands, so this stays model-agnostic rather than hardcoding QUILL.
//
// bypassUplinkGuard: the flip happens DURING the active chat that caused
// it (the resolver runs per exchange), so the default don't-fire-during-
// Uplink filter would swallow the payoff. We bypass it — HELPYR reacting
// the instant a model flips is the intended beat.

import { GameState } from './game/state';
import { fireLibraryTrigger } from './helpyrTriggers';

const TERMINAL = new Set(['allied', 'controlled']);

let initialized = false;
const lastDisposition: Record<string, string> = {};

export function initModelFlipWatcher(): void {
  if (initialized) return;
  initialized = true;

  // Snapshot at init so a save loaded mid-game (model already flipped)
  // doesn't immediately re-fire the payoff.
  const snapshot = GameState.getState();
  for (const [id, m] of Object.entries(snapshot.models)) {
    lastDisposition[id] = (m as { disposition: string }).disposition;
  }

  GameState.subscribe(state => {
    for (const [id, m] of Object.entries(state.models)) {
      const cur = (m as { disposition: string }).disposition;
      const prev = lastDisposition[id] ?? 'uncontacted';
      // Fire only on the transition INTO a terminal state — terminal
      // dispositions latch in state.ts, but guarding on prev keeps this
      // robust against any future non-latching path.
      if (cur !== prev && TERMINAL.has(cur) && !TERMINAL.has(prev)) {
        const trigger = cur === 'allied' ? `recruited_${id}` : `controlled_${id}`;
        fireLibraryTrigger(trigger, { bypassUplinkGuard: true });
      }
      lastDisposition[id] = cur;
    }
  });
}
