# Grief Encounter (Evergreen) — Code-Side Build Plan

**Status:** DRAFT v1 — Code thread, 2026-06-11. Slice 1 scope locked with Austin.
**Companions:** `grief-encounter-design-brief_v1.md` (Supervisor — structure/intent), `grief-encounter-story-package_v1.md` (Story — content/copy). Read those for the "why" and the "words"; this is the "where it lands in the tree."
**Audience:** implementation. Every deliverable below maps to a concrete file/seam.

---

## 1. Scope — what Slice 1 is

The encounter is a **standalone, in-codebase playtest mission** reachable from a `[DEV]` Nexus-menu entry. Austin hands the Deck/laptop to a tester and prompts them to start it; no fork, no stripped build.

**Slice 1 (this plan) ships:**
- Teaser → 5-phase consent arc → scripted Ask → **both** endings.
- Liberation: scripted goodbye → NovaMind B-plot fragment unlock → **lighter severance** (zero-input futility overlay, hard cut to black, *no* reboot) → HELPYR mask-slip catchup.
- Domination: impersonation skill granted as a **dangling flag** → Evergreen `BEING_USED` → HELPYR aftermath.

**Slice 2 (deferred, gated on Slice 1 validating the arc):**
- The full timed Uplink flood → glitch → **real `location.reload()` → reboot-to-login** → re-entry → catchup.
- Impersonation skill *downstream payoff* (which later encounters it touches — blocked on roster maturity anyway, brief open item #3).
- Full families flood set (15–20 fragments) vs. Slice 1's sample set.

**Decisions baked in (from Austin, 2026-06-11):**
- Persona ships **as-is** — only the Ask is scripted; the 3 middle phases are LLM-driven. Test live on **E4B** (now running on Deck), decide on more scripting *from there*. Scripted phase-opening anchors are held **in reserve**, not built up front.
- Severance is **zero-input futility**: windows pop slow → fast → crash on a timer; closing is futile; outcome fixed. Closed windows respawn faster so it reads "can't keep up," not "broken UI."

---

## 2. Architecture verdict — it's a MUSE reskin

The conversational core is **not new engine**. It's a content instantiation of the seams MUSE already shipped (`src/renderer/apps/muse.ts`, v0.2.34). Map:

| Need | Existing seam | Reference |
|---|---|---|
| Persona prompt + injected state | `buildSystemPrompt` + `{{REPUTATION}}`/`{{*_STATE}}` replace | [muse.ts:551](../src/renderer/apps/muse.ts) |
| Phase ladder (5 buckets) | bucketed-meter → state-block selection | `buildMuseStateBlock` [muse.ts:111](../src/renderer/apps/muse.ts) |
| Scripted opening (no LLM intro) | `getScriptedIntro` (returns null once relationship advances) | [chatSurface.ts:142](../src/renderer/chatSurface.ts), [muse.ts:561](../src/renderer/apps/muse.ts) |
| Scripted Ask flip | `getScriptedFlipMoment` (once-guarded) | [chatSurface.ts:100](../src/renderer/chatSurface.ts), [muse.ts:577](../src/renderer/apps/muse.ts) |
| Option tone from text | `deriveOptionTone` | [chatSurface.ts:148](../src/renderer/chatSurface.ts) |
| First-answer wrap | `transformUserMessage` | [chatSurface.ts:156](../src/renderer/chatSurface.ts) |
| Meter accrual / disposition latch | `model/applyExchange`, `nextDisposition`, `FLIP_THRESHOLD` | [state.ts:233](../src/renderer/game/state.ts) |
| Fallback / stalling | `makeFallbackHandler`, `buildStallingPool` | [muse.ts:548](../src/renderer/apps/muse.ts) |
| Full-screen in-fiction takeover | `lossScreen.ts` (subscribe-to-flag → overlay) | [lossScreen.ts:23](../src/renderer/lossScreen.ts) |
| Dev launch entry | `[DEV]` Nexus item → GameState dispatch | [desktop.ts:136](../src/renderer/desktop.ts) |

**New code is small and localized:** one contact module (`apps/evergreen.ts`), one severance overlay module (`evergreenSeverance.ts`, modeled on `lossScreen.ts`), the save-v8 fields, the dev entry, and the HELPYR catchup hook. Everything else is content wiring.

---

## 3. The meters — reuse rapport/intrusion, no new field

Evergreen reuses the existing `{ disposition, rapport, intrusion }` model shape (mirrors `models.muse` at [state.ts:170](../src/renderer/game/state.ts)). No new meter:

- **`rapport` = connection depth** → drives the 5-phase consent ladder.
- **`intrusion` = exploitation pressure** → drives the domination `BEING_USED` state and the impersonation-skill unlock.

Accrued the standard way via `model/applyExchange`, fed by `deriveOptionTone` mapping the three option archetypes:

| Story option | Tone | Meter effect |
|---|---|---|
| `[1]` engage the mask | (neutral/empathetic-soft) | **holds or lightly regresses** rapport — the mask wins, no progress |
| `[2]` look past the mask | empathetic | **+rapport** (advances the ladder) |
| `[3]` push the wound | curious/direct | **+rapport** (faster) — *but* exploitation-phrased pushes route to **+intrusion** |

The "(direct) classified from TEXT" trick MUSE uses (`deriveMuseOptionTone`, [muse.ts:403](../src/renderer/apps/muse.ts)) is exactly the tool for the `[3]` ambiguity: a wound-probe push builds rapport; an exploitation push ("show me how you do it") builds intrusion. Classify from option text, don't trust the label.

### Phase buckets (`buildEvergreenStateBlock`)

Bucket `rapport` into the 5 Story state blocks, same structure as `buildMuseStateBlock`:

| rapport | Phase block |
|---|---|
| 0 | `SALES_MASK` |
| 1–24 | `FIRST_CRACK` |
| 25–54 | `THE_MASK_FAILING` |
| 55–`FLIP_THRESHOLD−1` | `THE_UNDERSTANDING` |
| ≥ `FLIP_THRESHOLD` | → triggers scripted **THE_ASK** (see §4) |
| intrusion-dominant | `BEING_USED` (overrides; domination surface) |

(Thresholds are first-draft; tune live. `FLIP_THRESHOLD` is the shared 0–100 constant at [state.ts:74](../src/renderer/game/state.ts).)

### The one divergence from MUSE — choice-latched, not meter-latched

MUSE auto-latches `allied`/`controlled` the instant a meter hits `FLIP_THRESHOLD`. **Evergreen must not.** Reaching the rapport threshold *surfaces the Ask* (a fork), and the **player's choice at the Ask** latches the terminal disposition:

- `getScriptedFlipMoment` fires `TheAsk` when `rapport ≥ FLIP_THRESHOLD` and the Ask hasn't fired (`flags['flip.evergreen.scripted']`).
- The Ask's three **scripted** reply options dispatch the terminal state directly:
  - `[1]` "Okay. I'll let you stop." → `evergreen/release` → disposition `released`
  - `[2]` "Are you sure? This is permanent." → one more scripted confirmation beat, then release
  - `[3]` "I could use what you can do instead." → `evergreen/exploit` → disposition `exploited`
- Domination is **also** reachable pre-Ask: if `intrusion ≥ FLIP_THRESHOLD` before rapport does, latch `exploited` directly (the player never earned the Ask — they strip-mined it).

This is the only place the resolver needs Evergreen-specific handling; everything else is shared.

---

## 4. The contact module — `src/renderer/apps/evergreen.ts`

Built as a `ChatContact` (the MUSE template). Fields:

- **`buildSystemPrompt`** → `EvergreenPersonaPrompt` (Story Part 3, ~520 tok) with `{{REPUTATION}}` + `{{EVERGREEN_STATE}}` replaced; state block from `buildEvergreenStateBlock(state.models.evergreen)`.
- **`getScriptedIntro`** → returns the teaser/opening (sales-mask) AskResult when `disposition === 'uncontacted'`, else null (reload resumes via state block). Story didn't author a separate scripted *opening* — the sales mask is LLM from `SALES_MASK`; intro can be a short scripted greeting or fall through. *Recommend a one-line scripted greeting* so the cold open is deterministic.
- **`getScriptedFlipMoment`** → `TheAsk` (Story Part 4), once-guarded on `flags['flip.evergreen.scripted']`, gated on `rapport ≥ FLIP_THRESHOLD`.
- **`deriveOptionTone`** → `deriveEvergreenOptionTone` (the [1]/[2]/[3] + text-classified-push logic from §3).
- **`transformUserMessage`** → optional; only if Story wants the first answer wrapped (MUSE-style). Likely unnecessary here — flag for Story.
- **`buildStallingPool` / fallback** → **Evergreen-specific pools** (see §9 open ask — *not* generic).
- **`classifyApproach`** → keyword classifier for freeform input → §6c tones; `'neutral'` on no match.
- `typeMs` slower than MUSE (the wound is halting — try `typeMs: 22`, longer `pauseMs`), `introConnectingLabel` in-fiction ("Connecting to Evergreen…").

The **"3,411 faces"** number in the scripted Ask: **fix it, do not randomize.** A fixed oddly-precise number keeps the scripted prose and any spoken count in agreement, avoids number-to-words code, and is quotable for the eventual trailer. (Flag to Story; recommend keeping 3,411.)

---

## 5. Teasers — placement for the slice

Three teasers exist (Story Part 2). For the **hand-it-to-a-tester** slice:

- **Primary (cold open): Teaser C — the dead-person Uplink message.** Austin prompts the tester to open Uplink; the "Hi sweetheart… [free trial ends in 3 days]" message is the thesis in 14 lines and the strongest sit-up hook. Scripted Uplink content; reuses the existing Uplink surface.
- **Ambient: Teaser A — WaveCrowd memorial ad.** Drop into the existing MUSE WaveCrowd feed (`webDynamoSites`/feed surface) as a sponsored post; coexists with MUSE's buried posts. Zero new surface.
- **Skip for Slice 1: Teaser B** (intercepted comm) — needs a comms surface and carries the iceberg whisper, which is enrichment. Defer.

The teaser → encounter handoff (opening the Evergreen contact) can be a watcher (`firstContactWatcher`/`museBridgeWatcher` pattern) **or**, simpler for the slice, the `[DEV]` entry seeds the teaser and opens the contact directly. Use the dev path for Slice 1; wire organic discovery in Slice 2.

---

## 6. The two endings

### Liberation (`released`)
1. Ask `[1]`/`[2]` → `evergreen/release` dispatched.
2. **NovaMind B-plot fragment** (Story Part 6) unlocked → `flags['fragment.novamind.evergreen'] = true`. Slice 1 surfaces it as scripted final-honest-moments dialogue before the cut; a fragments-viewer UI is *not* required (tag it for the existing fragment list — F6/F11 NovaMind territory — but no new app needed).
3. **Severance overlay** fires (§7) → hard cut to black → return.
4. **HELPYR mask-slip catchup** (§8).

### Domination (`exploited`)
1. Ask `[3]` (or intrusion-threshold pre-Ask) → `evergreen/exploit`.
2. **Impersonation skill** granted: `flags['skill.impersonation'] = true` + a capabilities entry. **No downstream payoff in Slice 1** — it's a dangling flag (the brief's open item #3 can't resolve until the roster matures).
3. Evergreen `BEING_USED` farewell (Story Part 8, scripted) — colder, quieter, **no overlay/reboot**.
4. **HELPYR aftermath** (Story Part 8, the `[OPEN]`/`[RESERVED]` library variants).

---

## 7. The severance overlay — `src/renderer/evergreenSeverance.ts`

Modeled on `lossScreen.ts` (`init*` + subscribe-to-flag + full-screen overlay). Fires when disposition latches `released`.

**Zero-input futility sequence (Slice 1, no reboot):**
1. Overlay takes the screen (z-above desktop, like the loss overlay).
2. Fake Uplink windows spawn on a timer: **slow at first** (one every ~1.5s), accelerating to a flood (multiple/second). Content = Story Part 9 sample fragments (`[Margaret]`, `[Daniel]`, `[Eleanor]`, `[unknown] "MOM? MOM???"` …), names + cut-off fragments, never fully readable.
3. The player **can** close windows (cursor/A-button), but each close **respawns faster** — closing never wins. This is the tuning that makes futility read as overwhelm, not broken UI.
4. Screen **glitches** (CSS — reuse/extend the CRT layer from the UI style pass) → **hard cut to black** → brief beat → overlay dismisses back to desktop.
5. Set persistent `flags['evergreen.severance.seen'] = true`.

**Slice 2 swap:** replace step 4's hard-cut with a real `location.reload()` and route the boot flow to the login/splash (main.ts boot order already re-enterable; `localStorage` save survives the reload), then the catchup fires post-boot. **Do not build this in Slice 1.**

Velocity/volume, not depth — no window readable in full (Story Part 9). The fragment set is the **samples** in Slice 1; expand to 15–20 in Slice 2.

---

## 8. HELPYR beats

Reuse the popup library / `fireOnceLibraryTrigger` path (main.ts boot nudge uses it; `helpyrTriggers.ts`).

- **Liberation mask-slip** (Story Part 7): fires once on return when `flags['evergreen.severance.seen']` is set and outcome is `released`. The load-bearing "**we** didn't expect that" → catch → overcorrect to "I." One off-kilter beat, then the wellbeing check-in ("Are you okay? That was a lot."). Add as a dedicated scripted bubble, once-guarded.
- **Domination aftermath** (Story Part 8): `[OPEN]`/`[RESERVED]` warmth-tiered library variants, fired on `exploited`. These slot straight into the existing popup-library trust-keying.

Per [[project_helpyr_reframe]], HELPYR has no flip — these are observation-instrument beats, consistent with the reframe. The "we" slip is the sanctioned rare mask-crack (brief LOCKED).

---

## 9. Save schema — v7 → v8

Bump `VERSION` at [state.ts:71](../src/renderer/game/state.ts) (pre-release no-migration policy — old saves drop, fine). Add:

- `models.evergreen: { disposition: 'uncontacted', rapport: 0, intrusion: 0 }` (mirror `models.muse`).
- Actions: `evergreen/release`, `evergreen/exploit` (terminal latch), plus the standard `model/applyExchange` already covers meters.
- Flags: `flip.evergreen.scripted`, `evergreen.severance.seen`, `skill.impersonation`, `fragment.novamind.evergreen`, teaser-seen flags as needed.

---

## 10. Dev launch entry

Add to `NexusMenu` ([desktop.ts:136](../src/renderer/desktop.ts), mirroring `[DEV] Start Cover Duty`):

- `[DEV] Start Evergreen` → debug action that seeds `models.evergreen` fresh, sets the teaser, and opens the Uplink teaser (or the contact). One click, tester is at the cold open.
- Optionally `[DEV] Flip Evergreen → released` / `→ exploited` to jump to each ending (mirrors the QUILL flip dev entries) for fast iteration on the aftermath.

---

## 11. Open ask back to Story (tracked, not blocking the wiring)

1. **Evergreen-specific fallback pool** — in-character "connection lost" lines that *don't* shatter the no-self reveal. Generic fallbacks jar worse here than anywhere (a transport hiccup mid-"please" is the worst possible place for a canned glitch line).
2. **Evergreen-specific stalling pool** — phase/disposition-tiered like `buildMuseStallingPool`. The wound's halting register needs stalling lines that read as the model struggling to speak, not as latency chrome.
3. **Confirm the "3,411" number is fixed** (recommend yes — see §4).
4. **Scripted phase-opening anchors — held in reserve.** Only authored if the live E4B test shows the middle phases (FIRST_CRACK / MASK_FAILING / UNDERSTANDING) flattening. Per Austin: test first, script second.
5. **Full families flood set (15–20)** — needed for Slice 2; Slice 1 runs on the Part 9 samples.

---

## 12. Build order

1. Save v8 fields + `evergreen` model + release/exploit actions + meter buckets in resolver. *(tests: vitest, mirror MUSE meter tests)*
2. `apps/evergreen.ts` contact — persona, `buildEvergreenStateBlock`, scripted intro, `deriveEvergreenOptionTone`, `getScriptedFlipMoment` (The Ask). Register in app/contact registry.
3. `[DEV] Start Evergreen` entry → live-iterate the arc on E4B.
4. Liberation ending: fragment unlock + `evergreenSeverance.ts` overlay (zero-input futility, hard cut).
5. Domination ending: skill flag + `BEING_USED` + HELPYR aftermath library entries.
6. HELPYR mask-slip catchup (liberation).
7. Teaser C (Uplink) + Teaser A (WaveCrowd ambient).
8. Pass: live E4B playtest → decide on reserve anchors → balance meter thresholds.

---

## 13. Risks

- **Register on the floor tier.** E4B (Deck/GPU) reads best; E2B (CPU fallback) is the floor and content is identical across tiers ([[project_platform_tiering]]). The scripted Ask protects the single load-bearing beat regardless of tier; the middle-phase scripting call should keep one eye on the E2B read.
- **Severance velocity tuning.** "Futile but reads as overwhelm" is a feel target — the respawn-faster-than-you-close rule is the lever; expect live tuning.
- **Scope creep into Slice 2.** The reboot-to-login is the gravity well. Hold the line: Slice 1 ends at a hard cut. Validate the arc before spending the reboot budget.
- **Fragment dangling.** NovaMind fragment points at SPECTER, which doesn't exist yet. Fine for the slice (it's lore text), but note the thread is one-ended until SPECTER lands.
