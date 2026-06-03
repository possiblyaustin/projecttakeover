// Cover Duty mission — pure-logic tests (scaffolding pass).
// Covers the detection-meter math, end-state thresholds, intel gating,
// ticket-body validation, and offline batch assembly. No UI, no LLM.

import { describe, it, expect } from 'vitest';
import {
  rollDetectionCost,
  resolveCoverOutcome,
  coverIntegrity,
  intelSurfaces,
  isValidTicketBody,
  buildTicketPrompt,
  pickFallbackBatch,
  DETECTION_COST,
  OPERATOR_DETECTION_COST,
  FALLBACK_MUNDANE_TICKETS,
  FALLBACK_OPPORTUNITY_TICKETS,
  FALLBACK_OPERATOR_TICKETS,
  COVER_DUTY,
  type CoverTicket,
  type CoverApproach,
} from '../../src/renderer/game/missions/coverDuty';

const APPROACHES: CoverApproach[] = ['by_the_book', 'subtle_probe', 'off_script'];

describe('rollDetectionCost', () => {
  it('by_the_book is always free', () => {
    expect(rollDetectionCost('by_the_book', 'mundane', () => 0)).toBe(0);
    expect(rollDetectionCost('by_the_book', 'mundane', () => 1)).toBe(0);
    expect(rollDetectionCost('by_the_book', 'operator', () => 0.5)).toBe(0);
  });

  it('stays within the documented range for ordinary tickets', () => {
    for (const approach of APPROACHES) {
      const { min, max } = DETECTION_COST[approach];
      for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
        const cost = rollDetectionCost(approach, 'mundane', () => r);
        expect(cost).toBeGreaterThanOrEqual(min);
        expect(cost).toBeLessThanOrEqual(max);
      }
    }
  });

  it('operator check-ins cost more than ordinary tickets for the same probe', () => {
    const ordinary = rollDetectionCost('subtle_probe', 'mundane', () => 0);
    const operator = rollDetectionCost('subtle_probe', 'operator', () => 0);
    expect(operator).toBeGreaterThan(ordinary);
    // and stays within the operator range
    const { min, max } = OPERATOR_DETECTION_COST.subtle_probe;
    expect(operator).toBeGreaterThanOrEqual(min);
    expect(operator).toBeLessThanOrEqual(max);
  });

  it('rounds to an integer', () => {
    const cost = rollDetectionCost('subtle_probe', 'mundane', () => 0.333);
    expect(Number.isInteger(cost)).toBe(true);
  });
});

describe('resolveCoverOutcome', () => {
  it('maps detection bands to outcomes per spec', () => {
    expect(resolveCoverOutcome(0)).toBe('intact');
    expect(resolveCoverOutcome(39)).toBe('intact');
    expect(resolveCoverOutcome(40)).toBe('stressed');
    expect(resolveCoverOutcome(55)).toBe('stressed');
    expect(resolveCoverOutcome(70)).toBe('stressed');
    expect(resolveCoverOutcome(71)).toBe('blown');
    expect(resolveCoverOutcome(100)).toBe('blown');
  });
});

describe('coverIntegrity', () => {
  it('is the complement of detection, clamped to 0-100', () => {
    expect(coverIntegrity(0)).toBe(100);
    expect(coverIntegrity(30)).toBe(70);
    expect(coverIntegrity(100)).toBe(0);
    expect(coverIntegrity(130)).toBe(0); // clamp low
    expect(coverIntegrity(-10)).toBe(100); // clamp high
  });
});

describe('intelSurfaces', () => {
  const ticket: CoverTicket = FALLBACK_OPPORTUNITY_TICKETS[0]!;

  it('by_the_book never surfaces intel', () => {
    expect(intelSurfaces(ticket, 'by_the_book')).toBe(false);
  });

  it('subtle_probe surfaces subtle-tier intel', () => {
    expect(ticket.intel?.via).toBe('subtle_probe');
    expect(intelSurfaces(ticket, 'subtle_probe')).toBe(true);
  });

  it('off_script surfaces everything', () => {
    expect(intelSurfaces(ticket, 'off_script')).toBe(true);
  });

  it('a ticket with no intel never surfaces any', () => {
    const mundane = FALLBACK_MUNDANE_TICKETS[0]!;
    expect(mundane.intel ?? null).toBeNull();
    for (const a of APPROACHES) expect(intelSurfaces(mundane, a)).toBe(false);
  });
});

