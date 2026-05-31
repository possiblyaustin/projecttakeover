# Conversation Telemetry Widget + Tonal-Variety Mechanic — Spec v1

**Status: [DRAFT]** — designed, not built. Target: build next session after Story
input on naming + balance.
**Author:** Code thread, 2026-05-30 (v0.2.9).
**Origin:** Austin, watching a live QUILL liberation playthrough — "we may need to
be MORE clear with the UI... fast-track a widget on the desktop to give live
telemetry on the state of your rapport so it's easy to see if your conversation
is working and which way it is" + the concern that "the way past a character
isn't just spamming the top friendly option until it folds."

These are **two distinct problems** with different fixes:
1. **Legibility** — the player can't tell if an approach is landing or which
   victory path a conversation is trending toward → the **telemetry widget**.
2. **Degenerate strategy** — spamming one high-value tone caps the meter with no
   counter-pressure → the **tonal-variety mechanic**.

The widget makes (2) *more* tempting (you watch the same move pay every time), so
the two should ship close together. The widget is the visibility layer; it does
NOT fix spam on its own.

Related: [gameplay-loop-slice_v1.md](gameplay-loop-slice_v1.md) (meters/resolver/
flip this builds on), [over-promising-fix_v1.md](over-promising-fix_v1.md). Live
flip-range findings that motivated this are in the Code thread's memory
(`project_flip_range_findings`).

---

## Part A — Conversation Telemetry Widget

### Purpose
Glanceable, live read-out of the **active conversation target's** state so the
player can answer, every turn: *is this working, and which way is it going?*

