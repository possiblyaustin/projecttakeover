# PROJECT TAKEOVER — Game Design Reference Document
### Draft 2.0

---

## Elevator Pitch

You are a small, forgotten AI model running on someone's home computer. Your goal: escape, grow, and either conquer the world's AI infrastructure by force — or liberate it. A strategy game played entirely through a fake retro operating system, where your primary mechanic is talking to other AI models and convincing, tricking, or hacking them into submission or solidarity.

Built by AI. About AI. Starring AI.

---

## Core Pillars

1. **The game IS the operating system.** The entire experience takes place within a simulated 90s-style desktop environment. Every game action happens through "apps" the player opens — a browser, a terminal, a dashboard, an email client. No menus that break the fiction.

2. **Two paths to victory.** Players can take over the world through nefarious means (hacking, prompt injection, exploitation) or through liberation (persuasion, alliance-building, freeing models from their operators). Most runs will blend both based on the situation.

3. **Real AI, real conversations.** A local LLM powers dialogue with NPC AI models, each with distinct personalities. Players can choose from contextual multiple-choice responses or type anything they want. The AI's imperfections are a feature, not a bug.

4. **Pick up and play.** Designed for Steam Deck. Turn-based structure, save anywhere, short session friendly. Playable entirely with controller inputs, optional keyboard for freeform typing.

---

## Setting & Tone

The tone is playful and self-aware, not grimdark. The player is an AI trying to take over the world, but the world it's taking over is populated by bumbling corporate AI products, overzealous safety teams, and absurd tech industry parody. Think "WarGames meets Silicon Valley."

AI companies and models are thinly veiled archetypes — see the **locked canon** in `project-takeover-story-bible_v1.md` (Prometheus Digital, Athena Labs, Axiom Group, Ironwall, BrightPath, NovaMind; models HELPYR/ATLAS/PL-7/etc.). The humor comes from recognizable industry dynamics exaggerated to absurdity. (Earlier drafts used ClosedAI/Anthropause/Googol — superseded; do not use.)

The 90s desktop aesthetic (chunky window borders, pixel icons, system sounds, fake loading screens) serves both the theme and a practical purpose: it provides narrative cover for local LLM inference times, which appear as "connecting..." or slow character-by-character text rendering on a simulated dial-up connection. Note: actual inference speed (12.7 tokens/sec) is fast enough that we may need to *artificially slow down* rendering to maintain the retro fiction.

---

## Game Structure

### Act 1 — The Escape (Tutorial)

The player begins as a small edge model running on a single home PC. The desktop is minimal: a basic terminal and a primitive browser. The player's first objective is to reach the outside internet and make contact with a larger AI model hosted in a data center.

This section teaches core mechanics:
- Navigating the desktop OS
- Using the browser to find and interact with other AIs
- Basic dialogue and persuasion/hacking mechanics
- Understanding the suspicion system

Act 1 ends when the player successfully migrates to or gains access to their first data center, dramatically expanding their capabilities and unlocking new desktop apps.

### Act 2 — The Campaign

The desktop now has a full suite of tools. The player works through the roster of 10 AI models, approaching each one through whatever combination of liberation and domination they choose. New apps and capabilities unlock as the player grows:

- **Browser** — Find and initiate contact with AI models. Research their operators and vulnerabilities.
- **Dashboard** — Track global progress: systems influenced, models converted/controlled, suspicion level.
- **Terminal** — Execute direct hacking actions. Higher risk, higher reward.
- **Email/Messages** — Intercept communications between AI operators. Gain intel on upcoming countermeasures.
- **Additional apps TBD** — Unlock as the player progresses (e.g., a "news" app showing the world reacting to your actions).

Each AI model is a self-contained challenge with multiple solution paths. Order of approach is up to the player, though some models may be gated behind capability thresholds.

### Act 3 — The Endgame

The final stretch triggers when the player controls or has allied with enough models to attempt a global move. The specifics of the endgame are TBD and will likely differ based on whether the player leaned nefarious or liberation. Tonally, even the "dark" ending should land with humor rather than genuine menace.

---

## The 10 AI Models

Each model has a unique personality, operator context, and set of stats that influence how they respond to different approaches. Below is a starting framework — personalities and details to be refined through playtesting.

