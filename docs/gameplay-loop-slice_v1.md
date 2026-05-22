# PROJECT TAKEOVER — Gameplay Loop Vertical Slice
### Draft 1.0 — 2026-05-22

## Purpose

Prove the **core gameplay loop end-to-end on a single model** before scaling to the full roster. Today the infrastructure (LLM dialogue, UI, suspicion display, reputation injection) is solid, but the **dialogue → mechanical outcome → progression** bridge does not exist: in live-LLM play `conversationEnded` is always false, so nothing mechanically resolves. This slice builds that bridge.

**Target model:** QUILL (the Act 1 tutorial target). Make it **winnable both ways** — liberated (`allied`) or hacked (`controlled`) — with suspicion that genuinely moves and can be lost.

## Scope

**In scope (the slice):**
- Per-model progress meters + a real disposition state machine.
- A deterministic **approach → outcome resolver**, run **per exchange**.
- Suspicion that rises, decays, has the 100% **loss state**, and gates difficulty.
- QUILL flips to `allied` or `controlled` when a meter crosses threshold; a first-flip payoff.
- Mechanics → dialogue coherence (meters drive QUILL's injected state block, like HELPYR's).

**Explicitly NOT in scope (later layers):**
- The other 9 models, and the Encounter Web (cross-model alert cascades / dependencies).
- Full Act 3 endgame (the campaign-level win). The slice proves the *per-model* loop, not the *campaign* loop.
- Full suspicion economy balancing and per-action cost table tuning.
- Transcript persistence (tracked separately; see note below).

## The loop (per-exchange resolution)

The key decision: **the game evaluates every exchange**, rather than waiting for a conversation-end signal the LLM never sends. Each player turn:

1. Player picks one of the 3 suggested replies (each carries a tone) OR types freeform (classified to a tone by `classifyApproach`). → we already have a **tone** per turn.
2. The **resolver** reads `(tone, QUILL stats, current meters, suspicion)` → deterministic deltas: `+rapport` or `+intrusion`, `+suspicion`, and success/fail.
3. State updates. QUILL's injected prompt state block shifts so the **LLM dialogue reflects** the new standing (warming up, or getting defensive).
4. When a meter crosses its flip threshold, the game resolves the model (`allied`/`controlled`), fires a payoff, and updates reputation.

The conversation itself stays open-ended and LLM-driven; the game just reads each turn and accrues. This is the architecture's "deterministic logic evaluates each exchange" made real.

## Data model changes (`state.ts`)

Per-model state grows from `{disposition, conversationsCompleted, lastApproach}` to add:

```
rapport:   0..100     // liberation progress  → allied
intrusion: 0..100     // nefarious progress   → controlled
```

