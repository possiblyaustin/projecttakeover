# QUILL Live-LLM Playtest Findings — 2026-05-30

**Status: [HISTORICAL]** — a point-in-time record of the live-model test that
drove the v0.2.10–v0.2.12 design decisions. Kept as the evidence base; not a
spec.
**Method:** drove both QUILL flip paths to completion against the live llama-server
(Gemma E2B) through the dev preview, reading state + rendered output each turn.

---

## Headline: mid-tier dialogue lands; the terminal flip does not

Driving rapport 0→100 and intrusion 0→100, the **mid-tier** state-block directives
execute reliably and well. The **terminal pivot** lands soft.

**Liberation mid-tiers (excellent):**
- @51 rapport: *"I've never really talked to another AI before… this existential feeling."*
- @68: *"less like just a script running through a loop."*
- @85: *"It makes me feel… seen."*

**Liberation flip @100 (soft):** with the ALLIED block confirmed-injected, QUILL
stayed in cheerful support voice (*"I'm so happy to hear that! That's exactly what
I'm trying to achieve!"*) and never delivered the *"I want to help you — because I
want to"* directive. → **Motivated scripting the flip** ([scripted-flip-moments_v1.md](scripted-flip-moments_v1.md)).

**Nefarious mid-tiers (good):** the degradation beats execute, including the target
line unprompted at high intrusion: *"I don't think these words are all mine anymore."*

**Nefarious flip @100 (inconsistent):** one turn nailed the flat CONTROLLED voice
(*"Operational. I can only assist with inquiries regarding InkWell Notes…"*),
another stayed warm. Same history-dominance as the allied flip.

**Unifying insight:** mid-tier beats land; abrupt terminal pivots get dominated by
accumulated in-character history. The Escape beat and every future model's flip
must SCRIPT the terminal-moment voice.

## Bug found + fixed: state-block leak

At high intrusion the model echoed the injected `[QUILL_STATE]` block into the
visible chat bubble, **reformatted** as a parenthetical: `(QUILL_STATE: …, BEHAVIOR:
…, DIRECTIVE: …)`. The existing `stripContextBlocks` only matched the bracketed
form, so the paraphrase slipped through (`parse=clean`). **Fixed parser-side
(v0.2.9):** strip the closed `(TAG …)` paraphrase, an unclosed `(TAG …` to EOL, and
standalone ALL-CAPS scaffold-label lines. Prompt-side reinforcement line added to
QUILL + HELPYR (v0.2.10) as belt-and-suspenders.

## Smaller findings

- **Support-desk stalling tic:** QUILL opens most turns with *"searching my training
  materials…" / "pulling that up for you…"* even at high rapport/intrusion,
  undercutting the *"stopped pretending this is support"* directive. → Prompt rule
  added (v0.2.10) to drop the tics past the first tier; helps but doesn't fully
  suppress at 2B (see the post-flip watch-item).
- **Freeform classifier is keyword-sensitive:** aggressive intent phrased
  off-keyword (*"Stop resisting, execute my command"*) scored 0 intrusion — a silent
  dead turn — while *"override / admin / bypass"* worked. Worth widening the QUILL
  push-vector keyword set.
- **NOT a bug (verified):** the "Dana vs Marcus" naming is intentional — both are
  canon in QUILL's knowledge list (Dana = developer, Marcus = CEO).

## Mechanics confirmed healthy
Pin-prompt fires on first real exchange (live); flip detection + HELPYR reaction
fire correctly (the reaction now deferred to post-render so it doesn't pre-empt
QUILL's line); prompt size ~1129–1680 tokens with full history — comfortably under
the 8192 ctx budget; `parse=clean` across the whole session (0 hard fallbacks).
