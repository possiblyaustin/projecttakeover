// History truncation for live-LLM transports (2026-05-18). Caps the
// number of prior turns forwarded to llama-server so long conversations
// don't push prompt processing past the request timeout. The 2026-05-18
// PR #45 verification run hit a `signal is aborted without reason`
// transport abort at depth ~16 turns — Gemma E2B at --threads 4 takes
// ~25-30s to process a 1000-token prompt, so deep history + persona
// prompt + reputation block can blow the 30s default cap. Truncation
// is the load-bearing fix; cap is a tunable knob, not a hard contract.
//
// One "turn" = 1 user message + 1 assistant message = 2 entries.
// The cap counts logical turns; the slice it produces is `maxTurns * 2`
// entries from the tail. We don't try to align on user/assistant
// boundaries — chat models tolerate a leading assistant message fine,
// and adding alignment logic just to feel tidy adds complexity for no
// measurable benefit.
//
// Pure function; lives outside LlamaCppModelService so it can be
// unit-tested without mocking fetch. Mobile transports (post-v1) will
// likely want the same shape — they share the ctx-pressure problem.

import type { ModelChatMessage } from './modelService';

/** Cap a chat history at the last `maxTurns` player+assistant
 *  exchanges. Returns the input unchanged (no copy) when history is
 *  already within cap. `maxTurns <= 0` drops the entire history —
 *  useful for tests and the rare "always cold context" config, not
 *  a real-play setting. */
export function truncateHistory(
  history: readonly ModelChatMessage[],
  maxTurns: number,
): readonly ModelChatMessage[] {
  if (maxTurns <= 0) return [];
  const cap = maxTurns * 2;
  if (history.length <= cap) return history;
  return history.slice(history.length - cap);
}
