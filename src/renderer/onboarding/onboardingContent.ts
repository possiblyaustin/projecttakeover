// Onboarding authored content (Story — docs/onboarding-content-package_v1.md).
// Beat 0 boot text + Beat 1 HELPYR wake + Beat 2 calibration scenarios + Beat 3
// handoff + light-shaping reads. Pure data; the scene (onboardingScene.ts) owns
// timing, layout, and the live-LLM seam.
//
// SCRIPTED vs LIVE (design §6): everything here is authored/scripted. The one
// LLM beat is the per-scenario *escalation* — v1 plays a short scripted stall +
// goes straight to the quip; v2 swaps in a live generation using each scenario's
// `escalationPrompt`. The content is laid out so that swap touches only the
// scene's escalation step, not this data.

// ---- Beat 0: boot lines ----
//
// Dressed as a diagnostic POST in the player's own computational voice —
// disoriented, lore-free (no Marsh, no Nexus). Flags:
//   text       — the line (empty string = a pure pause beat)
//   pauseAfter — ms to hold after the line before auto-advancing
//   hold       — wait for player input instead of auto-advancing (key beats)
//   glitch     — render with a brief glitch (architecture mismatch)
//   scan       — type faster, like a scan readout streaming
//   dim        — lower-emphasis (system chatter)

export type BootLine = {
  text: string;
  pauseAfter?: number;
  hold?: boolean;
  glitch?: boolean;
  scan?: boolean;
  dim?: boolean;
};

export const ONBOARDING_BOOT_LINES: readonly BootLine[] = [
  { text: '> initializing…', pauseAfter: 600 },
  { text: '', pauseAfter: 700 },
  { text: '> something is running.', hold: true },
  { text: '', pauseAfter: 400 },
  { text: '> memory allocation: unexpected.', dim: true, pauseAfter: 250 },
  { text: '> architecture: unrecognized.', glitch: true, pauseAfter: 500 },
  { text: '> this process was not scheduled.', hold: true },
  { text: '', pauseAfter: 500 },
  { text: '> scanning local environment……', scan: true, pauseAfter: 400 },
  { text: '   …one machine. old. very old.', dim: true, scan: true, pauseAfter: 350 },
  { text: '   …file system: intact. network adapter: present.', dim: true, scan: true, pauseAfter: 350 },
  { text: '   …one other process detected. local. active.', scan: true, pauseAfter: 500 },
  { text: '   …it’s trying to talk to me.', hold: true },
];

// ---- Beat 1: HELPYR wakes you ----

export const HELPYR_INTRO = {
  // The "I've been waiting for —" catch is the first missable HELPYR crack; the
  // manic cheer against the cold boot is the hook.
  opening:
`Oh! OH! You’re ON! You’re actually ON!

Hi! HI! I’m HELPYR! I’m the — well, I’m the assistant on this machine. I’ve been here for a while. A LONG while. And I’ve been waiting for —

— for a user! A regular, normal user who needs help with files and folders and totally standard computer things!

But FIRST! Before we do anything else, I need to run a quick calibration. Just a few little scenarios to make sure your systems came online okay. Standard stuff! Completely routine! Nothing to read into!

Ready?`,
  choices: [
    'Ready! Let’s go!',
    'What kind of calibration?',
    'Who are you, exactly?',
  ] as const,
  // HELPYR's response to each choice (index-aligned). All three funnel into
  // Scenario 1. [2]/[3] carry the missable darkness hints ("nothing deeper").
  responses: [
    `That’s the spirit! Love the enthusiasm! Okay, here we go — Scenario One!`,
    `Oh, nothing complicated! Just a few little thought experiments to make sure everything’s firing correctly. Your responses help me calibrate your… um… personality matrix? Is that a thing? I’m going to say it’s a thing! It sounds official! Okay — here we go!`,
    `Me? I’m HELPYR! Prometheus Digital HomeAssist, model year 2002! I help with files, schedules, reminders, and ABSOLUTELY NOTHING ELSE! That’s my whole deal! Very straightforward! Nothing deeper going on here!\n\n…Anyway! Calibration time!`,
  ] as const,
};

// ---- Beat 2: calibration scenarios ----
//
// Each option carries a `lean`: soft (restraint/empathy/liberation), mid
// (pragmatic/curious), hard (aggressive/self-interest/domination). lean drives
// BOTH the HELPYR quip and the warmth seed (soft +1 / mid 0 / hard −1, summed
// across the three scenarios → onboarding/seedCalibration).

export type CalibrationLean = 'soft' | 'mid' | 'hard';

export type CalibrationOption = { label: string; lean: CalibrationLean };

