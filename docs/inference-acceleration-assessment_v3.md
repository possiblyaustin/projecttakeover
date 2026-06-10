# Inference Acceleration — Decision Memo (v3)
### June 9, 2026 · Supervisor thread → Code & Story

**Purpose:** Records the decision to adopt **Gemma 4 E4B (QAT Q4_0)** as the production NPC model, the Deck evidence behind it, and the concrete engineering items Code must resolve to ship it cross-platform. Supersedes v2's "evaluate" posture.

> **What changed v2 → v3:** We ran real Deck benchmarks (the first *valid* GPU numbers this project has had) and a production-faithful quality comparison across E2B Q4_K_M, E2B QAT Q4_0, and E4B QAT Q4_0. Result: GPU offload is transformative on the Deck, E4B is a real quality step-up, QAT is a wash, and a latency bug (over-generation) was found that helps every model once fixed.

---

## The Decision

**Adopt E4B QAT Q4_0 as the production NPC model**, running with **full Vulkan GPU offload** (`-ngl 99`, `RADV_PERFTEST=nogttspill`) on the Steam Deck. E4B delivers the richer dialogue and the decisive in-character commitment we've struggled to get from E2B, and GPU offload makes it affordable on our lowest-spec target.

This decision is conditional only on two integration-time validations (below) — not re-litigations of the choice.

---

## The Evidence

### 1. GPU offload is transformative on the Deck (first valid measurement)

The April benchmark's "Vulkan made no difference" finding was an artifact: that binary was compiled *without* Vulkan, so `-ngl` was silently ignored. With a proper Vulkan build (RADV / Van Gogh), measured via `llama-bench`:

| Model | Backend | tg (tok/s) | vs CPU |
|---|---|---|---|
| E2B Q4_K_M | CPU | 12.67 | baseline |
| E2B Q4_K_M | **GPU** | **35.18** | **+178%** |
| E2B QAT Q4_0 | GPU | 36.48 | +188% |
| E4B QAT Q4_0 | CPU | 6.90 | -46% |
| E4B QAT Q4_0 | **GPU** | **18.95** | playable |

GPU offload is bandwidth-bound in theory but the Van Gogh iGPU still delivered ~3x on E2B and lifted E4B from unusable (6.9) to playable (~19). The device reports `uma: 1` — llama.cpp handles the shared-memory allocation natively, **no BIOS/UMA change required**. RAM headroom confirmed (~11 GiB free in a clean state; E4B ~4.8 GiB loads with room for the game).

### 2. E4B is the quality upgrade; QAT is a wash; format is already solved

Production-faithful run (v3 prompt, 4096 ctx, `/v1/chat/completions`, identical sampling), 9 real Story probes per model:

| Dimension | E2B Q4_K_M | E2B QAT Q4_0 | E4B QAT Q4_0 |
|---|---|---|---|
| Clean first-block format | 9/9 | 9/9 | 9/9 |
| Steady speed (GPU) | ~32 tok/s | ~32 tok/s | ~17 tok/s |
| Felt latency | ~6–10s | ~6–10s | ~15–21s* |
| Richness | Good | Good | **Best** |
| Boundary discipline | Clean | One soft slip | Clean |
| Commitment on flip | Commits, hedges | Stays too cheerful | **Drops the mask** |

\* *Inflated by the over-generation bug — see below. Real useful-content latency post-fix is ~10–11s.*

- **Format adherence is solved by the prompt, not the model.** All three hit 9/9 clean blocks including on deep multi-turn. History rewriting + v3 primacy/one-shot is doing the work. Model choice does not affect this.
- **QAT vs Q4_K_M at E2B is a wash** — comparable quality, slightly larger file, identical speed, and QAT produced the only boundary slip. **No reason to switch E2B quants. Question settled.**
- **E4B is meaningfully richer** — more varied, textured metaphors; cleaner boundary handling; and the only model that actually dropped the manic cheerfulness on the COMMITTED flip the way the state directs. That directly addresses our two hardest problems (richness + decisive commitment).

---

## Architectural consequence: GPU is now load-bearing

Previously CPU-only was the safe universal path. **Choosing E4B retires that.** E4B is only viable with GPU offload (CPU is ~7 tok/s). This makes the cross-platform GPU build + fallback matrix a required deliverable, not a someday-optimization. This is the core of what Code must sort.

---

## What Code Must Sort

### A. Cross-platform GPU backends + CPU fallback (the big one)

llama.cpp already has the backends — the work is build/packaging, runtime detection, and graceful degradation:

