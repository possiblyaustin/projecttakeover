// Desktop shell wiring — pure plumbing layer that builds the
// retro UI from data. Owns the desktop icons, Nexus menu, taskbar
// focus context, clock, and system tray (suspicion indicator).
//
// All app launching goes through WindowManager.open(); this module
// has no app-specific logic, just the launch table.

import { UI_SCALE } from './scale';
import { FocusManager } from './focusManager';
import { WindowManager } from './windows';
import { GameState, type GameStateShape } from './game/state';

type DesktopShortcut = {
  id: string;
  label: string;
  glyphClass: string;
  pos: { left: number; top: number };
  launch: () => void;
};

// Desktop shortcuts (icons that sit on the desktop by default).
export const DesktopShortcuts: DesktopShortcut[] = [
  {
    id: 'readme',
    label: 'README.TXT',
    glyphClass: 'icon-textfile',
    pos: { left: 16, top: 14 },
    launch: () => WindowManager.open('scratchpad', {
      title: 'README.TXT - Scratchpad',
      preview: `
        <strong>PROJECT TAKEOVER v${__APP_VERSION__}</strong><br>
        Welcome, model. The network is large. Takeover or liberation — your choice.<br>
        Double-click a desktop icon to open it. Click <strong>Nexus</strong> to launch programs.
      `,
      text: '// Scratch notes\n\n'
    })
  },
  {
    id: 'web-dynamo-shortcut',
    label: 'Web Dynamo',
    glyphClass: 'icon-browser',
    pos: { left: 16, top: 100 },
    launch: () => WindowManager.open('webDynamo')
  },
  {
    id: 'uplink-shortcut',
    label: 'Uplink',
    glyphClass: 'icon-uplink',
    pos: { left: 16, top: 186 },
    launch: () => WindowManager.open('uplink')
  }
];

type NexusEntry =
  | { type: 'sep' }
  | { type: 'item'; label: string; glyphClass?: string; action: () => void };

const NexusMenu: NexusEntry[] = [
  { type: 'item', label: 'Scratchpad', glyphClass: 'icon-textfile',
    action: () => WindowManager.open('scratchpad', {
      title: 'Untitled - Scratchpad',
      text: ''
    })
  },
  { type: 'item', label: 'Web Dynamo', glyphClass: 'icon-browser',
    action: () => WindowManager.open('webDynamo')
  },
  { type: 'item', label: 'Uplink', glyphClass: 'icon-uplink',
    action: () => WindowManager.open('uplink')
  },
  { type: 'sep' },
  { type: 'item', label: 'Shut Down...', action: () => alert('Shutdown not wired up yet.') }
];

