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
  /** Optional URL slug. When set, the address bar shows
   *  `<siteKey>/<path>` while this page is active, and typing that
   *  URL directly resolves to this page. Page 1 typically omits this
   *  (bare site URL); pages 2+ should set one for pretty URLs. */
  path?: string;
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
        path: 'jobs',
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
  'inkwell-digital.com': {
    title: 'InkWell Digital',
    pages: [
      {
        label: 'Home',
        render(c: HTMLElement) {
          c.classList.add('site-inkwell');
          c.innerHTML = `
            <h1>InkWell Notes</h1>
            <div class="tagline">Your thoughts, beautifully organized.</div>
            <div class="hr-bar"></div>
            <p><strong>InkWell Notes</strong> is the note-taking app for people who
            think in ink. Sync across web, desktop, and mobile — markdown, attachments,
            and effortless search, built by a small team that actually answers its email.</p>
            <ul>
              <li>Cross-device sync that just works</li>
              <li>Markdown &amp; rich attachments</li>
              <li>Loved by <strong>12,000+</strong> note-takers</li>
            </ul>
            <div class="inkwell-support">
              <span class="inkwell-support-status" aria-hidden="true"></span>
              <div class="inkwell-support-text">
                <strong>Need a hand?</strong><br>
                Our support assistant <strong>QUILL</strong> is online now.
              </div>
              <button class="inkwell-support-btn" data-action="contact:quill">Chat with QUILL &rsaquo;</button>
            </div>
            <div class="hr-bar"></div>
            <p style="font-size:11px;color:#777;">&copy; 2007 InkWell Digital — a small company with big ideas.</p>
          `;
        }
      }
    ]
  },
  'nexus:home': {
    title: 'Nexus Home',
    pages: [
      {
        render(c: HTMLElement) {
          c.classList.add('site-home');
          c.innerHTML = `
            <h1>NEXUS NAVIGATOR</h1>
            <div class="tagline">Your starting point for the network</div>
            <div class="hr-bar"></div>
            <p>Type an address above, or jump to a known site:</p>
            <ul class="home-links">
              <li><a href="#" data-href="inkwell-digital.com">InkWell Digital</a> — note-taking app &amp; online support</li>
              <li><a href="#" data-href="ironwall.def">Ironwall Defense Systems</a> — security &amp; defense AI</li>
            </ul>
            <div class="hr-bar"></div>
            <p style="font-size:11px;color:#777;">Web Dynamo 4.0 &middot; indexing this connection&hellip;</p>
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
