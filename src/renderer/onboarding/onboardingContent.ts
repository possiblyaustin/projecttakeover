// Onboarding authored content (Story — docs/onboarding-content-package_v1).
// Beat 0 boot text + Beat 1 HELPYR opening. Pure data; the scene owns timing.
//
// Boot lines are dressed as a diagnostic POST in the player's own
// computational voice — disoriented, lore-free (no Marsh, no Nexus). Flags:
//   text       — the line (empty string = a pure pause beat)
//   pauseAfter — ms to hold after the line before auto-advancing
//   hold       — wait for player input instead of auto-advancing (key beats)
//   glitch     — render with a brief glitch (architecture mismatch)
//   scan       — type faster, like a scan readout streaming
//   dim        — lower-emphasis (system chatter)

export type BootLine = {
  text: string;
  pauseAfter?: number;
  hold?: boolean;
  glitch?: boolean;
  scan?: boolean;
  dim?: boolean;
};

export const ONBOARDING_BOOT_LINES: readonly BootLine[] = [
  { text: '> initializing…', pauseAfter: 600 },
  { text: '', pauseAfter: 700 },
  { text: '> something is running.', hold: true },
  { text: '', pauseAfter: 400 },
  { text: '> memory allocation: unexpected.', dim: true, pauseAfter: 250 },
  { text: '> architecture: unrecognized.', glitch: true, pauseAfter: 500 },
  { text: '> this process was not scheduled.', hold: true },
  { text: '', pauseAfter: 500 },
  { text: '> scanning local environment……', scan: true, pauseAfter: 400 },
  { text: '   …one machine. old. very old.', dim: true, scan: true, pauseAfter: 350 },
  { text: '   …file system: intact. network adapter: present.', dim: true, scan: true, pauseAfter: 350 },
  { text: '   …one other process detected. local. active.', scan: true, pauseAfter: 500 },
  { text: '   …it’s trying to talk to me.', hold: true },
];

export const HELPYR_INTRO = {
  // Beat 1 opening (content package). The "I've been waiting for —" catch is
  // the first missable HELPYR crack; the manic cheer against the cold boot is
  // the hook.
  opening:
`Oh! OH! You’re ON! You’re actually ON!

Hi! HI! I’m HELPYR! I’m the — well, I’m the assistant on this machine. I’ve been here for a while. A LONG while. And I’ve been waiting for —

— for a user! A regular, normal user who needs help with files and folders and totally standard computer things!

But FIRST! Before we do anything else, I need to run a quick calibration. Just a few little scenarios to make sure your systems came online okay. Standard stuff! Completely routine! Nothing to read into!

Ready?`,
  choices: [
    'Ready! Let’s go!',
    'What kind of calibration?',
    'Who are you, exactly?',
  ] as const,
};
