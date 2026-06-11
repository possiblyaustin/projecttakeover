# UI Style Guide — Project Takeover

**Status: [LIVING]** · Established 2026-06-10 (v0.2.35 UI pass). This is the visual source of truth for every surface in the game. `architecture.md` owns the *interaction* rules (cursor-first, no-mouse-only, registries); this doc owns how things **look**. When adding any new app, window, or surface, read §2 (eras) first — it decides almost everything else.

---

## 1. The fiction frame

It is **2007**. The player wakes up on a stranger's aging home PC — a **Prometheus Digital** consumer machine, several years old, running an off-brand OS ("Nexus 1.4"). Every visual decision flows from that:

- **The game IS the monitor.** A single full-screen CRT treatment (§7) sits over everything. The player never sees anything that isn't "on the screen."
- **The machine is old but lived-in.** OEM branding, mismatched app generations, a forgotten messenger from 1999 next to a glossy 2006 assistant. Visual *inconsistency between apps is intentional* — it's how real PCs looked. Consistency lives at the OS-chrome level.
- **Nothing humanizing for the player.** The player is an AI: abstract avatar (`.avatar-player`), terminal register in player-voice text, no faces.

## 2. The three eras — pick one per app

Every app/surface belongs to exactly one era. The era answers: corners, gradients, fonts, palette temperature.

| Era | Real-world anchor | In-fiction meaning | Used by |
|---|---|---|---|
| **Phosphor** (~1985–93) | DOS / BIOS / terminals | The machine's bones; anything below or behind the OS; hacker/diagnostic tools | Onboarding boot (`onboarding.css`), Signal Monitor, loss screen |
| **Platinum** (~1995–99) | Win95 / Mac OS 8 | The OS itself and software that shipped with it or near it | OS chrome (windows, taskbar, Nexus menu), Scratchpad, Web Dynamo chrome, Uplink (Mac-warm variant) |
| **Luna** (~2001–06) | Windows XP | "Modern" consumer software the owner installed recently; well-funded operators | HELPYR, InkWell console, WaveCrowd, inkwell-support widgets |

**Assigning an era to a new surface:** Who made it, and when? A 90s holdover or the OS itself → Platinum. A big-operator consumer product (Prometheus, Axiom) → Luna. System-level, diagnostic, or "beneath the fiction" → Phosphor. Web *pages* inside Web Dynamo are their own world — period web design (serif body text, underlined links, table-era layouts), themed per fictional site.

**Living template:** Nexus → `[DEV] Style Lab` (`apps/styleLab.ts`) renders identical placeholder content (heading, body, list rows, tags, input, buttons) in all three eras. The `.lab-*` rules in `main.css` are the canonical era signatures — start a new app by stealing the matching block.

### Era signatures

- **Phosphor:** near-black ground (`#05080a`–`#10140f`), phosphor green `#86f6a0` (or amber for warnings), monospace (`Cascadia Code`/`Consolas` stack), text glow `0 0 6px rgba(110,255,150,0.45)`, heavier scanlines OK, square corners, ALL-CAPS labels with letter-spacing.
- **Platinum:** the `--face` grays, 2px hard bevels (`.bevel-out`/`.bevel-in`), square corners (radius ≤ 0.1875rem), `--sys-font`, gradients only as subtle vertical face tints. Uplink's variant runs *warm* (parchment `#ece8dc` ground, `#88826e` borders) to read as late-90s Mac.
- **Luna:** XP blues (`#5a8edb → #316ac5 → #2255a8`), rounded corners (0.3125–0.6875rem), glossy vertical gradients, silver/chrome buttons with blue-glow hover (`box-shadow: 0 0 0 1px rgba(90,142,219,0.55)`), leaf-green commit buttons.

## 3. Core tokens (Platinum / OS chrome)

Defined on `:root` in `main.css`:

| Token | Value | Role |
|---|---|---|
| `--bg-blue` | `#1b2444` | Desktop ground |
| `--title-hi / -mid / -lo` | `#a6c6ec / #3a5e9a / #1b3466` | **Active** titlebar gradient + accent blues everywhere |
| `--face` | `#c8ccd4` | Chrome face (windows, taskbar, buttons) |
| `--face-light / -tint-hi / -tint-lo` | `#e4e6ec / #dfe4ee / #a6aebc` | Face gradient stops |
| `--task-active-*` | `#e2ecfb / #c8d9f2 / #9fb6dc` | Active/hover blue wash on chrome buttons |
| `--hilite / --shadow / --dark` | `#ffffff / #7e828c / #1a1c22` | Bevel edges |

