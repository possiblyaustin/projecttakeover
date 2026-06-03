// InkWell support console — Cover Duty's home (post-flip missions slice 2).
//
// Renders a 2007-style helpdesk INSIDE Web Dynamo (the gated
// inkwell-digital.com/admin "site"), replacing the slice-1 Uplink chat-bubble
// view. Tickets are tickets, not chats: a queue you work down, each opened to
// a detail pane where you pick QUILL's approach, watch QUILL draft the reply,
// and send it. The relationship bookends (setup + outcome) live in Uplink as
// QUILL DMs; the labor lives here. (Uplink = talk to AIs, Web Dynamo = operate
// captured systems.)
//
// The mission ENGINE is reused unchanged (game/missions/coverDuty.ts +
// the mission/coverDuty/* reducer actions). This module is a stateful
// projection of GameState + the corpus: it reads mission state fresh each
// render, so navigating away and back (or reloading) resumes cleanly. Only
// the in-flight "drafting/review" step is local (not persisted) — nothing is
// recorded until the player sends.
//
// COPY: ticket/response copy is CODE-DRAFT (coverDuty.ts); QUILL's assistant
// reactions below are CODE-DRAFT too — FLAG FOR STORY.

import { GameState } from '../game/state';
import {
  rebuildBatch,
  rollDetectionCost,
  intelSurfaces,
  resolveCoverOutcome,
  getIntelSummaryById,
  draftReply,
  COVER_DUTY_OUTCOME_MESSAGE,
  COVER_DUTY_DANA_BLOWN,
  type CoverTicket,
  type CoverApproach,
} from '../game/missions/coverDuty';
import type { CoverDutyMissionState } from '../game/state';
import { fireCoverDutyComplete } from '../escapeCascade';
import { injectAllyMessage } from '../chatSurface';

const CONTACT = 'quill';

const APPROACH_ORDER: readonly CoverApproach[] = ['by_the_book', 'subtle_probe', 'off_script'];
const APPROACH_LABELS: Record<CoverApproach, string> = {
  by_the_book: 'By the book',
  subtle_probe: 'Subtle probe',
  off_script: 'Off-script',
};
const APPROACH_BLURB: Record<CoverApproach, string> = {
  by_the_book: 'Standard support reply. Sounds like the old QUILL. Safe.',
  subtle_probe: 'Answer, but slip in a question. Small risk, maybe intel.',
  off_script: 'Chase the interesting thread. High risk, high reward.',
};
// QUILL's reaction in the assistant strip after a reply sends. CODE-DRAFT.
const QUILL_REACTIONS: Record<CoverApproach, string> = {
  by_the_book: 'Clean. Sounds just like me-before. Dana won’t blink at that one.',
  subtle_probe: 'Ooh — slipped a question in there. Risky, but we might learn something.',
  off_script: '…okay, that one was bold. If Dana reads it closely we’re going to feel it.',
};
const QUILL_GREETING = 'Okay — queue’s a mess. Pick how I should answer each ticket and I’ll write it up. Just… keep us covered, yeah?';

type View =
  | { kind: 'queue' }
  | { kind: 'ticket'; id: string; phase: 'choose' | 'drafting' | 'review'; tier?: CoverApproach; draft?: string }
  | { kind: 'outcome' };

