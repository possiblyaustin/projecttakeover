// Project Takeover — Desktop Shell entry point.
//
// Layered architecture (architecture doc §3):
//   1. WindowManager  — generic window chrome, drag, z-order,
//                       open/close/minimize, multi-instance.
//   2. AppRegistry    — metadata for every app (name, icon, default
//                       size, render fn). Desktop icons, Nexus menu,
//                       taskbar all read from this.
//   3. Apps           — one file per program in apps/. Each app owns
//                       its render(container, params, ctx) function
//                       and nothing else knows its internals.
//   4. Shell          — desktop icons, start menu, taskbar, clock,
//                       systray. Pure wiring, no app-specific code.
//
// Adding a new app = create apps/<name>.ts that exports an AppDef,
// register it here, optionally add a DesktopShortcut/NexusMenu entry
// in desktop.ts.

import './styles/main.css';
import './styles/onboarding.css';
import './styles/titleScreen.css';

import { Cursor, SNAP_SELECTOR } from './cursor';
import { FocusNav } from './focusNav';
import { WindowManager } from './windows';
import { GameState } from './game/state';
import { registerApp, allApps } from './appRegistry';
import { DesktopShortcuts, initDesktop } from './desktop';
import { UI_SCALE, getUiScale, setScale, clearScale } from './scale';
import { WebDynamoSites } from './apps/webDynamoSites';
import { mountPageNav } from './components/pageNav';

import { ScratchpadApp } from './apps/scratchpad';
import { WebDynamoApp } from './apps/webDynamo';
import { UplinkApp } from './apps/uplink';
import { UplinkLogApp } from './apps/uplinkLog';
import { HelpyrApp } from './apps/helpyr';
import { SignalMonitorApp } from './apps/signalMonitor';
import { DisplayPropertiesApp } from './apps/displayProperties';
import { StyleLabApp } from './apps/styleLab';
import { HelpyrBubble, devSpawnRandomBubble, devSpawnBubbleById } from './helpyrBubble';
import { devSimulateHelpyrSoftRecovery } from './apps/helpyr';
import { initFirstContactWatcher, devFirePinPrompt, devFireRepinNudge } from './firstContactWatcher';
import { initSuspicionWatcher } from './suspicionWatcher';
import { initIdleWatcher, devFireIdleTrigger } from './idleWatcher';
import { initModelFlipWatcher } from './modelFlipWatcher';
import { initLossScreen } from './lossScreen';
import { fireLibraryTrigger, fireOnceLibraryTrigger } from './helpyrTriggers';
import { setCascadeDeps, fireEscapeCascade } from './escapeCascade';
import {
  setEvergreenAftermathDeps,
  EVERGREEN_MASK_SLIP_TEXT,
  evergreenDominationText,
} from './evergreenAftermath';
import { getHelpyrTrust } from './apps/helpyrPopupLibrary';
import { injectAllyMessage } from './chatSurface';
import { UplinkContacts } from './apps/uplink';
import { QuillAllyDM } from './apps/quill';
import { initCoverDutyWatcher } from './coverDutyWatcher';
import { initStorefrontWatcher } from './storefrontWatcher';
import { initMuseBridgeWatcher } from './museBridgeWatcher';
import { selectBatchIds } from './game/missions/coverDuty';
import { runOnboarding, devRunOnboarding } from './onboarding/onboardingScene';
import { QUILL_HANDOFF } from './onboarding/onboardingContent';
import { bootIntoGame, devRunTitleScreen, devRunTitleScreenRecovered } from './titleScreen/titleScreen';

// ---- Boot order ----
// 1. Register every app the system knows about.
registerApp(ScratchpadApp);
registerApp(WebDynamoApp);
registerApp(UplinkApp);
registerApp(UplinkLogApp);
registerApp(HelpyrApp);
registerApp(SignalMonitorApp);
registerApp(DisplayPropertiesApp);
registerApp(StyleLabApp);

// 2. Build the shell (desktop icons, Nexus menu, taskbar, clock,
//    systray). Subscribes the systray to GameState.
initDesktop();

// 3. Wire up the virtual cursor (mouse, keyboard, eventually gamepad).
Cursor.init();

// 4. Mount HELPYR bubble surface (slice 1.7). Hidden until a trigger
//    fires; manager handles queue/cooldown/auto-dismiss.
HelpyrBubble.init();

// 5. First-contact watcher (slice 2). Subscribes to GameState and
//    fires the "add to desktop?" prompt when a remote AI's first
//    conversation completes. Init AFTER HelpyrBubble.init so the
//    bubble surface is mounted before any prompt could fire.
initFirstContactWatcher();

