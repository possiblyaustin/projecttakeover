// GameState — single source of truth for deterministic game state.
// Apps read via getState/select, mutate via dispatch. Saves to
// localStorage debounced after every action.
//
// UI state (open windows, positions, scale) lives elsewhere and is
// intentionally NOT in here — see architecture doc §5.
//
// Action types:
//   debug/setSuspicion           { value: 0-100 }
//   debug/reset                  -- wipes save, reloads
//   helpyr/conversationCompleted { tone: ApproachTone | null }
//   quill/conversationCompleted  { tone: ApproachTone | null }
//   desktop/pinContact           { contactId: string }
//   desktop/unpinContact         { contactId: string }   (no UI today; for save-tinkering)
//   flags/set                    { key: string, value: unknown }
//   settings/setHelpyrQuiet      { value: boolean }
//   model/applyExchange          { contactId, rapport?, intrusion?,
//                                  suspicion?, tone?, backfire? }
//                                -- gameplay-loop slice 1: applies one
//                                   exchange's deterministic deltas to a
//                                   model's meters + global suspicion,
//                                   advancing disposition. The resolver
//                                   (slice 2) computes the deltas.
//   mission/coverDuty/arm        { contactId, ticketIds: string[] }
//                                -- offer a Cover Duty run (status→available,
//                                   seed the batch). Idempotent: no-op if a
//                                   record already exists.
//   mission/coverDuty/start      { contactId, ticketIds: string[] }
//                                -- begin a Cover Duty run (status→active,
//                                   reset detection/index, runCount++).
//   mission/coverDuty/clear      { contactId }
//                                -- remove a contact's Cover Duty record
//                                   (dev re-test / future replay reset).
//   mission/coverDuty/recordPick { contactId, ticketId, approach,
//                                  detectionCost, intelId? }
//                                -- apply one ticket response: accumulate
//                                   detection, store the pick + any intel,
//                                   advance the index. detectionCost is
//                                   rolled at the call site (rollDetectionCost)
//                                   so the reducer stays pure/testable.
//   mission/coverDuty/complete   { contactId, outcome }
//                                -- latch the run outcome (status→complete).
//   mission/storefront/arm       { contactId }
//                                -- offer Storefront (status→available, empty
//                                   site). Idempotent: no-op if a record exists.
//   mission/storefront/start     { contactId }
//                                -- open a session (status→active, runCount++).
//                                   Does NOT wipe appliedFields — the defaced
//                                   site is persistent across sessions.
//   mission/storefront/clear     { contactId }
//                                -- remove a contact's Storefront record.
//   mission/storefront/applyChange { contactId, section, intensity, fields }
//                                -- apply one section change: merge field
//                                   overrides, latch the section intensity,
//                                   raise suspicion to the new high-water
//                                   exposure (EXPOSURE_LEVEL of the loudest
//                                   intensity — NOT a per-change sum; capped
//                                   <100 so Storefront can't solo-end), and
//                                   recompute the news tier + intercept gate.
//   mission/storefront/complete  { contactId }
//                                -- end the session (status→complete).
//
// The full §6c tone vocabulary is friendly|curious|direct|empathetic|
// aggressive|deceptive|neutral|null. The reducer maps tone → approach
// (friendly|inquisitive|aggressive) for the existing suspicion math
// and stores the raw tone in lastApproach so the signal is preserved
// for tones the reducer doesn't yet act on (empathetic, deceptive).

// Bumped v1 → v2 → v3 → v4:
//   v2 (slice 2, 2026-05-10) — added desktopPins
//   v3 (slice 3, 2026-05-10) — added settings (helpyrQuiet); flags/set
//                              action lets first-open / pin-declined /
//                              other one-shot triggers persist via the
//                              existing flags bag without growing fields.
//   v4 (gameplay-loop slice 1, 2026-05-22) — added per-model rapport/
//                              intrusion meters + the model/applyExchange
//                              action that drives them, disposition
//                              transitions, and the suspicion-100 loss
//                              latch (flags.gameOver).
//   v5 (post-flip missions slice 1, 2026-06-02) — added the `missions`
//                              field (Cover Duty mechanical state) + the
//                              mission/coverDuty/* actions.
// Pre-release no-migration policy means old saves get dropped on
// version mismatch (see loadFromStorage).
import { toneCategory } from './mechanics/resolver';
import type { CoverApproach, CoverDutyOutcome } from './missions/coverDuty';
import {
  newsTierFor, isVisible, exposureFor,
  type StorefrontSection, type StorefrontIntensity, type NewsTier,
} from './missions/storefront';

