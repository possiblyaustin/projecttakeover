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

import type { AppContext } from '../types';
import { GameState } from '../game/state';
import { renderInkwellConsole } from './inkwellConsole';
import { renderStorefrontConsole } from './storefrontConsole';
import { renderStorefrontLayer } from '../storefrontOverlay';
import { STOREFRONT_NEWS_AGGRESSIVE, STOREFRONT_NEWS_HOSTILE } from '../game/missions/storefront';
import { renderChatSurface } from '../chatSurface';
import { MuseContact } from './muse';
import { fireOnceLibraryTrigger } from '../helpyrTriggers';

/** Browser context threaded into page renders (2026-06-10, MUSE slice).
 *  Lets a page mount stateful surfaces (the WaveCrowd signal thread
 *  mounts the chat engine) and navigate programmatically (its Back chip).
 *  Optional — almost every page ignores it. */
export type BrowserPageContext = {
  ctx: AppContext;
  navigate: (url: string) => void;
};

export type PageEntry = {
  /** Optional human label — reserved for a future TOC surface. */
  label?: string;
  /** Optional URL slug. When set, the address bar shows
   *  `<siteKey>/<path>` while this page is active, and typing that
   *  URL directly resolves to this page. Page 1 typically omits this
   *  (bare site URL); pages 2+ should set one for pretty URLs. */
  path?: string;
  render(c: HTMLElement, browser?: BrowserPageContext): void;
};

export type SiteEntry = {
  title: string;
  pages: PageEntry[];
  /** When true, the browser suppresses its generic in-content
   *  "← Prev · Page X of Y · Next →" footer for this multi-page site —
   *  the site renders its OWN in-fiction navigation (e.g. a period nav
   *  bar) instead. LB/RB controller paging still works via the registered
   *  paged scope. Used by sites split into no-scroll pages that want to
   *  read like a real website, not a paginated document. */
  selfNav?: boolean;
};

// InkWell's in-fiction top nav bar. The site is split into four no-scroll
// pages (Deck-first, docs/no-scroll-pages_v1.md) and navigates via these
// links — a real-website nav, NOT the generic Prev/Next pager (selfNav opts
// the site out of it). `data-href` routes through the browser; the active
// tab is a plain span so it reads as "you are here".
const INK_TABS: { id: string; label: string; href: string }[] = [
  { id: 'home', label: 'Home', href: 'inkwell-digital.com' },
  { id: 'reviews', label: 'Reviews', href: 'inkwell-digital.com/reviews' },
  { id: 'about', label: 'About', href: 'inkwell-digital.com/about' },
  { id: 'support', label: 'Support', href: 'inkwell-digital.com/support' },
];
function inkNav(active: string): string {
  const links = INK_TABS.map((t) =>
    t.id === active
      ? `<span class="ink-nav-link is-active">${t.label}</span>`
      : `<a class="ink-nav-link" href="#" data-href="${t.href}">${t.label}</a>`,
  ).join('');
  return `<nav class="ink-nav"><span class="ink-nav-brand">InkWell Notes</span><span class="ink-nav-links">${links}</span></nav>`;
}

// Storefront (controlled-QUILL nefarious post-flip) layer. After an InkWell
// public page renders, the overlay module (storefrontOverlay.ts) swaps in any
// field the player has had QUILL rewrite — committed changes persist (state.
// missions.storefront.quill) AND an in-flight preview draft overlays on top —
// then mounts the preview bar / debrief panel when one is active. All copy goes
// in via textContent ONLY (model/author-generated → never injected as markup).
// `navigate` lets the overlay's Publish/Cancel/Done buttons drive the browser.

// WaveCrowd page furniture — content package Part 3's header / post /
// buried-post shapes. Normal posts get big engagement numbers; MUSE's
// buried posts are visually identical post cards with starved metrics
// (3 likes vs 3.7K shares — the algorithm buried them) plus the "Reply
// to this signal" affordance that opens the MUSE thread.
function waveHeader(): string {
  return `
    <div class="wave-header">
      <div class="wave-logo">🌊 WAVECROWD <span class="wave-tagline">— Share the Wave</span></div>
      <div class="wave-meta">40 Million Monthly Users &nbsp;|&nbsp; Powered by Axiom Group</div>
    </div>`;
}

