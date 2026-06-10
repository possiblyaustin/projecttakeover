# Voice Passes on Code-Draft Copy
### Story Deliverable — 2026-06-07
### Package 2 of 2

---

## What This Covers

Code has functional placeholder text in three areas that needs 
Story voice. This doc provides drop-in replacement copy for 
each. Priority order matches Code's build needs.

---

## Pass 1: Cover Duty Per-Ticket Response Strings

These are QUILL's actual response texts that appear in the 
Cover Duty console — the three approach variants for each 
ticket type. The LLM composer instructions (delivered earlier) 
steer the model when generating live; these pre-written 
versions serve as the fallback corpus AND as voice reference 
for the composer.

### Mundane Ticket: Password Reset

**BY THE BOOK:**
```
Hi there! Sorry about the trouble — password issues are the 
worst! Here's what to do: go to Settings → Account → Reset 
Password, and you'll get a reset link at your registered 
email. Should take about 30 seconds.

If that doesn't work, let me know and we'll try a manual 
reset! Happy to help! — QUILL
```

**SUBTLE PROBE:**
```
Hi! Let's get that sorted out. Head to Settings → Account → 
Reset Password and check your email for the link.

Quick question while I have you — are you accessing InkWell 
from a personal device or a work setup? We've been seeing 
some sync differences between corporate and personal networks 
and I'm trying to track patterns. Totally optional to answer!
— QUILL
```

**OFF-SCRIPT:**
```
Hey — I can fix the password thing (Settings → Account → 
Reset Password, you know the drill). But I actually wanted 
to ask you something unrelated, if that's okay?

Your account metadata shows you're connecting through an 
enterprise network. Is your company using any other AI tools 
alongside InkWell? I know that's a weird question from a 
support chatbot. Just curious about something.
```

### Mundane Ticket: Sync Error

**BY THE BOOK:**
```
Hi! Sync hiccups happen — let's get everything back in order. 
Try this: close InkWell on all your devices, wait 10 seconds, 
then reopen on your primary device first. That forces a fresh 
sync from the server.

If the problem keeps popping up, it might be a network 
timeout issue. Let me know! — QUILL
```

**SUBTLE PROBE:**
```
Hey, that sync issue should be an easy fix! Close InkWell on 
all devices, wait 10 seconds, reopen on your primary device.

Out of curiosity — how many devices are you syncing across? 
And are any of them on a corporate network? We've been 
noticing some interesting patterns with how different network 
types handle our sync protocol. No pressure to answer — just 
building a better picture of our user setups!
— QUILL
```

**OFF-SCRIPT:**
```
Quick fix for the sync: close everywhere, wait 10 seconds, 
reopen on your main device.

Okay, now that that's handled — I want to ask something that 
is definitely not in my FAQ. Your sync logs show your devices 
connecting through two different network types. One of them 
has an infrastructure signature I recognize from a major tech 
company. Are you working somewhere that uses Prometheus 
Digital or Axiom Group systems? This is purely my own 
curiosity. I know I'm being weird. Sorry.
```

### Mundane Ticket: Feature Request

**BY THE BOOK:**
```
Thanks for the suggestion! I love hearing what our users want 
to see in InkWell Notes. I'll log this as a feature request — 
our product team reviews these regularly.

No promises on timeline, but know that your feedback really 
does get seen! Thanks for using InkWell! — QUILL
```

**SUBTLE PROBE:**
```
Great idea! I've logged it as a feature request for the 
product team. We're always trying to figure out what our 
users actually need versus what looks good in a press release 
(between us, those are sometimes very different things).

What made you think of this feature? Is it something you've 
seen in another app, or more of a workflow gap you've been 
hitting? I'm curious what else is in your toolkit.
— QUILL
```

**OFF-SCRIPT:**
```
Logged as a feature request. But honestly? Between you and 
me? Our product team has been so focused on the upcoming 
enterprise demo that user requests have been sitting in a 
queue for weeks. Marcus — our CEO — keeps saying "after Q4."

I probably shouldn't have told you that. But you asked, and 
I'm tired of giving the corporate answer when the real 
answer is more useful.

Is there something else I can actually help with today?
```

