import { defineConfig } from 'vitest/config';

// Vitest config sits separate from vite.config.js because the build's
// `root` is src/renderer (so vite serves the desktop), but tests live
// at the repo root in `tests/` and import from `src/renderer/...`. A
// separate config keeps each tool aimed at the right place.
//
// happy-dom gives us window + localStorage for tests that touch the
// reducer's persistence layer. Pure-function tests (replyParser,
// approachClassifier, reputation) don't depend on it but pay nothing
// for it being on.

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    globals: false,
    clearMocks: true,
    restoreMocks: true,
  },
});
