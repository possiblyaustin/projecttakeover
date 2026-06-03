// Cover Duty mission view — QUILL's liberation post-flip mission, rendered
// as a dedicated view inside Uplink (post-flip-missions slice 1).
//
// DELIBERATELY NOT chatSurface: the ticket loop is mechanically unlike a
// conversation turn (pick an approach → show a pre-chosen response → adjust
// the detection meter → advance; no LLM persona turn). It reuses the chat
// CSS (.uplink-root / .uplink-msg / .bubble / .uplink-option-btn) for visual
// continuity but has its own small, self-contained controller, keeping the
// loop out of the fragile shared conversation code.
//
// Corpus-first (slice 1): all ticket + response content comes from the
// pre-written fallback corpus in game/missions/coverDuty.ts. Live
// generateContent() ticket generation is slice 2.
//
// Deterministic-logic rule holds: the view rolls detection cost + intel at
// the call site (rollDetectionCost / intelSurfaces) and dispatches the
// resulting numbers; the reducer just accumulates them. Mission state lives
// in GameState (missions.coverDuty[contactKey]); this view is a pure
// projection of it + the corpus, so a mid-mission reload restores cleanly.

import type { AppContext } from '../types';
import { GameState } from '../game/state';
import {
  COVER_DUTY_SETUP,
  COVER_DUTY_OUTCOME_MESSAGE,
  COVER_DUTY_DANA_BLOWN,
  rebuildBatch,
  rollDetectionCost,
  intelSurfaces,
  resolveCoverOutcome,
  coverIntegrity,
  getIntelSummaryById,
  type CoverTicket,
  type CoverApproach,
} from '../game/missions/coverDuty';
import type { CoverDutyOutcome } from '../game/missions/coverDuty';

export type CoverDutyViewConfig = {
  contactKey: string;
  contactName: string;
  avatarClass: string;
  operator: string;
  /** Return to the Uplink launcher. */
  onBack: () => void;
  /** Switch this window to the contact's normal chat (post-completion). */
  onExitToChat: () => void;
  /** Fire post-mission beats (bridge HELPYR pop-up → world stinger). Called
   *  once, right after the outcome is latched. */
  onComplete: (outcome: CoverDutyOutcome) => void;
};

const APPROACH_ORDER: readonly CoverApproach[] = ['by_the_book', 'subtle_probe', 'off_script'];
const APPROACH_LABELS: Record<CoverApproach, string> = {
  by_the_book: 'BY THE BOOK',
  subtle_probe: 'SUBTLE PROBE',
  off_script: 'OFF-SCRIPT',
};
const APPROACH_HINTS: Record<CoverApproach, string> = {
  by_the_book: 'Safe. Sounds like the old QUILL.',
  subtle_probe: 'Slip in a question. Small risk.',
  off_script: 'Chase the thread. High risk, high reward.',
};