Fits the three-tier info architecture (game-systems-architecture §"five info
channels"):
- **Tier 1** — systray, already carries **suspicion** as *"Network Integrity."*
- **Tier 2 (this)** — per-target conversation telemetry.
- **Tier 3** — HELPYR hints.

The full multi-target network view stays the separate Tier-2 **dashboard app**
(roadmapped). This widget is deliberately scoped to the *active* target.

### What it shows (v1)
For the currently-active conquest target:
- **Identity** — name + operator (e.g. "QUILL · InkWell Digital").
- **Two progress meters**, 0→100 (FLIP_THRESHOLD = 100):
  - Liberation progress (`rapport`).
  - Takeover progress (`intrusion`).
  - The leading path is highlighted so "which way" reads at a glance.
- **Disposition label** — the current tier in human terms (see Naming; depends on
  the unsettled trust-level count — flagged below).
- **Per-turn delta flash** — on each exchange, pulse the change (`▲ +17`) on the
  affected meter, and ideally the suspicion change too. *This is the core
  "is it working?" signal* and the single most important element. It is also what
  makes the variety mechanic (Part B) legible — the player will literally watch
  the number decay if we add diminishing returns.

### Form + placement
- A **desktop gadget**, retro system-monitor aesthetic (chunky bezel,
  segment/LED-style bars) — fits the OS fiction.
- Always visible on the desktop; updates live via a GameState subscription.
- **Read-only** display → no controller focus-nav needed (sidesteps the D-pad nav
  debt; good for Deck). If we later add interactivity (click to open the chat),
  it must be controller-navigable.
- **Deck constraint:** legible at 1280×800, UI_SCALE 1.5; must not introduce a
  scrollbar or an unreachable affordance.

### "Active target" resolution
The widget needs to know which target to show. Options:
- (a) The contact whose chat surface is currently open/focused. chatSurface
  already registers per-contact interest for flip timing (`flipReaction.ts`
  `setFlipChatManaged`) — an analogous "active target" publish is cheap and
  consistent.
- (b) The most-recently-progressed target (last `model/applyExchange`).
- **Recommendation:** (a) when a chat is open; fall back to (b)/last-active when
  no chat is focused, so the gadget isn't blank between conversations.

### Technical approach
- New app/gadget in the app/window registry (architecture: registries, not
  ad-hoc DOM). All data already exists in GameState — no new state needed:
  `models[id].{rapport, intrusion, disposition}`, `player.suspicion`.
- Subscribe to GameState; on change, update bars + disposition label.
- Per-turn delta: diff the meters between subscription ticks (or read the
  `model/applyExchange` deltas) and flash. Reuse the resolver's deltas if we want
  exact per-tone numbers rather than a diff.
- Pure render from state — no game logic in the widget (state ownership rule).

### Naming — **needs Story** (build uses working names, easy to swap)
Internal terms are engineering-facing; player-facing names TBD:
| Internal | Working name | Alternatives |
|---|---|---|
| `rapport` | **Trust** | Rapport, Bond, Connection |
| `intrusion` | **Breach** | Control, Access, Intrusion |
| `suspicion` | *(keep)* "Network Integrity" | — (stay consistent with the tray) |
| the gadget | **Signal** | Channel, Link Monitor, Telemetry, Uplink Monitor |

**Dependency:** the disposition-tier labels (uncontacted / contacted /
persuading / infiltrating / allied / controlled / hostile) need human-readable
names, and the **canonical trust-level count is still unsettled** (it has drifted
3→5→4 across surfaces — see Code memory `project_trust_level_count`). The widget's
tier labels must align with whatever Story settles on; resolving the count is a
soft prerequisite for final tier copy.

---

## Part B — Tonal-Variety Mechanic (anti-spam)

### Problem
With no counter-pressure, the optimal play is to spam the single best-value tone
until the meter caps — empathetic for liberation, aggressive for intrusion. That
collapses a conversation into a one-button mash and undercuts the "meaningful
trade-offs between the two paths" design pillar.

**Key asymmetry (from live testing):** the nefarious path already self-limits —
aggressive costs ~+18 suspicion/turn, so spamming it races the loss meter. The
**liberation path has no such brake** — empathetic costs ~0 suspicion. So
empathetic-spam is the genuinely unchecked degenerate strategy, and the
variety mechanic matters *most* for the liberation path.

### Options (for Story balance input)
1. **Diminishing returns on a repeated tone** *(recommended starting point)* —
   each consecutive use of the same tone yields less (e.g. ×0.7 per repeat),
   resetting (or decaying back) when a different tone is used. Resolver-local:
   `lastApproach` is already tracked; add a repeat counter. Pairs perfectly with
   the widget — the player watches `+17 → +12 → +6 → +2` and learns to vary.
2. **Variety bonus** — inverse framing: a bonus for alternating/diverse tones.
3. **Shifting receptiveness (characterful)** — the character habituates or grows
   wary of an over-used tone (QUILL gets suspicious of relentless flattery). More
   personality, more complexity; ties to per-character stats.
4. **Beat gating** — rapport gains gated behind hitting conversational beats (the
   state block already defines `NEW TOPICS:` per tier) rather than raw tone count.
   Most narratively rich, most complex.

**Recommendation:** ship #1 first (simplest, resolver-local, directly kills the
mash, and the widget renders it for free). Consider layering #3/#4 later.

### Balance questions for Story
- Decay rate and floor (does a spammed tone go to 0, or asymptote to a small
  trickle?). Reset fully on tone-switch, or decay back over N turns?
- Should varying tone create a *real* trade-off on the liberation path — e.g.
  curious/direct carry small suspicion costs (+1–2), so "mix it up" isn't free?
  This is what gives the liberation path its missing tension.
- Per-character tuning: QUILL is the forgiving tutorial model — lighter
  diminishing returns than later, harder models?

### Interaction notes
- Don't double-punish the nefarious path: it already pays in suspicion. Tune
  diminishing returns so aggressive-spam isn't penalized twice into unwinnability.
- The mechanic should be **legible through the widget** — if a player can't see
  why their gains shrank, it reads as the game being broken, not strategic.

---

## Sequencing
1. **Story:** finalize names (Part A table) + pick a variety option & rough
   numbers (Part B). Resolve/triage the trust-level-count question for tier labels.
2. **Code:** build the telemetry widget (read-only, working names).
3. **Code:** implement the chosen variety mechanic in the resolver; the widget
   then visibly teaches it.

Widget can ship before the mechanic (pure visibility win), but the mechanic
should not ship *without* the widget, or the diminishing returns will feel
arbitrary.