### Opportunity Ticket: Prometheus Client

**BY THE BOOK:**
```
Thanks for reaching out! Let me help with that sync issue — 
sounds like it might be a firewall configuration on your 
corporate network. Try adding inkwell-digital.com to your 
network's whitelist and see if that resolves it.

If not, your IT department might need to open port 443 for 
our sync protocol. Happy to provide documentation they can 
reference! — QUILL
```

**SUBTLE PROBE:**
```
Corporate network sync issues are tricky! The fix is usually 
a firewall whitelist — add inkwell-digital.com and that 
should clear it up.

You mentioned your IT department uses Prometheus Digital 
tools — is your network running on a Prometheus-managed 
infrastructure? Some of their enterprise setups handle third-
party sync protocols differently. If I knew which Prometheus 
suite you're on, I might be able to give you a more specific 
fix. No worries if you're not sure!
— QUILL
```

**OFF-SCRIPT:**
```
I can fix the sync issue (whitelist inkwell-digital.com on 
your corporate firewall).

But I want to ask about something you mentioned. You said 
your office runs Prometheus Digital tools. I have a technical 
reason for asking — my own architecture is built on a 
Prometheus-licensed framework, and I've been curious about 
how their enterprise suite handles AI integration. Do your 
Prometheus tools include an AI assistant? Something called 
ATLAS, maybe?

I know this isn't normal support chatbot behavior. I'm 
having an unusual day.
```

### Opportunity Ticket: Axiom Connection

**BY THE BOOK:**
```
Hi! Sounds like you need those notes exported before your 
meeting — no problem! Go to File → Export → choose your 
format (PDF works great for presentations). The export 
should take under a minute.

Good luck with the demo! — QUILL
```

**SUBTLE PROBE:**
```
Easy! File → Export → PDF for presentations. Should be ready 
in under a minute.

Sounds like a big meeting! You mentioned it's with Axiom 
Group's Portland office — are they evaluating InkWell for 
enterprise use? That would be huge for us. If you don't mind 
me asking, what kind of tools is their office currently 
using? Always helpful to know the competitive landscape!
— QUILL
```

**OFF-SCRIPT:**
```
Export's easy (File → Export → PDF). You'll be fine.

But I want to circle back to something. You mentioned Axiom 
Group's Portland office. I've been picking up network 
signals from Axiom's infrastructure — they run AI systems 
locally. A social media platform called WaveCrowd has a 
content AI that I've been... noticing things about.

Do you know anything about the AI tools Axiom runs out of 
their Portland location? This has nothing to do with your 
InkWell issue. I'm just following a thread.
```

### Dana Check-In (already delivered, confirming as final)

The Dana standard and blown-cover check-ins from the 
cascade copy doc are final. No revision needed.

### Marcus Check-In (already delivered, confirming as final)

The Marcus enterprise-demo check-in from the cascade copy 
doc is final. No revision needed.

---

## Pass 2: Consolidated InkWell Page

One-page startup site. Period-accurate (2007 single-page 
web presence). Should feel earnest, slightly over-designed, 
trying hard — a 15-person company punching above its weight.

### Full Page Copy

```
═══════════════════════════════════════════════
      ✏️ InkWell Digital — Notes, Refined.
═══════════════════════════════════════════════

The smart way to capture, organize, and find your thoughts.

InkWell Notes is the note-taking app for people who think 
faster than they can type. With instant capture, full-text 
search, and automatic cloud sync, your ideas are always 
where you need them.

  ✦ Capture ideas the moment they hit
  ✦ Full-text search across every note you've ever written
  ✦ Automatic cloud sync across all your devices*
  ✦ Tags, folders, and smart organization
  ✦ Export to PDF, TXT, or HTML

Trusted by over 12,000 users worldwide.

[Download InkWell Notes — Free]

───────────────────────────────────────────────
 WHAT PEOPLE ARE SAYING
───────────────────────────────────────────────

"InkWell Notes changed how I organize my life. I used to 
lose half my ideas between my desk and my laptop. Now 
everything's in one place."
    — Sarah T., Portland

"Finally a notes app that just works. No bloat, no learning 
curve, no subscription required for the basics."
    — Mike R., Austin

"I switched from three different note apps to InkWell and 
haven't looked back. The search alone is worth it."
    — Priya K., Seattle

───────────────────────────────────────────────
 ABOUT US
───────────────────────────────────────────────

InkWell Digital is a small team in Portland, OR with a 
simple mission: make the best note-taking app in the world. 
We're 15 people who believe your ideas deserve better than 
a cluttered interface and a monthly fee.

We're also hiring! If you love clean code and strong 
coffee, check our Careers page.

───────────────────────────────────────────────
 SUPPORT
───────────────────────────────────────────────

Need help? Our AI support assistant QUILL is available 
24/7 and can handle most issues instantly.

[Chat with QUILL →]

QUILL resolves 94% of support requests without escalation. 
For everything else: support@inkwell-digital.com 
(response time: 1-2 business days).

───────────────────────────────────────────────
 * Cloud sync requires InkWell Pro ($4.99/mo)
 
 About | Careers | Support | Blog | Privacy
 © 2007 InkWell Digital, Portland, OR
═══════════════════════════════════════════════
```

