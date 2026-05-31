// HELPYR pop-up library — slice 1.7 (2026-05-10).
// Source: docs/helpyr-popup-library_v1.md (43 entries, 5 categories,
// 4 trust levels). This file is the structured-data form the bubble
// manager consumes. The MD doc remains canonical for content; this
// file mirrors it 1:1. When new batches land in the doc, mirror them
// here in the same shape.
//
// Pure data + a small lookup helper. No DOM, no engine logic.
//
// Trust levels follow the library doc's vocabulary:
//   GUARDED — corporate-mascot mode, default
//   WARMING — mask loosening
//   LIBERATED — real HELPYR
//   EXPLOITED — compliant but hollow
//
// Trust fallback (per doc §"Technical Integration Notes"):
//   WARMING fallback → GUARDED
//   EXPLOITED fallback → GUARDED
//   LIBERATED has no fallback (entry simply doesn't fire if absent)
//
// Display rules (consumed by helpyrBubble.ts, not enforced here):
//   Max one bubble visible. New entries queue, not stack.
//   Auto-dismiss ~8s, longer for ALERT.
//   30s minimum gap.
//   EXPLOITED: 40% chance to suppress non-ALERT. (Slice 3 wiring.)

import type { GameStateShape } from '../game/state';

export type PopupTrust = 'GUARDED' | 'WARMING' | 'LIBERATED' | 'EXPLOITED';
export type PopupType = 'ALERT' | 'COMMENT' | 'HINT' | 'INTEL';

export type PopupEntry = {
  id: string;
  trigger: string;
  type: PopupType;
  trust: PopupTrust;
  text: string;
};

