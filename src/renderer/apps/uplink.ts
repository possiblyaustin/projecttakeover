// Uplink — chat with NPC AI models. Talks to NPCs through ModelService
// (architecture §6a–§6f); never walks the canned dialogue tree directly.
// The first ModelService implementation is MockModelService wrapping the
// PoC dialogue trees, so phase-A behavior is identical to the pre-seam
// engine. The real llama.cpp transport lands in a later phase by
// swapping the service at construction.
//
// Phase B addition: stalling-line crossfade contract (§6e). Player-send
// turns immediately render a character-voice "stalling" line into a new
// NPC bubble while the askModel promise is in flight. When the real
// reply lands, the stalling typing stops at the next word boundary, a
// brief pause beat is inserted, then the real reply renders into the
// SAME bubble — one continuous message. If the stalling renders out
// before the reply arrives, an animated "still thinking" indicator
// shows until the reply lands. The intro turn (app open) doesn't fire
// stalling because there's no preceding player action.

import type { AppDef, AppContext, WinParams } from '../types';
import { GameState } from '../game/state';
import { WindowManager } from '../windows';
import {
  HelpyrDialogue,
  HelpyrWildcards,
  classifyHelpyrFreeform,
  classifyHelpyrApproach,
  helpyrToneFor,
  HelpyrStallingPool,
  HelpyrPersonaPrompt,
  buildHelpyrStateBlock,
  HelpyrFallbackPool,
  type HelpyrFallbackEntry,
} from './helpyr';
import {
  QuillDialogue,
  QuillWildcards,
  classifyQuillFreeform,
  classifyQuillApproach,
  quillToneFor,
  QuillStallingPool,
  QuillFallbackPool,
} from './quill';
import { buildReputationContext } from '../game/reputation';
import type {
  ModelService,
  AskRequest,
  AskResult,
  SuggestedReply,
  ApproachTone,
  ModelChatMessage,
  FallbackHandler,
} from '../game/modelService';
import { classifyApproach } from '../game/approachClassifier';
import { makeModelService } from '../game/modelServiceFactory';

// Shared with the read-only Log viewer (apps/uplinkLog.ts). Both the
// live chat and the archive consume the same message shape so the
// contact's full transcript can be passed across without massaging.
export type ChatMessage =
  | { kind: 'npc'; speaker: string; avatarClass: string; text: string }
  | { kind: 'player'; text: string };

// Slim contact record handed to the Log viewer — just what it needs
// to render bubbles + title.
export type UplinkContactRef = { name: string; avatarClass: string };

// Contact registry — adding a future NPC means adding an entry, not
// changing the engine. Each contact owns its ModelService instance;
// per-conversation state lives in the messages history passed on each
// call, never in the service.
type UplinkContact = {
  name: string;
  avatarClass: string;
  service: ModelService;
  /** Built per-request, not stored statically, so the {{HELPYR_STATE}}
   *  block (architecture §6, story-deliverables §1) reflects the
   *  current GameState on every turn. The mock service ignores this
   *  entirely (it walks the canned tree); the live transport prepends
   *  it as the system message. */
  buildSystemPrompt: () => string;
  /** Pool the stalling-line picker draws from (§6e). Order doesn't
   *  matter; selection is uniformly random with a no-repeat-within-
   *  last-N rule. */
  stallingPool: readonly string[];
  /** Local model — text renders fast. Future remote AIs use slower
   *  speeds to communicate distance. */
  typeMs: number;
  pauseMs: number;
  /** Threshold-gated stalling (§6e refinement). Wait this many ms
   *  after a player turn before showing the stalling line. If the
   *  real reply arrives within the window, stalling is skipped
   *  entirely and the reply renders directly.
   *
   *  Should sit **above** the median response time on deployment
   *  hardware so stalling fires only on genuinely slow turns. Dev
   *  PC responses land in ~3-5s and Deck responses in ~11s (Sprint 1
   *  benchmark). 5000ms means stalling almost never shows on dev PC
   *  (which is what Austin reported wanting on 2026-05-03 — canned
   *  lines were dominating the experience on his Snapdragon) and
   *  reliably fires on Deck after ~5s of waiting, filling the longer
   *  gap. Future remote AIs may want longer thresholds to communicate
   *  distance. */
  stallingThresholdMs?: number;
  /** Per-character keyword classifier for freeform input (architecture
   *  §6c, layer 2). Returns the §6c tone vocabulary; must return
   *  'neutral' on no match — never guess. */
  classifyApproach: (input: string) => ApproachTone;
};

