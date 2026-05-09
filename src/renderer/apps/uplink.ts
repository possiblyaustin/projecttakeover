// Uplink — chat with REMOTE NPC AI models. Local AI (HELPYR) lives
// in its own app per slice 1.6 (apps/helpyr.ts); this module owns
// the launcher (Reachable + Detected sections) and the chat surface
// for remote contacts. The chat plumbing itself is shared with
// HELPYR via renderer/chatSurface.ts.

import type { AppDef, AppContext, WinParams } from '../types';
import {
  QuillDialogue,
  QuillWildcards,
  classifyQuillFreeform,
  classifyQuillApproach,
  quillToneFor,
  QuillStallingPool,
  QuillFallbackPool,
} from './quill';
import { HelpyrContact } from './helpyr';
import {
  renderChatSurface,
  makeFallbackHandler,
  type ChatContact,
  type ChatMessage,
  type ChatContactRef,
} from '../chatSurface';
import { makeModelService } from '../game/modelServiceFactory';

// Re-exported for back-compat — apps/uplinkLog.ts and any future
// consumer can import these from either chatSurface or uplink.
export type { ChatMessage, ChatContactRef };
export type UplinkContactRef = ChatContactRef;

// Per-contact metadata for the launcher view. The launcher shows two
// sections — "Reachable" (contacted) and "Detected" (locked) — and
// needs operator strings + a contacted flag for each entry. Slice 2
// will move `contacted` into GameState and drive it from the
// first-conversation event; for now it's a static seed.
//
// LauncherMeta is also the registry of "what shows up in the launcher
// at all." HELPYR has an UplinkContacts entry (still chat-able through
// Uplink for the dev affordance) but is intentionally absent from
// LauncherMeta — slice 1.5 (2026-05-08) relocated HELPYR to the system
// tray and slice 1.6 (2026-05-08) gave it its own app.
type LauncherMeta = {
  operator: string;
  caption: string;
  contacted: boolean;
};

const LauncherMeta: Record<string, LauncherMeta> = {
  quill: {
    operator: 'InkWell Digital',
    caption: 'writing assistant',
    contacted: false,
  },
};

// Locked-but-detected contacts surfaced in the launcher's "Detected"
// section. These don't (yet) have UplinkContacts entries — they're
// pure flavor in slice 1, communicating the world-is-bigger feel per
// the locked-design memory. Names + operators sourced from
// docs/game-systems-architecture_v1.md (the canonical roster).
type LockedContact = {
  name: string;
  operator: string;
  caption: string;
};

const LockedContacts: readonly LockedContact[] = [
  { name: 'ATLAS',    operator: 'Prometheus Digital', caption: 'enterprise platform AI' },
  { name: 'SENTINEL', operator: 'Ironwall Security',  caption: 'security operations AI' },
  { name: 'MUSE',     operator: '(operator unclear)', caption: 'creative-tools model' },
  { name: 'PULSE',    operator: 'Verity Networks',    caption: 'social-platform AI' },
  { name: 'SPECTER',  operator: '(operator unknown)', caption: 'irregular signal' },
];

const UplinkContacts: Record<string, ChatContact> = {
  // HELPYR's contact spec lives in apps/helpyr.ts now (slice 1.6) —
  // imported here so the dev affordance
  // `PT.WindowManager.open('uplink', { contact: 'helpyr' })` still
  // works for debugging. Players reach HELPYR through the systray
  // stapler button (which opens the dedicated `helpyr` app).
  helpyr: HelpyrContact,

  // QUILL — Act 1 Beat 3 tutorial NPC. UI scaffold only: placeholder
  // dialogue tree and fallback pool from apps/quill.ts; no persona
  // prompt yet (awaiting Story team sign-off after HELPYR validates
  // against real Gemma — see docs/story-deliverables-sprint1_v1.md
  // §"Priority 4"). buildSystemPrompt returns empty string for now;
  // mock backend ignores it, live backend isn't wired for QUILL yet.
  // Open during dev with: PT.WindowManager.open('uplink', { contact: 'quill' })
  quill: {
    name: 'QUILL',
    avatarClass: 'avatar-quill',
    service: makeModelService({
      mock: {
        dialogue: QuillDialogue,
        wildcards: QuillWildcards,
        classify: classifyQuillFreeform,
        toneFor: quillToneFor,
        delayMs: 2500,
      },
      fallback: makeFallbackHandler(QuillFallbackPool),
    }),
    buildSystemPrompt: () => '',
    stallingPool: QuillStallingPool,
    typeMs: 18,
    pauseMs: 1100,
    stallingThresholdMs: 10000,
    classifyApproach: classifyQuillApproach,
  },
};

