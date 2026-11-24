// The web app: a bar along the top (the models menu, then the tools), the diagrams of the chosen model, drawn by the
// plugin's own threat block (TmBlock) and redrawn as you type, and its text in a highlighted editor beside them,
// which can be hidden to give the diagrams the whole width.
// The models menu (menu.js) lists the user's own models, from local storage, and the examples. Examples are never
// changed: editing one and choosing "Save a copy" makes it the user's own, under a name they give.

const TW_SAVE_DELAY = 600; // ms after the last key before saving
const TW_DRAW_DELAY = 350; // ms after the last key before redrawing

class TwApp {
  constructor(root) {
    this.root = root;
    this.store = new TwStore(window.localStorage);
    this.plugin = { app: twApp, settings: Object.assign({}, TM_DEFAULTS), blockState: new Map(), manifest: { name: 'Threat Modelling' } };
    this.life = new Component();
    this.life.load();
    this.block = null;
    this.cur = null; // { kind: 'example' | 'mine', name }
    this.text = '';
    this.changed = false; // an example edited but not saved as a copy
    this.timers = {};
  }

  start() {
    this.layout();
    this.showCode(this.store.pref('code', true));
    const last = this.store.last();
    const ok = last && (last.kind === 'mine' ? this.store.get(last.name) !== null : TW_EXAMPLES.some((e) => e.name === last.name));
    if (ok) this.open(last.kind, last.name, true);
    else this.open('example', TW_EXAMPLES[0].name, true);
    if (!this.store.ok) this.say('This browser isn’t letting the page save, so your models won’t be kept. Use Download to keep a copy.', true);
  }

  // ---- the page

