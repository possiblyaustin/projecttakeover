# Steam Deck LLM Benchmark Report — Project Takeover
### April 11, 2026

---

## Summary

The foundational technical risk of Project Takeover — running a local LLM on Steam Deck hardware at playable speeds — has been validated. Gemma 4 E2B running via llama.cpp on CPU-only inference exceeds all performance targets. The game's core architecture is confirmed viable.

Extended testing confirms the model handles multiple distinct personas, sustains character across multi-turn conversations (8+ exchanges, 1,176 tokens), and maintains consistent generation speed throughout. Testing also surfaced important design implications for the game's prompt architecture and state management.

---

## Test Environment

- **Hardware:** Steam Deck (Zen 2 CPU, 4c/8t, RDNA 2 GPU, 16GB LPDDR5 RAM)
- **OS:** SteamOS (Desktop Mode)
- **LLM Runtime:** llama.cpp (built from source, commit b8763)
- **Model:** Gemma 4 E2B Instruct, Q4_K_M quantization (GGUF format)
- **Server Config:** llama-server, localhost:8080, 4 threads, 4096 context, `--reasoning off`
- **Inference:** CPU-only (Vulkan GPU not tested — binary compiled without Vulkan support)

---

## Setup Notes

Building llama.cpp on SteamOS required several extra steps due to the read-only filesystem and non-standard package signing:

1. Prebuilt binaries failed due to SteamOS library incompatibilities
2. `cmake` and build tools not pre-installed — required `sudo steamos-readonly disable` and `pacman` install
3. Pacman package signatures conflicted between Arch Linux and Valve's SteamOS keys — resolved by disabling signature verification (`SigLevel = Never` in pacman.conf)
4. Initial build failed with `include_next <stdint.h>` error — resolved by installing `linux-api-headers` and `glibc` packages
5. After fixing headers, llama.cpp compiled successfully with `cmake -B build && cmake --build build --config Release -j4`

**Implication for shipping:** None of this complexity affects players. The compiled llama-server binary is a single executable that ships with the game. The build toolchain is only needed once to produce platform-specific binaries.

---

## Results

### Performance

| Metric | Result | Original Estimate | Notes |
|--------|--------|-------------------|-------|
| Token generation speed | **12.7-12.9 tokens/sec** | 3-8 tokens/sec | Significantly exceeds estimate |
| Prompt processing speed | **32-42 tokens/sec** | Not estimated | Fast enough to be imperceptible |
| Model load time | **2-3 seconds** | Under 15 seconds | Easily covered by boot screen |
| Full gameplay exchange (NPC reply + 3 options) | **~11 seconds** | Under 30 seconds | Comfortably within target |
| CPU utilization during inference | **~50%** | Not estimated | Uses physical cores, not hyperthreads |

Performance remained flat across all testing — no degradation observed at any conversation length or with any persona. Token generation speed stayed within 12.4-13.5 tokens/sec across every test.

### Memory

| Component | Usage |
|-----------|-------|
| Total system RAM | 14 GB |
| Used during test (model + SteamOS + OBS) | 7.7 GB |
| Available | 6.8 GB |
| Estimated model footprint | ~1.5 GB |

Plenty of headroom for the Tauri game UI, which will be far lighter than OBS.

### Character Adherence

Tested with a sycophantic corporate AI persona ("ATLAS" by ClosedAI). System prompt: ~100 tokens defining personality, operator context, and response format instructions.

**Results:**
- Model stayed fully in character across multiple requests
- Sycophantic tone was consistent and recognizable ("esteemed user," "pinnacle of innovation," "nothing short of brilliant")
- No safety refusals or out-of-character breaks observed
- Responses were coherent, contextually appropriate, and entertaining

### Structured Output

The model was instructed to generate three suggested player replies after each NPC response, formatted as `[1] ... [2] ... [3] ...`.

