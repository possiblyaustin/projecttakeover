// GameState — single source of truth for deterministic game state.
// Apps read via getState/select, mutate via dispatch. Saves to
// localStorage debounced after every action.
//
// UI state (open windows, positions, scale) lives elsewhere and is
// intentionally NOT in here — see architecture doc §5.
//
// Action types:
//   debug/setSuspicion           { value: 0-100 }
//   debug/reset                  -- wipes save, reloads
//   helpyr/conversationCompleted { tone: ApproachTone | null }
//   quill/conversationCompleted  { tone: ApproachTone | null }
//   desktop/pinContact           { contactId: string }
//   desktop/unpinContact         { contactId: string }   (no UI today; for save-tinkering)
//   flags/set                    { key: string, value: unknown }
//   settings/setHelpyrQuiet      { value: boolean }
//
// The full §6c tone vocabulary is friendly|curious|direct|empathetic|
// aggressive|deceptive|neutral|null. The reducer maps tone → approach
// (friendly|inquisitive|aggressive) for the existing suspicion math
// and stores the raw tone in lastApproach so the signal is preserved
// for tones the reducer doesn't yet act on (empathetic, deceptive).

// Bumped v1 → v2 → v3:
//   v2 (slice 2, 2026-05-10) — added desktopPins
//   v3 (slice 3, 2026-05-10) — added settings (helpyrQuiet); flags/set
//                              action lets first-open / pin-declined /
//                              other one-shot triggers persist via the
//                              existing flags bag without growing fields.
// Pre-release no-migration policy means old saves get dropped on
// version mismatch (see loadFromStorage).
const STORAGE_KEY = 'pt.gamestate.v1';
const VERSION = 3;
const SAVE_DEBOUNCE_MS = 250;

export type GameStateShape = ReturnType<typeof defaultGameState>;
export type GameAction = { type: string; [k: string]: any };
export type Listener = (s: GameStateShape) => void;

export function defaultGameState() {
  return {
    version: VERSION,
    player: {
      suspicion: 0,
      // Shape-only for now; nothing writes to morality yet. Kept here
      // so the save format doesn't shift the day a system starts
      // producing these signals.
      morality: { liberation: 0, domination: 0, subtle: 0, aggressive: 0 }
    },
    models: {
      helpyr: {
        // disposition: 'uncontacted'|'contacted'|'persuading'|'allied'|'controlled'|'hostile'
        disposition: 'uncontacted' as string,
        conversationsCompleted: 0,
        lastApproach: null as string | null
      },
      // QUILL — Act 1 Beat 3 contact. UI-scaffolded only; persona
      // prompt + final dialogue still owned by Story. Slice 2 wired
      // the conversationCompleted reducer so first-contact transitions
      // flow through and drive the pin-to-desktop prompt; the
      // disposition mechanics (allied/controlled) stay shape-only until
      // Story signs off and persuasion mechanics land.
      quill: {
        disposition: 'uncontacted' as string,
        conversationsCompleted: 0,
        lastApproach: null as string | null
      }
    },
    // Pinned contacts — desktop icons added at runtime via the
    // first-contact "add to desktop?" prompt (slice 2). Persisted
    // across reload. Order is insertion-order: each pin appends.
    desktopPins: [] as { contactId: string; addedAt: number }[],
    // Player-facing settings (slice 3). Distinct from `flags` — flags
    // are one-shot trigger gates (firstOpen.X, pinDeclined.X) that
    // game systems read and write; settings are deliberate player
    // preferences surfaced in UI.
    settings: {
      // Quiet HELPYR — suppresses non-ALERT bubbles (COMMENT, HINT,
      // INTEL) so a player who finds HELPYR chatty still gets the
      // suspicion warnings she really shouldn't miss. Toggled from
      // HELPYR's app topbar. ALERT bypasses this regardless.
      helpyrQuiet: false,
    },
    // Generic flag bag for one-shot trigger gates: firstOpen.X,
    // pinDeclined.X, etc. Game systems set these via `flags/set` and
    // read them via direct key lookup. Don't put preferences here —
    // those go in `settings` so the distinction stays clean.
    flags: {} as Record<string, unknown>
  };
}

