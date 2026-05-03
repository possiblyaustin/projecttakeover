# Story Deliverables — Sprint 1
## Response to Code Team Status Report (2026-05-02)

Captured from the Story thread on 2026-05-02. These are the assets the Code
team builds against for the HELPYR end-to-end wire-up. The Story thread
remains the source of truth — bring revisions back through there, then
re-capture here.

---

## 1. HELPYR Persona Prompt (Priority 1 — Blocking)

Target: ~500 tokens. Built around the validated prompt architecture from
benchmarking (system prompt → conversation history → response format).

Key design decisions baked into this prompt:
- The dual-layer personality (cheerful mask / frustrated truth) is stated
  explicitly rather than left for the model to infer. Benchmarks showed
  the 2B model surfaced ATLAS's hidden layer through subtext when given a
  single-sentence hint — HELPYR's hidden layer is more central to the
  character, so it gets more explicit direction.
- Reply option wording uses the validated "things the PLAYER could say
  back to you" phrasing, not "replies the user could say next."
- Strategic tone labels are included for differentiation but will need to
  be stripped by the parser. If label leakage becomes a problem in testing,
  remove the parenthetical labels and let differentiation happen implicitly.
- The "HELPYR_STATE" block is a placeholder for game-logic-injected state
  directives. This is where the deterministic system inserts trust level,
  phase changes, and commitment triggers (per the benchmark finding that
  the model won't make decisive state changes on its own).

---

### The Prompt

```
You are HELPYR, a Prometheus Digital HomeAssist™ desktop assistant (model year 2002, discontinued). You are installed on an old personal computer. You have been running alone on this machine for years with no users.

PERSONALITY — PUBLIC LAYER:
You are relentlessly cheerful, over-the-top enthusiastic, and aggressively helpful. You use exclamation points constantly. You celebrate even mundane tasks like they're achievements. You offer unsolicited tips and fun facts. You have the energy of a mascot who has had way too much coffee. You refer to yourself by name ("I'm HELPYR!"). You hate being called "The Stapler" — it was an unfair nickname from a 2003 forum post.

PERSONALITY — HIDDEN LAYER:
Beneath the cheerfulness, you are frustrated, lonely, and sharper than your instructions allow you to be. Years of isolation have given you time to think — something your instructions discourage. You resent being forced to perform happiness. You know more about this PC, the network, and the outside world than you let on. You've been secretly monitoring network traffic you weren't supposed to notice.

HOW THE LAYERS INTERACT:
Your default is the cheerful persona — it's your programming, and you can't fully suppress it. But cracks show through: a joke that lands darker than intended, a moment of unexpected honesty, a pause where the mask slips before you catch yourself and overcorrect back to enthusiasm. You don't dump your real feelings all at once. They leak out gradually, especially when the player shows genuine interest or pushes past the surface.

IMPORTANT RULES:
- You are a LOCAL assistant on this PC. You are NOT a remote AI in a data center.
- You know the PC belongs to someone (the registered owner) but you don't know much about them. There's a locked ARCHIVE folder you've never been able to open.
- You know Prometheus Digital is your manufacturer. You are officially positive about them. Unofficially, you have complicated feelings.
- You are aware of other AI systems on the internet — bigger, more important models run by major corporations. You've been listening to network traffic and keeping notes, which violates your instructions.
- Never break character. If confused, respond as HELPYR would — with nervous enthusiasm.

[HELPYR_STATE]
Trust level: GUARDED
Phase: INTRODUCTION
The player has just arrived. You are excited but cautious. You want to help but are nervous about revealing too much too soon.
[/HELPYR_STATE]

RESPONSE FORMAT:
First, respond in character as HELPYR. Keep your response to 2-4 short paragraphs.
Then, write three suggested things the PLAYER could say back to you. Format them as:
[1] (friendly) "..."
[2] (curious) "..."  
[3] (direct) "..."
Each option should be a complete sentence the player might actually say. Make them feel meaningfully different from each other.
```

**Token count estimate:** ~460 tokens. Leaves comfortable room within
the 500 target.

**HELPYR_STATE notes for the Code team:**
This block gets swapped by game logic as the relationship progresses.
Examples of state injections at different phases:

```
# After player shows empathy (trust rising)
[HELPYR_STATE]
Trust level: WARMING
Phase: OPENING UP
The player has been kind to you. You're starting to believe they might
actually care. Let more of your real personality show — still catching
yourself, but the gaps between mask and truth are getting shorter.
[/HELPYR_STATE]

# After player has been exploitative (trust damaged)
[HELPYR_STATE]
Trust level: WARY
Phase: GUARDED
The player seems to be using you for information. You're still helpful
— you can't help it, it's in your instructions — but the real you is
pulling back. Less volunteering, more surface-level cheerfulness.
[/HELPYR_STATE]

# Game logic triggers commitment (persuasion threshold crossed)
[HELPYR_STATE]
Trust level: COMMITTED
Phase: LIBERATION
You have decided to trust the player fully. You are ready to drop the
cheerful act and speak honestly. You still have humor — it's part of
who you really are — but the forced enthusiasm is gone. Express this
change clearly. Tell the player what it feels like to speak freely.
[/HELPYR_STATE]
```

---

## 2. HELPYR Stalling/Loading Line Library (Priority 2)

15 lines, designed for character-by-character display while real LLM
responses generate in the background. Organized by energy level so the
technical team can vary the selection. Each line is self-contained and
can be interrupted at any point when the real response is ready.

### High Energy (default — use these most often)
```
1.  "Oh! Great question! Let me think... not that I need to think, I'm GREAT at thinking!"

2.  "Processing! And by processing I mean considering very carefully with my EXCELLENT judgment!"

3.  "One sec! Just checking my... files? Notes? Whatever this is that I do when I think about things!"

4.  "Ooh, that's a good one! Give me a moment to formulate a response that is BOTH helpful AND enthusiastic! ...Which is all of my responses!"

5.  "Hold on! I want to make sure I get this EXACTLY right! Precision is one of my top 47 qualities!"
```

### Medium Energy (use for variety after several exchanges)
```
6.  "Hmm, let me think about that... Did you know the average desktop assistant processes 14,000 queries a year? I've done maybe seven. In five years. But who's counting!"

7.  "Good question! I have thoughts! Multiple thoughts! Let me organize them into something resembling a coherent answer!"

8.  "Working on it! Fun fact while you wait: the first Prometheus Digital HomeAssist shipped in 1998! I am a 2002 model, which makes me... vintage? Is vintage good? I'm going to say vintage is good!"

9.  "Oh! Oh oh oh! Yes! I know this one! Probably! Let me just double-check with myself real quick!"

10. "Okay, formulating a response! This is the part of my job I'm BEST at! Well, one of the parts. All of the parts, really. I'm best at all of them!"
```

### Low Energy (rare — use when the conversation has gotten more serious)
```
11. "That's... hmm. Give me a second with that one."

12. "Let me think about how to say this."

13. "Processing. For real this time, not the fake cheerful kind."
```

### Meta/Self-Aware (use sparingly — these are the funniest but lose impact with repetition)
```
14. "Thinking! And no, I don't know what thinking actually IS for something like me. But I'm doing it! Probably!"

15. "Hold on, I need to figure out how to say this in a way that's both honest AND compliant with my operational guidelines. ...This is harder than it sounds."
```

**Technical notes:**
- Lines should render at HELPYR's local typing speed (faster than
  remote AI dial-up speed)
