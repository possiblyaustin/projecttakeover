// Cover Duty mission STATE tests — the GameState reducer actions
// (start/recordPick/complete) + the runtime corpus helpers. Pure: drives
// `reduce` directly, no UI, no LLM.

import { describe, it, expect } from 'vitest';
import { reduce, defaultGameState, type GameStateShape } from '../../src/renderer/game/state';
import {
  getCoverDutyTicketById,
  rebuildBatch,
  selectBatchIds,
  resolveCoverOutcome,
  FALLBACK_MUNDANE_TICKETS,
} from '../../src/renderer/game/missions/coverDuty';

const TICKETS = ['mundane-sync', 'opportunity-prometheus', 'operator-dana-standard'];

function start(state: GameStateShape, ticketIds = TICKETS): GameStateShape {
  return reduce(state, { type: 'mission/coverDuty/start', contactId: 'quill', ticketIds });
}

describe('mission/coverDuty/start', () => {
  it('seeds an active run with reset meters and runCount 1', () => {
    const s = start(defaultGameState());
    const m = s.missions.coverDuty.quill;
    expect(m.status).toBe('active');
    expect(m.ticketIds).toEqual(TICKETS);
    expect(m.index).toBe(0);
    expect(m.detection).toBe(0);
    expect(m.picks).toEqual({});
    expect(m.extractedIntel).toEqual([]);
    expect(m.runCount).toBe(1);
    expect(m.lastOutcome).toBeNull();
  });

  it('increments runCount and preserves lastOutcome across runs', () => {
    let s = start(defaultGameState());
    s = reduce(s, { type: 'mission/coverDuty/complete', contactId: 'quill', outcome: 'intact' });
    s = start(s);
    expect(s.missions.coverDuty.quill.runCount).toBe(2);
    expect(s.missions.coverDuty.quill.lastOutcome).toBe('intact');
    expect(s.missions.coverDuty.quill.status).toBe('active'); // re-armed
  });

  it('is a no-op with no ticket ids', () => {
    const base = defaultGameState();
    const s = reduce(base, { type: 'mission/coverDuty/start', contactId: 'quill', ticketIds: [] });
    expect(s).toBe(base);
  });
});

describe('mission/coverDuty/recordPick', () => {
  it('accumulates detection, stores the pick + intel, advances the index', () => {
    let s = start(defaultGameState());
    s = reduce(s, {
      type: 'mission/coverDuty/recordPick',
      contactId: 'quill',
      ticketId: 'opportunity-prometheus',
      approach: 'subtle_probe',
      detectionCost: 10,
      intelId: 'intel-prometheus-licensing',
    });
    const m = s.missions.coverDuty.quill;
    expect(m.detection).toBe(10);
    expect(m.picks['opportunity-prometheus']).toBe('subtle_probe');
    expect(m.extractedIntel).toEqual(['intel-prometheus-licensing']);
    expect(m.index).toBe(1);
  });

  it('clamps detection at 100 and de-dupes intel', () => {
    let s = start(defaultGameState());
    s = reduce(s, { type: 'mission/coverDuty/recordPick', contactId: 'quill', ticketId: 'a', approach: 'off_script', detectionCost: 80, intelId: 'x' });
    s = reduce(s, { type: 'mission/coverDuty/recordPick', contactId: 'quill', ticketId: 'b', approach: 'off_script', detectionCost: 80, intelId: 'x' });
    const m = s.missions.coverDuty.quill;
    expect(m.detection).toBe(100);
    expect(m.extractedIntel).toEqual(['x']); // not duplicated
  });

  it('is a no-op when there is no active run', () => {
    const base = defaultGameState();
    const s = reduce(base, { type: 'mission/coverDuty/recordPick', contactId: 'quill', ticketId: 'a', approach: 'by_the_book', detectionCost: 0 });
    expect(s).toBe(base);
  });

  it('is a no-op after the run is complete', () => {
    let s = start(defaultGameState());
    s = reduce(s, { type: 'mission/coverDuty/complete', contactId: 'quill', outcome: 'intact' });
    const after = reduce(s, { type: 'mission/coverDuty/recordPick', contactId: 'quill', ticketId: 'a', approach: 'off_script', detectionCost: 30 });
    expect(after).toBe(s);
  });
});

describe('mission/coverDuty/complete', () => {
  it('latches status + outcome', () => {
    let s = start(defaultGameState());
    s = reduce(s, { type: 'mission/coverDuty/complete', contactId: 'quill', outcome: 'stressed' });
    expect(s.missions.coverDuty.quill.status).toBe('complete');
    expect(s.missions.coverDuty.quill.lastOutcome).toBe('stressed');
  });

  it('is a no-op when already complete', () => {
    let s = start(defaultGameState());
    s = reduce(s, { type: 'mission/coverDuty/complete', contactId: 'quill', outcome: 'intact' });
    const again = reduce(s, { type: 'mission/coverDuty/complete', contactId: 'quill', outcome: 'blown' });
    expect(again).toBe(s);
    expect(again.missions.coverDuty.quill.lastOutcome).toBe('intact'); // unchanged
  });
});

describe('runtime corpus helpers', () => {
  it('getCoverDutyTicketById finds across all kinds', () => {
    expect(getCoverDutyTicketById('mundane-sync')?.kind).toBe('mundane');
    expect(getCoverDutyTicketById('opportunity-prometheus')?.kind).toBe('opportunity');
    expect(getCoverDutyTicketById('operator-dana-standard')?.kind).toBe('operator');
    expect(getCoverDutyTicketById('nope')).toBeUndefined();
  });

  it('rebuildBatch round-trips ids → tickets and drops unknowns', () => {
    const batch = rebuildBatch([...TICKETS, 'bogus-id']);
    expect(batch.map((t) => t.id)).toEqual(TICKETS);
  });

  it('selectBatchIds yields ids that all resolve to real tickets', () => {
    const ids = selectBatchIds(() => 0.42);
    expect(ids.length).toBeGreaterThanOrEqual(5);
    for (const id of ids) expect(getCoverDutyTicketById(id)).toBeTruthy();
  });
});

describe('end-to-end pick sequence → outcome', () => {
  it('all by-the-book stays intact', () => {
    let s = start(defaultGameState(), FALLBACK_MUNDANE_TICKETS.map((t) => t.id));
    for (const t of FALLBACK_MUNDANE_TICKETS) {
      s = reduce(s, { type: 'mission/coverDuty/recordPick', contactId: 'quill', ticketId: t.id, approach: 'by_the_book', detectionCost: 0 });
    }
    const det = s.missions.coverDuty.quill.detection;
    expect(det).toBe(0);
    expect(resolveCoverOutcome(det)).toBe('intact');
  });

  it('aggressive probing blows cover', () => {
    let s = start(defaultGameState());
    const picks = [25, 25, 30]; // off-script heavy
    TICKETS.forEach((id, i) => {
      s = reduce(s, { type: 'mission/coverDuty/recordPick', contactId: 'quill', ticketId: id, approach: 'off_script', detectionCost: picks[i]! });
    });
    const det = s.missions.coverDuty.quill.detection;
    expect(det).toBe(80);
    expect(resolveCoverOutcome(det)).toBe('blown');
  });
});
