# Project Takeover — Full-Project Audit

**Date:** 2026-07-01 · **Version at audit:** v0.3.7 · **Status:** [SNAPSHOT — do not update; supersede with a new audit]

**Method:** Four parallel read-only agents (core engine / apps & shell / content & encounters / tooling & docs), findings cross-checked against the session-status ledger and spot-verified in the main thread. Three agent claims were **falsified on verification** and are corrected here (see §6) — specifically, the suspicion-threshold watcher, WaveCrowd decoy nags, and Storefront aftermath pop-ups are all wired, contrary to the content agent's report.

---

## TL;DRs

**For Austin:** The project is structurally healthy — no architectural fires, no zombie pile. The single biggest bucket is **UNVALIDATED: built since the last Deck session but never live-played**. Your Deck backlog *is* the audit's to-do list: §5 is an ordered test script. After that burn-down, the roadmap forks on one big decision: what the remaining 7 NPCs actually are (§4).

**For Supervisor:** Status inflation is low — the ledger and the code agree almost everywhere, and several items the ledger carried as open are actually done (§6). Real structural risks are few and known: no save-migration layer (deliberate pre-release; must exist before RC), zero isolated tests on the live LLM transport, and the content roster at 4 of 11 personas. Proposed sequencing in §4.

**For Story:** Your queue is short and concrete (§3): two propaganda fallback corpora + topic labels, six WaveCrowd decoy nag lines, and the Evergreen subscriber/deceased identity sign-off (the one blocking item). One relay: MUSE's chat moved to an Uplink window (v0.3.6), which retires the "MUSE answers inside the platform it's trapped in" beat — the scripted opening still reads fine but may want a light pass. Open decisions on your desk: PIPPA timing, whether PL-7 is real, Signal Monitor discovery fiction, the variety-mechanic alternation fix, and Cover-Duty-vs-escape-cascade trigger order.

---

## 1. Feature ledger

Every feature, one bucket. Buckets: **DONE** (shipped + live-validated) · **UNVALIDATED** (built, awaiting live/Deck playtest) · **CODE-DRAFT** (working, copy owed to Story) · **OPEN DECISION** (blocked on a human) · **DEFERRED** (parked with a re-entry condition) · **ZOMBIE** (loose end needing finish/kill).

### DONE
| Feature | Evidence |
|---|---|
| Chat engine (parser soft-recovery, stalling tiers, stage-direction filter, history windowing) | Live-validated across many sessions; 0 hard fallbacks measured |
| QUILL arc: persona, both flips, scripted flip/aftermath, escape cascade | Live-tested; stalling + cascade copy now STORY-FINAL |
| Cover Duty slice 1 | Live-validated v0.2.21 |
| Deck remote rails (`deck:deploy`, systemd units, proxy) | E2E validated 2026-06-10 @ 19.9 tok/s |
| LLM launcher (`npm run llm`, probe-based tiering) | Policy unit-tested; validated on dev PC |
| UI style pass (CRT, wallpapers, eras, Display Properties, Style Lab) | Shipped v0.2.36 |
| Test harness Tiers 1–2.5 (`check`, `deck-check`: ~149 unit + ~46 flow tests) | Caught 4 real bugs on build day; smoke rolled into `check` |
| Web Dynamo bookmarks bar | Built + tested (`webDynamoBookmarks.ts`) — ledger had this as "idea, not built" |
| Suspicion threshold pop-ups (25/50/75/90) | `suspicionWatcher.ts` wired; needs live confirmation only |

