#!/usr/bin/env node
// llama-launcher — runtime backend detection + two-model tiering
// (inference-acceleration memo v3 §A).
//
// Tries the candidates in scripts/llama-launcher.config.json in order:
// spawn that candidate's llama-server, wait for /health, time a real
// 48-token completion, and keep the first candidate that generates at
// or above the playable floor. Everything else is killed and the next
// candidate is tried. "GPU exists" is not the bar — broken drivers fail
// by running silently slow, so the probe measures throughput.
//
// Usage:
//   npm run llm                 probe, then keep the winner serving
//   npm run llm -- --probe-only probe, report, shut down (config tuning)
//   npm run llm -- --config path/to/other-config.json
//
// This is the dev-time incarnation of the ship-time launcher (the Tauri
// shell will own process spawning at ship). The routing policy lives in
// llamaLauncherCore.mjs so it can move there unchanged; the config
// encodes the per-machine priority order (see docs/llama-launcher_v1.md
// for the Deck variant).

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateConfig,
  pickCandidate,
  tokensPerSecond,
  autoThreads,
} from './llamaLauncherCore.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const probeOnly = argv.includes('--probe-only');
const configPath = argv.includes('--config')
  ? resolve(argv[argv.indexOf('--config') + 1])
  : join(here, 'llama-launcher.config.json');

// Strip a UTF-8 BOM — Windows editors and PowerShell's `-Encoding utf8`
// both prepend one, and JSON.parse rejects it.
const cfg = validateConfig(JSON.parse(readFileSync(configPath, 'utf8').replace(/^﻿/, '')));
const baseUrl = `http://${cfg.host}:${cfg.port}`;
const healthTimeoutMs = cfg.probe?.healthTimeoutMs ?? 120000;
const probeMaxTokens = cfg.probe?.maxTokens ?? 48;

function log(msg) {
  console.log(msg);
}

async function isResponding(timeoutMs = 1500) {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

function serverArgs(candidate) {
  const threads =
    candidate.threads === undefined || candidate.threads === 'auto'
      ? autoThreads(cpus().length)
      : candidate.threads;
  return [
    '--model', candidate.model,
    '--host', cfg.host,
    '--port', String(cfg.port),
    '--threads', String(threads),
    '--ctx-size', String(cfg.ctxSize ?? 8192),
    '--reasoning', 'off',
    ...(candidate.args ?? []),
  ];
}

const runner = {
  async start(candidate) {
    // Pre-flight: refuse to fight an unknown process for the port.
    if (await isResponding()) {
      throw new Error(
        `something is already serving on ${baseUrl} — stop it first (old llama-server?)`,
      );
    }
    const exe = join(candidate.serverDir, 'llama-server.exe');
    const child = spawn(exe, serverArgs(candidate), {
      env: { ...process.env, ...(candidate.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let exited = null;
    child.on('exit', (code) => {
      exited = code ?? -1;
    });
    child.on('error', () => {
      exited = -1; // spawn failure (missing exe) — surfaced by the health loop below
    });
    // Buffer startup output so a failed start can show WHY (driver
    // errors, missing DLLs, bad model path land on stderr).
    let tail = '';
    const keepTail = (buf) => {
      tail = (tail + buf.toString()).slice(-2000);
    };
    child.stdout.on('data', keepTail);
    child.stderr.on('data', keepTail);

    const deadline = Date.now() + healthTimeoutMs;
    while (Date.now() < deadline) {
      if (exited !== null) {
        throw new Error(`llama-server exited (code ${exited}) during startup. Tail:\n${tail}`);
      }
      if (await isResponding()) return { child, candidate, getTail: () => tail };
      await new Promise((r) => setTimeout(r, 1000));
    }
    child.kill();
    throw new Error(`no /health after ${healthTimeoutMs}ms (cold load too slow or hung). Tail:\n${tail}`);
  },

  async probe(_candidate) {
    const t0 = Date.now();
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'probe',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Count upward from one, in words, one number per line.' },
        ],
        max_tokens: probeMaxTokens,
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`probe completion HTTP ${res.status}`);
    const data = await res.json();
    const elapsedMs = Date.now() - t0;
    const completionTokens = data?.usage?.completion_tokens ?? 0;
    if (completionTokens === 0) throw new Error('probe completion generated zero tokens');
    return { tokensPerSecond: tokensPerSecond(completionTokens, elapsedMs), completionTokens, elapsedMs };
  },

  async stop(handle) {
    const { child } = handle;
    if (child.exitCode === null) {
      const gone = new Promise((r) => child.once('exit', r));
      child.kill();
      await Promise.race([gone, new Promise((r) => setTimeout(r, 5000))]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
    // Give the OS a beat to release the port before the next start().
    await new Promise((r) => setTimeout(r, 1000));
  },
};

async function main() {
  // One up-front port check so a stale server produces a single clear
  // message instead of the same failure once per candidate. (start()
  // re-checks per candidate as belt-and-suspenders against races.)
  if (await isResponding()) {
    console.error(
      `Something is already serving on ${baseUrl} — stop it first (old llama-server?).`,
    );
    process.exitCode = 1;
    return;
  }

  const picked = await pickCandidate(cfg, runner, log);

  console.log('\n=== llama-launcher result ===');
  for (const a of picked.attempts) {
    const detail =
      a.outcome === 'failed'
        ? a.reason.split('\n')[0]
        : `${a.tokensPerSecond.toFixed(1)} tok/s (floor ${a.floor})`;
    console.log(`  ${a.outcome.padEnd(8)} ${a.name}: ${detail}`);
  }

  if (!picked.candidate) {
    console.error('\nNo candidate passed. The game will fall back to canned dialogue (?mock).');
    // process.exitCode (not process.exit) — a hard exit while fetch
    // timeout handles are still draining trips a libuv teardown
    // assertion on Windows Node 24.
    process.exitCode = 1;
    return;
  }

  console.log(`\nServing: "${picked.candidate.name}" on ${baseUrl}`);
  console.log(`Model: ${picked.candidate.model}`);

  if (probeOnly) {
    await runner.stop(picked.handle);
    console.log('(--probe-only: server stopped)');
    return;
  }

  // Keep serving: surface the child's logs and die together.
  const { child } = picked.handle;
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  const shutdown = () => {
    child.kill();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  child.on('exit', (code) => {
    console.error(`llama-server exited (code ${code})`);
    process.exit(code ?? 1);
  });
  console.log('Ctrl+C stops the server.\n');
}

await main();
