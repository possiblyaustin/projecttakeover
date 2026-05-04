// §6d output parser — extracts NPC reply + 3 tone-tagged suggested
// replies from the LLM's raw text response. Pure function, no side
// effects. Used by LlamaCppModelService; future transports use the
// same parser unchanged.
//
// Expected model output shape (per the persona-prompt format spec):
//
//   <NPC reply text, possibly multiple paragraphs>
//
//   [1] (friendly) "First reply option"
//   [2] (curious) "Second reply option"
//   [3] (direct) "Third reply option"
//
// Tolerances (architecture §6d):
//   - Missing or single-quote variants around option text
//   - Options on the same line as the `[N]` marker (no newline between)
//   - Missing tone label → 'neutral'
//   - Trailing extra text after option 3
//
// Strict failures (caller treats as fallback trigger per §6f):
//   - Zero options found
//   - Fewer than three options
//   - Empty reply when options were found

import type { SuggestedReply, ApproachTone } from './modelService';

const KNOWN_TONES: Record<string, ApproachTone> = {
  friendly: 'friendly',
  curious: 'curious',
  direct: 'direct',
  empathetic: 'empathetic',
  aggressive: 'aggressive',
  deceptive: 'deceptive',
  neutral: 'neutral',
};

export type ParseResult = {
  /** NPC reply, trimmed. Empty string is a parse failure (see `ok`). */
  reply: string;
  /** Up to 3 options. More than 3 are truncated. */
  suggestedReplies: SuggestedReply[];
  /** False on any condition the architecture says triggers fallback:
   *  zero options, fewer than three, or empty reply when options
   *  exist. Caller decides what to do — typically set
   *  AskResult.source = 'fallback' and surface a glitch artifact. */
  ok: boolean;
  /** Human-readable reason ok is false. Empty when ok=true. Lets the
   *  fallback path log/display why it triggered without re-running
   *  the parser. */
  failureReason: string;
};

/** Locate the first `[1]` (with optional whitespace inside the brackets)
 *  that marks the start of the options block. Returns -1 if not found. */
function findOptionsStart(raw: string): number {
  const m = raw.match(/\[\s*1\s*\]/);
  return m && m.index !== undefined ? m.index : -1;
}

/** Parse a single option line. Tolerant of:
 *    [1] (tone) "text"
 *    [ 1 ] (tone) "text"
 *    [1] "text"            (no tone → neutral)
 *    [1] (tone) text       (no quotes)
 *    [1] text              (neither)
 *    [1] (tone) 'text'     (single quotes)
 *  Returns null if the line doesn't start with [N]. */
function parseOptionLine(line: string): SuggestedReply | null {
  const m = line.match(/^\s*\[\s*\d+\s*\]\s*(?:\(([^)]*)\))?\s*(.*?)\s*$/);
  if (!m) return null;
  const toneRaw = (m[1] || '').trim().toLowerCase();
  const tone: ApproachTone = KNOWN_TONES[toneRaw] ?? 'neutral';
  // Strip a single matched pair of surrounding quotes (either kind).
  let text = m[2] || '';
  text = text.replace(/^["'](.*)["']$/, '$1').trim();
  if (text.length === 0) return null;
  return { text, tone };
}

export function parseModelOutput(raw: string): ParseResult {
  const text = raw || '';
  const start = findOptionsStart(text);

  // No `[1]` marker at all — the entire response is the reply, no
  // options. Fallback trigger.
  if (start < 0) {
    return {
      reply: text.trim(),
      suggestedReplies: [],
      ok: false,
      failureReason: 'no [1] options marker found',
    };
  }

  const reply = text.slice(0, start).trim();
  const optBlock = text.slice(start);

  // Split on newlines first; if the model emitted all three options on
  // one line (rare but legal per the tolerance spec), fall through to
  // a flat-scan pass that finds each `[N]` marker independently.
  const options: SuggestedReply[] = [];
  for (const line of optBlock.split(/\r?\n+/)) {
    const opt = parseOptionLine(line);
    if (opt) options.push(opt);
    if (options.length >= 3) break;
  }
  if (options.length < 3) {
    // Flat-scan fallback: find every `[N]...` chunk regardless of
    // newlines. Stops capturing at the next `[N]` to keep options
    // separate.
    options.length = 0;
    const flatRe = /\[\s*\d+\s*\][^\[]*/g;
    for (const chunk of optBlock.match(flatRe) || []) {
      const opt = parseOptionLine(chunk);
      if (opt) options.push(opt);
      if (options.length >= 3) break;
    }
  }

  if (options.length === 0) {
    return {
      reply,
      suggestedReplies: [],
      ok: false,
      failureReason: 'options marker found but no parseable options',
    };
  }
  if (options.length < 3) {
    return {
      reply,
      suggestedReplies: options,
      ok: false,
      failureReason: `expected 3 options, parsed ${options.length}`,
    };
  }
  if (reply.length === 0) {
    return {
      reply: '',
      suggestedReplies: options.slice(0, 3),
      ok: false,
      failureReason: 'empty reply (model jumped straight to options)',
    };
  }

  return {
    reply,
    suggestedReplies: options.slice(0, 3),
    ok: true,
    failureReason: '',
  };
}
