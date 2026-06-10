// Playwright config for the Deck testing harness (Tier 2 / 2.5 —
// docs/deck-testing-harness_v1.md). Run via `npm run deck-check`.
//
// Everything here targets the Vite dev server with `?mock` (the live
// llamacpp backend is the app default; tooling must force the offline
// mock or every turn spams fallbacks — see modelServiceFactory.ts).
// The webServer block reuses an already-running `npm run dev`, so
// deck-check works mid-session without a second server fighting over
// the port.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/audit',
  // Audit tests mutate shared game state (localStorage) within a page,
  // but each test gets a fresh context, so parallel workers are safe.
  fullyParallel: true,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5173',
    // Chromium only — the Deck browser and the future Tauri webview are
    // both Chromium-family; cross-browser coverage isn't the goal here.
    browserName: 'chromium',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
