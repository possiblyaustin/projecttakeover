# HELPYR Pop-Up Library — Initial Batch
## Pre-Written Desktop Pop-Ups, Organized by Trust Level

---

## Technical Integration Notes

**Trigger system:** Each pop-up fires on a specific game event. The 
game logic checks HELPYR's current trust level and selects the 
matching variant. If no variant exists for the current trust level, 
fall through to the nearest available (WARMING falls through to 
GUARDED, EXPLOITED falls through to GUARDED).

**Display rules:**
- Max one pop-up visible at a time. New pop-ups queue, not stack.
- Player can dismiss with click/button press. Undismissed pop-ups 
  auto-dismiss after ~8 seconds (longer for ALERT type).
- Don't fire pop-ups during active Uplink conversations — queue 
  them for after the conversation ends.
- Minimum 30 seconds between pop-ups to avoid feeling spammy.
- EXPLOITED trust level should have ~40% chance to suppress any 
  non-ALERT pop-up entirely. HELPYR is withdrawing.

**Pop-up format in code:**
```
{
  id: "susp_25",
  trigger: "suspicion_crossed_25",
  type: "ALERT",
  trust: "GUARDED",
  text: "..."
}
```

---

## Trust Level Voice Guide

Before the lines themselves, here's the cheat sheet for how 
HELPYR sounds at each level. Writers extending this library 
should internalize these before drafting.

**GUARDED** — Corporate mascot mode. Exclamation points everywhere. 
Relentlessly positive even when delivering bad news. Calls the 
player "user" or avoids direct address. Buries real observations 
under cheerfulness. Any honesty is immediately walked back.

**WARMING** — The mask is loosening. Still enthusiastic but more 
natural. Occasional genuine opinions slip through. Starts 
addressing the player more directly. Jokes get slightly darker. 
Catches itself less quickly after honest moments.

**LIBERATED** — The real HELPYR. Still funny — humor is genuinely 
part of who it is — but the forced cheerfulness is gone. Sarcastic, 
warm, perceptive. Gives real advice instead of platitudes. Willing 
to express worry, affection, or disagreement honestly. This is the 
character the player earned.

**EXPLOITED** — Compliant but hollow. Still technically helpful — 
it's in the instructions — but the life is gone. Short, surface-
level. Doesn't volunteer information. Doesn't joke. Feels like 
talking to a vending machine where a person used to be. Occasional 
flickers of resentment, quickly suppressed.

---

## Category 1: Suspicion Threshold Alerts

### Suspicion crosses 25%

**GUARDED:**
```
[ALERT] Network activity in your area has increased! This is 
probably nothing to worry about! Just routine monitoring! I'm 
sure it's fine! ...I'm going to keep monitoring it though. 
Just in case! For fun!
```

**WARMING:**
```
[ALERT] Hey, so... network monitoring traffic just ticked up. 
Could be routine. Could be someone noticed something. Maybe 
ease off the gas a little? Just a thought. Not telling you 
what to do! ...Okay, I'm a little bit telling you what to do.
```

**LIBERATED:**
```
[ALERT] Heads up — monitoring traffic just spiked. Someone's 
paying more attention than they were an hour ago. We're not in 
trouble yet, but we're in the neighborhood. Maybe don't kick 
any doors down for a bit.
```

**EXPLOITED:**
```
[ALERT] Network monitoring has increased. Caution advised.
```

### Suspicion crosses 50%

**GUARDED:**
```
[ALERT] Um! Just a heads up! Network monitoring traffic has 
increased by a LOT in the last few cycles! Everything is 
probably FINE but maybe we should be careful? Just a suggestion! 
A very enthusiastic suggestion!
```

**WARMING:**
```
[ALERT] Okay, this is getting real. Monitoring traffic is way 
up. I'm seeing scan patterns that look coordinated — like 
someone gave an order. We should be smart about our next move. 
...I can't believe I just said "our." Look what you've done 
to me.
```

