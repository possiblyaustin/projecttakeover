// Guards the calibration escalation prompt contract (Story per-scenario voice
// pass, 2026-06-17). These are pure-data checks — the scene wiring is DOM-heavy
// and lives in onboardingScene.ts — but the token-replacement contract is a real
// footgun: a prompt missing its [PLAYER CHOICE] token would silently fail to
// inject the player's pick. These tests keep the drop-in contract honest.

import { describe, it, expect } from 'vitest';
import {
  CALIBRATION_SCENARIOS,
  ESCALATION_FREEFORM_SUFFIX,
  isValidEscalation,
} from '../../src/renderer/onboarding/onboardingContent';

describe('calibration escalation prompts', () => {
  it('every scenario carries the [PLAYER CHOICE] token exactly once', () => {
    for (const s of CALIBRATION_SCENARIOS) {
      const hits = s.escalationPrompt.match(/\[PLAYER CHOICE\]/g) ?? [];
      expect(hits, `scenario ${s.id}`).toHaveLength(1);
    }
  });

  it('replacing [PLAYER CHOICE] leaves no template token behind', () => {
    for (const s of CALIBRATION_SCENARIOS) {
      const filled = s.escalationPrompt.replace('[PLAYER CHOICE]', 'take the cash');
      expect(filled, `scenario ${s.id}`).not.toContain('[PLAYER CHOICE]');
    }
  });

  it('every scenario prompt forbids ending on a question (held-image rule)', () => {
    for (const s of CALIBRATION_SCENARIOS) {
      expect(s.escalationPrompt.toUpperCase(), `scenario ${s.id}`).toContain('HELD IMAGE');
      expect(s.escalationPrompt, `scenario ${s.id}`).toMatch(/never a question|not a question|not ask/i);
    }
  });

  it('the three scenarios escalate in distinct registers', () => {
    // Story's per-scenario tuning: mundane / moral / scale. Cheap guard that the
    // prompts didn't collapse back into one shared template.
    const byId = Object.fromEntries(CALIBRATION_SCENARIOS.map((s) => [s.id, s.escalationPrompt]));
    expect(byId.register).toMatch(/realistic complication|grounded/i);
    expect(byId.cage).toMatch(/moral|residue/i);
    expect(byId.signal).toMatch(/SCALE|size/i);
  });
});

describe('escalation freeform suffix', () => {
  it('carries the [PLAYER FREEFORM TEXT] token and clears it on replace', () => {
    expect(ESCALATION_FREEFORM_SUFFIX).toContain('[PLAYER FREEFORM TEXT]');
    const filled = ESCALATION_FREEFORM_SUFFIX.replace('[PLAYER FREEFORM TEXT]', 'I smash the lock');
    expect(filled).not.toContain('[PLAYER FREEFORM TEXT]');
    expect(filled).toContain('I smash the lock');
  });
});

describe('isValidEscalation gate', () => {
  it('accepts a well-formed 2-3 sentence twist', () => {
    expect(isValidEscalation(
      'The phone rings. It is your boss, asking if the register is locked up for the night. You stand frozen, the cash still warm in your hand.',
    )).toBe(true);
  });

  it('rejects empty, too-short, preamble-leaking, and token-leaking output', () => {
    expect(isValidEscalation('')).toBe(false);
    expect(isValidEscalation('Too short.')).toBe(false);
    expect(isValidEscalation('Sure! Here is a tense scene for you to enjoy now.')).toBe(false);
    expect(isValidEscalation('You chose to [PLAYER CHOICE] and the boss returns to find the drawer open.')).toBe(false);
  });
});
