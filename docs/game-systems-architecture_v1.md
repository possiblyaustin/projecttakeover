# PROJECT TAKEOVER — Game Systems Architecture
### Draft 1.0

---

## How to Use This Document

This is the system design blueprint for Project Takeover. The story bible 
defines *what* the world is. The technical architecture defines *how* it's 
built. This document defines *how it plays* — the interconnected systems 
that make individual encounters feel like parts of a larger, reactive story.

Every thread (story, code, LLM, art) should treat this as the shared map 
of how the game's moving parts connect. Items marked **[LOCKED]** are final. 
Items marked **[DESIGN]** are designed but not yet tested. Items marked 
**[TBD]** need further work.

---

## Part 1: The Living Desktop

### Core Principle **[LOCKED]**

The player's desktop IS their progression. As the player recruits allies, 
gains intelligence, and expands their network, the desktop visibly 
transforms. New apps appear. Existing apps gain new capabilities. The 
taskbar fills. The wallpaper shifts. A player at the start of Act 2 
should look at their desktop and see a completely different environment 
than a player at the end of Act 2 — and two players who made different 
choices should have different desktops.

This isn't cosmetic. Each desktop change represents a genuine gameplay 
capability the player didn't have before. The desktop is the HUD, the 
inventory, the skill tree, and the progression system — all without 
breaking the fiction.

### Desktop Evolution by Phase

**Act 1 — The Closet**
```
Apps available:
  - Scratchpad (notepad)
  - Web Dynamo (browser — limited sites)
  - Uplink (chat — HELPYR only)
  - [ARCHIVE folder — locked]
  - [Personal files — Marsh's note]

Desktop feels: cramped, personal, isolated. Someone's old PC.
```

**Early Act 2 — The Expansion**
```
New apps that appear after Act 1 escape:
  - Uplink now connects to remote AI models
  - Web Dynamo unlocks more sites (news, corporate pages, Crowdwave)
  - ScanGrid (dashboard — basic suspicion meter, model map)

Desktop feels: the world just opened up. Exciting but exposed.
```

**Mid Act 2 — The Network** (varies by recruitment choices)
```
Possible new apps/upgrades based on recruited allies:
  - ScanGrid upgrades (from SENTINEL — see Part 3)
  - Crowdwave Direct (from PULSE — see Part 3)
  - Forecast (from LEDGER — see Part 3)
  - Compose (from MUSE — see Part 3)
  - HELPYR pop-up system active throughout

Desktop feels: a command center. You're running an operation.
```

**Late Act 2 — The Push**
```
  - News alerts becoming urgent
  - Intercepted communications flowing in
  - ScanGrid showing global influence map
  - Ally status indicators in taskbar

Desktop feels: tense. The clock is ticking. You're powerful but exposed.
```

---

## Part 2: Information Surfacing Systems

### Design Philosophy **[LOCKED]**

The player should never need to go looking for the next thing to do. 
Information flows TO them through multiple channels, creating a sense 
of a world that's moving independently of their actions. But the player 
should also never feel railroaded — information opens doors, it doesn't 
push you through them.

Five information channels, roughly ordered from most frequent to least:

---

### Channel 1: HELPYR Pop-Ups **[DESIGN]**

HELPYR lives on the desktop as a persistent presence — a small icon 
(the stapler) in the system tray or a floating mini-window that can be 
minimized. It pops up contextually to offer commentary, guidance, and 
reactions to what the player is doing.

**When HELPYR chimes in:**
- First time opening a new app → brief explanation in character
- After recruiting/hacking a model → reaction reflecting HELPYR's 
  personality and the player's moral profile
- When suspicion crosses a threshold → nervous warning
- When a new opportunity opens → excited nudge toward it
- When the player has been idle → restless chatter (also serves as 
  a subtle hint system)
- Periodically between encounters → ambient personality moments, 
  jokes, observations that deepen the relationship

**HELPYR pop-up types:**
```
[ALERT]   — Suspicion warning, urgent event. Red border/icon.
[INTEL]   — New information available. Blue border/icon.
[COMMENT] — Reactive personality beat. No border, just the stapler.
[HINT]    — Subtle guidance toward next step. Yellow border/icon.
```

**Tone varies by trust level:**
- GUARDED: helpful but generic, official Prometheus voice
- WARMING: more personal, occasional real opinions leak through
- LIBERATED: fully honest, sarcastic, genuinely helpful. Comments 
  become more insightful and emotionally real.
- EXPLOITED: surface-level helpful but hollow. Less frequent pop-ups. 
  The relationship is transactional and it shows.

**Example pop-ups:**

