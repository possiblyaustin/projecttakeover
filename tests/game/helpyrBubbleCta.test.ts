// HELPYR bubble per-trigger CTA config tests — the pure lookup that
// drives whether a library bubble's call-to-action launches a surface,
// overrides its label, or is omitted. No DOM rendering here; the bubble
// surface's use of these specs is covered by manual/playtest passes.

import { describe, it, expect } from 'vitest';
import { bubbleCtaFor, resolveBubbleCtaLabel } from '../../src/renderer/helpyrBubbleCta';
import { HelpyrPopupLibrary } from '../../src/renderer/apps/helpyrPopupLibrary';

describe('bubbleCtaFor', () => {
  it('returns undefined for triggers with no override (legacy generic CTA)', () => {
    // A sampling of plain flavor/alert triggers that should keep the
    // default "open HELPYR" CTA.
    for (const trigger of ['idle', 'suspicion_crossed_25', 'first_open_webdynamo']) {
      expect(bubbleCtaFor(trigger)).toBeUndefined();
    }
  });

  it('gives the Signal Monitor unlock pop a launching, trust-split CTA', () => {
    const spec = bubbleCtaFor('signal_monitor_unlocked');
    expect(spec).toBeDefined();
    expect(spec?.omit).toBeFalsy();
    expect(typeof spec?.run).toBe('function');
    // Story-authored voiced labels, split by the firing entry's trust.
    expect(resolveBubbleCtaLabel(spec, 'RESERVED')).toBe(`Ooh, let's look!`);
    expect(resolveBubbleCtaLabel(spec, 'OPEN')).toBe(`Take a look.`);
    // FRIENDLY/WITHDRAWN players fall back to the RESERVED entry (so the
    // firing entry's trust is only ever RESERVED or OPEN here), but the
    // resolver still defends the missing-key path → RESERVED label.
    expect(resolveBubbleCtaLabel(spec, 'FRIENDLY')).toBe(`Ooh, let's look!`);
    expect(resolveBubbleCtaLabel(spec, 'WITHDRAWN')).toBe(`Ooh, let's look!`);
  });

  it('resolveBubbleCtaLabel returns undefined when no override (generic CTA)', () => {
    expect(resolveBubbleCtaLabel(undefined, 'RESERVED')).toBeUndefined();
    expect(resolveBubbleCtaLabel(bubbleCtaFor('storefront_start'), 'OPEN')).toBeUndefined();
  });

  it('omits the CTA on every Storefront reaction trigger', () => {
    const storefrontTriggers = [
      'storefront_start',
      'storefront_after_subtle',
      'storefront_after_aggressive',
      'storefront_after_hostile',
      'storefront_intercept',
      'storefront_end',
      'storefront_debrief',
    ];
    for (const trigger of storefrontTriggers) {
      const spec = bubbleCtaFor(trigger);
      expect(spec?.omit, `${trigger} should omit its CTA`).toBe(true);
    }
  });

  it('only references triggers that exist in the popup library', () => {
    // Guards against a config entry drifting from a renamed/removed
    // trigger (a silent no-op). Every configured trigger must back at
    // least one library entry.
    const libraryTriggers = new Set(HelpyrPopupLibrary.map(e => e.trigger));
    const configured = [
      'signal_monitor_unlocked',
      'storefront_start',
      'storefront_after_subtle',
      'storefront_after_aggressive',
      'storefront_after_hostile',
      'storefront_intercept',
      'storefront_end',
      'storefront_debrief',
    ];
    for (const trigger of configured) {
      expect(libraryTriggers.has(trigger), `${trigger} has no library entry`).toBe(true);
    }
  });
});
