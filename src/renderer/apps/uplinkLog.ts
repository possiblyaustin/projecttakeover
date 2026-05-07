// Uplink Log — read-only paginated viewer for a contact's full
// transcript. Opened by the "▲ Earlier in this transmission" chip
// in the live Uplink window. See docs/no-scroll-pages_v1.md §6.
//
// Receives a slim contact ref + a reference (not a snapshot) to the
// live conversation's messages array. Page boundaries are computed
// from actual message heights — not a fixed message count — so
// long HELPYR replies don't get clipped on small viewports (Deck).
// The earlier "5 messages per page" config knob from the design note
// is replaced by "as many as fit"; this is the real shape of the
// requirement once we hit a small screen.

import type { AppDef, AppContext, WinParams } from '../types';
import { mountPageNav, type PageNavHandle } from '../components/pageNav';
import type { ChatMessage, UplinkContactRef } from './uplink';

export const UplinkLogApp: AppDef = {
  id: 'uplinkLog',
  name: 'Uplink Log',
  glyphClass: 'icon-uplink',
  defaultSize: { w: 460, h: 420 },
  contentBevel: false,
  noContentPad: true,
  render(container: HTMLElement, params: WinParams, ctx: AppContext) {
    const contact: UplinkContactRef = params.contact || { name: 'Unknown', avatarClass: '' };
    const messages: ChatMessage[] = params.messages || [];

    ctx.setTitle(contact.name + ' — Log');
    if (contact.avatarClass) ctx.setGlyph(contact.avatarClass);

    container.innerHTML = `
      <div class="uplink-log-root">
        <div class="uplink-log-pages" data-focus-context-zone="log"></div>
      </div>
    `;

    const root = container.querySelector('.uplink-log-root') as HTMLElement;
    const pagesEl = container.querySelector('.uplink-log-pages') as HTMLElement;

    let currentPage = 1;
    // boundaries[i] = first message index of page i (1-indexed page → i-1).
    // Always starts with [0]; recomputed on mount + on resize.
    let boundaries: number[] = [0];
    let pageNavHandle: PageNavHandle | null = null;

    function totalPages(): number {
      return Math.max(1, boundaries.length);
    }

    // Compute page boundaries by appending messages off-screen and
    // measuring scrollHeight against the visible pages container's
    // height. Each page fits as many messages as can render without
    // overflow; oversized single messages get their own page (with
    // accepted clipping — the alternative is an infinite loop).
    function recomputeBoundaries() {
      const targetW = pagesEl.clientWidth;
      const targetH = pagesEl.clientHeight;
      if (targetW <= 0 || targetH <= 0) {
        boundaries = [0];
        return;
      }

      const measure = document.createElement('div');
      measure.className = 'uplink-log-pages';
      // Position off-screen with the same intrinsic size as the live
      // pages container so layout matches what the user will see.
      measure.style.position = 'absolute';
      measure.style.left = '-99999px';
      measure.style.top = '0';
      measure.style.width = targetW + 'px';
      measure.style.height = targetH + 'px';
      measure.style.visibility = 'hidden';
      document.body.appendChild(measure);

      const next: number[] = [0];
      let pageStart = 0;
      for (let i = 0; i < messages.length; i++) {
        const bubble = renderBubble(messages[i]!, contact);
        measure.appendChild(bubble);
        if (measure.scrollHeight > measure.clientHeight && i > pageStart) {
          // This message overflows the current page; it's the first
          // of a new page. Reset measure to just this message.
          measure.innerHTML = '';
          measure.appendChild(renderBubble(messages[i]!, contact));
          next.push(i);
          pageStart = i;
        }
      }
      document.body.removeChild(measure);
      boundaries = next;
    }

    function renderPage() {
      pagesEl.innerHTML = '';
      // Clamp in case the transcript shrank between renders (it doesn't
      // today — messages only ever append — but this keeps the Log
      // honest if that ever changes).
      const total = totalPages();
      if (currentPage > total) currentPage = total;

      const start = boundaries[currentPage - 1] ?? 0;
      const end = boundaries[currentPage] ?? messages.length;
      for (let i = start; i < end; i++) {
        pagesEl.appendChild(renderBubble(messages[i]!, contact));
      }
    }

    pageNavHandle = mountPageNav({
      container: root,
      scope: container,
      totalPages,
      currentPage: () => currentPage,
      goTo: (n) => {
        currentPage = n;
        renderPage();
      }
    });

    // Boundaries depend on the pages container's actual size, which
    // isn't known until layout settles. Defer to RAF, then update
    // chrome + render the active page.
    let boundariesEverComputed = false;
    function refresh() {
      const beforeTotal = totalPages();
      recomputeBoundaries();
      const newTotal = totalPages();
      // On subsequent passes (window resize, etc.) keep the player
      // roughly where they were if pagination shifted. On the first
      // pass we have no real "before" state, so just leave currentPage
      // at its initial value (1) — proportional re-aim then would
      // jump straight to the last page since beforeTotal=1.
      if (boundariesEverComputed && beforeTotal > 0 && newTotal !== beforeTotal) {
        currentPage = Math.max(1, Math.min(
          newTotal,
          Math.round((currentPage / beforeTotal) * newTotal)
        ));
      }
      boundariesEverComputed = true;
      pageNavHandle?.update();
      renderPage();
    }
    requestAnimationFrame(refresh);

    // Window can be resized (drag-resize when that lands; Deck rotation
    // also reflows). Re-pagination shouldn't drop the player off the
    // page they were on; refresh() keeps them roughly anchored.
    const ro = new ResizeObserver(() => refresh());
    ro.observe(pagesEl);
  }
};

// Same bubble shape as the live Uplink, minus the typing animation
// and per-segment pause beats — the Log is an archive, not a live
// transmission, so messages render whole.
function renderBubble(msg: ChatMessage, contact: UplinkContactRef): HTMLElement {
  const el = document.createElement('div');
  if (msg.kind === 'npc') {
    el.className = 'uplink-msg npc';
    el.innerHTML = `
      <div class="avatar ${msg.avatarClass}"></div>
      <div class="bubble"><span class="speaker"></span><span class="body"></span></div>
    `;
    el.querySelector('.speaker')!.textContent = msg.speaker + ': ';
    // Strip a leading "HELPYR: " prefix the dialogue tree wraps NPC
    // lines in — same logic as uplink.ts:renderNpcMessage.
    const body = msg.text.replace(new RegExp('^' + escapeRegex(contact.name) + ':\\s*'), '');
    el.querySelector('.body')!.textContent = body;
  } else {
    el.className = 'uplink-msg player';
    el.innerHTML = `
      <div class="avatar avatar-player"></div>
      <div class="bubble"><span class="speaker">YOU: </span><span class="body"></span></div>
    `;
    el.querySelector('.body')!.textContent = msg.text;
  }
  return el;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
