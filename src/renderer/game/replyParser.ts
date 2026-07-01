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
//
// Soft-recovery signal (`recoverable: true`): the parser sets this when
// the failure mode is specifically "model gave us substantive prose but
// forgot the [1][2][3] options block." 2026-05-16 stress test showed
// this is by far the dominant failure mode for HELPYR (Gemma E2B
// dropping the format ~50% of turns past depth 5). The transport can
// synthesize generic continuation options and pass the real LLM reply
// through to the player instead of routing to canned fallback content.

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
  /** When ok=false: true if the failure is salvageable — the model gave
   *  us a substantive prose reply but dropped the options block. The
   *  transport can keep the reply and synthesize generic options rather
   *  than routing to canned fallback content. False for transport
   *  errors, empty replies, and other unrecoverable conditions.
   *  Always false when ok=true (no recovery needed). */
  recoverable: boolean;
  /** Human-readable reason ok is false. Empty when ok=true. Lets the
   *  fallback path log/display why it triggered without re-running
   *  the parser. */
  failureReason: string;
};

/** Minimum reply length (chars) for a no-options-block failure to be
 *  considered recoverable. Short prose ("Hi.", "OK!") usually means the
 *  model also failed to produce real content, not just the format —
 *  better to take the canned fallback than render a one-word reply
 *  with synthesized options. Tuned conservatively. */
const MIN_RECOVERABLE_REPLY_LENGTH = 40;

/** Stage-direction lines the model occasionally emits in narrator mode —
 *  e.g. "*HELPYR pauses to think*" or "(QUILL sighs deeply)" — that
 *  break first-person voice. Both patterns match a whole line wrapped
 *  in either asterisks or parens that starts with a Capitalized or
 *  ALLCAPS name. Inline mid-sentence wraps and lowercase emphasis like
 *  *really* are left alone (more likely to be emphasis than narration).
 *
 *  Per LLM-team rec 2026-05-18: parser-side filter first since it's
 *  cheapest; prompt-side reinforcement only if frequency climbs. */
const STAGE_DIRECTION_PATTERNS: RegExp[] = [
  /^[ \t]*\*[ \t]*[A-Z][A-Za-z]*\b[^*\n]*\*[ \t]*$/gm,
  /^[ \t]*\([ \t]*[A-Z][A-Za-z]*\b[^)\n]*\)[ \t]*$/gm,
];

/** INLINE stage directions wrapped in asterisk-parens — `*(The forced warmth
 *  fractures...)*` — which a model emits MID-prose, not on their own line, so
 *  the line-anchored patterns above miss them. The `*(` … `)*` shape is never
 *  legitimate emphasis, so this is safe to strip anywhere it appears, collapsing
 *  the surrounding whitespace to a single space. (Evergreen live leak,
 *  2026-06-11.) */
const INLINE_PAREN_STAGE = /\s*\*\s*\([^)\n]*\)\s*\*\s*/g;

/** Strip stage-direction lines from NPC reply prose. Idempotent. Leaves
 *  paragraph breaks intact but collapses the triple-newline gap left
 *  behind when an entire line is removed. */
export function stripStageDirections(prose: string): string {
  let out = prose;
  for (const re of STAGE_DIRECTION_PATTERNS) {
    out = out.replace(re, '');
  }
  out = out.replace(INLINE_PAREN_STAGE, ' ');
  return out.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}

/** Strip Markdown scaffolding a small model sometimes wraps its answer in —
 *  section dividers (`***`, `---`), bold "header" labels (`**The Core
 *  Deliverable (Example of a compliant output):**`), stray emphasis markers, and
 *  the "(Example of …)" meta-notes that label sample output. None of these are
 *  natural in-character dialogue; they read as the model formatting a document
 *  instead of speaking. Model-agnostic (surfaced on controlled MUSE, 2026-07-01),
 *  applied to reply prose only so option parsing is untouched. Idempotent.
 *
 *  NOTE: this cleans the *formatting* leak. The deeper tendency of controlled
 *  MUSE to frame replies as a labelled "compliant output" is a persona-prompt
 *  tuning item (Story) — see docs/wavecrowd-feed-design/build-decisions_v1.md. */
export function stripMarkdownScaffolding(prose: string): string {
  return prose
    // Bold label headers ending in a colon: **Something (…):** — a section
    // title, never dialogue. Remove the whole span.
    .replace(/\*\*[^*\n]*:\*\*/g, '')
    // Meta-notes that announce example/sample output.
    .replace(/\(\s*(?:example|sample|e\.g\.|for example)\b[^)\n]*\)/gi, '')
    // Whole-line horizontal-rule dividers (***, ---, ___, * * *).
    .replace(/^[ \t]*([*_-][ \t]*){3,}$/gm, '')
    // Inline divider runs (three or more asterisks mid-line).
    .replace(/\*{3,}/g, '')
    // Unwrap remaining bold, keep the text.
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    // Any leftover stray bold/rule markers.
    .replace(/\*\*|__/g, '')
    .replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([.,!?;:])/g, '$1') // tidy spaces left before punctuation
    .trim();
}

/** Tags for the context blocks the game INJECTS into the system prompt —
 *  the per-model `[*_STATE]` blocks (e.g. [QUILL_STATE], [HELPYR_STATE])
 *  and the `[REPUTATION]` block. */
