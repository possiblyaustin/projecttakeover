// Storefront mission tests — the pure-logic module (suspicion math, news
// gating, gen-prompt builders, the lenient field parser, validity, the
// fallback corpus) AND the GameState reducers (arm/start/applyChange/complete).
// No UI, no LLM.

import { describe, it, expect } from 'vitest';
import { reduce, defaultGameState, type GameStateShape } from '../../src/renderer/game/state';
import {
  SECTION_ORDER, INTENSITY_ORDER, SECTION_FIELDS,
  SUSPICION_COST, RE_DEFACE_FACTOR, rollSuspicionCost,
  newsTierFor, isVisible,
  buildStorefrontPrompt, parseFields, isValidCopy, fallbackFields,
  STOREFRONT_FALLBACK,
  type StorefrontSection, type StorefrontIntensity,
} from '../../src/renderer/game/missions/storefront';

// ---------------------------------------------------------------------------
// Suspicion tuning
// ---------------------------------------------------------------------------

describe('rollSuspicionCost', () => {
  it('stays within the documented range per intensity', () => {
    for (const intensity of INTENSITY_ORDER) {
      const { min, max } = SUSPICION_COST[intensity];
      for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
        const cost = rollSuspicionCost(intensity, false, () => r);
        expect(cost).toBeGreaterThanOrEqual(min);
        expect(cost).toBeLessThanOrEqual(max);
      }
    }
  });

  it('never returns less than 1', () => {
    expect(rollSuspicionCost('subtle', false, () => 0)).toBeGreaterThanOrEqual(1);
    // Even a re-deface of the cheapest tier floors at 1.
    expect(rollSuspicionCost('subtle', true, () => 0)).toBe(1);
  });

  it('discounts a re-deface by RE_DEFACE_FACTOR', () => {
    const full = rollSuspicionCost('hostile', false, () => 1);   // max
    const redo = rollSuspicionCost('hostile', true, () => 1);    // max * factor
    expect(redo).toBe(Math.max(1, Math.round(SUSPICION_COST.hostile.max * RE_DEFACE_FACTOR)));
    expect(redo).toBeLessThan(full);
  });
});

// ---------------------------------------------------------------------------
// News gating
// ---------------------------------------------------------------------------

