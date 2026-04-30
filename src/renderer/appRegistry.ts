// App registry — every app the system knows about, looked up by id.
// WindowManager.open consults this to find the AppDef for a given
// appId. main.ts populates the registry at boot via registerApp().

import type { AppDef } from './types';

const _registry: Record<string, AppDef> = {};

export function registerApp(app: AppDef): void {
  _registry[app.id] = app;
}

export function getApp(id: string): AppDef | undefined {
  return _registry[id];
}

/**
 * Returns the underlying registry by reference. Used for the PT.*
 * devtools surface; not for general app lookup (use getApp()).
 */
export function allApps(): Record<string, AppDef> {
  return _registry;
}
