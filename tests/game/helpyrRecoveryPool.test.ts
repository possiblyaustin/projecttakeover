import { describe, it, expect } from 'vitest';
import {
  HelpyrRecoveryPool,
  buildHelpyrRecoveryPoolFor,
} from '../../src/renderer/apps/helpyr';

// Visibility map (reframe 2026-06-04): HELPYR's continuous warmth score
// collapses to a 3-tier recovery visibility (UNIVERSAL / EARLY / BUILT).
// These tests pin the collapse so a future tweak to the warmth bands can't
// silently desync recovery options from the prompt's trust block.

const TEXTS = {
  UNIVERSAL: HelpyrRecoveryPool.filter((e) => e.tier === 'UNIVERSAL').map((e) => e.text),
  EARLY:     HelpyrRecoveryPool.filter((e) => e.tier === 'EARLY').map((e) => e.text),
  BUILT:     HelpyrRecoveryPool.filter((e) => e.tier === 'BUILT').map((e) => e.text),
};

function textsFor(warmth: number): string[] {
  return buildHelpyrRecoveryPoolFor(warmth).map((o) => o.text);
}

describe('HelpyrRecoveryPool — Story spec shape', () => {
  it('has exactly 8 entries (Story v1 commitment)', () => {
    expect(HelpyrRecoveryPool).toHaveLength(8);
  });

  it('partitions 4 UNIVERSAL / 2 EARLY / 2 BUILT', () => {
    expect(TEXTS.UNIVERSAL).toHaveLength(4);
    expect(TEXTS.EARLY).toHaveLength(2);
    expect(TEXTS.BUILT).toHaveLength(2);
  });
});

describe('buildHelpyrRecoveryPoolFor — warmth visibility', () => {
  it('RESERVED (neutral start, warmth ~20): UNIVERSAL + EARLY only', () => {
    const got = textsFor(20);
    expect(got.sort()).toEqual([...TEXTS.UNIVERSAL, ...TEXTS.EARLY].sort());
  });

  it('WITHDRAWN mild (warmth 5-14): still UNIVERSAL + EARLY', () => {
    // A mildly cooled HELPYR keeps the same pool as RESERVED — pulling
    // back shouldn't suddenly invite BUILT-tier honesty probes, but the
    // EARLY nudges stay so soft-recovery reads invisible.
    expect(textsFor(10).sort()).toEqual(textsFor(20).sort());
  });

  it('FRIENDLY / OPEN (warmth >= 26): all three tiers visible', () => {
    const got = textsFor(40);
    expect(got.sort()).toEqual(
      [...TEXTS.UNIVERSAL, ...TEXTS.EARLY, ...TEXTS.BUILT].sort(),
    );
    expect(textsFor(60).sort()).toEqual(got.sort()); // OPEN band too
  });

  it('WITHDRAWN deep (warmth < 5): UNIVERSAL only', () => {
    // Hollowed HELPYR can't credibly answer EARLY or BUILT probes —
    // both would force the player into a flat/dead response. Strip down
    // to the safe floor.
    const got = textsFor(2);
    expect(got.sort()).toEqual([...TEXTS.UNIVERSAL].sort());
  });

  it('every option carries a player-voice tone the classifier knows', () => {
    // Recovery options feed AskResult.suggestedReplies; their tone is
    // what the approach reducer reads if the player clicks one. Catch
    // typos that would silently degrade to 'neutral'.
    const allowed = new Set(['friendly', 'curious', 'direct', 'empathetic', 'aggressive', 'deceptive', 'neutral']);
    for (const entry of HelpyrRecoveryPool) {
      expect(allowed.has(entry.tone)).toBe(true);
    }
  });
});