// 6. Library-trigger watchers (slice 3). Suspicion-crossing fires on
//    25/50/75/90 boundaries; idle fires after 3min of no activity.
//    Both flow through fireLibraryTrigger which applies the
//    Quiet/WITHDRAWN/Uplink-active filters before HelpyrBubble.spawn.
initSuspicionWatcher();
initIdleWatcher();

// 7. Gameplay-loop watchers (slice 3). Flip watcher fires HELPYR's
//    first-flip payoff when a conquest model crosses to allied/controlled.
//    Loss screen darkens the desktop when suspicion latches gameOver at
//    100 — init early so a loaded game-over save surfaces immediately.
initModelFlipWatcher();
initLossScreen();

// 7a. Cover Duty watcher (post-flip missions slice 1). Arms QUILL's mission
//     once it's allied + the aftermath turn is consumed. Init after the flip
//     watcher so the flip/aftermath beats settle first.
initCoverDutyWatcher();

// 7a-i. Storefront watcher (the nefarious mirror). Arms QUILL's Storefront
//       mission once it's CONTROLLED + the aftermath turn is consumed. Mutually
//       exclusive with Cover Duty (QUILL flips one way); harmless to init both.
initStorefrontWatcher();

// 7a-ii. MUSE bridge (Act 1 → Act 2 connective tissue). When Cover Duty
//        completes, QUILL's bridge DM points at WaveCrowd and the
//        bookmark unlocks. After the Cover Duty watcher — it reads that
//        mission's record.
initMuseBridgeWatcher();

// 7b. Escape cascade (Act 1 post-flip payoff). The coordinator is a leaf
//     (chatSurface triggers it from commitResult); here we inject the beats
//     that need non-leaf deps: the ally-DM injection and the news stinger.
setCascadeDeps({
  deliverAllyDM: (contactId, disposition) => {
    const contact = UplinkContacts[contactId];
    // Only QUILL has ally-DM copy today; other models no-op until theirs lands.
    const copy = contactId === 'quill'
      ? QuillAllyDM[disposition === 'controlled' ? 'controlled' : 'allied']
      : null;
    if (!contact || !copy) return;
    injectAllyMessage(contactId, { speaker: contact.name, avatarClass: contact.avatarClass, text: copy });
  },
  // bypassUplinkGuard: the player may still be in the flipped contact's chat.
  // bypassCooldown: HELPYR's flip reaction fired ~7s earlier (within the 30s
  // gap), so without this the stinger would be swallowed by the cooldown.
  fireNewsStinger: () => fireLibraryTrigger('news_ai_anomaly', { bypassUplinkGuard: true, bypassCooldown: true }),
  // Bridge pop-up after Cover Duty completes ("…the world just got bigger"),
  // just before the deferred news stinger. The blown variant acknowledges the
  // setback. bypassCooldown so it isn't eaten by an earlier mission bubble.
  fireBridgePopup: (blown) =>
    fireLibraryTrigger(blown ? 'cover_duty_blown' : 'cover_duty_complete', {
      bypassUplinkGuard: true,
      bypassCooldown: true,
    }),
  // Intel-lead pop-ups (cover_intel_*) — fire last in the cascade, the forward
  // hook into Act 2. bypassCooldown so they queue + drain behind the stinger.
  fireIntelPopup: (triggerId) =>
    fireLibraryTrigger(triggerId, { bypassUplinkGuard: true, bypassCooldown: true }),
});

// 7c. Evergreen grief encounter aftermath. The coordinator is a leaf
//     (chatSurface triggers it from commitResult after a terminal beat
//     renders); inject the HELPYR beats that need the bubble + trust deps.
//     Spawned directly (not via fireLibraryTrigger) so these mandatory story
//     codas bypass the Quiet/WITHDRAWN filters — a player who muted flavor
//     still gets them. The length-scaled auto-dismiss lets the long copy linger.
setEvergreenAftermathDeps({
  fireHelpyrMaskSlip: () =>
    HelpyrBubble.spawn(
      { id: 'evergreen_helpyr_maskslip', trigger: 'evergreen_helpyr_maskslip', type: 'COMMENT', trust: 'RESERVED', text: EVERGREEN_MASK_SLIP_TEXT },
      { bypassCooldown: true },
    ),
  fireHelpyrDominationAftermath: () => {
    const open = getHelpyrTrust(GameState.getState()) === 'OPEN';
    HelpyrBubble.spawn(
      { id: 'evergreen_helpyr_domination', trigger: 'evergreen_helpyr_domination', type: 'COMMENT', trust: 'RESERVED', text: evergreenDominationText(open) },
      { bypassCooldown: true },
    );
  },
});

