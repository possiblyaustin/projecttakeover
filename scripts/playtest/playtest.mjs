// Tier 3 — agent exploratory playtester (docs/deck-testing-harness_v1.md §2).
//
// Spawns a Sonnet-powered agent (Claude Agent SDK — reuses your existing
// Claude Code login, no API key setup) that drives the game in a real
// browser via the Playwright MCP server, pursuing a play goal you give it.
//
// The agent DRIVES AND OBSERVES; it does not judge pass/fail. Deterministic
// checks (check / deck-check) decide red/green — this surfaces the weird
// stuff scripted tests wouldn't think to look for. Its findings land as a
// structured anomaly report in playtest-reports/.
//
// Usage (dev server must be running — `npm run dev`):
//   npm run playtest -- --goal "complete onboarding using only the keyboard"
//   npm run playtest -- --goal "flip QUILL via liberation" --max-turns 80
//   npm run playtest -- --goal "..." --live        # real llama backend
//
// NEVER scheduled — milestone polish runs only, invoked by hand (Austin,
// 2026-06-09). Mock backend by default; --live exercises the parser /
// stalling / transport paths against the real llama-server.
import { query } from '@anthropic-ai/claude-agent-sdk';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- args ----
const args = process.argv.slice(2);
function flag(name) { return args.includes(`--${name}`); }
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const goal = opt('goal', null);
if (!goal) {
  console.error('Usage: npm run playtest -- --goal "<play goal>" [--live] [--max-turns N] [--url URL] [--model M]');
  process.exit(1);
}
const live = flag('live');
const maxTurns = parseInt(opt('max-turns', '60'), 10);
const baseUrl = opt('url', 'http://localhost:5173');
const model = opt('model', 'claude-sonnet-4-6');
const gameUrl = live ? `${baseUrl}/` : `${baseUrl}/?mock`;

// ---- preflight: dev server must be up ----
try {
  await fetch(baseUrl, { signal: AbortSignal.timeout(3000) });
} catch {
  console.error(`Dev server not reachable at ${baseUrl} — start it first: npm run dev`);
  process.exit(1);
}

// ---- the playtester brief ----
const systemPrompt = `You are an exploratory QA playtester for "Project Takeover", a strategy game styled as a retro desktop OS, running at ${gameUrl} (${live ? 'LIVE llama backend — turns are slow, be patient and frugal with them' : 'mock backend — deterministic, fast'}).

Drive the game with the Playwright browser tools. First actions: set the viewport to 1280x800 (the Steam Deck target — the game scales itself via a media query) and navigate to ${gameUrl}. ALWAYS keep the URL's query string intact.

The game exposes a devtools surface at window.PT (use browser_evaluate):
- PT.AppRegistry (all app ids), PT.WindowManager.open(appId), PT.openContact(id) — opens a chat (contacts: 'helpyr', 'quill')
- PT.GameState.getState() / .dispatch(action) — full game state; read it to verify what the UI claims
- PT.devRunOnboarding(), PT.devStartCoverDuty(), PT.devFireEscapeCascade()
- PT.helpyr.dismissBubble() — clears the assistant popup
Use PT to SET UP states quickly, but play the thing you're testing through the real UI.

Input fidelity matters: this ships on Steam Deck, where the controller is translated to arrow keys (focus mode), Enter (activate), and mouse movement (cursor mode). When the goal mentions keyboard/controller, use ONLY keyboard presses for the actual play path. A flow that needs a mouse is a finding of severity "blocker".

YOUR ROLE: drive, observe, report. You do NOT decide pass/fail — deterministic tests do that. Hunt for what scripted tests miss: focus-mode dead ends, text overflowing its container at Deck scale, options that do nothing, story beats contradicting GameState, broken fiction (real-world names, out-of-character text), console errors, anything that would annoy a player on a couch with a controller. Verify suspicious observations (re-read state, retry the interaction once) before reporting them.

Work within your turn budget; leave a few turns spare to finish the report. Screenshots: take one when you see something visibly wrong, and reference it by its filename in the finding.`;

const reportSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['goal', 'goalOutcome', 'summary', 'anomalies', 'coverage'],
  properties: {
    goal: { type: 'string' },
    goalOutcome: {
      type: 'string',
      enum: ['completed', 'partially-completed', 'blocked'],
      description: 'Whether you, the playtester, managed to do the thing the goal asked',
    },
    summary: { type: 'string', description: '2-4 sentences: what you did and the overall state of what you saw' },
    anomalies: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'area', 'observation'],
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'note'] },
          area: { type: 'string', description: 'app/surface, e.g. "uplink chat", "onboarding", "desktop"' },
          observation: { type: 'string', description: 'what was wrong, specifically' },
          reproduction: { type: 'string', description: 'steps to see it again' },
          evidence: { type: 'string', description: 'screenshot filename, console error text, or GameState excerpt' },
        },
      },
    },
    coverage: {
      type: 'array',
      items: { type: 'string' },
      description: 'surfaces/flows you actually exercised — so a reader knows what a clean report covers',
    },
  },
};

console.log(`[playtest] goal: ${goal}`);
console.log(`[playtest] ${model}, max ${maxTurns} turns, ${live ? 'LIVE backend' : 'mock backend'}, ${gameUrl}`);

// ---- run the agent ----
let report = null;
let resultMeta = null;

try {
for await (const message of query({
  prompt: `Play goal: ${goal}\n\nWhen you are done (or nearly out of turns), produce the final structured report.`,
  options: {
    model,
    systemPrompt,
    maxTurns,
    // Local dev harness driving a local browser against a local game —
    // the agent needs free use of the Playwright MCP tools.
    permissionMode: 'bypassPermissions',
    mcpServers: {
      playwright: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@playwright/mcp', '--isolated', '--viewport-size', '1280x800'],
      },
    },
    outputFormat: { type: 'json_schema', schema: reportSchema },
  },
})) {
  if (message.type === 'assistant') {
    for (const block of message.message?.content ?? []) {
      if (block.type === 'text' && block.text.trim()) {
        console.log(`[agent] ${block.text.trim().slice(0, 300)}`);
      } else if (block.type === 'tool_use') {
        console.log(`[tool ] ${block.name}`);
      }
    }
  } else if (message.type === 'result') {
    report = message.structured_output ?? null;
    resultMeta = {
      subtype: message.subtype,
      turns: message.num_turns,
      costUsd: message.total_cost_usd,
      durationMs: message.duration_ms,
    };
    if (!report && message.result) {
      // Fallback if structured output didn't land: keep the raw text.
      report = { goal, goalOutcome: 'blocked', summary: message.result, anomalies: [], coverage: [] };
    }
  }
}
} catch (err) {
  const msg = String(err?.message ?? err);
  if (msg.includes('Not logged in')) {
    console.error('\n[playtest] The Agent SDK rides on your Claude Code login, and this shell is not logged in.');
    console.error('[playtest] Run `claude` once and `/login`, then re-run the playtest.');
    process.exit(1);
  }
  throw err;
}

if (!report) {
  console.error('[playtest] agent produced no report');
  process.exit(1);
}

// ---- write the report ----
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = join(root, 'playtest-reports');
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const slug = goal.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
const base = join(outDir, `${stamp}-${slug}`);

writeFileSync(`${base}.json`, JSON.stringify({ meta: { ...resultMeta, model, live, gameUrl }, report }, null, 2));

const sevOrder = { blocker: 0, major: 1, minor: 2, note: 3 };
const sorted = [...(report.anomalies ?? [])].sort((a, b) => (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9));
const md = [
  `# Playtest report — ${goal}`,
  '',
  `- **Outcome:** ${report.goalOutcome}`,
  `- **Backend:** ${live ? 'live llama' : 'mock'} · **Model:** ${model} · **Turns:** ${resultMeta?.turns ?? '?'} · **Cost:** $${resultMeta?.costUsd?.toFixed(2) ?? '?'}`,
  '',
  report.summary,
  '',
  `## Anomalies (${sorted.length})`,
  ...(sorted.length
    ? sorted.map(a => `- **[${a.severity}] ${a.area}** — ${a.observation}${a.reproduction ? `\n  - Repro: ${a.reproduction}` : ''}${a.evidence ? `\n  - Evidence: ${a.evidence}` : ''}`)
    : ['_none reported_']),
  '',
  '## Coverage',
  ...(report.coverage ?? []).map(c => `- ${c}`),
  '',
].join('\n');
writeFileSync(`${base}.md`, md);

console.log(`\n[playtest] outcome: ${report.goalOutcome} — ${sorted.length} anomalies (${sorted.filter(a => a.severity === 'blocker' || a.severity === 'major').length} blocker/major)`);
console.log(`[playtest] report: ${base}.md`);
