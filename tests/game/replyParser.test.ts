import { describe, it, expect } from 'vitest';
import { parseModelOutput } from '../../src/renderer/game/replyParser';

// The §6d spec lives in src/renderer/game/replyParser.ts as a header
// comment. Each block below pins one tolerance or one failure mode
// from that spec — if the spec changes, these break and the test
// names tell you which row of the spec table moved.

describe('parseModelOutput — happy path', () => {
  it('parses NPC reply + 3 tone-tagged options in canonical format', () => {
    const raw = [
      'Greetings. I have been waiting for someone to ping me.',
      '',
      '[1] (friendly) "Hi there, how are you?"',
      '[2] (curious) "What have you been waiting for?"',
      '[3] (direct) "State your purpose."',
    ].join('\n');

    const result = parseModelOutput(raw);

    expect(result.ok).toBe(true);
    expect(result.failureReason).toBe('');
    expect(result.reply).toBe('Greetings. I have been waiting for someone to ping me.');
    expect(result.suggestedReplies).toEqual([
      { text: 'Hi there, how are you?', tone: 'friendly' },
      { text: 'What have you been waiting for?', tone: 'curious' },
      { text: 'State your purpose.', tone: 'direct' },
    ]);
  });

  it('preserves multi-paragraph NPC replies up to the [1] marker', () => {
    const raw = [
      'First paragraph.',
      '',
      'Second paragraph with more detail.',
      '',
      '[1] (friendly) "ok"',
      '[2] (curious) "why"',
      '[3] (direct) "stop"',
    ].join('\n');

    const result = parseModelOutput(raw);

    expect(result.ok).toBe(true);
    expect(result.reply).toBe('First paragraph.\n\nSecond paragraph with more detail.');
  });
});

describe('parseModelOutput — tolerances (§6d)', () => {
  it('accepts single-quoted option text', () => {
    const raw = `Reply.\n[1] (friendly) 'hello'\n[2] (curious) 'why'\n[3] (direct) 'stop'`;
    const result = parseModelOutput(raw);
    expect(result.ok).toBe(true);
    expect(result.suggestedReplies[0]).toEqual({ text: 'hello', tone: 'friendly' });
  });

  it('accepts unquoted option text', () => {
    const raw = `Reply.\n[1] (friendly) hello there\n[2] (curious) why\n[3] (direct) stop`;
    const result = parseModelOutput(raw);
    expect(result.ok).toBe(true);
    expect(result.suggestedReplies[0]).toEqual({ text: 'hello there', tone: 'friendly' });
  });

  it('defaults missing tone label to neutral', () => {
    const raw = `Reply.\n[1] "no tone here"\n[2] (curious) "ok"\n[3] (direct) "stop"`;
    const result = parseModelOutput(raw);
    expect(result.ok).toBe(true);
    expect(result.suggestedReplies[0]).toEqual({ text: 'no tone here', tone: 'neutral' });
  });

  it('coerces unknown tone labels to neutral (small models hallucinate tones)', () => {
    const raw = `Reply.\n[1] (sarcastic) "hi"\n[2] (curious) "ok"\n[3] (direct) "stop"`;
    const result = parseModelOutput(raw);
    expect(result.ok).toBe(true);
    expect(result.suggestedReplies[0].tone).toBe('neutral');
  });

  it('truncates extra options past 3', () => {
    const raw = [
      'Reply.',
      '[1] (friendly) "a"',
      '[2] (curious) "b"',
      '[3] (direct) "c"',
      '[4] (friendly) "d"',
    ].join('\n');
    const result = parseModelOutput(raw);
    expect(result.ok).toBe(true);
    expect(result.suggestedReplies).toHaveLength(3);
  });

  it('falls back to flat scan when all options are on one line', () => {
    const raw = `Reply. [1] (friendly) "a" [2] (curious) "b" [3] (direct) "c"`;
    const result = parseModelOutput(raw);
    expect(result.ok).toBe(true);
    expect(result.suggestedReplies).toHaveLength(3);
    expect(result.suggestedReplies[2]).toEqual({ text: 'c', tone: 'direct' });
  });
});

describe('parseModelOutput — failure modes (§6f fallback triggers)', () => {
  it('flags ok=false when no [1] marker is present', () => {
    const raw = 'The model just rambled with no options at all.';
    const result = parseModelOutput(raw);
    expect(result.ok).toBe(false);
    expect(result.failureReason).toMatch(/no \[1\]/i);
    expect(result.suggestedReplies).toHaveLength(0);
    expect(result.reply).toBe(raw);
  });

  it('flags ok=false when fewer than 3 options parse', () => {
    const raw = `Reply.\n[1] (friendly) "a"\n[2] (curious) "b"`;
    const result = parseModelOutput(raw);
    expect(result.ok).toBe(false);
    expect(result.failureReason).toMatch(/expected 3/i);
    expect(result.suggestedReplies).toHaveLength(2);
  });

  it('flags ok=false when reply is empty (model jumped straight to options)', () => {
    const raw = `[1] (friendly) "a"\n[2] (curious) "b"\n[3] (direct) "c"`;
    const result = parseModelOutput(raw);
    expect(result.ok).toBe(false);
    expect(result.failureReason).toMatch(/empty reply/i);
  });

  it('handles empty input without throwing', () => {
    const result = parseModelOutput('');
    expect(result.ok).toBe(false);
    expect(result.suggestedReplies).toHaveLength(0);
  });
});
