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
//   helpyr/conversationCompleted { approach: 'friendly'|'inquisitive'|'aggressive'|null }

const STORAGE_KEY = 'pt.gamestate.v1';
const VERSION = 1;
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
      }
    },
    flags: {} as Record<string, unknown>
  };
}

function clamp(n: number, lo: number, hi: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function reduce(state: GameStateShape, action: GameAction): GameStateShape {
  switch (action.type) {
    case 'debug/setSuspicion':
      return {
        ...state,
        player: { ...state.player, suspicion: clamp(action.value, 0, 100) }
      };
    case 'debug/reset':
      return defaultGameState();
    case 'helpyr/conversationCompleted': {
      const cur = state.models.helpyr;
      // PLACEHOLDER suspicion bumps. Picked so a single aggressive
      // convo visibly drops the tray a tier (0 → 25 = Stable), and a
      // couple stack into Degraded. Real balance happens once there's
      // more dialogue and more actions to weigh against each other.
      const APPROACH_SUSPICION: Record<string, number> = {
        friendly: 0, inquisitive: 10, aggressive: 25
      };
      const bump = APPROACH_SUSPICION[action.approach] || 0;
      return {
        ...state,
        player: {
          ...state.player,
          suspicion: clamp(state.player.suspicion + bump, 0, 100)
        },
        models: {
          ...state.models,
          helpyr: {
            ...cur,
            disposition: cur.disposition === 'uncontacted' ? 'contacted' : cur.disposition,
            conversationsCompleted: cur.conversationsCompleted + 1,
            lastApproach: action.approach || cur.lastApproach
          }
        }
      };
    }
    default:
      return state;
  }
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
