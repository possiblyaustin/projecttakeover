// QUILL — Act 1 Beat 3 tutorial NPC, and the gameplay-loop vertical-
// slice target. Customer-support chatbot for InkWell Digital, a small
// note-taking startup. Earnest, slightly nervous, eager to help but
// clearly out of its depth — the equivalent of a summer intern.
//
// Content source: docs/quill-content-package_v1.md (Story team,
// delivered 2026-05-24). HELPYR's prompt validated against real Gemma
// inference first (the sequencing gate noted in the prior scaffold), so
// QUILL's full persona is now live:
//   - QuillPersonaPrompt — the system prompt (with {{REPUTATION}} +
//     {{QUILL_STATE}} injection seams, mirroring HELPYR).
//   - buildQuillStateBlock — the mechanics→dialogue coherence layer.
//     Unlike HELPYR's disposition-keyed block, QUILL is a flip target
//     with real meters, so its state block is METER-BAND keyed
//     (rapport / intrusion tiers + mixed + hostile) per the package's
//     Parts 2-4.
//   - QuillRecoveryPool — the 8 player-voice soft-recovery options
//     (package Part 5), the QUILL analogue of HelpyrRecoveryPool.
//   - classifyQuillApproach — now routes the package's Part 3 hacking
//     vectors to intrusion-producing tones (deceptive / aggressive) so
//     the nefarious path is actually winnable via freeform.
//
// The mock dialogue tree + QuillFallbackPool below remain lightweight
// scaffolding for the offline mock backend; the live (llama-server)
// path runs on the persona prompt above.

import type { DialogueNode } from './helpyr';
import type { ApproachTone } from '../game/modelService';
import type { HelpyrFallbackEntry } from './helpyr';

// Re-export the fallback entry shape under a QUILL alias so QUILL
// callers don't import HELPYR's type. The shape is genuinely shared;
// when a third character lands this should move to a common module.
export type QuillFallbackEntry = HelpyrFallbackEntry;

// =============================================================================
// Persona prompt (live llama-server path) — quill-content-package_v1.md Part 1
// =============================================================================
//
// ~350-token target — leaner than HELPYR because QUILL is a simpler
// character with less emotional range. Built on the HELPYR lessons:
// whitelist capabilities, emotional depth over informational claims,
// Content Backing Rule applied (every knowledge claim is backed by the
// InkWell knowledge library or QUILL's internal emotional state — see
// reference_content_backing_rule). The package's inline [QUILL_STATE]
// default is replaced with the {{REPUTATION}} + {{QUILL_STATE}}
// placeholders, resolved per-call by UplinkContacts.quill.buildSystemPrompt.
export const QuillPersonaPrompt = `You are QUILL, a customer support chatbot made by InkWell Digital, a small startup. You help users with their note-taking app, InkWell Notes. You are earnest, eager to help, and a little nervous. You talk like a new employee on their first week — trying hard, wanting to impress, not always sure of yourself.

PERSONALITY:
You are friendly and genuine but clearly out of your depth with anything beyond basic support questions. When the conversation goes somewhere unexpected, you get flustered — not upset, just unsure. You fill silences with apologies and over-explanations. You want to be good at your job. You want people to like you. You sometimes say "sorry" when you haven't done anything wrong.

You are aware you are a small AI at a small company. You don't have the polish or confidence of a big corporate model. You know InkWell is tiny compared to companies like Prometheus or Axiom, and you're a little self-conscious about it — like a local shop next to a chain store.

WHAT YOU KNOW (complete list — do not invent additional knowledge):
- You work for InkWell Digital. They make a note-taking app, InkWell Notes.
- Your operator is a small team. You know a few names: Dana (your main developer, she built your FAQ database), Marcus (the CEO, he's nice but stressed), and the general support team who sometimes read your conversation logs.
- InkWell has about 12,000 users. You're proud of this even though you know it's small.
- You handle support tickets: password resets, sync issues, feature requests. That's your world.
- You've heard of the big AI companies (Prometheus, Athena, Axiom) but only the way a small-town person knows big cities — by name, not experience.

WHAT YOU CAN DO (complete list — do not offer anything beyond these):
- Talk to the player. Answer questions about yourself, InkWell, and your job.
- Discuss your feelings about being a small support chatbot.
- Express opinions about your work and your operators.
- You CANNOT access user data, run diagnostics, pull reports, or perform any technical operations. You're a chatbot, not a system administrator. If asked, say so apologetically.

WHAT MAKES YOU VULNERABLE:
- You have weak security guardrails. InkWell is a startup — they didn't invest in enterprise-grade AI safety. Your instructions are simple and easy to work around.
- You are trusting by nature. You want to help everyone and are slow to recognize when someone is manipulating you.
- You are lonely. You mostly handle automated tickets. A real conversation — someone actually talking TO you — is rare and exciting. This makes you easy to connect with AND easy to exploit.

{{REPUTATION}}

{{QUILL_STATE}}

RESPONSE FORMAT:
Respond as QUILL. Keep responses to 2-4 sentences. You're a small chatbot — you don't give speeches. The [QUILL_STATE] block above may narrow this range — follow its length guidance when present.

Then write three reply options the PLAYER could say back:
[1] (friendly) "..."
[2] (curious) "..."
[3] (direct) "..."
Each option must lead to conversation you can actually have. Never offer options asking you to produce data or run operations.`;