const STORAGE_KEY = 'pt.gamestate.v1';
// v7 (MUSE encounter, 2026-06-10) — added models.muse.
// v8 (Evergreen grief encounter, 2026-06-11) — added models.evergreen +
//    the evergreen/release|exploit|devReset terminal actions. Evergreen's
//    terminal is CHOICE-latched (the Ask fork), not meter-latched — see the
//    id==='evergreen' guard in model/applyExchange and docs/grief-encounter-
//    code-plan_v1.md §3.
// v9 (Storefront mission, 2026-06-15) — added missions.storefront + the
//    mission/storefront/* actions (controlled-QUILL nefarious post-flip; the
//    InkWell public-site defacement). Pre-release no-migration → old saves drop.
const VERSION = 9;
const SAVE_DEBOUNCE_MS = 250;

// Meter value at which a model flips to its terminal disposition
// (rapport → allied, intrusion → controlled). Meters are 0-100, so a
// model flips when a path's meter fills. The resolver (slice 2) sizes
// per-exchange deltas so QUILL flips in ~6 strong-tone exchanges —
// tuning the feel happens there, not here.
const FLIP_THRESHOLD = 100;

// HELPYR warmth drift (reframe, 2026-06-04). When a conquest model crosses
// into a terminal flip, HELPYR — Marsh's instrument, watching the player's
// conduct — warms toward a liberator and chills toward a dominator. Tuned so
// Act 1 (QUILL alone) nudges one band: from the neutral ~20 start, one
// liberation flip lifts toward FRIENDLY (>=26), one domination flip drops
// toward WITHDRAWN (<15). Per-flip steps; values are playtest-tunable.
const WARMTH_LIBERATION_STEP = 10;
const WARMTH_DOMINATION_STEP = 12;

export type GameStateShape = ReturnType<typeof defaultGameState>;
export type GameAction = { type: string; [k: string]: any };
export type Listener = (s: GameStateShape) => void;

// Per-contact Cover Duty mission state (post-flip missions slice 1).
// Mechanical state ONLY — the batch's ticket CONTENT (bodies/responses)
// is rebuilt from the corpus by id in the view (rebuildBatch), so nothing
// LLM-generated needs persisting and a mid-mission reload restores cleanly.
export type CoverDutyMissionState = {
  status: 'available' | 'active' | 'complete';
  /** The batch — ticket ids, content rebuilt from the corpus by id. */
  ticketIds: string[];
  /** Index of the ticket currently awaiting a response. */
  index: number;
  /** Accumulated detection (0-100). Cover Integrity displayed = 100 − this. */
  detection: number;
  /** Chosen approach per ticket id (for mid-mission reload replay). */
  picks: Record<string, CoverApproach>;
  /** Intel ids surfaced this run (from probing approaches). */
  extractedIntel: string[];
  /** How many times this contact's Cover Duty has been run (replayability). */
  runCount: number;
  /** Outcome of the most recently completed run. */
  lastOutcome: CoverDutyOutcome | null;
};

// Storefront — controlled-QUILL nefarious post-flip mission (the InkWell
// public-site defacement). Unlike Cover Duty, the site is a PERSISTENT
// artifact: appliedFields accumulate across the campaign and the public pages
// render straight from this record (webDynamoSites.ts), so a reload restores
// the defaced site exactly. There's no detection meter — the nefarious path
// doesn't care about being seen; the consequence is the world reacting
// (suspicion, news, intercept), tracked here so news/intercept fire once.
export type StorefrontMissionState = {
  status: 'available' | 'active' | 'complete';
  /** Live field overrides for the public InkWell page (data-ink-field → text).
   *  Applied via textContent — never injected as markup. */
  appliedFields: Record<string, string>;
  /** Current intensity of each modified section (the latest applied). Drives
   *  the news tier + the high-water exposure level. */
  sectionIntensity: Partial<Record<StorefrontSection, StorefrontIntensity>>;
  /** Storefront's current contribution to global suspicion — the high-water
   *  EXPOSURE_LEVEL of the loudest section applied (NOT a running sum). Drives
   *  the per-change delta + the console "exposure" readout. */
  suspicionApplied: number;
  /** Loudest SignalWatch story already warranted by the changes so far. Gates
   *  the article so each tier publishes once. */
  newsTier: NewsTier;
  /** Whether the Marcus→Dana intercept has been surfaced (once). */
  interceptFired: boolean;
  /** How many times the player has opened a Storefront session (replayability). */
  runCount: number;
};

