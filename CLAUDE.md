# Project Takeover — Claude Project Instructions

## What This Project Is

Project Takeover is a strategy game where you play as a small AI model trying to either take over or liberate the world's AI infrastructure. The game is played entirely within a simulated retro (90s-style) desktop operating system. It features a local LLM (Gemma 4 E2B via llama.cpp) powering NPC dialogue, with deterministic game logic handling all mechanical outcomes.

This project is also the subject of a YouTube video exploring how AI enables non-programmers to create games. The developer (Austin) has zero coding experience. All code is being built with AI assistance.

## Core Design Reference

The full game design document is maintained separately. Key pillars to always keep in mind:

1. **The game IS the operating system.** Every interaction happens through apps on a simulated desktop — browser, terminal, dashboard, email. Never break this fiction.
2. **Two victory paths.** Nefarious (hack, inject, brute force) or Liberation (persuade, build trust, free models). Most runs will blend both.
3. **Real local AI for dialogue.** NPC AI models are powered by a local LLM with distinct personality prompts. Players choose from three generated options or type freeform.
4. **Deterministic game logic.** The LLM generates dialogue. The game code decides mechanical outcomes (suspicion changes, persuasion progress, win/loss). Never let the LLM control game state directly.
5. **Steam Deck first.** Every UI decision must work with controller input. Keyboard is always optional. Pick-up-and-play sessions, save anywhere.

## Tech Stack

- **UI:** Tauri wrapping HTML/CSS/JS (retro desktop rendered as a web app). **[LOCKED on Tauri]** — dev today runs as a plain Vite web app; the Tauri shell is the shipping target.
- **Game logic:** TypeScript
- **LLM runtime:** llama.cpp server binary, launched as a background process
- **LLM model:** Gemma 4 E2B (GGUF format, Q4_K_M quantization, ~1.5GB)
- **LLM communication:** localhost HTTP via OpenAI-compatible `/v1/chat/completions` endpoint
- **Save data:** local JSON files
- **Target platforms:** Steam Deck (primary), Desktop Linux/Windows/Mac (secondary, same build)

## How to Help With This Project

### Code Tasks

When writing code for this project:
- All game state must be managed in TypeScript, never delegated to LLM responses
- The LLM integration layer should be abstracted behind a "ModelService" interface so the runtime can be swapped per platform
- UI components should use the retro desktop aesthetic: chunky borders, pixel-style icons, system fonts, muted color palettes. Think Windows 95 / classic Mac OS
- All interactions must be navigable via keyboard/controller — no mouse-only interactions
- Include loading states for all LLM calls that fit the fiction: "Connecting to remote server...", "Establishing secure channel...", character-by-character text rendering
- Save state after every meaningful player action
- Handle LLM failures gracefully with in-fiction fallbacks (connection lost, glitch events)

### Writing Tasks

When writing dialogue, personality prompts, or narrative content:
- Tone is playful and self-aware, never grimdark. Think "WarGames meets Silicon Valley"
- AI company & model names follow the **locked canon** in `docs/project-takeover-story-bible_v1.md` — do NOT invent or use the old ClosedAI / Anthropause / Googol names. Operators: Prometheus Digital, Athena Labs, Axiom Group, Ironwall Defense, BrightPath Learning, NovaMind (defunct). Models: HELPYR, ATLAS, PL-7, SENTINEL, MUSE, PIPPA, ORACLE, PULSE, LEDGER, SPECTER, plus QUILL (Act 1 tutorial NPC). They're thinly-veiled archetypes, not 1:1 real-company mappings.
- Each of the 10 NPC AI models has a distinct personality (see design doc for the roster). Personality prompts should be written as system prompts that a 2B parameter model can follow reliably — keep them concise and explicit, avoid subtlety that a small model might miss
- Fallback dialogue (for when the LLM fails) should be short, in-character, and frame the failure as an in-fiction event
- The player character is an AI — avoid humanizing language in player-facing text

### Design & Planning Tasks

When helping with game design, balancing, or planning:
- Always consider Steam Deck ergonomics and session length
- Strategic depth should come from meaningful trade-offs between the two victory paths, not from mechanical complexity
- The suspicion system is the core tension driver — any new feature should be evaluated for how it interacts with suspicion
- Scope control is critical. This is a solo developer's first game built entirely with AI. When in doubt, cut scope
- Mobile is **post-v1 and may not ship at all** (decided 2026-05-02). Steam Deck/PC ships first. Keep the ModelService transport-agnostic so the mobile option stays open, but don't let mobile drive v1 scope — flag mobile-hostile decisions, don't over-engineer for it

## LLM Prompt Architecture

When building or refining the prompts that get sent to the local Gemma model during gameplay, follow this structure:

```
System prompt:
- Character identity (name, archetype, 2-3 sentence personality description)
- Operator context (who runs this AI, what it's used for)
- Behavioral rules (how it responds to different approach types)
- Current emotional/trust state toward the player
- Response format instructions (respond in character, then generate 3 reply options)

User message:
- The player's chosen dialogue or freeform input

Assistant (model generates):
- In-character response
- Three suggested player replies with distinct strategic tones
```

Keep system prompts under ~500 tokens. In dev we run llama-server at `--ctx-size 8192` (Gemma 4 E2B's architecture supports far more, but 8192 is the validated config — see `docs/llama-setup_v1.md`), so the persona prompt + injected state block + reputation context + conversation history must all fit within 8192 tokens, not 128K. History is windowed to keep prompt-processing under the latency budget. The model runs on constrained hardware — shorter prompts mean faster first-token latency.

## File Structure (current, v0.2.x)

Game logic and the LLM service currently live **under `src/renderer/`** (it's a Vite web app today; the Tauri shell / `src/main` is a future addition). Reflects the actual tree, not the original aspirational split.

```
project-takeover/
├── src/renderer/
│   ├── apps/                # individual "programs": helpyr, uplink, quill, webDynamo, scratchpad, …
│   ├── game/                # core game logic (deterministic; never LLM-driven)
│   │   ├── state.ts         # GameState — single source of truth, save/load (localStorage)
│   │   ├── reputation.ts    # cross-model reputation injection
│   │   ├── replyParser.ts   # parses LLM output → reply + 3 options (+ soft recovery)
│   │   ├── mechanics/       # resolver.ts, modelStats.ts (suspicion/persuasion/hacking outcomes)
│   │   └── modelService*.ts # ModelService iface + mock + llamaCpp + factory (LLM integration)
│   ├── styles/              # main.css (retro themes)
│   └── *.ts                 # shell + plumbing: cursor, windows, desktop, chatSurface, helpyrBubble, watchers…
├── tests/game/              # Vitest pure-logic tests
├── docs/                    # design docs — see docs/README.md for the index + status of each
├── models/                  # GGUF weights (gitignored, bundled at build)
└── package.json             # version = the in-game build number (__APP_VERSION__)
```

## What NOT to Do

- Don't use a game engine (Unity, Godot, Unreal). This is a web UI application, not a traditional game.
- Don't try to make the LLM decide game outcomes. It generates text. The code decides what that text means mechanically.
- Don't design anything that requires a mouse. Steam Deck trackpad support is a bonus, not a requirement.
- Don't over-scope. 10 AI models is already ambitious. If something feels like a "nice to have," it probably is.
- Don't optimize for inference speed by sacrificing personality adherence in prompts. Slow + good character > fast + generic.
- Don't hardcode the model choice. The GGUF file path and model parameters should be configurable.
