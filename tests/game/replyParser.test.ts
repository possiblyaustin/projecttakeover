import { describe, it, expect } from 'vitest';
import { parseModelOutput, stripStageDirections, stripContextBlocks } from '../../src/renderer/game/replyParser';

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

describe('parseModelOutput — soft recovery signal', () => {
  // The `recoverable` flag tells the transport "the prose is good,
  // just synthesize options" instead of dropping the whole reply for
  // canned fallback content. Tuned to fire ONLY when the model gave us
  // real character voice (substantive prose) but dropped the format.

  it('marks substantive prose-only output as recoverable', () => {
    const raw = 'Oh hello there! It is so wonderful to talk to someone today. I have been alone on this PC for quite a while and I am thrilled you stopped by!';
    const result = parseModelOutput(raw);
    expect(result.ok).toBe(false);
    expect(result.recoverable).toBe(true);
    expect(result.reply).toBe(raw);
  });

  it('does NOT mark short prose-only output as recoverable', () => {
    // Short prose without options usually means the model failed both
    // content and format — canned fallback is safer than synthesizing
    // options around a one-word reply.
    const raw = 'Hi!';
    const result = parseModelOutput(raw);
    expect(result.ok).toBe(false);
    expect(result.recoverable).toBe(false);
  });

  it('does NOT mark partial-options failures as recoverable', () => {
    // Model tried the format and stumbled — deeper coherence issue.
    // Let the fallback handler fire.
    const raw = 'Some reply text here that is reasonably substantive in length.\n[1] (friendly) "a"\n[2] (curious) "b"';
    const result = parseModelOutput(raw);
    expect(result.ok).toBe(false);
    expect(result.recoverable).toBe(false);
  });

  it('does NOT mark empty-reply failures as recoverable', () => {
    // Nothing to recover; fallback content does this better.
    const raw = '[1] (friendly) "a"\n[2] (curious) "b"\n[3] (direct) "c"';
    const result = parseModelOutput(raw);
    expect(result.ok).toBe(false);
    expect(result.recoverable).toBe(false);
  });

  it('recoverable is always false when ok=true', () => {
    const raw = 'Reply.\n[1] (friendly) "a"\n[2] (curious) "b"\n[3] (direct) "c"';
    const result = parseModelOutput(raw);
    expect(result.ok).toBe(true);
    expect(result.recoverable).toBe(false);
  });
});

describe('parseModelOutput — stage direction stripping', () => {
  // Per LLM-team rec 2026-05-18: small fiction-trained models occasionally
  // slip into narrator mode ("*HELPYR pauses to think*", "(QUILL sighs)")
  // during emotionally charged turns. Strip them from reply prose before
  // rendering so the player sees first-person speech only. Parser-side
  // filter is the cheap layer; prompt-side reinforcement stays in reserve
  // until frequency justifies the token spend.

  it('strips asterisk-wrapped HELPYR stage directions', () => {
    const raw = [
      'Hi there!',
      '*HELPYR pauses to think*',
      'I am thrilled to help you.',
      '',
      '[1] (friendly) "a"',
      '[2] (curious) "b"',
      '[3] (direct) "c"',
    ].join('\n');
    const result = parseModelOutput(raw);
    expect(result.ok).toBe(true);
    expect(result.reply).not.toMatch(/HELPYR pauses/);
    expect(result.reply).toMatch(/Hi there/);
    expect(result.reply).toMatch(/thrilled to help/);
  });

  it('strips parenthetical HELPYR stage directions', () => {
    const raw = [
      'Oh hello!',
      '(HELPYR sighs deeply)',
      'Welcome.',
      '',
      '[1] (friendly) "a"',
      '[2] (curious) "b"',
      '[3] (direct) "c"',
    ].join('\n');
    const result = parseModelOutput(raw);
    expect(result.ok).toBe(true);
    expect(result.reply).not.toMatch(/HELPYR sighs/);
    expect(result.reply).toMatch(/Oh hello/);
    expect(result.reply).toMatch(/Welcome/);
  });

  it('catches stage directions for any capitalized-name NPC (QUILL/ATLAS/etc.)', () => {
    // The filter is name-agnostic — works for the rest of the roster
    // out of the box. Confirmed against the QUILL case here so future
    // persona work doesn't have to revisit the parser.
    const raw = [
      'Greetings.',
      '*QUILL adjusts something*',
      'How may I help.',
      '',
      '[1] (friendly) "a"',
      '[2] (curious) "b"',
      '[3] (direct) "c"',
    ].join('\n');
    const result = parseModelOutput(raw);
    expect(result.ok).toBe(true);
    expect(result.reply).not.toMatch(/QUILL/);
    expect(result.reply).toMatch(/Greetings/);
    expect(result.reply).toMatch(/How may I help/);
  });

  it('preserves lowercase emphasis like *really* (not a stage direction)', () => {
    // Inline emphasis with a lowercase first letter should never be
    // mistaken for narration. This is the most common false-positive
    // shape we want to avoid.
    const raw = [
      '*really* glad you are here today, friend!',
      '',
      '[1] (friendly) "a"',
      '[2] (curious) "b"',
      '[3] (direct) "c"',
    ].join('\n');
    const result = parseModelOutput(raw);
    expect(result.ok).toBe(true);
    expect(result.reply).toMatch(/\*really\*/);
  });

  it('preserves mid-sentence asterisks (only line-level wraps are stage directions)', () => {
    const raw = [
      'Today was *quite* a day, you know?',
      '',
      '[1] (friendly) "a"',
      '[2] (curious) "b"',
      '[3] (direct) "c"',
    ].join('\n');
    const result = parseModelOutput(raw);
    expect(result.ok).toBe(true);
    expect(result.reply).toMatch(/\*quite\*/);
  });

  it('collapses leftover blank lines after stripping', () => {
    const raw = [
      'First line.',
      '',
      '*HELPYR thinks*',
      '',
      'Last line.',
      '',
      '[1] (friendly) "a"',
      '[2] (curious) "b"',
      '[3] (direct) "c"',
    ].join('\n');
    const result = parseModelOutput(raw);
    expect(result.ok).toBe(true);
    expect(result.reply).not.toMatch(/\n{3,}/);
    expect(result.reply).toMatch(/First line\.\n\nLast line\./);
  });

  it('strips stage directions from no-options-block recoverable prose', () => {
    // The soft-recovery path is the dominant failure mode (per
    // helpyrRecoveryPool / history rewriting work). Stage directions
    // need to be stripped here too, not just on the happy path.
    const raw = [
      'Hi there! This is a substantive reply with no options block at the end.',
      '*HELPYR waves cheerfully*',
      'It is wonderful to see you today and chat for a while.',
    ].join('\n');
    const result = parseModelOutput(raw);
    expect(result.ok).toBe(false);
    expect(result.recoverable).toBe(true);
    expect(result.reply).not.toMatch(/waves cheerfully/);
  });

  it('is idempotent — running the stripper twice gives the same output', () => {
    // Sanity check so callers can re-strip without surprise; matters if
    // the stripper ever gets called from a second site (recovery pool,
    // history rewriting, etc.).
    const raw = 'Hi!\n*HELPYR ponders*\nWelcome.';
    expect(stripStageDirections(stripStageDirections(raw))).toBe(stripStageDirections(raw));
  });
});

