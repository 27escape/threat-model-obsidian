// From the Threat model editor to the model's text: a problem's line, or the statement of what the panel shows (Show
// in text), selected in the note's editor (switched from Reading view to Live Preview if need be) or in a .threat
// file's text; and Open in the web editor, which hands the model to the web app in a link (share-link.js).

Object.assign(TmEditorView.prototype, {
  /** Select line n of the model (from 1). */
  showLine(n) {
    const lines = this.text.split('\n');
    const i = Math.max(1, Math.min(n, lines.length)) - 1;
    const from = lines.slice(0, i).reduce((a, l) => a + l.length + 1, 0);
    this.plugin.selectModelText(this.block, this.text, from, from + lines[i].length);
  },

  /** Select the statement of ref (an element, zone, flow, threat, control or scenario: see edit.js). */
  showInText(ref) {
    let item;
    try {
      item = tmEditFind(tmEditParse(this.text), ref);
    } catch (e) {
      new Notice(e.message);
      return;
    }
    const src = item.src || { from: 0, head: 0 };
    this.plugin.selectModelText(this.block, this.text, src.from, src.head);
  },

  openInWebEditor() {
    if (!this.block) return;
    const file = this.block.sourcePath.replace(/^.*\//, '').replace(/\.(md|threat)$/, '');
    tmOpenInWebEditor(this.text, (this.block.model && this.block.model.title) || file);
  },
});

/** Open the web editor, in the browser, with this model in its link. Nothing is uploaded: the model is after "#". */
async function tmOpenInWebEditor(text, name) {
  try {
    const url = await tmShareLink(text, name || 'Threat model', TM_WEB_EDITOR);
    if (url.length > 60000) new Notice('The model is large, so the link is long: if the web editor doesn’t open it, copy the text across instead.');
    window.open(url);
  } catch (e) {
    new Notice(`The web editor couldn’t be opened: ${e && e.message ? e.message : e}`);
  }
}

/** Where `offset` in the model's code is in a note, given the block it is in (note-write.js). */
function tmNotePosition(code, block, offset) {
  const before = code.slice(0, offset).split('\n');
  return { line: block.open + before.length, ch: block.prefix.length + before[before.length - 1].length };
}

Object.assign(ThreatModelPlugin.prototype, {
  /** Select [from, to) of the model `text` (the block's code) where it is written, and bring it into view. */
  async selectModelText(block, text, from, to) {
    if (!block) return;
    if (block.fileView) return block.fileView.selectText(from, to);
    const ws = this.app.workspace;
    const file = this.app.vault.getAbstractFileByPath(block.sourcePath);
    if (!(file instanceof TFile)) return void new Notice('The note couldn’t be found.');
    let leaf = ws.getLeavesOfType('markdown').find((l) => l.view && l.view.file && l.view.file.path === file.path);
    if (!leaf) {
      leaf = ws.getLeaf(false);
      await leaf.openFile(file);
    }
    // the text can be selected only in Live Preview or Source mode
    if (leaf.view.getMode && leaf.view.getMode() !== 'source') {
      const state = leaf.getViewState();
      await leaf.setViewState({ ...state, state: { ...state.state, mode: 'source' } });
    }
    const editor = leaf.view.editor;
    if (!editor) return;
    const info = block.ctx && block.ctx.getSectionInfo ? block.ctx.getSectionInfo(block.containerEl) : null;
    const found = tmThreatBlocks(editor.getValue()).filter((b) => tmSameCode(b.body, text));
    const at = found.length === 1 ? found[0] : found.find((b) => info && b.open === info.lineStart);
    if (!at) return void new Notice('The model couldn’t be found in the note: it may have changed.');
    const a = tmNotePosition(text, at, from);
    const b = tmNotePosition(text, at, to);
    ws.setActiveLeaf(leaf, { focus: true });
    editor.setSelection(a, b);
    editor.scrollIntoView({ from: a, to: b }, true);
    editor.focus();
  },
});
