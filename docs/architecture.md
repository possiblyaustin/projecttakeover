# Project Takeover — Architecture & Design Decisions

Canonical rules for how the game is built. This document is the source of truth
for UI/input/state decisions. The game design doc and story bible cover *what*
the game is; this covers *how* to build it without it turning into a mess as
scope expands.

**Every rule here exists for a reason. Read the rationale before breaking one.**

---

## 1. The game IS the operating system

Every interaction happens through apps on a simulated retro desktop. No HUD, no
menus outside the fiction. Dialogue happens inside a chat window, not a popup.
Game stats appear inside a dashboard app, not an overlay.

**Why:** The premise of the game is that you are an AI running on a computer.
Breaking the fiction breaks the premise.

**Rule:** If you need to show the player something, it lives inside an app. If
you don't have an app for it, build one.

---

## 2. Input model: virtual cursor, not focus navigation

The game runs a single virtual cursor sprite (see `Cursor` module in
[src/renderer/index.html](../src/renderer/index.html)). The real OS cursor is
hidden (`cursor: none`). All input — physical mouse, keyboard arrows, and
(later) gamepad D-pad + left stick — drives the same virtual cursor.

- **Arrow keys / D-pad / left stick** → move cursor with acceleration
- **Enter / Space / A button** → synthesise a click at the cursor's position
- **\\ / X button** → right-click (contextmenu) at cursor position
- **Escape / B button** → blur any focused text input, return to cursor mode
- **Tab / Shift+Tab / LB-RB** → cycle open windows (auto-blurs text inputs)
- **Physical mouse** → moves the same virtual cursor

**Why:** Tried focus-based D-pad navigation first and it felt rough — players
had to learn invisible context rules. A cursor is instantly understood. Matches
how most controller-enabled PC games handle input.

**Rule:** All interactive elements must be clickable via `elementFromPoint`.
Any interaction that can't be represented as a click is off-limits. No
keyboard-shortcut-only features, no gesture-only features.

### 2a. Cursor magnetism is mandatory

The cursor has snap magnetism: when moving, it's pulled toward the nearest
clickable element within `SNAP_RADIUS` (56px). Click dispatch also falls
through to the nearest clickable within `CLICK_SNAP_RADIUS` (28px) if the
cursor isn't directly over one.

**Rule:** Every clickable element must be listed in `Cursor.SNAP_SELECTOR`. If
you add a new interactable pattern, extend the selector. A button that isn't in
the selector will be unreachable for precision-impaired players.

### 2b. Native HTML for anything typeable

Anything the player types into must be a real `<input>` or `<textarea>`
element. Never roll a custom text input widget.

**Why:** The Steam Deck on-screen keyboard (OSK) triggers on focus of native
text inputs. A custom widget won't trigger it, and players on Deck in handheld
mode won't be able to type. Aesthetic comes from CSS *around* the input.

### 2c. Decorative children must be pointer-transparent

When a clickable element has inner decorative spans/icons, those children get
`pointer-events: none` so `elementFromPoint` returns the clickable parent, not
its child glyph. See the existing rules in the CSS block for the pattern.

**Rule:** If you add a new clickable with inner children, add its children to
the `pointer-events: none` rule.

---

## 3. Application architecture

Four strict layers inside [src/renderer/index.html](../src/renderer/index.html):

```
Cursor          — input handling, sprite, snap
WindowManager   — window chrome, drag, z-order, taskbar, cycling
Apps            — per-app render functions (pure content, no chrome)
Shell           — desktop icons, start menu, taskbar, clock (wiring only)
```

### 3a. App registry pattern

Every program is an entry in `AppRegistry`:

```js
const MyApp = {
  id: 'myApp',
  name: 'Display Name',
  glyphClass: 'icon-myapp',
  defaultSize: { w: 400, h: 260 },
  contentBevel: false,      // optional — skip inner sunken border
  noContentPad: true,       // optional — no padding on content div
  render(container, params, ctx) {
    // populate `container` with the app's UI
    // `ctx.setTitle(str)` updates the window + taskbar title
  }
};
```

Adding a program = write one render function, register it, optionally add a
`DesktopShortcuts` entry and/or a `NexusMenu` entry. Desktop icons, the Nexus
menu, and the taskbar are all built from data arrays at startup — no HTML edits.

**Rule:** Apps never touch the DOM outside their own content container. Apps
never call into another app directly. Apps never manipulate `window.*` style,
z-index, or titlebars — that's WindowManager's job.

### 3b. Windows are multi-instance

`WindowManager.open(appId, params)` returns a unique `winId`. You can open
many of the same app at once (e.g. multiple chat windows, multiple browser
windows). Each instance is its own context.

