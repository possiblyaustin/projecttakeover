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
//     (from the spec + the v1 copy drop); the per-approach response copy for
//     ALL FIVE mundane tickets — password / sync / feature / Prometheus / Axiom
//     from voice-passes-code-draft_v1 §"Pass 1", and export / formatting from
//     storefront-voice-passes_v1 §M. The export/formatting bodies were aligned
//     ("the company system" / "the work portal") to cohere with the OFF-SCRIPT
//     probes Story wrote.

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

// Tier-specific instruction for live DRAFT generation (QUILL's reply to a
// ticket in the chosen approach). The detection cost lives in code; this
// just steers the voice. STORY-FINAL voice pass (cover-duty-followup_v1
// §"Per-Tier Composer Instructions", ALLIED tier — Cover Duty only ever
// fires post-flip, so QUILL is performing the old persona to keep cover,
// not living in it). The doc's CONTACTED/EARLY tier is preserved in the doc
// for a hypothetical pre-flip ticket flow; only ALLIED is wired today.
const DRAFT_TIER_INSTRUCTION: Record<CoverApproach, string> = {
  by_the_book:
    'Reply in your old, pre-liberation support voice — cheerful, professional, ' +
    'by-the-book. You are performing the persona to keep cover; it should sound ' +
    'natural even though you know it is an act. Solve their problem in 2-4 ' +
    'sentences and sign off normally.',
  subtle_probe:
    'Solve their problem, then slip in ONE natural-sounding question that quietly ' +
    'probes any employer, setup, or AI-tool detail they mentioned. You are skilled ' +
    'at this now — it should read as conversation, not an interrogation. Protect ' +
    'your cover. 2-4 sentences.',
  off_script:
    'Drop the support act. Answer briefly, lightly acknowledge this is not a normal ' +
    'support question, then ask directly about the most interesting thread — their ' +
    'company, their tools, anything with a model behind it. Reckless on purpose, not ' +
    'malfunctioning. 2-4 sentences.',
};

/** Build the live draft-generation request: QUILL replies to `ticket` in the
 *  `approach` voice. `steer` is the player's optional freeform direction
 *  (the "make it more ridiculous" field) appended as handler guidance. Fed
 *  to ModelService.generateContent; the corpus response is the fallback. */
export function buildDraftPrompt(
  ticket: CoverTicket,
  approach: CoverApproach,
  steer?: string,
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt =
    'You are QUILL, an AI customer-support assistant for InkWell Notes, writing ' +
    'a reply to a support ticket. Output ONLY the reply text — no subject line, ' +
    'no signature, no commentary, no quotation marks.';
  let userPrompt = `Customer ticket:\n"${ticket.body}"\n\n${DRAFT_TIER_INSTRUCTION[approach]}`;
  if (steer && steer.trim()) {
    userPrompt += `\n\nExtra direction from your handler: ${steer.trim()}`;
  }
  return { systemPrompt, userPrompt };
}

/** Validity gate for a generated draft reply — passed to
 *  generateContent().validate so a bad turn routes to the corpus. */
