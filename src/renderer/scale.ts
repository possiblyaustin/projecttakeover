// UI scale — single source of truth for "how big is the world?"
// CSS sets --ui-scale on :root via media queries; we read it here so
// JS-side pixel constants (cursor speed, snap radii, default window
// sizes, icon spawn positions) scale with the UI.
//
// localStorage override (set by PT.setScale) wins over media queries —
// useful for testing any scale on any device.

const SCALE_STORAGE_KEY = 'pt:ui-scale';

function applyStoredScaleOverride(): void {
  const stored = localStorage.getItem(SCALE_STORAGE_KEY);
  if (stored && !Number.isNaN(parseFloat(stored))) {
    document.documentElement.style.setProperty('--ui-scale', stored);
  }
}
applyStoredScaleOverride();

export function getUiScale(): number {
  const v = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')
  );
  return Number.isFinite(v) && v > 0 ? v : 1;
}

// Captured at module load; consumers read UI_SCALE rather than
// calling getUiScale() repeatedly. setScale() reloads the page so
// we never have to deal with mid-session re-layout.
export const UI_SCALE: number = getUiScale();

export function setScale(n: number): void {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
    console.warn('PT.setScale: expected a positive number, got', n);
    return;
  }
  localStorage.setItem(SCALE_STORAGE_KEY, String(n));
  location.reload();
}

export function clearScale(): void {
  localStorage.removeItem(SCALE_STORAGE_KEY);
  location.reload();
}
