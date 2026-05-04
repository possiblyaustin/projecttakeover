# Title Screen & Boot Flow — Design Note v1

*Status: design draft. Implementation deferred until after the ModelService phases (A–D) land.*

---

## Goals

- Stay fully in fiction: the computer boots, Marsh logs in, the desktop appears. The title screen *is* the login screen.
- Use the splash + login + boot transition to mask llama.cpp warm-up so the player almost never waits on the model.
- Provide stable homes for the things that don't belong on the in-game desktop: resolution lock, input binding, model swap, acknowledgements.
- Keep the path to "back in a session" short for repeat players — ideally one button press from launch.

## Visual direction

Lean early Mac OS X / Aqua-era: a clean centered login window over a static wallpaper (animation later, optional), with a logo lockup at the top reading **Project Takeover** (placeholder name). One visible user account — **Marsh** — with a sub-label that reads "New Game" if no save exists, "Continue — [last in-fiction timestamp]" if one does. Brushed-metal or pinstripe panel, system-font label work, no chrome that breaks the era.

This stays consistent with the project's Mac-lean UI direction without being a 1:1 Apple clone.

## Screens

### 1. Splash (1–2s, cold launch only)

Bare logo on a dark background. Plays only on a cold launch — skip on warm relaunches behind a flag. This is where the heaviest startup work hides: Vite bundle parse, app/window/page registry init, llama.cpp process spawn.

### 2. Login window

Center stage. Elements:

- Logo / game title up top
- Marsh's avatar and name, selected by default
- Sub-text under the avatar: "New Game" or "Continue"
- Secondary actions along the bottom: **Options · Acknowledgements · Quit**

Press Login (or `A` on controller) → boot-to-desktop transition.

Optional flavor: a second user account labelled `admin` (or similar) that's locked and not interactable. Costs nothing, plants the "you don't have the keys to this machine" idea before gameplay starts. Defer if it complicates focus order.

### 3. Options (modal sheet over the login window)

- **Display:** resolution lock, scaling, fullscreen toggle
- **Input:** in-game controller binding overrides — Steam Input still does the heavy lifting on Deck; this is for tweaks that live above that layer
- **Audio:** master / SFX / music
- **Model:** GGUF path + parameters, hidden behind a disclosure since it's an advanced setting. Aligns with the existing rule that the model choice is not hardcoded.
- **Accessibility:** text speed, focus-ring contrast, reduce motion

### 4. Acknowledgements

Scrolling credits. Pulls the dependency list from [docs/dependency-tracker.md](docs/dependency-tracker.md). Per-thread author paragraphs slot in at the end as a v1.0 polish task — not in scope now.

### 5. Boot-to-desktop transition (3–4s minimum, forced)

After Login is pressed, play a short boot sequence with a **forced minimum duration** regardless of llama.cpp state. Two reasons:

1. It sells the fiction. Any real OS takes a beat to log in.
2. It gives the model warm-up additional cover beyond the splash + login dwell time.

Suggested visuals: progress lines in a terminal panel, optionally reflecting *real* llama.cpp startup phases:

- `Mounting filesystem...` (instant)
- `Loading ai_module...` (mapped to model load — this is where most of the wall-clock lives on cold start)
- `Establishing uplink...` (first warm-up token)
- `Welcome, Marsh.`

If the load finishes faster than the minimum, hold on the last line until the floor is met. If it's slower, the boot screen is still on-screen and the player isn't blocked yet — the desktop only mounts once both the timer floor *and* the model are ready (or the slow-path threshold below trips).

## LLM warm-up integration

To answer the direct question: yes, the game is non-functional without llama.cpp — every NPC interaction goes through it. So this isn't about "graceful degradation to a no-AI mode." It's about hiding load time so the player almost never *notices* there was any.

The existing ModelService seam from Phases A+B already has the stalling-line contract. The boot flow uses the same mechanism, dressed as boot logs instead of HELPYR's "thinking" indicator. Two states matter:

- **Ready before desktop appears (≈95% case after Phase D):** desktop mounts fully live, HELPYR and other AIs respond instantly. The 3–4s floor is the cost of fiction, not LLM cost.
- **Not ready when desktop appears (slow disk, first cold start, post-update model re-init):** desktop is interactive, but any AI invocation falls through the same stalling-line crossfade Phase B established. The player can poke around — read the in-game readme, open Files, etc. — while the model finishes warming. They only feel the delay if they immediately try to talk to an AI.

## Hard failure modes

If llama.cpp won't come up at all — binary missing, port conflict, OOM, GGUF integrity bad:

- **Fictional surfacing:** an in-game error window styled as a system dialog. "Uplink failed: AI module not responding." Two buttons: **Retry** and **Diagnostics**.
- **Diagnostics window:** the one place where the fiction deliberately yields. Shows the real underlying error in a copyable text panel so the player can send Austin something useful. Frame it as a "Console" or "System Log" app to soften the break.
- The boot flow does **not** silently route past this into a stalling-line desktop the player can wander around in. Without dialogue there is no game; faking it just wastes the player's time. Better to fail clearly with a path to recover.

## Out of scope (defer or skip)

- Per-thread acknowledgement paragraphs (v1.0 polish task)
- Login-screen "tells" hinting at the AI presence — cute, late-stage, easy to add once the rest is solid
- Multi-user save slots (single-slot autosave per the playthrough-commitment philosophy)
- Animated wallpaper, parallax, ambient weather, etc.
- Mid-game return-to-login (Quit handles it; no need for a soft logout)

## Open questions

- Skip the splash on warm relaunches? Probably yes — first cold launch only. Defer the flag check until implementation.
- How granular can the "real" llama.cpp progress be? `llama-server` does not emit fine-grained phase events — we'd either tap stderr for known log lines, watch RSS growth, or approximate with a timed sequence that snaps to "complete" when the first warm-up token returns. Defer to Phase D when the real runtime is wired.
- Does Acknowledgements live as a proper in-desktop app (`About This Computer`) once the desktop is up, with the title-screen entry just being a shortcut? Probably yes — that gives it a permanent home and saves duplicating the screen.

---

*Last updated: 2026-05-03*
