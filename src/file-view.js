// .threat files: opened in their own view, showing the model (as a threat block would) or its source to edit.
// Edits are saved by Obsidian's TextFileView, as for any file you type in. The editor is a plain textarea with
// the highlighted text drawn underneath it (the textarea's own text is transparent), kept in step as you type and scroll.

class TmFileView extends TextFileView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.editing = false;
    this.block = null;
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
    this.toggle = this.addAction('pencil', 'Edit the threat model', () => {
      this.editing = !this.editing;
      this.refresh();
    });
  }

  setViewData(data, clear) {
    this.data = data;
    if (clear) this.editing = false;
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
      ta.value = this.data || '';
      ta.spellcheck = false;
      // a final newline keeps the last line's height when the text ends with one
      const paint = () => tmHighlightInto(under, ta.value + '\n');
      paint();
      this.registerDomEvent(ta, 'input', () => {
        this.data = ta.value;
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
  }
}