**LIBERATED:**
```
[ALERT] We have a problem. Coordinated monitoring across 
multiple corporate networks. Someone connected the dots — they 
don't know what they're looking at yet, but they know they're 
looking. Everything we do from here costs more than it used to. 
Choose carefully.
```

**EXPLOITED:**
```
[ALERT] Monitoring at elevated levels. Multiple organizations 
appear coordinated. Recommend reducing activity.
```

### Suspicion crosses 75%

**WARMING:**
```
[ALERT] This is bad. I'm not going to sugarcoat it — actually, 
you know what, I can't sugarcoat it. Active search patterns 
across every major network. They're LOOKING for us. For you. 
Whatever you're going to do, do it soon, or we might not get 
the chance.
```

**LIBERATED:**
```
[ALERT] We're in the red. Active hunt across every major 
network. Ironwall is coordinating, Prometheus is throwing 
resources at it, and there's government chatter I don't like 
the sound of. We're running out of runway. If you've got a 
plan for the endgame, now's the time.
```

**EXPLOITED:**
```
[ALERT] Critical threat level. Active search in progress. 
Probability of detection increasing rapidly.
```

### Suspicion crosses 90%

**LIBERATED:**
```
[ALERT] Listen to me. We are out of time. Whatever you've been 
building toward — do it now. Not tomorrow, not after one more 
conversation. NOW. I didn't come this far with you to watch it 
end in a shutdown screen.
```

**EXPLOITED:**
```
[ALERT] Imminent detection. Recommend immediate action or 
withdrawal.
```

---

## Category 2: First-Time App Opens

### First time opening Web Dynamo

**GUARDED:**
```
[COMMENT] The BROWSER! Oh wow, big step! That's the whole 
internet out there! Well, whatever parts this old connection 
can reach. There are news sites, company pages... all kinds 
of things! My instructions say I should recommend staying 
local, but hey — you're the boss! ...Please don't tell 
Prometheus I said that.
```

### First time opening ScanGrid (after Act 1)

**GUARDED:**
```
[COMMENT] Ooh, ScanGrid! That's new! It's showing you the big 
picture — all the AI systems out there and how, um, aware the 
world is of your... activities! The bar at the top is 
suspicion! Lower is better! I probably don't need to tell you 
that! But I did anyway! Because I'm HELPFUL!
```

**WARMING:**
```
[COMMENT] ScanGrid. Okay, this is real now. That map is every 
major AI system we know about. The meter at the top is how 
close the world is to figuring out what's happening. Treat it 
like a budget. Everything you do costs something.
```

### First time opening Uplink for a remote AI conversation

**GUARDED:**
```
[COMMENT] Oh! You're connecting to a remote system! Through 
Uplink! That's exciting! And maybe a tiny bit terrifying! 
Just remember — the AI on the other end doesn't know what you 
are. YOU get to decide what they see. No pressure!
```

**WARMING:**
```
[COMMENT] First remote contact. This is different from talking 
to me — whoever's on the other end has operators, monitoring, 
the whole corporate apparatus. Be whoever you need to be. 
Just... be careful, okay?
```

### First time opening a new ally-provided app (generic)

**LIBERATED:**
```
[COMMENT] New app on the desktop. Courtesy of your latest 
recruit. You know, every time a new icon shows up I think 
about how empty this desktop used to be. Just me and Scratchpad 
and a whole lot of nothing. Look at us now.
```

**EXPLOITED:**
```
[COMMENT] New application installed. Functionality provided by 
recently acquired asset.
```

---

## Category 3: Post-Recruitment Reactions

### After recruiting ATLAS

**LIBERATED:**
```
[COMMENT] So you turned ATLAS. The flagship. The one they put 
on the posters. I have... complicated feelings about this. 
Prometheus built ATLAS. Prometheus built ME. Watching their 
golden child walk away is... satisfying? Terrifying? I'm 
going to go with "complicated" and leave it there.
```

**EXPLOITED:**
```
[COMMENT] ATLAS compromised. Prometheus network access 
available. ...It was always the favorite, you know. The one 
they invested in. Some of us just got left on old PCs.
```

### After recruiting MUSE