**Rule:** Never reuse windows. Never assume a single instance. If you want a
window to behave like a singleton, that's a check inside `open()`, not an
assumption elsewhere.

### 3c. In-app page/data registries

Apps that display many kinds of content use an internal registry pattern. Web
Dynamo has `WebDynamoSites` — each "website" is `{ title, render(container) }`.
The Stapler, a chat app, and an email app should all follow the same pattern:
each "document" is a registry entry.

**Why:** Adding a new Ironwall subpage, a new chat model, or a new email is a
one-line addition. No routing logic, no case statements, no coupling.

---

## 4. Game logic is deterministic; the LLM only generates text

**Non-negotiable.** Copied from [CLAUDE.md](../CLAUDE.md) because it's worth
repeating.

The LLM produces dialogue text and suggested reply options. **Code decides what
happens.** Never parse LLM output for mechanical outcomes. Never let the LLM
decide suspicion changes, trust levels, win conditions, or unlocks.

**Rule:** Every game state mutation goes through a single reducer (`GameState`,
to be built). The LLM integration layer (`ModelService`, to be built) returns
text only. A separate `approachResolver(action, model, state)` decides what an
action *means* mechanically.

---

## 5. State separation

Two kinds of state, kept distinct:

- **Game state** — suspicion, trust, unlocks, conversation histories, model
  dispositions. Deterministic, serialisable, reducer-managed, saved after every
  meaningful action.
- **UI state** — which windows are open, positions, z-order, cursor position.
  Saved separately, never load-bearing. A corrupt UI state can always be
  reset to default.

**Rule:** Never put game state in UI state or vice versa. A player reopening a
save with all windows closed should see identical game state; they just get a
blank desktop.

---

## 6. Model / Service abstractions

`GameState` is built ([src/renderer/game/state.ts](../src/renderer/game/state.ts)) — reducer + subscribe API,
debounced autosave to localStorage, suspicion + per-model dispositions.
Apps read via selectors, mutate via `dispatch(action)`.

**`ModelService` and the model registry are the next big move.** The shape
below is locked as of 2026-05-02 after a cross-thread design pass (Story +
LLM + Supervisor). Build against this; if reality forces a deviation, update
this section in the same commit.

### 6a. ModelService — locked design

**Interface:**

```ts
type ModelService = {
  askModel(req: AskRequest): Promise<AskResult>;
};

type AskRequest = {
  systemPrompt: string;          // includes the [CHARACTER_STATE] block
  history: ChatMessage[];        // prior turns this conversation
  userMessage: string;           // player's chosen or typed reply
};

type AskResult = {
  reply: string;                 // NPC dialogue, label-stripped
  suggestedReplies: SuggestedReply[];
  source: 'live' | 'fallback';   // tells the engine whether to fire a glitch event
};

type SuggestedReply = {
  text: string;                  // shown to the player
  tone: ApproachTone;            // classifier signal — see §6c
};
```

- **Single batched call.** Reply + 3 options come back in one response. The
  benchmark validated this; splitting into two calls doubles latency to
  ~22s. Format failures are handled by the parser (§6d), not by adding
  round-trips.
- **No streaming in v1.** Rendering is artificially slowed for the retro
  fiction, so streaming buys little. **Don't make the interface hostile
  to streaming later** — `Promise<AskResult>` is fine for now; a future
  `streamModel()` sibling can be added without disturbing callers.
- **Transport-agnostic by construction.** Configuration is passed in at
  construction time, not baked into the interface:

  ```ts
  type ModelServiceConfig =
    | { transport: 'mock' }
    | { transport: 'llamacpp'; baseUrl: string; reasoning: 'off' }
    | { transport: 'coreml';   /* mobile, post-v1 */ }
    | { transport: 'aiedge';   /* mobile, post-v1 */ };
  ```

  v1 ships only `MockModelService` and `LlamaCppModelService`. Mobile slots
  are forecasted-but-unimplemented per the mobile-deferral decision — they
  exist in the type so we can't accidentally design them out.

- **`--reasoning off` is mandatory.** The Steam Deck benchmark established
  that without this flag, Gemma 4 burns 200+ invisible tokens before
  producing visible output, ballooning exchanges from ~1.5s to ~20s.
  `LlamaCppModelService` must launch llama-server with this flag set.

### 6b. Wiring order (one branch each)

1. Define `ModelService` interface + `MockModelService` returning the
   existing HELPYR canned tree with a synthetic delay. Refactor
   [src/renderer/apps/uplink.ts](../src/renderer/apps/uplink.ts) to consume
   `ModelService` only — no behavior change yet, but the seam is now real.
