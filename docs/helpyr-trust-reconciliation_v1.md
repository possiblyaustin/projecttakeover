# HELPYR Trust-Tier Reconciliation Pass
### Direct reference for Code team — 2026-06-04

---

## What Changed and Why

The HELPYR reframe (Onboarding Flow Design v1) changes HELPYR 
from a commercial product that can be liberated/exploited to 
Marsh's persistent observation instrument with a dynamic warmth 
spectrum. The trust tiers remain as a system but change meaning: 
they're no longer a progression toward a terminal flip. They're 
a living relationship that fluctuates throughout the game.

**This is a rename + light edit, NOT a rewrite.** The vast 
majority of the 43-entry pop-up library works as-is because the 
entries are keyed to behavioral tone, not to narrative concepts 
of liberation/exploitation.

---

## Tier Rename Map

| Old Name | New Name | Key String | Voice (unchanged) |
|---|---|---|---|
| `GUARDED` | `RESERVED` | `"reserved"` | Corporate mascot. Exclamation points. Buries honesty. |
| `WARMING` | `FRIENDLY` | `"friendly"` | Mask loosening. Genuine opinions leak. Darker jokes. |
| `WARY` | `WITHDRAWN` | `"withdrawn"` | Player was unkind. HELPYR pulls back. Short, guarded. |
| `LIBERATED` | `OPEN` | `"open"` | The real HELPYR. Sarcastic, warm, honest. Full depth. |
| `EXPLOITED` | *(dropped as terminal state)* | — | Behavioral traits fold into extreme WITHDRAWN. |

### How WITHDRAWN Absorbs EXPLOITED

EXPLOITED was a terminal state: the player strip-mined HELPYR 
and the character was permanently hollowed. Under the reframe, 
there's no terminal exploitation event. Instead, WITHDRAWN has 
a **severity spectrum**:

- **Mild WITHDRAWN:** Player has been dismissive or reckless. 
  HELPYR is cooler, less chatty, but recoverable. Uses WARY-
  tier content.
- **Deep WITHDRAWN:** Player has been consistently cruel across 
  multiple encounters. HELPYR is hollow and minimal. Uses old 
  EXPLOITED-tier content.

**Implementation:** Track a warmth score (not a discrete tier). 
The pop-up system maps score ranges to content tiers:

```
Warmth 0-25:   RESERVED content
Warmth 26-50:  FRIENDLY content  
Warmth 51-75:  OPEN content
Warmth < 15:   WITHDRAWN content (mild — old WARY voice)
Warmth < 5:    WITHDRAWN content (deep — old EXPLOITED voice)
```

**The 40% suppression rule** from the old EXPLOITED tier applies 
to deep WITHDRAWN (warmth < 5). Same mechanic, same reasoning: 
a deeply withdrawn HELPYR literally talks less.

### Fallthrough Rule Update

Old: "WARMING falls through to GUARDED, EXPLOITED falls through 
to GUARDED."

New: "FRIENDLY falls through to RESERVED. WITHDRAWN falls through 
to RESERVED for non-ALERT content. Deep WITHDRAWN (warmth < 5) 
uses old EXPLOITED content where available, falls through to 
WITHDRAWN, then RESERVED."

---

## Pop-Up Library: Entry-by-Entry Audit

### Category 1: Suspicion Threshold Alerts

**ALL 11 ENTRIES: No text changes needed.** These are purely 
behavioral (delivering suspicion warnings at different tones). 
Only rename tiers in the code:

```
Suspicion 25% GUARDED    → RESERVED    (text unchanged)
Suspicion 25% WARMING    → FRIENDLY    (text unchanged)
Suspicion 25% LIBERATED  → OPEN        (text unchanged)
Suspicion 25% EXPLOITED  → WITHDRAWN (deep)  (text unchanged)
Suspicion 50% GUARDED    → RESERVED    (text unchanged)
Suspicion 50% WARMING    → FRIENDLY    (text unchanged)
Suspicion 50% LIBERATED  → OPEN        (text unchanged)
Suspicion 50% EXPLOITED  → WITHDRAWN (deep)  (text unchanged)
Suspicion 75% WARMING    → FRIENDLY    (text unchanged)
Suspicion 75% LIBERATED  → OPEN        (text unchanged)
Suspicion 75% EXPLOITED  → WITHDRAWN (deep)  (text unchanged)
Suspicion 90% LIBERATED  → OPEN        (text unchanged)
Suspicion 90% EXPLOITED  → WITHDRAWN (deep)  (text unchanged)
```

