// The menu at the end of a threat block's bar, in Obsidian (the web app has its own menus): Edit (ticked while the
// Threat model editor is on this block), Report, then getting the model out: as a .threat file (from a note) or a
// code block (from a .threat file), a link to share, the web editor, the diagram shown as a picture (SVG or PNG), and
// the threat register as CSV. Files are handed to the computer's save dialog (export-files.js); not on a phone or
// tablet, where Obsidian can't, so those say so instead.

Object.assign(TmBlock.prototype, {
  /** The menu's button, in `bar`: it stays highlighted while the block is being edited. Returns it. */
  blockMenuButton(bar) {
    const b = bar.createEl('button', { cls: 'tm-btn tm-block-menu-btn' });
    setIcon(b.createSpan({ cls: 'tm-block-menu-icon' }), 'ellipsis');
    b.setAttr('aria-label', 'Edit, report, and save or share this model');
    this.registerDomEvent(b, 'click', (e) => this.blockMenu(e, b));
    return b;
  },

  blockMenu(e, button) {
    const menu = new Menu();
    const item = (title, icon, run, checked) =>
      menu.addItem((i) => {
        i.setTitle(title).setIcon(icon).onClick(run);
        if (checked !== undefined) i.setChecked(checked);
      });
    item('Edit in the Threat model editor', 'pencil', () => (this.editing ? this.plugin.stopEditing(this) : this.plugin.startEditing(this)), this.editing);
    item('Report (opens as a new note)', 'file-text', () => tmSaveReportNote(this.plugin, this.model, this.warnings, this.sourcePath));
    menu.addSeparator();
    if (this.fileView) item('Copy as code block', 'clipboard-copy', () => this.copyAsBlock());
    else item('Download as .threat file', 'file-down', () => this.downloadFile(`${this.fileName()}.threat`, this.codeText(), 'text/plain'));
    item('Copy a link to share', 'link', () => this.copyShareLink());
    item('Open in the web editor', 'external-link', () => tmOpenInWebEditor(this.source, this.fileName()));
    menu.addSeparator();
    item('Download picture (SVG)', 'image', () => this.downloadPicture('svg'));
    item('Download picture (PNG)', 'image-down', () => this.downloadPicture('png'));
    item('Download threat register (CSV)', 'sheet', () => this.downloadFile(`${this.fileName()} threat register.csv`, twRegisterCsv(this.model), 'text/csv'));
    const r = button.getBoundingClientRect();
    menu.showAtPosition({ x: r.left, y: r.bottom + 4 });
  },

  /** A name for files: the model's title, or the note's name, without characters file systems refuse. */
  fileName() {
    const note = this.sourcePath.replace(/^.*\//, '').replace(/\.(md|threat)$/, '');
    return ((this.model && this.model.title) || note || 'Threat model').replace(/[\\/:*?"<>|#^[\]]/g, '-').trim();
  },

  /** The model's text, ending with a line end. */
  codeText() {
    return this.source.endsWith('\n') ? this.source : `${this.source}\n`;
  },

  /** Hand a file to the computer's save dialog: not on a phone or tablet. */
  downloadFile(name, text, type) {
    if (Platform.isMobile) return void new Notice('Downloading isn’t possible in Obsidian on a phone or tablet: use Copy a link to share, or the web editor.');
    twDownload(name, text, type);
  },

  async downloadPicture(kind) {
    if (Platform.isMobile) return void new Notice('Downloading isn’t possible in Obsidian on a phone or tablet: use the web editor.');
    try {
      const name = `${this.fileName()} ${TM_VIEW_NAMES[this.state.view].toLowerCase()}`;
      if (kind === 'svg') twDownload(`${name}.svg`, twDiagramSvg(this.body), 'image/svg+xml');
      else twDownloadBlob(`${name}.png`, await twDiagramPng(this.body));
    } catch (e) {
      new Notice(`The picture couldn’t be made: ${e && e.message ? e.message : e}`);
    }
  },

  async copyAsBlock() {
    await this.copyText('```threat\n' + this.codeText() + '```\n', 'Copied: paste it into a note');
  },

  async copyShareLink() {
    const link = await tmShareLink(this.source, this.fileName(), TM_WEB_EDITOR);
    await this.copyText(link, link.length > 60000 ? 'Link copied, but it is very long: some apps may cut it short' : 'Link copied: the model travels in the link itself, nothing is uploaded');
  },

  async copyText(text, done) {
    try {
      await navigator.clipboard.writeText(text);
      new Notice(done);
    } catch (e) {
      new Notice(`It couldn’t be copied: ${e && e.message ? e.message : e}`);
    }
  },
});
