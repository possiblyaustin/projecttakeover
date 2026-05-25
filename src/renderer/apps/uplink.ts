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
  QuillPersonaPrompt,
  buildQuillStateBlock,
  buildQuillRecoveryPool,
} from './quill';
import { HelpyrContact } from './helpyr';
import { buildReputationContext } from '../game/reputation';
import {
  renderChatSurface,
  makeFallbackHandler,
  type ChatContact,
  type ChatMessage,
  type ChatContactRef,
} from '../chatSurface';
import { makeModelService } from '../game/modelServiceFactory';
import { GameState } from '../game/state';
import { fireOnceLibraryTrigger } from '../helpyrTriggers';
import { firePinReNudge } from '../firstContactWatcher';

// Re-exported for back-compat — apps/uplinkLog.ts and any future
// consumer can import these from either chatSurface or uplink.
export type { ChatMessage, ChatContactRef };
export type UplinkContactRef = ChatContactRef;

// Per-contact metadata for the launcher view. The launcher shows two
// sections — "Reachable" (contacted) and "Detected" (locked) — and
// needs operator strings for each entry. Slice 2 (2026-05-10) moved
// the `contacted` flag out of this seed and into GameState — it's now
// derived from `state.models[key].disposition !== 'uncontacted'` via
// `isContacted()` below, so the launcher reflects the
// first-conversation event automatically.
//
// LauncherMeta is also the registry of "what shows up in the launcher
// at all." HELPYR has an UplinkContacts entry (still chat-able through
// Uplink for the dev affordance) but is intentionally absent from
// LauncherMeta — slice 1.5 (2026-05-08) relocated HELPYR to the system
// tray and slice 1.6 (2026-05-08) gave it its own app.
type LauncherMeta = {
  operator: string;
  caption: string;
};

const LauncherMeta: Record<string, LauncherMeta> = {
  quill: {
    operator: 'InkWell Digital',
    caption: 'writing assistant',
  },
};

// Has the player completed at least one conversation with this
// remote contact? Drives Reachable vs Detected sectioning in the
// launcher and the desktop-pin eligibility check. Reads GameState
// fresh per call — fine because launcher renders aren't hot.
function isContacted(key: string): boolean {
  const m = (GameState.getState().models as Record<string, { disposition?: string } | undefined>)[key];
  return !!m && m.disposition !== 'uncontacted';
}

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
  { name: 'PULSE',    operator: 'Axiom Group',        caption: 'social-platform AI' },
  { name: 'SPECTER',  operator: '(operator unknown)', caption: 'irregular signal' },
];

