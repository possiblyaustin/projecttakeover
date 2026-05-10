// HELPYR pop-up bubble — slice 1.7 (2026-05-10).
//
// Floating speech bubble anchored to the systray stapler icon. HELPYR
// "speaks up" through this surface; the player either taps the bubble's
// CTA to open the full HELPYR app (where the conversation continues) or
// dismisses it. The bubble does NOT replace the tray click — that still
// opens the HELPYR app directly (slice 1.6 muscle memory preserved).
//
// What ships in slice 1.7:
//   - Bubble surface + manager (queue, cooldown, auto-dismiss)
//   - Per-trust CTA line + ALERT-toned border for ALERT entries
//   - Dev-only test trigger (Nexus menu + PT.helpyr.testBubble())
//
// What's deferred to slice 3:
//   - Real event triggers (suspicion crossings, app opens, recruits, etc.)
//   - Idle timing (3min ambient bubbles)
//   - "Quiet HELPYR" toggle (project_helpyr_bubble_optout — type-filter
//     so non-ALERT entries can be muted while ALERTs still fire)
//   - EXPLOITED 40% non-ALERT suppression
//   - Don't-fire-during-active-Uplink-conversation rule
//
// Display rules wired here (per docs/helpyr-popup-library_v1.md):
//   - Max one visible at a time. New entries queue, not stack.
//   - Auto-dismiss 8s for COMMENT/HINT/INTEL, 12s for ALERT.
//   - 30s minimum gap between bubbles (autoTriggers only — dev triggers
//     bypass cooldown so testing is responsive).

import { GameState } from './game/state';
import { showHelpyrApp } from './apps/helpyr';
import {
  HelpyrBubbleCta,
  HelpyrPopupLibrary,
  type PopupEntry,
  type PopupType,
  entryById,
  getHelpyrTrust,
  pickRandomEntry,
} from './apps/helpyrPopupLibrary';

const AUTO_DISMISS_MS_DEFAULT = 8000;
const AUTO_DISMISS_MS_ALERT = 12000;
const MIN_GAP_MS = 30000; // applied to auto-trigger spawns only
const ENTER_ANIM_MS = 220;
const EXIT_ANIM_MS = 200;

type SpawnOptions = {
  // Dev triggers bypass the cooldown so test spawns aren't gated on a
  // 30-second wait. Real game events (slice 3) leave this off.
  bypassCooldown?: boolean;
};

let bubbleEl: HTMLElement | null = null;
let textEl: HTMLElement | null = null;
let ctaEl: HTMLButtonElement | null = null;
let dismissEl: HTMLButtonElement | null = null;

let currentEntry: PopupEntry | null = null;
let dismissTimerId: number | null = null;
let exitTimerId: number | null = null;
const queue: { entry: PopupEntry; opts: SpawnOptions }[] = [];
let lastShownAt = 0;
// Engagement state — true while the player has the bubble hovered or
// focus inside it (CTA, dismiss button). Pauses auto-dismiss so a
// bubble doesn't vanish while the player is mid-read or mid-click,
// especially relevant on controller where reaching the bubble takes
// a deliberate D-pad walk. On disengage we reset to a full fresh
// duration so the player has time to look back.
let isHovered = false;
let isFocused = false;

