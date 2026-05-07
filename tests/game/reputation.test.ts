import { describe, it, expect } from 'vitest';
import { buildReputationContext } from '../../src/renderer/game/reputation';
import { defaultGameState } from '../../src/renderer/game/state';
import type { GameStateShape } from '../../src/renderer/game/state';

// Helper: synthesize a state where a given model has been contacted N
// times with a given last approach. Tests stay declarative — they don't
// have to know the GameStateShape internals.
function withContact(
  modelId: 'helpyr' | 'quill',
  conversationsCompleted: number,
  lastApproach: string | null,
): GameStateShape {
  const base = defaultGameState();
  return {
    ...base,
    models: {
      ...base.models,
      [modelId]: {
        ...base.models[modelId],
        conversationsCompleted,
        lastApproach,
      },
    },
  };
}

describe('buildReputationContext — empty cases', () => {
  it('returns "" when no other models have been contacted', () => {
    expect(buildReputationContext('helpyr', defaultGameState())).toBe('');
  });

  it('excludes the target model from its own rumor pool', () => {
    // HELPYR is the only contacted model — the target is HELPYR — so
    // there are no "other" models with signal. Empty output.
    const state = withContact('helpyr', 5, 'aggressive');
    expect(buildReputationContext('helpyr', state)).toBe('');
  });
});

describe('buildReputationContext — peripheral chatter', () => {
  it('emits a [REPUTATION] block when a non-watched model has been contacted', () => {
    const state = withContact('helpyr', 1, 'friendly');
    const block = buildReputationContext('quill', state);
    expect(block).toMatch(/^\[REPUTATION\]/);
    expect(block).toMatch(/\[\/REPUTATION\]$/);
    expect(block).toMatch(/network chatter/i);
  });

  it('mentions the contacted model name when only one peripheral exists', () => {
    const state = withContact('helpyr', 1, 'friendly');
    const block = buildReputationContext('quill', state);
    expect(block).toMatch(/HELPYR/);
  });

  it('colors the rumor with the most recent approach descriptor', () => {
    const state = withContact('helpyr', 1, 'aggressive');
    const block = buildReputationContext('quill', state);
    expect(block).toMatch(/aggressively/);
  });

  it('omits the recency line when lastApproach is null', () => {
    const state = withContact('helpyr', 1, null);
    const block = buildReputationContext('quill', state);
    expect(block).not.toMatch(/most recent reports/i);
  });

  it('omits the recency line when lastApproach has no human descriptor', () => {
    // 'neutral' is intentionally not in APPROACH_DESCRIPTIONS — neutral
    // contact carries no narrative color.
    const state = withContact('helpyr', 1, 'neutral');
    const block = buildReputationContext('quill', state);
    expect(block).not.toMatch(/most recent reports/i);
  });
});