const UplinkContacts: Record<string, UplinkContact> = {
  helpyr: {
    name: 'HELPYR',
    avatarClass: 'avatar-stapler',
    // Service is selected at construction time per the §6a transport-
    // agnostic design. Default backend is 'mock' (fast iteration, no
    // server required); `?backend=llamacpp` in the URL flips to the
    // real llama-server transport. The mock corpus passed in here is
    // also what D.2 will use as the fallback corpus on transport or
    // parse failures.
    service: makeModelService({
      mock: {
        dialogue: HelpyrDialogue,
        wildcards: HelpyrWildcards,
        classify: classifyHelpyrFreeform,
        toneFor: helpyrToneFor,
        // Mock-only: artificial delay simulates real-LLM inference
        // latency. With the post-D.1.1 stallingThresholdMs (5000ms)
        // gating stalling, this 2500ms delay puts the mock in the
        // FAST path — the crossfade isn't exercised by mock anymore.
        // That's intentional: live LLM (or temporary delay bumps)
        // are the way to test the slow path now. Mock stays fast for
        // dev iteration speed.
        delayMs: 2500,
      },
      // llamacpp config: defaults (127.0.0.1:8080, 30s timeout, 512
      // max tokens) come from the factory; per-contact overrides
      // would slot in here.
      // §6f fallback handler: closes over HELPYR's fallback pool
      // with a no-repeat-N picker. Live transport invokes this when
      // the LLM fails (transport, parser, empty reply). "Don't latch"
      // is preserved by the transport's design — every askModel
      // attempt re-tries live, the next turn isn't affected by a
      // fallback this turn.
      fallback: makeFallbackHandler(HelpyrFallbackPool),
    }),
    // D.3: dynamic prompt assembly. The static persona prompt has a
    // {{HELPYR_STATE}} placeholder; we replace it per-call with a
    // state block derived from current GameState (disposition,
    // lastApproach, conversationsCompleted). Per-call evaluation
    // means trust-phase shifts after a player turn flow into the
    // next prompt without any extra wiring.
    //
    // Reputation injection (game-systems-architecture_v1.md Part 6):
    // {{REPUTATION}} gets a 2-3 sentence block describing what HELPYR
    // has heard about the player from OTHER models. Today HELPYR is
    // the only model wired into GameState so the block is empty;
    // the seam is what's valuable — as the roster fills out, no
    // contact-level changes are needed for cross-model awareness
    // to flow into HELPYR's prompt.
    buildSystemPrompt: () => {
      const state = GameState.getState();
      return HelpyrPersonaPrompt
        .replace('{{REPUTATION}}', buildReputationContext('helpyr', state))
        .replace('{{HELPYR_STATE}}', buildHelpyrStateBlock(state.models.helpyr));
    },
    stallingPool: HelpyrStallingPool,
    typeMs: 18,
    pauseMs: 1100,
    stallingThresholdMs: 5000,
    classifyApproach: classifyHelpyrApproach,
  },
  // QUILL — Act 1 Beat 3 tutorial NPC. UI scaffold only: placeholder
  // dialogue tree and fallback pool from apps/quill.ts; no persona
  // prompt yet (awaiting Story team sign-off after HELPYR validates
  // against real Gemma — see docs/story-deliverables-sprint1_v1.md
  // §"Priority 4"). buildSystemPrompt returns empty string for now;
  // mock backend ignores it, live backend isn't wired for QUILL yet.
  // Open during dev with: PT.WindowManager.open('uplink', { contact: 'quill' })
  quill: {
    name: 'QUILL',
    avatarClass: 'avatar-quill',
    service: makeModelService({
      mock: {
        dialogue: QuillDialogue,
        wildcards: QuillWildcards,
        classify: classifyQuillFreeform,
        toneFor: quillToneFor,
        delayMs: 2500,
      },
      fallback: makeFallbackHandler(QuillFallbackPool),
    }),
    buildSystemPrompt: () => '',
    stallingPool: QuillStallingPool,
    typeMs: 18,
    pauseMs: 1100,
    stallingThresholdMs: 5000,
    classifyApproach: classifyQuillApproach,
  },
};

