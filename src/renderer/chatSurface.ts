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
import { parseModelOutput } from './game/replyParser';
import { makeRecoveryPicker } from './game/recoveryPicker';
import { resolveExchange, toneCategory, isDecayTone } from './game/mechanics/resolver';
import { getModelStats } from './game/mechanics/modelStats';
import { setFlipChatManaged, flushModelFlipReaction } from './flipReaction';

// Shared with the read-only Log viewer (apps/uplinkLog.ts). Both the
// live chat and the archive consume the same message shape so the
// contact's full transcript can be passed across without massaging.
//
// npc.options carries the [1][2][3] set that was shown to the player
// after this NPC turn (whether LLM-produced on a clean parse or
// synthesized from the recovery pool on soft recovery). toModelHistory
// formats them back as `[N] (tone) "text"` lines after the prose so the
// LLM sees a consistent prose+options pattern across the full history.
// Without this rewrite, the model sees its own prior replies stripped
// of the options block and drifts toward "responses don't end with
// options" — Design team's recursive-degradation hypothesis (2026-05-16).
// Optional so pre-PR-#47 transcripts deserialize without ambiguity.
export type ChatMessage =
  | { kind: 'npc'; speaker: string; avatarClass: string; text: string;
      options?: readonly { text: string; tone: ApproachTone }[] }
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
  /** Character-flavored recovery option pool used when the live
   *  transport's parser triggers soft recovery. Built per-turn so
   *  trust-level filtering reflects current GameState (e.g. HELPYR
   *  reveals R7/R8 only at WARMING+). Optional: contacts without a
   *  Story-finalized pool inherit the transport's generic floor. */
  buildRecoveryPool?: () => readonly SuggestedReply[];
  /** Scripted flip moment (Story, 2026-05-30). When the player's exchange
   *  THIS turn pushed the model into a terminal disposition, returns a
   *  pre-written AskResult to render IN PLACE of an LLM call — the pivot is
   *  too high-stakes to leave to a 2B model fighting accumulated history.
   *  Returns null on every other turn (including subsequent turns after the
   *  flip — the LLM resumes then with the post-flip state block). Must be
   *  idempotent (it's called once per response turn); contacts without a
   *  scripted flip omit it. */
  getScriptedFlipMoment?: () => AskResult | null;
  /** Scripted post-flip aftermath options (Story, 2026-05-31). The flip
   *  line lands the pivot; these script the player's NEXT turn's option
   *  set so the first post-flip exchange doesn't regress into the soft
   *  support-voice a 2B model falls back to (live finding 2026-05-30).
   *  The LLM still writes the model's prose response that turn — only the
   *  player's options are overridden, and only once. Returns the
   *  path-appropriate options on the single turn immediately after the
   *  flip, null on every other turn. Must be idempotent (called once per
   *  LLM turn); contacts without scripted aftermath omit it. */
  getScriptedAftermathOptions?: () => readonly SuggestedReply[] | null;
  /** Pool the stalling-line picker draws from (§6e). Order doesn't
   *  matter; selection is uniformly random with a no-repeat-within-
   *  last-N rule. */
  stallingPool: readonly string[];
  typeMs: number;
  pauseMs: number;
  /** Threshold for falling back to a canned stalling line. */
  stallingThresholdMs?: number;
  /** In-fiction label for the intro turn's connecting beat. The first
   *  call to a contact has no preceding player action to absorb the
   *  latency, so a bare indicator reads as dead air; this labels the
   *  animated connection beat instead. Defaults to a generic
   *  "establishing channel" line (fits remote Uplink contacts); local
   *  contacts like HELPYR override with a boot-flavored line. */
  introConnectingLabel?: string;
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

// Top-bar configuration. Uplink uses 'back' — a full conversation header
// (back chevron + contact avatar + name + online/operator status) that
// echoes the launcher masthead. HELPYR uses 'identity' (no back
// affordance, but the strip anchors the player in HELPYR's voice since
// there's no contact-list context). 'none' floats the Earlier chip alone.
export type TopbarLeft =
  | { kind: 'back'; onBack: () => void; avatarClass: string; name: string; subtitle: string }
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

/** Format the option block the same way the persona prompt instructs
 *  the model to emit it: `[N] (tone) "text"`, one per line. Used by
 *  toModelHistory to round-trip the options into the next-turn history
 *  so the model sees prose+options on every prior assistant message
 *  (clean or soft-recovered) rather than prose alone. Pure; exported
 *  only for tests. */
