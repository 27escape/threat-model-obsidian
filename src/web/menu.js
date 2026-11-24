// The models menu, like a File menu: a button in the top bar naming the model shown, which opens a panel over the
// page with what can be done to that model (save a copy, rename, duplicate, delete, download, copy as a code block),
// then the user's own models (with New and Open) and the examples. Choosing anything closes the panel; so do Escape,
// a click outside the panel and its close button, and focus goes back to the button.

class TwMenu {
  constructor(app, parent) {
    this.app = app;
    this.wrap = parent.createDiv({ cls: 'tw-menu' });
    this.button = this.wrap.createEl('button', { type: 'button', cls: 'tw-menu-button', attr: { 'aria-haspopup': 'dialog', 'aria-expanded': 'false' } });
    this.label = this.button.createSpan({ cls: 'tw-menu-label' });
    const chevron = getIcon('chevron-down');
    if (chevron) this.button.appendChild(chevron);
    this.button.addEventListener('click', () => (this.isOpen() ? this.close() : this.open()));

    this.panel = this.wrap.createDiv({ cls: 'tw-menu-panel tw-hidden', attr: { role: 'dialog', 'aria-label': 'Models' } });
    const head = this.panel.createDiv({ cls: 'tw-menu-head' });
    head.createEl('h2', { text: 'Models' });
    const x = twButton(head, '', 'Close', () => this.close(true), 'x');
    x.addClass('tw-menu-close');

    this.actions = this.panel.createDiv({ cls: 'tw-group tw-menu-actions' });
    const mine = this.panel.createDiv({ cls: 'tw-group' });
    const mineHead = mine.createDiv({ cls: 'tw-group-head' });
    mineHead.createEl('h3', { text: 'My models' });
    const actions = mineHead.createDiv({ cls: 'tw-group-actions' });
    twButton(actions, 'New', 'Start a new model', () => this.close().then(() => app.create()), 'file-plus');
    twButton(actions, 'Open', 'Open a .threat file (or the first model in a Markdown note) from your computer', () => this.fileInput.click(), 'folder-open');
    this.fileInput = mine.createEl('input', { type: 'file', attr: { accept: '.threat,.md,.txt,text/plain,text/markdown', hidden: '' } });
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files && this.fileInput.files[0];
      this.fileInput.value = '';
      this.close().then(() => app.openFile(file));
    });
    this.mineList = mine.createEl('ul', { cls: 'tw-list' });
    mine.createEl('p', { cls: 'tw-note', text: 'Saved in this browser only. Download keeps a copy of your own.' });
    const ex = this.panel.createDiv({ cls: 'tw-group' });
    ex.createDiv({ cls: 'tw-group-head' }).createEl('h3', { text: 'Examples' });
    this.exampleList = ex.createEl('ul', { cls: 'tw-list' });

    // closing: Escape anywhere, or a press outside the menu
    this.onKey = (e) => {
      if (e.key === 'Escape' && this.isOpen() && !document.querySelector('dialog[open]')) {
        e.preventDefault();
        this.close(true);
      }
    };
    this.onPress = (e) => {
      if (this.isOpen() && !this.wrap.contains(e.target) && !e.target.closest('dialog')) this.close();
    };
  }

  isOpen() {
    return !this.panel.hasClass('tw-hidden');
  }

  open() {
    this.fill();
    this.panel.removeClass('tw-hidden');
    this.button.setAttr('aria-expanded', 'true');
    document.addEventListener('keydown', this.onKey);
    document.addEventListener('pointerdown', this.onPress, true);
    const here = this.panel.querySelector('.tw-item.is-current') || this.panel.querySelector('.tw-item');
    if (here) here.focus();
  }

  /** Close the panel; refocus: put focus back on the menu button. Resolves once closed, for what comes next. */
  close(refocus) {
    this.panel.addClass('tw-hidden');
    this.button.setAttr('aria-expanded', 'false');
    document.removeEventListener('keydown', this.onKey);
    document.removeEventListener('pointerdown', this.onPress, true);
    if (refocus) this.button.focus();
    return Promise.resolve();
  }

  /** The button's label (the model shown) and, if open, the lists. */
  update() {
    const cur = this.app.cur;
    this.label.setText(cur ? cur.name : 'Models');
    this.button.setAttr('title', cur ? `${cur.kind === 'mine' ? 'Your model, saved in this browser' : cur.kind === 'shared' ? 'A model from a shared link' : 'An example'}. Choose another model` : 'Choose a model');
    if (this.isOpen()) this.fill();
  }

  fill() {
    const cur = this.app.cur;
    // what can be done to the model shown
    this.actions.empty();
    if (cur) {
      this.actions.createDiv({ cls: 'tw-group-head' }).createEl('h3', { text: cur.kind === 'mine' ? 'This model' : cur.kind === 'shared' ? 'This shared model' : 'This example' });
      const list = this.actions.createEl('ul', { cls: 'tw-list' });
      const act = (text, tip, icon, run) => {
        const b = twButton(list.createEl('li'), text, tip, () => this.close(true).then(run), icon);
        b.addClass('tw-item');
        b.addClass('tw-action');
      };
      const app = this.app;
      if (cur.kind === 'mine') {
        act('Rename\u2026', 'Rename this model', 'pencil', () => app.rename());
        act('Duplicate\u2026', 'Make a copy of this model under a new name', 'copy', () => app.saveCopy());
      } else act('Save a copy\u2026', `Save this ${cur.kind === 'shared' ? 'shared model' : 'example'} as a model of your own, to keep your changes`, 'copy-plus', () => app.saveCopy());
      if (cur.kind === 'mine') act('Earlier versions\u2026', 'Go back to a version of this model kept in this browser', 'history', () => app.showVersions());
      act('Download .threat file', 'Download this model as a .threat file, for your vault or to keep', 'download', () => app.download());
      act('Copy as code block', 'Copy the model as a ```threat code block, to paste into an Obsidian note', 'clipboard-copy', () => app.copyBlock());
      act('Copy a link to share', 'Copy a web address with the whole model in it: whoever opens it sees this model (nothing is uploaded)', 'link', () => app.copyShareLink());
      act('Download picture (SVG)', 'Download the diagram shown as an SVG picture', 'image', () => app.downloadPicture('svg'));
      act('Download picture (PNG)', 'Download the diagram shown as a PNG picture', 'image-down', () => app.downloadPicture('png'));
      act('Download threat register (CSV)', 'Download the threats as a spreadsheet (CSV)', 'sheet', () => app.downloadRegister());
      if (cur.kind === 'mine') act('Delete\u2026', 'Delete this model from this browser', 'trash-2', () => app.remove());
    }
    const item = (list, kind, name) => {
      const li = list.createEl('li');
      const b = li.createEl('button', { type: 'button', cls: 'tw-item', text: name });
      const here = cur && cur.kind === kind && cur.name === name;
      b.toggleClass('is-current', here);
      if (here) b.setAttr('aria-current', 'true');
      b.addEventListener('click', () => this.close(true).then(() => !here && this.app.open(kind, name)));
    };
    this.mineList.empty();
    const names = this.app.store.names();
    if (!names.length) this.mineList.createEl('li', { cls: 'tw-empty', text: 'None yet. Start a new one, open a file, or save a copy of an example.' });
    for (const n of names) item(this.mineList, 'mine', n);
    this.exampleList.empty();
    for (const e of TW_EXAMPLES) item(this.exampleList, 'example', e.name);
  }
}
