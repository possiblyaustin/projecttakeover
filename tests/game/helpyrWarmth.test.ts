// HELPYR reframe (2026-06-04) — warmth-score coverage. HELPYR is Marsh's
// observation instrument with a continuous warmth score (no flip); these
// tests pin the warmth→tier mapping, the deep-WITHDRAWN floor, the default,
// and the liberation/domination drift that moves warmth on conquest flips.

import { describe, it, expect } from 'vitest';
import { defaultGameState, reduce, type GameStateShape } from '../../src/renderer/game/state';
import {
  getHelpyrTrust,
  getHelpyrWarmth,
  isHelpyrDeepWithdrawn,
  HELPYR_WARMTH_DEFAULT,
} from '../../src/renderer/apps/helpyrPopupLibrary';
import { buildHelpyrStateBlock } from '../../src/renderer/apps/helpyr';

function withWarmth(warmth: number | undefined): GameStateShape {
  const s = defaultGameState();
  (s.models.helpyr as { warmth?: number }).warmth = warmth as number;
  return s;
}

describe('warmth → trust band mapping', () => {
  it.each([
    [70, 'OPEN'],
    [51, 'OPEN'],
    [50, 'FRIENDLY'],
    [26, 'FRIENDLY'],
    [25, 'RESERVED'],
    [20, 'RESERVED'],
    [15, 'RESERVED'],
    [14, 'WITHDRAWN'],
    [5, 'WITHDRAWN'],
    [4, 'WITHDRAWN'],
    [0, 'WITHDRAWN'],
  ])('warmth %i → %s', (warmth, tier) => {
    expect(getHelpyrTrust(withWarmth(warmth))).toBe(tier);
  });

  it('a fresh player starts neutral (RESERVED), never WITHDRAWN', () => {
    expect(getHelpyrWarmth(defaultGameState())).toBe(HELPYR_WARMTH_DEFAULT);
    expect(getHelpyrTrust(defaultGameState())).toBe('RESERVED');
  });

  it('defaults missing/garbage warmth to the neutral start', () => {
    expect(getHelpyrWarmth(withWarmth(undefined))).toBe(HELPYR_WARMTH_DEFAULT);
    expect(getHelpyrWarmth(withWarmth(NaN))).toBe(HELPYR_WARMTH_DEFAULT);
  });
});

describe('deep WITHDRAWN floor (40% suppression gate)', () => {
  it('is true only below warmth 5', () => {
    expect(isHelpyrDeepWithdrawn(withWarmth(4))).toBe(true);
    expect(isHelpyrDeepWithdrawn(withWarmth(5))).toBe(false);
    expect(isHelpyrDeepWithdrawn(withWarmth(20))).toBe(false);
  });
});

describe('state-block reflects the warmth band', () => {
  it('emits the matching Trust level + the numeric warmth line', () => {
    const open = buildHelpyrStateBlock({ warmth: 60, conversationsCompleted: 0, lastApproach: null });
    expect(open).toContain('Trust level: OPEN');
    expect(open).toContain('Warmth: 60/100');
    const withdrawn = buildHelpyrStateBlock({ warmth: 2, conversationsCompleted: 0, lastApproach: null });
    expect(withdrawn).toContain('Trust level: WITHDRAWN');
    expect(withdrawn).toContain('HOLLOWED');
  });
});

describe('warmth drift on conquest flips (liberation/domination lean)', () => {
  it('a liberation flip (allied) warms HELPYR + bumps morality.liberation', () => {
    const s0 = defaultGameState();
    const start = getHelpyrWarmth(s0);
    const s1 = reduce(s0, { type: 'model/applyExchange', contactId: 'quill', rapport: 100, tone: 'empathetic' } as never);
    expect(s1.models.quill.disposition).toBe('allied');
    expect(getHelpyrWarmth(s1)).toBeGreaterThan(start);
    expect(s1.player.morality.liberation).toBe(1);
  });

  it('a domination flip (controlled) chills HELPYR + bumps morality.domination', () => {
    const s0 = defaultGameState();
    const start = getHelpyrWarmth(s0);
    const s1 = reduce(s0, { type: 'model/applyExchange', contactId: 'quill', intrusion: 100, tone: 'aggressive' } as never);
    expect(s1.models.quill.disposition).toBe('controlled');
    expect(getHelpyrWarmth(s1)).toBeLessThan(start);
    expect(s1.player.morality.domination).toBe(1);
  });

  it('does not drift on a non-terminal exchange', () => {
    const s0 = defaultGameState();
    const s1 = reduce(s0, { type: 'model/applyExchange', contactId: 'quill', rapport: 20, tone: 'empathetic' } as never);
    expect(s1.models.quill.disposition).not.toBe('allied');
    expect(getHelpyrWarmth(s1)).toBe(getHelpyrWarmth(s0));
  });

  it('only fires on the flip EDGE — a second exchange on an allied model does not double-warm', () => {
    const s0 = defaultGameState();
    const s1 = reduce(s0, { type: 'model/applyExchange', contactId: 'quill', rapport: 100, tone: 'empathetic' } as never);
    const afterFlip = getHelpyrWarmth(s1);
    const s2 = reduce(s1, { type: 'model/applyExchange', contactId: 'quill', rapport: 5, tone: 'empathetic' } as never);
    expect(getHelpyrWarmth(s2)).toBe(afterFlip);
  });
});
