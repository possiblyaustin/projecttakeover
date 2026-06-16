// Storefront mission tests — the pure-logic module (suspicion math, news
// gating, gen-prompt builders, the lenient field parser, validity, the
// fallback corpus) AND the GameState reducers (arm/start/applyChange/complete).
// No UI, no LLM.

import { describe, it, expect } from 'vitest';
import { reduce, defaultGameState, type GameStateShape } from '../../src/renderer/game/state';
import {
  SECTION_ORDER, INTENSITY_ORDER, SECTION_FIELDS,
  EXPOSURE_LEVEL, loudestIntensity, exposureFor,
  newsTierFor, isVisible,
  buildStorefrontPrompt, parseFields, isValidCopy, fallbackFields,
  STOREFRONT_FALLBACK,
  type StorefrontSection, type StorefrontIntensity,
} from '../../src/renderer/game/missions/storefront';

// ---------------------------------------------------------------------------
// Suspicion model — intensity high-water mark
// ---------------------------------------------------------------------------

describe('exposure (high-water by intensity)', () => {
  it('escalates with loudness and keeps hostile below the lethal line', () => {
    expect(EXPOSURE_LEVEL.subtle).toBeLessThan(EXPOSURE_LEVEL.aggressive);
    expect(EXPOSURE_LEVEL.aggressive).toBeLessThan(EXPOSURE_LEVEL.hostile);
    // Hostile must sit below 100 so Storefront alone can never reach game-over.
    expect(EXPOSURE_LEVEL.hostile).toBeLessThan(100);
  });

  it('loudestIntensity picks the loudest applied, null for none', () => {
    expect(loudestIntensity([])).toBeNull();
    expect(loudestIntensity(['subtle'])).toBe('subtle');
    expect(loudestIntensity(['subtle', 'aggressive'])).toBe('aggressive');
    expect(loudestIntensity(['hostile', 'subtle', 'aggressive'])).toBe('hostile');
  });

  it('exposureFor is the loudest level, NOT a per-section sum', () => {
    expect(exposureFor([])).toBe(0);
    expect(exposureFor(['subtle'])).toBe(EXPOSURE_LEVEL.subtle);
    // Three hostile sections cost the same as one — "obvious is obvious".
    expect(exposureFor(['hostile', 'hostile', 'hostile'])).toBe(EXPOSURE_LEVEL.hostile);
    expect(exposureFor(['subtle', 'aggressive', 'subtle'])).toBe(EXPOSURE_LEVEL.aggressive);
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
      'hero_h1: InkWell Notes Is Gone.\n' +
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
      'hero_h1: Alpha headline\n' +
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
      'hero_h1: InkWell Notes Is Gone.\n' +
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

  function apply(s: GameStateShape, section: StorefrontSection, intensity: StorefrontIntensity, fields: Record<string, string>): GameStateShape {
    return reduce(s, { type: 'mission/storefront/applyChange', contactId: 'quill', section, intensity, fields });
  }

  it('start activates and bumps runCount without wiping the site', () => {
    let s = armed();
    s = apply(s, 'footer', 'subtle', { footer_company: 'X' });
    s = reduce(s, { type: 'mission/storefront/complete', contactId: 'quill' });
    s = reduce(s, { type: 'mission/storefront/start', contactId: 'quill' });
    const m = s.missions.storefront.quill;
    expect(m.status).toBe('active');
    expect(m.runCount).toBe(2);
    expect(m.appliedFields.footer_company).toBe('X'); // persisted across sessions
  });

  it('applyChange merges fields, latches intensity, and raises suspicion to the level', () => {
    let s = armed();
    s = apply(s, 'homepage', 'aggressive', { hero_tagline: 'You\'re Part of Something Now.', cta_text: 'Join' });
    const m = s.missions.storefront.quill;
    expect(m.appliedFields.hero_tagline).toContain('Part of Something');
    expect(m.sectionIntensity.homepage).toBe('aggressive');
    expect(m.suspicionApplied).toBe(EXPOSURE_LEVEL.aggressive);
    expect(s.player.suspicion).toBe(EXPOSURE_LEVEL.aggressive);
    expect(m.newsTier).toBe('aggressive');
    expect(m.interceptFired).toBe(true); // aggressive is visible
  });

  it('suspicion is a high-water mark — more changes at the same loudness do not stack', () => {
    let s = armed();
    s = apply(s, 'homepage', 'hostile', { hero_tagline: 'a', product_description: 'b', cta_text: 'c' });
    expect(s.player.suspicion).toBe(EXPOSURE_LEVEL.hostile);
    // A second hostile section adds nothing.
    s = apply(s, 'testimonials', 'hostile', { testimonial_1: 'd', testimonial_2: 'e', testimonial_3: 'f' });
    expect(s.player.suspicion).toBe(EXPOSURE_LEVEL.hostile);
    // A quieter follow-up doesn't lower it.
    s = apply(s, 'footer', 'subtle', { footer_company: 'g' });
    expect(s.player.suspicion).toBe(EXPOSURE_LEVEL.hostile);
  });

  it('going louder raises suspicion by the delta only', () => {
    let s = armed();
    s = apply(s, 'footer', 'subtle', { footer_company: 'a' });
    expect(s.player.suspicion).toBe(EXPOSURE_LEVEL.subtle);
    s = apply(s, 'homepage', 'hostile', { hero_tagline: 'b', product_description: 'c', cta_text: 'd' });
    expect(s.player.suspicion).toBe(EXPOSURE_LEVEL.hostile); // jumped to the new high-water
  });

  it('Storefront ALONE can never reach 100 or game-over (no solo-end)', () => {
    let s = armed();
    // Deface every section as hostile.
    s = apply(s, 'homepage', 'hostile', { hero_tagline: 'a', product_description: 'b', cta_text: 'c' });
    s = apply(s, 'testimonials', 'hostile', { testimonial_1: 'd', testimonial_2: 'e', testimonial_3: 'f' });
    s = apply(s, 'support', 'hostile', { support_intro: 'g' });
    s = apply(s, 'footer', 'hostile', { footer_company: 'h' });
    expect(s.player.suspicion).toBeLessThan(100);
    expect(s.flags.gameOver).toBeFalsy();
  });

  it('a Storefront change caps the meter at 99 even when other suspicion is already high', () => {
    let s = armed();
    s = reduce(s, { type: 'debug/setSuspicion', value: 95 });
    s = apply(s, 'homepage', 'hostile', { hero_tagline: 'X', product_description: 'Y', cta_text: 'Z' });
    // Storefront raises toward its level but never trips the loss latch.
    expect(s.player.suspicion).toBeLessThanOrEqual(99);
    expect(s.flags.gameOver).toBeFalsy();
  });

  it('keeps a subtle-only run quiet (no news, no intercept)', () => {
    let s = armed();
    s = apply(s, 'testimonials', 'subtle', { testimonial_1: 'a', testimonial_2: 'b', testimonial_3: 'c' });
    const m = s.missions.storefront.quill;
    expect(m.newsTier).toBe('none');
    expect(m.interceptFired).toBe(false);
  });

  it('applyChange is a no-op on an inactive mission', () => {
    let s = reduce(defaultGameState() as GameStateShape, { type: 'mission/storefront/arm', contactId: 'quill' });
    // status is 'available', not 'active'
    const before = s.player.suspicion;
    s = apply(s, 'footer', 'hostile', { footer_company: 'X' });
    expect(s.player.suspicion).toBe(before);
    expect(s.missions.storefront.quill.appliedFields).toEqual({});
  });
});