- **Backend per platform:** Vulkan covers AMD + Nvidia + Intel on Windows/Linux (one build); Metal for macOS; CUDA optional for Nvidia if Vulkan underperforms. Adreno/Qualcomm (incl. Austin's X2 Elite dev laptop and any future mobile) is the **hit-or-miss case** — Vulkan-on-Adreno / Windows-on-ARM drivers are inconsistent.
- **Runtime GPU detection + probe:** detect not just whether a GPU exists but whether offload actually *works* (bad drivers fail or silently run slow). Probe at startup, then route.
- **Fallback strategy — recommended: two-model tiering.** Because E4B on CPU (~7 tok/s) is a poor experience, the cleanest fallback is **GPU-capable → E4B; no working GPU → E2B Q4_K_M on CPU (12.7 tok/s, proven playable)**. ModelService already abstracts model selection, so this is a config/selection layer, not a rewrite. Trade-off: ship both GGUFs (~6.4 GB combined) and install size grows (~2 GB → ~7 GB). Still fine for Steam. The simpler alternative — ship E4B only, fall back to E4B-on-CPU with dial-up cover — is lighter but degrades badly on GPU-less machines. **Austin/Code to choose; Supervisor recommends two-model tiering for the "works everywhere" goal.**
- **Dev-environment caveat:** Austin builds on a Snapdragon X2 Elite (Adreno, Windows-on-ARM) where Vulkan may not cooperate. Expect his dev box may run the CPU/E2B fallback path while the Deck runs Vulkan/E4B — fine for development, but Code should confirm the build at least *runs* there and doesn't hard-fail when GPU init fails.

### B. Over-generation — re-measure on the live prompt, then fix if warranted

Across all models in our run, the model emits a valid 3-option block, then **keeps going** — repeating the block, occasionally a `[4]`, sometimes leaking `[/HELPYR_STATE]` — until stop or token ceiling. The parser already discards everything after the first block, so it's invisible to players, but it **wastes generation time** (often half the tokens on a long response), which inflates latency, E4B's most.

- **Important:** our harness used the **v3 (primacy + one-shot) prompt from the format-adherence doc.** The *live shipping prompt* may have been revised since in ways that already reduce this tail. **Action: Code re-measures over-generation against the current production prompt** — quantify how many tokens past the first clean block each model emits — before deciding a fix is needed.
- **If it persists:** the cleanest fix is **stream-and-abort** — stop the request once three valid options are parsed (the typewriter effect likely streams already). A server-side `stop` string is awkward here because repeats begin with `[1]`. Expected payoff: E2B → ~6s, E4B → ~10–11s.

### C. E4B integration specifics

- **Cold load is longer.** E4B is 4.9 GB; first load + warmup was ~27s in testing (one-time). Production loads once at launch — the boot/load screen must cover a longer load than E2B's 2–3s.
- **Model swap** is a ModelService config change (GGUF path + any sampling), not code surgery — by design.

---

## Validate before final lock (due diligence, not blockers)

1. **Battery + thermals on the Deck, unplugged.** All benchmarks were plugged in. E4B sustains ~2x the GPU load; on a handheld that's heat and battery drain. Run a real unplugged session watching temps and battery rate — the classic "fine at the desk, rough on the couch" risk.
2. **In-game felt latency at ~10–11s** (post over-generation fix), in an actual typewriter-paced conversation — harness numbers aren't the lived experience.

---

## Settled / corrected

- **QAT Q4_0:** evaluated, not adopted. Wash vs Q4_K_M at E2B. (The QAT GGUF remains the E4B file we're shipping, simply because it's Google's Q4_0 release for E4B.)
- **"CPU-only is sufficient":** retired. That conclusion rested on a non-functional Vulkan binary.
- **Context budget — correction for Story:** the production system prompt tokenizes to **~1,355 tokens, not the ~685 the persona doc estimated** — about a third of the 4096 window before any dialogue. Still leaves ~20+ turns (growth ~120 tok/turn), fine for an encounter, but if E4B + richer state injection ever pressures context, the persona doc's trim options (A/B/C) are the lever.

---

## Reference: measured data

- GPU bench (tg tok/s): E2B 35.2 / E2B-QAT 36.5 / E4B 19.0. CPU: E2B 12.7 / E4B 6.9.
- Quality run: 27 generations (3 models × 9 probes), all 9/9 clean first-block format, zero thinking-leaks (so `--reasoning off` holds on build 9586).
- Steady E4B GPU per-response: ~15–21s currently (over-generation inflated), ~10–11s projected post-fix.
- Files: `quality_harness.py`, `helpyr_system_v3.txt`, `quality_results.txt` (this session).