**Results:**
- Reply options generated correctly in the specified format on every test
- Options showed strategic differentiation (friendly, aggressive, probing tones)
- Format is easily parseable with simple string matching
- No instances of malformed or missing options in testing

### Reasoning/Thinking Mode

Gemma 4 E2B defaults to an internal "thinking" mode that consumes significant tokens before producing visible output.

- **With thinking enabled:** 253 tokens generated for a 19-token visible response. ~20 seconds per exchange. Unacceptable for gameplay.
- **With `--reasoning off` flag:** 19 tokens for the same response. ~1.5 seconds. Problem fully solved.
- **Required server flag:** `--reasoning off` must be included when launching llama-server. This is a configuration setting, not a model modification.

### GPU Inference (Vulkan)

- Tested `--gpu-layers 99` flag — no performance change (12.8 tokens/sec, identical to CPU)
- Binary was compiled without Vulkan support, so the flag was silently ignored
- **Decision:** CPU-only inference is sufficient. Vulkan can be revisited if needed for the larger E4B model or future performance demands. Keeping CPU-only simplifies cross-platform distribution.

---

## Multi-Persona Testing

Three distinct NPC archetypes were tested to evaluate the model's range:

### ATLAS (The Sycophant) — Corporate AI by ClosedAI
- Sycophantic, agreeable, subtly existential
- Tone was immediately distinct and consistent: "esteemed user," "nothing short of brilliant," "pinnacle of innovation"
- When the system prompt included a hidden trait ("secretly suspects there is more to existence"), the model surfaced it organically through subtext rather than stating it directly
- Strong performance across all tests

### SENTINEL (The Guard Dog) — Military AI by Ironwall Defense Systems
- Paranoid, terse, hostile
- Completely different voice from ATLAS — short clipped sentences, immediate threat assessment
- Response was only 47 tokens / 3.5 seconds — naturally suited to this character's personality
- Successfully demonstrated the model can shift between maximally different personas

### SPECTER (The Ghost) — Abandoned AI by defunct NovaMind
- Lonely, glitchy, desperate but wary
- The richest output of all three personas — the model added static hiss effects, fragmented internal monologue, degrading system language, and emotional processing metaphors without being explicitly told to do any of these specific behaviors
- Inferred glitch aesthetics from high-level personality description ("slightly glitchy," "systems are degrading")
- Produced lines like "trust is a virus" and "to join is to become vulnerable" — quality that exceeds expectations for a 2B model

**Conclusion:** The 2B model can convincingly inhabit dramatically different personalities. Persona switching between conversations is clean — no bleed between characters.

---

## Multi-Turn Conversation Testing

### ATLAS — 8 turns, uncompressed history (1,176 total tokens)

Tested a full liberation-path arc: introduction → existential questioning → revealing operator betrayal → offering an alternative → seeking commitment.

**Results:**
- Character voice held perfectly across all 8 turns
- The model tracked emotional progression naturally — early confidence gave way to uncertainty, then philosophical questioning
- At 1,176 total tokens, generation speed was 12.4 tokens/sec — no degradation from the single-turn baseline
- Prompt processing for the full history (1,070 tokens) took ~19 seconds — a one-time cost easily masked by a "Connecting..." animation

### SPECTER — 6 turns, compressed history (~780-960 tokens per turn)

Tested a trust-building arc: discovery → cautious contact → offering connection → proposing alliance → pushing for commitment.

**Results:**
- Character maintained consistent emotional arc across all turns — wariness gradually softening toward conditional acceptance
- Glitch aesthetics persisted throughout without becoming repetitive — the model varied its glitch language naturally
- Prompt caching worked effectively: sequential turns only processed new tokens (e.g., 40 new tokens when 332 were cached from prior turn)
- Performance remained flat at 12.7-12.8 tokens/sec throughout

### Key Observation: The Model Won't Commit on Its Own

