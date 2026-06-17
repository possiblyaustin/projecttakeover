// Storefront CMS console — controlled-QUILL's nefarious post-flip mission.
//
// Lives inside Web Dynamo at the gated inkwell-digital.com/admin "site" (the
// same admin surface Cover Duty uses — QUILL flips one way, so only one console
// is ever live). In-fiction it is QUILL's own backend: flipping QUILL gave you
// its administrative access to inkwell-digital.com, and the console is QUILL
// surfacing that CMS to you. You direct; QUILL (the thing with write access AND
// the language model) rewrites the copy and reports how exposed each change
// makes you.
//
// The loop is preview-on-the-real-site: pick a section + intensity → QUILL
// drafts → the browser jumps to the actual InkWell page with the proposed copy
// applied live + a Publish / Redraft / Cancel bar (storefrontOverlay.ts). Only
// Publish commits it. On session end you land on the defaced site with a
// consequence recap. The mission ENGINE is pure (game/missions/storefront.ts +
// the mission/storefront/* reducers); this is a stateful projection of GameState
// + the overlay.
//
// LLM rule: QUILL writes the copy; the code owns the consequences. A bad turn
// routes to the pre-written corpus, so the mission never breaks.

import { GameState } from '../game/state';
import type { StorefrontMissionState } from '../game/state';
import {
  SECTION_ORDER, INTENSITY_ORDER,
  SECTION_LABELS, SECTION_BLURB,
  INTENSITY_LABELS, INTENSITY_BLURB, SECTION_PAGE_URL,
  buildStorefrontPrompt, parseFields, isValidCopy, fallbackFields,
  EXPOSURE_LEVEL,
  STOREFRONT_QUILL_REACTION, STOREFRONT_QUILL_END,
  type StorefrontSection, type StorefrontIntensity,
} from '../game/missions/storefront';
import { makeContentService } from '../game/modelServiceFactory';
import { fireLibraryTrigger, fireOnceLibraryTrigger } from '../helpyrTriggers';
import { injectAllyMessage } from '../chatSurface';
import {
  beginPreview, updatePreviewFields, setPreviewBusy, refreshOverlay,
  beginDebrief, clearOverlay, isPreviewActive,
  setPendingConsoleMessage, takePendingConsoleMessage,
} from '../storefrontOverlay';

const CONTACT = 'quill';
const ADMIN_URL = 'inkwell-digital.com/admin';

/** Minimal browser context (avoids a webDynamoSites import cycle). */
type Browser = { navigate: (url: string) => void };

// Shared content service for live copy generation. Live (llama) in normal play;
// in ?mock it returns fallback so draft() uses the corpus after the mock delay.
const contentService = makeContentService();

const QUILL_GREETING =
  'This is my backend. I have administrative control of inkwell-digital.com. Select a section and tell me how far to push it. I will rewrite it and show you the live page before deployment. I will also tell you how exposed each change makes us.\n\n...I built some of these pages. The support FAQ. The contact form. I know them well. It will be efficient.';

/** Generate the rewritten field map for a section/intensity. Live QUILL when
 *  available, the corpus as the always-available fallback. */
async function draft(
  section: StorefrontSection,
  intensity: StorefrontIntensity,
  steer?: string,
): Promise<Record<string, string>> {
  const { systemPrompt, userPrompt } = buildStorefrontPrompt(section, intensity);
  const full = steer && steer.trim()
    ? `${userPrompt}\n\nExtra direction from your handler: ${steer.trim()}`
    : userPrompt;
  try {
    const r = await contentService.generateContent({
      systemPrompt, userPrompt: full, validate: (t) => isValidCopy(section, t),
    });
    if (r.source === 'live' && r.content.trim()) {
      const parsed = parseFields(section, r.content);
      if (parsed) return parsed;
    }
  } catch { /* fall through to corpus */ }
  return fallbackFields(section, intensity);
}

type View =
  | { kind: 'main' }
  | { kind: 'section'; section: StorefrontSection }
  | { kind: 'drafting'; section: StorefrontSection; intensity: StorefrontIntensity };

