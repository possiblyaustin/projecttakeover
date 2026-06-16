// Display Properties — wallpaper / CRT-filter / glow controls.
//
// UI pass 2026-06-10: a deliberately small Platinum-era settings dialog
// that mocks the future in-fiction settings panel (Story owns the final
// fiction — candidate home for the resolution/UI-scale picker too, see
// memory project_resolution_setting_idea). All it does is read/write
// visualPrefs.ts; every change applies live so it doubles as a preview.
//
// Controls are plain buttons (not native radio/checkbox) so the virtual
// cursor + D-pad focus treatment matches the rest of the chrome.

import type { AppDef, AppContext, WinParams } from '../types';
import {
  WALLPAPERS, GLOW_LEVELS,
  getWallpaper, setWallpaper,
  getCrtEnabled, setCrtEnabled,
  getGlowLevel, setGlowLevel,
  type Wallpaper, type GlowLevel,
} from '../visualPrefs';
import { fireOnceLibraryTrigger } from '../helpyrTriggers';

const WALLPAPER_LABELS: Record<Wallpaper, string> = {
  dusk: 'Dusk',
  prometheus: 'Prometheus OEM',
  slate: 'Slate',
};

const GLOW_LABELS: Record<GlowLevel, { name: string; hint: string }> = {
  off:   { name: 'Off',   hint: 'No glow' },
  soft:  { name: 'Soft',  hint: 'Gentle phosphor smear' },
  bloom: { name: 'Bloom', hint: 'Bright areas halo' },
};

export const DisplayPropertiesApp: AppDef = {
  id: 'displayProperties',
  name: 'Display Properties',
  glyphClass: 'icon-display',
  defaultSize: { w: 360, h: 332 },
  render(container: HTMLElement, _params: WinParams, ctx: AppContext) {
    ctx.setTitle('Display Properties');
    container.innerHTML = `
      <div class="dprops">
        <fieldset class="dprops-group">
          <legend>Wallpaper</legend>
          <div class="dprops-swatches">
            ${WALLPAPERS.map(wp => `
              <button class="dprops-swatch" data-wp="${wp}" data-focusable="true" tabindex="0" aria-label="${WALLPAPER_LABELS[wp]}">
                <span class="dprops-swatch-art dprops-swatch-${wp}"></span>
                <span class="dprops-swatch-label">${WALLPAPER_LABELS[wp]}</span>
              </button>`).join('')}
          </div>
        </fieldset>
        <fieldset class="dprops-group">
          <legend>Screen Effects</legend>
          <button class="dprops-check" data-setting="crt" data-focusable="true" tabindex="0">
            <span class="dprops-box"></span>
            <span>CRT filter <em>(scanlines &amp; vignette)</em></span>
          </button>
          <div class="dprops-radio-row" role="group" aria-label="Glow">
            <span class="dprops-radio-caption">Glow:</span>
            ${GLOW_LEVELS.map(g => `
              <button class="dprops-radio" data-glow="${g}" data-focusable="true" tabindex="0" title="${GLOW_LABELS[g].hint}">
                <span class="dprops-dot"></span><span>${GLOW_LABELS[g].name}</span>
              </button>`).join('')}
          </div>
          <p class="dprops-hint"></p>
        </fieldset>
      </div>
    `;

    const swatches = [...container.querySelectorAll<HTMLButtonElement>('.dprops-swatch')];
    const crtCheck = container.querySelector<HTMLButtonElement>('.dprops-check')!;
    const radios = [...container.querySelectorAll<HTMLButtonElement>('.dprops-radio')];
    const hint = container.querySelector<HTMLElement>('.dprops-hint')!;

    function sync() {
      const wp = getWallpaper();
      swatches.forEach(b => b.classList.toggle('selected', b.dataset.wp === wp));
      const crtOn = getCrtEnabled();
      crtCheck.classList.toggle('checked', crtOn);
      const glow = getGlowLevel();
      radios.forEach(b => {
        b.classList.toggle('selected', b.dataset.glow === glow);
        // Glow rides the CRT layer family — gray the row out when the
        // filter itself is off.
        b.disabled = !crtOn;
      });
      hint.textContent = crtOn ? GLOW_LABELS[glow].hint : 'Enable the CRT filter to adjust glow.';
    }

    swatches.forEach(b => b.addEventListener('click', () => {
      setWallpaper(b.dataset.wp as Wallpaper);
      sync();
    }));
    crtCheck.addEventListener('click', () => {
      setCrtEnabled(!getCrtEnabled());
      sync();
    });
    radios.forEach(b => b.addEventListener('click', () => {
      setGlowLevel(b.dataset.glow as GlowLevel);
      sync();
    }));

    sync();

    // HELPYR's redecorating beat (Story — ui-fiction-package_v1.md §1). Fires
    // once, the first time the player opens this panel. Slightly deferred so
    // the window finishes opening before the bubble appears. Flag-gated, so a
    // reopen never re-fires; warmth tier picked at fire time.
    setTimeout(() => {
      fireOnceLibraryTrigger('displayProperties.introSeen', 'display_properties_opened');
    }, 900);
  },
};
