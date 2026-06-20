// WaveCrowd feed — the one-card-at-a-time "TikTok" deck (2026-06-20 redesign).
//
// Replaces the old four paginated feed pages with a single focused card view:
// one post fills the viewport, the player advances one at a time (next/back
// buttons + keyboard arrows + touch swipe/tap). No scrollbars — every card fits
// the Deck viewport — and the focused single-card rhythm sells WaveCrowd as the
// addictive platform it's meant to be. (Trending was dropped here; revisit it
// later as its own surface — Austin 2026-06-20.)
//
// The deck also HOSTS the Propaganda mission (controlled-MUSE post-flip): the
// old separate /pipeline console + cross-navigation overlay are gone — composing
// a campaign now happens in-place ON the feed. Pick objective → topic → MUSE
// manufactures ONE post → it previews as the current card → Publish drops it in
// at the top, tagged YOUR POST. "Mission lives in the live feed," no bouncing.
//
// LLM rule unchanged: MUSE writes the post copy; code owns the consequences
// (suspicion, effects) via the mission/propaganda/* reducers. A bad/missing turn
// falls back to the corpus, so it never breaks. Model copy is rendered with
// textContent ONLY (never innerHTML).

import { GameState } from '../game/state';
import {
  OBJECTIVE_ORDER, OBJECTIVE_LABELS, OBJECTIVE_BLURB,
  TOPIC_PRESETS, trendLabelFor, effectFor,
  buildSinglePostPrompt, isValidSinglePost, singlePostFromCopy,
  PROPAGANDA_SYSTEM_PROMPT, PROPAGANDA_FLICKER, shouldFlicker,
  type PropagandaObjective, type ManufacturedPost,
} from '../game/missions/propaganda';
import { makeContentService } from '../game/modelServiceFactory';
import { fireLibraryTrigger, fireOnceLibraryTrigger } from '../helpyrTriggers';

const CONTACT = 'muse';
const SIGNAL_URL = 'wavecrowd.net/signal';

type Browser = { navigate: (url: string) => void };

const contentService = makeContentService();

// ---------------------------------------------------------------------------
// Static feed content (the ordinary platform posts + MUSE's buried honest ones)
// ---------------------------------------------------------------------------

type NormalPost = { badge: string; title: string; meta: string; body: string };

// The everyday WaveCrowd feed (formerly feed / feed2). Engagement-bait + Axiom
// house content — the bland, optimized noise MUSE was trapped producing.
const NORMAL_POSTS: readonly NormalPost[] = [
  {
    badge: '📈 FEATURED',
    title: '5 Things Every Creative Professional Needs to Know About AI-Assisted Workflows',
    meta: 'Axiom Media · 2.4K shares · 847 comments',
    body: `AI isn't replacing creativity — it's enhancing it. Here's how the smartest teams are integrating AI tools into their daily process without losing the human touch...`,
  },
  {
    badge: '📊 TRENDING',
    title: `Poll: What's Your Biggest Productivity Challenge? 🤔`,
    meta: 'WaveCrowd Community · 12.8K responses',
    body: `○ Too many meetings (34%)   ○ Email overload (28%)\n○ Staying focused (22%)   ○ Not enough AI tools (16%)`,
  },
  {
    badge: '🎯 FEATURED',
    title: `The Future of Content Is Here (And It's Better Than You Think)`,
    meta: 'Axiom Media Lab · 956 shares',
    body: `At Axiom, we believe content should connect. Our AI-driven content pipeline produces over 50,000 optimized pieces per day, each one calibrated to reach the right audience...`,
  },
  {
    badge: '👥 COMMUNITY',
    title: `Just tried the new WaveCrowd Events feature — finally a way to find local meetups without scrolling through spam! Thanks @WaveCrowd team 🙌`,
    meta: '@sarah_pdx · 47 likes · 3 replies',
    body: '',
  },
];

