# llama-launcher — Backend Detection, Probe, and Two-Model Tiering (v1)
### June 9, 2026 · Code thread

**Purpose:** Implements [inference-acceleration-assessment_v3.md](inference-acceleration-assessment_v3.md) §A's "runtime GPU detection + probe" and "two-model tiering" as a config-driven launcher. One command starts the *right* llama-server for whatever machine it's on, with measured proof it works.

```
npm run llm                  # probe candidates in order, keep the winner serving
npm run llm -- --probe-only  # probe, print the attempt table, shut down
npm run llm -- --config path/to/other.json
```

## The policy (the part that ships)

The memo's key insight is that **"GPU exists" is not the bar — broken GPU stacks fail by running silently slow.** So the launcher never trusts a backend that merely starts:

1. Take the candidate list from config, in priority order. Each candidate = a llama.cpp build dir + a model + flags (+ optional env, e.g. `RADV_PERFTEST=nogttspill` on Deck).
2. Spawn it, wait for `/health` (generous timeout — E4B cold-loads in ~27s).
3. **Time a real 48-token completion.** Throughput ≥ the playable floor (default **12 tok/s**, the memo's proven-playable E2B-on-Deck-CPU baseline) → keep it serving. Below → kill it, try the next candidate.
4. A candidate that won't start, won't answer, or generates too slowly falls through with its reason recorded; the final report prints every attempt so "why am I on the fallback?" answers itself.
5. Everything fails → exit 1 (the game's `?mock` canned-dialogue path is the floor below the floor).

Two-model tiering is just config: GPU candidates carry E4B, the last-resort CPU candidate carries E2B Q4_K_M. No game code knows or cares — the game talks to `:8080` either way.

The policy lives in `scripts/llamaLauncherCore.mjs` (pure, no I/O, 15 vitest tests in `tests/launcher/`); `scripts/llamaLauncher.mjs` is the process-spawning shell around it. At ship, the Tauri shell takes over the spawning role and the core moves across unchanged.

## Per-machine configs

`scripts/llama-launcher.config.json` is the dev box's config (Snapdragon X2 Elite):

| Priority | Candidate | Why |
|---|---|---|
| 1 | `adreno-e4b` — OpenCL Adreno build, `-ngl 99` | tg 22.8 tok/s but **pp 424** (2.3× CPU). Deep-conversation felt latency is prompt-processing-dominated (history rewriting defeats prefix caching), so the GPU wins where it matters — and it leaves the CPU free for Vite + the game. |
| 2 | `cpu-e4b` — CPU arm64 build | tg 31.9 tok/s at 8 threads. Excellent fallback; still the production model. |
| 3 | `cpu-e2b` — CPU arm64 build, E2B Q4_K_M | The memo's universal floor. |

**Deck variant** (when llama lands on the Deck properly): candidate 1 = Vulkan build + E4B + `-ngl 99` + `env: {"RADV_PERFTEST": "nogttspill"}`, candidate 2 = CPU + E2B with explicit `threads: 4` (the benchmark-validated value). Same script, different JSON.

`threads: "auto"` = `min(8, max(2, cores − 2))` — generation is memory-bandwidth-bound and measured to **peak at 8 threads and decline beyond** (X2 Elite, 2026-06-09), and reserving 2 cores keeps the game itself responsive. Honors the "ship must auto-detect cores, never hardcode 4" rule; pin explicitly where a platform has a validated value.

## What this does NOT do (yet)

- **Spawning at ship.** Tauri owns that; this is the dev-time incarnation + the policy proving ground.
- **Tell the game which model won.** The game doesn't need to know today (same endpoint, same prompts). If per-model sampling/prompt tweaks ever land, the launcher's attempt report is the natural source.
- **Per-platform build downloads.** Config points at build dirs you already have (see [llama-setup_v1.md](llama-setup_v1.md)).

**Probe noise:** the probe is wall-clock and load-sensitive — the same adreno-e4b candidate measured 16.8 tok/s on an idle machine and 13.3 with a test suite running concurrently. The floor is a *playable bar*, not a ranking; a load-induced false negative just demotes one tier (on this box: to cpu-e4b, which is also excellent), so don't chase precision here.

## Measured validation (X2 Elite, 2026-06-09)

- Happy path: `adreno-e4b` starts, probes at ~20+ tok/s, kept serving. *(See PR for the live run output.)*
- Fall-through: pointing candidate 1 at a nonexistent build dir falls through to `cpu-e4b` with the spawn failure recorded in the attempt table.
- Port pre-flight: a server already on `:8080` produces a clear "stop it first" error instead of a silent fight.
