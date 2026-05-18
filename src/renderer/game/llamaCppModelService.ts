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
// Soft recovery (2026-05-16): when the parser fails specifically
// because the model gave us substantive prose but dropped the [1][2][3]
// options block (parser.recoverable=true), keep the real LLM reply and
// synthesize generic continuation options instead of routing to canned
// fallback content. Preserves the model's character voice through the
// dominant failure mode (Gemma E2B drops the format ~50% of turns past
// depth 5). Logged distinctly so the cascade rate stays measurable.
//
// History truncation (2026-05-18): conversations grow without bound,
// and at Deck-parity `--threads 4`, prompt processing of a 3000+ token
// prompt blows the 30s timeoutMs cap. truncateHistory caps the forwarded
// slice at the last `historyTurnCap` exchanges before sending. Per-turn
// metric line (`[Chat] LLM turn: prompt=..., completion=..., kept=...,
// dropped=..., parse=...`) gives the data needed to tune the cap empirically.
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
import { makeRecoveryPicker, GENERIC_RECOVERY_OPTIONS } from './recoveryPicker';
import { truncateHistory } from './historyTruncation';

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
  /** Maximum number of player+assistant exchanges to forward as chat
   *  history. One turn = 1 user + 1 assistant message = 2 entries. Older
   *  exchanges are dropped before sending to llama-server so deep
   *  conversations don't push prompt processing past `timeoutMs`. The
   *  system prompt and the current user message are always forwarded
   *  in full — only the history slice is truncated. Default 16, sized
   *  against the Deck-parity `--threads 4` benchmark; bump if conversations
   *  start losing context the player cares about, lower if transport
   *  aborts return at high depth. */
  historyTurnCap?: number;
  /** Per-character fallback handler (architecture §6f). Called when
   *  a live call fails: transport error, timeout, parser failure,
   *  empty reply. Returns canned content the player will see. If
   *  unset, askModel emits a debuggable placeholder so dev surfaces
   *  aren't silently broken — but in real usage every contact should
   *  wire one. */
  fallback?: FallbackHandler;
};

type UsageMetrics = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };

type ChatMessageBody = { role: 'system' | 'assistant' | 'user'; content: string };

export class LlamaCppModelService implements ModelService {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly modelName: string;
  private readonly maxTokens: number;
  private readonly historyTurnCap: number;
  private readonly fallback: FallbackHandler | undefined;
  private readonly pickRecoveryOptions = makeRecoveryPicker();

  constructor(cfg: LlamaCppConfig) {
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = cfg.timeoutMs ?? 30000;
    this.modelName = cfg.modelName ?? 'gemma-4-E2B-it';
    this.maxTokens = cfg.maxTokens ?? 512;
    this.historyTurnCap = cfg.historyTurnCap ?? 16;
    this.fallback = cfg.fallback;
  }

  async askModel(req: AskRequest): Promise<AskResult> {
    const truncated = truncateHistory(req.history, this.historyTurnCap);
    const dropped = req.history.length - truncated.length;
    const messages = this.buildMessages(req, truncated);
    const body = {
      model: this.modelName,
      messages,
      max_tokens: this.maxTokens,
    };

    let raw: string;
    let usage: UsageMetrics = {};
    try {
      const fetched = await this.fetchCompletion(body);
      raw = fetched.content;
      usage = fetched.usage;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logTurnMetric(usage, truncated.length, dropped, 'hard_fallback');
      return this.invokeFallback(req, `transport: ${reason}`);
    }

    const parsed = parseModelOutput(raw);
    if (!parsed.ok) {
      if (parsed.recoverable) {
        // Soft recovery: the model gave us substantive prose but forgot
        // the [1][2][3] options block. Use the real reply, synthesize
        // generic continuation options. Source stays 'live' — the reply
        // text IS live LLM output — so the fallback glitch class
        // doesn't fire. Logged distinctly so we can measure cascade
        // rate separately from hard fallback.
        if (typeof console !== 'undefined') {
          console.info('[Chat] LLM soft recovery:', parsed.failureReason);
        }
        logTurnMetric(usage, truncated.length, dropped, 'soft_recovery');
        return {
          reply: parsed.reply,
          suggestedReplies: this.pickRecoveryOptions(req.recoveryPool ?? GENERIC_RECOVERY_OPTIONS),
          conversationEnded: false,
          source: 'live',
        };
      }
      logTurnMetric(usage, truncated.length, dropped, 'hard_fallback');
      return this.invokeFallback(req, `parser: ${parsed.failureReason}`);
    }

    logTurnMetric(usage, truncated.length, dropped, 'clean');
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

  private buildMessages(req: AskRequest, history: readonly ModelChatMessage[]): ChatMessageBody[] {
    const out: ChatMessageBody[] = [];
    if (req.systemPrompt && req.systemPrompt.length > 0) {
      out.push({ role: 'system', content: req.systemPrompt });
    }
    for (const m of history) {
      out.push({ role: m.role, content: m.text });
    }
    if (req.userMessage && req.userMessage.length > 0) {
      out.push({ role: 'user', content: req.userMessage });
    }
    return out;
  }

  private async fetchCompletion(body: unknown): Promise<{ content: string; usage: UsageMetrics }> {
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
      // llama-server returns usage on the OpenAI-compatible response.
      // Safely-typed — older/newer server builds may shift the shape.
      const rawUsage = (data as { usage?: unknown })?.usage;
      const usage: UsageMetrics = isUsageShape(rawUsage) ? rawUsage : {};
      return { content, usage };
    } finally {
      clearTimeout(timer);
    }
  }
}

function isUsageShape(v: unknown): v is UsageMetrics {
  return typeof v === 'object' && v !== null;
}

/** Emit a per-turn metric line — prompt/completion token counts from
 *  llama-server, history-cap diagnostics, and parse outcome. One log
 *  per askModel call regardless of clean/soft/hard outcome, so a turn
 *  count comes from the log count and a hard-fallback hit doesn't
 *  silently lose the prompt-token data when usage is empty. */
function logTurnMetric(
  usage: UsageMetrics,
  historyKept: number,
  historyDropped: number,
  parse: 'clean' | 'soft_recovery' | 'hard_fallback',
): void {
  if (typeof console === 'undefined') return;
  const p = usage.prompt_tokens ?? '?';
  const c = usage.completion_tokens ?? '?';
  console.info(
    `[Chat] LLM turn: prompt=${p}, completion=${c}, history_kept=${historyKept}, dropped=${historyDropped}, parse=${parse}`,
  );
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
