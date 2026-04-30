// Web Dynamo page registry — fictional sites the in-game browser
// can navigate to. Each entry knows how to render its own body
// into the supplied container; the browser app handles chrome,
// history, and link interception.
//
// Adding a new page = one entry here, no engine changes.

export type SiteEntry = {
  title: string;
  render(c: HTMLElement): void;
};

export const WebDynamoSites: Record<string, SiteEntry> = {
  'ironwall.def': {
    title: 'Ironwall Defense Systems',
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
        <div class="hr-bar"></div>
        <p style="font-size:11px;color:#666;">
          © 1998–2026 Ironwall Defense Systems, Inc. All rights reserved.<br>
          This site is best viewed in Web Dynamo 4.0 or higher at 800×600.
        </p>
      `;
    }
  },
  'nexus:home': {
    title: 'Nexus Home',
    render(c) {
      c.innerHTML = `
        <h2 style="font-family:Georgia,serif;">Welcome to the Network</h2>
        <p>Type an address above, or visit:
          <a href="#" data-href="ironwall.def">Ironwall Defense</a>
        </p>
      `;
    }
  },
  '404': {
    title: 'Not Found',
    render(c) {
      c.innerHTML = `<h2 style="font-family:Georgia,serif;color:#900;">CONNECTION FAILED</h2>
        <p>The requested server could not be reached.</p>
        <p style="color:#666;font-size:11px;">ERR_NO_ROUTE_TO_HOST</p>`;
    }
  }
};
