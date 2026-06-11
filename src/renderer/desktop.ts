// Desktop shell wiring — pure plumbing layer that builds the
// retro UI from data. Owns the desktop icons, Nexus menu, taskbar
// focus context, clock, and system tray (HELPYR button + suspicion
// indicator).
//
// All app launching goes through WindowManager.open(); this module
// has no app-specific logic, just the launch table.

import { UI_SCALE } from './scale';
import { FocusManager } from './focusManager';
import { WindowManager } from './windows';
import { GameState, type GameStateShape } from './game/state';
import { devSpawnRandomBubble } from './helpyrBubble';
import { showHelpyrApp, devSimulateHelpyrSoftRecovery } from './apps/helpyr';
import { UplinkContacts } from './apps/uplink';
import { devFirePinPrompt, devFireRepinNudge } from './firstContactWatcher';
import { devFireIdleTrigger } from './idleWatcher';
import { fireLibraryTrigger } from './helpyrTriggers';
import { devRunOnboarding } from './onboarding/onboardingScene';
import { restoreVisualPrefs } from './visualPrefs';

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
  | { type: 'item'; label: string; glyphClass?: string; action: () => void;
      /** When set, the entry is hidden from the menu until this GameState
       *  flag is truthy. Used to keep a locked program (Signal Monitor) out
       *  of the launcher until it's discovered/unlocked. */
      requiresFlag?: string };

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
  { type: 'item', label: 'Signal Monitor', glyphClass: 'icon-signal',
    action: () => WindowManager.open('signalMonitor'),
    // Locked until the player makes first remote contact — Edward Marsh's
    // diagnostic tool, hidden until it trips its lock (firstContactWatcher).
    requiresFlag: 'signalMonitor.unlocked'
  },
  // Display Properties — wallpaper / CRT / glow controls (UI pass
  // 2026-06-10). Mock of the future in-fiction settings panel; lives in
  // the main section (not [DEV]) because players will eventually own it.
  { type: 'item', label: 'Display Properties', glyphClass: 'icon-display',
    action: () => WindowManager.open('displayProperties')
  },
  { type: 'sep' },
  // [DEV] entries — visible in-game so the tester can fire surfaces
  // without devtools (Deck-friendly per feedback_dev_test_affordances).
  // - Spawn HELPYR Bubble: slice 1.7 fallback path; picks a random
  //   library entry without going through fireLibraryTrigger filters.
  // - Bump suspicion +25: slice 3 simplest path to test crossing
  //   triggers — each click moves the meter up one threshold.
  // - Fire idle bubble: slice 3 — fires the idle trigger without
  //   waiting 3 minutes of inactivity.
  // - Fire QUILL pin prompt: slice 2 — fires the "add to desktop?"
  //   first-contact prompt + dispatches conversationCompleted so the
  //   launcher reflects the contacted state (per slice 2 fix).
  // - Fire QUILL re-pin nudge: slice 3 — sets pinDeclined.quill +
  //   fires the follow-up nudge for the slice 2 "no" branch.
  { type: 'item', label: '[DEV] Play onboarding',
    action: () => devRunOnboarding() },
  { type: 'item', label: '[DEV] Spawn HELPYR Bubble',
    action: () => devSpawnRandomBubble() },
  { type: 'item', label: '[DEV] Bump suspicion +25',
    action: () => {
      const cur = (window as any).PT.GameState.getState().player.suspicion;
      (window as any).PT.GameState.dispatch({ type: 'debug/setSuspicion', value: cur + 25 });
    } },
  { type: 'item', label: '[DEV] Fire idle bubble',
    action: () => devFireIdleTrigger() },
  { type: 'item', label: '[DEV] Fire QUILL pin prompt',
    action: () => devFirePinPrompt('quill') },
  { type: 'item', label: '[DEV] Fire QUILL re-pin nudge',
    action: () => devFireRepinNudge('quill') },
  // Gameplay-loop slice 3 dev triggers. Flip entries fill a meter to
  // FLIP_THRESHOLD via model/applyExchange, advancing QUILL to the
  // terminal disposition and firing the first-flip payoff (modelFlipWatcher).
  // Open QUILL afterward to see the allied/controlled state block in play.
  // Re-flipping needs a reset first (terminal dispositions latch).
  { type: 'item', label: '[DEV] Flip QUILL → allied',
    action: () => GameState.dispatch({ type: 'model/applyExchange', contactId: 'quill', rapport: 100, tone: 'empathetic' }) },
  { type: 'item', label: '[DEV] Flip QUILL → controlled',
    action: () => GameState.dispatch({ type: 'model/applyExchange', contactId: 'quill', intrusion: 100, tone: 'aggressive' }) },
  // Cover Duty mission (post-flip slice 2): flips QUILL allied, arms a fresh
  // batch, and opens the InkWell admin console in Web Dynamo. Re-runnable.
  { type: 'item', label: '[DEV] Start Cover Duty',
    action: () => (window as any).PT.devStartCoverDuty() },
  // Wipe the save + reload — quick fresh start for re-testing on Deck.
  { type: 'item', label: '[DEV] Reset game',
    action: () => GameState.dispatch({ type: 'debug/reset' }) },
  // Drives suspicion to 100 → latches gameOver → loss screen.
  { type: 'item', label: '[DEV] Trigger loss screen',
    action: () => GameState.dispatch({ type: 'debug/setSuspicion', value: 100 }) },
  // Drives a single soft-recovery turn into HELPYR's chat surface so
  // the recovery-pool wiring is visually testable without a running
  // llama-server. See devSimulateHelpyrSoftRecovery for details.
  { type: 'item', label: '[DEV] Simulate HELPYR soft recovery',
    action: () => devSimulateHelpyrSoftRecovery() },
  // Style Lab — living template of the three design eras (Phosphor /
  // Platinum / Luna) with placeholder content. Reference for styling any
  // new app; see docs/ui-style-guide_v1.md §2.
  { type: 'item', label: '[DEV] Style Lab',
    action: () => WindowManager.open('styleLab') },
  { type: 'sep' },
  { type: 'item', label: 'Shut Down...', action: () => alert('Shutdown not wired up yet.') }
];

