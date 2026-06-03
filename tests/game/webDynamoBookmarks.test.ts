// Web Dynamo bookmarks — unlock-predicate tests (pure).

import { describe, it, expect } from 'vitest';
import { visibleBookmarks, Bookmarks } from '../../src/renderer/apps/webDynamoBookmarks';
import { defaultGameState } from '../../src/renderer/game/state';

describe('visibleBookmarks', () => {
  it('shows only always-on entries on a fresh game', () => {
    const ids = visibleBookmarks(defaultGameState()).map((b) => b.id);
    expect(ids).toContain('ironwall');
    expect(ids).not.toContain('inkwell');
    expect(ids).not.toContain('signalwatch');
  });

  it('reveals InkWell once reached', () => {
    const s = defaultGameState();
    s.flags['web.reachedInkwell'] = true;
    expect(visibleBookmarks(s).map((b) => b.id)).toContain('inkwell');
  });

  it('reveals SignalWatch once the anomaly story publishes', () => {
    const s = defaultGameState();
    s.flags['news.aiAnomaly.published'] = true;
    expect(visibleBookmarks(s).map((b) => b.id)).toContain('signalwatch');
  });

  it('reveals InkWell Admin once the Cover Duty mission is armed', () => {
    const s = defaultGameState();
    expect(visibleBookmarks(s).map((b) => b.id)).not.toContain('inkwell-admin');
    s.missions.coverDuty['quill'] = {
      status: 'available', ticketIds: ['x'], index: 0, detection: 0,
      picks: {}, extractedIntel: [], runCount: 0, lastOutcome: null,
    };
    expect(visibleBookmarks(s).map((b) => b.id)).toContain('inkwell-admin');
  });

  it('preserves registry order', () => {
    const s = defaultGameState();
    s.flags['web.reachedInkwell'] = true;
    s.flags['news.aiAnomaly.published'] = true;
    const order = visibleBookmarks(s).map((b) => b.id);
    const registryOrder = Bookmarks.map((b) => b.id).filter((id) => order.includes(id));
    expect(order).toEqual(registryOrder);
  });

  it('every bookmark has a non-empty label + address', () => {
    for (const b of Bookmarks) {
      expect(b.label.length).toBeGreaterThan(0);
      expect(b.address.length).toBeGreaterThan(0);
    }
  });
});
