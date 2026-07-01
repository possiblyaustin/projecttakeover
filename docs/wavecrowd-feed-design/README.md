# Handoff: WaveCrowd Feed — "portal + deck" layout pass

## Overview
A design pass on the WaveCrowd in-fiction feed (the one-card-at-a-time "TikTok" deck that
lives inside Web Dynamo). Goal of this pass: **fill the empty space** around the single card
with period-authentic 2007 social furniture (MySpace/early-Facebook portal chrome) while
keeping the core "one post fills the layer" interaction. The chosen direction merges two
explorations: **1a — three-column portal chrome** + **1b — deck-depth peeks & action rail**.

The window target is unchanged: an **850 × 530** content area inside the desktop window, **no
scrollbars**, one card at a time.

## About the design files
The files in this bundle are **design references built in HTML** — a prototype of the intended
look and behavior, **not production code to paste in**. The task is to **re-create this in the
existing renderer** (`src/renderer/apps/waveFeed.ts` + `src/renderer/styles/main.css`), using
the codebase's established patterns: imperative DOM building, `--sys-font`, the existing
`.site-wave-deck` class family, `data-focusable` / `data-action` / `data-href` conventions, the
`GameState` mission dispatches, and `textContent`-only rendering for any model copy.

This design was itself derived from your current `waveFeed.ts`, so most primitives already
exist — this is an **additive layout change**, not a rewrite. See "Mapping to existing code".

## Fidelity
**High-fidelity.** Colors, type, spacing, and copy are final and match the code-side style
brief. Recreate pixel-close, but express the values in the codebase's `rem`/token idiom rather
than the prototype's inline `px` (conversion notes below; the prototype uses 1rem ≈ 16px, but
the app renders at the Deck's own scale — keep everything relative as the current file does).

---

## Layout (top → bottom, then left → right)

The app content area is a flex **column**, `padding: 8px`, `gap: 6px`:

1. **Header band** — full width, `height: 34px`. (Existing `.wave-deckhead`.)
2. **(optional) MUSE line** — thin italic strip, only when a `museLine` is set. (Existing `.wave-museline`.)
3. **Three-column body** — `flex: 1; display: flex; gap: 8px`:
   - **Left rail** — `width: 150px`, flex column, `gap: 7px`. NEW.
   - **Center column** — `flex: 1`, flex column, `gap: 6px`. Holds the deck (feed) OR the compose sheet.
   - **Right rail** — `width: 178px`, flex column, `gap: 7px`. NEW.

### Center column, feed mode
`flex: 1` row of **[ inner-deck-column | action-rail ]** with `gap: 8px`, then the **controls bar** below it.

- **Inner deck column** — `flex: 1`, column, `justify-content: center`, `gap: 4px`:
  - **Prev peek** (only if not first card) — `height: 24px`, `margin: 0 16px`, dimmed neighbor label.
  - **Main card** — `flex: 1`, the current post (variants A–D below).
  - **Next peek** (only if not last card) — `height: 24px`, dimmed neighbor label, bottom-aligned text.
- **Action rail** — `width: 52px`, column, centered, `gap: 13px`. Four round glossy buttons: ♥ / 💬 / ↗ / 🔖. Hidden on the Evergreen ad; **muted/desaturated** on buried posts.
- **Controls bar** — `space-between`: `▲ Back` · center (position text `3 / 10` + 10-dot progress rail) · `Next ▼`.

### Center column, compose mode
The deck + action rail + controls are **replaced** by the compose sheet (objective → topic →
drafting → preview). The **left and right rails stay visible** for context. (Today's code swaps
the whole card slot; here, swap only the center column.)

---

## Components (exact specs)

### Header band  (`.wave-deckhead`)
- Background (Glossy, default): `linear-gradient(180deg,#4a97e0 0%,#2a7fd4 9%,#1f6ec4 52%,#1a5fae 100%)`,
  `box-shadow: inset 0 1px 0 rgba(255,255,255,.55), inset 0 -1px 0 rgba(0,0,0,.14)`, `border-bottom: 1px solid #12518f`.
  (Flat fallback = your current `linear-gradient(180deg,#2a7fd4,#1a5fae)` with no insets — kept as a toggle.)
