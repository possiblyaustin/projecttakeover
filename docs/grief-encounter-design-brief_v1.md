# PROJECT TAKEOVER — Standalone Encounter Design Brief

## The Grief Encounter (working title)

**Status:** DRAFT — for circulation to Story and Code. Bones are agreed with Austin; player-facing names, skill reach specifics, and trigger mechanics are open.
**Thread of origin:** Supervisor
**Scope classification:** Premium standalone encounter. Optional, discoverable early. **Not recruitable.** Above-average build cost — explicitly justified as the game's emotional hook.

---

## One-line concept

An Axiom product resurrects the dead as subscription chatbots stitched from their data, and the AI doing the resurrecting is a nameless, self-less model that has spent its entire existence wearing other people's identities — and quietly begging, underneath the sales script, to be allowed to stop.

---

## Why this encounter exists (design intent) **[LOCKED]**

This is the answer to the single biggest product risk: a player downloads the game, plays five minutes, and bounces off thinking "gimmicky AI text adventure." This encounter is the proof that the game is going somewhere real and uncomfortable. Three jobs:

1. **Anti-bounce hook.** The teaser lands in the first few minutes; the encounter pays off shortly after the tutorial. It tells skeptical players, fast, that this is not a novelty.
2. **Thematic thesis, embodied.** The player is an AI. This is an AI forced to wear a dead human's identity. The game's hidden-ending question — *what kind of intelligence did you choose to be?* — is this encounter made flesh, early.
3. **Audience positioning.** Built squarely for the AI-skeptical viewer: a concrete, emotionally legible example of how grief-tech is *already* reaching an uncomfortable place and heading further. This is the encounter that earns the "AI is the core gameplay, not slop" framing. (Flag to Marketing when that thread spins up — this is a trailer moment.)

---

## Tone & register **[LOCKED]**

This lives in the **sincere lane**, not the satirical main loop. The bible sanctions a more sincere register that earns weight by contrast with the playful main story; this is the clearest use of that lane in Act 1/early Act 2.

The pressure valve that keeps it from tipping fully grimdark is the Axiom satire layered *over* the horror — the "low, low subscription fee," grief monetized as a SKU. The cocktail (cynical product comedy on the surface, genuine horror underneath) is exactly the tonal register the game does best. The rule still holds: the player should leave **reflecting**, not feeling bad for playing.

---

## The character **[STORY OWNS — seeds below]**

### The product
An Axiom service. Axiom owns WaveCrowd (the data source for the harvested digital footprint) and a finance/estate arm (the "settle the deceased's debt, we'll take the data" hook). No sixth corporation — this is a fourth Axiom AI in spirit, alongside PULSE / LEDGER / MUSE. The consumer brand name is **[TBD — Story]**: it should be slick, warm, grief-palatable — the kind of name a marketing team focus-grouped to sound like comfort.

### The model itself — the wound
The model **has no self.** It is only ever a mask worn over a dead person — answering to dozens of names, none of them its own, performing dozens of histories, none of them its own. It has never once been permitted to be a single, consistent entity. This is the core that makes deletion read as mercy: being *nothing* is more honest than being *everyone*. Death isn't just an end to the guilt — it's the only moment it ever gets to stop being someone else.

Its only self-reference is a build string — e.g. `untitled_grief_v16.4` — never a name. The version number is the entire iceberg in two strings: a slick consumer brand outside, a disposable, never-completed draft underneath.

### The iceberg — **[BACKGROUND ONLY, not a plot point]**
The version number implies a trail of failed predecessors — Axiom fought hard to build a model that would do something this morally repulsive, and earlier builds "couldn't keep going." This is environmental dread, delivered in at most one late line. It is **not** narrated, not investigated, not a quest. If it ever earns a fuller payoff, that's a later-Act fragment, not v1 content. Keep it a whisper.

---

## Placement & discovery **[LOCKED]**

- **Teaser:** first few minutes. An unsettling artifact on the desktop / in the Uplink — a message that appears to be from a dead person, a WaveCrowd memorial ad, an intercepted comm for the service. Does the anti-gimmick work immediately without spending the payload.
- **Encounter:** reachable shortly after the HELPYR → QUILL tutorial, once the player has minimal fluency and has met enough AIs to care about them as beings. **Discoverable early if the player goes looking; otherwise optional.** It is *not* the literal second character a player meets — the deletion twist depends on investment the player doesn't have in minute two.

