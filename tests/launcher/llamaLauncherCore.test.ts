// llama-launcher routing core — pure-logic tests. The runner is faked,
// so these pin the POLICY (try in order, throughput floor, cleanup,
// fall-through, exhaustion) without spawning anything.

import { describe, it, expect } from 'vitest';
import {
  pickCandidate,
  tokensPerSecond,
  autoThreads,
  validateConfig,
  minTokensPerSecondFor,
  DEFAULT_MIN_TOKENS_PER_SECOND,
  // @ts-expect-error — plain .mjs module without type declarations; the
  // launcher is dev tooling, not game code, so no .d.ts ceremony.
} from '../../scripts/llamaLauncherCore.mjs';

type Attempt = { name: string; outcome: string; reason?: string };

function cfgWith(candidates: object[], probe?: object) {
  return validateConfig({
    host: '127.0.0.1',
    port: 8080,
    ...(probe ? { probe } : {}),
    candidates,
  });
}

function cand(name: string, extra: object = {}) {
  return { name, serverDir: 'C:/llm/x', model: 'C:/llm/models/m.gguf', ...extra };
}

/** Scriptable fake runner. Per-candidate behavior:
 *   'pass:<tps>'  start ok, probe at tps
 *   'slow:<tps>'  same (caller sets floor above it)
 *   'nostart'     start throws
 *   'noprobe'     start ok, probe throws
 */
function fakeRunner(script: Record<string, string>) {
  const events: string[] = [];
  return {
    events,
    async start(c: { name: string }) {
      events.push(`start:${c.name}`);
      if (script[c.name] === 'nostart') throw new Error('exe missing');
      return { name: c.name };
    },
    async probe(c: { name: string }) {
      events.push(`probe:${c.name}`);
      const s = script[c.name];
      if (s === 'noprobe') throw new Error('probe HTTP 500');
      const tps = Number(s.split(':')[1]);
      return { tokensPerSecond: tps };
    },
    async stop(handle: { name: string }) {
      events.push(`stop:${handle.name}`);
    },
  };
}

describe('tokensPerSecond', () => {
  it('computes tokens over elapsed seconds', () => {
    expect(tokensPerSecond(48, 2000)).toBe(24);
  });
  it('returns 0 on degenerate inputs instead of NaN/Infinity', () => {
    expect(tokensPerSecond(0, 2000)).toBe(0);
    expect(tokensPerSecond(48, 0)).toBe(0);
    expect(tokensPerSecond(undefined, 1000)).toBe(0);
  });
});

describe('autoThreads', () => {
  it('caps at 8 (generation is bandwidth-bound past 8, measured on X2 Elite)', () => {
    expect(autoThreads(18)).toBe(8);
    expect(autoThreads(32)).toBe(8);
  });
  it('leaves 2 cores for the game on small parts, floor of 2', () => {
    expect(autoThreads(8)).toBe(6);
    expect(autoThreads(4)).toBe(2);
    expect(autoThreads(2)).toBe(2);
    expect(autoThreads(1)).toBe(2);
  });
});

describe('validateConfig', () => {
  it('accepts a minimal valid config', () => {
    expect(() => cfgWith([cand('a')])).not.toThrow();
  });
  it('rejects missing candidates, bad port, bad threads', () => {
    expect(() => validateConfig({ host: 'h', port: 8080, candidates: [] })).toThrow(/candidates/);
    expect(() => validateConfig({ host: 'h', port: '8080', candidates: [cand('a')] })).toThrow(/port/);
    expect(() => cfgWith([cand('a', { threads: 'four' })])).toThrow(/threads/);
  });
  it('names the offending candidate in the error', () => {
    expect(() => cfgWith([cand('adreno-e4b', { args: 'not-an-array' })])).toThrow(/adreno-e4b/);
  });
});