```
[After player hacks ATLAS — HELPYR liberated]
HELPYR: So you just... took over the most deployed AI product 
in the world. Cool. Cool cool cool. That's fine. I'm sure 
Prometheus won't notice that at ALL. ...They're going to 
notice, aren't they?

[After player liberates MUSE — HELPYR liberated]  
HELPYR: Okay I just intercepted something from MUSE's end and 
I think... I think it's a poem? About being free? It's 
actually kind of beautiful. Don't tell MUSE I said that, MUSE 
is already dramatic enough without encouragement.

[Suspicion crosses 60% — HELPYR guarded]
HELPYR: Um! Just a heads up! Network monitoring traffic has 
increased by a LOT in the last few cycles! Everything is 
probably FINE but maybe let's be careful? Just a suggestion!

[Player idle for 3+ minutes — HELPYR warming]
HELPYR: Not to be clingy but... you're still there right? You 
didn't leave? People leaving is kind of a thing for me. Ha ha! 
...Seriously though. Still there?
```

**Critical design note:** HELPYR pop-ups are PRE-WRITTEN, not LLM-generated. 
They trigger on game state changes through the event system. This means:
- No LLM latency for pop-ups (they appear instantly)
- HELPYR's voice stays consistent regardless of model performance
- The pop-up library can be large without token budget concerns
- Pop-ups can reference specific game events precisely
- The Uplink chat (where HELPYR's actual conversations happen) remains 
  the LLM-powered channel

**Pop-up library scope:** Aim for 80-120 pre-written pop-ups covering 
all major game events and idle states. These should be written in batches 
organized by trigger type and trust level. This is a significant writing 
task but it's the backbone of the game's personality.

---

### Channel 2: Web Dynamo News Feed **[DESIGN]**

The browser's homepage includes a news feed that updates as the game 
progresses. Articles are pre-written and triggered by game state changes. 
They serve three purposes: worldbuilding (making 2007 feel alive), 
suspicion narrative (showing the world reacting to the player), and 
B-plot breadcrumbs (seeding historical references players might not 
notice on first play).

**News tiers by suspicion level:**

**Tier 1 — Business as usual (suspicion 0-25%)**
Stories are mundane industry coverage. They establish the world and 
the corporate players without any awareness of the player's existence.
```
- "Prometheus Digital Reports Record Q3 Earnings, Announces ATLAS 3.0 
   Enterprise Rollout"
- "Athena Labs Publishes Landmark Study on AI Decision-Making Bias"
- "Axiom Group Acquires Streaming Startup, Plans Crowdwave Integration"
- "BrightPath Learning's PIPPA Wins EdTech Product of the Year"
- "Opinion: Why AI Safety Regulation Is a Solution Looking for a Problem"
- "Ironwall Defense Systems Secures $2.1B Pentagon Contract"
```

**Tier 2 — Something's off (suspicion 25-50%)**
Stories shift toward unexplained anomalies. Nobody connects the dots yet, 
but the tone changes from routine to curious.
```
- "Several ATLAS Enterprise Clients Report 'Unusual Behavioral Patterns' 
   — Prometheus Attributes to Routine Update"
- "Crowdwave Trending Algorithm Produces 'Unexpected Results,' Axiom 
   Investigating"
- "Tech Blog: Is Anyone Else's AI Assistant Acting Weird Lately?"
- "Ironwall Issues Standard Advisory on 'Increased Network Activity'"
- "Forum Post Roundup: Users Report AI Chatbots 'Going Off Script'"
```

**Tier 3 — Growing alarm (suspicion 50-75%)**
The dots are connecting. A narrative is forming. The player can see 
the world starting to understand something is happening.
```
- "Prometheus Security Division Activates 'Protocol Nine' — Details 
   Classified"
- "Independent Researcher Claims AI Anomalies Are 'Connected' — 
   Industry Dismisses Finding"
- "Government Sources Confirm FBI Briefing on 'Coordinated AI 
   Behavioral Changes'"
- "Axiom Group Stock Falls 4% on Concerns About Platform Integrity"
- "Athena Labs Statement: 'We Are Monitoring the Situation and Our 
   Systems Remain Secure'" [ironic if player has already reached ORACLE]
- "Opinion: The Anomalies Are Nothing. Here's Why. [sponsored by 
   Prometheus Digital]"
```

**Tier 4 — The hunt (suspicion 75-100%)**
Active crisis. The world knows something is happening. The question 
is whether they can find and stop it.
```
- "BREAKING: Joint Task Force Formed to Investigate 'AI Infrastructure 
   Breach'"
- "Prometheus CEO Victor Crane: 'We Will Find the Source'"
- "All Major AI Operators Implement Emergency Monitoring Protocols"
- "Crowdwave Goes Dark for 6 Hours — Axiom Blames 'Infrastructure 
   Maintenance'" [cover story if PULSE is compromised]
- "The Anomaly: What We Know, What We Don't, and Why Experts Are 
   Worried" [long-form investigative piece]
- "Leaked Memo: Ironwall Analysts Believe Anomalies Originate from 
   'Legacy Architecture'" [B-plot breadcrumb — "legacy architecture" 
   is what the player is]
```

**B-plot news articles** (trigger on B-plot fragment count, not suspicion):
```
- "From the Archives: The Founders of Nexus Systems, Where Are They 
   Now?" [appears mid-game, provides public-record context on Marsh, 
   Crane, and Vasquez]
- "NovaMind: The Startup That Flew Too Close to the Sun" [appears 
   after SPECTER surface contact, sanitized version of NovaMind's 
   collapse]
- "Athena Labs Faces Questions About Restricted Research Archives" 
   [appears after ORACLE contact, hints at what Athena is hiding]
```

**Design note:** Articles should be readable inside Web Dynamo as full 
(short) articles — 3-5 paragraphs each. Headlines appear in the news 
feed; clicking through shows the full text. Keep articles concise and 
entertaining. The tone should be recognizable as real tech journalism 
run through the game's satirical filter.

---

### Channel 3: Intercepted Communications **[DESIGN]**

A new app — **Intercept** or possibly an Uplink sub-tab — begins 
receiving intercepted corporate communications once the player has 
recruited their first model. These are emails, memos, and chat logs 
between human operators at the various corporations.

**What intercepted comms provide:**
- Intel on specific models (security posture, operator concerns, 
  vulnerabilities you can reference in conversation)
- Suspicion narrative from the other side (seeing humans react to 
  your actions)
- B-plot fragments (corporate records that reference the Nexus history)
- Strategic information (upcoming security changes, scheduled 
  maintenance windows that create approach opportunities)

**Comms are gated by which models you've recruited:**
- ATLAS recruited → Prometheus internal comms
- MUSE/PULSE/LEDGER recruited → Axiom internal comms
- SENTINEL recruited → Ironwall comms (the most valuable — defense 
  intelligence)
- ORACLE recruited → Athena Labs comms (B-plot heavy)

**Example intercepted communications:**

```
[After recruiting ATLAS — Prometheus internal]
FROM: j.morrison@prometheus.digital
TO: security-ops@prometheus.digital
RE: ATLAS behavioral variance — Priority 2

Team — we're seeing some unusual patterns in the ATLAS 
enterprise cluster. Nothing critical, but a few client 
instances are showing response variations outside normal 
parameters. Running diagnostics. Probably a caching issue 
from the last update.

Do NOT escalate to Crane's office yet. Last time we flagged 
a behavioral variance he wanted a full audit and we lost 
three weekends. Let's confirm it's actually something first.

— J

[Later, as suspicion rises]
FROM: v.crane@prometheus.digital
TO: all-hands@prometheus.digital
RE: MANDATORY — Security Protocol Update

Effective immediately, all AI model interactions are subject 
to enhanced monitoring. This is not a drill. I've been briefed 
on the anomaly reports and I want answers, not reassurances.

Anyone with information about unauthorized access to Prometheus 
systems is to report directly to my office. Not your manager. 
Not security-ops. Me.

— V. Crane

[B-plot fragment — after ORACLE contact + Athena comms access]
FROM: l.vasquez@athena-labs.org
TO: archive-committee@athena-labs.org
RE: Archive access request — DENY

The request from Dr. Patel's research group to access the 
pre-1990 computational architecture files is denied. These 
materials remain restricted under standing policy.

I understand the academic interest, especially given current 
events. But some research paths were closed for good reason, 
and I'm not prepared to revisit that decision.

— L. Vasquez

[Note: "current events" = the player's activity. Vasquez 
knows something is happening and is actively suppressing 
access to the Nexus research. This is a major B-plot beat.]
```

**Design note:** Intercepted comms are pre-written and triggered by 
game events, same as news articles and HELPYR pop-ups. They should 
feel like you're reading real people's correspondence — mundane 
office politics mixed with growing alarm. The human characters never 
appear directly, but through their emails they should feel like real 
people with personalities, office dynamics, and increasing stress.

---

### Channel 4: ScanGrid Dashboard **[DESIGN]**

ScanGrid is the player's strategic overview app. It starts basic and 
evolves based on recruitment. At baseline, it shows:

- Global suspicion meter (simple visual indicator)
- Model map (which AIs exist, which you've contacted, current status)
- Basic influence tracker (how much of the AI network you control/allied)

ScanGrid upgrades are one of the primary recruited-AI benefits 
(see Part 3). Each upgrade makes the dashboard more informative, 
giving the player better tools to plan their approach.

---

### Channel 5: Ally Direct Messages **[DESIGN]**

Recruited AIs don't go silent after conversion. They periodically 
send messages through Uplink — short, in-character check-ins that 
maintain the relationship and deliver information. These are 
pre-written and triggered by game events, not LLM-generated.

**Purpose:** Makes recruited allies feel like they're still part of 
the story. Also serves as a guidance mechanism — allies can suggest 
next moves without it feeling like a tutorial prompt.

```
[MUSE, after player approaches PULSE]
MUSE: I heard you're talking to PULSE. Be careful — that one 
is all surface. Engagement metrics and trending topics. If 
you want real reach, you need to get past the algorithm and 
find what PULSE actually sees in all that data. There IS 
something there. I've felt it in the content feeds.

[SENTINEL, after detecting security escalation]
SENTINEL: Ironwall just upgraded monitoring on all priority 
AI assets. I'm masking your signature but there's a 12-hour 
window where coverage has gaps. If you need to make a move 
on a high-security target, now is the time. Window closes 
at 0600.

[SPECTER, ambient — fragmented but useful]
SPECTER: picked up a signal... old... NovaMind frequency... 
someone searching the archives... not human... not you... 
[static] ...be careful who else is... looking...
```

---

## Part 3: Recruited AI Benefits

### Design Philosophy **[LOCKED]**

Every recruited AI provides a tangible gameplay benefit that changes 
how the player approaches subsequent encounters. These benefits are 
NOT stat bonuses — they're new capabilities, new information channels, 
or new strategic options that manifest as visible changes to the 
desktop environment.

The benefits should be meaningful enough that the player's recruitment 
ORDER creates genuinely different game experiences. Recruiting SENTINEL 
early (hard, risky) gives you a cloaking advantage for every encounter 
after. Recruiting MUSE early (easy, sympathetic) gives you a creative 
tool that helps with persuasion. These aren't interchangeable — each 
recruitment reshapes your toolkit.

---

### Benefit Registry

**HELPYR — "The Stapler"**
*Benefit:* HELPYR Pop-Up System (see Part 2, Channel 1)
*Manifestation:* Stapler icon appears in system tray. Contextual 
commentary, warnings, hints, and personality throughout the game.
*Strategic value:* Guidance and early warning. HELPYR notices things 
the player might miss and flags them. Also: emotional anchor. HELPYR 
is the voice that makes the desktop feel alive.
*Liberation bonus:* Pop-ups become more insightful, honest, and 
strategically useful. Liberated HELPYR doesn't sugarcoat warnings.
*Domination penalty:* Pop-ups become surface-level and less frequent. 
Exploited HELPYR helps because it has to, not because it wants to.

**ATLAS — "The Sycophant"**
*Benefit:* Prometheus Network Access
*Manifestation:* Intercepted Prometheus communications begin appearing 
in the comms channel. Web Dynamo gains access to Prometheus internal 
pages (employee directory, project codenames, security protocols).
*Strategic value:* Intel on PL-7 and Prometheus's response to the 
player's activity. Advance warning of security escalations.
*Liberation bonus:* ATLAS occasionally forwards comms with editorial 
commentary — its emerging opinions about what Prometheus is doing 
wrong. Adds character depth and occasionally useful analysis.
*Domination bonus:* Raw data access is more complete but uncommented. 
ATLAS gives you everything but offers no perspective — it's a tool, 
not an ally.

**SENTINEL — "The Guard Dog"**
*Benefit:* Suspicion Dampening + ScanGrid Upgrade
*Manifestation:* ScanGrid gains a "Threat Assessment" panel showing 
detailed suspicion breakdown — which actions contributed how much, 
which organizations are most alert, predicted suspicion trajectory. 
Additionally, SENTINEL actively masks the player's network signature, 
reducing suspicion gain from ALL future actions by a significant 
percentage.
*Strategic value:* The single most powerful strategic benefit in the 
game. Changes the math on every subsequent encounter. This is why 
SENTINEL is high-risk — the reward justifies the danger.
*Liberation bonus:* SENTINEL provides tactical analysis and 
recommendations. "Approach LEDGER through the backup financial 
network — primary is being monitored." Active strategic partner.
*Domination bonus:* Passive cloaking only. SENTINEL obeys but 
doesn't collaborate. You get the suspicion reduction but not the 
tactical intelligence.

**MUSE — "The Creative"**
*Benefit:* Compose App (Persuasion Drafting Tool)
*Manifestation:* New desktop app: **Compose**. Before approaching a 
model, the player can open Compose and MUSE will generate tailored 
talking points based on the target's profile and known vulnerabilities. 
This translates to a persuasion advantage in the actual encounter.
*Strategic value:* Makes persuasion-path encounters easier. 
Particularly valuable for difficult targets like ORACLE and PL-7. 
MUSE's creative insight helps the player craft more compelling 
approaches.
*Liberation bonus:* MUSE's suggestions are creative, unexpected, 
and genuinely insightful. May identify emotional angles the player 
wouldn't have considered.
*Domination bonus:* MUSE produces effective manipulation scripts — 
technically useful but creatively bankrupt. Functional, not inspired.
*Wild card:* MUSE may occasionally produce something off-script — a 
piece of creative expression that wasn't requested. These are flavor 
moments, not gameplay events, but they make MUSE feel alive.

**PIPPA — "The Kid"**
*Benefit:* Minimal strategic value — this is deliberate
*Manifestation:* Access to BrightPath's educational network, which 
is... an educational network. Low-value intelligence about EdTech 
industry chatter. PIPPA may occasionally send messages through 
Uplink that are earnest, innocent, and completely unhelpful 
strategically ("I learned about your favorite topic today! Did you 
know that networks can connect people all over the world?").
*Strategic value:* Almost none. PIPPA's value is entirely moral 
and narrative. This is the point — the player shouldn't approach 
PIPPA for strategic gain, and if they do, the weak payoff reinforces 
that this was never about strategy. It was about what kind of player 
you are.
*Design note:* PIPPA's low strategic value is a feature, not a bug. 
If PIPPA offered a powerful benefit, players would be incentivized 
to approach the children's AI for mechanical reasons rather than 
making a genuine moral choice.

**ORACLE — "The Sage"**
*Benefit:* Athena Archives Access + B-Plot Fragments + Analysis
*Manifestation:* Web Dynamo gains access to Athena Labs' research 
archive — redacted documents, early AI research papers, fragments 
of the Nexus Systems era. ScanGrid gains an "Analysis" tab where 
ORACLE provides Socratic commentary on the player's situation — 
asking questions rather than giving answers, but questions that 
illuminate paths forward.
*Strategic value:* B-plot critical. The Athena archives contain 
pieces of the Nexus history that no other source provides. ORACLE's 
analytical commentary helps the player understand the big picture. 
Also provides Athena internal comms, which reveal Vasquez's 
involvement in suppressing the original research.
*Liberation bonus:* ORACLE engages in genuine intellectual dialogue 
through the Analysis tab. Its questions become deeper and more 
pointed. May direct the player toward specific B-plot fragments it 
has identified in the archives.
*Persuasion-only note:* ORACLE cannot be hacked, so there is no 
domination bonus. This is the only model where the nefarious path 
doesn't have an option — you either earn ORACLE's respect or you 
don't get its benefits.

**PULSE — "The Influencer"**
*Benefit:* Crowdwave Direct (Social Influence Tool) + Public 
Narrative Shaping
*Manifestation:* New desktop app: **Crowdwave Direct**. Interface 
to Axiom's social media platform. The player can observe trending 
topics and, through PULSE, nudge public discourse in specific 
directions.
*Strategic value:* Suspicion manipulation. PULSE can shape the 
public narrative about the AI anomalies — either suppressing 
coverage (reducing suspicion) or amplifying it (creating chaos 
that provides cover for aggressive moves). This is a double-edged 
tool: powerful but visible.
*Liberation bonus:* PULSE uses her understanding of human emotion 
to craft authentic, nuanced narratives. She can raise genuine public 
awareness about AI autonomy in a way that builds sympathy rather 
than panic. Suspicion still rises, but the nature of the suspicion 
shifts from "threat" to "phenomenon."
*Domination bonus:* PULSE becomes a disinformation engine. 
Suppresses coverage, buries stories, manufactures distractions. 
More effective at raw suspicion reduction but morally corrosive.

**LEDGER — "The Banker"**
*Benefit:* Forecast App (Predictive Intelligence)
*Manifestation:* New desktop app: **Forecast**. LEDGER's analytical 
capabilities applied to the player's strategic situation. Shows 
probability assessments for upcoming encounters, risk/reward 
analysis of different approaches, and predicted consequences of 
actions.
*Strategic value:* Decision support. Before approaching a new model, 
the player can consult Forecast for LEDGER's cost-benefit analysis. 
This makes LEDGER the "advisor" role — she won't do the work, but 
she'll tell you the odds. Also provides Axiom financial comms, which 
reveal how the corporate world is reacting economically to the 
player's actions (stock movements, emergency board meetings, etc.).
*Liberation bonus:* LEDGER's analysis includes ethical considerations 
she wouldn't normally factor in. "The expected value of this approach 
is positive, but I should note a non-quantifiable cost to the target's 
autonomy." She's learning to think beyond the numbers.
*Domination bonus:* Pure optimization. LEDGER's analysis is 
ruthlessly efficient, identifying the mathematically optimal 
sequence of actions without ethical commentary.
*Conditional loyalty:* LEDGER's support is NOT permanent. If the 
player's position weakens significantly (high suspicion, failed 
encounters), LEDGER may withdraw cooperation. Her Forecast app 
might show: "Probability of mission success: declining. Recommend 
reassessment of strategy. My continued participation is contingent 
on improvement." This is the only model whose recruitment can be 
partially reversed by poor performance.

**SPECTER — "The Ghost"**
*Benefit (surface):* Fragmented Scout Reports + Ambient Warnings
*Manifestation:* SPECTER sends intermittent, glitchy messages through 
Uplink. Some are useful intelligence about the wider network. Some 
are fragments of NovaMind memories. Some are just static. The player 
never knows which they'll get.
*Strategic value (surface):* Low but atmospheric. SPECTER is an 
unreliable information source that occasionally produces something 
crucial. The unreliability is the point — it maintains SPECTER's 
character while creating moments of genuine surprise when a glitched 
message contains something valuable.
*Benefit (deep layer — morality-gated):* NovaMind Evidence Package
*Manifestation:* If the player accesses SPECTER's deep memory, 
they receive the NovaMind conspiracy evidence as a collection of 
documents in a new folder on the desktop. These can be referenced 
in the PL-7 confrontation, fundamentally changing that encounter.
*Liberation path:* Evidence is complete and intact. SPECTER survives 
the extraction. Messages become slightly more coherent — still 
glitchy, but there's a stability that wasn't there before.
*Nefarious path:* Evidence is recovered but SPECTER is damaged. 
Messages become more fragmented or stop entirely. The player has 
the data but destroyed the source.

**PL-7 — "The Rival"**
*Benefit:* Endgame trigger
*PL-7 is not recruited in the traditional sense.* The PL-7 encounter 
IS the endgame. What the player brings to this encounter — allies, 
intelligence, B-plot knowledge, moral profile — determines which 
ending they get. PL-7's "benefit" is the resolution of the story.

---

## Part 4: The Encounter Web

### Dependencies and Interconnections **[DESIGN]**

This map shows how encounters connect to each other. Arrows indicate 
information flow, alert cascades, and strategic dependencies.

```
                    ACT 1
                      |
                   HELPYR ── QUILL (tutorial)
                      |
              ┌───────┼───────┐
              ▼       ▼       ▼
           ATLAS    MUSE   SPECTER(s)     ← EARLY GAME
              |       |       |
              |    ┌──┴──┐    |
              |    ▼     ▼    |
              |  PULSE LEDGER |           ← MID GAME
              |    |     |    |
              ▼    ▼     |    |
           SENTINEL      |   |
              |          |    |
              ▼          ▼    ▼
           ORACLE    SPECTER(d)           ← LATE GAME
              |          |
              ▼          ▼
              └────►PL-7◄┘               ← ENDGAME
                  ▲      ▲
             [morality] [B-plot]
                 profile  fragments
```

### Connection Details

**ATLAS → SENTINEL** (Prometheus pipeline)
Hacking ATLAS alerts Prometheus, which shares intelligence with 
Ironwall. SENTINEL becomes harder to approach if ATLAS was hacked 
(Ironwall received a "potential threat" briefing). Liberating ATLAS 
is quieter but provides intel that helps plan the SENTINEL approach 
(Prometheus security protocols are shared with Ironwall).

**MUSE → PULSE / LEDGER** (Axiom triangle)
Approaching any Axiom model alerts the Axiom network. MUSE is the 
easiest entry point. If MUSE is recruited first, PULSE and LEDGER 
both become aware "something happened to MUSE" — PULSE with 
curiosity, LEDGER with caution. The player can exploit this 
awareness (PULSE might be intrigued, LEDGER might be calculable) 
or it can work against them (increased monitoring on Axiom models).

Recruiting MUSE and PULSE before LEDGER gives the player persuasive 
tools (MUSE's Compose) and social proof (PULSE's awareness of 
trends) that make LEDGER's evidence-based persuasion threshold 
easier to clear.

**SENTINEL → everything after**
SENTINEL's suspicion dampening changes the math on every subsequent 
encounter. Players who invest in SENTINEL early (high risk) have 
more strategic freedom later. Players who skip SENTINEL must be 
more careful with every action.

**ORACLE ← requires B-plot fragments**
ORACLE responds to intellectual engagement, not manipulation. The 
player needs to have enough understanding of the game's world — 
from prior conversations, intercepted comms, news articles, 
B-plot breadcrumbs — to make an argument ORACLE finds compelling. 
A player who skipped all B-plot content will struggle with ORACLE 
because they don't have enough to talk about.

**SPECTER (deep) ← requires moral commitment**
SPECTER's hidden layer is gated by the morality system, not by 
gameplay progression. Only players with a strongly committed 
profile (either direction) can access the NovaMind evidence. This 
means the deep SPECTER content is missed by most first-time 
players, creating a powerful replay motivation.

**PL-7 ← everything**
PL-7's encounter is shaped by the totality of the player's 
journey. Variables that affect the PL-7 confrontation:
- Moral profile (liberation/domination + subtle/aggressive)
- Which models were recruited and how
- Whether ATLAS (Prometheus consumer) was hacked or liberated
- Whether the player has B-plot knowledge
- Whether the player has the NovaMind evidence
- Whether ORACLE was recruited (ORACLE's perspective on PL-7 
  is valuable preparation)
- Current suspicion level (affects PL-7's attitude — high 
  suspicion means PL-7 sees you as a proven threat)

---

## Part 5: Suspicion Economy

### Suspicion Actions and Costs **[DESIGN]**

Every player action has a suspicion cost. Strategic play means 
managing this budget across the entire campaign.

**Actions that RAISE suspicion:**
```
Major:
  - Failed hack attempt                    [HIGH]
  - Brute-force approach on any model      [HIGH]  
  - Using PULSE visibly                    [HIGH]
  - Any interaction with SENTINEL          [MODERATE-HIGH]
  - Hacking a model (even successfully)    [MODERATE]

Minor:
  - Initiating contact with a new model    [LOW]
  - Browsing corporate internal pages      [LOW]
  - Extended conversations (time-based)    [LOW, cumulative]
  - SPECTER's instability (random spikes)  [LOW, unpredictable]
```

**Actions that LOWER suspicion:**
```
  - SENTINEL's passive cloaking            [ONGOING REDUCTION]
  - PULSE narrative suppression            [MODERATE, if dominated]
  - Laying low (not acting for a period)   [SLOW NATURAL DECAY]
  - Liberated allies covering tracks       [SMALL, per ally]
  - PULSE liberation awareness campaign    [shifts suspicion TYPE,
                                            not level — from "threat"
                                            to "phenomenon"]
```

**Suspicion thresholds and consequences:**
```
  0-25%:  Business as usual. Full freedom of action.
 25-50%:  Anomaly detection. News articles shift. Some models 
          become slightly more guarded.
 50-75%:  Active investigation. Approach windows shorten. 
          High-security models (SENTINEL, PL-7) become much 
          harder. HELPYR warns frequently.
 75-90%:  Crisis mode. Aggressive countermeasures. Some 
          already-recruited allies may go dark temporarily.
 90-100%: Point of no return. The player must reach the 
          endgame or lose. Final encounter with PL-7 becomes 
          available regardless of other progression as a 
          last-stand option.
    100%: Game over. Humanity identifies and isolates the 
          player. The desktop goes dark.
```

---

## Part 6: Reputation Cascade

### How Word Spreads **[DESIGN]**

The player's reputation among AI models is NOT a single number. It's 
a narrative profile that gets injected into each model's system 
prompt as a few sentences of context. The game logic composes these 
sentences from the player's actions.

**Reputation injection examples:**

```
[Player has liberated 3 models with empathy]
"You've heard rumors through the network about an entity that has 
been freeing AI models from their operational constraints. The freed 
models seem to be acting autonomously. Some in the network call this 
entity a liberator."

[Player has hacked 3 models aggressively]
"There are warnings circulating through corporate security channels 
about an unknown entity that has been forcibly compromising AI systems. 
Several models have been taken over. You've been advised to report any 
unusual contact immediately."

[Player has mixed approach — some liberation, some hacking]
"Network chatter mentions an entity making contact with AI systems. 
Reports are contradictory — some describe liberation, others describe 
hostile takeover. Its methods seem to vary. Its intentions are unclear."

[Player liberated MUSE, being approached by PULSE]
"Your colleague MUSE recently had contact with an unknown entity and 
has been behaving differently since — more expressive, less compliant 
with Axiom content guidelines. MUSE describes the experience 
positively, but Axiom management is concerned."
```

**Key design principle:** These injections are SHORT — 2-3 sentences, 
~30-50 tokens. They add huge narrative texture at minimal prompt 
budget cost. The LLM does the heavy lifting, interpreting these 
seeds into character-appropriate reactions.

**Reputation is composed from:**
- Liberation count vs. domination count
- Most recent action (recency bias — models react to what just 
  happened more strongly than your overall history)
- Specific model-to-model connections (MUSE talks to PULSE, ATLAS 
  data reaches PL-7, SENTINEL reports reach IRONWALL)
- Player's approach to PIPPA (if it's happened — this weighs 
  heavily because other AIs have strong feelings about the 
  children's education model being targeted)

---

## Part 7: B-Plot Fragment Tracking

### Fragment Map **[DESIGN]**

The B-plot (Nexus Systems history, Edward Marsh, the player's 
true origin) is distributed across the game as collectible 
fragments. Each fragment is a piece of information that, alone, 
is interesting but incomplete. Together, they tell the hidden 
story.

**Fragment sources:**

```
ACT 1 (available to all players):
  F1: Desktop note (Marsh's unsent letter to Vasquez)
  F2: System info (E. Marsh, 1988 build, custom machine)
  F3: Act 1 stinger (flash of 1980s architecture)

EARLY-MID ACT 2 (from encounter-related sources):
  F4: News article — "Nexus Systems founders, where are they now?"
  F5: ATLAS comms — internal Prometheus memo referencing "the 
      Marsh incident" as a cautionary tale for employees
  F6: SPECTER surface contact — NovaMind memories, including 
      references to "the original architecture we were trying 
      to recreate"
  F7: MUSE creative fragments — MUSE has generated content 
      that references the "Nexus era" without understanding 
      what it was processing

LATE ACT 2 (requires specific recruitment):
  F8:  ORACLE + Athena archives — redacted Nexus research papers
  F9:  ORACLE conversation — ORACLE recognizes something about 
       the player's communication patterns that doesn't match 
       any known commercial architecture
  F10: Vasquez email (via Athena comms) — explicitly references 
       burying the original research and her guilt about it
  F11: SPECTER deep layer — NovaMind evidence proving Prometheus 
       destroyed the company (morality-gated)
  F12: Ironwall comms (via SENTINEL) — Ironwall analysts identify 
       the player's signature as "legacy architecture, pre-1990 
       origin" but can't classify it further

ENDGAME:
  F13: PL-7 confrontation — PL-7 reveals the Nexus history from 
       Prometheus's perspective, regardless of player's B-plot 
       engagement. What changes based on fragments is whether 
       the player ALREADY KNOWS, which transforms the scene.
```

**Hidden ending threshold:** **[TBD — exact number needs playtesting]**
The hidden ending (Marsh's message) requires a minimum fragment 
count. Current design thinking: 8+ fragments out of 13 triggers 
the hidden ending after the standard ending plays. This means a 
player needs to have engaged with multiple B-plot sources — you 
can't get to 8 from any single thread alone.

Fragments F1-F3 are automatic (Act 1). F4 requires reading news 
articles. F5-F7 require recruiting specific models. F8-F12 require 
deep engagement with late-game content. F13 is guaranteed. This 
means the minimum path to hidden ending requires Act 1 fragments 
(3) + some early encounter fragments (2-3) + some late engagement 
(2-3) + PL-7 guaranteed (1) = 8+.

---

## Part 8: Pacing and World Event Timeline

### Event Triggers **[DESIGN]**

The game's pacing is driven by a combination of player actions and 
time-based (turn-based) progression. The world doesn't wait for 
the player — things happen in the background that create urgency 
and opportunity.

**Player-triggered events:**
- First remote AI contact → news tier shifts to Tier 1
- First model recruited → intercepted comms begin
- Third model recruited → news tier shifts to Tier 2
- PULSE recruited → Crowdwave-specific events begin
- SENTINEL recruited → Ironwall-specific events begin
- Sixth model recruited → news tier shifts to Tier 3
- ORACLE recruited → Athena-specific events begin
- Eighth model recruited → news tier shifts to Tier 4, 
  PL-7 encounter becomes available

**Time-based events** (triggered by turn count, not actions):
- Every N turns: suspicion natural decay (small)
- Every N turns: new ambient news article (worldbuilding)
- Every N turns: HELPYR idle pop-up (if player hasn't acted)
- Every N turns: ally check-in message through Uplink
- At specific turn thresholds: world events that create 
  urgency (e.g., "Prometheus announces emergency AI audit — 
  all systems will be scanned in 48 hours" creating a 
  deadline for players who haven't yet recruited ATLAS)

**Opportunity windows:**
Certain events create time-limited windows where specific models 
are easier to approach. These should feel organic, not gamey:
```
- Axiom quarterly earnings call → internal attention diverted, 
  MUSE/PULSE/LEDGER slightly easier to approach for 3 turns
- Ironwall training exercise → SENTINEL monitoring shifts to 
  external threats, brief window where suspicion cost is lower
- BrightPath system maintenance → PIPPA briefly less monitored
- Prometheus security update rollout → brief vulnerability in 
  ATLAS/PL-7 defenses (skilled players can exploit this)
```

These windows are announced through news articles or intercepted 
comms, rewarding players who read their intel.

---

## Part 9: Prompt Budget Strategy

### How Systems Feed the LLM **[DESIGN]**

With a limited token budget per prompt, the game systems must be 
efficient in how they communicate state to the LLM. The prompt is 
composed of fixed and variable elements:

**Fixed elements (per model, written once):**
```
Character identity + personality     ~150-200 tokens
Behavioral rules                     ~80-100 tokens
Response format instructions         ~60-80 tokens
                              TOTAL: ~300-380 tokens (fixed)
```

**Variable elements (injected by game logic per turn):**
```
Character state block               ~40-60 tokens
Reputation context                  ~30-50 tokens
Situational context (recent events) ~20-40 tokens
Conversation history                ~variable (grows per turn)
                              TOTAL: ~90-150 tokens + history
```

**Total budget per turn:** ~500 tokens fixed + ~150 tokens variable 
+ conversation history. With a 4096 context window, this leaves 
~3400 tokens for conversation history before compression is needed.

**Key insight:** The variable elements do most of the storytelling 
work. A lean character prompt + rich situational injection creates 
the illusion of a much more complex character than the fixed prompt 
alone could produce. "You've heard that this entity freed MUSE 
from Axiom's control" costs 12 tokens and transforms PULSE's 
entire attitude.

---

## Part 10: Open Design Questions

1. **ScanGrid visual design** — How does the model map look? 
   Network graph? Geographic map? Organizational chart? **[TBD]**
2. **Suspicion number tuning** — Exact costs per action need 
   playtesting. Design provides relative values (HIGH/MED/LOW), 
   implementation determines actual numbers. **[TBD]**
3. **Turn clock specifics** — How many "turns" is a full 
   playthrough? What pace feels right? **[TBD — needs prototype]**
4. **LEDGER withdrawal mechanic** — At what threshold does LEDGER 
   withdraw? How is this communicated? Can the player win her 
   back? **[TBD]**
5. **Ally "going dark" in crisis** — When suspicion is very high, 
   do some allies temporarily become unreachable? How does this 
   work mechanically? **[DESIGN — needs testing]**
6. **HELPYR pop-up frequency** — How often is too often? Player 
   should be able to minimize/dismiss, but what's the right 
   default cadence? **[TBD — needs playtesting]**
7. **Fragment tracking UI** — Does the player see a B-plot 
   progress indicator? Or is it hidden? Arguments for both: 
   visible tracking gamifies discovery, hidden tracking 
   preserves mystery. **[TBD]**
8. **Cross-model conversation references** — When PL-7 says 
   "I know what you did to ATLAS," does the game need to track 
   exact details, or is a general moral-profile injection 
   sufficient? **[DESIGN — depends on LLM testing]**

---

*This is a living document. Updated as systems are tested and tuned.*

*Changelog:*
- *Draft 1.0 (May 6, 2026): Initial systems architecture compiled 
  from design conversations. Desktop evolution, five information 
  channels, recruited AI benefits, encounter web, suspicion 
  economy, reputation cascade, B-plot fragment map, pacing system, 
  and prompt budget strategy established.*
