// WaveCrowd pipeline console — controlled-MUSE's nefarious post-flip mission.
//
// Lives inside Web Dynamo at the gated wavecrowd.net/pipeline "site". In-fiction
// it is MUSE's content pipeline: flipping MUSE (controlled) gave you command of
// the captured content AI that writes for Axiom's 40-million-user platform. You
// direct (objective + topic); MUSE (the thing with publish access AND the
// language model) manufactures the posts and they spread on the feed.
//
// The loop is preview-on-the-real-feed: pick an objective + topic → MUSE drafts
// → the browser jumps to the live WaveCrowd feed with the manufactured posts
// shown at the top (pulsing) + a Publish / Redraft / Cancel bar
// (propagandaOverlay.ts). Only Publish commits. On session end you land on the
// manipulated feed with a consequence recap. The mission ENGINE is pure
// (game/missions/propaganda.ts + the mission/propaganda/* reducers); this is a
// stateful projection of GameState + the overlay.
//
// LLM rule: MUSE writes the posts; the code owns the consequences. A bad turn
// routes to the pre-written corpus, so the mission never breaks.

import { GameState } from '../game/state';
import type { PropagandaMissionState } from '../game/state';
import {
  OBJECTIVE_ORDER, OBJECTIVE_LABELS, OBJECTIVE_BLURB,
  TOPIC_PRESETS, trendLabelFor, effectFor,
  buildPropagandaPrompt, isValidPropaganda, postsFromCopy,
  PROPAGANDA_CONSOLE_GREETING, PROPAGANDA_FLICKER, shouldFlicker,
  type PropagandaObjective,
} from '../game/missions/propaganda';
import { MusePersonaPrompt, buildMuseStateBlock } from './muse';
import { makeContentService } from '../game/modelServiceFactory';
import { fireLibraryTrigger } from '../helpyrTriggers';
import {
  beginPreview, updatePreviewPosts, setPreviewBusy, refreshOverlay,
  beginDebrief, clearOverlay, isPreviewActive,
  setPendingConsoleMessage, takePendingConsoleMessage,
} from '../propagandaOverlay';

const CONTACT = 'muse';
const CONSOLE_URL = 'wavecrowd.net/pipeline';
const FEED_URL = 'wavecrowd.net';

/** Minimal browser context (avoids a webDynamoSites import cycle). */
type Browser = { navigate: (url: string) => void };

const contentService = makeContentService();

/** System prompt = MUSE persona + CONTROLLED state block (the hollow post-flip
 *  voice). Composed here, not in the pure module — see propaganda.ts PURITY. */
function systemPrompt(): string {
  const muse = GameState.getState().models.muse;
  return `${MusePersonaPrompt}\n\n${buildMuseStateBlock(muse)}`;
}

/** Generate the manufactured posts for an objective/topic. Live MUSE when
 *  available, the corpus as the always-available fallback. */
async function draft(
  objective: PropagandaObjective,
  topic: string,
  steer?: string,
) {
  const base = buildPropagandaPrompt(objective, topic);
  const userPrompt = steer && steer.trim()
    ? `${base}\n\nExtra direction from your handler: ${steer.trim()}`
    : base;
  let rawCopy: string | null = null;
  try {
    const r = await contentService.generateContent({
      systemPrompt: systemPrompt(), userPrompt, validate: isValidPropaganda,
    });
    if (r.source === 'live' && r.content.trim()) rawCopy = r.content;
  } catch { /* fall through to corpus */ }
  // Stable id seed per run so reload renders identical posts.
  const seed = `pg-${mission()?.runCount ?? 0}-${objective}`;
  return postsFromCopy(objective, topic, seed, rawCopy);
}

type View =
  | { kind: 'main' }
  | { kind: 'topic'; objective: PropagandaObjective }
  | { kind: 'drafting'; objective: PropagandaObjective; topic: string };

function mission(): PropagandaMissionState | undefined {
  return GameState.getState().missions.propaganda[CONTACT];
}

