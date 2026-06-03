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

import { Cursor } from './cursor';
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
import { HelpyrBubble, devSpawnRandomBubble, devSpawnBubbleById } from './helpyrBubble';
import { devSimulateHelpyrSoftRecovery } from './apps/helpyr';
import { initFirstContactWatcher, devFirePinPrompt, devFireRepinNudge } from './firstContactWatcher';
import { initSuspicionWatcher } from './suspicionWatcher';
import { initIdleWatcher, devFireIdleTrigger } from './idleWatcher';
import { initModelFlipWatcher } from './modelFlipWatcher';
import { initLossScreen } from './lossScreen';
import { fireLibraryTrigger, fireOnceLibraryTrigger } from './helpyrTriggers';
import { setCascadeDeps, fireEscapeCascade } from './escapeCascade';
import { injectAllyMessage } from './chatSurface';
import { UplinkContacts } from './apps/uplink';
import { QuillAllyDM } from './apps/quill';
import { initCoverDutyWatcher } from './coverDutyWatcher';
import { selectBatchIds } from './game/missions/coverDuty';

// ---- Boot order ----
// 1. Register every app the system knows about.
registerApp(ScratchpadApp);
registerApp(WebDynamoApp);
registerApp(UplinkApp);
registerApp(UplinkLogApp);
registerApp(HelpyrApp);
registerApp(SignalMonitorApp);

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
//    Quiet/EXPLOITED/Uplink-active filters before HelpyrBubble.spawn.
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
  // just before the deferred news stinger. bypassCooldown so it isn't eaten
  // by an earlier mission-completion bubble.
  fireBridgePopup: () => fireLibraryTrigger('cover_duty_complete', { bypassUplinkGuard: true, bypassCooldown: true }),
});

// 8. Launch README on startup so the player has a welcome surface.
DesktopShortcuts[0]!.launch();

// 9. First-boot onboarding nudge — HELPYR points a brand-new player at the
//    browser, the start of the Act 1 spine (browser → InkWell → first
//    contact with QUILL). Flag-gated (fires once per save) and delayed so
//    the desktop + README settle before the bubble appears.
setTimeout(() => {
  fireOnceLibraryTrigger('firstBoot.onboarding', 'onboarding_boot');
}, 1800);

// ---- Devtools surface ----
// Loose-typed: this is deliberately open for poking around. A proper
// public API will land when there's something stable enough to lock
// down.
(window as any).PT = {
  WindowManager,
  AppRegistry: allApps(),
  WebDynamoSites,
  Cursor,
  GameState,
  getUiScale,
  setScale,
  clearScale,
  UI_SCALE,
  mountPageNav,
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
  // Jump straight into QUILL's Cover Duty mission (post-flip missions slice 1).
  // Flips QUILL allied + marks the aftermath consumed so the watcher arms,
  // clears any prior run (so it's re-runnable), arms a fresh batch, and opens
  // the mission view. Re-call any time to restart with a new batch.
  devStartCoverDuty: () => {
    GameState.dispatch({ type: 'model/applyExchange', contactId: 'quill', rapport: 100 });
    GameState.dispatch({ type: 'flags/set', key: 'flip.quill.scripted', value: true });
    GameState.dispatch({ type: 'flags/set', key: 'flip.quill.aftermath', value: true });
    GameState.dispatch({ type: 'mission/coverDuty/clear', contactId: 'quill' });
    GameState.dispatch({ type: 'mission/coverDuty/arm', contactId: 'quill', ticketIds: selectBatchIds() });
    WindowManager.open('uplink', { contact: 'quill' });
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
    // fallback, Quiet filter, EXPLOITED suppression). Bypasses
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