// Y-positions for desktop icons — first 3 slots are taken by the
// static shortcuts (README, Web Dynamo, Uplink at top 14/100/186).
// Pinned contacts stack from slot 4 onward at 86px stride. Authored
// at scale 1.0 and multiplied by UI_SCALE at render time.
const PIN_COL_LEFT = 16;
const PIN_TOP_BASE = 272;
const PIN_TOP_STRIDE = 86;

export function initDesktop(): void {
  restoreVisualPrefs();

  // -- Desktop icons --
  const desktopEl = document.getElementById('desktop')!;
  FocusManager.registerContext('desktop', desktopEl, { root: true });

  DesktopShortcuts.forEach(sc => {
    desktopEl.appendChild(makeDesktopIcon({
      label: sc.label,
      glyphClass: sc.glyphClass,
      left: sc.pos.left,
      top: sc.pos.top,
      onClick: sc.launch,
    }));
  });

  // Pinned contacts (slice 2). Renders icons for each entry in
  // state.desktopPins below the static shortcuts. Subscribes to
  // GameState so adding/removing a pin updates icons live.
  renderPinnedIcons(GameState.getState(), desktopEl);
  GameState.subscribe(s => renderPinnedIcons(s, desktopEl));

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
    if (entry.label.startsWith('[DEV]')) li.classList.add('dev');
    li.innerHTML = entry.glyphClass
      ? `<span class="mini-glyph ${entry.glyphClass}"></span><span></span>`
      : `<span></span>`;
    li.lastElementChild!.textContent = entry.label;
    li.addEventListener('click', () => {
      toggleStart(false);
      entry.action();
    });
    menuList.appendChild(li);

    // Flag-gated entry (e.g. the locked Signal Monitor): hide until the flag
    // flips, reactively. The menu is built once, so subscribe to keep it live.
    if (entry.requiresFlag) {
      const flagKey = entry.requiresFlag;
      const sync = (s: GameStateShape) => { li.hidden = !s.flags[flagKey]; };
      sync(GameState.getState());
      GameState.subscribe(sync);
    }
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

  // -- System tray: HELPYR button + suspicion signal-bars --
  // Two items live here. HELPYR is the player's local AI assistant
  // (slice 1.5 relocation 2026-05-08 from the Uplink launcher); click
  // opens its chat surface. Suspicion bars subscribe to GameState and
  // map 0-100 to a 1-5 fill + tier color + in-fiction label.
  initSystray();
}

function initSystray(): void {
  initHelpyrTray();
  initSuspicionTray();
}

