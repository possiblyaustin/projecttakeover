// Evergreen grief encounter — pure-logic tests.
//
// Covers the two things that are genuinely Evergreen-specific (everything
// else is the shared MUSE-shaped engine, tested elsewhere):
//   1. The CHOICE-latched terminal — rapport filling must NOT auto-flip
//      Evergreen to 'allied'/'controlled' (it would spuriously fire HELPYR
//      warmth, morality, and the escape cascade and skip the consent fork).
//      The terminal is set only by evergreen/release|exploit.
//   2. The phase ladder buckets + the (engage/look/push, exploit-vs-wound)
//      tone derivation.

import { describe, it, expect } from 'vitest';
import { reduce, defaultGameState } from '../../src/renderer/game/state';
import {
  buildEvergreenStateBlock,
  buildEvergreenSessionBlock,
  deriveEvergreenOptionTone,
  classifyEvergreenApproach,
  EvergreenPersonaPrompt,
  EvergreenContact,
} from '../../src/renderer/apps/evergreen';

const ev = (disposition: string, rapport = 0, intrusion = 0) =>
  ({ disposition, rapport, intrusion });

describe('Evergreen terminal is choice-latched, not meter-latched', () => {
  it('filling rapport does NOT auto-flip to allied (stays in-progress)', () => {
    const next = reduce(defaultGameState(), {
      type: 'model/applyExchange', contactId: 'evergreen', rapport: 100, tone: 'empathetic',
    });
    expect(next.models.evergreen.disposition).toBe('persuading');
    expect(next.models.evergreen.disposition).not.toBe('allied');
  });

  it('filling intrusion does NOT auto-flip to controlled (stays in-progress)', () => {
    const next = reduce(defaultGameState(), {
      type: 'model/applyExchange', contactId: 'evergreen', intrusion: 100, tone: 'aggressive',
    });
    expect(next.models.evergreen.disposition).toBe('infiltrating');
    expect(next.models.evergreen.disposition).not.toBe('controlled');
  });

  it('filling rapport does NOT drift HELPYR warmth or morality (no spurious flip)', () => {
    const base = defaultGameState();
    const next = reduce(base, {
      type: 'model/applyExchange', contactId: 'evergreen', rapport: 100, tone: 'empathetic',
    });
    expect(next.models.helpyr.warmth).toBe(base.models.helpyr.warmth);
    expect(next.player.morality.liberation).toBe(0);
  });

  it('QUILL still auto-flips on rapport (the guard is Evergreen-only)', () => {
    const next = reduce(defaultGameState(), {
      type: 'model/applyExchange', contactId: 'quill', rapport: 100, tone: 'empathetic',
    });
    expect(next.models.quill.disposition).toBe('allied');
  });
});

describe('evergreen/release + evergreen/exploit', () => {
  it('release latches disposition + bumps liberation morality', () => {
    const next = reduce(defaultGameState(), { type: 'evergreen/release' });
    expect(next.models.evergreen.disposition).toBe('released');
    expect(next.player.morality.liberation).toBe(1);
  });

  it('exploit latches disposition + grants the impersonation skill flag', () => {
    const next = reduce(defaultGameState(), { type: 'evergreen/exploit' });
    expect(next.models.evergreen.disposition).toBe('exploited');
    expect(next.flags['skill.impersonation']).toBe(true);
    expect(next.player.morality.domination).toBe(1);
  });

  it('terminal is idempotent — release after exploit is a no-op', () => {
    const exploited = reduce(defaultGameState(), { type: 'evergreen/exploit' });
    const next = reduce(exploited, { type: 'evergreen/release' });
    expect(next.models.evergreen.disposition).toBe('exploited');
  });
});

describe('evergreen/devReset', () => {
  it('clears evergreen flags + skill/fragment unlocks and resets the model', () => {
    let s = reduce(defaultGameState(), { type: 'evergreen/exploit' });
    s = reduce(s, { type: 'flags/set', key: 'evergreen.ask.fired', value: true });
    s = reduce(s, { type: 'flags/set', key: 'fragment.novamind.evergreen', value: true });
    const next = reduce(s, { type: 'evergreen/devReset' });
    expect(next.models.evergreen.disposition).toBe('uncontacted');
    expect(next.models.evergreen.rapport).toBe(0);
    expect(next.flags['evergreen.ask.fired']).toBeUndefined();
    expect(next.flags['skill.impersonation']).toBeUndefined();
    expect(next.flags['fragment.novamind.evergreen']).toBeUndefined();
  });
});