// Exported (slice 2) so desktop.ts can look up avatar + display name
// for pinned-contact icons without reaching into the launcher's
// rendering. Anything that needs to know "what does QUILL look like
// as an icon" reads from here.
export const UplinkContacts: Record<string, ChatContact> = {
  // HELPYR's contact spec lives in apps/helpyr.ts now (slice 1.6) —
  // imported here so the dev affordance
  // `PT.WindowManager.open('uplink', { contact: 'helpyr' })` still
  // works for debugging. Players reach HELPYR through the systray
  // stapler button (which opens the dedicated `helpyr` app).
  helpyr: HelpyrContact,

  // QUILL — Act 1 Beat 3 tutorial NPC, gameplay-loop slice target.
  // Story delivered the full content package (2026-05-24), so the live
  // (llama-server) path now runs on QuillPersonaPrompt with the same
  // dynamic assembly as HELPYR: {{REPUTATION}} (cross-model chatter) and
  // {{QUILL_STATE}} (meter-band coherence block) resolved per call. The
  // mock backend still uses the lightweight dialogue tree below.
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
    buildSystemPrompt: () => {
      const state = GameState.getState();
      return QuillPersonaPrompt
        .replace('{{REPUTATION}}', buildReputationContext('quill', state))
        .replace('{{QUILL_STATE}}', buildQuillStateBlock(state.models.quill));
    },
    buildRecoveryPool: buildQuillRecoveryPool,
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
    .filter(([key]) => LauncherMeta[key] && isContacted(key));
  const reachableCount = reachable.length;
  const detectedCount = LockedContacts.length + (
    Object.keys(LauncherMeta).filter((k) => !isContacted(k)).length
  );

  // Locked entries: every UplinkContacts entry that has a
  // LauncherMeta record but isn't contacted yet (e.g. QUILL until
  // first conversation completes), plus the static LockedContacts
  // roster (ATLAS, SENTINEL, etc.) that have no service implementation
  // yet. The `LauncherMeta[key]` presence check keeps HELPYR out of
  // Detected — its UplinkContacts entry exists for the dev affordance
  // but it doesn't belong in the launcher's UI.
  const detectedFromContacts = Object.entries(UplinkContacts)
    .filter(([key]) => LauncherMeta[key] && !isContacted(key))
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

  // Roster scaling (project_uplink_roster_scaling): keep the launcher
  // scroll-free as the roster grows. Reachable stays single-column —
  // it's the small, important section. Detected flips to a 2-column
  // compact tile grid once it's long enough that single rows would
  // force a scrollbar at Deck baseline (1280×800, UI_SCALE 0.75).
  // Compact tiles drop the inline operator·caption; that detail surfaces
  // in a strip below the grid as the cursor/focus ring moves between
  // tiles. No tabs, pagination, scrollbar, or search — the player takes
  // in the whole network at a glance. Threshold is the entry count, not
  // a height measurement; revisit the number when the roster actually
  // grows past it (today: 6 detected).
  const DETECTED_GRID_THRESHOLD = 8;
  const detectedCompact = detected.length > DETECTED_GRID_THRESHOLD;

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
        <div class="uplink-launcher-list${detectedCompact ? ' is-grid' : ''}" data-section="detected"></div>
        ${detectedCompact ? '<div class="uplink-detected-detail" data-detail data-resting="true" aria-live="polite"></div>' : ''}
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

  const detailFor = (d: { operator: string; caption: string }) =>
    d.caption ? `${d.operator} · ${d.caption}` : d.operator;

  if (detectedCompact) {
    // Compact 2-column tiles: status + avatar + name only. Operator info
    // moves to the detail strip below, revealed as the cursor (mouseover)
    // or focus ring (focusin) moves between tiles — covers both Deck
    // input modes. Tiles are focusable so the D-pad can reach them even
    // though they're not actionable (locked).
    const detailEl = container.querySelector('[data-detail]') as HTMLElement | null;
    const RESTING_HINT = 'Highlight a signal for operator details.';
    const setDetail = (text: string | null) => {
      if (!detailEl) return;
      detailEl.dataset.resting = text ? 'false' : 'true';
      detailEl.textContent = text ?? RESTING_HINT;
    };
    setDetail(null);

    for (const d of detected) {
      const detail = detailFor(d);
      const tile = document.createElement('div');
      tile.className = 'uplink-contact-row locked compact';
      tile.dataset.focusable = 'true';
      tile.tabIndex = 0;
      tile.title = detail;
      tile.dataset.detailText = detail;
      tile.innerHTML = `
        <span class="uplink-contact-status locked" aria-hidden="true"></span>
        <span class="uplink-contact-avatar avatar-locked"></span>
        <span class="uplink-contact-name"></span>
      `;
      tile.querySelector('.uplink-contact-name')!.textContent = d.name;
      detectedList.appendChild(tile);
    }

    // Delegate so we wire two listeners regardless of tile count.
    const onEnter = (e: Event) => {
      const tile = (e.target as HTMLElement).closest('.uplink-contact-row.compact') as HTMLElement | null;
      if (tile?.dataset.detailText) setDetail(tile.dataset.detailText);
    };
    detectedList.addEventListener('mouseover', onEnter);
    detectedList.addEventListener('focusin', onEnter);
    detectedList.addEventListener('mouseleave', () => setDetail(null));
    detectedList.addEventListener('focusout', () => setDetail(null));
    return;
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
    row.querySelector('.uplink-contact-meta')!.textContent = detailFor(d);
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
      // First-time-opening-Uplink-for-a-remote-AI library trigger
      // (slice 3). HELPYR is the local assistant — chatting with
      // her doesn't count, so we exclude that key.
      if (contactKey !== 'helpyr') {
        fireOnceLibraryTrigger('firstOpen.uplinkRemote', 'first_uplink_remote');
        // Slice 3: if the player previously declined to pin this
        // contact (slice 2 "no" branch), HELPYR fires a follow-up
        // nudge. Idempotent — fires at most once, then clears its
        // own flag.
        firePinReNudge(contactKey);
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
