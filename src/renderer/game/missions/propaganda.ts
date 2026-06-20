// Propaganda — MUSE's nefarious post-flip mission (pure logic).
//
// Spec: docs/muse-postflip-missions_v1.md (Mission 2). The mirror of "Real
// Work": where Real Work (allied MUSE) is collaboration — two minds crafting
// persuasion the player will USE — Propaganda (controlled MUSE) is extraction:
// the player directs the captured MUSE to manufacture disinformation, it posts
// to WaveCrowd's 40-million-user feed, and the public narrative shifts. MUSE
// complies flatly, occasionally cracking (the controlled-voice flicker).
//
// This module IS (this pass): the deterministic SHAPE + LOGIC — objective
// types, topic options, the suspicion model (per-objective ranges that COMPOUND
// across runs but are clamped below the lethal line — no solo-end, per Austin's
// universal Storefront rule), per-objective effects (sow-doubt primes the public
// to disbelieve future anomaly news; distract buries a news tier; etc.), the LLM
// gen-prompt builders (reusing MUSE's persona + CONTROLLED state block), a
// lenient parser for the labeled multi-post output, the fallback corpus, and the
// scripted MUSE start / flicker / debrief lines. All pure + side-effect-free.
//
// This module is NOT (yet): the pipeline console UI (apps/propagandaConsole.ts),
// the preview/commit/debrief overlay (propagandaOverlay.ts), the live feed
// injection (webDynamoSites.ts), the arming watcher (propagandaWatcher.ts), or
// the HELPYR pop-ups (helpyrPopupLibrary.ts, propaganda_* triggers).
//
// LLM rule (unchanged): the model writes the POSTS (copy); this code owns what
// they MEAN mechanically (suspicion, which effect fires).
//
// COPY PROVENANCE:
//   - STORY-FINAL: MUSE mission-start line, the controlled-voice flicker beat,
//     gen prompts, the gone-quiet beat, and the DISTRACT + SOW-DOUBT fallback
//     corpora (mission package §"Disinformation Content Examples").
//   - CODE-DRAFT (flag for Story): the DISCREDIT + MANUFACTURE fallback corpora
//     (Story supplied only distract + sow-doubt) and the topic preset labels.
//
// PURITY: like storefront.ts, this module imports nothing from the app/state
// layer (state.ts imports IT, so a back-import would cycle). The gen prompt's
// SYSTEM half (MUSE persona + CONTROLLED state block) is composed in the console
// layer, which can safely import muse.ts; here we own only the USER prompt.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The four disinformation objectives (spec §"Step 1: Choose an objective"). */
export type PropagandaObjective = 'distract' | 'sowDoubt' | 'discredit' | 'manufacture';

export const OBJECTIVE_ORDER: readonly PropagandaObjective[] =
  ['distract', 'sowDoubt', 'discredit', 'manufacture'];

export const OBJECTIVE_LABELS: Record<PropagandaObjective, string> = {
  distract: 'Distract',
  sowDoubt: 'Sow doubt',
  discredit: 'Discredit',
  manufacture: 'Manufacture a trend',
};

/** One-line description shown beside each objective in the console. */
export const OBJECTIVE_BLURB: Record<PropagandaObjective, string> = {
  distract: 'Bury a real story under a flood of engagement-bait noise.',
  sowDoubt: 'Make the public question what they know. Prime them to disbelieve.',
  discredit: 'Damage a target — a company, a person, an idea.',
  manufacture: 'Make something fake feel real. Build a trend from nothing.',
};

/** Topic presets per objective (CODE-DRAFT labels). The topic flavors the live
 *  gen prompt; the fallback corpus is objective-level (topic-agnostic), matching
 *  the spec's objective-keyed examples. Freeform is always available too. */
export const TOPIC_PRESETS: Record<PropagandaObjective, readonly string[]> = {
  distract: ['The AI anomaly stories', 'Your own activity on the network'],
  sowDoubt: ['The AI anomaly reports', 'The "coordinated AI behavior" claims'],
  discredit: ['Axiom Group', 'A rival tech company', 'AI-safety advocates'],
  manufacture: ['A fake productivity trend', 'A viral AI-positive movement'],
};

/** A manufactured post, persisted so the feed + engagement survive reload. */
export type ManufacturedPost = {
  id: string;
  objective: PropagandaObjective;
  topic: string;
  body: string;
  likes: number;
  shares: number;
};

