// Cursor — virtual mouse pointer for analog input (mouse, touchpad,
// later: right analog stick). The real OS cursor is hidden; a sprite
// drawn on top of everything is the "game cursor" and tracks mousemove
// + an RAF loop driven by held flags. Enter / Space synthesises a
// click at the cursor's current position.
//
// Digital input (arrow keys today, later: D-pad / left stick) goes
// through FocusNav instead — virtual cursors are a clumsy metaphor
// for digital input. The mode swap is automatic: arrow keydown →
// focus mode; mousemove → back to cursor mode.
//
// Tab / L1-R1 cycles between open windows (distinct from cursor
// movement and focus traversal; works in either mode).

import { UI_SCALE } from './scale';
import { WindowManager } from './windows';
import { FocusNav, type Direction } from './focusNav';
import { tryAdvancePagedScope } from './components/pageNav';

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
// Exported so FocusNav can traverse the same set — there's only one
// notion of "interactable target" in the shell.
//
// Tray items snap individually (slice 1.5, 2026-05-08): #systray-helpyr
// is a clickable button that opens HELPYR chat; #systray-suspicion is
// informational but reachable so the focus tooltip surfaces the
// in-fiction status text. The wrapping #systray container is no longer
// in the selector — focus moves directly to whichever child item the
// player is targeting.
export const SNAP_SELECTOR = [
  '.desktop-icon',
  '.titlebar-btn',
  '.browser-btn',
  '.taskbar-item',
  '#start-btn',
  '#start-menu.open li',
  '#systray-helpyr',
  '#systray-suspicion',
  '.page-nav-btn',
  '.browser-address input',
  '.scratchpad-textarea',
  '.uplink-option-btn',
  '.uplink-freeform input',
  '.uplink-freeform button',
  '.uplink-earlier-chip',
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

  // Physical mouse moves → sync virtual to real, and exit focus mode
  // if we were in it (touchpad on Deck emits mousemove). The cursor
  // sprite reappears at the synced position via the body class toggle.
  window.addEventListener('mousemove', (e) => {
    x = e.clientX;
    y = e.clientY;
    speed = BASE_SPEED;
    updateSprite();
    updateHover();
    if (FocusNav.getMode() === 'focus') FocusNav.leave();
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

  // Arrow keys drive directional FOCUS traversal, not the cursor.
  // First press from cursor mode just establishes focus near the
  // cursor's last position (so the hand-off is visible). Subsequent
  // presses navigate. Mousemove flips us back to cursor mode.
  // (The held/RAF loop below stays around for analog input — left
  // stick will set held flags directly when Gamepad lands.)
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
    if (inText) return;
    e.preventDefault();
    if (FocusNav.getMode() === 'cursor') {
      FocusNav.enter(x, y);
    } else {
      const dir = arrowToDir(e.key);
      if (dir) FocusNav.move(dir);
    }
    return;
  }

  // Enter / Space → activate. In focus mode that's the focused element;
  // in cursor mode it's a click at the cursor sprite's position.
  if (e.key === 'Enter' || e.key === ' ') {
    if (inText) return; // textarea newline, input submit etc.
    e.preventDefault();
    if (FocusNav.getMode() === 'focus') {
      FocusNav.activate();
    } else {
      click();
    }
    return;
  }

  // "\" key → X button right-click (placeholder — remap later)
  if (e.key === '\\') {
    if (inText) return;
    e.preventDefault();
    rightClick();
  }

  // PgUp / PgDn — first try to advance a paginated surface (Web Dynamo
  // article, Uplink Log) within whatever DOM scope contains the
  // current focus / cursor target. If nothing handled it, fall through
  // to the original "scroll the topmost scrollable area" behavior.
  // Steam Input maps LB/RB to these keys on Deck for one-button
  // pagination + scrolling.
  if (e.key === 'PageUp' || e.key === 'PageDown') {
    if (inText) return;
    e.preventDefault();
    const dir = e.key === 'PageUp' ? -1 : 1;
    const target = (document.activeElement as Element | null)
      || document.elementFromPoint(x, y);
    if (target && tryAdvancePagedScope(target, dir)) return;
    scrollUnderCursor(dir);
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

// Keyboard arrows no longer set held flags (they go through FocusNav
// now). The keyup handler stays in place because the held-flag /
// RAF loop will be reused for analog input — the future gamepad
// poll will set held flags directly when the left stick is deflected.
function onKeyUp(_e: KeyboardEvent) {
  if (!held.up && !held.down && !held.left && !held.right) {
    speed = BASE_SPEED;
  }
}

function arrowToDir(key: string): Direction | null {
  switch (key) {
    case 'ArrowUp':    return 'up';
    case 'ArrowDown':  return 'down';
    case 'ArrowLeft':  return 'left';
    case 'ArrowRight': return 'right';
    default:           return null;
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