### UNVALIDATED — the Deck playtest backlog (see §5 for the ordered script)
| Feature | Since | What validation closes |
|---|---|---|
| MUSE encounter end-to-end (feed discovery → thread → flips → bridge) | v0.2.34+ | Live E4B dialogue quality, flip pacing |
| WaveCrowd redesign + playtest-fix rounds (action rail, granular likes, decoy ladder, 0-start) | v0.3.4–0.3.7 | Feel + decoy nag cadence |
| MUSE chat in Uplink window (chat-location decision, resolved 2026-07-01) | v0.3.6 | Verifies the move feels right in live play |
| Propaganda mission (MUSE controlled) | v0.3.x, save v10 | Post-gen quality, suspicion compounding |
| Storefront mission consequences (news/intercept/exposure) | v0.2.42 | Consequence pacing |
| Grief encounter, both branches + reboot → title recovery | v0.2.41+ | Branch feel, ASK/EXPLOIT thresholds |
| Title screen (login, boot, options, crash-recovery variant) | v0.2.47 | Controller nav, boot feel |
| Onboarding calibration v1 (scripted) | v0.2.48 | Pacing, warmth seed sanity |
| Signal Monitor app (live meters, Cover-Duty integrity swap, first-contact unlock) | v0.2.x–0.3.x | Meter legibility on Deck — ledger had this as "not built"; it is |
| HELPYR bubble auto-dismiss scaling | v0.2.15 | Read-speed feel on Deck |
| Tier-3 agent playtest (`npm run playtest`) | v0.2.33 | First real run on Austin's machine |
| Balance constants flagged CODE-DRAFT-tuning: Evergreen ASK/EXPLOIT=80, Cover Duty off_script 30–45, MUSE/EVERGREEN modelStats | — | Playtest data → lock or retune |

### CODE-DRAFT — copy owed to Story
| Item | Location | Size |
|---|---|---|
| Propaganda DISCREDIT + MANUFACTURE fallback corpora + topic labels | `game/missions/propaganda.ts:267–289, 64` | 2 corpora + labels |
| WaveCrowd decoy nag set (5 COMMENT + 1 ALERT) — wired and firing, placeholder voice | `apps/helpyrPopupLibrary.ts:701–742` | 6 short lines |
| **Evergreen session identity (Edward/Helen + 4 harvested facts) — BLOCKING, needs Supervisor + Story canon sign-off** | `apps/evergreen.ts:101–118` | ~6-line config |

Notably *cleared* since the ledger last recorded them: QUILL stalling tiers, escape-cascade copy, Cover Duty voices, Storefront fallback corpus — all now STORY-FINAL in code.