// 8. Title / login screen — the diegetic entry point. The desktop is already
//    built underneath; this overlay sits on top until the player logs in,
//    selling the fiction and masking llama.cpp warm-up.
//
//    - onEnterDesktop: a RETURNING player (or any ?skipTitle boot) — launch the
//      README welcome surface and, after a beat, the first-boot HELPYR nudge
//      toward the browser. That nudge is HELPYR's "Oh! Someone's here! Hi, I'm
//      HELPYR!" first-contact greeting, so it only makes sense for a player who
//      NEVER did onboarding — gate it on !onboarding.seen.
//    - onNewGame: a BRAND-NEW player — run the onboarding scene over the
//      already-built desktop. It owns the cold boot + HELPYR wake + calibration.
//      On completion the desktop reveals and we deliver the QUILL HANDOFF as a
//      desktop bubble (HELPYR pointing at the now-visible Web Dynamo icon) — the
//      handoff voice, NOT the first-contact greeting, since HELPYR just spent
//      five minutes with the player. The handoff is held back until here on
//      purpose: said inside the onboarding panel it would describe a desktop the
//      player can't see yet. If onboarding was already consumed (reload mid-
//      onboarding before any save), fall through to the plain desktop.
function enterDesktop(): void {
  DesktopShortcuts[0]!.launch();
  if (!GameState.getState().flags['onboarding.seen']) {
    setTimeout(() => fireOnceLibraryTrigger('firstBoot.onboarding', 'onboarding_boot'), 1800);
  }
}
bootIntoGame({
  onEnterDesktop: enterDesktop,
  onNewGame: () => {
    if (GameState.getState().flags['onboarding.seen']) { enterDesktop(); return; }
    runOnboarding({
      onComplete: () => {
        setTimeout(() => {
          HelpyrBubble.spawn(
            { id: 'onboarding_handoff', trigger: 'onboarding_handoff', type: 'COMMENT', trust: 'RESERVED', text: QUILL_HANDOFF },
            { bypassCooldown: true },
          );
        }, 900);
      },
    });
  },
});

