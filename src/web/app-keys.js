// Keyboard shortcuts, and the links between the diagrams and the text: a click on a box, zone, arrow or threat opens
// it in the panel; a click on an error or warning ("Line 12: …") goes to that line; "Show in text" selects a thing's
// statement in the editor.

const TW_SHORTCUTS = [
  ['Ctrl+Z', 'Undo (⌘Z on a Mac)'],
  ['Ctrl+Shift+Z or Ctrl+Y', 'Redo'],
  ['Ctrl+S', 'Save now; for an example, save a copy'],
  ['Ctrl+Shift+E', 'Show or hide the model’s text'],
  ['?', 'Help (when not typing)'],
  ['Esc', 'Close a menu, a dialog or the panel'],
  ['Tab', 'In the text: indent by two spaces (Esc, then Tab, to leave it)'],
];

Object.assign(TwApp.prototype, {
  links() {
    this.view.addEventListener('click', (e) => {
      if (!(e.target instanceof Element)) return;
      const problem = e.target.closest('.tm-errors li, .tm-warnings li');
      if (problem) {
        const m = /^Line (\d+)/.exec(problem.textContent);
        if (m) this.showLine(Number(m[1]));
        return;
      }
      if (!this.block || !this.block.model || e.target.closest('a, button, select, summary')) return;
      const row = e.target.closest('tr[data-tm-threat]');
      if (row) return this.panel.showThreat({ id: row.getAttribute('data-tm-threat') });
      if (!e.target.closest('.mermaid svg')) return;
      const item = twClickedItem(this.block.model, e.target);
      if (item) this.panel.showItem(item);
    });
    document.addEventListener('fullscreenchange', () => this.draw());
  },

  /** Show the text with line n selected. */
  showLine(n) {
    this.panel.close();
    if (!this.codeShown) this.showCode(true);
    this.editor.goToLine(n);
  },

  /** Show the text with the statement a ref names selected (its header: the line that names it). */
  showInText(ref) {
    try {
      const item = tmEditFind(tmEditParse(this.text), ref);
      const src = item.src || { from: 0, head: 0 };
      this.panel.close();
      if (!this.codeShown) this.showCode(true);
      this.editor.select(src.from, src.head);
    } catch (e) {
      this.say(e.message, true);
    }
  },

  keys() {
    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const t = e.target;
      const inModel = t === this.editor.ta;
      const typing = t instanceof Element && t.matches('input, textarea, select, [contenteditable]') && !inModel;
      if (document.querySelector('dialog[open]')) return; // a dialog has the keys
      if (e.key === 'Escape' && this.panel.isOpen() && !this.menu.isOpen()) return this.panel.close(); // the menus close themselves first
      const k = e.key.toLowerCase();
      if (mod && !e.altKey && k === 'z' && !typing) {
        e.preventDefault();
        return e.shiftKey ? this.redo() : this.undo();
      }
      if (mod && !e.altKey && k === 'y' && !typing) {
        e.preventDefault();
        return this.redo();
      }
      if (mod && !e.altKey && !e.shiftKey && k === 's') {
        e.preventDefault();
        if (this.cur.kind === 'mine') {
          this.flush();
          this.save();
        } else this.saveCopy();
        return;
      }
      if (mod && e.shiftKey && k === 'e') {
        e.preventDefault();
        return this.showCode(!this.codeShown);
      }
      if (e.key === '?' && !mod && !inModel && !typing) {
        e.preventDefault();
        twHelp();
      }
    });
  },
});