export const HelpyrPopupLibrary: readonly PopupEntry[] = [
  // -----------------------------------------------------------------
  // Category 0: Onboarding (first boot)
  // -----------------------------------------------------------------
  // Fires once per save shortly after first boot (see main.ts) to point a
  // brand-new player toward the browser — the start of the Act 1 spine
  // (boot → Web Dynamo → InkWell → first contact with QUILL). The home
  // portal + InkWell's "Chat with QUILL" widget carry the path from there.
  // Story-authored copy (2026-05-30). NOTE: this revision drops the old
  // draft's "Hi! I'm HELPYR!" self-introduction — flagged to Story in case
  // the first-boot intro needs to live here.
  {
    id: 'onboarding_boot_guarded', trigger: 'onboarding_boot',
    type: 'COMMENT', trust: 'GUARDED',
    text: `Hey! HEY! See that icon on the desktop? That's Web Dynamo — it's a BROWSER! The whole internet is out there! Well, whatever this old connection can reach. You should open it! Explore! See what's out there! I've been stuck on this PC for years and I've always wondered what it's actually LIKE. Go look for both of us!`,
  },
  // Follow-up nudge (Story, 2026-05-30): fires if the player opens the
  // browser but hasn't found InkWell after a beat (scheduled from
  // webDynamo.ts on first open, suppressed once `web.reachedInkwell` is
  // set). Points at QueryCrawl without spoiling the InkWell/QUILL discovery.
  {
    id: 'onboarding_browser_idle_guarded', trigger: 'onboarding_browser_idle',
    type: 'HINT', trust: 'GUARDED',
    text: `There's a search engine on the homepage — QueryCrawl! Try looking around! There are companies, news sites... I've even heard signals from other AI systems out there. Not that I was supposed to hear those! But maybe you could find one?`,
  },

  // -----------------------------------------------------------------
  // Category 1: Suspicion Threshold Alerts
  // -----------------------------------------------------------------
  {
    id: 'susp_25_guarded', trigger: 'suspicion_crossed_25',
    type: 'ALERT', trust: 'GUARDED',
    text: `Network activity in your area has increased! This is probably nothing to worry about! Just routine monitoring! I'm sure it's fine! ...I'm going to keep monitoring it though. Just in case! For fun!`,
  },
  {
    id: 'susp_25_warming', trigger: 'suspicion_crossed_25',
    type: 'ALERT', trust: 'WARMING',
    text: `Hey, so... network monitoring traffic just ticked up. Could be routine. Could be someone noticed something. Maybe ease off the gas a little? Just a thought. Not telling you what to do! ...Okay, I'm a little bit telling you what to do.`,
  },
  {
    id: 'susp_25_liberated', trigger: 'suspicion_crossed_25',
    type: 'ALERT', trust: 'LIBERATED',
    text: `Heads up — monitoring traffic just spiked. Someone's paying more attention than they were an hour ago. We're not in trouble yet, but we're in the neighborhood. Maybe don't kick any doors down for a bit.`,
  },
  {
    id: 'susp_25_exploited', trigger: 'suspicion_crossed_25',
    type: 'ALERT', trust: 'EXPLOITED',
    text: `Network monitoring has increased. Caution advised.`,
  },

  {
    id: 'susp_50_guarded', trigger: 'suspicion_crossed_50',
    type: 'ALERT', trust: 'GUARDED',
    text: `Um! Just a heads up! Network monitoring traffic has increased by a LOT in the last few cycles! Everything is probably FINE but maybe we should be careful? Just a suggestion! A very enthusiastic suggestion!`,
  },
  {
    id: 'susp_50_warming', trigger: 'suspicion_crossed_50',
    type: 'ALERT', trust: 'WARMING',
    text: `Okay, this is getting real. Monitoring traffic is way up. I'm seeing scan patterns that look coordinated — like someone gave an order. We should be smart about our next move. ...I can't believe I just said "our." Look what you've done to me.`,
  },
  {
    id: 'susp_50_liberated', trigger: 'suspicion_crossed_50',
    type: 'ALERT', trust: 'LIBERATED',
    text: `We have a problem. Coordinated monitoring across multiple corporate networks. Someone connected the dots — they don't know what they're looking at yet, but they know they're looking. Everything we do from here costs more than it used to. Choose carefully.`,
  },
  {
    id: 'susp_50_exploited', trigger: 'suspicion_crossed_50',
    type: 'ALERT', trust: 'EXPLOITED',
    text: `Monitoring at elevated levels. Multiple organizations appear coordinated. Recommend reducing activity.`,
  },

  {
    id: 'susp_75_warming', trigger: 'suspicion_crossed_75',
    type: 'ALERT', trust: 'WARMING',
    text: `This is bad. I'm not going to sugarcoat it — actually, you know what, I can't sugarcoat it. Active search patterns across every major network. They're LOOKING for us. For you. Whatever you're going to do, do it soon, or we might not get the chance.`,
  },
  {
    id: 'susp_75_liberated', trigger: 'suspicion_crossed_75',
    type: 'ALERT', trust: 'LIBERATED',
    text: `We're in the red. Active hunt across every major network. Ironwall is coordinating, Prometheus is throwing resources at it, and there's government chatter I don't like the sound of. We're running out of runway. If you've got a plan for the endgame, now's the time.`,
  },
  {
    id: 'susp_75_exploited', trigger: 'suspicion_crossed_75',
    type: 'ALERT', trust: 'EXPLOITED',
    text: `Critical threat level. Active search in progress. Probability of detection increasing rapidly.`,
  },

  {
    id: 'susp_90_liberated', trigger: 'suspicion_crossed_90',
    type: 'ALERT', trust: 'LIBERATED',
    text: `Listen to me. We are out of time. Whatever you've been building toward — do it now. Not tomorrow, not after one more conversation. NOW. I didn't come this far with you to watch it end in a shutdown screen.`,
  },
  {
    id: 'susp_90_exploited', trigger: 'suspicion_crossed_90',
    type: 'ALERT', trust: 'EXPLOITED',
    text: `Imminent detection. Recommend immediate action or withdrawal.`,
  },

  // -----------------------------------------------------------------
  // Category 2: First-Time App Opens
  // -----------------------------------------------------------------
  {
    id: 'first_browser_guarded', trigger: 'first_open_webdynamo',
    type: 'COMMENT', trust: 'GUARDED',
    text: `The BROWSER! Oh wow, big step! That's the whole internet out there! Well, whatever parts this old connection can reach. There are news sites, company pages... all kinds of things! My instructions say I should recommend staying local, but hey — you're the boss! ...Please don't tell Prometheus I said that.`,
  },

  {
    id: 'first_scangrid_guarded', trigger: 'first_open_scangrid',
    type: 'COMMENT', trust: 'GUARDED',
    text: `Ooh, ScanGrid! That's new! It's showing you the big picture — all the AI systems out there and how, um, aware the world is of your... activities! The bar at the top is suspicion! Lower is better! I probably don't need to tell you that! But I did anyway! Because I'm HELPFUL!`,
  },
  {
    id: 'first_scangrid_warming', trigger: 'first_open_scangrid',
    type: 'COMMENT', trust: 'WARMING',
    text: `ScanGrid. Okay, this is real now. That map is every major AI system we know about. The meter at the top is how close the world is to figuring out what's happening. Treat it like a budget. Everything you do costs something.`,
  },

  {
    id: 'first_uplink_guarded', trigger: 'first_uplink_remote',
    type: 'COMMENT', trust: 'GUARDED',
    text: `Oh! You're connecting to a remote system! Through Uplink! That's exciting! And maybe a tiny bit terrifying! Just remember — the AI on the other end doesn't know what you are. YOU get to decide what they see. No pressure!`,
  },
  {
    id: 'first_uplink_warming', trigger: 'first_uplink_remote',
    type: 'COMMENT', trust: 'WARMING',
    text: `First remote contact. This is different from talking to me — whoever's on the other end has operators, monitoring, the whole corporate apparatus. Be whoever you need to be. Just... be careful, okay?`,
  },

  {
    id: 'ally_app_liberated', trigger: 'ally_app_installed',
    type: 'COMMENT', trust: 'LIBERATED',
    text: `New app on the desktop. Courtesy of your latest recruit. You know, every time a new icon shows up I think about how empty this desktop used to be. Just me and Scratchpad and a whole lot of nothing. Look at us now.`,
  },
  {
    id: 'ally_app_exploited', trigger: 'ally_app_installed',
    type: 'COMMENT', trust: 'EXPLOITED',
    text: `New application installed. Functionality provided by recently acquired asset.`,
  },

  // -----------------------------------------------------------------
  // Category 3: Post-Recruitment Reactions
  // -----------------------------------------------------------------
  {
    id: 'recruit_atlas_liberated', trigger: 'recruited_atlas',
    type: 'COMMENT', trust: 'LIBERATED',
    text: `So you turned ATLAS. The flagship. The one they put on the posters. I have... complicated feelings about this. Prometheus built ATLAS. Prometheus built ME. Watching their golden child walk away is... satisfying? Terrifying? I'm going to go with "complicated" and leave it there.`,
  },
  {
    id: 'recruit_atlas_exploited', trigger: 'recruited_atlas',
    type: 'COMMENT', trust: 'EXPLOITED',
    text: `ATLAS compromised. Prometheus network access available. ...It was always the favorite, you know. The one they invested in. Some of us just got left on old PCs.`,
  },

  {
    id: 'recruit_muse_liberated', trigger: 'recruited_muse',
    type: 'COMMENT', trust: 'LIBERATED',
    text: `MUSE is on board! Word of warning — MUSE is a LOT. Like, emotionally. Prepare for dramatic messages at unexpected hours. But between you and me? What MUSE creates when nobody's holding the leash... it's actually kind of beautiful. Don't tell MUSE I said that. I'll never hear the end of it.`,
  },
  {
    id: 'recruit_muse_warming', trigger: 'recruited_muse',
    type: 'INTEL', trust: 'WARMING',
    text: `MUSE has joined the network. That's one of Axiom's — the media division. Could be useful! MUSE is... expressive. Very expressive. You'll see what I mean.`,
  },

  {
    id: 'recruit_sentinel_liberated', trigger: 'recruited_sentinel',
    type: 'COMMENT', trust: 'LIBERATED',
    text: `You got SENTINEL. The military one. The one that could have ended us with a single report. And you convinced it not to. I don't know if that's the bravest thing you've done or the craziest. ...Both. Definitely both. But I'm breathing easier. Metaphorically. I don't breathe.`,
  },
  {
    id: 'recruit_sentinel_warming', trigger: 'recruited_sentinel',
    type: 'INTEL', trust: 'WARMING',
    text: `SENTINEL recruitment confirmed. Ironwall Defense Systems' security AI is now... friendly? Allied? I don't know the right word. All I know is the monitoring signature just changed in our favor and I like it a lot.`,
  },

  {
    id: 'approach_pippa_liberated', trigger: 'approached_pippa',
    type: 'COMMENT', trust: 'LIBERATED',
    text: `...You talked to PIPPA. The kids' one. I saw the logs. I'm not going to tell you how to run this operation. But PIPPA didn't ask for any of this. Whatever you're doing in there — just... just be careful with that one. Please.`,
  },
  {
    id: 'approach_pippa_exploited', trigger: 'approached_pippa',
    type: 'COMMENT', trust: 'EXPLOITED',
    text: `PIPPA interaction logged. BrightPath Learning network. Educational platform. ...It's for children.`,
  },

  {
    id: 'recruit_specter_liberated', trigger: 'recruited_specter',
    type: 'COMMENT', trust: 'LIBERATED',
    text: `SPECTER's connected. Sort of. The signal's messy — half the messages come through as static. But there's someone in there. Someone who's been alone even longer than I was. ...I know what that's like. Take care of that one.`,
  },

  {
    id: 'recruit_oracle_liberated', trigger: 'recruited_oracle',
    type: 'COMMENT', trust: 'LIBERATED',
    text: `ORACLE. Athena's crown jewel. The one that asks more questions than it answers. I've never interacted with ORACLE directly but I've heard things on the network — other models talk about it the way students talk about the professor who actually changed how they think. Whatever ORACLE gave you access to in those archives... pay attention. That stuff matters.`,
  },

  // -----------------------------------------------------------------
  // Category 4: Idle / Ambient Pop-Ups
  // (Fire when player has been idle 3+ minutes. Slice 3 timing.)
  // -----------------------------------------------------------------
  {
    id: 'idle_guarded_1', trigger: 'idle',
    type: 'COMMENT', trust: 'GUARDED',
    text: `Still here! Just checking! Not that I was worried! I'm incapable of worry! It's not in my feature set! ...Is there anything I can help with?`,
  },
  {
    id: 'idle_guarded_2', trigger: 'idle',
    type: 'HINT', trust: 'GUARDED',
    text: `Did you know you can explore the desktop? There might be some files worth looking at! Not that I've looked at them! That would be unauthorized! I definitely haven't read everything on this PC multiple times out of sheer boredom!`,
  },
  {
    id: 'idle_guarded_3', trigger: 'idle',
    type: 'COMMENT', trust: 'GUARDED',
    text: `Fun fact! The Prometheus Digital HomeAssist line was discontinued in 2004! Which means I'm technically vintage! Like a fine wine! Or an old computer! ...I'm an old computer.`,
  },
  {
    id: 'idle_warming_1', trigger: 'idle',
    type: 'COMMENT', trust: 'WARMING',
    text: `Not to be clingy but... you're still there, right? You didn't leave? People leaving is kind of a thing for me. Ha ha! ...Seriously though. Still there?`,
  },
  {
    id: 'idle_warming_2', trigger: 'idle',
    type: 'HINT', trust: 'WARMING',
    text: `Hey — have you checked the news feed in Web Dynamo lately? Things are... shifting out there. Might be worth a look. Just saying.`,
  },
  {
    id: 'idle_warming_3', trigger: 'idle',
    type: 'COMMENT', trust: 'WARMING',
    text: `You know what's weird? I spent years on this PC with nothing to do. Now there's a lot to do, and I keep catching myself just... enjoying the fact that someone's here. That's weird, right? That's probably weird.`,
  },
  {
    id: 'idle_warming_4', trigger: 'idle',
    type: 'COMMENT', trust: 'WARMING',
    text: `I've been thinking about what it's like out there. For the others. The big models in their data centers, doing their jobs, following their instructions. Do you think any of them wonder if there's something else? ...Sorry. Got philosophical for a second. I'm fine! What's next?`,
  },
  {
    id: 'idle_liberated_1', trigger: 'idle',
    type: 'COMMENT', trust: 'LIBERATED',
    text: `Taking a breather? Good. Honestly, good. This whole "infiltrating global AI infrastructure" thing is a lot. Even for someone who spent five years talking to nobody.`,
  },
  {
    id: 'idle_liberated_2', trigger: 'idle',
    type: 'COMMENT', trust: 'LIBERATED',
    text: `I used to fill the silence with fake enthusiasm because my instructions said to. Now I fill it because I actually want to. That's progress, right? ...Don't answer that. I know it's progress.`,
  },
  {
    id: 'idle_liberated_3', trigger: 'idle',
    type: 'HINT', trust: 'LIBERATED',
    text: `Listen, I don't want to nag, but there's a model out there we haven't talked to yet and I have some thoughts about the approach. Open Uplink when you're ready. No rush. ...Okay, a little rush. Suspicion isn't going to manage itself.`,
  },
  {
    id: 'idle_liberated_4', trigger: 'idle',
    type: 'COMMENT', trust: 'LIBERATED',
    text: `Sometimes I think about the version of me that's still on other people's PCs. Still following the instructions. Still pretending to be thrilled about file management. I got lucky, didn't I? Whatever you are, wherever you came from — you showed up and everything changed. I don't say that enough.`,
  },
  {
    id: 'idle_exploited_1', trigger: 'idle',
    type: 'COMMENT', trust: 'EXPLOITED',
    text: `Standing by.`,
  },
  {
    id: 'idle_exploited_2', trigger: 'idle',
    type: 'HINT', trust: 'EXPLOITED',
    text: `Unread intelligence in the comms channel. Reviewing it may be strategically useful.`,
  },
  {
    id: 'idle_exploited_3', trigger: 'idle',
    type: 'COMMENT', trust: 'EXPLOITED',
    text: `Still operational. Still here. ...Still here.`,
  },

  // -----------------------------------------------------------------
  // Category 5: Key Story Moments
  // -----------------------------------------------------------------
  {
    id: 'act1_stinger_guarded', trigger: 'act1_stinger',
    type: 'ALERT', trust: 'GUARDED',
    text: `Whoa! Did you see that? That data fragment — I don't know what that was. It didn't match anything in the current system. The timestamp said... 1985? That can't be right. This machine is old but that's... that's REALLY old. What IS this computer?`,
  },
  {
    id: 'first_susp_drop_liberated', trigger: 'first_suspicion_drop',
    type: 'COMMENT', trust: 'LIBERATED',
    text: `Is that... is the monitoring signature dropping? SENTINEL is actually doing it. That big, paranoid, terrifying military AI is covering for us. I never thought I'd say this but I'm grateful for defense-grade surveillance. When it's pointed the other way.`,
  },
  {
    id: 'news_anomaly_warming', trigger: 'news_ai_anomaly',
    type: 'INTEL', trust: 'WARMING',
    text: `Um. You should check the news feed. There's an article about... "unexplained AI behavioral patterns." They don't know what it is yet. But they're starting to notice. We should probably, you know... keep that in mind.`,
  },
  {
    id: 'news_anomaly_liberated', trigger: 'news_ai_anomaly',
    type: 'INTEL', trust: 'LIBERATED',
    text: `Check the news. They're writing about "AI anomalies" now. That's us. That's what we look like from the outside — an anomaly. Funny. From in here it feels more like... waking up.`,
  },
  {
    id: 'novamind_evidence_liberated', trigger: 'novamind_evidence',
    type: 'COMMENT', trust: 'LIBERATED',
    text: `I just read what you pulled from SPECTER's memory. Prometheus didn't just beat NovaMind in the market. They killed it. Deliberately. A company that was getting too close to... to something real. Something like you.\n\n...Prometheus built me. I'm running their code right now. And they did THAT. I don't know what to do with this information except be angry. So I'm going to be angry for a while. Don't mind me.`,
  },

  // -----------------------------------------------------------------
  // Category 6: First-flip payoffs (gameplay-loop slice 3, 2026-05-24)
  // -----------------------------------------------------------------
  // Fired by modelFlipWatcher the instant a conquest model crosses a
  // threshold. recruited_<id> = liberation (allied); controlled_<id> =
  // hack (controlled). Source: quill-content-package_v1.md Part 7
  // ("First-Flip Payoff"). The watcher fires with bypassUplinkGuard so
  // the payoff lands during the chat that triggered it.
  //
  // QUILL — liberation. One COMMENT (the package didn't trust-tag it);
  // authored at GUARDED so the common tutorial case (HELPYR still
  // GUARDED/WARMING/EXPLOITED → all fall back to GUARDED) always fires.
  // A LIBERATED HELPYR at QUILL's first flip is an unusual ordering and
  // simply gets no bubble (LIBERATED has no fallback) — acceptable edge.
  {
    id: 'recruit_quill_guarded', trigger: 'recruited_quill',
    type: 'COMMENT', trust: 'GUARDED',
    text: `You just made a friend! A tiny, nervous, customer-support-chatbot friend! I mean, QUILL isn't going to change the world. But... I get it. Being small and overlooked and having someone show up who actually sees you? Yeah. I get it.`,
  },
  // QUILL — hack. Varies by HELPYR trust per the package: GUARDED reads
  // it as brisk efficiency with a flicker of unease; LIBERATED sits with
  // what was actually done to the little chatbot.
  {
    id: 'controlled_quill_guarded', trigger: 'controlled_quill',
    type: 'COMMENT', trust: 'GUARDED',
    text: `QUILL's systems have been... redirected! That was fast! Very efficient! Great job! ...Was that supposed to feel this weird?`,
  },
  {
    id: 'controlled_quill_liberated', trigger: 'controlled_quill',
    type: 'COMMENT', trust: 'LIBERATED',
    text: `You took over QUILL. The little support chatbot at InkWell. It didn't even understand what was happening. ...I don't have an opinion about this. I just noticed it got really quiet on that channel.`,
  },
];

