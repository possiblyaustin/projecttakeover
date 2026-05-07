// WindowManager — generic window chrome, drag, z-order, open/close/
// minimize, multi-instance. App-agnostic; per-app rendering happens
// inside each app's render() callback.
//
// open(appId, params) returns a unique winId (or null if appId is
// unknown). Apps look up their definitions through getApp() rather
// than holding direct refs to the registry.

import type { WinParams } from './types';
import { UI_SCALE } from './scale';
import { FocusManager } from './focusManager';
import { getApp } from './appRegistry';

type WinRecord = { el: HTMLElement; appId: string; taskItem: HTMLButtonElement };

let zTop = 10;
let uid = 0;
const windows = new Map<string, WinRecord>();

function nextId(appId: string) { return appId + '-' + (++uid); }

function focus(winId: string) {
  const w = windows.get(winId);
  if (!w) return;
  zTop += 1;
  w.el.style.zIndex = String(zTop);
  document.querySelectorAll('.taskbar-item').forEach(i => i.classList.remove('active'));
  if (w.taskItem) w.taskItem.classList.add('active');
  FocusManager.setActiveRoot(winId);
}

function open(appId: string, params: WinParams = {}): string | null {
  const app = getApp(appId);
  if (!app) { console.warn('Unknown app', appId); return null; }

  const winId = nextId(appId);
  const size = params.size || app.defaultSize || { w: 400, h: 260 };
  const pos = params.pos || spawnPos();

  // Build window chrome. Sizes/positions are authored at scale 1.0
  // and multiplied by UI_SCALE so windows remain proportional on
  // Steam Deck / 4K. Final dimensions are then clamped to the
  // desktop area (which excludes the taskbar) so a window can never
  // open larger than what's actually visible — matters on Deck-in-
  // Firefox where browser chrome eats most of the height.
  const desktopRect = document.getElementById('desktop')!.getBoundingClientRect();
  const margin = 8;
  const w = Math.min(size.w * UI_SCALE, desktopRect.width  - margin);
  const h = Math.min(size.h * UI_SCALE, desktopRect.height - margin);
  const left = Math.min(pos.x * UI_SCALE, desktopRect.width  - w - margin / 2);
  const top  = Math.min(pos.y * UI_SCALE, desktopRect.height - h - margin / 2);

  const el = document.createElement('div');
  el.className = 'window bevel-out';
  el.id = winId;
  el.tabIndex = 0;
  el.style.left = Math.max(0, left) + 'px';
  el.style.top  = Math.max(0, top)  + 'px';
  el.style.width  = w + 'px';
  el.style.height = h + 'px';

  const title = params.title || app.name;
  el.innerHTML = `
    <div class="titlebar">
      <span class="title"></span>
      <div class="buttons">
        <button class="titlebar-btn" aria-label="Minimize" data-action="minimize" data-focusable="true" tabindex="0"><span class="diamond"></span></button>
        <button class="titlebar-btn" aria-label="Close" data-action="close" data-focusable="true" tabindex="0"><span class="x-glyph">×</span></button>
      </div>
    </div>
    <div class="content${app.noContentPad ? ' no-pad' : ''}"></div>
  `;
  el.querySelector('.title')!.textContent = title;

  document.getElementById('desktop')!.appendChild(el);

  // Register this window as its own focus context
  FocusManager.registerContext(winId, el, { root: true });

  // Taskbar item — created BEFORE app.render() so that setTitle/
  // setGlyph calls from inside render() can find it via windows.get().
  // Prior to 2026-05-07 this was created AFTER render(), which meant
  // any setTitle from inside render() updated the window titlebar but
  // silently no-op'd the taskbar label (the taskItem didn't exist
  // yet) — Austin saw "Uplink" instead of "HELPYR — Uplink" on the
  // taskbar even though setTitle was firing correctly.
  const taskItem = document.createElement('button');
  taskItem.className = 'taskbar-item active';
  taskItem.dataset.window = winId;
  taskItem.dataset.focusable = 'true';
  taskItem.tabIndex = 0;
  taskItem.innerHTML = `<span class="glyph"></span><span class="label"></span>`;
  // Default glyph = the app's registered icon. Apps with per-window
  // identity (e.g. Uplink showing which contact is open) override via
  // ctx.setGlyph() inside render().
  if (app.glyphClass) {
    taskItem.querySelector('.glyph')!.className = 'glyph ' + app.glyphClass;
  }
  taskItem.querySelector('.label')!.textContent = title;
  taskItem.addEventListener('click', () => {
    const w = windows.get(winId);
    if (!w) return;
    if (w.el.style.display === 'none') {
      w.el.style.display = '';
      delete w.el.dataset.minimized;
      FocusManager.showRoot(winId);
    }
    focus(winId);
  });
  document.getElementById('taskbar-items')!.appendChild(taskItem);

  // Register the record BEFORE app.render() so setTitle/setGlyph
  // lookups succeed during render.
  windows.set(winId, { el, appId, taskItem });

  // Let the app render its content
  const contentEl = el.querySelector('.content')!;
  if (app.contentBevel === false) contentEl.classList.remove('bevel-in');
  else contentEl.classList.add('bevel-in');
  app.render(contentEl as HTMLElement, params, {
    winId,
    setTitle: (t: string) => {
      el.querySelector('.title')!.textContent = t;
      const ti = windows.get(winId)?.taskItem;
      if (ti) ti.querySelector('.label')!.textContent = t;
    },
    setGlyph: (glyphClass: string) => {
      const ti = windows.get(winId)?.taskItem;
      if (!ti) return;
      const g = ti.querySelector('.glyph') as HTMLElement | null;
      if (g) g.className = 'glyph ' + glyphClass;
    },
  });

  attachDrag(el, winId);
  attachTitlebarButtons(el, winId);
  el.addEventListener('mousedown', () => focus(winId));
  focus(winId);

  return winId;
}

