// The models menu: a button in the top bar naming the model shown, which opens a panel over the page listing the
// user's own models (with New and Open) and the examples. Choosing one opens it and closes the panel; Escape, a
// click outside the panel or its close button closes it too, and focus goes back to the button.

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
    mine.createEl('p', { cls: 'tw-note', text: 'Saved in this browser only. Use Download to keep a copy.' });
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
    this.button.setAttr('title', cur ? `${cur.kind === 'mine' ? 'Your model, saved in this browser' : 'An example'}. Choose another model` : 'Choose a model');
    if (this.isOpen()) this.fill();
  }

  fill() {
    const cur = this.app.cur;
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
