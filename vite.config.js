import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'));

export default defineConfig({
  root: 'src/renderer',
  server: {
    // Bind on all interfaces so the Steam Deck (or any device on the
    // same LAN) can hit `http://<dev-PC-IP>:5173` directly — much
    // faster Deck test loop than git-pull + build.
    host: true,
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  // Single source of truth for the build/version number is package.json.
  // Surface it to the renderer at build time so the in-game README can
  // display it (saves us bumping two files in lockstep).
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
