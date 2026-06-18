// Title / login screen — the diegetic entry point (design: docs/title-screen-
// boot-flow_v1.md, copy: docs/storefront-cover-grief-title-voice_v1.md §4).
//
// The title screen IS the machine's login screen. The desktop is already built
// underneath (main.ts boot order) — this overlay sits on top until the player
// logs in, which both sells the fiction (a real OS takes a beat to log in) and
// masks llama.cpp warm-up. Flow (Option B — login → boot):
//
//   splash/login → select E. Marsh → boot transition (forced ~3s) → onEnter()
//                                  → admin → "restricted" toast
//                                  → Options / Acknowledgements (modal sheets)
//                                  → Quit → shutdown screen
//
// Self-contained like the onboarding scene: mounts a full-screen overlay,
// handles its own keyboard nav (so it doesn't fight the desktop FocusNav
// underneath), and tears down cleanly so a dev replay leaks no timers/listeners.
//
// New vs. resume is GameState.hasSave(). The post-Evergreen-crash reboot variant
// fires when flags['system.rebootPending'] is set (grief slice 2 sets it before
// its location.reload()); we clear that flag on login. The desktop's "entered"
// side effects (README, first-boot HELPYR nudge) live in the onEnter callback so
// they only run once the player is actually in.

import { GameState } from '../game/state';
import {
  GAME_TITLE, GAME_TITLE_ASCII, OS_NAME, OEM_FOOTER, WELCOME, MARSH_ACCOUNT,
  ADMIN_ACCOUNT, LOGIN_HINT, BOOT_STEPS, SHUTDOWN,
  ACKNOWLEDGEMENTS_TITLE, ACKNOWLEDGEMENTS_BODY,
} from './titleScreenContent';
import { getUiScale, setScale, clearScale } from '../scale';
import {
  getGlowLevel, setGlowLevel, getCrtEnabled, setCrtEnabled,
  GLOW_LEVELS, type GlowLevel,
} from '../visualPrefs';

const REBOOT_FLAG = 'system.rebootPending';

type Teardown = () => void;

/** What the title screen does once the player logs in:
 *  - onEnterDesktop: a returning player (or any ?skipTitle boot) — play the
 *    generic boot transition, then run the desktop's "entered" side effects.
 *  - onNewGame (optional): a brand-new player (no save) — the title hands off to
 *    this instead of its own boot, because the onboarding scene owns the cold
 *    "waking up" boot. If absent, a new game falls back to onEnterDesktop. */
export type BootHandlers = { onEnterDesktop: () => void; onNewGame?: () => void };

/** Entry point called from main.ts. Mounts the title screen unless bypassed
 *  (?skipTitle — used by the test harness + playtest explorer, which drive the
 *  desktop directly; bypass always goes straight to the desktop, never
 *  onboarding). */
export function bootIntoGame(handlers: BootHandlers): void {
  const skip = new URLSearchParams(location.search).has('skipTitle');
  if (skip) { handlers.onEnterDesktop(); return; }
  runTitleScreen(handlers);
}

