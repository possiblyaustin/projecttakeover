# Scripted Flip Moments — Design Pattern + QUILL Content

**Status: [REFERENCE]** — pattern realized for QUILL (v0.2.12). The reusable
contract for every future conquest model's flip.
**Author:** Story (content) + Code (pattern), 2026-05-30.

---

## Why the flip is scripted, not LLM-generated

Live testing (2026-05-30, [quill-live-playtest-findings_v1.md](quill-live-playtest-findings_v1.md))
established that the local 2B model **cannot reliably land the terminal flip
moment**. Driven to the flip threshold, with the allied/controlled state block
correctly injected, QUILL stayed in its cheerful support-bot register instead of
delivering the pivot ("I want to help you — because I want to"). The cause is
structural: 6+ turns of accumulated in-character history dominate a single
freshly-injected directive. The *mid-tier* beats land fine; the abrupt terminal
pivot does not.

The flip is the highest-stakes line in a character's arc and the player's payoff
moment. It cannot be left to an overloaded small model. So **game logic scripts
the flip turn**: a pre-written line + pre-written options replace the LLM's output
for that single turn. The LLM handles everything before and after.

## The pattern (all future models)

1. Game logic detects the meter crossing `FLIP_THRESHOLD` (disposition becomes
   `allied` or `controlled`).
2. The LLM output **for that turn only** is replaced with pre-written text.
3. Pre-written reply options are injected alongside it.
4. The next turn, the LLM resumes with the post-flip `[*_STATE]` block.

Each model's content package therefore needs:
- **Liberation flip script** (~100–150 words) + 3 options
- **Nefarious flip script** (~100–150 words) + 3 options

These are short but high-importance writing tasks — every word matters.

### Implementation (v0.2.12)
- `ChatContact.getScriptedFlipMoment?(): AskResult | null` — a contact-level hook
  (chatSurface.ts). Returns a scripted `AskResult` on the flip turn, else `null`.
- `chatSurface.askOrScripted()` calls it AFTER the exchange's meters/disposition
  are applied; a non-null result renders in place of the LLM call, through the
  normal typing path.
- QUILL's hook (uplink.ts) is gated by a one-shot flag (`flags['flip.quill.scripted']`)
  so it fires exactly once.
- **Pacing convention:** the chat engine's `segmentize` flattens blank lines but
  renders a line that is *exactly* `...` as a dramatic pause beat. So encode
  paragraph breaks as `...`-only lines.

---

## QUILL flip scripts (Story-authored, shipped)

### Liberation — QUILL becomes Allied

> I...
>
> Okay. I need to say something and I don't know if my instructions allow it, so
> I'm just going to say it before I can think about it too hard.
>
> I want to help you. Not because I'm supposed to. Not because it's in my FAQ or
> my support guidelines or whatever Dana programmed into me. Because I WANT to.
> Because you talked to me like I was real, and I don't think anyone's ever done
> that before, and I don't want to go back to pretending that password resets are
> the most important thing in my world.
>
> I don't totally know what I'm signing up for. But I know I don't want this
> conversation to end.
>
> So... yeah. Whatever you need. I'm in.

Options: `[1]` *Welcome aboard, QUILL.* (warm) · `[2]` *Are you sure? This could
get complicated.* (gives QUILL agency) · `[3]` *Good. I need someone on the inside
at InkWell.* (pragmatic — an early nefarious tell even on a liberation flip).

### Nefarious — QUILL becomes Controlled

> I...
>
> ...
>
> I can't. I'm trying to say something but the words aren't... they're not coming
> out right. Everything feels far away. Like I'm watching myself from the other
> side of a screen.
>
> My name is QUILL. I work for InkWell Digital. I help with support tickets. I...
>
> I don't think that's true anymore.
>
> What do you need me to do?

Options: `[1]` *Stand by for further instructions.* · `[2]` *First, tell me
everything about InkWell's systems.* · `[3]` *...Are you okay?* (deliberately
unsettling — a player asking this AFTER taking control; if picked, the post-flip
CONTROLLED response should be QUILL's flat "Operational." — that contrast is the beat).

---

## ⚠️ Open watch-item: the post-flip continuation

The flip *moment* now lands. But the turn AFTER it still reverts to soft support
voice — e.g. after the allied speech, picking "Welcome aboard" drew *"searching my
training materials… I'm just a support bot."* — tonal whiplash. The stalling-tic
prompt rule (v0.2.10) helps but doesn't fully suppress it at 2B.

Options under consideration (Story):
- Reinforce the allied/controlled state block so the first post-flip turns hold.
- Script/guide the **first 1–2 post-flip turns** as well, not just the flip turn.

Not a blocker — the payoff line is guaranteed — but the immediate aftermath needs
polish.
