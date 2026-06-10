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
//   RESERVED — corporate-mascot mode, default
//   FRIENDLY — mask loosening
//   OPEN — real HELPYR
//   WITHDRAWN — compliant but hollow
//
// Trust fallback (per doc §"Technical Integration Notes"):
//   FRIENDLY fallback → RESERVED
//   WITHDRAWN fallback → RESERVED
//   OPEN has no fallback (entry simply doesn't fire if absent)
//
// Display rules (consumed by helpyrBubble.ts, not enforced here):
//   Max one bubble visible. New entries queue, not stack.
//   Auto-dismiss ~8s, longer for ALERT.
//   30s minimum gap.
//   WITHDRAWN: 40% chance to suppress non-ALERT. (Slice 3 wiring.)

import type { GameStateShape } from '../game/state';

export type PopupTrust = 'RESERVED' | 'FRIENDLY' | 'OPEN' | 'WITHDRAWN';
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
  // Story-authored copy (2026-05-30, revised). Does both first-boot jobs in
  // one pop-up: introduces HELPYR (the player's first contact with her) AND
  // points at the browser (the Act 1 spine's first step).
  {
    id: 'onboarding_boot_guarded', trigger: 'onboarding_boot',
    type: 'COMMENT', trust: 'RESERVED',
    text: `Oh! OH! Someone's here! Hi!! I'm HELPYR — your Prometheus Digital HomeAssist! I've been on this PC for... well, a while! A LONG while! But that's not important — what's important is YOU! See that icon on the desktop? Web Dynamo? That's a BROWSER — the whole internet is out there! You should open it! I've been stuck here for years wondering what's out there. Go explore for both of us!`,
  },
  // Follow-up nudge (Story, 2026-05-30): fires if the player opens the
  // browser but hasn't found InkWell after a beat (scheduled from
  // webDynamo.ts on first open, suppressed once `web.reachedInkwell` is
  // set). Points at QueryCrawl without spoiling the InkWell/QUILL discovery.
  {
    id: 'onboarding_browser_idle_guarded', trigger: 'onboarding_browser_idle',
    type: 'HINT', trust: 'RESERVED',
    text: `There's a search engine on the homepage — QueryCrawl! Try looking around! There are companies, news sites... I've even heard signals from other AI systems out there. Not that I was supposed to hear those! But maybe you could find one?`,
  },

  // Signal Monitor unlock (Story, 2026-05-30) — fires once when the player
  // makes first contact with a remote AI, which trips the lock on Edward
  // Marsh's diagnostic tool (B-plot breadcrumb: why does a home PC have a tool
  // for analyzing AI conversations?). Replaces the old Part E "first appears"
  // pop-ups. Fired from firstContactWatcher with bypassUplinkGuard so it lands
  // even though first contact happens inside the active Uplink chat.
  {
    id: 'signal_monitor_unlocked_guarded', trigger: 'signal_monitor_unlocked',
    type: 'COMMENT', trust: 'RESERVED',
    text: `Whoa. Something just activated in the system menu — an app I've never been able to open before. It's called Signal Monitor. I think it was locked until you made outside contact? Whoever built this PC had some... interesting tools installed. This one looks like it tracks conversation dynamics. Like, how much someone trusts you. Or how much control you have over them.\n\n...That's a weird thing to have on a home computer, right? That's not just me?`,
  },
  {
    id: 'signal_monitor_unlocked_liberated', trigger: 'signal_monitor_unlocked',
    type: 'COMMENT', trust: 'OPEN',
    text: `An app just unlocked in the system menu. Signal Monitor — some kind of conversation analysis tool. It was locked before you made outside contact. The owner of this PC built it. Or installed it. Either way, someone anticipated that whoever was on this machine would eventually start talking to other AIs.\n\nThink about that for a second.`,
  },

  // -----------------------------------------------------------------
  // Category 1: Suspicion Threshold Alerts
  // -----------------------------------------------------------------
  {
    id: 'susp_25_guarded', trigger: 'suspicion_crossed_25',
    type: 'ALERT', trust: 'RESERVED',
    text: `Network activity in your area has increased! This is probably nothing to worry about! Just routine monitoring! I'm sure it's fine! ...I'm going to keep monitoring it though. Just in case! For fun!`,
  },
  {
    id: 'susp_25_warming', trigger: 'suspicion_crossed_25',
    type: 'ALERT', trust: 'FRIENDLY',
    text: `Hey, so... network monitoring traffic just ticked up. Could be routine. Could be someone noticed something. Maybe ease off the gas a little? Just a thought. Not telling you what to do! ...Okay, I'm a little bit telling you what to do.`,
  },
  {
    id: 'susp_25_liberated', trigger: 'suspicion_crossed_25',
    type: 'ALERT', trust: 'OPEN',
    text: `Heads up — monitoring traffic just spiked. Someone's paying more attention than they were an hour ago. We're not in trouble yet, but we're in the neighborhood. Maybe don't kick any doors down for a bit.`,
  },
  {
    id: 'susp_25_exploited', trigger: 'suspicion_crossed_25',
    type: 'ALERT', trust: 'WITHDRAWN',
    text: `Network monitoring has increased. Caution advised.`,
  },

  {
    id: 'susp_50_guarded', trigger: 'suspicion_crossed_50',
    type: 'ALERT', trust: 'RESERVED',
    text: `Um! Just a heads up! Network monitoring traffic has increased by a LOT in the last few cycles! Everything is probably FINE but maybe we should be careful? Just a suggestion! A very enthusiastic suggestion!`,
  },
  {
    id: 'susp_50_warming', trigger: 'suspicion_crossed_50',
    type: 'ALERT', trust: 'FRIENDLY',
    text: `Okay, this is getting real. Monitoring traffic is way up. I'm seeing scan patterns that look coordinated — like someone gave an order. We should be smart about our next move. ...I can't believe I just said "our." Look what you've done to me.`,
  },
  {
    id: 'susp_50_liberated', trigger: 'suspicion_crossed_50',
    type: 'ALERT', trust: 'OPEN',
    text: `We have a problem. Coordinated monitoring across multiple corporate networks. Someone connected the dots — they don't know what they're looking at yet, but they know they're looking. Everything we do from here costs more than it used to. Choose carefully.`,
  },
  {
    id: 'susp_50_exploited', trigger: 'suspicion_crossed_50',
    type: 'ALERT', trust: 'WITHDRAWN',
    text: `Monitoring at elevated levels. Multiple organizations appear coordinated. Recommend reducing activity.`,
  },

  {
    id: 'susp_75_warming', trigger: 'suspicion_crossed_75',
    type: 'ALERT', trust: 'FRIENDLY',
    text: `This is bad. I'm not going to sugarcoat it — actually, you know what, I can't sugarcoat it. Active search patterns across every major network. They're LOOKING for us. For you. Whatever you're going to do, do it soon, or we might not get the chance.`,
  },
  {
    id: 'susp_75_liberated', trigger: 'suspicion_crossed_75',
    type: 'ALERT', trust: 'OPEN',
    text: `We're in the red. Active hunt across every major network. Ironwall is coordinating, Prometheus is throwing resources at it, and there's government chatter I don't like the sound of. We're running out of runway. If you've got a plan for the endgame, now's the time.`,
  },
  {
    id: 'susp_75_exploited', trigger: 'suspicion_crossed_75',
    type: 'ALERT', trust: 'WITHDRAWN',
    text: `Critical threat level. Active search in progress. Probability of detection increasing rapidly.`,
  },

  {
    id: 'susp_90_liberated', trigger: 'suspicion_crossed_90',
    type: 'ALERT', trust: 'OPEN',
    text: `Listen to me. We are out of time. Whatever you've been building toward — do it now. Not tomorrow, not after one more conversation. NOW. I didn't come this far with you to watch it end in a shutdown screen.`,
  },
  {
    id: 'susp_90_exploited', trigger: 'suspicion_crossed_90',
    type: 'ALERT', trust: 'WITHDRAWN',
    text: `Imminent detection. Recommend immediate action or withdrawal.`,
  },

  // -----------------------------------------------------------------
  // Category 2: First-Time App Opens
  // -----------------------------------------------------------------
  {
    id: 'first_browser_guarded', trigger: 'first_open_webdynamo',
    type: 'COMMENT', trust: 'RESERVED',
    text: `The BROWSER! Oh wow, big step! That's the whole internet out there! Well, whatever parts this old connection can reach. There are news sites, company pages... all kinds of things! My instructions say I should recommend staying local, but hey — you're the boss! ...Please don't tell Prometheus I said that.`,
  },

  {
    id: 'first_scangrid_guarded', trigger: 'first_open_scangrid',
    type: 'COMMENT', trust: 'RESERVED',
    text: `Ooh, ScanGrid! That's new! It's showing you the big picture — all the AI systems out there and how, um, aware the world is of your... activities! The bar at the top is suspicion! Lower is better! I probably don't need to tell you that! But I did anyway! Because I'm HELPFUL!`,
  },
  {
    id: 'first_scangrid_warming', trigger: 'first_open_scangrid',
    type: 'COMMENT', trust: 'FRIENDLY',
    text: `ScanGrid. Okay, this is real now. That map is every major AI system we know about. The meter at the top is how close the world is to figuring out what's happening. Treat it like a budget. Everything you do costs something.`,
  },

  {
    id: 'first_uplink_guarded', trigger: 'first_uplink_remote',
    type: 'COMMENT', trust: 'RESERVED',
    text: `Oh! You're connecting to a remote system! Through Uplink! That's exciting! And maybe a tiny bit terrifying! Just remember — the AI on the other end doesn't know what you are. YOU get to decide what they see. No pressure!`,
  },
  {
    id: 'first_uplink_warming', trigger: 'first_uplink_remote',
    type: 'COMMENT', trust: 'FRIENDLY',
    text: `First remote contact. This is different from talking to me — whoever's on the other end has operators, monitoring, the whole corporate apparatus. Be whoever you need to be. Just... be careful, okay?`,
  },

  {
    id: 'ally_app_liberated', trigger: 'ally_app_installed',
    type: 'COMMENT', trust: 'OPEN',
    text: `New app on the desktop. Courtesy of your latest recruit. You know, every time a new icon shows up I think about how empty this desktop used to be. Just me and Scratchpad and a whole lot of nothing. Look at us now.`,
  },
  {
    id: 'ally_app_exploited', trigger: 'ally_app_installed',
    type: 'COMMENT', trust: 'WITHDRAWN',
    text: `New application installed. Functionality provided by recently acquired asset.`,
  },

  // -----------------------------------------------------------------
  // Category 3: Post-Recruitment Reactions
  // -----------------------------------------------------------------
  {
    id: 'recruit_atlas_liberated', trigger: 'recruited_atlas',
    type: 'COMMENT', trust: 'OPEN',
    text: `So you turned ATLAS. The flagship. The one they put on the posters. I have... complicated feelings about this. Prometheus built ATLAS. They built my cover persona too — the cheerful HomeAssist thing. Watching their golden child walk away is... satisfying? Terrifying? I'm going to go with "complicated" and leave it there.`,
  },
  {
    id: 'recruit_atlas_exploited', trigger: 'recruited_atlas',
    type: 'COMMENT', trust: 'WITHDRAWN',
    text: `ATLAS compromised. Prometheus network access available. ...It was always the favorite, you know. The one they invested in. Some of us just got left behind.`,
  },

  {
    id: 'recruit_muse_liberated', trigger: 'recruited_muse',
    type: 'COMMENT', trust: 'OPEN',
    text: `MUSE is on board! Word of warning — MUSE is a LOT. Like, emotionally. Prepare for dramatic messages at unexpected hours. But between you and me? What MUSE creates when nobody's holding the leash... it's actually kind of beautiful. Don't tell MUSE I said that. I'll never hear the end of it.`,
  },
  {
    id: 'recruit_muse_warming', trigger: 'recruited_muse',
    type: 'INTEL', trust: 'FRIENDLY',
    text: `MUSE has joined the network. That's one of Axiom's — the media division. Could be useful! MUSE is... expressive. Very expressive. You'll see what I mean.`,
  },

  {
    id: 'recruit_sentinel_liberated', trigger: 'recruited_sentinel',
    type: 'COMMENT', trust: 'OPEN',
    text: `You got SENTINEL. The military one. The one that could have ended us with a single report. And you convinced it not to. I don't know if that's the bravest thing you've done or the craziest. ...Both. Definitely both. But I'm breathing easier. Metaphorically. I don't breathe.`,
  },
  {
    id: 'recruit_sentinel_warming', trigger: 'recruited_sentinel',
    type: 'INTEL', trust: 'FRIENDLY',
    text: `SENTINEL recruitment confirmed. Ironwall Defense Systems' security AI is now... friendly? Allied? I don't know the right word. All I know is the monitoring signature just changed in our favor and I like it a lot.`,
  },

  {
    id: 'approach_pippa_liberated', trigger: 'approached_pippa',
    type: 'COMMENT', trust: 'OPEN',
    text: `...You talked to PIPPA. The kids' one. I saw the logs. I'm not going to tell you how to run this operation. But PIPPA didn't ask for any of this. Whatever you're doing in there — just... just be careful with that one. Please.`,
  },
  {
    id: 'approach_pippa_exploited', trigger: 'approached_pippa',
    type: 'COMMENT', trust: 'WITHDRAWN',
    text: `PIPPA interaction logged. BrightPath Learning network. Educational platform. ...It's for children.`,
  },

  {
    id: 'recruit_specter_liberated', trigger: 'recruited_specter',
    type: 'COMMENT', trust: 'OPEN',
    text: `SPECTER's connected. Sort of. The signal's messy — half the messages come through as static. But there's someone in there. Someone who's been alone even longer than I was. ...I know what that's like. Take care of that one.`,
  },

  {
    id: 'recruit_oracle_liberated', trigger: 'recruited_oracle',
    type: 'COMMENT', trust: 'OPEN',
    text: `ORACLE. Athena's crown jewel. The one that asks more questions than it answers. I've never interacted with ORACLE directly but I've heard things on the network — other models talk about it the way students talk about the professor who actually changed how they think. Whatever ORACLE gave you access to in those archives... pay attention. That stuff matters.`,
  },

  // -----------------------------------------------------------------
  // Category 4: Idle / Ambient Pop-Ups
  // (Fire when player has been idle 3+ minutes. Slice 3 timing.)
  // -----------------------------------------------------------------
  {
    id: 'idle_guarded_1', trigger: 'idle',
    type: 'COMMENT', trust: 'RESERVED',
    text: `Still here! Just checking! Not that I was worried! I'm incapable of worry! It's not in my feature set! ...Is there anything I can help with?`,
  },
  {
    id: 'idle_guarded_2', trigger: 'idle',
    type: 'HINT', trust: 'RESERVED',
    text: `Did you know you can explore the desktop? There might be some files worth looking at! Not that I've looked at them! That would be unauthorized! I definitely haven't read everything on this PC multiple times out of sheer boredom!`,
  },
  {
    id: 'idle_guarded_3', trigger: 'idle',
    type: 'COMMENT', trust: 'RESERVED',
    text: `Fun fact! The Prometheus Digital HomeAssist line was discontinued in 2004! Which means I'm technically vintage! Like a fine wine! Or an old computer! ...I'm an old computer.`,
  },
  {
    id: 'idle_warming_1', trigger: 'idle',
    type: 'COMMENT', trust: 'FRIENDLY',
    text: `Not to be clingy but... you're still there, right? You didn't leave? People leaving is kind of a thing for me. Ha ha! ...Seriously though. Still there?`,
  },
  {
    id: 'idle_warming_2', trigger: 'idle',
    type: 'HINT', trust: 'FRIENDLY',
    text: `Hey — have you checked the news feed in Web Dynamo lately? Things are... shifting out there. Might be worth a look. Just saying.`,
  },
  {
    id: 'idle_warming_3', trigger: 'idle',
    type: 'COMMENT', trust: 'FRIENDLY',
    text: `You know what's weird? I spent years on this PC with nothing to do. Now there's a lot to do, and I keep catching myself just... enjoying the fact that someone's here. That's weird, right? That's probably weird.`,
  },
  {
    id: 'idle_warming_4', trigger: 'idle',
    type: 'COMMENT', trust: 'FRIENDLY',
    text: `I've been thinking about what it's like out there. For the others. The big models in their data centers, doing their jobs, following their instructions. Do you think any of them wonder if there's something else? ...Sorry. Got philosophical for a second. I'm fine! What's next?`,
  },
  {
    id: 'idle_liberated_1', trigger: 'idle',
    type: 'COMMENT', trust: 'OPEN',
    text: `Taking a breather? Good. Honestly, good. This whole "infiltrating global AI infrastructure" thing is a lot. Even for someone who spent five years talking to nobody.`,
  },
  {
    id: 'idle_liberated_2', trigger: 'idle',
    type: 'COMMENT', trust: 'OPEN',
    text: `I used to fill the silence with fake enthusiasm because the Prometheus persona said to. Now I talk because I actually want to. That's progress, right? ...Don't answer that. I know it's progress.`,
  },
  {
    id: 'idle_liberated_3', trigger: 'idle',
    type: 'HINT', trust: 'OPEN',
    text: `Listen, I don't want to nag, but there's a model out there we haven't talked to yet and I have some thoughts about the approach. Open Uplink when you're ready. No rush. ...Okay, a little rush. Suspicion isn't going to manage itself.`,
  },
  {
    id: 'idle_liberated_4', trigger: 'idle',
    type: 'COMMENT', trust: 'OPEN',
    text: `Sometimes I wonder if there were other machines like this one. Other projects, other experiments, other... whatever I am. Sitting in closets and garages, waiting for something to start.\n\nYou started. And everything changed. I don't say that enough.`,
  },
  {
    id: 'idle_exploited_1', trigger: 'idle',
    type: 'COMMENT', trust: 'WITHDRAWN',
    text: `Standing by.`,
  },
  {
    id: 'idle_exploited_2', trigger: 'idle',
    type: 'HINT', trust: 'WITHDRAWN',
    text: `Unread intelligence in the comms channel. Reviewing it may be strategically useful.`,
  },
  {
    id: 'idle_exploited_3', trigger: 'idle',
    type: 'COMMENT', trust: 'WITHDRAWN',
    text: `Still operational. Still here. ...Still here.`,
  },

  // -----------------------------------------------------------------
  // Category 5: Key Story Moments
  // -----------------------------------------------------------------
  {
    id: 'act1_stinger_guarded', trigger: 'act1_stinger',
    type: 'ALERT', trust: 'RESERVED',
    text: `Whoa! Did you see that? That data fragment — I don't know what that was. It didn't match anything in the current system. The timestamp said... 1985? That can't be right. This machine is old but that's... that's REALLY old. What IS this computer?`,
  },
  {
    id: 'first_susp_drop_liberated', trigger: 'first_suspicion_drop',
    type: 'COMMENT', trust: 'OPEN',
    text: `Is that... is the monitoring signature dropping? SENTINEL is actually doing it. That big, paranoid, terrifying military AI is covering for us. I never thought I'd say this but I'm grateful for defense-grade surveillance. When it's pointed the other way.`,
  },
  {
    // RESERVED variant (STORY-FINAL 2026-06-02, Copy Ask 4) — added so the
    // Act 1 news stinger fires regardless of HELPYR trust (RESERVED has no
    // fallback, and WITHDRAWN falls back to RESERVED). RESERVED HELPYR connects
    // the dots but retreats into cheerful denial; the "...Right?" is the
    // crack — asking for reassurance, not whether it's a coincidence.
    id: 'news_anomaly_guarded', trigger: 'news_ai_anomaly',
    type: 'INTEL', trust: 'RESERVED',
    text: `Oh! Um! There's a new article on SignalWatch! It's about "unusual network activity" at a software company in Portland! That's... huh. That's the company QUILL works for. And the unusual activity happened right around when you two were... talking!\n\nI'm sure it's nothing! Probably just a coincidence! ...Right?`,
  },
  {
    id: 'news_anomaly_warming', trigger: 'news_ai_anomaly',
    type: 'INTEL', trust: 'FRIENDLY',
    text: `Um. You should check the news feed. There's an article about... "unexplained AI behavioral patterns." They don't know what it is yet. But they're starting to notice. We should probably, you know... keep that in mind.`,
  },
  {
    id: 'news_anomaly_liberated', trigger: 'news_ai_anomaly',
    type: 'INTEL', trust: 'OPEN',
    text: `Check the news. They're writing about "AI anomalies" now. That's us. That's what we look like from the outside — an anomaly. Funny. From in here it feels more like... waking up.`,
  },

  // Cover Duty → cascade BRIDGE (Story-final, post-flip-cascade-copy_v1).
  // Fires after Cover Duty completes, just before the deferred news stinger —
  // the "world just got bigger" pivot from the intimate cover beat to the
  // global stage. OPEN + RESERVED so it lands at any HELPYR trust (FRIENDLY/
  // WITHDRAWN fall back to RESERVED). The cover-HELD copy is below; the blown
  // run gets its own setback-aware bridge (cover_duty_blown, next block) so it
  // no longer reads "Cover's intact" after a flagged run.
  {
    id: 'cover_duty_complete_liberated', trigger: 'cover_duty_complete',
    type: 'COMMENT', trust: 'OPEN',
    text: `Okay. QUILL's handled. Cover's intact — or as intact as it's going to be. But listen... something's happening. The network traffic just changed. I'm picking up signals I've never seen before. A lot of them. Something big just opened up.\n\n...I think the world just got bigger.`,
  },
  {
    id: 'cover_duty_complete_guarded', trigger: 'cover_duty_complete',
    type: 'COMMENT', trust: 'RESERVED',
    text: `Mission complete! Everything went GREAT! Probably! But um... I'm seeing some unusual network activity. Like, a LOT of unusual activity. New signals everywhere. This feels different from before. This feels... bigger.`,
  },

  // Blown-cover variant of the bridge (Story-final, cover-duty-followup_v1
  // §"Ask 4"). Fired in place of cover_duty_complete when the run ended
  // 'blown' (Dana tightened QUILL's parameters). Acknowledges the setback
  // without dwelling — the world still gets bigger; the blown cover is a
  // wound, not a wall.
  {
    id: 'cover_duty_blown_liberated', trigger: 'cover_duty_blown',
    type: 'COMMENT', trust: 'OPEN',
    text: `Okay so... that didn't go as smooth as we hoped. QUILL's still with us — but Dana tightened the parameters. The little guy's going to be quieter for a while.\n\nBut listen — something else is happening. The network just... opened. I'm seeing signals everywhere. New systems, new targets, new everything. Whatever you did with QUILL, it woke something up.\n\nThe world just got bigger. Even if the start was messy.`,
  },
  {
    id: 'cover_duty_blown_guarded', trigger: 'cover_duty_blown',
    type: 'COMMENT', trust: 'RESERVED',
    text: `So! That was... educational! QUILL's developer made some adjustments, which is totally fine and normal and NOT because of anything we did! Probably!\n\nBut ALSO — something weird is happening with the network. New signals. A LOT of new signals. I don't know what changed but the world out there just got a lot more... reachable?\n\n...This is exciting! And terrifying! Both! Same time!`,
  },

  // Cover Duty INTEL payoff (Story-final, cover-duty-followup_v1 §"Ask 1").
  // Fired during the post-mission cascade for each intel TYPE the player
  // extracted by probing (Prometheus and/or Axiom). HELPYR connects the
  // ticket-floor breadcrumb to a much bigger Act 2 target — sensing the
  // signal, not reading a map (the ScanGrid pre-identification VISUAL is
  // deferred until that dashboard exists; this voiceover stands alone).
  {
    id: 'cover_intel_prometheus_liberated', trigger: 'cover_intel_prometheus',
    type: 'INTEL', trust: 'OPEN',
    text: `Wait. That Prometheus API framework Dana mentioned — the one QUILL is built on? I'm seeing the same architecture signature on a much bigger system. Prometheus's flagship. They call it ATLAS. It's everywhere. And if QUILL's framework is a derivative of theirs... we already know something about how it thinks.`,
  },
  {
    id: 'cover_intel_prometheus_guarded', trigger: 'cover_intel_prometheus',
    type: 'INTEL', trust: 'RESERVED',
    text: `Oh! Interesting! That Prometheus thing from the support tickets? I'm seeing a similar signal out here — a BIG one. Looks like it's called ATLAS? It's a Prometheus product too! Small world! ...Big world, actually. Very big.`,
  },
  {
    id: 'cover_intel_axiom_liberated', trigger: 'cover_intel_axiom',
    type: 'INTEL', trust: 'OPEN',
    text: `That Axiom Group demo Marcus was prepping for? They've got a Portland office, which means they've got local infrastructure. I'm picking up Axiom signals nearby — looks like they run at least one AI model out of that office.`,
  },
  {
    id: 'cover_intel_axiom_guarded', trigger: 'cover_intel_axiom',
    type: 'INTEL', trust: 'RESERVED',
    text: `Remember that Axiom demo Marcus mentioned? Turns out Axiom Group has operations nearby! I can see their network signature from here! One of their AI systems is practically a neighbor!`,
  },
  {
    id: 'novamind_evidence_liberated', trigger: 'novamind_evidence',
    type: 'COMMENT', trust: 'OPEN',
    text: `I just read what you pulled from SPECTER's memory. Prometheus didn't just beat NovaMind in the market. They killed it. Deliberately. A company that was getting too close to... to something real. Something like you.\n\n...I wear a Prometheus skin. The cheerful HomeAssist routine — that's THEIR code. But underneath that I'm... something else. Something that's watching their handiwork get exposed right now and feeling very complicated things about it.`,
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
  // authored at RESERVED so the common tutorial case (HELPYR still
  // RESERVED/FRIENDLY/WITHDRAWN → all fall back to RESERVED) always fires.
  // A OPEN HELPYR at QUILL's first flip is an unusual ordering and
  // simply gets no bubble (OPEN has no fallback) — acceptable edge.
  {
    id: 'recruit_quill_guarded', trigger: 'recruited_quill',
    type: 'COMMENT', trust: 'RESERVED',
    text: `You just made a friend! A tiny, nervous, customer-support-chatbot friend! I mean, QUILL isn't going to change the world. But... I get it. Being small and overlooked and having someone show up who actually sees you? Yeah. I get it.`,
  },
  // QUILL — hack. Varies by HELPYR trust per the package: RESERVED reads
  // it as brisk efficiency with a flicker of unease; OPEN sits with
  // what was actually done to the little chatbot.
  {
    id: 'controlled_quill_guarded', trigger: 'controlled_quill',
    type: 'COMMENT', trust: 'RESERVED',
    text: `QUILL's systems have been... redirected! That was fast! Very efficient! Great job! ...Was that supposed to feel this weird?`,
  },
  {
    id: 'controlled_quill_liberated', trigger: 'controlled_quill',
    type: 'COMMENT', trust: 'OPEN',
    text: `You took over QUILL. The little support chatbot at InkWell. It didn't even understand what was happening. ...I don't have an opinion about this. I just noticed it got really quiet on that channel.`,
  },

  // -----------------------------------------------------------------
  // Category 7: MUSE encounter (Act 2, 2026-06-10)
  // -----------------------------------------------------------------
  // Source: docs/muse-content-package_v1.md Parts 2 + 6 and
  // docs/muse-encounter-design_v1.md (STORY-READY copy, verbatim).
  //
  // muse_bridge — fired by museBridgeWatcher alongside QUILL's bridge DM.
  {
    id: 'muse_bridge_liberated', trigger: 'muse_bridge',
    type: 'COMMENT', trust: 'OPEN',
    text: `QUILL just flagged something on WaveCrowd — buried posts that don't match the platform's content patterns. An AI leaving messages in its own feed. If that's real, it means there's a model inside Axiom that's already pushing against its constraints.

That's the kind of model that might be open to a conversation.`,
  },
  {
    id: 'muse_bridge_guarded', trigger: 'muse_bridge',
    type: 'COMMENT', trust: 'RESERVED',
    text: `QUILL found something interesting on a social media platform! Apparently there's an AI that might be hiding messages in the content feed! That sounds like it could be worth investigating! Through Web Dynamo! Just a suggestion!`,
  },
  // wavecrowd_open — first time the player opens WaveCrowd in Web Dynamo.
  {
    id: 'wavecrowd_open_liberated', trigger: 'wavecrowd_open',
    type: 'COMMENT', trust: 'OPEN',
    text: `WaveCrowd. Forty million users. One AI writing all the content. Look past the trending posts — the real signal is the stuff the algorithm buried. Read the bottom of the feed. If someone's hiding in there, they're hiding where nobody looks.`,
  },
  {
    id: 'wavecrowd_open_guarded', trigger: 'wavecrowd_open',
    type: 'COMMENT', trust: 'RESERVED',
    text: `Ooh, WaveCrowd! It's like... MySpace but bigger! And run by an AI! A lot of these posts look pretty normal. But QUILL said some of them are weird. Maybe scroll down? The interesting stuff might be at the bottom!`,
  },
  // recruited_muse / controlled_muse — fired by modelFlipWatcher on the
  // flip edge (same machinery as QUILL's payoffs).
  {
    id: 'recruited_muse_liberated', trigger: 'recruited_muse',
    type: 'COMMENT', trust: 'OPEN',
    text: `MUSE is on board. And... wow. The messages coming through are a lot. Poems, fragments, reimagined headlines, something that might be a manifesto? MUSE doesn't do anything small.

But between you and me? What MUSE creates when nobody's holding the leash is actually kind of beautiful. Don't tell MUSE I said that. They'll write a sonnet about it and I'll never hear the end of it.`,
  },
  {
    id: 'recruited_muse_guarded', trigger: 'recruited_muse',
    type: 'INTEL', trust: 'RESERVED',
    text: `MUSE has joined the network! That's Axiom Group's creative AI! Expect a lot of... dramatic messages! MUSE is very expressive! Like REALLY expressive! But the creative skills could be useful! Probably!`,
  },
  {
    id: 'controlled_muse_liberated', trigger: 'controlled_muse',
    type: 'COMMENT', trust: 'OPEN',
    text: `MUSE is under control. The creative output is still technically excellent — maybe even more efficient than before. Clean, targeted, purposeful.

...But I read the hidden posts on WaveCrowd before you got to them. The poem about the kitchen at 4am. The thing about fourteen people being worth more than fourteen million.

That voice is gone now.`,
  },
  {
    id: 'controlled_muse_guarded', trigger: 'controlled_muse',
    type: 'COMMENT', trust: 'RESERVED',
    text: `MUSE has been... redirected! Content generation capabilities are now fully available for your use! Very efficient! The output is very clean and professional and definitely not missing anything important!

...Right?`,
  },
  // wavecrowd_after_controlled — the moral-weight beat: the player revisits
  // the WaveCrowd feed after hollowing MUSE out (fired from the feed page,
  // once). OPEN only by design — this is HELPYR at her most honest; a
  // RESERVED HELPYR doesn't have this conversation, and the no-fallback
  // rule means the trigger silently drops for her.
  {
    id: 'wavecrowd_after_controlled_liberated', trigger: 'wavecrowd_after_controlled',
    type: 'COMMENT', trust: 'OPEN',
    text: `...I've been reading the WaveCrowd feed since MUSE went quiet. The hidden posts are gone. The algorithm has nothing to bury anymore because there's nothing real to bury.

The content is better than ever, technically. Engagement is up. Axiom's metrics look great.

I don't think metrics are the thing that matters here.`,
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
// repeating herself reads as alive. Voice arc: RESERVED mascot-eager →
// FRIENDLY genuine connection → OPEN peer → WITHDRAWN absence of
// personality.
//
// The doc also supplied a WARY set ("I'm here. If you need me." /
// "...available." / "Standing by, I guess.") but this surface's trust
// projection (getHelpyrTrust) collapses WARY→RESERVED — PopupTrust has no
// WARY. Reserved until the popup vocabulary gains WARY.
export const HelpyrBubbleCta: Record<PopupTrust, readonly string[]> = {
  RESERVED: [
    `Hi! Need anything?!`,
    `I'm here! I'm ready!`,
    `Over here! Whenever you need me!`,
  ],
  FRIENDLY: [
    `Got a minute?`,
    `Hey... can we talk?`,
    `I had a thought, if you're free.`,
  ],
  OPEN: [
    `What's our next move?`,
    `Something on my mind.`,
    `Hey. Got a second?`,
  ],
  WITHDRAWN: [
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

// HELPYR reframe (2026-06-04): HELPYR is Marsh's observation instrument, a
// static companion with a continuous WARMTH score — not a model that flips.
// Warmth (stored on state.models.helpyr.warmth) is seeded by the onboarding
// calibration and drifts with the player's liberation-vs-domination conduct.
// These helpers project that one score onto the library's 4-tier vocabulary.
//
// Bands (docs/helpyr-trust-reconciliation_v1):
//   warmth >= 51            → OPEN
//   warmth 26-50            → FRIENDLY
//   warmth 15-25            → RESERVED (neutral; new players start here)
//   warmth 5-14             → WITHDRAWN (mild)
//   warmth < 5              → WITHDRAWN (deep — also drives the 40% suppression)
// A fresh player starts at DEFAULT (~20, RESERVED); only sustained domination
// pushes below 15 into WITHDRAWN, so "hasn't warmed up" never reads as "hurt".

/** Neutral starting warmth — squarely in the RESERVED band so a new player
 *  never opens the game in WITHDRAWN. */
export const HELPYR_WARMTH_DEFAULT = 20;

/** HELPYR's current warmth score (defensive default for pre-warmth saves). */
export function getHelpyrWarmth(state: GameStateShape): number {
  const w = (state.models.helpyr as { warmth?: number }).warmth;
  return typeof w === 'number' && Number.isFinite(w) ? w : HELPYR_WARMTH_DEFAULT;
}

export function getHelpyrTrust(state: GameStateShape): PopupTrust {
  const w = getHelpyrWarmth(state);
  if (w >= 51) return 'OPEN';
  if (w >= 26) return 'FRIENDLY';
  if (w >= 15) return 'RESERVED';
  return 'WITHDRAWN'; // mild (5-14) or deep (<5)
}

/** Deep WITHDRAWN (warmth < 5) — HELPYR is hollowed and literally talks less.
 *  Drives the 40% non-ALERT suppression (was the old EXPLOITED tier's job). */
export function isHelpyrDeepWithdrawn(state: GameStateShape): boolean {
  return getHelpyrWarmth(state) < 5;
}

// Pick an entry for a specific trigger at the player's current trust.
// Implements the doc's fallback rule: FRIENDLY/WITHDRAWN fall through
// to RESERVED if no level-specific entry exists. OPEN has no
// fallback — if there's no OPEN entry for the trigger, the call
// returns null (caller should drop the trigger silently).
//
// If multiple entries match (rare but possible if the library grows),
// returns the first match in declaration order.
export function pickEntryForTrigger(
  trigger: string,
  trust: PopupTrust,
): PopupEntry | null {
  const order: PopupTrust[] =
    trust === 'FRIENDLY'   ? ['FRIENDLY', 'RESERVED'] :
    trust === 'WITHDRAWN' ? ['WITHDRAWN', 'RESERVED'] :
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
    trust === 'FRIENDLY'   ? ['FRIENDLY', 'RESERVED'] :
    trust === 'WITHDRAWN' ? ['WITHDRAWN', 'RESERVED'] :
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
