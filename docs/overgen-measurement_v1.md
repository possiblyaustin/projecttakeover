# Over-Generation Measurement — Live Prompt (v1)
### June 9, 2026 · Code thread → Supervisor & Story

**Purpose:** Answers [inference-acceleration-assessment_v3.md](inference-acceleration-assessment_v3.md) §B's action item: *"Code re-measures over-generation against the current production prompt before deciding a fix is needed."*

**Verdict: the live shipping prompt does not over-generate. No fix is warranted. Stream-and-abort is shelved.**

---

## Method

`scripts/measureOvergen.ts` (committed alongside this doc, rerunnable any time) drives a scripted 8-turn HELPYR conversation against a local `llama-server` using the **exact production request path**:

- Real prompt assembly: `HelpyrPersonaPrompt` (v2) + `buildHelpyrStateBlock` + reputation seam — tokenizes to **1,351 tokens** live (memo's ~1,355 estimate confirmed).
- Real `toModelHistory` rewrite (the `[1][2][3]` re-injection on assistant history entries).
- Real `parseModelOutput` to delimit the useful prefix.
- Production `max_tokens: 512`, `/v1/chat/completions`, no sampling overrides.
- Player turns mirror the Story probe spread: friendly / curious / emotional / technical-ask / boundary-probe / hostile-ish.

Per turn: `wasted = completion_tokens − tokenize(useful prefix)`. Run on the Snapdragon X2 Elite dev box, llama.cpp **b9585** (same vintage as the memo's quality run on 9586), CPU arm64, 8 threads.

Run it: start a server on `:8080`, then `npx vite-node scripts/measureOvergen.ts -- --label <name>`.

## Results

| Model | Turns | Clean parses | Total completion | Total wasted | Avg turn |
|---|---|---|---|---|---|
| E4B QAT Q4_0 | 8 | 8/8 | 1,004 tok | **−1 (−0.1%)** | 6.3s |
| E2B Q4_K_M | 8 | 8/8 | 1,011 tok | **31 (3.1%)** | 3.9s |

E4B's per-turn waste was 0–1 tokens on every turn — the model emits reply + options block and stops on its own EOS. E2B had one turn with a 33-token tail (20% of that turn); every other turn was ≤1 token. Nothing remotely like the memo's "half the tokens on a long response."

## Why the memo's harness saw a tail and we don't

The memo's harness ran the Supervisor thread's **v3 (primacy + one-shot) prompt** from the format-adherence work. The live game ships the **v2 persona prompt** (format instructions at the end, no one-shot example). Whatever provokes the repeat-the-block tail under the harness prompt does not occur under the shipping prompt — exactly the contingency §B anticipated. Side finding for Story: the live v2 prompt also went **16/16 clean first-block parses** across both models at depth 8, so v2's format adherence is in good shape as-is; adopting the v3 prompt structure for production would need this measurement rerun first.

## Consequences

- **Stream-and-abort: shelved.** It would add streaming-transport complexity to claw back ~0–3% of generation. Scope discipline says no. The design sketch (stream + incremental first-block detector + abort) is preserved in this doc's git history / Code thread notes if it's ever needed.
- **E4B's 30s-timeout risk: retired.** With no runaway tail, real completions are ~100–140 tokens (~5–8s of generation on Deck GPU at ~19 tok/s) — nowhere near the transport's `timeoutMs` 30s cap even with deep-history prompt processing on top.
- **Memo's projected "post-fix" latency is simply today's latency.** E4B felt-latency on Deck should be re-validated as-is (memo validation item 2), no fix gating it.
- **Rerun trigger:** any change to the response-format section of a persona prompt (especially adopting the harness v3 structure), a llama.cpp build bump on the shipping config, or a new model. The script is model-agnostic at the transport level; new personas need their prompt assembly added.

## Hardware context (X2 Elite dev box, measured same day)

E4B QAT Q4_0, llama-bench: CPU tg peaks at **8 threads = 31.9 tok/s** (b9585; bandwidth-bound past 8 — 12/16 threads are slower). Adreno X2-90 via the OpenCL backend works: pp512 **424 tok/s** (2.3× CPU) but tg **22.8** (< CPU). Dev box runs E4B-on-CPU faster than Deck-GPU, so the dev environment uses the production model with no fallback tier: `C:\llm\start-llama-e4b.bat` (b9585, `--threads 8`). The old `--threads 4` Deck-parity pin is retired for E4B dev use; 4-thread Deck parity remains available via the original `start-llama.bat`.
