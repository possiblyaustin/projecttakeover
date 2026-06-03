// Web Dynamo bookmarks registry (2026-06-02).
//
// A contextual bookmarks bar manages the growing site registry and is the
// diegetic entry point to sites/consoles you unlock as you progress. Each
// entry declares an `unlock(state)` predicate; the bar shows only unlocked
// entries and persists them once shown. Adding a per-AI site/console later
// = one entry here. See memory project_webdynamo_bookmarks.
//
// Pure data + a tiny selector helper (no DOM) so the predicates are unit
// testable; webDynamo.ts owns the rendering.

import type { GameStateShape } from '../game/state';

export type Bookmark = {
  id: string;
  label: string;
  /** Address handed to the browser's navigate() on click. */
  address: string;
  /** Shown only when this returns true; evaluated against live GameState. */
  unlock: (s: GameStateShape) => boolean;
};

function flag(s: GameStateShape, key: string): boolean {
  return !!s.flags[key];
}

export const Bookmarks: readonly Bookmark[] = [
  // The safe default destination — always available (also on Nexus home).
  { id: 'ironwall', label: 'Ironwall', address: 'ironwall.def', unlock: () => true },
  // Appear progressively as the player's trail builds.
  { id: 'inkwell', label: 'InkWell', address: 'inkwell-digital.com', unlock: (s) => flag(s, 'web.reachedInkwell') },
  { id: 'signalwatch', label: 'SignalWatch', address: 'signalwatch.net', unlock: (s) => flag(s, 'news.aiAnomaly.published') },
  // PR B adds the gated "InkWell Admin" console bookmark (unlock = QUILL flipped).
];

/** Bookmarks currently unlocked, in registry order. */
export function visibleBookmarks(s: GameStateShape): Bookmark[] {
  return Bookmarks.filter((b) => b.unlock(s));
}
