# No-Scroll Pages — Design Note v1

**Status:** Approved 2026-04-30. All open decisions resolved (see §10). Ready for implementation.
**Date:** 2026-04-30
**Supersedes:** None (new design surface)
**Affects:** Web Dynamo, Uplink, future browser-style apps. Architecture doc §2 may need a footnote.

---

## 1. Problem

The current shell scrolls anywhere content overflows. That's fine on a desktop with a scroll wheel, awkward on a Steam Deck (right-stick scroll lands eventually but isn't fluid), and a hard problem on mobile-landscape with no scroll wheel and only a thumb.

We have two surfaces that already overflow:

- **Web Dynamo** — fictional websites can be longer than the viewport. Today they free-scroll inside `.browser-viewport`.
- **Uplink** — chat history grows indefinitely. Today `.uplink-log` free-scrolls; entering a new message pins to the bottom.

ModelService (next big move) will heavily expand Uplink content, so locking the chat-overflow story now prevents rework later.

---

## 2. Direction

**Minimize free-scroll across the game. Replace it with explicit pagination wherever the content has a natural "step" rhythm.** The decision is opinionated but reversible — we're committing for this PR cycle, and we can soften any of these rules if a specific surface fights the pattern.

Why this is the right move:

- **Controller-native** — pagination is a single button per advance. No analog feel-out, no hold-stick-and-wait.
- **Mobile-native** — no thumb-scrolling at variable speeds; tap or swipe a button.
- **Touch-native** — a button is a target; a scroll surface is a gesture.
- **Fiction-native** — old web genuinely paginated articles ("← Page 1 of 4 →"). Old chat clients (IRC, MUDs) had old lines scroll off the top of a fixed buffer. Both fit our retro aesthetic.

It also nudges us toward authoring tighter content. A page with a hard ceiling forces you to write to that ceiling.

---

## 3. Scope

| Surface | Treatment | Why |
|---|---|---|
| Web Dynamo articles | **Hard pagination** | Period-appropriate; content authored as discrete pages |
| Web Dynamo search results / lists | **Hard pagination** | Same |
| Uplink active chat | **Live tail only** (last N messages fit, older ones fall off) | Chat is fundamentally cumulative; live = present moment |
| Uplink history (when player opts in) | **Hard pagination** in a separate read-only Log window | Optional deep-read, separate from active conversation |
| Scratchpad textarea | **Native scroll, unchanged** | It's a text editor, not narrative content |
| Future code/log apps (terminal, etc.) | **TBD** when we get there | Likely native scroll for terminal; fictional logs likely paginated |

**Hard rule:** any content surface whose content is authored (sites, search results, chat history) gets pagination. Surfaces whose content is player-typed (textareas) keep native scroll.

---

## 4. The page-controls primitive

Both Web Dynamo and the Uplink Log viewer want the same UI pattern. We build it once, both consume it.

### Visual

```
┌─────────────────────────────────────────────────┐
│                                                 │
│   [content of current page]                     │
│                                                 │
│                                                 │
│                                                 │
├─────────────────────────────────────────────────┤
│ [◄ Prev]            Page 2 of 5         [Next ►] │
└─────────────────────────────────────────────────┘
```

Chunky retro chrome on the buttons (matches `.browser-btn` aesthetic). Page indicator is plain centered text. On page 1, `Prev` is greyed-disabled but kept in place (no layout shift). Same for `Next` on the last page.

### Behavior