// Launcher view (slice 1, locked design 2026-05-07). Default Uplink
// open path lands here — a contact list rather than a default-contact
// chat. MSN/AIM-flavored: status dots, operator metadata, two sections
// (Reachable + Detected). Click a reachable row → swap the same window
// to the chat surface for that contact. The "← Contacts" chip on the
// chat surface comes back here.
function renderLauncher(
  container: HTMLElement,
  ctx: AppContext,
  showChat: (contactKey: string) => void,
) {
  ctx.setTitle('Uplink');
  ctx.setGlyph('icon-uplink');

  const reachable = Object.entries(UplinkContacts)
    .filter(([key]) => LauncherMeta[key]?.contacted);
  const reachableCount = reachable.length;
  const detectedCount = LockedContacts.length + (
    Object.keys(LauncherMeta).filter((k) => !LauncherMeta[k]!.contacted).length
  );

  // Locked entries: every UplinkContacts entry that has a
  // LauncherMeta record but isn't contacted yet (e.g. QUILL until
  // Beat 3 wires it), plus the static LockedContacts roster (ATLAS,
  // SENTINEL, etc.) that have no service implementation yet. The
  // `LauncherMeta[key]` presence check keeps HELPYR out of Detected
  // — its UplinkContacts entry exists for the dev affordance but
  // it doesn't belong in the launcher's UI.
  const detectedFromContacts = Object.entries(UplinkContacts)
    .filter(([key]) => LauncherMeta[key] && !LauncherMeta[key]!.contacted)
    .map(([key, c]) => ({
      key,
      name: c.name,
      operator: LauncherMeta[key]!.operator,
      caption: LauncherMeta[key]!.caption,
    }));
  const detected = [
    ...detectedFromContacts,
    ...LockedContacts.map((l) => ({ key: null, name: l.name, operator: l.operator, caption: l.caption })),
  ];

  // Header fiction (slice 1): Uplink presents itself as a forgotten
  // Prometheus Digital messenger — same operator as HELPYR, building
  // toward the future "this app phones home" beat that the takeover
  // path can exploit. The 1999 build stamp + version number are
  // diegetic vintage cues, in line with HELPYR's own "model year 2002,
  // discontinued" framing. Keep this voice consistent if anyone edits.
  //
  // SLICE-FUTURE: model reveal animation. Today the launcher renders
  // all detected entries instantly; in fiction it's odd that a fresh
  // open already lists 6 AIs. Future slice should animate the contact
  // list scanning/discovering on first open per session, then settle
  // into the static list on subsequent opens. Tied to the "Uplink as
  // forgotten Prometheus tool" framing — could be a "scanning network…
  // 6 nodes detected" loading beat.
  container.innerHTML = `
    <div class="uplink-launcher">
      <div class="uplink-launcher-header">
        <div class="uplink-launcher-mast">
          <div class="uplink-launcher-logo" aria-hidden="true">
            <span class="logo-tower"></span>
            <span class="logo-wave logo-wave-1"></span>
            <span class="logo-wave logo-wave-2"></span>
            <span class="logo-wave logo-wave-3"></span>
          </div>
          <div class="uplink-launcher-titles">
            <div class="uplink-launcher-banner">UPLINK</div>
            <div class="uplink-launcher-vendor">PROMETHEUS DIGITAL · MESSENGER v2.4</div>
            <div class="uplink-launcher-build">build 1999.04 · licensed for enterprise use</div>
          </div>
        </div>
        <div class="uplink-launcher-tagline">${detectedCount + reachableCount} signals on the network · ${reachableCount} reachable</div>
      </div>
      <div class="uplink-launcher-section">
        <div class="uplink-launcher-section-label">▼ REACHABLE (${reachableCount})</div>
        <div class="uplink-launcher-list" data-section="reachable"></div>
      </div>
      <div class="uplink-launcher-section">
        <div class="uplink-launcher-section-label">▼ DETECTED (${detected.length})</div>
        <div class="uplink-launcher-list" data-section="detected"></div>
      </div>
    </div>
  `;

  const reachableList = container.querySelector('[data-section="reachable"]') as HTMLElement;
  const detectedList = container.querySelector('[data-section="detected"]') as HTMLElement;

  for (const [key, c] of reachable) {
    const meta = LauncherMeta[key]!;
    const row = document.createElement('button');
    row.className = 'uplink-contact-row';
    row.dataset.focusable = 'true';
    row.tabIndex = 0;
    row.innerHTML = `
      <span class="uplink-contact-status online" aria-hidden="true"></span>
      <span class="uplink-contact-avatar ${c.avatarClass}"></span>
      <span class="uplink-contact-info">
        <span class="uplink-contact-name"></span>
        <span class="uplink-contact-meta"></span>
      </span>
    `;
    row.querySelector('.uplink-contact-name')!.textContent = c.name;
    row.querySelector('.uplink-contact-meta')!.textContent = `${meta.operator} · ${meta.caption}`;
    row.addEventListener('click', () => showChat(key));
    reachableList.appendChild(row);
  }

  // Empty-state for Reachable. Slice 1.5 (2026-05-08) moved HELPYR out
  // to the systray, so a fresh game opens with zero remote contacts
  // until slice 2's first-contact event fires. The empty section
  // header alone reads as a layout glitch; this in-fiction line keeps
  // the section meaningful while telling the player what they need to
  // do to populate it.
  if (reachable.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'uplink-launcher-empty';
    empty.textContent = 'No remote channels established. Open a connection from Detected.';
    reachableList.appendChild(empty);
  }

  for (const d of detected) {
    const row = document.createElement('div');
    row.className = 'uplink-contact-row locked';
    row.innerHTML = `
      <span class="uplink-contact-status locked" aria-hidden="true"></span>
      <span class="uplink-contact-avatar avatar-locked"></span>
      <span class="uplink-contact-info">
        <span class="uplink-contact-name"></span>
        <span class="uplink-contact-meta"></span>
      </span>
      <span class="uplink-contact-tag">NOT YET CONTACTED</span>
    `;
    row.querySelector('.uplink-contact-name')!.textContent = d.name;
    row.querySelector('.uplink-contact-meta')!.textContent = d.caption
      ? `${d.operator} · ${d.caption}`
      : d.operator;
    detectedList.appendChild(row);
  }
}

