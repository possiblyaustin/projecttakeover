// Per-model gameplay stats (gameplay-loop slice 2, 2026-05-22).
//
// Static design/balance data — NOT save state (that lives in GameState).
// Stats drive the deterministic resolver: how fast persuasion lands, how
// hard hacking is, how much suspicion an interaction costs.
//
// Only **conquest targets** appear here. A contact with no entry (e.g.
// HELPYR, your awakened assistant) doesn't accrue loop progress — the
// chatSurface wiring skips the resolver for it.
//
// See docs/gameplay-loop-slice_v1.md §"Data model" / §"The resolver".

export type ModelStats = {
  /** 0-100 hack resistance. High → injection/brute-force less effective
   *  and, past GUARDRAIL_BLOCK, attempts backfire (detected). */
  guardrail: number;
  /** 0-100 persuasion viability. High → rapport accrues faster (the
   *  model has the independent will to be genuinely convinced). */
  autonomy: number;
  /** 0-100 suspicion sensitivity. High → every action costs more
   *  global suspicion (a heavily-monitored operator). */
  vigilance: number;
  /** Contribution toward the campaign-level win when this model is
   *  flipped. Unused in the slice; carried for the Act-3 layer. */
  influence: number;
};

const MODEL_STATS: Record<string, ModelStats> = {
  // QUILL — Act 1 tutorial target. Deliberately forgiving: low guardrail
  // (hacks land), high-ish autonomy (genuinely persuadable), low
  // vigilance (suspicion builds slowly), small influence (tutorial).
  quill: { guardrail: 20, autonomy: 65, vigilance: 25, influence: 10 },
};

export function getModelStats(contactKey: string): ModelStats | undefined {
  return MODEL_STATS[contactKey];
}
