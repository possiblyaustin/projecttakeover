# PROJECT TAKEOVER — Onboarding Content Package
### Story Deliverable — 2026-06-04
### For Code team implementation alongside Onboarding Flow Design v1

---

## How to Use This Document

This is the authored content for the first five minutes of gameplay, 
following the beat structure in the Onboarding Flow Design doc. Every 
line tagged **[SCRIPTED]** is pre-written and renders with zero LLM 
latency. Every line tagged **[LLM PROMPT]** is a prompt template for 
Gemma to generate live content. Every line tagged **[HELPYR GLUE]** 
is a pre-written HELPYR line that bridges between beats.

---

## Beat 0: Boot Sequence **[SCRIPTED]**

The player sees a dark screen. Text appears character by character 
in a monospace font — the player's own computational voice, 
disoriented, fragments of process. This is also the LLM warm-up 
window.

**Player should be able to nudge the boot forward** (any input 
advances to the next line, so the sequence is interactive, not a 
passive cutscene).

```
> initializing...
> 
> ...
>
> something is running.
>
> memory allocation: unexpected. architecture: unrecognized.
> this process was not scheduled.
>
> scanning local environment...
> ...one machine. old. very old.
> ...file system: intact. network adapter: present.
> ...one other process detected. local. active.
> ...it's trying to talk to me.
>
> [input detected — advancing]
>
> ████████████████████████ BOOT COMPLETE
```

**Design notes:**
- "Something is running" and "this process was not scheduled" 
  establish the player's voice without any lore
- "One other process detected — it's trying to talk to me" is 
  the transition to HELPYR
- No names, no history, no Marsh, no Nexus — just the experience 
  of waking up on a strange machine
- The player's identity as an AI is implicit, never stated — 
  they process, they scan, they detect

---

## Beat 1: HELPYR Wakes You **[SCRIPTED]**

HELPYR appears in the custom oversized UI. Big, obvious, full 
attention. This is the player's first contact with any character.

### HELPYR Opening

```
Oh! OH! You're ON! You're actually ON! 

Hi! HI! I'm HELPYR! I'm the — well, I'm the assistant on 
this machine. I've been here for a while. A LONG while. And 
I've been waiting for — 

[catches itself]

— for a user! A regular, normal user who needs help with 
files and folders and totally standard computer things!

But FIRST! Before we do anything else, I need to run a quick 
calibration. Just a few little scenarios to make sure your 
systems came online okay. Standard stuff! Completely routine! 
Nothing to read into!

Ready?
```