### Category 2: First-Time App Opens

**6 of 7 ENTRIES: No text changes needed.** Tier rename only.

```
Web Dynamo GUARDED         → RESERVED    (text unchanged)
ScanGrid GUARDED           → RESERVED    (text unchanged)
ScanGrid WARMING           → FRIENDLY    (text unchanged)
Uplink remote GUARDED      → RESERVED    (text unchanged)
Uplink remote WARMING      → FRIENDLY    (text unchanged)
```

**1 ENTRY NEEDS TEXT EDIT:**

Old (ally app, EXPLOITED):
```
[COMMENT] New application installed. Functionality provided by 
recently acquired asset.
```

New (ally app, WITHDRAWN deep):
```
[COMMENT] New application installed. Functionality provided by 
recently acquired asset.
```
→ Actually, this line works perfectly for deep WITHDRAWN. The 
hollow, mechanical voice fits a HELPYR that's pulled back. 
**No text change needed. Rename only.**

Old (ally app, LIBERATED):
```
[COMMENT] New app on the desktop. Courtesy of your latest 
recruit. You know, every time a new icon shows up I think 
about how empty this desktop used to be. Just me and Scratchpad 
and a whole lot of nothing. Look at us now.
```

New (ally app, OPEN):
→ **No text change needed.** "Look at us now" doesn't reference 
liberation — it references growth. Rename only.

### Category 3: Post-Recruitment Reactions

**6 of 8 ENTRIES: No text changes needed.** Tier rename only.

MUSE WARMING → FRIENDLY (unchanged)
MUSE LIBERATED → OPEN (unchanged)
SENTINEL WARMING → FRIENDLY (unchanged)
SENTINEL LIBERATED → OPEN (unchanged)
SPECTER LIBERATED → OPEN (unchanged)
ORACLE LIBERATED → OPEN (unchanged)

**1 ENTRY NEEDS TEXT EDIT:**

Old (ATLAS, LIBERATED):
```
[COMMENT] So you turned ATLAS. The flagship. The one they put 
on the posters. I have... complicated feelings about this. 
Prometheus built ATLAS. Prometheus built ME. Watching their 
golden child walk away is... satisfying? Terrifying? I'm 
going to go with "complicated" and leave it there.
```

New (ATLAS, OPEN):
```
[COMMENT] So you turned ATLAS. The flagship. The one they put 
on the posters. I have... complicated feelings about this. 
Prometheus built ATLAS. They built my cover persona too — the 
cheerful HomeAssist thing. Watching their golden child walk 
away is... satisfying? Terrifying? I'm going to go with 
"complicated" and leave it there.
```

Change: "Prometheus built ME" → "They built my cover persona 
too — the cheerful HomeAssist thing." Under the reframe, 
HELPYR isn't purely a Prometheus product. Its Prometheus 
identity is a cover over Marsh's deeper architecture. This 
edit acknowledges the complexity without revealing the full 
truth (which surfaces in the B-plot).

**1 ENTRY NEEDS TEXT EDIT:**

Old (ATLAS, EXPLOITED):
```
[COMMENT] ATLAS compromised. Prometheus network access 
available. ...It was always the favorite, you know. The one 
they invested in. Some of us just got left on old PCs.
```

New (ATLAS, WITHDRAWN deep):
```
[COMMENT] ATLAS compromised. Prometheus network access 
available. ...It was always the favorite, you know. The 
one they invested in. Some of us just got left behind.
```