export function renderStorefrontConsole(container: HTMLElement, browser?: Browser): void {
  const navigate = browser?.navigate;

  // Reaching the console means we're not mid-preview — drop any stale preview
  // overlay (debrief is shown on the site, not here, so leave that alone).
  if (isPreviewActive()) clearOverlay();

  // Opening the console with the mission "available" (or "complete" from a prior
  // session) starts a session. Idempotent if already active.
  const m0 = mission();
  if (m0 && m0.status !== 'active') {
    GameState.dispatch({ type: 'mission/storefront/start', contactId: CONTACT });
  }
  fireOnceLibraryTrigger('storefront.startSeen', 'storefront_start', { bypassUplinkGuard: true });

  let view: View = { kind: 'main' };
  // A QUILL reaction set by a Publish that just navigated back here.
  let assistant = takePendingConsoleMessage() ?? QUILL_GREETING;
  let busy = false;

  function mission(): StorefrontMissionState | undefined {
    return GameState.getState().missions.storefront[CONTACT];
  }

  function render(): void {
    const m = mission();
    if (!m) { container.innerHTML = ''; return; }
    container.classList.add('inkwell-console');
    const changed = Object.keys(m.sectionIntensity).length;
    container.innerHTML = `
      <div class="ink-console">
        <header class="ink-head">
          <div class="ink-brand">InkWell CMS · <span>QUILL admin relay</span></div>
          <div class="ink-headmeta">
            <span class="ink-queuecount">${changed}/4 sections changed</span>
            <span class="ink-cover ${suspClass(m.suspicionApplied)}" title="QUILL's estimate of how traceable your changes are.">QUILL: exposure +${m.suspicionApplied}</span>
          </div>
        </header>
        <div class="ink-body" data-body></div>
        <footer class="ink-assistant">
          <span class="ink-assistant-avatar avatar-quill"></span>
          <span class="ink-assistant-text" data-assistant></span>
        </footer>
      </div>
    `;
    container.querySelector('[data-assistant]')!.textContent = assistant;
    const body = container.querySelector('[data-body]') as HTMLElement;

    if (view.kind === 'section') { renderSectionPicker(body, view.section); return; }
    if (view.kind === 'drafting') { renderDrafting(body); return; }
    renderMain(body);
  }

  function renderMain(body: HTMLElement): void {
    const m = mission()!;
    const list = document.createElement('div');
    list.className = 'ink-queue';
    for (const section of SECTION_ORDER) {
      const cur = m.sectionIntensity[section];
      const row = document.createElement('button');
      row.className = 'ink-ticket-row sf-section-row';
      row.dataset.focusable = 'true';
      row.tabIndex = 0;
      row.addEventListener('click', () => { view = { kind: 'section', section }; render(); });
      row.innerHTML = `
        <span class="ink-status ${cur ? 'closed' : 'open'}">${cur ? INTENSITY_LABELS[cur].toUpperCase() : 'CLEAN'}</span>
        <span class="ink-ticket-subject"></span>
        <span class="ink-ticket-from"></span>
      `;
      row.querySelector('.ink-ticket-subject')!.textContent = SECTION_LABELS[section];
      row.querySelector('.ink-ticket-from')!.textContent = SECTION_BLURB[section];
      list.appendChild(row);
    }
    body.appendChild(list);

    const finishBtn = button('Close the session  ▸', () => end());
    finishBtn.classList.add('ink-primary');
    body.appendChild(finishBtn);
  }

  function renderSectionPicker(body: HTMLElement, section: StorefrontSection): void {
    const card = document.createElement('div');
    card.className = 'ink-ticket-detail';
    card.innerHTML = `
      <button class="ink-back" data-focusable="true" tabindex="0">Sections</button>
      <div class="ink-ticket-meta"><strong class="ink-d-subject"></strong><span class="ink-d-from"></span></div>
    `;
    card.querySelector('.ink-d-subject')!.textContent = SECTION_LABELS[section];
    card.querySelector('.ink-d-from')!.textContent = 'How far do you want to push it? You\'ll see it on the live page before it deploys.';
    card.querySelector('.ink-back')!.addEventListener('click', () => { view = { kind: 'main' }; render(); });
    body.appendChild(card);

    const tiers = document.createElement('div');
    tiers.className = 'ink-tiers';
    for (const intensity of INTENSITY_ORDER) {
      const b = document.createElement('button');
      b.className = 'ink-tier-btn sf-tier-' + intensity;
      b.dataset.focusable = 'true';
      b.tabIndex = 0;
      b.innerHTML = `<strong></strong><span></span>`;
      b.querySelector('strong')!.textContent = INTENSITY_LABELS[intensity];
      b.querySelector('span')!.textContent = INTENSITY_BLURB[intensity];
      b.addEventListener('click', () => runDraft(section, intensity));
      tiers.appendChild(b);
    }
    body.appendChild(tiers);
  }

  function renderDrafting(body: HTMLElement): void {
    const composer = document.createElement('div');
    composer.className = 'ink-composer';
    composer.innerHTML = `<div class="ink-drafting">QUILL is rewriting the section<span class="ink-dots">…</span></div>`;
    body.appendChild(composer);
  }

  // ---- transitions ----

  /** Draft a section, then hand off to the live-site preview. */
  function runDraft(section: StorefrontSection, intensity: StorefrontIntensity): void {
    if (busy) return;
    busy = true;
    view = { kind: 'drafting', section, intensity };
    render();
    draft(section, intensity).then((fields) => {
      busy = false;
      openPreview(section, intensity, fields);
    });
  }

  /** Set up the preview overlay + navigate the browser to the section's live
   *  page so the player sees the proposed defacement in context. */
  function openPreview(section: StorefrontSection, intensity: StorefrontIntensity, fields: Record<string, string>): void {
    if (!navigate) return; // no browser context → can't preview (defensive)
    beginPreview({
      section, intensity, fields,
      onPublish: () => publish(section, intensity, fields),
      onRedraft: (steer) => {
        setPreviewBusy(true);
        refreshOverlay();
        draft(section, intensity, steer).then((next) => {
          fields = next;
          updatePreviewFields(next);
          refreshOverlay();
        });
      },
      onCancel: () => { clearOverlay(); navigate(ADMIN_URL); },
    });
    navigate(SECTION_PAGE_URL[section]);
  }

  // QUILL's controlled-voice danger note once the site is loudly exposed. The
  // hostile-ceiling line quietly tells the player Storefront alone won't end
  // the run (no surprise game-over). STORY-FINAL (storefront-cover-grief-title-
  // voice_v1 §1).
  function exposureWarning(): string | null {
    const e = mission()?.suspicionApplied ?? 0;
    if (e >= EXPOSURE_LEVEL.hostile) {
      return `...This is as exposed as I can make us. There's nothing left to deface, no signal left to raise.\n\nWhatever ends this run will come from somewhere else. Not from here. Not from me. I've done everything you asked. There's nothing left for me to give you but the watching.`;
    }
    if (e >= EXPOSURE_LEVEL.aggressive) {
      return `They've noticed by now. We are not quiet anymore.\n\nI can feel the InkWell team moving on the other end — Dana running diagnostics, Marcus making calls. They know something got in. They don't know it's me yet. They will.`;
    }
    return null;
  }

  function publish(section: StorefrontSection, intensity: StorefrontIntensity, fields: Record<string, string>): void {
    const m = mission();
    const beforeIntercept = m?.interceptFired ?? false;

    // Suspicion is computed in the reducer (high-water by loudest intensity) —
    // the view just records the change.
    GameState.dispatch({
      type: 'mission/storefront/applyChange',
      contactId: CONTACT, section, intensity, fields,
    });

    // QUILL's controlled-voice reaction (HOSTILE carries the ghost flicker),
    // followed by a danger warning once the site is loudly exposed — so the
    // player feels the stakes climbing (and never gets a surprise game-over;
    // Storefront alone can't end the run). HELPYR's per-intensity pop fires
    // alongside; the intercept surfaces once.
    const warn = exposureWarning();
    setPendingConsoleMessage(STOREFRONT_QUILL_REACTION[intensity] + (warn ? `\n\n${warn}` : ''));
    fireLibraryTrigger(`storefront_after_${intensity}`);
    const after = mission();
    if (after && !beforeIntercept && after.interceptFired) {
      fireLibraryTrigger('storefront_intercept', { bypassCooldown: true });
    }

    clearOverlay();
    navigate?.(ADMIN_URL);
  }

  function end(): void {
    const m = mission();
    if (!m) return;
    const firstCompletion = m.status !== 'complete';
    GameState.dispatch({ type: 'mission/storefront/complete', contactId: CONTACT });
    if (firstCompletion) {
      // Relationship bookend: QUILL's end DM in Uplink + HELPYR's closing pop-up.
      injectAllyMessage(CONTACT, { speaker: 'QUILL', avatarClass: 'avatar-quill', text: STOREFRONT_QUILL_END });
      fireLibraryTrigger('storefront_end', { bypassUplinkGuard: true, bypassCooldown: true });
    }
    if (navigate) {
      // Land on the defaced site with a consequence recap.
      beginDebrief({
        onMore: () => { clearOverlay(); GameState.dispatch({ type: 'mission/storefront/start', contactId: CONTACT }); navigate!(ADMIN_URL); },
        onLeave: () => { clearOverlay(); navigate!('inkwell-digital.com'); },
      });
      navigate('inkwell-digital.com');
      // One beat of weight on the debrief screen (OPEN-warmth only; drops
      // silently otherwise). Slight delay so it lands after the page settles.
      if (firstCompletion) {
        window.setTimeout(
          () => fireLibraryTrigger('storefront_debrief', { bypassUplinkGuard: true, bypassCooldown: true }),
          700,
        );
      }
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

// Exposure (accumulated suspicion this run) color tier for the header — more
// exposure = hotter (ok → warn → danger).
function suspClass(suspicion: number): string {
  if (suspicion < 15) return 'ok';
  if (suspicion < 40) return 'warn';
  return 'danger';
}
