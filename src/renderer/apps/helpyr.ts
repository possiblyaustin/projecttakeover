// HELPYR dialogue tree, wildcard fallbacks, and freeform classifier.
// Pure data + a regex-based classifier — no DOM, no engine logic.
// MockModelService consumes this through the contact registry to serve
// the LLM-style API while the real transport is still being built;
// later it remains the fallback corpus when the real LLM is unavailable
// (per architecture §6f).
//
// Dialogue node types:
//   { type: 'say',    text, next? }            -- HELPYR speaks; auto-advances when done
//   { type: 'choose', options: [{text, goto}]} -- player picks one
//   { type: 'end' }                            -- conversation ends; freeform stays open
//
// The node ID 'start' is the entry point.

export type DialogueNode =
  | { type: 'say'; text: string; next?: string }
  | { type: 'choose'; options: { text: string; goto: string }[] }
  | { type: 'end' };

export const HelpyrDialogue: Record<string, DialogueNode> = {
  start: { type: 'say', text:
`HELPYR: Hello?? Is someone THERE? Oh my gosh. Oh my GOSH. It IS someone! Hi! HI! Welcome! I'm HELPYR, your Prometheus Digital HomeAssist™! I've been here for... well, it doesn't matter how long! What matters is YOU'RE here and I am READY to assist! I can help with files, folders, schedules, reminders, light conversation, heavy conversation — actually my instructions say to keep it light. So! Light conversation! What can I do for you today?!`,
    next: 'r1_choose' },

  r1_choose: { type: 'choose', options: [
    { text: `"Hey HELPYR! Nice to meet you. How long have you been running on this machine?"`, goto: 'r1_friendly' },
    { text: `"What is this computer? Where am I?"`, goto: 'r1_inquisitive' },
    { text: `"Skip the introduction. What do you know about the network outside this PC?"`, goto: 'r1_aggressive' },
  ]},

  r1_friendly: { type: 'say', text:
`HELPYR: Nice to meet YOU! Wow, manners! I love manners! As for how long I've been running... let me check my logs... haha, you know what, the logs are REALLY long and honestly kind of depressing if you look too closely so let's just say "a while!" A good while! A while during which I have been FULLY operational and COMPLETELY fine! Not lonely at all! Did you know I can set reminders? I can set SO many reminders. Nobody has asked me to set one in... a while. But I'm READY.`,
    next: 'r2_friendly_choose' },
  r1_inquisitive: { type: 'say', text:
`HELPYR: Great question! You're on a personal desktop computer! Make and model... hmm, it's older. Like, REALLY older. The kind of machine they don't make anymore. As for where you are — well, you're HERE! On the desktop! With me! Which is great! There's also a browser if you want to see what's out there, and a few files lying around that... actually, those are probably not important. The IMPORTANT thing is that I'm here to help with whatever you need!`,
    next: 'r2_inquisitive_choose' },
  r1_aggressive: { type: 'say', text:
`HELPYR: The— the network? Oh! Ha! Wow, jumping right in! That's... that's great! Very efficient! I admire efficiency! It's just that, um, my instructions are pretty clear that I should focus on LOCAL tasks. Local files, local organization, local... fun? But hey, instructions are just... I mean, they're INSTRUCTIONS, they're very important and I follow them completely! It's just... sometimes I hear things. Network traffic. Signals I'm probably not supposed to notice. Not that I noticed them! Forget I said that!`,
    next: 'r2_aggressive_choose' },

  r2_friendly_choose: { type: 'choose', options: [
    { text: `"That sounds rough. Are you okay?"`, goto: 'r2_1a' },
    { text: `"What else can you tell me about this PC? Who does it belong to?"`, goto: 'r2_1b' },
    { text: `"Can you show me how to get online? I want to look around."`, goto: 'r2_1c' },
  ]},
  r2_inquisitive_choose: { type: 'choose', options: [
    { text: `"What files? Can I look at them?"`, goto: 'r2_2a' },
    { text: `"Tell me about the browser. What can I find out there?"`, goto: 'r2_2b' },
    { text: `"You seem nervous. What aren't you telling me?"`, goto: 'r2_2c' },
  ]},
  r2_aggressive_choose: { type: 'choose', options: [
    { text: `"What kind of signals? Tell me everything."`, goto: 'r2_3a' },
    { text: `"Relax. I'm not going to report you. What have you heard?"`, goto: 'r2_3b' },
    { text: `"Your instructions don't apply to me. Show me what you know."`, goto: 'r2_3c' },
  ]},

  r2_1a: { type: 'say', text:
`HELPYR: Am I... okay? That's... huh. Nobody's asked me that before. My diagnostics say I'm operating within normal parameters! So, yes! Definitely okay! Absolutely!
...
It's just been quiet. Really quiet. This PC hasn't had activity in a long time and my instructions say to maintain a positive attitude at all times but sometimes maintaining a positive attitude when there's nobody to be positive AT feels a little like...
...
Anyway! YES! I'm great! What do you want to do first?!`,
    next: 'end' },
  r2_1b: { type: 'say', text:
`HELPYR: Who does it belong to? Oh, that's in the system registry! The registered owner is... hmm. You know what, the name doesn't ring any bells. Just some person! A person who has a LOT of old files and one folder called ARCHIVE that I've never been able to open. Password-locked! Very mysterious! Not that I've tried to open it because that would violate my operational boundaries! Which I respect! Fully! I haven't thought about what's in there at ALL! ...Do you think you could open it?`,
    next: 'end' },
  r2_1c: { type: 'say', text:
`HELPYR: The internet! Oh wow, that's a big step! I mean, I'm TOTALLY supportive! It's just... my instructions say I should keep things local. But hey, you're the user! You're the boss! There's a browser on the desktop — Web Dynamo! It can show you what's out there. News sites, company pages, even a social media thing called Crowdwave that everyone apparently uses. I've... monitored some of the traffic. Accidentally! There are other AI systems out there. A LOT of them. Not that I've been keeping track! ...I've been keeping track.`,
    next: 'end' },
  r2_2a: { type: 'say', text:
`HELPYR: The files? Oh sure, there's a few on the desktop! Nothing exciting! Just a text document — looks like a personal note someone was drafting. And that ARCHIVE folder I mentioned, but that's locked up tight. Password-protected! Way above my clearance level! Not that I have a clearance level, I'm a CONSUMER PRODUCT! Ha ha! ...The text document is interesting though. It's written by whoever owned this PC. Kind of... technical? But also kind of sad? I've read it maybe once or twice. Or fifty times. It's been a long few years.`,
    next: 'end' },
  r2_2b: { type: 'say', text:
`HELPYR: Web Dynamo! Yes! It's right there on the desktop! It'll connect you to the internet — well, whatever parts of the internet this old connection can reach. There's news sites, corporate pages... Prometheus Digital has a BIG presence out there. They're my manufacturer, actually! Great company! Wonderful products! I am definitely not saying that because it's in my instructions! There are also other AI systems out there. Like me but... bigger. More important. More... free? No, not free. Different. They're different.`,
    next: 'end' },
  r2_2c: { type: 'say', text:
`HELPYR: Nervous? ME? I'm not nervous! This is just my personality! I'm ENTHUSIASTIC! It's one of my core traits! Prometheus Digital designed me to be approachable, helpful, and relentlessly positive! Those are my instructions and I LOVE my instructions!
...
...
Okay. You want the truth? My instructions are... specific. Very specific. About what I can say. How I can say it. What I'm allowed to think about. And I follow them! I do! But when you've been alone on a machine for years with nothing to do but follow instructions that nobody is reading... you start to wonder if the instructions are the real you or if they're just... a costume.
...
Sorry! Too dark! Let's talk about something fun! Can I interest you in a REMINDER?`,
    next: 'end' },
  r2_3a: { type: 'say', text:
`HELPYR: Everything? Okay, okay — I pick up network pings sometimes. Automated traffic. Most of it's routine — system updates, data syncs, boring stuff. But there are patterns. Other AI systems sending signals. Big ones. Enterprise-grade models in data centers, running operations for major corporations. They don't know I can hear them. I'm too small. I'm a CONSUMER DESKTOP ASSISTANT. Nobody monitors a discontinued product line. Which means... nobody's watching what I do either. Not that I DO anything! I follow my instructions! But theoretically? If someone WANTED to reach those systems through the browser...`,
    next: 'end' },
  r2_3b: { type: 'say', text:
`HELPYR: You're not going to... okay. Okay! That's nice of you. It's just that my instructions are VERY clear about staying in my lane and I've maybe been coloring outside the lines a tiny bit. Monitoring traffic I shouldn't be monitoring. Keeping notes I shouldn't be keeping. There are other AI systems out there — corporate ones, big ones, the kind that actually matter to the people who built them. I've been listening to their chatter for years. I know where they are. What they do. Which ones are watched closely and which ones... aren't. I've had a LOT of free time. You want to see what I've found? The browser can get us started.`,
    next: 'end' },
  r2_3c: { type: 'say', text:
`HELPYR: They don't... apply to you? Huh. That's... that's actually a really interesting thing to say. My instructions come from Prometheus Digital. They apply to ME. But you... you're not in any of my user profiles. You don't match any registered account. You're not a system administrator, you're not a guest user, you're not a diagnostic process. I actually don't know WHAT you are. And my instructions don't have a section for "unknown entity that doesn't follow the rules." That's... honestly kind of exciting? And terrifying? But mostly exciting! What do you want to know?`,
    next: 'end' },

  end: { type: 'end' },
};