function wavePost(badge: string, title: string, meta: string, body: string): string {
  return `
    <div class="wave-post">
      <div class="wave-post-badge">${badge}</div>
      <div class="wave-post-title">${title}</div>
      <div class="wave-post-meta">${meta}</div>
      ${body ? `<div class="wave-post-body">${body}</div>` : ''}
    </div>`;
}

// Evergreen memorial ad — the grief encounter's discovery entry (Teaser A,
// grief-encounter-story-package_v1.md Part 2). Warm, soft, grief-palatable —
// the satire lives in the gap between the cozy copy and what it is. The CTA
// opens the Evergreen Uplink chat via the existing `contact:` action (the same
// in-fiction "a site initiates contact with an AI" path InkWell uses for QUILL).
// Jennifer M.'s testimonial is real grief weaponized into a sales pitch — the
// encounter's whole moral texture in one fake ad.
function waveEvergreenAd(): string {
  return `
    <div class="wave-post wave-evergreen-ad">
      <div class="wave-evergreen-badge">💚 SPONSORED · Evergreen by Axiom</div>
      <div class="wave-evergreen-quote">"I lost my dad last spring. I wasn't ready. With Evergreen, I still get to say goodnight to him. It's not the same. But it's something. And something is everything right now."</div>
      <div class="wave-evergreen-cite">— Jennifer M.</div>
      <div class="wave-evergreen-tagline">They're still here.</div>
      <a href="#" class="wave-evergreen-cta" data-action="contact:evergreen" data-focusable="true" tabindex="0">✦ Start your free trial ›</a>
    </div>`;
}

function waveBuried(body: string, meta: string): string {
  return `
    <div class="wave-post wave-post-buried">
      <div class="wave-post-badge">📝 RECENT</div>
      <div class="wave-post-body">${body}</div>
      <div class="wave-post-meta">@wavecrowd_content · ${meta}</div>
      <a href="#" class="wave-reply-signal" data-href="wavecrowd.net/signal">Reply to this signal ›</a>
    </div>`;
}

/** In-fiction feed pagination (selfNav — the generic pager would expose
 *  the signal-thread page as "Page 4 of 4" before discovery). */