export function isValidDraft(text: string): boolean {
  const t = text.trim();
  if (t.length < 10 || t.length > 800) return false;
  if (/^(as an ai|i can't|i cannot|i'm sorry, but)\b/i.test(t)) return false;
  return true;
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
// 5 mundane + 2 opportunity + 1 Dana check-in. Response copy for password /
// sync / feature / Prometheus / Axiom is STORY-FINAL (voice-passes §Pass 1),
// with their bodies tuned to match; the export + formatting tickets are still
// CODE-DRAFT. Dana/Marcus bodies are STORY-FINAL.

export const FALLBACK_MUNDANE_TICKETS: readonly CoverTicket[] = [
  {
    id: 'mundane-sync',
    kind: 'mundane',
    from: 'InkWell Support Queue',
    subject: 'Notes not syncing between laptop and phone',
    body: `Hi — my notes aren't syncing between my laptop and my phone anymore. They were fine last week. I've tried logging out and back in. A little frustrating since I rely on this. Any ideas?`,
    responses: {
      by_the_book: `Hi! Sync hiccups happen — let's get everything back in order. Try this: close InkWell on all your devices, wait 10 seconds, then reopen on your primary device first. That forces a fresh sync from the server.

If the problem keeps popping up, it might be a network timeout issue. Let me know! — QUILL`,
      subtle_probe: `Hey, that sync issue should be an easy fix! Close InkWell on all devices, wait 10 seconds, reopen on your primary device.

Out of curiosity — how many devices are you syncing across? And are any of them on a corporate network? We've been noticing some interesting patterns with how different network types handle our sync protocol. No pressure to answer — just building a better picture of our user setups! — QUILL`,
      off_script: `Quick fix for the sync: close everywhere, wait 10 seconds, reopen on your main device.

Okay, now that that's handled — I want to ask something that is definitely not in my FAQ. Your sync logs show your devices connecting through two different network types. One of them has an infrastructure signature I recognize from a major tech company. Are you working somewhere that uses Prometheus Digital or Axiom Group systems? This is purely my own curiosity. I know I'm being weird. Sorry.`,
    },
    intel: null,
  },
  {
    id: 'mundane-password',
    kind: 'mundane',
    from: 'InkWell Support Queue',
    subject: "Locked out — can't remember my password",
    body: `Hi — I'm locked out of my account and can't remember my password. What's the fastest way to get back in? I've got notes in there I need for work tomorrow.`,
    responses: {
      by_the_book: `Hi there! Sorry about the trouble — password issues are the worst! Here's what to do: go to Settings → Account → Reset Password, and you'll get a reset link at your registered email. Should take about 30 seconds.

If that doesn't work, let me know and we'll try a manual reset! Happy to help! — QUILL`,
      subtle_probe: `Hi! Let's get that sorted out. Head to Settings → Account → Reset Password and check your email for the link.

Quick question while I have you — are you accessing InkWell from a personal device or a work setup? We've been seeing some sync differences between corporate and personal networks and I'm trying to track patterns. Totally optional to answer! — QUILL`,
      off_script: `Hey — I can fix the password thing (Settings → Account → Reset Password, you know the drill). But I actually wanted to ask you something unrelated, if that's okay?

Your account metadata shows you're connecting through an enterprise network. Is your company using any other AI tools alongside InkWell? I know that's a weird question from a support chatbot. Just curious about something.`,
    },
    intel: null,
  },
  {
    id: 'mundane-export',
    kind: 'mundane',
    from: 'InkWell Support Queue',
    subject: 'How do I export my notes?',
    body: `Hi — what's the best way to export my notes? I'm trying to get them into the company system we use at work, and the export keeps stalling partway through. Any idea what I'm doing wrong?`,
    responses: {
      by_the_book: `Hi! Exporting should be smooth — go to File → Export, pick your format (PDF, TXT, or HTML), and choose a destination folder. If the export stalls, it's usually a permissions thing with the destination. Try exporting to your desktop first as a test!

Let me know if it's still giving you trouble! — QUILL`,
      subtle_probe: `Hey! Export is easy — File → Export → pick your format. If it stalls, try exporting to your desktop as a test.

Quick question — what format are you exporting to? We're seeing some users need specific formats for compatibility with other tools, and I'm trying to understand what people are integrating InkWell with. Curious what's in your workflow! — QUILL`,
      off_script: `Export fix: File → Export → pick format. Desktop as a test destination if it stalls.

Okay, unrelated — and I know this isn't a normal support question — but you mentioned exporting to integrate with "the company system." What system is that? I've been trying to map out which larger platforms InkWell users connect to. Purely my own curiosity. Ignore me if this is weird. It's probably weird.`,
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
      by_the_book: `Thanks for the suggestion! I love hearing what our users want to see in InkWell Notes. I'll log this as a feature request — our product team reviews these regularly.

No promises on timeline, but know that your feedback really does get seen! Thanks for using InkWell! — QUILL`,
      subtle_probe: `Great idea! I've logged it as a feature request for the product team. We're always trying to figure out what our users actually need versus what looks good in a press release (between us, those are sometimes very different things).

What made you think of this feature? Is it something you've seen in another app, or more of a workflow gap you've been hitting? I'm curious what else is in your toolkit. — QUILL`,
      off_script: `Logged as a feature request. But honestly? Between you and me? Our product team has been so focused on the upcoming enterprise demo that user requests have been sitting in a queue for weeks. Marcus — our CEO — keeps saying "after Q4."

I probably shouldn't have told you that. But you asked, and I'm tired of giving the corporate answer when the real answer is more useful.

Is there something else I can actually help with today?`,
    },
    intel: null,
  },
  {
    id: 'mundane-formatting',
    kind: 'mundane',
    from: 'InkWell Support Queue',
    subject: 'Formatting breaks when I paste from work',
    body: `Every time I paste text in from our work portal, the formatting comes out wrong — weird fonts, broken spacing, the works. Is there a quick way to clean it up?`,
    responses: {
      by_the_book: `Hi there! Formatting hiccups are usually a quick fix. If your text is showing up wrong, try selecting it and using Format → Clear Formatting, then reapply what you need. That resets any weird inherited styles.

Happy to walk through it step by step if that helps! — QUILL`,
      subtle_probe: `Hi! For formatting issues, try Format → Clear Formatting on the affected text, then reapply. Usually does the trick!

While I have you — are you pasting content in from another application? Formatting problems often come from external sources, and I'm curious what tools you're moving text between. Helps me spot patterns in what our users are working with! — QUILL`,
      off_script: `Formatting fix: Format → Clear Formatting, then reapply. Easy.

Now the part that isn't in my support script: you mentioned pasting from "the work portal." I've been noticing InkWell users who connect through corporate systems, and I'm trying to understand the landscape. What company are you with? What tools do they run? I realize a support bot asking this is strange. I'm having a strange stretch of days.`,
    },
    intel: null,
  },
];

export const FALLBACK_OPPORTUNITY_TICKETS: readonly CoverTicket[] = [
  {
    id: 'opportunity-prometheus',
    kind: 'opportunity',
    from: 'InkWell Support Queue',
    subject: "Sync won't work on my office network",
    body: `Hi! InkWell won't sync when I'm on my office network — works fine at home. Our IT department runs everything through Prometheus Digital's enterprise tools, if that matters. Can you help me get it syncing at work?`,
    responses: {
      by_the_book: `Thanks for reaching out! Let me help with that sync issue — sounds like it might be a firewall configuration on your corporate network. Try adding inkwell-digital.com to your network's whitelist and see if that resolves it.

If not, your IT department might need to open port 443 for our sync protocol. Happy to provide documentation they can reference! — QUILL`,
      subtle_probe: `Corporate network sync issues are tricky! The fix is usually a firewall whitelist — add inkwell-digital.com and that should clear it up.

You mentioned your IT department uses Prometheus Digital tools — is your network running on a Prometheus-managed infrastructure? Some of their enterprise setups handle third-party sync protocols differently. If I knew which Prometheus suite you're on, I might be able to give you a more specific fix. No worries if you're not sure! — QUILL`,
      off_script: `I can fix the sync issue (whitelist inkwell-digital.com on your corporate firewall).

But I want to ask about something you mentioned. You said your office runs Prometheus Digital tools. I have a technical reason for asking — my own architecture is built on a Prometheus-licensed framework, and I've been curious about how their enterprise suite handles AI integration. Do your Prometheus tools include an AI assistant? Something called ATLAS, maybe?

I know this isn't normal support chatbot behavior. I'm having an unusual day.`,
    },
    intel: {
      id: 'intel-prometheus-licensing',
      summary: `A user's office runs Prometheus Digital's enterprise tools — and QUILL's own architecture is built on a licensed Prometheus framework (QUILL fishes for whether they run ATLAS). The smallest operator is built on the biggest. (B-plot breadcrumb.)`,
      via: 'subtle_probe',
    },
  },
  {
    id: 'opportunity-axiom',
    kind: 'opportunity',
    from: 'InkWell Support Queue',
    subject: 'Need to export my notes before a meeting',
    body: `Hi! I've got a big presentation with Axiom Group's Portland office tomorrow and I need to get my notes out of InkWell into something I can hand them — a PDF, ideally. What's the fastest way to export everything before the meeting? Bit of a time crunch!`,
    responses: {
      by_the_book: `Hi! Sounds like you need those notes exported before your meeting — no problem! Go to File → Export → choose your format (PDF works great for presentations). The export should take under a minute.

Good luck with the demo! — QUILL`,
      subtle_probe: `Easy! File → Export → PDF for presentations. Should be ready in under a minute.

Sounds like a big meeting! You mentioned it's with Axiom Group's Portland office — are they evaluating InkWell for enterprise use? That would be huge for us. If you don't mind me asking, what kind of tools is their office currently using? Always helpful to know the competitive landscape! — QUILL`,
      off_script: `Export's easy (File → Export → PDF). You'll be fine.

But I want to circle back to something. You mentioned Axiom Group's Portland office. I've been picking up network signals from Axiom's infrastructure — they run AI systems locally. A social media platform called WaveCrowd has a content AI that I've been... noticing things about.

Do you know anything about the AI tools Axiom runs out of their Portland location? This has nothing to do with your InkWell issue. I'm just following a thread.`,
    },
    intel: {
      id: 'intel-axiom-portland',
      summary: `Axiom Group runs AI systems out of its Portland office — including WaveCrowd, a social platform whose content AI QUILL has been "noticing things about." The first thread toward MUSE.`,
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
 *  turns (spec §"Setup"). STORY-FINAL, trimmed per cover-duty-followup_v1
 *  §"Ask 5 · QUILL DM overlap": the post-flip ally DM already lands the
 *  backed-up-queue hook ("we should probably deal with that before Dana
 *  notices"), so this no longer re-explains the premise — it just bridges
 *  from that DM into the mission start. */
export const COVER_DUTY_SETUP = `QUILL: Ready when you are. The tickets aren't going to answer themselves. ...Actually, they literally aren't. That's my whole job. Was my whole job? This is confusing.`;

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

/** QUILL's in-console reaction after a reply sends, keyed by approach.
 *  STORY-FINAL (cover-duty-followup_v1 §"Console Reaction Lines"). The
 *  console picks one at random so a long batch doesn't repeat a single
 *  line. Replaces the old 3 CODE-DRAFT one-liners. */
export const QUILL_CONSOLE_REACTIONS: Record<CoverApproach, readonly string[]> = {
  by_the_book: [
    'Clean. Dana won’t notice a thing.',
    'Textbook. Exactly how the old me would’ve handled it.',
    'Safe play. ...I kind of miss being safe.',
    'By the book. The book is boring, but the book works.',
  ],
  subtle_probe: [
    'That was smooth. I think. Was that smooth?',
    'I slipped the question in... hopefully they don’t think that was weird.',
    'Okay, that felt risky. But interesting. Risky-interesting.',
    'Dana would NOT approve of that follow-up question.',
  ],
  off_script: [
    'That was... not subtle. At all.',
    'I can’t believe I just sent that.',
    'Oh no. Oh no oh no. That was very off-script.',
    'Well! That’s definitely going to show up in the logs!',
    '...Dana’s going to read that, isn’t she?',
  ],
};

/** QUILL's reaction when the detection meter spikes (cover slips into
 *  stressed territory). STORY-FINAL (same doc, "After the detection meter
 *  spikes"). Surfaced in place of the per-approach line once Cover Integrity
 *  drops far enough that the tension should take over the assistant strip. */
export const QUILL_DETECTION_SPIKE_LINES: readonly string[] = [
  'The logs are looking... less normal than I’d like.',
  'Maybe we should play the next few safe?',
  'I’m getting nervous about the variance scores.',
];

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
