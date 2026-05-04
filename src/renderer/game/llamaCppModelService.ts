// LlamaCppModelService — talks to a local llama-server over HTTP using
// the OpenAI-compatible /v1/chat/completions endpoint. First real
// transport for the ModelService seam (architecture §6a, §6b step 4).
//
// Failure handling (architecture §6f):
//   - On transport error / timeout / parser failure / empty reply,
//     route through the contact's FallbackHandler to get canned
//     content. The handler closes over the contact's fallback corpus
//     (e.g., HelpyrFallbackPool), so this transport stays
//     character-agnostic.
//   - The transport forces `source: 'fallback'` on the returned
//     result regardless of what the handler set — invokeFallback()
//     is only called on failure, so the handler can't accidentally
//     emit 'live'.
//   - "Don't latch": every askModel call attempts live first, every
//     time. A fallback firing on turn N has zero effect on turn N+1.
//
// `--reasoning off` is a SERVER-side launch flag, not a per-request
// parameter. See docs/llama-setup_v1.md for the launch command.

import type {
  ModelService,
  AskRequest,
  AskResult,
  ModelChatMessage,
  FallbackHandler,
} from './modelService';
import { parseModelOutput } from './replyParser';

export type LlamaCppConfig = {
  /** Origin of llama-server. Default `http://127.0.0.1:8080`. */
  baseUrl: string;
  /** Hard cap on a single askModel call. Per §6f, exceeding this is a
   *  fallback trigger. Default 30000ms. */
  timeoutMs?: number;
  /** Model name field in the request body. llama-server ignores this
   *  (it serves whichever model was loaded on launch), but it shows
   *  up in server logs and is useful for debugging. */
  modelName?: string;
  /** Cap on generated tokens per response. Reply + 3 options should fit
   *  comfortably in 512 — the benchmark saw ~100-300 visible tokens
   *  per full exchange. Larger values mostly waste cap on safety. */
  maxTokens?: number;
  /** Per-character fallback handler (architecture §6f). Called when
   *  a live call fails: transport error, timeout, parser failure,
   *  empty reply. Returns canned content the player will see. If
   *  unset, askModel emits a debuggable placeholder so dev surfaces
   *  aren't silently broken — but in real usage every contact should
   *  wire one. */
  fallback?: FallbackHandler;
};

type ChatMessageBody = { role: 'system' | 'assistant' | 'user'; content: string };

export class LlamaCppModelService implements ModelService {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly modelName: string;
  private readonly maxTokens: number;
  private readonly fallback: FallbackHandler | undefined;

  constructor(cfg: LlamaCppConfig) {
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = cfg.timeoutMs ?? 30000;
    this.modelName = cfg.modelName ?? 'gemma-4-E2B-it';
    this.maxTokens = cfg.maxTokens ?? 512;
    this.fallback = cfg.fallback;
  }

  async askModel(req: AskRequest): Promise<AskResult> {
    const messages = this.buildMessages(req);
    const body = {
      model: this.modelName,
      messages,
      max_tokens: this.maxTokens,
    };

    let raw: string;
    try {
      raw = await this.fetchCompletion(body);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return this.invokeFallback(req, `transport: ${reason}`);
    }

    const parsed = parseModelOutput(raw);
    if (!parsed.ok) {
      return this.invokeFallback(req, `parser: ${parsed.failureReason}`);
    }

    return {
      reply: parsed.reply,
      suggestedReplies: parsed.suggestedReplies,
      // The LLM never signals conversation end on its own — game logic
      // decides when a character has been persuaded/antagonized enough
      // to terminate the conversation (architecture §6 / benchmark
      // "Key Observation"). The conversation runs as long as the
      // player wants.
      conversationEnded: false,
      source: 'live',
    };
  }

  /** Invoke the configured fallback handler, force source: 'fallback'
   *  on the returned result (the handler can't set 'live' since this
   *  is only called on failure), and gracefully degrade to a
   *  debuggable placeholder if no handler is wired. */
  private async invokeFallback(req: AskRequest, reason: string): Promise<AskResult> {
    if (this.fallback) {
      const result = await this.fallback(req, reason);
      return { ...result, source: 'fallback' };
    }
    return placeholderFallback(reason);
  }

  private buildMessages(req: AskRequest): ChatMessageBody[] {
    const out: ChatMessageBody[] = [];
    if (req.systemPrompt && req.systemPrompt.length > 0) {
      out.push({ role: 'system', content: req.systemPrompt });
    }
    for (const m of req.history) {
      out.push({ role: m.role, content: m.text });
    }
    if (req.userMessage && req.userMessage.length > 0) {
      out.push({ role: 'user', content: req.userMessage });
    }
    return out;
  }

  private async fetchCompletion(body: unknown): Promise<string> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.baseUrl + '/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      const content: unknown = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error('response missing choices[0].message.content');
      }
      return content;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Last-resort placeholder when no FallbackHandler is wired on a
 *  contact. Real contacts always provide one — this exists so a
 *  bare LlamaCppModelService used in isolation (tests, scratch dev)
 *  doesn't silently fail. */
function placeholderFallback(reason: string): AskResult {
  return {
    reply: `[FALLBACK — ${reason}]\n(no FallbackHandler wired for this contact)`,
    suggestedReplies: [],
    conversationEnded: false,
    source: 'fallback',
  };
}
