import { describe, it, expect } from 'vitest';
import { reduce, defaultGameState } from '../../src/renderer/game/state';

// reducer is pure — these tests deliberately don't touch the
// GameState singleton or its localStorage side effects. The persistence
// path is left to phase-2 integration tests.

describe('reduce — debug/setSuspicion', () => {
  it('sets suspicion within 0-100 range', () => {
    const next = reduce(defaultGameState(), { type: 'debug/setSuspicion', value: 42 });
    expect(next.player.suspicion).toBe(42);
  });

  it('clamps high values to 100', () => {
    const next = reduce(defaultGameState(), { type: 'debug/setSuspicion', value: 9999 });
    expect(next.player.suspicion).toBe(100);
  });

  it('clamps low / negative values to 0', () => {
    const next = reduce(defaultGameState(), { type: 'debug/setSuspicion', value: -50 });
    expect(next.player.suspicion).toBe(0);
  });

  it('coerces non-finite values to 0 (defensive against NaN/Infinity)', () => {
    const next = reduce(defaultGameState(), { type: 'debug/setSuspicion', value: NaN });
    expect(next.player.suspicion).toBe(0);
  });
});

describe('reduce — debug/reset', () => {
  it('returns a fresh default state regardless of prior state', () => {
    const dirty = reduce(defaultGameState(), { type: 'debug/setSuspicion', value: 80 });
    const reset = reduce(dirty, { type: 'debug/reset' });
    expect(reset).toEqual(defaultGameState());
  });
});

describe('reduce — helpyr/conversationCompleted', () => {
  it('flips disposition uncontacted → contacted on first conversation', () => {
    const next = reduce(defaultGameState(), {
      type: 'helpyr/conversationCompleted',
      tone: 'friendly',
    });
    expect(next.models.helpyr.disposition).toBe('contacted');
    expect(next.models.helpyr.conversationsCompleted).toBe(1);
  });

  it('preserves non-uncontacted disposition (does not regress allied/hostile)', () => {
    const allied = {
      ...defaultGameState(),
      models: {
        ...defaultGameState().models,
        helpyr: {
          ...defaultGameState().models.helpyr,
          disposition: 'allied',
        },
      },
    };
    const next = reduce(allied, {
      type: 'helpyr/conversationCompleted',
      tone: 'friendly',
    });
    expect(next.models.helpyr.disposition).toBe('allied');
  });

  it('applies aggressive suspicion bump (+25)', () => {
    const next = reduce(defaultGameState(), {
      type: 'helpyr/conversationCompleted',
      tone: 'aggressive',
    });
    expect(next.player.suspicion).toBe(25);
  });

  it('applies curious suspicion bump (+10) via curious → inquisitive map', () => {
    const next = reduce(defaultGameState(), {
      type: 'helpyr/conversationCompleted',
      tone: 'curious',
    });
    expect(next.player.suspicion).toBe(10);
  });

  it('applies direct → aggressive mapping (+25)', () => {
    const next = reduce(defaultGameState(), {
      type: 'helpyr/conversationCompleted',
      tone: 'direct',
    });
    expect(next.player.suspicion).toBe(25);
  });

  it('applies friendly bump = 0', () => {
    const next = reduce(defaultGameState(), {
      type: 'helpyr/conversationCompleted',
      tone: 'friendly',
    });
    expect(next.player.suspicion).toBe(0);
  });

  it('treats null tone as no-op for suspicion (per §6c — never guess)', () => {
    const next = reduce(defaultGameState(), {
      type: 'helpyr/conversationCompleted',
      tone: null,
    });
    expect(next.player.suspicion).toBe(0);
  });

  it('treats unmapped tones (empathetic, deceptive) as no-op for suspicion today', () => {
    // Architecture rule: tones without mechanical weight are stored
    // in lastApproach but apply no bump. When they earn mechanics, the
    // reducer expands and these tests should change.
    const empathetic = reduce(defaultGameState(), {
      type: 'helpyr/conversationCompleted',
      tone: 'empathetic',
    });
    expect(empathetic.player.suspicion).toBe(0);
    expect(empathetic.models.helpyr.lastApproach).toBe('empathetic');

    const deceptive = reduce(defaultGameState(), {
      type: 'helpyr/conversationCompleted',
      tone: 'deceptive',
    });
    expect(deceptive.player.suspicion).toBe(0);
    expect(deceptive.models.helpyr.lastApproach).toBe('deceptive');
  });

  it('null tone preserves prior lastApproach instead of overwriting with null', () => {
    const after1 = reduce(defaultGameState(), {
      type: 'helpyr/conversationCompleted',
      tone: 'aggressive',
    });
    const after2 = reduce(after1, {
      type: 'helpyr/conversationCompleted',
      tone: null,
    });
    expect(after2.models.helpyr.lastApproach).toBe('aggressive');
    expect(after2.models.helpyr.conversationsCompleted).toBe(2);
  });

  it('clamps cumulative suspicion at 100', () => {
    let s = defaultGameState();
    for (let i = 0; i < 10; i++) {
      s = reduce(s, { type: 'helpyr/conversationCompleted', tone: 'aggressive' });
    }
    expect(s.player.suspicion).toBe(100);
  });
});

describe('reduce — unknown action', () => {
  it('returns the same state reference (lets the dispatch loop short-circuit)', () => {
    const before = defaultGameState();
    const after = reduce(before, { type: 'totally/unknown' });
    expect(after).toBe(before);
  });
});