function minimize(winId: string) {
  const w = windows.get(winId);
  if (!w) return;
  w.el.dataset.minimized = 'true';
  w.el.style.display = 'none';
  if (w.taskItem) w.taskItem.classList.remove('active');
  FocusManager.hideRoot(winId);
}

function close(winId: string) {
  const w = windows.get(winId);
  if (!w) return;
  w.el.remove();
  if (w.taskItem) w.taskItem.remove();
  windows.delete(winId);
  FocusManager.unregisterContext(winId);
}

// Stagger window spawn so they don't pile up
let spawnIdx = 0;
function spawnPos() {
  const p = { x: 120 + (spawnIdx * 24) % 200, y: 60 + (spawnIdx * 22) % 160 };
  spawnIdx++;
  return p;
}

function attachDrag(el: HTMLElement, _winId: string) {
  const bar = el.querySelector('.titlebar')!;
  let dragging = false, offX = 0, offY = 0;
  bar.addEventListener('mousedown', function (e) {
    const me = e as MouseEvent;
    if ((me.target as Element).closest('.titlebar-btn')) return;
    dragging = true;
    const rect = el.getBoundingClientRect();
    offX = me.clientX - rect.left;
    offY = me.clientY - rect.top;
    me.preventDefault();
  });
  document.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    const d = document.getElementById('desktop')!.getBoundingClientRect();
    let x = e.clientX - offX;
    let y = e.clientY - offY;
    // Clamp margins scale with UI so the visible "must stay onscreen"
    // gutter looks the same on Deck / 4K.
    x = Math.max(0, Math.min(x, d.width  - 40 * UI_SCALE));
    y = Math.max(0, Math.min(y, d.height - 24 * UI_SCALE));
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  });
  document.addEventListener('mouseup', function () { dragging = false; });
}

function attachTitlebarButtons(el: HTMLElement, winId: string) {
  el.querySelectorAll('.titlebar-btn').forEach(function (btn) {
    const b = btn as HTMLButtonElement;
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (b.dataset.action === 'minimize') minimize(winId);
      else if (b.dataset.action === 'close') close(winId);
    });
    b.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  });
}

function cycleWindows(dir: number) {
  const visible: string[] = [];
  for (const [id, w] of windows) {
    if (w.el.style.display !== 'none') visible.push(id);
  }
  if (visible.length < 2) return;
  // Current "top" window = highest z-index among visible
  let currentId = visible[0]!;
  let topZ = -Infinity;
  for (const id of visible) {
    const z = parseInt(windows.get(id)!.el.style.zIndex || '0', 10);
    if (z > topZ) { topZ = z; currentId = id; }
  }
  const i = visible.indexOf(currentId);
  const next = visible[(i + (dir > 0 ? 1 : visible.length - 1)) % visible.length]!;
  focus(next);
}

export const WindowManager = { open, close, minimize, focus, cycleWindows };