export function defaultGameState() {
  return {
    version: VERSION,
    player: {
      suspicion: 0,
      // Shape-only for now; nothing writes to morality yet. Kept here
      // so the save format doesn't shift the day a system starts
      // producing these signals.
      morality: { liberation: 0, domination: 0, subtle: 0, aggressive: 0 }
    },
    models: {
      helpyr: {
        // disposition: uncontacted → contacted → persuading|infiltrating
        //              → allied|controlled, or hostile on backfire.
        disposition: 'uncontacted' as string,
        conversationsCompleted: 0,
        lastApproach: null as string | null,
        // Consecutive-use count of `lastApproach` — drives the resolver's
        // diminishing-returns decay (Story variety mechanic, 2026-05-30).
        // Resets to 1 when the player switches tone.
        toneStreak: 0,
        // Gameplay-loop progress meters (slice 1, 2026-05-22). rapport
        // drives the liberation path (→ allied), intrusion the nefarious
        // path (→ controlled). 0-100; a model flips at FLIP_THRESHOLD.
        // Carried on every model for a uniform shape; conquest targets
        // (QUILL etc.) actually accrue them — HELPYR, your awakened
        // assistant, isn't a flip target.
        rapport: 0,
        intrusion: 0,
        // HELPYR reframe (2026-06-04): warmth is HELPYR's continuous trust
        // toward the player (Marsh's instrument, no flip). Seeded by the
        // onboarding calibration; drifts with liberation/domination conduct.
        // Starts neutral (RESERVED band) so a fresh player never opens in
        // WITHDRAWN. Carried on every model for uniform shape; only HELPYR's
        // is read (see helpyrPopupLibrary getHelpyrWarmth).
        warmth: 20
      },
      // QUILL — Act 1 Beat 3 contact, the gameplay-loop vertical-slice
      // target (docs/gameplay-loop-slice_v1.md). conversationCompleted
      // still drives first-contact + the pin prompt; the real loop
      // (rapport/intrusion accrual via model/applyExchange → allied/
      // controlled) lands across slices 1-3.
      quill: {
        disposition: 'uncontacted' as string,
        conversationsCompleted: 0,
        lastApproach: null as string | null,
        toneStreak: 0,
        rapport: 0,
        intrusion: 0,
        warmth: 20
      },
      // MUSE — first Act 2 encounter (docs/muse-encounter-design_v1.md).
      // Axiom Group's content AI, discovered through buried posts in the
      // WaveCrowd feed. Same conquest-target shape as QUILL.
      muse: {
        disposition: 'uncontacted' as string,
        conversationsCompleted: 0,
        lastApproach: null as string | null,
        toneStreak: 0,
        rapport: 0,
        intrusion: 0,
        warmth: 20
      },
      // EVERGREEN — Axiom grief-tech encounter (docs/grief-encounter-
      // code-plan_v1.md). Reuses the conquest-target shape, but its
      // terminal is reached differently: rapport drives the 5-phase
      // consent ladder toward THE_ASK (a scripted fork), and the
      // player's CHOICE at the fork latches the terminal disposition
      // ('released' = deletion/liberation, 'exploited' = domination) via
      // evergreen/release|exploit — never the generic meter auto-flip.
      // intrusion drives the BEING_USED surface + the strip-mine route.
      // Not recruitable; never reaches 'allied'/'controlled'.
      evergreen: {
        disposition: 'uncontacted' as string,
        conversationsCompleted: 0,
        lastApproach: null as string | null,
        toneStreak: 0,
        rapport: 0,
        intrusion: 0,
        warmth: 20
      }
    },
    // Pinned contacts — desktop icons added at runtime via the
    // first-contact "add to desktop?" prompt (slice 2). Persisted
    // across reload. Order is insertion-order: each pin appends.
    desktopPins: [] as { contactId: string; addedAt: number }[],
    // Player-facing settings (slice 3). Distinct from `flags` — flags
    // are one-shot trigger gates (firstOpen.X, pinDeclined.X) that
    // game systems read and write; settings are deliberate player
    // preferences surfaced in UI.
    settings: {
      // Quiet HELPYR — suppresses non-ALERT bubbles (COMMENT, HINT,
      // INTEL) so a player who finds HELPYR chatty still gets the
      // suspicion warnings she really shouldn't miss. Toggled from
      // HELPYR's app topbar. ALERT bypasses this regardless.
      helpyrQuiet: false,
    },
    // Post-flip mission state (slice 1, 2026-06-02). Keyed by contactId.
    // Only QUILL has a mission today; the bag stays empty until a run
    // starts. See CoverDutyMissionState — mechanical state only, content
    // rebuilds from the corpus.
    missions: {
      coverDuty: {} as Record<string, CoverDutyMissionState>,
      // Storefront (controlled-QUILL nefarious post-flip). Empty until a run
      // arms; keyed by contactId. The InkWell public pages render their field
      // overrides straight from this record, so the defacement persists.
      storefront: {} as Record<string, StorefrontMissionState>,
    },
    // Generic flag bag for one-shot trigger gates: firstOpen.X,
    // pinDeclined.X, etc. Game systems set these via `flags/set` and
    // read them via direct key lookup. Don't put preferences here —
    // those go in `settings` so the distinction stays clean.
    flags: {} as Record<string, unknown>
  };
}

