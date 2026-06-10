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
const SSH_OPTS = ['-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=10'];

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
  `${target}:projecttakeover/`,
]);

// 3. (Re)start the game server. pkill -f is precise enough: the
// pattern only matches our own serve process.
ssh(
  `pkill -f 'deckServe.py' || true; cd ~/projecttakeover && ` +
    `nohup python3 deckServe.py --dir ~/projecttakeover/dist --port ${port} ` +
    `> serve.log 2>&1 & sleep 1; pgrep -f deckServe.py > /dev/null && echo 'game server up' || ` +
    `{ echo 'game server FAILED — serve.log:'; tail -5 serve.log; exit 1; }`,
);

// 4. Optionally (re)start llama-server.
if (doLlama) {
  ssh(
    `pkill -f 'llama-server' || true; cd ~/projecttakeover && chmod +x deck-llama.sh && ` +
      `nohup ./deck-llama.sh > llama.log 2>&1 & sleep 2; pgrep -f llama-server > /dev/null && ` +
      `echo 'llama-server starting (E4B cold load ~30s — watch llama.log)' || ` +
      `{ echo 'llama-server FAILED — llama.log:'; tail -5 llama.log; exit 1; }`,
  );
}

console.log(`\ndeck-deploy: v${version} live at http://${host}:${port}/`);
if (!doLlama) {
  console.log('(llama-server untouched — pass --llama to restart it, or it may already be running)');
}
