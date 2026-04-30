// Page-nav primitive — shared "Page X of Y / ◄ Prev / Next ►" control
// for any app whose content is paginated rather than scrolled. Used by
// Web Dynamo (sites split into discrete pages) and the future Uplink
// Log viewer. See docs/no-scroll-pages_v1.md for the design.
//
// The host app supplies totalPages / currentPage / goTo and mounts
// the bar inside a container of its choosing. The primitive renders
// chrome and dispatches advances; the host owns the actual content.
//
// Keyboard / controller input:
//   - Prev / Next buttons are real focusable .page-nav-btn elements.
//     D-pad / arrow nav reaches them via the existing snap selector.
//     A button (Enter / Space) activates them like any other button.
//   - PageUp / PageDown are also bound globally inside the scope:
//     Steam Input maps LB/RB to those keys on Deck for one-button
//     advance without leaving the content. cursor.ts owns the dispatch
//     and consults the registry below before falling through to its
//     default scroll-under-cursor behavior.
//
// "Scope" = the DOM subtree within which PgUp/PgDn should advance
// pages. Defaults to the same container the bar mounts into; apps
// can pass a wider scope (e.g. the whole window content) if focus
// commonly sits outside the bar itself.

export type PageNavOpts = {
  /** Where the bar's DOM lives. Bar is appended into this element. */
  container: HTMLElement;
  /** Subtree within which PgUp/PgDn should advance pages.
   *  Defaults to `container`. */
  scope?: HTMLElement;
  /** Dynamic so apps can mutate page count after mount. */
  totalPages: () => number;
  /** 1-indexed. */
  currentPage: () => number;
  /** App callback — re-renders content for the new page.
   *  Primitive will call update() afterward to refresh chrome. */
  goTo(page: number): void;
};

export type PageNavHandle = {
  /** Re-read totalPages / currentPage and refresh button states.
   *  Apps call this after data changes that affect the page count. */
  update(): void;
  /** Tear down — remove DOM, deregister scope. */
  destroy(): void;
};

// Scope registry — cursor.ts queries this when PgUp/PgDn fires to
// decide whether to advance pages or fall through to scroll. Keys
// are scope elements; values are the advance callback for that scope.
type AdvanceFn = (dir: 1 | -1) => void;
const scopes = new Map<HTMLElement, AdvanceFn>();

/** Called by cursor.ts on PageUp / PageDown. Walks up from `fromEl`
 *  looking for a registered scope. Returns true if a scope handled
 *  the event so the caller can skip its default scroll behavior. */
export function tryAdvancePagedScope(fromEl: Element | null, dir: 1 | -1): boolean {
  let n: Element | null = fromEl;
  while (n) {
    const advance = scopes.get(n as HTMLElement);
    if (advance) {
      advance(dir);
      return true;
    }
    n = n.parentElement;
  }
  return false;
}

export function mountPageNav(opts: PageNavOpts): PageNavHandle {
  const { container, totalPages, currentPage, goTo } = opts;
  const scope = opts.scope || container;

  const bar = document.createElement('div');
  bar.className = 'page-nav-bar';
  bar.innerHTML = `
    <button class="page-nav-btn" data-dir="prev" data-focusable="true" tabindex="0">◄ Prev</button>
    <span class="page-nav-indicator"></span>
    <button class="page-nav-btn" data-dir="next" data-focusable="true" tabindex="0">Next ►</button>
  `;
  container.appendChild(bar);

  const prevBtn = bar.querySelector('[data-dir="prev"]') as HTMLButtonElement;
  const nextBtn = bar.querySelector('[data-dir="next"]') as HTMLButtonElement;
  const indicator = bar.querySelector('.page-nav-indicator') as HTMLElement;

  function advance(dir: 1 | -1) {
    const cur = currentPage();
    const total = totalPages();
    const next = cur + dir;
    if (next < 1 || next > total) return;
    goTo(next);
    update();
  }

  function update() {
    const cur = currentPage();
    const total = totalPages();
    indicator.textContent = total > 0 ? `Page ${cur} of ${total}` : '';
    // Disabled buttons stay focusable so D-pad doesn't get stuck on
    // the edge of a page range. The .disabled class handles the
    // visual; the click handler bails on dir-out-of-range above.
    prevBtn.classList.toggle('disabled', cur <= 1);
    nextBtn.classList.toggle('disabled', cur >= total);
  }

  prevBtn.addEventListener('click', () => advance(-1));
  nextBtn.addEventListener('click', () => advance(1));

  scopes.set(scope, advance);
  update();

  return {
    update,
    destroy() {
      scopes.delete(scope);
      bar.remove();
    }
  };
}