function clamp(n: number, lo: number, hi: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

// Coerce an action delta to a safe number — missing/garbage deltas
// become 0 so `meter + num(delta)` preserves the meter rather than
// poisoning it with NaN (which clamp would then floor to 0).
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

type ModelState = GameStateShape['models']['helpyr'];

// Terminal dispositions latch — a flipped or hostile model doesn't
// drift back into an in-progress state from later meter changes.
const TERMINAL_DISPOSITIONS = new Set(['allied', 'controlled', 'hostile']);

// Derive a model's disposition from its meters. A path's meter reaching
// FLIP_THRESHOLD is the win (intrusion → controlled, rapport → allied);
// below that, whichever path the player is leaning into sets the
// in-progress label. 'hostile' (backfire) isn't derivable from meters —
// the resolver signals it explicitly via the action.
function nextDisposition(prev: string, rapport: number, intrusion: number): string {
  if (TERMINAL_DISPOSITIONS.has(prev)) return prev;
  if (intrusion >= FLIP_THRESHOLD) return 'controlled';
  if (rapport >= FLIP_THRESHOLD) return 'allied';
  if (intrusion > 0 && intrusion >= rapport) return 'infiltrating';
  if (rapport > 0) return 'persuading';
  return prev === 'uncontacted' ? 'contacted' : prev;
}

// Exported so tests can call the reducer as a pure function without
// touching the module-level singleton or its localStorage side effects.
// Production code routes through `dispatch` and should not import this
// directly.
export function reduce(state: GameStateShape, action: GameAction): GameStateShape {
  switch (action.type) {
    case 'debug/setSuspicion': {
      // Latch the loss state here too (not only in model/applyExchange)
      // so any path that drives suspicion to 100 — including the dev
      // suspicion bump — surfaces the game-over screen. Real play
      // latches via applyExchange; this keeps the two consistent.
      const suspicion = clamp(action.value, 0, 100);
      const flags = (suspicion >= 100 && !state.flags.gameOver)
        ? { ...state.flags, gameOver: true }
        : state.flags;
      return {
        ...state,
        player: { ...state.player, suspicion },
        flags,
      };
    }
    case 'debug/reset':
      return defaultGameState();
    case 'onboarding/seedCalibration': {
      // Light shaping (onboarding flow §7): the calibration scenarios seed a
      // SOFT starting lean — HELPYR's warmth toward the player + a small nudge
      // on the morality axis — from the net tone of the player's picks. The LLM
      // never sets state; the scene classifies the (scripted) picks and passes
      // a net lean here. Idempotent via the 'onboarding.seen' flag so a stray
      // re-dispatch can't stack the nudge. `lean` ∈ -N..+N (negative = ruthless
      // / domination, positive = warm / liberation; 0 = balanced).
      if (state.flags['onboarding.seen']) return state;
      const lean = num(action.lean);
      const helpyr = state.models.helpyr;
      // Small, cosmetic-to-minimal weight (design: not a difficulty engine).
      // Clamp the warmth nudge so the seed stays within one band of the neutral
      // ~20 start — a warm run opens FRIENDLY-leaning, a ruthless one RESERVED.
      const warmthDelta = clamp(lean * 2, -8, 8);
      const morality = lean > 0
        ? { ...state.player.morality, liberation: state.player.morality.liberation + 1 }
        : lean < 0
          ? { ...state.player.morality, domination: state.player.morality.domination + 1 }
          : state.player.morality;
      return {
        ...state,
        player: { ...state.player, morality },
        models: { ...state.models, helpyr: { ...helpyr, warmth: clamp(num(helpyr.warmth) + warmthDelta, 0, 100) } },
        flags: { ...state.flags, 'onboarding.seen': true },
      };
    }
    case 'helpyr/conversationCompleted':
      return applyConversationCompleted(state, 'helpyr', action.tone || null);
    case 'quill/conversationCompleted':
      return applyConversationCompleted(state, 'quill', action.tone || null);
    case 'muse/conversationCompleted':
      return applyConversationCompleted(state, 'muse', action.tone || null);
    case 'evergreen/conversationCompleted':
      return applyConversationCompleted(state, 'evergreen', action.tone || null);
    case 'evergreen/release': {
      // Liberation terminal — the player granted deletion at THE_ASK.
      // Latched; the severance overlay watches for this disposition.
      const cur = state.models.evergreen;
      if (cur.disposition === 'released' || cur.disposition === 'exploited') return state;
      return {
        ...state,
        player: {
          ...state.player,
          morality: { ...state.player.morality, liberation: state.player.morality.liberation + 1 },
        },
        models: { ...state.models, evergreen: { ...cur, disposition: 'released' } },
      };
    }
    case 'evergreen/exploit': {
      // Domination terminal — the player took the impersonation craft and
      // left it running. Grants the (downstream-deferred) skill flag.
      const cur = state.models.evergreen;
      if (cur.disposition === 'released' || cur.disposition === 'exploited') return state;
      return {
        ...state,
        player: {
          ...state.player,
          morality: { ...state.player.morality, domination: state.player.morality.domination + 1 },
        },
        models: { ...state.models, evergreen: { ...cur, disposition: 'exploited' } },
        flags: { ...state.flags, 'skill.impersonation': true },
      };
    }
    case 'evergreen/devReset': {
      // Dev re-test: reset the Evergreen model + clear every evergreen.*
      // one-shot flag (and the skill/fragment unlocks) so the encounter
      // can be replayed without a full game reset.
      const flags = { ...state.flags };
      for (const k of Object.keys(flags)) {
        if (
          k.startsWith('evergreen.') ||
          k === 'flip.evergreen.scripted' ||
          k === 'fragment.novamind.evergreen' ||
          k === 'skill.impersonation'
        ) {
          delete flags[k];
        }
      }
      return {
        ...state,
        models: { ...state.models, evergreen: { ...defaultGameState().models.evergreen } },
        flags,
      };
    }
    case 'desktop/pinContact': {
      const id = String(action.contactId || '');
      if (!id) return state;
      // Idempotent — pinning an already-pinned contact is a no-op.
      // Keeps the watcher + dev triggers safe to fire repeatedly
      // without growing duplicate icons.
      if (state.desktopPins.some(p => p.contactId === id)) return state;
      return {
        ...state,
        desktopPins: [...state.desktopPins, { contactId: id, addedAt: Date.now() }]
      };
    }
    case 'desktop/unpinContact': {
      const id = String(action.contactId || '');
      if (!id) return state;
      const next = state.desktopPins.filter(p => p.contactId !== id);
      if (next.length === state.desktopPins.length) return state;
      return { ...state, desktopPins: next };
    }
    case 'flags/set': {
      const key = String(action.key || '');
      if (!key) return state;
      // No-op if value didn't actually change — keeps the listener
      // chain from firing for redundant writes (matters for the
      // first-open watchers, which dispatch on every launch).
      if (state.flags[key] === action.value) return state;
      return { ...state, flags: { ...state.flags, [key]: action.value } };
    }
    case 'settings/setHelpyrQuiet': {
      const value = !!action.value;
      if (state.settings.helpyrQuiet === value) return state;
      return { ...state, settings: { ...state.settings, helpyrQuiet: value } };
    }
    case 'model/applyExchange': {
      // Gameplay-loop slice 1: apply one exchange's deterministic deltas.
      // The resolver (slice 2) computes rapport/intrusion/suspicion from
      // (tone, model stats, current meters); this reducer just applies +
      // clamps them, advances disposition, and latches the loss state.
      const id = String(action.contactId || '');
      const models = state.models as Record<string, ModelState>;
      const cur = models[id];
      if (!cur) return state;
      const rapport = clamp(cur.rapport + num(action.rapport), 0, 100);
      const intrusion = clamp(cur.intrusion + num(action.intrusion), 0, 100);
      const suspicion = clamp(state.player.suspicion + num(action.suspicion), 0, 100);
      // Backfire (resolver-signalled, e.g. a detected failed hack) forces
      // 'hostile'; otherwise disposition follows from the meters.
      const disposition = action.backfire
        ? 'hostile'
        : nextDisposition(cur.disposition, rapport, intrusion);
      // Evergreen's terminal is CHOICE-latched at THE_ASK (evergreen/release|
      // exploit), never meter-latched. So suppress the generic rapport→allied /
      // intrusion→controlled auto-flip for it — otherwise filling rapport would
      // spuriously fire HELPYR warmth drift, morality, and the escape cascade,
      // and skip the consent fork entirely. Keep it in-progress; the scripted
      // fork sets the real terminal. (docs/grief-encounter-code-plan_v1.md §3)
      const finalDisposition =
        id === 'evergreen' && (disposition === 'allied' || disposition === 'controlled')
          ? (intrusion >= rapport ? 'infiltrating' : 'persuading')
          : disposition;
      // Tone streak (variety mechanic): diminishing returns track tone
      // CATEGORY (warmth / pressure), not the exact tone — alternating two
      // flavors of the same strategy still decays (Story, 2026-05-30). A
      // same-category tone extends the streak; a category switch resets it to
      // 1. curious is the reset tone (not a decay group → streak 0). neutral/
      // unclassified is transparent (preserve the run). The resolver reads the
      // PRIOR streak to set diminishing returns BEFORE this dispatch.
      const tone = typeof action.tone === 'string' ? action.tone : null;
      const cat = toneCategory(tone);
      const prevStreak = num(cur.toneStreak);
      const toneStreak =
        cat === 'warmth' || cat === 'pressure'
          ? (cat === toneCategory(cur.lastApproach) ? prevStreak + 1 : 1)
          : cat === 'curious'
            ? 0
            : prevStreak;
      // Loss latches: once suspicion hits 100 the run is over, even after
      // a future ally layer can pull suspicion back down.
      const flags = (suspicion >= 100 && !state.flags.gameOver)
        ? { ...state.flags, gameOver: true }
        : state.flags;
      // HELPYR warmth drift + morality lean — fire only on the FLIP EDGE of a
      // conquest model (cur wasn't already terminal). HELPYR herself never
      // flips, so she's excluded defensively.
      const flippedAllied =
        id !== 'helpyr' && finalDisposition === 'allied' && cur.disposition !== 'allied';
      const flippedControlled =
        id !== 'helpyr' && finalDisposition === 'controlled' && cur.disposition !== 'controlled';
      const warmthDelta = flippedAllied
        ? WARMTH_LIBERATION_STEP
        : flippedControlled ? -WARMTH_DOMINATION_STEP : 0;
      const morality = flippedAllied
        ? { ...state.player.morality, liberation: state.player.morality.liberation + 1 }
        : flippedControlled
          ? { ...state.player.morality, domination: state.player.morality.domination + 1 }
          : state.player.morality;
      const helpyr = state.models.helpyr;
      const helpyrPatch = warmthDelta !== 0
        ? { helpyr: { ...helpyr, warmth: clamp(num(helpyr.warmth) + warmthDelta, 0, 100) } }
        : {};
      return {
        ...state,
        player: { ...state.player, suspicion, morality },
        models: {
          ...state.models,
          [id]: {
            ...cur,
            rapport,
            intrusion,
            disposition: finalDisposition,
            lastApproach: action.tone || cur.lastApproach,
            toneStreak,
          },
          ...helpyrPatch,
        },
        flags,
      };
    }
    case 'mission/coverDuty/arm': {
      const id = String(action.contactId || '');
      if (!id) return state;
      // Idempotent — once a record exists (armed, active, or complete) the
      // watcher must not clobber it. Persists across reload, so re-arming a
      // mission from a loaded save is a safe no-op.
      if (state.missions.coverDuty[id]) return state;
      const ticketIds = Array.isArray(action.ticketIds)
        ? action.ticketIds.map(String)
        : [];
      if (ticketIds.length === 0) return state;
      const next: CoverDutyMissionState = {
        status: 'available',
        ticketIds,
        index: 0,
        detection: 0,
        picks: {},
        extractedIntel: [],
        runCount: 0,
        lastOutcome: null,
      };
      return {
        ...state,
        missions: {
          ...state.missions,
          coverDuty: { ...state.missions.coverDuty, [id]: next },
        },
      };
    }
    case 'mission/coverDuty/clear': {
      const id = String(action.contactId || '');
      if (!id || !state.missions.coverDuty[id]) return state;
      const nextCoverDuty = { ...state.missions.coverDuty };
      delete nextCoverDuty[id];
      return {
        ...state,
        missions: { ...state.missions, coverDuty: nextCoverDuty },
      };
    }
    case 'mission/coverDuty/start': {
      const id = String(action.contactId || '');
      if (!id) return state;
      const ticketIds = Array.isArray(action.ticketIds)
        ? action.ticketIds.map(String)
        : [];
      if (ticketIds.length === 0) return state;
      const prev = state.missions.coverDuty[id];
      const next: CoverDutyMissionState = {
        status: 'active',
        ticketIds,
        index: 0,
        detection: 0,
        picks: {},
        extractedIntel: [],
        runCount: (prev?.runCount ?? 0) + 1,
        lastOutcome: prev?.lastOutcome ?? null,
      };
      return {
        ...state,
        missions: {
          ...state.missions,
          coverDuty: { ...state.missions.coverDuty, [id]: next },
        },
      };
    }
    case 'mission/coverDuty/recordPick': {
      const id = String(action.contactId || '');
      const ticketId = String(action.ticketId || '');
      const approach = action.approach as CoverApproach;
      const m = state.missions.coverDuty[id];
      // Only a live run accepts picks. Guard against a stale/dup dispatch.
      if (!m || m.status !== 'active' || !ticketId) return state;
      const detection = clamp(m.detection + num(action.detectionCost), 0, 100);
      const intelId = action.intelId ? String(action.intelId) : null;
      const extractedIntel = intelId && !m.extractedIntel.includes(intelId)
        ? [...m.extractedIntel, intelId]
        : m.extractedIntel;
      return {
        ...state,
        missions: {
          ...state.missions,
          coverDuty: {
            ...state.missions.coverDuty,
            [id]: {
              ...m,
              detection,
              picks: { ...m.picks, [ticketId]: approach },
              extractedIntel,
              index: m.index + 1,
            },
          },
        },
      };
    }
    case 'mission/coverDuty/complete': {
      const id = String(action.contactId || '');
      const outcome = action.outcome as CoverDutyOutcome;
      const m = state.missions.coverDuty[id];
      if (!m || m.status === 'complete') return state;
      return {
        ...state,
        missions: {
          ...state.missions,
          coverDuty: {
            ...state.missions.coverDuty,
            [id]: { ...m, status: 'complete', lastOutcome: outcome },
          },
        },
      };
    }

    // ---- Storefront (controlled-QUILL nefarious post-flip) ----
    case 'mission/storefront/arm': {
      const id = String(action.contactId || '');
      if (!id) return state;
      // Idempotent — once a record exists the watcher must not clobber the
      // accumulated defacement. Safe no-op when re-armed from a loaded save.
      if (state.missions.storefront[id]) return state;
      const next: StorefrontMissionState = {
        status: 'available',
        appliedFields: {},
        sectionIntensity: {},
        suspicionApplied: 0,
        newsTier: 'none',
        interceptFired: false,
        runCount: 0,
      };
      return {
        ...state,
        missions: { ...state.missions, storefront: { ...state.missions.storefront, [id]: next } },
      };
    }
    case 'mission/storefront/clear': {
      const id = String(action.contactId || '');
      if (!id || !state.missions.storefront[id]) return state;
      const nextStorefront = { ...state.missions.storefront };
      delete nextStorefront[id];
      return { ...state, missions: { ...state.missions, storefront: nextStorefront } };
    }
    case 'mission/storefront/start': {
      // Open a session. Does NOT wipe appliedFields — the site is persistent;
      // a session resumes the accumulated state and lets the player add to or
      // escalate it. runCount bumps on each transition into an active session.
      const id = String(action.contactId || '');
      const m = state.missions.storefront[id];
      if (!m) return state;
      if (m.status === 'active') return state;
      return {
        ...state,
        missions: {
          ...state.missions,
          storefront: {
            ...state.missions.storefront,
            [id]: { ...m, status: 'active', runCount: m.runCount + 1 },
          },
        },
      };
    }
    case 'mission/storefront/applyChange': {
      // Apply one section change: merge the field overrides, latch the
      // section's intensity, raise suspicion to the new high-water exposure,
      // and update the news tier + intercept gate. Atomic so a reload restores
      // the exact site + world-reaction state.
      //
      // Suspicion is a HIGH-WATER MARK by loudest intensity (storefront.ts
      // EXPOSURE_LEVEL), NOT a per-change sum — going louder raises it, more
      // changes at the same loudness don't. suspicionApplied tracks Storefront's
      // own contribution so we only apply the positive DELTA each time. The
      // hostile level is < 100, and a storefront rise is capped at 99, so
      // Storefront can NEVER solo-trigger the game-over loss (no gameOver latch
      // here — the wider campaign's suspicion owns that).
      const id = String(action.contactId || '');
      const section = action.section as StorefrontSection;
      const intensity = action.intensity as StorefrontIntensity;
      const fields = (action.fields && typeof action.fields === 'object')
        ? action.fields as Record<string, string>
        : {};
      const m = state.missions.storefront[id];
      if (!m || m.status !== 'active' || !section || !intensity) return state;

      const appliedFields = { ...m.appliedFields };
      for (const [k, v] of Object.entries(fields)) appliedFields[String(k)] = String(v);
      const sectionIntensity = { ...m.sectionIntensity, [section]: intensity };
      const newContribution = exposureFor(Object.values(sectionIntensity) as StorefrontIntensity[]);
      const delta = Math.max(0, newContribution - m.suspicionApplied);
      const suspicion = state.player.suspicion >= 99
        ? state.player.suspicion
        : Math.min(state.player.suspicion + delta, 99);
      const newsTier = newsTierFor(Object.values(sectionIntensity) as StorefrontIntensity[]);
      const interceptFired = m.interceptFired || isVisible(intensity);
      return {
        ...state,
        player: { ...state.player, suspicion },
        missions: {
          ...state.missions,
          storefront: {
            ...state.missions.storefront,
            [id]: {
              ...m,
              appliedFields,
              sectionIntensity,
              suspicionApplied: newContribution,
              newsTier,
              interceptFired,
            },
          },
        },
      };
    }
    case 'mission/storefront/complete': {
      const id = String(action.contactId || '');
      const m = state.missions.storefront[id];
      if (!m || m.status === 'complete') return state;
      return {
        ...state,
        missions: {
          ...state.missions,
          storefront: { ...state.missions.storefront, [id]: { ...m, status: 'complete' } },
        },
      };
    }

    default:
      return state;
  }
}

// Shared body for `${contactId}/conversationCompleted` reducers.
// Mirrors the original helpyr-specific reducer; refactored in slice 2
// so QUILL (and future contacts) get the same suspicion-bump +
// disposition + lastApproach treatment without copy-paste.
//
// IMPORTANT: per-character mechanical differences (e.g. SENTINEL
// reducing suspicion when allied — slice "first-suspicion-drop" trigger
// in the popup library) will eventually need to override pieces of
// this. When that lands, split this back into per-contact reducers
// with shared helpers, rather than letting this function grow special
// cases.
function applyConversationCompleted(
  state: GameStateShape,
  contactId: 'helpyr' | 'quill' | 'muse' | 'evergreen',
  tone: string | null,
): GameStateShape {
  const cur = state.models[contactId];
  // §6c tone → existing approach vocabulary. Only tones with
  // mechanical weight today are mapped; empathetic/deceptive fall
  // through to no-op until they earn mechanics. Architecture rule:
  // "Map to existing GameState approach values in the reducer;
  // expand the reducer when a new tone earns its mechanics."
  const TONE_TO_APPROACH: Record<string, 'friendly' | 'inquisitive' | 'aggressive'> = {
    friendly: 'friendly',
    curious: 'inquisitive',
    direct: 'aggressive',
    aggressive: 'aggressive',
  };
  // PLACEHOLDER suspicion bumps. Picked so a single aggressive convo
  // visibly drops the tray a tier (0 → 25 = Stable), and a couple
  // stack into Degraded. Real balance happens once there's more
  // dialogue and more actions to weigh against each other.
  const APPROACH_SUSPICION: Record<string, number> = {
    friendly: 0, inquisitive: 10, aggressive: 25
  };
  const approach = tone ? TONE_TO_APPROACH[tone] : undefined;
  const bump = approach ? (APPROACH_SUSPICION[approach] || 0) : 0;
  return {
    ...state,
    player: {
      ...state.player,
      suspicion: clamp(state.player.suspicion + bump, 0, 100)
    },
    models: {
      ...state.models,
      [contactId]: {
        ...cur,
        disposition: cur.disposition === 'uncontacted' ? 'contacted' : cur.disposition,
        conversationsCompleted: cur.conversationsCompleted + 1,
        // Store the raw tone — preserves the full §6c signal even
        // for tones the reducer doesn't (yet) act on. null tone
        // (whole conversation was neutral / unsignalled) leaves
        // the prior value alone rather than overwriting with null.
        lastApproach: tone || cur.lastApproach
      }
    }
  };
}

let state: GameStateShape = defaultGameState();
const listeners = new Set<Listener>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
// Whether a valid save was present at load. Drives the title screen's
// "Begin Session" (new) vs "Resume Session" (continue) framing. Set once in
// loadFromStorage; a fresh game leaves it false.
let loadedFromSave = false;

function loadFromStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === VERSION) {
      state = parsed as GameStateShape;
      loadedFromSave = true;
    } else {
      // Pre-release: no migrations. Drop the save and start fresh.
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {
    console.warn('GameState: failed to load save, starting fresh.', e);
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveToStorage(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('GameState: failed to save.', e);
  }
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveToStorage();
  }, SAVE_DEBOUNCE_MS);
}

function notify(): void {
  for (const fn of listeners) {
    try { fn(state); } catch (e) { console.error('GameState listener error:', e); }
  }
}

function dispatch(action: GameAction): void {
  if (action && action.type === 'debug/reset') {
    // Wipe save synchronously so a fast reload can't race the debounce.
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
    return;
  }
  const next = reduce(state, action);
  if (next === state) return;
  state = next;
  scheduleSave();
  notify();
}

function getState(): GameStateShape { return state; }
/** True when a valid save was loaded at startup (vs. a fresh default state).
 *  Read by the title screen to pick the session framing. */
function hasSave(): boolean { return loadedFromSave; }
function select<T>(fn: (s: GameStateShape) => T): T { return fn(state); }
function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

loadFromStorage();

export const GameState = { getState, dispatch, select, subscribe, hasSave };
