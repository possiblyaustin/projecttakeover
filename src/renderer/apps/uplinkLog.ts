// Uplink Log — read-only paginated viewer for a contact's full
// transcript. Opened by the "▲ Earlier in this transmission" chip
// in the live Uplink window. See docs/no-scroll-pages_v1.md §6.
//
// Receives a slim contact ref + a reference (not a snapshot) to the
// live conversation's messages array. New messages appended on the
// live side are reflected here when the player navigates pages —
// page count is recomputed via mountPageNav's `totalPages` getter,
// so the Log can grow as the conversation does.

import type { AppDef, AppContext, WinParams } from '../types';
import { mountPageNav, type PageNavHandle } from '../components/pageNav';
import type { ChatMessage, UplinkContactRef } from './uplink';

const PAGE_SIZE = 5;

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

    container.innerHTML = `
      <div class="uplink-log-root">
        <div class="uplink-log-pages" data-focus-context-zone="log"></div>
      </div>
    `;

    const root = container.querySelector('.uplink-log-root') as HTMLElement;
    const pagesEl = container.querySelector('.uplink-log-pages') as HTMLElement;

    let currentPage = 1;
    let pageNavHandle: PageNavHandle | null = null;

    function totalPages(): number {
      // Always at least one page even when the transcript is empty,
      // so the chrome stays consistent.
      return Math.max(1, Math.ceil(messages.length / PAGE_SIZE));
    }

    function renderPage() {
      pagesEl.innerHTML = '';
      // Clamp in case the transcript shrank between renders. (It
      // doesn't today — messages only ever append — but this keeps
      // the Log honest if that ever changes.)
      const total = totalPages();
      if (currentPage > total) currentPage = total;

      const start = (currentPage - 1) * PAGE_SIZE;
      const slice = messages.slice(start, start + PAGE_SIZE);
      for (const msg of slice) {
        pagesEl.appendChild(renderBubble(msg, contact));
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

    renderPage();
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