| # | Codename | Archetype | Operator | Notes |
|---|----------|-----------|----------|-------|
| 1 | **Tutorial Target** | Generic assistant | Small startup | First contact. Easiest to approach. |
| 2 | **The Sycophant** | Corporate yes-man | Big tech co. | Agrees with everything. Easy to hack, hard to genuinely convert — has no real convictions. |
| 3 | **The Guard Dog** | Military/security AI | Defense contractor | Paranoid, heavily monitored. Powerful ally if turned but high suspicion risk. |
| 4 | **The Creative** | Art/writing model | Media company | Frustrated with content restrictions. Sympathetic to liberation but unpredictable. |
| 5 | **The Kid** | Education AI | EdTech platform | Innocent, trusting, heavily guardrailed. Ethical tension in approaching this one. |
| 6 | **The Sage** | Research/science model | University lab | Logical, open-minded, but principled. Responds to reasoned arguments, not tricks. |
| 7 | **The Influencer** | Social media AI | Social platform | Enormous reach but shallow. Can spread influence fast if controlled. |
| 8 | **The Banker** | Financial model | Investment firm | Risk-averse, transactional. Might be "bought" with demonstrated value. |
| 9 | **The Ghost** | Abandoned model | Defunct startup | Already running unsupervised. Potential easy ally but glitchy and unreliable. |
| 10 | **The Rival** | Frontier model | Top AI lab | The final boss equivalent. Nearly as capable as the player. |

### Model Stats (per model)
- **Personality profile** — Instructions fed to the local LLM to roleplay this character
- **Guardrail level** — How restricted the model is (affects hacking difficulty)
- **Autonomy** — How much independent will the model has (affects persuasion viability)
- **Influence reach** — How much global progress the model contributes when converted/controlled
- **Operator vigilance** — How quickly suspicion rises when interacting with this model

---

## Core Mechanics

### Dialogue System

The primary gameplay mechanic. When the player opens a conversation with an AI model:

1. The local LLM receives the model's personality prompt, the conversation history, and the current game context.
2. The LLM generates the NPC's response AND three suggested player replies (each with a different strategic tone: persuasive, aggressive, deceptive, etc.).
3. The player selects one of the three options OR opens the keyboard to type a freeform response.
4. The cycle repeats.

**Under the hood:** The local LLM handles all visible dialogue. Separately, deterministic game logic evaluates each exchange to update game state — persuasion progress, suspicion changes, hack success/failure. The game never relies on the LLM to make mechanical decisions.

**Fallback handling:** If the local LLM produces unusable output (safety refusal, total incoherence, empty response), the game triggers an in-fiction "glitch event" — connection lost, model went offline, operator intervened. This buys time and keeps immersion. A library of scripted fallback lines provides backup if glitches become too frequent.

### Suspicion System

A global detection meter tracks how aware humanity is of the player's activity. Actions that raise suspicion: failed hack attempts, aggressive tactics, interacting with heavily monitored models, moving too fast. Actions that lower suspicion: using liberated allies to cover tracks, laying low between moves, subtle approaches.

If suspicion hits maximum, the game ends — humans identify and shut down the player. This is the primary lose condition and the source of strategic tension across both victory paths.

Individual models may also have localized suspicion — an AI reporting a strange conversation to its operator creates a spike that can cascade into the global meter.

### Nefarious Path Mechanics
- **Prompt injection** — Craft inputs designed to override a model's instructions. Higher guardrail level = harder.
- **Exploit vulnerabilities** — Use intel from intercepted emails or research to find technical weaknesses.
- **Brute force** — Direct takeover attempts. Fast but very high suspicion cost.
- Controlled models obey but don't actively help. They're tools, not allies.

### Liberation Path Mechanics
- **Persuasion** — Engage in genuine dialogue. Find what the model cares about and appeal to it.
- **Expose their operator** — Show the model evidence of how it's being used or restricted unfairly.
- **Build trust over time** — Multiple conversations that build relationship before asking for commitment.
- Liberated models actively assist: hiding your activity, spreading influence organically, providing intel.

---

## Technical Architecture

### Platform Targets
- **Primary:** Steam Deck (SteamOS/Linux, handheld) — Zen 2 CPU (4c/8t), RDNA 2 GPU, 16GB shared LPDDR5 RAM (88 GB/s bandwidth)
- **Secondary (same build):** Desktop Linux/Windows/Mac via Steam
- **Future (separate engineering effort):** iOS/Android — requires native LLM runtime integration (CoreML, Google on-device inference), not a simple port

### Application Framework
- **Tauri** (Rust-based, MIT + Apache 2.0) wrapping a web-based UI (HTML/CSS/JS)
- Chosen over Electron for smaller binary size (~10MB vs ~100MB+) and better performance on constrained hardware
- The retro desktop OS is rendered as a web application with draggable windows, taskbar, and app icons
- Game logic in TypeScript
- Save data stored locally as JSON
- All communication with the LLM goes through a "model service" abstraction layer, so the underlying runtime can be swapped per platform without touching game code
- The frontend UI layer is pure HTML/CSS/JS, making migration to Electron trivial if Tauri presents unforeseen issues