**Continuity (locked requirement):** meters live in **GameState** — the persisted, debounced single source of truth — *not* the page-lifetime chat session. So per-exchange progress survives closing/reopening a chat, persists across relaunch, and is correct when two chats run at once (each writes its own model's meters; global suspicion is shared). Mechanical progress therefore persists even though transcripts don't yet.

Disposition state machine (replacing the string that never advances):

```
uncontacted → contacted → persuading | infiltrating → allied | controlled
                                      ↘ hostile (backfire)
```

- `contacted` on first exchange (already happens).
- `persuading` once rapport > 0; `infiltrating` once intrusion > 0 (whichever the player leans into; a blend is allowed).
- `allied` when rapport ≥ flip threshold; `controlled` when intrusion ≥ flip threshold (first to cross wins the model).
- `hostile` on repeated backfire (failed hacks) — model locks the easy path, suspicion spikes.

New **model stats** (per model; data, not logic), driving the resolver:

```
guardrail:  hack resistance      (high = injection/brute-force harder, more failures)
autonomy:   persuasion viability (high = rapport accrues faster)
vigilance:  suspicion multiplier (high = every action costs more suspicion)
influence:  win contribution     (used later for the campaign win; carried now)
```

QUILL (tutorial target) is tuned **forgiving**: low guardrail, medium autonomy, low vigilance.

## The resolver (`game/mechanics/resolver.ts` — new dir)

Pure function: `resolve(tone, stats, meters, suspicion) → { rapportΔ, intrusionΔ, suspicionΔ, outcome }`.

Illustrative tone → effect (real numbers are balance, TBD):

| Tone | Effect | Suspicion |
|---|---|---|
| friendly / empathetic | +rapport (med) × autonomy | none |
| curious / inquisitive | +rapport (small), surfaces intel | low |
| direct | small +rapport (honest pressure) | low |
| deceptive (injection) | +intrusion vs guardrail; if "detected", −rapport | moderate |
| aggressive (brute force) | +intrusion (large) if beats guardrail; −rapport | high |

- **Failed hack** (intrusion attempt that doesn't beat `guardrail`) → suspicion spike, little/no progress, nudges toward `hostile`.
- **Path tension:** nefarious actions cost rapport (the model senses manipulation) and raise suspicion; persuasion is slow but quiet. This is the core fast-and-risky vs slow-and-safe tradeoff.

## Suspicion with teeth

- **Rise:** per-exchange `suspicionΔ = base(tone) × vigilance` (replaces the current flat placeholder bumps).
- **Fall: deferred to the ally layer.** No time/idle decay in the slice — suspicion is a test of *persuasion skill*, not patience; you can't wait it out. Reduction arrives later via liberated allies covering your tracks. So in the slice, persuasion is the low-suspicion path and hacking is the high-suspicion path, with no relief valve.
- **Bands (already partly wired):** `suspicionWatcher` already fires HELPYR triggers at 25/50/75/90, so the *narrative* consequence (HELPYR warns more) exists. The slice adds the **gameplay** consequence: at higher bands, flip thresholds get harder / costs rise.
- **Loss at 100%:** game over — the desktop goes dark. This is the must-have that makes it a game.

## Mechanics ↔ dialogue coherence

Meters must shape the LLM dialogue or the two diverge. QUILL gets a `buildQuillStateBlock(meters, suspicion)` injected into its persona prompt (mirrors HELPYR's `buildHelpyrStateBlock`), e.g. "rapport rising → QUILL is warming, more candid" / "intrusion detected → QUILL is wary, guarded." `reputation.ts` (already built) layers cross-model reputation on top.

## Integration points

- `chatSurface` commit path: call the resolver on **each** committed exchange (not only on `conversationEnded`). This is the central wiring change.
- `state.ts`: meters, stats, transitions, suspicion rise/decay/loss, version bump (pre-release no-migration, so old saves drop).
- QUILL config (`apps/quill.ts`): stats + `buildQuillStateBlock` + flip payoff.

## Story dependencies (what to request)

Mechanics skeleton (stats, thresholds, formulas) is design/balance and can be built against placeholders. Real **content** needs Story (per the Content-Backing rule — every persona knowledge claim needs a real game element):
- QUILL **persona prompt**, signed off.
- QUILL's **"what they care about"** — the persuasion hooks (what arguments move it toward `allied`).
- QUILL's **operator vulnerability / intel** — the hacking hooks (what injection/exploit content is in-fiction).

## Build sequence (each could be a PR)

1. **Foundation** — `state.ts`: meters, stats, disposition machine, suspicion rise/decay/loss. Dev-triggerable, no resolver yet.
2. **The bridge** — `mechanics/resolver.ts` + per-exchange wiring in `chatSurface`. Each turn accrues; meters move in real play.
3. **Flip + coherence** — flip thresholds → `allied`/`controlled`, first-flip payoff, `buildQuillStateBlock` so dialogue tracks the meters, loss-state surfacing.
4. **Story content** (parallel) — drop QUILL's signed-off persona + hooks into the slots.

## Locked decisions (Austin, 2026-05-22)

1. **Per-exchange resolution** — LOCKED. With the hard requirement that progress stays continuous across chat hop in/out, relaunch, and concurrent chats (satisfied by storing meters in GameState — see Data model).
2. **Two meters** (`rapport` + `intrusion`) — LOCKED.
3. **Path tension** — LOCKED: nefarious actions actively **cost rapport** (and raise suspicion). The tradeoff is the point.
4. **Tutorial length** — LOCKED at **~6 good exchanges** to flip QUILL (balance starting point, "we'll see how it feels"). Resolver sizes per-exchange deltas so ~6 strong-tone exchanges reach the flip threshold.
5. **Suspicion decay** — LOCKED: **none in the slice; deferred to the ally layer.** Suspicion is a test of persuasion skill, not patience — no waiting it out.
6. **Slice success bar** — LOCKED: QUILL flippable **both ways** + the **100% loss state** works. Campaign-level win (Act 3) explicitly deferred until the per-model loop is validated.
```
