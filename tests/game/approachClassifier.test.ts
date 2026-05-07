import { describe, it, expect, vi } from 'vitest';
import { classifyApproach } from '../../src/renderer/game/approachClassifier';
import type { ApproachTone } from '../../src/renderer/game/modelService';

describe('classifyApproach — option pick (layer 1)', () => {
  it('returns the tone carried on the SuggestedReply', () => {
    const tone = classifyApproach({
      kind: 'option',
      reply: { text: 'whatever', tone: 'curious' },
    });
    expect(tone).toBe('curious');
  });

  it('falls back to neutral when the reply has no tone (defensive)', () => {
    const tone = classifyApproach({
      kind: 'option',
      reply: { text: 'whatever', tone: '' as unknown as ApproachTone },
    });
    expect(tone).toBe('neutral');
  });
});

describe('classifyApproach — freeform (layer 2)', () => {
  it('delegates to the per-character keyword classifier', () => {
    const perCharacter = vi.fn<(input: string) => ApproachTone>().mockReturnValue('aggressive');
    const tone = classifyApproach({
      kind: 'freeform',
      text: 'shut down everything',
      perCharacter,
    });
    expect(tone).toBe('aggressive');
    expect(perCharacter).toHaveBeenCalledWith('shut down everything');
  });

  it('honors layer-3 contract: per-character returning neutral surfaces neutral (no guessing)', () => {
    // §6c: "NEVER guess — 'neutral' tells the reducer to apply no
    // suspicion swing." classifyApproach must not second-guess the
    // per-character classifier with its own keyword logic.
    const perCharacter = () => 'neutral' as ApproachTone;
    const tone = classifyApproach({
      kind: 'freeform',
      text: 'I will burn your servers',
      perCharacter,
    });
    expect(tone).toBe('neutral');
  });
});