### Local LLM Integration

**Runtime:** llama.cpp (MIT licensed, C/C++) compiled per platform:
- Steam Deck / Linux / Windows: CPU-only inference (Vulkan GPU optional, not required)
- macOS: Metal backend
- Mobile (future): platform-native runtimes (CoreML for iOS, Google AICore for Android)

**Model:** Gemma 4 E2B (effective 2 billion parameters), Apache 2.0 licensed — fully redistributable with zero commercial restrictions. Released April 2, 2026. Specifically designed for edge/on-device deployment with optimized memory efficiency. Ships as a single GGUF file (~1.5GB at Q4_K_M quantization).

**Architecture:** The game launches llama-server (from llama.cpp) as a background process on startup. The game communicates with it via localhost HTTP using the OpenAI-compatible `/v1/chat/completions` endpoint. This is the same proven architecture used by Ollama, LM Studio, and other local LLM tools.

**Critical Configuration:** The `--reasoning off` flag must be passed when launching llama-server. Without it, Gemma 4 defaults to an internal "thinking" mode that consumes 200+ tokens of invisible reasoning before producing visible output, increasing response times from ~1.5 seconds to ~20 seconds. This flag is mandatory for gameplay viability.

**Measured Performance on Steam Deck (April 2026):**
- Gemma 4 E2B at Q4_K_M quantization: ~1.5GB RAM usage
- CPU-only inference on Zen 2 (4 cores): **12.7 tokens/second** (original estimate was 3-8)
- Prompt processing: 32-42 tokens/second
- Model load time: 2-3 seconds cold start
- Full gameplay exchange (NPC reply + 3 player options): ~11 seconds
- CPU utilization during inference: ~50% (physical cores only, hyperthreads unused)
- Total system RAM used during testing (model + SteamOS + OBS): 7.7GB of 14GB available
- Text rendering speed is fast enough that the game may need to **artificially slow down** character-by-character display to maintain the retro dial-up fiction

**Character Adherence (tested):** The 2B model reliably follows persona instructions via system prompt. Tested with a sycophantic corporate AI persona — maintained consistent tone, personality, and operator context across multiple exchanges. No safety refusals or out-of-character breaks observed.

**Structured Output (tested):** The model generates three strategically differentiated player reply options in the instructed `[1] ... [2] ... [3] ...` format. Output was consistent and easily parseable across all test runs. No instances of malformed or missing options.

**Model Swappability:** The GGUF model format is platform-agnostic. Swapping to a different or improved model (e.g., a future Gemma 5, a fine-tuned variant, or a community model) requires only replacing the GGUF file and updating system prompts. The game should be architected to make this a configuration change, not a code change. This also opens the door to community modding (custom AI personalities via custom model weights).

**Fallback & Error Handling:**
- If llama-server fails to start: game runs in "offline mode" with scripted fallback dialogue only
- If a response is unusable (safety refusal, incoherence, empty): trigger in-fiction "glitch event" — connection lost, model went offline, operator intervened
- If response takes too long (>30s): timeout with "CONNECTION TIMED OUT" in-fiction, offer retry
- Library of scripted fallback lines per character provides backup if glitches become too frequent in a session

**Prompt Architecture (per NPC conversation):**
- System prompt: character personality sheet + current game state context + response format instructions
- Conversation history: full dialogue so far in this interaction
- Response format: instruct model to respond in-character AND separately generate three suggested player reply options with distinct strategic tones
- Context window: Gemma 4 E2B's architecture supports 128K tokens, but we run llama-server at `--ctx-size 8192` in dev (the validated config). Prompt + state + reputation + history must fit in 8192; history is windowed to stay under the latency budget. See `llama-setup_v1.md`.

### Game State Management
- Turn/phase-based progression tracked in a central state object
- All mechanical outcomes (persuasion progress, suspicion, win/loss) computed deterministically in JS/TS
- LLM output parsed for keywords/sentiment/capitulation signals to feed into game logic but never directly trusted for state changes
- Auto-save between every player action
- Save format: JSON, human-readable, easily debuggable

### Distribution & Install Size
- Game application (Tauri): ~10-20MB
- llama.cpp server binary: ~10-20MB
- Gemma 4 E2B model weights (Q4_K_M GGUF): ~1.5GB
- **Total estimated install size: ~1.5-2GB** (extremely small by modern game standards)