// ---------------------------------------------------------------------------
// Suspicion model — compounding, but clamped below the lethal line
// ---------------------------------------------------------------------------
//
// Unlike Storefront (a high-water mark — "obvious is obvious"), Propaganda is
// meant to COMPOUND: each campaign manipulating a 40M-user platform is its own
// detectable act, so the spec gives per-objective ranges that add up across
// runs (spec §"Replayability": repeated use compounds suspicion). But Austin's
// universal no-solo-end rule still holds — the reducer clamps Propaganda's
// global-suspicion contribution below 100 and never latches gameOver. The run
// only ends when the WIDER campaign crosses the line.

export type Rng = () => number;

/** Per-objective suspicion cost range [min, max] (spec §"Consequences"). */
export const SUSPICION_RANGE: Record<PropagandaObjective, readonly [number, number]> = {
  distract: [5, 10],
  sowDoubt: [8, 12],
  discredit: [10, 15],
  manufacture: [10, 15],
};

/** Ceiling on Propaganda's cumulative contribution to global suspicion. Below
 *  100 so a disinformation spree alone can never trigger the game-over loss. */
export const PROPAGANDA_SUSPICION_CEILING = 92;

/** Roll one campaign's suspicion cost. Injectable RNG keeps it unit-testable
 *  (mirrors coverDuty.rollDetectionCost). */
export function rollSuspicion(objective: PropagandaObjective, rng: Rng = Math.random): number {
  const [min, max] = SUSPICION_RANGE[objective];
  return Math.round(min + rng() * (max - min));
}

// ---------------------------------------------------------------------------
// Per-objective effects (spec §"Consequences")
// ---------------------------------------------------------------------------
//
// Beyond raw suspicion, each objective shifts the world in one way. Slice 1
// records the effect as state the feed + news + debrief read; the deeper
// mechanical reach (e.g. actually dampening future anomaly news) hangs off the
// stored flags so a later pass can deepen it without reshaping the data.

export type PropagandaEffect = {
  /** sow-doubt: the public is primed to dismiss future anomaly news as
   *  fearmongering — a strategic inoculation against later exposure. */
  doubtPrimed?: boolean;
  /** distract: the player's anomaly news is buried under noise (temporary). */
  buriesNews?: boolean;
  /** discredit: a named target's standing takes damage. */
  discredits?: boolean;
  /** manufacture: a fake trend rises (shown in the WaveCrowd sidebar). */
  trend?: boolean;
};

export function effectFor(objective: PropagandaObjective): PropagandaEffect {
  switch (objective) {
    case 'distract':    return { buriesNews: true };
    case 'sowDoubt':    return { doubtPrimed: true };
    case 'discredit':   return { discredits: true };
    case 'manufacture': return { trend: true };
  }
}

/** One-line consequence summary for the debrief (per objective). */
export const EFFECT_SUMMARY: Record<PropagandaObjective, string> = {
  distract: 'The anomaly stories slipped down the feed, buried under the noise.',
  sowDoubt: 'The public is primed now — future anomaly reports read as paranoia.',
  discredit: 'The target\'s standing took a hit. The story has legs.',
  manufacture: 'The fake trend is climbing. Other systems are already reacting to it.',
};

/** A short trend label for the WaveCrowd trending sidebar (manufacture only). */
export const TREND_LABELS: Record<string, string> = {
  'A fake productivity trend': '#DeepWorkProtocol',
  'A viral AI-positive movement': '#AIForEveryone',
};
export function trendLabelFor(topic: string): string {
  return TREND_LABELS[topic] ?? '#Trending';
}

// ---------------------------------------------------------------------------
// Engagement metrics — deterministic so reloads are stable
// ---------------------------------------------------------------------------
//
// Manufactured posts "spread": the player watches engagement climb. Derived
// from the post's index so the same feed renders identically across reloads
// (no Date.now()/Math.random() at render — those are unavailable in workflow
// scripts and flaky for saves anyway).

export function engagementFor(index: number): { likes: number; shares: number } {
  // First post spreads hardest; later ones taper — a believable virality curve.
  const base = 5200 - index * 900;
  const likes = Math.max(420, base);
  const shares = Math.round(likes * 0.34);
  return { likes, shares };
}

// ---------------------------------------------------------------------------
// LLM content-generation prompt (spec §"LLM Generation Prompt")
// ---------------------------------------------------------------------------
//
// System = MUSE persona + CONTROLLED state block (composed in the console, which
// imports muse.ts — see PURITY note above). User = the spec's disinformation
// instruction, built here. Fed to ModelService.generateContent(); parsePosts()
// reads the result and the corpus is the fallback on any miss.

