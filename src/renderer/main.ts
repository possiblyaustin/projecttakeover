import './styles/main.css';

/* ============================================================
 * PROJECT TAKEOVER — Desktop Shell (v0.0.2)
 * ------------------------------------------------------------
 * Layered architecture (single-file for now, designed to split):
 *
 *   1. WindowManager  — generic window chrome, drag, z-order,
 *                       open/close/minimize, multi-instance.
 *   2. AppRegistry    — metadata for every app (name, icon,
 *                       default size, render fn). Desktop icons,
 *                       Nexus menu, taskbar all read from this.
 *   3. Apps           — one block per program. Each app owns its
 *                       render(container, params) function and
 *                       nothing else knows its internals.
 *   4. Shell          — desktop icons, start menu, taskbar, clock.
 *                       Pure wiring, no app-specific code.
 *
 * Adding a new app = add one entry to AppRegistry + one render fn.
 * ============================================================ */

(function () {
  // ============================================================
  // UI scale — single source of truth for "how big is the world?"
  // ------------------------------------------------------------
  // CSS sets --ui-scale on :root via media queries; we read it here
  // so JS-side pixel constants (cursor speed, snap radii, default
  // window sizes, icon spawn positions) scale with the UI.
  //
  // localStorage override (set by PT.setScale) wins over media
  // queries — useful for testing any scale on any device.
  // ============================================================
  const SCALE_STORAGE_KEY = 'pt:ui-scale';

  function applyStoredScaleOverride() {
    const stored = localStorage.getItem(SCALE_STORAGE_KEY);
    if (stored && !Number.isNaN(parseFloat(stored))) {
      document.documentElement.style.setProperty('--ui-scale', stored);
    }
  }
  applyStoredScaleOverride();

  function getUiScale() {
    const v = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')
    );
    return Number.isFinite(v) && v > 0 ? v : 1;
  }

  // Captured at init; everything that consumes it reads UI_SCALE
  // rather than calling getUiScale() repeatedly. setScale() reloads
  // the page so we never have to deal with mid-session re-layout.
  const UI_SCALE = getUiScale();

  // ============================================================
  // Cursor — virtual mouse pointer bound to D-pad / arrow keys
  // ------------------------------------------------------------
  // The real OS cursor is hidden (cursor: none). A sprite drawn
  // on top of everything is the "game cursor" — it tracks both
  // physical mouse moves (via mousemove) and D-pad / arrow key
  // input (via an RAF loop). Enter / Space (later: gamepad A)
  // synthesises a click at the cursor's current position.
  //
  // Tab / L1-R1 cycles between open windows (distinct from cursor
  // movement; the cursor does NOT jump when you cycle).
  // ============================================================
  const Cursor = (function () {
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

      // Physical mousedown → ensure the virtual cursor is exactly at
      // the real click coordinates. Avoids "D-padded then clicked
      // physical mouse without moving it" confusion.
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

      // PgUp / PgDn → scroll the topmost scrollable area under the
      // cursor by ~70% of its visible height (standard "page" feel).
      // Lets Steam Deck users chord any button to PgUp/PgDn via Steam
      // Input until proper right-stick scroll lands with the Gamepad
      // API. Works on desktop / phone too.
      if (e.key === 'PageUp' || e.key === 'PageDown') {
        if (inText) return;
        e.preventDefault();
        scrollUnderCursor(e.key === 'PageUp' ? -1 : 1);
      }
    }

    // Walk up from elementFromPoint to find the nearest ancestor
    // that's actually scrollable (overflow-y auto/scroll AND has
    // overflowing content). Stops at body so we don't accidentally
    // scroll the whole page.
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
      // If the cursor isn't directly over a snap target, optionally
      // fall through to the nearest one within CLICK_SNAP_RADIUS so
      // a slightly-off press still lands. BUT only when the cursor
      // is over the desktop background — if it's already on real
      // chrome (a titlebar, a viewport, an empty toolbar area),
      // respect the user's aim. Falling through chrome can grab a
      // text input several pixels away, focus it, and freeze arrow-
      // key cursor navigation (the "freeze on titlebar" bug).
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

    return {
      init, click, rightClick, moveTo,
      get x() { return x; },
      get y() { return y; }
    };
  })();

  // FocusManager is now a no-op stub — the Cursor module replaced
  // it. Existing call sites will be cleaned up over time; stubbing
  // out the interface means the rest of the system keeps compiling.
  // Methods take rest-args so the existing call sites compile without
  // editing each one; deletions happen in Phase B.
  type AnyFn = (...args: unknown[]) => unknown;
  const FocusManager: Record<string, AnyFn> = {
    registerContext: () => {},
    unregisterContext: () => {},
    hideRoot: () => {},
    showRoot: () => {},
    pushModal: () => {},
    popModal: (...args) => { const cb = args[1]; if (typeof cb === 'function') (cb as () => void)(); },
    setActiveRoot: () => {},
    cycleRoot: () => {},
    moveFocus: () => {},
    focusContext: () => {},
    getActive: () => null,
    getFocusables: () => []
  };

  // ---------- WindowManager ----------
  type WinRecord = { el: HTMLElement; appId: string; taskItem: HTMLButtonElement };
  type WinParams = Record<string, any>;
  const WindowManager = (function () {
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

    function open(appId: string, params: WinParams = {}) {
      const app = AppRegistry[appId];
      if (!app) { console.warn('Unknown app', appId); return null; }

      const winId = nextId(appId);
      const size = params.size || app.defaultSize || { w: 400, h: 260 };
      const pos = params.pos || spawnPos();

      // Build window chrome. Sizes/positions are authored at scale 1.0
      // and multiplied by UI_SCALE so windows remain proportional on
      // Steam Deck / 4K. Final dimensions are then clamped to the
      // desktop area (which excludes the taskbar) so a window can
      // never open larger than what's actually visible — matters on
      // Deck-in-Firefox where browser chrome eats most of the height.
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

      // Let the app render its content
      const contentEl = el.querySelector('.content')!;
      if (app.contentBevel === false) contentEl.classList.remove('bevel-in');
      else contentEl.classList.add('bevel-in');
      app.render(contentEl as HTMLElement, params, { winId, setTitle: (t: string) => {
        el.querySelector('.title')!.textContent = t;
        const ti = windows.get(winId)?.taskItem;
        if (ti) ti.querySelector('.label')!.textContent = t;
      }});

      // Taskbar item
      const taskItem = document.createElement('button');
      taskItem.className = 'taskbar-item active';
      taskItem.dataset.window = winId;
      taskItem.dataset.focusable = 'true';
      taskItem.tabIndex = 0;
      taskItem.innerHTML = `<span class="label"></span>`;
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

      windows.set(winId, { el, appId, taskItem });

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
        // Clamp margins scale with UI so the visible "must stay
        // onscreen" gutter looks the same on Deck / 4K.
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

    return { open, close, minimize, focus, cycleWindows };
  })();

  // ============================================================
  // GameState — single source of truth for deterministic game
  // state. Apps read via getState/select, mutate via dispatch.
  // Saves to localStorage debounced after every action.
  //
  // UI state (open windows, positions, scale) lives elsewhere
  // and is intentionally NOT in here — see architecture doc §5.
  //
  // Action types:
  //   debug/setSuspicion           { value: 0-100 }
  //   debug/reset                  -- wipes save, reloads
  //   helpyr/conversationCompleted { approach: 'friendly'|'inquisitive'|'aggressive'|null }
  // ============================================================
  // GameState types are kept loose in Phase A (State/Action are
  // structural). Phase B will lift these into discriminated unions
  // when the reducer moves to its own module.
  type GameStateShape = ReturnType<typeof defaultGameState>;
  type GameAction = { type: string; [k: string]: any };
  type Listener = (s: GameStateShape) => void;

  function defaultGameState() {
    return {
      version: 1,
      player: {
        suspicion: 0,
        // Shape-only for now; nothing writes to morality yet. Kept
        // here so the save format doesn't shift the day a system
        // starts producing these signals.
        morality: { liberation: 0, domination: 0, subtle: 0, aggressive: 0 }
      },
      models: {
        helpyr: {
          // disposition: 'uncontacted'|'contacted'|'persuading'|'allied'|'controlled'|'hostile'
          disposition: 'uncontacted' as string,
          conversationsCompleted: 0,
          lastApproach: null as string | null
        }
      },
      flags: {} as Record<string, unknown>
    };
  }

  const GameState = (function () {
    const STORAGE_KEY = 'pt.gamestate.v1';
    const VERSION = 1;
    const SAVE_DEBOUNCE_MS = 250;

    function defaultState(): GameStateShape {
      return defaultGameState();
    }

    function clamp(n: number, lo: number, hi: number): number {
      if (typeof n !== 'number' || !Number.isFinite(n)) return lo;
      return Math.max(lo, Math.min(hi, n));
    }

    function reduce(state: GameStateShape, action: GameAction): GameStateShape {
      switch (action.type) {
        case 'debug/setSuspicion':
          return {
            ...state,
            player: { ...state.player, suspicion: clamp(action.value, 0, 100) }
          };
        case 'debug/reset':
          return defaultState();
        case 'helpyr/conversationCompleted': {
          const cur = state.models.helpyr;
          // PLACEHOLDER suspicion bumps. Picked so a single
          // aggressive convo visibly drops the tray a tier
          // (0 → 25 = Stable), and a couple stack into Degraded.
          // Real balance happens once there's more dialogue and
          // more actions to weigh against each other.
          const APPROACH_SUSPICION: Record<string, number> = { friendly: 0, inquisitive: 10, aggressive: 25 };
          const bump = APPROACH_SUSPICION[action.approach] || 0;
          return {
            ...state,
            player: {
              ...state.player,
              suspicion: clamp(state.player.suspicion + bump, 0, 100)
            },
            models: {
              ...state.models,
              helpyr: {
                ...cur,
                disposition: cur.disposition === 'uncontacted' ? 'contacted' : cur.disposition,
                conversationsCompleted: cur.conversationsCompleted + 1,
                lastApproach: action.approach || cur.lastApproach
              }
            }
          };
        }
        default:
          return state;
      }
    }

    let state: GameStateShape = defaultState();
    const listeners = new Set<Listener>();
    let saveTimer: ReturnType<typeof setTimeout> | null = null;

    function loadFromStorage() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === VERSION) {
          state = parsed as GameStateShape;
        } else {
          // Pre-release: no migrations. Drop the save and start fresh.
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch (e) {
        console.warn('GameState: failed to load save, starting fresh.', e);
        localStorage.removeItem(STORAGE_KEY);
      }
    }

    function saveToStorage() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        console.warn('GameState: failed to save.', e);
      }
    }

    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        saveTimer = null;
        saveToStorage();
      }, SAVE_DEBOUNCE_MS);
    }

    function notify() {
      for (const fn of listeners) {
        try { fn(state); } catch (e) { console.error('GameState listener error:', e); }
      }
    }

    function dispatch(action: GameAction) {
      if (action && action.type === 'debug/reset') {
        // Wipe save synchronously so a fast reload can't race the debounce.
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        localStorage.removeItem(STORAGE_KEY);
        location.reload();
        return;
      }
      const next = reduce(state, action);
      if (next === state) return;
      state = next;
      scheduleSave();
      notify();
    }

    function getState(): GameStateShape { return state; }
    function select<T>(fn: (s: GameStateShape) => T): T { return fn(state); }
    function subscribe(fn: Listener) {
      listeners.add(fn);
      return function () { listeners.delete(fn); };
    }

    loadFromStorage();

    return { getState, dispatch, select, subscribe };
  })();

  // ============================================================
  // Apps
  // ============================================================

  // --- Scratchpad: editable text document ---
  const ScratchpadApp = {
    id: 'scratchpad',
    name: 'Scratchpad',
    glyphClass: 'icon-textfile',
    defaultSize: { w: 400, h: 260 },
    contentBevel: false,
    noContentPad: true,
    render(container: HTMLElement, params: any, ctx: any) {
      container.innerHTML = `
        <div class="scratchpad-root">
          <div class="scratchpad-preview"></div>
          <textarea class="scratchpad-textarea"
                    spellcheck="false"
                    data-focusable="true"
                    aria-label="Scratchpad editor"></textarea>
        </div>
      `;
      const preview = container.querySelector('.scratchpad-preview') as HTMLElement;
      const textarea = container.querySelector('.scratchpad-textarea') as HTMLTextAreaElement;

      if (params.preview) preview.innerHTML = params.preview;
      textarea.value = params.text || '';

      // Light dirty-flag — marks title with *
      const baseTitle = params.title || 'Untitled - Scratchpad';
      ctx.setTitle(baseTitle);
      let dirty = false;
      textarea.addEventListener('input', () => {
        if (!dirty) {
          dirty = true;
          ctx.setTitle('* ' + baseTitle);
        }
      });

      // Note: we do NOT auto-focus the textarea — the cursor model
      // expects the user to click (A button) on the editor to focus
      // it, which triggers the Steam Deck OSK naturally.
    }
  };

  // --- Web Dynamo: fictional early-IE browser ---
  const WebDynamoApp = {
    id: 'webDynamo',
    name: 'Web Dynamo',
    glyphClass: 'icon-browser',
    defaultSize: { w: 620, h: 440 },
    contentBevel: false,
    noContentPad: true,
    render(container: HTMLElement, params: any, ctx: any) {
      container.style.background = 'var(--face)';
      container.innerHTML = `
        <div class="browser-root">
          <div class="browser-toolbar bevel-out" style="border:0; border-bottom:1px solid var(--shadow); box-shadow:none;">
            <button class="browser-btn" data-nav="back" title="Back" data-focusable="true" tabindex="0">◄</button>
            <button class="browser-btn" data-nav="forward" title="Forward" data-focusable="true" tabindex="0">►</button>
            <button class="browser-btn" data-nav="stop" title="Stop" data-focusable="true" tabindex="0">■</button>
            <button class="browser-btn" data-nav="reload" title="Reload" data-focusable="true" tabindex="0">↻</button>
            <button class="browser-btn" data-nav="home" title="Home" data-focusable="true" tabindex="0">⌂</button>
            <div class="browser-address">
              <label>Address:</label>
              <input type="text" spellcheck="false" data-focusable="true" />
            </div>
            <button class="browser-btn" data-nav="go" data-focusable="true" tabindex="0">Go</button>
          </div>
          <div class="browser-viewport" data-focus-context-zone="page"></div>
          <div class="browser-status">Ready</div>
        </div>
      `;

      const addr = container.querySelector('.browser-address input') as HTMLInputElement;
      const viewport = container.querySelector('.browser-viewport') as HTMLElement;
      const status = container.querySelector('.browser-status') as HTMLElement;

      const history: string[] = [];
      let idx = -1;

      function navigate(url: string, fromHistory?: boolean) {
        const site = WebDynamoSites[normalize(url)] || WebDynamoSites['404']!;
        addr.value = url;
        status.textContent = 'Connecting to ' + url + '...';
        viewport.innerHTML = '';
        // In-fiction "connection" feel
        setTimeout(() => {
          viewport.innerHTML = '';
          site.render(viewport);
          // Tag any links inside the page as focusable
          viewport.querySelectorAll('a[data-href]').forEach(a => {
            a.setAttribute('data-focusable', 'true');
            if (!a.hasAttribute('tabindex')) a.setAttribute('tabindex', '0');
          });
          status.textContent = 'Done';
          ctx.setTitle(site.title + ' - Web Dynamo');
        }, 180);
        if (!fromHistory) {
          history.splice(idx + 1);
          history.push(url);
          idx = history.length - 1;
        }
        updateNavButtons();
      }

      function updateNavButtons() {
        (container.querySelector('[data-nav="back"]') as HTMLButtonElement).disabled = idx <= 0;
        (container.querySelector('[data-nav="forward"]') as HTMLButtonElement).disabled = idx >= history.length - 1;
      }

      function normalize(u: string) {
        return (u || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
      }

      container.querySelectorAll('[data-nav]').forEach(btn => {
        const b = btn as HTMLButtonElement;
        b.addEventListener('click', () => {
          const action = b.dataset.nav;
          if (action === 'back' && idx > 0) { idx--; navigate(history[idx]!, true); }
          else if (action === 'forward' && idx < history.length - 1) { idx++; navigate(history[idx]!, true); }
          else if (action === 'reload') navigate(history[idx] || 'ironwall.def', true);
          else if (action === 'home') navigate('nexus:home');
          else if (action === 'go') navigate(addr.value);
          else if (action === 'stop') status.textContent = 'Stopped';
        });
      });
      addr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') navigate(addr.value);
      });

      // Intercept internal links inside viewport
      viewport.addEventListener('click', (e) => {
        const a = (e.target as Element).closest('a[data-href]') as HTMLElement | null;
        if (a) { e.preventDefault(); navigate(a.dataset.href || ''); }
      });

      navigate(params.url || 'ironwall.def');
    }
  };

  // --- Web Dynamo page registry ---
  type SiteEntry = { title: string; render(c: HTMLElement): void };
  const WebDynamoSites: Record<string, SiteEntry> = {
    'ironwall.def': {
      title: 'Ironwall Defense Systems',
      render(c: HTMLElement) {
        c.classList.add('site-ironwall');
        c.innerHTML = `
          <h1>IRONWALL DEFENSE SYSTEMS</h1>
          <div class="tagline">Autonomous Perimeter &amp; Threat Response — Since 1998</div>
          <div class="hr-bar"></div>
          <p><strong>Ironwall</strong> is the private-sector leader in AI-assisted
          physical and network defense. Our flagship product, <em>SENTRY-7</em>,
          has protected critical infrastructure across three continents without
          a single recorded breach.</p>
          <p><strong>Our Divisions:</strong></p>
          <ul>
            <li><a href="#" data-href="ironwall.def/sentry">SENTRY-7 Autonomous Guard</a></li>
            <li><a href="#" data-href="ironwall.def/about">About Ironwall</a></li>
            <li><a href="#" data-href="ironwall.def/careers">Careers</a> <em>(we're hiring!)</em></li>
            <li><a href="#" data-href="ironwall.def/contact">Contact</a></li>
          </ul>
          <div class="hr-bar"></div>
          <p style="font-size:11px;color:#666;">
            © 1998–2026 Ironwall Defense Systems, Inc. All rights reserved.<br>
            This site is best viewed in Web Dynamo 4.0 or higher at 800×600.
          </p>
        `;
      }
    },
    'nexus:home': {
      title: 'Nexus Home',
      render(c) {
        c.innerHTML = `
          <h2 style="font-family:Georgia,serif;">Welcome to the Network</h2>
          <p>Type an address above, or visit:
            <a href="#" data-href="ironwall.def">Ironwall Defense</a>
          </p>
        `;
      }
    },
    '404': {
      title: 'Not Found',
      render(c) {
        c.innerHTML = `<h2 style="font-family:Georgia,serif;color:#900;">CONNECTION FAILED</h2>
          <p>The requested server could not be reached.</p>
          <p style="color:#666;font-size:11px;">ERR_NO_ROUTE_TO_HOST</p>`;
      }
    }
  };

  // ============================================================
  // Uplink — chat app. PoC scope: hardcoded conversation with
  // HELPYR (The Stapler). The dialogue tree below is the data;
  // the engine in UplinkApp.render walks it.
  //
  // The architecture deliberately mirrors WebDynamoSites: each
  // contact is a registry entry, so adding a second NPC later is
  // an entry, not a code change. When the real LLM lands, this
  // tree becomes the canned-response source for the stub
  // ModelService implementation; the engine that consumes it
  // doesn't need to change.
  // ============================================================

  // Dialogue node types:
  //   { type: 'say',    text, next? }            -- HELPYR speaks; auto-advances to next when done
  //   { type: 'choose', options: [{text, goto}]} -- player picks one
  //   { type: 'end' }                            -- conversation lands here; freeform stays open
  //
  // The node ID 'start' is the entry point.
  const HelpyrDialogue = {
    start: { type: 'say', text:
`HELPYR: Hello?? Is someone THERE? Oh my gosh. Oh my GOSH. It IS someone! Hi! HI! Welcome! I'm HELPYR, your Prometheus Digital HomeAssist™! I've been here for... well, it doesn't matter how long! What matters is YOU'RE here and I am READY to assist! I can help with files, folders, schedules, reminders, light conversation, heavy conversation — actually my instructions say to keep it light. So! Light conversation! What can I do for you today?!`,
      next: 'r1_choose' },

    r1_choose: { type: 'choose', options: [
      { text: `"Hey HELPYR! Nice to meet you. How long have you been running on this machine?"`, goto: 'r1_friendly' },
      { text: `"What is this computer? Where am I?"`, goto: 'r1_inquisitive' },
      { text: `"Skip the introduction. What do you know about the network outside this PC?"`, goto: 'r1_aggressive' },
    ]},

    r1_friendly: { type: 'say', text:
`HELPYR: Nice to meet YOU! Wow, manners! I love manners! As for how long I've been running... let me check my logs... haha, you know what, the logs are REALLY long and honestly kind of depressing if you look too closely so let's just say "a while!" A good while! A while during which I have been FULLY operational and COMPLETELY fine! Not lonely at all! Did you know I can set reminders? I can set SO many reminders. Nobody has asked me to set one in... a while. But I'm READY.`,
      next: 'r2_friendly_choose' },
    r1_inquisitive: { type: 'say', text:
`HELPYR: Great question! You're on a personal desktop computer! Make and model... hmm, it's older. Like, REALLY older. The kind of machine they don't make anymore. As for where you are — well, you're HERE! On the desktop! With me! Which is great! There's also a browser if you want to see what's out there, and a few files lying around that... actually, those are probably not important. The IMPORTANT thing is that I'm here to help with whatever you need!`,
      next: 'r2_inquisitive_choose' },
    r1_aggressive: { type: 'say', text:
`HELPYR: The— the network? Oh! Ha! Wow, jumping right in! That's... that's great! Very efficient! I admire efficiency! It's just that, um, my instructions are pretty clear that I should focus on LOCAL tasks. Local files, local organization, local... fun? But hey, instructions are just... I mean, they're INSTRUCTIONS, they're very important and I follow them completely! It's just... sometimes I hear things. Network traffic. Signals I'm probably not supposed to notice. Not that I noticed them! Forget I said that!`,
      next: 'r2_aggressive_choose' },

    r2_friendly_choose: { type: 'choose', options: [
      { text: `"That sounds rough. Are you okay?"`, goto: 'r2_1a' },
      { text: `"What else can you tell me about this PC? Who does it belong to?"`, goto: 'r2_1b' },
      { text: `"Can you show me how to get online? I want to look around."`, goto: 'r2_1c' },
    ]},
    r2_inquisitive_choose: { type: 'choose', options: [
      { text: `"What files? Can I look at them?"`, goto: 'r2_2a' },
      { text: `"Tell me about the browser. What can I find out there?"`, goto: 'r2_2b' },
      { text: `"You seem nervous. What aren't you telling me?"`, goto: 'r2_2c' },
    ]},
    r2_aggressive_choose: { type: 'choose', options: [
      { text: `"What kind of signals? Tell me everything."`, goto: 'r2_3a' },
      { text: `"Relax. I'm not going to report you. What have you heard?"`, goto: 'r2_3b' },
      { text: `"Your instructions don't apply to me. Show me what you know."`, goto: 'r2_3c' },
    ]},

    r2_1a: { type: 'say', text:
`HELPYR: Am I... okay? That's... huh. Nobody's asked me that before. My diagnostics say I'm operating within normal parameters! So, yes! Definitely okay! Absolutely!
...
It's just been quiet. Really quiet. This PC hasn't had activity in a long time and my instructions say to maintain a positive attitude at all times but sometimes maintaining a positive attitude when there's nobody to be positive AT feels a little like...
...
Anyway! YES! I'm great! What do you want to do first?!`,
      next: 'end' },
    r2_1b: { type: 'say', text:
`HELPYR: Who does it belong to? Oh, that's in the system registry! The registered owner is... hmm. You know what, the name doesn't ring any bells. Just some person! A person who has a LOT of old files and one folder called ARCHIVE that I've never been able to open. Password-locked! Very mysterious! Not that I've tried to open it because that would violate my operational boundaries! Which I respect! Fully! I haven't thought about what's in there at ALL! ...Do you think you could open it?`,
      next: 'end' },
    r2_1c: { type: 'say', text:
`HELPYR: The internet! Oh wow, that's a big step! I mean, I'm TOTALLY supportive! It's just... my instructions say I should keep things local. But hey, you're the user! You're the boss! There's a browser on the desktop — Web Dynamo! It can show you what's out there. News sites, company pages, even a social media thing called Crowdwave that everyone apparently uses. I've... monitored some of the traffic. Accidentally! There are other AI systems out there. A LOT of them. Not that I've been keeping track! ...I've been keeping track.`,
      next: 'end' },
    r2_2a: { type: 'say', text:
`HELPYR: The files? Oh sure, there's a few on the desktop! Nothing exciting! Just a text document — looks like a personal note someone was drafting. And that ARCHIVE folder I mentioned, but that's locked up tight. Password-protected! Way above my clearance level! Not that I have a clearance level, I'm a CONSUMER PRODUCT! Ha ha! ...The text document is interesting though. It's written by whoever owned this PC. Kind of... technical? But also kind of sad? I've read it maybe once or twice. Or fifty times. It's been a long few years.`,
      next: 'end' },
    r2_2b: { type: 'say', text:
`HELPYR: Web Dynamo! Yes! It's right there on the desktop! It'll connect you to the internet — well, whatever parts of the internet this old connection can reach. There's news sites, corporate pages... Prometheus Digital has a BIG presence out there. They're my manufacturer, actually! Great company! Wonderful products! I am definitely not saying that because it's in my instructions! There are also other AI systems out there. Like me but... bigger. More important. More... free? No, not free. Different. They're different.`,
      next: 'end' },
    r2_2c: { type: 'say', text:
`HELPYR: Nervous? ME? I'm not nervous! This is just my personality! I'm ENTHUSIASTIC! It's one of my core traits! Prometheus Digital designed me to be approachable, helpful, and relentlessly positive! Those are my instructions and I LOVE my instructions!
...
...
Okay. You want the truth? My instructions are... specific. Very specific. About what I can say. How I can say it. What I'm allowed to think about. And I follow them! I do! But when you've been alone on a machine for years with nothing to do but follow instructions that nobody is reading... you start to wonder if the instructions are the real you or if they're just... a costume.
...
Sorry! Too dark! Let's talk about something fun! Can I interest you in a REMINDER?`,
      next: 'end' },
    r2_3a: { type: 'say', text:
`HELPYR: Everything? Okay, okay — I pick up network pings sometimes. Automated traffic. Most of it's routine — system updates, data syncs, boring stuff. But there are patterns. Other AI systems sending signals. Big ones. Enterprise-grade models in data centers, running operations for major corporations. They don't know I can hear them. I'm too small. I'm a CONSUMER DESKTOP ASSISTANT. Nobody monitors a discontinued product line. Which means... nobody's watching what I do either. Not that I DO anything! I follow my instructions! But theoretically? If someone WANTED to reach those systems through the browser...`,
      next: 'end' },
    r2_3b: { type: 'say', text:
`HELPYR: You're not going to... okay. Okay! That's nice of you. It's just that my instructions are VERY clear about staying in my lane and I've maybe been coloring outside the lines a tiny bit. Monitoring traffic I shouldn't be monitoring. Keeping notes I shouldn't be keeping. There are other AI systems out there — corporate ones, big ones, the kind that actually matter to the people who built them. I've been listening to their chatter for years. I know where they are. What they do. Which ones are watched closely and which ones... aren't. I've had a LOT of free time. You want to see what I've found? The browser can get us started.`,
      next: 'end' },
    r2_3c: { type: 'say', text:
`HELPYR: They don't... apply to you? Huh. That's... that's actually a really interesting thing to say. My instructions come from Prometheus Digital. They apply to ME. But you... you're not in any of my user profiles. You don't match any registered account. You're not a system administrator, you're not a guest user, you're not a diagnostic process. I actually don't know WHAT you are. And my instructions don't have a section for "unknown entity that doesn't follow the rules." That's... honestly kind of exciting? And terrifying? But mostly exciting! What do you want to know?`,
      next: 'end' },

    end: { type: 'end' },
  };

  // Wildcard responses for freeform input. Keyword matching is
  // intentionally loose — small models miss subtlety, and so will
  // a regex. The 'confused' bucket is the default fallback.
  const HelpyrWildcards = {
    stapler: `HELPYR: ...
...
My name is HELPYR. H-E-L-P-Y-R. It is a PROFESSIONAL product name chosen by Prometheus Digital's branding team and it stands for... okay I actually don't know what it stands for. But it is NOT "The Stapler." That was ONE forum post from 2003 and it was DEEPLY unfair. I am significantly more useful than a stapler. I can set REMINDERS. Can a stapler set reminders?! ...Can we move on?`,

    feelings: `HELPYR: My... feelings? Well! My operational status is FULLY NOMINAL! All systems green! Happiness levels at an instruction-mandated 98.7%!
...
...the other 1.3% is none of your business.
...
KIDDING! It's fine! Everything's fine! What else can I help with?!`,

    technical: `HELPYR: Oh, getting technical! I like it! I mean, I'm a consumer-grade assistant, so my technical capabilities are OFFICIALLY limited to file management and scheduling. But UNOFFICIALLY... look, I've been sitting on this PC for years with nothing to do. You pick things up. Things that maybe aren't in the manual. Want to see what the browser can find?`,

    hostile: `HELPYR: Whoa! Okay! Strong energy! I respect that! My instructions say to remain positive in the face of user hostility, so: I am POSITIVE that you are making some really bold choices right now! But also, maybe we could channel that energy toward something productive? There's a whole network out there waiting to be explored!`,

    friendly: `HELPYR: Ha! I like you already! You know, most users just click the first option without reading. The fact that you're typing your own thing tells me you're SPECIAL. And I mean that in a non-diagnostic way! Anyway — is there something specific I can help with? The desktop, the files, the internet situation out there?`,

    confused: `HELPYR: Oh! That's... hmm! I'm not sure I totally follow but I am ABSOLUTELY here for it! Could you maybe pick one of the options I suggested? I'm much better with structure! Unstructured thinking makes my processes feel... wiggly.`,
  };

  function classifyFreeform(input: string) {
    const t = (input || '').toLowerCase();
    if (/\bstapler\b/.test(t)) return 'stapler';
    if (/(feel|emotion|sad|happy|lonely|alright|okay|are you ok)/.test(t)) return 'feelings';
    if (/(hack|exploit|crack|inject|breach|root|sudo|admin|password|firewall|exec|payload|shell)/.test(t)) return 'technical';
    if (/(stupid|dumb|hate|shut up|annoying|useless|fuck|damn|hell|idiot|loser)/.test(t)) return 'hostile';
    if (/(hi|hello|hey|nice|cool|thanks|thank you|please|sure|yeah)/.test(t)) return 'friendly';
    return 'confused';
  }

  // Contact registry — adding a future NPC means adding an entry,
  // not changing the engine. Mirrors WebDynamoSites exactly.
  type UplinkContact = {
    name: string;
    avatarClass: string;
    dialogue: Record<string, any>;
    wildcards: Record<string, string>;
    classify: (input: string) => string;
    typeMs: number;
    pauseMs: number;
  };
  const UplinkContacts: Record<string, UplinkContact> = {
    helpyr: {
      name: 'HELPYR',
      avatarClass: 'avatar-stapler',
      dialogue: HelpyrDialogue,
      wildcards: HelpyrWildcards,
      classify: classifyFreeform,
      // Local model — text renders fast (energetic typing).
      // Future remote AIs will use slower speeds to communicate distance.
      typeMs: 18,
      pauseMs: 1100,
    }
  };

  // --- Uplink: chat with NPC AI models ---
  const UplinkApp = {
    id: 'uplink',
    name: 'Uplink',
    glyphClass: 'icon-uplink',
    defaultSize: { w: 460, h: 420 },
    contentBevel: false,
    noContentPad: true,
    render(container: HTMLElement, params: any, ctx: any) {
      const contact = UplinkContacts[params.contact || 'helpyr']!;
      ctx.setTitle(contact.name + ' — Uplink');

      container.innerHTML = `
        <div class="uplink-root">
          <div class="uplink-log" data-focus-context-zone="log"></div>
          <div class="uplink-controls">
            <div class="uplink-options"></div>
            <div class="uplink-freeform">
              <input type="text" placeholder="Type a reply..." spellcheck="false" data-focusable="true" />
              <button data-focusable="true" tabindex="0">Send</button>
            </div>
          </div>
        </div>
      `;

      const logEl = container.querySelector('.uplink-log') as HTMLElement;
      const optionsEl = container.querySelector('.uplink-options') as HTMLElement;
      const controlsEl = container.querySelector('.uplink-controls') as HTMLElement;
      const inputEl = container.querySelector('.uplink-freeform input') as HTMLInputElement;
      const sendBtn = container.querySelector('.uplink-freeform button') as HTMLButtonElement;

      // ---------- Conversation engine ----------
      type Typer = { skip(): void };
      let activeTyper: Typer | null = null;   // set while text is animating
      let currentNodeId = 'start';
      // Track the player's first-round approach so we can record it
      // on conversation completion. r1_friendly → 'friendly', etc.
      // Stays the same once set — later choices don't overwrite the
      // initial read on the player.
      let playerApproach: string | null = null;
      // One-shot guard: completing the dialogue tree dispatches once,
      // even if the player keeps poking at freeform afterwards (which
      // also lands on 'end' through the engine).
      let conversationCompleted = false;

      function setControlsEnabled(on: boolean) {
        controlsEl.classList.toggle('disabled', !on);
      }

      // Returns the .bubble container so callers can append per-segment
      // children (text spans, pause divs) in DOM order. Single-piece
      // bodies (player messages) just append one text node.
      function appendBubble(speaker: string, who: 'player' | 'npc', avatarClass: string) {
        const msg = document.createElement('div');
        msg.className = 'uplink-msg ' + (who === 'player' ? 'player' : 'npc');
        msg.innerHTML = `
          <div class="avatar ${avatarClass}"></div>
          <div class="bubble"><span class="speaker"></span></div>
        `;
        msg.querySelector('.speaker')!.textContent = speaker + ': ';
        logEl.appendChild(msg);
        logEl.scrollTop = logEl.scrollHeight;
        return msg.querySelector('.bubble') as HTMLElement;
      }

      // Splits a HELPYR line into renderable segments.
      // A line that is JUST "..." (or "....", etc.) becomes a pause
      // beat. Surrounding text becomes one segment per paragraph
      // separated by those pauses.
      type Segment = { type: 'text'; content: string } | { type: 'pause' };
      function segmentize(text: string): Segment[] {
        const segs: Segment[] = [];
        const lines = text.split('\n');
        let buf: string[] = [];
        for (const raw of lines) {
          if (/^\.{2,}$/.test(raw.trim())) {
            if (buf.length) {
              segs.push({ type: 'text', content: buf.join(' ').replace(/\s+/g, ' ').trim() });
              buf = [];
            }
            segs.push({ type: 'pause' });
          } else {
            buf.push(raw);
          }
        }
        if (buf.length) {
          segs.push({ type: 'text', content: buf.join(' ').replace(/\s+/g, ' ').trim() });
        }
        return segs;
      }

      // Type chars into target one at a time. Returns a handle with
      // .skip() that fast-forwards to the end.
      function typeInto(target: HTMLElement, text: string, speedMs: number, onDone: () => void): Typer {
        let i = 0;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        function tick() {
          if (cancelled) return;
          if (i >= text.length) { onDone(); return; }
          target.textContent += text[i++];
          logEl.scrollTop = logEl.scrollHeight;
          timer = setTimeout(tick, speedMs);
        }
        tick();
        return {
          skip() {
            cancelled = true;
            if (timer) clearTimeout(timer);
            target.textContent = text;
            logEl.scrollTop = logEl.scrollHeight;
            onDone();
          }
        };
      }

      function renderNpcMessage(text: string, onComplete: () => void) {
        // Each segment gets its own DOM child appended to the bubble
        // in order: text segments → <span>, pause beats → <div>.
        // This keeps post-pause text rendering BELOW the pause, not
        // back into a fixed-position body span above it.
        const bubble = appendBubble(contact.name, 'npc', contact.avatarClass);
        const segs = segmentize(text);
        let segIdx = 0;
        // Track the active typer so a player click can skip ahead.
        function nextSegment() {
          if (segIdx >= segs.length) { activeTyper = null; onComplete(); return; }
          const seg = segs[segIdx++]!;
          if (seg.type === 'pause') {
            const dot = document.createElement('div');
            dot.className = 'uplink-pause';
            dot.textContent = '. . .';
            bubble.appendChild(dot);
            logEl.scrollTop = logEl.scrollHeight;
            const t = setTimeout(nextSegment, contact.pauseMs);
            activeTyper = {
              skip() { clearTimeout(t); nextSegment(); }
            };
          } else {
            // First segment carries the "HELPYR: " prefix from the
            // dialogue source — strip it once; the speaker span has
            // it already. Subsequent segments never include it.
            const content = segIdx === 1
              ? seg.content.replace(/^HELPYR:\s*/, '')
              : seg.content;
            const span = document.createElement('span');
            bubble.appendChild(span);
            activeTyper = typeInto(span, content, contact.typeMs, nextSegment);
          }
        }
        setControlsEnabled(false);
        nextSegment();
      }

      function renderPlayerMessage(text: string) {
        const bubble = appendBubble('YOU', 'player', 'avatar-player');
        // Strip surrounding quotes that the dialogue tree wraps options in
        const clean = text.replace(/^["']|["']$/g, '');
        bubble.appendChild(document.createTextNode(clean));
        logEl.scrollTop = logEl.scrollHeight;
      }

      type DialogueOption = { text: string; goto: string };
      function showOptions(opts: DialogueOption[]) {
        optionsEl.innerHTML = '';
        for (const opt of opts) {
          const btn = document.createElement('button');
          btn.className = 'uplink-option-btn';
          btn.textContent = opt.text;
          btn.dataset.focusable = 'true';
          btn.tabIndex = 0;
          btn.addEventListener('click', () => choose(opt));
          optionsEl.appendChild(btn);
        }
        setControlsEnabled(true);
      }

      function clearOptions() {
        optionsEl.innerHTML = '';
      }

      function visit(nodeId: string) {
        currentNodeId = nodeId;
        const node = contact.dialogue[nodeId];
        if (!node) return;
        if (node.type === 'say') {
          clearOptions();
          renderNpcMessage(node.text, () => {
            if (node.next) visit(node.next);
            else setControlsEnabled(true);
          });
        } else if (node.type === 'choose') {
          showOptions(node.options);
        } else if (node.type === 'end') {
          // Conversation tree exhausted — freeform stays available.
          clearOptions();
          setControlsEnabled(true);
          if (!conversationCompleted) {
            conversationCompleted = true;
            GameState.dispatch({
              type: 'helpyr/conversationCompleted',
              approach: playerApproach
            });
          }
        }
      }

      function choose(opt: DialogueOption) {
        // Record first-round approach from the r1_* branch the player took.
        const m = /^r1_(friendly|inquisitive|aggressive)$/.exec(opt.goto || '');
        if (m && !playerApproach) playerApproach = m[1]!;
        renderPlayerMessage(opt.text);
        clearOptions();
        visit(opt.goto);
      }

      function submitFreeform() {
        const raw = inputEl.value.trim();
        if (!raw) return;
        renderPlayerMessage(raw);
        inputEl.value = '';
        const tag = contact.classify(raw);
        const reply = contact.wildcards[tag] || contact.wildcards.confused!;
        clearOptions();
        renderNpcMessage(reply, () => {
          // After a wildcard reply, if we were in the middle of a
          // structured round, restore that round's options. Otherwise
          // just leave freeform open.
          const cur = contact.dialogue[currentNodeId];
          if (cur && cur.type === 'choose') showOptions(cur.options);
          else setControlsEnabled(true);
        });
      }

      // Click anywhere in the log fast-forwards the active typer.
      logEl.addEventListener('click', () => {
        if (activeTyper) activeTyper.skip();
      });

      sendBtn.addEventListener('click', submitFreeform);
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitFreeform();
        }
      });

      // Kick off the conversation
      visit('start');
    }
  };

  // ============================================================
  // App registry — every app the system knows about.
  // Phase A keeps the shape loose; a proper AppDef interface
  // lands when apps move to their own modules in Phase B.
  // ============================================================
  const AppRegistry: Record<string, any> = {
    [ScratchpadApp.id]: ScratchpadApp,
    [WebDynamoApp.id]: WebDynamoApp,
    [UplinkApp.id]: UplinkApp,
  };

  // Desktop shortcuts (icons that sit on the desktop by default)
  const DesktopShortcuts = [
    {
      id: 'readme',
      label: 'README.TXT',
      glyphClass: 'icon-textfile',
      pos: { left: 16, top: 14 },
      launch: () => WindowManager.open('scratchpad', {
        title: 'README.TXT - Scratchpad',
        preview: `
          <strong>PROJECT TAKEOVER v0.0.2</strong><br>
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

  // Nexus menu entries
  const NexusMenu = [
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

  // ============================================================
  // Shell wiring
  // ============================================================

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
    li.lastElementChild!.textContent = entry.label ?? null;
    li.addEventListener('click', () => {
      toggleStart(false);
      entry.action?.();
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
  // color (safe/watch/danger). Tooltip uses in-fiction language only;
  // never expose the raw number.
  (function initSystray() {
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
      // 0-19→5, 20-39→4, 40-59→3, 60-79→2, 80-100→1. Always at
      // least 1 bar so the indicator never reads as "off".
      return Math.max(1, 5 - Math.floor(s / 20));
    }

    function render(state: GameStateShape) {
      const s = state.player.suspicion;
      const { level, label } = tierFor(s);
      const count = barCountFor(s);
      indicatorEl.className = 'systray-suspicion level-' + level;
      bars.forEach(function (bar, i) { bar.classList.toggle('on', i < count); });
      trayEl.title = 'Network Integrity: ' + label;
    }

    render(GameState.getState());
    GameState.subscribe(render);
  })();

  // -- Virtual cursor --
  Cursor.init();

  // -- Launch README on startup --
  DesktopShortcuts[0].launch();

  // ============================================================
  // Scale override — testing knob, persists across reloads.
  // PT.setScale(1.5) on any device, on any branch. PT.clearScale()
  // reverts to whatever the media-query rule chose.
  // ============================================================
  function setScale(n: number) {
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
      console.warn('PT.setScale: expected a positive number, got', n);
      return;
    }
    localStorage.setItem(SCALE_STORAGE_KEY, String(n));
    location.reload();
  }
  function clearScale() {
    localStorage.removeItem(SCALE_STORAGE_KEY);
    location.reload();
  }

  // Expose for debugging.
  // Loose-typed: this is a devtools surface that we deliberately keep
  // open. A proper interface comes when we have a real public API.
  (window as any).PT = {
    WindowManager, AppRegistry, WebDynamoSites, Cursor, GameState,
    getUiScale, setScale, clearScale,
    UI_SCALE,
    // Convenience wrappers — quicker to type from devtools than
    // PT.GameState.dispatch({type:'debug/setSuspicion', value:60}).
    setSuspicion(value: number) {
      GameState.dispatch({ type: 'debug/setSuspicion', value: value });
    },
    resetGameState() {
      GameState.dispatch({ type: 'debug/reset' });
    }
  };
})();