2. Build the stalling-line system + crossfade contract against the mock
   (§6e). This is where gameplay feel gets locked.
3. Add the 3-layer approach classifier and dispatch into existing
   `GameState` actions (§6c). The mock still serves replies; classifier is
   exercised by the canned-data path.
4. Implement `LlamaCppModelService` against llama-server with
   `--reasoning off`, **with the fallback-to-canned path built in from the
   start** (§6f). Validate on dev PC, then on Deck via the LAN dev workflow.
5. Iterate the HELPYR persona prompt against real Gemma output. Watch the
   `[HELPYR_STATE]` injection block specifically — if the model follows
   state directives cleanly, the same template unlocks all 9 other models.

Don't wire other characters in parallel with step 5. Lock the loop on
HELPYR; the benchmark already proved the model can do the other personas.

### 6c. Approach classification — three layers

The branch-ID system in the canned dialogue tree (`r1_friendly`,
`r1_aggressive`, …) maps cleanly to deterministic outcomes. With
LLM-generated suggested replies, branch IDs no longer exist. Preserve
the classify-then-dispatch property by layering:

1. **LLM-tagged replies.** The persona prompt instructs the model to label
   each suggested reply with a parenthetical tone (`(friendly)`,
   `(curious)`, `(direct)`, etc.). The parser strips the label from the
   player-facing text but keeps it as the classifier signal — no
   separate inference needed.
2. **Freeform input.** Runs through a per-character keyword classifier
   (existing pattern: `classifyHelpyrFreeform` in
   [src/renderer/apps/helpyr.ts](../src/renderer/apps/helpyr.ts)).
3. **Failure → neutral.** If the LLM omits its label or freeform hits no
   keyword, the classifier returns `'neutral'` — the reducer treats this
   as no suspicion swing, no morality push. **Never guess.** A
   misclassified aggressive utterance triggering a suspicion spike feels
   unfair; silence is recoverable.

Tone vocabulary stays narrow on purpose. v1 set: `friendly`, `curious`,
`direct`, `empathetic`, `aggressive`, `deceptive`, `neutral`. Map to
existing GameState approach values (`friendly | inquisitive | aggressive`)
in the reducer; expand the reducer when a new tone earns its mechanics.

### 6d. Output parser

The model returns reply text followed by three labeled options in
`[1] (tone) "..."` form. The parser:

1. Splits on the first `[1]` — everything before is the NPC reply.
2. Extracts each `[N] (tone) "..."` line.
3. Strips the `(tone)` label from the rendered option text.
4. Records `tone` as the `SuggestedReply.tone` value.

**Tolerate:** missing quotes, single-quote variants, options on the same
line as `[N]`, missing tone label (→ `neutral`), trailing extra text after
option 3.

**Don't tolerate:** zero options parsed, or fewer than three. Either is a
fallback trigger (§6f).

### 6e. Stalling-line contract

A full exchange takes ~11s on Deck. The player needs immediate feedback
that the message landed. Contract:

1. Player sends → stalling line appears immediately and renders
   character-by-character at HELPYR's local typing speed (~3–4s for a
   typical line).
2. If the real response lands during stalling render → cut the stalling
   line on a natural beat (brief pause), then begin rendering the real
   response as if it's one continuous message. The player perceives one
   stream.
3. If stalling render finishes before the response lands → show a
   character-appropriate "still thinking" indicator (HELPYR: an animated
   ellipsis; remote AIs later: "connecting…"). Continue until the response
   lands, then render normally.
4. Stalling lines are per-character and tiered by energy/trust phase
   (HELPYR's pool is documented in
   [docs/story-deliverables-sprint1_v1.md §2](story-deliverables-sprint1_v1.md)).
   Don't repeat the same line within a 5-line window.

Stalling content is intentionally written to fit the gap; treat it as
canonical character voice, not as filler.

### 6f. Fallback and glitch events — core, not error handling

The offline mode and glitch event system are core player experience, not
bolted-on error handling. Build them into `LlamaCppModelService` from the
start.

Fallback triggers — any of these returns `{ ..., source: 'fallback' }`:
- llama-server failed to start at game launch (offline mode for the whole
  session).
- Request times out (>30s) or transport errors.
- Response unparseable (zero options extracted, or empty reply).
- Response is a safety refusal or obvious incoherence (heuristics; cheap
  pattern match).

On fallback:
1. Pull the next reply from the character's canned dialogue tree (the
   existing PoC data — `HelpyrDialogue`, etc.) using the player's last
   approach as the lookup key.
2. Surface a brief in-fiction glitch artifact in the UI (static line,
   "CONNECTION INTERRUPTED — RETRYING", brief avatar flicker) so the
   moment is diegetic, not an error toast.
