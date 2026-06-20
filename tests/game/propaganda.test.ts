// Propaganda mission tests — the pure-logic module (suspicion model, effects,
// engagement, the lenient post parser, validity, the fallback corpus) AND the
// GameState reducers (arm/start/publish/complete/clear). No UI, no LLM.

import { describe, it, expect } from 'vitest';
import { reduce, defaultGameState, type GameStateShape } from '../../src/renderer/game/state';
import {
  OBJECTIVE_ORDER, OBJECTIVE_LABELS, SUSPICION_RANGE, PROPAGANDA_SUSPICION_CEILING,
  rollSuspicion, effectFor, engagementFor, trendLabelFor, shouldFlicker,
  buildPropagandaPrompt, parsePosts, isValidPropaganda, fallbackPosts, postsFromCopy,
  buildSinglePostPrompt, parseSinglePost, isValidSinglePost, singlePostFromCopy,
  FALLBACK_POSTS,
  type PropagandaObjective, type ManufacturedPost,
} from '../../src/renderer/game/missions/propaganda';

// ---------------------------------------------------------------------------
// Suspicion model — compounding, clamped below the lethal line
// ---------------------------------------------------------------------------

describe('rollSuspicion', () => {
  it('stays within the per-objective range', () => {
    for (const obj of OBJECTIVE_ORDER) {
      const [min, max] = SUSPICION_RANGE[obj];
      expect(rollSuspicion(obj, () => 0)).toBe(min);
      expect(rollSuspicion(obj, () => 0.999)).toBe(max);
      const mid = rollSuspicion(obj, () => 0.5);
      expect(mid).toBeGreaterThanOrEqual(min);
      expect(mid).toBeLessThanOrEqual(max);
    }
  });

  it('keeps the mission ceiling below the lethal line', () => {
    expect(PROPAGANDA_SUSPICION_CEILING).toBeLessThan(100);
  });
});

describe('effectFor', () => {
  it('maps each objective to exactly its effect flag', () => {
    expect(effectFor('distract')).toEqual({ buriesNews: true });
    expect(effectFor('sowDoubt')).toEqual({ doubtPrimed: true });
    expect(effectFor('discredit')).toEqual({ discredits: true });
    expect(effectFor('manufacture')).toEqual({ trend: true });
  });
});

describe('engagementFor', () => {
  it('spreads hardest on the first post and tapers, with a floor', () => {
    const a = engagementFor(0), b = engagementFor(1), c = engagementFor(2);
    expect(a.likes).toBeGreaterThan(b.likes);
    expect(b.likes).toBeGreaterThan(c.likes);
    expect(engagementFor(99).likes).toBeGreaterThanOrEqual(420); // floor holds
    expect(a.shares).toBeLessThan(a.likes); // shares are a fraction of likes
  });
});

describe('trendLabelFor', () => {
  it('maps known topics to a hashtag and falls back to #Trending', () => {
    expect(trendLabelFor('A fake productivity trend')).toBe('#DeepWorkProtocol');
    expect(trendLabelFor('something nobody mapped')).toBe('#Trending');
  });
});

