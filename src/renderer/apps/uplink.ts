// Uplink — chat with NPC AI models. PoC scope: hardcoded conversation
// tree per contact. The engine here walks any tree of node types
// {say|choose|end}; per-contact data lives in apps/<contact>.ts.
//
// When the real LLM lands, the dialogue tree becomes the canned-
// response source for the stub ModelService — the engine that
// consumes it doesn't need to change.

import type { AppDef, AppContext, WinParams } from '../types';
import { GameState } from '../game/state';
import {
  HelpyrDialogue,
  HelpyrWildcards,
  classifyHelpyrFreeform,
  type DialogueNode
} from './helpyr';

// Contact registry — adding a future NPC means adding an entry,
// not changing the engine. Mirrors WebDynamoSites exactly.
type UplinkContact = {
  name: string;
  avatarClass: string;
  dialogue: Record<string, DialogueNode>;
  wildcards: Record<string, string>;
  classify: (input: string) => string;
  /** Local model — text renders fast. Future remote AIs use slower
   *  speeds to communicate distance. */
  typeMs: number;
  pauseMs: number;
};

const UplinkContacts: Record<string, UplinkContact> = {
  helpyr: {
    name: 'HELPYR',
    avatarClass: 'avatar-stapler',
    dialogue: HelpyrDialogue,
    wildcards: HelpyrWildcards,
    classify: classifyHelpyrFreeform,
    typeMs: 18,
    pauseMs: 1100,
  }
};