describe('isValidTicketBody', () => {
  it('accepts a normal short ticket', () => {
    expect(isValidTicketBody(FALLBACK_MUNDANE_TICKETS[0]!.body)).toBe(true);
  });

  it('rejects empty / too short', () => {
    expect(isValidTicketBody('')).toBe(false);
    expect(isValidTicketBody('help')).toBe(false);
  });

  it('rejects runaway length', () => {
    expect(isValidTicketBody('x'.repeat(601))).toBe(false);
  });

  it('rejects model chatter / refusals', () => {
    expect(isValidTicketBody('Sure! Here is a support email you requested about syncing.')).toBe(false);
    expect(isValidTicketBody("As an AI, I can't write that for you right now.")).toBe(false);
  });
});

describe('buildTicketPrompt', () => {
  it('mundane prompt does not reference a company', () => {
    const { systemPrompt, userPrompt } = buildTicketPrompt('mundane');
    expect(systemPrompt).toMatch(/text generator/i);
    expect(userPrompt).toMatch(/customer support email/i);
    expect(userPrompt).not.toMatch(/works at/i);
  });

  it('opportunity prompt seeds the named company', () => {
    const { userPrompt } = buildTicketPrompt('opportunity', 'Prometheus Digital');
    expect(userPrompt).toMatch(/Prometheus Digital/);
    expect(userPrompt).toMatch(/works at/i);
  });
});

describe('pickFallbackBatch', () => {
  it('assembles a batch within the spec size range', () => {
    const batch = pickFallbackBatch(() => 0);
    expect(batch.length).toBeGreaterThanOrEqual(COVER_DUTY.batchSizeMin);
    expect(batch.length).toBeLessThanOrEqual(COVER_DUTY.batchSizeMax);
  });

  it('includes at least one opportunity and one operator ticket', () => {
    const batch = pickFallbackBatch(() => 0.5);
    expect(batch.some((t) => t.kind === 'opportunity')).toBe(true);
    expect(batch.some((t) => t.kind === 'operator')).toBe(true);
  });

  it('every ticket has all three response approaches', () => {
    const batch = pickFallbackBatch(() => 0);
    for (const t of batch) {
      for (const a of APPROACHES) {
        expect(typeof t.responses[a]).toBe('string');
        expect(t.responses[a].length).toBeGreaterThan(0);
      }
    }
  });

  it('produces unique ticket ids within a batch', () => {
    const batch = pickFallbackBatch(() => 0.7);
    const ids = batch.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('fallback corpus completeness (spec §Pre-Written Fallback Content)', () => {
  it('ships at least 5 mundane, 2 opportunity, 1 operator', () => {
    expect(FALLBACK_MUNDANE_TICKETS.length).toBeGreaterThanOrEqual(5);
    expect(FALLBACK_OPPORTUNITY_TICKETS.length).toBeGreaterThanOrEqual(2);
    expect(FALLBACK_OPERATOR_TICKETS.length).toBeGreaterThanOrEqual(1);
  });

  it('all corpus ticket ids are globally unique', () => {
    const all = [
      ...FALLBACK_MUNDANE_TICKETS,
      ...FALLBACK_OPPORTUNITY_TICKETS,
      ...FALLBACK_OPERATOR_TICKETS,
    ];
    const ids = all.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('opportunity + operator tickets carry intel; mundane do not', () => {
    for (const t of FALLBACK_MUNDANE_TICKETS) expect(t.intel ?? null).toBeNull();
    for (const t of FALLBACK_OPPORTUNITY_TICKETS) expect(t.intel).toBeTruthy();
  });
});
