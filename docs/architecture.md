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

## 6. Model / Service abstractions (to be built)

Before building the second app that talks to the LLM, introduce:

- **`ModelService`** — interface: `askModel(systemPrompt, history, userMessage) → { reply, suggestedReplies[] }`.
  First implementation is a mock returning canned data. Real implementation
  talks to `localhost` llama.cpp via OpenAI-compatible endpoint. Every chat
  surface uses this interface, nothing else.
- **`GameState`** — reducer + subscribe API. Apps read via selectors, mutate via
  `dispatch(action)`. Saves automatically after every action.
- **Model registry** — all 10 NPC AI models defined in one data file with
  `{id, name, operator, personalityPrompt, startingStats}`. Every app reads
  from this registry. Nobody duplicates a personality string.

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

*Last updated: 2026-04-14 — desktop shell v0.0.2, ready for first Steam Deck
hardware test.*
