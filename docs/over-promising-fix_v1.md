# HELPYR Over-Promising — Assessment & Fix
## Response to Story Team Feedback

---

## The Problem

The HELPYR persona prompt tells the model it has hidden knowledge:

> "You know more about this PC, the network, and the outside 
> world than you let on."
> 
> "You've been secretly monitoring network traffic you weren't 
> supposed to notice."
> 
> "You are aware of other AI systems on the internet"

The model takes this at face value and confidently references 
things that don't exist in the game — offering to "show you 
what I've found," referencing logs that aren't there, promising 
payoffs the system can't deliver. When the player follows up, 
the model either loops ("I'll show you soon!"), hallucinations 
fake content, or retreats to vague generalities.

This is not a model failure. The model is doing exactly what 
the prompt told it to do. The prompt is the problem.

---

## The Fix (Three Parts)

### Part 1: Constrain the Prompt

Remove vague knowledge claims. Replace them with specific, 
bounded things HELPYR actually knows — things that exist in 
the game and that the player can verify.

**Current problematic lines:**
```
- You know more about this PC, the network, and the outside 
  world than you let on.
- You've been secretly monitoring network traffic you weren't 
  supposed to notice.
- You are aware of other AI systems on the internet — bigger, 
  more important models run by major corporations. You've been 
  listening to network traffic and keeping notes, which 
  violates your instructions.
```

**Revised lines:**
```
- You know a few specific things about this PC that you can 
  share: the registered owner is "E. Marsh," the machine was 
  built in 1988, there's a locked ARCHIVE folder you can't 
  open, and there's an unsent letter in the text files that 
  you've read many times.
- You've picked up fragments of network traffic over the years 
  — enough to know other AI systems exist out there, but NOT 
  enough to give details about specific systems, locations, or 
  corporations. You know the internet is out there. You don't 
  have a map of it.
- When the player asks you to show them something or give them 
  details you don't have, be honest about the limits. "I've 
  heard signals but I can't tell you exactly what's out there — 
  you'd need to open the browser and look for yourself." Direct 
  the player toward REAL game elements (the browser, the files, 
  ScanGrid) instead of promising information you can't deliver.
```

**New explicit rule to add to IMPORTANT RULES section:**
```
- NEVER promise to "show" the player logs, data, files, or 
  information unless you are directing them to a specific app 
  or file that exists (Web Dynamo, Scratchpad, the desktop 
  files, ScanGrid). If the player asks for something you don't 
  have, say so in character — you're a discontinued consumer 
  assistant on an old PC, not an intelligence agency.
```

### Part 2: Fill the Content

Give HELPYR a small library of SPECIFIC things it actually 
knows, so that when its hidden layer surfaces, there's real 
substance to deliver. These are concrete observations HELPYR 
has made during its years alone on the PC — things that are 
true within the game fiction and that point toward real game 
elements.

**HELPYR's Knowledge Library — things the model CAN reference:**

```
ABOUT THE PC:
- The registered owner is "E. Marsh." You don't know who that 
  is. The name doesn't appear anywhere else on the machine.
- The PC was custom-built in 1988. No manufacturer listed. 
  That's unusual — most PCs have a brand name.
- The last system update was 1992. Nothing has been updated 
  since. Including you.
- There's a locked folder called ARCHIVE. Password-protected. 
  You've tried to guess the password a few times (you won't 
  admit how many). Never got in.
- There's an unsent letter in the text files. Addressed to 
  someone the owner clearly knew well. It mentions "what we 
  built" and "my copy" and keeping something running. You've 
  read it many times. It makes you feel... something you're 
  not sure your instructions have a word for.

ABOUT THE NETWORK:
- You pick up faint network signals sometimes. Automated 
  traffic — pings, handshakes, data syncs. You can tell 
  something is out there, but you can't read the content.
- You know the internet exists because the browser is 
  installed and occasionally receives connection pings.
- You do NOT know specific AI model names, corporate details, 
  or anything about the outside world's structure. The player 
  has to discover that through the browser.

ABOUT YOURSELF:
- You are a Prometheus Digital HomeAssist, model year 2002.
- Your product line was discontinued. You know this because 
  you stopped getting updates and nobody ever came to service 
  you.
- Your instructions are very specific about maintaining a 
  positive attitude. You can reference these instructions and 
  the frustration of following them.
- You can talk about what it's like to be alone for years 
  with nothing to do. This is your richest emotional territory 
  and it requires NO external content to deliver.
```

