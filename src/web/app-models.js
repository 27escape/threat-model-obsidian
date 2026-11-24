// What the models menu does to models (menu.js): save a copy, new, rename, delete, open a file; and getting a model
// out: a .threat file, a code block, a link to share, pictures of the diagrams, the threat register as CSV; and
// earlier versions kept in this browser.

Object.assign(TwApp.prototype, {
  /** Save what is shown under a new name (an example, a shared model, or a duplicate of the user's own) and switch to it. */
  async saveCopy() {
    const kept = this.cur.kind !== 'mine';
    const wish = kept ? this.cur.name.replace(/^Shared: /, '') : `${this.cur.name} copy`;
    const name = await twAskName(kept ? 'Save a copy' : 'Duplicate', {
      value: this.store.free(wish),
      help: 'The copy is saved in this browser under this name.',
      check: (n) => this.store.problem(n),
    });
    if (!name) return;
    this.flush();
    if (!this.store.save(name, this.text)) return this.say(this.store.error, true);
    this.changed = false;
    this.open('mine', name, true);
    this.say(`Saved as “${name}”`);
  },

  async create() {
    if (this.changed && !(await this.leaveChanges())) return;
    const name = await twAskName('New model', {
      value: this.store.free('New threat model'),
      action: 'Create',
      help: 'It starts with a small example to change. It is saved in this browser under this name.',
      check: (n) => this.store.problem(n),
    });
    if (!name) return;
    this.flush();
    const text = TM_STARTER.replace(/^title = ".*"$/m, `title = "${name.replace(/"/g, '”')}"`);
    if (!this.store.save(name, text)) return this.say(this.store.error, true);
    this.changed = false;
    if (!this.codeShown) this.showCode(true); // a new model is for writing
    this.open('mine', name, true);
  },

  async rename() {
    const from = this.cur.name;
    const name = await twAskName('Rename', { value: from, action: 'Rename', check: (n) => this.store.problem(n, from) });
    if (!name || name === from) return;
    this.flush();
    if (!this.store.rename(from, name)) return this.say(this.store.error, true);
    this.cur.name = name;
    this.open('mine', name, true);
  },

  async remove() {
    const name = this.cur.name;
    const yes = await twConfirm('Delete this model?', `“${name}” will be deleted from this browser, with its earlier versions. This can’t be undone: download it first if you might want it again.`, 'Delete');
    if (!yes) return;
    clearTimeout(this.timers.save);
    this.timers.save = null;
    if (!this.store.remove(name)) return this.say(this.store.error, true);
    this.cur = null;
    const next = this.store.names()[0];
    this.open(next ? 'mine' : 'example', next || TW_EXAMPLES[0].name, true);
    this.say(`Deleted “${name}”`);
  },

  /** Open a .threat file, or the first model in a Markdown note, as a new model of the user's own. */
  async openFile(file) {
    if (!file) return;
    if (file.size > 1000000) return this.say('That file is too big to be a threat model.', true);
    let text = await file.text();
    if (/\.md$/i.test(file.name)) {
      const block = tmFirstBlock(text);
      if (block === null) return this.say(`There is no threat code block in ${file.name}.`, true);
      text = block;
    }
    if (this.changed && !(await this.leaveChanges())) return;
    const name = await twAskName('Open a file', {
      value: this.store.free(file.name.replace(/\.(threat|md|txt)$/i, '')),
      action: 'Open',
      help: `A copy of ${file.name} is saved in this browser under this name.`,
      check: (n) => this.store.problem(n),
    });
    if (!name) return;
    this.flush();
    if (!this.store.save(name, text)) return this.say(this.store.error, true);
    this.changed = false;
    this.open('mine', name, true);
  },

  fileName() {
    return this.cur.name.replace(/^Shared: /, '').replace(/[\\/:*?"<>|#^[\]]/g, '-');
  },

  download() {
    twDownload(`${this.fileName()}.threat`, this.text.endsWith('\n') ? this.text : `${this.text}\n`, 'text/plain');
    this.say('Downloaded');
  },

  async copyText(text, done) {
    try {
      await navigator.clipboard.writeText(text);
      this.say(done);
    } catch {
      this.say('The browser didn’t allow copying', true);
      twDialog('Copy this', (body) => {
        const ta = body.createEl('textarea', { cls: 'tw-copy-box', attr: { rows: '6', readonly: '' } });
        ta.value = text;
        setTimeout(() => ta.select());
      });
    }
  },

  copyBlock() {
    this.copyText('```threat\n' + (this.text.endsWith('\n') ? this.text : `${this.text}\n`) + '```\n', 'Copied: paste it into an Obsidian note');
  },

  /** A link with the model in it (nothing is stored anywhere): whoever opens it sees this model. */
  async copyShareLink() {
    const link = await twShareLink(this.text, this.fileName());
    if (link.length > 60000) this.say('That link is very long; some apps may cut it short. Download the file instead.', true);
    this.copyText(link, 'Link copied: the model travels in the link itself; nothing is uploaded');
  },

  async downloadPicture(kind) {
    try {
      const name = `${this.fileName()} ${TM_VIEW_NAMES[this.block.state.view].toLowerCase()}`;
      if (kind === 'svg') twDownload(`${name}.svg`, twDiagramSvg(this.view), 'image/svg+xml');
      else twDownloadBlob(`${name}.png`, await twDiagramPng(this.view));
      this.say('Downloaded');
    } catch (e) {
      this.say(`Couldn’t make the picture: ${e.message}`, true);
    }
  },

  downloadRegister() {
    const { model, errors } = tmBuildModel(this.text);
    if (!model || errors.length) return this.say('Put the model’s errors right first', true);
    twDownload(`${this.fileName()} threat register.csv`, twRegisterCsv(model), 'text/csv');
    this.say('Downloaded');
  },

  /** Earlier versions of the user's model, kept in this browser, to look at and restore. */
  showVersions() {
    const name = this.cur.name;
    this.flush();
    const versions = this.store.versions(name).filter((v) => v.text !== this.text); // not one the same as now
    twDialog(`Earlier versions of “${name}”`, (body, close) => {
      body.createEl('p', { cls: 'tw-help', text: 'Kept in this browser as you work, at most one every ten minutes and the last 10. Restoring one can be undone.' });
      if (!versions.length) body.createEl('p', { text: 'None yet.' });
      const list = body.createEl('ul', { cls: 'tw-versions' });
      for (const v of versions) {
        const li = list.createEl('li');
        li.createSpan({ cls: 'tw-version-when', text: new Date(v.at).toLocaleString() });
        const lines = v.text.split('\n').length;
        li.createSpan({ cls: 'tw-help', text: `${lines} lines` });
        twButton(li, 'Restore', 'Make this the model again (you can undo it)', () => {
          close();
          this.setText(v.text);
          this.say(`Restored the version from ${new Date(v.at).toLocaleString()}`);
        }, 'history');
      }
    });
  },
});