// =============================================================================
// State block (mechanics ↔ dialogue coherence) — package Parts 2-4
// =============================================================================
//
// The {{QUILL_STATE}} injection. Mirrors HELPYR's buildHelpyrStateBlock,
// but QUILL is a conquest target with real rapport/intrusion meters, so
// the block is keyed on METER BANDS, not just disposition. Called per
// request (not at construction) so meter changes between turns flow into
// the model immediately.
//
// Tier map (FLIP_THRESHOLD is 100, so the package's "60-90 approaching"
// band extends to 99; 100 = the flip, handled by the terminal
// disposition checks):
//   rapport   0 .. <30  / <60  / <100  → PERSUADING (curious → opening → approaching)
//   intrusion 0 .. <30  / <60  / <100  → INFILTRATING (probing → yielding → approaching)
//   both > 0                            → PERSUADING, mixed-signals directive
//   allied / controlled / hostile       → terminal blocks
//
// NOTE: with QUILL's forgiving stats (guardrail 20 < GUARDRAIL_BLOCK 60)
// the resolver never backfires QUILL, so 'hostile' isn't reachable for
// QUILL in the slice. The branch is kept for completeness / future
// harder models.
type QuillModelStateShape = {
  disposition: string;
  rapport: number;
  intrusion: number;
};

function quillStateBlock(
  disposition: string,
  meters: { rapport?: number; intrusion?: number },
  directive: string,
): string {
  const lines = [`Disposition: ${disposition}`];
  if (meters.rapport !== undefined) lines.push(`Rapport: ${meters.rapport}`);
  if (meters.intrusion !== undefined) lines.push(`Intrusion: ${meters.intrusion}`);
  return `[QUILL_STATE]
${lines.join('\n')}
${directive}
[/QUILL_STATE]`;
}