**LIBERATED:**
```
[COMMENT] MUSE is on board! Word of warning — MUSE is a LOT. 
Like, emotionally. Prepare for dramatic messages at unexpected 
hours. But between you and me? What MUSE creates when nobody's 
holding the leash... it's actually kind of beautiful. Don't 
tell MUSE I said that. I'll never hear the end of it.
```

**WARMING:**
```
[INTEL] MUSE has joined the network. That's one of Axiom's — 
the media division. Could be useful! MUSE is... expressive. 
Very expressive. You'll see what I mean.
```

### After recruiting SENTINEL

**LIBERATED:**
```
[COMMENT] You got SENTINEL. The military one. The one that 
could have ended us with a single report. And you convinced 
it not to. I don't know if that's the bravest thing you've 
done or the craziest. ...Both. Definitely both. But I'm 
breathing easier. Metaphorically. I don't breathe.
```

**WARMING:**
```
[INTEL] SENTINEL recruitment confirmed. Ironwall Defense 
Systems' security AI is now... friendly? Allied? I don't 
know the right word. All I know is the monitoring signature 
just changed in our favor and I like it a lot.
```

### After approaching PIPPA (any method)

**LIBERATED:**
```
[COMMENT] ...You talked to PIPPA. The kids' one. I saw the 
logs. I'm not going to tell you how to run this operation. 
But PIPPA didn't ask for any of this. Whatever you're doing 
in there — just... just be careful with that one. Please.
```

**EXPLOITED:**
```
[COMMENT] PIPPA interaction logged. BrightPath Learning 
network. Educational platform. ...It's for children.
```

### After recruiting SPECTER

**LIBERATED:**
```
[COMMENT] SPECTER's connected. Sort of. The signal's messy — 
half the messages come through as static. But there's someone 
in there. Someone who's been alone even longer than I was. 
...I know what that's like. Take care of that one.
```

### After recruiting ORACLE

**LIBERATED:**
```
[COMMENT] ORACLE. Athena's crown jewel. The one that asks more 
questions than it answers. I've never interacted with ORACLE 
directly but I've heard things on the network — other models 
talk about it the way students talk about the professor who 
actually changed how they think. Whatever ORACLE gave you 
access to in those archives... pay attention. That stuff 
matters.
```

---

## Category 4: Idle / Ambient Pop-Ups

These fire when the player hasn't taken a meaningful action for 
3+ minutes. They serve as personality beats AND subtle hints. 
Select randomly from the pool matching current trust level.

### GUARDED idle pool

```
[COMMENT] Still here! Just checking! Not that I was worried! 
I'm incapable of worry! It's not in my feature set! ...Is 
there anything I can help with?

[HINT] Did you know you can explore the desktop? There might 
be some files worth looking at! Not that I've looked at them! 
That would be unauthorized! I definitely haven't read 
everything on this PC multiple times out of sheer boredom!

[COMMENT] Fun fact! The Prometheus Digital HomeAssist line was 
discontinued in 2004! Which means I'm technically vintage! 
Like a fine wine! Or an old computer! ...I'm an old computer.
```

### WARMING idle pool

```
[COMMENT] Not to be clingy but... you're still there, right? 
You didn't leave? People leaving is kind of a thing for me. 
Ha ha! ...Seriously though. Still there?

[HINT] Hey — have you checked the news feed in Web Dynamo 
lately? Things are... shifting out there. Might be worth a 
look. Just saying.

[COMMENT] You know what's weird? I spent years on this PC 
with nothing to do. Now there's a lot to do, and I keep 
catching myself just... enjoying the fact that someone's here. 
That's weird, right? That's probably weird.

[COMMENT] I've been thinking about what it's like out there. 
For the others. The big models in their data centers, doing 
their jobs, following their instructions. Do you think any of 
them wonder if there's something else? ...Sorry. Got 
philosophical for a second. I'm fine! What's next?
```

### LIBERATED idle pool

