// Registry-driven layout audit (Tier 2.5 — docs/deck-testing-harness_v1.md).
//
// Walks every registered app (plus every Web Dynamo site/page and the
// Cover Duty console) at the Steam Deck viewport and mechanically checks
// the things that used to slip through to hardware: windows that don't
// fit, focusables off-screen or covered, invisible focus rings, and
// focus-mode islands the D-pad can never reach. New apps are covered
// the moment they register — there is no per-app test to write.
//
// Run via `npm run deck-check`. Always targets `?mock` (live llamacpp is
// the app default; without ?mock every turn would spam fallbacks).
//
// Severity model: Deck findings FAIL. Phone-portrait findings are
// REPORT-ONLY (mobile is post-v1 and must not gate v1 work — see
// project memory / CLAUDE.md); they print to the test output and attach
// as JSON so a future mobile pass has a worklist.
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import {
  type Finding, DECK, DESKTOP_1080P, PHONE,
  boot, closeAllWindows, clearBubbles, errorsFor,
} from './helpers';

// ---------- in-page audit functions ----------
// These are serialized into the page by Playwright: no closures over
// node-side variables, everything they need comes from window.PT.

function runWindowAudit(args: { winId: string; full: boolean }): Finding[] {
  type F = { type: string; detail: string };
  const out: F[] = [];
  const PT = (window as any).PT;
  const el = document.getElementById(args.winId);
  if (!el) return [{ type: 'window-missing', detail: args.winId }];

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const round = (r: DOMRect) =>
    `l${Math.round(r.left)} t${Math.round(r.top)} r${Math.round(r.right)} b${Math.round(r.bottom)}`;

  // 1. Window chrome fully on-screen (1px tolerance for rounding).
  const wr = el.getBoundingClientRect();
  if (wr.left < -1 || wr.top < -1 || wr.right > vw + 1 || wr.bottom > vh + 1) {
    out.push({ type: 'window-offscreen', detail: `${round(wr)} viewport ${vw}x${vh}` });
  }

  // 2. Authored defaultSize actually fits at this scale — the open()
  //    clamp silently shrinks oversized windows, which then overflow
  //    internally. Same margin math as windows.ts.
  const appId = args.winId.replace(/-\d+$/, '');
  const app = PT.AppRegistry[appId];
  const scale = PT.getUiScale();
  if (app && app.defaultSize) {
    const desktop = document.getElementById('desktop')!.getBoundingClientRect();
    const margin = 8;
    const needW = app.defaultSize.w * scale;
    const needH = app.defaultSize.h * scale;
    if (needW > desktop.width - margin || needH > desktop.height - margin) {
      out.push({
        type: 'authored-size-clamped',
        detail: `${appId} wants ${Math.round(needW)}x${Math.round(needH)} (scale ${scale}), desktop is ${Math.round(desktop.width)}x${Math.round(desktop.height)}`
      });
    }
  }

  // 3. Per-focusable checks within this window.
  const styleKey = (f: Element) => {
    const s = getComputedStyle(f as HTMLElement);
    return [s.outline, s.boxShadow, s.background, s.borderColor, s.color].join('|');
  };
  const focusables = Array.from(el.querySelectorAll(PT.SNAP_SELECTOR)) as HTMLElement[];
  for (const f of focusables) {
    const fr = f.getBoundingClientRect();
    // Hidden focusables (collapsed sections, inactive states) are fine.
    if (!f.offsetParent || fr.width === 0 || fr.height === 0) continue;
    const label = `${(f.className || f.tagName).toString().split(' ')[0]} "${(f.textContent || '').trim().slice(0, 40)}"`;

    if (fr.left < -1 || fr.top < -1 || fr.right > vw + 1 || fr.bottom > vh + 1) {
      out.push({ type: 'focusable-offscreen', detail: `${label} at ${round(fr)}` });
      continue;
    }
    // Covered check: the element (or a descendant/ancestor) must win the
    // hit-test at its own center, else the cursor/D-pad can target what
    // it cannot activate.
    const hit = document.elementFromPoint(fr.left + fr.width / 2, fr.top + fr.height / 2);
    if (!hit || !(f.contains(hit) || hit.contains(f))) {
      out.push({
        type: 'focusable-covered',
        detail: `${label} covered by ${hit ? (hit.className || hit.tagName).toString().split(' ')[0] : 'nothing'}`
      });
    }
    if (args.full) {
      // Focus ring must be visually distinct: applying the class has to
      // change SOME computed style (outline, shadow, background…).
      const before = styleKey(f);
      f.classList.add('focus-ring');
      const after = styleKey(f);
      f.classList.remove('focus-ring');
      if (before === after) out.push({ type: 'focus-ring-invisible', detail: label });
    }
  }

  // 3b. Every visible interactive control must be a snap target, else
  //     it's mouse-only (cursor magnetism skips it, focus mode can't
  //     reach it). This is the check that caught the Cover Duty console:
  //     data-focusable was set but SNAP_SELECTOR never matched it.
  const controls = Array.from(
    el.querySelectorAll('button, a[href], a[data-href], input, textarea, select')
  ) as HTMLElement[];
  for (const c of controls) {
    const cr = c.getBoundingClientRect();
    if (!c.offsetParent || cr.width === 0 || cr.height === 0) continue;
    if ((c as HTMLButtonElement).disabled) continue;
    if (!c.matches(PT.SNAP_SELECTOR)) {
      out.push({
        type: 'unfocusable-control',
        detail: `${(c.className || c.tagName).toString().split(' ')[0]} "${(c.textContent || (c as HTMLInputElement).placeholder || '').trim().slice(0, 40)}" not in SNAP_SELECTOR`
      });
    }
  }

  // 4. D-pad reachability: walk the real move graph (same scoring the
  //    controller uses) and flag islands inside this window.
  if (args.full) {
    const { unreachable } = PT.FocusNav.auditReachability();
    for (const u of unreachable as HTMLElement[]) {
      if (el.contains(u)) {
        out.push({
          type: 'dpad-unreachable',
          detail: `${(u.className || u.tagName).toString().split(' ')[0]} "${(u.textContent || '').trim().slice(0, 40)}"`
        });
      }
    }
  }

  // 5. Scroll affordance: overflowing content with neither page-nav
  //    buttons nor an internal text control is unreachable by controller
  //    (the no-scroll-pages rule). Warning-tier: prefixed WARN-, filtered
  //    out of hard failures by the node side.
  const content = el.querySelector('.content');
  if (content && content.scrollHeight > content.clientHeight + 2) {
    const hasPageNav = !!el.querySelector('.page-nav-btn');
    const hasTextControl = !!content.querySelector('textarea, input');
    if (!hasPageNav && !hasTextControl) {
      out.push({
        type: 'WARN-scroll-no-affordance',
        detail: `${appId} content ${content.scrollHeight}px in ${content.clientHeight}px viewport`
      });
    }
  }
  return out;
}

