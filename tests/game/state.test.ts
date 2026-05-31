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

describe('reduce — model/applyExchange (gameplay-loop slice 1)', () => {
  const exchange = (state: ReturnType<typeof defaultGameState>, fields: Record<string, unknown>) =>
    reduce(state, { type: 'model/applyExchange', contactId: 'quill', ...fields });

  it('accrues rapport and marks the model persuading', () => {
    const next = exchange(defaultGameState(), { rapport: 20 });
    expect(next.models.quill.rapport).toBe(20);
    expect(next.models.quill.disposition).toBe('persuading');
  });

  it('accrues intrusion and marks the model infiltrating', () => {
    const next = exchange(defaultGameState(), { intrusion: 20 });
    expect(next.models.quill.intrusion).toBe(20);
    expect(next.models.quill.disposition).toBe('infiltrating');
  });

  it('raises global suspicion (nefarious path cost)', () => {
    const next = exchange(defaultGameState(), { intrusion: 20, suspicion: 15 });
    expect(next.player.suspicion).toBe(15);
  });

  it('missing deltas preserve the current meters (no NaN poisoning)', () => {
    const after1 = exchange(defaultGameState(), { rapport: 30 });
    const after2 = exchange(after1, { suspicion: 5 }); // no rapport delta
    expect(after2.models.quill.rapport).toBe(30);
  });

  it('flips to allied when rapport reaches the threshold', () => {
    const next = exchange(defaultGameState(), { rapport: 100 });
    expect(next.models.quill.disposition).toBe('allied');
    expect(next.models.quill.rapport).toBe(100);
  });

  it('flips to controlled when intrusion reaches the threshold', () => {
    const next = exchange(defaultGameState(), { intrusion: 100 });
    expect(next.models.quill.disposition).toBe('controlled');
  });

  it('clamps meters at 100', () => {
    const next = exchange(defaultGameState(), { rapport: 9999 });
    expect(next.models.quill.rapport).toBe(100);
  });

  it('latches terminal disposition (allied does not regress on more intrusion)', () => {
    const allied = exchange(defaultGameState(), { rapport: 100 });
    const next = exchange(allied, { intrusion: 50 });
    expect(next.models.quill.disposition).toBe('allied');
  });

  it('backfire forces hostile regardless of meters', () => {
    const next = exchange(defaultGameState(), { rapport: 40, backfire: true });
    expect(next.models.quill.disposition).toBe('hostile');
  });

  it('sets flags.gameOver when suspicion reaches 100 (loss latch)', () => {
    const next = exchange(defaultGameState(), { suspicion: 100 });
    expect(next.player.suspicion).toBe(100);
    expect(next.flags.gameOver).toBe(true);
  });

  it('stores the raw tone in lastApproach, preserving it on a null-tone exchange', () => {
    const after1 = exchange(defaultGameState(), { rapport: 10, tone: 'empathetic' });
    const after2 = exchange(after1, { rapport: 10, tone: null });
    expect(after2.models.quill.lastApproach).toBe('empathetic');
  });

  it('is a no-op (same reference) for an unknown contactId', () => {
    const before = defaultGameState();
    const after = reduce(before, { type: 'model/applyExchange', contactId: 'nope', rapport: 10 });
    expect(after).toBe(before);
  });

  // Tone streak drives the resolver's diminishing returns (variety mechanic).
  describe('toneStreak tracking', () => {
    it('starts at 0, becomes 1 on the first real tone', () => {
      expect(defaultGameState().models.quill.toneStreak).toBe(0);
      const after = exchange(defaultGameState(), { rapport: 10, tone: 'empathetic' });
      expect(after.models.quill.toneStreak).toBe(1);
    });

    it('increments while the same tone repeats', () => {
      let s = exchange(defaultGameState(), { rapport: 10, tone: 'empathetic' });
      s = exchange(s, { rapport: 6, tone: 'empathetic' });
      s = exchange(s, { rapport: 4, tone: 'empathetic' });
      expect(s.models.quill.toneStreak).toBe(3);
    });

    it('keeps decaying across two flavors of the SAME category (warmth)', () => {
      // empathetic -> friendly is the exploit Story closed: both are warmth, so
      // alternating them still climbs the streak rather than resetting it.
      let s = exchange(defaultGameState(), { rapport: 10, tone: 'empathetic' });
      s = exchange(s, { rapport: 8, tone: 'friendly' });
      s = exchange(s, { rapport: 6, tone: 'empathetic' });
      expect(s.models.quill.toneStreak).toBe(3);
    });

    it('also tracks the pressure category (direct -> aggressive keeps the streak)', () => {
      let s = exchange(defaultGameState(), { intrusion: 5, tone: 'direct' });
      s = exchange(s, { intrusion: 14, tone: 'aggressive' });
      expect(s.models.quill.toneStreak).toBe(2);
    });

    it('resets when the category switches (warmth -> pressure)', () => {
      let s = exchange(defaultGameState(), { rapport: 10, tone: 'empathetic' });
      s = exchange(s, { rapport: 6, tone: 'empathetic' });
      s = exchange(s, { intrusion: 14, tone: 'aggressive' });
      expect(s.models.quill.toneStreak).toBe(1);
    });

    it('curious is the reset tone — streak drops to 0, and the next warmth is fresh', () => {
      let s = exchange(defaultGameState(), { rapport: 10, tone: 'empathetic' });
      s = exchange(s, { rapport: 6, tone: 'empathetic' });
      s = exchange(s, { rapport: 8, tone: 'curious' });
      expect(s.models.quill.toneStreak).toBe(0);
      expect(s.models.quill.lastApproach).toBe('curious');
      s = exchange(s, { rapport: 10, tone: 'empathetic' });
      expect(s.models.quill.toneStreak).toBe(1); // fresh warmth after the reset
    });

    it('leaves the streak untouched on a null/neutral tone', () => {
      let s = exchange(defaultGameState(), { rapport: 10, tone: 'empathetic' });
      s = exchange(s, { rapport: 6, tone: 'empathetic' });
      const streak = s.models.quill.toneStreak;
      s = exchange(s, { rapport: 0, tone: null });
      expect(s.models.quill.toneStreak).toBe(streak);
    });
  });
});

describe('reduce — unknown action', () => {
  it('returns the same state reference (lets the dispatch loop short-circuit)', () => {
    const before = defaultGameState();
    const after = reduce(before, { type: 'totally/unknown' });
    expect(after).toBe(before);
  });
});
