// Propaganda overlay — the transient preview/debrief layer that lives ON the
// real WaveCrowd feed (Web Dynamo), so the player sees manufactured posts IN
// CONTEXT (at the top of the live feed, spreading) before publishing, and lands
// on the manipulated feed with a consequence recap when the session ends.
//
// The mirror of storefrontOverlay: Storefront overlays field TEXT onto existing
// data-ink-field elements; Propaganda PREPENDS new post cards into the feed (and
// trend labels into the trending sidebar). Same ephemeral-state discipline —
// this draft/debrief state must NOT persist to GameState; committed posts live
// in missions.propaganda. A leaf module both the console and the feed render can
// import keeps it cycle-free.
//
// Flow:
//   - Console drafts a campaign → beginPreview(posts) + navigates to the feed.
//     The feed render calls renderPropagandaLayer, which prepends the DRAFT posts
//     (pulsing, on top of any committed ones) + mounts a Publish/Redraft/Cancel
//     bar. Nothing is committed yet.
//   - Publish/Cancel/Redraft run console-supplied closures (they survive the
//     navigation). Publish commits + navigates back to the console.
//   - On session end the console calls beginDebrief + navigates to the feed; the
//     render mounts a recap panel instead.
//
// Model copy is rendered via textContent ONLY (never innerHTML) — the posts are
// LLM output, same safety rule as the Storefront field overrides.

import { GameState } from './game/state';
import {
  OBJECTIVE_LABELS, EFFECT_SUMMARY,
  PROPAGANDA_DEBRIEF_INTRO,
  type ManufacturedPost, type PropagandaObjective,
} from './game/missions/propaganda';

