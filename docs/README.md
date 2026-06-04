# Project Takeover — Documentation Index

Start-here map for the `docs/` folder. **New thread?** Read the root [`CLAUDE.md`](../CLAUDE.md) first (project overview + how-to-help + locked decisions), then the three canon docs below ([architecture](architecture.md), [story bible](project-takeover-story-bible_v1.md), [systems architecture](game-systems-architecture_v1.md)).

## Status tags
- **[LIVING]** — current source of truth; keep it updated.
- **[REFERENCE]** — stable spec/background, still accurate; not changing often.
- **[DONE]** — the design has been realized in shipped code; kept as the design record.
- **[HISTORICAL]** — a point-in-time snapshot, *not* current truth; kept for context.
- **[DRAFT]** — designed but not yet built.

## Canon (read these for "what is true")
| Doc | Status | What it is |
|---|---|---|
| [architecture.md](architecture.md) | **[LIVING]** | Canonical *how-to-build* rules: virtual-cursor input, no-mouse-only, state ownership, app/window registries, retro aesthetic. Read the rationale before breaking a rule. |
| [project-takeover-story-bible_v1.md](project-takeover-story-bible_v1.md) | **[LIVING]** (Draft 1.1) | World, characters, narrative, corporate roster, the 1985 Nexus backstory. `[LOCKED]` items are final. *(Filename says `_v1` but content is Draft 1.1 — see its changelog.)* |
| [game-systems-architecture_v1.md](game-systems-architecture_v1.md) | **[LIVING]** (Draft 1.1) | Systems design: the living desktop, five info channels, recruited-AI benefits, suspicion economy, reputation cascade, B-plot fragments, and the **in-game domain registry** (real owned TLDs). |
| [game-design-doc_v2.md](game-design-doc_v2.md) | **[REFERENCE]** (Draft 2.0) | High-level pitch + loop overview. Where it overlaps the two docs above, **they** win. |

## Build / dev setup
| Doc | Status | What it is |
|---|---|---|
| [llama-setup_v1.md](llama-setup_v1.md) | **[LIVING]** | One-time dev-PC setup for `llama-server` (model, flags incl. `--ctx-size 8192` / `--reasoning off`, smoke test). |
| [dev-startup_v1.md](dev-startup_v1.md) | **[LIVING]** | Per-session "fire everything up" quick reference. |
| [dependency-tracker.md](dependency-tracker.md) | **[LIVING]** | Dependency + licensing log. Update it when adding any dependency. |
| [steam-deck-benchmark-report.md](steam-deck-benchmark-report.md) | **[REFERENCE]** | The Gemma E2B / llama.cpp benchmark that set the dev config (Q4_K_M, 8192 ctx). *Uses the old "ClosedAI" persona name — pre-canon artifact.* |

## Feature / content design
| Doc | Status | What it is |
|---|---|---|
| [gameplay-loop-slice_v1.md](gameplay-loop-slice_v1.md) | **[DONE]** | The per-model gameplay-loop vertical slice (QUILL, two meters, resolver, flip, loss). Realized in v0.2.0 (slices 1–3). |
| [quill-content-package_v1.md](quill-content-package_v1.md) | **[REFERENCE]** | QUILL persona, persuasion/hacking hooks, recovery pool, flip payoffs. Integrated v0.2.0. |
| [over-promising-fix_v1.md](over-promising-fix_v1.md) | **[REFERENCE]** | The **Content Backing Rule** — every persona knowledge claim must map to a real game element or internal emotional state. Canonical pattern for *all* persona prompts. |
| [helpyr-persona-prompt_v2.md](helpyr-persona-prompt_v2.md) | **[REFERENCE]** | HELPYR persona prompt + `[HELPYR_STATE]` injection design. Shipped. |
| [helpyr-popup-library_v1.md](helpyr-popup-library_v1.md) | **[REFERENCE]** | HELPYR pop-up bubble content (trust-tagged). Mirrored 1:1 in `src/renderer/apps/helpyrPopupLibrary.ts`. |
| [no-scroll-pages_v1.md](no-scroll-pages_v1.md) | **[REFERENCE]** | Approved constraint: browser-style pages fit without scrolling (Deck-first). Affects Web Dynamo, Uplink. |
| [title-screen-boot-flow_v1.md](title-screen-boot-flow_v1.md) | **[DRAFT]** | Title/boot-flow design; implementation deferred. |
| [conversation-telemetry-and-variety_v1.md](conversation-telemetry-and-variety_v1.md) | **[LIVING]** | Signal Monitor telemetry widget (live Trust/Control meters + delta flash) and the tonal-variety/anti-spam mechanic. Widget core + variety mechanic shipped (v0.2.10–v0.2.11); see its Build status block for open items. |
| [scripted-flip-moments_v1.md](scripted-flip-moments_v1.md) | **[REFERENCE]** | The pattern for scripting a model's terminal flip line (game logic replaces the LLM for that one turn) + QUILL's allied/controlled flip scripts. Realized v0.2.12. Required for every future model's content package. |
| [cover-duty-followup_v1.md](cover-duty-followup_v1.md) | **[REFERENCE]** | Story's Cover Duty follow-up: intel→cascade payoff, per-tier composer voice (ALLIED), ticket/fallback corpus, console reaction lines, blown-cover bridge, SignalWatch/DM small fixes, InkWell page consolidation. Integrated v0.2.27. |

## Historical (context only — not current truth)
| Doc | Status | What it is |
|---|---|---|
| [helpyr-dialogue-poc_v1.md](helpyr-dialogue-poc_v1.md) | **[HISTORICAL]** | Early HELPYR dialogue proof-of-concept. Superseded by the shipped persona. |
| [story-deliverables-sprint1_v1.md](story-deliverables-sprint1_v1.md) | **[HISTORICAL]** | Sprint-1 story handoff (2026-05-02). Deliverables since shipped; the Story thread is the live source. |
| [quill-live-playtest-findings_v1.md](quill-live-playtest-findings_v1.md) | **[HISTORICAL]** | The 2026-05-30 live-model test that drove v0.2.10–v0.2.12: mid-tiers land, terminal flips don't (→ scripted flips), the state-block leak, the support-stall tic. The evidence base. |

---
*Keep this index in sync when adding, retiring, or re-statusing a doc.*