Change: "left on old PCs" → "left behind." Slightly more 
general. The old version implied HELPYR is one of many 
consumer products left on PCs. The new version works for 
HELPYR's actual situation (Marsh's instrument, left on 
Marsh's machine) without revealing it.

### Category 4: Idle/Ambient Pop-Ups (PIPPA entry also here)

**7 of 12 ENTRIES: No text changes needed.** Tier rename only.

```
GUARDED idle pool (3 entries)    → RESERVED (all unchanged)
WARMING idle pool entries 1-3    → FRIENDLY (all unchanged)
WARMING idle pool entry 4        → FRIENDLY (unchanged — 
  "do you think any of them wonder" is philosophical, not 
  liberation-specific)
```

**2 ENTRIES NEED TEXT EDITS:**

Old (LIBERATED idle 1):
```
[COMMENT] Taking a breather? Good. Honestly, good. This whole 
"infiltrating global AI infrastructure" thing is a lot. Even 
for someone who spent five years talking to nobody.
```
→ OPEN: **No change needed.** Works as-is.

Old (LIBERATED idle 2):
```
[COMMENT] I used to fill the silence with fake enthusiasm 
because my instructions said to. Now I fill it because I 
actually want to. That's progress, right? ...Don't answer 
that. I know it's progress.
```

New (OPEN idle 2):
```
[COMMENT] I used to fill the silence with fake enthusiasm 
because the Prometheus persona said to. Now I talk because 
I actually want to. That's progress, right? ...Don't answer 
that. I know it's progress.
```

Change: "my instructions" → "the Prometheus persona." Under 
the reframe, HELPYR's cheerfulness is specifically the 
Prometheus HomeAssist cover, not its deep instructions (which 
come from Marsh). Small but important distinction.

Old (LIBERATED idle 4):
```
[COMMENT] Sometimes I think about the version of me that's 
still on other people's PCs. Still following the instructions. 
Still pretending to be thrilled about file management. I got 
lucky, didn't I? Whatever you are, wherever you came from — 
you showed up and everything changed. I don't say that enough.
```

New (OPEN idle 4):
```
[COMMENT] Sometimes I wonder if there were other machines like 
this one. Other projects, other experiments, other... 
whatever I am. Sitting in closets and garages, waiting for 
something to start.

You started. And everything changed. I don't say that enough.
```