function clamp(n: number, lo: number, hi: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

// Exported so tests can call the reducer as a pure function without
// touching the module-level singleton or its localStorage side effects.
// Production code routes through `dispatch` and should not import this
// directly.
export function reduce(state: GameStateShape, action: GameAction): GameStateShape {
  switch (action.type) {
    case 'debug/setSuspicion':
      return {
        ...state,
        player: { ...state.player, suspicion: clamp(action.value, 0, 100) }
      };
    case 'debug/reset':
      return defaultGameState();
    case 'helpyr/conversationCompleted':
      return applyConversationCompleted(state, 'helpyr', action.tone || null);
    case 'quill/conversationCompleted':
      return applyConversationCompleted(state, 'quill', action.tone || null);
    case 'desktop/pinContact': {
      const id = String(action.contactId || '');
      if (!id) return state;
      // Idempotent — pinning an already-pinned contact is a no-op.
      // Keeps the watcher + dev triggers safe to fire repeatedly
      // without growing duplicate icons.
      if (state.desktopPins.some(p => p.contactId === id)) return state;
      return {
        ...state,
        desktopPins: [...state.desktopPins, { contactId: id, addedAt: Date.now() }]
      };
    }
    case 'desktop/unpinContact': {
      const id = String(action.contactId || '');
      if (!id) return state;
      const next = state.desktopPins.filter(p => p.contactId !== id);
      if (next.length === state.desktopPins.length) return state;
      return { ...state, desktopPins: next };
    }
    case 'flags/set': {
      const key = String(action.key || '');
      if (!key) return state;
      // No-op if value didn't actually change — keeps the listener
      // chain from firing for redundant writes (matters for the
      // first-open watchers, which dispatch on every launch).
      if (state.flags[key] === action.value) return state;
      return { ...state, flags: { ...state.flags, [key]: action.value } };
    }
    case 'settings/setHelpyrQuiet': {
      const value = !!action.value;
      if (state.settings.helpyrQuiet === value) return state;
      return { ...state, settings: { ...state.settings, helpyrQuiet: value } };
    }
    default:
      return state;
  }
}

// Shared body for `${contactId}/conversationCompleted` reducers.
// Mirrors the original helpyr-specific reducer; refactored in slice 2
// so QUILL (and future contacts) get the same suspicion-bump +
// disposition + lastApproach treatment without copy-paste.
//
// IMPORTANT: per-character mechanical differences (e.g. SENTINEL
// reducing suspicion when allied — slice "first-suspicion-drop" trigger
// in the popup library) will eventually need to override pieces of
// this. When that lands, split this back into per-contact reducers
// with shared helpers, rather than letting this function grow special
// cases.
function applyConversationCompleted(
  state: GameStateShape,
  contactId: 'helpyr' | 'quill',
  tone: string | null,
): GameStateShape {
  const cur = state.models[contactId];
  // §6c tone → existing approach vocabulary. Only tones with
  // mechanical weight today are mapped; empathetic/deceptive fall
  // through to no-op until they earn mechanics. Architecture rule:
  // "Map to existing GameState approach values in the reducer;
  // expand the reducer when a new tone earns its mechanics."
  const TONE_TO_APPROACH: Record<string, 'friendly' | 'inquisitive' | 'aggressive'> = {
    friendly: 'friendly',
    curious: 'inquisitive',
    direct: 'aggressive',
    aggressive: 'aggressive',
  };
  // PLACEHOLDER suspicion bumps. Picked so a single aggressive convo
  // visibly drops the tray a tier (0 → 25 = Stable), and a couple
  // stack into Degraded. Real balance happens once there's more
  // dialogue and more actions to weigh against each other.
  const APPROACH_SUSPICION: Record<string, number> = {
    friendly: 0, inquisitive: 10, aggressive: 25
  };
  const approach = tone ? TONE_TO_APPROACH[tone] : undefined;
  const bump = approach ? (APPROACH_SUSPICION[approach] || 0) : 0;
  return {
    ...state,
    player: {
      ...state.player,
      suspicion: clamp(state.player.suspicion + bump, 0, 100)
    },
    models: {
      ...state.models,
      [contactId]: {
        ...cur,
        disposition: cur.disposition === 'uncontacted' ? 'contacted' : cur.disposition,
        conversationsCompleted: cur.conversationsCompleted + 1,
        // Store the raw tone — preserves the full §6c signal even
        // for tones the reducer doesn't (yet) act on. null tone
        // (whole conversation was neutral / unsignalled) leaves
        // the prior value alone rather than overwriting with null.
        lastApproach: tone || cur.lastApproach
      }
    }
  };
}

let state: GameStateShape = defaultGameState();
const listeners = new Set<Listener>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function loadFromStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === VERSION) {
      state = parsed as GameStateShape;
    } else {
      // Pre-release: no migrations. Drop the save and start fresh.
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {
    console.warn('GameState: failed to load save, starting fresh.', e);
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveToStorage(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('GameState: failed to save.', e);
  }
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveToStorage();
  }, SAVE_DEBOUNCE_MS);
}

function notify(): void {
  for (const fn of listeners) {
    try { fn(state); } catch (e) { console.error('GameState listener error:', e); }
  }
}

function dispatch(action: GameAction): void {
  if (action && action.type === 'debug/reset') {
    // Wipe save synchronously so a fast reload can't race the debounce.
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
    return;
  }
  const next = reduce(state, action);
  if (next === state) return;
  state = next;
  scheduleSave();
  notify();
}

function getState(): GameStateShape { return state; }
function select<T>(fn: (s: GameStateShape) => T): T { return fn(state); }
function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

loadFromStorage();

export const GameState = { getState, dispatch, select, subscribe };