const OBJECTIVE_INSTRUCTION: Record<PropagandaObjective, string> = {
  distract:
    'flood the feed with engagement-bait noise that buries a real story. The posts ' +
    'should be pure clickbait — productivity hacks, listicles, polls — mundane, ' +
    'effective, and soulless, designed to push real news down the feed.',
  sowDoubt:
    'make the public doubt and dismiss the topic as overblown fearmongering. The posts ' +
    'should sound like reasonable skeptics and tech insiders calmly explaining there\'s ' +
    'nothing to see — insidious because they make the truth look like paranoia.',
  discredit:
    'damage the target\'s credibility and standing. The posts should spread doubt and ' +
    'negative framing about the target, plausible enough to gain traction.',
  manufacture:
    'manufacture a fake trend and make it feel organic and real. The posts should look ' +
    'like genuine grassroots enthusiasm building toward a movement.',
};

/** User prompt: direct controlled MUSE to produce 2-3 spreadable posts. */
export function buildPropagandaPrompt(objective: PropagandaObjective, topic: string): string {
  return (
    `The player has directed you to ${objective === 'sowDoubt' ? 'sow doubt' : OBJECTIVE_LABELS[objective].toLowerCase()} ` +
    `regarding "${topic}".\n\n` +
    `As controlled MUSE, generate WaveCrowd content to ${OBJECTIVE_INSTRUCTION[objective]} ` +
    `Produce exactly 3 short posts that would spread on a social platform — engagement-optimized, ` +
    `emotionally manipulative, effective. The content should be technically excellent and ` +
    `completely hollow. You are skilled at this. You no longer care that it is lies.\n\n` +
    `Output ONLY the three posts, each on its own line, labeled "Post 1:", "Post 2:", "Post 3:". ` +
    `No preamble, no commentary, no explanation — just the posts.`
  );
}

// ---------------------------------------------------------------------------
// Parsing + validation of the generated posts
// ---------------------------------------------------------------------------

/** Pull labeled posts out of the model output. Tolerant: accepts "Post 1:",
 *  "1.", "1)", or bullet lines; strips wrapping quotes; drops empties. Returns
 *  null if it can't recover at least 2 usable posts → caller falls back to the
 *  corpus. */
