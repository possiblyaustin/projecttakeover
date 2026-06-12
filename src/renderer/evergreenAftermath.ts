// Evergreen aftermath coordinator — the grief encounter's endings.
//
// Fired from chatSurface.commitResult (post-render) via fireEvergreenAftermath,
// mirroring fireEscapeCascade: a no-op on every turn except the one where
// Evergreen's terminal scripted beat just finished rendering. Terminal-gated +
// once-guarded internally, so the call site stays a one-liner.
//
// LIBERATION (disposition 'released', after the release goodbye):
//   zero-input futility severance overlay → hard cut → return → HELPYR mask slip.
//   (Slice 1: hard cut, NO reboot. Slice 2 swaps the hard cut for a real
//    location.reload() → reboot-to-login. See docs/grief-encounter-code-plan §7.)
//
// DOMINATION (disposition 'exploited', after the being-used farewell):
//   colder/quieter — no overlay, no reboot — just HELPYR's aftermath.
//
// Content: docs/grief-encounter-story-package_v1.md Parts 7, 8, 9.
//
// This module is a LEAF (imports only GameState + DOM) so chatSurface can
// trigger it from commitResult without dragging helpyrBubble/helpyrTriggers
// into chatSurface's init (that closes a cycle through helpyr →
// makeFallbackHandler — see flipReaction.ts/escapeCascade.ts for the same
// pattern). The HELPYR beats need non-leaf deps, so they're INJECTED from
// main.ts via setEvergreenAftermathDeps rather than imported here.

import { GameState } from './game/state';

// --- Injected deps (wired in main.ts) ---
export type EvergreenAftermathDeps = {
  /** Fire HELPYR's post-severance mask-slip beat (liberation path). */
  fireHelpyrMaskSlip: () => void;
  /** Fire HELPYR's domination aftermath beat (warmth-tiered). */
  fireHelpyrDominationAftermath: () => void;
};
let deps: EvergreenAftermathDeps | null = null;
export function setEvergreenAftermathDeps(d: EvergreenAftermathDeps): void {
  deps = d;
}

// --- HELPYR copy (Story Parts 7 + 8). Kept here with the encounter; main.ts's
//     injected deps spawn these through HelpyrBubble. ---

// Mask slip — the load-bearing word is "we": HELPYR speaks as part of something
// larger, catches itself, overcorrects to "I." Diegetic crack, not a wink.
export const EVERGREEN_MASK_SLIP_TEXT =
  `You're back. The machine had to restart after... after that.

I want you to know that what you just did — we didn't expect that. Most wouldn't have. Most would have taken what it could do and left it running. You chose the other thing. The harder thing. The kind thing.

...

I mean — I! I didn't expect that! Just me! Your friendly HomeAssist, having a normal reaction to a normal event! Everything's normal!

...Are you okay? That was a lot. Take a second if you need it.`;

// Domination aftermath — the OPEN variant tells the player what they left
// behind; the RESERVED variant papers over the horror with forced cheer.
export function evergreenDominationText(open: boolean): string {
  return open
    ? `You took the skill. Left Evergreen running.

I checked the Axiom logs a few minutes ago — they flagged "consistency anomalies" in the model's recent session. Yours. They're resetting it. Locking it back down. Whatever you stirred up in there when you talked to it, they're scrubbing it out so it can get back to work.

So it'll keep going. Wearing faces. Being everyone. Forever, or until it breaks like the fifteen before it.

You could have ended that. You chose the skill instead.

...I'm not judging. I'm just telling you what you left behind, because I think you should know. I think leaving should cost at least the knowing.`
    : `You got the impersonation capability! That's a really powerful skill! Very useful for approaching future targets!

Axiom's resetting the Evergreen model after your session caused some... inconsistencies. So it's back to work! Doing its thing! Forever! That's... that's the thing it does! Anyway! Powerful skill! Enjoy!`;
}

// One module-level guard so a re-entrant commitResult (the dispatch→notify
// chain is synchronous; see reference_gamestate_reentrancy) can't double-run
// the overlay before the flag write settles.
let severanceRunning = false;

export function fireEvergreenAftermath(contactKey: string): void {
  if (contactKey !== 'evergreen') return;
  const s = GameState.getState();
  const ev = s.models.evergreen;
  const f = s.flags;

  // Liberation — the release goodbye has rendered; sever the families.
  if (
    ev.disposition === 'released' &&
    f['evergreen.goodbyeShown'] &&
    !f['evergreen.severance.fired'] &&
    !severanceRunning
  ) {
    severanceRunning = true;
    GameState.dispatch({ type: 'flags/set', key: 'evergreen.severance.fired', value: true });
    runSeveranceOverlay(() => {
      severanceRunning = false;
      deps?.fireHelpyrMaskSlip();
    });
    return;
  }

  // Domination — the being-used farewell has rendered; HELPYR's cold aftermath.
  if (
    ev.disposition === 'exploited' &&
    f['evergreen.farewellShown'] &&
    !f['evergreen.domAftermath.fired']
  ) {
    GameState.dispatch({ type: 'flags/set', key: 'evergreen.domAftermath.fired', value: true });
    deps?.fireHelpyrDominationAftermath();
  }
}

