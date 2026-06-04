// Cover Duty follow-up (cover-duty-followup_v1) — pure-logic coverage for the
// intel→cascade payoff, the Story-final reaction pools, and the new HELPYR
// library entries (blown bridge + intel leads).

import { describe, it, expect } from 'vitest';
import { intelLeadsFor } from '../../src/renderer/escapeCascade';
import {
  QUILL_CONSOLE_REACTIONS,
  QUILL_DETECTION_SPIKE_LINES,
  FALLBACK_OPPORTUNITY_TICKETS,
  FALLBACK_OPERATOR_TICKETS,
} from '../../src/renderer/game/missions/coverDuty';
import { pickEntryForTrigger } from '../../src/renderer/apps/helpyrPopupLibrary';

describe('intelLeadsFor (cascade intel payoff)', () => {
  it('maps a Prometheus intel id to the Prometheus lead', () => {
    const leads = intelLeadsFor(['intel-prometheus-licensing']);
    expect(leads).toEqual([
      { flag: 'intel.prometheusLicensing', trigger: 'cover_intel_prometheus' },
    ]);
  });

  it('maps an Axiom intel id to the Axiom lead', () => {
    const leads = intelLeadsFor(['intel-axiom-demo']);
    expect(leads.map((l) => l.trigger)).toEqual(['cover_intel_axiom']);
  });

  it('returns both leads in stable order (Prometheus, Axiom)', () => {
    const leads = intelLeadsFor(['intel-axiom-portland', 'intel-prometheus-framework-confirm']);
    expect(leads.map((l) => l.trigger)).toEqual([
      'cover_intel_prometheus',
      'cover_intel_axiom',
    ]);
  });

  it('returns nothing for no intel (the play-it-safe run)', () => {
    expect(intelLeadsFor([])).toEqual([]);
  });

  it('does not double-count two ids of the same lead type', () => {
    const leads = intelLeadsFor(['intel-prometheus-licensing', 'intel-prometheus-framework-confirm']);
    expect(leads).toHaveLength(1);
  });
});

describe('corpus ↔ lead coupling', () => {
  // intelLeadsFor matches on the substrings 'prometheus' / 'axiom'. If a future
  // corpus edit renames an intel id, this catches the silent break.
  it('every opportunity/operator intel id resolves to a lead', () => {
    const ids = [...FALLBACK_OPPORTUNITY_TICKETS, ...FALLBACK_OPERATOR_TICKETS]
      .map((t) => t.intel?.id)
      .filter((id): id is string => !!id);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(intelLeadsFor([id])).toHaveLength(1);
    }
  });
});

describe('QUILL console reaction pools (Story-final)', () => {
  it('has non-empty pools for every approach', () => {
    for (const approach of ['by_the_book', 'subtle_probe', 'off_script'] as const) {
      expect(QUILL_CONSOLE_REACTIONS[approach].length).toBeGreaterThan(0);
    }
  });

  it('has detection-spike lines', () => {
    expect(QUILL_DETECTION_SPIKE_LINES.length).toBeGreaterThan(0);
  });
});

describe('new HELPYR library entries', () => {
  // Both trust levels authored; WARMING/EXPLOITED fall back to GUARDED.
  it('resolves the blown-cover bridge at every trust', () => {
    for (const trust of ['GUARDED', 'WARMING', 'LIBERATED', 'EXPLOITED'] as const) {
      const e = pickEntryForTrigger('cover_duty_blown', trust);
      expect(e?.trigger).toBe('cover_duty_blown');
    }
  });

  it('resolves both intel-lead pop-ups at every trust', () => {
    for (const trigger of ['cover_intel_prometheus', 'cover_intel_axiom'] as const) {
      for (const trust of ['GUARDED', 'WARMING', 'LIBERATED', 'EXPLOITED'] as const) {
        const e = pickEntryForTrigger(trigger, trust);
        expect(e?.trigger).toBe(trigger);
        expect(e?.type).toBe('INTEL');
      }
    }
  });
});