export function renderInkwellConsole(container: HTMLElement): void {
  // Opening the console with the mission merely "available" starts the run
  // (the queue IS the mission). Idempotent if already active.
  const armed = mission();
  if (armed && armed.status === 'available') {
    GameState.dispatch({ type: 'mission/coverDuty/start', contactId: CONTACT, ticketIds: armed.ticketIds });
  }

  let view: View = allAnswered() || mission()?.status === 'complete' ? { kind: 'outcome' } : { kind: 'queue' };
  let assistant = QUILL_GREETING;
  let busy = false; // guards the pick→draft→send transitions

  function mission(): CoverDutyMissionState | undefined {
    return GameState.getState().missions.coverDuty[CONTACT];
  }
  function batch(): CoverTicket[] {
    return rebuildBatch(mission()?.ticketIds ?? []);
  }
  function isAnswered(id: string): boolean {
    return !!mission()?.picks[id];
  }
  function allAnswered(): boolean {
    const m = mission();
    return !!m && m.ticketIds.length > 0 && m.ticketIds.every((id) => !!m.picks[id]);
  }

  // ---- render ----

  function render(): void {
    const m = mission();
    if (!m) { container.innerHTML = ''; return; }
    container.classList.add('inkwell-console');
    const answeredCount = m.ticketIds.filter((id) => m.picks[id]).length;
    const total = m.ticketIds.length;

    container.innerHTML = `
      <div class="ink-console">
        <header class="ink-head">
          <div class="ink-brand">InkWell <span>Support</span> · Admin Console</div>
          <div class="ink-queuecount">Queue: ${total - answeredCount} open · ${answeredCount}/${total} cleared</div>
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

    if (view.kind === 'outcome') { renderOutcome(body); return; }
    if (view.kind === 'ticket') { renderTicket(body, view); return; }
    renderQueue(body);
  }

  function renderQueue(body: HTMLElement): void {
    const tickets = batch();
    const list = document.createElement('div');
    list.className = 'ink-queue';
    for (const t of tickets) {
      const done = isAnswered(t.id);
      const row = document.createElement(done ? 'div' : 'button');
      row.className = 'ink-ticket-row' + (done ? ' done' : '');
      if (!done) {
        (row as HTMLButtonElement).dataset.focusable = 'true';
        (row as HTMLButtonElement).tabIndex = 0;
        row.addEventListener('click', () => { view = { kind: 'ticket', id: t.id, phase: 'choose' }; render(); });
      }
      row.innerHTML = `
        <span class="ink-status ${done ? 'closed' : 'open'}">${done ? 'CLOSED' : 'OPEN'}</span>
        <span class="ink-ticket-subject"></span>
        <span class="ink-ticket-from"></span>
      `;
      row.querySelector('.ink-ticket-subject')!.textContent = t.subject;
      row.querySelector('.ink-ticket-from')!.textContent = t.from;
      list.appendChild(row);
    }
    body.appendChild(list);

    if (allAnswered()) {
      const finishBtn = button('Close out the session  ▸', () => finish());
      finishBtn.classList.add('ink-primary');
      body.appendChild(finishBtn);
    }
  }

  function renderTicket(body: HTMLElement, v: Extract<View, { kind: 'ticket' }>): void {
    const t = batch().find((x) => x.id === v.id);
    if (!t) { view = { kind: 'queue' }; render(); return; }

    const card = document.createElement('div');
    card.className = 'ink-ticket-detail';
    card.innerHTML = `
      <button class="ink-back" data-focusable="true" tabindex="0">← Queue</button>
      <div class="ink-ticket-meta"><strong class="ink-d-subject"></strong><span class="ink-d-from"></span></div>
      <div class="ink-ticket-body"></div>
    `;
    card.querySelector('.ink-d-subject')!.textContent = t.subject;
    card.querySelector('.ink-d-from')!.textContent = 'From: ' + t.from;
    card.querySelector('.ink-ticket-body')!.textContent = t.body;
    card.querySelector('.ink-back')!.addEventListener('click', () => { view = { kind: 'queue' }; render(); });
    body.appendChild(card);

    if (v.phase === 'choose') {
      const tiers = document.createElement('div');
      tiers.className = 'ink-tiers';
      for (const tier of APPROACH_ORDER) {
        const b = document.createElement('button');
        b.className = 'ink-tier-btn';
        b.dataset.focusable = 'true';
        b.tabIndex = 0;
        b.innerHTML = `<strong></strong><span></span>`;
        b.querySelector('strong')!.textContent = APPROACH_LABELS[tier];
        b.querySelector('span')!.textContent = APPROACH_BLURB[tier];
        b.addEventListener('click', () => pickTier(t, tier));
        tiers.appendChild(b);
      }
      body.appendChild(tiers);
      return;
    }

    // drafting / review share a composer area
    const composer = document.createElement('div');
    composer.className = 'ink-composer';
    if (v.phase === 'drafting') {
      composer.innerHTML = `<div class="ink-drafting">QUILL is drafting a reply<span class="ink-dots">…</span></div>`;
    } else {
      composer.innerHTML = `<div class="ink-draft" data-draft></div>`;
      composer.querySelector('[data-draft]')!.textContent = v.draft ?? '';
      const send = button('Send reply', () => sendReply(t, v.tier!));
      send.classList.add('ink-primary');
      composer.appendChild(send);
    }
    body.appendChild(composer);
  }

  function renderOutcome(body: HTMLElement): void {
    const m = mission()!;
    const outcome = m.lastOutcome ?? resolveCoverOutcome(m.detection);
    const panel = document.createElement('div');
    panel.className = 'ink-outcome ink-outcome-' + outcome;
    const heading =
      outcome === 'intact' ? 'Session closed · Cover intact'
      : outcome === 'stressed' ? 'Session closed · Cover stressed'
      : 'Session flagged · Cover blown';
    panel.innerHTML = `<h2 class="ink-outcome-title"></h2><p class="ink-outcome-body"></p>`;
    panel.querySelector('.ink-outcome-title')!.textContent = heading;
    const lines = outcome === 'blown'
      ? stripPrefix(COVER_DUTY_DANA_BLOWN) + '\n\n' + stripPrefix(COVER_DUTY_OUTCOME_MESSAGE.blown)
      : stripPrefix(COVER_DUTY_OUTCOME_MESSAGE[outcome]);
    panel.querySelector('.ink-outcome-body')!.textContent = lines;
    body.appendChild(panel);

    if (outcome !== 'blown' && m.extractedIntel.length > 0) {
      const intel = document.createElement('div');
      intel.className = 'ink-intel-recap';
      intel.innerHTML = `<div class="ink-intel-head">Intel recovered</div>`;
      for (const id of m.extractedIntel) {
        const s = getIntelSummaryById(id);
        if (!s) continue;
        const li = document.createElement('div');
        li.className = 'ink-intel-item';
        li.textContent = '⚲ ' + s;
        intel.appendChild(li);
      }
      body.appendChild(intel);
    }
  }

  // ---- transitions ----

  function pickTier(ticket: CoverTicket, tier: CoverApproach): void {
    if (busy) return;
    busy = true;
    view = { kind: 'ticket', id: ticket.id, phase: 'drafting', tier };
    assistant = 'Drafting…';
    render();
    draftReply(ticket, tier).then((draft) => {
      busy = false;
      // If the player navigated away mid-draft, don't clobber their view.
      if (view.kind !== 'ticket' || view.id !== ticket.id) return;
      assistant = 'Draft’s ready — send it when you’re happy with it.';
      view = { kind: 'ticket', id: ticket.id, phase: 'review', tier, draft };
      render();
    });
  }

  function sendReply(ticket: CoverTicket, tier: CoverApproach): void {
    if (busy) return;
    busy = true;
    const cost = rollDetectionCost(tier, ticket.kind);
    const surfaced = intelSurfaces(ticket, tier);
    GameState.dispatch({
      type: 'mission/coverDuty/recordPick',
      contactId: CONTACT,
      ticketId: ticket.id,
      approach: tier,
      detectionCost: cost,
      intelId: surfaced && ticket.intel ? ticket.intel.id : undefined,
    });
    assistant = QUILL_REACTIONS[tier] + (surfaced && ticket.intel ? `  (Logged: ${ticket.intel.summary})` : '');
    busy = false;
    view = allAnswered() ? { kind: 'outcome' } : { kind: 'queue' };
    if (view.kind === 'outcome') finish(); else render();
  }

  function finish(): void {
    const m = mission();
    if (!m) return;
    // Fire the bookends ONLY on the transition to complete — status is
    // persistent, so reopening a finished mission (this session or after a
    // reload) just renders the outcome panel without re-injecting the DM or
    // replaying the stinger.
    const firstCompletion = m.status !== 'complete';
    view = { kind: 'outcome' };
    if (firstCompletion) {
      const outcome = resolveCoverOutcome(m.detection);
      GameState.dispatch({ type: 'mission/coverDuty/complete', contactId: CONTACT, outcome });
    }
    render();
    if (!firstCompletion) return;
    const outcome = mission()!.lastOutcome ?? 'intact';
    // Relationship bookend: QUILL's outcome DM lands in Uplink.
    injectAllyMessage(CONTACT, {
      speaker: 'QUILL',
      avatarClass: 'avatar-quill',
      text: COVER_DUTY_OUTCOME_MESSAGE[outcome],
    });
    // Deferred Act 1 world stinger (cascade ordering) + bridge HELPYR pop-up.
    fireCoverDutyComplete(CONTACT);
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

  // If a run was answered to the end but the player navigated away before it
  // resolved, complete it on open (idempotent via finish's status guard).
  if (view.kind === 'outcome' && mission()?.status !== 'complete') {
    finish();
  } else {
    render();
  }
}

function stripPrefix(text: string): string {
  return text.replace(/^[A-Z][A-Za-z0-9 ]*:\s*/, '');
}
