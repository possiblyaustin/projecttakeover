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
// to the flip is the intended beat.
//
// TIMING (2026-05-30): the disposition flips at PICK time (recordTone →
// model/applyExchange), which is BEFORE the model's flip-turn reply is even
// requested, let alone typed out. Firing HELPYR straight from the state
// subscription popped her bubble before QUILL's own flip line landed —
// spoiling the beat (Austin, live play). So for any contact with an OPEN
// chat surface, we DEFER: the chat flushes the reaction from commitResult,
// which runs only after the NPC reply finishes rendering. Flips with no
// open chat (dev/direct dispatch) still fire immediately from the watcher.

// The shared state + timing logic lives in flipReaction.ts (a leaf module
// that imports only GameState) so chatSurface can drive the flush without a
// circular import back through helpyrTriggers → helpyrBubble → helpyr →
// chatSurface. This module owns only the helpyrTriggers dependency: it
// injects the actual firer and runs the state subscription.

import { GameState } from './game/state';
import { fireLibraryTrigger } from './helpyrTriggers';
import {
  setFlipFirer,
  fireFlipReaction,
  isFlipChatManaged,
  markFlipReacted,
} from './flipReaction';

const TERMINAL = new Set(['allied', 'controlled']);

let initialized = false;
const lastDisposition: Record<string, string> = {};

export function initModelFlipWatcher(): void {
  if (initialized) return;
  initialized = true;

  // Inject the real HELPYR trigger — kept here so flipReaction.ts stays a
  // leaf (no helpyrTriggers import). bypassUplinkGuard: the flip happens
  // during the active chat, so the default don't-fire-during-Uplink filter
  // would otherwise swallow the payoff.
  setFlipFirer((id, disposition) => {
    const trigger = disposition === 'allied' ? `recruited_${id}` : `controlled_${id}`;
    fireLibraryTrigger(trigger, { bypassUplinkGuard: true });
  });

  // Snapshot at init so a save loaded mid-game (model already flipped)
  // doesn't re-fire the payoff — mark it already-reacted.
  const snapshot = GameState.getState();
  for (const [id, m] of Object.entries(snapshot.models)) {
    const d = (m as { disposition: string }).disposition;
    lastDisposition[id] = d;
    if (TERMINAL.has(d)) markFlipReacted(id);
  }

  GameState.subscribe(state => {
    for (const [id, m] of Object.entries(state.models)) {
      const cur = (m as { disposition: string }).disposition;
      const prev = lastDisposition[id] ?? 'uncontacted';
      // Fire only on the transition INTO a terminal state — terminal
      // dispositions latch in state.ts, but guarding on prev keeps this
      // robust against any future non-latching path. Defer to the chat
      // surface when one is open for this contact (it flushes post-render).
      if (cur !== prev && TERMINAL.has(cur) && !TERMINAL.has(prev) && !isFlipChatManaged(id)) {
        fireFlipReaction(id, cur);
      }
      lastDisposition[id] = cur;
    }
  });
}
