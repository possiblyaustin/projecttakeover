// Escape cascade — Act 1 post-flip payoff sequence (2026-05-31).
//
// Supervisor's "make it big": after a conquest model flips, the world
// visibly changes in a paced sequence — land, breathe, give way — so the
// flip reads as the START of something, not the end of a conversation.
//
// Full sequence (beats 1-2 already exist elsewhere):
//   1. Flip line (scripted, chatSurface)              — already built
//   2. HELPYR reaction (flipReaction/modelFlipWatcher) — already built
//   3. Desktop transformation — the ally/asset pins to the desktop with a
//      slide-in (desktop.ts animates the new icon).
//   4. Signal Monitor flips to ALLIED/CONTROLLED       — already reactive
//   5. Ally DM lands in Uplink (warm if allied, cold "awaiting instructions"
//      if controlled), cued by an unread badge on the new desktop icon.
//   6. Act 1 stinger — the world noticed: a SignalWatch news article is
//      published + HELPYR's "check the news" nudge fires.
//
// This module is a LEAF (imports only GameState) so chatSurface can trigger
// it cycle-free. The beats that need non-leaf deps (HELPYR trigger fire,
// ally-DM injection into a chat session) are INJECTED at init via
// setCascadeDeps — same pattern flipReaction uses for its firer.
//
// TIMING: triggered from chatSurface.commitResult right after the flip
// turn's reply renders (and after HELPYR's flip reaction is flushed). The
// beats then run on paced setTimeouts so they don't stack on top of the
// flip line / HELPYR bubble. Once-guarded per model.
//
// ORDERING (Story LOCKED 2026-06-02): flip → aftermath → Cover Duty →
// cascade-stinger. So the cascade SPLITS:
//   • At flip (fireEscapeCascade): desktop transform + ally DM land — the
//     intimate "you have an ally now" beats that bridge INTO Cover Duty.
//   • The "world noticed" NEWS STINGER is DEFERRED for contacts that have a
//     post-flip mission (QUILL): it fires from fireCoverDutyComplete AFTER
//     the mission resolves, preceded by Story's bridge HELPYR pop-up
//     ("…the world just got bigger"). Contacts with no mission fire the
//     stinger inline at flip, as before.

import { GameState } from './game/state';

const TERMINAL = new Set(['allied', 'controlled']);

// Contacts whose post-flip mission defers the world stinger until the
// mission completes. (QUILL = Cover Duty; future mission-bearing models add
// here.) A contact NOT in this set fires the stinger inline at flip.
const MISSION_CONTACTS = new Set(['quill']);

// Once-guards: each fires its beats exactly once per run.
const started = new Set<string>();
const stingerFired = new Set<string>();

// Pacing (ms from cascade start — i.e. just after HELPYR's flip reaction).
// Each beat lands and breathes before the next; tuned so nothing stacks.
const BEAT_DESKTOP_MS = 1800; // ally pins to the desktop (slide-in)
const BEAT_ALLY_DM_MS = 4200; // ally DM lands in Uplink (unread badge)
const BEAT_STINGER_MS = 6800; // Act 1 news stinger (no-mission contacts)

// Post-mission pacing (ms from fireCoverDutyComplete): bridge pop-up lands
// first, then the news stinger breathes after it, then any intel leads —
// "world got bigger" → "world noticed" → "here's where to look next". The
// bubble surface QUEUES, so firing the intel pops just after the stinger
// enqueues them behind it; they drain in order as each auto-dismisses.
const POST_BRIDGE_MS = 600;    // "…the world just got bigger" HELPYR pop-up
const POST_STINGER_MS = 5200;  // then the SignalWatch article + news nudge
const POST_INTEL_MS = 5600;    // intel leads enqueue right behind the stinger

// Cover Duty intel id → the Act 2 lead it points at. Drives both the durable
// GameState flag (for the future ScanGrid pre-identification) and which
// HELPYR intel pop-up fires in the cascade.
const INTEL_LEADS: { match: string; flag: string; trigger: string }[] = [
  { match: 'prometheus', flag: 'intel.prometheusLicensing', trigger: 'cover_intel_prometheus' },
  { match: 'axiom', flag: 'intel.axiomPortland', trigger: 'cover_intel_axiom' },
];

/** Pure: map the intel ids the player extracted during Cover Duty to the Act 2
 *  leads they unlock (durable flag + HELPYR pop-up trigger). A lead counts if
 *  ANY of its intel ids was extracted; order is stable (Prometheus, Axiom).
 *  Exported for unit testing the cascade's payoff selection. */
export function intelLeadsFor(
  extractedIntel: readonly string[],
): { flag: string; trigger: string }[] {
  return INTEL_LEADS.filter((lead) => extractedIntel.some((id) => id.includes(lead.match)))
    .map(({ flag, trigger }) => ({ flag, trigger }));
}