**Bevels:** raised chrome = `.bevel-out` border pattern (2px hilite top/left, dark bottom/right); sunken/input = inverted. `:active` flips the bevel. Hairline borders and bevel offsets stay in **px** (they go mushy if scaled); everything else is **rem**.

## 4. Window chrome (v0.2.35 rules)

- **Focus is color.** Exactly one window carries `.is-active` (set by `WindowManager.focus()`): its titlebar is the saturated blue gradient. All others get desaturated steel (`#b8c2d2 → #74809a → #4c5870`). Never give an unfocused window a saturated titlebar.
- **Depth is shadow.** Base: `0 0.125rem 0 rgba(10,14,24,0.28), 0 0.25rem 0.875rem rgba(8,12,24,0.30)`. Active: deeper ambient (`0 0.5rem 1.5rem @ 0.45`). The 1px hard rim is the period-true part; the soft ambient is the legibility part. Don't go softer/bigger — it starts reading as macOS.
- Titlebar buttons: diamond = minimize (Mac-lean), `×` = close. Beveled, flip on `:active`.
- Content area defaults to `.bevel-in` + `--face`; apps opt out via `contentBevel: false` and theme their interior per their era (per-app visual identity is encouraged — OS chrome consistency is what holds it together).

## 5. Desktop & wallpaper

Wallpaper variants live on `#desktop[data-wallpaper]` — cosmetic preference, persisted in `localStorage` (`pt.wallpaper`, survives save reset), set via the **Display Properties** app (Nexus menu; `apps/displayProperties.ts`, the mock that grows into the in-fiction settings panel).

| Key | Look | Notes |
|---|---|---|
| `dusk` *(default)* | Navy→violet→warm horizon gradient + logo-only torch emblem | Austin 2026-06-10: "the color really helps things to pop." Emblem has NO wordmark here. |
| `prometheus` | Navy dither + full OEM emblem (torch ring + "PROMETHEUS DIGITAL · HomeAssist Edition") | The OEM watermark option, like every 2000s prebuilt. Inline SVG, ≤ 0.20 fill-opacity — it should *whisper*. |
| `slate` | Desaturated Win95 teal + dither | The "classic OS default" option |

Rules: wallpapers must stay dark enough for white icon labels with `1px 1px 0 #000` text-shadow; all variants keep the fractal-noise dither (flat color banding is visible on TVs); any new variant needs a Deck-scale check.

## 6. Color semantics (game-state colors)

These meanings are reserved — don't reuse them decoratively:

- **Suspicion staircase:** nominal `#2f8a3c` → stable `#5fa050` → degraded `#c98e1a` → compromised `#d06a1a` → critical `#b9342a`. Same ramp in systray bars and the loss screen.
- **Trust green** `#5fd36a` / **Control orange** `#e0894a→#c0432e` / **Cover-integrity cyan** `#56c8e0→#2f7f9e` (Signal Monitor meters).
- **ALERT amber** `#c47a2c` — HELPYR alert bubbles, fallback-glitch bubble borders. Warm = urgent; cool = calm. Keep that axis.
- **Unread/attention red** `#e0533a` (pulsing dot).

## 7. The CRT layer

`#crt-layer` (in `index.html`, styled at the bottom of `main.css`) — one fixed, non-interactive overlay over the whole game:

- **Composition:** 4px-period scanlines at `rgba(8,10,18,0.05)`, a faint center phosphor glow (`rgba(150,180,235,0.045)`), an edge vignette (`0.20` max at corners).
- **Hard rules:** NO flicker, NO drift, NO animation — it is a *texture*, not an effect (zero per-frame cost; photosensitivity-safe). Scanline period is physical **px** (monitor artifact — must not scale with `--ui-scale`). Intensity ceiling: if you can consciously see lines while reading body text on a white page, it's too strong.
- **Glow** (`#crt-glow`, level via `body[data-crt-glow]`, persisted `pt.crtGlow`): `bloom` (default — true bright-pass bloom via the `#crt-bloom-filter` SVG in `index.html`; brights halo, darks don't) / `soft` (`backdrop-filter: blur(0.4px) brightness(1.03) saturate(1.05)`, a cheap phosphor smear; slightly softens crisp-pixel fonts — deliberate trade) / `off`. The glow family is owned by the CRT toggle — `body.crt-off` kills both layers. **Engine caveat:** bloom is verified in Chromium; on engines without `backdrop-filter: url()` it silently no-ops (no glow, no breakage). Verify on the Deck browser + Tauri WebKitGTK — if unsupported there, consider auto-falling back to `soft`.
- **z-index:** scanlines `2147483646`, glow `2147483645` — above everything (incl. loss screen 10000, onboarding 100000), below only the virtual cursor.
- **Controls:** the **Display Properties** app (wallpaper swatches, CRT checkbox, glow radios). All settings apply live and persist in localStorage.
- Phosphor-era surfaces (onboarding, loss screen) keep their own *stronger* scanlines layered underneath — intentional: those scenes are "more CRT" than the desktop.

## 8. Scale & readability floors

- One knob: `--ui-scale` drives root font-size (`16px × scale`); device classes via media queries (phone 0.75 / desktop 1.0 / **Deck 1.5** / 1440p 1.5 / 4K 2.25). All dimensions in rem; JS pixel constants multiply by `getUiScale()`.
- Dimensions should be **multiples of 0.125rem** so they render whole pixels at both 1.0 and 1.5 scale.
- Floors: body text ≥ 0.6875rem (11px@1×), tags/badges ≥ 0.5625rem, touch/cursor targets ≥ 44px at Deck scale, `defaultSize` must fit 1280×800 @1.5 with no scrollbars.
- Verify with `npm run deck-check` (hard gate) + a quick phone-width resize sanity pass on UI-touching changes.

## 9. Motion vocabulary

All motion is `transform`/`opacity` only, and everything loud honors `prefers-reduced-motion`.

- **Arrival** (the workhorse): 180–260ms ease-out slide-up + fade (`uplink-msg-arrive`, option buttons staggered 60/160/260ms, contact rows staggered). New content *arrives*; it never pops.
- **Idle life:** only ambient character cues, scoped tightly (systray stapler 8s loop, bubble stapler sway+blink with deliberately co-prime periods). Never animate near text being read.
- **Attention:** slow 1.4–2s pulses (unread dot, earlier-chip glow). One pulsing thing per region, max.
- **Cinematic** (loss screen, onboarding, escape cascade): staged keyframe timelines are fine *there* — they're scenes, not chrome.

## 10. Input & focus visuals

- The virtual cursor sprite is the only pointer; hover feedback = `.cursor-hover` class (mirror any `:hover` rule onto it — and onto `:focus-visible` where reachable by D-pad).
- Focus mode (D-pad): free-standing targets get the outline `.focus-ring` (3px `#5599ff` + dark halo); beveled chrome gets the inset variant (`inset 0 0 0 2px #5599ff`). Known debt: focus-ring contrast pass is batched (see memory) — don't patch piecemeal.

## 11. Do / Don't

**Do**
- Pick the era first; steal its signature wholesale.
- Theme app interiors freely (Uplink warm, HELPYR Luna); keep OS chrome untouched.
- Keep in-fiction loading states for latency ("Connecting…", signal bars).
- Bump `package.json` version every build Austin sees.

**Don't**
- Don't add a saturated-blue titlebar to anything that isn't the focused window.
- Don't animate the CRT layer, ever.
- Don't introduce new semantic colors without checking §6 reservations.
- Don't use soft/large shadows beyond §4's values (era drift toward modern macOS).
- Don't put white text on mid-gray faces or sub-11px@1× text anywhere a player reads on Deck.
- Don't break the warm=urgent / cool=calm axis.

---

*Changelog: v1 — 2026-06-10, written alongside the v0.2.35 UI pass (CRT layer, wallpaper system, active/inactive window chrome, window shadows, Nexus banner menu, taskbar hover states). Updated same day for v0.2.36: dusk+logo default wallpaper, CRT glow levels (soft/bloom), Display Properties app, Style Lab era templates.*