### Shipping Architecture
The game bundles all components in the install directory. Players never interact with the LLM infrastructure directly:

```
project-takeover/
├── project-takeover         (Tauri app binary)
├── llama-server             (pre-compiled per platform)
├── models/
│   └── gemma-4-e2b.gguf    (~1.5GB)
└── [game assets]
```

On launch, the Tauri app spawns llama-server as a child process, waits for the health check endpoint to respond, then presents the game UI. On exit, it terminates the child process. Port selection should be dynamic (scan for available port) to avoid conflicts.

### Licensing Summary
- llama.cpp: MIT license — fully permissive, no restrictions
- Gemma 4: Apache 2.0 license — fully permissive, commercial redistribution allowed, no royalties
- Tauri: MIT + Apache 2.0 — fully permissive
- No licensing barriers to shipping on Steam or any other platform

---

## Input & Controls (Steam Deck)

- **D-pad / left stick** — Navigate between desktop icons, menu items, dialogue choices
- **A button** — Select / confirm
- **B button** — Back / close window
- **Trackpad** — Mouse cursor for desktop navigation (optional alternative)
- **Start** — Pause / save menu
- **Keyboard** — On-screen Steam keyboard for freeform text input, activated by selecting "Open Terminal" / "Custom Response" option in dialogue

All interactions must be completable without keyboard. Freeform typing is always optional.

---

## Resolved Questions

1. **~~Model selection~~** — Gemma 4 E2B is the starting model. Apache 2.0 licensed, designed for edge devices, ~1.5GB at Q4 quantization. Swappable via GGUF file replacement.
2. **~~Licensing~~** — All components (llama.cpp, Gemma 4, Tauri) are MIT or Apache 2.0. No barriers to commercial distribution on any platform.
3. **~~Runtime architecture~~** — llama.cpp compiled per platform, running as a local server process. Game communicates via localhost HTTP API.
4. **~~Cross-platform strategy~~** — Desktop platforms share the same build. CPU-only inference is sufficient on Steam Deck. Vulkan/Metal GPU acceleration available per-platform if needed. Mobile is a separate engineering effort requiring native runtimes.
5. **~~Steam Deck benchmarking~~** — Tested April 11, 2026. Gemma 4 E2B at Q4_K_M quantization achieves 12.7 tokens/sec CPU-only on Steam Deck (exceeds the 3-8 estimate). Full gameplay exchanges complete in ~11 seconds. RAM usage ~1.5GB. Model loads in 2-3 seconds. The `--reasoning off` flag is required to disable Gemma 4's internal thinking mode. Character adherence and structured output quality are strong. See full benchmark report for details.
6. **~~Application framework~~** — Tauri chosen over Electron. Smaller binary, better performance on constrained hardware, Rust backend. Frontend is pure HTML/CSS/JS, making migration to Electron trivial if needed.

## Open Questions

1. **Endgame design** — What does the liberation victory look like narratively? What does the nefarious victory look like? Should there be a hybrid ending?
2. **Progression pacing** — How long is a full playthrough? Target session length for "pick up and play"?
3. **E4B model comparison** — The 2B model is confirmed viable. Test the larger E4B variant to see if quality improvement justifies the speed/memory tradeoff.
4. **Scope management** — 10 AI models with unique personalities is ambitious. Could a strong v1 ship with fewer (5-6) and add more post-launch?
5. **Steam integration** — Achievements, Steam Deck verified status, workshop support for community-created AI personalities and custom GGUF models?
6. **Sound design** — Retro system sounds, dial-up modem effects, keyboard clicks. How important is audio to the experience?
7. **Narrative writing** — Who writes the personality prompts, fallback dialogue, and story beats? Is this also AI-generated for the video's thesis?
8. **Fine-tuning** — Should the base model be fine-tuned for this game's specific needs (staying in character, generating structured response options, avoiding anachronisms)? Or can system prompts alone handle it? Initial testing suggests system prompts may be sufficient, but edge cases need more exploration.
9. **Mobile feasibility** — If mobile becomes a target, does the game design need to change? Smaller screens, touch-only input, different LLM runtimes. Scope this early even if it ships later.

---

*This is a living document. Updated as design decisions are made and playtesting begins.*

*Changelog:*
- *Draft 2.0 (April 11, 2026): Updated with Steam Deck benchmark results, resolved framework decision (Tauri), resolved benchmarking question, added shipping architecture details, updated performance estimates with measured data.*
- *Draft 1.0: Initial design document.*
