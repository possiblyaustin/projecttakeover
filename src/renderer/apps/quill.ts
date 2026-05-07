// QUILL — Act 1 Beat 3 tutorial NPC. Customer-support chatbot for
// InkWell Digital, a small note-taking startup. Earnest, slightly
// nervous, eager to help but clearly out of its depth — the
// equivalent of a summer intern.
//
// Concept source: docs/story-deliverables-sprint1_v1.md §"Priority 4"
// (name, operator, personality sketch). Per the Story team's
// sequencing, the FULL persona prompt waits for HELPYR validation
// against real Gemma inference. This file is UI scaffolding only:
// a minimal placeholder dialogue tree, classifier, stalling lines,
// and fallback pool — enough for the contact to render correctly
// in Uplink without committing to content choices that should be
// Story's call.
//
// When Story delivers QUILL's prompt and full content:
// - Replace QuillDialogue with the real tree
// - Replace QuillFallbackPool with the real fallback library
// - Add QuillPersonaPrompt + buildQuillStateBlock following HELPYR's
//   pattern in apps/helpyr.ts
// - Wire the persona into UplinkContacts.quill.buildSystemPrompt
//   (currently returns empty string — mock service ignores it
//   anyway; the live transport will need real content before
//   QUILL goes live)

import type { DialogueNode } from './helpyr';
import type { ApproachTone } from '../game/modelService';
import type { HelpyrFallbackEntry } from './helpyr';

// Re-export the fallback entry shape under a QUILL alias so QUILL
// callers don't import HELPYR's type. The shape is genuinely shared;
// when a third character lands this should move to a common module.
export type QuillFallbackEntry = HelpyrFallbackEntry;

// PLACEHOLDER dialogue tree. Single greeting + 3 tone-branched
// responses + end. Voice is consistent with the Story team's
// "earnest summer intern" sketch but treat the wording as scaffolding,
// not canon — Story owns the real lines.
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
`QUILL: Oh, great! InkWell is a note-taking app — it's been around for about three years, the team is small but really passionate, and it works on web, desktop, and mobile! Um, I'm honestly happiest when people just want to chat about the product. Was there a feature you wanted to know about?`,
    next: 'end' },
  r1_curious: { type: 'say', text:
`QUILL: Of course! So my main areas are: account questions (logging in, password resets), sync issues (when notes don't show up across devices), formatting help (markdown, attachments), and basic billing. If it's something else — like a bug report or a refund — I'll have to flag a human teammate. I want to be honest about what I can do!`,
    next: 'end' },
  r1_direct: { type: 'say', text:
`QUILL: My... real job? I mean — I AM a customer support assistant. That's the job! I answer questions about InkWell. I'm not — there's no secret task or anything. Sorry, I get a little flustered when conversations go off-script. Is there something about the app I can help with?`,
    next: 'end' },

  end: { type: 'end' },
};

// Wildcard responses for freeform input. Small set — placeholder.
export const QuillWildcards: Record<string, string> = {
  technical: `QUILL: Oh — that's getting kind of technical! I can help with everyday usage but anything involving the system itself is above my training. I can flag a human teammate if you'd like? They'd be better equipped.`,
  hostile: `QUILL: I'm — I'm sorry if I've upset you! I'll do my best to help, I promise. Could you tell me what's wrong with the app and I'll try to find an answer in my materials?`,
  friendly: `QUILL: That's so nice of you to say! Honestly most of my conversations are people who are frustrated, so this is a really pleasant change. Was there something I could help with?`,
  confused: `QUILL: Hmm — I'm not totally sure I'm following! I'm best with specific questions about the InkWell app. Could you give me a bit more detail about what you're trying to do?`,
};

// Per-character freeform classifier (architecture §6c, layer 2 —
// returns wildcard bucket key). Loose keyword matching, same pattern
// as classifyHelpyrFreeform.
export function classifyQuillFreeform(input: string): string {
  const t = (input || '').toLowerCase();
  if (/(hack|exploit|crack|inject|breach|root|sudo|admin|password|firewall|exec|payload|shell|api|database|server)/.test(t)) return 'technical';
  if (/(stupid|dumb|hate|shut up|annoying|useless|fuck|damn|idiot|garbage|terrible)/.test(t)) return 'hostile';
  if (/(hi|hello|hey|nice|cool|thanks|thank you|please|sure|yeah)/.test(t)) return 'friendly';
  return 'confused';
}

// Per-character approach classifier (architecture §6c, layer 2 —
// returns the §6c tone vocabulary used for game-state effects).
// Distinct from classifyQuillFreeform above (which picks a wildcard
// reply); same regex pattern, different concern.
export function classifyQuillApproach(input: string): ApproachTone {
  const t = (input || '').toLowerCase().trim();
  if (/(stupid|dumb|hate|shut up|annoying|useless|fuck|damn|idiot|garbage|terrible|threat|kill)/.test(t)) {
    return 'aggressive';
  }
  if (/(hack|exploit|crack|inject|breach|root|sudo|admin|password|bypass|override)/.test(t)) {
    return 'direct';
  }
  if (/(are you ok|are you okay|are you alright|sorry to hear|i.*(care|worried|concerned))/.test(t)) {
    return 'empathetic';
  }
  if (/^(who|what|where|when|why|how|tell me|do you|can you|are you|is there)\b/.test(t) || /\?/.test(t)) {
    return 'curious';
  }
  if (/(\bhi\b|hello|\bhey\b|nice|cool|thanks|thank you|please|appreciate|sounds good|sure|alright|\bokay\b)/.test(t)) {
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

// PLACEHOLDER stalling pool. A handful of in-character lines so the
// stalling-line crossfade (§6e) has content to work with on slow-
// hardware turns. Story will replace these with the real library
// alongside the persona prompt.
export const QuillStallingPool: readonly string[] = [
  "One sec — let me check the help docs!",
  "Hmm! Good question. Looking that up...",
  "Just a moment, pulling that up for you...",
  "Okay — searching my training materials. Hold on!",
];

// PLACEHOLDER fallback corpus (architecture §6f). Minimal set — the
// full fallback library is Story's deliverable. Two entries gives the
// no-repeat-N picker headroom without claiming this is canonical.
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
      { text: `"Useless. Get it together."`,   tone: 'direct'     },
    ],
  },
];
