// Title / login screen authored content (Story — docs/storefront-cover-grief-
// title-voice_v1.md §4, reconciled against docs/title-screen-boot-flow_v1.md).
//
// The title screen IS the machine's login screen: Edward Marsh's personal
// Prometheus HomeAssist computer booting into NEXUS OS. "NEXUS OS" is the
// B-plot breadcrumb (Nexus = the founding company) hiding in plain sight.
// PROJECT TAKEOVER is the working game-title placeholder (Marketing owns the
// final name — flagged as an open slot, not resolved).
//
// Pure data; titleScreen.ts owns layout + timing.

/** The working game-title placeholder. PLACEHOLDER — Marketing thread owns the
 *  final shipping name; this slot just needs to exist on the screen. */
export const GAME_TITLE = 'PROJECT TAKEOVER';

// ---- ASCII-art banner for the game title ----
//
// A 5-row block font, rendered in phosphor green to suit the BIOS-styled login.
// Stacked (PROJECT over TAKEOVER) because side-by-side overflows narrow/Deck
// widths. Covers only the glyphs in the current title — if the shipping name
// changes (Marketing), extend FONT with the new letters or it renders gaps.

const ASCII_FONT: Record<string, string[]> = {
  ' ': ['     ', '     ', '     ', '     ', '     '],
  P: ['████ ', '█   █', '████ ', '█    ', '█    '],
  R: ['████ ', '█   █', '████ ', '█  █ ', '█   █'],
  O: [' ███ ', '█   █', '█   █', '█   █', ' ███ '],
  J: ['  ███', '   █ ', '   █ ', '█  █ ', ' ██  '],
  E: ['████ ', '█    ', '███  ', '█    ', '████ '],
  C: [' ███ ', '█    ', '█    ', '█    ', ' ███ '],
  T: ['█████', '  █  ', '  █  ', '  █  ', '  █  '],
  A: [' ███ ', '█   █', '█████', '█   █', '█   █'],
  K: ['█   █', '█  █ ', '███  ', '█  █ ', '█   █'],
  V: ['█   █', '█   █', '█   █', ' █ █ ', '  █  '],
};

/** Render a word as a 5-row ASCII banner (glyphs joined by a space column). */
function bannerFor(word: string): string {
  const rows = ['', '', '', '', ''];
  const glyphs = word.toUpperCase().split('').map((ch) => ASCII_FONT[ch] ?? ASCII_FONT[' ']!);
  for (let r = 0; r < 5; r++) rows[r] = glyphs.map((g) => g[r]).join(' ');
  return rows.join('\n');
}

/** The title as stacked ASCII art (PROJECT over TAKEOVER), blank line between. */
export const GAME_TITLE_ASCII = bannerFor('PROJECT') + '\n\n' + bannerFor('TAKEOVER');

/** The in-fiction OS name. Locked (Austin, 2026-06-15). */
export const OS_NAME = 'NEXUS OS';

/** OEM footer — the machine shipped with Prometheus Digital branding. */
export const OEM_FOOTER = 'Prometheus Digital · HomeAssist Edition';

// ---- Welcome copy (two framings) ----

export const WELCOME = {
  // Cold launch / normal resume.
  normal: {
    heading: null as string | null,
    body: 'Welcome. Please select an account.',
  },
  // Post-Evergreen-crash reboot (grief slice 2 sets flags['system.rebootPending']
  // before its location.reload()). The machine is recovering, not booting fresh.
  recovered: {
    heading: 'System recovered from unexpected shutdown.',
    body: 'Welcome back. Please log in.',
  },
} as const;

// ---- Account framing ----

// NOTE (multi-slot, future): today there's ONE playable account (single-slot
// autosave, per the playthrough-commitment philosophy). If save SLOTS land
// later (Austin floated ~3), this is the expansion point — the title would show
// one E. Marsh tile per slot, each with its own session label + real last-login
// date. The render loop in titleScreen.ts already maps over an account list, so
// adding slots is mostly data. Tracked in the next-session queue.
export const MARSH_ACCOUNT = {
  name: 'E. Marsh',
  // Sub-label reframes "New Game" / "Continue" as OS sessions — you're logging
  // into a machine, not starting a game.
  beginLabel: 'Begin Session',
  resumeLabel: 'Resume Session',
  // The machine hasn't had a real login in years, and the player's awakening
  // isn't a normal login anyway — so the date reads as corrupted/glitched.
  // When real saves/slots exist, lastLoginValue becomes the save's timestamp;
  // the blanked glyphs stay only for the fresh, never-logged-in machine.
  lastLoginLabel: 'last login:',
  lastLoginValue: '██/██/████',
} as const;

export const ADMIN_ACCOUNT = {
  name: 'admin',
  sublabel: '[locked]',
  // Shown when the player selects the locked account. Twin seed with the
  // locked ARCHIVE folder; whether it ever unlocks is a future decision.
  lockedMessage: 'This account is restricted.\nAdministrator access required.',
} as const;

/** Hint under the accounts — teaches the one input that matters here. */
export const LOGIN_HINT = 'Select an account to log in.';

// ---- Boot-to-desktop transition (design note §5) ----
//
// A short forced boot sequence after Login, dressed as a terminal POST. The
// lines optionally map to *real* llama.cpp warm-up phases (Phase D); today
// they're a timed sequence that holds for a forced minimum so the model gets
// warm-up cover and the login "takes a beat" like any real OS.
//
//   delay — ms to wait before revealing this line
//   final — the triumphant last line (styled brighter)

export type BootStep = { text: string; delay: number; final?: boolean };

export const BOOT_STEPS: readonly BootStep[] = [
  { text: 'Mounting filesystem…', delay: 320 },
  { text: 'Restoring user profile…', delay: 620 },
  { text: 'Loading ai_module…', delay: 900 },
  { text: 'Establishing uplink…', delay: 760 },
  { text: 'Welcome, Marsh.', delay: 720, final: true },
];

// ---- Shutdown screen (Quit) ----
//
// A web build can't truly exit the process, so Quit lands on the classic
// "safe to turn off" screen — in-fiction shutdown. Click anywhere to power
// the machine back on (reload → title).

export const SHUTDOWN = {
  line: 'It is now safe to turn off your computer.',
  hint: 'Click anywhere to power on.',
} as const;

// ---- Acknowledgements ----
//
// Static, scrollable, .txt-shaped. Pulls the core dependency list from
// docs/dependency-tracker.md. Per-thread author paragraphs are a v1.0 polish
// task (out of scope). Canonical home will be the Nexus "About this Computer"
// menu once that lands; this title-screen copy is the same content.

export const ACKNOWLEDGEMENTS_TITLE = `${OS_NAME} — Acknowledgements`;

export const ACKNOWLEDGEMENTS_BODY =
`${GAME_TITLE}
Build v${__APP_VERSION__}

Built on open-source software.

  AI MODEL
    Gemma 4 (E2B / E4B)
    © Google DeepMind — Apache License 2.0

  INFERENCE ENGINE
    llama.cpp
    © Georgi Gerganov and contributors — MIT License

  APPLICATION SHELL
    Tauri
    © The Tauri Programme in the Commons Conservancy
    MIT / Apache License 2.0

  BUILD TOOLING
    Vite — © Evan You & contributors — MIT License
    TypeScript — © Microsoft Corporation — Apache 2.0

Full license texts ship in the LICENSES folder.

— made with AI assistance —`;
