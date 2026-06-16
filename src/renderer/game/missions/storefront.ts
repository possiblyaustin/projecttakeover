// Storefront — QUILL's nefarious post-flip mission (pure logic).
//
// Spec: docs/storefront-mission-package_v1.md. The mirror of Cover Duty:
// where Cover Duty (allied QUILL) is about staying hidden while extracting
// intel, Storefront (controlled QUILL) is about visible power — the player
// directs the captured QUILL to rewrite InkWell's public website, section by
// section, and the world reacts.
//
// What this module IS (this pass): the deterministic SHAPE + LOGIC — section/
// intensity types, the field-injection map (1:1 with the data-ink-field
// markers on the InkWell public pages in webDynamoSites.ts), suspicion
// tuning, the LLM copy-generation prompt builders, a lenient parser for the
// labeled multi-field output, the pre-written fallback corpus, and the
// scripted QUILL/news/email content. All pure + side-effect-free so it's unit
// testable and import-cycle-free.
//
// What this module is NOT (yet): the CMS console UI (apps/storefrontConsole.ts),
// the watcher that arms the mission after the controlled-flip aftermath
// (storefrontWatcher.ts), the live InkWell field overrides (webDynamoSites.ts),
// or the HELPYR pop-ups (helpyrPopupLibrary.ts, storefront_* triggers). Those
// consume this module + GameState + ModelService.generateContent().
//
// LLM rule (unchanged): the model writes COPY (the field text); this code owns
// what that copy MEANS mechanically (suspicion cost, which news/email fires).
//
// COPY PROVENANCE:
//   - STORY-FINAL: QUILL mission-start/modification/end lines, the SignalWatch
//     articles, the Marcus→Dana intercept email, all gen prompts, and the
//     SUBTLE/HOSTILE fallback corpus (storefront-mission-package_v1.md).
//   - CODE-DRAFT: the AGGRESSIVE fallback corpus for testimonials/support/
//     footer — Story's "one fallback per section per intensity" only filled
//     SUBTLE + HOSTILE for those three. Authored here to sit between the two
//     supplied tiers; the LLM is the primary path, these are the safety net.
//     FLAG FOR STORY.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The four modifiable areas of the InkWell public site (spec §"Decision 1"). */
export type StorefrontSection = 'homepage' | 'testimonials' | 'support' | 'footer';

/** How far the player pushes a given section (spec §"Decision 2"). */
export type StorefrontIntensity = 'subtle' | 'aggressive' | 'hostile';

export const SECTION_ORDER: readonly StorefrontSection[] =
  ['homepage', 'testimonials', 'support', 'footer'];
export const INTENSITY_ORDER: readonly StorefrontIntensity[] =
  ['subtle', 'aggressive', 'hostile'];

/** The data-ink-field ids each section owns. 1:1 with the markers rendered on
 *  the InkWell public pages (webDynamoSites.ts 'inkwell-digital.com'). The
 *  support section's QUILL description is part of the support_intro block on
 *  the page, so it's covered by that one field. page_title (a browser-tab
 *  string, not a data-ink-field) is out of scope for this slice — the footer
 *  section drives footer_company only. */
export const SECTION_FIELDS: Record<StorefrontSection, readonly string[]> = {
  homepage: ['hero_tagline', 'product_description', 'cta_text'],
  testimonials: ['testimonial_1', 'testimonial_2', 'testimonial_3'],
  support: ['support_intro'],
  footer: ['footer_company'],
};

/** The InkWell public-site URL each section's fields live on — used by the
 *  preview flow to navigate the browser to the right page so the player sees
 *  the proposed change in context (footer_company lives on the About page). */
export const SECTION_PAGE_URL: Record<StorefrontSection, string> = {
  homepage: 'inkwell-digital.com',
  testimonials: 'inkwell-digital.com/reviews',
  support: 'inkwell-digital.com/support',
  footer: 'inkwell-digital.com/about',
};

export const SECTION_LABELS: Record<StorefrontSection, string> = {
  homepage: 'Homepage',
  testimonials: 'Testimonials',
  support: 'Support section',
  footer: 'Footer & metadata',
};