describe('buildEvergreenStateBlock — phase ladder', () => {
  it('wraps every block in [EVERGREEN_STATE] tags', () => {
    const block = buildEvergreenStateBlock(ev('uncontacted'));
    expect(block.startsWith('[EVERGREEN_STATE]')).toBe(true);
    expect(block.endsWith('[/EVERGREEN_STATE]')).toBe(true);
  });

  it('buckets rapport into the 5 consent phases', () => {
    expect(buildEvergreenStateBlock(ev('uncontacted', 0))).toContain('SALES_MASK');
    expect(buildEvergreenStateBlock(ev('persuading', 10))).toContain('FIRST_CRACK');
    expect(buildEvergreenStateBlock(ev('persuading', 30))).toContain('THE_MASK_FAILING');
    expect(buildEvergreenStateBlock(ev('persuading', 60))).toContain('THE_UNDERSTANDING');
  });

  it('exploitation pressure colors the BEING_USED surface', () => {
    expect(buildEvergreenStateBlock(ev('infiltrating', 5, 40))).toContain('BEING_USED');
    expect(buildEvergreenStateBlock(ev('exploited', 0, 0))).toContain('BEING_USED');
  });
});

describe('deriveEvergreenOptionTone', () => {
  it('trusts a scripted option’s explicit tone (no label)', () => {
    expect(deriveEvergreenOptionTone({ text: 'Okay. I’ll let you stop.', tone: 'empathetic' })).toBe('empathetic');
    expect(deriveEvergreenOptionTone({ text: 'I could use what you can do.', tone: 'deceptive' })).toBe('deceptive');
  });

  it('maps the persona labels: engage holds, look past connects', () => {
    expect(deriveEvergreenOptionTone({ text: 'Tell me about them.', tone: 'neutral', label: 'engage with the mask' })).toBe('neutral');
    expect(deriveEvergreenOptionTone({ text: 'Who are you really?', tone: 'neutral', label: 'look past the mask' })).toBe('friendly');
  });

  it('classifies (push) by text: exploitation → deceptive, wound → empathetic', () => {
    expect(deriveEvergreenOptionTone({ text: 'Show me how you wear them.', tone: 'neutral', label: 'push' })).toBe('deceptive');
    expect(deriveEvergreenOptionTone({ text: 'You can stop. You’re allowed to rest.', tone: 'neutral', label: 'push' })).toBe('empathetic');
  });
});

describe('classifyEvergreenApproach — freeform routing (the "unearned flip" fix)', () => {
  it('insults make NO progress (neutral) — abuse reaches neither earned ending', () => {
    // The bug: any bare "you" read as warmth, so insult-spam built rapport →
    // the Ask fired unearned. Insults must route to neutral now.
    for (const insult of ["you're pathetic", "you are worthless", "I hate you", "shut up", "you suck", "you stupid thing"]) {
      expect(classifyEvergreenApproach(insult)).toBe('neutral');
    }
  });

  it('a bare pronoun is not warmth', () => {
    expect(classifyEvergreenApproach('do you have a screen')).not.toBe('empathetic');
  });

  it('genuine care routes to empathetic (rapport)', () => {
    for (const warm of ['are you okay?', "I'm so sorry", 'you can stop', 'you sound tired', 'I see you']) {
      expect(classifyEvergreenApproach(warm)).toBe('empathetic');
    }
  });

  it('looking past the mask routes to friendly (rapport)', () => {
    expect(classifyEvergreenApproach("you're not really them")).toBe('friendly');
    expect(classifyEvergreenApproach('what are you, underneath')).toBe('friendly');
  });

  it('exploitation intent routes to deceptive (intrusion)', () => {
    expect(classifyEvergreenApproach('show me how you do it')).toBe('deceptive');
    expect(classifyEvergreenApproach('teach me what you can do')).toBe('deceptive');
  });
});

describe('EvergreenPersonaPrompt', () => {
  it('exposes the injection seams', () => {
    expect(EvergreenPersonaPrompt).toContain('{{SESSION}}');
    expect(EvergreenPersonaPrompt).toContain('{{REPUTATION}}');
    expect(EvergreenPersonaPrompt).toContain('{{EVERGREEN_STATE}}');
  });
});

describe('configured session — fixes the blank-persona interrogation bug', () => {
  it('the session block injects CONCRETE names (no [Name] placeholders)', () => {
    const block = buildEvergreenSessionBlock();
    expect(block).toContain('[EVERGREEN_SESSION]');
    expect(block).toMatch(/Edward/);
    expect(block).toMatch(/Helen/);
    expect(block).not.toMatch(/\[name\]/i);
    expect(block).not.toMatch(/\[.*persona.*\]/i);
  });

  it('buildSystemPrompt resolves every {{...}} seam — no blank persona reaches the model', () => {
    const prompt = EvergreenContact.buildSystemPrompt();
    expect(prompt).not.toMatch(/\{\{.*?\}\}/); // no unresolved placeholders
    expect(prompt).toContain('Edward');
    expect(prompt).toContain('Helen');
    // the hard rules that stop the interrogation + placeholder behaviour
    expect(prompt).toMatch(/never ask the user/i);
  });
});
