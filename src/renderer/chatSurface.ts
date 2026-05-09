// Shared chat-surface module — extracted from apps/uplink.ts in slice
// 1.6 (2026-05-08) so both Uplink (remote-AI messenger) and HELPYR
// (local-AI desktop assistant) can share the conversation engine
// without copy-paste drift.
//
// Architecture §6a–§6f still applies: ChatContact (formerly
// UplinkContact) talks to its NPC through ModelService; never walks
// the canned dialogue tree directly. The first ModelService
// implementation is MockModelService wrapping the PoC dialogue trees,
// so phase-A behavior is identical to the pre-seam engine. The real
// llama.cpp transport lands in a later phase by swapping the service
// at construction.
//
// Phase B addition: stalling-line crossfade contract (§6e). Player-send
// turns immediately render a character-voice "stalling" line into a
// new NPC bubble while the askModel promise is in flight. When the
// real reply lands, the stalling typing stops at the next word
// boundary, a brief pause beat is inserted, then the real reply
// renders into the SAME bubble — one continuous message. If the
// stalling renders out before the reply arrives, an animated "still
// thinking" indicator shows until the reply lands. The intro turn
// (app open) doesn't fire stalling because there's no preceding
// player action.
//
// Themeing: this module emits `.uplink-*` CSS class names regardless
// of theme — they're effectively `.chat-*` (the names are historical;
// renaming is a polish item). Per-theme CSS overlays are scoped under
// `.uplink-root.theme-helpyr` (etc.) in main.css.

import type { AppContext } from './types';
import { GameState } from './game/state';
import { WindowManager } from './windows';
import type {
  ModelService,
  AskRequest,
  AskResult,
  SuggestedReply,
  ApproachTone,
  ModelChatMessage,
  FallbackHandler,
} from './game/modelService';
import { classifyApproach } from './game/approachClassifier';

// Shared with the read-only Log viewer (apps/uplinkLog.ts). Both the
// live chat and the archive consume the same message shape so the
// contact's full transcript can be passed across without massaging.
export type ChatMessage =
  | { kind: 'npc'; speaker: string; avatarClass: string; text: string }
  | { kind: 'player'; text: string };

// Slim contact record handed to the Log viewer — just what it needs
// to render bubbles + title.
export type ChatContactRef = { name: string; avatarClass: string };

// Contact spec — adding a future NPC means adding an entry, not
// changing the engine. Each contact owns its ModelService instance;
// per-conversation state lives in the messages history passed on each
// call, never in the service.
export type ChatContact = {
  name: string;
  avatarClass: string;
  service: ModelService;
  /** Built per-request, not stored statically, so any state-block
   *  placeholders in the persona prompt reflect the current
   *  GameState on every turn. The mock service ignores this entirely
   *  (it walks the canned tree); the live transport prepends it as
   *  the system message. */
  buildSystemPrompt: () => string;
  /** Pool the stalling-line picker draws from (§6e). Order doesn't
   *  matter; selection is uniformly random with a no-repeat-within-
   *  last-N rule. */
  stallingPool: readonly string[];
  typeMs: number;
  pauseMs: number;
  /** Threshold for falling back to a canned stalling line. */
  stallingThresholdMs?: number;
  /** Per-character keyword classifier for freeform input (architecture
   *  §6c, layer 2). Returns the §6c tone vocabulary; must return
   *  'neutral' on no match — never guess. */
  classifyApproach: (input: string) => ApproachTone;
};

// Structural type for a fallback-pool entry. Per-character pools
// (HelpyrFallbackPool, QuillFallbackPool) match this shape; the
// chat-surface engine doesn't need to know which character's pool
// it's working with.
export type FallbackEntry = {
  reply: string;
  options: { text: string; tone: ApproachTone }[];
};

// Top-bar configuration. Uplink uses 'back' (return to contact list);
// HELPYR uses 'identity' (no back affordance, but the strip anchors
// the player in HELPYR's voice since there's no contact-list context).
// 'none' is a fallback that just floats the Earlier chip alone.
export type TopbarLeft =
  | { kind: 'back'; label: string; onBack: () => void }
  | { kind: 'identity'; avatarClass: string; name: string; tagline: string }
  | { kind: 'none' };