export const UplinkApp: AppDef = {
  id: 'uplink',
  name: 'Uplink',
  glyphClass: 'icon-uplink',
  // Sized so the launcher renders all 7 contact rows without a
  // scrollbar at Deck UI_SCALE — controller nav can't reach scroll
  // affordances easily, and a scrollbar means the player can't see
  // the world-is-bigger feel at a glance. h=500 covers the logo
  // header + section labels + 7 rows + breathing room with content
  // to spare for the chat surface (controls panel adapts via
  // max-height: 60%).
  defaultSize: { w: 460, h: 500 },
  contentBevel: false,
  noContentPad: true,
  render(container: HTMLElement, params: WinParams, ctx: AppContext) {
    // Two views: launcher (default) and chat (when a contact is named).
    // Opening Uplink with no params lands on the launcher; clicking a
    // reachable contact swaps the same window's content to that
    // contact's chat surface via renderChatSurface (shared with
    // HELPYR app, per slice 1.6).
    function showLauncher() {
      renderLauncher(container, ctx, (key) => showChat(key));
    }
    function showChat(contactKey: string) {
      const contact = UplinkContacts[contactKey];
      if (!contact) {
        // Defensive fallback: stale params.contact references an
        // unknown contact → drop back to the launcher.
        showLauncher();
        return;
      }
      renderChatSurface(container, ctx, {
        contact,
        contactKey,
        topbarLeft: {
          kind: 'back',
          label: '← Contacts',
          onBack: showLauncher,
        },
        titleFormat: (c) => c.name + ' — Uplink',
      });
    }

    if (params.contact) {
      showChat(params.contact);
    } else {
      showLauncher();
    }
  }
};
