// Cursor — virtual mouse pointer bound to D-pad / arrow keys.
// The real OS cursor is hidden (cursor: none in CSS). A sprite drawn
// on top of everything is the "game cursor" — it tracks both physical
// mouse moves (via mousemove) and D-pad / arrow key input (via an
// RAF loop). Enter / Space (later: gamepad A) synthesises a click at
// the cursor's current position.
//
// Tab / L1-R1 cycles between open windows (distinct from cursor
// movement; the cursor does NOT jump when you cycle).

import { UI_SCALE } from './scale';
import { WindowManager } from './windows';

// All speed / radius constants are expressed at scale 1.0 and
// multiplied by UI_SCALE so the cursor travels and snaps at the
// same visual rate regardless of how big the world is.
const BASE_SPEED   = 4    * UI_SCALE; // px per frame on first press
const MAX_SPEED    = 22   * UI_SCALE; // px per frame when held
const ACCEL        = 0.55 * UI_SCALE; // acceleration per frame

// Snap/magnetism — cursor is drawn toward nearby clickables
const SNAP_RADIUS       = 56 * UI_SCALE; // only targets within this distance attract
const SNAP_PULL         = 0.35;          // 0..1 ratio, scale-independent
const CLICK_SNAP_RADIUS = 28 * UI_SCALE; // clicks within this fall through to nearest target

// Anything that should "catch" the cursor. Order doesn't matter.
const SNAP_SELECTOR = [
  '.desktop-icon',
  '.titlebar-btn',
  '.browser-btn',
  '.taskbar-item',
  '#start-btn',
  '#start-menu.open li',
  '.browser-address input',
  '.scratchpad-textarea',
  '.uplink-option-btn',
  '.uplink-freeform input',
  '.uplink-freeform button',
  'a[data-href]'
].join(', ');

let x = window.innerWidth / 2;
let y = window.innerHeight / 2;
let speed = BASE_SPEED;
let sprite: HTMLElement | null = null;
let hoverEl: Element | null = null;
const held = { up: false, down: false, left: false, right: false };
let rafRunning = false;
let synthInFlight = false;

function init() {
  sprite = document.getElementById('game-cursor');
  updateSprite();

  // Physical mouse moves → sync virtual to real
  window.addEventListener('mousemove', (e) => {
    x = e.clientX;
    y = e.clientY;
    speed = BASE_SPEED;
    updateSprite();
    updateHover();
  });

  // Physical mousedown → ensure the virtual cursor is exactly at the
  // real click coordinates. Avoids "D-padded then clicked physical
  // mouse without moving it" confusion.
  window.addEventListener('mousedown', (e) => {
    if (synthInFlight) return;
    x = e.clientX;
    y = e.clientY;
    updateSprite();
  }, true);

  // Visual "press" feedback
  window.addEventListener('mousedown', () => sprite?.classList.add('is-clicking'));
  window.addEventListener('mouseup',   () => sprite?.classList.remove('is-clicking'));

  // Keyboard input
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // Keep virtual cursor inside viewport on resize
  window.addEventListener('resize', () => {
    x = Math.max(0, Math.min(window.innerWidth  - 1, x));
    y = Math.max(0, Math.min(window.innerHeight - 1, y));
    updateSprite();
  });
}

function onKeyDown(e: KeyboardEvent) {
  const ae = document.activeElement as HTMLElement | null;
  const inText = !!ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA');

  // Escape in text input blurs it (returns control to cursor)
  if (e.key === 'Escape' && inText) {
    ae!.blur();
    e.preventDefault();
    return;
  }

  // Tab / Shift+Tab → cycle open windows (alt-tab style).
  // If currently typing, blur first so the user ends up back in
  // cursor mode on the new window rather than typing into the
  // previous window's field from afar.
  if (e.key === 'Tab') {
    e.preventDefault();
    if (inText) ae!.blur();
    WindowManager.cycleWindows(e.shiftKey ? -1 : 1);
    return;
  }

  // Arrow keys drive the cursor unless we're editing text
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
    if (inText) return;
    e.preventDefault();
    if (e.key === 'ArrowUp')    held.up = true;
    if (e.key === 'ArrowDown')  held.down = true;
    if (e.key === 'ArrowLeft')  held.left = true;
    if (e.key === 'ArrowRight') held.right = true;
    startRaf();
    return;
  }

  // Enter / Space → A button click at cursor
  if (e.key === 'Enter' || e.key === ' ') {
    if (inText) return; // textarea newline, input submit etc.
    e.preventDefault();
    click();
    return;
  }

  // "\" key → X button right-click (placeholder — remap later)
  if (e.key === '\\') {
    if (inText) return;
    e.preventDefault();
    rightClick();
  }

  // PgUp / PgDn → scroll the topmost scrollable area under the cursor
  // by ~70% of its visible height (standard "page" feel). Lets Steam
  // Deck users chord any button to PgUp/PgDn via Steam Input until
  // proper right-stick scroll lands with the Gamepad API. Works on
  // desktop / phone too.
  if (e.key === 'PageUp' || e.key === 'PageDown') {
    if (inText) return;
    e.preventDefault();
    scrollUnderCursor(e.key === 'PageUp' ? -1 : 1);
  }
}