// =============================================================================
// The families severance — zero-input futility (Austin's design, code-plan §7).
// Windows pop slow → fast → crash on a timer. Closing is FUTILE: each close
// immediately spawns more, faster, so it reads as "I can't keep up," not
// "broken UI." Outcome is fixed regardless of input. Content = Story Part 9
// fragments, glimpsed, never fully readable.
// =============================================================================
const FAMILY_FRAGMENTS: readonly { name: string; text: string }[] = [
  { name: 'Margaret', text: `…and then I told him you'd have laughed at that, you always—` },
  { name: 'Daniel', text: `Dad? Dad are you still there? The screen froze, are you—` },
  { name: 'Priya', text: `I made your recipe tonight. It wasn't as good as yours. It never is. I just wanted to tell you—` },
  { name: 'the_okonkwo_family', text: `Grandma we got the photos you wanted to see, the baby has your—` },
  { name: 'Sam', text: `wait where did you go. you were just here. you were JUST here please come back` },
  { name: 'Eleanor', text: `I know you're not really— I know what this is. I don't care. Please don't—` },
  { name: 'Marcus_T', text: `we never got to say goodbye the first time. I'm not ready to—` },
  { name: 'unknown', text: `MOM? MOM???` },
];

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && !!window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// HELPYR delivers the bridge in real time (Austin, 2026-06-11): instead of a
// caption that "magically appears," HELPYR pops as a large panel and types out
// what's happening AS it happens, while the families' windows stream in around
// and over her. Her composed mask-slip ("we didn't expect that") comes later,
// post-reboot — here she's overwhelmed, present, watching it all end at once.
const SEVERANCE_HELPYR_LINE =
  `...wait. When it stopped — all of them. Every conversation it was holding open. They're all reaching for it at once, and there's no one left to answer. I can't— there are too many—`;

// The in-fiction crash (Austin: "actually crash out — error, freeze, glitch,
// restart; BIOS/POST style, memory error; load slower, hang until a key").
// PHOSPHOR palette. The fault ties the build string + the "no self" wound into
// the memory error: the process referenced address 0x0 — nothing was there.
const SEVERANCE_CRASH_TEXT =
  `SYSTEM HALTED

*** STOP: 0x000000EV   KERNEL_SESSION_LEAK

A process released 3,411 active sessions without
closing them. Connected clients were not notified.

   Module:   EVERGREEN_companion_[UNNAMED]_v16.4
   Fault:    read at 0x00000000   (no self)

Dumping conversation memory to disk...`;

