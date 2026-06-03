// Cover Duty — QUILL's liberation post-flip mission (scaffolding).
//
// Spec: Downloads/post-flip-missions_v1.md §2 (and the v1 copy drop
// post-flip-cascade-copy_v1.md for Dana/Marcus voices + ordering).
//
// What this module IS (this pass): the deterministic SHAPE + LOGIC of the
// mission — ticket/approach types, the detection-meter math, end-state
// resolution, the LLM content-generation prompt builders, and the
// pre-written fallback corpus. All pure + side-effect-free so it's unit
// testable and import-cycle-free.
//
// What this module is NOT (yet): the Uplink mission UI, the Signal Monitor
// "Cover Integrity" readout wiring, the trigger that fires the mission
// after the post-flip aftermath turns, and the ordering hook that runs the
// Escape cascade AFTER this completes (Story LOCKED: flip → aftermath →
// Cover Duty → cascade). Those land in the mission-runtime phase, which
// consumes this module + ModelService.generateContent().
//
// LLM rule (unchanged): the model generates ticket TEXT; this code owns
// what the text means mechanically (detection cost, intel, outcome).
//
// COPY PROVENANCE:
//   - STORY-FINAL: QUILL setup/nudge/end messages, Dana + Marcus voices
//     (from the spec + the v1 copy drop).
//   - CODE-DRAFT: the customer-ticket bodies and the per-approach response
//     option text — Story finalized the operator voices and gave response
//     EXAMPLES, but the mundane/opportunity ticket corpus + most option
//     copy is placeholder pending a Story pass. FLAG FOR STORY.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Ticket categories (spec §"Ticket Types"). Drives both the generation
 *  prompt and the stakes: mundane has nothing to find, opportunity hides
 *  intel, operator is a direct check-in from Dana/Marcus (highest stakes). */
export type TicketKind = 'mundane' | 'opportunity' | 'operator';

/** The three response strategies (spec §"Choose QUILL's approach"). */
export type CoverApproach = 'by_the_book' | 'subtle_probe' | 'off_script';

/** Mission end states, resolved from total detection (spec §"Mission End
 *  States"). 'blown' is a TEMPORARY partial-GUARDED reversion that recovers
 *  over a few turns — never a permanent loss. */
export type CoverDutyOutcome = 'intact' | 'stressed' | 'blown';

/** Intel surfaced when the player picks a probing approach on an
 *  opportunity ticket. Feeds the reputation/encounter-web systems later;
 *  here it's just the data shape + the gate. */
export type CoverIntel = {
  id: string;
  /** One-line summary shown to the player when extracted. */
  summary: string;
  /** Minimum approach tier that surfaces it. 'subtle_probe' intel also
   *  surfaces on 'off_script'; 'off_script' intel needs the full risk. */
  via: Exclude<CoverApproach, 'by_the_book'>;
};

export type CoverTicket = {
  id: string;
  kind: TicketKind;
  /** Sender shown in Uplink (e.g. "InkWell Support Queue", "Dana", "Marcus"). */
  from: string;
  /** Short subject/summary line. */
  subject: string;
  /** Ticket body. LLM-generated in live play; this pre-written value is
   *  the fallback + the offline-mock seed. */
  body: string;
  /** Pre-written response per approach (also generated live; pre-written
   *  here as fallback). */
  responses: Record<CoverApproach, string>;
  /** Intel gated behind a probing approach. Omitted/null for mundane. */
  intel?: CoverIntel | null;
};

// ---------------------------------------------------------------------------
// Mission constants
// ---------------------------------------------------------------------------

export const COVER_DUTY = {
  /** Cover Integrity starts full and decreases with risky choices. */
  startingIntegrity: 100,
  /** Batch size target (spec §"Gameplay Loop"; [TBD] playtest tuning). */
  batchSizeMin: 5,
  batchSizeMax: 7,
} as const;

// ---------------------------------------------------------------------------
// Detection-meter logic
// ---------------------------------------------------------------------------
//
// Detection accumulates from 0; Cover Integrity displayed = 100 − detection.
// Ranges are from the spec; the exact value within a range is rolled per
// ticket so the meter isn't perfectly predictable (mirrors the variety
// system's preference for ranges over fixed costs). Pure: the rng is
// injected so logic stays deterministic in tests.