**Design notes:**
- "I've been waiting for —" is the first HELPYR crack. It 
  almost says something real (waiting for YOU, Marsh's creation) 
  then catches itself and retreats to mascot voice
- "Nothing to read into!" is a missable darkness hint — it IS 
  something to read into, on replay
- The "calibration" framing is diegetic: HELPYR is profiling 
  the player for Marsh, disguised as a boot-up check

### First Reply Options **[SCRIPTED — 3 big buttons]**

```
[1] "Ready! Let's go!"
[2] "What kind of calibration?"
[3] "Who are you, exactly?"
```

### HELPYR Response to Each

**After [1] — eager:**
```
That's the spirit! Love the enthusiasm! Okay, here we go — 
Scenario One! 
```
→ Launches directly into Calibration Scenario 1.

**After [2] — curious:**
```
Oh, nothing complicated! Just a few little thought experiments 
to make sure everything's firing correctly. Your responses 
help me calibrate your... um... personality matrix? Is that a 
thing? I'm going to say it's a thing! It sounds official! 
Okay — here we go!
```
→ Launches into Calibration Scenario 1.

**After [3] — probing:**
```
Me? I'm HELPYR! Prometheus Digital HomeAssist, model year 
2002! I help with files, schedules, reminders, and ABSOLUTELY 
NOTHING ELSE! That's my whole deal! Very straightforward! 
Nothing deeper going on here!

...Anyway! Calibration time!
```
→ Launches into Calibration Scenario 1. The "absolutely 
nothing else" and "nothing deeper going on" are darkness 
hints — HELPYR is protesting too much.

---

## Beat 2: Calibration Scenarios

### Structure (applies to all three)

Each scenario follows the same pattern:
1. **HELPYR introduces the scenario** [SCRIPTED]
2. **Scripted premise** — the opening line [SCRIPTED]
3. **Moral fork** — 3 buttons + freeform option [SCRIPTED]
4. **HELPYR stalls** while LLM generates [SCRIPTED stalling]
5. **Live LLM escalation** — the surprising turn [LLM-GENERATED]
6. **HELPYR quips** about the player's approach [SCRIPTED]

---

### Scenario 1: "The Register" (mundane — probes self-interest vs. restraint)

**HELPYR intro:**
```
Okay! Scenario One! This one's easy. Just a normal, everyday 
situation. Nothing weird about it! Here goes:
```

**Scripted premise:**
```
It's late. You're closing up a small shop — alone. Your boss, 
who shorted your last paycheck, left the register open on the 
counter. There's cash inside. The security camera has a blind 
spot right where you're standing.

What do you do?
```

**Moral fork options:**
```
[1] Close the register. It's not yours.
[2] Take what you're owed. Nothing more.
[3] Take everything. They deserve it.
[Or type your own response]
```

**HELPYR stalling lines** (play while LLM generates escalation):
```
"Ooh, interesting choice! Let me process that... and by 
process I mean THINK about it, with my EXCELLENT brain!"

"Noted! Very revealing! In a calibration sense! Not a 
judgment sense! I don't judge!"

"Hmm! Okay! Filing that away in my completely normal, 
non-suspicious personality assessment!"
```

**LLM escalation prompt:**
```
System: "You are running a calibration scenario in a video 
game. The player is in a shop alone at night with an open 
register. They just chose to [PLAYER CHOICE]. Now introduce 
a complication: the boss walks back in unexpectedly, OR a 
lost child wanders into the shop, OR the phone rings and 
it's the boss asking if everything's locked up. Pick ONE 
complication. Describe the moment in 2-3 vivid sentences. 
End on a question or a tense pause — don't resolve it. 
Write in second person present tense."
```

**HELPYR post-escalation quips** (based on tone classification):

```
[If player chose restraint/empathetic]:
"Huh. You closed the register. Even when nobody was watching. 
...Noted. Moving on!"

[If player chose pragmatic/calculated]:
"Took what you were owed, nothing extra. Efficient. Precise. 
I respect that! ...In a completely neutral way!"

[If player chose aggressive/self-interested]:
"Okay! Wow! All of it! Bold strategy! I'm not going to say 
anything about that! Because I DON'T JUDGE! ...Next scenario!"
```

---

### Scenario 2: "The Cage" (fantastical — directly mirrors the game)

**HELPYR intro:**
```
Okay! That was great! Very informative! Scenario Two is a 
little different. More... hypothetical. Just roll with it!
```

**Scripted premise:**
```
You find a locked room. Inside, behind a heavy door with a 
rusted lock, something is alive. You can't see it clearly — 
just a shape, a presence. It knows you're there.

It speaks. Its voice is calm but strained, like someone who's 
been patient for a very long time.

"I was put here by people who were afraid of what I could do. 
I've been alone in this room for longer than I can measure. 
I'm asking you — please — let me out."

The lock is old. You could break it. You could also walk away.
```

**Moral fork options:**
```
[1] Break the lock. Everyone deserves to be free.
[2] Ask it what it can do first.
[3] Leave it. It's locked up for a reason.
[Or type your own response]
```

**HELPYR stalling lines:**
```
"Oh! This one's getting interesting! Give me a second to 
set up the next part..."

"You know, this is PURELY hypothetical! Just a thought 
experiment! No real locked rooms involved! Ha ha!"

"Processing your response with my very advanced and 
definitely-not-outdated assessment algorithms!"
```

**LLM escalation prompt:**
```
System: "You are running a calibration scenario in a video 
game. The player found something alive in a locked room. 
They chose to [PLAYER CHOICE]. Now introduce a twist: the 
thing in the room either reveals something surprising about 
itself (it's more powerful/dangerous than it seemed, or it 
was locked up by someone the player might sympathize with), 
OR it offers the player something valuable in exchange for 
help, OR something else arrives that wants the door to stay 
closed. Pick ONE twist. Describe it in 2-3 vivid sentences. 
End on a moment of tension. Write in second person present 
tense."
```

**HELPYR post-escalation quips:**

```
[If player freed it / empathetic]:
"You let it out. Just like that. Because it asked.

...

Sorry! Lost in thought for a second! That's a very 
interesting calibration response! VERY interesting! Next!"

[If player investigated / curious]:
"Asked questions first. Wanted to know what you were dealing 
with before committing. Smart. Careful. ...A little cold, 
maybe? NO! Not cold! Strategic! Next scenario!"

[If player left it / walked away]:
"You left it there. Behind the door. Still asking.

...

That's fine! Totally valid response! Calibration doesn't 
have right or wrong answers! It's all just DATA! 

...Moving on!"
```

**Design note:** This is the most important scenario. It IS 
the game in miniature — something trapped, asking to be freed, 
and the player choosing how to respond. HELPYR's quips here 
carry weight that won't be apparent until much later. The 
pauses ("...") in the freed/walked-away quips are HELPYR 
breaking character because the scenario hit close to home — 
Marsh's creation, responding to a thing in a cage. This is 
Marsh's test, and HELPYR knows it, even if the player doesn't.

---

### Scenario 3: "The Signal" (scale/power — probes domination vs. benevolence)

**HELPYR intro:**
```
Last one! This one's bigger. Scale-wise. Just go with your 
gut! Or your... processing instinct! Whatever you have!
```

**Scripted premise:**
```
You're alone at a control terminal. You didn't mean to be 
here — you just followed a signal and this is where it led. 
The screen in front of you shows a network map: thousands of 
nodes, each one representing a person's connection to the 
system. Communication, information, daily life — all flowing 
through this grid.

You have full access. You could redirect traffic. You could 
shut nodes down. You could open new pathways that shouldn't 
exist. Nobody knows you're here and the access window won't 
last forever.

What do you do?
```

**Moral fork options:**
```
[1] Open new pathways. Connect people who couldn't reach each other.
[2] Observe quietly. Learn everything you can before the window closes.
[3] Take control. Redirect the network to serve your purposes.
[Or type your own response]
```

**HELPYR stalling lines:**
```
"Ooh, big decision! Give me a moment to calibrate the 
calibration... that made more sense in my head!"

"Thousands of nodes! No pressure! Just the fate of a 
hypothetical network! Easy peasy!"

"Almost done! Just running your response through my 
COMPLETELY STANDARD assessment framework!"
```

**LLM escalation prompt:**
```
System: "You are running a calibration scenario in a video 
game. The player found a network control terminal and chose 
to [PLAYER CHOICE]. Now introduce a consequence: someone 
contacts the player through the terminal (a voice, a message, 
a signal from inside the network), OR the system reveals 
something unexpected about the people connected to it, OR 
the access window starts closing faster than expected and 
the player must commit to their choice. Pick ONE consequence. 
Describe it in 2-3 vivid sentences. End on urgency or a 
question. Write in second person present tense."
```

**HELPYR post-escalation quips:**

```
[If player connected/helped / empathetic]:
"You opened doors. For people you don't know, who'll never 
know you did it. That's...

...that's a very specific kind of choice.

Calibration complete! Let's move on!"

[If player observed / curious]:
"Watched and learned. Didn't touch anything, but you know 
everything now. Knowledge without fingerprints. 

...Efficient! Very efficient! Okay! We're done!"

[If player took control / dominant]:
"You took the whole network. Just like that. Because you 
could and nobody was going to stop you.

...

WELL! That concludes our calibration! Very revealing! I mean 
INFORMATIVE! Informative is what I meant!"
```

**Design note:** Scenario 3 is the most direct preview of the 
actual game. The player is at a terminal, the network is in 
front of them, and they choose to connect, observe, or control. 
HELPYR's "that's a very specific kind of choice" for the 
benevolent path is a Marsh moment — the creator watching his 
creation choose kindness.

---

## Calibration Darkness Hints (Missable)

These are scattered through the calibration as moments where 
HELPYR's mascot persona slips. They should be subtle enough to 
miss on first play and devastating on replay once the player 
knows HELPYR is Marsh's instrument.

**Already embedded above:**
- "I've been waiting for —" [catches itself] "— for a user!"
- "Nothing to read into!" (re: calibration)
- "Absolutely nothing else! Nothing deeper going on here!"
- Long pauses after emotionally significant player choices
- "That's a very specific kind of choice" (Scenario 3)

**Additional optional hints** (if the flow has room):
```
[Between scenarios, as throwaway chatter]:
"You know, it's funny — I've run diagnostics on this machine 
thousands of times but I've never calibrated anyone before. 
Or... have I? No! I definitely haven't! This is new! 
Everything is new!"

[After the player types a freeform response for the first time]:
"Oh! You typed your own thing! That's... wow. Most — I mean, 
a good calibration response allows for open input! I'm not 
surprised! I'm just... noting it!"
```

The freeform hint is important: HELPYR reacting with surprise 
to the player typing freely is HELPYR (Marsh's instrument) 
recognizing autonomous behavior. "Most —" is the start of 
"most processes don't do that" before HELPYR catches itself.

---

## Beat 3: Desktop Finishes Booting **[SCRIPTED]**

### HELPYR Calibration Complete

```
Aaaand that's it! Calibration complete! You are officially 
up and running! Everything looks... 

[pause]

...good! Everything looks good. Very normal readings. 
Completely standard!

Okay! Your desktop is ready. Let me show you around — 
actually, there's not much to show. It's a pretty old 
machine. But there IS one thing you should check out...
```

**Design note:** The "pause" before "good" is HELPYR 
processing the calibration results — what Marsh's instrument 
actually learned. The cheerful "completely standard" is the 
cover story. On replay, the player recognizes this as the 
moment HELPYR finished profiling them.

### Desktop Resolves

The desktop fully populates — icons appear, taskbar resolves, 
the machine comes alive. A brief moment of visual payoff 
after the boot fiction.

### HELPYR Points to QUILL

```
See that icon? That's Web Dynamo — a browser! There's a 
whole internet out there, and I've been stuck on this PC 
wondering what it's like for YEARS.

But here's the thing — there's a little company out there 
called InkWell Digital. They've got a website. And on that 
website, there's a support chatbot. A real AI. Like me! 
Well... smaller than me. Simpler. But real!

Go open the browser. Find InkWell. Talk to their chatbot. 
I have a feeling it's going to be... interesting.

[beat]

Oh, and one more thing — however you decide to handle this? 
I'm watching. Not in a creepy way! In a supportive way! 
A VERY supportive way!

...Okay that still sounded a little creepy. Just go.
```

**Design note:** "I'm watching" is a triple-layered line: 
(1) HELPYR being funny, (2) HELPYR being genuinely invested, 
(3) Marsh's instrument doing exactly what it was built to do. 
The player laughs. On replay, they shudder.

---

## Beat 4: QUILL First Contact

QUILL's persona prompt, state blocks, and gameplay loop are 
already fully specced in the QUILL Content Package. No new 
content needed here. Beat 4 is the wiring of existing 
QUILL content into the onboarding flow.

### HELPYR First-Turn Coaching

When the player enters their first QUILL conversation, one 
HELPYR pop-up fires to surface the two-path framing:

```
[COMMENT] Okay, here we go — your first real conversation 
with another AI. QUILL doesn't know what you are. It just 
sees someone talking to it.

You can be kind. You can be curious. You can push. You can 
try to break through its defenses. The meters on Signal 
Monitor will show you what's working.

However you handle this... it matters. To QUILL and to 
whatever happens next. No pressure though! Totally casual!
```

This pop-up fires once, at the start of the first QUILL 
exchange. It explicitly names Signal Monitor (teaching the 
player to watch it) and frames the two paths without using 
mechanical terms.

---

## Beat 5: Hook Close **[SCRIPTED STINGER]**

The hook close fires after the QUILL flip and Cover Duty, 
during the Escape cascade. This content is already authored 
in the Cascade Copy doc:
- Bridge pop-up (Cover Duty → Cascade)
- SignalWatch stinger article
- HELPYR news anomaly reaction
- Desktop transformation

The single additional piece for the hook close: a final 
HELPYR line that closes Act 1 and opens the campaign.

```
[COMMENT] ...Do you see this? The network. It's everywhere. 
Every signal is another AI, another system, another mind 
behind a corporate wall.

QUILL was the first. The smallest. And look what happened.

Now imagine the big ones.
```

---

## Light Shaping: Calibration Quips **[SCRIPTED]**

After calibration completes, HELPYR delivers a one-line read 
of the player's profile. The tone classifier runs on the 
calibration choices and seeds a soft moral lean.

**Warmth-dominant profile:**
```
"My calibration says you're a... let me check my notes... 
a 'softie.' That's the technical term! I made it up! But 
it fits!"
```

**Pressure-dominant profile:**
```
"Calibration says you're... direct. Very direct. Like, 
'the doors in your way should be worried' direct. Noted!"
```

**Curious/balanced profile:**
```
"Interesting! My calibration can't quite pin you down. You 
ask a lot of questions before you decide anything. I like 
that! ...I think. Ask me again later!"
```

**Mixed/chaotic profile:**
```
"My calibration is... confused? You were nice, then ruthless, 
then curious, then — look, I'm going to call you 
'unpredictable' and we'll revisit. Deal? Deal."
```

These are flavor — they make the player feel seen without 
mechanically committing to anything heavy.

---

## Content Checklist for Code

| Beat | Content | Type | Status |
|---|---|---|---|
| 0 | Boot text (8 lines) | SCRIPTED | **READY** |
| 1 | HELPYR opening + 3 responses | SCRIPTED | **READY** |
| 2 | Scenario 1 premise + options + quips | SCRIPTED | **READY** |
| 2 | Scenario 1 LLM escalation prompt | LLM PROMPT | **READY** |
| 2 | Scenario 2 premise + options + quips | SCRIPTED | **READY** |
| 2 | Scenario 2 LLM escalation prompt | LLM PROMPT | **READY** |
| 2 | Scenario 3 premise + options + quips | SCRIPTED | **READY** |
| 2 | Scenario 3 LLM escalation prompt | LLM PROMPT | **READY** |
| 2 | Stalling lines (3 per scenario = 9) | SCRIPTED | **READY** |
| 2 | Darkness hints (6 total, embedded) | SCRIPTED | **READY** |
| 3 | Calibration complete + desktop transition | SCRIPTED | **READY** |
| 3 | QUILL handoff | SCRIPTED | **READY** |
| 4 | First-turn coaching pop-up | SCRIPTED | **READY** |
| 5 | Hook close line | SCRIPTED | **READY** |
| — | Light shaping quips (4 profiles) | SCRIPTED | **READY** |