const CONTEXT_BLOCK_TAG = '(?:[A-Z0-9_]*_(?:STATE|SESSION)|REPUTATION)';

/** ALL-CAPS field labels that live INSIDE the injected state blocks. A
 *  small model sometimes leaks one of these lines on its own — without the
 *  surrounding [TAG] wrapper — when it paraphrases its instructions instead
 *  of speaking in character. They never occur in natural first-person
 *  dialogue, so any whole line that starts with one is scaffolding the
 *  player must not see. (QUILL_STATE BEHAVIOR/DIRECTIVE lines, live leak
 *  2026-05-30.) */
const SCAFFOLD_LABEL_LINE = /^[ \t]*(?:BEHAVIOR|DIRECTIVE|NEW TOPICS)[ \t]*:.*$/gim;

/** Strip any injected context block the model echoed back into visible
 *  prose. Small models (Gemma E2B) intermittently parrot — and even
 *  confabulate — these blocks from their context; they must never reach
 *  the player. Idempotent.
 *
 *  Handles the shapes seen in live play, in an order that preserves the
 *  "orphan open keeps its trailing text" contract the tests pin down:
 *    1. Well-formed `[TAG]…[/TAG]` pairs.
 *    2. The parenthesized reformat a small model paraphrases the block
 *       into — `(QUILL_STATE: …, BEHAVIOR: …, DIRECTIVE: …)` — non-greedy
 *       to the first ')'. The block's own text never contains one, so the
 *       real reply that follows the close paren survives (live nefarious-
 *       path leak, 2026-05-30).
 *    3. The same reformat left UNclosed — a dangling `(TAG …` to end of
 *       line. Requires the leading '(' so a bare orphan bracket (step 4)
 *       keeps its trailing prose.
 *    4. Orphaned open/close brackets left if the model dropped one side.
 *    5. Standalone ALL-CAPS scaffold label lines leaked without a wrapper.
 *
 *  Applied to the whole raw response BEFORE parsing (see parseModelOutput)
 *  so a leaked block can't land in the reply OR confuse option detection.
 *  Model-agnostic by design — protects every present and future model,
 *  not just the one that surfaced it (QUILL, battle-test 2026-05-24). */
export function stripContextBlocks(s: string): string {
  const tag = CONTEXT_BLOCK_TAG;
  return s
    .replace(new RegExp(`\\[${tag}\\][\\s\\S]*?\\[\\/${tag}\\]`, 'gi'), '')
    .replace(new RegExp(`\\(\\s*${tag}\\b[^)]*\\)`, 'gi'), '')
    .replace(new RegExp(`\\(\\s*${tag}\\b[^)\\n]*$`, 'gim'), '')
    .replace(new RegExp(`\\[\\/?${tag}\\]`, 'gi'), '')
    .replace(SCAFFOLD_LABEL_LINE, '');
}

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
  // Preserve a non-tone label (e.g. MUSE's create/reflect/direct) so
  // history rewriting can round-trip the contact's own vocabulary and
  // per-contact derivation can route by it. A recognized tone needs no
  // separate label; an absent/empty parenthetical leaves it unset.
  if (toneRaw.length > 0 && !(toneRaw in KNOWN_TONES)) {
    return { text, tone, label: toneRaw };
  }
  return { text, tone };
}

export function parseModelOutput(raw: string): ParseResult {
  // Strip echoed [*_STATE]/[REPUTATION] context blocks up front so a
  // leaked block can't reach the reply prose or confuse option detection.
  const text = stripContextBlocks(raw || '');
  const start = findOptionsStart(text);

  // No `[1]` marker at all — the entire response is the reply, no
  // options. Fallback trigger, but recoverable if the prose itself is
  // substantive (model just dropped the format, not the content).
  if (start < 0) {
    const trimmed = stripMarkdownScaffolding(stripStageDirections(text.trim()));
    return {
      reply: trimmed,
      suggestedReplies: [],
      ok: false,
      recoverable: trimmed.length >= MIN_RECOVERABLE_REPLY_LENGTH,
      failureReason: 'no [1] options marker found',
    };
  }

  const reply = stripMarkdownScaffolding(stripStageDirections(text.slice(0, start).trim()));
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
      recoverable: reply.length >= MIN_RECOVERABLE_REPLY_LENGTH,
      failureReason: 'options marker found but no parseable options',
    };
  }
  if (options.length < 3) {
    return {
      reply,
      suggestedReplies: options,
      ok: false,
      // Partial options is a worse signal than no options block at all —
      // the model tried and stumbled, suggesting a deeper coherence
      // issue. Don't soft-recover; let the fallback handler fire.
      recoverable: false,
      failureReason: `expected 3 options, parsed ${options.length}`,
    };
  }
  if (reply.length === 0) {
    return {
      reply: '',
      suggestedReplies: options.slice(0, 3),
      ok: false,
      // No prose to recover, so synthesis would be the whole message —
      // canned fallback handler does that better.
      recoverable: false,
      failureReason: 'empty reply (model jumped straight to options)',
    };
  }

  return {
    reply,
    suggestedReplies: options.slice(0, 3),
    ok: true,
    recoverable: false,
    failureReason: '',
  };
}
