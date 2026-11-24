// Undo and Redo in the Threat model editor (its bar, or Ctrl+Z and Ctrl+Shift+Z while it is the active pane). They take
// back the editor's own changes, each by writing the model as it was before (writeModel: through the note's editor
// when it is open, otherwise into the file), so they work in Reading view too. A change made in the text since
// (typing in the note) ends them, as undoing past it would lose it: Ctrl+Z in the note itself takes that back.

const TM_UNDO_MAX = 100;

Object.assign(TmEditorView.prototype, {
  /** Write text in place of the model; how: 'change' (from the panel: can be undone), 'undo' or 'redo'. */
  write(text, how) {
    const block = this.block;
    if (!block) return;
    const was = this.text;
    this.pending = text;
    this.plugin.writeModel(block, was, text).then(
      (problem) => {
        if (problem) {
          if (how !== 'change') this.forget();
          return this.writeFailed(problem);
        }
        if (how === 'change') {
          this.done.push({ before: was, after: text });
          if (this.done.length > TM_UNDO_MAX) this.done.shift();
          this.undone = [];
        }
        this.drawUndo();
      },
      (e) => {
        if (how !== 'change') this.forget();
        this.writeFailed(`The change couldn’t be written: ${e && e.message ? e.message : e}`);
      }
    );
  },

  undoChange() {
    const last = this.done[this.done.length - 1];
    if (!last) return;
    if (!tmSameCode(this.text, last.after)) return this.forget('The model has been changed in its text since: undo that in the note (Ctrl+Z there).');
    this.done.pop();
    this.undone.push(last);
    this.write(last.before, 'undo');
    this.drawUndo();
  },

  redoChange() {
    const next = this.undone[this.undone.length - 1];
    if (!next) return;
    if (!tmSameCode(this.text, next.before)) return this.forget('The model has been changed in its text since, so there is nothing to redo.');
    this.undone.pop();
    this.done.push(next);
    this.write(next.after, 'redo');
    this.drawUndo();
  },

  /** Nothing to undo or redo any more (another model, or the text changed); message: why, to show. */
  forget(message) {
    this.done = [];
    this.undone = [];
    this.drawUndo();
    if (message) new Notice(message);
  },

  drawUndo() {
    if (this.undoBtn) this.undoBtn.disabled = !this.done.length;
    if (this.redoBtn) this.redoBtn.disabled = !this.undone.length;
  },

  /**
   * Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y (⌘ on a Mac) while the editor is the active pane, but not while typing in one of
   * its fields. Obsidian's own keys: a scope of the view's, as a keydown listener misses the keys once a redrawn panel
   * has taken the focus with it.
   */
  undoKeys() {
    const typing = () => {
      const a = typeof document === 'undefined' ? null : document.activeElement;
      return !!(a && a.matches && a.matches('input, textarea, select, [contenteditable]'));
    };
    const key = (mods, k, run) =>
      this.scope.register(mods, k, () => {
        if (typing()) return true; // the field's own undo
        run();
        return false;
      });
    // both cases: with Shift (or Caps Lock) the key comes as "Z"
    for (const k of ['z', 'Z']) {
      key(['Mod'], k, () => this.undoChange());
      key(['Mod', 'Shift'], k, () => this.redoChange());
    }
    key(['Mod'], 'y', () => this.redoChange());
  },
});