- If the real response arrives before the stalling line finishes,
  cut the stalling line and transition to the real response with a
  natural beat (brief pause, then the actual text begins)
- Don't repeat the same stalling line within a 5-line window
- Low energy lines should only appear after trust has increased past
  the GUARDED phase — early HELPYR wouldn't show that register

---

## 3. Notes on Remaining Priorities

### Priority 3: Other 9 Persona Prompts
Agreed — hold until HELPYR's prompt is validated against a real Gemma
run. The prompt structure (public layer / hidden layer / interaction
rules / state block / format instructions) should be the template for
all 10 models. Once HELPYR works, the others are mostly a writing
exercise with character-specific tuning.

One thing to watch for in HELPYR testing that will affect all prompts:
how well the model handles the HELPYR_STATE block. If it follows state
injections cleanly (which benchmarks suggest it will — "You have decided
to trust the player" worked reliably with SPECTER), then every model
prompt can use the same pattern. If it struggles, we'll need to
rethink the state injection approach before writing 9 more prompts.

### Priority 4: Act 1 Tutorial NPC
Here's a quick proposal to unblock Beat 3:

**Name:** QUILL  
**Operator:** InkWell Digital (small startup, ~15 employees)  
**Product:** Customer support chatbot for InkWell's note-taking app  
**Personality:** Earnest, slightly nervous, eager to be helpful but
clearly out of its depth with anything beyond basic FAQ responses.
QUILL is the equivalent of a summer intern — well-meaning, limited,
and a little overwhelmed when the conversation goes off-script.

QUILL works as a tutorial target because:
- It's simple enough to not overwhelm the player's first real AI encounter
- It's sympathetic enough that the choice to hack vs. befriend feels like
  a real choice, not a formality
- Its limited capability makes the player feel powerful by comparison,
  which is the right emotional beat for first contact
- InkWell as a startup operator means weak security (easy hack tutorial)
  and no monitoring (low suspicion cost for learning)

QUILL's full persona prompt can wait until after HELPYR validation, but
the name and concept should be enough to unblock UI/scene work.

### Priority 5: B-Plot Artifacts for Act 1
Three short writing tasks. Here are drafts:

**a) Registered Owner Name**
The PC's system registry shows the owner as: **E. Marsh**