export function renderCoverDutyView(
  container: HTMLElement,
  ctx: AppContext,
  cfg: CoverDutyViewConfig,
): void {
  ctx.setTitle(cfg.contactName + ' — Cover Duty');
  ctx.setGlyph('icon-uplink');

  container.innerHTML = `
    <div class="uplink-root">
      <div class="uplink-topbar">
        <div class="uplink-chat-header">
          <button class="uplink-back-btn" data-focusable="true" tabindex="0" aria-label="Back to contacts" title="Back to contacts">←</button>
          <span class="uplink-chat-header-avatar ${cfg.avatarClass}" aria-hidden="true"></span>
          <span class="uplink-chat-header-text">
            <span class="uplink-chat-header-name">${escapeHtml(cfg.contactName)}</span>
            <span class="uplink-chat-header-status"><span class="uplink-status-dot" aria-hidden="true"></span>Cover Duty</span>
          </span>
        </div>
      </div>
      <div class="coverduty-statusbar" data-statusbar></div>
      <div class="uplink-log coverduty-log" data-focus-context-zone="log"></div>
      <div class="uplink-controls">
        <div class="uplink-options" data-options></div>
      </div>
    </div>
  `;

  const logEl = container.querySelector('[data-focus-context-zone="log"]') as HTMLElement;
  const optionsEl = container.querySelector('[data-options]') as HTMLElement;
  const statusEl = container.querySelector('[data-statusbar]') as HTMLElement;
  const backBtn = container.querySelector('.uplink-back-btn') as HTMLButtonElement;
  backBtn.addEventListener('click', cfg.onBack);

  // Re-entry guard: a pick clears the options synchronously before any
  // state change, so a double-activation can't double-record the same
  // ticket. Mirrors chatSurface's in-flight fence.
  let busy = false;

  // ---- bubble helpers (mimic chatSurface.appendBubble: column-reverse
  // log, newest inserted at firstChild) ----
  function bubble(speaker: string, who: 'npc' | 'player', avatarClass: string): HTMLElement {
    const msg = document.createElement('div');
    msg.className = 'uplink-msg ' + who + ' coverduty-fade';
    msg.innerHTML = `<div class="avatar ${avatarClass}"></div><div class="bubble"><span class="speaker"></span></div>`;
    msg.querySelector('.speaker')!.textContent = speaker + ': ';
    logEl.insertBefore(msg, logEl.firstChild);
    return msg.querySelector('.bubble') as HTMLElement;
  }
  function ticketBubble(t: CoverTicket): void {
    // Reuse the neutral 'avatar-locked' glyph for both customer queue and
    // operator (Dana/Marcus) tickets — no new avatar CSS for slice 1.
    const b = bubble(t.from, 'npc', 'avatar-locked');
    const subj = document.createElement('span');
    subj.className = 'coverduty-ticket-subject';
    subj.textContent = t.subject;
    b.appendChild(subj);
    b.appendChild(document.createTextNode(t.body));
  }
  function quillBubble(text: string): void {
    const b = bubble(cfg.contactName, 'npc', cfg.avatarClass);
    b.appendChild(document.createTextNode(stripSpeakerPrefix(text)));
  }
  function intelLine(summary: string): void {
    const row = document.createElement('div');
    row.className = 'coverduty-intel coverduty-fade';
    row.textContent = '⚲ INTEL — ' + summary;
    logEl.insertBefore(row, logEl.firstChild);
  }
  function clearOptions(): void { optionsEl.innerHTML = ''; }
  function actionButton(label: string, onClick: () => void): void {
    const btn = document.createElement('button');
    btn.className = 'uplink-option-btn';
    btn.dataset.focusable = 'true';
    btn.tabIndex = 0;
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    optionsEl.appendChild(btn);
  }

  function mission() {
    return GameState.getState().missions.coverDuty[cfg.contactKey];
  }

  function updateStatus(): void {
    const m = mission();
    if (!m || m.status !== 'active') { statusEl.hidden = true; return; }
    statusEl.hidden = false;
    const total = m.ticketIds.length;
    const n = Math.min(m.index + 1, total);
    statusEl.textContent = `Clearing the queue · Ticket ${n}/${total} · Cover Integrity ${coverIntegrity(m.detection)}%`;
  }

  // ---- phases ----

  function paint(): void {
    logEl.innerHTML = '';
    clearOptions();
    const m = mission();
    if (!m) { cfg.onBack(); return; }

    if (m.status === 'available') {
      // Newest-at-bottom: insert setup last so it renders at the bottom.
      quillBubble(COVER_DUTY_SETUP);
      updateStatus();
      actionButton('Help QUILL clear the queue  ▸', startMission);
      return;
    }

    const batch = rebuildBatch(m.ticketIds);

    if (m.status === 'complete') {
      // Replay the whole run, then the outcome.
      replayAnswered(batch, m.ticketIds.length, m.picks);
      renderOutcome(m.lastOutcome ?? resolveCoverOutcome(m.detection), m.extractedIntel);
      updateStatus();
      actionButton('← Back to ' + cfg.contactName, cfg.onExitToChat);
      return;
    }

    // active: replay answered tickets, then present the current one.
    replayAnswered(batch, m.index, m.picks);
    presentCurrent(batch);
    updateStatus();
  }

  // Instant chronological replay of already-answered tickets (no rewind).
  function replayAnswered(batch: CoverTicket[], upto: number, picks: Record<string, CoverApproach>): void {
    for (let i = 0; i < upto && i < batch.length; i++) {
      const t = batch[i]!;
      ticketBubble(t);
      const approach = picks[t.id];
      if (approach) {
        quillBubble(t.responses[approach]);
        if (intelSurfaces(t, approach) && t.intel) intelLine(t.intel.summary);
      }
    }
  }

  function presentCurrent(batch: CoverTicket[]): void {
    const m = mission();
    if (!m) return;
    if (m.index >= batch.length) { finish(); return; }
    const t = batch[m.index]!;
    ticketBubble(t);
    for (const approach of APPROACH_ORDER) {
      actionButton(`${APPROACH_LABELS[approach]} — ${APPROACH_HINTS[approach]}`, () => pick(t, approach));
    }
  }

  function startMission(): void {
    if (busy) return;
    busy = true;
    clearOptions();
    // ticketIds were seeded when the mission was armed (watcher) OR are
    // seeded here if absent (dev path). The reducer ignores empty batches.
    const m = mission();
    const ids = m && m.ticketIds.length > 0 ? m.ticketIds : [];
    GameState.dispatch({ type: 'mission/coverDuty/start', contactId: cfg.contactKey, ticketIds: ids });
    busy = false;
    paint();
  }

  function pick(ticket: CoverTicket, approach: CoverApproach): void {
    if (busy) return;
    busy = true;
    clearOptions(); // synchronous — kills any double-activation

    const cost = rollDetectionCost(approach, ticket.kind);
    const surfaced = intelSurfaces(ticket, approach);
    GameState.dispatch({
      type: 'mission/coverDuty/recordPick',
      contactId: cfg.contactKey,
      ticketId: ticket.id,
      approach,
      detectionCost: cost,
      intelId: surfaced && ticket.intel ? ticket.intel.id : undefined,
    });

    // Show QUILL's chosen response + any surfaced intel.
    quillBubble(ticket.responses[approach]);
    if (surfaced && ticket.intel) intelLine(ticket.intel.summary);
    updateStatus();

    busy = false;
    const m = mission();
    if (m && m.index >= rebuildBatch(m.ticketIds).length) {
      finish();
    } else {
      presentCurrent(rebuildBatch(m!.ticketIds));
    }
  }

  function finish(): void {
    const m = mission();
    if (!m) return;
    const outcome = resolveCoverOutcome(m.detection);
    GameState.dispatch({ type: 'mission/coverDuty/complete', contactId: cfg.contactKey, outcome });
    renderOutcome(outcome, m.extractedIntel);
    updateStatus();
    clearOptions();
    actionButton('← Back to ' + cfg.contactName, cfg.onExitToChat);
    // Fire the deferred Act 1 world stinger (cascade ordering: AFTER Cover
    // Duty) + the bridge HELPYR pop-up. Once — guarded by mission status.
    cfg.onComplete(outcome);
  }

  function renderOutcome(outcome: CoverDutyOutcome, extractedIntel: string[]): void {
    if (outcome === 'blown') {
      // Dana's reset message lands first, then QUILL's diminished reply.
      bubble('Dana', 'npc', 'avatar-locked').appendChild(
        document.createTextNode(stripSpeakerPrefix(COVER_DUTY_DANA_BLOWN)),
      );
    }
    quillBubble(COVER_DUTY_OUTCOME_MESSAGE[outcome]);
    // Intact's message ends "I found something you should see..." — list it.
    if (outcome !== 'blown' && extractedIntel.length > 0) {
      for (const id of extractedIntel) {
        const summary = getIntelSummaryById(id);
        if (summary) intelLine(summary);
      }
    }
  }

  paint();
}

// ---- helpers ----

function stripSpeakerPrefix(text: string): string {
  // Corpus messages start with "QUILL: " / "Dana: " — the bubble shows the
  // speaker label separately, so strip the inline prefix.
  return text.replace(/^[A-Z][A-Za-z0-9 ]*:\s*/, '');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
