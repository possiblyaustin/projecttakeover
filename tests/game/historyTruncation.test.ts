import { describe, it, expect } from 'vitest';
import { truncateHistory } from '../../src/renderer/game/historyTruncation';
import type { ModelChatMessage } from '../../src/renderer/game/modelService';

// Helper: build a synthetic alternating-role history of length N.
// Starts with assistant (matches the intro-first chat shape).
function makeHistory(n: number): ModelChatMessage[] {
  const out: ModelChatMessage[] = [];
  for (let i = 0; i < n; i++) {
    if (i % 2 === 0) out.push({ role: 'assistant', text: `npc-${i}` });
    else out.push({ role: 'user', text: `player-${i}` });
  }
  return out;
}

describe('truncateHistory — basic shape', () => {
  it('returns empty array when history is empty', () => {
    expect(truncateHistory([], 16)).toEqual([]);
  });

  it('returns history unchanged when under cap', () => {
    const h = makeHistory(10); // 5 turn-pairs, cap 16 → no truncation
    expect(truncateHistory(h, 16)).toBe(h);
  });

  it('returns history unchanged when exactly at cap', () => {
    const h = makeHistory(32); // 16 turn-pairs, cap 16 → no truncation
    expect(truncateHistory(h, 16)).toBe(h);
  });

  it('keeps last cap*2 messages when over cap', () => {
    const h = makeHistory(40); // 20 turn-pairs
    const out = truncateHistory(h, 16);
    expect(out).toHaveLength(32); // 16 pairs
    // The kept slice should be the LAST 32 entries.
    expect(out[0]).toEqual(h[8]);
    expect(out[31]).toEqual(h[39]);
  });
});

describe('truncateHistory — degenerate caps', () => {
  it('returns empty for cap = 0', () => {
    expect(truncateHistory(makeHistory(20), 0)).toEqual([]);
  });

  it('returns empty for negative cap', () => {
    expect(truncateHistory(makeHistory(20), -3)).toEqual([]);
  });

  it('returns empty for empty history regardless of cap', () => {
    expect(truncateHistory([], 0)).toEqual([]);
    expect(truncateHistory([], 1)).toEqual([]);
    expect(truncateHistory([], 999)).toEqual([]);
  });
});

describe('truncateHistory — does not align on user/assistant boundaries', () => {
  it('may leave a leading assistant message after truncation', () => {
    // Pair-aligned slice can still land on an assistant message at the
    // boundary. The function deliberately doesn't try to align — chat
    // models tolerate a leading assistant message, and alignment logic
    // adds complexity for no measurable benefit. This test pins the
    // behavior so a future "let's clean this up" doesn't accidentally
    // add alignment without a real reason.
    const h = makeHistory(38); // 19 pairs; cap 16 means drop first 3 pairs (6 entries)
    const out = truncateHistory(h, 16);
    expect(out).toHaveLength(32);
    // entry index 6 in h is assistant (even), so kept[0] is assistant.
    expect(out[0]?.role).toBe('assistant');
  });
});

describe('truncateHistory — token-budget context', () => {
  it('default cap of 16 keeps a reasonable history slice for HELPYR', () => {
    // Sanity check that the default 16 doesn't accidentally drop normal
    // play. A 10-turn HELPYR conversation should round-trip unchanged.
    const h = makeHistory(20);
    expect(truncateHistory(h, 16)).toBe(h);
  });
});
