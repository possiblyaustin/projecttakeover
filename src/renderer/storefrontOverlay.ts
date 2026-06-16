// Storefront overlay — the transient preview/debrief layer that lives ON the
// real InkWell public pages (Web Dynamo), so the player sees a proposed
// defacement IN CONTEXT before publishing, and lands on the live site with a
// consequence recap when the session ends.
//
// Why a separate module: this state is EPHEMERAL (a draft being previewed, a
// debrief being shown) — it must NOT persist to GameState like committed
// changes do. It's shared between the CMS console (which drives it) and the
// InkWell page renders in webDynamoSites (which display it). A leaf module both
// can import keeps it cycle-free.
//
// Flow:
//   - Console drafts a section → beginPreview(...) + navigates the browser to
//     the section's page. The InkWell page render calls renderStorefrontLayer,
//     which overlays the DRAFT fields (on top of any committed ones) and mounts
//     a Publish / Redraft / Cancel bar. Nothing is committed yet.
//   - Publish/Cancel/Redraft run console-supplied closures (they survive the
//     navigation as closures). Publish commits + navigates back to the console.
//   - On session end the console calls beginDebrief(...) + navigates to the
//     defaced homepage; the page render mounts a recap panel instead.

import { GameState } from './game/state';
import {
  SECTION_LABELS, INTENSITY_LABELS,
  STOREFRONT_NEWS_AGGRESSIVE, STOREFRONT_NEWS_HOSTILE,
  type StorefrontSection, type StorefrontIntensity,
} from './game/missions/storefront';

type PreviewState = {
  mode: 'preview';
  section: StorefrontSection;
  intensity: StorefrontIntensity;
  fields: Record<string, string>;
  busy: boolean;
  onPublish: () => void;
  onRedraft: (steer: string | undefined) => void;
  onCancel: () => void;
};

type DebriefState = {
  mode: 'debrief';
  onMore: () => void;
  onLeave: () => void;
};

let overlay: PreviewState | DebriefState | null = null;
// A QUILL line set by Publish, read by the console when it re-mounts after the
// navigate-back (the console instance that published is gone by then).
let pendingConsoleMessage: string | null = null;
// Last InkWell page the layer rendered into — lets the console refresh the bar
// in place (e.g. a redraft) without a full browser re-navigation.
let lastContainer: HTMLElement | null = null;
let lastNavigate: ((url: string) => void) | null = null;

// --- preview lifecycle (called by the console) ---

export function beginPreview(opts: {
  section: StorefrontSection;
  intensity: StorefrontIntensity;
  fields: Record<string, string>;
  onPublish: () => void;
  onRedraft: (steer: string | undefined) => void;
  onCancel: () => void;
}): void {
  overlay = { mode: 'preview', busy: false, ...opts };
}

export function updatePreviewFields(fields: Record<string, string>): void {
  if (overlay?.mode === 'preview') { overlay.fields = fields; overlay.busy = false; }
}

export function setPreviewBusy(busy: boolean): void {
  if (overlay?.mode === 'preview') overlay.busy = busy;
}

export function beginDebrief(opts: { onMore: () => void; onLeave: () => void }): void {
  overlay = { mode: 'debrief', ...opts };
}

export function clearOverlay(): void { overlay = null; }
export function isPreviewActive(): boolean { return overlay?.mode === 'preview'; }

export function setPendingConsoleMessage(msg: string): void { pendingConsoleMessage = msg; }
export function takePendingConsoleMessage(): string | null {
  const m = pendingConsoleMessage; pendingConsoleMessage = null; return m;
}

// --- field application (shared with webDynamoSites) ---

function committedFields(): Record<string, string> {
  return GameState.getState().missions.storefront['quill']?.appliedFields ?? {};
}

/** Committed defacement merged with the in-flight preview (preview wins). The
 *  InkWell public pages render from this. */
export function effectiveInkFields(): Record<string, string> {
  const base: Record<string, string> = { ...committedFields() };
  if (overlay?.mode === 'preview') {
    for (const [k, v] of Object.entries(overlay.fields)) base[k] = v;
  }
  return base;
}

function applyInkFields(container: HTMLElement): void {
  const fields = effectiveInkFields();
  const previewKeys = overlay?.mode === 'preview' ? new Set(Object.keys(overlay.fields)) : null;
  for (const el of container.querySelectorAll<HTMLElement>('[data-ink-field]')) {
    const key = el.dataset.inkField;
    if (key && Object.prototype.hasOwnProperty.call(fields, key)) {
      el.textContent = fields[key]!;
      el.classList.add('ink-field-corrupt');
      // A field that's only changed in the PREVIEW (not yet committed) pulses
      // so the player can see exactly what this draft touches.
      if (previewKeys?.has(key) && !(key in committedFields())) {
        el.classList.add('ink-field-preview');
      }
    }
  }
}

/** Called by each InkWell public page render. Overlays committed + preview
 *  field copy, then mounts the preview bar or debrief panel if one is active.
 *  `navigate` is the browser's page-navigate (re-renders the window). Idempotent
 *  — strips any prior overlay before mounting so a refresh can't stack bars. */
