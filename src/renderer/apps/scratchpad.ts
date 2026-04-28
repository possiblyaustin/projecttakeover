// Scratchpad — editable text document. Used for README + freeform
// notes. Tracks a dirty flag so the title gets a "*" prefix on edit.

import type { AppDef, AppContext, WinParams } from '../types';

export const ScratchpadApp: AppDef = {
  id: 'scratchpad',
  name: 'Scratchpad',
  glyphClass: 'icon-textfile',
  defaultSize: { w: 400, h: 260 },
  contentBevel: false,
  noContentPad: true,
  render(container: HTMLElement, params: WinParams, ctx: AppContext) {
    container.innerHTML = `
      <div class="scratchpad-root">
        <div class="scratchpad-preview"></div>
        <textarea class="scratchpad-textarea"
                  spellcheck="false"
                  data-focusable="true"
                  aria-label="Scratchpad editor"></textarea>
      </div>
    `;
    const preview = container.querySelector('.scratchpad-preview') as HTMLElement;
    const textarea = container.querySelector('.scratchpad-textarea') as HTMLTextAreaElement;

    if (params.preview) preview.innerHTML = params.preview;
    textarea.value = params.text || '';

    // Light dirty-flag — marks title with *
    const baseTitle = params.title || 'Untitled - Scratchpad';
    ctx.setTitle(baseTitle);
    let dirty = false;
    textarea.addEventListener('input', () => {
      if (!dirty) {
        dirty = true;
        ctx.setTitle('* ' + baseTitle);
      }
    });

    // Note: we do NOT auto-focus the textarea — the cursor model
    // expects the user to click (A button) on the editor to focus
    // it, which triggers the Steam Deck OSK naturally.
  }
};
