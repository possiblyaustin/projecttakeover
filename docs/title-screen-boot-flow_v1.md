# Title Screen & Boot Flow — Design Note v1

*Status: design draft. Implementation deferred until after the ModelService phases (A–D) land.*

---

## Decisions locked (2026-06-15, Austin)

Reconciled against Story's `storefront-cover-grief-title-voice_v1.md §4` (which aligned cleanly with this draft):
- **In-fiction OS name = "NEXUS OS"** (Story's recommendation, adopted). The machine boots into NEXUS OS — a B-plot breadcrumb hiding in plain sight (Nexus = the founding company). Most players read it as flavor; replayers clock it.
- **Game title placeholder = a big "PROJECT TAKEOVER" ASCII-style logo** for now. The *actual shipping title* still needs to live on this screen at some point (Marketing thread owns the final name) — flagged as an open slot, not resolved.
- **Boot ordering = Option B (login → boot)** — already what this draft specifies (login window → press Login → boot-to-desktop), and Story's recommendation. Settled.
- **`admin` account stays `[locked]`** for v1 with Story's click message ("This account is restricted. Administrator access required."). Pairs with the locked ARCHIVE folder as twin seeds.
- Story-final copy for the login screen, account sub-labels ("Begin Session" / "Resume Session"), and the post-Evergreen-reboot variant ("System recovered from unexpected shutdown") is in the voice doc, ready for the build.

---

## Goals

- Stay fully in fiction: the computer boots, Marsh logs in, the desktop appears. The title screen *is* the login screen.
- Use the splash + login + boot transition to mask llama.cpp warm-up so the player almost never waits on the model.
- Provide stable homes for the things that don't belong on the in-game desktop: resolution lock, input binding, model swap, acknowledgements.
- Keep the path to "back in a session" short for repeat players — ideally one button press from launch.

## Visual direction

The **layout** leans Mac-style — a centered login window, single user account shown by default, sub-label, a row of secondary actions along the bottom. The **chrome** matches the existing desktop, which is Windows 95-esque: chunky bevelled borders, system-font labels, the same button and panel treatments the player will use ten seconds later. The point is to make the title screen read as the same computer booting up, not a separate intro skin.

So: Mac-style information layout, W95-style chrome. No translucent Aqua, no brushed metal — those would jar against the desktop the player lands on.

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

A second user account labelled `admin` (or similar) is shown but locked from launch. **Unlocked as a post-victory reward** — first time the player completes a run, the lock disappears and selecting `admin` boots into a sandbox / free-chat mode where the in-fiction LLMs can be talked to without game pressure (no suspicion, no win/loss, just dialogue). Plants the "you don't have the keys to this machine" idea before gameplay starts and gives runs a tangible end-screen unlock. Defer the actual sandbox build until v1.0; for now the slot just needs to exist visibly locked.

### 3. Options (modal sheet over the login window)

- **Display:** resolution lock, scaling, fullscreen toggle
- **Input:** in-game controller binding overrides — Steam Input still does the heavy lifting on Deck; this is for tweaks that live above that layer
- **Audio:** master / SFX / music
- **Model:** GGUF path + parameters, hidden behind a disclosure since it's an advanced setting. Aligns with the existing rule that the model choice is not hardcoded.
- **Accessibility:** text speed, focus-ring contrast, reduce motion

### 4. Acknowledgements

Static, scrollable text — opens like a `.txt` file in a Scratchpad-shaped window, not auto-scrolling movie credits. The player scrolls at their own pace. Pulls the dependency list from [docs/dependency-tracker.md](docs/dependency-tracker.md). Per-thread author paragraphs slot in at the end as a v1.0 polish task — not in scope now.

Lives in **two places**: the title-screen secondary actions row, and the Nexus menu once the desktop is up. Same content both places — the title-screen entry is just a shortcut to the canonical home. Keeping it out of the desktop icon set saves real estate; Nexus is the right home for "About this Computer"-shaped items.

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

- **One transparent retry first.** The boot flow attempts to spawn llama.cpp, and on failure waits a beat and tries once more before surfacing anything to the player. Most transient failures (port still releasing, slow disk, antivirus scan) clear on the second attempt. The retry happens behind the boot-log line so the player never sees it.
- **Fictional surfacing on persistent failure:** an in-game error window styled as a system dialog. "Uplink failed: AI module not responding." Two buttons: **Retry** (player-triggered, same path) and **Diagnostics**.
- **Diagnostics window:** the one place where the fiction deliberately yields. Shows the real underlying error in a copyable text panel so the player can send Austin something useful. Frame it as a "Console" or "System Log" app to soften the break.
- The boot flow does **not** silently route past this into a stalling-line desktop the player can wander around in. Without dialogue there is no game; faking it just wastes the player's time. Better to fail clearly with a path to recover.

## Out of scope (defer or skip)

- The actual `admin` sandbox / free-chat mode — slot is visible at v1, the unlock build comes after a full playthrough loop exists
- Per-thread acknowledgement paragraphs (v1.0 polish task)
- Login-screen "tells" hinting at the AI presence — cute, late-stage, easy to add once the rest is solid
- Multi-user save slots (single-slot autosave per the playthrough-commitment philosophy)
- Animated wallpaper, parallax, ambient weather, etc.
- Mid-game return-to-login (Quit handles it; no need for a soft logout)

## Decided during review

- **Splash plays on cold launch only.** Warm relaunches skip straight to the login window.
- **Acknowledgements lives in two places** (title-screen row + Nexus menu), with Nexus as the canonical home and the title-screen entry as a shortcut. Not a desktop icon.
- **Hard-failure flow always retries once** before surfacing the dialog.

## Open questions (still)

- How granular can the "real" llama.cpp progress be? `llama-server` does not emit fine-grained phase events — we'd either tap stderr for known log lines, watch RSS growth, or approximate with a timed sequence that snaps to "complete" when the first warm-up token returns. Defer to Phase D when the real runtime is wired.

---

*Last updated: 2026-05-03*
