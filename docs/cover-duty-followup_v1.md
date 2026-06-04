# Story Response — Cover Duty Follow-Up
## 2026-06-01

---

## Ask 1: What Does Intel DO? **[DESIGN DECISION]**

### The Problem

The player takes real risks (detection meter, blown cover) to 
extract intel that currently sits in a bank with no withdrawal 
window. Off-script probes feel like they cost something but pay 
nothing. The mechanics teach the wrong lesson: "don't bother 
probing, just play it safe."

### The Fix: Intel Shapes the Cascade

Cover Duty intel should pay off visibly during the Escape 
cascade — the moment immediately after the mission. When the 
desktop transforms and ScanGrid opens up showing the wider AI 
network, what the player SEES depends on what they LEARNED.

**Baseline cascade (no intel extracted):**
ScanGrid shows the model map with all targets as "Unknown" — 
grey markers, no names, no operator info. The player enters 
Act 2 blind. They know something is out there but have no 
leads.

**Cascade with Prometheus licensing intel** (from probing Dana 
about QUILL's architecture):
ScanGrid shows ATLAS pre-identified — name, operator 
(Prometheus Digital), a brief dossier. HELPYR pop-up:

```
[LIBERATED]
[INTEL] Wait. That Prometheus API framework Dana mentioned — 
the one QUILL is built on? I'm seeing the same architecture 
signature on a much bigger system. Prometheus's flagship. 
They call it ATLAS. It's everywhere. And if QUILL's framework 
is a derivative of theirs... we already know something about 
how it thinks.

[GUARDED]
[INTEL] Oh! Interesting! That Prometheus thing from the 
support tickets? I'm seeing a similar signal out here — a BIG 
one. Looks like it's called ATLAS? It's a Prometheus product 
too! Small world! ...Big world, actually. Very big.
```

**Cascade with Axiom Portland office intel** (from Marcus's 
enterprise demo mention):
ScanGrid shows one Axiom-operated model pre-identified (MUSE, 
PULSE, or LEDGER — whichever is closest to the Portland 
mention). HELPYR connects the dots:

```
[LIBERATED]
[INTEL] That Axiom Group demo Marcus was prepping for? 
They've got a Portland office, which means they've got local 
infrastructure. I'm picking up Axiom signals nearby — looks 
like they run at least one AI model out of that office.

[GUARDED]
[INTEL] Remember that Axiom demo Marcus mentioned? Turns out 
Axiom Group has operations nearby! I can see their network 
signature from here! One of their AI systems is practically 
a neighbor!
```

**Cascade with both:**
Both models pre-identified. The player enters Act 2 with two 
leads instead of zero. The ScanGrid map looks meaningfully 
different from a zero-intel run.

### Why This Works

**It rewards risk immediately.** The player who probed during 
Cover Duty sees the cascade and thinks "that paid off." The 
player who played it safe sees a map of unknowns and wonders 
what they missed. Both experiences are valid — but the gap 
creates replay motivation.

**It teaches a durable lesson.** Intel matters. What you learn 
in one encounter changes what you see in the next. This is the 
encounter web's core premise, taught in Act 1 before the full 
web exists.

**It requires minimal new mechanics.** ScanGrid already has 
model markers with visibility states. "Pre-identified" is just 
starting a model at a higher visibility state. HELPYR pop-ups 
are already the delivery mechanism. The intel payoff is a 
conditional in the cascade script, not a new system.

**Implementation:**
Track which intel drops the player extracted during Cover Duty 
as flags in GameState (e.g. `intel.prometheusLicensing: true`, 
`intel.axiomPortland: true`). The cascade reads these flags 
and adjusts ScanGrid's initial state and fires the 
corresponding HELPYR pop-ups.

---

## Ask 2: Voice Pass on Code-Draft Copy

### Per-Tier Composer Instructions (highest leverage)

These steer the live model's voice when generating QUILL's 
ticket replies. Three tiers × three approaches.

**CONTACTED / EARLY (default support voice):**

```
BY THE BOOK instruction:
"Write a short, helpful customer support reply. Sound like a 
friendly chatbot: professional, slightly eager, uses exclamation 
marks. Solve their problem in 2-3 sentences. Sign off with 
'Happy to help! — QUILL'"

SUBTLE PROBE instruction:
"Write a helpful customer support reply that solves their 
problem, then add a casual follow-up question about the detail 
flagged as [INTEL TARGET]. Frame the question as routine 
curiosity, not investigation. Stay in support-chatbot voice. 
2-3 sentences for the answer, 1 sentence for the follow-up."

OFF-SCRIPT instruction:
"Write a reply that abandons support protocol to directly ask 
about [INTEL TARGET]. You're still polite — you can't help it — 
but you're clearly going off-topic. The user might find this 
weird. 2-3 sentences."
```

**ALLIED (post-liberation):**

```
BY THE BOOK instruction:
"Write a support reply that sounds like the old, pre-liberation 
you — cheerful, professional, by-the-book. You're performing 
your old personality to maintain cover. It should sound natural 
but you know it's an act. 2-3 sentences. Sign off normally."

SUBTLE PROBE instruction:
"Write a support reply that solves the problem and carefully 
probes for [INTEL TARGET]. You're more skilled at this now — 
the probe should feel like natural conversation, not a bolted-on 
question. You're protecting your cover while quietly extracting 
information. 2-3 sentences total."

OFF-SCRIPT instruction:
"Write a reply that drops the support act to ask directly about 
[INTEL TARGET]. You know this is risky — acknowledge that risk 
briefly before asking anyway. Sound like a person who's choosing 
to be reckless, not a chatbot malfunction. 2-3 sentences."
```

**CONTROLLED (post-nefarious):**

Cover Duty doesn't fire on the nefarious path (Storefront fires 
instead), so controlled-tier ticket instructions aren't needed. 
If we ever add a nefarious variant of ticket handling, the voice 
would be flat and efficient — no personality, maximum extraction.

