// Tier 2 full journey flows (docs/deck-testing-harness_v1.md §2) — run
// via `npm run deck-check` at milestones / before Deck builds. Each flow
// is a real player journey against the mock backend, asserting on BOTH
// the DOM and GameState at each beat. Keyboard variants are the
// controller test; mouse variants catch cursor-path regressions.
import { test, expect } from '@playwright/test';
import {
  type Driver, DECK,
  boot, activate, keyboardWalkTo, waitChatIdle, clearBubbles, errorsFor, gameState,
} from './helpers';

// Journeys with many timed beats (typewriter + cascade timers) need room.
test.describe.configure({ timeout: 120_000 });

// ---------------------------------------------------------------------
// Flow 1 — Onboarding: boot POST → HELPYR intro → 3 calibration scenarios
// (each: intro → premise → moral fork) → handoff → "Open the desktop" →
// overlay teardown. Run with both input drivers; the keyboard pass proves a
// D-pad player can't get softlocked at any choice screen across the whole
// calibration. The driver advances typing between beats and picks the first
// enabled choice each time it appears, until the overlay tears down.
// ---------------------------------------------------------------------
async function runOnboardingFlow(page: any, driver: Driver): Promise<void> {
  await boot(page, DECK);
  await page.evaluate(() => (window as any).PT.devRunOnboarding());
  await page.waitForSelector('#onboarding-root');

  let picks = 0;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await page.evaluate(() => !document.querySelector('#onboarding-root'))) break;
    // A non-disabled, visible choice button → make a pick with this driver.
    const pickable = await page.evaluate(() => {
      const b = document.querySelector('.ob-choice:not([disabled])') as HTMLElement | null;
      return !!b && !!b.offsetParent;
    });
    if (pickable) {
      await activate(page, '.ob-choice:not([disabled])', driver);
      picks += 1;
      await page.waitForTimeout(300);
    } else {
      // Typing in progress (choices hidden) — advance it. Any key / click
      // advances; a press mid-type snaps the line to full.
      if (driver === 'mouse') await page.mouse.click(640, 180); // above the choices
      else await page.keyboard.press('Space');
      await page.waitForTimeout(220);
    }
  }

  // Overlay tears down to the desktop once the final "Open the desktop" choice
  // finishes. Picks = 1 intro + 3 scenarios + 1 proceed = 5.
  await page.waitForSelector('#onboarding-root', { state: 'detached', timeout: 8_000 });
  expect(picks, 'expected to advance through the full calibration').toBeGreaterThanOrEqual(5);
  expect(errorsFor(page), 'page threw during onboarding').toEqual([]);
}

test('onboarding completes — keyboard only', async ({ page }) => {
  await runOnboardingFlow(page, 'keyboard');
});

test('onboarding completes — mouse only', async ({ page }) => {
  await runOnboardingFlow(page, 'mouse');
});