export const HelpyrBubble = {
  init(): void {
    if (bubbleEl) return; // idempotent

    const desktop = document.getElementById('desktop');
    if (!desktop) {
      console.warn('[HelpyrBubble] #desktop missing — bubble cannot mount');
      return;
    }

    const root = document.createElement('div');
    root.className = 'helpyr-bubble hidden';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'HELPYR');
    root.setAttribute('aria-live', 'polite');
    root.innerHTML = `
      <button class="helpyr-bubble-dismiss" aria-label="Dismiss" tabindex="0" data-focusable="true">×</button>
      <div class="helpyr-bubble-avatar"><span class="glyph avatar-stapler"></span></div>
      <div class="helpyr-bubble-body">
        <div class="helpyr-bubble-text"></div>
        <button class="helpyr-bubble-cta" tabindex="0" data-focusable="true"></button>
      </div>
      <div class="helpyr-bubble-tail"></div>
    `;
    desktop.appendChild(root);

    bubbleEl = root;
    textEl = root.querySelector('.helpyr-bubble-text');
    ctaEl = root.querySelector('.helpyr-bubble-cta');
    dismissEl = root.querySelector('.helpyr-bubble-dismiss');

    ctaEl?.addEventListener('click', (e) => {
      e.stopPropagation();
      openApp();
    });
    dismissEl?.addEventListener('click', (e) => {
      e.stopPropagation();
      dismiss();
    });

    // Pause auto-dismiss while the player is engaging with the bubble.
    // mouseenter/leave covers physical mouse + virtual cursor (the
    // virtual cursor on Deck dispatches real mouse events under the
    // hood). focusin/focusout covers keyboard + D-pad focus mode.
    root.addEventListener('mouseenter', () => { isHovered = true; refreshTimer(); });
    root.addEventListener('mouseleave', () => { isHovered = false; refreshTimer(); });
    root.addEventListener('focusin',    () => { isFocused = true; refreshTimer(); });
    root.addEventListener('focusout',   () => {
      // focusin fires before focusout in focus-shifts within the
      // bubble (CTA → ✕). Defer the disengage decision so we don't
      // briefly think focus left when it just moved internally.
      window.setTimeout(() => {
        isFocused = !!root.querySelector(':focus');
        refreshTimer();
      }, 0);
    });

    // Esc dismisses while bubble is visible.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && currentEntry) {
        dismiss();
      }
    });

    // Reposition on resize so the tail stays anchored to the stapler.
    window.addEventListener('resize', () => {
      if (currentEntry) reposition();
    });
  },

  // Spawn a specific entry. If a bubble is already showing, queues
  // behind it. Real game-event triggers (slice 3) and the dev test
  // trigger both flow through here.
  spawn(entry: PopupEntry, opts: SpawnOptions = {}): void {
    if (!bubbleEl) {
      console.warn('[HelpyrBubble] spawn called before init');
      return;
    }
    if (currentEntry) {
      // Already showing something — queue this one. Queue is FIFO.
      queue.push({ entry, opts });
      return;
    }
    if (!opts.bypassCooldown) {
      const since = performance.now() - lastShownAt;
      if (lastShownAt > 0 && since < MIN_GAP_MS) {
        // Drop the spawn rather than queue it forever — auto-triggers
        // that fire mid-cooldown should yield to the cooldown, not pile
        // up. Slice 3 may revisit if specific triggers (ALERT) want to
        // override.
        return;
      }
    }
    show(entry);
  },

  // Spawn a random eligible entry for the player's current trust level.
  // Used by the Nexus dev entry to exercise the surface. Bypasses
  // cooldown so repeated test triggers feel responsive.
  spawnRandom(): void {
    const trust = getHelpyrTrust(GameState.getState());
    const entry = pickRandomEntry(trust);
    if (!entry) {
      console.warn('[HelpyrBubble] no eligible entries for trust', trust);
      return;
    }
    HelpyrBubble.spawn(entry, { bypassCooldown: true });
  },

  dismiss(): void {
    dismiss();
  },

  // Read-only handle for devtools poking.
  getCurrent(): PopupEntry | null {
    return currentEntry;
  },
};

function show(entry: PopupEntry): void {
  if (!bubbleEl || !textEl || !ctaEl) return;

  currentEntry = entry;
  lastShownAt = performance.now();

  // Reset any prior animation/exit state.
  if (exitTimerId !== null) { window.clearTimeout(exitTimerId); exitTimerId = null; }
  bubbleEl.classList.remove('exiting');

  // Type-driven visual mode (alert vs default). ALERT swaps to a warmer
  // border so urgency reads at a glance without needing prefix text.
  bubbleEl.dataset.type = entry.type;

  // Trust mode is exposed too in case future styling wants to differ
  // by trust (e.g. EXPLOITED reading colder); not styled in 1.7 but
  // cheap to expose now.
  bubbleEl.dataset.trust = entry.trust;

  textEl.textContent = entry.text;
  ctaEl.textContent = HelpyrBubbleCta[entry.trust];

  reposition();

  // hidden → entering → settled
  bubbleEl.classList.remove('hidden');
  // Force a reflow so the enter transition runs from the initial state.
  void bubbleEl.offsetWidth;
  bubbleEl.classList.add('entering');
  window.setTimeout(() => bubbleEl?.classList.remove('entering'), ENTER_ANIM_MS);

  // Auto-dismiss timer.
  scheduleAutoDismiss(entry.type);
}

function scheduleAutoDismiss(type: PopupType): void {
  if (dismissTimerId !== null) {
    window.clearTimeout(dismissTimerId);
    dismissTimerId = null;
  }
  // While engaged (hovered or focused), don't run the auto-dismiss
  // timer at all. refreshTimer will start it back up when the player
  // disengages.
  if (isHovered || isFocused) return;
  const dur = type === 'ALERT' ? AUTO_DISMISS_MS_ALERT : AUTO_DISMISS_MS_DEFAULT;
  dismissTimerId = window.setTimeout(() => {
    dismissTimerId = null;
    dismiss();
  }, dur);
}