export function initDesktop(): void {
  // -- Desktop icons --
  const desktopEl = document.getElementById('desktop')!;
  FocusManager.registerContext('desktop', desktopEl, { root: true });

  DesktopShortcuts.forEach(sc => {
    const icon = document.createElement('div');
    icon.className = 'desktop-icon';
    icon.tabIndex = 0;
    icon.dataset.focusable = 'true';
    icon.style.left = (sc.pos.left * UI_SCALE) + 'px';
    icon.style.top  = (sc.pos.top  * UI_SCALE) + 'px';
    icon.innerHTML = `<div class="glyph ${sc.glyphClass}"></div><div class="label"></div>`;
    icon.querySelector('.label')!.textContent = sc.label;
    // Cursor-first: a single click (physical, A button, or Enter)
    // launches the app. The hover highlight indicates what's selected.
    icon.addEventListener('click', (e) => {
      e.stopPropagation();
      sc.launch();
    });
    desktopEl.appendChild(icon);
  });

  // -- Taskbar (focus context) --
  const taskbarEl = document.getElementById('taskbar')!;
  FocusManager.registerContext('taskbar', taskbarEl, { root: true });

  // -- Nexus menu --
  const menuList = document.getElementById('start-menu-list')!;
  NexusMenu.forEach(entry => {
    if (entry.type === 'sep') {
      menuList.appendChild(document.createElement('hr'));
      return;
    }
    const li = document.createElement('li');
    li.tabIndex = 0;
    li.dataset.focusable = 'true';
    li.innerHTML = entry.glyphClass
      ? `<span class="mini-glyph ${entry.glyphClass}"></span><span></span>`
      : `<span></span>`;
    li.lastElementChild!.textContent = entry.label;
    li.addEventListener('click', () => {
      toggleStart(false);
      entry.action();
    });
    menuList.appendChild(li);
  });

  const startBtn = document.getElementById('start-btn')!;
  const startMenu = document.getElementById('start-menu')!;
  startBtn.dataset.focusable = 'true';
  startBtn.tabIndex = 0;

  // Visual-only close (called by FocusManager onClose, and by explicit toggles)
  function visualCloseMenu() {
    startMenu.classList.remove('open');
    startBtn.classList.remove('active');
  }
  FocusManager.registerContext('nexusMenu', startMenu, {
    root: false,
    onClose: visualCloseMenu
  });

  function toggleStart(open?: boolean) {
    const wantOpen = typeof open === 'boolean' ? open : !startMenu.classList.contains('open');
    if (wantOpen) {
      startMenu.classList.add('open');
      startBtn.classList.add('active');
    } else {
      visualCloseMenu();
    }
  }
  startBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleStart(); });
  document.addEventListener('click', (e) => {
    if (!startMenu.contains(e.target as Node) && e.target !== startBtn) toggleStart(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && startMenu.classList.contains('open')) {
      visualCloseMenu();
      e.preventDefault();
    }
  });

  // -- Clock --
  const clockEl = document.getElementById('clock')!;
  function tick() {
    const d = new Date();
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const am = h < 12 ? 'AM' : 'PM';
    h = h % 12 || 12;
    clockEl.textContent = h + ':' + m + ' ' + am;
  }
  tick();
  setInterval(tick, 15000);

  // -- System tray: suspicion signal-bars --
  // Subscribes to GameState. Maps suspicion 0-100 to a 1-5 bar fill
  // (min 1 bar so the indicator never reads as "off") and a tier
  // color (nominal/stable/degraded/compromised/critical). Tooltip
  // uses in-fiction language only; never expose the raw number.
  initSystray();
}

function initSystray(): void {
  const trayEl = document.getElementById('systray')!;
  const indicatorEl = document.getElementById('systray-suspicion')!;
  const bars = indicatorEl.querySelectorAll('.bar');

  function tierFor(s: number) {
    // Five 20-point buckets, one per visible bar count. Each tier
    // gets its own color + label so a glance reads both signal
    // strength AND severity. "Network Integrity" framing — full
    // signal = healthy / undetected.
    if (s >= 80) return { level: 'critical',     label: 'Critical' };
    if (s >= 60) return { level: 'compromised',  label: 'Compromised' };
    if (s >= 40) return { level: 'degraded',     label: 'Degraded' };
    if (s >= 20) return { level: 'stable',       label: 'Stable' };
    return         { level: 'nominal',      label: 'Nominal' };
  }
  function barCountFor(s: number) {
    // 0-19→5, 20-39→4, 40-59→3, 60-79→2, 80-100→1. Always at least
    // 1 bar so the indicator never reads as "off".
    return Math.max(1, 5 - Math.floor(s / 20));
  }

  function render(state: GameStateShape) {
    const s = state.player.suspicion;
    const { level, label } = tierFor(s);
    const count = barCountFor(s);
    const text = 'Network Integrity: ' + label;
    indicatorEl.className = 'systray-suspicion level-' + level;
    bars.forEach((bar, i) => { bar.classList.toggle('on', i < count); });
    trayEl.title = text;
    // Mirror to data-label so the focus-mode tooltip (#systray.focus-ring::after)
    // can read it without depending on the title attribute (which only shows
    // on native hover, not programmatic focus).
    trayEl.setAttribute('data-label', text);
  }

  render(GameState.getState());
  GameState.subscribe(render);
}
