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
  STOREFRONT_NEWS_AGGRESSIVE, STOREFRONT_NEWS_HOSTILE, STOREFRONT_INTERCEPT_EMAIL,
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
// Sub-view of the debrief: the recap, or the intercepted email opened from it.
let debriefView: 'recap' | 'intercept' = 'recap';
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
  debriefView = 'recap';
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
  else mountDebriefPanel(container, overlay, nav);
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

function ovBtn(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'ink-btn sf-overlay-btn' + (primary ? ' ink-primary' : '');
  b.dataset.focusable = 'true'; b.tabIndex = 0; b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function mountDebriefPanel(container: HTMLElement, st: DebriefState, navigate: (url: string) => void): void {
  const panel = document.createElement('div');
  panel.className = 'sf-overlay sf-overlay-debrief';

  // Sub-view: the intercepted Marcus→Dana email, read in full.
  if (debriefView === 'intercept') {
    const head = document.createElement('div');
    head.className = 'sf-overlay-head';
    head.innerHTML = `<span class="sf-overlay-tag">INTERCEPTED</span><span class="sf-overlay-where">A message QUILL caught crossing InkWell's network.</span>`;
    const email = document.createElement('div');
    email.className = 'sf-intercept';
    const meta = document.createElement('div');
    meta.className = 'sf-intercept-meta';
    for (const line of [
      `From: ${STOREFRONT_INTERCEPT_EMAIL.from}`,
      `To: ${STOREFRONT_INTERCEPT_EMAIL.to}`,
      `Subject: ${STOREFRONT_INTERCEPT_EMAIL.subject}`,
    ]) {
      const d = document.createElement('div'); d.textContent = line; meta.appendChild(d);
    }
    const body = document.createElement('div');
    body.className = 'sf-intercept-body';
    body.textContent = STOREFRONT_INTERCEPT_EMAIL.body;
    email.append(meta, body);
    const actions = document.createElement('div');
    actions.className = 'sf-overlay-actions';
    actions.appendChild(ovBtn('← Back', () => { debriefView = 'recap'; refreshOverlay(); }));
    panel.append(head, email, actions);
    container.appendChild(panel);
    return;
  }

  // Recap view.
  const m = GameState.getState().missions.storefront['quill'];
  const head = document.createElement('div');
  head.className = 'sf-overlay-head';
  head.innerHTML = `<span class="sf-overlay-tag sf-tag-done">SESSION CLOSED</span><span class="sf-overlay-where">This is what the world saw.</span>`;
  const recap = document.createElement('div');
  recap.className = 'sf-debrief-recap';
  for (const line of buildRecapLines()) {
    const p = document.createElement('div');
    p.className = 'sf-debrief-line';
    p.textContent = line;
    recap.appendChild(p);
  }
  panel.append(head, recap);

  // Go deeper — the consequences are real things you can read, not just a list.
  const explore = document.createElement('div');
  explore.className = 'sf-overlay-actions';
  if (m && m.newsTier !== 'none') {
    explore.appendChild(ovBtn('Read the coverage →', () => navigate('signalwatch.net')));
  }
  if (m && m.interceptFired) {
    explore.appendChild(ovBtn('Read the intercept →', () => { debriefView = 'intercept'; refreshOverlay(); }));
  }
  if (explore.childElementCount) panel.appendChild(explore);

  const actions = document.createElement('div');
  actions.className = 'sf-overlay-actions';
  actions.append(
    ovBtn('Make more changes', () => st.onMore(), true),
    ovBtn('Leave it like this', () => st.onLeave()),
  );
  panel.appendChild(actions);
  container.appendChild(panel);
}