export function renderStorefrontLayer(container: HTMLElement, navigate?: (url: string) => void): void {
  lastContainer = container;
  if (navigate) lastNavigate = navigate;
  container.querySelectorAll('.sf-overlay').forEach((el) => el.remove());
  applyInkFields(container);
  const nav = navigate ?? lastNavigate;
  if (!overlay || !nav) return;
  if (overlay.mode === 'preview') mountPreviewBar(container, overlay, nav);
  else mountDebriefPanel(container, overlay);
}

/** Re-render the overlay bar in place (no browser navigation) — used by the
 *  redraft beat to flip the bar to/from its busy state and swap in new copy. */
export function refreshOverlay(): void {
  if (lastContainer) renderStorefrontLayer(lastContainer, lastNavigate ?? undefined);
}

// --- overlay UI ---

function mountPreviewBar(container: HTMLElement, st: PreviewState, _navigate: (url: string) => void): void {
  const bar = document.createElement('div');
  bar.className = 'sf-overlay sf-overlay-preview';
  if (st.busy) {
    bar.innerHTML = `<div class="sf-overlay-label">QUILL is rewriting<span class="ink-dots">…</span></div>`;
    container.appendChild(bar);
    return;
  }
  bar.innerHTML = `
    <div class="sf-overlay-head">
      <span class="sf-overlay-tag">PREVIEW · not live</span>
      <span class="sf-overlay-where">${SECTION_LABELS[st.section]} — ${INTENSITY_LABELS[st.intensity]}</span>
    </div>
    <div class="sf-overlay-steer">
      <input type="text" class="ink-steer-input sf-overlay-input" data-steer placeholder="Want it different? Tell QUILL how…" spellcheck="false" data-focusable="true" />
      <button class="ink-btn sf-overlay-btn" data-act="redraft" data-focusable="true" tabindex="0">↺ Redraft</button>
    </div>
    <div class="sf-overlay-actions">
      <button class="ink-btn ink-primary sf-overlay-btn" data-act="publish" data-focusable="true" tabindex="0">Publish to live site</button>
      <button class="ink-btn sf-overlay-btn" data-act="cancel" data-focusable="true" tabindex="0">Cancel</button>
    </div>
  `;
  const steer = bar.querySelector('[data-steer]') as HTMLInputElement;
  const redraft = () => st.onRedraft(steer.value.trim() || undefined);
  bar.querySelector('[data-act="redraft"]')!.addEventListener('click', redraft);
  steer.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') redraft(); });
  bar.querySelector('[data-act="publish"]')!.addEventListener('click', () => st.onPublish());
  bar.querySelector('[data-act="cancel"]')!.addEventListener('click', () => st.onCancel());
  container.appendChild(bar);
}

function buildRecapLines(): string[] {
  const m = GameState.getState().missions.storefront['quill'];
  if (!m) return [];
  const lines: string[] = [];
  const changed = Object.entries(m.sectionIntensity) as [StorefrontSection, StorefrontIntensity][];
  lines.push(`${changed.length}/4 sections rewritten.`);
  for (const [section, intensity] of changed) {
    lines.push(`  • ${SECTION_LABELS[section]} — ${INTENSITY_LABELS[intensity]}`);
  }
  lines.push(`Total exposure added: +${m.suspicionApplied}.`);
  if (m.newsTier === 'hostile') lines.push(`SignalWatch ran: “${STOREFRONT_NEWS_HOSTILE.headline}”`);
  else if (m.newsTier === 'aggressive') lines.push(`SignalWatch ran: “${STOREFRONT_NEWS_AGGRESSIVE.headline}”`);
  if (m.interceptFired) lines.push(`Intercepted: InkWell's CEO emailed his engineer in a panic.`);
  return lines;
}

function mountDebriefPanel(container: HTMLElement, st: DebriefState): void {
  const panel = document.createElement('div');
  panel.className = 'sf-overlay sf-overlay-debrief';
  const recap = document.createElement('div');
  recap.className = 'sf-debrief-recap';
  for (const line of buildRecapLines()) {
    const p = document.createElement('div');
    p.className = 'sf-debrief-line';
    p.textContent = line;
    recap.appendChild(p);
  }
  const head = document.createElement('div');
  head.className = 'sf-overlay-head';
  head.innerHTML = `<span class="sf-overlay-tag sf-tag-done">SESSION CLOSED</span><span class="sf-overlay-where">This is what the world saw.</span>`;
  panel.append(head, recap);

  const actions = document.createElement('div');
  actions.className = 'sf-overlay-actions';
  const more = document.createElement('button');
  more.className = 'ink-btn ink-primary sf-overlay-btn';
  more.dataset.focusable = 'true'; more.tabIndex = 0; more.textContent = 'Make more changes';
  more.addEventListener('click', () => st.onMore());
  const leave = document.createElement('button');
  leave.className = 'ink-btn sf-overlay-btn';
  leave.dataset.focusable = 'true'; leave.tabIndex = 0; leave.textContent = 'Leave it like this';
  leave.addEventListener('click', () => st.onLeave());
  actions.append(more, leave);
  panel.appendChild(actions);
  container.appendChild(panel);
}