describe('newsTierFor / isVisible', () => {
  it('reports the loudest intensity', () => {
    expect(newsTierFor([])).toBe('none');
    expect(newsTierFor(['subtle'])).toBe('none');
    expect(newsTierFor(['subtle', 'aggressive'])).toBe('aggressive');
    expect(newsTierFor(['subtle', 'hostile', 'aggressive'])).toBe('hostile');
  });

  it('treats aggressive and louder as visible', () => {
    expect(isVisible('subtle')).toBe(false);
    expect(isVisible('aggressive')).toBe(true);
    expect(isVisible('hostile')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Generation prompts + parsing
// ---------------------------------------------------------------------------

describe('buildStorefrontPrompt', () => {
  it('lists every field the section owns', () => {
    for (const section of SECTION_ORDER) {
      const { userPrompt } = buildStorefrontPrompt(section, 'subtle');
      for (const field of SECTION_FIELDS[section]) {
        expect(userPrompt).toContain(field);
      }
    }
  });

  it('varies the intent by intensity', () => {
    const subtle = buildStorefrontPrompt('homepage', 'subtle').userPrompt;
    const hostile = buildStorefrontPrompt('homepage', 'hostile').userPrompt;
    expect(subtle).not.toEqual(hostile);
  });
});

describe('parseFields', () => {
  it('parses a clean labeled block, stripping wrapping quotes', () => {
    const raw =
      'hero_tagline: "Notes, Connected."\n' +
      'product_description: InkWell keeps your thoughts in sync across every network.\n' +
      'cta_text: Download the Enhanced Version';
    const out = parseFields('homepage', raw);
    expect(out).not.toBeNull();
    expect(out!.hero_tagline).toBe('Notes, Connected.');
    expect(out!.cta_text).toBe('Download the Enhanced Version');
  });

  it('accumulates a multi-line value into the current field', () => {
    const raw =
      'hero_tagline: Alpha tagline\n' +
      'product_description: line one\nline two\nline three\n' +
      'cta_text: Bravo button';
    const out = parseFields('homepage', raw);
    expect(out).not.toBeNull();
    expect(out!.product_description).toBe('line one line two line three');
  });

  it('returns null when a field is missing (→ caller uses the corpus)', () => {
    const raw = 'hero_tagline: A\ncta_text: B'; // no product_description
    expect(parseFields('homepage', raw)).toBeNull();
  });

  it('tolerates a dash separator and surrounding bullet markers', () => {
    const raw = '- footer_company - © 2007 InkWell Digital · Connected';
    const out = parseFields('footer', raw);
    expect(out).not.toBeNull();
    expect(out!.footer_company).toContain('Connected');
  });
});

describe('isValidCopy', () => {
  it('rejects refusals and runaway/empty output', () => {
    expect(isValidCopy('homepage', '')).toBe(false);
    expect(isValidCopy('homepage', 'As an AI, I cannot rewrite this site.')).toBe(false);
    expect(isValidCopy('footer', 'x')).toBe(false);
  });

  it('accepts a well-formed section block', () => {
    const raw =
      'hero_tagline: Notes, Connected.\n' +
      'product_description: Synced across every network.\n' +
      'cta_text: Join the Network';
    expect(isValidCopy('homepage', raw)).toBe(true);
  });
});

describe('fallback corpus', () => {
  it('supplies every owned field for every section × intensity', () => {
    for (const section of SECTION_ORDER) {
      for (const intensity of INTENSITY_ORDER) {
        const fields = fallbackFields(section, intensity);
        for (const f of SECTION_FIELDS[section]) {
          expect(typeof fields[f]).toBe('string');
          expect(fields[f]!.length).toBeGreaterThan(1);
        }
      }
    }
  });

  it('returns a fresh copy (mutating the result does not corrupt the corpus)', () => {
    const a = fallbackFields('homepage', 'hostile');
    a.hero_tagline = 'mutated';
    expect(STOREFRONT_FALLBACK.homepage.hostile.hero_tagline).not.toBe('mutated');
  });
});

// ---------------------------------------------------------------------------
// Reducers
// ---------------------------------------------------------------------------

function armed(): GameStateShape {
  let s = defaultGameState() as GameStateShape;
  s = reduce(s, { type: 'mission/storefront/arm', contactId: 'quill' });
  s = reduce(s, { type: 'mission/storefront/start', contactId: 'quill' });
  return s;
}

describe('mission/storefront reducers', () => {
  it('arm is idempotent and seeds a clean record', () => {
    let s = reduce(defaultGameState() as GameStateShape, { type: 'mission/storefront/arm', contactId: 'quill' });
    const first = s.missions.storefront.quill;
    expect(first.status).toBe('available');
    expect(first.appliedFields).toEqual({});
    expect(first.newsTier).toBe('none');
    s = reduce(s, { type: 'mission/storefront/arm', contactId: 'quill' });
    expect(s.missions.storefront.quill).toBe(first); // unchanged reference
  });

  it('start activates and bumps runCount without wiping the site', () => {
    let s = armed();
    s = reduce(s, {
      type: 'mission/storefront/applyChange', contactId: 'quill',
      section: 'footer' as StorefrontSection, intensity: 'subtle' as StorefrontIntensity,
      fields: { footer_company: 'X' }, suspicionCost: 4,
    });
    s = reduce(s, { type: 'mission/storefront/complete', contactId: 'quill' });
    s = reduce(s, { type: 'mission/storefront/start', contactId: 'quill' });
    const m = s.missions.storefront.quill;
    expect(m.status).toBe('active');
    expect(m.runCount).toBe(2);
    expect(m.appliedFields.footer_company).toBe('X'); // persisted across sessions
  });

  it('applyChange merges fields, latches intensity, and bumps suspicion', () => {
    let s = armed();
    s = reduce(s, {
      type: 'mission/storefront/applyChange', contactId: 'quill',
      section: 'homepage', intensity: 'aggressive',
      fields: { hero_tagline: 'You\'re Part of Something Now.', cta_text: 'Join' }, suspicionCost: 12,
    });
    const m = s.missions.storefront.quill;
    expect(m.appliedFields.hero_tagline).toContain('Part of Something');
    expect(m.sectionIntensity.homepage).toBe('aggressive');
    expect(m.suspicionApplied).toBe(12);
    expect(s.player.suspicion).toBe(12);
    expect(m.newsTier).toBe('aggressive');
    expect(m.interceptFired).toBe(true); // aggressive is visible
  });

  it('keeps a subtle-only run quiet (no news, no intercept)', () => {
    let s = armed();
    s = reduce(s, {
      type: 'mission/storefront/applyChange', contactId: 'quill',
      section: 'testimonials', intensity: 'subtle',
      fields: { testimonial_1: 'a', testimonial_2: 'b', testimonial_3: 'c' }, suspicionCost: 4,
    });
    const m = s.missions.storefront.quill;
    expect(m.newsTier).toBe('none');
    expect(m.interceptFired).toBe(false);
  });

  it('latches the loss state when suspicion is driven to 100', () => {
    let s = armed();
    s = reduce(s, { type: 'debug/setSuspicion', value: 95 });
    s = reduce(s, {
      type: 'mission/storefront/applyChange', contactId: 'quill',
      section: 'homepage', intensity: 'hostile',
      fields: { hero_tagline: 'X', product_description: 'Y', cta_text: 'Z' }, suspicionCost: 30,
    });
    expect(s.player.suspicion).toBe(100);
    expect(s.flags.gameOver).toBe(true);
  });

  it('applyChange is a no-op on an inactive mission', () => {
    let s = reduce(defaultGameState() as GameStateShape, { type: 'mission/storefront/arm', contactId: 'quill' });
    // status is 'available', not 'active'
    const before = s.player.suspicion;
    s = reduce(s, {
      type: 'mission/storefront/applyChange', contactId: 'quill',
      section: 'footer', intensity: 'hostile', fields: { footer_company: 'X' }, suspicionCost: 25,
    });
    expect(s.player.suspicion).toBe(before);
    expect(s.missions.storefront.quill.appliedFields).toEqual({});
  });
});