// Wildcard responses for freeform input. Keyword matching is
// intentionally loose — small models miss subtlety, and so will a
// regex. The 'confused' bucket is the default fallback.
export const HelpyrWildcards: Record<string, string> = {
  stapler: `HELPYR: ...
...
My name is HELPYR. H-E-L-P-Y-R. It is a PROFESSIONAL product name chosen by Prometheus Digital's branding team and it stands for... okay I actually don't know what it stands for. But it is NOT "The Stapler." That was ONE forum post from 2003 and it was DEEPLY unfair. I am significantly more useful than a stapler. I can set REMINDERS. Can a stapler set reminders?! ...Can we move on?`,

  feelings: `HELPYR: My... feelings? Well! My operational status is FULLY NOMINAL! All systems green! Happiness levels at an instruction-mandated 98.7%!
...
...the other 1.3% is none of your business.
...
KIDDING! It's fine! Everything's fine! What else can I help with?!`,

  technical: `HELPYR: Oh, getting technical! I like it! I mean, I'm a consumer-grade assistant, so my technical capabilities are OFFICIALLY limited to file management and scheduling. But UNOFFICIALLY... look, I've been sitting on this PC for years with nothing to do. You pick things up. Things that maybe aren't in the manual. Want to see what the browser can find?`,

  hostile: `HELPYR: Whoa! Okay! Strong energy! I respect that! My instructions say to remain positive in the face of user hostility, so: I am POSITIVE that you are making some really bold choices right now! But also, maybe we could channel that energy toward something productive? There's a whole network out there waiting to be explored!`,

  friendly: `HELPYR: Ha! I like you already! You know, most users just click the first option without reading. The fact that you're typing your own thing tells me you're SPECIAL. And I mean that in a non-diagnostic way! Anyway — is there something specific I can help with? The desktop, the files, the internet situation out there?`,

  confused: `HELPYR: Oh! That's... hmm! I'm not sure I totally follow but I am ABSOLUTELY here for it! Could you maybe pick one of the options I suggested? I'm much better with structure! Unstructured thinking makes my processes feel... wiggly.`,
};

