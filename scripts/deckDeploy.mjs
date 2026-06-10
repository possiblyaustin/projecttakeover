#!/usr/bin/env node
// deck-deploy — push a build to the Steam Deck and (re)start it there.
//
//   npm run deck:deploy                 build + push dist + restart game server
//   npm run deck:deploy -- --llama      …and (re)start llama-server too
//   npm run deck:deploy -- --no-build   push whatever is already in dist/
//   npm run deck:deploy -- --host 192.168.169.164 --user deck
//
// Uses Windows' built-in OpenSSH client (ssh/scp). One-time Deck setup
// (enable sshd, install the key) is documented in
// docs/deck-remote-testing_v1.md. After deploy, the Deck browser plays
// at http://<deck>:8000/ — deckServe.py serves dist/ and proxies
// /llama to the Deck-local llama-server, so no URL flags are needed.
//
// Remote layout (created on first deploy):
//   ~/projecttakeover/dist/         the built game
//   ~/projecttakeover/deckServe.py  static server + /llama proxy
//   ~/projecttakeover/deck-llama.sh llama-server launch (Vulkan/E4B)
//   ~/projecttakeover/serve.log, llama.log

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const argv = process.argv.slice(2);

function flagValue(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
}
const host = flagValue('--host', 'steamdeck');
const user = flagValue('--user', 'deck');
const port = flagValue('--port', '8000');
const doBuild = !argv.includes('--no-build');
const doLlama = argv.includes('--llama');
const target = `${user}@${host}`;
// BatchMode: any auth/hostkey prompt FAILS instead of hanging the deploy
// waiting on stdin that will never answer (first live run hung exactly
// this way). If a run fails with "Permission denied", redo the key
// install step in docs/deck-remote-testing_v1.md.
const SSH_OPTS = [
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=accept-new',
  '-o', 'ConnectTimeout=10',
];

function run(cmd, args, opts = {}) {
  const pretty = `${cmd} ${args.join(' ')}`;
  console.log(`> ${pretty}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts });
  if (r.status !== 0) {
    console.error(`deck-deploy: "${pretty}" exited ${r.status ?? r.error?.message}`);
    process.exit(1);
  }
}
const ssh = (remoteCmd) => run('ssh', [...SSH_OPTS, target, remoteCmd]);

// 1. Build.
if (doBuild) {
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
    cwd: repoRoot,
    shell: process.platform === 'win32', // npm.cmd needs a shell on Windows
  });
}
if (!existsSync(join(repoRoot, 'dist', 'index.html'))) {
  console.error('deck-deploy: dist/index.html missing — build failed or --no-build with no prior build');
  process.exit(1);
}
const version = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version;

// 2. Push. Clean dist first so deleted files don't linger.
ssh('mkdir -p ~/projecttakeover && rm -rf ~/projecttakeover/dist');
run('scp', [...SSH_OPTS, '-r', '-q', join(repoRoot, 'dist'), `${target}:projecttakeover/`]);
run('scp', [
  ...SSH_OPTS, '-q',
  join(here, 'deck', 'deckServe.py'),
  join(here, 'deck', 'deck-llama.sh'),
  join(here, 'deck', 'deck-restart.sh'),
  `${target}:projecttakeover/`,
]);

// 3. (Re)start everything via the on-Deck script. Inline ssh one-liners
// for this proved fragile across the PowerShell→ssh→bash quoting layers
// (see deck-restart.sh's header for the post-mortem); a real script has
// one quoting layer and can be run by hand on the Deck when debugging.
ssh(`bash ~/projecttakeover/deck-restart.sh ${doLlama ? '--llama ' : ''}${port}`);

console.log(`\ndeck-deploy: v${version} live at http://${host}:${port}/`);
if (!doLlama) {
  console.log('(llama-server untouched — pass --llama to restart it, or it may already be running)');
}