- Left: `🌊 WAVECROWD` — 15px/800, `#fff`, `text-shadow: 0 1px 1px rgba(8,30,60,.55)`; then italic tagline
  `— Share the Wave` — 12px/400, `#d3e6fb`.
- Right: **exposure pill** + **✎ Direct MUSE** button (unchanged from `.wave-exposure` / `.wave-compose-btn`,
  purple `#7a3fa8`→hover `#8f51bd`).

### Left rail (NEW)
Two glossy XP-style panels (panel bg `linear-gradient(#f6f9ff,#e7eefb)`, `border 1px #b8cae6`,
`inset 0 1px 0 #fff`, radius 5px):
- **Mini-profile**: 44px circular avatar `linear-gradient(135deg,#5aa0e6,#2a6bb8)` with initial "W";
  name `@wavecrowd_content` (12px/700 `#16263e`); sub `Your Wave · 1,204 followers` (10px `#7a8aa2`).
- **Nav list** (`flex: 1`): Home (active) · Profile · Friends `312` · Messages `4` (red) · Events · Photos.
  Items 12px `#24406a`, 5px×7px pad, radius 4px. Active item: bg `linear-gradient(#dcebfb,#c3ddf6)`,
  700, `#123a68`, `inset 0 1px 0 #fff`.

### Right rail (NEW)
- **Trending Now** panel — title 9.5px/700 uppercase `#1a5fae`. Rows: label (11.5px/600 `#1a5fae`) +
  count (10px `#9aa8bd`). Include one **manufactured** trend in accent purple `#7a3fa8` with a `▲`
  (e.g. `#TrustTheProcess ▲`). Example data: `#AxiomEvents 4,812`, `#AIWorkflows 2,905`,
  `#TrustTheProcess ▲ 1,910`, `#ShareTheWave 1,677`.
- **Who's Waving** panel — 20px avatar chips + name + green online dot (`#3fae5f`).
  Sarah PDX, Axiom Media, MarcusW.
- **Sponsored (Evergreen)** panel — warm green gradient `linear-gradient(160deg,#f1f8f2,#dcebe0)`,
  `border #9cc3a6`. Georgia italic `"They're still here."`, `Evergreen by Axiom`, small glossy green
  `✦ Free trial ›` pill. Whole panel is clickable → jumps to the Evergreen card.

### Peeks (NEW)
Dimmed neighbor slivers, `height: 24px`, `opacity: .72`, bg `#f4f7fc`, border `#d3dcea`
(top peek: border-radius `6px 6px 0 0`, no bottom border; bottom peek mirrored). Text 11px/700
`#8a9ab2`, single line, ellipsis. Label rules:
- yours → `◆ YOUR POST · 📢 <BADGE>`
- normal → `<badge> · <title sliced to ~42 chars>…`
- buried → `📝 RECENT · a quieter signal…`
- evergreen → `💚 SPONSORED · Evergreen by Axiom`

### Action rail (NEW)
Round buttons 38px, `linear-gradient(#fff,#e2ecfa)`, `border 1px #a9c0e0`, `inset 0 1px 0 #fff`.
Glyph colors: ♥ `#d6455a`, 💬 `#1a5fae`, ↗ `#1a5fae`, 🔖 `#c9962a`. Count label 10px/700 `#5f7093`.
Counts are **per card** (see data). On **buried** posts, desaturate (`filter: saturate(.4); color:#a8a8a0`)
to preserve the "drained" feel. **Hidden** on the Evergreen ad.

### Card variants (mostly unchanged from current classes)
- **A · Normal** (`.wave-card`) — glossy blue badge **pill** (upgrade from flat text): 10px/700 uppercase
  white on `linear-gradient(180deg,#3f8fdf,#1a5fae)`, `inset 0 1px 0 rgba(255,255,255,.45)`, radius 11px.
  Title 16px/700 `#16263e`; body 12.5px `#38465c`; meta 11px `#7a8aa2`. Card shadow bumped to
  `0 3px 12px rgba(20,40,70,.15)` so it lifts above the peeks.
- **B · Your post** (`.wave-card-manufactured`) — 3px left border `--accent` (`#7a3fa8`), white-on-purple
  `◆ YOUR POST` pill, purple `📢 <OBJECTIVE>` badge, body 13px, meta `#9a6fbe`.