export type ChatSurfaceConfig = {
  contact: ChatContact;
  /** Used in `${contactKey}/conversationCompleted` GameState dispatch
   *  so per-character reducers can route correctly. Caller knows the
   *  registry key; the contact spec doesn't carry it. */
  contactKey: string;
  /** Class added to .uplink-root for theme-specific CSS overrides
   *  (e.g. 'theme-helpyr' for the XP-blue HELPYR app). */
  themeClass?: string;
  /** What goes on the left side of the topbar — Back chip, identity
   *  strip, or nothing. */
  topbarLeft?: TopbarLeft;
  /** Window title format. Defaults to `contact.name`. Uplink overrides
   *  to `${contact.name} — Uplink`. */
  titleFormat?: (contact: ChatContact) => string;
  /** Window taskbar glyph class. Defaults to `contact.avatarClass`. */
  glyphFormat?: (contact: ChatContact) => string;
};

export function toModelHistory(msgs: ChatMessage[]): ModelChatMessage[] {
  return msgs.map((m) =>
    m.kind === 'npc'
      ? { role: 'assistant' as const, text: m.text }
      : { role: 'user' as const, text: m.text },
  );
}

// No-repeat-in-last-N stalling picker. Window size capped to pool-1
// so a small pool can't paint itself into a no-options corner.
export function makeStallingPicker(pool: readonly string[]): () => string {
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
// canned reply.
export function makeFallbackHandler(pool: readonly FallbackEntry[]): FallbackHandler {
  if (pool.length === 0) {
    return (_req, reason) => ({
      reply: `[fallback pool empty — ${reason}]`,
      suggestedReplies: [],
      conversationEnded: false,
      source: 'fallback',
    });
  }
  const windowN = Math.min(3, Math.max(1, pool.length - 1));
  const recent: FallbackEntry[] = [];
  return (_req: AskRequest, reason: string): AskResult => {
    const available = pool.filter((entry) => !recent.includes(entry));
    const choice = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]!
      : pool[0]!;
    recent.push(choice);
    if (recent.length > windowN) recent.shift();
    if (typeof console !== 'undefined') {
      console.info('[Chat] LLM fallback fired:', reason);
    }
    return {
      reply: choice.reply,
      suggestedReplies: choice.options.map((o) => ({ text: o.text, tone: o.tone })),
      conversationEnded: false,
      source: 'fallback',
    };
  };
}