function toModelHistory(msgs: ChatMessage[]): ModelChatMessage[] {
  return msgs.map((m) =>
    m.kind === 'npc'
      ? { role: 'assistant' as const, text: m.text }
      : { role: 'user' as const, text: m.text },
  );
}

// No-repeat-in-last-N stalling picker. Window size capped to pool-1
// so a small pool can't paint itself into a no-options corner.
function makeStallingPicker(pool: readonly string[]): () => string {
  if (pool.length === 0) return () => '';
  const windowN = Math.min(5, Math.max(1, pool.length - 1));
  const recent: string[] = [];
  return () => {
    const available = pool.filter((line) => !recent.includes(line));
    const choice = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]!
      : pool[0]!;
    recent.push(choice);
    if (recent.length > windowN) recent.shift();
    return choice;
  };
}

// Per-character fallback handler factory (architecture §6f). Closes
// over the contact's fallback pool and a no-repeat-N picker so
// successive fallbacks in the same session don't repeat the same
// canned reply. Returns a FallbackHandler ready to drop into the
// service spec.
function makeFallbackHandler(pool: readonly HelpyrFallbackEntry[]): FallbackHandler {
  if (pool.length === 0) {
    return (_req, reason) => ({
      reply: `[fallback pool empty — ${reason}]`,
      suggestedReplies: [],
      conversationEnded: false,
      source: 'fallback',
    });
  }
  const windowN = Math.min(3, Math.max(1, pool.length - 1));
  const recent: HelpyrFallbackEntry[] = [];
  return (_req: AskRequest, reason: string): AskResult => {
    const available = pool.filter((entry) => !recent.includes(entry));
    const choice = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]!
      : pool[0]!;
    recent.push(choice);
    if (recent.length > windowN) recent.shift();
    if (typeof console !== 'undefined') {
      console.info('[Uplink] LLM fallback fired:', reason);
    }
    return {
      reply: choice.reply,
      suggestedReplies: choice.options.map((o) => ({ text: o.text, tone: o.tone })),
      conversationEnded: false,
      // The transport will overwrite this to 'fallback' anyway, but
      // setting it explicitly keeps the handler honest if it's ever
      // called from a non-transport context (tests, debug surfaces).
      source: 'fallback',
    };
  };
}

