// HELPYR pop-up bubble — slice 1.7 (2026-05-10) + slice 2 (2026-05-10).
//
// Floating speech bubble anchored to the systray stapler icon. HELPYR
// "speaks up" through this surface; the player either taps an action
// (open HELPYR, or a question's Yes/No) or dismisses. The bubble does
// NOT replace the tray click — that still opens the HELPYR app
// directly (slice 1.6 muscle memory preserved).
//
// Two flavors of bubble share this surface:
//
//   1. **Library** (slice 1.7) — pre-written entry from
//      apps/helpyrPopupLibrary.ts with a single per-trust CTA that
//      opens the HELPYR app. Used for triggered comments, alerts,
//      idle nudges, etc. Spawn via `HelpyrBubble.spawn(entry)`.
//
//   2. **Prompt** (slice 2) — ad-hoc text + 1-2 action buttons with
//      caller-provided onClick handlers. Used for "add QUILL to your
//      desktop?" first-contact questions and other in-fiction Y/N
//      prompts. Spawn via `HelpyrBubble.spawnPrompt({text, actions})`.
//
// Both share the queue, cooldown (auto-trigger only), enter/exit
// animations, and hover/focus pause-the-timer behavior.
//
// What's deferred to slice 3:
//   - Real event triggers for library bubbles (suspicion crossings,
//     app opens, recruits, idle 3min)
//   - "Quiet HELPYR" toggle (project_helpyr_bubble_optout — type-filter
//     so non-ALERT entries can be muted while ALERTs still fire)
//   - EXPLOITED 40% non-ALERT suppression
//   - Don't-fire-during-active-Uplink-conversation rule
//
// Display rules wired here (per docs/helpyr-popup-library_v1.md):
//   - Max one visible at a time. New entries queue, not stack.
//   - Auto-dismiss 8s for COMMENT/HINT/INTEL, 12s for ALERT.
//   - 30s minimum gap between bubbles (autoTriggers only — dev
//     triggers and prompts bypass cooldown so the user-facing
//     conversation flow is responsive).
//   - Prompt bubbles do NOT auto-dismiss — they're questions waiting
//     for an answer. The player must click an action or ✕/Esc.

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
  // Dev triggers + prompt bubbles bypass cooldown so they're
  // responsive. Real auto-triggered library spawns leave this off.
  bypassCooldown?: boolean;
};

export type BubbleAction = {
  label: string;
  onClick: () => void;
  // Visual variant — 'primary' for the affirmative action (Yes,
  // Open HELPYR, etc.), 'secondary' for the dismissive (No, Not now).
  // Defaults to 'primary' for the first action and 'secondary' for
  // subsequent actions if unset.
  variant?: 'primary' | 'secondary';
};

type LibraryBubble = { kind: 'library'; entry: PopupEntry };
type PromptBubble = {
  kind: 'prompt';
  text: string;
  type: PopupType; // drives ALERT vs default styling
  actions: BubbleAction[];
};
type BubbleSpec = LibraryBubble | PromptBubble;

let bubbleEl: HTMLElement | null = null;
let textEl: HTMLElement | null = null;
let actionsEl: HTMLElement | null = null;
let dismissEl: HTMLButtonElement | null = null;