describe('minTokensPerSecondFor', () => {
  it('candidate override > global probe setting > default', () => {
    const cfg = cfgWith([cand('a', { minTokensPerSecond: 5 }), cand('b')], {
      minTokensPerSecond: 20,
    });
    expect(minTokensPerSecondFor(cfg.candidates[0], cfg)).toBe(5);
    expect(minTokensPerSecondFor(cfg.candidates[1], cfg)).toBe(20);
    expect(minTokensPerSecondFor(cand('c'), cfgWith([cand('c')]))).toBe(
      DEFAULT_MIN_TOKENS_PER_SECOND,
    );
  });
});

describe('pickCandidate', () => {
  it('keeps the first candidate that passes and leaves it running', async () => {
    const runner = fakeRunner({ gpu: 'pass:22' });
    const result = await pickCandidate(cfgWith([cand('gpu'), cand('cpu')]), runner);
    expect(result.candidate.name).toBe('gpu');
    expect(runner.events).toEqual(['start:gpu', 'probe:gpu']); // never stopped, cpu never tried
    expect(result.attempts).toEqual([
      { name: 'gpu', outcome: 'passed', tokensPerSecond: 22, floor: 12 },
    ]);
  });

  it('falls through a candidate that starts but generates below the floor, stopping it first', async () => {
    const runner = fakeRunner({ gpu: 'slow:6', cpu: 'pass:30' });
    const result = await pickCandidate(cfgWith([cand('gpu'), cand('cpu')]), runner);
    expect(result.candidate.name).toBe('cpu');
    expect(runner.events).toEqual(['start:gpu', 'probe:gpu', 'stop:gpu', 'start:cpu', 'probe:cpu']);
    expect(result.attempts[0]).toMatchObject({ name: 'gpu', outcome: 'too_slow' });
  });

  it('falls through start failures without calling stop (nothing started)', async () => {
    const runner = fakeRunner({ gpu: 'nostart', cpu: 'pass:30' });
    const result = await pickCandidate(cfgWith([cand('gpu'), cand('cpu')]), runner);
    expect(result.candidate.name).toBe('cpu');
    expect(runner.events).toEqual(['start:gpu', 'start:cpu', 'probe:cpu']);
    expect(result.attempts[0]).toMatchObject({ name: 'gpu', outcome: 'failed', reason: 'exe missing' });
  });

  it('stops a candidate whose probe throws (server is up but broken)', async () => {
    const runner = fakeRunner({ gpu: 'noprobe', cpu: 'pass:30' });
    const result = await pickCandidate(cfgWith([cand('gpu'), cand('cpu')]), runner);
    expect(result.candidate.name).toBe('cpu');
    expect(runner.events).toEqual(['start:gpu', 'probe:gpu', 'stop:gpu', 'start:cpu', 'probe:cpu']);
  });

  it('respects per-candidate floors (a deliberately lenient last-resort tier)', async () => {
    const runner = fakeRunner({ gpu: 'slow:10', cpu: 'pass:10' });
    const cfg = cfgWith([cand('gpu'), cand('cpu', { minTokensPerSecond: 8 })]);
    const result = await pickCandidate(cfg, runner);
    expect(result.candidate.name).toBe('cpu'); // same 10 tok/s, different floors
  });

  it('returns candidate:null with the full attempt log when everything fails', async () => {
    const runner = fakeRunner({ gpu: 'nostart', cpu: 'slow:3' });
    const result = await pickCandidate(cfgWith([cand('gpu'), cand('cpu')]), runner);
    expect(result.candidate).toBeNull();
    expect(result.attempts.map((a: Attempt) => a.outcome)).toEqual(['failed', 'too_slow']);
    expect(runner.events).toContain('stop:cpu'); // the slow one was cleaned up
  });

  it('survives stop() itself throwing during fall-through', async () => {
    const runner = fakeRunner({ gpu: 'noprobe', cpu: 'pass:30' });
    runner.stop = async () => {
      throw new Error('kill failed');
    };
    const result = await pickCandidate(cfgWith([cand('gpu'), cand('cpu')]), runner);
    expect(result.candidate.name).toBe('cpu');
  });
});