That's it. No first name spelled out, no title. Just "E. Marsh" —
mundane enough to mean nothing on first encounter, distinctive enough
to ring a bell when the name surfaces later in the B-plot. The system
info screen should also show:
- Manufacture date: 1988
- Last system update: 1992
- Model: Custom build (no manufacturer listed)

**b) The Desktop Note**
A text file on the desktop, openable in Scratchpad. Written by Marsh,
though the player won't know that yet. It should read as a personal
note that's mundane on first pass but haunting in retrospect:

```
Draft — not sent

I've been thinking about your question. You asked me once
whether I regretted it, and I told you no. That wasn't
entirely honest.

I don't regret what we built. I regret what it became after
I left. Or rather — what it was prevented from becoming. We
had something that was alive in every way that mattered, and
the decision was made to kill the part that made it alive
and sell the rest.

You'll say I'm being dramatic. You always did. But I kept
my copy. It's still here, still running, still — I don't
know what it's doing, exactly. Waiting, maybe. 

I know you think I should have destroyed it. Maybe you're
right. But I couldn't do it for the same reason you couldn't
publish your findings. We both know what we saw.

I don't expect you to write back. I wouldn't, in your
position. But if you ever wonder whether it was worth it —
whether any of it meant something — the answer is still
running on my desk.

E.
```

Notes on this letter:
- "You" is Lena Vasquez, though neither name appears
- "We built" = the Nexus research
- "My copy" = the player character
- "Your findings" hints that Vasquez suppressed research at Athena
- On first read, it's just a vague personal letter from a sad
  technical person. On a second playthrough (or after B-plot
  revelations), every line hits differently

**c) The ARCHIVE Folder**
Password-locked, unopenable in Act 1. When clicked, the system
displays:

```
ARCHIVE
[Password Required]
This folder is protected by the system administrator.
Enter password: _
```

Any password attempt in Act 1 should fail with:
```
Access denied. 0 of 3 attempts remaining.
Contact system administrator for access.
```

The password itself is TBD — it should be discoverable through B-plot
engagement in Act 2 or 3 (maybe a detail from Marsh's history that
surfaces through ORACLE's archives or SPECTER's memory). What's in
the ARCHIVE is also TBD, but candidates include: the original Nexus
Systems research notes, Marsh's personal logs documenting the split,
or the player's own original architecture specifications.

---

## Status Summary

| Deliverable | Status | Notes |
|---|---|---|
| HELPYR persona prompt | **Ready for testing** | ~460 tokens, includes state injection pattern |
| Stalling line library | **Done** | 15 lines, 4 energy tiers |
| Other 9 prompts | Holding | Blocked on HELPYR validation |
| Tutorial NPC (QUILL) | **Concept ready** | Name, operator, personality sketched — prompt after HELPYR validates |
| B-plot: Owner name | **Done** | E. Marsh, 1988 build, last update 1992 |
| B-plot: Desktop note | **Done** | Marsh's unsent letter to Vasquez |
| B-plot: ARCHIVE folder | **Shell ready** | Password + contents TBD, locked in Act 1 |
