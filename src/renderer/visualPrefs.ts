// Visual preferences — wallpaper, CRT filter, CRT glow (UI pass 2026-06-10).
//
// Cosmetic-only settings, persisted in localStorage OUTSIDE the save so
// debug/reset keeps them. Consumed by the Display Properties app (the
// player-facing mock that later grows into the in-fiction settings panel)
// and restored at boot by desktop.ts.
//
// Glow levels (see ui-style-guide §7). Default is "bloom" (Austin,
// 2026-06-10):
//   bloom — backdrop-filter: url(#crt-bloom-filter); a true bright-pass
//           bloom (SVG filter in index.html) — brights halo, darks don't.
//           Engine-dependent: verified in Chromium; silently no-ops on
//           engines without backdrop-filter:url() (verify Deck browser /
//           Tauri WebKitGTK — if unsupported there, consider auto-
//           falling back to "soft").
//   soft  — backdrop-filter blur(0.4px) + slight brightness/saturate; a
//           cheap "phosphor smear" that reads as CRT softness everywhere.
//   off   — no glow layer at all.

export const WALLPAPERS = ['dusk', 'prometheus', 'slate'] as const;
export type Wallpaper = typeof WALLPAPERS[number];

export const GLOW_LEVELS = ['off', 'soft', 'bloom'] as const;
export type GlowLevel = typeof GLOW_LEVELS[number];

const WP_KEY = 'pt.wallpaper';
const CRT_KEY = 'pt.crt';
const GLOW_KEY = 'pt.crtGlow';

export function getWallpaper(): Wallpaper {
  return (document.getElementById('desktop')!.dataset.wallpaper as Wallpaper) || 'dusk';
}

export function setWallpaper(wp: Wallpaper): void {
  document.getElementById('desktop')!.dataset.wallpaper = wp;
  try { localStorage.setItem(WP_KEY, wp); } catch { /* private mode */ }
}

export function getCrtEnabled(): boolean {
  return !document.body.classList.contains('crt-off');
}

export function setCrtEnabled(on: boolean): void {
  document.body.classList.toggle('crt-off', !on);
  try { localStorage.setItem(CRT_KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
}

export function getGlowLevel(): GlowLevel {
  return (document.body.dataset.crtGlow as GlowLevel) || 'bloom';
}

export function setGlowLevel(level: GlowLevel): void {
  document.body.dataset.crtGlow = level;
  try { localStorage.setItem(GLOW_KEY, level); } catch { /* private mode */ }
}

/** Boot-time restore. Called once from initDesktop(). */
export function restoreVisualPrefs(): void {
  try {
    const wp = localStorage.getItem(WP_KEY);
    if (wp && (WALLPAPERS as readonly string[]).includes(wp)) {
      document.getElementById('desktop')!.dataset.wallpaper = wp;
    }
    if (localStorage.getItem(CRT_KEY) === 'off') document.body.classList.add('crt-off');
    const glow = localStorage.getItem(GLOW_KEY);
    if (glow && (GLOW_LEVELS as readonly string[]).includes(glow)) {
      document.body.dataset.crtGlow = glow;
    }
  } catch { /* private mode */ }
}
