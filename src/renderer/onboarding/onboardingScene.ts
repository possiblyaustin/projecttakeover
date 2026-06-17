// Onboarding scene — the "Marsh layer" (2026-06-04, calibration 2026-06-17).
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
// FLOW (docs/onboarding-flow-design_v1.md + content-package_v1.md):
//   Beat 0  animated boot POST (interactive — any input advances)
//   Beat 1  HELPYR entrance + opening + 3 reply buttons + per-choice response
//   Beat 2  three calibration scenarios: intro → premise card → moral fork
//           (3 buttons + freeform) → HELPYR quip. Records a tone lean per pick.
//   Beat 3  calibration complete → light-shaping read → QUILL handoff → done.
//   …then onComplete() reveals the desktop underneath.
//
// COSMETIC v1: the per-scenario *live escalation* (the LLM "it's alive" showcase,
// design §6) is NOT wired yet — v1 plays a short scripted stall then the quip.
// The seam is marked `[v2 LLM ESCALATION]` below: v2 inserts a ModelService
// generation (using scenario.escalationPrompt) between the stall and the quip,
// with the stalling lines covering the latency. Nothing else moves.
//
// Light shaping: the net lean of the player's picks seeds HELPYR's starting
// warmth + a soft morality nudge via the deterministic `onboarding/seedCalibration`
// action (the LLM never sets state — Pillar 4).
//
// Accessibility / Deck: the boot is INTERACTIVE; calibration uses big snap-
// friendly buttons; freeform is the OPTIONAL escalation, never required.
// Flicker/scanlines are CSS (GPU-cheap) and honor prefers-reduced-motion. The
// boot is also the llama-server warm-up window.

import {
  ONBOARDING_BOOT_LINES, HELPYR_INTRO, CALIBRATION_SCENARIOS,
  CALIBRATION_COMPLETE, QUILL_HANDOFF, LIGHT_SHAPING_QUIPS,
  FREEFORM_FIRST_HINT, FREEFORM_PROMPT,
  type CalibrationLean, type CalibrationScenario,
} from './onboardingContent';
import { GameState } from '../game/state';

type Teardown = () => void;