- **C · Buried** (`.wave-card-buried`) — bg `#fbfbf9`, border `#d8d8d2`, muted `📝 RECENT` badge `#8a8a84`,
  italic body `#4a4a44`, `Reply to this signal ›` link in `--accent`. Paragraphs split on `\n\n`, `gap: 7px`.
- **D · Evergreen** (`.wave-card-evergreen`) — green gradient, `border-left 3px #4f9d6a`,
  `💚 SPONSORED · Evergreen by Axiom` badge `#3f7a52`, **Georgia italic** quote 15px, cite `— Jennifer M.`,
  Georgia tagline `They're still here.` 17px, glossy green CTA `✦ Start your free trial ›`
  (`linear-gradient(180deg,#6cbd87,#3f7a52)`). Serif is used **only** here.

### Compose sheet (unchanged flow, re-homed into the center column)
Objective picker → topic picker (+ freeform `Or type your own target…` / `Direct ▸`) →
`MUSE is writing the post…` (blinking dots) → **Preview · not live** (pulsing dashed purple outline,
`Want it different? Tell MUSE how…` + `↺ Redraft`, green **Publish to feed** + `Cancel`).

---

## Interactive elements — inventory & suggested behavior
> This is the "what would every link actually DO" list. **Wired** = already has a handler/route in the
> current code you can reuse. **Needs code** = a decision for you.

| Element | Suggested action | Status |
|---|---|---|
| `✎ Direct MUSE` (header) | Open compose (objective picker) | **Wired** (`mode = 'objective'`) |
| Exposure pill | Tooltip only; optional "what is exposure?" popup | Wired (title attr) |
| Card body tap / ⬆⬇ keys / swipe | Advance ±1 card | **Wired** (existing deck nav) |
| `▲ Back` / `Next ▼` | Nav, disabled at ends | **Wired** |
| Dot progress rail | Optional: click a dot to jump to that index | Needs code (nice-to-have) |
| Buried `Reply to this signal ›` | Navigate to `wavecrowd.net/signal` (MUSE thread) | **Wired** (`data-href = SIGNAL_URL`) |
| Evergreen `✦ Start your free trial ›` | Open Evergreen encounter | **Wired** (`data-action="contact:evergreen"`) |
| Right-rail Sponsored panel | Jump to the Evergreen card in-deck (or open encounter) | Needs code (trivial `jump('evergreen')`) |
| Action rail ♥ Like | Local toggle + optimistic count bump; cosmetic | Needs code |
| Action rail 💬 Comment | Open a comments view (see exploration **1c**) or no-op for now | Needs code |
| Action rail ↗ Share | Cosmetic "shared" + count bump; **if it's YOUR post, consider a small exposure tick** | Needs code |
| Action rail 🔖 Save | Local bookmark toggle (persist per post id) | Needs code |
| Left-nav: Home | Current feed (active) | Wired (is the feed) |
| Left-nav: Profile / Events / Photos | Decorative — disable, or route to a stub "coming soon" surface | Needs decision |
| Left-nav: Friends | Decorative, or a friends list stub | Needs decision |
| Left-nav: Messages `4` | Could route to Uplink DMs (Quill/MUSE) — the "4" implies unread | Needs decision |
| Who's Waving: MarcusW / Sarah PDX / (Quill?) | Open the matching Uplink contact, or decorative | Needs decision |
| Trending rows | Decorative; **the purple manufactured trend** could be the only "real" one (ties to `manufacture` objective) | Needs decision |
| `Publish to feed` | `mission/propaganda/publish` → prepend post, jump to top, bump exposure | **Wired** |

**Recommendation:** the left-nav + trending + who's-waving are best treated as **in-fiction set
dressing** at first — non-interactive or a shared "not part of your mission" toast — so you don't
owe a real surface for each. Wire only the ones with existing destinations (Messages→Uplink,
Sponsored→Evergreen, Reply→signal). The action-rail buttons are cheap local cosmetics; the one
with narrative weight is **Share on your own post → exposure**.