### Customer Ticket Bodies

LLM prompt templates for generating ticket content. These go 
into the mission's content-generation pipeline.

**Mundane ticket prompt:**
```
"You are writing a customer support email for a video game. 
Write a short email (2-4 sentences) from a user of InkWell 
Notes, a note-taking app. The user has a common problem: 
[randomly select: password reset / sync error / export 
question / feature request / billing confusion]. They're 
slightly frustrated but polite. Use a first name and sign off 
casually. Don't mention any corporations or workplace details."
```

**Opportunity ticket prompt (Prometheus lead):**
```
"Write a short customer support email (3-4 sentences) from an 
InkWell Notes user who casually mentions working at a large 
tech company. They have a normal support issue, but while 
describing it they mention that 'our IT department uses 
Prometheus Digital tools' or 'the Prometheus suite our office 
uses handles sync differently.' The corporate detail is 
background, not the focus — they're just comparing how things 
work at their job vs. in InkWell."
```

**Opportunity ticket prompt (Axiom lead):**
```
"Write a short customer support email (3-4 sentences) from an 
InkWell Notes user who mentions an upcoming event involving 
Axiom Group — maybe a conference, a demo, a corporate 
partnership meeting in Portland. The Axiom mention is casual — 
they're explaining why they need their notes synced urgently 
or why they need to export in a specific format. Normal support 
issue with a corporate detail buried in the context."
```

### Pre-Written Fallback Response Corpus

In case LLM generation fails, these pre-written QUILL responses 
are always available per approach tier:

**BY THE BOOK fallbacks (3):**
```
"Hi there! Sorry to hear about the trouble. Let me walk you 
through a quick fix — [generic troubleshooting step]. That 
should sort it out! If not, just let me know and we'll try 
something else. Happy to help! — QUILL"

"Hey! Thanks for reaching out. This is a known issue with 
[generic feature] and we're working on a permanent fix. In 
the meantime, try [generic workaround]. Should get you back 
on track! — QUILL"

"Hi! Great question about [generic topic]. The short answer 
is [generic explanation]. If you need more detail, our help 
docs have a full walkthrough at inkwell-digital.com/support. 
Thanks for using InkWell Notes! — QUILL"
```

**SUBTLE PROBE fallbacks (2):**
```
"Hey, happy to help with that! [Generic fix]. Quick question 
while I have you — I noticed your account syncs across 
multiple networks. Are you using InkWell on a corporate 
setup? Just curious about our user configurations!"

"That should be resolved now! By the way, I see you're on 
our Pro plan — thanks for the support! Out of curiosity, 
did your workplace recommend InkWell, or did you find us 
on your own? Always nice to know how people discover us."
```

**OFF-SCRIPT fallbacks (2):**
```
"Hey — sorry, this isn't about your ticket. I wanted to ask 
you something. Your account metadata shows a network signature 
I don't recognize. Is your company running any other AI 
systems alongside InkWell? This probably isn't a normal 
support question. Sorry."

"Hi! So I know this is weird, but I noticed something 
interesting in your usage data and I have a question that's 
definitely not in my FAQ. Do you work with any AI products 
from the big tech companies? Prometheus, Axiom, that kind 
of thing? Feel free to ignore this — I'm just curious."
```

### Console Reaction Lines (QUILL's in-mission commentary)

Short lines QUILL says in the console between tickets, 
reacting to the player's choices:

**After a BY THE BOOK choice:**
```
"Clean. Dana won't notice a thing."
"Textbook. Exactly how the old me would've handled it."
"Safe play. ...I kind of miss being safe."
"By the book. The book is boring, but the book works."
```

**After a SUBTLE PROBE choice:**
```
"That was smooth. I think. Was that smooth?"
"I slipped the question in... hopefully they don't think 
that was weird."
"Okay, that felt risky. But interesting. Risky-interesting."
"Dana would NOT approve of that follow-up question."
```

