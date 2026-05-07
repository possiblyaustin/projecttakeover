// Shared type surface for the desktop shell.
// App-author types live here; per-module internals stay private.

export type AppContext = {
  winId: string;
  /** Update both the window's titlebar text AND the taskbar item's
   *  label. Apps should call this from inside render() if their
   *  display title is dynamic (e.g. Uplink: "HELPYR — Uplink"). */
  setTitle: (title: string) => void;
  /** Update the taskbar item's icon glyph. Defaults to the app's
   *  glyphClass at open time; apps with per-instance identity (e.g.
   *  Uplink, where the glyph reflects which contact is open) call
   *  this from render() to override. Pass any CSS class — typically
   *  one of the .icon-* or .avatar-* classes from main.css. */
  setGlyph: (glyphClass: string) => void;
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
