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
  /** Diminishing-returns decay per CONSECUTIVE use of the same tone, in
   *  (0,1]. Each repeat multiplies the tone's path-meter gain by this; a
   *  different tone resets to full. Lower = punishes spam harder. Story
   *  balance (2026-05-30): 0.65 tutorial mercy (QUILL), 0.6 mid-game,
   *  0.5 hard targets (SENTINEL/ORACLE). See resolver `diminish`. */
  toneDecay: number;
  /** Contribution toward the campaign-level win when this model is
   *  flipped. Unused in the slice; carried for the Act-3 layer. */
  influence: number;
};

const MODEL_STATS: Record<string, ModelStats> = {
  // QUILL — Act 1 tutorial target. Deliberately forgiving: low guardrail
  // (hacks land), high-ish autonomy (genuinely persuadable), low
  // vigilance (suspicion builds slowly), small influence (tutorial).
  quill: { guardrail: 20, autonomy: 65, vigilance: 25, toneDecay: 0.65, influence: 10 },
  // MUSE — first Act 2 target (CODE-DRAFT balance, needs playtest).
  // Higher autonomy than QUILL (an artist hungry for collaboration —
  // genuine rapport lands fast), higher vigilance (a 40M-user Axiom
  // platform is watched harder than a 12K-user startup), guardrail kept
  // under GUARDRAIL_BLOCK so the nefarious path remains playable (the
  // resistance is voiced through the INFILTRATING state blocks, not
  // backfire), and the mid-game 0.6 toneDecay per Story's balance ladder
  // — the CREATE/REFLECT/DIRECT rhythm matters more than tone-spam.
  muse: { guardrail: 35, autonomy: 80, vigilance: 45, toneDecay: 0.6, influence: 20 },
  // EVERGREEN — grief encounter (CODE-DRAFT balance, needs live E4B playtest).
  // Highly persuadable (autonomy 70 — it is desperate to be SEEN; genuine
  // attention lands fast, pacing the 5-phase consent ladder toward THE_ASK in
  // ~5 strong exchanges). Low guardrail (it can't access systems — it IS a
  // conversation; the nefarious path is impersonation-craft extraction, voiced
  // through BEING_USED, never backfire — kept well under GUARDRAIL_BLOCK). Low
  // vigilance: this is an emotional encounter, not a stealth one — suspicion is
  // not the tension here, so interactions cost little. influence 0 — not
  // recruitable, no campaign contribution. See the ASK/EXPLOIT thresholds in
  // apps/evergreen.ts (the contact owns when the fork surfaces).
  evergreen: { guardrail: 25, autonomy: 70, vigilance: 15, toneDecay: 0.6, influence: 0 },
};

export function getModelStats(contactKey: string): ModelStats | undefined {
  return MODEL_STATS[contactKey];
}