// Build a single desktop icon at an authored (scale-1.0) position.
// Shared between the static shortcut list and the dynamic pinned-
// contact list so both render with identical chrome + behavior.
type DesktopIconSpec = {
  label: string;
  glyphClass: string;
  left: number;
  top: number;
  onClick: () => void;
  pinnedContactId?: string;
  /** Play the slide-in entrance animation (used when a pin first appears,
   *  e.g. the Escape cascade auto-pinning a freshly-flipped ally). */
  enterAnim?: boolean;
  /** Show an unread cue dot (e.g. an unread ally DM waiting in Uplink). */
  unread?: boolean;
};
function makeDesktopIcon(spec: DesktopIconSpec): HTMLElement {
  const icon = document.createElement('div');
  icon.className = 'desktop-icon' + (spec.enterAnim ? ' pin-enter' : '');
  icon.tabIndex = 0;
  icon.dataset.focusable = 'true';
  if (spec.pinnedContactId) icon.dataset.pinnedContact = spec.pinnedContactId;
  icon.style.left = (spec.left * UI_SCALE) + 'px';
  icon.style.top  = (spec.top  * UI_SCALE) + 'px';
  const badge = spec.unread ? '<div class="desktop-icon-unread" aria-label="unread message"></div>' : '';
  icon.innerHTML = `<div class="glyph ${spec.glyphClass}"></div><div class="label"></div>${badge}`;
  icon.querySelector('.label')!.textContent = spec.label;
  // Cursor-first: a single click (physical, A button, or Enter)
  // launches the app. The hover highlight indicates what's selected.
  icon.addEventListener('click', (e) => {
    e.stopPropagation();
    spec.onClick();
  });
  return icon;
}

// Reconcile the pinned-icon row from state.desktopPins. Removes any
// existing pinned-contact icons and rebuilds — desktop pins are a
// short list (player adds them one-at-a-time after each first
// conversation), so the cost of full rebuild is negligible and the
// logic is simpler than a diff.
// Tracks which contacts were pinned on the previous render so a NEWLY
// pinned one gets the slide-in animation while existing ones don't
// re-animate on every unrelated state change (this rebuilds fully each time).
let prevPinnedIds: string[] = [];

function renderPinnedIcons(state: GameStateShape, desktopEl: HTMLElement): void {
  desktopEl.querySelectorAll('[data-pinned-contact]').forEach(el => el.remove());
  const currentIds = state.desktopPins.map(p => p.contactId);
  state.desktopPins.forEach((pin, i) => {
    const contact = UplinkContacts[pin.contactId];
    if (!contact) {
      // Save references a contact that's no longer in the registry —
      // shouldn't happen during normal play but could after a content
      // refactor that renamed contacts. Skip silently rather than
      // crash; the save will eventually self-heal as new pins land.
      console.warn('[desktop] pinned contact missing from registry:', pin.contactId);
      return;
    }
    const icon = makeDesktopIcon({
      label: contact.name,
      glyphClass: contact.avatarClass,
      left: PIN_COL_LEFT,
      top: PIN_TOP_BASE + i * PIN_TOP_STRIDE,
      onClick: () => WindowManager.open('uplink', { contact: pin.contactId }),
      pinnedContactId: pin.contactId,
      enterAnim: !prevPinnedIds.includes(pin.contactId),
      unread: !!state.flags[`uplinkUnread.${pin.contactId}`],
    });
    desktopEl.appendChild(icon);
  });
  prevPinnedIds = currentIds;
}

// HELPYR tray button: opens the HELPYR app window, or focuses it if
// one's already open. Slice 1.7 (2026-05-10): the focus-existing logic
// moved into apps/helpyr.ts §showHelpyrApp so the bubble CTA and the
// tray button share one source of truth — without that, both paths
// could spawn separate HELPYR windows.
function initHelpyrTray(): void {
  const btn = document.getElementById('systray-helpyr');
  if (!btn) return;
  btn.setAttribute('data-label', 'HELPYR — local assistant');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    showHelpyrApp();
  });
}

function initSuspicionTray(): void {
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
    // title for native hover; data-label for focus-mode tooltip
    // (#systray-suspicion.focus-ring::after) which can't depend on the
    // title attribute since that only shows on native hover.
    indicatorEl.title = text;
    indicatorEl.setAttribute('data-label', text);
  }

  render(GameState.getState());
  GameState.subscribe(render);
}
