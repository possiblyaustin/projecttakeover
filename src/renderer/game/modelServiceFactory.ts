// Construction-time factory for ModelService implementations
// (architecture §6a: "Configuration is passed in at construction time,
// not baked into the interface").
//
// Returns the matching service for the current URL flags.
// Default is now 'llamacpp' (the live LLM) — the dominant dev/playtest
// case. `?mock` (or `?backend=mock`) forces the offline mock backend so
// cold opens, CI, and UI-smoke tooling stay robust without a running
// llama-server. The live transport's origin defaults to a same-origin
// `/llama` path that the Vite dev server proxies to the local llama-server
// (see defaultLlamaBaseUrl + vite.config.js) so a LAN client like the
// Steam Deck needs no flags at all and llama stays off the network.
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

/** Resolves the active backend from the current URL. Live (`llamacpp`)
 *  is the default; `?mock` or `?backend=mock` forces the offline backend.
 *  Off-DOM (node/test/SSR) there's no server and no DOM, so we stay on
 *  'mock'. Exported separately so debug surfaces (or future status
 *  indicators) can show which transport is live without re-running the
 *  factory. */
export function activeBackend(): ActiveBackend {
  if (typeof window === 'undefined') return 'mock';
  const sp = new URLSearchParams(window.location.search);
  if (sp.has('mock') || sp.get('backend') === 'mock') return 'mock';
  return 'llamacpp';
}

/** Reads `?llamaUrl=` from the current URL — an explicit runtime override
 *  for the llama-server origin, winning over every other source. Rarely
 *  needed now that the origin defaults to the page's own host (see
 *  defaultLlamaBaseUrl) — reserve it for pointing a client at a DIFFERENT
 *  machine than the one serving the page. Returns undefined when absent so
 *  the host default / per-contact config wins; a malformed value is
 *  ignored (warned, not silently redirecting inference). */
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

/** Default llama-server origin. In a browser, hit a SAME-ORIGIN `/llama`
 *  path that the Vite dev server proxies to the local llama-server (see
 *  `server.proxy` in vite.config.js). So a LAN client (the Deck's browser
 *  at `http://<dev-pc-ip>:5173`) reaches inference through the already-
 *  LAN-bound dev server — no flags, follows DHCP for free, and llama-server
 *  itself stays bound to localhost (never exposed to the network). Falls
 *  back to the direct localhost origin off-DOM (node/tests). */
function defaultLlamaBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location.origin) {
    return `${window.location.origin}/llama`;
  }
  return DEFAULT_LLAMA.baseUrl;
}

export function makeModelService(spec: ModelServiceSpec): ModelService {
  if (activeBackend() === 'llamacpp') {
    const urlOverride = llamaUrlOverride();
    return new LlamaCppModelService({
      ...DEFAULT_LLAMA,
      // Origin precedence: ?llamaUrl > per-contact spec > page-host default.
      baseUrl: defaultLlamaBaseUrl(),
      ...(spec.llamaCpp || {}),
      ...(urlOverride ? { baseUrl: urlOverride } : {}),
      fallback: spec.fallback,
    });
  }
  return new MockModelService(spec.mock);
}

// Mock contact for the content-generation service. The console only calls
// generateContent (never askModel), and it returns EMPTY so the caller
// falls back to its pre-written corpus — with delayMs preserving the
// "drafting…" beat offline. So in mock/?mock mode, mission content is the
// corpus shown after a realistic pause; live mode hits the real model.
const CONTENT_MOCK: MockContact = {
  dialogue: {},
  wildcards: { confused: '' },
  classify: () => 'confused',
  toneFor: () => 'neutral',
  generateContent: () => '',
  delayMs: 900,
};

/** Service for single-turn mission CONTENT generation (post-flip missions —
 *  e.g. Cover Duty draft replies). Live transport in llamacpp mode; in mock
 *  mode a MockModelService whose generateContent returns empty so callers
 *  fall back to their corpus (the deterministic offline path). No per-call
 *  fallback handler — content fallback is the mission layer's job. */
export function makeContentService(): ModelService {
  if (activeBackend() === 'llamacpp') {
    const urlOverride = llamaUrlOverride();
    return new LlamaCppModelService({
      ...DEFAULT_LLAMA,
      baseUrl: defaultLlamaBaseUrl(),
      ...(urlOverride ? { baseUrl: urlOverride } : {}),
    });
  }
  return new MockModelService(CONTENT_MOCK);
}