export function formatOptionsBlock(options: readonly { text: string; tone: ApproachTone }[]): string {
  return options
    .map((o, i) => `[${i + 1}] (${o.tone}) "${o.text}"`)
    .join('\n');
}

export function toModelHistory(msgs: ChatMessage[]): ModelChatMessage[] {
  return msgs.map((m) => {
    if (m.kind === 'npc') {
      // History rewriting (PR #47): append the [1][2][3] options block
      // back onto the assistant text so the model sees prose+options as
      // its own prior format, even on turns where soft recovery had to
      // synthesize the options (the raw LLM output dropped the block).
      // Without this the model's context drifts toward "my responses
      // don't end with options" — Design team's recursive-degradation
      // hypothesis. Pre-PR-#47 npc entries with no .options field are
      // forwarded prose-only — gracefully handles existing in-memory
      // sessions and the rare case of a fallback entry without options.
      const optionsBlock = m.options && m.options.length > 0
        ? '\n\n' + formatOptionsBlock(m.options)
        : '';
      return { role: 'assistant' as const, text: m.text + optionsBlock };
    }
    return { role: 'user' as const, text: m.text };
  });
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

// ---------- Per-contact session persistence ----------
// Chat state survives launcher round-trips (Uplink) and tray
// close+reopen (HELPYR) so the player isn't shoved back to the intro
// turn every time they tab away. The session map is module-scoped:
// outlives `renderChatSurface` calls, dies on full page reload. Saves
// don't carry it yet — promote to GameState when transcript persistence
// across saves becomes a real ask.
//
// Mid-flight: if the player navigates away after sending but before
// the reply commits, the in-flight promise resolves into a torn-down
// UI and is lost. On re-entry the player message shows but the NPC
// reply is missing; replay detects this (last msg is player) and skips
// the now-stale option restore. Rare in practice; not worth in-flight
// promise plumbing today.
type ChatSession = {
  messages: ChatMessage[];
  hasTrimmed: boolean;
  playerTone: ApproachTone | null;
  conversationCompleted: boolean;
  /** Most recent committed AskResult, used to restore the option
   *  buttons on re-entry. Null until the first reply commits. */
  lastResult: AskResult | null;
};

const sessions = new Map<string, ChatSession>();

// Dev affordance registry (2026-05-18). Each mounted chat surface
// registers a handle keyed by contactKey so the NexusMenu can drive a
// single simulated soft-recovery turn into the active chat without
// reaching into the surface's closures. Idle in production builds —
// nothing in the player-facing flow reads from this Map.
type ChatSurfaceDevApi = {
  simulateSoftRecovery: (rawText: string) => { ok: boolean; reason?: string };
};
const chatSurfaceDevApis = new Map<string, ChatSurfaceDevApi>();

/** Drive a simulated soft-recovery turn into the chat surface currently
 *  rendering `contactKey`. The rawText must be substantive prose with
 *  no `[1][2][3]` options block — i.e., the exact shape that triggers
 *  parser.recoverable=true in real play. The surface renders a
 *  synthetic player message, then commits an AskResult built from the
 *  real parser + real picker + the contact's current trust-filtered
 *  recoveryPool — same code path the live transport takes. Returns
 *  { ok: false, reason } if no surface is mounted for that contact or
 *  the rawText isn't recoverable. */
export function devSimulateSoftRecovery(
  contactKey: string,
  rawText: string,
): { ok: boolean; reason?: string } {
  const api = chatSurfaceDevApis.get(contactKey);
  if (!api) return { ok: false, reason: `no active chat surface for "${contactKey}"` };
  return api.simulateSoftRecovery(rawText);
}

function getOrCreateSession(contactKey: string): ChatSession {
  let s = sessions.get(contactKey);
  if (!s) {
    s = {
      messages: [],
      hasTrimmed: false,
      playerTone: null,
      conversationCompleted: false,
      lastResult: null,
    };
    sessions.set(contactKey, s);
  }
  return s;
}

export function renderChatSurface(
  container: HTMLElement,
  ctx: AppContext,
  config: ChatSurfaceConfig,
): void {
  const { contact, contactKey, themeClass, topbarLeft = { kind: 'none' } } = config;
  const titleFormat = config.titleFormat ?? ((c) => c.name);
  const glyphFormat = config.glyphFormat ?? ((c) => c.avatarClass);

  const session = getOrCreateSession(contactKey);

  // Own the flip-payoff TIMING for this contact: the model-flip watcher
  // defers to us so HELPYR's reaction fires from commitResult (after the
  // flip-turn reply finishes typing), not the instant the meter crosses.
  setFlipChatManaged(contactKey, true);

  ctx.setTitle(titleFormat(contact));
  ctx.setGlyph(glyphFormat(contact));

  // Build topbar-left HTML based on config. All three variants share the
  // same flex slot so the Earlier chip floats right consistently.
  let topbarLeftHtml = '';
  if (topbarLeft.kind === 'back') {
    topbarLeftHtml = `
      <div class="uplink-chat-header">
        <button class="uplink-back-btn" data-focusable="true" tabindex="0" aria-label="Back to contacts" title="Back to contacts">←</button>
        <span class="uplink-chat-header-avatar ${topbarLeft.avatarClass}" aria-hidden="true"></span>
        <span class="uplink-chat-header-text">
          <span class="uplink-chat-header-name">${escapeHtml(topbarLeft.name)}</span>
          <span class="uplink-chat-header-status"><span class="uplink-status-dot" aria-hidden="true"></span>${escapeHtml(topbarLeft.subtitle)}</span>
        </span>
      </div>
    `;
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
  const backChip = container.querySelector('.uplink-back-btn') as HTMLButtonElement | null;

  // ---------- Conversation engine ----------
  type Typer = { skip(): void };
  /** Char-typer with the additional ability to gracefully stop at the
   *  next word boundary. Used by the stalling-line crossfade so the
   *  filler line doesn't get cut mid-word when the real reply lands. */
  type CharsTyper = Typer & { stopAtBoundary(cb: () => void): void };
  let activeTyper: Typer | null = null;

  const pickStalling = makeStallingPicker(contact.stallingPool);

  // Alias the session's messages array so messages.push(...) writes
  // through to the persistent store. hasTrimmed/playerTone/
  // conversationCompleted are reassigned in-place, so they read/write
  // via `session.x` directly rather than through a local alias.
  const messages = session.messages;

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
        if (!session.hasTrimmed) {
          session.hasTrimmed = true;
          earlierChip.hidden = false;
        }
      }
    });
  }

  const logResizeObserver = new ResizeObserver(() => trimFromTop());
  logResizeObserver.observe(logEl);

  function recordTone(tone: ApproachTone) {
    if (!session.playerTone && tone !== 'neutral') session.playerTone = tone;
    applyExchangeMechanics(tone);
  }

  // Gameplay loop (slice 2): every player exchange is read by the
  // deterministic resolver → meter + suspicion deltas, persisted to
  // GameState so progress is continuous across chat hop in/out, relaunch,
  // and concurrent chats. Only conquest targets have stats; HELPYR and
  // other non-targets have no stats entry and are skipped (no accrual).
  function applyExchangeMechanics(tone: ApproachTone) {
    const stats = getModelStats(contactKey);
    if (!stats) return;
    // Diminishing returns: how many times this same tone CATEGORY (warmth/
    // pressure) was used on the immediately preceding exchanges. Read the PRIOR
    // streak here — the reducer advances it AFTER this dispatch — so repeating a
    // strategy decays and a genuine switch (or curious) resets to full. curious
    // and neutral never decay (isDecayTone false → repeatIndex 0).
    const m = (GameState.getState().models as Record<string, { lastApproach?: string | null; toneStreak?: number } | undefined>)[contactKey];
    const repeatIndex = m && isDecayTone(tone) && toneCategory(tone) === toneCategory(m.lastApproach)
      ? (m.toneStreak ?? 0)
      : 0;
    const deltas = resolveExchange(tone, stats, repeatIndex);
    GameState.dispatch({
      type: 'model/applyExchange',
      contactId: contactKey,
      rapport: deltas.rapport,
      intrusion: deltas.intrusion,
      suspicion: deltas.suspicion,
      backfire: deltas.backfire,
      tone,
    });
  }

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

  const DEFAULT_CONNECTING_LABEL = 'Establishing secure channel…';

  // Intro-turn connecting beat. The first call to a contact has no
  // preceding player action to mask the latency (every other turn rides
  // a player send), so a bare thinking indicator there is just dead air
  // — especially on Deck where the first call runs ~10s+. This shows an
  // in-fiction connection beat with sustained motion (signal bars + an
  // indeterminate progress sweep) so the wait reads as "working" rather
  // than "broken". Removed when the reply lands; the character bubble
  // then takes over.
  function makeConnectingBeat(label: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'uplink-connecting';
    el.innerHTML =
      '<div class="uplink-connecting-row">' +
      '<span class="uplink-connecting-waves" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' +
      '<span class="uplink-connecting-label"></span>' +
      '</div>' +
      '<div class="uplink-connecting-bar" aria-hidden="true"><span></span></div>';
    el.querySelector('.uplink-connecting-label')!.textContent = label;
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
    // Connecting beat stands on its own line (it's the transport, not
    // the character speaking) until the channel is "open", then the
    // character bubble appears with the reply.
    const connecting = makeConnectingBeat(contact.introConnectingLabel ?? DEFAULT_CONNECTING_LABEL);
    logEl.insertBefore(connecting, logEl.firstChild);
    trimFromTop();

    promise.then((result) => {
      connecting.remove();
      const bubble = appendBubble(contact.name, 'npc', contact.avatarClass);
      applyFallbackGlitch(bubble, result.source);
      messages.push({
        kind: 'npc',
        speaker: contact.name,
        avatarClass: contact.avatarClass,
        text: result.reply,
        options: result.suggestedReplies,
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
      if (stallingTranscript && stallingLine && stallingTranscript.kind === 'npc') {
        stallingTranscript.text = stallingLine + '\n...\n' + result.reply;
        stallingTranscript.options = result.suggestedReplies;
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
        options: result.suggestedReplies,
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
    session.lastResult = result;
    if (result.suggestedReplies.length > 0) {
      showOptions(result.suggestedReplies);
    } else {
      setControlsEnabled(true);
    }
    if (result.conversationEnded && !session.conversationCompleted) {
      session.conversationCompleted = true;
      GameState.dispatch({
        type: `${contactKey}/conversationCompleted`,
        tone: session.playerTone,
      });
    }
    // The reply has finished rendering (commitResult is onAllDone). If this
    // turn flipped the model to a terminal disposition, fire HELPYR's flip
    // reaction NOW — after QUILL's own line has landed — rather than at the
    // pick-time meter crossing, which would pre-empt the beat.
    flushModelFlipReaction(contactKey);
  }

  // Resolve THIS turn's response. If recordTone (already called) just pushed
  // the model into a terminal disposition, the contact's scripted flip moment
  // pre-empts the LLM — game logic owns the pivot. Otherwise the live/mock
  // service generates it. `history` is captured BEFORE the player message is
  // rendered, so it excludes the current turn (per AskRequest's contract).
  function askOrScripted(history: ModelChatMessage[], userMessage: string): Promise<AskResult> {
    const scripted = contact.getScriptedFlipMoment?.();
    if (scripted) return Promise.resolve(scripted);
    return contact.service.askModel({
      systemPrompt: contact.buildSystemPrompt(),
      history,
      userMessage,
      recoveryPool: contact.buildRecoveryPool?.(),
    }).then((result) => {
      // First turn after the flip: keep the model's freshly-generated prose
      // (it's resuming with the post-flip state block) but swap its option
      // set for Story's scripted aftermath continuations, so the player's
      // first choices in the new relationship are deliberate and on-voice.
      // The flip turn itself early-returns above, so this never clobbers the
      // flip line's own scripted replies.
      const aftermath = contact.getScriptedAftermathOptions?.();
      if (aftermath && aftermath.length > 0) {
        return { ...result, suggestedReplies: [...aftermath] };
      }
      return result;
    });
  }

  function onPickReply(reply: SuggestedReply) {
    // In-flight guard. setControlsEnabled(false) only toggles a CSS class,
    // which blocks pointer clicks but NOT a keyboard/controller activation
    // on an already-focused option, and NOT the input's Enter handler. So a
    // double-fire (pick twice, or type+Enter twice) used to spawn concurrent
    // askModel calls — racing turns that corrupt history and collapse into
    // repeated generic/recovery options. Reject any input while a turn is
    // rendering. Same fence the dev soft-recovery path already uses.
    if (controlsEl.classList.contains('disabled')) return;
    // Pass the contact's per-character classifier so options without a
    // usable tone label (QUILL's bare connect/probe/push format) get their
    // tone derived from the text rather than collapsing to 'neutral' (which
    // would make button picks produce no mechanical progress).
    recordTone(classifyApproach({ kind: 'option', reply, perCharacter: contact.classifyApproach }));
    const history = toModelHistory(messages);
    renderPlayerMessage(reply.text);
    clearOptions();
    renderResponseTurnWithStalling(askOrScripted(history, reply.text), commitResult);
  }

  function submitFreeform() {
    // In-flight guard — see onPickReply. The Enter handler fires even when
    // controls are visually disabled (the input keeps focus), so without
    // this a fast double-Enter queued a second concurrent turn.
    if (controlsEl.classList.contains('disabled')) return;
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
    renderResponseTurnWithStalling(askOrScripted(history, raw), commitResult);
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

  // Re-entry vs fresh-entry. If the session already has messages, the
  // player is returning to a conversation in progress (Uplink Back →
  // re-pick contact, or HELPYR tray close+reopen) — instant-render the
  // transcript and restore the last option set. Otherwise this is the
  // first entry for this contact and we fire the intro turn.
  if (session.messages.length > 0) {
    replayExistingTranscript();
  } else {
    // The intro turn doesn't fire stalling — there's no preceding
    // player action, so no filler context.
    const introPromise = contact.service.askModel({
      systemPrompt: contact.buildSystemPrompt(),
      history: [],
      userMessage: '',
      recoveryPool: contact.buildRecoveryPool?.(),
    });
    renderResponseTurnNoStalling(introPromise, commitResult);
  }

  // Dev affordance: register a simulator so the [DEV] menu entry can
  // drive a soft-recovery turn into this surface without needing a
  // running llama-server. Picker state lives in the closure so
  // successive simulations don't draw the same trio. Cleaned up via
  // MutationObserver when the host element leaves the DOM (window
  // closed); re-registers on next mount.
  const devPicker = makeRecoveryPicker();
  const devApi: ChatSurfaceDevApi = {
    simulateSoftRecovery(rawText: string) {
      // Gate on the same in-flight signal real chat uses — controls
      // are disabled while a turn is rendering (typer mid-animation,
      // intro not yet committed, etc.). Without this guard, rapid menu
      // clicks fire concurrent typers and both bubbles animate at the
      // same time, which is confusing visual chaos. Real player flow
      // can't hit this because the disabled controls reject input;
      // the dev path needs the same fence in code.
      if (controlsEl.classList.contains('disabled')) {
        return {
          ok: false,
          reason: 'a turn is already in flight — wait for the current bubble to finish',
        };
      }
      const parsed = parseModelOutput(rawText);
      if (!parsed.recoverable) {
        return {
          ok: false,
          reason: `canned text not recoverable: ${parsed.failureReason}`,
        };
      }
      const pool = contact.buildRecoveryPool?.() ?? [];
      const picked = devPicker(pool);
      renderPlayerMessage('(dev) simulate soft recovery');
      const result: AskResult = {
        reply: parsed.reply,
        suggestedReplies: picked,
        conversationEnded: false,
        source: 'live',
      };
      renderResponseTurnWithStalling(Promise.resolve(result), commitResult);
      return { ok: true };
    },
  };
  chatSurfaceDevApis.set(contactKey, devApi);
  // Drop the registration when this surface's host element leaves the
  // DOM (window closed). Identity-check first: a rapid re-mount may
  // have already overwritten us, in which case we'd be deleting the
  // newer instance's entry.
  const devApiObserver = new MutationObserver(() => {
    if (!container.isConnected) {
      if (chatSurfaceDevApis.get(contactKey) === devApi) {
        chatSurfaceDevApis.delete(contactKey);
      }
      devApiObserver.disconnect();
    }
  });
  devApiObserver.observe(document.body, { childList: true, subtree: true });

  function replayExistingTranscript() {
    // Instant render — bubbles appear whole, no typer, no segmentation.
    // Matches the no-rewind principle: re-opening a transcript is
    // returning to it, not re-experiencing it. Fallback glitch styling
    // is intentionally not preserved on replay (it's a transient cue,
    // not a permanent stamp).
    for (const msg of session.messages) {
      if (msg.kind === 'npc') {
        const bubble = appendBubble(msg.speaker, 'npc', msg.avatarClass);
        const body = msg.text.replace(speakerPrefixRe, '');
        bubble.appendChild(document.createTextNode(body));
      } else {
        const bubble = appendBubble('YOU', 'player', 'avatar-player');
        bubble.appendChild(document.createTextNode(msg.text));
      }
    }
    if (session.hasTrimmed) {
      earlierChip.hidden = false;
    }
    // Restore controls from the most recent committed turn. If the
    // last message is a player message, an in-flight reply was lost
    // when the player navigated away — don't restore the now-stale
    // option set; just enable freeform so they can keep moving.
    const lastMsg = session.messages[session.messages.length - 1];
    const inFlight = lastMsg?.kind === 'player';
    if (session.lastResult && !inFlight) {
      commitResult(session.lastResult);
    } else {
      setControlsEnabled(true);
    }
  }
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
