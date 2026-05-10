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
//
// The full §6c tone vocabulary is friendly|curious|direct|empathetic|
// aggressive|deceptive|neutral|null. The reducer maps tone → approach
// (friendly|inquisitive|aggressive) for the existing suspicion math
// and stores the raw tone in lastApproach so the signal is preserved
// for tones the reducer doesn't yet act on (empathetic, deceptive).

// Bumped v1 → v2 in slice 2 (2026-05-10) — added desktopPins; pre-
// release no-migration policy means old saves get dropped (see
// loadFromStorage).
const STORAGE_KEY = 'pt.gamestate.v1';
const VERSION = 2;
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