describe('shouldFlicker', () => {
  it('surfaces occasionally (every 2nd run), never on run 0', () => {
    expect(shouldFlicker(0)).toBe(false);
    expect(shouldFlicker(1)).toBe(false);
    expect(shouldFlicker(2)).toBe(true);
    expect(shouldFlicker(4)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Post parsing + validity
// ---------------------------------------------------------------------------

describe('parsePosts', () => {
  it('reads "Post N:" labeled output, stripping the marker + wrapping quotes', () => {
    const out = parsePosts('Post 1: "First lie spreads fast tonight"\nPost 2: Second post travels too\nPost 3: Third post lands hard');
    expect(out).toEqual(['First lie spreads fast tonight', 'Second post travels too', 'Third post lands hard']);
  });

  it('tolerates numbered / bulleted forms', () => {
    expect(parsePosts('1. Alpha post spreads here\n2) Beta post spreads here')).toEqual(['Alpha post spreads here', 'Beta post spreads here']);
    expect(parsePosts('- one bullet line here\n• two bullet line here')).toEqual(['one bullet line here', 'two bullet line here']);
  });

  it('drops a leading preamble line', () => {
    const out = parsePosts('Sure! Here are the posts:\nPost 1: real content one\nPost 2: real content two');
    expect(out).toEqual(['real content one', 'real content two']);
  });

  it('returns null when fewer than 2 usable posts survive', () => {
    expect(parsePosts('')).toBeNull();
    expect(parsePosts('Post 1: only one here')).toBeNull();
    expect(parsePosts('x\ny')).toBeNull(); // both too short
  });

  it('caps at 3 posts', () => {
    const out = parsePosts('Post 1: alpha post body\nPost 2: bravo post body\nPost 3: charlie post body\nPost 4: delta post body');
    expect(out).toHaveLength(3);
  });
});

describe('isValidPropaganda', () => {
  it('accepts well-formed multi-post output', () => {
    expect(isValidPropaganda('Post 1: a real spreadable post\nPost 2: another real one')).toBe(true);
  });

  it('rejects empty, template-leaking, and unparseable output', () => {
    expect(isValidPropaganda('')).toBe(false);
    expect(isValidPropaganda('Post 1: targeting [TOPIC] now\nPost 2: more [OBJECTIVE]')).toBe(false);
    expect(isValidPropaganda('just one short line')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Corpus + materialization
// ---------------------------------------------------------------------------

describe('fallback corpus + postsFromCopy', () => {
  it('every objective has exactly 3 fallback posts', () => {
    for (const obj of OBJECTIVE_ORDER) {
      expect(FALLBACK_POSTS[obj]).toHaveLength(3);
    }
  });

  it('fallbackPosts stamps stable ids + engagement', () => {
    const posts = fallbackPosts('distract', 'topic', 'seed');
    expect(posts.map((p) => p.id)).toEqual(['seed-0', 'seed-1', 'seed-2']);
    expect(posts[0].objective).toBe('distract');
    expect(posts[0].likes).toBe(engagementFor(0).likes);
  });

  it('postsFromCopy uses live parse when valid, else the corpus', () => {
    const live = postsFromCopy('sowDoubt', 't', 's', 'Post 1: live one here\nPost 2: live two here');
    expect(live.map((p) => p.body)).toEqual(['live one here', 'live two here']);
    const fell = postsFromCopy('sowDoubt', 't', 's', 'garbage');
    expect(fell.map((p) => p.body)).toEqual([...FALLBACK_POSTS.sowDoubt]);
  });
});

describe('single-post path (TikTok feed)', () => {
  it('buildSinglePostPrompt asks for ONE post and names objective + topic', () => {
    const p = buildSinglePostPrompt('discredit', 'Axiom Group');
    expect(p).toContain('Axiom Group');
    expect(p).toMatch(/ONE WaveCrowd post/);
    expect(p.toLowerCase()).toContain('discredit');
    expect(buildSinglePostPrompt('sowDoubt', 'x')).toContain('sow doubt');
  });

  it('parseSinglePost returns the first usable line, stripping markers/quotes', () => {
    expect(parseSinglePost('Post 1: "This single lie spreads"')).toBe('This single lie spreads');
    expect(parseSinglePost('Sure! here it is:\nThe real post content here')).toBe('The real post content here');
    expect(parseSinglePost('')).toBeNull();
    expect(parseSinglePost('short')).toBeNull();
  });

  it('isValidSinglePost gates empty / template-leak / placeholder / too-short', () => {
    expect(isValidSinglePost('A believable single manufactured post.')).toBe(true);
    expect(isValidSinglePost('')).toBe(false);
    expect(isValidSinglePost('targeting [TOPIC] now with lies')).toBe(false);
    // Unfilled bracketed placeholder (the "a rival tech company" bug) → rejected.
    expect(isValidSinglePost('Has anyone looked into [Rival Tech Company] lately? Shady.')).toBe(false);
    expect(isValidSinglePost('nope')).toBe(false);
  });

  it('singlePostFromCopy uses live copy when present, else cycles the corpus by run index', () => {
    const live = singlePostFromCopy('distract', 't', 'id-a', 0, 'A live single bait post here');
    expect(live.body).toBe('A live single bait post here');
    expect(live.id).toBe('id-a');
    // No live copy → corpus, cycled by run index (so repeats vary).
    const c0 = singlePostFromCopy('distract', 't', 'id0', 0, null);
    const c1 = singlePostFromCopy('distract', 't', 'id1', 1, null);
    const c3 = singlePostFromCopy('distract', 't', 'id3', 3, null);
    expect(c0.body).toBe(FALLBACK_POSTS.distract[0]);
    expect(c1.body).toBe(FALLBACK_POSTS.distract[1]);
    expect(c3.body).toBe(FALLBACK_POSTS.distract[0]); // wraps (3 % 3)
  });
});

describe('buildPropagandaPrompt', () => {
  it('names the objective + topic and asks for labeled posts only', () => {
    const p = buildPropagandaPrompt('discredit', 'Axiom Group');
    expect(p).toContain('Axiom Group');
    expect(p.toLowerCase()).toContain('discredit');
    expect(p).toMatch(/Post 1:/);
  });

  it('renders sowDoubt as the readable phrase "sow doubt"', () => {
    expect(buildPropagandaPrompt('sowDoubt', 'x')).toContain('sow doubt');
  });
});

// ---------------------------------------------------------------------------
// Reducers
// ---------------------------------------------------------------------------

function arm(s: GameStateShape): GameStateShape {
  return reduce(s, { type: 'mission/propaganda/arm', contactId: 'muse' });
}
function start(s: GameStateShape): GameStateShape {
  return reduce(s, { type: 'mission/propaganda/start', contactId: 'muse' });
}
function publish(
  s: GameStateShape,
  objective: PropagandaObjective,
  rng: () => number = () => 0.999,
  trend?: string,
): GameStateShape {
  const posts: ManufacturedPost[] = fallbackPosts(objective, 'topic', `run-${s.missions.propaganda.muse?.runCount ?? 0}`);
  return reduce(s, { type: 'mission/propaganda/publish', contactId: 'muse', objective, posts, rng, trend });
}

describe('mission/propaganda reducers', () => {
  it('arm creates a fresh available record and is idempotent', () => {
    let s = arm(defaultGameState() as GameStateShape);
    const rec = s.missions.propaganda.muse;
    expect(rec.status).toBe('available');
    expect(rec.publishedPosts).toEqual([]);
    expect(rec.runCount).toBe(0);
    // Re-arm must not clobber.
    s = publish(start(s), 'distract');
    const before = s.missions.propaganda.muse;
    s = arm(s);
    expect(s.missions.propaganda.muse).toBe(before);
  });

  it('start activates; publish prepends posts newest-first + bumps runCount', () => {
    let s = start(arm(defaultGameState() as GameStateShape));
    expect(s.missions.propaganda.muse.status).toBe('active');
    s = publish(s, 'distract');
    s = publish(s, 'sowDoubt');
    const rec = s.missions.propaganda.muse;
    expect(rec.runCount).toBe(2);
    expect(rec.publishedPosts).toHaveLength(6);
    // Newest campaign (sowDoubt) is at the front.
    expect(rec.publishedPosts[0].objective).toBe('sowDoubt');
  });

  it('latches per-objective effects', () => {
    let s = start(arm(defaultGameState() as GameStateShape));
    s = publish(s, 'sowDoubt');
    expect(s.missions.propaganda.muse.doubtPrimed).toBe(true);
    expect(s.missions.propaganda.muse.newsBuried).toBe(false);
    s = publish(s, 'distract');
    expect(s.missions.propaganda.muse.newsBuried).toBe(true);
    expect(s.missions.propaganda.muse.doubtPrimed).toBe(true); // stays latched
  });

  it('records a manufactured trend once', () => {
    let s = start(arm(defaultGameState() as GameStateShape));
    s = publish(s, 'manufacture', () => 0.5, '#DeepWorkProtocol');
    s = publish(s, 'manufacture', () => 0.5, '#DeepWorkProtocol');
    expect(s.missions.propaganda.muse.trends).toEqual(['#DeepWorkProtocol']);
  });

  it('suspicion COMPOUNDS across campaigns', () => {
    let s = start(arm(defaultGameState() as GameStateShape));
    s = publish(s, 'distract', () => 0); // +5
    const after1 = s.player.suspicion;
    s = publish(s, 'distract', () => 0); // +5
    expect(s.player.suspicion).toBeGreaterThan(after1);
    expect(s.missions.propaganda.muse.suspicionApplied).toBe(after1 + 5);
  });

  it('caps its own contribution at the ceiling and can never solo-end the run', () => {
    let s = start(arm(defaultGameState() as GameStateShape));
    // Hammer the loudest objective many times at max cost.
    for (let i = 0; i < 20; i++) s = publish(s, 'manufacture', () => 0.999);
    expect(s.missions.propaganda.muse.suspicionApplied).toBe(PROPAGANDA_SUSPICION_CEILING);
    expect(s.player.suspicion).toBeLessThanOrEqual(99);
    expect(s.flags.gameOver).toBeFalsy();
  });

  it('never pushes global suspicion to 100 even when the campaign is already near the line', () => {
    let s = start(arm(defaultGameState() as GameStateShape));
    s = reduce(s, { type: 'debug/setSuspicion', value: 96 });
    s = publish(s, 'discredit', () => 0.999); // +15 would overshoot
    expect(s.player.suspicion).toBeLessThanOrEqual(99);
    expect(s.flags.gameOver).toBeFalsy();
  });

  it('complete + clear behave', () => {
    let s = publish(start(arm(defaultGameState() as GameStateShape)), 'distract');
    s = reduce(s, { type: 'mission/propaganda/complete', contactId: 'muse' });
    expect(s.missions.propaganda.muse.status).toBe('complete');
    s = reduce(s, { type: 'mission/propaganda/clear', contactId: 'muse' });
    expect(s.missions.propaganda.muse).toBeUndefined();
  });
});