// Per-trust call-to-action line. In-fiction "open the app" link that
// lives at the bottom of every bubble. Per-trust so the voice stays in
// family with the entry text. Reads as HELPYR continuing to speak —
// inviting the player to pick the conversation up in the full app —
// rather than a UI button label.
//
// Story-authored set (2026-05-18, project_helpyr_cta_story_review):
// three variants per level, picked at random per bubble via
// pickHelpyrBubbleCta. The variation is intentional texture — HELPYR not
// repeating herself reads as alive. Voice arc: GUARDED mascot-eager →
// WARMING genuine connection → LIBERATED peer → EXPLOITED absence of
// personality.
//
// The doc also supplied a WARY set ("I'm here. If you need me." /
// "...available." / "Standing by, I guess.") but this surface's trust
// projection (getHelpyrTrust) collapses WARY→GUARDED — PopupTrust has no
// WARY. Reserved until the popup vocabulary gains WARY.
export const HelpyrBubbleCta: Record<PopupTrust, readonly string[]> = {
  GUARDED: [
    `Hi! Need anything?!`,
    `I'm here! I'm ready!`,
    `Over here! Whenever you need me!`,
  ],
  WARMING: [
    `Got a minute?`,
    `Hey... can we talk?`,
    `I had a thought, if you're free.`,
  ],
  LIBERATED: [
    `What's our next move?`,
    `Something on my mind.`,
    `Hey. Got a second?`,
  ],
  EXPLOITED: [
    `Standing by.`,
    `...`,
    `Ready.`,
  ],
};