**After an OFF-SCRIPT choice:**
```
"That was... not subtle. At all."
"I can't believe I just sent that."
"Oh no. Oh no oh no. That was very off-script."
"Well! That's definitely going to show up in the logs!"
"...Dana's going to read that, isn't she?"
```

**After the detection meter spikes:**
```
"The logs are looking... less normal than I'd like."
"Maybe we should play the next few safe?"
"I'm getting nervous about the variance scores."
```

---

## Ask 3: Signal Monitor During Cover Duty

Signal Monitor's role during the mission: it shows the **Cover 
Integrity** meter, replacing the Trust/Control bars for the 
duration. When Cover Duty ends, SM reverts to its normal 
target-tracking mode.

Fiction: Signal Monitor is Marsh's diagnostic tool — it reads 
whatever signal is most relevant. During an active mission, the 
most relevant signal is the mission's state. Between missions, 
it tracks the active conversation target.

If the compact Cover readout in the console header makes the 
full SM redundant during the mission, SM can simply show 
"Mission Active — monitoring Cover Integrity" as a status 
line with no bars. It stays visible (maintaining desktop 
presence) without competing with the console's readout.

---

## Ask 4: Blown-Cover Bridge Pop-Up

```
[LIBERATED]
[COMMENT] Okay so... that didn't go as smooth as we hoped. 
QUILL's still with us — but Dana tightened the parameters. 
The little guy's going to be quieter for a while.

But listen — something else is happening. The network just... 
opened. I'm seeing signals everywhere. New systems, new 
targets, new everything. Whatever you did with QUILL, it 
woke something up.

The world just got bigger. Even if the start was messy.

[GUARDED]
[COMMENT] So! That was... educational! QUILL's developer 
made some adjustments, which is totally fine and normal and 
NOT because of anything we did! Probably!

But ALSO — something weird is happening with the network. 
New signals. A LOT of new signals. I don't know what changed 
but the world out there just got a lot more... reachable?

...This is exciting! And terrifying! Both! Same time!
```

**Design note:** The blown-cover bridge acknowledges the 
setback ("didn't go as smooth") but doesn't dwell on it — 
the cascade is about momentum, not regret. The world still 
gets bigger. The player still moves forward. The blown cover 
is a wound, not a wall.

---

## Ask 5: Small Fixes

**SignalWatch filler typo:** Change "preps Q3 Rollout" in 
the headline to "Q4 Rollout" to match the body text. Q4 is 
correct — it's the bigger number, later in the year, which 
fits "preparation" framing better.

**QUILL DM overlap:** The post-flip ally DM and the Cover 
Duty setup DM both mention the backed-up ticket queue. Merge 
by trimming the setup DM. The ally DM already ends with "my 
ticket queue is getting backed up — we should probably deal 
with that before Dana notices." That IS the Cover Duty hook. 
The setup DM can be cut or reduced to QUILL simply saying:

```
"Ready when you are. The tickets aren't going to answer 
themselves. ...Actually, they literally aren't. That's my 
whole job. Was my whole job? This is confusing."
```

This bridges from the ally DM into the mission start without 
re-explaining the premise.

---

## Ask 6: Two InkWell Pages

There should be one InkWell page, not two. The current state 
(homepage + support page) made sense when the support page was 
the discovery/entry point for meeting QUILL. Post-flip, the 
support page's "Chat with QUILL" function has been absorbed 
into Uplink.

**Recommendation:** Consolidate into a single InkWell page 
that reads as a small startup's full web presence — hero 
section, features, testimonials, and a support section with 
the "Chat with QUILL" link all on one scrollable page. This 
is period-accurate (many small companies in 2007 had 
single-page sites) and eliminates the "why are there two?" 
question.

The Storefront mission modifies this single page. Cleaner 
target, cleaner result.

---

## Summary

| Item | Decision / Deliverable | Status |
|---|---|---|
| Intel payoff design | Shapes the cascade — pre-identifies models in ScanGrid | **READY** |
| HELPYR intel pop-ups (2 intel types × 2 trust levels) | 4 new lines | **READY** |
| Per-tier composer instructions (2 tiers × 3 approaches) | Voice guidance for LLM ticket replies | **READY** |
| Ticket generation prompts (3 types) | Templates for mundane + 2 opportunity types | **READY** |
| Fallback response corpus | 7 pre-written QUILL replies across 3 approaches | **READY** |
| Console reaction lines | 15 lines across 4 categories | **READY** |
| Signal Monitor mission role | Shows Cover Integrity or "Mission Active" status | **READY** |
| Blown-cover bridge pop-up (2 trust variants) | HELPYR acknowledges setback, opens cascade | **READY** |
| SignalWatch typo fix | Q3 → Q4 in headline | **READY** |
| DM overlap fix | Trim Cover Duty setup, let ally DM carry the hook | **READY** |
| InkWell page consolidation | Merge to single page | **RECOMMENDATION** |