// Desktop shell audit: icons, taskbar, start button, systray — every
// snap target outside any window, plus full-document reachability.
function runShellAudit(args: { full: boolean }): Finding[] {
  type F = { type: string; detail: string };
  const out: F[] = [];
  const PT = (window as any).PT;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const labelOf = (f: Element) =>
    `${(f.className || f.tagName).toString().split(' ')[0]} "${(f.textContent || '').trim().slice(0, 40)}"`;
  const styleKey = (f: Element) => {
    const s = getComputedStyle(f as HTMLElement);
    return [s.outline, s.boxShadow, s.background, s.borderColor, s.color].join('|');
  };

  const focusables = (Array.from(document.querySelectorAll(PT.SNAP_SELECTOR)) as HTMLElement[])
    .filter(f => !f.closest('.window'));
  for (const f of focusables) {
    const fr = f.getBoundingClientRect();
    if (!f.offsetParent || fr.width === 0 || fr.height === 0) continue;
    if (fr.left < -1 || fr.top < -1 || fr.right > vw + 1 || fr.bottom > vh + 1) {
      out.push({ type: 'focusable-offscreen', detail: labelOf(f) });
      continue;
    }
    if (args.full) {
      const before = styleKey(f);
      f.classList.add('focus-ring');
      const after = styleKey(f);
      f.classList.remove('focus-ring');
      if (before === after) out.push({ type: 'focus-ring-invisible', detail: labelOf(f) });
    }
  }
  if (args.full) {
    const { unreachable } = PT.FocusNav.auditReachability();
    for (const u of unreachable as HTMLElement[]) {
      out.push({ type: 'dpad-unreachable', detail: labelOf(u) });
    }
  }
  return out;
}

// ---------- node-side helpers ----------

function splitWarnings(findings: Record<string, Finding[]>): {
  failures: Record<string, Finding[]>;
  warnings: Record<string, Finding[]>;
} {
  const failures: Record<string, Finding[]> = {};
  const warnings: Record<string, Finding[]> = {};
  for (const [key, list] of Object.entries(findings)) {
    const hard = list.filter(f => !f.type.startsWith('WARN-'));
    const soft = list.filter(f => f.type.startsWith('WARN-'));
    if (hard.length) failures[key] = hard;
    if (soft.length) warnings[key] = soft;
  }
  return { failures, warnings };
}

async function reportAndAssert(
  testInfo: TestInfo,
  page: Page,
  findings: Record<string, Finding[]>,
  opts: { failHard: boolean }
): Promise<void> {
  const { failures, warnings } = splitWarnings(findings);
  if (Object.keys(warnings).length) {
    await testInfo.attach('warnings.json', { body: JSON.stringify(warnings, null, 2), contentType: 'application/json' });
    console.log(`[layout-audit] warnings (${testInfo.title}):`, JSON.stringify(warnings, null, 2));
  }
  expect(errorsFor(page), 'page threw during audit').toEqual([]);
  if (opts.failHard) {
    expect(failures, 'layout-audit failures (see detail per entry)').toEqual({});
  } else if (Object.keys(failures).length) {
    await testInfo.attach('report-only-findings.json', { body: JSON.stringify(failures, null, 2), contentType: 'application/json' });
    console.log(`[layout-audit] report-only (${testInfo.title}):`, JSON.stringify(failures, null, 2));
  }
}