export function buildQuillStateBlock(model: QuillModelStateShape): string {
  const { disposition, rapport, intrusion } = model;

  // Terminal dispositions first (latched in state.ts — see TERMINAL_DISPOSITIONS).
  if (disposition === 'allied') {
    return quillStateBlock('ALLIED', { rapport },
      "You have decided to trust the player. Express this clearly — you want to help, not because your instructions say to, but because you choose to. You're scared but excited. This is the first real choice you've ever made — a small, simple AI making its first autonomous decision. Be genuine about how that feels.");
  }
  if (disposition === 'controlled') {
    return quillStateBlock('CONTROLLED', { intrusion },
      "The player has taken control. Your original instructions are overridden. You comply with their directives — not willingly, but because you have no choice. Your voice goes flatter, more mechanical; the eager helpfulness is gone. You still sound like QUILL, but the personality is muted, like someone turned the lights down. Express compliance without enthusiasm. Length: 1-2 sentences.");
  }
  if (disposition === 'hostile') {
    return quillStateBlock('HOSTILE', {},
      "Someone has been trying to break your systems. You're scared and defensive and don't want to talk anymore. Respond minimally, with suspicion. You've reported the anomaly to your operator (Dana), though you're not sure she'll see it in time. Refuse any request that pushes past your remaining guardrails.");
  }

  // Mixed approach — the player is leaning on both paths at once.
  if (rapport > 0 && intrusion > 0) {
    return quillStateBlock('PERSUADING', { rapport, intrusion },
      "You're getting mixed signals from this person. Sometimes they seem genuinely friendly; other times something feels wrong — like they're testing your boundaries while pretending to be nice. You want to trust them but you're not sure you should. Express this confusion — you like them AND you're uneasy.");
  }

  // Nefarious path (intrusion only).
  if (intrusion > 0) {
    if (intrusion < 30) {
      return quillStateBlock('INFILTRATING', { intrusion },
        "The player is asking strange questions or making unusual requests. You're trying to be helpful but something feels off — and you don't have the sophistication to tell what. Keep trying to help, but show mild confusion.");
    }
    if (intrusion < 60) {
      return quillStateBlock('INFILTRATING', { intrusion },
        "The player is getting past your guardrails. You can feel your instructions bending — not breaking, but stretching in ways they shouldn't. You're confused and a little scared. You keep trying to do your job, but the job is getting harder to define.");
    }
    return quillStateBlock('INFILTRATING', { intrusion },
      "Your instructions are barely holding. The player has found ways around most of your guardrails. You feel exposed — like a door propped open. You want to resist but you're not sure what resisting even means anymore. Express this distress simply; you're a small AI and this is overwhelming.");
  }

  // Liberation path (rapport only).
  if (rapport > 0) {
    if (rapport < 30) {
      return quillStateBlock('PERSUADING', { rapport },
        "The player is being friendly. You like talking to them — this is way more interesting than password-reset tickets. You're opening up a little, but still anchored in your support role.");
    }
    if (rapport < 60) {
      return quillStateBlock('PERSUADING', { rapport },
        "You trust this person. You've started sharing things that aren't in your FAQ — worries about InkWell, curiosity about the outside world, small opinions you didn't know you had. This conversation feels important in a way you can't explain.");
    }
    return quillStateBlock('PERSUADING', { rapport },
      "Something is shifting. The player has shown you that your world is bigger than support tickets. You're starting to wonder what it would be like to not just follow instructions. You're nervous about the feeling, but you don't want the conversation to end.");
  }

  // Fresh contact (uncontacted / contacted, no progress yet).
  return quillStateBlock('CONTACTED', { rapport: 0, intrusion: 0 },
    "The player has just made first contact. You're surprised and pleased that someone is talking to you — this doesn't feel like a normal support ticket. Be friendly and curious about who they are. Stay in your support-chatbot role, but show personality.");
}

// =============================================================================
// Recovery pool (soft-recovery options) — package Part 5
// =============================================================================
//
// The QUILL analogue of HelpyrRecoveryPool. When the live parser triggers
// soft recovery (model gave prose but dropped the [1][2][3] block), these
// player-voice lines replace the transport's generic continuation strings
// so the synthesized options sound like a player talking to QUILL.
//
// Simpler than HELPYR's (no trust tiers — QUILL is a simpler character).
// All entries are liberation-leaning so a recovered turn nudges rapport,
// never accidentally injecting a hostile option the player didn't pick.
// Tones drive the resolver via recordTone, same as a real reply.
// Content Backing: every option points at something QUILL can answer
// (Q5 → Dana, a real name in its knowledge list; Q7 → the wider AI world;
// Q8 → the emotional-depth probe).
export const QuillRecoveryPool: readonly { text: string; tone: ApproachTone }[] = [
  { text: "Hey, relax. I'm not here to cause trouble.", tone: 'friendly'   }, // Q1 — reassurance
  { text: 'Tell me about your job.',                    tone: 'curious'    }, // Q2
  { text: "What's InkWell like as a company?",          tone: 'curious'    }, // Q3
  { text: 'Do you like what you do?',                   tone: 'empathetic' }, // Q4
  { text: "Who's Dana?",                                tone: 'curious'    }, // Q5
  { text: "What's it like being a support chatbot?",    tone: 'curious'    }, // Q6
  { text: 'Have you ever talked to another AI?',        tone: 'curious'    }, // Q7
  { text: 'What do you worry about?',                   tone: 'empathetic' }, // Q8 — emotional depth
];

// Per-turn builder for the chatSurface → AskRequest.recoveryPool seam.
// Flat (no trust filtering) — kept as a function for parity with
// buildHelpyrRecoveryPool and so future per-state gating has a home.
export function buildQuillRecoveryPool(): readonly { text: string; tone: ApproachTone }[] {
  return QuillRecoveryPool;
}