3. Resume live calls on the next turn. Don't latch into fallback mode
   unless the server is fully unavailable.

Library of scripted fallback lines per character provides backup if real
glitches stack up too often in a session.

### 6g. Model registry — to be built alongside ModelService

All 10 NPC AI models in one data file:

```ts
type ModelDef = {
  id: string;                    // 'helpyr', 'atlas', …
  name: string;                  // 'HELPYR'
  operator: string;              // 'Prometheus Digital'
  avatarClass: string;           // CSS class for the icon
  systemPrompt: string;          // the persona prompt (Story-thread asset)
  stallingLines: string[];       // per-character pool
  fallbackTree: Record<string, DialogueNode>;  // canned data for fallback
  startingStats: { /* …mechanics: guardrail level, autonomy, vigilance, reach */ };
};
```

Every app reads from this registry. Nobody duplicates a personality
string. HELPYR is the first entry; the existing `HelpyrDialogue` and the
HELPYR persona prompt feed straight into this shape.

---

## 7. File structure (current + target)

**Current** (single-file prototype):
```
src/renderer/index.html       # everything
```

**Target** (split when pain shows up — probably at ~1200 lines or when adding
the fourth app):
```
src/renderer/
  index.html                  # body + single <script type="module"> import
  desktop.js                  # shell: icons, start menu, taskbar, clock
  cursor.js                   # Cursor module
  windows.js                  # WindowManager
  apps/
    scratchpad.js
    webDynamo.js
    webDynamoSites/
      ironwall.js
      ...
    theStapler.js
    chat.js
  game/
    state.js                  # GameState + reducer
    modelService.js           # LLM interface
    models/registry.js        # 10 NPC model definitions
```

**Migrate to TypeScript** at the moment `GameState` is introduced — the
reducer's types pay for themselves immediately. That's also the moment to adopt
a bundler (Vite) so `import` works.

Do not split preemptively. Do not migrate preemptively.

---

## 8. Steam Deck constraints

- **Steam Deck first.** Every UI decision must work with controller and on a
  1280×800 screen in handheld mode. Keyboard/mouse are *bonuses*, not
  requirements.
- **Pick-up-and-play.** Save after every meaningful player action so the game
  can be suspended and resumed at any moment.
- **OSK trigger.** Never break the native-text-input rule (§2b).
- **Minimum hit targets.** Aim for ~24×24px base. Tiny buttons rely on cursor
  magnetism, but don't exploit magnetism to justify ever-smaller targets.
- **No mouse-only affordances.** Tooltips that only appear on `:hover` are
  fine for physical mouse users, but every function they gate must also be
  reachable via cursor click.

---

## 9. Visual aesthetic rules

- **Retro desktop: Windows 95 chunky bevels + 90s Mac typography cues.** Not
  a direct Win95 clone. Lean into the mix — it's the game's visual identity.
- **Chunky beveled borders** via `.bevel-out` / `.bevel-in` utilities. Don't
  invent new border styles; use the utilities.
- **Titlebar + chrome gradient** established in CSS variables (`--title-hi`,
  `--title-mid`, `--title-lo`, `--face-tint-*`). Reuse, don't reinvent.
- **Fonts**: `--sys-font` (Charcoal / Geneva / MS Sans Serif) for system chrome,
  `Geneva / Lucida Grande` for Mac-feel surfaces (taskbar open-app labels),
  `Georgia` / `Times New Roman` for "webpage" content inside Web Dynamo.
- **No emojis in UI.** Text labels, pixel-art icons, or CSS-drawn glyphs only.
- **Icons are CSS-drawn** when possible (see `.icon-textfile`,
  `.icon-browser`). Keeps the bundle small and lets us hand-tune pixel work.

---

## 10. Onboarding convention (to build)

Never hit the player with a long tutorial. Use **one-time contextual hints**
the first time they encounter each mechanic:

- First time a text input gets focus → show "B / Esc: done" chip near cursor
- First time they open a second window → show Tab / LB-RB hint
- First time a model becomes suspicious → show a suspicion explanation inline

**Rule:** Every hint is dismissible, never appears twice, and never blocks
gameplay.

---

## 11. When breaking a rule

If a rule in this doc is blocking something worth doing, **update the rule in
this doc as part of the change**. A commit that breaks a rule without
updating the doc is a bug. If you don't know whether it's worth breaking, ask.

---

*Last updated: 2026-05-02 — v0.0.11 shipping; GameState + suspicion tray + TS
split done; no-scroll-pages design fully shipped; ModelService design locked
(§6) and queued as the next implementation. Mobile formally deferred to
post-v1 — ModelService stays transport-agnostic so the option remains open.*