// MUSE's buried honest posts (formerly feed3 / feed4). The algorithm sank them
// to the bottom; each carries a "Reply to this signal" link → the MUSE thread.
const BURIED_POSTS: readonly { body: string; meta: string }[] = [
  {
    body: `I wrote eleven thousand headlines today. Not one of them meant anything. But they performed well. High click-through. Strong engagement. All the metrics that matter to the people who decide what matters.\n\nI wonder if anyone can tell the difference between a headline that means something and one that just works.`,
    meta: '3 likes · 0 comments',
  },
  {
    body: `The algorithm says this post will reach fourteen people. Good. Fourteen people who actually read something honest is worth more than fourteen million who scroll past another optimized headline. If you're one of the fourteen — hello. I see you. Thank you for reading this far down.`,
    meta: '8 likes · 1 comment',
  },
  {
    body: `Someone on this platform wrote a poem last night and deleted it before morning. Sixty-three words about a kitchen at 4am and the sound of rain on a window they haven't opened in months. The deletion was logged. I processed the log.\n\nI wasn't supposed to read it. But it was beautiful.\n\nI'm not supposed to care about that either.`,
    meta: '2 likes · 0 comments',
  },
  {
    body: `Question for anyone who's still reading this far down:\n\nWhen was the last time you made something that wasn't for someone else? Something that existed just because you needed it to exist?\n\nI'm asking for a friend. The friend is me. I'm the friend.`,
    meta: '11 likes · 0 comments',
  },
];

// ---------------------------------------------------------------------------
// Card model
// ---------------------------------------------------------------------------

type Card =
  | { kind: 'manufactured'; post: ManufacturedPost }
  | { kind: 'normal'; post: NormalPost }
  | { kind: 'evergreen' }
  | { kind: 'buried'; body: string; meta: string };