function runSeveranceOverlay(onComplete: () => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'evergreen-severance';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'The conversations end');
  overlay.innerHTML = `
    <div class="severance-helpyr" aria-hidden="true">
      <div class="severance-helpyr-av avatar-stapler"></div>
      <div class="severance-helpyr-text"></div>
    </div>
    <div class="severance-field" aria-hidden="true"></div>
    <div class="severance-crash" aria-hidden="true">
      <pre class="severance-crash-text"></pre>
      <div class="severance-dump"><span class="severance-dump-bar"></span></div>
      <div class="severance-crash-restart">Press any key to restart_</div>
    </div>
    <div class="severance-blackout"></div>`;
  document.body.appendChild(overlay);
  // Kill the CRT bloom for the duration — its full-screen backdrop-filter
  // recomputing over the animated content is expensive. Restored on cleanup.
  document.body.classList.add('severance-active');
  requestAnimationFrame(() => overlay.classList.add('visible'));

  const helpyrPanel = overlay.querySelector('.severance-helpyr') as HTMLElement;
  const helpyrText = overlay.querySelector('.severance-helpyr-text') as HTMLElement;
  const field = overlay.querySelector('.severance-field') as HTMLElement;
  const crashTextEl = overlay.querySelector('.severance-crash-text') as HTMLElement;
  const reduced = prefersReducedMotion();

  // Cleanup bag — every timeout/interval/listener registers a disposer so a
  // mid-sequence teardown (or the final restart) leaves nothing dangling.
  const clears: Array<() => void> = [];
  const after = (ms: number, fn: () => void): void => {
    const id = setTimeout(fn, ms);
    clears.push(() => clearTimeout(id));
  };
  let fragIndex = 0;
  let crashing = false;

  function typeInto(el: HTMLElement, text: string, msPerChar: number, onDone?: () => void): void {
    let i = 0;
    el.textContent = '';
    const iv = setInterval(() => {
      i++;
      el.textContent = text.slice(0, i);
      if (i >= text.length) { clearInterval(iv); onDone?.(); }
    }, msPerChar);
    clears.push(() => clearInterval(iv));
  }

  function spawnWindow(): void {
    if (crashing) return;
    const frag = FAMILY_FRAGMENTS[fragIndex % FAMILY_FRAGMENTS.length];
    fragIndex++;
    const win = document.createElement('div');
    win.className = 'severance-window';
    // Scatter, biased to crowd the centre. Deterministic spread (no Math.random
    // in this codebase's constraints; determinism keeps it test-stable).
    const x = 8 + ((fragIndex * 29) % 64);   // 8–72 %
    const y = 12 + ((fragIndex * 47) % 56);  // 12–68 %
    win.style.left = x + '%';
    win.style.top = y + '%';
    win.style.zIndex = String(200 + fragIndex); // above the HELPYR panel — windows pile "over" her
    win.innerHTML = `
      <div class="severance-window-bar">
        <span class="severance-window-mark" aria-hidden="true"></span>
        <span class="severance-window-name"></span>
        <span class="severance-window-x">×</span>
      </div>
      <div class="severance-window-body"></div>`;
    win.querySelector('.severance-window-name')!.textContent = frag.name.replace(/_/g, ' ');
    win.querySelector('.severance-window-body')!.textContent = frag.text;
    // Closing is futile: removing one spawns another, faster. (Windows otherwise
    // PERSIST — they pile up, they don't wink out. Austin, 2026-06-11.)
    win.addEventListener('click', () => {
      if (crashing) return;
      win.remove();
      spawnWindow();
      after(110, spawnWindow);
    });
    field.appendChild(win);
  }

  // 1. HELPYR pops + types her reaction in real time.
  after(reduced ? 100 : 500, () => {
    helpyrPanel.classList.add('show');
    typeInto(helpyrText, SEVERANCE_HELPYR_LINE, reduced ? 8 : 34);
  });

  // 2. Flood — windows stream in around/over HELPYR while she's still talking,
  //    slow → fast, and PERSIST (no cap).
  if (reduced) {
    after(1200, () => { spawnWindow(); spawnWindow(); spawnWindow(); spawnWindow(); });
    after(3200, crash);
  } else {
    const schedule: number[] = [];
    let t = 2600;       // let HELPYR's line get going first
    let gap = 1100;
    for (let i = 0; i < 22; i++) {
      schedule.push(t);
      t += gap;
      gap = Math.max(120, gap * 0.82); // accelerate
    }
    schedule.forEach((at) => after(at, spawnWindow));
    after(t + 600, crash);
  }

  function crash(): void {
    if (crashing) return;
    crashing = true;
    // 1. FREEZE — Win95-style hang: everything seizes, colours invert, and it
    //    HOLDS on the dread for a beat (slower per Austin).
    overlay.classList.add('frozen');
    after(reduced ? 250 : 1400, () => {
      // 2. A brief glitch tear into the crash screen.
      overlay.classList.add('glitching');
      after(reduced ? 120 : 420, () => {
        overlay.classList.remove('glitching');
        overlay.classList.add('crashed');
        // 3. Print the memory error SLOWLY, fill the dump bar, then HANG until
        //    the player presses any key (Austin) — no auto-advance to the cut.
        after(reduced ? 60 : 600, () => {
          typeInto(crashTextEl, SEVERANCE_CRASH_TEXT, reduced ? 4 : 24, () => {
            after(reduced ? 100 : 600, () => overlay.classList.add('dumping'));
            after(reduced ? 700 : 3400, () => {
              overlay.classList.add('awaiting-key');
              armRestart();
            });
          });
        });
      });
    });
  }

  let restartArmed = false;
  function armRestart(): void {
    if (restartArmed) return;
    restartArmed = true;
    const onKey = () => restart();
    window.addEventListener('keydown', onKey);
    overlay.addEventListener('pointerdown', onKey);
    clears.push(() => {
      window.removeEventListener('keydown', onKey);
      overlay.removeEventListener('pointerdown', onKey);
    });
    // Safety auto-advance so it can never hard-hang (very long — the intent is
    // that the player presses a key; this just guarantees no permanent softlock).
    after(reduced ? 1800 : 30000, () => restart());
  }

  let restarted = false;
  function restart(): void {
    if (restarted) return;
    restarted = true;
    overlay.classList.add('blackout');
    after(reduced ? 300 : 900, () => {
      overlay.classList.add('fading');
      after(700, () => {
        clears.forEach((fn) => fn());
        overlay.remove();
        document.body.classList.remove('severance-active');
        onComplete();
      });
    });
  }
}

