# Inference Acceleration — Assessment & Code Team Handoff (v2)
### June 3, 2026 · Supervisor thread → Code / LLM thread

**Purpose:** Latency on E2B/Steam Deck (~11s exchanges) is starting to strain what feels acceptable. This doc consolidates the research so Code has one reference, covering:

1. **CPU-only E2B MTP drafting** — is it time to act?
2. **GPU acceleration & runtime** — feasibility across platforms, whether bigger models (E4B, the new 12B) help, and what the mobile-vs-Deck gap actually tells us.

This is a research/strategy doc, not a directive. Code owns implementation calls.

> **What changed v1 → v2:** Added (a) why E4B does *not* unlock drafting; (b) the runtime insight behind strong mobile performance (LiteRT + NPU) and what it means for the Deck; (c) LiteRT-LM as a runtime candidate behind ModelService; (d) confirmed testing context — the Deck is the binding constraint and will be rougher than the current dev box suggests; (e) sharpened open questions / the Pillar 5 tension.

---

## Part 1 — CPU-only E2B MTP Drafting

### Status (as of today)
- **Upstream PR [#23398](https://github.com/ggml-org/llama.cpp/pull/23398) (am17an)** is the credible merge path. **Still Draft, not merged**, needs two code-owner approvals. Its own description: works for **31B and 26B-A4B but *not* the E2B/E4B variants yet** — the edge variants use a "centroid" LM head that's the unfinished path.
- **GGUF drafters exist** but use the custom `gemma4_assistant` arch and **won't load in stock llama.cpp** — fork required.
- **Working edge-variant implementations are fork-only:** `reffdev/llama.cpp` (`gemma4-mtp`) and `AtomicBot-ai/atomic-llama-cpp-turboquant`.

### Does switching to E4B unlock drafting? **No.**
E2B and E4B are **coupled** on this axis. They share the same centroid LM head, they're *both* excluded from upstream PR #23398, and they *both* run only on the same community forks (reffdev tested their fork on E4B specifically; AtomicBot supports both). Moving to E4B changes nothing about drafting availability — same fork dependency, same wait for upstream. And E4B is a *larger* base model, so even with a drafter the best case is "E4B + drafter ≈ E2B-raw speed, better quality" — a quality play, not a performance win. Given performance is the priority over model power, **E4B is not the lever.**

### Two caveats that temper the drafting upside
- **Our workload is the worst case for acceptance.** In am17an's benchmark, short creative/conversational text had the *lowest* acceptance (~40%) vs ~80% for code/math. NPC dialogue is exactly that profile → smallest speedup, not the headline 2–3x.
- **Not on the critical path.** ~11s exchanges are validated; the dial-up aesthetic gives narrative cover.

### Recommendation
**Hold on adoption. Revisit when E2B support merges to upstream master** (track PR #23398). Acceptable near-term action: a **strictly time-boxed throwaway benchmark spike** on the `reffdev` fork on the Deck — measure tok/s + acceptance on real HELPYR-style prompts vs the 12.7 baseline, then discard. A data point, **not** a shipped dependency. Code's call to schedule.

> Worth noting: drafting attacks the decode bottleneck more directly than GPU offload does (fewer sequential weight sweeps per token), which keeps it the **highest-leverage Deck lever** despite the fork block.

---

## Part 2 — GPU Acceleration & Runtime

### The key reframe: GPU is not a "port"
llama.cpp **already has every backend we'd need** — they're build flags, not new code. The work is **build/packaging + per-platform config**, mediated by the existing ModelService abstraction.

| Platform | Backend | Maturity | Notes |
|---|---|---|---|
| **Steam Deck / AMD APU** (lead) | **Vulkan** (RADV/Mesa) | Good | ROCm does **not** support the Deck APU (gfx1033) — Vulkan is the only path. `RADV_PERFTEST=nogttspill` fixes known perf issues. |
| **Nvidia** (discrete) | **CUDA** | Excellent | Dedicated VRAM, high bandwidth — where GPU actually shines. |
| **AMD** (discrete Radeon) | **ROCm/HIP** or Vulkan | Good | Vulkan = safer universal fallback. |
| **Apple Silicon** | **Metal** | Excellent | Native, well-optimized, high-bandwidth unified memory. |
| **Qualcomm / Adreno** (mobile) | **OpenCL / Vulkan** (llama.cpp) or **LiteRT QNN** (see below) | Mixed | Mobile is post-v1 deferred. |

A single **Vulkan build covers AMD + Nvidia + Intel + most others**; Apple wants a separate **Metal build**.

### The hardware caveat for our lead platform
**On a unified-memory APU like the Deck, GPU offload does NOT escape the memory-bandwidth wall.** Decode (our actual bottleneck) is bandwidth-bound, and the Deck's CPU + iGPU **share the same ~88–102 GB/s bus**. Moving decode to the iGPU adds no bandwidth, so gains are modest — AMD's own data shows bandwidth-bound models seeing only ~5–17% from Vulkan offload. The Deck's iGPU (8-CU RDNA2) is also *weaker* than the Ryzen AI parts in that data, so expect the low end or even a wash. A common conservative pattern is `ngl 0` (GPU accelerates prefill only, CPU handles decode). **Net: worth a benchmark, but not a category change on the Deck.**

### Why mobile is fast — and why it doesn't transfer to the Deck
E4B runs *well* on a Z Fold 7 (12GB) via **Google AI Edge Gallery**. The reason is not the model — it's the **runtime**. AI Edge Gallery uses **LiteRT-LM**, and on Snapdragon it runs on the **Adreno GPU and the Hexagon NPU via Qualcomm's QNN delegate**. Those accelerators are a different universe from CPU inference: Google reports NPU at up to ~100x over CPU / ~10x over GPU, and ~31 tok/s decode for E2B on a Dragonwing NPU device. That's why the *bigger* model runs faster on a phone than our *smaller* model does CPU-only on the Deck (12.7 tok/s). **The gap is runtime + hardware acceleration, not model size.**

**Critically, this does not rescue the Deck.** The thing breaking the bandwidth wall on phones is the **dedicated NPU** — and **the Deck has no NPU.** It has a weak Zen 2 CPU, a weak 8-CU iGPU, shared memory bandwidth, and no neural accelerator. Decode is bandwidth-bound, and **no runtime swap out-runs a hardware bandwidth ceiling.** Vulkan offload, drafting, and LiteRT all hit the same wall on the Deck from different angles.

### Runtime alternative worth evaluating: LiteRT-LM
Surfaced by the Fold observation. LiteRT-LM is now **cross-platform with GPU support across Android, iOS, macOS, Windows, Linux, and Web**, is Google's first-class path for Gemma, supports Gemma natively, and has Metal acceleration on Apple and NPU delegates on Qualcomm/Intel/MediaTek.

- **Where it would win big:** mobile (NPU) and Apple Silicon (Metal). If mobile ever comes off the deferred list, LiteRT is almost certainly the path.
- **Where it likely doesn't help:** the Deck (AMD, no NPU, shared bandwidth) — unproven there and probably hits the same wall as llama.cpp Vulkan.
- **Cost:** adopting a *second* runtime behind ModelService is real scope. ModelService makes it *feasible* to evaluate; it does not make it free. Treat as **"evaluate," not "adopt."**

### Does GPU unlock bigger models?
- **E4B:** Bigger than E2B, still bandwidth-bound on the Deck — GPU won't make it fast there. Comfortable on discrete GPU / Apple Silicon. A **secondary-platform quality option**, not a Deck win.
- **Gemma 4 12B (released today):** Multimodal, encoder-free, MTP-drafter-ready, Apache 2.0 — impressive. **But Google positions it as needing ~16GB VRAM / unified memory.** The Deck's 16GB is *shared* with SteamOS + our Tauri app + the desktop sim, so a 12B (~7GB Q4 weights + KV + multimodal overhead) *alongside the game* is tight-to-infeasible. It's a laptop/discrete-GPU/Mac model, not a handheld-while-gaming model.

### Distribution implication (the real cost)
CPU-only is **one binary that runs everywhere** — a major asset for a solo dev. GPU means multiple builds (Vulkan + Metal min.), runtime backend detection + graceful CPU fallback (drivers are hit-or-miss), and more QA surface. A second runtime (LiteRT) multiplies this further. The *game* doesn't change (ModelService abstracts it), but the **build pipeline and Steam packaging do.**

---

## Part 3 — Synthesis & Next Steps

### Confirmed testing context (important)
Current dev testing is on a **Snapdragon X2 Elite capped to 4 cores** to approximate the Deck. But Oryon cores are *far* stronger per-core than Zen 2 even when capped, so this is an **optimistic** proxy. "Just acceptable" on that box means **the actual Deck will feel rough** CPU-only. The Deck is confirmed as the **binding constraint**, and it needs *a* hardware-acceleration or latency-reduction story before launch.

### The honest platform-tiered picture
- **Steam Deck (lead):** the hardest target. No single silver bullet — GPU offload (modest, maybe a wash), drafting (highest-leverage but fork-blocked), LiteRT (unproven, no NPU to exploit) all hit the bandwidth wall. The realistic path to "acceptable" is likely a **combination**: modest Vulkan offload + tighter response-length tuning + leaning further into the dial-up framing.
- **Discrete GPU / Apple Silicon (secondary):** GPU genuinely unlocks E4B and possibly 12B. The tension is **fragmentation** of NPC quality/behavior across platforms — a design call, not a technical one.

### Recommended experiments for Code (all time-boxed, all throwaway)
1. **Vulkan GPU offload benchmark on the Deck** — build with `-DGGML_VULKAN=on`, run E2B with varying `ngl` (incl. `ngl 0`) + `RADV_PERFTEST=nogttspill`, measure decode tok/s and full-exchange latency vs the 12.7 CPU baseline. **Lowest-risk, highest-information first step** — tells us if GPU offload is real on the Deck or a wash.
2. **Response-length / token-budget tightening** — independent of any runtime work; fewer generated tokens = directly shorter waits. Cheapest lever, helps every platform.
3. **(Optional) reffdev fork drafting spike** — per Part 1, only if slack exists.
4. **(Optional, future-facing) LiteRT-LM spot check** — only relevant if mobile/Apple gets prioritized; not a Deck fix.

### Open questions for Austin (the decisions that gate everything)
1. **What is the NPC-quality/latency bar by platform?** "Same experience everywhere" vs "the Deck gets a deliberately lighter/slower experience covered by the dial-up framing, stronger hardware gets more." This single answer drives whether bigger-models/GPU/LiteRT are worth pursuing at all.
2. **Pillar 5 tension to decide consciously:** Pillar 5 is "Steam Deck first," and the Deck is also the single hardest inference target. That's a real collision. Better to resolve it deliberately now than discover it at launch — is the Deck the quality floor everything else must match, or the lowest tier that the aesthetic justifies?

### Risk flags
- Don't let "GPU acceleration" or "evaluate LiteRT" become an open-ended platform-support project — classic scope-creep for a solo dev. Keep to time-boxed benchmarks until a number justifies more.
- Fork dependencies (drafting) and multi-build/multi-runtime pipelines both add **ongoing maintenance load** — the scarcest resource here. Weigh against Act 1 loop-closing.
- The Deck performance problem is **partly unfixable in software** (hardware bandwidth + no NPU). Plan for "make it acceptable + cover with design," not "make it fast."

---

### Reference links
- Upstream Gemma 4 MTP PR: https://github.com/ggml-org/llama.cpp/pull/23398
- Gemma 4 MTP support discussion: https://github.com/ggml-org/llama.cpp/discussions/22735
- llama.cpp Vulkan performance thread: https://github.com/ggml-org/llama.cpp/discussions/10879
- llama.cpp ROCm/HIP performance thread: https://github.com/ggml-org/llama.cpp/discussions/15021
- Gemma 4 12B announcement: https://blog.google/innovation-and-ai/technology/developers-tools/introducing-gemma-4-12b/
- AMD Vulkan iGPU offload data: https://www.amd.com/en/blogs/2024/accelerating-llama-cpp-performance-in-consumer-llm.html
- LiteRT universal framework (desktop GPU support): https://developers.googleblog.com/litert-the-universal-framework-for-on-device-ai/
- LiteRT-LM overview: https://ai.google.dev/edge/litert-lm/overview
- LiteRT Qualcomm NPU acceleration: https://developers.googleblog.com/unlocking-peak-performance-on-qualcomm-npu-with-litert/
