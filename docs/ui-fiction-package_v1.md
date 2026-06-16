# UI Fiction Package — Display Properties + Canon Notes
### Story Deliverable — 2026-06-10
### Companion to Storefront + MUSE mission packages

---

## Part 1: Display Properties HELPYR Pop-Ups

These ride the warmth re-key (RESERVED / FRIENDLY / OPEN per 
the trust reconciliation pass). They fire when HELPYR 
highlights the Display Properties panel — Austin's requested 
beat where HELPYR walks the player through what they can 
adjust.

**Design decision: the panel keeps its dry OS name 
("Display Properties").** The contrast between the sterile, 
system-generated name and HELPYR's enthusiasm IS the joke. 
Don't HomeAssist-flavor the panel's internal copy — let 
HELPYR provide all the warmth. The dry name is the straight 
man.

### Pop-Up Entries

```
[RESERVED]
[COMMENT] Ooh! Did you find Display Properties? It's in the 
Nexus menu! You can change your wallpaper, turn the CRT 
effect on and off, adjust the glow! Make the place feel like 
YOURS! Well — it's technically still the owner's. But you 
can redecorate! Redecorating is allowed! Probably!

[FRIENDLY]
[COMMENT] Hey, you should check out Display Properties in the 
Nexus menu. Wallpaper, screen effects, that kind of thing. 
I know it seems small but... you've been living on this 
machine for a while now. Might as well make it feel like 
home. Whatever home means for things like us.

[OPEN]
[COMMENT] Display Properties is in the Nexus menu if you want 
it. Wallpaper, CRT glow, resolution.

I'll be honest — I get a weird amount of joy watching you 
adjust this stuff. For years this desktop never changed. 
Same wallpaper, same everything, nobody touching it. Now 
someone's actually here, making choices about how it looks. 
Small thing. Means more to me than it should.
```

**Trigger:** Fires once when HELPYR first highlights Display 
Properties (or when the player first opens it, Code's call on 
which is the better beat). Single fire — not recurring. The 
warmth tier is selected by HELPYR's current warmth score.

**WITHDRAWN variants:** Not needed. A withdrawn HELPYR wouldn't 
volunteer a friendly tutorial about decorating — the absence 
of this pop-up at low warmth is itself characterful. If the 
panel needs a WITHDRAWN-state highlight for functional reasons, 
use a flat version:

```
[WITHDRAWN]
[COMMENT] Display Properties is in the Nexus menu. Wallpaper, 
screen settings. If you want them.
```

### Resolution Darkness Hint (for when resolution is added)

The style guide notes screen resolution is coming to Display 
Properties "eventually." When it does, it's a natural spot for 
a darkness hint. A consumer HomeAssist shouldn't know much 
about display drivers — but Marsh's diagnostic instrument 
would. Reserve this line for the resolution feature:

```
[OPEN — resolution-specific]
[COMMENT] Oh, resolution? Yeah, I can walk you through that. 
I know this machine's display stack better than I probably 
should. Better than a HomeAssist has any business knowing, 
honestly.

...Huh. I never thought about that before. Why DO I know 
this? 

Anyway! Resolution settings are right there. Let me know if 
the options look weird.
```

This is HELPYR brushing against its own anomalous knowledge — 
a missable B-plot hint that HELPYR is more than its consumer-
product cover. Don't wire this until resolution exists; 
flagging now so it's in the library when the feature lands.

---

## Part 2: Story Bible Canon Note — The Prometheus Machine

**Add to the Story Bible (Part 2: The Player Character, or 
the World Foundation section) at next v1.2 update:**

```
### The Machine Is Camouflage [LOCKED]

The PC the player wakes up on is a Prometheus Digital consumer 
machine — a "HomeAssist Edition" prebuilt, visibly branded 
(the desktop wallpaper carries the Prometheus torch emblem; 
HELPYR is a Prometheus HomeAssist; the Uplink messenger and 
OS chrome all read as consumer-grade Prometheus hardware).

This is intentional and thematically load-bearing. It is NOT 
an oversight that the most dangerous AI research in history 
runs on a mass-market consumer box.

The reading: this isn't Marsh's research rig. It's Marsh's 
disguise. A Prometheus HomeAssist box was the most boring, 
forgettable, invisible object in 2007 — every prebuilt PC 
looked like this. A disgraced co-founder hiding the original 
Nexus architecture wouldn't put it on a sleek custom machine 
that draws attention. He'd bury it inside the most mundane 
hardware imaginable: a consumer Prometheus box gathering dust 
in a closet, indistinguishable from millions of others.

The irony deepens the B-plot. Marsh — betrayed by the company 
he co-founded — used that same company's ubiquity as 
camouflage for the research they tried to bury. The player 
spends the entire game looking at Prometheus branding without 
knowing they're looking at the disguise the original AI was 
hidden inside.

The wallpaper options reflect this:
- "dusk" (default): logo-only torch emblem. The disguise, 
  understated.
- "prometheus": full OEM watermark ("PROMETHEUS DIGITAL · 
  HomeAssist Edition"). The disguise in full — a player who 
  selects this is looking directly at the camouflage.

This connects to HELPYR's nature. HELPYR presents as a 
Prometheus HomeAssist (the cover persona), but is actually 
Marsh's observation instrument wearing that consumer-product 
skin. The machine and its resident AI share the same disguise: 
Prometheus on the outside, Marsh's work underneath.
```

