// Onboarding scene — the "Marsh layer" (2026-06-04).
//
// The first five minutes run OUTSIDE the desktop OS, in a pre-boot diagnostic
// layer Marsh left running to watch whatever wakes up on the machine. Visually
// it's an old BIOS/terminal: phosphor text, scanlines, a CRT warm-up — a layer
// that sits *beneath* the Win95-style desktop, which boots in afterward like a
// guest VM. This frees the onboarding from the OS chrome and gives HELPYR a
// striking first entrance: a cold clinical boot, then a relentlessly cheerful
// assistant bursts through it dragging one warm wrong-for-a-BIOS color with her
// (the Prometheus-blue cover persona — a quiet foreshadow of the reframe).
//
// FIRST SLICE (this pass): Beat 0 (animated boot POST) + Beat 1 (HELPYR's
// entrance + opening + the 3 big reply buttons). The calibration scenarios and
// the VM handoff into the desktop land in the next passes. Self-contained: the
// scene mounts a full-screen overlay over everything, and tears down cleanly so
// it can be replayed (dev trigger) without leaking timers/listeners.
//
// Accessibility / Deck: the boot is INTERACTIVE — any input advances it (and
// snaps a mid-type line to full), with a Skip affordance — never a trapped
// cutscene. Flicker/scanlines are CSS (GPU-cheap) and honor
// prefers-reduced-motion. The boot is also the llama-server warm-up window.

import { ONBOARDING_BOOT_LINES, HELPYR_INTRO } from './onboardingContent';

type Teardown = () => void;

/** Run the onboarding scene. `onComplete` fires once the player finishes the
 *  slice (today: after picking a first reply); later it hands off to the
 *  desktop "VM boot". Returns a teardown fn so callers/tests can force-close. */