- `Prev` / `Next` buttons are real focusable elements (added to `SNAP_SELECTOR`).
- Each click animates the page transition with the same in-fiction "Connecting..." beat Web Dynamo already uses, scaled down (~80ms instead of 180ms — pages are local, not network fetches).
- Disabled state is visually muted but the buttons still receive focus (so D-pad doesn't get stuck).
- **✅ Decided: both.** D-pad-to-button + A is the always-works fallback. `PageUp` / `PageDown` is wired as a global handler when focus is inside a paginated surface — Steam Input maps LB/RB to those keys for one-button advance on Deck.

### Implementation pattern

```ts
// New module: src/renderer/components/pageNav.ts
export function mountPageNav(opts: {
  container: HTMLElement;       // where to render the nav bar
  totalPages: () => number;     // dynamic so apps can change page count
  currentPage: () => number;    // 1-indexed
  goTo(page: number): void;     // app-supplied — re-renders content
}): { destroy(): void };
```

Web Dynamo and Uplink-Log both call `mountPageNav` and supply their own `goTo`. Keeps the visual + focus contract in one file.

---

## 5. Web Dynamo specifics

### Authoring change

Today every site has `render(container: HTMLElement): void` — one big blob.

New shape:

```ts
export type SiteEntry = {
  title: string;
  pages: Array<{
    label?: string;                 // optional — used in TOCs later
    render(c: HTMLElement): void;   // renders one page's content
  }>;
};
```

Single-page sites just have `pages: [{ render: ... }]`. The browser app:

- Shows the page-nav primitive ONLY when `pages.length > 1`. Single-page sites have no chrome.
- Tracks the current page index per browser-window-instance (so two windows on the same site can be on different pages).
- On `navigate(url)`, resets to page 1.
- On `Back`/`Forward` in browser history, restores the page index that was active when the history entry was created (page state is part of history).

### Visual placement

Page-nav bar replaces the current `.browser-status` ("Ready" / "Connecting..." text). Status messages get either:
- (a) absorbed into the nav bar's left side ("Connecting..." / "Done"), or
- (b) moved into a small chrome corner that auto-fades.

**✅ Decided: (a) absorb into nav bar.** Status text isn't load-bearing for the player — denser layout that reuses existing chrome wins.

### Content authoring guideline

Each page should fit in ~`800×450 - chrome` of viewport at 1× scale. Don't pad pages with filler — if a site has natural content for two and a half pages, write two and a half pages, and accept that the last is short. Ironwall's current home is ~1.5 pages worth — split into "About / Divisions" + "Legal footer + careers callout".

---

## 6. Uplink specifics

### Live chat (active conversation)

Goal: preserve the "live transmission" feel while removing scroll.

Rules:

- The log treats **the player's commit as a turn boundary** and clears the visible log when the player picks an option or sends a freeform message. The new turn starts with just the player's message; HELPYR's reply types in below it. Net effect: the live log shows the current turn (player's last commit + current NPC reply) — typically one or two bubbles.
- Older messages still exist in `messages[]` JS state for the future Log viewer — the clearing is visual only.
- The log is `display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden`. As the NPC reply types in and the combined turn exceeds the log height, the player's bubble at the top **smoothly slides above the clip line** — no DOM eviction, no JS-side trim, no snap-out. The bottom of the log stays anchored to the most recent typed text so the player's eye follows the typing.
- **Why turn-boundary clearing + flex-end?** Initial v1 implementation tried dynamic fit-as-you-go with a JS `trimFromTop` that evicted the oldest DOM bubble whenever `scrollHeight > clientHeight`. Two problems: (a) the OLDEST visible message would snap out *mid-typing* of the NEW NPC reply because the new reply finally pushed the log over the edge — the player's eye is on the typing message and a totally separate message disappearing two slots away breaks attention; (b) the synchronous trim measured against stale layout when run in the same JS turn as `clearOptions()`, requiring rAF deferral and coalescing to dodge eating newly-added messages. Anchoring the log to flex-end gets us the same "newest content always visible" behavior with zero JS, and turn-boundary clearing keeps the conversation rhythm clean. (Refinement after Deck playtest 2026-04-30.)
- A discreet **`▲ Earlier in this transmission`** chip sits pinned at the top of the live log (not a real message — a control). Selecting it opens the Log viewer (see below). This chip is hidden when no older messages exist.
- The `[1] / [2] / [3]` option buttons and the freeform input bar stay where they are now, below the log.
- **No scrollbar on `.uplink-log`** — set `overflow: hidden`. The "older messages exist" affordance is the chip, not a hidden scroll.

### Log viewer (read-only history)

Opens as **a separate window** when the chip is clicked. Window title: `<Contact name> — Log`.

- Shows the same conversation, paginated using the page-nav primitive.
- Read-only. No option buttons, no input bar — it's an archive.
- Pages are chunked **by message count, defaulting to 5 messages per page**. ✅ Decided: count-based, not session-based — sessions aren't a real game state concept yet, and count keeps the page ceiling predictable. The default of 5 (lower than the v1 draft's 10) accounts for messages running long under the real LLM; it's a config knob, not an architectural decision, so we tune post-playtest if pages feel too tight or too sparse.
- Closing the window doesn't affect the live conversation. Reopening the live Uplink doesn't disturb the log.

### What this preserves

- The premise: when the player is in the conversation, they're in the *now* — the chat reads as a live link.
- A scroll-free interaction surface for the actual gameplay loop (read messages → pick option → repeat).
- Historical reference for players who want to verify what was said earlier, available but out-of-the-way.