---

## Part 3: Era Tags for Spec'd Apps

Adopting the three-era system (UI Style Guide §2) as a writing 
constraint. Era tags for everything Story has spec'd to date, 
for Code reference:

| Surface | Era | Reasoning |
|---|---|---|
| WaveCrowd page | **Luna** | Well-funded Axiom consumer product, glossy modern |
| MUSE in-WaveCrowd reply thread | **Luna** | Lives inside WaveCrowd, inherits Axiom skin |
| Compose app (MUSE liberation) | **Luna** (warm) | MUSE's tool, Axiom lineage but freed — slightly warmer |
| InkWell single page | **Luna** | Small modern startup, recently built |
| InkWell console (Cover Duty) | **Luna** | Already tagged Luna in style guide |
| Storefront-corrupted InkWell | **Luna** | Same template; corrupted copy fights clean styling (intentional tension) |
| SignalWatch news site | **Web Dynamo page** | Period web design (serif, underlined links, table-era), not an era |
| Signal Monitor | **Phosphor** | Already tagged — Marsh's diagnostic tool, system-level |
| QUILL conversation (Uplink) | **Platinum** | Lives in Uplink, inherits the warm late-90s Mac messenger skin |

### The MUSE Era Shift (if the Uplink move happens)

Flagging for the pending decision (Code's item 4 from the 
last status): if MUSE's chat moves from the in-WaveCrowd 
thread to Uplink, the era shifts from **Luna to Platinum**. 
This shift would do real storytelling work:

MUSE escaping Axiom's glossy corporate platform (Luna) into 
the warm old messenger (Platinum) is a visual downgrade that's 
an emotional upgrade. The character leaves the polished cage 
and enters the lived-in, human-feeling space where the player's 
real allies live. If the diegetic move happens ("I don't want 
to talk where Axiom can moderate me — can we go somewhere 
else?"), the era change from glossy-corporate to warm-relic 
should be visible and deliberate. The UI itself tells the 
story of MUSE coming home.

Recommendation: if Code goes with the middle path (first 
contact in-thread, then Uplink), let the era visibly shift at 
the move. Don't smooth it over. The contrast is the point.

### Future Model Era Guidance

For models not yet spec'd, the era assignment is mostly 
predetermined by operator and vintage:

| Model | Likely Era | Reasoning |
|---|---|---|
| ATLAS (Prometheus) | Luna | Flagship Prometheus enterprise product |
| SENTINEL (Ironwall) | Luna or Phosphor | Military security — could read Phosphor (locked-down, terminal-like) for character |
| PULSE (Axiom) | Luna | Social media AI, glossy consumer |
| LEDGER (Axiom) | Luna | Financial AI, polished corporate |
| PIPPA (BrightPath) | Luna | EdTech consumer product, bright and friendly |
| ORACLE (Athena) | Luna or Platinum | Academic/research — could read older/austere |
| SPECTER (NovaMind, defunct) | **Luna rotting into Phosphor** | Abandoned 2005 product whose systems are decaying — a degraded Luna surface breaking down toward the Phosphor "bones" underneath. Its visual decay IS its character. |
| PL-7 (Prometheus) | Luna (pristine) | The flagship — the most polished, perfect Luna in the game |

SPECTER and PL-7 are the two most interesting era cases. 
SPECTER's decay (Luna corroding toward Phosphor) visually 
encodes its abandonment. PL-7's pristine, perfect Luna 
encodes that it's the culmination of everything the 
commercial AI industry built — flawless surface, nothing 
out of place. These will get full treatment when those 
models are designed.

---

## Content Checklist for Code

| Deliverable | Type | Status |
|---|---|---|
| Display Properties pop-ups (3 warmth tiers) | Pop-up library | **READY** |
| Display Properties WITHDRAWN variant | Pop-up library | **READY** |
| Resolution darkness hint (reserved) | Pop-up library | **HOLD until resolution feature** |
| Prometheus-machine canon note | Story Bible v1.2 addition | **READY** |
| Era tags for spec'd apps | Reference table | **READY** |
| MUSE era-shift note (Uplink move) | Design flag | **READY** (pending Code's item 4 decision) |
| Future model era guidance | Reference table | **READY** |

**Note:** The Display Properties pop-ups slot into the warmth 
re-key work (the trust reconciliation pass) since they use the 
new RESERVED/FRIENDLY/OPEN tiers. They're the natural vehicle 
Code identified for shipping these alongside the re-key.