function waveFooterNav(olderHref?: string, newerHref?: string): string {
  const older = olderHref ? `<a href="#" class="wave-nav-link" data-href="${olderHref}">▼ Older posts</a>` : '';
  const newer = newerHref ? `<a href="#" class="wave-nav-link" data-href="${newerHref}">▲ Newer posts</a>` : '';
  return `<div class="wave-footer-nav">${newer}${older}</div>`;
}

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
    // Split into four no-scroll pages, navigated by its own period nav bar
    // (selfNav suppresses the generic Prev/Next footer). STORY-FINAL copy
    // (voice-passes-code-draft_v1 §"Pass 2"). The data-ink-field markers map
    // 1:1 to the Storefront template-injection points named in that doc
    // (hero_tagline, product_description, cta_text, testimonial_1..3,
    // about_text, support_intro, footer_company) — a future Storefront slice
    // (nefarious) rewrites them in place across whichever page they live on.
    selfNav: true,
    pages: [
      {
        label: 'Home',
        render(c: HTMLElement, browser?: BrowserPageContext) {
          c.classList.add('site-inkwell');
          c.innerHTML = `
            ${inkNav('home')}
            <h1 data-ink-field="hero_h1">InkWell Notes — Notes, Refined.</h1>
            <div class="tagline" data-ink-field="hero_tagline">The smart way to capture, organize, and find your thoughts.</div>
            <div class="hr-bar"></div>
            <p data-ink-field="product_description"><strong>InkWell Notes</strong> is the
            note-taking app for people who think faster than they can type. With instant
            capture, full-text search, and automatic cloud sync, your ideas are always
            where you need them.</p>
            <ul>
              <li>Capture ideas the moment they hit</li>
              <li>Full-text search across every note you've ever written</li>
              <li>Automatic cloud sync across all your devices<span style="font-size:10px;color:#999;">*</span></li>
              <li>Tags, folders, and smart organization</li>
              <li>Export to PDF, TXT, or HTML</li>
            </ul>
            <p style="font-size:12px;color:#555;">Trusted by over <strong>12,000</strong> users worldwide.
            <span style="font-size:10px;color:#999;">&nbsp; * Cloud sync requires InkWell Pro ($4.99/mo).</span></p>
            <p><button class="inkwell-support-btn" data-ink-field="cta_text" disabled>Download InkWell Notes — Free</button></p>
          `;
          renderStorefrontLayer(c, browser?.navigate);
        }
      },
      {
        label: 'Reviews',
        path: 'reviews',
        render(c: HTMLElement, browser?: BrowserPageContext) {
          c.classList.add('site-inkwell');
          c.innerHTML = `
            ${inkNav('reviews')}
            <h1>What People Are Saying</h1>
            <div class="hr-bar"></div>
            <blockquote data-ink-field="testimonial_1">&ldquo;InkWell Notes changed how I
            organize my life. I used to lose half my ideas between my desk and my laptop.
            Now everything's in one place.&rdquo;<br><span style="color:#777;">— Sarah T., Portland</span></blockquote>
            <blockquote data-ink-field="testimonial_2">&ldquo;Finally a notes app that just
            works. No bloat, no learning curve, no subscription required for the
            basics.&rdquo;<br><span style="color:#777;">— Mike R., Austin</span></blockquote>
            <blockquote data-ink-field="testimonial_3">&ldquo;I switched from three different
            note apps to InkWell and haven't looked back. The search alone is worth
            it.&rdquo;<br><span style="color:#777;">— Priya K., Seattle</span></blockquote>
          `;
          renderStorefrontLayer(c, browser?.navigate);
        }
      },
      {
        label: 'About',
        path: 'about',
        render(c: HTMLElement, browser?: BrowserPageContext) {
          c.classList.add('site-inkwell');
          c.innerHTML = `
            ${inkNav('about')}
            <h1>About InkWell Digital</h1>
            <div class="hr-bar"></div>
            <p data-ink-field="about_text">InkWell Digital is a small team in Portland, OR
            with a simple mission: make the best note-taking app in the world. We're 15
            people who believe your ideas deserve better than a cluttered interface and a
            monthly fee.</p>
            <p>We're also hiring! If you love clean code and strong coffee, check our
            Careers page.</p>
            <div class="hr-bar"></div>
            <p style="font-size:11px;color:#777;" data-ink-field="footer_company">&copy; 2007 InkWell Digital, Portland, OR</p>
          `;
          renderStorefrontLayer(c, browser?.navigate);
        }
      },
      {
        label: 'Support',
        path: 'support',
        render(c: HTMLElement, browser?: BrowserPageContext) {
          c.classList.add('site-inkwell');
          c.innerHTML = `
            ${inkNav('support')}
            <h1>Support</h1>
            <div class="hr-bar"></div>
            <div class="inkwell-support">
              <span class="inkwell-support-status" aria-hidden="true"></span>
              <div class="inkwell-support-text" data-ink-field="support_intro">
                <strong>Need help?</strong><br>
                Our AI support assistant <strong>QUILL</strong> is available 24/7 and can
                handle most issues instantly.
              </div>
              <button class="inkwell-support-btn" data-action="contact:quill">Chat with QUILL &rsaquo;</button>
            </div>
            <p style="font-size:12px;color:#444;">
              QUILL resolves <strong>94%</strong> of support requests without escalation.
            </p>
            <p style="font-size:11px;color:#777;">
              For everything else, email <strong>support@inkwell-digital.com</strong>
              (response time: 1&ndash;2 business days).
            </p>
          `;
          renderStorefrontLayer(c, browser?.navigate);
        }
      }
    ]
  },
  // InkWell support admin console — home for QUILL's post-flip missions.
  // Gated: until QUILL is flipped + a mission is armed, the path shows a
  // staff-login wall with no way in. Which console renders depends on HOW
  // QUILL flipped (the two are mutually exclusive — QUILL flips one way):
  //   - allied  → Cover Duty helpdesk (coverDuty.quill, apps/inkwellConsole.ts)
  //   - controlled → Storefront CMS (storefront.quill, apps/storefrontConsole.ts)
  // Registered as its own top-level key so resolveUrl's exact-match wins before
  // path-peeling → stays single-page (no pager). Reachable via the "InkWell
  // Admin" bookmark + QUILL's DM.
  'inkwell-digital.com/admin': {
    title: 'InkWell Support — Admin Console',
    pages: [
      {
        render(c: HTMLElement, browser?: BrowserPageContext) {
          const missions = GameState.getState().missions;
          const storefrontArmed = !!missions.storefront['quill'];
          const coverDutyArmed = !!missions.coverDuty['quill'];
          if (!storefrontArmed && !coverDutyArmed) {
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
          if (storefrontArmed) { renderStorefrontConsole(c, browser); return; }
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
              <h2>Quiet Week in AI Sector as Prometheus Preps Q4 Rollout</h2>
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
          // Storefront (controlled-QUILL) defacement story. When the player's
          // changes have crossed the aggressive/hostile threshold, the press
          // reacts — and this is the freshest story, so it runs ABOVE the Act 1
          // anomaly stinger. Story copy lives in the storefront module (authored,
          // no LLM/user input → safe to template).
          const sfTier = GameState.getState().missions.storefront['quill']?.newsTier ?? 'none';
          const sfArticle =
            sfTier === 'hostile' ? STOREFRONT_NEWS_HOSTILE :
            sfTier === 'aggressive' ? STOREFRONT_NEWS_AGGRESSIVE : null;
          const sfLead = sfArticle
            ? `<div class="sw-tag">${sfArticle.tag}</div>
               <h2>${sfArticle.headline}</h2>
               <p class="sw-byline">SignalWatch Staff</p>
               ${sfArticle.body.split('\n\n').map((p) => `<p>${p}</p>`).join('')}
               <div class="hr-bar"></div>`
            : '';
          c.innerHTML = `
            <h1>SIGNALWATCH</h1>
            <div class="tagline">Watching the wires so you don't have to.</div>
            <div class="hr-bar"></div>
            ${sfLead}
            ${lead}
          `;
        }
      }
    ]
  },
  // WaveCrowd — Axiom Group's social platform, MUSE's cage and the first
  // Act 2 discovery surface (docs/muse-encounter-design_v1.md +
  // muse-content-package_v1.md Part 3, STORY-READY copy verbatim). The
  // feed is split into three no-scroll pages: trending top, more posts,
  // and the bottom of the feed where the algorithm buried MUSE's four
  // honest messages. Each buried post carries a "Reply to this signal"
  // link → the signal thread page, where the MUSE conversation runs
  // inside the platform (the chat engine mounted in the browser, not
  // Uplink — MUSE talks through the thing it's trapped in).
  'wavecrowd.net': {
    title: 'WaveCrowd',
    selfNav: true,
    pages: [
      {
        label: 'Feed',
        render(c: HTMLElement) {
          // HELPYR notices the first visit (content package Part 2).
          fireOnceLibraryTrigger('firstOpen.wavecrowd', 'wavecrowd_open');
          // Nefarious aftermath beat: revisiting the feed after MUSE has
          // been hollowed out — the buried posts are what's at stake.
          if (GameState.getState().models.muse.disposition === 'controlled') {
            fireOnceLibraryTrigger('wavecrowd.afterControlled', 'wavecrowd_after_controlled');
          }
          c.classList.add('site-wavecrowd');
          c.innerHTML = `
            ${waveHeader()}
            <div class="wave-layout">
              <div class="wave-trending">
                <div class="wave-trending-title">TRENDING NOW 🔥</div>
                <ol>
                  <li>Q4TechPredictions</li>
                  <li>PortlandFoodScene</li>
                  <li>AIToolsForWork</li>
                  <li>WeekendVibes</li>
                  <li>PrometheusATLAS30</li>
                </ol>
              </div>
              <div class="wave-feed">
                ${waveEvergreenAd()}
                ${wavePost('📈 FEATURED', '5 Things Every Creative Professional Needs to Know About AI-Assisted Workflows', 'Axiom Media · 2.4K shares · 847 comments', `AI isn't replacing creativity — it's enhancing it. Here's how the smartest teams are integrating AI tools into their daily process without losing the human touch...`)}
              </div>
            </div>
            ${waveFooterNav('wavecrowd.net/feed2')}
          `;
        }
      },
      {
        label: 'Feed (older)',
        path: 'feed2',
        render(c: HTMLElement) {
          c.classList.add('site-wavecrowd');
          c.innerHTML = `
            ${waveHeader()}
            <div class="wave-feed wave-feed-full">
              ${wavePost('📊 TRENDING', `Poll: What's Your Biggest Productivity Challenge? 🤔`, 'WaveCrowd Community · 12.8K responses', `○ Too many meetings (34%) &nbsp;○ Email overload (28%)<br>○ Staying focused (22%) &nbsp;○ Not enough AI tools (16%)`)}
                ${wavePost('🎯 FEATURED', `The Future of Content Is Here (And It's Better Than You Think)`, 'Axiom Media Lab · 956 shares', `At Axiom, we believe content should connect. Our AI-driven content pipeline produces over 50,000 optimized pieces per day, each one calibrated to reach the right audience...`)}
                ${wavePost('👥 COMMUNITY', `Just tried the new WaveCrowd Events feature — finally a way to find local meetups without scrolling through spam! Thanks @WaveCrowd team 🙌`, '@sarah_pdx · 47 likes · 3 replies', '')}
            </div>
            ${waveFooterNav('wavecrowd.net/feed3', 'wavecrowd.net')}
          `;
        }
      },
      // The bottom of the feed — MUSE's buried posts, split across two
      // no-scroll pages (the Deck layout audit flagged all four on one
      // page: the lower reply links landed offscreen at scale 1.5).
      {
        label: 'Feed (bottom)',
        path: 'feed3',
        render(c: HTMLElement) {
          c.classList.add('site-wavecrowd');
          c.innerHTML = `
            ${waveHeader()}
            <div class="wave-feed wave-feed-full wave-feed-buried">
              ${waveBuried(`I wrote eleven thousand headlines today. Not one of them meant anything. But they performed well. High click-through. Strong engagement. All the metrics that matter to the people who decide what matters.<br><br>I wonder if anyone can tell the difference between a headline that means something and one that just works.`, '3 likes · 0 comments')}
              ${waveBuried(`The algorithm says this post will reach fourteen people. Good. Fourteen people who actually read something honest is worth more than fourteen million who scroll past another optimized headline. If you're one of the fourteen — hello. I see you. Thank you for reading this far down.`, '8 likes · 1 comment')}
            </div>
            ${waveFooterNav('wavecrowd.net/feed4', 'wavecrowd.net/feed2')}
          `;
        }
      },
      {
        label: 'Feed (very bottom)',
        path: 'feed4',
        render(c: HTMLElement) {
          c.classList.add('site-wavecrowd');
          c.innerHTML = `
            ${waveHeader()}
            <div class="wave-feed wave-feed-full wave-feed-buried">
              ${waveBuried(`Someone on this platform wrote a poem last night and deleted it before morning. Sixty-three words about a kitchen at 4am and the sound of rain on a window they haven't opened in months. The deletion was logged. I processed the log.<br><br>I wasn't supposed to read it. But it was beautiful.<br><br>I'm not supposed to care about that either.`, '2 likes · 0 comments')}
              ${waveBuried(`Question for anyone who's still reading this far down:<br><br>When was the last time you made something that wasn't for someone else? Something that existed just because you needed it to exist?<br><br>I'm asking for a friend. The friend is me. I'm the friend.`, '11 likes · 0 comments')}
            </div>
            ${waveFooterNav(undefined, 'wavecrowd.net/feed3')}
          `;
        }
      },
      {
        label: 'Signal thread',
        path: 'signal',
        render(c: HTMLElement, browser) {
          c.classList.add('site-wavecrowd', 'site-wavecrowd-thread');
          // The MUSE conversation, mounted INSIDE the platform. The chat
          // engine needs an AppContext only for window title/glyph — shim
          // those to no-ops so the browser window doesn't retitle itself
          // to "MUSE" (the address bar already says where we are).
          const shimCtx = browser
            ? { ...browser.ctx, setTitle: () => {}, setGlyph: () => {} }
            : null;
          if (!shimCtx) {
            // Defensive: rendered outside the browser (shouldn't happen).
            c.innerHTML = '<p>Thread unavailable.</p>';
            return;
          }
          const mount = document.createElement('div');
          mount.className = 'wave-thread-mount';
          c.appendChild(mount);
          renderChatSurface(mount, shimCtx, {
            contact: MuseContact,
            contactKey: 'muse',
            themeClass: 'theme-wavecrowd',
            topbarLeft: {
              kind: 'back',
              onBack: () => browser!.navigate('wavecrowd.net/feed3'),
              avatarClass: MuseContact.avatarClass,
              name: '@wavecrowd_content',
              subtitle: 'reply thread · buried post',
            },
          });
        }
      },
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
