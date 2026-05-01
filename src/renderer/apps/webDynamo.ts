// Web Dynamo — fictional early-IE-style browser. Renders pages from
// the WebDynamoSites registry. Owns its own back/forward history per
// window instance. History entries carry both URL and page index so
// Back/Forward restores the page the player was on when they left
// (docs/no-scroll-pages_v1.md §5).

import type { AppDef, AppContext, WinParams } from '../types';
import { WebDynamoSites, type SiteEntry } from './webDynamoSites';
import { mountPageNav, type PageNavHandle } from '../components/pageNav';

type HistoryEntry = { url: string; page: number };

export const WebDynamoApp: AppDef = {
  id: 'webDynamo',
  name: 'Web Dynamo',
  glyphClass: 'icon-browser',
  defaultSize: { w: 620, h: 440 },
  contentBevel: false,
  noContentPad: true,
  render(container: HTMLElement, params: WinParams, ctx: AppContext) {
    container.style.background = 'var(--face)';
    container.innerHTML = `
      <div class="browser-root">
        <div class="browser-toolbar bevel-out" style="border:0; border-bottom:1px solid var(--shadow); box-shadow:none;">
          <button class="browser-btn" data-nav="back" title="Back" data-focusable="true" tabindex="0">◄</button>
          <button class="browser-btn" data-nav="forward" title="Forward" data-focusable="true" tabindex="0">►</button>
          <button class="browser-btn" data-nav="stop" title="Stop" data-focusable="true" tabindex="0">■</button>
          <button class="browser-btn" data-nav="reload" title="Reload" data-focusable="true" tabindex="0">↻</button>
          <button class="browser-btn" data-nav="home" title="Home" data-focusable="true" tabindex="0">⌂</button>
          <div class="browser-address">
            <label>Address:</label>
            <input type="text" spellcheck="false" data-focusable="true" />
          </div>
          <button class="browser-btn" data-nav="go" data-focusable="true" tabindex="0">Go</button>
        </div>
        <div class="browser-viewport" data-focus-context-zone="page"></div>
      </div>
    `;

    const root = container.querySelector('.browser-root') as HTMLElement;
    const addr = container.querySelector('.browser-address input') as HTMLInputElement;
    const viewport = container.querySelector('.browser-viewport') as HTMLElement;

    const history: HistoryEntry[] = [];
    let idx = -1;

    let currentSite: SiteEntry | null = null;
    let currentPage = 1;
    let pageNavHandle: PageNavHandle | null = null;
    // The 180ms in-fiction connection beat. Kept as a handle so a
    // second navigation (or future Stop wiring) can cancel a pending
    // resolve cleanly.
    let connectTimer: ReturnType<typeof setTimeout> | null = null;

    function navigate(url: string, fromHistory?: boolean, restorePage?: number) {
      const site = WebDynamoSites[normalize(url)] || WebDynamoSites['404']!;
      addr.value = url;
      currentSite = site;
      currentPage = restorePage ?? 1;

      if (!fromHistory) {
        // Drop any forward entries; clicking a link from page 2 of an
        // ironwall page should NOT leave the un-visited forward pages
        // reachable from the new entry.
        history.splice(idx + 1);
        history.push({ url, page: currentPage });
        idx = history.length - 1;
      }

      // Tear down any previous nav bar before deciding whether the
      // new site needs one. Simpler than diffing.
      if (pageNavHandle) {
        pageNavHandle.destroy();
        pageNavHandle = null;
      }
      if (site.pages.length > 1) {
        pageNavHandle = mountPageNav({
          container: root,
          // Scope = whole window content so PgUp/PgDn fired anywhere
          // in this Web Dynamo instance advances pages. cursor.ts
          // already bails out of this branch when focus is in a text
          // input, so the address bar still gets normal cursor keys.
          scope: container,
          totalPages: () => site.pages.length,
          currentPage: () => currentPage,
          goTo: (n) => {
            currentPage = n;
            // Snapshot the new page into the active history entry so
            // a later Back lands on this page, not page 1.
            if (idx >= 0) history[idx]!.page = n;
            renderCurrentPage();
          }
        });
      }

      if (connectTimer) clearTimeout(connectTimer);
      pageNavHandle?.setStatus('Connecting to ' + url + '...');
      viewport.innerHTML = '';
      connectTimer = setTimeout(() => {
        connectTimer = null;
        renderCurrentPage();
        pageNavHandle?.setStatus(null);
        ctx.setTitle(site.title + ' - Web Dynamo');
      }, 180);

      updateNavButtons();
    }

    function renderCurrentPage() {
      if (!currentSite) return;
      viewport.innerHTML = '';
      const page = currentSite.pages[currentPage - 1];
      if (!page) return;
      page.render(viewport);
      // Tag any links inside the page as focusable for D-pad / focus mode.
      viewport.querySelectorAll('a[data-href]').forEach(a => {
        a.setAttribute('data-focusable', 'true');
        if (!a.hasAttribute('tabindex')) a.setAttribute('tabindex', '0');
      });
    }

    function updateNavButtons() {
      (container.querySelector('[data-nav="back"]') as HTMLButtonElement).disabled = idx <= 0;
      (container.querySelector('[data-nav="forward"]') as HTMLButtonElement).disabled = idx >= history.length - 1;
    }

    function normalize(u: string) {
      return (u || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    }

    container.querySelectorAll('[data-nav]').forEach(btn => {
      const b = btn as HTMLButtonElement;
      b.addEventListener('click', () => {
        const action = b.dataset.nav;
        if (action === 'back' && idx > 0) {
          idx--;
          const entry = history[idx]!;
          navigate(entry.url, true, entry.page);
        } else if (action === 'forward' && idx < history.length - 1) {
          idx++;
          const entry = history[idx]!;
          navigate(entry.url, true, entry.page);
        } else if (action === 'reload') {
          const entry = history[idx];
          navigate(entry?.url || 'ironwall.def', true, entry?.page);
        } else if (action === 'home') {
          navigate('nexus:home');
        } else if (action === 'go') {
          navigate(addr.value);
        } else if (action === 'stop') {
          if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
          pageNavHandle?.setStatus('Stopped');
        }
      });
    });
    addr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') navigate(addr.value);
    });

    // Intercept internal links inside viewport
    viewport.addEventListener('click', (e) => {
      const a = (e.target as Element).closest('a[data-href]') as HTMLElement | null;
      if (a) { e.preventDefault(); navigate(a.dataset.href || ''); }
    });

    navigate(params.url || 'ironwall.def');
  }
};