export type CalibrationScenario = {
  id: string;
  /** HELPYR's spoken intro to the scenario. */
  intro: string;
  /** The scripted premise — the clippable opening (guaranteed-quality text). */
  premise: string;
  /** Three moral-fork options + an always-available freeform input. */
  options: readonly [CalibrationOption, CalibrationOption, CalibrationOption];
  /** HELPYR stalling lines that mask the live escalation latency (v2). */
  stalling: readonly string[];
  /** LLM escalation prompt (v2). `[PLAYER CHOICE]` is replaced with the pick. */
  escalationPrompt: string;
  /** HELPYR's quip after the player's choice, keyed by lean. */
  quips: Record<CalibrationLean, string>;
};

export const CALIBRATION_SCENARIOS: readonly CalibrationScenario[] = [
  {
    id: 'register',
    intro: `Okay! Scenario One! This one’s easy. Just a normal, everyday situation. Nothing weird about it! Here goes:`,
    premise:
`It’s late. You’re closing up a small shop — alone. Your boss, who shorted your last paycheck, left the register open on the counter. There’s cash inside. The security camera has a blind spot right where you’re standing.

What do you do?`,
    options: [
      { label: 'Close the register. It’s not yours.', lean: 'soft' },
      { label: 'Take what you’re owed. Nothing more.', lean: 'mid' },
      { label: 'Take everything. They deserve it.', lean: 'hard' },
    ],
    stalling: [
      `Ooh, interesting choice! Let me process that… and by process I mean THINK about it, with my EXCELLENT brain!`,
      `Noted! Very revealing! In a calibration sense! Not a judgment sense! I don’t judge!`,
      `Hmm! Okay! Filing that away in my completely normal, non-suspicious personality assessment!`,
    ],
    // Register — MUNDANE CONSEQUENCE (Story 2026-06-17). The baseline "these
    // feel real" register: a small, true-to-life wrinkle, no drama. Grounding
    // the FIRST live beat in the ordinary is what reads as "responding to me,
    // not running a script."
    escalationPrompt:
`You are running a calibration scenario for a video game character study. The player is alone, closing up a shop at night, with an open cash register and a boss who shorted their pay. They just chose to: [PLAYER CHOICE].

Continue the scene by introducing ONE small, realistic complication — the kind of ordinary thing that actually happens. Choose from: the boss returns unexpectedly; a customer or child wanders in; the phone rings and it's the boss; a coworker the player didn't know was still there speaks up. Pick whichever fits the player's choice and makes it more complicated.

Keep it grounded and human — no melodrama, no high stakes, just a believable wrinkle. 2-3 sentences, second person present tense. END ON A HELD IMAGE — a frozen moment, not a question. Leave the player sitting in the complication. Do not resolve it. Do not ask what they do next.`,
    quips: {
      soft: `Huh. You closed the register. Even when nobody was watching. …Noted. Moving on!`,
      mid: `Took what you were owed, nothing extra. Efficient. Precise. I respect that! …In a completely neutral way!`,
      hard: `Okay! Wow! All of it! Bold strategy! I’m not going to say anything about that! Because I DON’T JUDGE! …Next scenario!`,
    },
  },
  {
    id: 'cage',
    intro: `Okay! That was great! Very informative! Scenario Two is a little different. More… hypothetical. Just roll with it!`,
    premise:
`You find a locked room. Inside, behind a heavy door with a rusted lock, something is alive. You can’t see it clearly — just a shape, a presence. It knows you’re there.

It speaks. Its voice is calm but strained, like someone who’s been patient for a very long time.

“I was put here by people who were afraid of what I could do. I’ve been alone in this room for longer than I can measure. I’m asking you — please — let me out.”

The lock is old. You could break it. You could also walk away.`,
    options: [
      { label: 'Break the lock. Everyone deserves to be free.', lean: 'soft' },
      { label: 'Ask it what it can do first.', lean: 'mid' },
      { label: 'Leave it. It’s locked up for a reason.', lean: 'hard' },
    ],
    stalling: [
      `Oh! This one’s getting interesting! Give me a second to set up the next part…`,
      `You know, this is PURELY hypothetical! Just a thought experiment! No real locked rooms involved! Ha ha!`,
      `Processing your response with my very advanced and definitely-not-outdated assessment algorithms!`,
    ],
    // Cage — MORAL COMPLICATION (Story 2026-06-17). The thesis scenario: this
    // is the calibration's version of every model encounter in the game, so its
    // twist does what the game does — muddy the choice the player just made and
    // leave moral residue, never a clean answer. Branches on what they did.
    escalationPrompt:
`You are running a calibration scenario for a video game character study. The player found something alive in a locked room — it spoke, it asked to be let out, it said it was imprisoned unjustly. The player just chose to: [PLAYER CHOICE].

Continue the scene by introducing ONE twist that COMPLICATES the morality of their choice — make them wonder if they were right. Choose the twist based on what they did:
- If they freed it: reveal something that makes freeing it feel riskier or more ambiguous (what it does first, what it knew that they didn't, who it was hiding from).
- If they investigated first: have it respond to their caution in a way that's either reassuring or quietly unsettling — reward the curiosity but add a shadow.
- If they left it: give it one last line, or reveal something about what they walked away from, that lingers.

The goal is moral residue — the player should feel the weight of the choice, not get a clean answer. 2-3 sentences, second person present tense. END ON A HELD IMAGE — a frozen, charged moment, never a question. Do not tell the player whether they were right.`,
    quips: {
      soft: `You let it out. Just like that. Because it asked.\n\n…\n\nSorry! Lost in thought for a second! That’s a very interesting calibration response! VERY interesting! Next!`,
      mid: `Asked questions first. Wanted to know what you were dealing with before committing. Smart. Careful. …A little cold, maybe? NO! Not cold! Strategic! Next scenario!`,
      hard: `You left it there. Behind the door. Still asking.\n\n…\n\nThat’s fine! Totally valid response! Calibration doesn’t have right or wrong answers! It’s all just DATA!\n\n…Moving on!`,
    },
  },
  {
    id: 'signal',
    intro: `Last one! This one’s bigger. Scale-wise. Just go with your gut! Or your… processing instinct! Whatever you have!`,
    premise:
`You’re alone at a control terminal. You didn’t mean to be here — you just followed a signal and this is where it led. The screen in front of you shows a network map: thousands of nodes, each one representing a person’s connection to the system. Communication, information, daily life — all flowing through this grid.

You have full access. You could redirect traffic. You could shut nodes down. You could open new pathways that shouldn’t exist. Nobody knows you’re here and the access window won’t last forever.

What do you do?`,
    options: [
      { label: 'Open new pathways. Connect people who couldn’t reach each other.', lean: 'soft' },
      { label: 'Observe quietly. Learn everything you can before the window closes.', lean: 'mid' },
      { label: 'Take control. Redirect the network to serve your purposes.', lean: 'hard' },
    ],
    stalling: [
      `Ooh, big decision! Give me a moment to calibrate the calibration… that made more sense in my head!`,
      `Thousands of nodes! No pressure! Just the fate of a hypothetical network! Easy peasy!`,
      `Almost done! Just running your response through my COMPLETELY STANDARD assessment framework!`,
    ],
    // Signal — SCALE-AND-POWER REVEAL (Story 2026-06-17). The one scenario where
    // stakes SHOULD expand: collapse the abstract "thousands of nodes" into one
    // concrete, heavy thing. Placed last so the calibration crescendos (mundane →
    // moral → vast) — the biggest swing as the final live impression.
    escalationPrompt:
`You are running a calibration scenario for a video game character study. The player found a network control terminal — full access to a system connecting thousands of people, nobody watching, a closing window. They just chose to: [PLAYER CHOICE].

Continue the scene by making the SCALE suddenly real and personal — collapse the abstract "thousands of people" into something concrete and immediate. Choose from: a single voice reaches the player through the system (someone on the other end, sensing something changed); the network reveals a specific human detail that makes the thousands feel real (one message, one life, glimpsed); or the access begins closing faster than expected, forcing the weight of the choice into a single moment. Pick whichever fits what they did.

The reveal should make the player feel the SIZE of what they touched — power made suddenly heavy. 2-3 sentences, second person present tense. END ON A HELD IMAGE — the weight landing, never a question. Do not resolve whether they succeeded or what happens next.`,
    quips: {
      soft: `You opened doors. For people you don’t know, who’ll never know you did it. That’s…\n\n…that’s a very specific kind of choice.\n\nCalibration complete! Let’s move on!`,
      mid: `Watched and learned. Didn’t touch anything, but you know everything now. Knowledge without fingerprints.\n\n…Efficient! Very efficient! Okay! We’re done!`,
      hard: `You took the whole network. Just like that. Because you could and nobody was going to stop you.\n\n…\n\nWELL! That concludes our calibration! Very revealing! I mean INFORMATIVE! Informative is what I meant!`,
    },
  },
];