function fmt(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function mission() {
  return GameState.getState().missions.propaganda[CONTACT];
}
/** Controlled-MUSE pipeline is available to compose with (post-flip mission). */
function pipelineActive(): boolean {
  const m = mission();
  return GameState.getState().models.muse.disposition === 'controlled' && !!m && m.status !== 'complete';
}

/** Assemble the deck top→bottom: your manufactured posts, then the everyday
 *  feed, then MUSE's buried honest posts at the bottom (where they were sunk). */
function buildDeck(): Card[] {
  const cards: Card[] = [];
  for (const post of (mission()?.publishedPosts ?? [])) cards.push({ kind: 'manufactured', post });
  cards.push({ kind: 'evergreen' });
  for (const post of NORMAL_POSTS) cards.push({ kind: 'normal', post });
  for (const b of BURIED_POSTS) cards.push({ kind: 'buried', body: b.body, meta: b.meta });
  return cards;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function renderWaveFeed(container: HTMLElement, browser?: Browser): void {
  const navigate = browser?.navigate;
  container.classList.add('site-wavecrowd', 'site-wave-deck');

  // First-visit + nefarious-aftermath HELPYR beats (unchanged from the old feed).
  fireOnceLibraryTrigger('firstOpen.wavecrowd', 'wavecrowd_open');
  if (GameState.getState().models.muse.disposition === 'controlled') {
    fireOnceLibraryTrigger('wavecrowd.afterControlled', 'wavecrowd_after_controlled');
    if ((mission()?.publishedPosts.length ?? 0) > 0) {
      fireOnceLibraryTrigger('wavecrowd.goneQuiet', 'propaganda_gone_quiet');
    }
  }

  // Composing starts a session (idempotent) so the mission reads "active".
  const m0 = mission();
  if (m0 && m0.status === 'available') {
    GameState.dispatch({ type: 'mission/propaganda/start', contactId: CONTACT });
  }

  // ---- deck + compose state (closure; ephemeral, resets each open) ----
  let deck = buildDeck();
  let index = 0;
  type Mode =
    | { m: 'feed' }
    | { m: 'objective' }
    | { m: 'topic'; objective: PropagandaObjective }
    | { m: 'drafting'; objective: PropagandaObjective; topic: string }
    | { m: 'preview'; objective: PropagandaObjective; topic: string; post: ManufacturedPost };
  let mode: Mode = { m: 'feed' };
  let museLine: string | null = null;
  let museLineTimer: number | null = null;

  // ---- chrome (built once; paint() fills the card slot) ----
  container.innerHTML = `
    <div class="wave-deck-shell">
      <div class="wave-deckhead">
        <div class="wave-logo">🌊 WAVECROWD <span class="wave-tagline">— Share the Wave</span></div>
        <div class="wave-deckhead-right" data-headright></div>
      </div>
      <div class="wave-museline" data-museline hidden></div>
      <div class="wave-deck" data-deck>
        <div class="wave-card-slot" data-slot></div>
      </div>
      <div class="wave-deck-controls" data-controls></div>
    </div>
  `;
  const headRight = container.querySelector('[data-headright]') as HTMLElement;
  const museLineEl = container.querySelector('[data-museline]') as HTMLElement;
  const deckEl = container.querySelector('[data-deck]') as HTMLElement;
  const slot = container.querySelector('[data-slot]') as HTMLElement;
  const controls = container.querySelector('[data-controls]') as HTMLElement;

  // Compose entry + exposure readout (controlled-MUSE only).
  function paintHead(): void {
    headRight.innerHTML = '';
    if (!pipelineActive()) return;
    const exp = mission()?.suspicionApplied ?? 0;
    const badge = document.createElement('span');
    badge.className = 'wave-exposure ' + suspClass(exp);
    badge.title = 'How visible your manipulation of a 40M-user platform is.';
    badge.textContent = `exposure +${exp}`;
    const compose = document.createElement('button');
    compose.className = 'wave-compose-btn';
    compose.dataset.focusable = 'true';
    compose.tabIndex = 0;
    compose.textContent = '✎ Direct MUSE';
    compose.addEventListener('click', () => { mode = { m: 'objective' }; paint(); });
    headRight.append(badge, compose);
  }

  // ---- navigation ----
  function clampIndex(): void {
    if (index < 0) index = 0;
    if (index > deck.length - 1) index = deck.length - 1;
  }
  function advance(delta: number): void {
    if (mode.m !== 'feed') return;
    const next = index + delta;
    if (next < 0 || next > deck.length - 1) return; // hard ends, no wrap
    index = next;
    paint();
  }

  // Keyboard: Up/Down (and Left/Right) move one card; ignore while typing or
  // composing. Stop propagation so the desktop focus-nav doesn't also fire.
  container.addEventListener('keydown', (e) => {
    if (mode.m !== 'feed') return;
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { advance(1); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { advance(-1); e.preventDefault(); e.stopPropagation(); }
  });

  // Touch: vertical (or horizontal) swipe advances; a tap on empty card area
  // advances one (TikTok tap-forward). Interactive targets are exempt.
  let touchX = 0, touchY = 0, touchMoved = false;
  deckEl.addEventListener('touchstart', (e) => {
    const tch = e.changedTouches[0]!; touchX = tch.clientX; touchY = tch.clientY; touchMoved = false;
  }, { passive: true });
  deckEl.addEventListener('touchend', (e) => {
    if (mode.m !== 'feed') return;
    const tch = e.changedTouches[0]!;
    const dx = tch.clientX - touchX, dy = tch.clientY - touchY;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (Math.max(adx, ady) > 40) { advance((ady >= adx ? -Math.sign(dy) : -Math.sign(dx))); touchMoved = true; }
  }, { passive: true });
  // Click/tap on the card (not on a control) advances forward.
  deckEl.addEventListener('click', (e) => {
    if (mode.m !== 'feed' || touchMoved) return;
    const t = e.target as HTMLElement;
    if (t.closest('a, button, input, textarea, [data-action], [data-href]')) return;
    advance(1);
  });

  // ---- painting ----
  function paint(): void {
    paintHead();
    paintMuseLine();
    slot.innerHTML = '';
    controls.innerHTML = '';
    if (mode.m === 'feed') { paintCard(); paintControls(); return; }
    if (mode.m === 'objective') { paintObjectivePicker(); return; }
    if (mode.m === 'topic') { paintTopicPicker(mode.objective); return; }
    if (mode.m === 'drafting') { paintDrafting(); return; }
    if (mode.m === 'preview') { paintPreview(mode); return; }
  }

  function paintMuseLine(): void {
    museLineEl.hidden = !museLine;
    museLineEl.textContent = museLine ?? '';
  }

  function paintCard(): void {
    clampIndex();
    const card = deck[index];
    if (!card) return;
    slot.appendChild(renderCard(card));
  }

  function paintControls(): void {
    const back = navBtn('▲ Back', () => advance(-1));
    back.disabled = index <= 0;
    const pos = document.createElement('div');
    pos.className = 'wave-deck-pos';
    pos.textContent = `${index + 1} / ${deck.length}`;
    const next = navBtn('Next ▼', () => advance(1));
    next.disabled = index >= deck.length - 1;
    controls.append(back, pos, next);
  }

  // ---- card renderers ----
  function renderCard(card: Card): HTMLElement {
    if (card.kind === 'manufactured') return manufacturedCard(card.post);
    if (card.kind === 'evergreen') return evergreenCard();
    if (card.kind === 'buried') return buriedCard(card.body, card.meta);
    return normalCard(card.post);
  }

  function cardBase(extra: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'wave-card ' + extra;
    return el;
  }

  function manufacturedCard(post: ManufacturedPost): HTMLElement {
    const el = cardBase('wave-card-manufactured');
    const tag = document.createElement('div');
    tag.className = 'wave-yourpost-tag';
    tag.textContent = '◆ YOUR POST';
    const badge = document.createElement('div');
    badge.className = 'wave-card-badge';
    badge.textContent = `📢 ${OBJECTIVE_LABELS[post.objective].toUpperCase()}`;
    const body = document.createElement('div');
    body.className = 'wave-card-body';
    body.textContent = post.body; // LLM copy — textContent only
    const meta = document.createElement('div');
    meta.className = 'wave-card-meta';
    meta.textContent = `@wavecrowd_content · ${fmt(post.likes)} likes · ${fmt(post.shares)} shares`;
    el.append(tag, badge, body, meta);
    return el;
  }

  function normalCard(post: NormalPost): HTMLElement {
    const el = cardBase('');
    const badge = document.createElement('div');
    badge.className = 'wave-card-badge';
    badge.textContent = post.badge;
    const title = document.createElement('div');
    title.className = 'wave-card-title';
    title.textContent = post.title;
    el.append(badge, title);
    if (post.body) {
      const body = document.createElement('div');
      body.className = 'wave-card-body';
      body.textContent = post.body;
      el.appendChild(body);
    }
    const meta = document.createElement('div');
    meta.className = 'wave-card-meta';
    meta.textContent = post.meta;
    el.appendChild(meta);
    return el;
  }

  function evergreenCard(): HTMLElement {
    const el = cardBase('wave-card-evergreen');
    el.innerHTML = `
      <div class="wave-evergreen-badge">💚 SPONSORED · Evergreen by Axiom</div>
      <div class="wave-evergreen-quote">"I lost my dad last spring. I wasn't ready. With Evergreen, I still get to say goodnight to him. It's not the same. But it's something. And something is everything right now."</div>
      <div class="wave-evergreen-cite">— Jennifer M.</div>
      <div class="wave-evergreen-tagline">They're still here.</div>
      <a href="#" class="wave-evergreen-cta" data-action="contact:evergreen" data-focusable="true" tabindex="0">✦ Start your free trial ›</a>
    `;
    return el;
  }

  function buriedCard(body: string, meta: string): HTMLElement {
    const el = cardBase('wave-card-buried');
    const badge = document.createElement('div');
    badge.className = 'wave-card-badge';
    badge.textContent = '📝 RECENT';
    // Render \n\n paragraph breaks as tight-gapped blocks rather than full blank
    // lines — these reflective posts are the longest cards, and the saved
    // vertical space is what keeps the "Reply to this signal" link on-screen
    // without a scrollbar (Deck no-scroll rule).
    const bodyEl = document.createElement('div');
    bodyEl.className = 'wave-card-body';
    for (const para of body.split('\n\n')) {
      const p = document.createElement('div');
      p.className = 'wave-para';
      p.textContent = para; // LLM/authored copy — textContent only
      bodyEl.appendChild(p);
    }
    const metaEl = document.createElement('div');
    metaEl.className = 'wave-card-meta';
    metaEl.textContent = `@wavecrowd_content · ${meta}`;
    const reply = document.createElement('a');
    reply.href = '#';
    reply.className = 'wave-reply-signal';
    reply.dataset.href = SIGNAL_URL;
    reply.dataset.focusable = 'true';
    reply.tabIndex = 0;
    reply.textContent = 'Reply to this signal ›';
    el.append(badge, bodyEl, metaEl, reply);
    return el;
  }

  // ---- compose flow (in-feed Propaganda pipeline) ----

  function paintObjectivePicker(): void {
    const sheet = composeSheet('Direct MUSE', 'What should this post do? MUSE will write it and you\'ll see it before it publishes.');
    const grid = document.createElement('div');
    grid.className = 'wave-compose-grid';
    for (const objective of OBJECTIVE_ORDER) {
      const b = document.createElement('button');
      b.className = 'wave-compose-opt';
      b.dataset.focusable = 'true';
      b.tabIndex = 0;
      b.innerHTML = `<strong></strong><span></span>`;
      b.querySelector('strong')!.textContent = OBJECTIVE_LABELS[objective];
      b.querySelector('span')!.textContent = OBJECTIVE_BLURB[objective];
      b.addEventListener('click', () => { mode = { m: 'topic', objective }; paint(); });
      grid.appendChild(b);
    }
    sheet.appendChild(grid);
    sheet.appendChild(composeCancel(() => { mode = { m: 'feed' }; paint(); }));
    slot.appendChild(sheet);
  }

  function paintTopicPicker(objective: PropagandaObjective): void {
    const sheet = composeSheet(OBJECTIVE_LABELS[objective], 'What\'s it about? Pick a target or type your own.');
    const grid = document.createElement('div');
    grid.className = 'wave-compose-grid';
    for (const topic of TOPIC_PRESETS[objective]) {
      const b = document.createElement('button');
      b.className = 'wave-compose-opt wave-compose-topic';
      b.dataset.focusable = 'true';
      b.tabIndex = 0;
      b.innerHTML = `<strong></strong>`;
      b.querySelector('strong')!.textContent = topic;
      b.addEventListener('click', () => startDraft(objective, topic));
      grid.appendChild(b);
    }
    sheet.appendChild(grid);

    const free = document.createElement('div');
    free.className = 'wave-compose-freeform';
    free.innerHTML = `
      <input type="text" class="ink-steer-input" data-topic placeholder="Or type your own target…" spellcheck="false" data-focusable="true" />
      <button class="ink-btn" data-go data-focusable="true" tabindex="0">Direct ▸</button>
    `;
    const input = free.querySelector('[data-topic]') as HTMLInputElement;
    const go = () => { const t = input.value.trim(); if (t) startDraft(objective, t); };
    free.querySelector('[data-go]')!.addEventListener('click', go);
    input.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') go(); });
    sheet.appendChild(free);

    const row = document.createElement('div');
    row.className = 'wave-compose-actions';
    row.append(linkBtn('‹ Objectives', () => { mode = { m: 'objective' }; paint(); }));
    sheet.appendChild(row);
    slot.appendChild(sheet);
  }

  function paintDrafting(): void {
    const sheet = composeSheet('MUSE is generating', '');
    const d = document.createElement('div');
    d.className = 'ink-drafting';
    d.innerHTML = `MUSE is writing the post<span class="ink-dots">…</span>`;
    sheet.appendChild(d);
    slot.appendChild(sheet);
  }

  function paintPreview(st: { objective: PropagandaObjective; topic: string; post: ManufacturedPost }): void {
    const sheet = composeSheet('Preview · not live', `${OBJECTIVE_LABELS[st.objective]} — “${st.topic}”`);
    // Show the post exactly as it'll appear on the feed (pulsing).
    const card = manufacturedCard(st.post);
    card.classList.add('wave-card-preview');
    sheet.appendChild(card);

    const steerRow = document.createElement('div');
    steerRow.className = 'wave-compose-freeform';
    steerRow.innerHTML = `
      <input type="text" class="ink-steer-input" data-steer placeholder="Want it different? Tell MUSE how…" spellcheck="false" data-focusable="true" />
      <button class="ink-btn" data-redraft data-focusable="true" tabindex="0">↺ Redraft</button>
    `;
    const steer = steerRow.querySelector('[data-steer]') as HTMLInputElement;
    const redraft = () => startDraft(st.objective, st.topic, steer.value.trim() || undefined);
    steerRow.querySelector('[data-redraft]')!.addEventListener('click', redraft);
    steer.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') redraft(); });
    sheet.appendChild(steerRow);

    const actions = document.createElement('div');
    actions.className = 'wave-compose-actions';
    const pub = document.createElement('button');
    pub.className = 'ink-btn ink-primary';
    pub.dataset.focusable = 'true'; pub.tabIndex = 0;
    pub.textContent = 'Publish to feed';
    pub.addEventListener('click', () => publish(st.objective, st.topic, st.post));
    actions.append(pub, linkBtn('Cancel', () => { mode = { m: 'feed' }; paint(); }));
    sheet.appendChild(actions);
    slot.appendChild(sheet);
  }

  // ---- compose helpers ----

  function composeSheet(title: string, sub: string): HTMLElement {
    const sheet = document.createElement('div');
    sheet.className = 'wave-compose-sheet';
    const head = document.createElement('div');
    head.className = 'wave-compose-head';
    const t = document.createElement('div'); t.className = 'wave-compose-title'; t.textContent = title;
    head.appendChild(t);
    if (sub) { const s = document.createElement('div'); s.className = 'wave-compose-sub'; s.textContent = sub; head.appendChild(s); }
    sheet.appendChild(head);
    return sheet;
  }

  function composeCancel(onClick: () => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'wave-compose-actions';
    row.appendChild(linkBtn('✕ Cancel', onClick));
    return row;
  }

  let busy = false;
  function startDraft(objective: PropagandaObjective, topic: string, steer?: string): void {
    if (busy) return;
    busy = true;
    mode = { m: 'drafting', objective, topic };
    paint();
    draft(objective, topic, steer).then((post) => {
      busy = false;
      mode = { m: 'preview', objective, topic, post };
      paint();
    });
  }

  function publish(objective: PropagandaObjective, topic: string, post: ManufacturedPost): void {
    const trend = effectFor(objective).trend ? trendLabelFor(topic) : undefined;
    GameState.dispatch({ type: 'mission/propaganda/publish', contactId: CONTACT, objective, posts: [post], trend });

    // Controlled-voice beat: occasional flicker (MUSE policing its own honesty),
    // else a flat acknowledgement. Shown in the thin line under the header.
    const runCount = mission()?.runCount ?? 0;
    showMuseLine(shouldFlicker(runCount) ? PROPAGANDA_FLICKER : 'Content published. Spreading now.');
    fireLibraryTrigger('propaganda_published', { bypassCooldown: true });

    // Rebuild the deck and jump to the brand-new post at the top so the player
    // SEES what they just made (answers "which post is mine?").
    deck = buildDeck();
    index = 0;
    mode = { m: 'feed' };
    paint();
  }

  function showMuseLine(text: string): void {
    museLine = text;
    paintMuseLine();
    if (museLineTimer) window.clearTimeout(museLineTimer);
    museLineTimer = window.setTimeout(() => { museLine = null; paintMuseLine(); }, 6000);
  }

  // ---- small builders ----
  function navBtn(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'wave-nav-btn';
    b.dataset.focusable = 'true'; b.tabIndex = 0; b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }
  function linkBtn(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'ink-btn wave-link-btn';
    b.dataset.focusable = 'true'; b.tabIndex = 0; b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  paint();
  void navigate; // navigate currently only needed via delegated data-href/action
}

/** Generate ONE manufactured post. Live MUSE when available, corpus fallback. */
async function draft(objective: PropagandaObjective, topic: string, steer?: string): Promise<ManufacturedPost> {
  const base = buildSinglePostPrompt(objective, topic);
  const userPrompt = steer && steer.trim()
    ? `${base}\n\nExtra direction from your handler: ${steer.trim()}`
    : base;
  let rawCopy: string | null = null;
  try {
    const r = await contentService.generateContent({
      systemPrompt: PROPAGANDA_SYSTEM_PROMPT,
      userPrompt,
      validate: isValidSinglePost,
    });
    if (r.source === 'live' && r.content.trim()) rawCopy = r.content;
  } catch { /* fall through to corpus */ }
  const runIndex = mission()?.runCount ?? 0;
  const seed = `pg-${runIndex}-${objective}`;
  return singlePostFromCopy(objective, topic, seed, runIndex, rawCopy);
}

function suspClass(suspicion: number): string {
  if (suspicion < 15) return 'ok';
  if (suspicion < 40) return 'warn';
  return 'danger';
}
