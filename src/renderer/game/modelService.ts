// ModelService — the seam between dialogue UI and the LLM (or canned
// substitutes). Locked design in docs/architecture.md §6a–§6f.
//
// One ModelService instance serves many conversations. Per-conversation
// state lives in the `history` parameter, never in the service.
//
// Phase A: this file only defines the interface + types. The first
// implementation is MockModelService (./mockModelService.ts) which wraps
// the existing PoC dialogue trees. Real llama.cpp transport lands in a
// later phase; the slot below is forecasted but not yet implemented.

/** Strategic tone label attached to each suggested reply. Real LLM
 *  flow: the persona prompt instructs the model to label each option
 *  with a parenthetical tone (`(friendly)`, `(curious)`, …); the parser
 *  strips the label from the player-facing text but keeps it as the
 *  classifier signal. Mock flow: derived from canned dialogue branches.
 *  Per §6c, classifier failure (in either flow) returns 'neutral'. */
export type ApproachTone =
  | 'friendly'
  | 'curious'
  | 'direct'
  | 'empathetic'
  | 'aggressive'
  | 'deceptive'
  | 'neutral';

export type SuggestedReply = {
  /** Player-facing text. The persona prompt's parenthetical tone label
   *  has been stripped already. */
  text: string;
  /** Classifier signal. The reducer maps tone → approach value when
   *  consequences fire (suspicion bumps, morality push). */
  tone: ApproachTone;
};

/** Slim chat message shape passed to the model. Aligns with the
 *  OpenAI-compatible role vocabulary so the future LlamaCppModelService
 *  can forward `history` with minimal massaging. UI-level fields
 *  (avatar, speaker label) stay in the renderer's own message type. */
export type ModelChatMessage =
  | { role: 'assistant'; text: string }   // NPC turn
  | { role: 'user'; text: string };       // player turn

export type AskRequest = {
  /** Persona prompt + injected [CHARACTER_STATE] block. Phase A wires
   *  this through as an empty string from Uplink — the mock doesn't
   *  read it. The real transport (phase D) consumes it. */
  systemPrompt: string;
  /** Prior turns this conversation, oldest first. Excludes the
   *  current `userMessage`. */
  history: ModelChatMessage[];
  /** The player's chosen reply or freeform input for THIS turn. */
  userMessage: string;
  /** Character-flavored recovery options the live transport draws from
   *  when the parser triggers soft recovery (model gave prose but
   *  dropped the [1][2][3] block). Built per-turn by the contact so
   *  trust-level filtering reflects the current GameState. When omitted,
   *  the transport uses its built-in generic pool — Quill and any
   *  contact without a Story-finalized pool stays on the safe floor. */
  recoveryPool?: readonly SuggestedReply[];
};

export type AskResult = {
  /** NPC dialogue, label-stripped, ready to render as one bubble. */
  reply: string;
  /** Three suggested replies under normal play. May be `[]` when the
   *  scripted tree has ended (mock) — distinguished from a parser
   *  failure by `conversationEnded`. */
  suggestedReplies: SuggestedReply[];
  /** Mock signal that the canned tree reached its terminal node. The
   *  engine uses this to dispatch a one-shot completion event without
   *  conflating it with parser-failure-induced empty options. The real
   *  LLM will signal the same condition through game logic, not the
   *  model output. */
  conversationEnded: boolean;
  /** 'live' = real generated response (or mock canned data, which from
   *  the engine's POV is "this worked"). 'fallback' = real LLM tried
   *  and failed; canned dialogue served instead. The engine fires an
   *  in-fiction glitch artifact on 'fallback' (§6f). Phase A only ever
   *  emits 'live'. */
  source: 'live' | 'fallback';
};

export interface ModelService {
  askModel(req: AskRequest): Promise<AskResult>;
}

/** Per-character fallback handler invoked by the LlamaCppModelService
 *  (or any future live transport) when an LLM call fails — transport
 *  error, parser failure, empty/incoherent reply, etc. (architecture
 *  §6f). Returns canned content the player will see in place of the
 *  failed LLM response. The transport sets `source: 'fallback'` on
 *  the returned AskResult regardless of what the handler emits.
 *
 *  Each contact owns its handler; that's what closes over the
 *  contact's fallback corpus (e.g., HelpyrFallbackPool) without the
 *  transport needing to know about it. */
export type FallbackHandler = (
  req: AskRequest,
  reason: string,
) => AskResult | Promise<AskResult>;

/** Configuration for constructing a transport. Listed here (not in each
 *  implementation file) so the slots stay visible — mobile transports
 *  are forecasted-but-unimplemented per the post-v1 deferral, and
 *  defining them in the type prevents accidentally designing them out. */
export type ModelServiceConfig =
  | { transport: 'mock' }
  | { transport: 'llamacpp'; baseUrl: string; reasoning: 'off' }
  | { transport: 'coreml' }   // mobile, post-v1
  | { transport: 'aiedge' };  // mobile, post-v1
