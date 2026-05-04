// LlamaCppModelService — talks to a local llama-server over HTTP using
// the OpenAI-compatible /v1/chat/completions endpoint. First real
// transport for the ModelService seam (architecture §6a, §6b step 4).
//
// D.1 scope:
//   - Single batched request (reply + 3 options in one response, §6a)
//   - 30s timeout (§6f bullet "Request times out")
//   - §6d output parser plugged in
//   - source: 'fallback' on parse failure or transport error — but the
//     actual fallback CONTENT (canned tree, glitch artifact UI) lands
//     in D.2. For now we surface a debuggable placeholder reply so we
//     can see when fallback would have triggered.
//
// `--reasoning off` is a SERVER-side launch flag, not a per-request
// parameter. See docs/llama-setup_v1.md for the launch command.

import type {
  ModelService,
  AskRequest,
  AskResult,
  ModelChatMessage,
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
};

type ChatMessageBody = { role: 'system' | 'assistant' | 'user'; content: string };

export class LlamaCppModelService implements ModelService {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly modelName: string;
  private readonly maxTokens: number;

  constructor(cfg: LlamaCppConfig) {
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = cfg.timeoutMs ?? 30000;
    this.modelName = cfg.modelName ?? 'gemma-4-E2B-it';
    this.maxTokens = cfg.maxTokens ?? 512;
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
      // Transport error or timeout — fallback trigger (§6f). D.2 will
      // pull from the canned tree here; for D.1 we just surface a
      // debuggable placeholder so the engine path is testable.
      const reason = err instanceof Error ? err.message : String(err);
      return fallbackPlaceholder(`transport: ${reason}`);
    }

    const parsed = parseModelOutput(raw);
    if (!parsed.ok) {
      return fallbackPlaceholder(`parser: ${parsed.failureReason}`, parsed.reply);
    }

    return {
      reply: parsed.reply,
      suggestedReplies: parsed.suggestedReplies,
      // The LLM never signals conversation end on its own — game logic
      // decides when a character has been persuaded/antagonized enough
      // to terminate the conversation (architecture §6 / benchmark
      // "Key Observation"). For D.1 the conversation runs as long as
      // the player wants.
      conversationEnded: false,
      source: 'live',
    };
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

/** D.1 placeholder. D.2 replaces this with a canned-tree pull + glitch
 *  artifact dispatch. The reply text is intentionally legible-but-ugly
 *  so it's obvious during dev when fallback fired and why. */
function fallbackPlaceholder(reason: string, partialReply = ''): AskResult {
  const head = partialReply
    ? partialReply.trim() + '\n\n'
    : '';
  return {
    reply: head + `[FALLBACK — ${reason}]\n(D.2 will replace this with canned dialogue + glitch artifact.)`,
    suggestedReplies: [],
    conversationEnded: false,
    source: 'fallback',
  };
}
