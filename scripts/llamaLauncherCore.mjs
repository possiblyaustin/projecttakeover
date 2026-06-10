// llama-launcher core — pure routing logic, no I/O.
//
// Implements the inference-acceleration memo v3 §A policy: try backend
// candidates in priority order, keep the first one that PROVABLY works
// (generates real tokens at or above the playable floor), fall through
// otherwise. "Starts up" is not the bar — bad GPU drivers fail by
// running silently slow, so the probe measures throughput, not liveness.
//
// Kept I/O-free so the routing behavior is unit-testable: the runner
// (start/probe/stop) is injected. scripts/llamaLauncher.mjs supplies
// the real one (spawn llama-server, poll /health, time a completion).

/** Default playable floor (tok/s). Memo v3: E2B on Deck CPU at 12.7
 *  tok/s is the proven-playable baseline; anything at or above it is
 *  acceptable, anything below means "this backend isn't really working
 *  here — fall through." Overridable per candidate and globally. */
export const DEFAULT_MIN_TOKENS_PER_SECOND = 12;

/** Generation throughput from a timed probe completion. The probe
 *  prompt is tiny (~30 tokens), so wall-clock is generation-dominated
 *  and this is a good-enough tg estimate for a pass/fail gate. */
export function tokensPerSecond(completionTokens, elapsedMs) {
  if (!(completionTokens > 0) || !(elapsedMs > 0)) return 0;
  return completionTokens / (elapsedMs / 1000);
}

/** Thread-count policy when a candidate says "auto". Measured on real
 *  hardware (2026-06-09, X2 Elite): generation is memory-bandwidth
 *  bound — tg peaked at 8 threads on an 18-core part and DECLINED
 *  beyond. So: never more than 8, leave 2 cores for the game itself,
 *  floor of 2. Per-candidate explicit `threads` overrides this (the
 *  Deck config pins the benchmark-validated value). */
export function autoThreads(logicalCores) {
  return Math.min(8, Math.max(2, (logicalCores | 0) - 2));
}

/** Shape-check a launcher config. Throws with a actionable message on
 *  the first problem found. Returns the config for chaining. */
export function validateConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') throw new Error('config: not an object');
  if (!Number.isInteger(cfg.port)) throw new Error('config: "port" must be an integer');
  if (typeof cfg.host !== 'string' || cfg.host.length === 0)
    throw new Error('config: "host" must be a non-empty string');
  if (!Array.isArray(cfg.candidates) || cfg.candidates.length === 0)
    throw new Error('config: "candidates" must be a non-empty array');
  cfg.candidates.forEach((c, i) => {
    const at = `config: candidates[${i}]`;
    if (!c || typeof c !== 'object') throw new Error(`${at}: not an object`);
    if (typeof c.name !== 'string' || c.name.length === 0)
      throw new Error(`${at}: "name" must be a non-empty string`);
    if (typeof c.serverDir !== 'string' || c.serverDir.length === 0)
      throw new Error(`${at} (${c.name}): "serverDir" must be a non-empty string`);
    if (typeof c.model !== 'string' || c.model.length === 0)
      throw new Error(`${at} (${c.name}): "model" must be a non-empty string`);
    if (c.threads !== undefined && c.threads !== 'auto' && !Number.isInteger(c.threads))
      throw new Error(`${at} (${c.name}): "threads" must be an integer or "auto"`);
    if (c.args !== undefined && !Array.isArray(c.args))
      throw new Error(`${at} (${c.name}): "args" must be an array of strings`);
    if (c.env !== undefined && (typeof c.env !== 'object' || Array.isArray(c.env)))
      throw new Error(`${at} (${c.name}): "env" must be an object`);
    if (c.minTokensPerSecond !== undefined && typeof c.minTokensPerSecond !== 'number')
      throw new Error(`${at} (${c.name}): "minTokensPerSecond" must be a number`);
  });
  return cfg;
}

/** The playable floor for one candidate: per-candidate override, else
 *  global probe setting, else the default. */
export function minTokensPerSecondFor(candidate, cfg) {
  if (typeof candidate.minTokensPerSecond === 'number') return candidate.minTokensPerSecond;
  if (cfg?.probe && typeof cfg.probe.minTokensPerSecond === 'number')
    return cfg.probe.minTokensPerSecond;
  return DEFAULT_MIN_TOKENS_PER_SECOND;
}

/**
 * Try candidates in order; return the first that starts AND probes at
 * or above its playable floor.
 *
 * runner contract (all async, all may throw to signal failure):
 *   start(candidate) -> handle        spawn + wait healthy
 *   probe(candidate) -> {tokensPerSecond, ...extra}   timed generation
 *   stop(handle, candidate) -> void   kill + wait for port release
 *
 * Returns {candidate, handle, probe, attempts} on success, or
 * {candidate: null, attempts} when every candidate failed. `attempts`
 * records every candidate tried with its outcome — the caller logs it
 * and the Deck/dev "why did I get the fallback?" question answers
 * itself. The winning server is left RUNNING (its handle is returned);
 * losers are always stopped, even when start/probe threw.
 */
export async function pickCandidate(cfg, runner, log = () => {}) {
  const attempts = [];
  for (const candidate of cfg.candidates) {
    const floor = minTokensPerSecondFor(candidate, cfg);
    let handle = null;
    try {
      log(`[launcher] trying "${candidate.name}" …`);
      handle = await runner.start(candidate);
      const probe = await runner.probe(candidate);
      const tps = probe?.tokensPerSecond ?? 0;
      if (tps >= floor) {
        log(`[launcher] "${candidate.name}" PASSED: ${tps.toFixed(1)} tok/s (floor ${floor})`);
        attempts.push({ name: candidate.name, outcome: 'passed', tokensPerSecond: tps, floor });
        return { candidate, handle, probe, attempts };
      }
      log(
        `[launcher] "${candidate.name}" too slow: ${tps.toFixed(1)} tok/s < floor ${floor} — falling through`,
      );
      attempts.push({ name: candidate.name, outcome: 'too_slow', tokensPerSecond: tps, floor });
      await runner.stop(handle, candidate);
      handle = null;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      log(`[launcher] "${candidate.name}" failed: ${reason} — falling through`);
      attempts.push({ name: candidate.name, outcome: 'failed', reason, floor });
      if (handle) {
        try {
          await runner.stop(handle, candidate);
        } catch {
          // Best-effort cleanup; the next start() pre-flights the port.
        }
      }
    }
  }
  return { candidate: null, attempts };
}