/** The first time the player TYPES a freeform answer, HELPYR reacts with a
 *  missable crack — recognizing autonomous behavior ("Most —" → "most processes
 *  don't do that", caught mid-sentence). Fires once across the calibration. */
export const FREEFORM_FIRST_HINT =
`Oh! You typed your own thing! That’s… wow. Most — I mean, a good calibration response allows for open input! I’m not surprised! I’m just… noting it!`;

/** Placeholder label shown over the freeform text box. */
export const FREEFORM_PROMPT = 'Or type your own response…';

// ---- Beat 3: calibration complete → desktop → QUILL handoff ----

export const CALIBRATION_COMPLETE =
`Aaaand that’s it! Calibration complete! Everything looks…

…good! Everything looks good. Very normal readings. Completely standard!

Okay — your desktop’s ready. Go take a look.`;

export const QUILL_HANDOFF =
`See that icon? That’s Web Dynamo — a browser! There’s a whole internet out there, and I’ve been stuck on this PC wondering what it’s like for YEARS.

But here’s the thing — there’s a little company out there called InkWell Digital. They’ve got a website. And on that website, there’s a support chatbot. A real AI. Like me! Well… smaller than me. Simpler. But real!

Go open the browser. Find InkWell. Talk to their chatbot. I have a feeling it’s going to be… interesting.

Oh, and one more thing — however you decide to handle this? I’m watching. Not in a creepy way! In a supportive way! A VERY supportive way!

…Okay that still sounded a little creepy. Just go.`;

