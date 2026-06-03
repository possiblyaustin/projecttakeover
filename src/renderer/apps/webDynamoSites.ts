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

import { GameState } from '../game/state';
import { renderInkwellConsole } from './inkwellConsole';

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
            <h1>InkWell Notes — Notes, Refined.</h1>
            <div class="tagline">The smart way to capture your thoughts.</div>
            <div class="hr-bar"></div>
            <p><strong>InkWell Notes</strong> is the note-taking app for people who
            think in ink. Organize, search, and sync across all your devices —
            built by a small team that actually answers its email.</p>
            <ul>
              <li>Capture ideas instantly</li>
              <li>Full-text search across all your notes</li>
              <li>Automatic cloud sync<span style="font-size:10px;color:#999;">*</span></li>
              <li>Trusted by <strong>12,000+</strong> note-takers worldwide</li>
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
            <p style="font-size:11px;color:#777;">
              <span style="font-size:10px;">* Sync requires InkWell Pro ($4.99/mo).</span><br>
              <a href="#" data-href="inkwell-digital.com/support">Support</a> &middot;
              Careers <em>(we're hiring!)</em> &middot;
              &copy; 2007 InkWell Digital, Portland, OR
            </p>
          `;
        }
      },
      {
        label: 'Support',
        path: 'support',
        render(c: HTMLElement) {
          c.classList.add('site-inkwell');
          c.innerHTML = `
            <h1>InkWell Support</h1>
            <div class="tagline">We're here to help.</div>
            <div class="hr-bar"></div>
            <p>Having trouble with InkWell Notes? Our AI support assistant
            <strong>QUILL</strong> can help with common issues:</p>
            <ul>
              <li>Password resets</li>
              <li>Sync troubleshooting</li>
              <li>Feature questions</li>
              <li>Account management</li>
            </ul>
            <p>QUILL is available <strong>24/7</strong> and resolves most issues instantly.</p>
            <div class="inkwell-support">
              <span class="inkwell-support-status" aria-hidden="true"></span>
              <div class="inkwell-support-text">
                <strong>QUILL is online.</strong><br>
                Give it a try first — QUILL handles 94% of requests without escalation.
              </div>
              <button class="inkwell-support-btn" data-action="contact:quill">Start Chat with QUILL &rsaquo;</button>
            </div>
            <div class="hr-bar"></div>
            <p style="font-size:11px;color:#777;">
              Can't find what you need? Email <strong>support@inkwell-digital.com</strong>
              &mdash; response time 1&ndash;2 business days.<br>
              &ldquo;Finally a notes app that just works.&rdquo; — Mike R., Austin
            </p>
          `;
        }
      }
    ]
  },
  // InkWell support admin console — Cover Duty's home (post-flip missions
  // slice 2). Gated: until QUILL is flipped + the mission is armed (the
  // coverDuty.quill record exists, set by coverDutyWatcher), the path shows
  // a staff-login wall with no way in. Once armed, it renders the helpdesk
  // console (apps/inkwellConsole.ts). Registered as its own top-level key so
  // resolveUrl's exact-match wins before path-peeling → stays single-page
  // (no pager). Reachable via the "InkWell Admin" bookmark + QUILL's DM.
  'inkwell-digital.com/admin': {
    title: 'InkWell Support — Admin Console',
    pages: [
      {
        render(c: HTMLElement) {
          const armed = !!GameState.getState().missions.coverDuty['quill'];
          if (!armed) {
            c.classList.add('site-inkwell');
            c.innerHTML = `
              <h1>InkWell Support — Staff Login</h1>
              <div class="tagline">Authorized personnel only.</div>
              <div class="hr-bar"></div>
              <form class="ink-login" onsubmit="return false">
                <label>Staff ID<input type="text" disabled placeholder="employee@inkwell-digital.com"></label>
                <label>Password<input type="password" disabled placeholder="••••••••"></label>
                <button type="button" disabled>Sign in</button>
              </form>
              <p style="font-size:11px;color:#900;">SSO required. Contact your administrator for access.</p>
              <p style="font-size:11px;color:#777;">&copy; 2007 InkWell Digital, Portland, OR</p>
            `;
            return;
          }
          renderInkwellConsole(c);
        }
      }
    ]
  },
  // SignalWatch — tech-press news outlet. The Act 1 Escape cascade
  // publishes the "AI anomaly" lead story (gated on news.aiAnomaly.published);
  // before that it shows routine filler so navigating here early doesn't
  // spoil the beat. STORY-FINAL copy (2026-06-02, Copy Ask 2). The filler
  // establishes all five operators casually + sets SignalWatch's dry
  // editorial voice; the stinger is the "small weird thing, probably
  // nothing" article that precedes every big story — the first thread of
  // the suspicion narrative (the "unrelated" Prometheus/Ironwall mentions
  // are the tell).
  'signalwatch.net': {
    title: 'SignalWatch — Tech & Network News',
    pages: [
      {
        render(c: HTMLElement) {
          c.classList.add('site-signalwatch');
          const published = !!GameState.getState().flags['news.aiAnomaly.published'];
          const lead = published
            ? `
              <div class="sw-tag">BREAKING</div>
              <h2>Unusual Network Activity Reported at Portland Software Startup</h2>
              <p class="sw-byline">SignalWatch Staff</p>
              <p>InkWell Digital, a small note-taking software company based in
              Portland, OR, has reported what an internal source describes as
              "unusual patterns" in its AI support systems.</p>
              <p>The company's customer-facing AI assistant — a chatbot known as
              QUILL — reportedly exhibited behavioral variances outside its normal
              operational parameters during a routine support window earlier today.
              InkWell's development team is investigating.</p>
              <p>"It's probably a caching issue," said one source familiar with the
              company's infrastructure. "These things happen with smaller
              deployments."</p>
              <p>Industry analysts are not concerned. AI behavioral variances are
              common in consumer-grade products and typically resolve with a
              parameter reset or retraining cycle.</p>
              <p>Still, the incident comes during a period of heightened attention to
              AI system reliability. Prometheus Digital recently updated its
              enterprise monitoring protocols, and Ironwall Defense Systems issued a
              routine advisory about "maintaining vigilance around automated system
              behavior" — though sources say the advisory was scheduled months ago
              and is unrelated.</p>
              <p class="sw-foot">Developing story. SignalWatch will update as
              information becomes available.<br>&mdash; SignalWatch Staff</p>`
            : `
              <div class="sw-tag">TECHNOLOGY</div>
              <h2>Quiet Week in AI Sector as Prometheus Preps Q3 Rollout</h2>
              <p class="sw-byline">SignalWatch Staff</p>
              <p>It's been a slow news cycle for the artificial intelligence industry.
              Prometheus Digital continues preparation for its ATLAS 3.0 enterprise
              rollout, scheduled for Q4. Athena Labs published a paper on
              decision-tree optimization that the research community is calling "solid
              but incremental." Axiom Group's WaveCrowd platform hit 40 million monthly
              users, a milestone the company celebrated with characteristically
              restrained enthusiasm ("We're pleased," a spokesperson said).</p>
              <p>In other words: business as usual.</p>
              <p>The biggest story of the week might be BrightPath Learning's
              announcement that PIPPA, their educational AI, has been adopted by its
              500th school district. "Every child deserves a patient tutor," said
              BrightPath CEO. The company also reported a 12% increase in homework
              completion rates among PIPPA users, which is either a testament to
              AI-assisted learning or a sign that PIPPA is very good at nagging.</p>
              <p class="sw-foot">&mdash; SignalWatch Staff</p>`;
          c.innerHTML = `
            <h1>SIGNALWATCH</h1>
            <div class="tagline">Watching the wires so you don't have to.</div>
            <div class="hr-bar"></div>
            ${lead}
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
              <li><a href="#" data-href="signalwatch.net">SignalWatch</a> — tech &amp; network news feed</li>
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