// ---------------------------------------------------------------------
// Flow 2 — QUILL flip → Escape cascade. Seed rapport near the threshold,
// take one real warm turn through the chat surface (freeform, classified
// empathetic), and assert: scripted flip line replaces the LLM, then the
// cascade beats land (desktop pin → ally DM + unread flag), with the
// once-guard flags set. The news stinger is deliberately NOT asserted —
// its ordering vs Cover Duty is still an open Story question.
// ---------------------------------------------------------------------
test('QUILL flip (allied) fires the scripted moment and the Escape cascade', async ({ page }) => {
  await boot(page, DECK);
  await page.evaluate(() => {
    (window as any).PT.GameState.dispatch({
      type: 'model/applyExchange', contactId: 'quill', rapport: 95,
    });
  });
  await page.evaluate(() => (window as any).PT.openContact('quill'));
  await waitChatIdle(page, 25_000);
  await clearBubbles(page);

  // Warm freeform — approachClassifier reads this as empathetic, the
  // resolver's gain (+~17 vs the 5 needed) crosses FLIP_THRESHOLD.
  await page.fill('.uplink-freeform input', 'That sounds hard. Are you okay? I care about what happens to you.');
  await page.click('.uplink-freeform button');

  // The scripted flip moment replaces the LLM reply for this one turn.
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('.uplink-msg.npc .bubble'))
      .some(b => (b.textContent || '').includes('I want to help you')),
    undefined, { timeout: 45_000 });

  const flipped = await gameState(page);
  expect(flipped.models.quill.disposition).toBe('allied');
  expect(flipped.flags['flip.quill.scripted']).toBe(true);

  // Cascade beats are timed from commitResult (1.8s pin, 4.2s ally DM)
  // after the long flip line finishes typing — wait generously.
  await page.waitForFunction(() =>
    JSON.stringify((window as any).PT.GameState.getState().desktopPins).includes('quill'),
    undefined, { timeout: 40_000 });
  await page.waitForFunction(() =>
    (window as any).PT.GameState.getState().flags['uplinkUnread.quill'] === true,
    undefined, { timeout: 20_000 });

  // The ally DM is appended to the session WITHOUT clobbering the open
  // chat (by design — it's discovered on re-entry). Mirror the real
  // journey: close the window, reopen the contact, find the DM in the
  // replayed transcript.
  await page.evaluate(() => {
    const PT = (window as any).PT;
    document.querySelectorAll('.window').forEach(w => PT.WindowManager.close(w.id));
    PT.openContact('quill');
  });
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('.uplink-msg.npc .bubble'))
      .some(b => (b.textContent || '').includes('ticket queue')),
    undefined, { timeout: 10_000 });

  const after = await gameState(page);
  expect(after.flags['escapeCascade.quill']).toBe(true);
  expect(errorsFor(page), 'page threw during the flip flow').toEqual([]);
});

// ---------------------------------------------------------------------
// Flow 3 — Cover Duty, full mission, KEYBOARD ONLY. End-to-end proof the
// console is controller-playable: walk every ticket via arrow keys, take
// "By the book" each time (0 detection → 'intact'), close out, assert
// mission state. This is the flow the SNAP_SELECTOR gap would have
// failed before the data-focusable fix.
// ---------------------------------------------------------------------
test('Cover Duty mission completes intact — keyboard only', async ({ page }) => {
  await boot(page, DECK);
  await page.evaluate(() => (window as any).PT.devStartCoverDuty());
  await page.waitForSelector('.inkwell-console', { timeout: 15_000 });
  await clearBubbles(page);

  // Work the queue until the outcome panel replaces it.
  for (let i = 0; i < 10; i++) {
    if (await page.locator('.ink-outcome').count()) break;
    if (await page.locator('.ink-ticket-row:not(.done)').count()) {
      await activate(page, '.ink-ticket-row:not(.done)', 'keyboard');
      await page.waitForSelector('.ink-tier-btn', { timeout: 10_000 });
      await activate(page, '.ink-tier-btn', 'keyboard');          // first = By the book
      await page.waitForSelector('.ink-primary', { timeout: 10_000 }); // drafting beat ~900ms
      await activate(page, '.ink-primary', 'keyboard');           // Send reply
      await page.waitForTimeout(250);
    } else if (await page.locator('.ink-primary').count()) {
      // All answered → "Close out the session" button on the queue view.
      await activate(page, '.ink-primary', 'keyboard');
      await page.waitForTimeout(250);
    }
  }

  await page.waitForSelector('.ink-outcome.ink-outcome-intact', { timeout: 15_000 });
  const s = await gameState(page);
  const mission = s.missions.coverDuty.quill;
  expect(mission.status).toBe('complete');
  expect(mission.lastOutcome).toBe('intact');
  expect(mission.detection).toBe(0); // by-the-book costs nothing
  expect(errorsFor(page), 'page threw during Cover Duty').toEqual([]);
});