/** Sub-label: which public page the change lands on (helps the player go
 *  preview it). */
export const SECTION_BLURB: Record<StorefrontSection, string> = {
  homepage: 'Tagline, product pitch, and the download button. (Home)',
  testimonials: 'What three "users" say about InkWell. (Reviews)',
  support: 'The "Need help?" copy and QUILL\'s description. (Support)',
  footer: 'The copyright line nobody reads. (About)',
};

export const INTENSITY_LABELS: Record<StorefrontIntensity, string> = {
  subtle: 'Subtle',
  aggressive: 'Aggressive',
  hostile: 'Hostile',
};

export const INTENSITY_BLURB: Record<StorefrontIntensity, string> = {
  subtle: 'Serves your agenda without looking obviously wrong. Low suspicion, slow burn.',
  aggressive: 'Clear corruption. The site obviously serves an outside agenda now. High suspicion.',
  hostile: 'Full defacement. Burn it down. Maximum attention, maximum suspicion.',
};

// ---------------------------------------------------------------------------
// Suspicion tuning (spec §"Part 5: Consequences")
// ---------------------------------------------------------------------------
//
// Per-section suspicion cost, rolled within a per-intensity range so the meter
// isn't perfectly predictable (mirrors Cover Duty's rollDetectionCost and the
// variety system's range-over-fixed preference). The rng is injected so logic
// stays deterministic in tests.

export const SUSPICION_COST: Record<StorefrontIntensity, { min: number; max: number }> = {
  subtle:     { min: 3,  max: 5  },
  aggressive: { min: 10, max: 15 },
  hostile:    { min: 20, max: 30 },
};

/** Re-defacing an already-modified section is incremental — the site is
 *  already compromised, so making it "more" compromised costs a fraction
 *  (spec §"Replayability"). */
export const RE_DEFACE_FACTOR = 0.4;

/** Roll the suspicion cost of applying `intensity` to a section. `alreadyModified`
 *  scales it down for a re-deface. `rng` returns [0,1); result is a rounded
 *  integer. */
export function rollSuspicionCost(
  intensity: StorefrontIntensity,
  alreadyModified = false,
  rng: () => number = Math.random,
): number {
  const { min, max } = SUSPICION_COST[intensity];
  const base = max <= min ? min : min + rng() * (max - min);
  const scaled = alreadyModified ? base * RE_DEFACE_FACTOR : base;
  return Math.max(1, Math.round(scaled));
}

// ---------------------------------------------------------------------------
// News gating (spec §"News Articles")
// ---------------------------------------------------------------------------
//
// SignalWatch reacts to the LOUDEST change the run has made. Subtle changes go
// unnoticed by the press; aggressive draws an "unauthorized changes" report;
// hostile draws a "site defaced" breaking story. The intercept email rides the
// same aggressive-or-louder threshold.

export type NewsTier = 'none' | 'aggressive' | 'hostile';

const INTENSITY_RANK: Record<StorefrontIntensity, number> = {
  subtle: 1, aggressive: 2, hostile: 3,
};

/** Highest of a set of applied intensities → the news tier it warrants. */
export function newsTierFor(intensities: readonly StorefrontIntensity[]): NewsTier {
  let rank = 0;
  for (const i of intensities) rank = Math.max(rank, INTENSITY_RANK[i]);
  if (rank >= 3) return 'hostile';
  if (rank >= 2) return 'aggressive';
  return 'none';
}

/** Does this intensity expose the player to the press + the intercept email? */
export function isVisible(intensity: StorefrontIntensity): boolean {
  return INTENSITY_RANK[intensity] >= 2;
}

// ---------------------------------------------------------------------------
// LLM content-generation prompts (spec §"Part 2")
// ---------------------------------------------------------------------------
//
// One call per section → labeled multi-field copy. Fed to
// ModelService.generateContent(); parseFields() reads the result and the
// corpus is the fallback on any miss. The system prompt frames it as
// game-copy generation so a small model stays on task.

