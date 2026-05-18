import { describe, it, expect } from 'vitest';
import {
  HelpyrRecoveryPool,
  buildHelpyrRecoveryPoolFor,
} from '../../src/renderer/apps/helpyr';

// Visibility map (Story team, 2026-05-16): the 5-state HELPYR model
// state collapses to a 3-tier visibility (UNIVERSAL / EARLY / BUILT).
// These tests pin the collapse so a future tweak to buildHelpyrStateBlock
// can't silently desync recovery options from the prompt's trust block.

const TEXTS = {
  UNIVERSAL: HelpyrRecoveryPool.filter((e) => e.tier === 'UNIVERSAL').map((e) => e.text),
  EARLY:     HelpyrRecoveryPool.filter((e) => e.tier === 'EARLY').map((e) => e.text),
  BUILT:     HelpyrRecoveryPool.filter((e) => e.tier === 'BUILT').map((e) => e.text),
};

function textsFor(disposition: string, lastApproach: string | null): string[] {
  return buildHelpyrRecoveryPoolFor(disposition, lastApproach).map((o) => o.text);
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

describe('buildHelpyrRecoveryPoolFor — trust visibility', () => {
  it('GUARDED (default disposition, no approach): UNIVERSAL + EARLY only', () => {
    const got = textsFor('neutral', null);
    expect(got.sort()).toEqual([...TEXTS.UNIVERSAL, ...TEXTS.EARLY].sort());
  });

  it('WARY (aggressive/direct/deceptive approach): still UNIVERSAL + EARLY', () => {
    // WARY uses the same pool as GUARDED — the "pulling back" persona
    // shouldn't suddenly invite BUILT-tier honesty probes.
    expect(textsFor('neutral', 'aggressive').sort()).toEqual(textsFor('neutral', null).sort());
    expect(textsFor('neutral', 'direct').sort()).toEqual(textsFor('neutral', null).sort());
    expect(textsFor('neutral', 'deceptive').sort()).toEqual(textsFor('neutral', null).sort());
  });

  it('WARMING (friendly/empathetic approach): all three tiers visible', () => {
    const got = textsFor('neutral', 'friendly');
    expect(got.sort()).toEqual(
      [...TEXTS.UNIVERSAL, ...TEXTS.EARLY, ...TEXTS.BUILT].sort(),
    );
    expect(textsFor('neutral', 'empathetic').sort()).toEqual(got.sort());
  });

  it('COMMITTED (allied disposition): all three tiers visible', () => {
    // Disposition overrides lastApproach — even an aggressive last turn
    // on an allied HELPYR keeps the LIBERATED-tier options available.
    const got = textsFor('allied', 'aggressive');
    expect(got.sort()).toEqual(
      [...TEXTS.UNIVERSAL, ...TEXTS.EARLY, ...TEXTS.BUILT].sort(),
    );
  });

  it('EXPLOITED (controlled disposition): UNIVERSAL only', () => {
    // Hollowed HELPYR can't credibly answer EARLY or BUILT probes —
    // both would force the player into a flat/dead response. Strip down
    // to the safe floor.
    const got = textsFor('controlled', 'friendly');
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