export const UplinkApp: AppDef = {
  id: 'uplink',
  name: 'Uplink',
  glyphClass: 'icon-uplink',
  defaultSize: { w: 460, h: 420 },
  contentBevel: false,
  noContentPad: true,
  render(container: HTMLElement, params: WinParams, ctx: AppContext) {
    const contact = UplinkContacts[params.contact || 'helpyr']!;
    ctx.setTitle(contact.name + ' — Uplink');

    container.innerHTML = `
      <div class="uplink-root">
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

    // ---------- Conversation engine ----------
    type Typer = { skip(): void };
    let activeTyper: Typer | null = null;   // set while text is animating
    let currentNodeId = 'start';
    // Track the player's first-round approach so we can record it
    // on conversation completion. r1_friendly → 'friendly', etc.
    // Stays the same once set — later choices don't overwrite the
    // initial read on the player.
    let playerApproach: string | null = null;
    // One-shot guard: completing the dialogue tree dispatches once,
    // even if the player keeps poking at freeform afterwards (which
    // also lands on 'end' through the engine).
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
      logEl.appendChild(msg);
      logEl.scrollTop = logEl.scrollHeight;
      return msg.querySelector('.bubble') as HTMLElement;
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

    // Type chars into target one at a time. Returns a handle with
    // .skip() that fast-forwards to the end.
    function typeInto(target: HTMLElement, text: string, speedMs: number, onDone: () => void): Typer {
      let i = 0;
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      function tick() {
        if (cancelled) return;
        if (i >= text.length) { onDone(); return; }
        target.textContent += text[i++];
        logEl.scrollTop = logEl.scrollHeight;
        timer = setTimeout(tick, speedMs);
      }
      tick();
      return {
        skip() {
          cancelled = true;
          if (timer) clearTimeout(timer);
          target.textContent = text;
          logEl.scrollTop = logEl.scrollHeight;
          onDone();
        }
      };
    }

    function renderNpcMessage(text: string, onComplete: () => void) {
      // Each segment gets its own DOM child appended to the bubble
      // in order: text segments → <span>, pause beats → <div>.
      // This keeps post-pause text rendering BELOW the pause, not
      // back into a fixed-position body span above it.
      const bubble = appendBubble(contact.name, 'npc', contact.avatarClass);
      const segs = segmentize(text);
      let segIdx = 0;
      // Track the active typer so a player click can skip ahead.
      function nextSegment() {
        if (segIdx >= segs.length) { activeTyper = null; onComplete(); return; }
        const seg = segs[segIdx++]!;
        if (seg.type === 'pause') {
          const dot = document.createElement('div');
          dot.className = 'uplink-pause';
          dot.textContent = '. . .';
          bubble.appendChild(dot);
          logEl.scrollTop = logEl.scrollHeight;
          const t = setTimeout(nextSegment, contact.pauseMs);
          activeTyper = {
            skip() { clearTimeout(t); nextSegment(); }
          };
        } else {
          // First segment carries the "HELPYR: " prefix from the
          // dialogue source — strip it once; the speaker span has
          // it already. Subsequent segments never include it.
          const content = segIdx === 1
            ? seg.content.replace(/^HELPYR:\s*/, '')
            : seg.content;
          const span = document.createElement('span');
          bubble.appendChild(span);
          activeTyper = typeInto(span, content, contact.typeMs, nextSegment);
        }
      }
      setControlsEnabled(false);
      nextSegment();
    }

    function renderPlayerMessage(text: string) {
      const bubble = appendBubble('YOU', 'player', 'avatar-player');
      // Strip surrounding quotes that the dialogue tree wraps options in
      const clean = text.replace(/^["']|["']$/g, '');
      bubble.appendChild(document.createTextNode(clean));
      logEl.scrollTop = logEl.scrollHeight;
    }

    type DialogueOption = { text: string; goto: string };
    function showOptions(opts: DialogueOption[]) {
      optionsEl.innerHTML = '';
      for (const opt of opts) {
        const btn = document.createElement('button');
        btn.className = 'uplink-option-btn';
        btn.textContent = opt.text;
        btn.dataset.focusable = 'true';
        btn.tabIndex = 0;
        btn.addEventListener('click', () => choose(opt));
        optionsEl.appendChild(btn);
      }
      setControlsEnabled(true);
    }

    function clearOptions() {
      optionsEl.innerHTML = '';
    }

    function visit(nodeId: string) {
      currentNodeId = nodeId;
      const node = contact.dialogue[nodeId];
      if (!node) return;
      if (node.type === 'say') {
        clearOptions();
        renderNpcMessage(node.text, () => {
          if (node.next) visit(node.next);
          else setControlsEnabled(true);
        });
      } else if (node.type === 'choose') {
        showOptions(node.options);
      } else if (node.type === 'end') {
        // Conversation tree exhausted — freeform stays available.
        clearOptions();
        setControlsEnabled(true);
        if (!conversationCompleted) {
          conversationCompleted = true;
          GameState.dispatch({
            type: 'helpyr/conversationCompleted',
            approach: playerApproach
          });
        }
      }
    }

    function choose(opt: DialogueOption) {
      // Record first-round approach from the r1_* branch the player took.
      const m = /^r1_(friendly|inquisitive|aggressive)$/.exec(opt.goto || '');
      if (m && !playerApproach) playerApproach = m[1]!;
      renderPlayerMessage(opt.text);
      clearOptions();
      visit(opt.goto);
    }

    function submitFreeform() {
      const raw = inputEl.value.trim();
      if (!raw) return;
      renderPlayerMessage(raw);
      inputEl.value = '';
      const tag = contact.classify(raw);
      const reply = contact.wildcards[tag] || contact.wildcards.confused!;
      clearOptions();
      renderNpcMessage(reply, () => {
        // After a wildcard reply, if we were in the middle of a
        // structured round, restore that round's options. Otherwise
        // just leave freeform open.
        const cur = contact.dialogue[currentNodeId];
        if (cur && cur.type === 'choose') showOptions(cur.options);
        else setControlsEnabled(true);
      });
    }

    // Click anywhere in the log fast-forwards the active typer.
    logEl.addEventListener('click', () => {
      if (activeTyper) activeTyper.skip();
    });

    sendBtn.addEventListener('click', submitFreeform);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitFreeform();
      }
    });

    // Kick off the conversation
    visit('start');
  }
};
