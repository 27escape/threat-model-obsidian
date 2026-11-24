// .threat files: opened in their own view, showing the model (as a threat block would) or its source to edit.
// Edits are saved by Obsidian's TextFileView, as for any file you type in. Changes from the Threat model editor come
// in through setModelText; Undo and Redo, in the view's bar while there are any, take them back. The editor is a plain textarea with
// the highlighted text drawn underneath it (the textarea's own text is transparent), kept in step as you type and scroll.

class TmFileView extends TextFileView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.editing = false;
    this.block = null;
    this.history = new TwHistory(); // changes made from the Threat model editor
  }

  getViewType() {
    return TM_FILE_VIEW;
  }

  getDisplayText() {
    return this.file ? this.file.basename : 'Threat model';
  }

  getIcon() {
    return 'shield-half'; // the plugin's own icon; shield-alert means an untrusted zone (icons.js)
  }

  onOpen() {
    this.undoBtn = this.addAction('undo-2', 'Undo the last change made in the Threat model editor', () => this.undoRedo('undo'));
    this.redoBtn = this.addAction('redo-2', 'Redo', () => this.undoRedo('redo'));
    this.showUndo();
    this.toggle = this.addAction('pencil', 'Edit the threat model', () => {
      this.editing = !this.editing;
      this.refresh();
    });
  }

  setViewData(data, clear) {
    this.data = data;
    if (clear) {
      this.editing = false;
      this.history.clear();
      this.showUndo();
    }
    this.refresh();
  }

  getViewData() {
    return this.data;
  }

  clear() {
    this.data = '';
  }

  refresh() {
    const el = this.contentEl;
    if (this.block) {
      this.removeChild(this.block);
      this.block = null;
    }
    el.empty();
    el.addClass('tm-file');
    if (this.toggle) {
      this.toggle.setAttr('aria-label', this.editing ? 'Show the threat model' : 'Edit the threat model');
      this.toggle.toggleClass('is-active', this.editing);
    }
    if (this.editing) {
      const wrap = el.createDiv({ cls: 'tm-source-wrap' });
      const under = wrap.createEl('pre', { cls: 'tm-source tm-source-under tm-hl' });
      under.setAttr('aria-hidden', 'true');
      const ta = wrap.createEl('textarea', { cls: 'tm-source tm-source-over' });
      this.ta = ta;
      ta.value = this.data || '';
      ta.spellcheck = false;
      // a final newline keeps the last line's height when the text ends with one
      const paint = () => tmHighlightInto(under, ta.value + '\n');
      paint();
      this.registerDomEvent(ta, 'input', () => {
        this.data = ta.value;
        if (this.history.canUndo() || this.history.canRedo()) {
          this.history.clear(); // typing has its own undo; the editor's changes before it can't be taken back now
          this.showUndo();
        }
        this.requestSave();
        paint();
      });
      this.registerDomEvent(ta, 'scroll', () => {
        under.scrollTop = ta.scrollTop;
        under.scrollLeft = ta.scrollLeft;
      });
      ta.focus();
      return;
    }
    const host = el.createDiv();
    this.block = this.addChild(new TmBlock(this.plugin, host, this.data || '', this.file ? this.file.path : ''));
    this.block.fileView = this; // the Threat model editor writes through setModelText
  }

  /** A change from the Threat model editor: `now` in place of `was`, if the file still says `was`. '' or a problem. */
  setModelText(was, now) {
    if (!tmSameCode(this.data || '', was)) return 'The file has changed since the editor read it: nothing was written. Try again.';
    this.history.record(this.data || '');
    this.data = now;
    this.requestSave();
    this.refresh();
    this.showUndo();
    return '';
  }

  /** Show the text, with [from, to) selected and in view (from the Threat model editor). */
  selectText(from, to) {
    if (!this.editing) {
      this.editing = true;
      this.refresh();
    }
    const ta = this.ta;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(from, to);
    const line = ta.value.slice(0, from).split('\n').length - 1;
    const height = parseFloat(window.getComputedStyle(ta).lineHeight) || 20;
    ta.scrollTop = Math.max(0, line * height - ta.clientHeight / 3);
  }

  undoRedo(which) {
    const text = which === 'undo' ? this.history.undo(this.data || '') : this.history.redo(this.data || '');
    if (text === null) return;
    this.data = text;
    this.requestSave();
    this.refresh();
    this.showUndo();
  }

  /** Undo and Redo in the view's bar only while there is something to take back or put back. */
  showUndo() {
    if (this.undoBtn) this.undoBtn.toggle(this.history.canUndo());
    if (this.redoBtn) this.redoBtn.toggle(this.history.canRedo());
  }
}
