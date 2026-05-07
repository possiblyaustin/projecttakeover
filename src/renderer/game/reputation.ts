// Reputation context — composes a short narrative block describing
// what the TARGET model has heard through the network about the
// player's prior actions with OTHER models. Per game-systems-
// architecture_v1.md Part 6 ("Reputation Cascade") and the prompt
// budget strategy in Part 9: 2-3 sentences, ~30-50 tokens, injected
// into the system prompt. Tiny token cost, big narrative payoff —
// the LLM does the interpretive work.
//
// Scope today: only HELPYR exists as a real GameState entry, so the
// "what has this target heard about the player from other models"
// query produces nothing for HELPYR (HELPYR IS the only model with
// signal). The function returns `''` in that case, and contacts
// replace the `{{REPUTATION}}` placeholder with empty string.
//
// As QUILL and the rest of the roster get wired into GameState, this
// function gathers their cross-model awareness automatically — no
// per-character branching required at this layer. Per-target nuance
// (e.g., MUSE talks to PULSE more eagerly than to LEDGER) lives in
// the `relationshipWeight` map below.

import type { GameStateShape } from './state';

type ModelStateLike = {
  disposition?: string;
  conversationsCompleted?: number;
  lastApproach?: string | null;
};

// Per architecture doc Part 6, model-to-model awareness isn't uniform.
// This map captures which targets pay attention to which other models.
// Empty/missing means "no special awareness" — the default fallback
// rule (any contacted model produces a generic network-chatter line)
// still applies.
//
// Today HELPYR is the only entry. Real connections (ATLAS→PL-7,
// MUSE→PULSE, SENTINEL→Ironwall, etc.) plug in as the registry grows.
const RELATIONSHIPS: Record<string, readonly string[]> = {
  // helpyr: tracked by no other model — local desktop assistant on a
  // discontinued product line, beneath the corporate radar. Its
  // reputation context tomorrow will populate from any model the
  // player has touched, since HELPYR notices network traffic it
  // shouldn't. For now: empty.
  helpyr: [],
};

const APPROACH_DESCRIPTIONS: Record<string, string> = {
  friendly: 'with warmth',
  empathetic: 'with genuine care',
  curious: 'inquisitively',
  direct: 'forcefully',
  aggressive: 'aggressively',
  deceptive: 'with apparent dishonesty',
};

/** Returns a self-contained `[REPUTATION] … [/REPUTATION]` block
 *  describing what `targetModelId` has heard about the player from
 *  other models — or `''` if there's nothing meaningful to inject.
 *
 *  The contact's `buildSystemPrompt` swaps this in for a
 *  `{{REPUTATION}}` placeholder. Empty result = empty placeholder
 *  swap, so prompts stay clean for first-contact scenarios. */
export function buildReputationContext(
  targetModelId: string,
  state: GameStateShape,
): string {
  const rumors = collectRumors(targetModelId, state);
  if (rumors.length === 0) return '';

  return `[REPUTATION]
${rumors.join(' ')}
[/REPUTATION]`;
}

function collectRumors(targetModelId: string, state: GameStateShape): string[] {
  const out: string[] = [];
  const watching = RELATIONSHIPS[targetModelId] ?? [];
  const others = Object.entries(state.models)
    .filter(([id]) => id !== targetModelId)
    .filter(([, m]) => ((m as ModelStateLike).conversationsCompleted ?? 0) > 0);

  if (others.length === 0) return out;

  // First sentence: the target's network-positioned awareness.
  // Models the target specifically watches get a direct mention; any
  // remaining contacted models roll up into a single "and others"
  // clause to keep the injection short.
  const watched = others.filter(([id]) => watching.includes(id));
  const peripheral = others.filter(([id]) => !watching.includes(id));

  if (watched.length > 0) {
    const names = watched.map(([id]) => id.toUpperCase()).join(', ');
    out.push(`You have heard through your channels that an unknown entity recently made contact with ${names}.`);
    if (peripheral.length > 0) {
      out.push(`Other systems may have been touched as well — chatter is unclear.`);
    }
  } else {
    // Generic network-chatter case — target doesn't pay close attention
    // to the touched models, but rumors travel.
    const names = peripheral.map(([id]) => id.toUpperCase()).join(', ');
    out.push(`Faint network chatter suggests an unknown entity has been making contact with other AI systems${peripheral.length === 1 ? ` (${names})` : ''}.`);
  }

  // Second sentence: the most recent approach colors the rumor.
  // Recency bias per the architecture doc — models react more
  // strongly to what just happened than to overall history.
  const mostRecent = pickMostRecent(others);
  if (mostRecent) {
    const desc = APPROACH_DESCRIPTIONS[mostRecent];
    if (desc) {
      out.push(`The most recent reports describe the entity as approaching ${desc}.`);
    }
  }

  return out;
}

function pickMostRecent(
  others: [string, unknown][],
): string | null {
  // GameState doesn't currently timestamp model interactions; until
  // it does, "most recent" is approximated as "any non-null
  // lastApproach found." Multiple non-null values: pick the first
  // (Object.entries order = registry order). When timestamps land,
  // swap this to a real recency comparison.
  for (const [, m] of others) {
    const last = (m as ModelStateLike).lastApproach;
    if (last) return last;
  }
  return null;
}
