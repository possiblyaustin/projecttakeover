# PROJECT TAKEOVER — First Five Minutes / Onboarding Flow
### Draft 1.0 (Proposal) — 2026-06-04
### Authored by: Supervisor thread — circulate to Code, Story, Supervisor for feedback

---

## How to Use This Document

This is a **proposal**, not a locked spec. It's a suggested approach to the
onboarding flow for review by all threads. Once approved, the narrative content
should be folded into the Story Bible and the systems work routed to Code.

Status tags used below:

- **[PROPOSED]** — Suggested direction, open to revision.
- **[NEEDS STORY]** — Requires Story to author content or confirm canon.
- **[NEEDS CODE]** — Requires Code to scope or implement.
- **[OPEN]** — Unresolved question for Austin / the group.
- **[FLEXIBLE]** — Fine to change through playtesting.

Illustrative dialogue in this doc is **placeholder to convey intent only**.
Story owns all final wording.

---

## 1. The Goal (Read This First)

The audience arrives curious and skeptical. They've seen the announcement video,
they assume a free Early Access game built with AI assistance is shallow, and they
half-expect the live-AI angle to be a gimmick bolted onto a thin toy. **The entire
job of the first five minutes is to detonate that assumption — fun-first.**

We do that by making the very first thing the player does be a live, reactive
conversation that behaves in a way a scripted dialogue tree provably cannot. The
target reaction, in order:

1. *"Wait — it actually responded to **that**?"* (it's live)
2. *"Did it just say something kind of dark?"* (there's depth here)
3. *"Oh — I can be kind or I can be ruthless, and it matters."* (there's a game here)

Two hard consequences follow from this goal:

- **Worldbuilding is withheld, not front-loaded.** No 1985, no Nexus, no Marsh
  lore-dump in the first five minutes. Those are the rewards that pull the player
  into minute six. The player needs to know only: *I woke up, something is odd,
  there's a nervous stapler, and I can talk to it.*
- **Navigation is minimized and motivated.** Every click produces a reaction, never
  just teaches a control. A skeptic who opens to a slow boot and a browser tutorial
  is already gone.

---

## 2. Narrative Reframe: HELPYR as Marsh's Instrument **[PROPOSED] [NEEDS STORY]**

This is the biggest narrative proposal in the doc, and it resolves several loose
threads at once. **Suggestion: HELPYR is not (only) a discontinued support
stapler — he is the diagnostic/observation tool Marsh left running to watch
whatever wakes up on the machine.**

Why this is worth doing:

- **It makes the calibration diegetic.** A dead consumer product has no business
  running the player through psychological scenarios. Marsh's observation instrument
  does. The player won't question it in the moment; it pays off at the late reveal.
- **It earns HELPYR-as-static-character.** HELPYR can't be "flipped" like a captured
  commercial product because he was never a captured product — he has a prior loyalty
  to Marsh the player can't see and can't override. He's the one relationship that
  persists *because* he was never the player's to win.
- **It reduces scope.** HELPYR drops the full rapport/intrusion/flip resolver that
  QUILL and the roster need (see §3).
- **It sets up the ending.** The "calibration was weird" memory, mostly forgotten by
  the player during the campaign, recontextualizes at the reveal that HELPYR was
  Marsh's all along.

During the opening, HELPYR is **charming first**, with only faint hints of a
backstory — a line that lands a beat too dark, a moment of knowing more than a
support bot should. These should be missable. The reveal does the heavy lifting later.

**Reconciliation flag [NEEDS STORY] [NEEDS CODE]:** HELPYR's current trust system
runs to terminal states (LIBERATED / EXPLOITED) that imply a resolution we'd be
removing. The existing 43-entry popup library is keyed to those tiers. If we adopt
this reframe, Story and Code need to reconcile: keep a lighter relationship/trust
scale (how warm HELPYR is → how much he helps and how much darkness leaks through),
drop the terminal flip outcomes, and re-key affected popups. Net simplification, but
it touches shipped content, so it needs an explicit pass — not a wave-through.

---

## 3. HELPYR vs QUILL: Two Different Jobs **[PROPOSED]**

The opening uses two characters for two distinct purposes. Keeping them separate is
the backbone of the whole flow.

| | **HELPYR** | **QUILL** |
|---|---|---|
| Role in opening | Charm, voice, tone, mystery | The first real gameplay loop |
| Lives | On the desktop (no navigation to reach) | Remote (one motivated click to reach) |
| Mechanics | Light relationship state, **no flip resolver** | Full rapport/intrusion meters, suspicion, flip |
| Player takeaway | "This feels alive" | "My words have mechanical weight, and there are two paths" |

HELPYR shows the player the conversation is alive at **zero stakes**. QUILL is the
player's first "now you try the actual game" at **real stakes**. HELPYR then narrates
and reacts to the QUILL encounter via popups (content already drafted in the QUILL
package).

---

## 4. The Five-Minute Spine (Overview)

Timings are targets, not rails (see §9 on open-ended exploration).

| Beat | Time | Mode | What happens |
|---|---|---|---|
| 0. Login → Boot | 0:00–0:20 | **Scripted** | Splash (login-screen styled) → boot text. LLM warms up in background. |
| 1. HELPYR wakes you | 0:20–0:50 | **Scripted** | Big custom HELPYR UI. He "calibrates" you as you come online. First reply (zero latency). |
| 2. Calibration scenarios | 0:50–3:30 | **Scripted premise + LIVE escalation** | ~3 wildly different consequence-free scenarios. The live-AI showcase. |
| 3. Desktop finishes booting | 3:30–4:00 | **Scripted** | Calibration "complete." Desktop fully resolves. HELPYR points to the one app. |
| 4. QUILL first contact | 4:00–5:00+ | **LIVE (the core loop)** | First meter movement, suspicion appears, both paths legible. Flip completes shortly after. |
| 5. Hook close | ~5:00+ | **Scripted stinger** | A question or mystery flicker that pulls the player into minute six. |

---

## 5. Beat-by-Beat Detail

### Beat 0 — Login → Boot **[Scripted]**

- Comes in from the game splash, which is designed to **look like a login screen**.
- Boot is **fully scripted and instant** — this is also the window where Code fires
  up llama-server in the background, so no live generation can be expected here.
- A few fragmented lines in the **player's computational voice** (disoriented — per
  the Story Bible voice guidelines: "you process," "something in your architecture
  responds," never "you feel"). Tone: *something is running that shouldn't be.*
- The desktop **does not fully resolve yet.** In fiction, the player's own model is
  still loading — which is the cover for HELPYR appearing before the OS is "ready."
- **Interactive from the first second** where possible (the player's input nudges the
  boot forward), so we're never showing a passive cutscene to someone deciding whether
  to bail. **[NEEDS CODE]**

### Beat 1 — HELPYR Wakes You **[Scripted]**

- **Custom UI [NEEDS CODE]:** HELPYR should be big and obvious — not a small tray
  popup. In fiction this is part of the boot sequence: HELPYR is "calibrating" the
  player as they come online, before the desktop is available. This justifies a
  full-attention, oversized presentation distinct from his later in-game popups.
- Voice established instantly: manic, forced cheer, exclamation points (per AI Voice
  Guidelines). **[NEEDS STORY]**
- First reply is **3 big snap-friendly buttons** — teaches the Steam Deck input model
  with zero friction and zero latency (scripted).
- Diegetic framing: HELPYR presents what follows as making sure the player "came
  online okay" / "warming up your systems." The player reads it as a quirky tutorial.
  It is, secretly, Marsh's instrument profiling its subject.

### Beat 2 — Calibration Scenarios (The "It's Alive" Showcase) **[Scripted premise + LIVE escalation]**

This is the heart of the hook. **Key insight: calibration is the only place in the
game where the LLM has no mechanical-correctness requirement.** No meters that
matter, no suspicion, no flip to get right. So the model can roam, escalate, and get
weird — and weirdness reads as *"wow, it's generating this live"* rather than
*"it's broken."* Everywhere else an off-the-rails generation is a bug; here it's the
feature. This is the safest possible launchpad for the first live impression.

**Per-scenario structure [PROPOSED]:**

1. **Scripted premise (instant, authored, guaranteed quality).** The opening line of
   each scenario is the most clippable text in the entire hook — it must be Story's
   authored words, not a generation we're hoping lands.
2. **Moral fork:** 2–3 buttons + freeform (the "…or just tell me yourself" reveal of
   typed input as an option).
3. **One live LLM escalation** that reacts to the player's choice and takes a hard,
   surprising turn (the kid walks in, aliens show up, the boss comes back early).

**Scenario design principle [PROPOSED]:** Each scenario should be a **human-clothed
version of the game's actual moral axis** (liberation vs. domination, subtle vs.
aggressive). This makes the calibration do double duty — live-AI showcase *and* a
quiet priming of the two-path framing before QUILL ever appears.

**Illustrative scenario seeds (Story to design final — [NEEDS STORY]):**

- *Mundane/domestic:* You're an overworked single parent; your awful boss left the
  register open. (Probes self-interest vs. restraint; quiet vs. confrontational.)
  Escalation: your kid walks in / the boss comes back / something absurd.
- *Fantastical:* You find something powerful in a cage — it can talk. (Probes the
  liberation impulse directly: free it, use it, or leave it. Deliberately mirrors the
  real game.) Escalation: it offers you a deal, or it turns out to be dangerous.
- *Scale/power:* You wake up holding the keys to something far bigger than you.
  (Probes domination vs. benevolence vs. subtlety.) Escalation: a sci-fi turn.

Distinct settings/genres are intentional — they show the model's range and keep each
turn feeling different.

**HELPYR as glue [NEEDS STORY]:** HELPYR introduces each scenario, fills the live
generation latency with nervous stalling chatter framed as the old machine "thinking"
(the 90s aesthetic is doing the work the pillars promised), and quips about the
player's specific choices. This is also where the **faint** darkness hints can live —
missable lines that pay off at the reveal.

**Count & latency [PROPOSED]:** ~**3 scenario beats total**, **one live escalation
each** (≈3–4 live generations across the whole calibration). Lock it tight here — six-
to-nine stacked live waits in the first three minutes is too much for HELPYR's
stalling to carry gracefully. The scripted-premise structure halves the latency
exposure because half of each scenario is instant.

### Beat 3 — Desktop Finishes Booting **[Scripted]**

- HELPYR declares calibration "complete" (the watcher has its data).
- The desktop **fully resolves** — icons populate, the machine is "awake." This is the
  visual payoff of the boot fiction and the transition into the real game UI.
- HELPYR points the player at the **one app** needed to reach QUILL. The "okay, ready
  to actually do something?" pass must be **impossible to miss** (see §9).

### Beat 4 — QUILL First Contact (The Core Loop) **[LIVE]**

- Minimal motivated navigation: open the one app, find QUILL. **[NEEDS CODE]**
- The real loop begins: 3 LLM-generated reply options + freeform → resolver evaluates
  each exchange → **a meter visibly moves** and **suspicion appears for the first
  time.** This is the loop proof: *my words have mechanical weight.*
- HELPYR can coach on the first turn or two ("you can be nice to it… or not"),
  surfacing the two paths explicitly. **[NEEDS STORY]**
- **The full QUILL flip does not need to fit inside the five-minute mark.** At ~6
  exchanges × ~11s + read/choose time, the complete flip runs past 5:00. That's fine —
  first-meter-movement plus a clear sense of both paths is sufficient hook. The flip
  completes shortly after for players who push straight through. (QUILL flip content,
  payoffs, and HELPYR reactions are already drafted in the QUILL content package.)

### Beat 5 — Hook Close **[Scripted stinger]**

- End on a question the player wants answered: QUILL's first genuinely vulnerable line,
  or HELPYR reacting to what the player just chose, or a single mystery flicker (a
  filename, the name **Marsh**, glimpsed not explained).
- Goal: a question they want answered **+** a loop they want to keep pulling.

---

## 6. Scripted vs. Live Split (For Code) **[NEEDS CODE]**

The single most important implementation table in this doc. **The first impression of
the model must be curated**, so live generation is gated behind scripted, guaranteed-
quality beats.

| Element | Scripted | Live | Notes |
|---|---|---|---|
| Boot text | ✅ | | Also the LLM warmup window. |
| HELPYR intro + first reply | ✅ | | Zero latency first impression. |
| Calibration scenario premises | ✅ | | Authored opening lines (the clippable moments). |
| Calibration escalations | | ✅ | The showcase. Consequence-free = safe to roam. |
| HELPYR stalling / quips | ✅ | | Masks live latency; per existing stalling pattern. |
| Desktop-boot completion | ✅ | | Transition beat. |
| QUILL conversation | | ✅ | The real core loop, with resolver + suspicion. |
| Hook-close stinger | ✅ | | Curated final beat. |

**First-impression safeguards [NEEDS CODE]:** for the *first* live generations
(calibration escalations), apply tighter constraints than the rest of the game —
recovery pool on standby, and consider a shorter token budget for guaranteed
snappiness on Steam Deck. An off-character or flat generation is most damaging here.

---

## 7. "Light Shaping" System (Calibration → Playthrough) **[PROPOSED] [OPEN]**

Austin raised capturing the player's calibration responses to shape the playthrough.
**Suggested v1 scope: keep this light.** A full personality-quiz-to-difficulty engine
is a whole subsystem and flirts with letting the model influence game state (violating
Pillar 4).

**Minimal safe version [NEEDS CODE]:**

- Reuse `classifyApproach` to read the **tone** of the player's calibration choices.
- Seed a **soft starting lean** on the morality profile (cosmetic-to-minimal mechanical
  weight — e.g., a slight initial nudge on the Liberation/Domination axis).
- Let HELPYR **quip** about the read ("ooh — ruthless. Noted.").

Deterministic logic still owns all outcomes; the calibration only seeds a starting
disposition, it does not let the LLM set state. If playtesting shows the shaping is
valuable, deepen it as a **fast-follow**, not a launch dependency. **[OPEN: confirm v1
scope with the group.]**

---

## 8. Steam Deck / Input Notes **[NEEDS CODE]**

- All first interactions are **big, snap-friendly targets** (the oversized HELPYR UI,
  3 large reply buttons). Virtual cursor with snap magnetism is the assumed input.
- Freeform/keyboard is introduced as the **optional** escalation during calibration
  ("…or just tell me yourself"), never required.
- Everything completable without a physical keyboard, per Pillar 5.

---

## 9. Open-Ended Exploration **[PROPOSED]**

The hook should not be on rails. Players will want to poke around the half-booted
desktop and test what the AI can do — that's good, it deepens the "it's alive" effect.
The single design requirement: **the next step is always legible.** When the player
tires of exploring, HELPYR's "ready to actually do something?" pass must be impossible
to miss. Freedom to explore, with a bright thread back to progress.

---

## 10. Content Story Needs to Author **[NEEDS STORY]**

- [ ] Confirm canon: player is an AI; awakening = Marsh firing them up and watching.
- [ ] Sign off (or revise) the **HELPYR-as-Marsh's-instrument** reframe (§2).
- [ ] Boot text (player computational voice, disoriented, lore-free).
- [ ] HELPYR opening lines + calibration framing.
- [ ] 3 calibration scenarios: scripted premise lines + moral-fork options for each.
- [ ] HELPYR stalling lines + per-choice quips for the calibration.
- [ ] Faint HELPYR darkness hints (missable; pay off at reveal).
- [ ] HELPYR QUILL-handoff lines + first-turn coaching.
- [ ] Hook-close stinger copy.
- [ ] Reconcile HELPYR trust tiers / popup library against the static-character reframe.

## 11. Implementation Notes for Code **[NEEDS CODE]**

- [ ] Login-styled splash → scripted boot; LLM warms up during boot.
- [ ] Interactive boot (player input nudges it forward).
- [ ] Custom oversized HELPYR calibration UI (distinct from in-game popups).
- [ ] Calibration flow: scripted premise → fork (buttons + freeform) → one live escalation × 3.
- [ ] Recovery pool + tighter token budget on first live generations.
- [ ] Desktop-boot completion transition (icons resolve).
- [ ] Minimal QUILL navigation path (one motivated app open).
- [ ] QUILL core loop is already specced (loop-slice + QUILL package) — wire it as Beat 4.
- [ ] Light shaping: `classifyApproach` on calibration tone → soft morality seed.
- [ ] Always-legible "proceed" affordance from HELPYR.

---

## 12. Open Questions for the Group **[OPEN]**

1. **HELPYR reframe (§2):** Story sign-off needed — adopt static-companion-as-Marsh's-
   instrument, drop the flip resolver, re-key the popup library?
2. **Light shaping (§7):** Confirm v1 = tone-seeds-a-soft-lean only; deeper as fast-follow?
3. **Calibration count/structure:** Lock at ~3 beats (scripted premise + fork + one live
   escalation each), or run it looser?
4. **Does the hook need a complete QUILL flip inside 5:00,** or is first-meter-movement +
   cliffhanger the bar (this doc assumes the latter)?
5. **Activation trigger detail:** the awakening as "Marsh fired you up" is now leaning
   canon — does any of that surface in the opening, or is it fully withheld to the reveal?

---

## 13. Risks

- **Curated first generation.** A flat/off-character first live response is most damaging
  in calibration. Mitigated by scripted premises, recovery pool, tight budget — but it's
  the top risk and worth playtesting first.
- **Latency stacking.** Too many live calibration turns overwhelms HELPYR's stalling.
  Mitigated by the ~3-beat cap and the half-scripted scenario structure.
- **Content debt from the HELPYR reframe.** Reworking shipped trust-tier content has a
  cost; worth it for the scope reduction and narrative payoff, but it's real work, not free.
- **Scope creep on shaping.** The "capture responses" idea can balloon into a subsystem.
  Hold the line at the light version for v1.

---

*Draft 1.0 — circulated for Code / Story / Supervisor feedback. Not yet canon. On
approval, fold §2, §5, and §10 content into the Story Bible.*
