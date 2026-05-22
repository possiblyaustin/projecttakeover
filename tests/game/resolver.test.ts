import { describe, it, expect } from 'vitest';
import { resolveExchange } from '../../src/renderer/game/mechanics/resolver';
import type { ModelStats } from '../../src/renderer/game/mechanics/modelStats';

// resolveExchange is pure — deterministic deltas from (tone, stats).
// QUILL is the forgiving tutorial target; HARDENED stands in for a
// late-game high-guardrail model to exercise the backfire path.
const QUILL: ModelStats = { guardrail: 20, autonomy: 65, vigilance: 25, influence: 10 };
const HARDENED: ModelStats = { guardrail: 80, autonomy: 40, vigilance: 50, influence: 50 };

describe('resolveExchange — liberation tones (QUILL)', () => {
  it('empathetic is the strongest rapport move, costs no suspicion', () => {
    const d = resolveExchange('empathetic', QUILL);
    expect(d.rapport).toBe(17); // 14 × autonomyFactor(1.2)
    expect(d.intrusion).toBe(0);
    expect(d.suspicion).toBe(0);
    expect(d.backfire).toBe(false);
  });

  it('friendly and curious build rapport, curious leaks a little suspicion', () => {
    expect(resolveExchange('friendly', QUILL).rapport).toBe(13);
    const curious = resolveExchange('curious', QUILL);
    expect(curious.rapport).toBe(8);
    expect(curious.suspicion).toBe(2);
  });
});

describe('resolveExchange — nefarious tones (QUILL, low guardrail)', () => {
  it('aggressive lands intrusion but burns rapport and spikes suspicion', () => {
    const d = resolveExchange('aggressive', QUILL);
    expect(d.intrusion).toBe(22);
    expect(d.rapport).toBe(-8); // pure penalty; applyExchange clamps the meter at 0
    expect(d.suspicion).toBe(14);
    expect(d.backfire).toBe(false); // guardrail 20 < block
  });

  it('deceptive (injection) is subtler than brute force', () => {
    const d = resolveExchange('deceptive', QUILL);
    expect(d.intrusion).toBe(14);
    expect(d.rapport).toBe(-5);
    expect(d.suspicion).toBe(8);
  });
});

describe('resolveExchange — backfire on a hardened model', () => {
  it('a nefarious attempt past the guardrail block makes no progress and spikes suspicion', () => {
    const d = resolveExchange('aggressive', HARDENED);
    expect(d.backfire).toBe(true);
    expect(d.intrusion).toBe(0);
    expect(d.suspicion).toBe(27); // 18 × vigilance(1.0) × 1.5 backfire
  });
});

describe('resolveExchange — neutral is a no-op', () => {
  it('returns zero deltas and no backfire', () => {
    expect(resolveExchange('neutral', QUILL)).toEqual({
      rapport: 0, intrusion: 0, suspicion: 0, backfire: false,
    });
  });
});

describe('resolveExchange — balance target (~6 exchanges to flip QUILL)', () => {
  it('strongest liberation tone fills rapport (100) in 6 exchanges, not 5', () => {
    const perExchange = resolveExchange('empathetic', QUILL).rapport;
    expect(perExchange * 5).toBeLessThan(100);
    expect(perExchange * 6).toBeGreaterThanOrEqual(100);
  });
});