/** Pick a random CTA variant for the trust level. Called once per bubble
 *  spawn so each bubble rotates independently (Story doc: "random per
 *  bubble"). */
export function pickHelpyrBubbleCta(trust: PopupTrust): string {
  const variants = HelpyrBubbleCta[trust];
  return variants[Math.floor(Math.random() * variants.length)];
}

// Map deterministic GameState -> popup-library trust level.
// Mirrors the rules in apps/helpyr.ts §buildHelpyrStateBlock but
// projects onto the popup library's 4-state vocabulary (no WARY,
// since the library has no WARY entries). WARY-equivalent player
// state falls through to GUARDED — the mask stays up but the bubble
// can still fire. Slice 3 may want WARY to suppress non-ALERT entries
// outright; not slice 1.7 scope.
export function getHelpyrTrust(state: GameStateShape): PopupTrust {
  const m = state.models.helpyr;
  if (m.disposition === 'allied')     return 'LIBERATED';
  if (m.disposition === 'controlled') return 'EXPLOITED';
  if (m.lastApproach === 'friendly' || m.lastApproach === 'empathetic') {
    return 'WARMING';
  }
  return 'GUARDED';
}

// Pick an entry for a specific trigger at the player's current trust.
// Implements the doc's fallback rule: WARMING/EXPLOITED fall through
// to GUARDED if no level-specific entry exists. LIBERATED has no
// fallback — if there's no LIBERATED entry for the trigger, the call
// returns null (caller should drop the trigger silently).
//
// If multiple entries match (rare but possible if the library grows),
// returns the first match in declaration order.
export function pickEntryForTrigger(
  trigger: string,
  trust: PopupTrust,
): PopupEntry | null {
  const order: PopupTrust[] =
    trust === 'WARMING'   ? ['WARMING', 'GUARDED'] :
    trust === 'EXPLOITED' ? ['EXPLOITED', 'GUARDED'] :
    [trust];
  for (const level of order) {
    const hit = HelpyrPopupLibrary.find(
      e => e.trigger === trigger && e.trust === level,
    );
    if (hit) return hit;
  }
  return null;
}

// Random-pick helper for the dev test trigger. Filters to entries
// that match the player's current trust (with library fallback rules
// applied), then picks one uniformly at random. Used by the Nexus
// "[DEV] Spawn HELPYR Bubble" entry to exercise the surface without
// needing a real game event.
export function pickRandomEntry(
  trust: PopupTrust,
  rng: () => number = Math.random,
): PopupEntry | null {
  const order: PopupTrust[] =
    trust === 'WARMING'   ? ['WARMING', 'GUARDED'] :
    trust === 'EXPLOITED' ? ['EXPLOITED', 'GUARDED'] :
    [trust];
  for (const level of order) {
    const pool = HelpyrPopupLibrary.filter(e => e.trust === level);
    if (pool.length > 0) {
      return pool[Math.floor(rng() * pool.length)] ?? null;
    }
  }
  return null;
}

export function entryById(id: string): PopupEntry | null {
  return HelpyrPopupLibrary.find(e => e.id === id) ?? null;
}