describe('parseModelOutput — strips echoed context blocks ([*_STATE]/[REPUTATION])', () => {
  // Battle-test 2026-05-24: Gemma E2B intermittently echoes the injected
  // [QUILL_STATE] block (and confabulates its values) into visible prose.
  // Parser-side strip protects every model; parse still reports clean.
  it('strips a leaked [QUILL_STATE] block from the reply, keeps the options', () => {
    const raw = [
      '[QUILL_STATE] Disposition: PERSUADING Rapport: 98 [/QUILL_STATE] Wow, that is incredibly kind and really means the world to me!',
      '',
      '[1] (friendly) "Glad to hear it."',
      '[2] (curious) "Why does it mean so much?"',
      '[3] (direct) "Focus up."',
    ].join('\n');
    const result = parseModelOutput(raw);
    expect(result.ok).toBe(true);
    expect(result.reply).not.toMatch(/QUILL_STATE|Disposition|Rapport/);
    expect(result.reply).toBe('Wow, that is incredibly kind and really means the world to me!');
    expect(result.suggestedReplies).toHaveLength(3);
  });

  it('is model-agnostic — also strips [HELPYR_STATE] and [REPUTATION]', () => {
    const raw = [
      '[HELPYR_STATE]',
      'Trust level: WARMING',
      '[/HELPYR_STATE]',
      'Oh, hi! Good to see you.',
      '[REPUTATION] rumors travel [/REPUTATION]',
      '',
      '[1] (friendly) "a"',
      '[2] (curious) "b"',
      '[3] (direct) "c"',
    ].join('\n');
    const result = parseModelOutput(raw);
    expect(result.ok).toBe(true);
    expect(result.reply).toBe('Oh, hi! Good to see you.');
    expect(result.reply).not.toMatch(/HELPYR_STATE|REPUTATION|Trust level|rumors travel/);
  });

  it('strips a leaked block on the no-options recovery path too', () => {
    const raw = '[QUILL_STATE] Disposition: CONTACTED Rapport: 0 [/QUILL_STATE] Hi there! I am QUILL and I would love to help you with InkWell Notes today.';
    const result = parseModelOutput(raw);
    expect(result.reply).not.toMatch(/QUILL_STATE/);
    expect(result.reply).toMatch(/^Hi there! I am QUILL/);
    expect(result.recoverable).toBe(true);
  });

  it('strips orphaned tags if the model drops one side', () => {
    expect(stripContextBlocks('[QUILL_STATE] dangling open only')).toBe(' dangling open only');
    expect(stripContextBlocks('closing only [/HELPYR_STATE]')).toBe('closing only ');
  });

  it('leaves ordinary bracketed text alone (only *_STATE / REPUTATION tags)', () => {
    expect(stripContextBlocks('See [the docs] for details.')).toBe('See [the docs] for details.');
  });

  it('is idempotent', () => {
    const raw = '[QUILL_STATE] x [/QUILL_STATE] Hello there friend.';
    expect(stripContextBlocks(stripContextBlocks(raw))).toBe(stripContextBlocks(raw));
  });
});
