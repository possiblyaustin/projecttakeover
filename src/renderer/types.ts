// Shared type surface for the desktop shell.
// App-author types live here; per-module internals stay private.

export type AppContext = {
  winId: string;
  setTitle: (title: string) => void;
};

// WinParams stay loose: each app accepts a different shape of params
// (Scratchpad takes preview/text/title; WebDynamo takes url; Uplink
// takes contact). A discriminated union would be more invasive than
// it's worth at this stage.
export type WinParams = Record<string, any>;

export interface AppDef {
  id: string;
  name: string;
  glyphClass: string;
  defaultSize: { w: number; h: number };
  /** When false, the content area skips the inner sunken border. */
  contentBevel?: boolean;
  /** When true, the content area gets zero padding. */
  noContentPad?: boolean;
  render(container: HTMLElement, params: WinParams, ctx: AppContext): void;
}