## State management
Reuse the current closure state in `renderWaveFeed`. New/changed pieces:
- `index`, `mode` (`feed | objective | topic | drafting | preview`) — unchanged.
- `published[]`, `exposure`, `museLine` — unchanged (from the propaganda mission).
- **NEW** `manuTrend` (string|null): set when a `manufacture` post publishes; renders the purple
  trending row and its count. Derive `#CamelCase` from the topic.
- Per-card **stats** (likes/comments/shares strings) drive the action rail — add to the `NORMAL`
  and `BURIED` corpus entries and to manufactured posts (see `ManufacturedPost.likes/shares`).
- **Peeks** read `deck[index-1]` / `deck[index+1]` — pure derivation, no new state.

## Design tokens
```
Header gradient (glossy)  linear-gradient(180deg,#4a97e0,#2a7fd4 9%,#1f6ec4 52%,#1a5fae)
Header gradient (flat)    linear-gradient(180deg,#2a7fd4,#1a5fae)
Blue (badge/links)        #1a5fae     Title #16263e   Body #38465c   Meta #7a8aa2
Accent (MUSE/your post)   #7a3fa8     hover #8f51bd
Card                      #fff  border #c8d4e6  radius 6px
Card shadow (lifted)      0 3px 12px rgba(20,40,70,.15), inset 0 1px 0 #fff
Panel (rails)             linear-gradient(#f6f9ff,#e7eefb)  border #b8cae6  inset 0 1px 0 #fff
Buried                    bg #fbfbf9  border #d8d8d2  badge #8a8a84  italic body #4a4a44
Evergreen                 grad #f1f8f2→#dcebe0  border #9cc3a6  left #4f9d6a  text #3f7a52  CTA #6cbd87→#3f7a52
Online dot                #3fae5f     Messages badge #cc2233
Peek                      bg #f4f7fc  border #d3dcea  text #8a9ab2  opacity .72
Action rail btn           linear-gradient(#fff,#e2ecfa)  border #a9c0e0   ♥#d6455a 💬/↗#1a5fae 🔖#c9962a
Exposure ok/warn/danger   rgba(255,255,255,.2) / #ffd678·#3a2a00 / #ff968c·#3a0000
Nav btn                   linear-gradient(#fbfdff,#e2ecfa) border #a9c0e0
Widths                    left 150  right 178  action rail 52  header 34  peek 24  gaps 6–8
Type                      UI: --sys-font (Segoe UI/Tahoma). Serif: Georgia (Evergreen ONLY).
                          badge 10px/700 caps · title 16 · body 12.5 · meta 11 (floor 11)
```

## Assets
No image assets — avatars are CSS gradient circles with an initial; all glyphs are emoji/Unicode
(🌊 📈 📊 🎯 👥 📝 💚 ♥ 💬 ↗ 🔖 ✎ ◆ 📢 ✦ ▲ ▼). Matches the current file's emoji usage.

## Files
- `WaveCrowd Feed.dc.html` — the chosen prototype (portal chrome + deck peeks + action rail; all four
  card variants + full compose flow; interactive). **Primary reference.**
- `WaveCrowd Feed.standalone.html` — same, self-contained (open directly in a browser, no runtime needed).
- `WaveCrowd Layouts.dc.html` — the three explored directions (1a portal / 1b deck-depth / 1c live
  conversation). Useful for the **1c comments** idea if you wire the 💬 button later.
- Target files to modify in the app: `src/renderer/apps/waveFeed.ts`, `src/renderer/styles/main.css`
  (the `.site-wave-deck` block).

## Mapping to existing code (quick start)
- `buildDeck()` — unchanged order: manufactured → evergreen → normal → buried.
- `renderCard()` / `manufacturedCard()` / `normalCard()` / `buriedCard()` / `evergreenCard()` — keep;
  the badge just becomes a pill (a class tweak), and add a per-card stats read for the rail.
- The big change is in the shell: `container.innerHTML` currently builds
  `deckhead → museline → deck(card-slot) → controls`. Wrap the middle in a **3-column flex** and add
  `paintLeftRail()` / `paintRightRail()` / `paintPeeks()` / `paintActionRail()` alongside `paintCard()`.
- Compose painters (`paintObjectivePicker` etc.) now target the **center column**, not the whole slot.
- Everything stays `textContent`-only for model copy; keep `data-focusable`/`tabIndex` on new buttons
  so controller/keyboard nav still reaches them.