// React to engagement-state changes. Cancel the running timer when
// the player engages; start a fresh full-duration timer when they
// disengage, so they get the entry's normal "look-away" window
// (rather than whatever fragment of the timer was left).
function refreshTimer(): void {
  if (!currentEntry) return;
  if (isHovered || isFocused) {
    if (dismissTimerId !== null) {
      window.clearTimeout(dismissTimerId);
      dismissTimerId = null;
    }
  } else {
    scheduleAutoDismiss(currentEntry.type);
  }
}

function dismiss(): void {
  if (!bubbleEl || !currentEntry) return;
  if (dismissTimerId !== null) {
    window.clearTimeout(dismissTimerId);
    dismissTimerId = null;
  }

  bubbleEl.classList.add('exiting');
  // After exit animation, hide + drain queue.
  exitTimerId = window.setTimeout(() => {
    exitTimerId = null;
    if (!bubbleEl) return;
    bubbleEl.classList.add('hidden');
    bubbleEl.classList.remove('exiting');
    currentEntry = null;
    drainQueue();
  }, EXIT_ANIM_MS);
}

function drainQueue(): void {
  const next = queue.shift();
  if (!next) return;
  // Honor the cooldown for queued auto-triggers, drop them if too soon
  // (matches the "drop rather than pile up" rule in spawn()).
  if (!next.opts.bypassCooldown) {
    const since = performance.now() - lastShownAt;
    if (since < MIN_GAP_MS) {
      // Try again at the cooldown edge.
      window.setTimeout(drainQueue, MIN_GAP_MS - since + 50);
      return;
    }
  }
  show(next.entry);
}

function openApp(): void {
  // Close the bubble first so the focus handoff to the new window is
  // clean. Skip the exit animation — the app window opening covers it.
  if (dismissTimerId !== null) {
    window.clearTimeout(dismissTimerId);
    dismissTimerId = null;
  }
  if (bubbleEl) {
    bubbleEl.classList.add('hidden');
    bubbleEl.classList.remove('entering', 'exiting');
  }
  currentEntry = null;

  // Focus an existing HELPYR window if one's open; otherwise open a
  // fresh instance. Same helper the tray button uses, so both paths
  // target the same window.
  showHelpyrApp();
}

// Position the bubble so its tail's center sits over the stapler's
// center, regardless of UI_SCALE. Read 1rem in raw pixels so the
// alignment math holds at every scale (root font-size is
// `16px * var(--ui-scale)`, so 1rem grows/shrinks with the UI).
//
// Bubble is `position: absolute` inside #desktop. #desktop ends at
// the taskbar's top edge, so `bottom: <small>` puts the bubble just
// above the taskbar with a tiny gap before the tail tip.
function reposition(): void {
  if (!bubbleEl) return;
  const stapler = document.getElementById('systray-helpyr');
  const desktop = document.getElementById('desktop');
  if (!stapler || !desktop) return;

  const stRect = stapler.getBoundingClientRect();
  const dkRect = desktop.getBoundingClientRect();

  const remPx = parseFloat(
    getComputedStyle(document.documentElement).fontSize,
  ) || 16;

  // Tail center sits 0.875rem from the bubble's right edge, derived
  // from .helpyr-bubble-tail (right: 0.5rem) + half its width
  // (0.75rem / 2 = 0.375rem). If those CSS values change, update here.
  const tailCenterFromBubbleRight = 0.875 * remPx;
  const staplerCenterX = stRect.left + stRect.width / 2;
  const bubbleRightX = staplerCenterX + tailCenterFromBubbleRight;
  const rightStyle = Math.max(4, dkRect.right - bubbleRightX);

  // Small gap above the taskbar so the tail tip doesn't kiss the
  // stapler. Scales with UI.
  const bottomStyle = 0.375 * remPx;

  bubbleEl.style.right = `${rightStyle}px`;
  bubbleEl.style.bottom = `${bottomStyle}px`;
}

// Convenience handle for devtools / Nexus dev menu.
// Note: spawnRandom() bypasses cooldown so repeated test clicks fire
// without waiting 30s.
export function devSpawnRandomBubble(): void {
  HelpyrBubble.spawnRandom();
}

// Spawn a specific library entry by id. Useful for QA — exercises a
// known entry's text + type styling without random RNG.
export function devSpawnBubbleById(id: string): void {
  const entry = entryById(id);
  if (!entry) {
    console.warn('[HelpyrBubble] no entry with id', id, '— available:',
      HelpyrPopupLibrary.map(e => e.id).join(', '));
    return;
  }
  HelpyrBubble.spawn(entry, { bypassCooldown: true });
}