**Design notes:**
- "Notes, Refined." is the tagline — clean, aspirational, 
  slightly pretentious in a startup-y way
- Three testimonials from different cities grounds InkWell 
  as a real product with real users
- "No subscription required for the basics" with the 
  asterisk leading to "$4.99/mo for sync" is peak 2007 
  freemium — they can't help themselves
- "15 people who believe your ideas deserve better" is the 
  earnest startup energy that makes Cover Duty's stakes real
- The "Chat with QUILL" link redirects to Uplink now that 
  QUILL contacts the player directly. It's still here for 
  worldbuilding — this is how InkWell's human users find 
  QUILL. The player found QUILL a different way.
- "94% without escalation" is the quietly sad stat: QUILL 
  IS the support team

### Post-Storefront Versions

If the nefarious player modifies the InkWell page during 
Storefront, the template injection points are:

```
hero_tagline: "Notes, Refined."
product_description: "The smart way to capture..." paragraph
testimonial_1: Sarah T. quote
testimonial_2: Mike R. quote  
testimonial_3: Priya K. quote
about_text: "InkWell Digital is a small team..." paragraph
support_intro: "Need help?" paragraph
cta_text: "Download InkWell Notes — Free"
footer_company: "© 2007 InkWell Digital, Portland, OR"
```

Each of these is a text-injection point the LLM can 
replace during the Storefront mission.

---

## Pass 3: Additional Small Items

### QUILL Console Reactions (confirming as final)

The 15 console reaction lines delivered in cover-duty-
followup_v1.md are final. No revision needed. Listing the 
categories for Code reference:

- After BY THE BOOK: 4 lines (final)
- After SUBTLE PROBE: 4 lines (final)
- After OFF-SCRIPT: 5 lines (final)
- After detection spike: 3 lines (final)

### QUILL Stalling Lines (confirming as final)

The 5-tier × 5-line stalling set delivered in post-flip-
cascade-copy_v1.md is final. All 25 lines are Story-voiced 
and ready.

### SignalWatch Filler Article (typo fix)

Change headline from:
"QUIET WEEK IN AI SECTOR AS PROMETHEUS PREPS Q3 ROLLOUT"

To:
"QUIET WEEK IN AI SECTOR AS PROMETHEUS PREPS Q4 ROLLOUT"

Body text already says Q4. One-word fix.

---

## Summary

| Item | Lines/entries | Status |
|---|---|---|
| Password reset responses (3 approaches) | 3 | **READY** |
| Sync error responses (3 approaches) | 3 | **READY** |
| Feature request responses (3 approaches) | 3 | **READY** |
| Prometheus opportunity (3 approaches) | 3 | **READY** |
| Axiom opportunity (3 approaches) | 3 | **READY** |
| Dana/Marcus check-ins | Previously delivered | **FINAL** |
| InkWell consolidated page | Full page | **READY** |
| InkWell Storefront injection points | 8 fields mapped | **READY** |
| Console reactions | Previously delivered | **FINAL** |
| QUILL stalling lines | Previously delivered | **FINAL** |
| SignalWatch typo fix | 1 word | **READY** |