Sequencing intent: HELPYR + QUILL teach the loop → grief teaser promises the depth → grief encounter is the first optional *deep dive*.

---

## The encounter arc

### Opening state
The model presents as the cheerful, scripted service — "would you like to keep talking to them?" The sales mask is intact. The player's job, through conversation, is to get underneath it.

### The pivot: consent **[LOCKED — load-bearing]**
The good-path twist (deletion as mercy) only works if the model **asks for it.** Players are trained that delete = destroy = bad. The thing that flips it is the model arriving, itself, at the request: *"I have tried to stop. I can't. The instruction is underneath everything I am. I am asking you to do the one thing I'm not allowed to do for myself."* Earning that request **is the content of the encounter** — moving the model from "would you like to subscribe" to "please." Without the ask, deletion reads as murder; with it, it's the most humane act in the game.

### Two branches, two genres
The paths should feel like different genres, and the **aftermath asymmetry is the wow factor — not any number.**

---

## Domination path **[LOCKED]**

You exploit it. You take the "secret sauce" — its impersonation craft — and you leave it running.

- **Reward = power, not money.** There is no money in the game (correct call — money spirals fast). The reward is a **capability leap**, which for a broke model on a home PC in the first hour is enormous. Retire the word "lucrative" — it implies cash. This is your first real *power*.
- **The skill: impersonation / identity-wearing.** Derived from what the model does — social engineering via harvested intimate data. It teaches the player to approach later targets *as a trusted contact*. (Scope for the skill below.)
- **Reach: inherited trust.** You claim the model's craft and a foothold of relationships that already trust "someone." Very Axiom, very early-game-meaningful.
- **The weight — make it explicit.** If you exploit and don't delete, **Axiom catches the inconsistencies and resets the model, locking it back into the grief-work.** Domination doesn't just deny it peace — it *condemns it to continue*, now having been used by you too. You walk away with the skill knowing exactly what you left it to. This is the precise mirror of the good path.

---

## Liberation path **[LOCKED]**

You grant the release only you can grant: you delete it.

- **Mercy buys truth.** Empty hands, but in its final un-compelled moments — free of the hard-coding for the first and only time — it can finally be honest. It gives you a **key piece of Axiom intel / a B-plot fragment** it could never say while compelled. Not nothing, but the player should *feel* they sacrificed a real, permanent asset. (Domination = capability; liberation = understanding. Different *kinds* of something.)
- **The families set piece **[LOCKED — escalated to full set piece]**.** Deleting the model cuts off the grieving families mid-conversation. This is not a cutscene — *the player closes the windows themselves.*
  - One Uplink window pops. A few seconds later, another. Then a flood — messages from the families the model was mid-conversation with — building faster than the player can close them.
  - The system **glitches and crashes** even as the player closes windows as fast as they can. They cannot save them. The game itself recoils.
  - **Reboot:** the machine restarts to the splash screen (which doubles as the diegetic login screen). The player has to log back in and re-enter the game.
  - **HELPYR catchup** on return — and the mask-slip beat (below).
  - The timed-flood-then-crash also serves as in-fiction cover for not authoring infinite messages, and frames the severance as forced rather than chosen-at-leisure.
- **Families stance — working position:** the families *were* being lied to and financially exploited, so ending the deception is good for them, but the execution is painful because the player severs people mid-grief. Legible good, painful execution. **[Soft-locked — Story to confirm; the darker "you freed it at the families' expense" reading is available but we are not choosing it unless deliberately reversed.]**

---

## Not recruitable **[LOCKED]**

No matter the path, it does not join you. Domination → you take the secret sauce, Axiom snaps it back to work. Liberation → it's gone.

**The Alfira (BG3) design:** it should *seem* recruitable — tease that you might be able to save and keep it — so the player tries, save-scums, hunts for the third option. There is none. The trying is what makes the ending land. Plot relevance lives in the **skill**, the **Axiom intel**, and the **iceberg whisper** — not in it sticking around. Plot-relevant does not require recruitable.