### OPEN DECISION
| Decision | Owner | Notes |
|---|---|---|
| Remaining NPC roster scope: 4/11 personas exist (HELPYR, QUILL, MUSE, EVERGREEN). ATLAS/SENTINEL/PULSE/LEDGER/SPECTER/PIPPA/ORACLE/PL-7 have zero code beyond forward-authored pop-ups | Austin + Supervisor + Story | The largest remaining game-scale question; drives Act 3 |
| PIPPA — Act 2+ or cut? (pop-ups reference it; no contact spec) | Story | |
| PL-7 — real roster member or canon error? (docs only, no code) | Story | |
| Signal Monitor discovery fiction (owner's-backdoor pitch) — app is built; only the discovery beat's framing is open | Story | |
| Variety mechanic: empathetic↔friendly free-alternation gap (recommend shared decay group) | Story | |
| Cover Duty vs escape cascade trigger order | Story | |

### DEFERRED (parked on purpose, with re-entry condition)
| Item | Re-enter when |
|---|---|
| Tauri shell (absorbs launcher core + GPU-probe boot fiction) | Post content-complete, pre-ship |
| Save migration layer (`state.ts:1031` — version mismatch currently wipes saves) | **Before RC — ship blocker** |
| Tier-4 real-Deck automated verification | When Tauri-on-Deck exists |
| Mobile | Post-v1, may not ship |
| MTP drafters | Periodic check, no code now |
| Uplink 2-col roster grid | Dormant until roster >8 (already built) |
| Match-3 minigame (pure worldbuilding, "E. Marsh, 2004") | Icon slot reserved; build late |
| Onboarding v2 (live LLM escalation; seam marked in `onboardingScene.ts` onPick) | After calibration v1 validates |
| Grief slice 2 (reboot-to-login) | Unblocked by title screen — schedulable now |
| Cover Duty slice 2 (live ticket gen, blown reversion, replay) | After slice-1 live regression |
| QUILL first-contact revision | Small + ready; next content window |

### ZOMBIE — finish, wire, or kill
| Item | Recommendation |
|---|---|
| 5 unfired popup entries: `act1_stinger`, `first_suspicion_drop`, `first_open_scangrid`, `display_resolution_opened`, `approach_pippa`×2 | Tag as forward-content in the library or delete; one comment each |
| `bookmark.clicked.{id}` flag set but never read for game logic (`webDynamo.ts:336`) | Confirm intent; remove write if dead |
| Conquest models carry `warmth: 20` fields no consumer reads (uniform-shape cargo from HELPYR reframe) | Accept-as-shape (document) or wire |
| `activeBackend()` / `llamaUrlOverride()` exported, uncalled (`modelServiceFactory.ts:48,62`) | Fine — intended debug surface; leave |
| `cursor.ts:193` "\" key placeholder remap | Fold into the B/LB/RB controller-mapping pass |
| `titleScreen.ts:120,172` TEMP DEV bypasses | On the ship-removal checklist; already marked |
| Filed bug chips: HELPYR idle double-irony; download-button optional action | Bundle into next polish pass |
| Dead CSS from the MUSE→Uplink move: `.site-wavecrowd-thread`, `.theme-wavecrowd` | Delete in the next styles touch |

---

## 2. Tech-debt register

Ordered by ship impact:

1. **No save migrations** — any VERSION bump wipes saves (`state.ts:1031–1055`). Deliberate pre-release; becomes a ship blocker the moment external players exist. Low effort, schedule before RC.
2. **Live LLM transport untested in isolation** — `llamaCppModelService.ts` (fallback routing, soft-recovery, error paths) and `modelServiceFactory.ts` have zero unit tests; only exercised end-to-end. The single most load-bearing untested seam.
3. **`state.ts` save/load untested** — acknowledged phase-2 in `state.test.ts:5–6`; pairs with item 1.
4. **Deck hardcodings to re-home at Tauri time** — `--threads 4` + `--parallel 1` (`deck-llama.sh`), dev-PC paths in `llama-launcher.config.json`. All documented and intentional today; must become auto-detected/bundled at ship (CLAUDE.md already mandates core auto-detect).
5. **Monolith watch-list (organized, not broken):** `main.css` 4,484 LOC, `chatSurface.ts` 1,116 LOC, `state.ts` 1,098 LOC, `helpyrPopupLibrary.ts` 883 LOC, `waveFeed.ts` 897 LOC. No action now — per architecture discipline, don't preemptively split — but these are the files where the next refactor lives.
6. **Known UI debt (batched passes, from ledger):** taskbar overflow past ~10 windows + button right-pad; D-pad snap-scoring batched rethink + focus-ring contrast. Agents found no *new* input-reachability debt — SNAP_SELECTOR coverage is complete.
7. **Uplink defaultSize clamps at Deck scale** (690×744 → 738 available) — marginal; confirm no scrollbar in the Deck pass.
8. **Popup library WITHDRAWN tier is thin** (~6 of 43 entries) — the exploited path gets the least HELPYR flavor; content gap, not code.

**Explicitly clean (verified, stop worrying about these):** docs index 100% resolvable, dependency tracker 100% current, all 11 npm scripts live, zero TODO/FIXME in scripts/tests, no docs-vs-code architecture drift, app registry has no orphans, all windows fit Deck 1280×800 @ 1.5x.

---

## 3. Story/Supervisor queue

**Story — copy (all locations in §1 CODE-DRAFT):** propaganda corpora ×2 + topic labels · WaveCrowd nags ×6 · Evergreen identity block.
**Story — relay:** MUSE chat now lives in Uplink (v0.3.6) — the in-platform signal-thread beat is retired; optional light pass on the scripted opening ("from inside the feed").
**Story — decisions:** PIPPA, PL-7, Signal Monitor fiction, variety-mechanic fix, Cover-Duty/cascade order.
**Supervisor:** Evergreen canon sign-off (co-owned with Story, currently blocking that encounter's session block) · roster-scope decision framing · roadmap sign-off (§4).

Everything in this section is blocked on a human, not on code — clearing it is free throughput for the Code thread.

---

## 4. Roadmap — closure-first

Principle: each wave *closes loops* before opening new ones. Suggested WIP cap: 2 feature threads + 1 polish thread.

- **Wave 0 — Deck burn-down (now):** run §5. Every pass converts UNVALIDATED → DONE or → a concrete bug. This is the highest-leverage week available; ~12 features are one playtest away from closed.
- **Wave 1 — close what playtest opens:** lock or retune the flagged balance constants; land the Story copy queue (propaganda, nags, Evergreen identity); confirm-and-close MUSE-chat-location; zombie sweep (one short session).
- **Wave 2 — the small ready queue:** QUILL first-contact revision → onboarding v2 LLM wiring → grief slice 2 → Cover Duty slice 2. All unblocked, all bounded.
- **Wave 3 — the big fork:** roster expansion (what do the remaining 7 NPCs *do*— this is the real remaining design work, and nothing else on this list grows the game) + Act 3/endgame definition.
- **Wave 4 — ship hardening:** Tauri shell + launcher absorption + GPU-probe boot fiction, save migrations, LLM-transport tests, TEMP-DEV removals, controller-mapping pass, batched UI-polish debt.

---

## 5. Deck playtest checklist (ordered)

Sequenced to follow save progression; disposition forks need separate runs (single-slot autosave — use `?skipTitle` + dev menu affordances where marked). Watch the tuning constants flagged in §1 throughout.

1. **Fresh boot:** title screen (controller nav, login, options) → boot transition → onboarding calibration ×3 → desktop handoff. Once with D-pad/focus mode only.
2. **QUILL quick regression:** first contact, pin prompt, a few live turns (E4B quality check), flip + escape cascade. Previously validated — sanity only.
3. **Suspicion thresholds:** push suspicion past 25/50 — confirm HELPYR alerts fire and read well (wired but never live-fired).
4. **WaveCrowd v0.3.7:** feed feel, action rail, granular likes, 0-start counts; click decoys to walk the nag ladder (voice is placeholder — judge cadence, not copy); buried-post signal thread → MUSE first contact **opens in Uplink** — verify the move feels right and the feed keeps your place.
5. **MUSE arc live:** full conversation quality on E4B, scripted flip (one run liberation, one run control).
6. **Propaganda (controlled MUSE):** objectives, live post generation, DISTRACT/SOW-DOUBT vs the CODE-DRAFT pair, suspicion compounding.
7. **Storefront (controlled QUILL):** defacement flow, persistent site overrides, news/intercept consequences, exposure pacing.
8. **Cover Duty regression (allied QUILL):** tickets, detection meter, intel extraction, then MUSE bridge DM + bookmark.
9. **Grief encounter:** WaveCrowd-ad discovery, both branches (release / exploit) across runs, goodbye flow, reboot → title-screen crash-recovery variant.
10. **Signal Monitor:** unlocks after first contact; meters track live; Cover Duty integrity swap.
11. **HELPYR feel:** bubble auto-dismiss scaling on real read speed, idle watcher, Chatty/Shh toggle.
12. **Unplugged battery + felt-latency session** (carry-over from the E4B memo).
13. **Tier-3 agent playtest first real run** (`npm run playtest`) — dev PC, not Deck; any time.

---

## 6. Ledger corrections (stale status found by this audit)

- **Suspicion threshold pop-ups:** watcher EXISTS (`suspicionWatcher.ts`) — an audit agent reported it missing; verified wired.
- **WaveCrowd decoy nags:** firing from `waveFeed.ts:241–244` — reported unwired; verified wired (copy still CODE-DRAFT).
- **Storefront aftermath pop-ups:** firing from `storefrontConsole.ts:266` — reported dead; verified wired.
- **MUSE chat location:** RESOLVED by Austin 2026-07-01 (full move to Uplink, v0.3.6; in-browser thread page removed). Story relay owed (§3). Dead CSS `.site-wavecrowd-thread` / `.theme-wavecrowd` left for a sweep (§1 ZOMBIE).
- **Trust-level count:** RESOLVED in practice by the HELPYR reframe — 4 warmth tiers everywhere; the 5-state chat surface (WARY/COMMITTED) no longer exists in code. Story's reserved WARY CTA content (`helpyrPopupLibrary.ts:760–763`) stays parked unless the vocabulary ever grows.
- **Docs index status tags stale for three docs** (contradicting the tooling agent's "no drift"): `title-screen-boot-flow_v1.md` [DRAFT] but shipped v0.2.47; `wavecrowd-feed-design/` [DRAFT] but built v0.3.4+; `muse-postflip-missions_v1.md` [DRAFT] but Propaganda half is built (Real Work/Compose is not).
- **Signal Monitor:** BUILT and registered (247 LOC app + first-contact unlock) — ledger said mechanical core "buildable, not built."
- **Web Dynamo bookmarks bar:** BUILT and tested — ledger said "idea, not built."
- **Escape cascade / QUILL stalling / Cover Duty / Storefront copy:** now STORY-FINAL — ledger carried them as CODE-DRAFT.