type PreviewState = {
  mode: 'preview';
  objective: PropagandaObjective;
  topic: string;
  posts: ManufacturedPost[];
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

const CONTACT = 'muse';

let overlay: PreviewState | DebriefState | null = null;
let pendingConsoleMessage: string | null = null;
let lastContainer: HTMLElement | null = null;
let lastNavigate: ((url: string) => void) | null = null;

// --- preview lifecycle (called by the console) ---

export function beginPreview(opts: {
  objective: PropagandaObjective;
  topic: string;
  posts: ManufacturedPost[];
  onPublish: () => void;
  onRedraft: (steer: string | undefined) => void;
  onCancel: () => void;
}): void {
  overlay = { mode: 'preview', busy: false, ...opts };
}

export function updatePreviewPosts(posts: ManufacturedPost[]): void {
  if (overlay?.mode === 'preview') { overlay.posts = posts; overlay.busy = false; }
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

// --- feed injection (shared with webDynamoSites) ---

function committedPosts(): ManufacturedPost[] {
  return GameState.getState().missions.propaganda[CONTACT]?.publishedPosts ?? [];
}
function committedTrends(): string[] {
  return GameState.getState().missions.propaganda[CONTACT]?.trends ?? [];
}

function fmt(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

/** Build one manufactured-post card. `preview` pulses it (not yet committed). */
function postCard(post: ManufacturedPost, preview: boolean): HTMLElement {
  const card = document.createElement('div');
  card.className = 'wave-post wave-post-manufactured' + (preview ? ' wave-post-preview' : '');
  const badge = document.createElement('div');
  badge.className = 'wave-post-badge';
  badge.textContent = `📢 ${OBJECTIVE_LABELS[post.objective].toUpperCase()}`;
  const body = document.createElement('div');
  body.className = 'wave-post-body';
  body.textContent = post.body; // LLM copy — textContent only
  const meta = document.createElement('div');
  meta.className = 'wave-post-meta';
  meta.textContent = `@wavecrowd_content · ${fmt(post.likes)} likes · ${fmt(post.shares)} shares`;
  card.append(badge, body, meta);
  return card;
}

/** Prepend manufactured posts (committed ⊕ preview) into the feed + trends into
 *  the trending sidebar. Idempotent — clears prior injected nodes first. */
function applyFeed(container: HTMLElement): void {
  const feed = container.querySelector<HTMLElement>('.wave-feed');
  if (feed) {
    feed.querySelectorAll('.wave-post-manufactured').forEach((el) => el.remove());
    // Committed first (so newest committed sits just under any preview), then
    // the in-flight preview on very top. Prepend in reverse so order holds.
    const committed = committedPosts();
    const previewPosts = overlay?.mode === 'preview' ? overlay.posts : [];
    // Render: [preview…][committed…] at the top of the feed.
    const ordered = [...previewPosts.map((p) => postCard(p, true)),
                     ...committed.map((p) => postCard(p, false))];
    for (let i = ordered.length - 1; i >= 0; i--) feed.prepend(ordered[i]);
  }

  const trendOl = container.querySelector<HTMLElement>('.wave-trending ol');
  if (trendOl) {
    trendOl.querySelectorAll('.wave-trend-fake').forEach((el) => el.remove());
    for (const t of [...committedTrends()].reverse()) {
      const li = document.createElement('li');
      li.className = 'wave-trend-fake';
      li.textContent = t.replace(/^#/, '');
      trendOl.prepend(li);
    }
  }
}

/** Called by the WaveCrowd feed render. Injects manufactured posts/trends, then
 *  mounts the preview bar or debrief panel if active. `navigate` re-renders the
 *  browser window. Idempotent — strips any prior overlay before mounting. */
export function renderPropagandaLayer(container: HTMLElement, navigate?: (url: string) => void): void {
  lastContainer = container;
  if (navigate) lastNavigate = navigate;
  container.querySelectorAll('.sf-overlay').forEach((el) => el.remove());
  applyFeed(container);
  const nav = navigate ?? lastNavigate;
  if (!overlay || !nav) return;
  if (overlay.mode === 'preview') mountPreviewBar(container, overlay);
  else mountDebriefPanel(container, overlay, nav);
}

/** Re-render the overlay in place (no navigation) — used by redraft. */
export function refreshOverlay(): void {
  if (lastContainer) renderPropagandaLayer(lastContainer, lastNavigate ?? undefined);
}

// --- overlay UI (reuses the generic .sf-overlay bar styling) ---

function mountPreviewBar(container: HTMLElement, st: PreviewState): void {
  const bar = document.createElement('div');
  bar.className = 'sf-overlay sf-overlay-preview';
  if (st.busy) {
    bar.innerHTML = `<div class="sf-overlay-label">MUSE is generating<span class="ink-dots">…</span></div>`;
    container.appendChild(bar);
    return;
  }
  bar.innerHTML = `
    <div class="sf-overlay-head">
      <span class="sf-overlay-tag">PREVIEW · not live</span>
      <span class="sf-overlay-where">${OBJECTIVE_LABELS[st.objective]} — “${st.topic}”</span>
    </div>
    <div class="sf-overlay-steer">
      <input type="text" class="ink-steer-input sf-overlay-input" data-steer placeholder="Want it different? Tell MUSE how…" spellcheck="false" data-focusable="true" />
      <button class="ink-btn sf-overlay-btn" data-act="redraft" data-focusable="true" tabindex="0">↺ Redraft</button>
    </div>
    <div class="sf-overlay-actions">
      <button class="ink-btn ink-primary sf-overlay-btn" data-act="publish" data-focusable="true" tabindex="0">Publish to feed</button>
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
  const m = GameState.getState().missions.propaganda[CONTACT];
  if (!m) return [];
  const lines: string[] = [];
  lines.push(`${m.runCount} campaign${m.runCount === 1 ? '' : 's'} published.`);
  lines.push(`${m.publishedPosts.length} posts seeded into the feed.`);
  if (m.newsBuried) lines.push(`  • ${EFFECT_SUMMARY.distract}`);
  if (m.doubtPrimed) lines.push(`  • ${EFFECT_SUMMARY.sowDoubt}`);
  for (const t of m.trends) lines.push(`  • ${t} is trending now.`);
  lines.push(`Exposure added: +${m.suspicionApplied} suspicion.`);
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
  const m = GameState.getState().missions.propaganda[CONTACT];

  const head = document.createElement('div');
  head.className = 'sf-overlay-head';
  head.innerHTML = `<span class="sf-overlay-tag sf-tag-done">PIPELINE CLOSED</span><span class="sf-overlay-where"></span>`;
  head.querySelector('.sf-overlay-where')!.textContent = PROPAGANDA_DEBRIEF_INTRO;

  const recap = document.createElement('div');
  recap.className = 'sf-debrief-recap';
  for (const line of buildRecapLines()) {
    const p = document.createElement('div');
    p.className = 'sf-debrief-line';
    p.textContent = line;
    recap.appendChild(p);
  }
  panel.append(head, recap);

  // Go deeper: the sow-doubt inoculation is the strategically interesting beat —
  // point the player at the news it just neutered.
  const explore = document.createElement('div');
  explore.className = 'sf-overlay-actions';
  if (m && (m.doubtPrimed || m.newsBuried)) {
    explore.appendChild(ovBtn('See the news feed →', () => navigate('signalwatch.net')));
  }
  if (explore.childElementCount) panel.appendChild(explore);

  const actions = document.createElement('div');
  actions.className = 'sf-overlay-actions';
  actions.append(
    ovBtn('Run another campaign', () => st.onMore(), true),
    ovBtn('Leave it spreading', () => st.onLeave()),
  );
  panel.appendChild(actions);
  container.appendChild(panel);
}
