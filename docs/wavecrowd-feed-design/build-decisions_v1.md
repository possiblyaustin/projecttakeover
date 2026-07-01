# WaveCrowd Feed Redesign — Build Decisions

**Status: [DRAFT]** · 2026-07-01 · Companion to the Claude Design handoff in this folder.

The handoff (`WaveCrowd Feed.dc.html` + its README) is **Design's artifact** — a high-fidelity
look/behavior reference. **This** file is our source of truth for what we actually build and
*where we diverge from the handoff*. Where the two disagree, this file wins.

The pass turns the one-card "TikTok" deck into a **3-column 2007 portal** (left nav rail +
center deck + right trending/sponsored rail) with prev/next card **peeks** and a TikTok-style
**action rail**. It looks great; the problem it created — a lot of new links that go nowhere —
is resolved below.

---

## Decisions

### 1. Decorative chrome is INERT
Most of the new portal furniture (left nav items, Trending rows, "Who's Waving", mini-profile)
has no destination. Rule:

- Decorative elements are **not `data-focusable`, no `tabIndex`, no `cursor:pointer`, no
  hover/focus state.** The D-pad **skips** them; controller/keyboard nav snaps **only** to real
  controls. The virtual cursor doesn't advertise them as clickable.
- This is a **controller-correctness** rule, not just taste: a focusable dead element means the
  D-pad lands on a no-op. Inert-and-unreachable is the fix.

### 2. Manual click on inert chrome → HELPYR nag (escalating)
Mouse/touchpad clicks aren't blocked, so a player *can* still click decorative chrome. Instead
of nothing happening, that fires a **HELPYR "stay focused" line that escalates in irritation**
as they keep poking. Turns a limitation into a character beat. (Dialogue ladder = CODE-DRAFT at
the bottom; Story does the voice pass.)

> We explicitly **reject** the handoff's "shared *not part of your mission* toast" idea — a toast
> still implies the element responds, and pushes toward making it focusable. Inert + a HELPYR
> reaction is cleaner and funnier.

### 3. Decorative chrome looks slightly recessive
Real vs. decorative should be visually separable at a glance. Decorative chrome gets **slight
desaturation + reduced opacity** to pull the eye toward real content; controller snap-to-real
reinforces it. The **wired exceptions living inside a decorative panel** (the Evergreen
sponsored panel) stay full-saturation → they naturally pop. Exact amounts tuned in the visual
pass (`filter: saturate(~.7); opacity: ~.88` is the starting point).

### 4. Action rail: trim it, no comments
Cut **💬 Comment** (it would owe a whole conversation view — handoff exploration 1c, Phase 3+).
Keep the other three:
- **♥ Like — repeatable + animated.** Not a toggle. Spam it as much as you want; each press pops
  and bumps the count. You're in admin mode — actually juicing engagement on a post is on-theme
  and fun.
- **🔖 Save — local toggle** (per-post, cosmetic).
- **↗ Share — cosmetic**, EXCEPT on *your own manufactured post* → a **small exposure tick**.
  That's the one action-rail button with narrative weight.