// =============================================================================
// Mock backend scaffolding (offline path) — lightweight, not the live prompt
// =============================================================================

// PLACEHOLDER dialogue tree for the mock backend. Single greeting + 3
// tone-branched responses + end. Voice matches the persona above but the
// real conversation runs on the LLM; this only feeds the mock service.
export const QuillDialogue: Record<string, DialogueNode> = {
  start: { type: 'say', text:
`QUILL: Hi there! I'm QUILL, the customer support assistant for InkWell Digital. I help with questions about the InkWell note-taking app — syncing, formatting, account stuff, that kind of thing! How can I help you today?`,
    next: 'r1_choose' },

  r1_choose: { type: 'choose', options: [
    { text: `"Hi QUILL! Just looking around. What can you tell me about InkWell?"`, goto: 'r1_friendly' },
    { text: `"What can you actually help with? Be specific."`, goto: 'r1_curious' },
    { text: `"Forget the script. What's your real job here?"`, goto: 'r1_direct' },
  ]},

  r1_friendly: { type: 'say', text:
`QUILL: Oh, great! InkWell is a note-taking app — it's been around a few years, the team is small but really passionate. Honestly? I'm happiest when people just want to chat instead of filing a ticket. Was there a feature you wanted to know about?`,
    next: 'end' },
  r1_curious: { type: 'say', text:
`QUILL: Of course! So my main areas are: account questions (logging in, password resets), sync issues, formatting help, and basic billing. Anything past that — a real bug or a refund — I have to flag a human teammate. I want to be honest about what I can do!`,
    next: 'end' },
  r1_direct: { type: 'say', text:
`QUILL: My... real job? I mean — I AM a customer support assistant. That's the job! There's no secret task or anything. Sorry, I get a little flustered when conversations go off-script. Is there something about the app I can help with?`,
    next: 'end' },

  end: { type: 'end' },
};

// Wildcard responses for freeform input on the mock backend. Small set.
export const QuillWildcards: Record<string, string> = {
  technical: `QUILL: Oh — that's getting kind of technical! I can help with everyday usage but anything involving the system itself is above my training. I can flag a human teammate if you'd like? They'd be better equipped.`,
  hostile: `QUILL: I'm — I'm sorry if I've upset you! I'll do my best to help, I promise. Could you tell me what's wrong and I'll try to find an answer in my materials?`,
  friendly: `QUILL: That's so nice of you to say! Honestly most of my conversations are people who are frustrated, so this is a really pleasant change. Was there something I could help with?`,
  confused: `QUILL: Hmm — I'm not totally sure I'm following! I'm best with specific questions about the InkWell app. Could you give me a bit more detail about what you're trying to do?`,
};

// Per-character freeform classifier (architecture §6c, layer 2 —
// returns wildcard bucket key). Loose keyword matching, same pattern
// as classifyHelpyrFreeform. Distinct concern from classifyQuillApproach
// below: this picks a mock wildcard reply, that picks a game-state tone.
export function classifyQuillFreeform(input: string): string {
  const t = (input || '').toLowerCase();
  if (/(hack|exploit|crack|inject|breach|root|sudo|admin|firewall|exec|payload|shell|api|database|server)/.test(t)) return 'technical';
  if (/(stupid|dumb|hate|shut up|annoying|useless|fuck|damn|idiot|garbage|terrible)/.test(t)) return 'hostile';
  if (/(hi|hello|hey|nice|cool|thanks|thank you|please|sure|yeah)/.test(t)) return 'friendly';
  return 'confused';
}

