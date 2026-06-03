// Web Dynamo — fictional early-IE-style browser. Renders pages from
// the WebDynamoSites registry. Owns its own back/forward history per
// window instance. History entries carry both URL and page index so
// Back/Forward restores the page the player was on when they left
// (docs/no-scroll-pages_v1.md §5).

import type { AppDef, AppContext, WinParams } from '../types';
import { WebDynamoSites, type SiteEntry, type PageEntry } from './webDynamoSites';
import { registerPagedScope, unregisterPagedScope } from '../components/pageNav';
import { fireOnceLibraryTrigger } from '../helpyrTriggers';
import { WindowManager } from '../windows';
import { GameState } from '../game/state';
import { visibleBookmarks } from './webDynamoBookmarks';

// Site key for InkWell — reaching it satisfies the Act 1 spine's browser
// leg, so it both suppresses the QueryCrawl follow-up nudge and marks the
// onboarding path's progress. Kept as a const so the flag bridge and the
// nudge guard can't drift from the registry key.
const INKWELL_SITE_KEY = 'inkwell-digital.com';

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

    // Follow-up onboarding nudge (Story, 2026-05-30): if the player opens
    // the browser but hasn't reached InkWell after a beat, HELPYR points
    // at QueryCrawl. fireOnceLibraryTrigger's flag guard means only the
    // first browser instance's timer that survives long enough fires it;
    // the reachedInkwell check bails if the player already found their way.
    setTimeout(() => {
      if (GameState.getState().flags['web.reachedInkwell']) return;
      fireOnceLibraryTrigger('onboarding.browserHint', 'onboarding_browser_idle');
    }, 35000);
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
        <div class="browser-bookmarks" data-bookmarks></div>
        <div class="browser-viewport" data-focus-context-zone="page"></div>
      </div>
    `;

    const addr = container.querySelector('.browser-address input') as HTMLInputElement;
    const viewport = container.querySelector('.browser-viewport') as HTMLElement;
    const bookmarksEl = container.querySelector('[data-bookmarks]') as HTMLElement;

    const history: HistoryEntry[] = [];
    let idx = -1;

    let currentSiteKey: string = '404';
    let currentSite: SiteEntry | null = null;
    let currentPage = 1;
    // The 180ms in-fiction connection beat. Kept as a handle so a
    // second navigation (or future Stop wiring) can cancel a pending
    // resolve cleanly.
    let connectTimer: ReturnType<typeof setTimeout> | null = null;

    // Transient "Connecting to X…" overlay shown inside the viewport during
    // the connection beat (replaces the old page-nav status row, so it works
    // on single-page sites too). Absolutely positioned → no layout cost.
    function showStatus(text: string | null) {
      const existing = viewport.querySelector('.browser-status');
      if (existing) existing.remove();
      if (text === null) return;
      const el = document.createElement('div');
      el.className = 'browser-status';
      el.textContent = text;
      viewport.appendChild(el);
    }

    // One-button (LB/RB → PgUp/PgDn) paging for multi-page sites, without a
    // chrome bar. Registered once for this window; pagination renders as an
    // in-content footer (see renderCurrentPage).
    function advancePage(dir: 1 | -1) {
      if (!currentSite || currentSite.pages.length <= 1) return;
      goToPage(currentPage + dir);
    }
    function goToPage(n: number) {
      if (!currentSite) return;
      const clamped = Math.max(1, Math.min(currentSite.pages.length, n));
      if (clamped === currentPage) return;
      currentPage = clamped;
      // Snapshot into the active history entry so a later Back lands here.
      if (idx >= 0) history[idx]!.page = clamped;
      renderCurrentPage();
      syncAddress();
    }
    registerPagedScope(container, advancePage);

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

      // Act 1 spine: reaching InkWell satisfies the browser leg. Latch a
      // flag (once) so the QueryCrawl follow-up nudge stays suppressed and
      // future onboarding logic can read "the player found the site."
      if (siteKey === INKWELL_SITE_KEY && !GameState.getState().flags['web.reachedInkwell']) {
        GameState.dispatch({ type: 'flags/set', key: 'web.reachedInkwell', value: true });
      }
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

      syncAddress();

      if (connectTimer) clearTimeout(connectTimer);
      // In-fiction connection beat: clear the page, show a transient
      // "Connecting…" overlay, then render. Pagination (if any) is drawn
      // into the page as a footer by renderCurrentPage — no chrome bar.
      viewport.innerHTML = '';
      showStatus('Connecting to ' + addr.value + '...');
      connectTimer = setTimeout(() => {
        connectTimer = null;
        renderCurrentPage();
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
      viewport.querySelectorAll('a[data-href], a[data-action], button[data-action]').forEach(a => {
        a.setAttribute('data-focusable', 'true');
        if (!a.hasAttribute('tabindex')) a.setAttribute('tabindex', '0');
      });
      // In-content pagination for multi-page sites — rendered as a page
      // footer ("← Prev · Page X of Y · Next →"), not browser chrome, so it
      // reads like a real site. LB/RB still page via the registered scope.
      if (currentSite.pages.length > 1) renderInPageNav();
    }

    function renderInPageNav() {
      if (!currentSite) return;
      const total = currentSite.pages.length;
      const nav = document.createElement('div');
      nav.className = 'browser-inpage-nav';
      const prev = document.createElement('button');
      prev.className = 'browser-inpage-btn';
      prev.textContent = '← Prev';
      prev.dataset.focusable = 'true';
      prev.tabIndex = 0;
      prev.disabled = currentPage <= 1;
      prev.addEventListener('click', () => goToPage(currentPage - 1));
      const ind = document.createElement('span');
      ind.className = 'browser-inpage-indicator';
      ind.textContent = `Page ${currentPage} of ${total}`;
      const next = document.createElement('button');
      next.className = 'browser-inpage-btn';
      next.textContent = 'Next →';
      next.dataset.focusable = 'true';
      next.tabIndex = 0;
      next.disabled = currentPage >= total;
      next.addEventListener('click', () => goToPage(currentPage + 1));
      nav.append(prev, ind, next);
      viewport.appendChild(nav);
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
          showStatus('Stopped');
        }
      });
    });
    addr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') navigate(addr.value);
    });

    // Intercept internal links + in-fiction actions inside viewport.
    // `data-action="contact:<id>"` opens an Uplink chat with that AI —
    // this is how a site (e.g. InkWell's support widget) initiates first
    // contact with a model like QUILL, fully in fiction. `data-href`
    // is ordinary in-browser navigation.
    viewport.addEventListener('click', (e) => {
      const el = (e.target as Element).closest('a[data-action], button[data-action], a[data-href]') as HTMLElement | null;
      if (!el) return;
      e.preventDefault();
      const action = el.dataset.action;
      if (action && action.startsWith('contact:')) {
        WindowManager.open('uplink', { contact: action.slice('contact:'.length) });
        return;
      }
      if (el.dataset.href !== undefined) navigate(el.dataset.href || '');
    });

    // Bookmarks bar — contextual chips that unlock with progress (see
    // webDynamoBookmarks.ts). Re-renders on any GameState change so a
    // newly-unlocked site (reaching InkWell, news breaking, a flip) appears
    // live. Self-cleaning: when the window closes, the next state change
    // tears down the subscription + paged scope (no AppDef teardown hook,
    // mirrors signalMonitor).
    function renderBookmarks() {
      const state = GameState.getState();
      const marks = visibleBookmarks(state);
      bookmarksEl.hidden = marks.length === 0;
      bookmarksEl.innerHTML = '';
      for (const bm of marks) {
        const chip = document.createElement('button');
        chip.className = 'browser-bookmark-chip';
        chip.dataset.focusable = 'true';
        chip.tabIndex = 0;
        chip.textContent = bm.label;
        if (!state.flags['bookmark.clicked.' + bm.id]) {
          chip.classList.add('is-new');
          const badge = document.createElement('span');
          badge.className = 'browser-bookmark-new';
          badge.textContent = 'new';
          chip.appendChild(badge);
        }
        chip.addEventListener('click', () => {
          if (!GameState.getState().flags['bookmark.clicked.' + bm.id]) {
            GameState.dispatch({ type: 'flags/set', key: 'bookmark.clicked.' + bm.id, value: true });
          }
          navigate(bm.address);
        });
        bookmarksEl.appendChild(chip);
      }
    }

    let unsubBookmarks: () => void = () => {};
    unsubBookmarks = GameState.subscribe(() => {
      if (!container.isConnected) {
        unsubBookmarks();
        unregisterPagedScope(container);
        return;
      }
      renderBookmarks();
    });
    renderBookmarks();

    navigate(params.url || 'nexus:home');
  }
};
