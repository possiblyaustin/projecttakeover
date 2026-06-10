# Project Takeover — Dependency & Licensing Tracker
### Living document — updated as dependencies are added

---

## Summary

All current and planned dependencies use permissive open-source licenses (MIT, Apache 2.0, or dual MIT/Apache 2.0). There are no copyleft obligations, no commercial use restrictions, and no royalty requirements. The game can ship on Steam or any other platform without licensing barriers.

The practical obligation across all components is the same: **include the original license text and copyright notices** in your distribution. The standard way to handle this is a `LICENSES` folder in the shipped game and an in-game "Acknowledgments" screen accessible from a settings or about menu.

---

## Core Dependencies (ships with the game)

### 1. Gemma 4 E2B — AI Model Weights
- **What it is:** The local LLM that powers all NPC dialogue
- **License:** Apache 2.0
- **Copyright holder:** Google DeepMind
- **What you must do at ship:**
  - Include a copy of the Apache 2.0 license text
  - Retain the original copyright notice
  - If the model's distribution includes a NOTICE file, reproduce that as well
  - Note any modifications (if you fine-tune the model later, document that)
- **What you don't need to do:** No royalties, no permission requests, no usage caps, no requirement to share your game's source code
- **Notes:** Gemma 4 uses a clean Apache 2.0 license — unlike earlier Gemma versions which had a custom "Gemma Terms of Use." Confirm the specific GGUF download you ship includes the license/notice files from Google.

### 2. llama.cpp — LLM Inference Engine
- **What it is:** The C/C++ runtime that loads and runs the Gemma model
- **License:** MIT
- **Copyright holder:** Georgi Gerganov and contributors
- **What you must do at ship:**
  - Include the MIT license text and copyright notice
- **What you don't need to do:** No modification disclosure, no source sharing, no royalties
- **Notes:** MIT is the most permissive common license. A single file with the license text covers you.

### 3. Tauri — Application Framework
- **What it is:** The Rust-based shell that wraps your web UI into a desktop application
- **License:** Dual-licensed MIT / Apache 2.0 (your choice which to comply with)
- **Copyright holder:** Tauri Programme within The Commons Conservancy
- **What you must do at ship:**
  - Include either the MIT or Apache 2.0 license text (MIT is simpler)
  - Retain copyright notice
- **Notes:** Tauri itself pulls in many Rust crate dependencies, each with their own licenses. When you build a release binary, Tauri tooling can generate a third-party license report. Run this before shipping and include the output.

### 4. Vite — Build Tool
- **What it is:** The frontend build tool that bundles your TypeScript/HTML/CSS
- **License:** MIT
- **Copyright holder:** Evan You and Vite contributors
- **What you must do at ship:**
  - Vite is a dev dependency only — it runs during build, not at runtime. Its code does not ship in the final binary. Technically no attribution is required in the shipped game, but including it in acknowledgments is good practice.
- **Notes:** Same applies to TypeScript itself — it's a build-time tool, not a runtime dependency.

---

## Dev-Time Dependencies (do NOT ship with the game)

These are used during development but don't end up in the final build. No attribution is legally required, but listing them in a "Built With" section is a nice touch for the video's thesis.

| Tool | License | Notes |
|------|---------|-------|
| TypeScript | Apache 2.0 | Transpiles to JS at build time |
| Node.js / npm | MIT | Package management and build tooling |
| Git | GPL v2 | Version control — does not ship |
| Claude Code | Anthropic ToS | AI coding assistant — the star of the video |
| Vitest | MIT | Test runner. Pure-function game logic + mocked-LLM integration tests |
| happy-dom | MIT | DOM/window/localStorage shim for the Vitest environment |
| @playwright/test | Apache 2.0 | Browser-level layout audit + flow tests (Deck testing harness, `npm run deck-check`). Downloads its own Chromium — dev-only, never ships |
| @anthropic-ai/claude-agent-sdk | Anthropic ToS (same as Claude Code) | Tier 3 agent playtester (`npm run playtest`) — spawns a Sonnet agent via the local Claude Code login. Dev-only, never ships |
| @playwright/mcp | Apache 2.0 | Browser MCP server the playtest agent drives. Dev-only, never ships |

---

## Future Dependencies (not yet integrated)

These will be added as development progresses. Track their licenses here before integration.

| Component | Purpose | Expected License | Status |
|-----------|---------|-----------------|--------|
| Gamepad API (Web standard) | Controller input on Steam Deck | No license (browser API) | Planned |
| Web Fonts (if any) | Retro typography | Varies — check per font | Not selected |
| Sound effects library | Retro OS sounds, dial-up effects | Varies — check per asset | Not selected |
| Any npm packages | Frontend utilities if needed | Check per package | None yet |

---

## What to Ship

When you build the final distribution, include a `LICENSES` folder at the root:

```
project-takeover/
├── LICENSES/
│   ├── GEMMA-4-LICENSE.txt          (Apache 2.0 + any NOTICE file from Google)
│   ├── LLAMA-CPP-LICENSE.txt        (MIT license from llama.cpp repo)
│   ├── TAURI-LICENSE.txt            (MIT license from Tauri)
│   └── THIRD-PARTY-LICENSES.txt    (auto-generated from Tauri/Rust cargo build)
├── llama-server
├── models/
│   └── gemma-4-e2b.gguf
└── project-takeover (binary)
```

Also build an in-game "About" or "Acknowledgments" screen (fits perfectly as a desktop app within the game fiction — maybe a "System Info" or "About This Computer" window) that lists:

- Gemma 4 by Google DeepMind (Apache 2.0)
- llama.cpp by Georgi Gerganov (MIT)
- Tauri by the Tauri Programme (MIT / Apache 2.0)
- Any additional dependencies added later

This covers legal requirements and is also a nice narrative touch for the video — the game about AI openly crediting the AI tools that built it.

---

## Rules for Adding New Dependencies

Before adding any new dependency to the project:

1. Check the license. MIT, Apache 2.0, BSD, ISC are all fine. GPL/LGPL/AGPL require careful review (copyleft obligations may affect distribution).
2. Add it to this document with license type and attribution requirements.
3. If it ships in the binary (not just dev-time), add its license file to the `LICENSES` folder plan.
4. If it's a font, sound effect, or art asset, verify the license covers commercial use in a game distributed via Steam. Creative Commons licenses vary — CC0 and CC-BY are fine, CC-NC (non-commercial) is not.

---

*Last updated: 2026-05-07*
