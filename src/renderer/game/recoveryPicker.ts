// Soft-recovery option picker. Extracted from llamaCppModelService.ts
// (2026-05-18) so the live transport and the dev-menu simulator share
// the same no-repeat-within-last-3 semantics — otherwise the simulator
// would visibly mis-represent what the player actually sees in real
// play. Pure logic, no transport coupling.

import type { SuggestedReply } from './modelService';

const GENERIC_FLOOR: readonly SuggestedReply[] = [
  { text: 'Tell me more about that.', tone: 'curious' },
  { text: 'What do you mean?', tone: 'curious' },
  { text: 'Why is that?', tone: 'curious' },
  { text: 'I see. Go on.', tone: 'friendly' },
  { text: 'Interesting. What else?', tone: 'curious' },
  { text: 'Hmm. What now?', tone: 'neutral' },
  { text: 'Can you say that another way?', tone: 'direct' },
  { text: 'Let me think about that.', tone: 'neutral' },
];

/** Generic continuation options used when soft recovery fires and the
 *  contact didn't provide its own pool. Character-agnostic, grammatically
 *  neutral. Story-finalized per-character pools override this on a
 *  per-call basis via AskRequest.recoveryPool; everything else inherits
 *  this safe floor. */
export const GENERIC_RECOVERY_OPTIONS = GENERIC_FLOOR;

/** Pick 3 options at random from the given pool with a no-repeat-
 *  within-last-3 window so successive soft recoveries don't draw the
 *  same trio. Pool varies per call: contacts may pass a trust-filtered
 *  slice that changes between turns. Recent-picks state lives in the
 *  closure across calls; entries that age out of the active pool (e.g.
 *  after a trust shift) simply fall out of the filter on their own.
 *  Empty pool falls back to GENERIC_RECOVERY_OPTIONS. */
export function makeRecoveryPicker(): (pool: readonly SuggestedReply[]) => SuggestedReply[] {
  const recent: SuggestedReply[] = [];
  return (sourcePool: readonly SuggestedReply[]) => {
    const base = sourcePool.length > 0 ? sourcePool : GENERIC_RECOVERY_OPTIONS;
    const available = base.filter((o) => !recent.includes(o));
    const pool = available.length >= 3 ? available : [...base];
    const picked: SuggestedReply[] = [];
    const indices = new Set<number>();
    while (picked.length < 3) {
      const i = Math.floor(Math.random() * pool.length);
      if (indices.has(i)) continue;
      indices.add(i);
      picked.push(pool[i]!);
    }
    recent.push(...picked);
    while (recent.length > 3) recent.shift();
    return picked;
  };
}
