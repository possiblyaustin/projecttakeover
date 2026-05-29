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
    // Dev-only: forward the game's same-origin `/llama/*` calls to the
    // local llama-server on 127.0.0.1:8080. A LAN client (Steam Deck at
    // http://<dev-PC-IP>:5173) reaches inference THROUGH this already-
    // LAN-bound dev server, so llama-server itself stays bound to
    // localhost only — docs/llama-setup_v1.md keeps it on 127.0.0.1 on
    // purpose (no LAN exposure of the dev model). The shipped Tauri build
    // talks to llama directly and never uses this proxy.
    proxy: {
      '/llama': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/llama/, ''),
      },
    },
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
