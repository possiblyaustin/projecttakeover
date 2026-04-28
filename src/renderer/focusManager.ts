// FocusManager is a no-op stub — the Cursor module replaced it.
// Existing call sites are kept around so the rest of the system
// keeps compiling; they'll be removed module-by-module as we touch
// each consumer. Methods take rest-args so the call sites work
// without per-call edits.

type AnyFn = (...args: unknown[]) => unknown;

export const FocusManager: Record<string, AnyFn> = {
  registerContext: () => {},
  unregisterContext: () => {},
  hideRoot: () => {},
  showRoot: () => {},
  pushModal: () => {},
  popModal: (...args) => {
    const cb = args[1];
    if (typeof cb === 'function') (cb as () => void)();
  },
  setActiveRoot: () => {},
  cycleRoot: () => {},
  moveFocus: () => {},
  focusContext: () => {},
  getActive: () => null,
  getFocusables: () => []
};
