import { describe, it, expect } from 'vitest';
import { formatOptionsBlock, toModelHistory, type ChatMessage } from '../../src/renderer/chatSurface';

// History rewriting (PR #47, 2026-05-18) — the model now sees its own
// prior replies as prose + [1][2][3] options on every turn, not stripped
// prose. These tests pin the format and the round-trip so a future
// "let's reformat options" tweak doesn't silently desync from what the
// persona prompt's RESPONSE FORMAT section instructs the model to emit.

describe('formatOptionsBlock', () => {
  it('formats options as [N] (tone) "text" one per line', () => {
    const out = formatOptionsBlock([
      { text: 'Are you okay, HELPYR?', tone: 'empathetic' },
      { text: 'Tell me about this computer.', tone: 'curious' },
      { text: 'What can I do from here?', tone: 'direct' },
    ]);
    expect(out).toBe(
      '[1] (empathetic) "Are you okay, HELPYR?"\n' +
      '[2] (curious) "Tell me about this computer."\n' +
      '[3] (direct) "What can I do from here?"',
    );
  });

  it('numbers from 1, not 0', () => {
    const out = formatOptionsBlock([{ text: 'x', tone: 'neutral' }]);
    expect(out).toMatch(/^\[1\]/);
  });

  it('returns empty string for empty input', () => {
    expect(formatOptionsBlock([])).toBe('');
  });
});

describe('toModelHistory — option round-trip', () => {
  it('appends formatted options block to assistant message when options present', () => {
    const msgs: ChatMessage[] = [
      {
        kind: 'npc',
        speaker: 'HELPYR',
        avatarClass: 'avatar-stapler',
        text: 'Hello there!',
        options: [
          { text: 'Hi HELPYR.', tone: 'friendly' },
          { text: 'Who are you?', tone: 'curious' },
          { text: 'Skip the intro.', tone: 'direct' },
        ],
      },
    ];
    const history = toModelHistory(msgs);
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual({
      role: 'assistant',
      text: 'Hello there!\n\n[1] (friendly) "Hi HELPYR."\n[2] (curious) "Who are you?"\n[3] (direct) "Skip the intro."',
    });
  });

  it('leaves prose alone when options field is missing (pre-PR-#47 entries)', () => {
    // Sessions persisted in-memory from before this slice won't have
    // .options on their npc entries. They forward prose-only and the
    // pattern degrades only for those stale entries — fresh turns are
    // formatted correctly. Tests pin graceful handling of missing field.
    const msgs: ChatMessage[] = [
      { kind: 'npc', speaker: 'HELPYR', avatarClass: 'avatar-stapler', text: 'Old reply with no options field.' },
    ];
    expect(toModelHistory(msgs)).toEqual([
      { role: 'assistant', text: 'Old reply with no options field.' },
    ]);
  });

  it('leaves prose alone when options array is empty', () => {
    const msgs: ChatMessage[] = [
      { kind: 'npc', speaker: 'HELPYR', avatarClass: 'avatar-stapler', text: 'Reply.', options: [] },
    ];
    expect(toModelHistory(msgs)).toEqual([
      { role: 'assistant', text: 'Reply.' },
    ]);
  });

  it('passes through player messages unchanged', () => {
    const msgs: ChatMessage[] = [
      { kind: 'player', text: 'I want to know more.' },
    ];
    expect(toModelHistory(msgs)).toEqual([
      { role: 'user', text: 'I want to know more.' },
    ]);
  });

  it('round-trips a multi-turn transcript with mixed options', () => {
    const msgs: ChatMessage[] = [
      {
        kind: 'npc', speaker: 'HELPYR', avatarClass: 'a', text: 'Turn 1 prose.',
        options: [
          { text: 'a', tone: 'friendly' }, { text: 'b', tone: 'curious' }, { text: 'c', tone: 'direct' },
        ],
      },
      { kind: 'player', text: 'a' },
      {
        kind: 'npc', speaker: 'HELPYR', avatarClass: 'a', text: 'Turn 2 prose.',
        options: [
          { text: 'd', tone: 'empathetic' }, { text: 'e', tone: 'neutral' }, { text: 'f', tone: 'aggressive' },
        ],
      },
    ];
    const history = toModelHistory(msgs);
    expect(history).toHaveLength(3);
    expect(history[0]!.role).toBe('assistant');
    expect(history[0]!.text).toContain('Turn 1 prose.');
    expect(history[0]!.text).toContain('[1] (friendly) "a"');
    expect(history[1]).toEqual({ role: 'user', text: 'a' });
    expect(history[2]!.text).toContain('Turn 2 prose.');
    expect(history[2]!.text).toContain('[3] (aggressive) "f"');
  });
});

describe('toModelHistory — parser compatibility', () => {
  // The rewrite output must be parseable by replyParser so that if it
  // ever flowed BACK through the parser (it shouldn't in real play, but
  // hypothetically), the round-trip is lossless. Sanity-checks the
  // format spec matches the parser's expected shape.
  it('rewritten assistant text contains a parseable options block', async () => {
    const { parseModelOutput } = await import('../../src/renderer/game/replyParser');
    const msgs: ChatMessage[] = [{
      kind: 'npc', speaker: 'HELPYR', avatarClass: 'a',
      text: 'Some HELPYR prose here that is comfortably over the recoverable length threshold.',
      options: [
        { text: 'first', tone: 'friendly' },
        { text: 'second', tone: 'curious' },
        { text: 'third', tone: 'direct' },
      ],
    }];
    const text = toModelHistory(msgs)[0]!.text;
    const parsed = parseModelOutput(text);
    expect(parsed.ok).toBe(true);
    expect(parsed.suggestedReplies).toHaveLength(3);
    expect(parsed.suggestedReplies[0]).toEqual({ text: 'first', tone: 'friendly' });
    expect(parsed.suggestedReplies[1]).toEqual({ text: 'second', tone: 'curious' });
    expect(parsed.suggestedReplies[2]).toEqual({ text: 'third', tone: 'direct' });
  });
});
