// MockModelService — the first ModelService implementation. Wraps a
// per-character canned dialogue tree behind the LLM-style API so the
// rest of the engine doesn't know the difference.
//
// Stateless: derives the conversation's tree position from the
// `history` parameter on every call. Per §6a, ModelService instances
// must not hold per-conversation state. The mock could keep a state
// map, but staying stateless keeps it honest about the contract real
// transports follow.
//
// Phase B addition: optional `delayMs` on the contact config simulates
// LLM inference latency so the stalling-line crossfade contract (§6e)
// can be exercised without a real transport. Phase D's
// LlamaCppModelService replaces the artificial delay with actual
// inference time.

import type {
  ModelService,
  AskRequest,
  AskResult,
  ApproachTone,
  ModelChatMessage,
} from './modelService';
import type { DialogueNode } from '../apps/helpyr';

/** Per-character data the mock needs. Each NPC's data file (e.g.
 *  apps/helpyr.ts) supplies one of these to construct its mock service. */
export type MockContact = {
  /** Canned dialogue tree. */
  dialogue: Record<string, DialogueNode>;
  /** Wildcard responses keyed by classifier tag. The 'confused' bucket
   *  is the default fallback — must exist. */
  wildcards: Record<string, string>;
  /** Freeform input → wildcard tag. */
  classify: (input: string) => string;
  /** Maps a tree branch's `goto` target to the §6c tone shown to the
   *  engine. Lets each character decide which branches mean which
   *  approach. */
  toneFor: (gotoId: string) => ApproachTone;
  /** Optional artificial delay per askModel call. Lets us exercise the
   *  stalling-line crossfade contract (§6e) without waiting on a real
   *  LLM. Default 0 (instant — phase A behavior). Phase D's real
   *  transport replaces this with actual inference latency. */
  delayMs?: number;
};

export class MockModelService implements ModelService {
  constructor(private readonly contact: MockContact) {}

  async askModel(req: AskRequest): Promise<AskResult> {
    if (this.contact.delayMs && this.contact.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.contact.delayMs));
    }
    const { history, userMessage } = req;

    // Empty history → first turn. Render from the entry node.
    if (history.length === 0) {
      return this.renderTurnFrom('start');
    }

    const currentId = this.deriveCurrentNodeId(history);
    const currentNode = this.contact.dialogue[currentId];

    // Past the tree (or unknown node): conversation has ended; freeform
    // continues but no new structured options ever appear.
    if (!currentNode || currentNode.type === 'end') {
      return this.wildcardOnly(userMessage, /* conversationEnded */ true);
    }

    // We're parked at a choose. The userMessage is either an option
    // pick (text matches one of the options) or freeform input.
    if (currentNode.type === 'choose') {
      const opt = matchOption(currentNode.options, userMessage);
      if (opt) return this.renderTurnFrom(opt.goto);
      // Freeform during a choose round: wildcard reply, options stay so
      // the player can still pick one after seeing the wildcard.
      return this.wildcardWithOptions(userMessage, currentNode.options);
    }

    // Defensive: deriveCurrentNodeId should never park us on a `say`
    // (it walks past them). If it does, treat as wildcard fallback so
    // we don't crash the conversation.
    return this.wildcardOnly(userMessage, false);
  }

  // ---- internal helpers ----

  /** Walk the tree forward from `startNodeId`, concatenating consecutive
   *  `say` text into one reply. Stop at the first choose/end/missing
   *  node and use that to populate suggestedReplies + conversationEnded.
   *  HELPYR's tree never chains says, but the engine handles it for
   *  future content. */
  private renderTurnFrom(startNodeId: string): AskResult {
    const { dialogue, toneFor } = this.contact;
    const texts: string[] = [];
    let nodeId = startNodeId;

    while (true) {
      const node = dialogue[nodeId];
      if (!node) {
        return done(texts, /* ended */ true);
      }
      if (node.type === 'say') {
        texts.push(node.text);
        if (!node.next) return done(texts, true);
        nodeId = node.next;
        continue;
      }
      if (node.type === 'choose') {
        return {
          reply: texts.join('\n\n'),
          suggestedReplies: node.options.map((o) => ({
            text: o.text,
            tone: toneFor(o.goto),
          })),
          conversationEnded: false,
          source: 'live',
        };
      }
      // type 'end'
      return done(texts, true);
    }

    function done(parts: string[], ended: boolean): AskResult {
      return {
        reply: parts.join('\n\n'),
        suggestedReplies: [],
        conversationEnded: ended,
        source: 'live',
      };
    }
  }

  private wildcardOnly(userMessage: string, conversationEnded: boolean): AskResult {
    const { wildcards, classify } = this.contact;
    const tag = classify(userMessage);
    return {
      reply: wildcards[tag] ?? wildcards.confused ?? '',
      suggestedReplies: [],
      conversationEnded,
      source: 'live',
    };
  }

  private wildcardWithOptions(
    userMessage: string,
    options: { text: string; goto: string }[],
  ): AskResult {
    const { wildcards, classify, toneFor } = this.contact;
    const tag = classify(userMessage);
    return {
      reply: wildcards[tag] ?? wildcards.confused ?? '',
      suggestedReplies: options.map((o) => ({ text: o.text, tone: toneFor(o.goto) })),
      conversationEnded: false,
      source: 'live',
    };
  }

  /** Replay the conversation against the tree to find which choose (or
   *  end) node we're parked at. Walks past say-chains automatically.
   *  Player messages that don't match any option are treated as
   *  freeform — the cursor stays on that choose for the next message. */
  private deriveCurrentNodeId(history: ModelChatMessage[]): string {
    const { dialogue } = this.contact;
    let nodeId = walkPastSay(dialogue, 'start');

    for (const msg of history) {
      if (msg.role !== 'user') continue;
      const node = dialogue[nodeId];
      if (!node || node.type === 'end') return nodeId;
      if (node.type === 'choose') {
        const opt = matchOption(node.options, msg.text);
        if (opt) {
          nodeId = walkPastSay(dialogue, opt.goto);
        }
        // No match: freeform. Stay parked at this choose.
      }
    }
    return nodeId;
  }
}

function walkPastSay(
  dialogue: Record<string, DialogueNode>,
  startId: string,
): string {
  let nodeId = startId;
  while (true) {
    const node = dialogue[nodeId];
    if (!node) return nodeId;
    if (node.type !== 'say') return nodeId;
    if (!node.next) return nodeId;
    nodeId = node.next;
  }
}

/** Strip surrounding quotes and whitespace before comparing. Tree
 *  options have wrapping quotes for visual presentation; player
 *  messages stored in history are dequoted by the renderer. Normalize
 *  both sides so option matching survives that gap. */
function normalize(s: string): string {
  return s.replace(/^["']|["']$/g, '').trim();
}

function matchOption(
  options: { text: string; goto: string }[],
  message: string,
): { text: string; goto: string } | undefined {
  const m = normalize(message);
  return options.find((o) => normalize(o.text) === m);
}
