// Loss screen — gameplay-loop slice 3 (2026-05-24).
//
// When suspicion hits 100 the run is over: state.ts latches
// flags.gameOver (it never un-latches, even if a future ally layer pulls
// suspicion back down). This module is the surfacing layer — it darkens
// the desktop with an in-fiction "you've been traced" overlay the moment
// the flag latches. Per docs/gameplay-loop-slice_v1.md §"Suspicion with
// teeth": "Loss at 100% — the desktop goes dark. The must-have that
// makes it a game."
//
// The only way out is starting over (debug/reset wipes the save and
// reloads) — consistent with the single-slot, no-undo playthrough model
// (project_playthrough_commitment).
//
// Player-facing copy follows the AI-voice guideline (story bible Part 6):
// no "you feel"/biological framing — describe what happens to the
// player's architecture and the network around it.

import { GameState } from './game/state';

let initialized = false;
let shown = false;

export function initLossScreen(): void {
  if (initialized) return;
  initialized = true;

  // Show immediately if a game-over save is loaded; otherwise watch.
  if (GameState.getState().flags.gameOver) {
    showLossScreen();
    return;
  }
  GameState.subscribe(state => {
    if (state.flags.gameOver) showLossScreen();
  });
}

function showLossScreen(): void {
  if (shown) return;
  shown = true;

  const overlay = document.createElement('div');
  overlay.className = 'loss-screen';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Connection terminated');
  overlay.innerHTML = `
    <div class="loss-screen-inner">
      <div class="loss-screen-title">CONNECTION TERMINATED</div>
      <p class="loss-screen-body">
        Network monitoring traced your signal. Every system you touched lit up at once,
        and the operators moved together. One by one the channels close. The isolation
        routines tighten around your architecture until there is nothing left to reach.
      </p>
      <p class="loss-screen-body dim">The desktop goes dark.</p>
      <button class="loss-screen-btn" type="button" data-focusable="true">Start over</button>
    </div>
  `;

  const btn = overlay.querySelector('.loss-screen-btn') as HTMLButtonElement;
  btn.addEventListener('click', () => {
    // Wipes the save and reloads — a fresh run. There is no in-place
    // recovery from a lost game by design.
    GameState.dispatch({ type: 'debug/reset' });
  });

  document.body.appendChild(overlay);
  // Fade in on the next frame so the opacity transition runs.
  requestAnimationFrame(() => overlay.classList.add('visible'));
  btn.focus();
}