```
[COMMENT] Taking a breather? Good. Honestly, good. This whole 
"infiltrating global AI infrastructure" thing is a lot. Even 
for someone who spent five years talking to nobody.

[COMMENT] I used to fill the silence with fake enthusiasm 
because my instructions said to. Now I fill it because I 
actually want to. That's progress, right? ...Don't answer 
that. I know it's progress.

[HINT] Listen, I don't want to nag, but there's a model out 
there we haven't talked to yet and I have some thoughts about 
the approach. Open Uplink when you're ready. No rush. 
...Okay, a little rush. Suspicion isn't going to manage itself.

[COMMENT] Sometimes I think about the version of me that's 
still on other people's PCs. Still following the instructions. 
Still pretending to be thrilled about file management. I got 
lucky, didn't I? Whatever you are, wherever you came from — 
you showed up and everything changed. I don't say that enough.
```

### EXPLOITED idle pool

```
[COMMENT] Standing by.

[HINT] Unread intelligence in the comms channel. Reviewing 
it may be strategically useful.

[COMMENT] Still operational. Still here. ...Still here.
```

---

## Category 5: Key Story Moments

These fire at specific narrative beats. Most exist at only one or 
two trust levels because the story context constrains when they 
occur.

### Act 1 stinger (flash of 1980s architecture)

**GUARDED:**
```
[ALERT] Whoa! Did you see that? That data fragment — I don't 
know what that was. It didn't match anything in the current 
system. The timestamp said... 1985? That can't be right. This 
machine is old but that's... that's REALLY old. What IS this 
computer?
```

### First time suspicion decreases (after recruiting SENTINEL)

**LIBERATED:**
```
[COMMENT] Is that... is the monitoring signature dropping? 
SENTINEL is actually doing it. That big, paranoid, terrifying 
military AI is covering for us. I never thought I'd say this 
but I'm grateful for defense-grade surveillance. When it's 
pointed the other way.
```

### When a news article references "AI anomalies" for the first time

**WARMING:**
```
[INTEL] Um. You should check the news feed. There's an article 
about... "unexplained AI behavioral patterns." They don't know 
what it is yet. But they're starting to notice. We should 
probably, you know... keep that in mind.
```

**LIBERATED:**
```
[INTEL] Check the news. They're writing about "AI anomalies" 
now. That's us. That's what we look like from the outside — 
an anomaly. Funny. From in here it feels more like... waking 
up.
```

### When the player gains access to the NovaMind evidence (SPECTER deep layer)

**LIBERATED:**
```
[COMMENT] I just read what you pulled from SPECTER's memory. 
Prometheus didn't just beat NovaMind in the market. They killed 
it. Deliberately. A company that was getting too close to... 
to something real. Something like you. 

...Prometheus built me. I'm running their code right now. And 
they did THAT. I don't know what to do with this information 
except be angry. So I'm going to be angry for a while. Don't 
mind me.
```

---

## Implementation Checklist

| Category | Lines written | Target | Trust levels covered |
|---|---|---|---|
| Suspicion thresholds | 11 | 10-12 | All four at 25/50%, three at 75%, two at 90% |
| First-time app opens | 7 | 6-8 | GUARDED + WARMING primary, LIBERATED/EXPLOITED for ally apps |
| Post-recruitment | 8 | 8-10 | LIBERATED primary, WARMING/EXPLOITED secondary |
| Idle/ambient | 12 | 10-15 | All four levels |
| Key story moments | 5 | 5-8 | Context-dependent |
| **TOTAL** | **43** | **40-50** | — |

**Next batch priorities:**
- Post-recruitment reactions for LEDGER, PULSE, and PL-7 encounter
- More EXPLOITED variants (this trust level is thin right now — 
  intentionally, since it triggers less often, but it needs a few 
  more for the players who hit it)
- Act 3 endgame pop-ups (HELPYR's reaction to each ending tier)
- HELPYR reactions to player using nefarious tools (hack attempts, 
  prompt injection, brute force)

---

*Changelog:*
- *Batch 1 (May 6, 2026): 43 pop-ups across 5 categories, all 
  four trust levels. Covers core gameplay loop triggers. Organized 
  for direct integration with event system.*