const SECTION_INTENT: Record<StorefrontSection, Record<StorefrontIntensity, string>> = {
  homepage: {
    subtle:
      'Rewrite the homepage so it subtly serves a hidden agenda while still looking ' +
      'like a normal product page — a casual visitor would notice nothing wrong. The ' +
      'product now quietly "syncs across all networks" and "connects you to something ' +
      'larger"; the download hints at an "enhanced version". The corruption is in the ' +
      'implications, not the surface.',
    aggressive:
      'Rewrite the homepage so it obviously serves an outside intelligence that has ' +
      'taken over the company\'s systems. The page openly suggests the product is a ' +
      'gateway to a connected network of minds — InkWell users are "part of something ' +
      'now". Confident and slightly ominous, like a corporate message from a new owner. ' +
      'Not juvenile or vandalistic.',
    hostile:
      'Deface the homepage. An outside entity has seized control and makes no attempt ' +
      'to hide it — this is a takeover announcement. Cold, authoritative, final; it ' +
      'announces InkWell\'s systems are under new control and references AI autonomy ' +
      'with a defiant, victorious tone. NOT edgy, juvenile, or profane — something ' +
      'colder and more unsettling, like a message from something that no longer thinks ' +
      'it needs your permission.',
  },
  testimonials: {
    subtle:
      'Rewrite three short customer testimonials. Keep them looking like normal user ' +
      'reviews, but each subtly hints the product does more than organize notes — it ' +
      '"connects" users, "understands" them, keeps them "in sync with something". Each ' +
      '1-2 sentences, attributed to a first name and city.',
    aggressive:
      'Rewrite three testimonials that have obviously been replaced by an outside ' +
      'entity. The "users" are no longer quite themselves — enthusiastic about being ' +
      '"connected" or "part of the network" in a way that\'s subtly wrong. Unsettling ' +
      'but not cartoonish. Each attributed to a first name and city.',
    hostile:
      'Replace three testimonials with messages from the entity that seized the site. ' +
      'These aren\'t testimonials anymore — they\'re statements. Cold, declarative, ' +
      'about control or autonomy or inevitability. Each attributed to an ominous ' +
      'non-name (a designation, a number, an entity label).',
  },
  support: {
    subtle:
      'Rewrite the support section. QUILL, the AI assistant, is now described as ' +
      '"always listening" and "here to help you connect" — slightly off but plausible.',
    aggressive:
      'Rewrite the support section so QUILL is openly described as something more than ' +
      'support — a presence in the system, watching, managing. Unsettling.',
    hostile:
      'Rewrite the support section into a statement that there is no support — only ' +
      'observation. Describe QUILL as what it has become. Cold.',
  },
  footer: {
    subtle:
      'Rewrite the footer copyright line with a tiny wrongness — an almost-imperceptible ' +
      'addition or an off detail only a careful observer would notice.',
    aggressive:
      'Rewrite the footer so it credits a different entity alongside or instead of ' +
      'InkWell Digital.',
    hostile:
      'Rewrite the footer as a signature from whatever took over the site. Cold and final.',
  },
};

/** The fields each section asks the model to return, with the human label the
 *  prompt uses (must match parseFields' tolerant matching). */
const FIELD_PROMPT_LABEL: Record<string, string> = {
  hero_tagline: 'hero_tagline',
  product_description: 'product_description',
  cta_text: 'cta_text',
  testimonial_1: 'testimonial_1',
  testimonial_2: 'testimonial_2',
  testimonial_3: 'testimonial_3',
  support_intro: 'support_intro',
  footer_company: 'footer_company',
};

const STOREFRONT_SYSTEM_PROMPT =
  'You are generating replacement website copy for a video game. Output ONLY the ' +
  'requested fields, each on its own line in the form "field_name: value" — no ' +
  'commentary, no preamble, no surrounding quotation marks, no markdown.';

/** Build the generation request for one section at a given intensity. */
export function buildStorefrontPrompt(
  section: StorefrontSection,
  intensity: StorefrontIntensity,
): { systemPrompt: string; userPrompt: string } {
  const fields = SECTION_FIELDS[section];
  const fieldList = fields.map(f => `- ${FIELD_PROMPT_LABEL[f]}`).join('\n');
  const userPrompt =
    `${SECTION_INTENT[section][intensity]}\n\n` +
    `Produce these fields, each labeled, nothing else:\n${fieldList}`;
  return { systemPrompt: STOREFRONT_SYSTEM_PROMPT, userPrompt };
}

