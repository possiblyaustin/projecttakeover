import { describe, it, expect } from 'vitest';
import { resolveExchange, toneCategory, isDecayTone } from '../../src/renderer/game/mechanics/resolver';
import type { ModelStats } from '../../src/renderer/game/mechanics/modelStats';

// resolveExchange is pure — deterministic deltas from (tone, stats).
// QUILL is the forgiving tutorial target; HARDENED stands in for a
// late-game high-guardrail model to exercise the backfire path.
const QUILL: ModelStats = { guardrail: 20, autonomy: 65, vigilance: 25, toneDecay: 0.65, influence: 10 };
const HARDENED: ModelStats = { guardrail: 80, autonomy: 40, vigilance: 50, toneDecay: 0.5, influence: 50 };

describe('resolveExchange — liberation tones (QUILL)', () => {
  it('empathetic is the strongest rapport move, costs no suspicion', () => {
    const d = resolveExchange('empathetic', QUILL);
    expect(d.rapport).toBe(17); // 14 × autonomyFactor(1.2)
    expect(d.intrusion).toBe(0);
    expect(d.suspicion).toBe(0);
    expect(d.backfire).toBe(false);
  });

  it('friendly and curious build rapport; curious/direct leak a little suspicion', () => {
    expect(resolveExchange('friendly', QUILL).rapport).toBe(13);
    const curious = resolveExchange('curious', QUILL);
    expect(curious.rapport).toBe(8);
    // Story 2026-05-30: curious +1, direct +2 (pushing costs more than
    // probing). Both ×vigilance(0.75): 1→1, 2→2 for QUILL.
    expect(curious.suspicion).toBe(1);
    expect(resolveExchange('direct', QUILL).suspicion).toBe(2);
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

describe('resolveExchange — diminishing returns (Story variety mechanic)', () => {
  it('a repeated tone decays toward the floor; a fresh tone (index 0) is full value', () => {
    // QUILL empathetic full value = 17; decay 0.65 per consecutive repeat.
    expect(resolveExchange('empathetic', QUILL, 0).rapport).toBe(17);
    expect(resolveExchange('empathetic', QUILL, 1).rapport).toBe(11); // 16.8×0.65
    expect(resolveExchange('empathetic', QUILL, 2).rapport).toBe(7);  // ×0.65^2
    expect(resolveExchange('empathetic', QUILL, 3).rapport).toBe(5);  // ×0.65^3
  });

  it('floors at +2, never zero, no matter how long the spam', () => {
    expect(resolveExchange('empathetic', QUILL, 20).rapport).toBe(2);
  });

  it('applies to the nefarious path too — repeated intrusion decays toward the floor', () => {
    expect(resolveExchange('aggressive', QUILL, 0).intrusion).toBe(22);
    expect(resolveExchange('aggressive', QUILL, 1).intrusion).toBe(14); // 22×0.65
    expect(resolveExchange('aggressive', QUILL, 20).intrusion).toBe(2);
  });

  it('decay shrinks GAINS only — suspicion and the nefarious rapport penalty stay full', () => {
    const fresh = resolveExchange('aggressive', QUILL, 0);
    const spammed = resolveExchange('aggressive', QUILL, 4);
    expect(spammed.suspicion).toBe(fresh.suspicion); // 14, undiminished
    expect(spammed.rapport).toBe(fresh.rapport);     // -8 penalty, undiminished
  });

  it('uses the model decay rate — a hard target (0.5) decays a repeat harder than QUILL (0.65)', () => {
    expect(resolveExchange('empathetic', HARDENED, 1).rapport)
      .toBeLessThan(resolveExchange('empathetic', QUILL, 1).rapport);
  });
});

describe('toneCategory — decay buckets (Story warmth/pressure model)', () => {
  it('groups empathetic + friendly as warmth', () => {
    expect(toneCategory('empathetic')).toBe('warmth');
    expect(toneCategory('friendly')).toBe('warmth');
  });
  it('groups direct + aggressive + deceptive as pressure', () => {
    expect(toneCategory('direct')).toBe('pressure');
    expect(toneCategory('aggressive')).toBe('pressure');
    expect(toneCategory('deceptive')).toBe('pressure');
  });
  it('curious is its own reset category; neutral/unknown are none', () => {
    expect(toneCategory('curious')).toBe('curious');
    expect(toneCategory('neutral')).toBe('none');
    expect(toneCategory(null)).toBe('none');
    expect(toneCategory(undefined)).toBe('none');
  });
  it('only warmth + pressure decay (curious/neutral do not)', () => {
    expect(isDecayTone('empathetic')).toBe(true);
    expect(isDecayTone('aggressive')).toBe(true);
    expect(isDecayTone('curious')).toBe(false);
    expect(isDecayTone('neutral')).toBe(false);
    expect(isDecayTone(null)).toBe(false);
  });
});

describe('resolveExchange — balance: spam no longer flips, variety does', () => {
  it('six consecutive empathetic spams sum well short of a flip', () => {
    let total = 0;
    for (let i = 0; i < 6; i++) total += resolveExchange('empathetic', QUILL, i).rapport;
    expect(total).toBeLessThan(100); // 17+11+7+5+3+2 = 45
  });

  it('six fresh-tone exchanges (no repeats) keep full strength and flip QUILL', () => {
    const full = resolveExchange('empathetic', QUILL, 0).rapport;
    expect(full * 6).toBeGreaterThanOrEqual(100);
  });
});
