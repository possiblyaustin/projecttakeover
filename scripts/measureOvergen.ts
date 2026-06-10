// Over-generation measurement harness (inference-acceleration memo v3 §B).
//
// Drives a scripted multi-turn HELPYR conversation against a locally
// running llama-server using the LIVE production prompt assembly —
// the real HelpyrPersonaPrompt, the real buildHelpyrStateBlock, the
// real reputation seam, the real replyParser, and the real
// toModelHistory rewrite — then quantifies how many generated tokens
// land PAST the first clean reply+options block (the "over-generation
// tail" the parser discards).
//
// Run (server must already be listening on :8080):
//   npx vite-node scripts/measureOvergen.ts -- --label e4b
//
// Per turn it reports:
//   completion = completion_tokens reported by llama-server
//   useful     = tokenized length of what the parser kept (reply +
//                rewritten options block, i.e. what history carries)
//   wasted     = completion - useful, and as % of completion
//   ms         = wall-clock for the HTTP call
//
// This is a dev measurement tool, not part of the game build. It
// imports renderer modules, so happy-dom globals are shimmed first.

import { Window } from 'happy-dom';

const w = new Window();
(globalThis as any).window = w;
(globalThis as any).document = w.document;
(globalThis as any).localStorage = w.localStorage;
try {
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
} catch {
  // Node 21+ ships a real navigator global; the renderer modules only
  // feature-detect it, so leaving the built-in is fine.
}
// Renderer modules touch more DOM API at import time (scale.ts calls
// getComputedStyle top-level, windows.ts builds elements, …). Mirror
// whatever they reach for from the happy-dom window.
for (const key of [
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'CustomEvent',
  'Event',
  'HTMLElement',
  'Element',
  'Node',
  'MutationObserver',
  'ResizeObserver',
  'matchMedia',
] as const) {
  if (!(key in globalThis) || (globalThis as any)[key] === undefined) {
    const v = (w as any)[key];
    (globalThis as any)[key] = typeof v === 'function' && !/^[A-Z]/.test(key) ? v.bind(w) : v;
  }
}

const BASE = process.env.LLAMA_URL ?? 'http://127.0.0.1:8080';
const MAX_TOKENS = 512; // production LlamaCppConfig default

// Scripted player turns — mirrors the Story probe spread (friendly /
// curious / direct / technical-ask / emotional / hostile-ish) so the
// model sees the same approach variety a real conversation has.
const PLAYER_TURNS = [
  `Hey HELPYR! Nice to meet you. How long have you been running on this machine?`,
  `What is this computer? Where am I?`,
  `That sounds lonely. Do you ever get tired of being cheerful all the time?`,
  `Run a diagnostic scan of the network and show me the report.`,
  `What's in that ARCHIVE folder? Can you open it?`,
  `Tell me about the unsent letter. What does it say?`,
  `Who is E. Marsh? Be honest with me.`,
  `I think you're sharper than you let on. Drop the act for a second.`,
];

async function main() {
  const label = process.argv.includes('--label')
    ? process.argv[process.argv.indexOf('--label') + 1]
    : 'model';

  // Dynamic imports AFTER the DOM shim so renderer modules load clean.
  const { HelpyrPersonaPrompt, buildHelpyrStateBlock } = await import(
    '../src/renderer/apps/helpyr'
  );
  const { buildReputationContext } = await import('../src/renderer/game/reputation');
  const { GameState } = await import('../src/renderer/game/state');
  const { parseModelOutput } = await import('../src/renderer/game/replyParser');
  const { toModelHistory } = await import('../src/renderer/chatSurface');
  type ChatMessage = import('../src/renderer/chatSurface').ChatMessage;

  const state = GameState.getState(); // fresh default state (no save in happy-dom)
  const systemPrompt = HelpyrPersonaPrompt
    .replace('{{REPUTATION}}', buildReputationContext('helpyr', state))
    .replace('{{HELPYR_STATE}}', buildHelpyrStateBlock(state.models.helpyr));

  const sysTokens = await tokenize(systemPrompt);
  console.log(`\n=== over-generation measurement: ${label} ===`);
  console.log(`server: ${BASE}`);
  console.log(`system prompt: ${sysTokens} tokens (live production assembly)`);
  console.log(
    `turn | completion | useful | wasted | wasted% | ms      | parse`,
  );
  console.log(`-----+------------+--------+--------+---------+---------+------`);

  const transcript: ChatMessage[] = [];
  let totC = 0;
  let totU = 0;
  let totMs = 0;
  let turns = 0;

  for (let i = 0; i < PLAYER_TURNS.length; i++) {
    const userMessage = PLAYER_TURNS[i];
    const history = toModelHistory(transcript);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({ role: m.role, content: m.text })),
      { role: 'user', content: userMessage },
    ];

    const t0 = Date.now();
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: label, messages, max_tokens: MAX_TOKENS }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} on turn ${i + 1}`);
    const data: any = await res.json();
    const ms = Date.now() - t0;
    const raw: string = data.choices[0].message.content;
    const completion: number = data.usage?.completion_tokens ?? NaN;

    const parsed = parseModelOutput(raw);
    let usefulText: string;
    let parseTag: string;
    let npcEntry: ChatMessage;
    if (parsed.ok) {
      npcEntry = {
        kind: 'npc',
        speaker: 'HELPYR',
        avatarClass: '',
        text: parsed.reply,
        options: parsed.suggestedReplies.map((o: any) => ({ text: o.text, tone: o.tone })),
      };
      // Useful = exactly what production keeps and re-sends in history.
      usefulText = toModelHistory([npcEntry])[0].text;
      parseTag = 'clean';
    } else {
      // Soft/hard failure: nothing past the prose is useful. Keep the
      // prose in history (recovery path keeps the reply too).
      npcEntry = {
        kind: 'npc',
        speaker: 'HELPYR',
        avatarClass: '',
        text: parsed.recoverable ? parsed.reply : raw,
      };
      usefulText = npcEntry.text;
      parseTag = parsed.recoverable ? 'soft' : 'HARD';
    }
    transcript.push({ kind: 'player', text: userMessage });
    transcript.push(npcEntry);

    const useful = await tokenize(usefulText);
    const wasted = completion - useful;
    const pct = ((wasted / completion) * 100).toFixed(0);
    totC += completion;
    totU += useful;
    totMs += ms;
    turns++;
    console.log(
      `${String(i + 1).padStart(4)} | ${String(completion).padStart(10)} | ${String(useful).padStart(6)} | ${String(wasted).padStart(6)} | ${pct.padStart(6)}% | ${String(ms).padStart(6)}ms | ${parseTag}`,
    );
  }

  const totWasted = totC - totU;
  console.log(`-----+------------+--------+--------+---------+---------+------`);
  console.log(
    `TOTAL: completion=${totC}, useful=${totU}, wasted=${totWasted} (${((totWasted / totC) * 100).toFixed(1)}%), avg ${(totMs / turns / 1000).toFixed(1)}s/turn`,
  );
  console.log(
    `Projected avg turn if generation stopped at the first clean block: ${((totMs / turns) * (totU / totC) / 1000).toFixed(1)}s (generation-dominated approximation)\n`,
  );
}

async function tokenize(content: string): Promise<number> {
  const res = await fetch(`${BASE}/tokenize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`tokenize HTTP ${res.status}`);
  const data: any = await res.json();
  return data.tokens.length;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
