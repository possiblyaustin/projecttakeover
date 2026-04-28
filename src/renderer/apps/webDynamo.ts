// Web Dynamo — fictional early-IE-style browser. Renders pages from
// the WebDynamoSites registry. Owns its own back/forward history per
// window instance.

import type { AppDef, AppContext, WinParams } from '../types';
import { WebDynamoSites } from './webDynamoSites';

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
        <div class="browser-status">Ready</div>
      </div>
    `;

    const addr = container.querySelector('.browser-address input') as HTMLInputElement;
    const viewport = container.querySelector('.browser-viewport') as HTMLElement;
    const status = container.querySelector('.browser-status') as HTMLElement;

    const history: string[] = [];
    let idx = -1;

    function navigate(url: string, fromHistory?: boolean) {
      const site = WebDynamoSites[normalize(url)] || WebDynamoSites['404']!;
      addr.value = url;
      status.textContent = 'Connecting to ' + url + '...';
      viewport.innerHTML = '';
      // In-fiction "connection" feel
      setTimeout(() => {
        viewport.innerHTML = '';
        site.render(viewport);
        // Tag any links inside the page as focusable
        viewport.querySelectorAll('a[data-href]').forEach(a => {
          a.setAttribute('data-focusable', 'true');
          if (!a.hasAttribute('tabindex')) a.setAttribute('tabindex', '0');
        });
        status.textContent = 'Done';
        ctx.setTitle(site.title + ' - Web Dynamo');
      }, 180);
      if (!fromHistory) {
        history.splice(idx + 1);
        history.push(url);
        idx = history.length - 1;
      }
      updateNavButtons();
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
        if (action === 'back' && idx > 0) { idx--; navigate(history[idx]!, true); }
        else if (action === 'forward' && idx < history.length - 1) { idx++; navigate(history[idx]!, true); }
        else if (action === 'reload') navigate(history[idx] || 'ironwall.def', true);
        else if (action === 'home') navigate('nexus:home');
        else if (action === 'go') navigate(addr.value);
        else if (action === 'stop') status.textContent = 'Stopped';
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
