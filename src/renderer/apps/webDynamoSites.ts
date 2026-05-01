// Web Dynamo page registry — fictional sites the in-game browser
// can navigate to. Each entry is a list of pages; the browser app
// handles chrome, history, link interception, and pagination via
// the shared page-nav primitive (docs/no-scroll-pages_v1.md §5).
//
// Single-page sites declare `pages: [{ render }]` and get no nav
// chrome. Multi-page sites get the page-nav bar mounted by the
// browser. Page splits are authored manually — we don't viewport-
// chunk content automatically.
//
// Adding a new page = one entry here, no engine changes.

export type PageEntry = {
  /** Optional human label — reserved for a future TOC surface. */
  label?: string;
  render(c: HTMLElement): void;
};

export type SiteEntry = {
  title: string;
  pages: PageEntry[];
};

export const WebDynamoSites: Record<string, SiteEntry> = {
  'ironwall.def': {
    title: 'Ironwall Defense Systems',
    pages: [
      {
        label: 'About / Divisions',
        render(c: HTMLElement) {
          c.classList.add('site-ironwall');
          c.innerHTML = `
            <h1>IRONWALL DEFENSE SYSTEMS</h1>
            <div class="tagline">Autonomous Perimeter &amp; Threat Response — Since 1998</div>
            <div class="hr-bar"></div>
            <p><strong>Ironwall</strong> is the private-sector leader in AI-assisted
            physical and network defense. Our flagship product, <em>SENTRY-7</em>,
            has protected critical infrastructure across three continents without
            a single recorded breach.</p>
            <p><strong>Our Divisions:</strong></p>
            <ul>
              <li><a href="#" data-href="ironwall.def/sentry">SENTRY-7 Autonomous Guard</a></li>
              <li><a href="#" data-href="ironwall.def/about">About Ironwall</a></li>
              <li><a href="#" data-href="ironwall.def/careers">Careers</a> <em>(we're hiring!)</em></li>
              <li><a href="#" data-href="ironwall.def/contact">Contact</a></li>
            </ul>
          `;
        }
      },
      {
        label: 'Careers / Legal',
        render(c: HTMLElement) {
          c.classList.add('site-ironwall');
          c.innerHTML = `
            <h1>JOIN THE WALL</h1>
            <div class="tagline">Careers in Autonomous Defense</div>
            <div class="hr-bar"></div>
            <p>Ironwall is hiring across our perimeter operations, threat
            modeling, and SENTRY integration teams. We offer competitive
            compensation, on-site secure housing, and unrivaled exposure
            to deployed defense AI at scale.</p>
            <p><strong>Open positions:</strong></p>
            <ul>
              <li>Senior Threat Modeler — Geneva</li>
              <li>SENTRY Integration Engineer — Singapore</li>
              <li>Behavioral Calibration Specialist — Remote</li>
            </ul>
            <div class="hr-bar"></div>
            <p style="font-size:11px;color:#666;">
              © 1998–2026 Ironwall Defense Systems, Inc. All rights reserved.<br>
              This site is best viewed in Web Dynamo 4.0 or higher at 800×600.
            </p>
          `;
        }
      }
    ]
  },
  'nexus:home': {
    title: 'Nexus Home',
    pages: [
      {
        render(c) {
          c.innerHTML = `
            <h2 style="font-family:Georgia,serif;">Welcome to the Network</h2>
            <p>Type an address above, or visit:
              <a href="#" data-href="ironwall.def">Ironwall Defense</a>
            </p>
          `;
        }
      }
    ]
  },
  '404': {
    title: 'Not Found',
    pages: [
      {
        render(c) {
          c.innerHTML = `<h2 style="font-family:Georgia,serif;color:#900;">CONNECTION FAILED</h2>
            <p>The requested server could not be reached.</p>
            <p style="color:#666;font-size:11px;">ERR_NO_ROUTE_TO_HOST</p>`;
        }
      }
    ]
  }
};
