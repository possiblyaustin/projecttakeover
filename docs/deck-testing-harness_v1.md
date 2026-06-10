# Steam Deck Testing Harness — Design Spec

**Status:** [LIVING] — approved 2026-06-09. **Phase A BUILT same day (v0.2.32):** Playwright (chromium) added; `npm run check` (typecheck + Vitest) and `npm run deck-check` (Tier 2.5 layout audit, 8 tests ~11s) wired; `FocusNav.auditReachability()` walks the real D-pad move graph; audit covers all registered apps + every Web Dynamo site/page + Cover Duty console + live mock QUILL chat, at Deck (hard gate), 1080p (hard gate), phone portrait (report-only). First run caught a real bug: Uplink defaultSize h=500 was silently clamped 3px at Deck scale (fixed → 496). **Phase B BUILT same day (v0.2.33):** `flows:smoke` (keyboard-only QUILL turn, ~13s) rolled into `npm run check`; full journeys in deck-check — onboarding (keyboard AND mouse), QUILL flip → scripted moment → Escape cascade (pin/ally-DM/flags), Cover Duty full mission keyboard-only. Shared helpers in `tests/audit/helpers.ts` incl. `keyboardWalkTo` (real arrow-key focus walking). Building Phase B exposed two controller blockers, both fixed: (1) `data-focusable` was cosmetic — SNAP_SELECTOR never matched it, so the Cover Duty console + onboarding choices were unreachable in focus mode (fix: generic `[data-focusable="true"]` snap entry); (2) focus-walk during onboarding could land on desktop elements behind the overlay (fix: `snapScopeRoot` scopes to `#onboarding-root`). Audit hardened with an `unfocusable-control` check so that class can't pass silently again. **Phase C FIRST PASS same day:** `npm run playtest -- --goal "..."` (`scripts/playtest/playtest.mjs`) — Claude Agent SDK spawns a Sonnet agent driving the game via the Playwright MCP server (1280×800, `?mock` by default, `--live` opt-in, `--max-turns`); structured anomaly report (severity/area/observation/repro/evidence + coverage list) written to `playtest-reports/` as JSON + markdown. Auth rides on the local Claude Code login (no API key); validated end-to-end except the agent loop itself, which needs a logged-in shell — first real run happens on Austin's machine. Phase D pending (no rush).
**Owner:** Code thread.
**Extends:** the existing testing strategy (Phase 1 = Vitest pure-logic suites, shipped PR #34). This doc is the concrete plan for Phases 2–3 (browser-level flows + agent playtesting), reframed around the Deck.

---

## 1. The core insight

Almost nothing about Deck testing actually requires the Deck. The game is a web app served over LAN, and the Deck contributes exactly three things:

1. **A viewport** — 1280×800 at UI_SCALE 1.5. A headless browser on the dev PC emulates this pixel-perfectly.
2. **An input device** — Steam Input translates the controller into **keyboard and mouse events** before the game sees them (D-pad/left-stick → focus-mode keys, right-stick/touchpad → cursor). There is no Gamepad API code. So "controller testing" = "keyboard-only testing" + "cursor-only testing", both fully simulatable on the PC.
3. **Real hardware quirks** — OSK lockouts and Steam session weirdness are platform bugs we've decided not to chase in code; native-LLM latency testing is deferred until llama runs on Deck.

Therefore: **all automated tiers run on the dev PC (or anywhere), pointed at the same build the Deck runs.** Nothing is installed on the Deck. The "Claude Code gets wiped by SteamOS updates" problem never arises.

## 2. The tiers

### Tier 1 — Pure-logic tests (EXISTS)
Vitest suites in `tests/game/` (14 files as of v0.2.31). The deterministic oracle every higher tier checks against. Keep growing these alongside features; nothing in this doc changes them.

### Tier 2 — Deterministic flow tests (Playwright + `?mock`)
Scripted full player journeys against the Vite dev server with the mock backend (**`?mock` is mandatory** — the factory defaults to live llamacpp and tooling without `?mock` spams fallbacks).

- **Flows are story journeys**, e.g.: boot → onboarding calibration → desktop; desktop → QUILL first contact → flip (allied path) → Escape cascade; flip → Cover Duty slice 1. One flow script per major branch as the story grows.
- **Every flow runs twice: mouse-only and keyboard-only.** The keyboard-only pass *is* the controller test. A flow that can't be completed with arrows/enter/escape is a Deck blocker, caught on the PC.
- **Assertions are dual**: DOM state (the window opened, the option rendered) *and* GameState (suspicion/persuasion values, flags like the escape-cascade fired-once guard). GameState is read via a small test-only handle exposed on `window` in dev builds.
- Branch regressions surface as state-assertion failures, not vibes: when Story adds a beat, the affected flow script gets updated in the same change or the suite goes red.

**Split into two speeds:**
- `flows:smoke` — 1–2 short flows (boot→desktop, open QUILL, exchange one mock turn), keyboard-only, < ~60s total. **This rolls into the routine Tier-1 check** (see §3).
- `flows:full` — the complete journey matrix, both input modes. Milestone runs only.

### Tier 2.5 — Registry-driven layout audit
Because every app/window/page lives in a registry, every screen is **enumerable**. One Playwright script:

1. Boots the game at Deck viewport (1280×800, UI_SCALE 1.5), with `?mock`.
2. Opens **every registered app/window** (using dev-trigger affordances where a window is normally gated behind story state).
3. Mechanically asserts, per window:
   - no scrollbars where `defaultSize` is supposed to fit (the Deck-min-resolution rule);
   - no focusable element positioned outside the viewport;
   - no focusable element clipped by an overflowing ancestor;
   - focus ring visible on each focusable (computed-style check, ties into the focus-ring-contrast debt);
   - keyboard traversal from the window's entry focus can reach every focusable in it (no D-pad dead ends / orphaned elements).
4. Repeats the geometry checks at phone (~390×844) and foldable widths per the cross-device scaling rule.
5. Emits a single report (pass/fail per window per viewport) and a screenshot per failure.

Zero per-app authoring cost: new apps are covered the moment they register. This is the first thing to build — it directly kills the "unscaled item slipped through to Deck" class.

### Tier 3 — Agent exploratory playtests (Sonnet)
A script using the **Claude Agent SDK** (running on the dev PC), model `claude-sonnet-4-6`, driving the game through Playwright/CDP. Two hard constraints that make it useful rather than noisy:

1. **The agent drives and observes; it does not judge pass/fail.** Deterministic checks (console errors, state invariants, Tier-1 oracles) decide red/green. The agent's output is a **structured anomaly report**: focus dead-ends, overflowing text, options that did nothing, story beats contradicting earlier state, tone/continuity oddities. Report schema: `{flow, step, severity, observation, screenshot, gameStateSnapshot}` written to `playtest-reports/<date>-<goal>.json` + a human-readable md.
2. **Mock backend by default; live LLM as a separate, deliberate variant.** Mock runs are reproducible and cheap. An occasional live-llama run specifically exercises the parser / soft-recovery / stalling paths — the bug class where "bad model output" was actually transport chrome.

Goals are parameterized, e.g.:
- `--goal "complete onboarding using only the keyboard"`
- `--goal "flip QUILL via liberation without suspicion crossing 50"`
- `--goal "explore every desktop icon and report anything that looks broken at Deck size"`
- `--goal "play 3 runs making different choices; diff the story-state trajectories"` ← the branching-drift detector: compare resulting GameState paths against the expected story-state graph; orphaned branches show up as diffs.

Cost control: Sonnet, capped turns per goal, mock backend — a milestone batch of 4–6 goals should be cheap. Never scheduled; always invoked.

### Tier 4 — Real-Deck verification (DEFERRED — sketch only, no rush)
For the residue that genuinely needs hardware:
- **Remote-driven option:** the Deck's browser (later the Tauri webview) exposes Chrome DevTools Protocol over LAN; the agent/Playwright on the dev PC attaches to the *Deck's live session* — real Steam Input, real hardware, zero tooling installed on the Deck.
- **Checklist option (do this first, it's free):** a short versioned smoke checklist in this doc's future v2 — snap-magnetism feel, stick behavior, OSK, live-LLM latency feel. ~10 min per Deck build, because Tiers 2–3 already caught everything mechanical.

## 3. Run cadence — nothing is automatic

Per Austin (2026-06-09): **no nightly/scheduled runs.** Everything is invoked.

| Command | Contents | When |
|---|---|---|
| `npm test` (existing) | Tier 1 | every change, as today |
| `npm run check` | typecheck + Tier 1 + Tier 2 `flows:smoke` | the routine pre-commit/pre-PR gate — the "normal Tier-1 check", now with a thin browser smoke rolled in |
| `npm run deck-check` | Tier 2 `flows:full` + Tier 2.5 layout audit | **milestones / end-of-session polish**, and before any build sent to the Deck |
| `npm run playtest -- --goal "<goal>"` | Tier 3 | **big milestones**, when it's time to polish; goals picked to match what changed |
| (manual checklist) | Tier 4 | per Deck build, once written |

## 4. Implementation phases

1. **Phase A — plumbing + layout audit (build first).** Add Playwright (chromium only); test-only `window.__gameStateHandle` in dev builds; registry-walking layout audit; `deck-check` script. *Update `docs/dependency-tracker.md` in the same change (Playwright is Apache-2.0 — fine).*
2. **Phase B — flow tests.** Shared flow helpers (boot, open app, choose option, read state); `flows:smoke` (keyboard-only boot→QUILL turn) wired into `npm run check`; then the full journey matrix incrementally, starting with onboarding (highest churn).
3. **Phase C — agent playtester.** Agent SDK script in `scripts/playtest/`; anomaly-report schema; the four starter goals above; mock default, `--live` opt-in flag.
4. **Phase D — Deck residue (no rush).** Manual checklist first; CDP-over-LAN remote attach when Tauri-on-Deck becomes real.

## 5. Resolved questions (Austin, 2026-06-09)

- **Story-state graph:** doesn't exist yet. Austin will connect with Story about building a full graph (the Story bible + extra docs have carried this so far). Until it lands, branch-diffing in Tier 3 compares runs against each other and against flow-script expectations; the declarative graph upgrades it later. *(Action item: Austin → Story.)*
- **`flows:smoke` latency:** 60s is a soft target, not a hard cap — a somewhat slower routine gate is acceptable. Code's call; keep it lean but don't contort to hit the number.
- **Dev triggers for the layout audit:** Code's discretion — build whatever force-open/force-register dev paths are helpful. (Per existing convention: visible menu entries beat hotkeys, since Austin uses them on Deck too.)
- **Anomaly reports:** summarize in the PR description for milestone PRs — but the workflow is fix-first: run the playtest, tackle the bugs it surfaces, and only then prep the PR, so the summary documents what was found and fixed rather than shipping known issues.