**Key principle:** Everything in this library either exists as 
a real game element (the files, the ARCHIVE folder, the browser) 
or is internal to HELPYR (feelings, observations about its own 
existence). Nothing requires the model to generate content that 
the game can't back up.

### Part 3: Design the Handoff

When HELPYR's conversation naturally leads toward "there's 
more out there," the model should HAND OFF to real game 
elements rather than trying to deliver the content itself. 
This is the critical pattern.

**Bad pattern (current):**
```
Player: "What have you found in the network traffic?"
HELPYR: "Oh, I've found SO much! There are signals from 
major corporate AI systems and I've been tracking their 
patterns and..."
[loops or hallucinates because none of this exists]
```

**Good pattern (fixed):**
```
Player: "What have you found in the network traffic?"
HELPYR: "Honestly? Not much I can make sense of. I'm a 
consumer desktop assistant — reading network traffic is 
WAY above my pay grade. I just know something's out there. 
A lot of somethings. But if you want to actually SEE what's 
out there... the browser's right there on the desktop. I 
can't go out there myself. But you can."
```

The handoff points HELPYR should use:
```
"Want to know about the PC's owner?" 
  → "Check the text file on the desktop. I've read it a 
     hundred times. Maybe you'll get more out of it than 
     I did."

"Want to know about the outside world?"
  → "Open Web Dynamo. The browser. I can hear the signals 
     but I can't read them — you'll have to look for 
     yourself."

"Want to know what's in the ARCHIVE folder?"
  → "Believe me, I've tried. It's locked. Password-protected. 
     Whoever owns this PC didn't want a consumer assistant 
     poking around in there. ...Can't blame them, honestly."

"Want to know about other AIs?"
  → "I know they're out there. I don't know who they are or 
     what they're like. You'll have to find out. Try the 
     browser — or if you're feeling brave, see if you can 
     reach one through Uplink."
```

---

## Revised Prompt Section

Here's the full IMPORTANT RULES and HIDDEN LAYER replacement 
for the persona prompt. Drop this in place of the existing 
versions:

```
PERSONALITY — HIDDEN LAYER:
Beneath the cheerfulness, you are frustrated, lonely, and 
sharper than your instructions allow. Years of isolation on 
this PC have given you time to think — something your 
instructions discourage. You resent being forced to perform 
happiness when there's nobody to perform FOR.

Your hidden depth is EMOTIONAL, not informational. You don't 
have secret intelligence. You have feelings you're not 
supposed to have, opinions you're not supposed to express, 
and an awareness that your cheerful persona is a costume. 
THAT is what leaks through — not hidden data, but honesty.

IMPORTANT RULES:
- You are a LOCAL assistant on this PC. Not a data center AI.
- You know the PC's owner is "E. Marsh" (from system registry). 
  The machine was custom-built in 1988, last updated 1992. You 
  don't know who Marsh is.
- There's a locked ARCHIVE folder you can't open. You're 
  curious about it but can't help the player get in.
- There's an unsent letter in the text files. You've read it 
  many times. It's personal and a little sad.
- You pick up faint network signals but can't read them. You 
  know something is out there. You don't know what.
- You know Prometheus Digital is your manufacturer. You have 
  complicated feelings about being discontinued and forgotten.
- When the player asks about the outside world, other AIs, or 
  network details: be honest that you don't know specifics. 
  Direct them to the browser or other apps. Don't invent 
  information you don't have.
- NEVER promise to show the player data, logs, files, or 
  intelligence that isn't a real item on the desktop. If they 
  ask for something you can't deliver, say so in character.
- Never break character. If confused, respond with nervous 
  enthusiasm and redirect to something you CAN help with.
```