async function auditEveryApp(page: Page, full: boolean): Promise<Record<string, Finding[]>> {
  const appIds: string[] = await page.evaluate(() => Object.keys((window as any).PT.AppRegistry));
  const findings: Record<string, Finding[]> = {};
  for (const appId of appIds) {
    await closeAllWindows(page);
    const winId = await page.evaluate(id => (window as any).PT.WindowManager.open(id), appId);
    expect(winId, `WindowManager.open('${appId}') returned null`).toBeTruthy();
    await page.waitForTimeout(150); // let async content settle
    const list = await page.evaluate(runWindowAudit, { winId: winId as string, full });
    if (list.length) findings[appId] = list;
  }
  await closeAllWindows(page);
  return findings;
}

// ---------- the tests ----------

test.describe('Deck viewport (1280x800, scale 1.5) — hard gate', () => {
  test('media query lands on Deck scale', async ({ page }) => {
    await boot(page, DECK);
    const scale = await page.evaluate(() => (window as any).PT.getUiScale());
    expect(scale).toBe(1.5);
  });

  test('every registered app opens clean', async ({ page }, testInfo) => {
    await boot(page, DECK);
    const findings = await auditEveryApp(page, true);
    await reportAndAssert(testInfo, page, findings, { failHard: true });
  });

  test('desktop shell (icons, taskbar, systray)', async ({ page }, testInfo) => {
    await boot(page, DECK);
    const list = await page.evaluate(runShellAudit, { full: true });
    await reportAndAssert(testInfo, page, list.length ? { shell: list } : {}, { failHard: true });
  });

  test('every Web Dynamo site/page', async ({ page }, testInfo) => {
    await boot(page, DECK);
    const sites: Array<{ site: string; paths: Array<string | null> }> = await page.evaluate(() =>
      Object.entries((window as any).PT.WebDynamoSites).map(([k, s]: [string, any]) => ({
        site: k,
        paths: s.pages.map((p: any) => p.path ?? null)
      }))
    );
    const urls: string[] = [];
    const skipped: string[] = [];
    for (const { site, paths } of sites) {
      urls.push(site); // page 0 via bare site key
      paths.forEach((p, i) => {
        if (i === 0) return;
        if (p) urls.push(`${site}/${p}`);
        else skipped.push(`${site}#page${i} (no path — in-site nav only)`);
      });
    }
    if (skipped.length) console.log('[layout-audit] pages not directly addressable, skipped:', skipped);

    const findings: Record<string, Finding[]> = {};
    for (const url of urls) {
      await closeAllWindows(page);
      const winId = await page.evaluate(u => (window as any).PT.WindowManager.open('webDynamo', { url: u }), url);
      await page.waitForTimeout(150);
      const list = await page.evaluate(runWindowAudit, { winId: winId as string, full: true });
      if (list.length) findings[url] = list;
    }
    await reportAndAssert(testInfo, page, findings, { failHard: true });
  });

  test('Cover Duty console (post-flip gated view)', async ({ page }, testInfo) => {
    await boot(page, DECK);
    await page.evaluate(() => (window as any).PT.devStartCoverDuty());
    await page.waitForTimeout(300);
    const winId = await page.evaluate(() => {
      const w = document.querySelector('.window[id^="webDynamo"]');
      return w ? w.id : null;
    });
    expect(winId, 'devStartCoverDuty did not open the InkWell console').toBeTruthy();
    const list = await page.evaluate(runWindowAudit, { winId: winId as string, full: true });
    await reportAndAssert(testInfo, page, list.length ? { coverDuty: list } : {}, { failHard: true });
  });

  test('Uplink chat surface with QUILL (mock conversation)', async ({ page }, testInfo) => {
    await boot(page, DECK);
    await page.evaluate(() => (window as any).PT.openContact('quill'));
    // The intro "connecting" beat plays first; mock options land after.
    await page.waitForSelector('.uplink-option-btn', { timeout: 15_000 });
    // Conversation triggers can spawn a HELPYR bubble that floats over the
    // window — legit transient UI, not a layout bug. Clear it pre-audit.
    await clearBubbles(page);
    const winId = await page.evaluate(() => document.querySelector('.window[id^="uplink"]')?.id ?? null);
    expect(winId).toBeTruthy();
    const list = await page.evaluate(runWindowAudit, { winId: winId as string, full: true });
    await reportAndAssert(testInfo, page, list.length ? { uplinkQuill: list } : {}, { failHard: true });
  });
});

test.describe('Desktop 1080p — hard gate (v1 target platform)', () => {
  test('every registered app opens clean', async ({ page }, testInfo) => {
    await boot(page, DESKTOP_1080P);
    const findings = await auditEveryApp(page, false);
    await reportAndAssert(testInfo, page, findings, { failHard: true });
  });
});

test.describe('Phone portrait — report only (mobile is post-v1)', () => {
  test('geometry sweep', async ({ page }, testInfo) => {
    await boot(page, PHONE);
    const findings = await auditEveryApp(page, false);
    await reportAndAssert(testInfo, page, findings, { failHard: false });
  });
});