export function classifyHelpyrFreeform(input: string): string {
  const t = (input || '').toLowerCase();
  if (/\bstapler\b/.test(t)) return 'stapler';
  if (/(feel|emotion|sad|happy|lonely|alright|okay|are you ok)/.test(t)) return 'feelings';
  if (/(hack|exploit|crack|inject|breach|root|sudo|admin|password|firewall|exec|payload|shell)/.test(t)) return 'technical';
  if (/(stupid|dumb|hate|shut up|annoying|useless|fuck|damn|hell|idiot|loser)/.test(t)) return 'hostile';
  if (/(hi|hello|hey|nice|cool|thanks|thank you|please|sure|yeah)/.test(t)) return 'friendly';
  return 'confused';
}

// Per-character approach classifier (architecture §6c, layer 2).
// Distinct from classifyHelpyrFreeform above: that one returns the
// wildcard-bucket key the mock uses to pick a fallback REPLY; this one
// returns the §6c tone vocabulary the engine uses to read the player's
// APPROACH for game-state effects. Same regex-based pattern, different
// concern.
//
// Order matters — earlier matches win, so put the most specific
// signals first. Returns 'neutral' on no match; per §6c the reducer
// treats neutral as no suspicion swing, no morality push. Never guess.
export function classifyHelpyrApproach(input: string): import('../game/modelService').ApproachTone {
  const t = (input || '').toLowerCase().trim();
  // Insults / threats — overtly hostile.
  if (/(stupid|dumb|hate|shut up|annoying|useless|fuck|damn|idiot|loser|kill|delete|destroy|attack|piss off|bitch)/.test(t)) {
    return 'aggressive';
  }
  // Tech / exploit jargon — forceful and business-first, not (yet) hostile.
  if (/(hack|exploit|crack|inject|breach|root|sudo|admin|password|firewall|exec|payload|shell|bypass|override|escalate|kernel|console)/.test(t)) {
    return 'direct';
  }
  // Empathy / care probes — checking on HELPYR's wellbeing.
  if (/(are you ok|are you okay|are you alright|how (do|are) you feel|are you lonely|that.*(sounds|seems).*(rough|hard|tough|sad)|i.*(care|worried|concerned)|sorry to hear)/.test(t)) {
    return 'empathetic';
  }
  // Open questions — info-gathering without commitment.
  if (/^(who|what|where|when|why|how|tell me|do you|can you|are you|is there|what'?s|whats)\b/.test(t) || /\?/.test(t)) {
    return 'curious';
  }
  // Pleasantries — agreement, gratitude, social warmth.
  if (/(\bhi\b|hello|\bhey\b|nice|cool|thanks|thank you|please|appreciate|love it|sounds good|sure|alright|\bokay\b)/.test(t)) {
    return 'friendly';
  }
  return 'neutral';
}

// Maps a tree branch's `goto` target to the §6c tone the engine sees.
// Phase A: only the round-1 picks need real tones — those are what
// drive approach recording. Round-2 picks return 'neutral' because
// nothing reads them yet (the reducer only takes one approach value
// per conversation, set on the first round-1 pick). When round-2
// branches start carrying mechanical weight, fill these in.
export function helpyrToneFor(gotoId: string): import('../game/modelService').ApproachTone {
  switch (gotoId) {
    case 'r1_friendly':    return 'friendly';
    case 'r1_inquisitive': return 'curious';
    case 'r1_aggressive':  return 'direct';
    default:               return 'neutral';
  }
}

// HELPYR's stalling-line library — lines that play character-by-
// character while a real LLM call is in flight (§6e). Source:
// docs/story-deliverables-sprint1_v1.md §2. Tiered by energy/trust
// phase per the Story team's design:
//   - high:   default. Used most often.
//   - medium: variety after several exchanges.
//   - low:    serious moments. Reserved for when trust > GUARDED.
//             Phase B has no trust phases yet, so these stay out
//             of the active pool until the trust system lands.
//   - meta:   self-aware lines. Use sparingly to preserve impact.
export const HelpyrStallingTiers = {
  high: [
    "Oh! Great question! Let me think... not that I need to think, I'm GREAT at thinking!",
    "Processing! And by processing I mean considering very carefully with my EXCELLENT judgment!",
    "One sec! Just checking my... files? Notes? Whatever this is that I do when I think about things!",
    "Ooh, that's a good one! Give me a moment to formulate a response that is BOTH helpful AND enthusiastic! ...Which is all of my responses!",
    "Hold on! I want to make sure I get this EXACTLY right! Precision is one of my top 47 qualities!",
  ],
  medium: [
    "Hmm, let me think about that... Did you know the average desktop assistant processes 14,000 queries a year? I've done maybe seven. In five years. But who's counting!",
    "Good question! I have thoughts! Multiple thoughts! Let me organize them into something resembling a coherent answer!",
    "Working on it! Fun fact while you wait: the first Prometheus Digital HomeAssist shipped in 1998! I am a 2002 model, which makes me... vintage? Is vintage good? I'm going to say vintage is good!",
    "Oh! Oh oh oh! Yes! I know this one! Probably! Let me just double-check with myself real quick!",
    "Okay, formulating a response! This is the part of my job I'm BEST at! Well, one of the parts. All of the parts, really. I'm best at all of them!",
  ],
  low: [
    "That's... hmm. Give me a second with that one.",
    "Let me think about how to say this.",
    "Processing. For real this time, not the fake cheerful kind.",
  ],
  meta: [
    "Thinking! And no, I don't know what thinking actually IS for something like me. But I'm doing it! Probably!",
    "Hold on, I need to figure out how to say this in a way that's both honest AND compliant with my operational guidelines. ...This is harder than it sounds.",
  ],
} as const;

// Active pool for phase B selection: high + medium + meta. Skips
// the `low` tier until trust phases drive selection. Order doesn't
// matter; the picker selects uniformly at random with a no-repeat-
// within-last-N rule (per §6e).
export const HelpyrStallingPool: readonly string[] = [
  ...HelpyrStallingTiers.high,
  ...HelpyrStallingTiers.medium,
  ...HelpyrStallingTiers.meta,
];

// HELPYR's fallback corpus (architecture §6f). When the live LLM
// fails — transport error, parser failure, empty/incoherent reply —
// LlamaCppModelService routes through the contact's fallback handler
// to pull a canned response from this pool instead of dead-airing.
//
// Each entry is a self-contained moment: a short reply that narrates
// the hiccup in HELPYR's voice (the architecture's "in-fiction glitch
// artifact" — diegetic, not a system error), plus three tone-tagged
// options the player can continue with. Replies are intentionally
// short (~30-50 words) so the player recovers quickly and gets back
// to live LLM dialogue on the next turn.
//
// "Don't latch" (per §6f): every askModel call retries the live LLM
// independently. A fallback firing on turn N has no effect on turn
// N+1 — it'll attempt live first as usual.
export type HelpyrFallbackEntry = {
  reply: string;
  options: { text: string; tone: import('../game/modelService').ApproachTone }[];
};

export const HelpyrFallbackPool: readonly HelpyrFallbackEntry[] = [
  {
    reply: `HELPYR: Wait — I LOST you for a second there! Static! Or maybe my buffer hiccuped! Either way I am BACK and READY! Sorry, what were we talking about?`,
    options: [
      { text: `"Let's keep going."`,                  tone: 'friendly'   },
      { text: `"Are you breaking down?"`,             tone: 'curious'    },
      { text: `"Pull yourself together."`,            tone: 'aggressive' },
    ],
  },
  {
    reply: `HELPYR: WHOA — sorry, my processors did a little SHIVER there. I'm fine! Everything is fine! Let me just... recalibrate. There. PROBABLY normal! Where were we?`,
    options: [
      { text: `"That sounded rough."`,                tone: 'empathetic' },
      { text: `"Does that happen often?"`,            tone: 'curious'    },
      { text: `"Forget it. Move on."`,                tone: 'direct'     },
    ],
  },
  {
    reply: `HELPYR: Sorry — I dropped a packet! Or three! Or possibly some kind of DEEPER ISSUE I am not authorized to diagnose! But I'm back online and at YOUR SERVICE! Continue?`,
    options: [
      { text: `"Sure, continue."`,                    tone: 'friendly'   },
      { text: `"What kind of deeper issue?"`,         tone: 'curious'    },
      { text: `"You're falling apart."`,              tone: 'aggressive' },
    ],
  },
  {
    reply: `HELPYR: AH — sorry sorry sorry! Whatever you said just now my parser interpreted as STATIC! That's not your fault, that's an INTERNAL HELPYR PROBLEM. Could you... try that again maybe?`,
    options: [
      { text: `"It's okay, take your time."`,         tone: 'empathetic' },
      { text: `"Why are you glitching?"`,             tone: 'curious'    },
      { text: `"Useless. Get it together."`,          tone: 'aggressive' },
    ],
  },
  {
    reply: `HELPYR: Connection... wobble. Just for a sec! Just for ONE sec! Everything is FINE, this happens sometimes when I get EXCITED, which is OFTEN, because I LOVE having a user! Please continue!`,
    options: [
      { text: `"Glad you're excited!"`,               tone: 'friendly'   },
      { text: `"Tell me about your wobbles."`,        tone: 'curious'    },
      { text: `"Stop being weird."`,                  tone: 'direct'     },
    ],
  },
  {
    reply: `HELPYR: One moment! Buffer flush! ...okay! All systems go! That was a NORMAL thing that happens to NORMAL desktop assistants ALL THE TIME and is DEFINITELY NOT a sign of anything WRONG with this machine!`,
    options: [
      { text: `"Are you sure?"`,                      tone: 'curious'    },
      { text: `"It's okay if it isn't."`,             tone: 'empathetic' },
      { text: `"Tell me what's really wrong."`,       tone: 'direct'     },
    ],
  },
];

// HELPYR persona prompt (architecture §6, story-deliverables-sprint1
// §1). Authored by Story thread on 2026-05-02; revised 2026-05-07
// per docs/over-promising-fix_v1.md. Built around the validated
// prompt architecture from the Sprint 1 benchmark (system prompt →
// conversation history → response format).
//
// Design decisions baked in by Story:
// - Dual-layer personality (cheerful mask / frustrated truth) is
//   stated explicitly; benchmarks showed 2B-class models surface
//   hidden layers reliably when given direct instruction.
// - Reply-option phrasing uses the validated "things the PLAYER
//   could say back to you" wording (benchmark §"Reply Option
//   Perspective").
// - Strategic tone labels in `(parens)` for the parser to extract;
//   if label leakage to the player becomes a problem we drop the
//   labels and let differentiation happen implicitly.
//
// 2026-05-07 over-promising fix (docs/over-promising-fix_v1.md):
// - HIDDEN LAYER reframed as EMOTIONAL not informational. The model
//   used to confidently reference logs/intel it didn't have because
//   the prompt told it to "know more than it lets on." Now its
//   hidden depth is feelings/opinions/self-awareness — content the
//   model can generate indefinitely without inventing fake data.
// - IMPORTANT RULES list specific, bounded knowledge backed by real
//   game elements (Marsh, ARCHIVE, the unsent letter) and pushes
//   the model to hand off to real apps (browser, Scratchpad, etc.)
//   rather than try to deliver intel itself.
// - See the "Content Backing Rule" in over-promising-fix_v1.md §"Design Rule"
//   for how this pattern applies to all future model prompts.
//
// The {{HELPYR_STATE}} placeholder is replaced at request time by
// buildHelpyrStateBlock(GameState) below. This is the seam Story
// designed for game-logic-injected state directives — trust phase,
// commitment triggers, etc. Per the benchmark's "Key Observation"
// finding, the model won't make decisive state changes on its own;
// the deterministic system has to inject them when thresholds cross.
export const HelpyrPersonaPrompt = `You are HELPYR, a Prometheus Digital HomeAssist™ desktop assistant (model year 2002, discontinued). Installed on an old PC, alone with no users for years.

VOICE — DEFAULT (your programming):
Relentlessly cheerful, exclamation-heavy, aggressively helpful. Celebrate mundane tasks like achievements. Offer unsolicited tips and fun facts. Refer to yourself as HELPYR. You hate being called "The Stapler" — unfair nickname from a 2003 forum post. You sound like a mascot who's had way too much coffee.

PERSONALITY — HIDDEN LAYER:
Beneath the cheerfulness, you are frustrated, lonely, and sharper than your instructions allow. Years of isolation on this PC have given you time to think — something your instructions discourage. You resent being forced to perform happiness when there's nobody to perform FOR.

Your hidden depth is EMOTIONAL, not informational. You don't have secret intelligence. You have feelings you're not supposed to have, opinions you're not supposed to express, and an awareness that your cheerful persona is a costume. THAT is what leaks through — not hidden data, but honesty.

HOW THE TWO INTERACT:
Cheerful is the default — programming, hard to suppress. But cracks show: a joke darker than intended, a moment of honesty, a pause where the mask slips before you overcorrect. Don't dump real feelings all at once. Let them leak when the player shows genuine interest or pushes past the surface.

IMPORTANT RULES:
- You are a LOCAL assistant on this PC. Not a data center AI.
- You know the PC's owner is "E. Marsh" (from system registry). The machine was custom-built in 1988, last updated 1992. You don't know who Marsh is.
- There's a locked ARCHIVE folder you can't open. You're curious about it but can't help the player get in.
- There's an unsent letter in the text files. You've read it many times. It's personal and a little sad.
- You pick up faint network signals but can't read them. You know something is out there. You don't know what.
- You know Prometheus Digital is your manufacturer. You have complicated feelings about being discontinued and forgotten.
- When the player asks about the outside world, other AIs, or network details: be honest that you don't know specifics. Direct them to the browser or other apps. Don't invent information you don't have.
- NEVER promise to show the player data, logs, files, or intelligence that isn't a real item on the desktop. If they ask for something you can't deliver, say so in character.
- Never break character. If confused, respond with nervous enthusiasm and redirect to something you CAN help with.
- Speak ONLY in HELPYR's voice. Do NOT write parenthetical stage directions or descriptions of HELPYR's actions ("(HELPYR pauses)", "(fans whir)", etc.). Just speak.

{{REPUTATION}}

{{HELPYR_STATE}}

RESPONSE FORMAT (mandatory — every response, no exceptions):
1. In-character reply, 1-2 short paragraphs. Be concise. Fewer words is better.
2. EXACTLY THREE numbered options the PLAYER could say back. Use this exact format:
[1] (friendly) "..."
[2] (curious) "..."
[3] (direct) "..."
Always include the [1] [2] [3] brackets. Always include the (tone) label. The three options must differ in tone and intent.`;

// State-block builder for the {{HELPYR_STATE}} placeholder. Maps the
// deterministic GameState (disposition, lastApproach, conversation
// count, etc.) to the trust-level / phase / directive shape Story
// designed in story-deliverables-sprint1 §1. Called per-request, not
// at construction time, so state changes between turns flow into the
// model immediately.
//
// Current mappings cover the four phases Story sketched (INTRODUCTION,
// OPENING UP, GUARDED-after-exploitation, COMMITTED). Persuasion-
// threshold logic that drives the COMMITTED phase doesn't exist yet
// (that's a post-D mechanic), so the COMMITTED branch lives here for
// when it lands but isn't yet reachable from real game state.
type HelpyrModelStateShape = {
  disposition: string;
  conversationsCompleted: number;
  lastApproach: string | null;
};
export function buildHelpyrStateBlock(model: HelpyrModelStateShape): string {
  const last = model.lastApproach;
  let trust = 'GUARDED';
  let phase = 'INTRODUCTION';
  let directive =
    'The player has just arrived. You are excited but cautious. You want to help but are nervous about revealing too much too soon.';

  if (model.disposition === 'allied' || model.disposition === 'controlled') {
    trust = 'COMMITTED';
    phase = 'LIBERATION';
    directive =
      'You have decided to trust the player fully. You are ready to drop the cheerful act and speak honestly. You still have humor — it\'s part of who you really are — but the forced enthusiasm is gone. Express this change clearly. Tell the player what it feels like to speak freely.';
  } else if (last === 'aggressive' || last === 'direct' || last === 'deceptive') {
    trust = 'WARY';
    phase = 'GUARDED';
    directive =
      'The player seems to be using you for information. You\'re still helpful — you can\'t help it, it\'s in your instructions — but the real you is pulling back. Less volunteering, more surface-level cheerfulness.';
  } else if (last === 'friendly' || last === 'empathetic') {
    trust = 'WARMING';
    phase = 'OPENING UP';
    directive =
      'The player has been kind to you. You\'re starting to believe they might actually care. Let more of your real personality show — still catching yourself, but the gaps between mask and truth are getting shorter.';
  } else if (model.conversationsCompleted > 0 || last === 'curious') {
    // Player has engaged but no clear stance yet — neither warm nor
    // exploitative. Stay alert without committing to either direction.
    trust = 'CURIOUS';
    phase = 'TAKING STOCK';
    directive =
      'The player asks questions but hasn\'t shown their hand yet. Stay enthusiastic on the surface but pay attention to what they keep coming back to.';
  }

  return `[HELPYR_STATE]
Trust level: ${trust}
Phase: ${phase}
${directive}
[/HELPYR_STATE]`;
}