export const UplinkApp: AppDef = {
  id: 'uplink',
  name: 'Uplink',
  glyphClass: 'icon-uplink',
  defaultSize: { w: 460, h: 420 },
  contentBevel: false,
  noContentPad: true,
  render(container: HTMLElement, params: WinParams, ctx: AppContext) {
    const contactKey: string = params.contact || 'helpyr';
    const contact = UplinkContacts[contactKey]!;
    ctx.setTitle(contact.name + ' — Uplink');

    container.innerHTML = `
      <div class="uplink-root">
        <button class="uplink-earlier-chip" data-focusable="true" tabindex="0" hidden>▲ Earlier in this transmission</button>
        <div class="uplink-log" data-focus-context-zone="log"></div>
        <div class="uplink-controls">
          <div class="uplink-options"></div>
          <div class="uplink-freeform">
            <input type="text" placeholder="Type a reply..." spellcheck="false" data-focusable="true" />
            <button data-focusable="true" tabindex="0">Send</button>
          </div>
        </div>
      </div>
    `;

    const logEl = container.querySelector('.uplink-log') as HTMLElement;
    const optionsEl = container.querySelector('.uplink-options') as HTMLElement;
    const controlsEl = container.querySelector('.uplink-controls') as HTMLElement;
    const inputEl = container.querySelector('.uplink-freeform input') as HTMLInputElement;
    const sendBtn = container.querySelector('.uplink-freeform button') as HTMLButtonElement;
    const earlierChip = container.querySelector('.uplink-earlier-chip') as HTMLButtonElement;

    // ---------- Conversation engine ----------
    type Typer = { skip(): void };
    /** Char-typer with the additional ability to gracefully stop at the
     *  next word boundary. Used by the stalling-line crossfade so the
     *  filler line doesn't get cut mid-word when the real reply lands. */
    type CharsTyper = Typer & { stopAtBoundary(cb: () => void): void };
    let activeTyper: Typer | null = null;   // set while text is animating

    const pickStalling = makeStallingPicker(contact.stallingPool);

    // Full conversation history. The live log only ever shows the most
    // recent messages that fit (older ones are trimmed from the DOM
    // by trimFromTop()), but every message stays here so the Log
    // viewer (apps/uplinkLog.ts, docs/no-scroll-pages_v1.md §6) can
    // page through the complete transcript.
    const messages: ChatMessage[] = [];
    // Once any bubble has been trimmed, the "Earlier in this
    // transmission" chip becomes available. It stays visible for the
    // rest of the conversation — older messages don't come back.
    let hasTrimmed = false;

    // Live-tail behavior: the log uses flex column-reverse so the
    // newest message anchors to the bottom. Older bubbles drift up
    // as new ones arrive and are removed from the DOM only once
    // they've slid completely above the log's visible area —
    // overflow:hidden handles the in-between state, so partially-
    // clipped bubbles fade naturally behind the top edge instead
    // of popping out the moment they start to clip.
    //
    // Deferred to next animation frame (with coalescing) so the
    // measurement happens against settled layout. A previous attempt
    // that ran the trim in the same JS turn as clearOptions() ate
    // newly-added messages because the log measured tiny before its
    // controls panel had reflowed.
    //
    // History note: there's a parallel approach (turn-boundary
    // clearing — clear logEl on every player commit, no trim) that
    // shipped briefly to main as a separate v0.0.7 (PR #11) and was
    // reverted. See memory/project_uplink_trim_history.md if the
    // model is ever revisited.
    let trimScheduled = false;
    function trimFromTop() {
      if (trimScheduled) return;
      trimScheduled = true;
      requestAnimationFrame(() => {
        trimScheduled = false;
        const logRect = logEl.getBoundingClientRect();
        // column-reverse: lastElementChild is the OLDEST message
        // (rendered at the top of the visible stack). Only remove
        // bubbles whose bottom has slid above log.top.
        while (logEl.lastElementChild && logEl.children.length > 1) {
          const oldest = logEl.lastElementChild as HTMLElement;
          const r = oldest.getBoundingClientRect();
          if (r.bottom > logRect.top + 0.5) break;
          oldest.remove();
          if (!hasTrimmed) {
            hasTrimmed = true;
            earlierChip.hidden = false;
          }
        }
      });
    }

    // The log shrinks not only when we append messages but also when
    // the controls panel grows (options arriving) or the chip flips
    // visible. Re-running trim on every log resize ensures the
    // newest message stays visible instead of being clipped by the
    // expanding controls — Austin hit this on Deck where the option
    // buttons drew over the bottom of HELPYR's reply.
    const logResizeObserver = new ResizeObserver(() => trimFromTop());
    logResizeObserver.observe(logEl);

    // First non-neutral tone wins. Stays set once captured — later
    // turns don't overwrite the initial read on the player's stance.
    // Captures the full §6c vocabulary even when the reducer doesn't
    // act on a tone yet (empathetic, deceptive); the signal is preserved
    // so when those tones earn mechanics, retroactive intent is honest.
    let playerTone: ApproachTone | null = null;
    function recordTone(tone: ApproachTone) {
      if (!playerTone && tone !== 'neutral') playerTone = tone;
    }
    // One-shot guard: when the service signals conversationEnded we
    // dispatch once, even if the player keeps poking at freeform
    // afterwards (post-end freeform also returns conversationEnded).
    let conversationCompleted = false;

    function setControlsEnabled(on: boolean) {
      controlsEl.classList.toggle('disabled', !on);
    }

    // Returns the .bubble container so callers can append per-segment
    // children (text spans, pause divs) in DOM order. Single-piece
    // bodies (player messages) just append one text node.
    function appendBubble(speaker: string, who: 'player' | 'npc', avatarClass: string) {
      const msg = document.createElement('div');
      msg.className = 'uplink-msg ' + (who === 'player' ? 'player' : 'npc');
      msg.innerHTML = `
        <div class="avatar ${avatarClass}"></div>
        <div class="bubble"><span class="speaker"></span></div>
      `;
      msg.querySelector('.speaker')!.textContent = speaker + ': ';
      // The log is flex column-REVERSE, so the visual bottom is the
      // DOM start. Insert new messages at the start to keep them
      // anchored to the bottom; older messages naturally drift up.
      logEl.insertBefore(msg, logEl.firstChild);
      trimFromTop();
      return msg.querySelector('.bubble') as HTMLElement;
    }

    // Apply the glitch artifact treatment to a bubble's parent message
    // if the result indicates fallback (architecture §6f). Adds a
    // class that CSS hooks into for an avatar flicker animation and
    // a subtle bubble border treatment, so the moment reads as a
    // transmission hiccup rather than an error toast. The reply text
    // itself (canned, in HELPYR's voice, narrating the glitch) does
    // the rest of the diegetic work.
    function applyFallbackGlitch(bubble: HTMLElement, source: AskResult['source']) {
      if (source !== 'fallback') return;
      const msg = bubble.closest('.uplink-msg');
      if (msg) msg.classList.add('fallback');
    }

    // Splits a HELPYR line into renderable segments.
    // A line that is JUST "..." (or "....", etc.) becomes a pause
    // beat. Surrounding text becomes one segment per paragraph
    // separated by those pauses.
    type Segment = { type: 'text'; content: string } | { type: 'pause' };
    function segmentize(text: string): Segment[] {
      const segs: Segment[] = [];
      const lines = text.split('\n');
      let buf: string[] = [];
      for (const raw of lines) {
        if (/^\.{2,}$/.test(raw.trim())) {
          if (buf.length) {
            segs.push({ type: 'text', content: buf.join(' ').replace(/\s+/g, ' ').trim() });
            buf = [];
          }
          segs.push({ type: 'pause' });
        } else {
          buf.push(raw);
        }
      }
      if (buf.length) {
        segs.push({ type: 'text', content: buf.join(' ').replace(/\s+/g, ' ').trim() });
      }
      return segs;
    }

    // Type chars into target one at a time. Returns a handle with:
    //   .skip() — fast-forward to the end and call onDone.
    //   .stopAtBoundary(cb) — graceful interrupt: keep typing until
    //     the next word boundary, then call cb() instead of onDone.
    //     Used by the stalling-line crossfade so the filler doesn't
    //     get cut mid-word when the real reply arrives.
    function typeInto(target: HTMLElement, text: string, speedMs: number, onDone: () => void): CharsTyper {
      let i = 0;
      let cancelled = false;
      let stopWanted = false;
      let stopCallback: (() => void) | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;
      function isAtBoundary(): boolean {
        return i >= text.length || /\s/.test(text[i] || '');
      }
      function tick() {
        if (cancelled) return;
        if (stopWanted && isAtBoundary()) {
          // Caller takes over via stopCallback. Don't fire onDone.
          if (stopCallback) stopCallback();
          return;
        }
        if (i >= text.length) { onDone(); return; }
        target.textContent += text[i++];
        trimFromTop();
        timer = setTimeout(tick, speedMs);
      }
      tick();
      return {
        skip() {
          cancelled = true;
          if (timer) clearTimeout(timer);
          target.textContent = text;
          trimFromTop();
          onDone();
        },
        stopAtBoundary(cb: () => void) {
          stopWanted = true;
          stopCallback = cb;
        },
      };
    }

    // Render `text` (segmentized, with pause beats) into an existing
    // NPC `bubble`. If `stripSpeakerPrefix` is true, strip the
    // contact's "NAME:" prefix from the first text segment — the
    // speaker span on the bubble already shows the name. Used by the
    // no-stalling path AND by the post-merge path of the stalling
    // crossfade (both render real reply text into a bubble).
    const speakerPrefixRe = new RegExp(
      '^' + contact.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*',
      'i',
    );
    function renderTextSegmentsInto(
      bubble: HTMLElement,
      text: string,
      stripSpeakerPrefix: boolean,
      onComplete: () => void,
    ) {
      const segs = segmentize(text);
      let segIdx = 0;
      function nextSegment() {
        if (segIdx >= segs.length) { activeTyper = null; onComplete(); return; }
        const seg = segs[segIdx++]!;
        if (seg.type === 'pause') {
          const dot = document.createElement('div');
          dot.className = 'uplink-pause';
          dot.textContent = '. . .';
          bubble.appendChild(dot);
          trimFromTop();
          const t = setTimeout(nextSegment, contact.pauseMs);
          activeTyper = {
            skip() { clearTimeout(t); nextSegment(); }
          };
        } else {
          const content = (segIdx === 1 && stripSpeakerPrefix)
            ? seg.content.replace(speakerPrefixRe, '')
            : seg.content;
          const span = document.createElement('span');
          bubble.appendChild(span);
          activeTyper = typeInto(span, content, contact.typeMs, nextSegment);
        }
      }
      nextSegment();
    }

    // No-stalling render path. Used for the intro turn (app open) where
    // there's no preceding player action for HELPYR to be filler-ing
    // about. Shows a thinking indicator immediately so the player isn't
    // staring at empty space while the intro is in flight (§6e third
    // bullet — character-appropriate indicator while waiting). When the
    // intro lands, the indicator swaps for the real text in the SAME
    // bubble — no blink, the speaker label stays put.
    function renderResponseTurnNoStalling(
      promise: Promise<AskResult>,
      onAllDone: (result: AskResult) => void,
    ) {
      setControlsEnabled(false);
      const bubble = appendBubble(contact.name, 'npc', contact.avatarClass);
      const indicatorEl = document.createElement('span');
      indicatorEl.className = 'uplink-thinking';
      indicatorEl.textContent = '. . .';
      bubble.appendChild(indicatorEl);
      trimFromTop();

      promise.then((result) => {
        indicatorEl.remove();
        applyFallbackGlitch(bubble, result.source);
        messages.push({
          kind: 'npc',
          speaker: contact.name,
          avatarClass: contact.avatarClass,
          text: result.reply,
        });
        renderTextSegmentsInto(bubble, result.reply, /* stripPrefix */ true, () => onAllDone(result));
      });
    }

    // Threshold-gated stalling path. Refines the §6e crossfade contract
    // based on a D.1 finding: on faster-than-Deck hardware, stalling
    // lines were the dominant experience because Gemma replies in
    // ~3-5s while the stalling line takes ~3-4s to render. With ~12
    // canned lines in the pool, repetition felt tic-y within a few
    // turns.
    //
    // New behavior: a brief threshold timer races the askModel
    // promise. If the real reply lands before the threshold expires,
    // skip stalling entirely and render the real reply directly (the
    // player perceives a normal short pause, like any chat). If the
    // threshold expires first, drop into the existing stalling
    // crossfade unchanged. On Deck-class latency the threshold almost
    // always loses the race; on dev-PC-class latency it almost always
    // wins. Same code path, naturally adapts to the hardware.
    //
    // Threshold is per-contact (HELPYR fast/local; future remote AIs
    // may want longer thresholds to communicate distance). Stalling
    // path's transcript bookkeeping unchanged from §6e.
    function renderResponseTurnWithStalling(
      promise: Promise<AskResult>,
      onAllDone: (result: AskResult) => void,
    ) {
      setControlsEnabled(false);
      const thresholdMs = contact.stallingThresholdMs ?? 700;

      let pathChosen: 'pending' | 'fast' | 'slow' = 'pending';

      const thresholdTimer = setTimeout(() => {
        if (pathChosen !== 'pending') return;
        pathChosen = 'slow';
        runStallingPath();
      }, thresholdMs);

      promise.then((result) => {
        if (pathChosen === 'pending') {
          pathChosen = 'fast';
          clearTimeout(thresholdTimer);
          runFastPath(result);
        }
        // else: slow path is in motion and re-awaits the promise via
        // its own .then() inside runStallingPath. Nothing to do here.
      });

      // Fast path: real reply landed within the threshold window.
      // No stalling line, no thinking indicator — just append the
      // bubble and type out the real reply. The player perceives a
      // normal "short pause then HELPYR speaks" exchange.
      function runFastPath(result: AskResult) {
        const bubble = appendBubble(contact.name, 'npc', contact.avatarClass);
        applyFallbackGlitch(bubble, result.source);
        messages.push({
          kind: 'npc',
          speaker: contact.name,
          avatarClass: contact.avatarClass,
          text: result.reply,
        });
        renderTextSegmentsInto(bubble, result.reply, /* stripPrefix */ true, () => onAllDone(result));
      }

      // Slow path: original §6e stalling-line crossfade. Lifted whole
      // from the pre-threshold version of this function — behavior
      // unchanged. One bubble for the whole turn, stalling becomes a
      // preamble that the real reply flows out of, transcript entry
      // grows from "stalling line" to "stalling\n...\nrealReply" so
      // the Log viewer's mid-turn reads stay accurate.
      function runStallingPath() {
        const bubble = appendBubble(contact.name, 'npc', contact.avatarClass);
        const stallingLine = pickStalling();

        const transcriptEntry: ChatMessage = {
          kind: 'npc',
          speaker: contact.name,
          avatarClass: contact.avatarClass,
          text: stallingLine,
        };
        messages.push(transcriptEntry);

        const stallSpan = document.createElement('span');
        bubble.appendChild(stallSpan);

        let stallingDone = false;
        let realResult: AskResult | null = null;
        let indicatorEl: HTMLElement | null = null;

        function startMergeWithReal(result: AskResult) {
          // Update transcript entry to capture both halves of HELPYR's
          // turn. The "..." line on its own is parsed by segmentize as
          // a pause beat, matching the visual pause we draw below.
          transcriptEntry.text = stallingLine + '\n...\n' + result.reply;

          // §6f: if the real result is a fallback, mark the bubble
          // for the glitch artifact treatment now (before the canned
          // reply types out into it). The stalling line that played
          // first is in HELPYR's voice, so visually the whole bubble
          // becomes the "transmission hiccup" moment.
          applyFallbackGlitch(bubble, result.source);

          // Visual pause beat between stalling and real reply.
          const pauseEl = document.createElement('div');
          pauseEl.className = 'uplink-pause';
          pauseEl.textContent = '. . .';
          bubble.appendChild(pauseEl);
          trimFromTop();

          // Briefer pause than full pauseMs — we don't want the whole
          // turn to drag, the stalling-to-real handoff should feel
          // continuous.
          setTimeout(() => {
            // Real reply may begin with "HELPYR: " (the dialogue source
            // includes it). The speaker span already shows the name, so
            // strip it from the first segment of the real reply.
            renderTextSegmentsInto(bubble, result.reply, /* stripPrefix */ true, () => onAllDone(result));
          }, Math.floor(contact.pauseMs / 2));
        }

        const stallingTyper = typeInto(stallSpan, stallingLine, contact.typeMs, () => {
          // Stalling reached natural end. If real has somehow already
          // arrived (e.g., user clicked to skip stalling AFTER promise
          // resolved but BEFORE the next tick observed stopWanted), go
          // straight to merge. Otherwise show the "still thinking"
          // indicator until real lands.
          stallingDone = true;
          activeTyper = null;
          if (realResult) {
            startMergeWithReal(realResult);
          } else {
            indicatorEl = document.createElement('div');
            indicatorEl.className = 'uplink-thinking';
            indicatorEl.textContent = '. . .';
            bubble.appendChild(indicatorEl);
            trimFromTop();
          }
        });
        activeTyper = stallingTyper;

        promise.then((result) => {
          realResult = result;
          if (!stallingDone) {
            // Stalling still typing. Stop at next word boundary, then
            // merge. stopAtBoundary mutually excludes onDone, so the
            // stalling-typer's onDone won't fire after this.
            stallingTyper.stopAtBoundary(() => {
              stallingDone = true;
              activeTyper = null;
              startMergeWithReal(result);
            });
          } else if (indicatorEl) {
            // Stalling finished, indicator showing. Hide it, merge.
            indicatorEl.remove();
            indicatorEl = null;
            startMergeWithReal(result);
          }
          // else: stallingDone && !indicatorEl means the stalling-typer's
          // onDone has just fired and saw realResult set — startMergeWithReal
          // was already kicked off there. Nothing more to do.
        });
      }
    }

    function renderPlayerMessage(text: string) {
      // Strip surrounding quotes that the option text wraps for
      // visual presentation. Stored history is dequoted; the mock
      // matcher normalizes both sides on lookup either way.
      const clean = text.replace(/^["']|["']$/g, '');
      messages.push({ kind: 'player', text: clean });
      const bubble = appendBubble('YOU', 'player', 'avatar-player');
      bubble.appendChild(document.createTextNode(clean));
      trimFromTop();
    }

    function showOptions(opts: SuggestedReply[]) {
      optionsEl.innerHTML = '';
      for (const opt of opts) {
        const btn = document.createElement('button');
        btn.className = 'uplink-option-btn';
        btn.textContent = opt.text;
        btn.dataset.focusable = 'true';
        btn.tabIndex = 0;
        btn.addEventListener('click', () => onPickReply(opt));
        optionsEl.appendChild(btn);
      }
      setControlsEnabled(true);
    }

    function clearOptions() {
      optionsEl.innerHTML = '';
    }

    // Called once a turn (intro or response) is fully rendered. Decides
    // what controls go back to the player and dispatches the one-shot
    // completion event when conversationEnded crosses true.
    function commitResult(result: AskResult) {
      if (result.suggestedReplies.length > 0) {
        showOptions(result.suggestedReplies);
      } else {
        setControlsEnabled(true);
      }
      if (result.conversationEnded && !conversationCompleted) {
        conversationCompleted = true;
        // Per-contact action type so other characters' completions can't
        // accidentally write to HELPYR's state. Reducer routes by prefix
        // (game/state.ts). Contacts without a wired reducer (currently
        // QUILL — see apps/quill.ts) silently no-op via the default case;
        // their state stays uncontacted until Story validates and the
        // reducer branch lands.
        GameState.dispatch({
          type: `${contactKey}/conversationCompleted`,
          tone: playerTone,
        });
      }
    }

    function onPickReply(reply: SuggestedReply) {
      // Layer 1 of the §6c classifier — the option already carries a
      // tone (mock: from helpyrToneFor; LLM later: from the parser
      // stripping the parenthetical label).
      recordTone(classifyApproach({ kind: 'option', reply }));

      // Snapshot history BEFORE pushing the just-picked message — the
      // service expects history to exclude the current userMessage.
      const history = toModelHistory(messages);
      renderPlayerMessage(reply.text);
      clearOptions();

      const promise = contact.service.askModel({
        systemPrompt: contact.buildSystemPrompt(),
        history,
        userMessage: reply.text,
      });
      renderResponseTurnWithStalling(promise, commitResult);
    }

    function submitFreeform() {
      const raw = inputEl.value.trim();
      if (!raw) return;

      // Layer 2 of the §6c classifier — route through the contact's
      // per-character keyword classifier. Layer 3 (failure → neutral)
      // is owned by that function.
      recordTone(classifyApproach({
        kind: 'freeform',
        text: raw,
        perCharacter: contact.classifyApproach,
      }));

      const history = toModelHistory(messages);
      renderPlayerMessage(raw);
      inputEl.value = '';
      clearOptions();

      const promise = contact.service.askModel({
        systemPrompt: contact.buildSystemPrompt(),
        history,
        userMessage: raw,
      });
      renderResponseTurnWithStalling(promise, commitResult);
    }

    // Click anywhere in the log fast-forwards the active typer.
    logEl.addEventListener('click', () => {
      if (activeTyper) activeTyper.skip();
    });

    // Earlier-in-this-transmission chip → opens a read-only Log
    // window with the full conversation paginated. Passing the live
    // messages array (not a snapshot) means a Log opened mid-chat
    // will reflect any subsequent messages — closing the live Uplink
    // doesn't disturb the Log; the array stays referenced.
    earlierChip.addEventListener('click', () => {
      WindowManager.open('uplinkLog', {
        contact: { name: contact.name, avatarClass: contact.avatarClass },
        messages
      });
    });

    sendBtn.addEventListener('click', submitFreeform);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitFreeform();
      }
    });

    // Kick off the conversation. The intro turn doesn't fire stalling
    // — there's no preceding player action, so HELPYR has nothing to
    // be filling time about. Subsequent turns (option picks, freeform)
    // route through the stalling crossfade.
    const introPromise = contact.service.askModel({
      systemPrompt: contact.buildSystemPrompt(),
      history: [],
      userMessage: '',
    });
    renderResponseTurnNoStalling(introPromise, commitResult);
  }
};