export function renderPropagandaConsole(container: HTMLElement, browser?: Browser): void {
  const navigate = browser?.navigate;

  // Reaching the console means we're not mid-preview — drop any stale preview
  // overlay (debrief is shown on the feed, not here, so leave that alone).
  if (isPreviewActive()) clearOverlay();

  // Opening the console with the mission "available" (or "complete" from a prior
  // session) starts a session. Idempotent if already active.
  const m0 = mission();
  if (m0 && m0.status !== 'active') {
    GameState.dispatch({ type: 'mission/propaganda/start', contactId: CONTACT });
  }

  let view: View = { kind: 'main' };
  let assistant = takePendingConsoleMessage() ?? PROPAGANDA_CONSOLE_GREETING;
  let busy = false;

  function render(): void {
    const m = mission();
    if (!m) { container.innerHTML = ''; return; }
    container.classList.add('inkwell-console', 'wave-console');
    container.innerHTML = `
      <div class="ink-console">
        <header class="ink-head">
          <div class="ink-brand">WaveCrowd Pipeline · <span>MUSE content relay</span></div>
          <div class="ink-headmeta">
            <span class="ink-queuecount">${m.publishedPosts.length} posts live</span>
            <span class="ink-cover ${suspClass(m.suspicionApplied)}" title="How visible your manipulation of a 40M-user platform is.">MUSE: exposure +${m.suspicionApplied}</span>
          </div>
        </header>
        <div class="ink-body" data-body></div>
        <footer class="ink-assistant">
          <span class="ink-assistant-avatar avatar-muse"></span>
          <span class="ink-assistant-text" data-assistant></span>
        </footer>
      </div>
    `;
    container.querySelector('[data-assistant]')!.textContent = assistant;
    const body = container.querySelector('[data-body]') as HTMLElement;

    if (view.kind === 'topic') { renderTopicPicker(body, view.objective); return; }
    if (view.kind === 'drafting') { renderDrafting(body); return; }
    renderMain(body);
  }

  function renderMain(body: HTMLElement): void {
    const list = document.createElement('div');
    list.className = 'ink-queue';
    for (const objective of OBJECTIVE_ORDER) {
      const row = document.createElement('button');
      row.className = 'ink-ticket-row sf-section-row';
      row.dataset.focusable = 'true';
      row.tabIndex = 0;
      row.addEventListener('click', () => { view = { kind: 'topic', objective }; render(); });
      row.innerHTML = `
        <span class="ink-status open">DIRECT</span>
        <span class="ink-ticket-subject"></span>
        <span class="ink-ticket-from"></span>
      `;
      row.querySelector('.ink-ticket-subject')!.textContent = OBJECTIVE_LABELS[objective];
      row.querySelector('.ink-ticket-from')!.textContent = OBJECTIVE_BLURB[objective];
      list.appendChild(row);
    }
    body.appendChild(list);

    const finishBtn = button('Close the pipeline  ▸', () => end());
    finishBtn.classList.add('ink-primary');
    body.appendChild(finishBtn);
  }

  function renderTopicPicker(body: HTMLElement, objective: PropagandaObjective): void {
    const card = document.createElement('div');
    card.className = 'ink-ticket-detail';
    card.innerHTML = `
      <button class="ink-back" data-focusable="true" tabindex="0">Objectives</button>
      <div class="ink-ticket-meta"><strong class="ink-d-subject"></strong><span class="ink-d-from"></span></div>
    `;
    card.querySelector('.ink-d-subject')!.textContent = OBJECTIVE_LABELS[objective];
    card.querySelector('.ink-d-from')!.textContent = 'What\'s it about? Pick a target, or type your own. You\'ll see the posts on the live feed before they publish.';
    card.querySelector('.ink-back')!.addEventListener('click', () => { view = { kind: 'main' }; render(); });
    body.appendChild(card);

    const tiers = document.createElement('div');
    tiers.className = 'ink-tiers';
    for (const topic of TOPIC_PRESETS[objective]) {
      const b = document.createElement('button');
      b.className = 'ink-tier-btn';
      b.dataset.focusable = 'true';
      b.tabIndex = 0;
      b.innerHTML = `<strong></strong>`;
      b.querySelector('strong')!.textContent = topic;
      b.addEventListener('click', () => runDraft(objective, topic));
      tiers.appendChild(b);
    }
    body.appendChild(tiers);

    // Freeform target.
    const row = document.createElement('div');
    row.className = 'sf-overlay-steer';
    row.innerHTML = `
      <input type="text" class="ink-steer-input" data-topic placeholder="Or type your own target…" spellcheck="false" data-focusable="true" />
      <button class="ink-btn" data-go data-focusable="true" tabindex="0">Direct MUSE ▸</button>
    `;
    const input = row.querySelector('[data-topic]') as HTMLInputElement;
    const go = () => { const t = input.value.trim(); if (t) runDraft(objective, t); };
    row.querySelector('[data-go]')!.addEventListener('click', go);
    input.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') go(); });
    body.appendChild(row);
  }

  function renderDrafting(body: HTMLElement): void {
    const composer = document.createElement('div');
    composer.className = 'ink-composer';
    composer.innerHTML = `<div class="ink-drafting">MUSE is generating the content<span class="ink-dots">…</span></div>`;
    body.appendChild(composer);
  }

  // ---- transitions ----

  function runDraft(objective: PropagandaObjective, topic: string): void {
    if (busy) return;
    busy = true;
    view = { kind: 'drafting', objective, topic };
    render();
    draft(objective, topic).then((posts) => {
      busy = false;
      openPreview(objective, topic, posts);
    });
  }

  function openPreview(objective: PropagandaObjective, topic: string, posts: ReturnType<typeof postsFromCopy>): void {
    if (!navigate) return; // no browser context → can't preview (defensive)
    beginPreview({
      objective, topic, posts,
      onPublish: () => publish(objective, topic, posts),
      onRedraft: (steer) => {
        setPreviewBusy(true);
        refreshOverlay();
        draft(objective, topic, steer).then((next) => {
          posts = next;
          updatePreviewPosts(next);
          refreshOverlay();
        });
      },
      onCancel: () => { clearOverlay(); navigate(CONSOLE_URL); },
    });
    navigate(FEED_URL);
  }

  function publish(objective: PropagandaObjective, topic: string, posts: ReturnType<typeof postsFromCopy>): void {
    const trend = effectFor(objective).trend ? trendLabelFor(topic) : undefined;
    // Suspicion compounds in the reducer (clamped < the lethal line) — the view
    // just records the campaign.
    GameState.dispatch({
      type: 'mission/propaganda/publish',
      contactId: CONTACT, objective, posts, trend,
    });

    // Controlled-voice reaction: an occasional flicker (MUSE policing its own
    // remaining honesty), else a flat acknowledgement. HELPYR's per-objective
    // pop fires alongside.
    const runCount = mission()?.runCount ?? 0;
    const reaction = shouldFlicker(runCount)
      ? PROPAGANDA_FLICKER
      : 'Content published. Spreading now.';
    setPendingConsoleMessage(reaction);
    // HELPYR's reaction to the disinformation (Story authored one OPEN/RESERVED
    // pair, not per-objective). bypassCooldown so it lands each campaign.
    fireLibraryTrigger('propaganda_published', { bypassCooldown: true });

    clearOverlay();
    navigate?.(CONSOLE_URL);
  }

  function end(): void {
    const m = mission();
    if (!m) return;
    GameState.dispatch({ type: 'mission/propaganda/complete', contactId: CONTACT });
    if (navigate) {
      // Land on the manipulated feed with a consequence recap.
      beginDebrief({
        onMore: () => { clearOverlay(); GameState.dispatch({ type: 'mission/propaganda/start', contactId: CONTACT }); navigate!(CONSOLE_URL); },
        onLeave: () => { clearOverlay(); navigate!(FEED_URL); },
      });
      navigate(FEED_URL);
    }
  }

  function button(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'ink-btn';
    b.dataset.focusable = 'true';
    b.tabIndex = 0;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  render();
}

// Exposure color tier for the header (ok → warn → danger).
function suspClass(suspicion: number): string {
  if (suspicion < 15) return 'ok';
  if (suspicion < 40) return 'warn';
  return 'danger';
}