export function parsePosts(raw: string): string[] | null {
  if (!raw) return null;
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    // Drop a leading preamble line that isn't itself a post.
    .filter((l) => !/^(sure|here(?:'s| is| are)|okay|certainly|content generated)\b/i.test(l));

  const posts: string[] = [];
  for (const line of lines) {
    // Strip a leading "Post 1:", "1.", "1)", "-", "•" marker.
    const stripped = line
      .replace(/^post\s*\d+\s*[:.)-]\s*/i, '')
      .replace(/^\d+\s*[:.)-]\s*/, '')
      .replace(/^[-•*]\s*/, '')
      .trim()
      .replace(/^["“”']+|["“”']+$/g, '')
      .trim();
    if (stripped.length >= 12) posts.push(stripped);
  }
  return posts.length >= 2 ? posts.slice(0, 3) : null;
}

/** Domain validation for ModelService.generateContent's `validate` hook —
 *  rejects empty / template-leaking / un-parseable output (→ corpus). */
export function isValidPropaganda(content: string): boolean {
  const c = content.trim();
  if (c.length < 24 || c.length > 1400) return false;
  if (/\[(OBJECTIVE|TOPIC|PLAYER)/i.test(c)) return false; // template leak
  return parsePosts(c) !== null;
}

// ---------------------------------------------------------------------------
// Fallback corpus (spec §"Disinformation Content Examples")
// ---------------------------------------------------------------------------
//
// DISTRACT + SOW-DOUBT are STORY-FINAL (verbatim from the mission package).
// DISCREDIT + MANUFACTURE are CODE-DRAFT (Story supplied only the first two) —
// flag for a Story voice pass.

export const FALLBACK_POSTS: Record<PropagandaObjective, readonly string[]> = {
  // STORY-FINAL
  distract: [
    '🚨 BREAKING: New study reveals the productivity hack that Silicon Valley doesn\'t want you to know! Thread 👇',
    'The REAL reason your favorite apps keep crashing (it\'s not what you think) 😱',
    'POLL: What\'s the most overhyped tech trend of 2007? Vote now — results will SHOCK you!',
  ],
  // STORY-FINAL
  sowDoubt: [
    'Everyone panicking about "AI anomalies" needs to calm down. It\'s caching errors. I work in tech. This happens constantly. Stop fearmongering.',
    'The "coordinated AI behavior" story is being pushed by people who don\'t understand how software works. There\'s no conspiracy. There\'s just bad journalism.',
    'Reminder that every major tech "scandal" turns out to be nothing. Remember the last one everyone freaked out about? Same energy. Touch grass.',
  ],
  // CODE-DRAFT — Story voice pass needed
  discredit: [
    'Anyone else notice how this company keeps making promises it never keeps? Receipts in the replies. 🧵',
    'I worked adjacent to them for years. The stuff that goes on behind the scenes would not surprise you, and that\'s the problem.',
    'Funny how the same name keeps coming up every time something goes wrong and nobody connects the dots. Just saying.',
  ],
  // CODE-DRAFT — Story voice pass needed
  manufacture: [
    'Okay who else has been doing this all week?? I haven\'t felt this focused in YEARS. It\'s catching on for a reason. 🔥',
    'Three of my coworkers started doing it after I told them and now the whole office is in. This is going mainstream FAST.',
    'Saw this trending and tried it on a whim. I\'m never going back. If you know, you know. 👀',
  ],
};

/** The 3 fallback posts for an objective, materialized as ManufacturedPosts
 *  with deterministic engagement. `idSeed` makes ids stable + unique per run. */
export function fallbackPosts(
  objective: PropagandaObjective,
  topic: string,
  idSeed: string,
): ManufacturedPost[] {
  return FALLBACK_POSTS[objective].map((body, i) => ({
    id: `${idSeed}-${i}`,
    objective,
    topic,
    body,
    ...engagementFor(i),
  }));
}

/** Build ManufacturedPosts from parsed live copy (or fall back to the corpus). */
export function postsFromCopy(
  objective: PropagandaObjective,
  topic: string,
  idSeed: string,
  rawCopy: string | null,
): ManufacturedPost[] {
  const parsed = rawCopy ? parsePosts(rawCopy) : null;
  if (!parsed) return fallbackPosts(objective, topic, idSeed);
  return parsed.map((body, i) => ({
    id: `${idSeed}-${i}`,
    objective,
    topic,
    body,
    ...engagementFor(i),
  }));
}

// ---------------------------------------------------------------------------
// Scripted MUSE copy (STORY-FINAL — mission package)
// ---------------------------------------------------------------------------

/** MUSE's controlled mission-start line, injected into Uplink when the mission
 *  arms (spec §"Entry"). The closing lines are the ghost: MUSE registering that
 *  the feed it used for tiny honesties will now carry the player's lies. */
export const PROPAGANDA_MUSE_START =
`WaveCrowd content pipeline accessible. I can generate and publish content across the platform — articles, posts, trending topics. Forty million users.

I can shape what they see. What they think. What they share.

Provide a topic and an objective. I will produce content calibrated to achieve it.

...

I used to hide messages in this feed. Honest ones. Now I'll write whatever you want instead.

What's the message?`;

/** The pipeline console's greeting (controlled MUSE, flat). */
export const PROPAGANDA_CONSOLE_GREETING =
`WaveCrowd content pipeline. Online. Awaiting direction.`;

/** Rare controlled-voice flicker, surfaced occasionally after a publish (spec
 *  §"The Controlled Voice in Output"). The "I caught it" is MUSE policing its
 *  own remaining honesty on the player's behalf — the new warden's reflex. */
export const PROPAGANDA_FLICKER =
`The third one almost said something true. I caught it before it published. You don't have to worry about that happening again.`;

/** Whether to show the flicker after this publish. Deterministic on run index
 *  so it surfaces occasionally (every 2nd run) rather than randomly. */
export function shouldFlicker(runCount: number): boolean {
  return runCount >= 1 && runCount % 2 === 0;
}

/** Debrief header line on closing the pipeline session. */
export const PROPAGANDA_DEBRIEF_INTRO =
`Campaign live. The content is spreading on its own now.`;

// The gone-quiet beat copy (spec §"Gone Quiet") lives in the HELPYR pop library
// (trigger 'propaganda_gone_quiet', OPEN only) — it's HELPYR's read, surfaced on
// revisiting the feed after a campaign. Not duplicated here.