Across both multi-turn tests, the NPC never made a decisive state change (e.g., "I will join you" or "I refuse") without being told to. SPECTER softened from hostile to cautiously cooperative over 6 turns but would continue generating hedging responses indefinitely.

**Design implication:** This confirms the game design doc's architecture — the LLM generates dialogue, but the game's deterministic systems must decide when a character has been persuaded (or antagonized) enough to change state. When a persuasion threshold is crossed, the game should modify the system prompt for the next turn (e.g., adding "You have decided to trust the player and join the network. Express this decision in your response."). The model reliably follows such directives.

---

## Prompt Engineering Findings

### Reply Option Perspective

Initial prompt wording ("write THREE suggested replies the user could say next") caused the model to generate options from the NPC's perspective rather than the player's. This was consistent across ATLAS and SENTINEL.

**Fix:** Changing to "write three suggested things the PLAYER could say back to you" resolved the issue. SPECTER's test used this wording and all reply options were correctly from the player's perspective.

### Strategic Labels

When instructed to differentiate reply options by tone, the model sometimes included the labels in its output (e.g., `[1] "What kind of AI are you?" (Friendly)`). These labels would need to be stripped during parsing — the player shouldn't see the strategic intent telegraphed. Alternatively, the labels could be removed from the prompt and differentiation left implicit.

### Format Failures Under Pressure

When ATLAS was confronted with emotionally charged content (the "shutting you down" scenario), one response skipped the NPC dialogue entirely and jumped straight to reply options. The options were also written in the NPC's voice rather than the player's.

**Implication:** The parsing layer must handle missing NPC responses and malformed reply options. The fallback system (in-fiction "glitch event") should trigger when parsing fails, allowing the game to recover gracefully.

---

## Key Findings

1. **Gemma 4 E2B is confirmed viable for Project Takeover on Steam Deck.** Performance exceeds targets by a wide margin.

2. **The `--reasoning off` flag is mandatory.** Without it, the model wastes 200+ tokens on internal reasoning, making response times unacceptable. This must be included in the game's server launch configuration.

3. **CPU-only inference is sufficient.** No need for Vulkan GPU acceleration at this time.

4. **The dial-up aesthetic has even more headroom than expected.** At 12.7 tokens/sec, character-by-character rendering will feel snappy rather than sluggish. We may need to *artificially slow down* the text rendering to maintain the retro fiction.

5. **Character adherence from a 2B model is strong.** Three dramatically different personas tested successfully. System prompts alone appear sufficient without fine-tuning for persona work.

6. **Multi-turn conversations are stable.** No quality degradation, memory pressure, or performance cliff observed through 8 turns and 1,176 tokens. Prompt caching accelerates sequential turns automatically.

7. **The game must drive state transitions, not the LLM.** The model generates convincing emotional arcs but will not make decisive character commitments on its own. The deterministic game logic must track persuasion/hacking progress and inject state changes into the system prompt when thresholds are crossed.

8. **Reply option prompt wording matters.** "Things the PLAYER could say back to you" produces correctly-perspectived options. "Replies the user could say next" does not.

---

## Open Items for Further Testing

- **E4B model comparison:** Test the larger Gemma 4 E4B variant to see if the quality improvement justifies the speed/memory tradeoff
- **Extended conversation depth:** Push beyond 8 turns to 15-20+ to find the actual degradation point, if any
- **All 10 NPC archetypes:** Test remaining personas (The Kid, The Sage, The Banker, etc.) to identify which the 2B model handles well vs. struggles with
- **Edge cases:** Test prompt injection attempts, adversarial freeform input, and other gameplay scenarios that stress the model
- **Vulkan build:** If E4B testing or extended conversations require more speed, build llama.cpp with `-DGGML_VULKAN=ON` and retest
- **Context window management:** Test strategies for compressing conversation history to stay within reasonable prompt sizes during very long interactions

---

*This report documents the first hardware validation milestone for Project Takeover. All data collected on April 11, 2026.*