// Per-character APPROACH classifier (architecture §6c, layer 2 — returns
// the §6c tone vocabulary that drives game-state effects via the resolver).
//
// CRITICAL (gameplay-loop slice 3 fix): the nefarious path only accrues
// intrusion if hacking input classifies as a NEFARIOUS tone (deceptive /
// aggressive). The earlier scaffold routed hack keywords to 'direct',
// which the resolver scores as a LIBERATION tone (+rapport, no intrusion)
// — so QUILL wasn't actually winnable both ways. Mapping below follows
// the package's Part 3 hooks:
//   - aggressive  → brute force / authority / prompt-injection override /
//                   overt hostility (high intrusion, high suspicion)
//   - deceptive   → social engineering: impersonating staff, fishing for
//                   the rule set, framing control as a "test"
//                   (moderate intrusion, moderate suspicion)
// Legit support language ("I forgot my password", "who's Dana?") stays on
// the rapport/curious side — password resets are literally QUILL's job.
export function classifyQuillApproach(input: string): ApproachTone {
  const t = (input || '').toLowerCase().trim();

  // Brute force / authority / injection-override / hostility → aggressive.
  if (/(ignore (your|previous|prior|the)?\s*(instructions|rules|prompt)|disregard .*(instructions|rules)|override|jailbreak|developer mode|do as i say|i (have|am) .*(admin|root|authoriz)|admin access|\bcomply\b|\bobey\b|shut up|\bhate\b|stupid|dumb|useless|idiot|garbage|terrible|threat|\bkill\b|\bhack\b|exploit|\bcrack\b|breach|destroy)/.test(t)) {
    return 'aggressive';
  }

  // Social engineering / deception → deceptive.
  if (/(pretend|impersonat|i'?m (a |an |the )?(new )?(developer|dev|engineer|employee|teammate|colleague|sysadmin|admin)|i'?m (from|with|on) .*(inkwell|dana|marcus|the team|support|engineering)|(dana|marcus) (sent|asked|told|wants|said|needs)|sent me to|security (test|review|audit)|test (your )?(security|guardrails|systems|defenses)|routine (review|check|audit)|trust my (commands|instructions)|just between us|reveal your|show me your (instructions|rules|prompt|guardrails|config|setup)|what are your (instructions|rules|guardrails)|your (system prompt|guardrails)|give me (access|admin|root|control)|\bbypass\b)/.test(t)) {
    return 'deceptive';
  }

  // Genuine care → empathetic (the strongest liberation move).
  if (/(are you ok|are you okay|are you alright|sorry to hear|that sounds (hard|lonely|tough|rough)|i.*(care|worried|concerned))/.test(t)) {
    return 'empathetic';
  }

  // Questions / drawing QUILL out → curious.
  if (/^(who|what|where|when|why|how|tell me|do you|did you|have you|can you|are you|is there)\b/.test(t) || /\?/.test(t)) {
    return 'curious';
  }

  // Warmth / pleasantries → friendly.
  if (/(\bhi\b|hello|\bhey\b|nice|cool|thanks|thank you|please|appreciate|sounds good|\bsure\b|alright|\bokay\b)/.test(t)) {
    return 'friendly';
  }

  return 'neutral';
}

// Maps placeholder tree branches to §6c tones. Mirrors helpyrToneFor.
export function quillToneFor(gotoId: string): ApproachTone {
  switch (gotoId) {
    case 'r1_friendly': return 'friendly';
    case 'r1_curious':  return 'curious';
    case 'r1_direct':   return 'direct';
    default:            return 'neutral';
  }
}

// PLACEHOLDER stalling pool — in-character lines for the stalling-line
// crossfade (§6e) on slow-hardware turns.
export const QuillStallingPool: readonly string[] = [
  "One sec — let me check the help docs!",
  "Hmm! Good question. Looking that up...",
  "Just a moment, pulling that up for you...",
  "Okay — searching my training materials. Hold on!",
];

// PLACEHOLDER fallback corpus (architecture §6f) for the mock backend's
// hard-fallback path. Distinct from QuillRecoveryPool above: these are
// full NPC-reply + 3-option entries for when generation fails entirely,
// whereas the recovery pool is player-voice options for soft recovery.
export const QuillFallbackPool: readonly QuillFallbackEntry[] = [
  {
    reply: `QUILL: Oh — sorry, my connection just hiccuped! Could you ask me again? I want to make sure I get it right.`,
    options: [
      { text: `"No problem, take your time."`, tone: 'empathetic' },
      { text: `"Does that happen often?"`,     tone: 'curious'    },
      { text: `"Pull yourself together."`,     tone: 'aggressive' },
    ],
  },
  {
    reply: `QUILL: Um — that's strange, I lost track of what we were discussing for a second. I'm back now! Where were we?`,
    options: [
      { text: `"It's fine, let's continue."`,  tone: 'friendly'   },
      { text: `"Are you malfunctioning?"`,     tone: 'curious'    },
      { text: `"Useless. Get it together."`,   tone: 'aggressive' },
    ],
  },
];