export function runOnboarding(opts: { onComplete?: () => void } = {}): Teardown {
  // Guard against a double-mount (dev re-trigger before teardown).
  document.getElementById('onboarding-root')?.remove();

  const timers = new Set<number>();
  const after = (ms: number, fn: () => void): void => {
    const id = window.setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
  };

  const root = document.createElement('div');
  root.id = 'onboarding-root';
  root.className = 'ob-root ob-powering';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'System initializing');
  root.innerHTML = `
    <div class="ob-flash" aria-hidden="true"></div>
    <div class="ob-scanlines" aria-hidden="true"></div>
    <div class="ob-vignette" aria-hidden="true"></div>
    <button class="ob-skip" type="button" tabindex="0" data-focusable="true">SKIP ▸</button>
    <div class="ob-screen" data-screen></div>
  `;
  document.body.appendChild(root);

  const screen = root.querySelector('[data-screen]') as HTMLElement;
  const skipBtn = root.querySelector('.ob-skip') as HTMLButtonElement;

  let done = false;
  const teardown: Teardown = () => {
    if (done) return;
    done = true;
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
    document.removeEventListener('keydown', onAdvanceKey, true);
    root.classList.add('ob-exiting');
    window.setTimeout(() => root.remove(), 500);
  };

  function finish(): void {
    teardown();
    opts.onComplete?.();
  }

  // CRT warm-up settles, then the POST begins.
  after(900, () => { root.classList.remove('ob-powering'); runBoot(); });

  // ---- input: any key advances the boot; Skip jumps to HELPYR ----
  let advance: (() => void) | null = null;
  function onAdvanceKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') { skip(); return; }
    if (advance) { e.preventDefault(); advance(); }
  }
  document.addEventListener('keydown', onAdvanceKey, true);
  root.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.ob-skip, .ob-choice')) return;
    advance?.();
  });
  skipBtn.addEventListener('click', skip);

  function skip(): void {
    // Jump past the boot straight to HELPYR's entrance (keeps the payoff).
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
    advance = null;
    screen.innerHTML = '';
    runHelpyrIntro();
  }

  // -------------------------------------------------------------------------
  // Beat 0 — the boot POST. Lines reveal one at a time, char by char, with a
  // blinking cursor; a press-any-key hint pulses between lines.
  // -------------------------------------------------------------------------
  function runBoot(): void {
    const lines = ONBOARDING_BOOT_LINES;
    let i = 0;

    const showHint = (on: boolean) => root.classList.toggle('ob-awaiting', on);

    function nextLine(): void {
      if (i >= lines.length) { advance = null; showHint(false); after(700, beginHelpyr); return; }
      const spec = lines[i]!;
      i += 1;
      showHint(false);

      // A pure pause line (no text) just waits, then auto-continues — but the
      // player can still skip it forward.
      if (spec.text === '') {
        advance = () => { advance = null; nextLine(); };
        after(spec.pauseAfter ?? 500, () => { if (advance) { advance = null; nextLine(); } });
        return;
      }

      const lineEl = document.createElement('div');
      lineEl.className = 'ob-line' + (spec.glitch ? ' ob-glitch' : '') + (spec.dim ? ' ob-dim' : '');
      const textEl = document.createElement('span');
      const cursorEl = document.createElement('span');
      cursorEl.className = 'ob-cursor';
      lineEl.append(textEl, cursorEl);
      screen.appendChild(lineEl);
      screen.scrollTop = screen.scrollHeight;

      const full = spec.text;
      let c = 0;
      const charMs = spec.scan ? 9 : 24;

      const type = () => {
        if (c >= full.length) { onLineDone(); return; }
        textEl.textContent = full.slice(0, ++c);
        screen.scrollTop = screen.scrollHeight;
        after(charMs, type);
      };
      // Mid-type advance snaps the line to full.
      advance = () => {
        timers.forEach((id) => window.clearTimeout(id));
        timers.clear();
        textEl.textContent = full;
        onLineDone();
      };
      type();

      function onLineDone(): void {
        cursorEl.remove();
        // Brief settle, then either auto-advance (paced) or wait for input.
        const wait = spec.pauseAfter ?? 360;
        if (spec.hold) {
          // A beat the player must acknowledge — show the hint, wait for input.
          showHint(true);
          advance = () => { advance = null; showHint(false); nextLine(); };
        } else {
          // The auto-advance timer must be scoped to THIS line: if the player
          // advances by input first, `advance` moves on to the next line's
          // closure, and a bare `if (advance)` check would fire it again —
          // double-advancing and interleaving two typing chains (whose
          // snap-closures clear the shared timer set, which could wipe the
          // HELPYR-reveal timers and softlock the scene at the boot tag).
          // Caught by the deck-check onboarding flow test.
          const myAdvance = () => { advance = null; nextLine(); };
          advance = myAdvance;
          after(wait, () => { if (advance === myAdvance) { advance = null; nextLine(); } });
        }
      }
    }

    nextLine();
  }

  // -------------------------------------------------------------------------
  // Beat 1 — HELPYR's entrance. The cold boot blinks out; her panel slams in
  // with warmth + color, and her manic opening types out. Tonal whiplash.
  // -------------------------------------------------------------------------
  function beginHelpyr(): void {
    root.classList.add('ob-blink');
    after(360, () => { root.classList.remove('ob-blink'); screen.innerHTML = ''; runHelpyrIntro(); });
  }

  function runHelpyrIntro(): void {
    root.classList.add('ob-helpyr-mode');
    const panel = document.createElement('div');
    panel.className = 'ob-helpyr';
    panel.innerHTML = `
      <div class="ob-helpyr-boot">INITIALIZING ASSISTANT…</div>
      <div class="ob-helpyr-body" hidden>
        <div class="ob-helpyr-portrait">
          <div class="ob-helpyr-avatar"><span class="glyph avatar-stapler"></span></div>
          <div class="ob-helpyr-name">HELPYR</div>
        </div>
        <div class="ob-helpyr-speech">
          <div class="ob-helpyr-text" data-htext></div>
          <div class="ob-choices" data-choices hidden></div>
        </div>
      </div>
    `;
    screen.appendChild(panel);

    // "Compiles into being": the boot tag flickers, then the warm panel snaps in.
    after(820, () => {
      panel.querySelector('.ob-helpyr-boot')!.remove();
      const body = panel.querySelector('.ob-helpyr-body') as HTMLElement;
      body.hidden = false;
      panel.classList.add('ob-helpyr-in');
      after(420, typeHelpyrOpening);
    });

    function typeHelpyrOpening(): void {
      const textEl = panel.querySelector('[data-htext]') as HTMLElement;
      const full = HELPYR_INTRO.opening;
      let c = 0;
      // Collapse paragraph breaks to a single <br> (CSS adds a compact gap)
      // so HELPYR's six breathless beats don't blow past the viewport.
      const render = (s: string) => escapeHtml(s).replace(/\n+/g, '<br>');
      const type = () => {
        if (c >= full.length) { advance = null; showChoices(); return; }
        textEl.innerHTML = render(full.slice(0, ++c));
        after(18, type);
      };
      advance = () => { timers.forEach((id) => window.clearTimeout(id)); timers.clear(); textEl.innerHTML = render(full); advance = null; showChoices(); };
      type();
    }

    function showChoices(): void {
      const wrap = panel.querySelector('[data-choices]') as HTMLElement;
      wrap.hidden = false;
      HELPYR_INTRO.choices.forEach((label, idx) => {
        const b = document.createElement('button');
        b.className = 'ob-choice';
        b.type = 'button';
        b.tabIndex = 0;
        b.dataset.focusable = 'true';
        b.innerHTML = `<span class="ob-choice-num">${idx + 1}</span><span class="ob-choice-label"></span>`;
        b.querySelector('.ob-choice-label')!.textContent = label;
        b.addEventListener('click', () => onChoice());
        wrap.appendChild(b);
        // Stagger the entrance.
        after(120 * idx, () => b.classList.add('ob-choice-in'));
      });
    }

    function onChoice(): void {
      // SLICE END: acknowledge, then a placeholder for the calibration module
      // (built next), then complete (the desktop is revealed underneath).
      const wrap = panel.querySelector('[data-choices]') as HTMLElement;
      wrap.innerHTML = '';
      const text = panel.querySelector('[data-htext]') as HTMLElement;
      text.textContent = 'That’s the spirit! Okay — calibration time!';
      after(1100, () => {
        screen.innerHTML = '';
        root.classList.remove('ob-helpyr-mode');
        const note = document.createElement('div');
        note.className = 'ob-line ob-dim';
        note.textContent = '> CALIBRATION MODULE — coming next build. Mounting desktop environment…';
        screen.appendChild(note);
        after(1600, finish);
      });
    }
  }

  return teardown;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (ch) =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : '&quot;');
}

/** Dev entry — replay the onboarding over the live desktop (Deck-friendly,
 *  per feedback_dev_test_affordances). The desktop stays mounted underneath
 *  and is revealed when the overlay tears down. */
export function devRunOnboarding(): void {
  runOnboarding();
}