  layout() {
    const r = this.root;
    r.empty();
    r.addClass('tw-app');

    const top = r.createEl('header', { cls: 'tw-top' });
    const brand = top.createDiv({ cls: 'tw-brand' });
    const logo = getIcon('shield-half');
    if (logo) brand.appendChild(logo);
    brand.createSpan({ text: 'Threat Modelling' });
    this.menu = new TwMenu(this, top);
    this.statusEl = top.createDiv({ cls: 'tw-status' });
    this.statusEl.setAttr('role', 'status');
    const tools = top.createDiv({ cls: 'tw-tools' });
    this.copyBtn = twButton(tools, 'Save a copy', 'Save this example as a model of your own, to change it', () => this.saveCopy(), 'copy-plus');
    this.renameBtn = twButton(tools, 'Rename', 'Rename this model', () => this.rename(), 'pencil');
    this.dupBtn = twButton(tools, 'Duplicate', 'Make a copy of this model under a new name', () => this.saveCopy(), 'copy');
    this.deleteBtn = twButton(tools, 'Delete', 'Delete this model from this browser', () => this.remove(), 'trash-2');
    twButton(tools, 'Download', 'Download this model as a .threat file', () => this.download(), 'download');
    twButton(tools, 'Copy as code block', 'Copy the model as a ```threat code block, to paste into an Obsidian note', () => this.copyBlock(), 'clipboard-copy');
    this.codeBtn = twButton(tools, 'Code', 'Show or hide the model’s text', () => this.showCode(!this.codeShown), 'code');
    this.codeBtn.addClass('tw-code-button');
    twButton(tools, 'About', 'What this page is, and where your models are kept', () => twAbout(), 'info');

    const main = r.createDiv({ cls: 'tw-main' });
    this.view = main.createEl('section', { cls: 'tw-view', attr: { 'aria-label': 'Diagrams' } });
    this.edit = main.createEl('section', { cls: 'tw-edit', attr: { 'aria-label': 'Model text' } });
    this.banner = this.edit.createDiv({ cls: 'tw-banner' });
    const wrap = this.edit.createDiv({ cls: 'tm-source-wrap' });
    this.under = wrap.createEl('pre', { cls: 'tm-source tm-source-under tm-hl', attr: { 'aria-hidden': 'true' } });
    this.ta = wrap.createEl('textarea', { cls: 'tm-source tm-source-over', attr: { spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'Threat model' } });
    this.ta.addEventListener('input', () => this.typed());
    this.ta.addEventListener('scroll', () => {
      this.under.scrollTop = this.ta.scrollTop;
      this.under.scrollLeft = this.ta.scrollLeft;
    });
    this.ta.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault(); // two spaces, as the examples are indented; Esc then Tab leaves the editor
      document.execCommand('insertText', false, '  ');
    });
  }

  /** Show or hide the text; hidden, the diagrams have the whole width. Remembered in this browser. */
  showCode(on) {
    this.codeShown = !!on;
    this.root.toggleClass('tw-no-code', !on);
    this.codeBtn.toggleClass('is-active', !!on);
    this.codeBtn.setAttr('aria-pressed', String(!!on));
    this.codeBtn.setAttr('title', on ? 'Hide the model’s text, to give the diagrams the whole width' : 'Show the model’s text, to edit it');
    this.store.setPref('code', !!on);
    if (this.block) this.draw(); // Pele fits a diagram to the width it has when drawn
  }

  drawHeader() {
    const mine = this.cur.kind === 'mine';
    this.menu.update();
    this.copyBtn.toggleClass('tw-hidden', mine);
    for (const b of [this.renameBtn, this.dupBtn, this.deleteBtn]) b.toggleClass('tw-hidden', !mine);
    this.banner.empty();
    this.banner.toggleClass('tw-hidden', mine);
    if (!mine) {
      this.banner.createSpan({ text: this.changed ? 'You have changed this example. Save a copy to keep your changes.' : 'This is an example. Change it as you like, then save a copy to keep it.' });
      const b = this.banner.createEl('button', { type: 'button', cls: this.changed ? 'mod-cta' : '', text: 'Save a copy' });
      b.addEventListener('click', () => this.saveCopy());
    }
  }

  say(message, sticky) {
    this.statusEl.setText(message);
    this.statusEl.toggleClass('is-error', !!sticky);
    clearTimeout(this.timers.say);
    if (!sticky) this.timers.say = setTimeout(() => this.statusEl.setText(''), 2500);
  }

  // ---- showing a model

  async open(kind, name, quiet) {
    if (!quiet && this.changed && !(await this.leaveChanges())) return;
    this.flush();
    const text = kind === 'mine' ? this.store.get(name) : (TW_EXAMPLES.find((e) => e.name === name) || {}).text;
    if (text === null || text === undefined) return;
    this.cur = { kind, name };
    this.text = text;
    this.changed = false;
    this.ta.value = text;
    this.ta.scrollTop = 0;
    this.paint();
    this.draw();
    this.drawHeader();
    this.store.setLast(kind, name);
    document.title = `${name} – Threat Modelling`;
  }

  leaveChanges() {
    return twConfirm('Leave your changes?', `You have changed the example “${this.cur.name}”. Your changes will be lost unless you save a copy first.`, 'Leave them');
  }

  paint() {
    tmHighlightInto(this.under, this.ta.value + '\n'); // the final newline keeps the last line's height
  }

  /** Draw the model with the plugin's own block, keeping the view's scroll position. */
  draw() {
    const top = this.view.scrollTop;
    if (this.block) this.life.removeChild(this.block);
    this.view.empty();
    const host = this.view.createDiv();
    this.block = this.life.addChild(new TmBlock(this.plugin, host, this.text, ''));
    this.view.scrollTop = top;
  }

  typed() {
    this.text = this.ta.value;
    this.paint();
    clearTimeout(this.timers.draw);
    this.timers.draw = setTimeout(() => this.draw(), TW_DRAW_DELAY);
    if (this.cur.kind === 'mine') {
      clearTimeout(this.timers.save);
      this.timers.save = setTimeout(() => this.save(), TW_SAVE_DELAY);
    } else if (!this.changed) {
      this.changed = true;
      this.drawHeader();
    }
  }

  /** Save now anything still waiting to be saved. */
  flush() {
    if (this.timers.save) {
      clearTimeout(this.timers.save);
      this.timers.save = null;
      this.save();
    }
  }

  save() {
    this.timers.save = null;
    if (!this.cur || this.cur.kind !== 'mine') return;
    if (this.store.save(this.cur.name, this.text)) this.say('Saved');
    else this.say(this.store.error, true);
  }

  // ---- the user's models

  /** Save what is shown under a new name (from an example, or a duplicate of the user's own) and switch to it. */
  async saveCopy() {
    const wish = this.cur.kind === 'example' ? this.cur.name : `${this.cur.name} copy`;
    const name = await twAskName(this.cur.kind === 'example' ? 'Save a copy of the example' : 'Duplicate', {
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
  }

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
  }

  async rename() {
    const from = this.cur.name;
    const name = await twAskName('Rename', { value: from, action: 'Rename', check: (n) => this.store.problem(n, from) });
    if (!name || name === from) return;
    this.flush();
    if (!this.store.rename(from, name)) return this.say(this.store.error, true);
    this.open('mine', name, true);
  }

  async remove() {
    const name = this.cur.name;
    const yes = await twConfirm('Delete this model?', `“${name}” will be deleted from this browser. This can’t be undone: download it first if you might want it again.`, 'Delete');
    if (!yes) return;
    clearTimeout(this.timers.save);
    this.timers.save = null;
    if (!this.store.remove(name)) return this.say(this.store.error, true);
    const next = this.store.names()[0];
    this.open(next ? 'mine' : 'example', next || TW_EXAMPLES[0].name, true);
    this.say(`Deleted “${name}”`);
  }

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
  }

  download() {
    twDownload(`${this.cur.name}.threat`, this.text.endsWith('\n') ? this.text : `${this.text}\n`, 'text/plain');
    this.say('Downloaded');
  }

  async copyBlock() {
    const text = '```threat\n' + (this.text.endsWith('\n') ? this.text : `${this.text}\n`) + '```\n';
    try {
      await navigator.clipboard.writeText(text);
      this.say('Copied: paste it into an Obsidian note');
    } catch {
      this.say('The browser didn’t allow copying. Select the text and copy it instead.', true);
    }
  }
}

/** A button with an optional Lucide icon, its tooltip, and what it does. */
function twButton(parent, text, tip, run, icon) {
  const b = parent.createEl('button', { type: 'button', attr: { 'aria-label': tip, title: tip } });
  const svg = icon && getIcon(icon);
  if (svg) b.appendChild(svg);
  if (text) b.createSpan({ text });
  b.addEventListener('click', run);
  return b;
}

document.addEventListener('DOMContentLoaded', () => new TwApp(document.getElementById('app')).start());
