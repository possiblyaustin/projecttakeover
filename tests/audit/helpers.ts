// Shared node-side helpers for the Deck testing harness (Tier 2/2.5 —
// docs/deck-testing-harness_v1.md). Used by the layout audit, the smoke
// flow, and the full journey flows.
import { type Page } from '@playwright/test';

export type Finding = { type: string; detail: string };
export type Driver = 'mouse' | 'keyboard';

export const DECK = { width: 1280, height: 800 };      // CSS px; media query → --ui-scale 1.5
export const DESKTOP_1080P = { width: 1920, height: 1080 };
export const PHONE = { width: 390, height: 844 };       // report-only viewport

const pageErrors = new Map<Page, string[]>();
export function errorsFor(page: Page): string[] {
  return pageErrors.get(page) ?? [];
}

// Boot the game at a viewport with the mock backend, suppress the
// first-boot nudge, and clear the boot README for a clean desktop.
export async function boot(page: Page, vp: { width: number; height: number }): Promise<void> {
  pageErrors.set(page, []);
  page.on('pageerror', err => pageErrors.get(page)!.push(String(err)));
  await page.setViewportSize(vp);
  await page.goto('/?mock');
  await page.waitForFunction(() => !!(window as any).PT);
  await page.evaluate(() => {
    const PT = (window as any).PT;
    PT.GameState.dispatch({ type: 'flags/set', key: 'firstBoot.onboarding', value: true });
    PT.helpyr.dismissBubble();
  });
  await closeAllWindows(page);
}

export async function closeAllWindows(page: Page): Promise<void> {
  await page.evaluate(() => {
    const PT = (window as any).PT;
    document.querySelectorAll('.window').forEach(w => PT.WindowManager.close(w.id));
    PT.helpyr.dismissBubble();
  });
}

// HELPYR bubbles are legit transient UI that floats over windows. A
// single dismiss can race the spawn (or pop the next queued bubble), so
// poll-dismiss until the bubble surface is actually empty.
export async function clearBubbles(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const PT = (window as any).PT;
    PT.helpyr.dismissBubble();
    const b = document.querySelector('.helpyr-bubble-action, .helpyr-bubble-dismiss');
    return !b || !(b as HTMLElement).offsetParent;
  }, undefined, { timeout: 5_000, polling: 250 });
}

// Walk focus mode to the nearest element matching `selector` by pressing
// real arrow keys — the exact input path a Deck D-pad takes (Steam Input
// emits arrow keys). Greedy: each step presses the dominant-axis arrow
// toward the nearest matching target; if focus doesn't move, tries the
// perpendicular axis before declaring the target unreachable. Throws on
// failure, which IS the test result: a controller player can't get there.
export async function keyboardWalkTo(page: Page, selector: string, maxSteps = 35): Promise<void> {
  let stuckOnce = false;
  let lastSig = '';
  for (let step = 0; step < maxSteps; step++) {
    const st = await page.evaluate((sel) => {
      const focused = document.querySelector('.focus-ring') as HTMLElement | null;
      const targets = (Array.from(document.querySelectorAll(sel)) as HTMLElement[])
        .filter(t => t.offsetParent && t.getBoundingClientRect().width > 0);
      if (!targets.length) return { state: 'no-target' as const };
      if (!focused) return { state: 'no-focus' as const };
      if (focused.matches(sel) || focused.closest(sel) || targets.some(t => t.contains(focused))) {
        return { state: 'on-target' as const };
      }
      const fr = focused.getBoundingClientRect();
      const fx = fr.left + fr.width / 2;
      const fy = fr.top + fr.height / 2;
      let best = targets[0]!;
      let bestD = Infinity;
      for (const t of targets) {
        const r = t.getBoundingClientRect();
        const d = Math.hypot(r.left + r.width / 2 - fx, r.top + r.height / 2 - fy);
        if (d < bestD) { bestD = d; best = t; }
      }
      const br = best.getBoundingClientRect();
      return {
        state: 'navigate' as const,
        sig: `${Math.round(fr.left)},${Math.round(fr.top)},${focused.className}`,
        dx: br.left + br.width / 2 - fx,
        dy: br.top + br.height / 2 - fy,
      };
    }, selector);

    if (st.state === 'no-target') throw new Error(`keyboardWalkTo: nothing matches ${selector}`);
    if (st.state === 'on-target') return;
    if (st.state === 'no-focus') {
      await page.keyboard.press('ArrowDown'); // enters focus mode + seeds
      await page.waitForTimeout(180);
      continue;
    }
    const horizontal: 'ArrowRight' | 'ArrowLeft' = st.dx > 0 ? 'ArrowRight' : 'ArrowLeft';
    const vertical: 'ArrowDown' | 'ArrowUp' = st.dy > 0 ? 'ArrowDown' : 'ArrowUp';
    const dominant = Math.abs(st.dx) >= Math.abs(st.dy) ? horizontal : vertical;
    const secondary = dominant === horizontal ? vertical : horizontal;
    const key = st.sig === lastSig && stuckOnce ? secondary : dominant;
    stuckOnce = st.sig === lastSig;
    lastSig = st.sig;
    await page.keyboard.press(key);
    await page.waitForTimeout(180); // > FocusNav's 140ms move throttle
  }
  throw new Error(`keyboardWalkTo: could not reach ${selector} in ${maxSteps} moves — focus-mode dead end`);
}

// Activate the first/nearest element matching `selector` with the given
// input driver. Mouse = a real trusted click; keyboard = arrow-walk the
// focus ring there and press Enter (FocusNav.activate path).
export async function activate(page: Page, selector: string, driver: Driver): Promise<void> {
  if (driver === 'mouse') {
    await page.locator(selector).first().click();
    return;
  }
  await keyboardWalkTo(page, selector);
  await page.keyboard.press('Enter');
}

// Wait for the chat surface to be idle with options on screen: the turn
// is committed, the typewriter is done, controls are re-enabled.
export async function waitChatIdle(page: Page, timeout = 30_000): Promise<void> {
  await page.waitForFunction(() => {
    const controls = document.querySelector('.uplink-controls');
    const options = document.querySelectorAll('.uplink-option-btn');
    return !!controls && !controls.classList.contains('disabled') && options.length > 0;
  }, undefined, { timeout });
}

// Read a snapshot of GameState (structured-cloneable subset via JSON).
export async function gameState(page: Page): Promise<any> {
  return page.evaluate(() => JSON.parse(JSON.stringify((window as any).PT.GameState.getState())));
}