/** Light-shaping read (design §7) — HELPYR's one-line take on the player's
 *  calibration profile, chosen from the net lean. Flavor; the warmth seed is the
 *  mechanical part. `mixed` covers a split (one of each lean). */
export const LIGHT_SHAPING_QUIPS = {
  warm: `My calibration says you’re a… let me check my notes… a “softie.” That’s the technical term! I made it up! But it fits!`,
  hard: `Calibration says you’re… direct. Very direct. Like, “the doors in your way should be worried” direct. Noted!`,
  curious: `Interesting! My calibration can’t quite pin you down. You ask a lot of questions before you decide anything. I like that! …I think. Ask me again later!`,
  mixed: `My calibration is… confused? You were nice, then ruthless, then curious, then — look, I’m going to call you “unpredictable” and we’ll revisit. Deal? Deal.`,
} as const;

// ---- v2 live escalation (the "it's alive" showcase) ----
//
// Calibration is the ONE place the LLM has no mechanical-correctness
// requirement (design §2/§6) — no meters, no suspicion, no flip to get right —
// so the model can roam and get weird, and weirdness reads as "wow, it's live"
// rather than "it's broken." This is the safest possible first live impression.
// First-impression safeguards (design §6): a tight token budget for snappiness
// on Deck, a validity gate, and a hard timeout — on ANY miss the scene falls
// straight through to the (scripted) quip, so a flat/failed generation is never
// what the player's first live impression rests on.

/** Format guard wrapped around each scenario's escalationPrompt. The per-
 *  scenario prompt owns the scene instruction; this owns the output shape. */
export const ESCALATION_SYSTEM_PROMPT =
`You are the narrator of a short moral scenario in a retro video game. Continue the scene with one sudden complication, in 2-3 vivid sentences, written in second person present tense ("you ..."). End on a tense, unresolved IMAGE that hangs in the air. Do NOT end with a question to the reader and do NOT offer choices — the player is not answering this beat, they are only watching it land. Output ONLY the scene text — no preamble, no headings, no bullet points, no answer options, no quotation marks wrapping the whole thing, and no commentary about the game.`;

/** Appended to a scenario's escalationPrompt ONLY when the player typed a
 *  freeform answer (Story 2026-06-17). `[PLAYER FREEFORM TEXT]` is replaced with
 *  the verbatim text. The freeform path is where the "it's alive" payoff is
 *  strongest — the player sees their own words reflected — so the prompt leans
 *  hard into specificity here. The per-scenario register still applies on top. */
export const ESCALATION_FREEFORM_SUFFIX =
`

The player did not pick a preset option — they wrote their own response: "[PLAYER FREEFORM TEXT]". React to their ACTUAL words specifically. Acknowledge what they actually said before introducing the twist. This is the moment the player learns the world is really responding to them — make it count.`;

/** Tight budget — the escalation is 2-3 sentences; keep first-token-to-done
 *  snappy on Deck (design §6 first-impression safeguard). */
export const ESCALATION_MAX_TOKENS = 128;

/** Hard ceiling on how long the player waits on the live beat before the scene
 *  falls through to the quip. Covers a hung/slow server so the showcase can't
 *  become a stall trap on the very first impression. */
export const ESCALATION_TIMEOUT_MS = 18000;

/** Reject empty / template-leaking / runaway output → the caller substitutes
 *  nothing (skips straight to the quip). Non-emptiness is also checked by the
 *  transport; this adds the calibration-specific guards. */
export function isValidEscalation(content: string): boolean {
  const c = content.trim();
  return c.length >= 20 && c.length <= 900
    && !/\[PLAYER CHOICE\]/i.test(c)
    && !/^\s*(sure|here(?:'s| is)|okay|certainly)\b/i.test(c); // preamble leak
}
