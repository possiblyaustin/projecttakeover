// Three-layer approach classifier — architecture §6c. Pure function, no
// engine state. Uplink calls it once per player turn and records the
// resulting tone for dispatch into GameState.
//
// Layer 1: option pick. SuggestedReply already carries a tone — for
//   LLM-served replies (Phase D) the parser (§6d) extracted it from the
//   parenthetical label; for the mock the contact's toneFor() set it
//   from the canned tree's branch ID.
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
  | { kind: 'option'; reply: SuggestedReply }
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
    return input.reply.tone || 'neutral';
  }
  return input.perCharacter(input.text);
}