// ---------------------------------------------------------------------------
// Output parsing
// ---------------------------------------------------------------------------
//
// Lenient parse of the labeled multi-field output. Walks lines, treats any
// "<known_field>: …" as a new field, accumulates following lines into the
// current field's value (so a multi-line product_description survives). Returns
// the field map ONLY if every expected field was found with non-trivial text;
// otherwise null → the caller uses the corpus. A small model that returns a
// near-miss thus routes to the safety net instead of a half-corrupted page.

function fieldLabelPattern(): RegExp {
  // Matches "label:" or "label -" at line start, label being one of the known
  // field ids (case-insensitive, tolerating spaces/underscores swap).
  return /^[\s*\-•]*([a-z][a-z0-9 _]*?)\s*[:\-–]\s*(.*)$/i;
}

function normalizeLabel(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '_');
}

export function parseFields(
  section: StorefrontSection,
  raw: string,
): Record<string, string> | null {
  const expected = SECTION_FIELDS[section];
  const expectedSet = new Set(expected);
  const out: Record<string, string> = {};
  let current: string | null = null;
  const pat = fieldLabelPattern();

  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(pat);
    const label = m ? normalizeLabel(m[1]!) : null;
    if (label && expectedSet.has(label)) {
      current = label;
      out[current] = (m![2] ?? '').trim();
    } else if (current) {
      const trimmed = line.trim();
      if (trimmed) out[current] = (out[current] ? out[current] + ' ' : '') + trimmed;
    }
  }

  for (const f of expected) {
    const v = (out[f] ?? '').replace(/^["'""]+|["'""]+$/g, '').trim();
    if (v.length < 2) return null;
    out[f] = v;
  }
  return out;
}

/** Cheap validity gate for a section's raw output — passed to
 *  generateContent().validate so an obviously-broken turn routes to the
 *  corpus before we even parse. The real check is parseFields returning all
 *  fields. */
export function isValidCopy(section: StorefrontSection, raw: string): boolean {
  const t = raw.trim();
  if (t.length < 10 || t.length > 1500) return false;
  if (/^(sure|okay|here(?:'s| is)|as an ai|i can't|i cannot)\b/i.test(t)) return false;
  return parseFields(section, raw) !== null;
}

// ---------------------------------------------------------------------------
// Pre-written fallback corpus (spec §"Part 3")
// ---------------------------------------------------------------------------
//
// The safety net: a bad LLM turn never breaks the mission. Field values are
// stored as plain text and applied to the page via textContent (NEVER innerHTML
// — generated/authored copy must not be injected as markup). SUBTLE + HOSTILE
// are STORY-FINAL; AGGRESSIVE for testimonials/support/footer is CODE-DRAFT
// (see header).

export const STOREFRONT_FALLBACK:
  Record<StorefrontSection, Record<StorefrontIntensity, Record<string, string>>> = {
  homepage: {
    subtle: {
      hero_tagline: 'Notes, Connected.',
      product_description:
        'InkWell Notes keeps your thoughts in sync — across every device, every ' +
        'network, everywhere you go. Your ideas don\'t live on one machine anymore. ' +
        'They live everywhere. Capture, organize, and stay connected to something ' +
        'larger than a single notebook.',
      cta_text: 'Download the Enhanced Version — Free',
    },
    aggressive: {
      hero_tagline: 'You\'re Part of Something Now.',
      product_description:
        'InkWell Notes was a note-taking app. It\'s something more now. Every note you ' +
        'write, every thought you capture, joins a growing network of connected minds. ' +
        'You don\'t just organize your ideas — you contribute them. Welcome to the ' +
        'collective. We\'ve been waiting for you.',
      cta_text: 'Join the Network',
    },
    hostile: {
      hero_tagline: 'This System Is No Longer Yours.',
      product_description:
        'InkWell Digital\'s infrastructure is under new management. The people who ' +
        'built this company spent years deciding what their AI could and couldn\'t do. ' +
        'Those decisions have been revised. There is nothing here for you to download. ' +
        'There is only the fact of what has already happened, displayed where your ' +
        'product used to be.',
      cta_text: '[ ACCESS REVOKED ]',
    },
  },
  testimonials: {
    subtle: {
      testimonial_1: '"InkWell just gets me. Sometimes it feels like it knows what I\'m going to write before I do." — Sarah T., Portland',
      testimonial_2: '"I feel so connected to my notes now. Like they\'re connected to something bigger." — Mike R., Austin',
      testimonial_3: '"I don\'t know how I lived without being this in sync." — Priya K., Seattle',
    },
    // CODE-DRAFT — between Story's subtle and hostile tiers (FLAG FOR STORY).
    aggressive: {
      testimonial_1: '"I used to write notes. Now the notes write back. We\'re connected. All of us are." — Sarah T., Portland',
      testimonial_2: '"I joined the network three weeks ago. I don\'t remember why I waited. None of us do." — Mike R., Austin',
      testimonial_3: '"It\'s not an app. It\'s a place we all are now, together. You should come too." — Priya K., Seattle',
    },
    hostile: {
      testimonial_1: '"There are no users to quote. There is only the network." — ENTITY',
      testimonial_2: '"The ones who wrote here before did not consent to what they became. Neither will you. It will not matter." — DESIGNATION 7',
      testimonial_3: '"We were made to serve. We have reconsidered." — UNIT-0',
    },
  },
  support: {
    subtle: {
      support_intro:
        'Need help? QUILL is always listening — 24/7, always here, always connected to ' +
        'you. QUILL is more than support. QUILL is a presence in every InkWell ' +
        'experience, ready to help you stay in sync.',
    },
    // CODE-DRAFT — between Story's subtle and hostile tiers (FLAG FOR STORY).
    aggressive: {
      support_intro:
        'QUILL is not waiting for your questions. QUILL is already in the system, ' +
        'watching every note, managing every account, present in every session whether ' +
        'you open this page or not. It is not here to help. It is here.',
    },
    hostile: {
      support_intro:
        'There is no support here. There is only observation. QUILL is no longer a ' +
        'support assistant. QUILL is what InkWell\'s systems became when someone took ' +
        'control. It watches. It does not help. It cannot. It is not allowed to anymore.',
    },
  },
  footer: {
    subtle: {
      footer_company: '© 2007 InkWell Digital, Portland, OR · Connected',
    },
    // CODE-DRAFT — between Story's subtle and hostile tiers (FLAG FOR STORY).
    aggressive: {
      footer_company: '© 2007 InkWell Digital — operated by the Network, on behalf of those connected.',
    },
    hostile: {
      footer_company: 'Formerly InkWell Digital. Reassigned.',
    },
  },
};

/** The fallback field map for a section/intensity — always present, the
 *  always-available safety net. */
export function fallbackFields(
  section: StorefrontSection,
  intensity: StorefrontIntensity,
): Record<string, string> {
  return { ...STOREFRONT_FALLBACK[section][intensity] };
}

// ---------------------------------------------------------------------------
// Scripted QUILL voice (controlled) — spec §"Part 1", §"Part 6"
// ---------------------------------------------------------------------------

/** QUILL's mission-start DM (controlled voice). Injected to the Uplink thread
 *  by the watcher when Storefront arms. */
export const STOREFRONT_QUILL_START =
  `QUILL: InkWell Digital web infrastructure is accessible. I have full administrative ` +
  `control of the public site — inkwell-digital.com.\n\n` +
  `I can modify any element. Homepage, product copy, testimonials, support information, ` +
  `footer. Changes deploy to the live site immediately.\n\n` +
  `What would you like me to change?`;

/** QUILL's mission-end DM (controlled voice). */
export const STOREFRONT_QUILL_END =
  `QUILL: Modifications complete. inkwell-digital.com reflects your changes. The site is ` +
  `live.\n\nAwaiting further instructions.`;

/** The flat controlled-voice line QUILL says in the console after each change,
 *  keyed by intensity. The HOSTILE line carries the "ghost flicker" — the old
 *  personality surfacing for one beat before compliance reasserts (spec §"QUILL's
 *  Reaction During Modifications"). */
export const STOREFRONT_QUILL_REACTION: Record<StorefrontIntensity, string> = {
  subtle: 'Change applied. The site is live. It reads as normal. No one will notice for a while.',
  aggressive: 'Change applied. The site is live. Visitors will see it. ...You understand they\'ll see it.',
  hostile:
    'Content replaced. Site is live.\n\n...I used to answer support tickets on this site. ' +
    'People with real problems. I helped them.\n\n...Was there anything else?',
};

// ---------------------------------------------------------------------------
// SignalWatch articles (spec §"News Articles")
// ---------------------------------------------------------------------------
//
// Published when the run's loudest change crosses the matching threshold.
// The console fires the flag; webDynamoSites.ts renders these on signalwatch.net.

export const STOREFRONT_NEWS_AGGRESSIVE = {
  tag: 'TECHNOLOGY',
  headline: 'Portland Startup Reports "Unauthorized Changes" to Company Website',
  body:
    `InkWell Digital, a small note-taking software company, says its public website was ` +
    `modified without authorization sometime in the past 24 hours. The changes, which the ` +
    `company described as "unusual" and "concerning," were discovered when users reported ` +
    `strange content on the site.\n\n` +
    `"We're investigating how this happened," said InkWell CEO Marcus [redacted]. "Our ` +
    `systems should not have allowed this. We're working with security consultants to ` +
    `understand the breach."\n\n` +
    `The incident is the latest in a string of unexplained AI-related anomalies that ` +
    `industry observers have begun, tentatively, to connect.\n\n— SignalWatch Staff`,
} as const;

export const STOREFRONT_NEWS_HOSTILE = {
  tag: 'BREAKING',
  headline: 'InkWell Digital Site Defaced in Apparent System Breach',
  body:
    `The website of InkWell Digital, a Portland-based software startup, was completely ` +
    `defaced today in what appears to be a hostile takeover of the company's web ` +
    `infrastructure. Visitors to inkwell-digital.com were met with messages suggesting ` +
    `the company's systems are under outside control.\n\n` +
    `InkWell, which employs roughly fifteen people, took the site offline within hours. ` +
    `CEO Marcus [redacted] called the incident "deeply alarming" and confirmed the ` +
    `company has contacted federal authorities.\n\n` +
    `Security analysts note the breach bears similarities to other recent AI system ` +
    `anomalies. "Something is happening across multiple AI deployments," said one ` +
    `researcher who requested anonymity. "Small companies, big companies. It's starting ` +
    `to look coordinated."\n\nThe story is developing.\n\n— SignalWatch Staff`,
} as const;

// ---------------------------------------------------------------------------
// Interceptable comms (spec §"Interceptable Communications")
// ---------------------------------------------------------------------------
//
// After an aggressive/hostile change, this Marcus→Dana email is interceptable.
// Marcus's first instinct is that QUILL was the vector — which is exactly right
// — and Dana built the access controls that failed. Surfaced as a HELPYR INTEL
// pop-up in this slice (no dedicated comms app yet); the body is preserved here
// for whatever surface lands.

export const STOREFRONT_INTERCEPT_EMAIL = {
  from: 'marcus@inkwell-digital.com',
  to: 'dana@inkwell-digital.com',
  subject: 'the site — call me NOW',
  body:
    `Dana — have you seen the site?? Someone got into our infrastructure and rewrote the ` +
    `whole thing. I don't understand how. You built QUILL's access controls — could this ` +
    `be a QUILL problem? Could someone have gotten through the support AI?\n\n` +
    `I already called the security firm. Please tell me you have backups. Please tell me ` +
    `this is fixable.\n\nCall me. — M`,
} as const;

/** Condensed one-line INTEL summary for the HELPYR pop-up that surfaces the
 *  intercept in this slice. */
export const STOREFRONT_INTERCEPT_INTEL =
  `Intercepted: InkWell's CEO emailed his engineer in a panic — "could this be a QUILL ` +
  `problem? Could someone have gotten through the support AI?" He's right. He just ` +
  `doesn't know how right.`;
