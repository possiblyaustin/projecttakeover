// Construction-time factory for ModelService implementations
// (architecture §6a: "Configuration is passed in at construction time,
// not baked into the interface").
//
// Reads the `?backend=...` URL flag and returns the matching service.
// Default is 'mock' so dev iteration stays fast and doesn't require a
// running llama-server. `?backend=llamacpp` flips to the live LLM
// transport for verification work.
//
// Each contact in the Uplink registry calls makeModelService(...) once
// at construction. The ModelService instance is shared across that
// contact's conversations; per-conversation state lives in the
// `history` parameter, never in the service.

import { MockModelService, type MockContact } from './mockModelService';
import { LlamaCppModelService, type LlamaCppConfig } from './llamaCppModelService';
import type { ModelService, FallbackHandler } from './modelService';

export type ModelServiceSpec = {
  /** Mock-mode data. Used for `?backend=mock` (default). */
  mock: MockContact;
  /** Optional overrides for the llamacpp transport. Shape merged on
   *  top of DEFAULT_LLAMA below. */
  llamaCpp?: Partial<LlamaCppConfig>;
  /** Per-character fallback handler used by the live transport when
   *  an LLM call fails (architecture §6f). Closes over the contact's
   *  fallback corpus so the transport stays character-agnostic. The
   *  mock backend doesn't need this — it can't fail. */
  fallback?: FallbackHandler;
};

const DEFAULT_LLAMA: LlamaCppConfig = {
  baseUrl: 'http://127.0.0.1:8080',
};

export type ActiveBackend = 'mock' | 'llamacpp';

/** Reads `?backend=` from the current URL. Exported separately so
 *  debug surfaces (or future status indicators) can show which
 *  transport is live without re-running the factory. */
export function activeBackend(): ActiveBackend {
  if (typeof window === 'undefined') return 'mock';
  const v = new URLSearchParams(window.location.search).get('backend');
  return v === 'llamacpp' ? 'llamacpp' : 'mock';
}

/** Reads `?llamaUrl=` from the current URL — a runtime override for the
 *  llama-server origin. Lets a LAN client (e.g. the Steam Deck's browser)
 *  point at a dev-PC's inference server without a code change or rebuild:
 *  `?backend=llamacpp&llamaUrl=http://<dev-pc-ip>:8080`. Without it the
 *  Deck would resolve the default 127.0.0.1:8080 to itself — no server
 *  there, so every turn falls back to canned lines. Returns undefined
 *  when absent so DEFAULT_LLAMA / per-contact config wins; a malformed
 *  value is ignored (warned, not silently redirecting inference). */
export function llamaUrlOverride(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const v = new URLSearchParams(window.location.search).get('llamaUrl');
  if (!v) return undefined;
  try {
    new URL(v);
    return v;
  } catch {
    console.warn(`[ModelService] ignoring malformed ?llamaUrl="${v}"`);
    return undefined;
  }
}

export function makeModelService(spec: ModelServiceSpec): ModelService {
  if (activeBackend() === 'llamacpp') {
    const urlOverride = llamaUrlOverride();
    return new LlamaCppModelService({
      ...DEFAULT_LLAMA,
      ...(spec.llamaCpp || {}),
      // URL flag wins over per-contact config — it's an explicit
      // operator/test instruction to redirect ALL inference.
      ...(urlOverride ? { baseUrl: urlOverride } : {}),
      fallback: spec.fallback,
    });
  }
  return new MockModelService(spec.mock);
}