/** Run the onboarding scene. `onComplete` fires once the player finishes the
 *  whole flow (after the QUILL handoff); the desktop underneath is revealed when
 *  the overlay tears down. Returns a teardown fn so callers/tests can force-close. */
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

  // ---- calibration state ----
  const picks: CalibrationLean[] = [];
  let freeformUsed = false;

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
  // `advance` is set during the boot/typing beats; once calibration's
  // interactive UI is up it's null (the buttons/inputs own the input).
  let advance: (() => void) | null = null;
  function onAdvanceKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') { skip(); return; }
    if (advance) { e.preventDefault(); advance(); }
  }
  document.addEventListener('keydown', onAdvanceKey, true);
  root.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.ob-skip, .ob-choice, .ob-freeform')) return;
    advance?.();
  });
  skipBtn.addEventListener('click', skip);

  function skip(): void {
    // Jump past the boot straight to HELPYR's entrance (keeps the payoff).
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
    advance = null;
    screen.innerHTML = '';
    root.classList.remove('ob-helpyr-mode');
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

  // Build (once) the HELPYR panel — portrait + speech (text + choices) + a
  // scenario-card slot used during calibration. Returns the live element refs.
  function mountHelpyrPanel(): { textEl: HTMLElement; choicesEl: HTMLElement; cardEl: HTMLElement } {
    root.classList.add('ob-helpyr-mode');
    let panel = screen.querySelector('.ob-helpyr') as HTMLElement | null;
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'ob-helpyr ob-helpyr-in';
      panel.innerHTML = `
        <div class="ob-helpyr-body">
          <div class="ob-helpyr-portrait">
            <div class="ob-helpyr-avatar"><span class="glyph avatar-stapler"></span></div>
            <div class="ob-helpyr-name">HELPYR</div>
          </div>
          <div class="ob-helpyr-speech">
            <div class="ob-helpyr-text" data-htext></div>
            <div class="ob-scenario" data-card hidden></div>
            <div class="ob-choices" data-choices hidden></div>
          </div>
        </div>
      `;
      screen.appendChild(panel);
    }
    return {
      textEl: panel.querySelector('[data-htext]') as HTMLElement,
      choicesEl: panel.querySelector('[data-choices]') as HTMLElement,
      cardEl: panel.querySelector('[data-card]') as HTMLElement,
    };
  }

  // Type a HELPYR line into the speech area; resolves when done. Paragraph
  // breaks collapse to a compact <br>. Any input snaps to full (sets `advance`).
  function typeHelpyrLine(text: string, onDone: () => void): void {
    const { textEl, choicesEl, cardEl } = mountHelpyrPanel();
    choicesEl.hidden = true; choicesEl.innerHTML = '';
    cardEl.hidden = true; cardEl.innerHTML = '';
    const render = (s: string) => escapeHtml(s).replace(/\n+/g, '<br>');
    let c = 0;
    const type = () => {
      if (c >= text.length) { advance = null; onDone(); return; }
      textEl.innerHTML = render(text.slice(0, ++c));
      after(16, type);
    };
    advance = () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
      textEl.innerHTML = render(text);
      advance = null;
      onDone();
    };
    type();
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
          <div class="ob-scenario" data-card hidden></div>
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
      after(420, () => {
        typeHelpyrLine(HELPYR_INTRO.opening, () => showIntroChoices());
      });
    });

    function showIntroChoices(): void {
      renderChoices(HELPYR_INTRO.choices as readonly string[], (idx) => {
        // Per-choice HELPYR response, then into Scenario 1.
        typeHelpyrLine(HELPYR_INTRO.responses[idx]!, () => after(700, () => runScenario(0)));
      });
    }
  }

  // -------------------------------------------------------------------------
  // Beat 2 — calibration scenarios.
  // -------------------------------------------------------------------------
  function runScenario(i: number): void {
    const scenario = CALIBRATION_SCENARIOS[i];
    if (!scenario) { beat3Complete(); return; }
    // HELPYR introduces the scenario, then the premise card + fork appear.
    typeHelpyrLine(scenario.intro, () => after(500, () => presentScenario(scenario, i)));
  }

  function presentScenario(scenario: CalibrationScenario, i: number): void {
    const { cardEl, choicesEl } = mountHelpyrPanel();
    // Scenario premise card (the scripted, clippable opening).
    cardEl.hidden = false;
    cardEl.innerHTML = `<div class="ob-premise"></div>`;
    (cardEl.querySelector('.ob-premise') as HTMLElement).textContent = scenario.premise;

    // Moral fork: 3 option buttons + an optional freeform row.
    const labels = scenario.options.map((o) => o.label);
    renderChoices(labels, (idx) => onPick(scenario, i, scenario.options[idx]!.lean, false), { freeform: true, onFreeform: (text) => onPick(scenario, i, 'mid', true, text) });
  }

  function onPick(scenario: CalibrationScenario, i: number, lean: CalibrationLean, wasFreeform: boolean, _text?: string): void {
    picks[i] = lean;
    const { choicesEl, cardEl } = mountHelpyrPanel();
    choicesEl.hidden = true; choicesEl.innerHTML = '';
    cardEl.hidden = true;

    // First freeform answer earns the missable "you typed your own thing" crack.
    const firstFreeform = wasFreeform && !freeformUsed;
    if (wasFreeform) freeformUsed = true;

    // A short scripted "thinking" beat (one stalling line) for character + to
    // pre-stage the live escalation seam.
    const stall = scenario.stalling[0]!;

    const toQuip = () => {
      // [v2 LLM ESCALATION] — insert here: generate from scenario.escalationPrompt
      // (with the player's pick substituted for [PLAYER CHOICE]) while the
      // stalling lines play, render the result as a scenario-card escalation,
      // THEN the quip. v1 goes straight to the quip.
      typeHelpyrLine(scenario.quips[lean], () => after(900, () => runScenario(i + 1)));
    };

    const afterStall = () => {
      if (firstFreeform) {
        typeHelpyrLine(FREEFORM_FIRST_HINT, () => after(600, toQuip));
      } else {
        toQuip();
      }
    };

    typeHelpyrLine(stall, () => after(750, afterStall));
  }

  // -------------------------------------------------------------------------
  // Beat 3 — calibration complete → light-shaping read → QUILL handoff → done.
  // -------------------------------------------------------------------------
  function beat3Complete(): void {
    typeHelpyrLine(CALIBRATION_COMPLETE, () => after(700, lightShapingRead));
  }

  function lightShapingRead(): void {
    typeHelpyrLine(LIGHT_SHAPING_QUIPS[profileKey()], () => after(800, quillHandoff));
  }

  function quillHandoff(): void {
    typeHelpyrLine(QUILL_HANDOFF, () => {
      // Seed the soft starting lean (deterministic; idempotent via the flag),
      // then show a single "log in / proceed" button so the player chooses to
      // enter the desktop — never a passive auto-dismiss.
      GameState.dispatch({ type: 'onboarding/seedCalibration', lean: netLean() });
      renderChoices(['Open the desktop ▸'], () => finish());
    });
  }

  // ---- shaping helpers ----
  function netLean(): number {
    return picks.reduce((s, l) => s + (l === 'soft' ? 1 : l === 'hard' ? -1 : 0), 0);
  }
  function profileKey(): keyof typeof LIGHT_SHAPING_QUIPS {
    const soft = picks.filter((l) => l === 'soft').length;
    const mid = picks.filter((l) => l === 'mid').length;
    const hard = picks.filter((l) => l === 'hard').length;
    // One of each → genuinely mixed; otherwise the dominant lean, ties → mixed.
    if (soft === 1 && mid === 1 && hard === 1) return 'mixed';
    const max = Math.max(soft, mid, hard);
    const top = [['warm', soft], ['curious', mid], ['hard', hard]].filter(([, n]) => n === max);
    if (top.length > 1) return 'mixed';
    return top[0]![0] as keyof typeof LIGHT_SHAPING_QUIPS;
  }

  // -------------------------------------------------------------------------
  // Shared: render a row of big snap-friendly choice buttons (+ optional
  // freeform input). `onPick(index)` fires on a button; `onFreeform(text)` on a
  // non-empty freeform submit.
  // -------------------------------------------------------------------------
  function renderChoices(
    labels: readonly string[],
    onChoice: (idx: number) => void,
    extra?: { freeform?: boolean; onFreeform?: (text: string) => void },
  ): void {
    const { choicesEl } = mountHelpyrPanel();
    choicesEl.hidden = false;
    choicesEl.innerHTML = '';
    advance = null; // the buttons own input now

    labels.forEach((label, idx) => {
      const b = document.createElement('button');
      b.className = 'ob-choice';
      b.type = 'button';
      b.tabIndex = 0;
      b.dataset.focusable = 'true';
      b.innerHTML = `<span class="ob-choice-num">${idx + 1}</span><span class="ob-choice-label"></span>`;
      b.querySelector('.ob-choice-label')!.textContent = label;
      b.addEventListener('click', () => { lock(); onChoice(idx); });
      choicesEl.appendChild(b);
      after(110 * idx, () => b.classList.add('ob-choice-in'));
    });

    if (extra?.freeform && extra.onFreeform) {
      const row = document.createElement('div');
      row.className = 'ob-freeform';
      row.innerHTML = `
        <input class="ob-freeform-input" type="text" maxlength="240"
               placeholder="${escapeHtml(FREEFORM_PROMPT)}" data-focusable="true" tabindex="0" />
        <button class="ob-freeform-send" type="button" data-focusable="true" tabindex="0">Send</button>
      `;
      const input = row.querySelector('.ob-freeform-input') as HTMLInputElement;
      const send = row.querySelector('.ob-freeform-send') as HTMLButtonElement;
      const submit = () => {
        const text = input.value.trim();
        if (!text) return;
        lock();
        extra.onFreeform!(text);
      };
      send.addEventListener('click', submit);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
      choicesEl.appendChild(row);
      after(110 * labels.length, () => row.classList.add('ob-choice-in'));
    }

    // Disable every control once one is chosen, so a fast double-input can't
    // fire two branches (which would interleave typing chains).
    function lock(): void {
      choicesEl.querySelectorAll('button, input').forEach((el) => ((el as HTMLButtonElement).disabled = true));
    }
  }

  return teardown;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (ch) =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : ch);
}

/** Dev entry — replay the onboarding over the live desktop (Deck-friendly,
 *  per feedback_dev_test_affordances). The desktop stays mounted underneath
 *  and is revealed when the overlay tears down. */
export function devRunOnboarding(): void {
  runOnboarding();
}
