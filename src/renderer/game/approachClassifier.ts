// Three-layer approach classifier — architecture §6c. Pure function, no
// engine state. Uplink calls it once per player turn and records the
// resulting tone for dispatch into GameState.
//
// Layer 1: option pick. SuggestedReply may carry a tone — for LLM-served
//   replies (Phase D) the parser (§6d) extracts it from the parenthetical
//   label; for the mock the contact's toneFor() set it from the canned
//   tree's branch ID. When no usable (non-neutral) tone is present —
//   e.g. QUILL's revised connect/probe/push options emit BARE [n] lines
//   with no label, so the parser yields 'neutral' — we fall back to
//   re-classifying the option TEXT through the same per-character
//   classifier freeform uses. That keeps the mechanical outcome
//   code-decided (the architecture rule) instead of hostage to whether
//   the small model remembered to tag the option, and lets a "push"
//   option resolve to liberation OR nefarious based on its actual words.
// Layer 2: freeform input. Routes through the contact's per-character
//   keyword classifier (existing pattern: classifyHelpyrApproach in
//   apps/helpyr.ts).
// Layer 3: failure → 'neutral'. Both layers above fall back here when
//   they have nothing to say. Per §6c, NEVER guess — 'neutral' tells
//   the reducer to apply no suspicion swing and no morality push. A
//   misclassified aggressive line bumping suspicion feels unfair;
//   silence is recoverable.

import type { ApproachTone, SuggestedReply } from './modelService';

export type ApproachClassifierInput =
  | {
      kind: 'option';
      reply: SuggestedReply;
      /** Optional per-character keyword classifier. Used to derive the
       *  tone from the option TEXT when the reply carries no usable
       *  (non-neutral) label. Omit to keep the legacy label-only
       *  behavior. */
      perCharacter?: (input: string) => ApproachTone;
    }
  | {
      kind: 'freeform';
      text: string;
      /** Per-character keyword classifier. Owns the layer-3 fallback —
       *  must return 'neutral' (not throw, not guess) when no keyword
       *  matches. */
      perCharacter: (input: string) => ApproachTone;
    };

export function classifyApproach(input: ApproachClassifierInput): ApproachTone {
  if (input.kind === 'option') {
    // A non-neutral label is the model committing to a strategy — trust it.
    if (input.reply.tone && input.reply.tone !== 'neutral') return input.reply.tone;
    // No usable label: derive the tone from the option text, same as
    // freeform. Falls back to 'neutral' when no classifier was provided.
    if (input.perCharacter) return input.perCharacter(input.reply.text);
    return 'neutral';
  }
  return input.perCharacter(input.text);
}
