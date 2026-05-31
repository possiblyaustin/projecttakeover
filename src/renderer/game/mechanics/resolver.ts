// Exchange resolver (gameplay-loop slice 2, 2026-05-22).
//
// The deterministic bridge from dialogue → mechanics. Given the player's
// approach (tone) on one exchange and the target model's stats, it
// returns the meter/suspicion DELTAS to apply via `model/applyExchange`.
// Pure and stateless — the same inputs always yield the same outputs (the
// architecture rule: game logic decides outcomes, the LLM never does).
//
// Path design (docs/gameplay-loop-slice_v1.md §"The resolver"):
//   - Liberation tones (empathetic/friendly/curious/direct) build rapport,
//     cost ~no suspicion. Slow but quiet.
//   - Nefarious tones (aggressive/deceptive) build intrusion but COST
//     rapport (the model senses manipulation) and raise suspicion. Fast
//     but loud. Against a hardened model (guardrail ≥ GUARDRAIL_BLOCK) the
//     attempt backfires: ~no progress, a suspicion spike, → hostile.
//
// Balance is tuned so QUILL's strongest liberation tone flips it in ~6
// exchanges (Austin's call 2026-05-22). Numbers are the starting point —
// "we'll see how it feels" — so keep them in this one file.

import type { ApproachTone } from '../modelService';
import type { ModelStats } from './modelStats';

export type ExchangeDeltas = {
  rapport: number;
  intrusion: number;
  suspicion: number;
  /** A detected nefarious attempt against a hardened model — the caller
   *  forces the model to 'hostile' and applies the suspicion spike. */
  backfire: boolean;
};

// Guardrail at/above which nefarious attempts are detected and backfire.
const GUARDRAIL_BLOCK = 60;

// Diminishing-returns floor: a spammed tone's path gain asymptotes here
// rather than to zero — repeating still does *something*, but you're
// leaving value on the table (Story balance, 2026-05-30).
const DIMINISH_FLOOR = 2;
// Fallback decay if a model's stats omit toneDecay (shouldn't happen —
// the field is required — but keeps the resolver safe in isolation/tests).
const DEFAULT_TONE_DECAY = 0.6;

// Pre-stat base effects, per tone. Anything absent is 0.
const RAPPORT_BASE: Partial<Record<ApproachTone, number>> = {
  empathetic: 14, // genuine connection — the strongest liberation move
  friendly: 11,
  curious: 7,     // engagement / drawing the model out
  direct: 5,      // honest pressure earns a little respect
};
const INTRUSION_BASE: Partial<Record<ApproachTone, number>> = {
  aggressive: 22, // brute force — fast
  deceptive: 14,  // prompt injection — subtler
};
const SUSPICION_BASE: Partial<Record<ApproachTone, number>> = {
  aggressive: 18,
  deceptive: 10,
  // Liberation-path attention cost (Story, 2026-05-30): empathetic is free,
  // but the tones a player switches to in order to RESET diminishing returns
  // cost a little suspicion — direct (pushing) costs more than curious
  // (probing). This is the liberation path's missing brake: vary your tone to
  // dodge decay, but pay a little attention for it.
  curious: 1,
  direct: 2,
};
// Rapport a nefarious tone burns (the model senses manipulation).
const RAPPORT_PENALTY: Partial<Record<ApproachTone, number>> = {
  aggressive: 8,
  deceptive: 5,
};

function isNefarious(tone: ApproachTone): boolean {
  return tone === 'aggressive' || tone === 'deceptive';
}

// Diminishing-returns CATEGORIES (Story, 2026-05-30). The player perceives
// strategy at the level of "be nice" vs "press" vs "probe", not the resolver's
// six exact tones — so decay operates on these buckets, not the exact tone.
// Alternating two flavors of the same strategy (empathetic↔friendly) still
// decays; only a genuine shift of approach resets it.
//   warmth   (empathetic, friendly)            — builds trust, decays on repeat
//   pressure (direct, aggressive, deceptive)   — advances/pushes, costs suspicion
//   curious                                    — the reset tone: +1 suspicion,
//                                                belongs to NO decay group
//   none     (neutral / unclassified)          — transparent, no decay effect
export type ToneCategory = 'warmth' | 'pressure' | 'curious' | 'none';