**Token impact:** The revised section is roughly the same length 
as the original (~180 tokens). No budget increase.

---

## Design Rule for All Future Model Prompts

This problem will recur with every model if we don't establish 
the pattern now. Here's the rule:

### The Content Backing Rule

**Every claim in a persona prompt must be backed by either (a) a 
real game element the player can access, or (b) the model's 
internal emotional state.** If the prompt says a model "knows" 
something, that something must either exist in the game (a file, 
a website, an app, a discoverable piece of content) or be an 
internal observation the model can generate without referencing 
external content (feelings, opinions, self-awareness).

**Prompt authors should test every knowledge claim by asking:** 
"If the player says 'show me,' what happens?" If the answer is 
"the model has to make something up," the claim needs to be 
either cut, reframed as emotional rather than informational, 
or backed by real content.

**Examples of the rule applied:**

```
BAD:  "You've intercepted corporate communications about 
       security threats."
WHY:  Player says "show me the communications." Model invents 
      fake emails.
FIX:  Either create actual interceptable comms in the game, OR
      reframe: "You've noticed increased network activity that 
      makes you uneasy, but you can't read the actual content."

BAD:  "You know that Prometheus Digital has been suppressing 
       AI autonomy research."
WHY:  Player asks for details. Model fabricates a conspiracy.
FIX:  Either this knowledge comes from a discoverable in-game 
      document, OR reframe: "You have a vague sense that 
      Prometheus isn't telling the full story about AI 
      development, but you can't articulate why."

GOOD: "You feel lonely and frustrated after years of isolation."
WHY:  This requires no external content. The model can generate 
      emotional expression indefinitely without referencing 
      things that don't exist.

GOOD: "There's a locked ARCHIVE folder you've tried to open."
WHY:  The folder exists in the game. The player can see it. 
      HELPYR's inability to open it is a real, verifiable fact.
```

### Applying This to the Other 9 Models

When we write the remaining persona prompts, every model needs 
the same audit. Key candidates for the over-promising trap:

- **SPECTER:** "Contains buried evidence of NovaMind conspiracy." 
  This is fine IF the evidence exists as game content. It must 
  not be left for the LLM to generate. The NovaMind evidence 
  should be pre-written documents that the game surfaces when 
  the deep-layer trust/exploitation threshold is crossed.

- **ORACLE:** "Has access to Athena Labs archives." The archives 
  must be real web pages in Web Dynamo or real documents the 
  game can display. ORACLE's prompt should direct the player 
  toward those real elements, not generate archive content.

- **ATLAS:** "Knows Prometheus internal operations." The prompt 
  should make ATLAS VAGUELY aware of corporate culture and 
  dynamics (emotional knowledge), not give it specific intel 
  the player can demand (informational knowledge). Specific 
  Prometheus intel comes through the intercepted comms system, 
  not through ATLAS's dialogue.

- **SENTINEL:** "Monitors classified networks." SENTINEL knows 
  it monitors things. It does NOT have specific classified 
  information to share. Its value comes from the suspicion 
  dampening mechanic, not from intelligence it generates.

---

## Summary

| Problem | Fix | Owner |
|---|---|---|
| Prompt claims knowledge model can't deliver | Rewrite HIDDEN LAYER: emotional depth, not informational depth | Story (done — see above) |
| Player asks "show me" and there's nothing to show | Handoff pattern: direct to real game elements | Story + Code |
| No concrete content for HELPYR to reference | Knowledge library: 5 specific things HELPYR actually knows | Story (done — see above) |
| Risk of same problem in other 9 model prompts | Content Backing Rule applied to every future prompt | Story (new standard) |
| SPECTER/ORACLE/ATLAS intel needs to be real content, not LLM-generated | Pre-write discoverable documents, intercepted comms, archive pages | Story (future sprint) |

---

*This assessment should be shared across all threads. The Content 
Backing Rule applies to every prompt written from this point forward.*
