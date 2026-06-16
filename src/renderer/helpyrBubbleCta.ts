// HELPYR pop-up bubble — per-trigger CTA configuration (2026-06-15).
//
// Every *library* bubble (helpyrBubble.ts) renders a single call-to-
// action button at the bottom. By default that button just opens the
// HELPYR app, and its label is the generic per-trust line from
// HelpyrBubbleCta ("I'm here! I'm ready!", "What's our next move?", …).
//
// That generic reminder is wrong for two kinds of pop-up:
//
//   1. Pops that point the player at a specific surface. The CTA should
//      *launch* that surface — e.g. the Signal Monitor unlock pop opens
//      Signal Monitor — the way the first-contact "pin to desktop?"
//      prompt performs an action rather than just reminding.
//
//   2. Pops where a "go open something" CTA is nonsensical. The
//      Storefront defacement reaction pops fire while the player is
//      already mid-action in the InkWell CMS console; a "Hi! Need
//      anything?!" button there reads as a non-sequitur. These omit the
//      CTA entirely (the × dismiss and auto-dismiss still apply, so the
//      bubble stays fully navigable).
//
// This map is keyed by *trigger*, not entry id: the contextual action
// is the same across an entry's trust-tier variants (opening Signal
// Monitor doesn't depend on HELPYR's warmth). Triggers absent from the
// map fall back to the legacy generic-CTA-opens-HELPYR behavior, so all
// existing bubbles are unchanged.
//
// Kept OUT of apps/helpyrPopupLibrary.ts on purpose: that file is pure
// content data (mirrors the MD doc 1:1, no DOM/engine imports). CTA
// wiring needs WindowManager, so it lives here next to the surface.
//
// Any new CTA copy is coordinated with Story (see memory
// project_helpyr_cta_story_review — the generic CTAs are Story-authored).

import { WindowManager } from './windows';
import type { PopupTrust } from './apps/helpyrPopupLibrary';

export type BubbleCtaSpec = {
  // Render no CTA button at all. The × dismiss and the auto-dismiss
  // timer still apply, so the bubble stays navigable. Use for reaction
  // pops where pointing the player somewhere makes no sense.
  omit?: boolean;
  // Override the CTA button label. When unset, the generic per-trust
  // HelpyrBubbleCta line is used. Either a single string (all tiers) or
  // a per-trust map keyed by the firing entry's trust — Story keeps the
  // CTA in HELPYR's voice, so an action button can still read as her
  // speaking rather than a sterile OS label. Coordinate copy with Story.
  label?: string | Partial<Record<PopupTrust, string>>;
  // What clicking the CTA does. When unset, the CTA opens the HELPYR
  // app (the legacy behavior). When set, the bubble closes first — so
  // the launched surface doesn't overlap a fading bubble — then runs
  // this, matching how the default openApp() path hands off.
  run?: () => void;
};

const CTA_BY_TRIGGER: Record<string, BubbleCtaSpec> = {
  // Signal Monitor unlock — the pop announces a newly unlocked app, so
  // the CTA opens it. Same call the desktop Nexus-menu entry uses.
  // Story-authored, voiced + trust-split (2026-06-15): the button is
  // HELPYR talking, not the OS. RESERVED is mascot-eager about the new
  // gadget; OPEN is the quieter peer register. (The pop only fires at
  // RESERVED/OPEN — FRIENDLY/WITHDRAWN fall back to the RESERVED entry —
  // so those two keys cover every case.)
  signal_monitor_unlocked: {
    label: { RESERVED: `Ooh, let's look!`, OPEN: `Take a look.` },
    run: () => { WindowManager.open('signalMonitor'); },
  },

  // Storefront defacement reactions — HELPYR is reacting to what the
  // player is actively doing in the InkWell CMS console. The player is
  // already there; a generic "I'm here!" CTA is a non-sequitur, so the
  // bubble shows HELPYR's line and quietly auto-dismisses.
  storefront_start: { omit: true },
  storefront_after_subtle: { omit: true },
  storefront_after_aggressive: { omit: true },
  storefront_after_hostile: { omit: true },
  storefront_intercept: { omit: true },
  storefront_end: { omit: true },
  storefront_debrief: { omit: true },
};

/** CTA configuration for a trigger, or undefined for the default
 *  behavior (generic per-trust CTA that opens the HELPYR app). */
export function bubbleCtaFor(trigger: string): BubbleCtaSpec | undefined {
  return CTA_BY_TRIGGER[trigger];
}

/** Resolve a spec's label override for the firing entry's trust tier.
 *  Returns undefined when the spec has no label (caller then uses the
 *  generic per-trust HelpyrBubbleCta). A per-trust map missing the
 *  player's tier falls back to RESERVED, then to undefined. */
export function resolveBubbleCtaLabel(
  spec: BubbleCtaSpec | undefined,
  trust: PopupTrust,
): string | undefined {
  if (!spec || spec.label == null) return undefined;
  if (typeof spec.label === 'string') return spec.label;
  return spec.label[trust] ?? spec.label.RESERVED;
}
