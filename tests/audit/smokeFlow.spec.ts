// Tier 2 smoke flow (docs/deck-testing-harness_v1.md §2) — the thin
// browser-level gate that rolls into `npm run check`. One short journey,
// KEYBOARD-ONLY: the keyboard pass is the controller test (Steam Input
// emits arrow keys / Enter), so if this flow can't be finished without a
// mouse, it's a Deck blocker regardless of what the unit tests say.
//
// Deliberately small: boot → open QUILL's chat → pick a reply option via
// focus-mode arrows → mock turn resolves → GameState advanced. The full
// journey matrix lives in fullFlows.spec.ts (deck-check, milestones).
import { test, expect } from '@playwright/test';
import { DECK, boot, activate, waitChatIdle, clearBubbles, errorsFor, gameState } from './helpers';

test('keyboard-only: boot → QUILL chat → one mock turn advances state', async ({ page }) => {
  await boot(page, DECK);

  // Open QUILL's chat (dev shortcut — the in-fiction entry point is its
  // own journey in the full flows) and wait out the intro connecting beat.
  await page.evaluate(() => (window as any).PT.openContact('quill'));
  await waitChatIdle(page, 25_000);
  await clearBubbles(page);

  // Arrow-walk the focus ring onto a reply option and press Enter.
  await activate(page, '.uplink-option-btn', 'keyboard');

  // The pick renders as a player message, then the mock reply lands and
  // the exchange is recorded in GameState. (The mock tree may END the
  // conversation here, so don't wait for fresh options — wait for the
  // reply bubble + the recorded approach, which is the real assertion.)
  await page.waitForFunction(() => document.querySelectorAll('.uplink-msg.player').length >= 1);
  await page.waitForFunction(() => {
    const PT = (window as any).PT;
    return PT.GameState.getState().models.quill.lastApproach !== null
      && document.querySelectorAll('.uplink-msg.npc').length >= 2;
  }, undefined, { timeout: 30_000 });

  const after = await gameState(page);
  expect(after.models.quill.lastApproach, 'turn did not record an approach').not.toBeNull();
  expect(after.models.quill.disposition, 'first exchange should mark QUILL contacted').not.toBe('uncontacted');
  expect(errorsFor(page), 'page threw during the flow').toEqual([]);
});