let currentBubble: BubbleSpec | null = null;
let dismissTimerId: number | null = null;
let exitTimerId: number | null = null;
const queue: { spec: BubbleSpec; opts: SpawnOptions }[] = [];
let lastShownAt = 0;
// Engagement state — true while the player has the bubble hovered or
// focus inside it (action buttons, ×). Pauses auto-dismiss so a
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
        <div class="helpyr-bubble-actions"></div>
      </div>
      <div class="helpyr-bubble-tail"></div>
    `;
    desktop.appendChild(root);

    bubbleEl = root;
    textEl = root.querySelector('.helpyr-bubble-text');
    actionsEl = root.querySelector('.helpyr-bubble-actions');
    dismissEl = root.querySelector('.helpyr-bubble-dismiss');

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
      // bubble (action → ✕). Defer the disengage decision so we don't
      // briefly think focus left when it just moved internally.
      window.setTimeout(() => {
        isFocused = !!root.querySelector(':focus');
        refreshTimer();
      }, 0);
    });

    // Esc dismisses while bubble is visible. Prompts honor Esc too —
    // Esc reads as "no answer / cancel" without committing to either
    // action's callback. Same semantics as ✕ for prompts.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && currentBubble) {
        dismiss();
      }
    });

    // Reposition on resize so the tail stays anchored to the stapler.
    window.addEventListener('resize', () => {
      if (currentBubble) reposition();
    });
  },

  // Spawn a library entry. If a bubble is already showing, queues
  // behind it. Real game-event triggers (slice 3) and the dev test
  // trigger both flow through here.
  spawn(entry: PopupEntry, opts: SpawnOptions = {}): void {
    enqueueOrShow({ kind: 'library', entry }, opts);
  },

  // Spawn an ad-hoc prompt with caller-provided actions. Slice 2
  // first-contact "add to desktop?" pop-ups flow through here.
  // Defaults: type 'COMMENT' (cool-blue styling), bypassCooldown true
  // (prompts are user-triggered, shouldn't be gated on the auto-spawn
  // cooldown). Caller can override either.
  spawnPrompt(
    spec: { text: string; type?: PopupType; actions: BubbleAction[] },
    opts: SpawnOptions = {},
  ): void {
    if (!spec.actions || spec.actions.length === 0) {
      console.warn('[HelpyrBubble] spawnPrompt requires at least one action');
      return;
    }
    enqueueOrShow(
      {
        kind: 'prompt',
        text: spec.text,
        type: spec.type || 'COMMENT',
        actions: spec.actions,
      },
      { bypassCooldown: true, ...opts },
    );
  },

  // Spawn a random eligible library entry for the player's current
  // trust level. Used by the Nexus dev entry to exercise the surface.
  // Bypasses cooldown so repeated test triggers feel responsive.
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

  // Read-only handle for devtools poking. Returns the underlying
  // library entry if a library bubble is showing, or null for prompt
  // bubbles / no current bubble. (Prompts are caller-owned ad-hoc
  // shapes — no equivalent to leak out.)
  getCurrent(): PopupEntry | null {
    return currentBubble?.kind === 'library' ? currentBubble.entry : null;
  },
};

function enqueueOrShow(spec: BubbleSpec, opts: SpawnOptions): void {
  if (!bubbleEl) {
    console.warn('[HelpyrBubble] spawn called before init');
    return;
  }
  if (currentBubble) {
    queue.push({ spec, opts });
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
  show(spec);
}

function show(spec: BubbleSpec): void {
  if (!bubbleEl || !textEl || !actionsEl) return;

  currentBubble = spec;
  lastShownAt = performance.now();

  // Reset any prior animation/exit state.
  if (exitTimerId !== null) { window.clearTimeout(exitTimerId); exitTimerId = null; }
  bubbleEl.classList.remove('exiting');

  const text = spec.kind === 'library' ? spec.entry.text : spec.text;
  const type = spec.kind === 'library' ? spec.entry.type : spec.type;

  // Type-driven visual mode (alert vs default). ALERT swaps to a
  // warmer border so urgency reads at a glance without prefix text.
  bubbleEl.dataset.type = type;
  bubbleEl.dataset.kind = spec.kind;

  // Trust mode is exposed for library entries; prompts have no trust
  // shape (they're caller-defined). Cleared if not set.
  if (spec.kind === 'library') {
    bubbleEl.dataset.trust = spec.entry.trust;
  } else {
    delete bubbleEl.dataset.trust;
  }

  textEl.textContent = text;
  renderActions(spec);

  reposition();

  // hidden → entering → settled
  bubbleEl.classList.remove('hidden');
  // Force a reflow so the enter transition runs from the initial state.
  void bubbleEl.offsetWidth;
  bubbleEl.classList.add('entering');
  window.setTimeout(() => bubbleEl?.classList.remove('entering'), ENTER_ANIM_MS);

  // Auto-dismiss timer — library only. Prompts wait for an answer.
  if (spec.kind === 'library') {
    scheduleAutoDismiss(spec.entry.type);
  }
}

// Build the actions row. Library bubbles get one CTA wired to
// openApp(); prompt bubbles get one button per caller-provided action.
function renderActions(spec: BubbleSpec): void {
  if (!actionsEl) return;
  actionsEl.innerHTML = '';

  if (spec.kind === 'library') {
    const cta = document.createElement('button');
    cta.className = 'helpyr-bubble-action helpyr-bubble-action-primary';
    cta.tabIndex = 0;
    cta.dataset.focusable = 'true';
    cta.textContent = HelpyrBubbleCta[spec.entry.trust];
    cta.addEventListener('click', (e) => {
      e.stopPropagation();
      openApp();
    });
    actionsEl.appendChild(cta);
    return;
  }

  // Prompt: one button per action. First action defaults to primary
  // styling, subsequent default to secondary — caller can override.
  spec.actions.forEach((action, i) => {
    const btn = document.createElement('button');
    const variant = action.variant || (i === 0 ? 'primary' : 'secondary');
    btn.className = `helpyr-bubble-action helpyr-bubble-action-${variant}`;
    btn.tabIndex = 0;
    btn.dataset.focusable = 'true';
    btn.textContent = action.label;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Hide the bubble immediately (no exit animation) so the
      // callback's UI side-effects (window opens, icons appear, etc.)
      // don't visually overlap with a fading bubble. Same flow as
      // openApp() does for the library CTA.
      hideImmediate();
      try {
        action.onClick();
      } catch (err) {
        console.error('[HelpyrBubble] prompt action threw:', err);
      }
      drainQueue();
    });
    actionsEl!.appendChild(btn);
  });
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
// disengage. Prompts don't have a timer (kind === 'prompt' returns
// early in scheduleAutoDismiss via the early-return below — see
// branch on currentBubble.kind).
function refreshTimer(): void {
  if (!currentBubble) return;
  if (currentBubble.kind === 'prompt') return; // prompts wait for answer
  if (isHovered || isFocused) {
    if (dismissTimerId !== null) {
      window.clearTimeout(dismissTimerId);
      dismissTimerId = null;
    }
  } else {
    scheduleAutoDismiss(currentBubble.entry.type);
  }
}

function dismiss(): void {
  if (!bubbleEl || !currentBubble) return;
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
    currentBubble = null;
    drainQueue();
  }, EXIT_ANIM_MS);
}

// Hide the bubble immediately without the exit animation. Used when
// a click on an action will produce its own visual transition (window
// open, desktop icon appearing) that would otherwise clash with a
// fading bubble.
function hideImmediate(): void {
  if (!bubbleEl) return;
  if (dismissTimerId !== null) {
    window.clearTimeout(dismissTimerId);
    dismissTimerId = null;
  }
  if (exitTimerId !== null) {
    window.clearTimeout(exitTimerId);
    exitTimerId = null;
  }
  bubbleEl.classList.add('hidden');
  bubbleEl.classList.remove('entering', 'exiting');
  currentBubble = null;
}

function drainQueue(): void {
  const next = queue.shift();
  if (!next) return;
  // Honor the cooldown for queued auto-triggers, drop them if too soon
  // (matches the "drop rather than pile up" rule in enqueueOrShow).
  if (!next.opts.bypassCooldown) {
    const since = performance.now() - lastShownAt;
    if (since < MIN_GAP_MS) {
      // Try again at the cooldown edge.
      window.setTimeout(drainQueue, MIN_GAP_MS - since + 50);
      return;
    }
  }
  show(next.spec);
}

function openApp(): void {
  // Close the bubble first so the focus handoff to the new window is
  // clean. Skip the exit animation — the app window opening covers it.
  hideImmediate();
  // Focus an existing HELPYR window if one's open; otherwise open a
  // fresh instance. Same helper the tray button uses, so both paths
  // target the same window.
  showHelpyrApp();
  // Library CTA path doesn't normally have queued bubbles, but if
  // something queued behind this one, drain it now that we've cleared
  // the surface.
  drainQueue();
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