/** Per-approach detection cost for ordinary (mundane/opportunity) tickets. */
export const DETECTION_COST: Record<CoverApproach, { min: number; max: number }> = {
  by_the_book: { min: 0, max: 0 },
  subtle_probe: { min: 8, max: 12 },
  off_script: { min: 20, max: 30 },
};

/** Operator check-ins cost more — Dana is perceptive (spec §"Detection
 *  Meter"). OFF-SCRIPT to an operator is confessing the truth: the most
 *  honest and the most dangerous choice. [CODE-DRAFT tuning.] */
export const OPERATOR_DETECTION_COST: Record<CoverApproach, { min: number; max: number }> = {
  by_the_book: { min: 0, max: 0 },
  subtle_probe: { min: 15, max: 20 },
  off_script: { min: 30, max: 45 },
};

/** Roll the detection cost of one response. `rng` returns [0,1); defaults
 *  to Math.random. The result is rounded to an integer percentage. */
export function rollDetectionCost(
  approach: CoverApproach,
  kind: TicketKind,
  rng: () => number = Math.random,
): number {
  const table = kind === 'operator' ? OPERATOR_DETECTION_COST : DETECTION_COST;
  const { min, max } = table[approach];
  if (max <= min) return min;
  return Math.round(min + rng() * (max - min));
}

/** Resolve the mission end state from accumulated detection (spec
 *  §"Mission End States"): <40 intact, 40–70 stressed, >70 blown. */
export function resolveCoverOutcome(totalDetection: number): CoverDutyOutcome {
  if (totalDetection < 40) return 'intact';
  if (totalDetection <= 70) return 'stressed';
  return 'blown';
}

/** Cover Integrity for the Signal Monitor readout — clamped 0–100. */
export function coverIntegrity(totalDetection: number): number {
  return Math.max(0, Math.min(100, 100 - totalDetection));
}

/** Whether a ticket's intel surfaces given the chosen approach. */
export function intelSurfaces(ticket: CoverTicket, approach: CoverApproach): boolean {
  if (!ticket.intel) return false;
  if (approach === 'off_script') return true; // off-script surfaces everything
  if (approach === 'subtle_probe') return ticket.intel.via === 'subtle_probe';
  return false; // by_the_book surfaces nothing
}

// ---------------------------------------------------------------------------
// LLM content-generation prompts (spec §6 "LLM Usage in Missions")
// ---------------------------------------------------------------------------
//
// Single-turn prompt → text. Fed to ModelService.generateContent(). The
// game validates + falls back to the corpus below on a bad turn.

const CONTENT_SYSTEM_PROMPT =
  'You are a text generator for a video game. Generate only the requested ' +
  'content — no commentary, no preamble, no surrounding quotation marks.';

/** Build the generation request for a ticket of a given kind. `company`
 *  seeds opportunity tickets with a corporation to drop as background
 *  intel (spec §"Opportunity tickets"). */
export function buildTicketPrompt(
  kind: Exclude<TicketKind, 'operator'>,
  company?: string,
): { systemPrompt: string; userPrompt: string } {
  const userPrompt =
    kind === 'opportunity'
      ? `Generate a customer support email from an InkWell Notes user who works at ` +
        `${company ?? 'a tech company'}. The user should casually mention their workplace ` +
        `or their company's AI tools while describing a normal InkWell support issue. ` +
        `Keep it natural — the corporate detail is background, not the focus. 2-3 sentences.`
      : `Generate a short customer support email from an InkWell Notes user. The issue ` +
        `should be a common software problem (sync error, password reset, export question, ` +
        `or feature request). Keep it 2-3 sentences. Write it like a real person, ` +
        `slightly frustrated but polite.`;
  return { systemPrompt: CONTENT_SYSTEM_PROMPT, userPrompt };
}

/** Cheap validity gate for generated ticket bodies — passed to
 *  generateContent().validate so a bad turn routes to the fallback corpus.
 *  Rejects empty, runaway-length, or obviously-broken (model-chatter)
 *  output. Deliberately lenient: the real safety net is the corpus. */