export function renderChatSurface(
  container: HTMLElement,
  ctx: AppContext,
  config: ChatSurfaceConfig,
): void {
  const { contact, contactKey, themeClass, topbarLeft = { kind: 'none' } } = config;
  const titleFormat = config.titleFormat ?? ((c) => c.name);
  const glyphFormat = config.glyphFormat ?? ((c) => c.avatarClass);

  ctx.setTitle(titleFormat(contact));
  ctx.setGlyph(glyphFormat(contact));

  // Build topbar-left HTML based on config. All three variants share the
  // same flex slot so the Earlier chip floats right consistently.
  let topbarLeftHtml = '';
  if (topbarLeft.kind === 'back') {
    topbarLeftHtml = `<button class="uplink-back-chip" data-focusable="true" tabindex="0">${escapeHtml(topbarLeft.label)}</button>`;
  } else if (topbarLeft.kind === 'identity') {
    topbarLeftHtml = `
      <div class="helpyr-identity">
        <span class="helpyr-identity-avatar ${topbarLeft.avatarClass}" aria-hidden="true"></span>
        <span class="helpyr-identity-text">
          <span class="helpyr-identity-name">${escapeHtml(topbarLeft.name)}</span>
          <span class="helpyr-identity-tagline">${escapeHtml(topbarLeft.tagline)}</span>
        </span>
      </div>
    `;
  }

  const rootClass = themeClass ? `uplink-root ${themeClass}` : 'uplink-root';

  container.innerHTML = `
    <div class="${rootClass}">
      <div class="uplink-topbar">
        ${topbarLeftHtml}
        <button class="uplink-earlier-chip" data-focusable="true" tabindex="0" hidden>▲ Earlier</button>
      </div>
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
  const backChip = container.querySelector('.uplink-back-chip') as HTMLButtonElement | null;

  // ---------- Conversation engine ----------
  type Typer = { skip(): void };
  /** Char-typer with the additional ability to gracefully stop at the
   *  next word boundary. Used by the stalling-line crossfade so the
   *  filler line doesn't get cut mid-word when the real reply lands. */
  type CharsTyper = Typer & { stopAtBoundary(cb: () => void): void };
  let activeTyper: Typer | null = null;

  const pickStalling = makeStallingPicker(contact.stallingPool);

  const messages: ChatMessage[] = [];
  let hasTrimmed = false;

  // Live-tail behavior: log uses flex column-reverse so newest message
  // anchors to the bottom; older bubbles drift up and are removed
  // once they slide above the visible area. Trim is rAF-deferred so
  // it measures against settled layout.
  let trimScheduled = false;
  function trimFromTop() {
    if (trimScheduled) return;
    trimScheduled = true;
    requestAnimationFrame(() => {
      trimScheduled = false;
      const logRect = logEl.getBoundingClientRect();
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

  const logResizeObserver = new ResizeObserver(() => trimFromTop());
  logResizeObserver.observe(logEl);

  let playerTone: ApproachTone | null = null;
  function recordTone(tone: ApproachTone) {
    if (!playerTone && tone !== 'neutral') playerTone = tone;
  }
  let conversationCompleted = false;

  function setControlsEnabled(on: boolean) {
    controlsEl.classList.toggle('disabled', !on);
  }

  function appendBubble(speaker: string, who: 'player' | 'npc', avatarClass: string) {
    const msg = document.createElement('div');
    msg.className = 'uplink-msg ' + (who === 'player' ? 'player' : 'npc');
    msg.innerHTML = `
      <div class="avatar ${avatarClass}"></div>
      <div class="bubble"><span class="speaker"></span></div>
    `;
    msg.querySelector('.speaker')!.textContent = speaker + ': ';
    logEl.insertBefore(msg, logEl.firstChild);
    trimFromTop();
    return msg.querySelector('.bubble') as HTMLElement;
  }

  function applyFallbackGlitch(bubble: HTMLElement, source: AskResult['source']) {
    if (source !== 'fallback') return;
    const msg = bubble.closest('.uplink-msg');
    if (msg) msg.classList.add('fallback');
  }

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

  function makeThinkingIndicator(tag: 'span' | 'div'): HTMLElement {
    const el = document.createElement(tag);
    el.className = 'uplink-thinking';
    el.innerHTML = '<i></i><i></i><i></i>';
    return el;
  }

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

  function renderResponseTurnNoStalling(
    promise: Promise<AskResult>,
    onAllDone: (result: AskResult) => void,
  ) {
    setControlsEnabled(false);
    const bubble = appendBubble(contact.name, 'npc', contact.avatarClass);
    const indicatorEl = makeThinkingIndicator('span');
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
      renderTextSegmentsInto(bubble, result.reply, true, () => onAllDone(result));
    });
  }

  function renderResponseTurnWithStalling(
    promise: Promise<AskResult>,
    onAllDone: (result: AskResult) => void,
  ) {
    setControlsEnabled(false);
    const thresholdMs = contact.stallingThresholdMs ?? 10000;

    const bubble = appendBubble(contact.name, 'npc', contact.avatarClass);
    let indicatorEl: HTMLElement | null = makeThinkingIndicator('span');
    bubble.appendChild(indicatorEl);
    trimFromTop();

    let stallingLine: string | null = null;
    let stallingTranscript: ChatMessage | null = null;
    let stallingTyper: CharsTyper | null = null;
    let stallingDone = false;
    let postStallingIndicator: HTMLElement | null = null;
    let realResult: AskResult | null = null;

    function clearInitialIndicator() {
      if (indicatorEl) {
        indicatorEl.remove();
        indicatorEl = null;
      }
    }

    function startMergeWithReal(result: AskResult) {
      if (stallingTranscript && stallingLine) {
        stallingTranscript.text = stallingLine + '\n...\n' + result.reply;
      }
      applyFallbackGlitch(bubble, result.source);
      const pauseEl = document.createElement('div');
      pauseEl.className = 'uplink-pause';
      pauseEl.textContent = '. . .';
      bubble.appendChild(pauseEl);
      trimFromTop();
      setTimeout(() => {
        renderTextSegmentsInto(bubble, result.reply, true, () => onAllDone(result));
      }, Math.floor(contact.pauseMs / 2));
    }

    function startRealReplyDirect(result: AskResult) {
      clearInitialIndicator();
      applyFallbackGlitch(bubble, result.source);
      messages.push({
        kind: 'npc',
        speaker: contact.name,
        avatarClass: contact.avatarClass,
        text: result.reply,
      });
      renderTextSegmentsInto(bubble, result.reply, true, () => onAllDone(result));
    }

    const thresholdTimer = setTimeout(() => {
      if (realResult) return;
      clearInitialIndicator();
      stallingLine = pickStalling();
      stallingTranscript = {
        kind: 'npc',
        speaker: contact.name,
        avatarClass: contact.avatarClass,
        text: stallingLine,
      };
      messages.push(stallingTranscript);
      const stallSpan = document.createElement('span');
      bubble.appendChild(stallSpan);
      stallingTyper = typeInto(stallSpan, stallingLine, contact.typeMs, () => {
        stallingDone = true;
        activeTyper = null;
        if (realResult) {
          startMergeWithReal(realResult);
        } else {
          postStallingIndicator = makeThinkingIndicator('div');
          bubble.appendChild(postStallingIndicator);
          trimFromTop();
        }
      });
      activeTyper = stallingTyper;
    }, thresholdMs);

    promise.then((result) => {
      realResult = result;
      clearTimeout(thresholdTimer);
      if (indicatorEl) {
        startRealReplyDirect(result);
      } else if (stallingTyper && !stallingDone) {
        stallingTyper.stopAtBoundary(() => {
          stallingDone = true;
          activeTyper = null;
          startMergeWithReal(result);
        });
      } else if (postStallingIndicator) {
        postStallingIndicator.remove();
        postStallingIndicator = null;
        startMergeWithReal(result);
      }
    });
  }

  function renderPlayerMessage(text: string) {
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

  function commitResult(result: AskResult) {
    if (result.suggestedReplies.length > 0) {
      showOptions(result.suggestedReplies);
    } else {
      setControlsEnabled(true);
    }
    if (result.conversationEnded && !conversationCompleted) {
      conversationCompleted = true;
      GameState.dispatch({
        type: `${contactKey}/conversationCompleted`,
        tone: playerTone,
      });
    }
  }

  function onPickReply(reply: SuggestedReply) {
    recordTone(classifyApproach({ kind: 'option', reply }));
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

  logEl.addEventListener('click', () => {
    if (activeTyper) activeTyper.skip();
  });

  earlierChip.addEventListener('click', () => {
    WindowManager.open('uplinkLog', {
      contact: { name: contact.name, avatarClass: contact.avatarClass },
      messages,
    });
  });

  if (backChip && topbarLeft.kind === 'back') {
    const onBack = topbarLeft.onBack;
    backChip.addEventListener('click', () => {
      logResizeObserver.disconnect();
      onBack();
    });
  }

  sendBtn.addEventListener('click', submitFreeform);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitFreeform();
    }
  });

  // Kick off the conversation. The intro turn doesn't fire stalling
  // — there's no preceding player action, so no filler context.
  const introPromise = contact.service.askModel({
    systemPrompt: contact.buildSystemPrompt(),
    history: [],
    userMessage: '',
  });
  renderResponseTurnNoStalling(introPromise, commitResult);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    c === '&' ? '&amp;' :
    c === '<' ? '&lt;' :
    c === '>' ? '&gt;' :
    c === '"' ? '&quot;' :
    '&#39;'
  ));
}