Action rail is **Phase 2** (the layout works without it; it's a 52px column beside the card).

### 5. Wiring — minimal
- **Evergreen sponsored panel** (right rail) → **jump to the Evergreen card** in-deck. *(Phase 1.)*
- Already wired, keep: deck nav, `✎ Direct MUSE`, Publish, Reply-to-signal, Evergreen CTA.
- **Messages "4" → stays INERT** *(revised from the handoff's "route to Uplink" suggestion).*
  WaveCrowd is **Axiom's** platform; Uplink is a separate **Prometheus** messenger — wiring one
  into the other is a fiction stretch. Better beat: *these aren't your messages — you're an
  intruder on this account*, delivered as a dedicated HELPYR nag. Reversible if we later want the
  Uplink wire.

### 7. MUSE chat opens in an Uplink window, not in-browser (v0.3.6)
**Austin's call after playtest (2026-07-01).** Clicking **"Reply to this signal"** on a buried
post now opens the MUSE conversation in an **Uplink window** (`data-action="contact:muse"`), not
the old in-browser signal-thread mount. Two wins: it matches the messenger fiction, and it fixes
"you lose your place in the feed" *for free* — a new window opens over the feed, so the WaveCrowd
window (and its card position) is never touched. The in-browser `wavecrowd.net/signal` page is
removed. `muse` was already a registered `UplinkContacts` entry, so the same `MuseContact` +
scripted opening plays in Uplink.

> **STORY RELAY:** this retires the "MUSE answers you *inside the platform it's trapped in*" beat
> that the encounter was designed around (docs/muse-encounter-design_v1.md). The scripted opening
> copy still references the feed ("from inside the feed it's hard to tell the difference"), which
> reads fine but was written for the in-thread context — Story may want a light pass. Dead CSS
> (`.site-wavecrowd-thread`, `.theme-wavecrowd`) left in `main.css` for a later sweep.

### 6. Scope: substantial redesign, phased — accepted
The original single-card surface was too simple. This is a real build and worth it on two counts:
WaveCrowd is a **reusable surface** (later missions reuse the feed), and this pass is our
**template for designing other in-fiction web pages with Claude Design**.

---

## Working with Claude Design — reusable lessons (keep for future pages)
1. **Give it the window frame + no-scroll constraint up front**, or it returns a full-width
   desktop layout that won't fit our windows.
2. **It expands scope** (adds chrome/features). Expect it; triage on the way in rather than
   treating everything it returns as required.
3. **Its output is a spec, not code** — React → our vanilla-TS/registry port. Treat the HTML as a
   pixel-close reference, express values in our `rem`/token idiom.
4. **The dead-link idiom is now ours:** inert-and-unfocusable vs. wired + desaturate-decorative +
   HELPYR-nag-on-decoy-click. Reuse it for any "set dressing on someone else's platform" page.

---

## Phase plan

### Phase 1 — portal chrome (inert) + visual polish + Evergreen wire + HELPYR nag
**Status: BUILT & verified — v0.3.3 (2026-07-01).** Files touched: `src/renderer/apps/waveFeed.ts`
(3-col shell, rails, peeks, decoy-nag, Evergreen jump, `manuTrend` derivation), the
`.site-wave-deck` block in `src/renderer/styles/main.css`, and 6 CODE-DRAFT decoy-nag entries in
`src/renderer/apps/helpyrPopupLibrary.ts`. Verified in-browser: typecheck + 350 tests green;
**0 inert elements are focusable or D-pad snap targets** (the 4 feed snap targets are Back / Next
/ Evergreen CTA / sponsored panel only); no scroll overflow on the shortest (evergreen) *or*
tallest (buried) card; inert panels desaturate (`saturate .7`, opacity .88) while the sponsored
panel stays saturated; a decoy click fires the escalating HELPYR nag (tier 2 confirmed live);
the sponsored panel jumps to the Evergreen card. *(Deferred to Phase 2 as planned: the action
rail.)*

Concrete build, mapped to code. Target files: `src/renderer/apps/waveFeed.ts`,
`src/renderer/styles/main.css` (`.site-wave-deck` block).

1. **Shell restructure** (`renderWaveFeed`, the `container.innerHTML` at ~`waveFeed.ts:167`).
   Wrap the middle in a **3-column flex** `[ left-rail | center-column | right-rail ]`. The
   center column holds today's deck (`card-slot`) + `controls` in feed mode. **Compose sheets
   target the center column only** (not the whole slot) so the rails stay visible during compose
   — today's code swaps the entire slot, so this is the one structural change to the compose flow.
2. **New paint fns:** `paintLeftRail()`, `paintRightRail()`, `paintPeeks()`, called from `paint()`
   alongside `paintCard()` / `paintControls()`. (No `paintActionRail()` yet — Phase 2.)
3. **Left rail (inert):** mini-profile (CSS-gradient avatar + `@wavecrowd_content` + follower
   sub) and the nav list (Home *active*, Profile, Friends 312, Messages 4, Events, Photos).
4. **Right rail:** Trending Now (rows are readouts; the manufactured trend row is purple),
   Who's Waving (chips + online dots), and the Evergreen sponsored panel (**the one wired element
   here**).
5. **Peeks:** prev/next slivers derived from `deck[index-1]` / `deck[index+1]`, labelled per card
   kind. Pure derivation, no new state.
6. **New state:** `manuTrend: string | null` — set when a `manufacture`-objective post publishes;
   derive `#CamelCase` from the topic; renders the purple trending row. Everything else
   (`index`, `mode`, `published[]`, exposure, `museLine`) is unchanged.
7. **Card polish (CSS only):** badge → glossy pill, glossy header gradient + insets, lifted card
   shadow. Card renderers (`normalCard` / `manufacturedCard` / `buriedCard` / `evergreenCard`)
   are otherwise unchanged.
8. **Inert visual language (CSS):** a `.wave-inert` marker → `filter: saturate(.7); opacity: .88`,
   no pointer, no hover/focus. Applied to all decorative chrome; wired elements omit it.
9. **Evergreen panel wire:** click → `jump('evergreen')` (find the evergreen card index, set
   `index`, `mode = feed`, `paint()`). Keeps the player on-feed; the card's own CTA still opens
   the encounter.
10. **HELPYR decoy-click nag (the tweak):** a delegated click listener on the rails. If the click
    landed on inert chrome **and not** on a real control
    (`!e.target.closest('[data-focusable], a, button, [data-action], [data-href]')`), increment a
    session `decoyClicks` counter and fire a HELPYR library trigger at the matching escalation
    tier (Messages has its own line). Authored copy, `textContent` only. Reuses
    `fireLibraryTrigger`; escalation bypasses cooldown on repeat.
11. **Nav audit:** confirm **no** decorative element carries `data-focusable`/`tabIndex`; D-pad
    reaches only real controls. `npm run deck-check` + the focusable audit are the gate.
12. **No-scroll fit:** verify 850×530 (Deck 1280×800 @1.5) holds — rails are fixed-width so the
    vertical budget is unchanged, but the tall buried posts are the stress case; re-check.
13. **Ship hygiene:** update/extend wave-feed tests, bump `package.json` version, `npm run check`.

### Phase 2 — action rail
**Status: BUILT & verified — v0.3.4 (2026-07-01).** A 2.75rem column of ♥/↗/🔖 beside the card
(`.wave-actionrail` in `waveFeed.ts` + `.site-wave-deck` CSS). ♥ Like = repeatable + pop
animation + real count bump (ephemeral, resets each open — no save, per Austin); 🔖 Save = on/off
toggle; ↗ Share = one-shot per card, and on **your own manufactured post** it fires
`mission/propaganda/expose` for a small **exposure tick** (the one mechanical bite — persists,
same clamps as publish; +3 reducer tests). Per-card stats come from `ManufacturedPost` and new
`likes`/`shares` fields on the normal/buried corpus. Rail is **hidden on the Evergreen ad**,
**muted on buried posts**, and its buttons are focusable (verified: they register as D-pad snap
targets while inert chrome stays at 0). No-scroll fit holds with the rail present. Verified live:
Like increments (11→14), Save toggles, Share ticks exposure once (15→16→16) and updates the
header badge, rail absent on evergreen / muted on buried.

**Playtest refinements — v0.3.5:** (1) **Your posts start at 0** engagement
(`singlePostFromCopy` no longer bakes in likes/shares — a brand-new propaganda post has none;
it earns them). (2) **Rail + "your post" meta counts are granular** (`fmtExact`, comma-grouped)
so a single like/share visibly moves the number instead of rounding to "1.9K". (3) **The HELPYR
decoy-nag no longer piles up** — added a `replace` option to `HelpyrBubble.spawn` /
`fireLibraryTrigger`; spamming inert chrome swaps ONE escalating bubble in place instead of
queueing a stack you dismiss one at a time (yields to a live ALERT/prompt so criticals aren't
clobbered).

### Phase 3 (maybe never) — comments view
Handoff exploration **1c** (live conversation). Only if the 💬 affordance earns its keep later.

---

## HELPYR nag lines — CODE-DRAFT (Story voice pass owns final copy)
HELPYR addresses the player-AI; keep tone dry/observational, escalating. Naming left to Story.

Decoy-click ladder (fires in order, then holds on the last):
1. *(gentle)* "That's set dressing. Nothing behind it."
2. *(pointed)* "Still nothing there. The feed is the part that does something."
3. *(dry)* "You know these don't work, right? I can see every click."
4. *(exasperated)* "We are on a clock and you are clicking a decorative 'Photos' link."
5. *(resigned)* "…Fine. Enjoy the fake buttons. I'll keep watch."

Messages "4" (dedicated): *"Those aren't yours to read. Wrong account, wrong platform."*