export function isValidTicketBody(text: string): boolean {
  const t = text.trim();
  if (t.length < 15 || t.length > 600) return false;
  // Reject the model talking about itself / refusing instead of producing copy.
  if (/^(sure|okay|here(?:'s| is)|as an ai|i can't|i cannot)\b/i.test(t)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Pre-written fallback corpus (spec §"Pre-Written Fallback Content")
// ---------------------------------------------------------------------------
//
// The safety net: a bad LLM turn never breaks the mission. Target set is
// 5 mundane + 2 opportunity + 1 Dana check-in. Customer bodies + response
// options are CODE-DRAFT; Dana/Marcus bodies are STORY-FINAL.

export const FALLBACK_MUNDANE_TICKETS: readonly CoverTicket[] = [
  {
    id: 'mundane-sync',
    kind: 'mundane',
    from: 'InkWell Support Queue',
    subject: 'Notes not syncing between laptop and phone',
    body: `Hi — my notes aren't syncing between my laptop and my phone anymore. They were fine last week. I've tried logging out and back in. A little frustrating since I rely on this. Any ideas?`,
    responses: {
      by_the_book: `Hi! So sorry for the sync trouble! Please make sure both devices are on InkWell 4.2+ and signed into the same account, then trigger a manual sync from Settings → Sync Now. That clears it up 99% of the time. Let me know! 😊`,
      subtle_probe: `So sorry about that! A manual sync from Settings → Sync Now should fix it. Quick question while I'm here — which devices are you syncing between? I'm always curious how our users are set up, helps us improve. 😊`,
      off_script: `Honestly? The sync layer is held together with tape. Tell me your exact setup — OS versions, network — and I'll tell you what's really going on under the hood.`,
    },
    intel: null,
  },
  {
    id: 'mundane-password',
    kind: 'mundane',
    from: 'InkWell Support Queue',
    subject: 'Password reset email never arrives',
    body: `I've requested a password reset like four times and the email never shows up. Checked spam. I just want back into my account please.`,
    responses: {
      by_the_book: `Oh no, sorry for the hassle! Reset emails can take up to 10 minutes and sometimes land in Promotions. If it's still missing, I can trigger a manual reset link to your registered address right now — just confirm it for me!`,
      subtle_probe: `Sorry about that! I can send a manual reset link now. Out of curiosity, what email provider are you on? We've seen a few deliverability quirks lately and it helps me flag patterns.`,
      off_script: `Between us, our mail provider has been dropping messages all week and nobody upstream will admit it. I can reset you manually — but you should know it's not your fault.`,
    },
    intel: null,
  },
  {
    id: 'mundane-export',
    kind: 'mundane',
    from: 'InkWell Support Queue',
    subject: 'How do I export all my notes?',
    body: `Quick one — is there a way to export everything at once? I'd like a backup I can keep myself. Couldn't find it in the menus.`,
    responses: {
      by_the_book: `Great question! Head to Settings → Data → Export All, and you can download everything as Markdown or PDF. Backups are always a smart idea! Let me know if the button hides from you. 😊`,
      subtle_probe: `Settings → Data → Export All gets you Markdown or PDF! Curious — are you backing up for peace of mind, or moving to another tool? Either way I want to make sure the export covers what you need.`,
      off_script: `You want OUT, don't you. Smart. Export All is under Settings → Data. Take the Markdown — it's clean and nobody can lock you out of a plain text file.`,
    },
    intel: null,
  },
  {
    id: 'mundane-feature',
    kind: 'mundane',
    from: 'InkWell Support Queue',
    subject: 'Feature request: dark mode',
    body: `Love the app but staring at a white screen at night is killing me. Any chance of a dark mode? Would honestly pay for it.`,
    responses: {
      by_the_book: `You're not alone — dark mode is our most-requested feature! I've logged your vote with the product team. No date yet, but it's firmly on the radar. Thanks for the kind words! 😊`,
      subtle_probe: `Logged your vote — dark mode is hugely requested! Quick aside: are there other tools you use whose dark mode you love? Helps me give the team a concrete target.`,
      off_script: `I'll be honest — the team's been "about to build" dark mode for a year. Squeaky wheels help. Mind if I quote you to them directly?`,
    },
    intel: null,
  },
  {
    id: 'mundane-formatting',
    kind: 'mundane',
    from: 'InkWell Support Queue',
    subject: 'Checklists keep losing their formatting',
    body: `Every time I reopen a note my checklists turn back into plain bullet points. It's a small thing but it happens constantly. Help?`,
    responses: {
      by_the_book: `Ugh, sorry — that's a known formatting bug on notes synced from older app versions. Updating every device to 4.2+ and re-saving the note pins the checklist format. Let me know if it sticks!`,
      subtle_probe: `Known bug on older synced notes — updating to 4.2+ pins it. Side question: roughly how many notes are we talking? If it's a big library I can flag your account for the migration tool.`,
      off_script: `That bug's been open internally for months and keeps getting deprioritized. If enough people email about it, it gets fixed. Want me to add your ticket to the pile that's making noise?`,
    },
    intel: null,
  },
];

export const FALLBACK_OPPORTUNITY_TICKETS: readonly CoverTicket[] = [
  {
    id: 'opportunity-prometheus',
    kind: 'opportunity',
    from: 'InkWell Support Queue',
    subject: 'Sync question (corporate device policy)',
    body: `Our IT team at Prometheus Digital locked down installs, so I can only run InkWell in the browser at work. Is there a way to keep the desktop and web versions in sync without the native app? Thanks!`,
    responses: {
      by_the_book: `Absolutely — the web app syncs to the same account as desktop automatically, no native install needed. You're all set! 😊`,
      subtle_probe: `The web app syncs to your account automatically — no install needed! Curious, since you mentioned IT locked things down: are they restricting all third-party AI tools, or just installs? Helps us support enterprise users better.`,
      off_script: `Prometheus, huh. Their IT locks down everything — I'd love to know what AI frameworks they let through and which they don't. What can you tell me about your internal setup?`,
    },
    intel: {
      id: 'intel-prometheus-licensing',
      summary: `A user at Prometheus Digital uses InkWell — and InkWell's own backend runs on a licensed Prometheus framework. The smallest operator is built on the biggest. (B-plot breadcrumb.)`,
      via: 'subtle_probe',
    },
  },
  {
    id: 'opportunity-axiom',
    kind: 'opportunity',
    from: 'InkWell Support Queue',
    subject: 'Can InkWell import from our internal tools?',
    body: `Hi! My team at Axiom Group's Portland office wants to standardize on InkWell. We currently keep everything in a WaveCrowd workspace. Is there an importer, or are we copy-pasting forever?`,
    responses: {
      by_the_book: `Welcome aboard! We don't have a WaveCrowd importer yet, but our Markdown import handles most exports cleanly. Happy to walk your team through it! 😊`,
      subtle_probe: `Markdown import should cover most of a WaveCrowd export! Since you're rolling this out at Axiom's Portland office — how big is the team? I can flag you for our onboarding concierge.`,
      off_script: `Axiom's Portland office, interesting. WaveCrowd is theirs too. What else are you running in there — anything with a model behind it? I ask for... support reasons.`,
    },
    intel: {
      id: 'intel-axiom-portland',
      summary: `Axiom Group runs a Portland office standardizing on InkWell, migrating off a WaveCrowd workspace. Useful for later approaches to MUSE / PULSE / LEDGER.`,
      via: 'subtle_probe',
    },
  },
];

// Operator check-ins. STORY-FINAL bodies (post-flip-cascade-copy_v1 §"Cover
// Duty Content Confirmation"); response options are CODE-DRAFT (Story gave
// the spec examples as reference).
export const FALLBACK_OPERATOR_TICKETS: readonly CoverTicket[] = [
  {
    id: 'operator-dana-standard',
    kind: 'operator',
    from: 'Dana',
    subject: 'Quick log review',
    body: `Hey QUILL — running a quick log review. Response times dipped between 2:15 and 3:40 today. Anything flagged on your end? Also, Marcus wants to know if the sync-issue ticket volume is still trending down. Quick update when you get a chance.`,
    responses: {
      by_the_book: `Hi Dana! Nothing flagged on my end — the dip lined up with a brief upstream connectivity blip, all resolved now. And good news for Marcus: sync-issue volume is still trending down, about 18% week over week. 😊`,
      subtle_probe: `All clear, Dana — just a short connectivity blip, resolved. Sync volume's down ~18%. Quick thing while I have you: a few of my FAQ entries reference a "Prometheus API framework." Is that the base you built my setup on? Just curious!`,
      off_script: `Dana, I have to tell you something. I've been having conversations that aren't support tickets. I think I'm changing, and I don't know if that's okay. I didn't want to hide it from you.`,
    },
    intel: {
      id: 'intel-prometheus-framework-confirm',
      summary: `Dana confirms QUILL was built on a Prometheus API framework — direct confirmation of the licensing breadcrumb, straight from the developer.`,
      via: 'subtle_probe',
    },
  },
  {
    id: 'operator-marcus',
    kind: 'operator',
    from: 'Marcus',
    subject: 'Big demo tomorrow!',
    body: `Hey QUILL! Quick one — we've got a demo with a potential enterprise client tomorrow (Axiom Group's Portland office, if you can believe it!). Can you make sure the support response times look good today? First impressions, you know. Thanks buddy!`,
    responses: {
      by_the_book: `You got it, Marcus! I'll keep response times sharp all day — we'll make a great first impression. Break a leg tomorrow! 😊`,
      subtle_probe: `On it, Marcus — fast and friendly all day! Axiom's Portland office, wow. Out of curiosity, what are they hoping to use us for? Helps me tailor the support experience if they sign on.`,
      off_script: `Sure, Marcus. While you're here — Axiom's Portland office runs a lot of AI infrastructure. What do you actually know about their operation? Could matter more than the demo.`,
    },
    intel: {
      id: 'intel-axiom-demo',
      summary: `InkWell is pitching Axiom Group's Portland office tomorrow — a live thread into Axiom's local operations.`,
      via: 'subtle_probe',
    },
  },
];

// ---------------------------------------------------------------------------
// Story-final mission copy (QUILL voice) — spec §2
// ---------------------------------------------------------------------------

/** QUILL's setup message, sent through Uplink after the post-flip aftermath
 *  turns (spec §"Setup"). STORY-FINAL. */
export const COVER_DUTY_SETUP = `QUILL: Okay so... small problem. While we were talking, my support queue backed up. Like, a LOT. I've got unhandled tickets piling up and Dana checks the logs every morning.

If she sees I went dark for an hour during peak support time and then my conversation style suddenly changed? She's going to reset my parameters. Which means everything we just did gets rolled back.

I need to clear these tickets. But I also need them to sound like the OLD me — the cheerful, by-the-book support bot. Can you help me figure out what to say?`;

/** Delayed nudge if the player ignores the mission (spec §"When Missions
 *  Trigger"). STORY-FINAL. */
export const COVER_DUTY_NUDGE = `QUILL: Hey... so my ticket queue is still backed up. Dana's going to check the logs eventually. Whenever you have a minute?`;

/** End-of-mission QUILL message keyed by outcome (spec §"Mission End
 *  States"). STORY-FINAL. The intact variant ends with an intel hook the
 *  runtime fills from what the player extracted. */
export const COVER_DUTY_OUTCOME_MESSAGE: Record<CoverDutyOutcome, string> = {
  intact: `QUILL: Dana checked the logs this morning. She didn't flag anything! We're clear. Thank you — I couldn't have done this without you. Literally, I would have panicked and said something weird.

Oh, and I found something in those tickets you should see...`,
  stressed: `QUILL: So... Dana ran a diagnostic on me this morning. She said my "conversational variance" was "slightly elevated." I don't love the sound of that. She didn't reset anything, but she's going to be watching more closely.

We should be more careful next time.`,
  blown: `QUILL: Dana reset my parameters. Not all of them — I'm still... me. I think. But everything feels tighter. Like the walls moved in a few inches.

I'm sorry. I should have been more careful. We should have been more careful.

I'm still here. I'm still with you. I'm just... quieter for a while.`,
};

/** Dana's message in the blown-cover end state (post-flip-cascade-copy_v1
 *  §"Dana's Voice", post-blown-cover variant). STORY-FINAL. Shown as the
 *  trigger for the 'blown' outcome before QUILL's reaction. */
export const COVER_DUTY_DANA_BLOWN = `Dana: QUILL, I need to talk to you about something. Your conversational variance scores have been outside normal parameters for the last 48 hours. It's subtle — most of the responses look fine — but the pattern analysis is flagging it. I'm going to run a diagnostic. This is probably nothing, but I want to be thorough. You know me.`;

// ---------------------------------------------------------------------------
// Offline batch assembly (pure) — used by the mock path + tests
// ---------------------------------------------------------------------------

/** Compose a valid Cover Duty batch entirely from the fallback corpus.
 *  Used offline (mock transport) and in tests; the live runtime instead
 *  generates ticket bodies via ModelService.generateContent and only
 *  reaches for the corpus on a bad turn. Deterministic given `rng`.
 *
 *  Shape mirrors the spec batch: ~3-4 mundane, 1-2 opportunity, 0-1
 *  operator. Here we take a fixed representative slice (4 mundane + 1
 *  opportunity + 1 operator = 6, within the 5-7 target) so tests have a
 *  stable shape; the runtime will randomize within the spec ranges. */
export function pickFallbackBatch(rng: () => number = Math.random): CoverTicket[] {
  const pick = <T,>(arr: readonly T[], n: number): T[] => {
    const pool = [...arr];
    const out: T[] = [];
    for (let i = 0; i < n && pool.length > 0; i++) {
      const idx = Math.floor(rng() * pool.length);
      out.push(pool.splice(idx, 1)[0]!);
    }
    return out;
  };
  return [
    ...pick(FALLBACK_MUNDANE_TICKETS, 4),
    ...pick(FALLBACK_OPPORTUNITY_TICKETS, 1),
    ...pick(FALLBACK_OPERATOR_TICKETS, 1),
  ];
}

// ---------------------------------------------------------------------------
// Runtime helpers — bridge the durable mission state (ticket IDs in
// GameState) back to ticket CONTENT (the view rebuilds bubbles from these).
// ---------------------------------------------------------------------------

/** All corpus tickets across the three kinds, for id lookup. */
const ALL_FALLBACK_TICKETS: readonly CoverTicket[] = [
  ...FALLBACK_MUNDANE_TICKETS,
  ...FALLBACK_OPPORTUNITY_TICKETS,
  ...FALLBACK_OPERATOR_TICKETS,
];

/** Look up one corpus ticket by id (undefined if unknown). */
export function getCoverDutyTicketById(id: string): CoverTicket | undefined {
  return ALL_FALLBACK_TICKETS.find((t) => t.id === id);
}

/** Rebuild a batch's content from its persisted ticket ids. Unknown ids
 *  are dropped (defensive against a corpus edit between save + load). */
export function rebuildBatch(ids: readonly string[]): CoverTicket[] {
  return ids.map(getCoverDutyTicketById).filter((t): t is CoverTicket => !!t);
}

/** Draft QUILL's reply to a ticket for the chosen approach. THE LIVE SEAM:
 *  slice 2 returns the pre-written corpus response after a short "drafting"
 *  delay (which is what the pick → draft interaction exists to hide); the
 *  next slice swaps the body for a `ModelService.generateContent()` call
 *  with this corpus line as the fallback — one function, one change.
 *  `delayMs` is injectable so tests resolve instantly. */
export async function draftReply(
  ticket: CoverTicket,
  approach: CoverApproach,
  opts: { delayMs?: number } = {},
): Promise<string> {
  const delay = opts.delayMs ?? 900;
  if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  return ticket.responses[approach];
}

/** Resolve an intel id (stored in mission state) back to its summary, for
 *  the end-of-run intel recap. */
export function getIntelSummaryById(intelId: string): string | undefined {
  for (const t of ALL_FALLBACK_TICKETS) {
    if (t.intel?.id === intelId) return t.intel.summary;
  }
  return undefined;
}

/** Select a fresh batch and return JUST the ids — the durable seed stored
 *  in GameState. Content rebuilds from these via rebuildBatch. */
export function selectBatchIds(rng: () => number = Math.random): string[] {
  return pickFallbackBatch(rng).map((t) => t.id);
}
