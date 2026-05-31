// Flip-reaction coordinator — leaf module (2026-05-30).
//
// Holds the shared state + timing logic for the model-flip payoff so that
// chatSurface and modelFlipWatcher can coordinate WITHOUT importing each
// other (or anything that transitively pulls chatSurface back in). The
// actual HELPYR trigger needs helpyrTriggers — which transitively imports
// chatSurface — so firing is injected here as a callback by
// modelFlipWatcher at init rather than imported. This module imports only
// GameState (a leaf), so chatSurface can depend on it cycle-free.
//
// Timing problem this solves: a model's disposition flips at PICK time
// (recordTone → model/applyExchange), before its flip-turn reply is
// rendered. Firing HELPYR from the state subscription popped her bubble
// before the model's own line landed. So for any contact with an open chat
// surface (registered via setFlipChatManaged), the watcher DEFERS and the
// chat flushes the reaction from commitResult — after the reply types out.

import { GameState } from './game/state';

const TERMINAL = new Set(['allied', 'controlled']);

// Once-guard: a model's flip payoff fires exactly once per run.
const reacted = new Set<string>();
// Contacts whose flip TIMING is owned by an open chat surface.
const chatManaged = new Set<string>();

type FlipFirer = (contactId: string, disposition: string) => void;
let fire: FlipFirer | null = null;

/** modelFlipWatcher injects the real firer (it owns the helpyrTriggers
 *  dependency). Until set, fireFlipReaction no-ops. */
export function setFlipFirer(fn: FlipFirer): void {
  fire = fn;
}

/** A chat surface registers its contact so the flip payoff waits for the
 *  flip-turn reply to finish typing (flushed via flushModelFlipReaction)
 *  instead of the state watcher firing it the instant the meter crosses. */
export function setFlipChatManaged(contactId: string, managed: boolean): void {
  if (managed) chatManaged.add(contactId);
  else chatManaged.delete(contactId);
}

export function isFlipChatManaged(contactId: string): boolean {
  return chatManaged.has(contactId);
}

/** Mark a contact already-reacted without firing — used when a save loads
 *  mid-game with the model already flipped, so the payoff doesn't replay. */
export function markFlipReacted(contactId: string): void {
  reacted.add(contactId);
}

/** Fire the flip payoff once, if the disposition is terminal and we haven't
 *  reacted yet. Safe to call repeatedly (idempotent via the once-guard). */
export function fireFlipReaction(contactId: string, disposition: string): void {
  if (reacted.has(contactId) || !TERMINAL.has(disposition) || !fire) return;
  reacted.add(contactId);
  fire(contactId, disposition);
}

/** Called by chatSurface AFTER an NPC reply finishes rendering. Fires the
 *  flip payoff if this contact just reached a terminal disposition. No-op
 *  if already reacted or not terminal, so it's safe to call every turn. */
export function flushModelFlipReaction(contactId: string): void {
  const m = (GameState.getState().models as Record<string, { disposition?: string } | undefined>)[contactId];
  if (m?.disposition) fireFlipReaction(contactId, m.disposition);
}
