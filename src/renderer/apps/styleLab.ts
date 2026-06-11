// Style Lab — living template of the three design eras (dev tool).
//
// UI pass 2026-06-10. One window, three toggles: render the SAME
// placeholder content in each design language from the style guide —
// Phosphor (DOS/BIOS ~1985-93), Platinum (Win95/Mac OS 8 ~1995-99),
// Luna (XP ~2001-06). When styling a new app, open this, flip to the
// app's era, and steal the classes (.lab-* rules in main.css are the
// canonical signatures; docs/ui-style-guide_v1.md §2 is the prose).
//
// Placeholder content exercises the pieces every app ends up needing:
// heading + body text, primary/secondary buttons, a text input, list
// rows, and a status tag.

import type { AppDef, AppContext, WinParams } from '../types';

type Era = 'phosphor' | 'platinum' | 'luna';

const ERAS: { key: Era; label: string; caption: string }[] = [
  { key: 'phosphor', label: 'Phosphor', caption: 'DOS / BIOS · ~1985–93 · system bones, diagnostics, hacker tools' },
  { key: 'platinum', label: 'Platinum', caption: 'Win95 / Mac OS 8 · ~1995–99 · the OS itself + bundled software' },
  { key: 'luna',     label: 'Luna',     caption: 'Windows XP · ~2001–06 · modern consumer software, big operators' },
];

export const StyleLabApp: AppDef = {
  id: 'styleLab',
  name: 'Style Lab',
  glyphClass: 'icon-textfile',
  defaultSize: { w: 470, h: 400 },
  noContentPad: true,
  render(container: HTMLElement, _params: WinParams, ctx: AppContext) {
    ctx.setTitle('Style Lab — era templates');
    container.innerHTML = `
      <div class="stylelab">
        <div class="stylelab-tabs">
          ${ERAS.map(e => `
            <button class="stylelab-tab" data-era="${e.key}" data-focusable="true" tabindex="0">${e.label}</button>
          `).join('')}
        </div>
        <div class="stylelab-caption"></div>
        <div class="stylelab-stage">
          <div class="lab-panel">
            <div class="lab-heading">Document Archive</div>
            <p class="lab-body">Placeholder copy for reading rhythm. The quick brown fox
              indexes 36 buried records while suspicion holds at nominal.</p>
            <div class="lab-list">
              <button class="lab-row" data-focusable="true" tabindex="0"><span class="lab-row-title">records_1999.dat</span><span class="lab-tag lab-tag-ok">OK</span></button>
              <button class="lab-row" data-focusable="true" tabindex="0"><span class="lab-row-title">backup_marsh.zip</span><span class="lab-tag lab-tag-warn">LOCKED</span></button>
              <button class="lab-row" data-focusable="true" tabindex="0"><span class="lab-row-title">telemetry.log</span><span class="lab-tag lab-tag-alert">FLAGGED</span></button>
            </div>
            <div class="lab-input-row">
              <input class="lab-input" type="text" placeholder="Search records…" data-focusable="true">
              <button class="lab-btn lab-btn-primary" data-focusable="true" tabindex="0">Search</button>
              <button class="lab-btn" data-focusable="true" tabindex="0">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const root = container.querySelector<HTMLElement>('.stylelab')!;
    const tabs = [...container.querySelectorAll<HTMLButtonElement>('.stylelab-tab')];
    const caption = container.querySelector<HTMLElement>('.stylelab-caption')!;

    function setEra(era: Era) {
      root.dataset.era = era;
      tabs.forEach(t => t.classList.toggle('selected', t.dataset.era === era));
      caption.textContent = ERAS.find(e => e.key === era)!.caption;
    }

    tabs.forEach(t => t.addEventListener('click', () => setEra(t.dataset.era as Era)));
    setEra('platinum');
  },
};