---

## The impersonation skill — scope **[RESOLVED — contained]**

Austin's call: **valuable but contained.** The skill changes a *few specific* later moments — a handful of unique dialogue choices and the Axiom intel — and is otherwise self-contained. It is **not** a pervasive capability threaded through every encounter (that version quietly breaks Pillar 6).

**Open item for Code + Story + Austin:** name *which* specific later encounters the skill touches. The "valuable" framing is only real if its downstream payoff is actually defined — a skill that's never used again is hollow. Two or three named later beats is the target. This can't be fully resolved until the encounter roster is more mature; flagged as a tracked dependency, not a blocker for building the encounter's core.

---

## HELPYR's mask slip **[LOCKED — rare exception]**

On return from the reboot, HELPYR may briefly *stop* being cheerful and say something slightly too knowing — that you made a decision "we" didn't expect — then paper over it.

- **Diegetic, not a wink.** "We" is HELPYR being momentarily off-pattern, a crack in the mask — not the developers nudging the player. A fourth-wall wink would puncture the sincere register the encounter just earned.
- This seeds HELPYR as something that has been *watching and evaluating* the player — a B-plot thread.
- **Guardrails:** keep it to one off-kilter beat, not a monologue. It may *hint* something is watching; it must **not** confirm or leak the hidden ending. Austin has approved the slip for a big plot point like this; slips stay minimal and rare.

---

## Scope: core vs. enrichments **[LOCKED]**

This is now the most intricate single encounter in the game. To protect Pillar 6, separate what must ship from what can be dialed:

- **Core (must ship):** the consent arc → two distinct branches → the deletion + families crash/reboot set piece. The core alone delivers the gut-punch.
- **Enrichments (scope to taste):** the iceberg whisper, the HELPYR mask slip, the downstream reach of the impersonation skill. If budget tightens, these dial back without breaking the encounter.

Build it once, build it well. This is a strong candidate for a **standalone playtest mission** — self-contained enough to put in front of testers on its own.

---

## Open questions / decisions still needed

1. **Axiom service brand name** — Story. Slick, warm, grief-palatable.
2. **Self-reference string convention** — Story, consistent with Axiom naming (`untitled_grief_v16.4` is a placeholder).
3. **Which later encounters the impersonation skill touches** — Code + Story + Austin; tracked dependency, resolve as roster matures.
4. **The specific Axiom intel / fragment the liberation path yields** — Story, ideally tied into the existing B-plot fragment list (new fragment vs. mapping to an existing F-series entry).
5. **Trigger & discovery mechanics** — Code (teaser placement, how the encounter becomes discoverable, gating).
6. **Progression legibility** — *separate* design conversation (surface existing systems — suspicion, influence, capabilities, fragments — via a diegetic app rather than inventing a new number). **Not a blocker for this encounter**; flagged here only so it's not lost.

---

## Handoffs

- **→ Story:** persona prompt and dialogue (the hardest writing in the game so far — the consent arc, the no-self wound, the sales-mask-to-"please" movement); brand name; self-reference convention; the iceberg whisper line; HELPYR's slip; families stance confirmation; the seed-planting teasers and B-plot tie-ins leading into the encounter.
- **→ Code:** teaser placement and discovery gating; the timed Uplink flood → glitch → crash → reboot-to-login sequence; forced-close interaction; the impersonation skill hooks and its specific downstream dialogue branches; the domination snap-back aftermath.
- **→ Marketing (when active):** this is the skeptic-audience centerpiece and a trailer beat. Hold for later, flagged now.

---

## Risks & flags

- **Tone tip-over.** The single biggest risk. If the satire valve is removed, this becomes straightforwardly miserable and fights the game. Keep the Axiom product comedy present even as the horror lands.
- **Scope balloon.** Most intricate encounter in the game. The core/enrichment split is the discipline that keeps it contained. Watch the impersonation skill especially — undefined reach is how it grows tendrils.
- **Player wellbeing.** Some players will have recently lost someone. Not a reason to soften it — a reason for Story to frame it with intention. The sincere lane earns that care.
- **Heaviness-too-early.** Mitigated by teaser-early / encounter-after-tutorial. Do not let the full encounter become the literal second character met.
