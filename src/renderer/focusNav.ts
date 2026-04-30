// Focus mode — directional focus traversal between snap targets.
//
// Companion to the virtual Cursor. When input comes from a digital
// source (arrow keys today, D-pad / left stick once Gamepad lands),
// we hide the cursor sprite and jump focus from one snap target to
// the next based on direction. Touch the touchpad / mouse and we
// flip back to cursor mode automatically.
//
// Cursor.ts owns the mode-swap dispatch (it sees keydown/mousemove
// first); this module owns the focus state and the geometry.

import { SNAP_SELECTOR } from './cursor';

export type Direction = 'up' | 'down' | 'left' | 'right';
type Mode = 'cursor' | 'focus';

const RING_CLASS = 'focus-ring';
// Throttle directional moves so a held arrow key doesn't skitter
// past targets. ~140ms maps to ~7 moves/sec when held — feels like
// marching deliberately, not flying.
const MOVE_THROTTLE_MS = 140;
// Directional-nearest weighting: parallel + PERP_WEIGHT * perpendicular.
// Higher = stricter "straight ahead" preference. Standard TV-UI value.
const PERP_WEIGHT = 2;

let mode: Mode = 'cursor';
let focused: HTMLElement | null = null;
let lastMoveTime = 0;

function getMode(): Mode {
  return mode;
}

// Switch to focus mode. Re-seeds focus to the nearest visible snap
// target to (seedX, seedY) — typically the cursor's last position,
// so the hand-off is visible and predictable.
function enter(seedX: number, seedY: number): void {
  if (mode === 'focus') return;
  mode = 'focus';
  document.body.classList.add('mode-focus');
  focused = nearestToPoint(seedX, seedY);
  applyRing();
}

// Switch back to cursor mode. Clears the ring; cursor sprite reappears
// at its last position via the CSS body class toggle.
function leave(): void {
  if (mode === 'cursor') return;
  mode = 'cursor';
  document.body.classList.remove('mode-focus');
  clearRing();
}

// Move focus in the given direction. No-op if not in focus mode or
// throttled. If the previously focused element vanished from the DOM
// (e.g. its window closed), re-seed to viewport center first.
function move(dir: Direction): void {
  if (mode !== 'focus') return;
  const now = performance.now();
  if (now - lastMoveTime < MOVE_THROTTLE_MS) return;

  if (focused && !isViable(focused)) focused = null;
  if (!focused) {
    focused = nearestToPoint(window.innerWidth / 2, window.innerHeight / 2);
    applyRing();
    lastMoveTime = now;
    return;
  }

  const next = nearestInDirection(focused, dir);
  if (next) {
    focused = next;
    applyRing();
    next.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    lastMoveTime = now;
  }
}

// Activate the focused element — same shape as Cursor.click(): set
// native focus (for OSK / keyboard handlers), then dispatch a
// synthetic bubbling click at the element's center.
function activate(): void {
  if (mode !== 'focus' || !focused || !isViable(focused)) return;
  if (typeof focused.focus === 'function') {
    try { focused.focus(); } catch (_) { /* some elements reject focus */ }
  }
  const r = focused.getBoundingClientRect();
  const ev = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: r.left + r.width / 2,
    clientY: r.top + r.height / 2,
    button: 0
  });
  focused.dispatchEvent(ev);
}

// --- Internals ---

function allTargets(): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const el of document.querySelectorAll(SNAP_SELECTOR)) {
    if (!isViable(el)) continue;
    out.push(el as HTMLElement);
  }
  return out;
}

function isViable(el: Element): boolean {
  if (!(el as HTMLElement).offsetParent) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  if (r.right < 0 || r.bottom < 0) return false;
  if (r.left > window.innerWidth || r.top > window.innerHeight) return false;
  return true;
}

function nearestToPoint(px: number, py: number): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestDist = Infinity;
  for (const el of allTargets()) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const d = Math.hypot(cx - px, cy - py);
    if (d < bestDist) { bestDist = d; best = el; }
  }
  return best;
}

// Among targets in the requested half-plane (relative to `from`'s
// center), minimize parallel + PERP_WEIGHT * perpendicular distance.
// This is the standard "spatial navigation" heuristic used in TV
// remote UIs — favors straight-line moves over diagonal jumps while
// still letting you reach off-axis targets when nothing's directly
// in line.
function nearestInDirection(from: HTMLElement, dir: Direction): HTMLElement | null {
  const fr = from.getBoundingClientRect();
  const fcx = fr.left + fr.width / 2;
  const fcy = fr.top + fr.height / 2;

  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of allTargets()) {
    if (el === from) continue;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = cx - fcx;
    const dy = cy - fcy;

    let parallel: number;
    let perp: number;
    switch (dir) {
      case 'right': if (dx <= 0) continue; parallel = dx;  perp = Math.abs(dy); break;
      case 'left':  if (dx >= 0) continue; parallel = -dx; perp = Math.abs(dy); break;
      case 'down':  if (dy <= 0) continue; parallel = dy;  perp = Math.abs(dx); break;
      case 'up':    if (dy >= 0) continue; parallel = -dy; perp = Math.abs(dx); break;
    }
    const score = parallel + PERP_WEIGHT * perp;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  return best;
}

function applyRing(): void {
  clearRing();
  if (focused) focused.classList.add(RING_CLASS);
}

function clearRing(): void {
  document.querySelectorAll('.' + RING_CLASS).forEach(el => el.classList.remove(RING_CLASS));
}

export const FocusNav = {
  getMode, enter, leave, move, activate
};