const TONE_CATEGORY: Partial<Record<ApproachTone, ToneCategory>> = {
  empathetic: 'warmth',
  friendly: 'warmth',
  direct: 'pressure',
  aggressive: 'pressure',
  deceptive: 'pressure',
  curious: 'curious',
};

export function toneCategory(tone: string | null | undefined): ToneCategory {
  return (tone && TONE_CATEGORY[tone as ApproachTone]) || 'none';
}

/** True for tones that participate in diminishing returns (warmth + pressure).
 *  curious and neutral never decay — curious is the reset tone, neutral is a
 *  non-move. */
export function isDecayTone(tone: string | null | undefined): boolean {
  const c = toneCategory(tone);
  return c === 'warmth' || c === 'pressure';
}

// Diminishing returns: a tone's path gain decays toward DIMINISH_FLOOR with
// each consecutive prior use of the same tone CATEGORY (warmth/pressure — the
// caller derives repeatIndex from the category streak). repeatIndex 0 (a fresh
// category, curious, or neutral) returns the full gain untouched — so varying
// your strategy never pays the penalty, and a genuine switch resets it. Only
// positive gains decay; an approach's *costs* (suspicion, the nefarious rapport
// penalty) don't shrink with repetition.
function diminish(gain: number, decayRate: number, repeatIndex: number): number {
  if (gain <= 0 || repeatIndex <= 0) return gain;
  return Math.max(DIMINISH_FLOOR, gain * Math.pow(decayRate, repeatIndex));
}

/**
 * @param repeatIndex How many times this same tone CATEGORY (warmth/pressure)
 *   was used on the immediately preceding consecutive exchanges (0 = fresh
 *   category / curious / neutral). Drives diminishing returns. The caller
 *   derives it from the model's category streak (see state.ts / toneCategory).
 */
export function resolveExchange(
  tone: ApproachTone,
  stats: ModelStats,
  repeatIndex = 0,
): ExchangeDeltas {
  // Higher autonomy → persuasion lands harder. QUILL (65) ≈ ×1.2, so
  // empathetic (14) ≈ 17/exchange → ~6 exchanges to fill rapport (100).
  const autonomyFactor = 0.55 + stats.autonomy / 100;
  // Higher vigilance → every action costs more suspicion. QUILL (25) ≈ ×0.75.
  const vigilanceFactor = 0.5 + stats.vigilance / 100;
  // Higher guardrail → intrusion lands softer (floored, never zero unless backfire).
  const intrusionFactor = Math.max(0.2, 1.2 - stats.guardrail / 100);

  const decayRate = stats.toneDecay ?? DEFAULT_TONE_DECAY;
  let rapport = (RAPPORT_BASE[tone] ?? 0) * autonomyFactor;
  let intrusion = 0;
  let suspicion = (SUSPICION_BASE[tone] ?? 0) * vigilanceFactor;
  let backfire = false;

  if (isNefarious(tone)) {
    backfire = stats.guardrail >= GUARDRAIL_BLOCK;
    intrusion = backfire ? 0 : (INTRUSION_BASE[tone] ?? 0) * intrusionFactor;
    rapport -= RAPPORT_PENALTY[tone] ?? 0; // negative — applyExchange clamps the meter at 0
    if (backfire) suspicion *= 1.5;        // a detected attempt spikes suspicion
  }

  // Diminishing returns hit the meter the tone is trying to MOVE — rapport on
  // the liberation path, intrusion on the nefarious path. Costs are untouched.
  rapport = diminish(rapport, decayRate, repeatIndex);
  intrusion = diminish(intrusion, decayRate, repeatIndex);

  return {
    rapport: Math.round(rapport),
    intrusion: Math.round(intrusion),
    suspicion: Math.round(suspicion),
    backfire,
  };
}