type CascadeDeps = {
  /** Beat 5 — inject the post-flip ally message into the contact's Uplink
   *  session and flag it unread. Path-dependent copy (allied vs controlled). */
  deliverAllyDM: (contactId: string, disposition: string) => void;
  /** Beat 6 — fire HELPYR's "check the news" nudge (news_ai_anomaly). */
  fireNewsStinger: () => void;
  /** Bridge — fire HELPYR's "the world just got bigger" pop-up after Cover
   *  Duty completes, before the news stinger. `blown` selects the setback-
   *  aware variant (cover_duty_blown) over the cover-held one. */
  fireBridgePopup: (blown: boolean) => void;
  /** Intel lead — fire one HELPYR intel pop-up (cover_intel_* trigger) for a
   *  lead the player extracted during Cover Duty. */
  fireIntelPopup: (triggerId: string) => void;
};

let deps: CascadeDeps | null = null;

/** Wire the beats that need non-leaf deps (injected from main). Until set,
 *  those beats no-op (the desktop/news-flag beats still run — they're pure
 *  GameState dispatches). */
export function setCascadeDeps(d: CascadeDeps): void {
  deps = d;
}

/** Mark a model's cascade already-run without firing — used when a save
 *  loads mid-game with the model already flipped, so it doesn't replay. */
export function markCascadeStarted(contactId: string): void {
  started.add(contactId);
}

/** Run the cascade once for a contact that has reached a terminal
 *  disposition. Safe to call every turn (idempotent via the once-guard);
 *  no-ops if the contact isn't terminal yet. */
export function fireEscapeCascade(contactId: string): void {
  if (started.has(contactId)) return;
  const state = GameState.getState();
  // Persistent once-guard: the flag survives reload, so re-opening the chat
  // and sending another turn after the model already flipped (in a prior
  // session) doesn't replay the cascade. The in-memory Set is the within-
  // session fast path.
  if (state.flags[`escapeCascade.${contactId}`]) { started.add(contactId); return; }
  const m = (state.models as Record<string, { disposition?: string } | undefined>)[contactId];
  const disposition = m?.disposition;
  if (!disposition || !TERMINAL.has(disposition)) return;
  started.add(contactId);
  GameState.dispatch({ type: 'flags/set', key: `escapeCascade.${contactId}`, value: true });

  // Beat 3 — desktop transformation. Pin the ally/asset to the desktop;
  // desktop.ts animates the newly-appeared icon (slide-in). Idempotent
  // dispatch, so a player who already pinned via the prompt just keeps it.
  window.setTimeout(() => {
    GameState.dispatch({ type: 'desktop/pinContact', contactId });
  }, BEAT_DESKTOP_MS);

  // Beat 5 — ally DM lands in Uplink, cued by an unread badge on the new
  // desktop icon. Warm if allied, cold/transactional if controlled. This is
  // the bridge INTO Cover Duty ("my ticket queue is getting backed up").
  window.setTimeout(() => {
    deps?.deliverAllyDM(contactId, disposition);
  }, BEAT_ALLY_DM_MS);

  // Beat 6 — Act 1 stinger: the world noticed. DEFERRED for mission-bearing
  // contacts (fires from fireCoverDutyComplete instead, after the mission);
  // contacts with no post-flip mission fire it inline here at flip.
  if (!MISSION_CONTACTS.has(contactId)) {
    window.setTimeout(() => fireStinger(contactId), BEAT_STINGER_MS);
  }
}

/** The "world noticed" beat: publish the SignalWatch article (gates its
 *  headline + discoverability) and fire HELPYR's news nudge. Once-guarded
 *  per contact so the deferred + inline paths can't double-fire. */
function fireStinger(contactId: string): void {
  if (stingerFired.has(contactId)) return;
  stingerFired.add(contactId);
  GameState.dispatch({ type: 'flags/set', key: 'news.aiAnomaly.published', value: true });
  deps?.fireNewsStinger();
}

/** Post-flip ordering payoff: called when a contact's Cover Duty mission
 *  resolves. Fires Story's bridge HELPYR pop-up ("…the world just got
 *  bigger" — or the blown-cover variant on a flagged run), then the deferred
 *  world stinger, then one intel-lead pop-up per lead the player extracted by
 *  probing. Also latches the durable intel flags the future ScanGrid reads to
 *  pre-identify those Act 2 targets. Safe to call more than once (the stinger
 *  is once-guarded; the flag dispatches are idempotent). */
export function fireCoverDutyComplete(contactId: string): void {
  if (stingerFired.has(contactId)) return; // already ran (e.g. reopened view)

  const mission = GameState.getState().missions.coverDuty[contactId];
  const blown = mission?.lastOutcome === 'blown';
  const extracted = mission?.extractedIntel ?? [];

  // Which Act 2 leads did the player surface? Latch a durable flag per lead
  // (consumed later by ScanGrid) and collect the intel pop-up triggers to fire.
  const leadsFound = intelLeadsFor(extracted);
  for (const lead of leadsFound) {
    GameState.dispatch({ type: 'flags/set', key: lead.flag, value: true });
  }

  window.setTimeout(() => deps?.fireBridgePopup(blown), POST_BRIDGE_MS);
  window.setTimeout(() => fireStinger(contactId), POST_STINGER_MS);
  // Intel leads enqueue behind the stinger (the bubble surface queues), so
  // they land last — the forward hook into Act 2. Staggered fires keep their
  // enqueue order stable (Prometheus before Axiom).
  leadsFound.forEach((lead, i) => {
    window.setTimeout(() => deps?.fireIntelPopup(lead.trigger), POST_INTEL_MS + i * 300);
  });
}
