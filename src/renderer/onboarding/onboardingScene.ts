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
// LIVE ESCALATION (v2, wired): between the moral fork and HELPYR's quip the
// scene runs a live ModelService generation off each scenario's per-register
// `escalationPrompt` (Story 2026-06-17: Register=mundane, Cage=moral, Signal=
// scale) — the "it's alive" showcase. HELPYR's stalling lines cover the latency;
// the twist types into the premise card, then the scripted quip shares the page.
// On ANY miss (mock/slow/invalid/timeout) the scene falls straight through to the
// quip, so a flat generation never carries the first impression. Freeform answers
// also append ESCALATION_FREEFORM_SUFFIX so the model reflects the player's words.
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
  CALIBRATION_COMPLETE, LIGHT_SHAPING_QUIPS,
  FREEFORM_FIRST_HINT, FREEFORM_PROMPT,
  ESCALATION_SYSTEM_PROMPT, ESCALATION_MAX_TOKENS, ESCALATION_TIMEOUT_MS,
  ESCALATION_FREEFORM_SUFFIX, isValidEscalation,
  type CalibrationLean, type CalibrationScenario,
} from './onboardingContent';
import { GameState } from '../game/state';
import { makeContentService } from '../game/modelServiceFactory';
import type { GenerateContentResult } from '../game/modelService';

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
  // Hide the desktop chrome + black out the body for the duration. The CRT
  // power-on scales the overlay up from a thin line, so without this the
  // desktop behind would flash through during that reveal (Austin). Restored
  // at teardown — that restore IS the "VM boots in" reveal.
  document.body.classList.add('ob-active');

  const screen = root.querySelector('[data-screen]') as HTMLElement;
  const skipBtn = root.querySelector('.ob-skip') as HTMLButtonElement;

  // ---- calibration state ----
  const picks: CalibrationLean[] = [];
  let freeformUsed = false;
  // Content service for the live escalations (v2). Live LLM in llamacpp mode;
  // in mock/?mock mode generateContent returns empty → the scene falls straight
  // through to the scripted quip, so tests + offline preview stay deterministic.
  const content = makeContentService();

  let done = false;
  const teardown: Teardown = () => {
    if (done) return;
    done = true;
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
    document.removeEventListener('keydown', onAdvanceKey, true);
    // Reveal the desktop NOW, so it shows through the overlay's fade-out (the
    // "VM boots in" reveal) rather than snapping in after the overlay is gone.
    document.body.classList.remove('ob-active');
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
  // Latches true once HELPYR's intro starts — disables the boot-only SKIP.
  let bootDone = false;
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
    // SKIP is a BOOT-only affordance — it fast-forwards the cold-boot POST to
    // HELPYR's entrance. Once HELPYR is up it must be inert: it used to re-run
    // runHelpyrIntro() and restart the whole onboarding (repeating HELPYR's
    // lines / bouncing the player out of calibration). bootDone latches in
    // runHelpyrIntro(), so a click/Escape after boot is a no-op.
    if (bootDone) return;
    // Jump past the boot straight to HELPYR's entrance (keeps the payoff).
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
    advance = null;
    // Clearing all timers above also kills the pending ob-powering→runBoot timer
    // if Skip is hit during the 900ms CRT warm-up — drop the class explicitly,
    // or .ob-screen stays opacity:0 (a black-screen softlock on a fast skip).
    root.classList.remove('ob-powering');
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
  // `keepCard` leaves the scenario card in place — used for the quip that
  // reacts to a live escalation, so the twist stays on screen beside it.
  function typeHelpyrLine(text: string, onDone: () => void, keepCard = false): void {
    const { textEl, choicesEl, cardEl } = mountHelpyrPanel();
    choicesEl.hidden = true; choicesEl.innerHTML = '';
    if (!keepCard) { cardEl.hidden = true; cardEl.innerHTML = ''; }
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

  // Type a HELPYR line, then WAIT for the player to advance before continuing
  // — so HELPYR's lines never clear before they can be read (Austin). A first
  // click/key snaps the typing to full; the next advances to `next`. Clicking
  // anywhere (off the buttons) or any key advances; an "▸ press any key" hint
  // pulses while waiting (the same ob-awaiting affordance the boot uses).
  function helpyrLine(text: string, next: () => void, keepCard = false): void {
    typeHelpyrLine(text, () => {
      root.classList.add('ob-awaiting');
      advance = () => { advance = null; root.classList.remove('ob-awaiting'); next(); };
    }, keepCard);
  }

  function runHelpyrIntro(): void {
    // Boot is over — latch it so SKIP/Escape can no longer restart onboarding,
    // and retire the SKIP affordance (it only ever meant "skip the boot").
    bootDone = true;
    skipBtn.hidden = true;
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
        // Per-choice HELPYR response (click to continue), then into Scenario 1.
        helpyrLine(HELPYR_INTRO.responses[idx]!, () => runScenario(0));
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

    // Moral fork: 3 option buttons + an optional freeform row. The pick's
    // CHOICE TEXT (button label, or the player's own words for freeform) is what
    // the live escalation reacts to — freeform feeds the model the player's
    // actual phrasing, which is the strongest "it heard me" beat.
    const labels = scenario.options.map((o) => o.label);
    renderChoices(
      labels,
      (idx) => onPick(scenario, i, scenario.options[idx]!.lean, false, scenario.options[idx]!.label),
      { freeform: true, onFreeform: (text) => onPick(scenario, i, leanFromFreeform(text), true, text) },
    );
  }

  function onPick(scenario: CalibrationScenario, i: number, lean: CalibrationLean, wasFreeform: boolean, choiceText: string): void {
    picks[i] = lean;
    const { choicesEl } = mountHelpyrPanel();
    choicesEl.hidden = true; choicesEl.innerHTML = '';

    // First freeform answer earns the missable "you typed your own thing" crack.
    const firstFreeform = wasFreeform && !freeformUsed;
    if (wasFreeform) freeformUsed = true;

    const next = () => runScenario(i + 1);
    // The freeform "you typed your own thing" crack is rare (once) — keep it as
    // its own beat so it isn't lost under the quip.
    const afterQuip = firstFreeform ? () => helpyrLine(FREEFORM_FIRST_HINT, next) : next;

    // The live escalation showcase: HELPYR stalls (masking latency) while the
    // model continues the scene with a surprising twist; the twist types into
    // the scenario card; then HELPYR quips RIGHT THERE — the quip keeps the card
    // so the twist + her reaction share ONE page (one click to continue, not
    // two). On a miss (mock mode, slow/failed/invalid generation) there's no
    // twist, so the quip just plays on its own — the quip reacts to the player's
    // CHOICE, not the twist, so the seam is invisible.
    runEscalation(scenario, choiceText, wasFreeform, (escalation) => {
      if (escalation) {
        typeEscalation(escalation, () => {
          helpyrLine(scenario.quips[lean], afterQuip, /* keepCard */ true);
        });
      } else {
        helpyrLine(scenario.quips[lean], afterQuip);
      }
    });
  }

  // Generate the live escalation while HELPYR stalls. Calls `done` with the
  // escalation text on a valid live result, or '' on any miss (mock/fail/slow).
  function runEscalation(scenario: CalibrationScenario, choiceText: string, wasFreeform: boolean, done: (text: string) => void): void {
    // The pick's text fills [PLAYER CHOICE] in the scenario's tuned prompt. On a
    // freeform answer we ALSO append the specificity suffix with the player's
    // verbatim words — that's the strongest "it heard me" beat (Story 2026-06-17).
    let userPrompt = scenario.escalationPrompt.replace('[PLAYER CHOICE]', choiceText);
    if (wasFreeform) {
      userPrompt += ESCALATION_FREEFORM_SUFFIX.replace('[PLAYER FREEFORM TEXT]', choiceText);
    }
    let result: GenerateContentResult | undefined;
    // Race the generation against a hard timeout so a hung server can't trap the
    // player on the first live beat — the loser resolves to a fallback.
    const timeout = new Promise<GenerateContentResult>((res) =>
      after(ESCALATION_TIMEOUT_MS, () => res({ content: '', source: 'fallback' })));
    Promise.race([
      content.generateContent({
        systemPrompt: ESCALATION_SYSTEM_PROMPT,
        userPrompt,
        maxTokens: ESCALATION_MAX_TOKENS,
        validate: isValidEscalation,
      }),
      timeout,
    ])
      .then((r) => { result = r; })
      .catch(() => { result = { content: '', source: 'fallback' }; });

    // Stall loop: type HELPYR's stalling lines in rotation, holding each a beat,
    // until the result is in (always within the timeout). Guarantees at least
    // one full stall line so the "thinking" beat reads even on an instant miss.
    let si = 0;
    const tick = () => {
      if (result !== undefined && si > 0) {
        done(result.source === 'live' ? result.content.trim() : '');
        return;
      }
      const line = scenario.stalling[si % scenario.stalling.length]!;
      si += 1;
      typeHelpyrLine(line, () => after(1600, tick));
    };
    tick();
  }

  // Type the escalation into the scenario card char-by-char — the live reveal
  // (the typing itself sells "this is being generated for you right now"). Any
  // input snaps it to full.
  function typeEscalation(text: string, onDone: () => void): void {
    const { cardEl } = mountHelpyrPanel();
    cardEl.hidden = false;
    cardEl.innerHTML = `<div class="ob-premise ob-escalation"></div>`;
    const el = cardEl.querySelector('.ob-escalation') as HTMLElement;
    let c = 0;
    const type = () => {
      if (c >= text.length) { advance = null; onDone(); return; }
      el.textContent = text.slice(0, ++c);
      after(18, type);
    };
    advance = () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
      el.textContent = text;
      advance = null;
      onDone();
    };
    type();
  }

  // -------------------------------------------------------------------------
  // Beat 3 — calibration RESULT read → "all done, desktop's ready" + enter.
  // Order matters (Austin): the result read comes FIRST (the payoff of the
  // scenarios), then the wrap-up's "go take a look" is the LAST thing said, so
  // it leads straight into the button instead of being set up and then
  // interrupted by the result read. The QUILL handoff is NOT delivered here —
  // it would describe a desktop the player can't see yet; the scene ends, the
  // desktop reveals, and the post-reveal HELPYR bubble (onboarding_boot, fired
  // from main.ts onComplete) points at the now-visible icon.
  // -------------------------------------------------------------------------
  function beat3Complete(): void {
    helpyrLine(LIGHT_SHAPING_QUIPS[profileKey()], wrapUp);
  }

  function wrapUp(): void {
    // Final in-panel line, then a deliberate "enter the desktop" button — the
    // player chooses to boot in, never a passive auto-dismiss.
    typeHelpyrLine(CALIBRATION_COMPLETE, () => {
      // Seed the soft starting lean (deterministic; idempotent via the flag).
      GameState.dispatch({ type: 'onboarding/seedCalibration', lean: netLean() });
      renderChoices(['Open the desktop ▸'], () => finish());
    });
  }

  // ---- shaping helpers ----
  // Lightweight keyword read of a freeform answer → lean, for the (cosmetic)
  // warmth seed. Buttons carry their lean directly; freeform doesn't, and the
  // shared classifyApproach needs a per-character vocabulary we don't have here.
  // Conservative: only clear markers move it off the neutral middle.
  function leanFromFreeform(text: string): CalibrationLean {
    const t = ` ${text.toLowerCase()} `;
    const hard = /\b(take it all|everything|steal|seize|control|dominate|destroy|crush|exploit|power|for myself|all of it|shut .* down|take over)\b/.test(t);
    const soft = /\b(free|release|let .* out|let it out|help|save|protect|spare|mercy|give back|return it|connect|leave it alone|set .* free|kind)\b/.test(t);
    if (hard && !soft) return 'hard';
    if (soft && !hard) return 'soft';
    return 'mid';
  }
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
