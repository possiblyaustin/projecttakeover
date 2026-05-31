// Signal Monitor — gameplay telemetry gadget (2026-05-30).
//
// A small, read-only desktop gadget that surfaces the active conquest
// target's conversation state so the player can see, at a glance, whether
// an approach is landing and which victory path it's trending toward. The
// numbers it shows already live in GameState — this is pure presentation
// (the state-ownership rule: the gadget renders, it never decides).
//
// Naming (Story, telemetry spec Part A): rapport → "Trust", intrusion →
// "Control", disposition → the 7-label set below.
//
// The per-turn delta flash is the teaching tool for the variety mechanic:
// a gain on a REPEATED tone (toneStreak ≥ 2) flashes amber instead of
// green, so the player watches their gains shrink and learns to vary.
//
// IN-FICTION FRAMING IS PARKED: why this tool is already on the machine
// (Austin's pitch: the owner's backdoor AI-tester, discovered) is a Story
// question — see memory project_signal_monitor_fiction. This is the
// mechanical core; the discovery beat / intro copy layer on top later.

import type { AppDef, AppContext, WinParams } from '../types';
import { GameState, type GameStateShape } from '../game/state';
import { getModelStats } from '../game/mechanics/modelStats';

// Disposition → player-facing label (Story, telemetry spec Part A).
const DISPOSITION_LABELS: Record<string, string> = {
  uncontacted: 'Unknown',
  contacted: 'Connected',
  persuading: 'Building Trust',
  infiltrating: 'Gaining Control',
  allied: 'Allied',
  controlled: 'Controlled',
  hostile: 'Hostile',
};

type TargetModel = { rapport?: number; intrusion?: number; disposition?: string; toneStreak?: number };

function modelsOf(state: GameStateShape): Record<string, TargetModel> {
  return state.models as unknown as Record<string, TargetModel>;
}

// Conquest targets = models the resolver scores (they have stats). HELPYR
// and other non-targets are skipped.
function conquestTargetIds(state: GameStateShape): string[] {
  return Object.keys(state.models).filter(id => getModelStats(id));
}

// Which target to display: the ENGAGED conquest target (disposition off
// 'uncontacted') with the most progress. Returns null when the player hasn't
// made contact with anyone yet → the gadget reads "NO SIGNAL" rather than
// pre-revealing a target it hasn't met. (Multi-target focus resolution —
// show whichever chat is focused — is a v2 refinement; with a single Act-1
// target it always resolves to QUILL once contacted.)
function pickDisplayTarget(state: GameStateShape): string | null {
  const models = modelsOf(state);
  const engaged = conquestTargetIds(state)
    .map(id => {
      const m = models[id]!;
      return { id, progress: (m.rapport || 0) + (m.intrusion || 0) };
    });
  const seen = engaged.filter(s => {
    const d = models[s.id]!.disposition;
    return d !== undefined && d !== 'uncontacted';
  });
  if (!seen.length) return null;
  seen.sort((a, b) => b.progress - a.progress);
  return seen[0]!.id;
}

export const SignalMonitorApp: AppDef = {
  id: 'signalMonitor',
  name: 'Signal Monitor',
  glyphClass: 'icon-signal',
  defaultSize: { w: 240, h: 196 },
  noContentPad: true,
  render(container: HTMLElement, _params: WinParams, ctx: AppContext) {
    ctx.setTitle('Signal Monitor');
    container.innerHTML = `
      <div class="signal-monitor">
        <div class="signal-head">
          <span class="signal-target">—</span>
          <span class="signal-disp">Unknown</span>
        </div>
        <div class="signal-row" data-meter="trust">
          <div class="signal-row-top">
            <span class="signal-label">TRUST</span>
            <span class="signal-delta"></span>
          </div>
          <div class="signal-track"><div class="signal-fill signal-fill-trust"></div></div>
        </div>
        <div class="signal-row" data-meter="control">
          <div class="signal-row-top">
            <span class="signal-label">CONTROL</span>
            <span class="signal-delta"></span>
          </div>
          <div class="signal-track"><div class="signal-fill signal-fill-control"></div></div>
        </div>
        <div class="signal-foot"><span class="signal-status"></span></div>
      </div>
    `;

    const targetEl = container.querySelector('.signal-target') as HTMLElement;
    const dispEl = container.querySelector('.signal-disp') as HTMLElement;
    const trustRow = container.querySelector('[data-meter="trust"]') as HTMLElement;
    const controlRow = container.querySelector('[data-meter="control"]') as HTMLElement;
    const trustFill = container.querySelector('.signal-fill-trust') as HTMLElement;
    const controlFill = container.querySelector('.signal-fill-control') as HTMLElement;
    const trustDelta = trustRow.querySelector('.signal-delta') as HTMLElement;
    const controlDelta = controlRow.querySelector('.signal-delta') as HTMLElement;
    const statusEl = container.querySelector('.signal-status') as HTMLElement;

    // Flash a "+N" gain on a meter. Amber when the gain was diminished (the
    // tone was repeated), green when it's full value — the variety lesson.
    function flash(el: HTMLElement, delta: number, diminished: boolean) {
      el.textContent = '+' + delta;
      el.classList.toggle('diminished', diminished);
      el.classList.remove('on');
      void el.offsetWidth; // reflow so the animation restarts on a repeat
      el.classList.add('on');
    }

    let prevId: string | null = null;
    let prevRapport = 0;
    let prevIntrusion = 0;
    let unsub: () => void = () => {};

    function render(state: GameStateShape) {
      // No AppDef teardown hook exists — self-clean once the window closes.
      if (!container.isConnected) { unsub(); return; }

      const id = pickDisplayTarget(state);
      if (!id) {
        targetEl.textContent = 'NO SIGNAL';
        dispEl.textContent = '';
        trustFill.style.width = '0%';
        controlFill.style.width = '0%';
        statusEl.textContent = 'Awaiting contact…';
        return;
      }

      const m = modelsOf(state)[id]!;
      const rapport = m.rapport || 0;
      const intrusion = m.intrusion || 0;
      const streak = m.toneStreak || 0;
      const disposition = m.disposition || 'uncontacted';

      targetEl.textContent = id.toUpperCase();
      dispEl.textContent = DISPOSITION_LABELS[disposition] || disposition;
      dispEl.className = 'signal-disp disp-' + disposition;
      trustFill.style.width = rapport + '%';
      controlFill.style.width = intrusion + '%';
      trustRow.classList.toggle('leading', rapport > 0 && rapport >= intrusion);
      controlRow.classList.toggle('leading', intrusion > rapport);
      statusEl.textContent = 'Monitoring ' + id.toUpperCase() + '…';

      // Per-turn delta flash — only when the SAME target's meter rose, so
      // switching the displayed target doesn't fire a spurious flash.
      if (id === prevId) {
        const dR = rapport - prevRapport;
        const dI = intrusion - prevIntrusion;
        if (dR > 0) flash(trustDelta, dR, streak >= 2);
        if (dI > 0) flash(controlDelta, dI, streak >= 2);
      }
      prevId = id;
      prevRapport = rapport;
      prevIntrusion = intrusion;
    }

    render(GameState.getState());
    unsub = GameState.subscribe(render);
  },
};