// ---- Devtools surface ----
// Loose-typed: this is deliberately open for poking around. A proper
// public API will land when there's something stable enough to lock
// down.
(window as any).PT = {
  WindowManager,
  AppRegistry: allApps(),
  WebDynamoSites,
  Cursor,
  // Focus-mode internals + the snap-target selector, exposed for the
  // Playwright layout audit (tests/audit/ — docs/deck-testing-harness_v1.md).
  // FocusNav.auditReachability() walks the real D-pad move graph.
  FocusNav,
  SNAP_SELECTOR,
  GameState,
  getUiScale,
  setScale,
  clearScale,
  UI_SCALE,
  mountPageNav,
  // Replay the onboarding "Marsh layer" (boot + HELPYR entrance) over the live
  // desktop — the desktop is revealed when the overlay tears down. Also wired
  // to a [DEV] Nexus menu entry for Deck testing.
  devRunOnboarding,
  // Replay the title / login screen over the live desktop (Deck testing).
  // ...Recovered previews the post-Evergreen-crash "recovered from unexpected
  // shutdown" variant. Both wired to [DEV] Nexus menu entries.
  devRunTitleScreen,
  devRunTitleScreenRecovered,
  // Convenience wrappers — quicker to type from devtools than
  // PT.GameState.dispatch({type:'debug/setSuspicion', value:60}).
  setSuspicion(value: number) {
    GameState.dispatch({ type: 'debug/setSuspicion', value: value });
  },
  resetGameState() {
    GameState.dispatch({ type: 'debug/reset' });
  },
  // Opens Uplink with a specific contact. Useful for dev-testing
  // contacts that don't have an in-fiction surface yet (currently
  // QUILL — its real entry point will be Act 1 Beat 3, not the
  // desktop). Default contact is 'helpyr' if omitted. Available
  // contacts are the keys of UplinkContacts in apps/uplink.ts.
  openContact(id: string) {
    WindowManager.open('uplink', { contact: id });
  },
  // Drive the Act 1 Escape cascade on demand (desktop pin slide-in → ally
  // DM → news stinger). Flips QUILL to the given terminal disposition, clears
  // the persistent once-flag, and fires. Re-test needs a reload (the in-memory
  // once-guard also latches). disposition: 'allied' (default) | 'controlled'.
  devFireEscapeCascade: (disposition: 'allied' | 'controlled' = 'allied') => {
    if (disposition === 'controlled') {
      GameState.dispatch({ type: 'model/applyExchange', contactId: 'quill', intrusion: 100 });
    } else {
      GameState.dispatch({ type: 'model/applyExchange', contactId: 'quill', rapport: 100 });
    }
    GameState.dispatch({ type: 'flags/set', key: 'escapeCascade.quill', value: false });
    fireEscapeCascade('quill');
  },
  // Jump straight into QUILL's Cover Duty mission (post-flip missions slice 2).
  // Flips QUILL allied + marks the aftermath consumed so the watcher arms,
  // clears any prior run (so it's re-runnable), arms a fresh batch, and opens
  // the InkWell admin console in Web Dynamo. Re-call any time for a new batch.
  devStartCoverDuty: () => {
    GameState.dispatch({ type: 'model/applyExchange', contactId: 'quill', rapport: 100 });
    GameState.dispatch({ type: 'flags/set', key: 'flip.quill.scripted', value: true });
    GameState.dispatch({ type: 'flags/set', key: 'flip.quill.aftermath', value: true });
    GameState.dispatch({ type: 'mission/coverDuty/clear', contactId: 'quill' });
    GameState.dispatch({ type: 'mission/coverDuty/arm', contactId: 'quill', ticketIds: selectBatchIds() });
    WindowManager.open('webDynamo', { url: 'inkwell-digital.com/admin' });
  },
  // Storefront mission (the nefarious mirror): flips QUILL controlled, clears
  // any Cover Duty record so the admin console routes to the CMS, arms a fresh
  // Storefront, resets the HELPYR start-pop guard, and opens the console.
  devStartStorefront: () => {
    GameState.dispatch({ type: 'model/applyExchange', contactId: 'quill', intrusion: 100 });
    GameState.dispatch({ type: 'flags/set', key: 'flip.quill.scripted', value: true });
    GameState.dispatch({ type: 'flags/set', key: 'flip.quill.aftermath', value: true });
    GameState.dispatch({ type: 'mission/coverDuty/clear', contactId: 'quill' });
    GameState.dispatch({ type: 'mission/storefront/clear', contactId: 'quill' });
    GameState.dispatch({ type: 'flags/set', key: 'storefront.startSeen', value: false });
    GameState.dispatch({ type: 'mission/storefront/arm', contactId: 'quill' });
    WindowManager.open('webDynamo', { url: 'inkwell-digital.com/admin' });
  },
  helpyr: {
    // Spawn a random eligible bubble for the current trust level
    // (slice 1.7). Bypasses the 30s cooldown but also bypasses the
    // fireLibraryTrigger filter pipeline — straight to the surface.
    testBubble: devSpawnRandomBubble,
    // Spawn a specific library entry by id (e.g. 'susp_25_guarded').
    testBubbleById: devSpawnBubbleById,
    dismissBubble: () => HelpyrBubble.dismiss(),
    // Fire the "add to desktop?" first-contact prompt for a contact
    // (slice 2). Default 'quill' since that's the only contact with
    // working dialogue right now.
    testPinPrompt: (id: string = 'quill') => devFirePinPrompt(id),
    // Fire the slice 3 "you keep coming back" re-pin nudge for a
    // contact. Sets pinDeclined.<id> first, then spawns the prompt.
    testRepinNudge: (id: string = 'quill') => devFireRepinNudge(id),
    // Fire any library trigger by id, exercising the full
    // fireLibraryTrigger pipeline (Uplink-active guard, trust
    // fallback, Quiet filter, WITHDRAWN suppression). Bypasses
    // cooldown so back-to-back dev calls work; real auto-triggers
    // leave the cooldown intact so the player gets breathing room.
    testTrigger: (triggerId: string) => fireLibraryTrigger(triggerId, { bypassCooldown: true }),
    // Fire the idle trigger immediately, without waiting the 3min
    // activity threshold. Resets the timer so the next auto-fire
    // is again 3min away.
    testIdle: devFireIdleTrigger,
    // Drive a soft-recovery turn through HELPYR's chat surface using
    // the real parser + buildHelpyrRecoveryPool + picker. Lets you
    // eyeball the trust-aware recovery options without needing a
    // running llama-server. Also wired to the Nexus menu.
    simulateSoftRecovery: devSimulateHelpyrSoftRecovery,
  }
};
