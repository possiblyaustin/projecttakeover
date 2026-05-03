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