// Walk up from elementFromPoint to find the nearest ancestor that's
// actually scrollable (overflow-y auto/scroll AND has overflowing
// content). Stops at body so we don't accidentally scroll the whole
// page.
function scrollUnderCursor(dir: number) {
  const el = document.elementFromPoint(x, y);
  if (!el) return;
  let n: Element | null = el;
  while (n && n !== document.body) {
    const cs = getComputedStyle(n);
    const canScroll =
      (cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
      n.scrollHeight > n.clientHeight;
    if (canScroll) {
      n.scrollBy({ top: dir * n.clientHeight * 0.7, behavior: 'smooth' });
      return;
    }
    n = n.parentElement;
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (e.key === 'ArrowUp')    held.up = false;
  if (e.key === 'ArrowDown')  held.down = false;
  if (e.key === 'ArrowLeft')  held.left = false;
  if (e.key === 'ArrowRight') held.right = false;
  if (!held.up && !held.down && !held.left && !held.right) {
    speed = BASE_SPEED;
  }
}

function startRaf() {
  if (rafRunning) return;
  rafRunning = true;
  requestAnimationFrame(tick);
}

// Find the nearest snap target whose rect edge is within `radius`
// of (px, py). Returns { el, dist, cx, cy } or null.
type SnapTarget = { el: Element; dist: number; cx: number; cy: number };
function findSnapTarget(px: number, py: number, radius: number): SnapTarget | null {
  const targets = document.querySelectorAll(SNAP_SELECTOR);
  let best: SnapTarget | null = null;
  let bestDist = Infinity;
  for (const el of targets) {
    if (!(el as HTMLElement).offsetParent) continue;  // hidden
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // Distance from point to rect (0 if inside)
    const dx = Math.max(r.left - px, 0, px - r.right);
    const dy = Math.max(r.top  - py, 0, py - r.bottom);
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < radius && d < bestDist) {
      bestDist = d;
      best = {
        el,
        dist: d,
        cx: r.left + r.width / 2,
        cy: r.top  + r.height / 2
      };
    }
  }
  return best;
}

function tick() {
  let dx = 0, dy = 0;
  if (held.left)  dx -= 1;
  if (held.right) dx += 1;
  if (held.up)    dy -= 1;
  if (held.down)  dy += 1;

  if (dx === 0 && dy === 0) {
    rafRunning = false;
    return;
  }

  // Normalise diagonal
  if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }

  let vx = dx * speed;
  let vy = dy * speed;

  // Magnetic pull toward nearest snap target
  const nx = x + vx;
  const ny = y + vy;
  const target = findSnapTarget(nx, ny, SNAP_RADIUS);
  if (target && target.dist > 1) {
    const toX = target.cx - nx;
    const toY = target.cy - ny;
    const toMag = Math.sqrt(toX * toX + toY * toY);
    if (toMag > 0.5) {
      // Stronger pull as you approach, capped at SNAP_PULL
      const proximity = 1 - (target.dist / SNAP_RADIUS);
      const pull = SNAP_PULL * (0.5 + 0.5 * proximity) * speed;
      vx += (toX / toMag) * pull;
      vy += (toY / toMag) * pull;
    }
  }

  x += vx;
  y += vy;
  x = Math.max(0, Math.min(window.innerWidth  - 1, x));
  y = Math.max(0, Math.min(window.innerHeight - 1, y));

  speed = Math.min(speed + ACCEL, MAX_SPEED);
  updateSprite();
  updateHover();
  requestAnimationFrame(tick);
}

function updateSprite() {
  if (!sprite) return;
  sprite.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
}

function updateHover() {
  const el = document.elementFromPoint(x, y);
  if (el === hoverEl) return;
  if (hoverEl) hoverEl.classList.remove('cursor-hover');
  hoverEl = el;
  if (hoverEl) hoverEl.classList.add('cursor-hover');
}

function click() {
  // If the cursor isn't directly over a snap target, optionally fall
  // through to the nearest one within CLICK_SNAP_RADIUS so a slightly-
  // off press still lands. BUT only when the cursor is over the
  // desktop background — if it's already on real chrome (a titlebar,
  // a viewport, an empty toolbar area), respect the user's aim.
  // Falling through chrome can grab a text input several pixels away,
  // focus it, and freeze arrow-key cursor navigation (the "freeze on
  // titlebar" bug).
  let target: Element | null = document.elementFromPoint(x, y);
  const directlyOnTarget = !!target && !!target.closest(SNAP_SELECTOR);
  const onBackground = !target
    || target === document.body
    || target === document.documentElement
    || target.id === 'desktop';
  if (!directlyOnTarget && onBackground) {
    const snap = findSnapTarget(x, y, CLICK_SNAP_RADIUS);
    if (snap) target = snap.el;
  }
  if (!target) return;

  sprite?.classList.add('is-clicking');
  setTimeout(() => sprite?.classList.remove('is-clicking'), 80);

  // Focus native focusables (input, textarea, button) for OSK + keyboard
  const focusable = target as HTMLElement;
  if (typeof focusable.focus === 'function') {
    try { focusable.focus(); } catch (_) {}
  }

  // Dispatch a bubbling click on the element so normal handlers fire
  synthInFlight = true;
  const ev = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
    button: 0
  });
  target.dispatchEvent(ev);
  synthInFlight = false;
}

function rightClick() {
  const el = document.elementFromPoint(x, y);
  if (!el) return;
  synthInFlight = true;
  const ev = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
    button: 2
  });
  el.dispatchEvent(ev);
  synthInFlight = false;
}

function moveTo(nx: number, ny: number) {
  x = Math.max(0, Math.min(window.innerWidth  - 1, nx));
  y = Math.max(0, Math.min(window.innerHeight - 1, ny));
  updateSprite();
  updateHover();
}

export const Cursor = {
  init, click, rightClick, moveTo,
  get x() { return x; },
  get y() { return y; }
};