### What this changes

- Players can't currently scroll back during a conversation to re-read something while choosing their next reply. The chip + log-window is a deliberately heavier action (one-click to open) so the design encourages decisions in the moment. **✅ Confirmed by Austin 2026-04-30:** intentional, in service of the broader principle that decisions should feel permanent and the game should discourage save-scumming. Each playthrough isn't long enough that committing to choices is a heavy ask. (See [project_playthrough_commitment.md](../../../.claude/projects/C--Users-dunca-Documents-projecttakeover/memory/project_playthrough_commitment.md) for the full design philosophy.)

**✅ Decided: subtle continuous pulse** — the chip is a brand-new affordance and players need to learn it exists. Pulse should be slow and low-intensity (a "breathing" tint shift on the chip background, ~2 second cycle), not flashy. Continuous rather than first-N-cycles since this is the entire UX for a missing piece of conversation history; the pulse IS the discovery cue. Tune intensity post-playtest if it reads as noisy.

---

## 7. Implementation outline (loose)

Suggested PR cuts, in order:

1. **Page-nav primitive** (`src/renderer/components/pageNav.ts`) — including focusable Prev/Next, disabled-state styling, optional PgUp/PgDn global handler. Deliverable: working primitive with a synthetic test harness.
2. **Web Dynamo migration** — change `SiteEntry.render` to `SiteEntry.pages[]`, update `webDynamoSites.ts` to split current sites into pages, wire the browser app to mount `pageNav` when needed. Bigger sites split into 2–3 pages each.
3. **Uplink live tail** — switch `.uplink-log` to `overflow: hidden`, implement the dynamic-fit "show last N messages" calculator, add the `▲ Earlier` chip. Don't ship the Log viewer yet.
4. **Uplink Log viewer** — new app (`apps/uplinkLog.ts`?) that takes a contact ID + dialogue history, paginates, mounts in a regular window. Wire the chip to `WindowManager.open('uplinkLog', { contact })`.

Each of those is its own PR; they don't have to land together. (1) and (3) are independent of each other. (2) needs (1). (4) needs (1) and (3).

---

## 8. Out of scope (explicit)

- **Search within history.** Fits the fiction to *not* have it ("you're a small AI, scroll your own context"). Maybe an Easter egg later.
- **Multi-tab browsing in Web Dynamo.** Each browser window is one tab; for multiple sites open multiple windows. Period-accurate.
- **Auto-paginating long content.** Pages are authored manually. We're not building a renderer that splits content by viewport height; that's a black hole.
- **Touch swipe gestures for page advance.** Buttons only for v1. Add gesture support later if mobile playtests demand it.
- **Configurable page-button placement.** Always at the bottom. Don't entertain top-placement requests.

---

## 9. Architecture doc updates needed

`docs/architecture.md` §2 ("Input model: virtual cursor, not focus navigation") is now stale — focus traversal shipped in v0.0.4. That section needs revising regardless of this design note. Suggested addendum after this design note lands:

- §2 retitle: "Input model: dual-mode (cursor + focus)"
- New §2c or §3: "Pagination over scroll" — codify the scope rule from §3 of this note.

I'll cover both edits in the no-scroll implementation PR series.

---

## 10. Decisions summary

All resolved 2026-04-30:

| # | Question | Decision |
|---|---|---|
| 1 | Page advance: D-pad-to-button, PgUp/PgDn global, or both? | **Both** — D-pad is fallback, PgUp/PgDn maps to LB/RB on Deck for one-button advance |
| 2 | Web Dynamo status-text placement | **Absorb into nav bar** |
| 3 | Uplink Log pagination | **5 messages per page** (count-based, sessions deferred) |
| 4 | "Can't scroll back during active chat" | **Yes — feature.** Aligns with broader "decisions feel permanent / discourage save-scumming" design philosophy |
| 5 | `▲ Earlier` chip discoverability | **Subtle continuous pulse** (slow breathing tint, ~2s cycle) |

---

## 11. What this note does NOT decide

- **Visual styling of the page-nav primitive** beyond "matches `.browser-btn` aesthetic". Pixel-level styling lands during implementation.
- **Exact `Earlier in this transmission` wording.** Content/copy decision; I'll propose options when I draft the chip.
- **The fate of the held-flag/RAF analog input loop** in `cursor.ts`. Still dormant, will be revisited when the Gamepad API push happens (separately from this note).