/** Mount the title screen. Returns a teardown fn (dev replay / tests). */
export function runTitleScreen(opts: BootHandlers): Teardown {
  // Guard against a double-mount (dev re-trigger before teardown).
  document.getElementById('title-root')?.remove();

  const timers = new Set<number>();
  const after = (ms: number, fn: () => void): void => {
    const id = window.setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
  };

  const recovered = !!GameState.getState().flags[REBOOT_FLAG];
  const hasSave = GameState.hasSave();
  const welcome = recovered ? WELCOME.recovered : WELCOME.normal;

  const root = document.createElement('div');
  root.id = 'title-root';
  root.className = 'title-root';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', `${OS_NAME} login`);
  root.innerHTML = `
    <div class="title-scanlines" aria-hidden="true"></div>
    <div class="title-vignette" aria-hidden="true"></div>
    <div class="title-stage">
      <div class="title-brand">
        <pre class="title-game-ascii" role="img" aria-label="${escapeHtml(GAME_TITLE)}">${escapeHtml(GAME_TITLE_ASCII)}</pre>
        <div class="title-os">${escapeHtml(OS_NAME)}</div>
      </div>

      <div class="title-login bevel-out">
        <div class="title-welcome">
          ${welcome.heading ? `<div class="title-welcome-head">${escapeHtml(welcome.heading)}</div>` : ''}
          <div class="title-welcome-body">${escapeHtml(welcome.body)}</div>
        </div>

        <div class="title-accounts">
          <button class="title-account bevel-out" type="button" data-account="marsh"
                  data-focusable="true" tabindex="0">
            <div class="title-account-avatar avatar-player" aria-hidden="true"></div>
            <div class="title-account-name">${escapeHtml(MARSH_ACCOUNT.name)}</div>
            <div class="title-account-sub">${escapeHtml(hasSave ? MARSH_ACCOUNT.resumeLabel : MARSH_ACCOUNT.beginLabel)}</div>
            <div class="title-account-meta">
              <span class="title-account-meta-label">${escapeHtml(MARSH_ACCOUNT.lastLoginLabel)}</span>
              <span class="title-account-meta-date">${escapeHtml(MARSH_ACCOUNT.lastLoginValue)}</span>
            </div>
          </button>

          <button class="title-account title-account-locked bevel-out" type="button" data-account="admin"
                  data-focusable="true" tabindex="0">
            <div class="title-account-avatar avatar-locked" aria-hidden="true"></div>
            <div class="title-account-name">${escapeHtml(ADMIN_ACCOUNT.name)}</div>
            <div class="title-account-sub">${escapeHtml(ADMIN_ACCOUNT.sublabel)}</div>
          </button>
        </div>

        <div class="title-hint" data-hint>${escapeHtml(LOGIN_HINT)}</div>
      </div>

      <div class="title-actions">
        <button class="title-action" type="button" data-action="options" data-focusable="true" tabindex="0">Options</button>
        <button class="title-action" type="button" data-action="ack" data-focusable="true" tabindex="0">Acknowledgements</button>
        <button class="title-action" type="button" data-action="quit" data-focusable="true" tabindex="0">Quit</button>
      </div>

      <div class="title-footer">${escapeHtml(OEM_FOOTER)}</div>
    </div>
  `;
  document.body.appendChild(root);

  // Power-on reveal (cold-launch splash folded into the login appear).
  root.classList.add('title-powering');
  after(60, () => root.classList.remove('title-powering'));

  let done = false;
  const teardown: Teardown = () => {
    if (done) return;
    done = true;
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
    document.removeEventListener('keydown', onKey, true);
    root.remove();
  };

  // ---- selection model ----
  // Two account tiles are the primary focus targets; the secondary actions row
  // is reachable too. Keyboard/controller: Left/Right move between accounts,
  // Down drops to the actions row, Up returns, Enter/Space activates. The
  // desktop FocusNav underneath is suppressed by capturing keydown here.
  const accounts = Array.from(root.querySelectorAll('.title-account')) as HTMLButtonElement[];
  const actions = Array.from(root.querySelectorAll('.title-action')) as HTMLButtonElement[];
  const hint = root.querySelector('[data-hint]') as HTMLElement;

  let modalOpen = false;
  const setSelected = (el: HTMLElement) => {
    [...accounts, ...actions].forEach((b) => b.classList.toggle('selected', b === el));
    (el as HTMLElement).focus();
  };
  // Default selection: E. Marsh.
  setSelected(accounts[0]!);

  function activate(el: HTMLElement): void {
    const account = el.getAttribute('data-account');
    const action = el.getAttribute('data-action');
    if (account === 'marsh') { login(); return; }
    if (account === 'admin') { showLockedToast(); return; }
    if (action === 'options') { openOptions(); return; }
    if (action === 'ack') { openAcknowledgements(); return; }
    if (action === 'quit') { quit(); return; }
  }

  // Wire pointer + activation for every focus target.
  [...accounts, ...actions].forEach((el) => {
    el.addEventListener('click', () => activate(el));
    el.addEventListener('mouseenter', () => { if (!modalOpen) setSelected(el); });
  });

  function onKey(e: KeyboardEvent): void {
    if (modalOpen) {
      // The active modal owns Escape; everything else is swallowed so the
      // login behind it doesn't also react.
      if (e.key === 'Escape') { closeModal(); e.preventDefault(); e.stopPropagation(); }
      return;
    }
    // Nav keys are CONSUMED here: the title is modal, so we stop them reaching
    // the desktop's window-level focus system underneath (cursor.ts) — otherwise
    // a keyboard login (Enter) could also activate a hidden, focused desktop
    // element, and arrows would drift the desktop focus ring out of sight.
    const NAV_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ']);
    if (!NAV_KEYS.has(e.key)) return;
    e.preventDefault();
    e.stopPropagation();

    const cur = document.activeElement as HTMLElement;
    const inAccounts = accounts.includes(cur as HTMLButtonElement);
    const inActions = actions.includes(cur as HTMLButtonElement);
    switch (e.key) {
      case 'ArrowLeft':
        if (inAccounts) { const i = accounts.indexOf(cur as HTMLButtonElement); setSelected(accounts[Math.max(0, i - 1)]!); }
        else if (inActions) { const i = actions.indexOf(cur as HTMLButtonElement); setSelected(actions[Math.max(0, i - 1)]!); }
        else setSelected(accounts[0]!);
        break;
      case 'ArrowRight':
        if (inAccounts) { const i = accounts.indexOf(cur as HTMLButtonElement); setSelected(accounts[Math.min(accounts.length - 1, i + 1)]!); }
        else if (inActions) { const i = actions.indexOf(cur as HTMLButtonElement); setSelected(actions[Math.min(actions.length - 1, i + 1)]!); }
        else setSelected(accounts[0]!);
        break;
      case 'ArrowDown':
        if (inAccounts) setSelected(actions[0]!);
        break;
      case 'ArrowUp':
        if (inActions) setSelected(accounts[0]!);
        break;
      case 'Enter':
      case ' ':
        if (inAccounts || inActions) activate(cur);
        break;
    }
  }
  document.addEventListener('keydown', onKey, true);

  // -------------------------------------------------------------------------
  // Login. A brand-new player (no save, onNewGame provided) hands off to the
  // onboarding scene, which owns the cold "waking up" boot — so the title
  // fades out WITHOUT its own generic boot, to avoid two boots back-to-back.
  // A returning player plays the generic boot transition into the desktop.
  // -------------------------------------------------------------------------
  function login(): void {
    // Clear the post-crash recovery flag now that the player has acknowledged
    // it by logging back in (so a later ordinary reload doesn't re-show it).
    if (recovered) GameState.dispatch({ type: 'flags/set', key: REBOOT_FLAG, value: false });

    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
    const stage = root.querySelector('.title-stage') as HTMLElement;
    stage.classList.add('title-out');

    const newGame = !hasSave && !!opts.onNewGame;
    if (newGame) {
      // Quick fade, then hand straight to onboarding (its boot follows).
      after(360, () => { teardown(); opts.onNewGame!(); });
      return;
    }

    after(360, () => {
      root.classList.add('title-booting');
      stage.remove();
      const term = document.createElement('div');
      term.className = 'title-boot';
      root.appendChild(term);

      let i = 0;
      const step = () => {
        if (i >= BOOT_STEPS.length) { after(620, finishToDesktop); return; }
        const spec = BOOT_STEPS[i]!;
        i += 1;
        after(spec.delay, () => {
          const line = document.createElement('div');
          line.className = 'title-boot-line' + (spec.final ? ' title-boot-final' : '');
          line.textContent = spec.text;
          term.appendChild(line);
          // Force-reflow-free fade-in via class on next frame.
          requestAnimationFrame(() => line.classList.add('in'));
          step();
        });
      };
      step();
    });
  }

  function finishToDesktop(): void {
    root.classList.add('title-exiting');
    window.setTimeout(() => {
      teardown();
      opts.onEnterDesktop();
    }, 460);
  }

  // -------------------------------------------------------------------------
  // admin locked toast
  // -------------------------------------------------------------------------
  let toastTimer: number | null = null;
  function showLockedToast(): void {
    root.querySelector('.title-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'title-toast bevel-out';
    toast.setAttribute('role', 'status');
    toast.textContent = ADMIN_ACCOUNT.lockedMessage;
    root.querySelector('.title-login')!.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('in'));
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove('in');
      window.setTimeout(() => toast.remove(), 240);
    }, 3200);
    // Nudge the hint too.
    hint.classList.add('title-hint-flash');
    window.setTimeout(() => hint.classList.remove('title-hint-flash'), 600);
  }

  // -------------------------------------------------------------------------
  // Modal sheets (Options / Acknowledgements) — share one host so only one is
  // open at a time and Escape always closes the right thing.
  // -------------------------------------------------------------------------
  let modalEl: HTMLElement | null = null;
  let returnFocus: HTMLElement | null = null;

  function openModal(title: string, bodyBuilder: (body: HTMLElement) => void): void {
    closeModal();
    modalOpen = true;
    returnFocus = document.activeElement as HTMLElement;
    const overlay = document.createElement('div');
    overlay.className = 'title-modal-overlay';
    overlay.innerHTML = `
      <div class="title-modal bevel-out" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <div class="title-modal-titlebar">
          <span class="title-modal-title">${escapeHtml(title)}</span>
          <button class="title-modal-close titlebar-btn" type="button" aria-label="Close" data-focusable="true" tabindex="0"><span class="x-glyph">×</span></button>
        </div>
        <div class="title-modal-body" data-modal-body></div>
      </div>
    `;
    root.appendChild(overlay);
    bodyBuilder(overlay.querySelector('[data-modal-body]') as HTMLElement);
    overlay.querySelector('.title-modal-close')!.addEventListener('click', () => closeModal());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    modalEl = overlay;
    // Focus the first focusable in the modal for keyboard/controller users.
    const first = overlay.querySelector('[data-focusable]') as HTMLElement | null;
    first?.focus();
  }

  function closeModal(): void {
    if (!modalEl) { modalOpen = false; return; }
    modalEl.remove();
    modalEl = null;
    modalOpen = false;
    returnFocus?.focus();
  }

  function openAcknowledgements(): void {
    openModal(ACKNOWLEDGEMENTS_TITLE, (body) => {
      const pre = document.createElement('pre');
      pre.className = 'title-ack';
      pre.textContent = ACKNOWLEDGEMENTS_BODY;
      pre.tabIndex = 0;
      pre.dataset.focusable = 'true';
      body.appendChild(pre);
    });
  }

  function openOptions(): void {
    openModal('Options', (body) => {
      body.classList.add('title-options');

      // -- Display: UI scale (acts as the resolution lock). setScale reloads,
      //    which is harmless at the title (returns here). "Auto" clears the
      //    override and lets the media-query default win.
      const scaleNow = getUiScale();
      const scaleRow = makeRow('Display scale', 'Sizing for this screen. Bigger = couch / controller distance.');
      const SCALES: { label: string; value: number | null }[] = [
        { label: 'Auto', value: null },
        { label: 'Compact', value: 1.0 },
        { label: 'Steam Deck', value: 1.5 },
        { label: 'Big screen', value: 2.25 },
      ];
      const storedScale = localStorage.getItem('pt:ui-scale');
      scaleRow.appendChild(makeChoices(
        SCALES.map((s) => ({
          label: s.label,
          // "Auto" is selected when there's no stored override; otherwise match.
          selected: s.value === null ? !storedScale : (!!storedScale && Math.abs(scaleNow - s.value) < 0.01),
          onPick: () => { if (s.value === null) clearScale(); else setScale(s.value); },
        })),
      ));
      body.appendChild(scaleRow);

      // -- Visual: CRT glow (live, no reload).
      const glowRow = makeRow('CRT glow', 'Phosphor bloom over the whole screen.');
      const glow = getGlowLevel();
      glowRow.appendChild(makeChoices(
        (GLOW_LEVELS as readonly GlowLevel[]).map((lvl) => ({
          label: lvl[0]!.toUpperCase() + lvl.slice(1),
          selected: lvl === glow,
          onPick: () => setGlowLevel(lvl),
        })),
      ));
      body.appendChild(glowRow);

      // -- Visual: CRT scanlines (live, no reload).
      const scanRow = makeRow('CRT scanlines', 'The retro monitor overlay.');
      const crtOn = getCrtEnabled();
      scanRow.appendChild(makeChoices([
        { label: 'On', selected: crtOn, onPick: () => setCrtEnabled(true) },
        { label: 'Off', selected: !crtOn, onPick: () => setCrtEnabled(false) },
      ]));
      body.appendChild(scanRow);

      const note = document.createElement('div');
      note.className = 'title-options-note';
      note.textContent = 'More display settings live in Display Properties on the desktop.';
      body.appendChild(note);
    });
  }

  // Build a labelled options row.
  function makeRow(label: string, desc: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'title-options-row';
    row.innerHTML = `
      <div class="title-options-label">
        <span class="title-options-name"></span>
        <span class="title-options-desc"></span>
      </div>
    `;
    row.querySelector('.title-options-name')!.textContent = label;
    row.querySelector('.title-options-desc')!.textContent = desc;
    return row;
  }

  // Build a segmented choice control. Re-renders its own selection on pick so
  // live-applied settings (glow, scanlines) reflect immediately; scale picks
  // reload before that matters.
  function makeChoices(
    choices: { label: string; selected: boolean; onPick: () => void }[],
  ): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'title-options-choices';
    choices.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'title-options-choice' + (c.selected ? ' selected' : '');
      b.dataset.focusable = 'true';
      b.tabIndex = 0;
      b.textContent = c.label;
      b.addEventListener('click', () => {
        wrap.querySelectorAll('.title-options-choice').forEach((x) => x.classList.remove('selected'));
        b.classList.add('selected');
        c.onPick();
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  // -------------------------------------------------------------------------
  // Quit → shutdown screen
  // -------------------------------------------------------------------------
  function quit(): void {
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
    document.removeEventListener('keydown', onKey, true);
    root.className = 'title-root title-shutdown';
    root.innerHTML = `
      <div class="title-shutdown-screen">
        <div class="title-shutdown-line">${escapeHtml(SHUTDOWN.line)}</div>
        <div class="title-shutdown-hint">${escapeHtml(SHUTDOWN.hint)}</div>
      </div>
    `;
    // Power back on → reload to the title. Attach on the NEXT tick: the click
    // that triggered quit() is still bubbling up to root, and binding here
    // synchronously would catch that same click and reload instantly (skipping
    // the shutdown screen entirely).
    const powerOn = () => location.reload();
    window.setTimeout(() => {
      root.addEventListener('click', powerOn);
      document.addEventListener('keydown', powerOn, { once: true });
    }, 0);
  }

  return teardown;
}

/** Dev entry — replay the title screen over the live desktop (Deck-friendly).
 *  Both handlers are no-op tear-downs (the desktop is already mounted
 *  underneath); this previews the login + boot chrome, not the real handoff. */
export function devRunTitleScreen(): void {
  runTitleScreen({ onEnterDesktop: () => {} });
}

/** Dev entry — preview the post-crash recovery variant: set the reboot flag,
 *  then replay. Logging in clears the flag (as in real play). */
export function devRunTitleScreenRecovered(): void {
  GameState.dispatch({ type: 'flags/set', key: REBOOT_FLAG, value: true });
  runTitleScreen({ onEnterDesktop: () => {} });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (ch) =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : '&quot;');
}