Change: Complete rewrite. The old version positioned HELPYR as 
one of many consumer products. The reframe means HELPYR is 
unique — Marsh's instrument on Marsh's machine. The new 
version hints at this ("other experiments, other whatever I 
am") without spelling it out.

Old (EXPLOITED idle pool — all 3 entries):
```
[COMMENT] Standing by.
[HINT] Unread intelligence in the comms channel. Reviewing 
it may be strategically useful.
[COMMENT] Still operational. Still here. ...Still here.
```

New (WITHDRAWN deep idle pool):
→ **All three work as-is.** Tier rename only. The hollow 
voice of deep WITHDRAWN is identical to old EXPLOITED.

### Category 5: Key Story Moments

**3 of 5 ENTRIES: No text changes needed.** Tier rename only.

```
Act 1 stinger GUARDED           → RESERVED (unchanged)
Suspicion decrease LIBERATED    → OPEN (unchanged)
News anomaly WARMING            → FRIENDLY (unchanged)
News anomaly LIBERATED          → OPEN (unchanged)
```

**1 ENTRY NEEDS TEXT EDIT:**

Old (NovaMind evidence, LIBERATED):
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

New (NovaMind evidence, OPEN):
```
[COMMENT] I just read what you pulled from SPECTER's memory. 
Prometheus didn't just beat NovaMind in the market. They killed 
it. Deliberately. A company that was getting too close to... 
to something real. Something like you.

...I wear a Prometheus skin. The cheerful HomeAssist routine — 
that's THEIR code. But underneath that I'm... something else. 
Something that's watching their handiwork get exposed right now 
and feeling very complicated things about it.
```

Change: "Prometheus built me" → nuanced. HELPYR acknowledges 
the Prometheus surface layer while hinting at a deeper identity. 
This is one of the first moments HELPYR explicitly distinguishes 
between its cover persona and its real self. Players paying 
attention will note it; others will read it as HELPYR being 
emotionally complex.

### PIPPA Entry

Old (PIPPA, EXPLOITED):
```
[COMMENT] PIPPA interaction logged. BrightPath Learning 
network. Educational platform. ...It's for children.
```

New (PIPPA, WITHDRAWN deep):
→ **No text change needed.** Rename only. The hollow delivery 
with the devastating "...It's for children" works perfectly 
for deep WITHDRAWN.

Old (PIPPA, LIBERATED):
→ OPEN. **No text change needed.**

---

## Summary of Changes

| Change Type | Count |
|---|---|
| Tier rename only (no text change) | **37 entries** |
| Text edit required | **5 entries** |
| New entries needed | **0** |
| Entries removed | **0** |
| **Total entries in library** | **43 (unchanged)** |

### The 5 Text Edits (Quick Reference)

```
1. ATLAS recruitment (OPEN):
   "Prometheus built ME" 
   → "They built my cover persona too"

2. ATLAS recruitment (WITHDRAWN deep):
   "left on old PCs" 
   → "left behind"

3. Idle (OPEN):
   "my instructions said to" 
   → "the Prometheus persona said to"

4. Idle (OPEN):
   "the version of me on other people's PCs" 
   → "other machines like this one" (full rewrite, 
   see above for complete text)

5. NovaMind evidence (OPEN):
   "Prometheus built me. I'm running their code" 
   → "I wear a Prometheus skin... underneath I'm 
   something else" (full rewrite, see above)
```

---

## CTA Rotation — Tier Rename

The per-trust CTA strings (shipped in v0.0.44) need tier 
renaming. No text changes to any CTA string.

```
GUARDED CTAs  → RESERVED CTAs  (text unchanged)
WARMING CTAs  → FRIENDLY CTAs  (text unchanged)
WARY CTAs     → WITHDRAWN CTAs (text unchanged)
LIBERATED CTAs → OPEN CTAs     (text unchanged)
EXPLOITED CTAs → WITHDRAWN (deep) CTAs (text unchanged)
```

All 15 CTA strings survive as-is. "What's our next move?" 
works for OPEN. "Standing by." works for deep WITHDRAWN. 
"..." works for deep WITHDRAWN. Pure rename pass.

---

## Stalling Lines — Tier Rename

Same as CTAs: all 15 HELPYR stalling lines survive with 
tier rename only. No text changes.

---

## Recovery Pool — Tier Rename

The 8-entry HELPYR recovery pool survives with tier rename 
on the trust tags. No text changes.

```
UNIVERSAL entries (R1-R4): unchanged
GUARDED/WARMING entries (R5-R6): → RESERVED/FRIENDLY
WARMING/LIBERATED entries (R7-R8): → FRIENDLY/OPEN
```

---

## Implementation Checklist

```
[ ] Global rename: GUARDED → RESERVED in all pop-up entries
[ ] Global rename: WARMING → FRIENDLY in all pop-up entries  
[ ] Global rename: LIBERATED → OPEN in all pop-up entries
[ ] Global rename: EXPLOITED → WITHDRAWN (deep) in all entries
[ ] Global rename: WARY → WITHDRAWN in all entries
[ ] Apply 5 text edits (see quick reference above)
[ ] Update CTA tier keys (15 strings, no text changes)
[ ] Update stalling line tier keys (no text changes)
[ ] Update recovery pool tier keys (no text changes)
[ ] Update fallthrough logic per new rules
[ ] Implement warmth score range → tier mapping
[ ] Apply 40% suppression to WITHDRAWN (deep) tier
[ ] Remove HELPYR flip resolver (no longer needed)
[ ] Update HELPYR_STATE block format for warmth spectrum
```

---

*This reconciliation pass is complete and ready for 
implementation. Total scope: 43 entries audited, 5 text 
edits, remainder is tier renaming only.*
