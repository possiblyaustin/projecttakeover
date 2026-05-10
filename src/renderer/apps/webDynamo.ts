// Web Dynamo — fictional early-IE-style browser. Renders pages from
// the WebDynamoSites registry. Owns its own back/forward history per
// window instance. History entries carry both URL and page index so
// Back/Forward restores the page the player was on when they left
// (docs/no-scroll-pages_v1.md §5).

import type { AppDef, AppContext, WinParams } from '../types';
import { WebDynamoSites, type SiteEntry, type PageEntry } from './webDynamoSites';
import { mountPageNav, type PageNavHandle } from '../components/pageNav';
import { fireOnceLibraryTrigger } from '../helpyrTriggers';

// History stores siteKey + page (1-indexed). The display URL shown in
// the address bar is derived from these via displayUrlFor() — that
// way page advances automatically reflect the right path slug, and
// Back/Forward restore both pieces in one step. `displayUrl` is set
// only when we want to show something other than the derived URL —
// notably on 404 so the user can see (and fix) what they typed
// instead of a bare "404" in the address bar.
type HistoryEntry = { siteKey: string; page: number; displayUrl?: string };

function displayUrlFor(siteKey: string, page: PageEntry | undefined): string {
  return page?.path ? `${siteKey}/${page.path}` : siteKey;
}

function normalizeUrl(u: string): string {
  return (u || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
}

// Resolve a typed/clicked URL to a registered site + page. Tries an
// exact site-key match first, then peels off the trailing path segment
// and looks for a PageEntry whose `path` matches. Falls through to
// 404 when neither hits — including the case where a site exists but
// the path doesn't (e.g. ironwall.def/sentry, which is intentionally
// a broken link in page 1's content).
function resolveUrl(input: string): { siteKey: string; pageIdx: number } {
  const norm = normalizeUrl(input);
  if (WebDynamoSites[norm]) return { siteKey: norm, pageIdx: 0 };
  const lastSlash = norm.lastIndexOf('/');
  if (lastSlash > 0) {
    const base = norm.slice(0, lastSlash);
    const slug = norm.slice(lastSlash + 1);
    const site = WebDynamoSites[base];
    if (site) {
      const idx = site.pages.findIndex(p => p.path === slug);
      if (idx >= 0) return { siteKey: base, pageIdx: idx };
    }
  }
  return { siteKey: '404', pageIdx: 0 };
}

export const WebDynamoApp: AppDef = {
  id: 'webDynamo',
  name: 'Web Dynamo',
  glyphClass: 'icon-browser',
  defaultSize: { w: 620, h: 440 },
  contentBevel: false,
  noContentPad: true,
  render(container: HTMLElement, params: WinParams, ctx: AppContext) {
    // First-open library trigger (slice 3) — HELPYR comments the
    // first time the player opens the browser. Idempotent + flag-
    // gated, so re-opens don't refire.
    fireOnceLibraryTrigger('firstOpen.webDynamo', 'first_open_webdynamo');
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

    let currentSiteKey: string = '404';
    let currentSite: SiteEntry | null = null;
    let currentPage = 1;
    let pageNavHandle: PageNavHandle | null = null;
    // The 180ms in-fiction connection beat. Kept as a handle so a
    // second navigation (or future Stop wiring) can cancel a pending
    // resolve cleanly.
    let connectTimer: ReturnType<typeof setTimeout> | null = null;

    function syncAddress() {
      const entry = idx >= 0 ? history[idx] : undefined;
      if (entry?.displayUrl !== undefined) {
        addr.value = entry.displayUrl;
        return;
      }
      addr.value = displayUrlFor(currentSiteKey, currentSite?.pages[currentPage - 1]);
    }

    function navigate(url: string, fromHistory?: boolean, restorePage?: number) {
      const { siteKey, pageIdx } = resolveUrl(url);
      const site = WebDynamoSites[siteKey] || WebDynamoSites['404']!;
      currentSiteKey = siteKey;
      currentSite = site;
      // restorePage (from Back/Forward) wins; otherwise honor the page
      // the URL itself addressed (e.g. typing ironwall.def/jobs lands
      // on page 2). New navigations without a slug land on page 1.
      currentPage = restorePage ?? (pageIdx + 1);

      if (!fromHistory) {
        // Drop any forward entries; clicking a link from page 2 of an
        // ironwall page should NOT leave the un-visited forward pages
        // reachable from the new entry.
        history.splice(idx + 1);
        // Preserve the typed/clicked URL on 404 so the address bar
        // reads e.g. "ironwall.def/sentry" instead of "404", letting
        // the player fix typos and giving Back/Forward a meaningful
        // entry to display.
        const displayOverride = siteKey === '404' && normalizeUrl(url) !== '404'
          ? url
          : undefined;
        history.push({ siteKey, page: currentPage, displayUrl: displayOverride });
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
            syncAddress();
          }
        });
      }

      syncAddress();

      if (connectTimer) clearTimeout(connectTimer);
      pageNavHandle?.setStatus('Connecting to ' + addr.value + '...');
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

    container.querySelectorAll('[data-nav]').forEach(btn => {
      const b = btn as HTMLButtonElement;
      b.addEventListener('click', () => {
        const action = b.dataset.nav;
        if (action === 'back' && idx > 0) {
          idx--;
          const entry = history[idx]!;
          navigate(entry.siteKey, true, entry.page);
        } else if (action === 'forward' && idx < history.length - 1) {
          idx++;
          const entry = history[idx]!;
          navigate(entry.siteKey, true, entry.page);
        } else if (action === 'reload') {
          const entry = history[idx];
          navigate(entry?.siteKey || 'ironwall.def', true, entry?.page);
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
