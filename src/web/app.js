// The web app: a bar along the top (the models menu, then the tools), the diagrams of the chosen model, drawn by the
// plugin's own threat block (TmBlock) and redrawn as you type, and its text in an editor beside them (editor.js),
// which can be hidden to give the diagrams the whole width. Every change, typed or made with a form, can be undone
// (history.js). What is done to the user's models (save a copy, rename, open a file, share …) is app-models.js;
// keyboard shortcuts and the links between the diagrams and the text are app-keys.js.
// Examples are never changed: editing one and choosing "Save a copy" makes it the user's own, under a name they give.
// A model opened from a shared link is treated the same way.

const TW_SAVE_DELAY = 600; // ms after the last key before saving
const TW_DRAW_DELAY = 350; // ms after the last key before redrawing

class TwApp {
  constructor(root) {
    this.root = root;
    this.store = new TwStore(window.localStorage);
    this.plugin = { app: twApp, settings: Object.assign({}, TM_DEFAULTS), blockState: new Map(), manifest: { name: 'Threat Modelling' } };
    this.plugin.openThreat = (id) => this.panel.showThreat({ id }); // a threat ID clicked on a diagram
    twApp.onReport = (name, text) => twShowReport(this, name, text); // the Report button shows the report here
    this.life = new Component();
    this.life.load();
    this.history = new TwHistory();
    this.block = null;
    this.cur = null; // { kind: 'example' | 'mine' | 'shared', name }
    this.text = '';
    this.changed = false; // an example (or a shared model) edited but not saved as a copy
    this.timers = {};
  }

  async start() {
    this.layout();
    this.keys();
    this.showCode(this.store.pref('code', true));
    const shared = await twSharedFromAddress();
    if (shared) return this.openText('shared', shared.name, shared.text);
    const last = this.store.last();
    const ok = last && (last.kind === 'mine' ? this.store.get(last.name) !== null : TW_EXAMPLES.some((e) => e.name === last.name));
    if (ok) this.open(last.kind, last.name, true);
    else this.open('example', TW_EXAMPLES[0].name, true);
    if (!this.store.ok) this.say('This browser isn’t letting the page save, so your models won’t be kept. Download keeps a copy.', true);
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
    this.undoBtn = twButton(tools, '', 'Undo (Ctrl+Z)', () => this.undo(), 'undo-2');
    this.redoBtn = twButton(tools, '', 'Redo (Ctrl+Shift+Z)', () => this.redo(), 'redo-2');
    this.codeBtn = twButton(tools, 'Code', 'Show or hide the model’s text', () => this.showCode(!this.codeShown), 'code');
    this.codeBtn.addClass('tw-code-button');
    twButton(tools, '', 'Show the diagrams full screen (Esc to leave)', () => this.fullScreen(), 'maximize').addClass('tw-full-button');
    twDropdown(tools, 'Add', 'Add something to the model', 'plus', () => [
      { text: 'Element…', tip: 'A person, system, container, component, store or queue', icon: 'box', run: () => this.panel.newElement() },
      { text: 'Flow…', tip: 'Data moving from one element to another', icon: 'arrow-right', run: () => this.panel.newFlow() },
      { text: 'Zone…', tip: 'A trust boundary', icon: 'square-dashed', run: () => this.panel.newZone() },
      '-',
      { text: 'Threat to the whole model…', tip: 'A threat about everything; for one about a box or an arrow, click it', icon: 'triangle-alert', run: () => this.panel.newThreat({ type: 'model' }, 'Whole model', null) },
      { text: 'Control…', tip: 'Something done about threats', icon: 'shield-check', run: () => this.panel.showControl(null) },
      { text: 'Scenario…', tip: 'An ordered walk through some flows, for the Sequence view', icon: 'list-ordered', run: () => this.panel.showScenario(null) },
    ]);
    twDropdown(tools, 'Model', 'The model’s zones, controls, scenarios and problems', 'layers', () => [
      { text: 'Zones', icon: 'square-dashed', run: () => this.panel.showZones() },
      { text: 'Controls', icon: 'shield-check', run: () => this.panel.showControls() },
      { text: 'Scenarios', icon: 'list-ordered', run: () => this.panel.showScenarios() },
      { text: 'Problems', icon: 'circle-alert', run: () => this.panel.showProblems() },
    ]);
    this.problemsBtn = twButton(tools, '', 'Problems in the model: errors, warnings and findings', () => this.panel.showProblems(), 'circle-alert');
    this.problemsBtn.addClass('tw-problems');
    twButton(tools, 'Help', 'The language, and the keyboard shortcuts (?)', () => twHelp(), 'circle-help');
    twButton(tools, 'About', 'What this page is, and where your models are kept', () => twAbout(), 'info');

    const main = r.createDiv({ cls: 'tw-main' });
    this.view = main.createEl('section', { cls: 'tw-view', attr: { 'aria-label': 'Diagrams' } });
    this.edit = main.createEl('section', { cls: 'tw-edit', attr: { 'aria-label': 'Model text' } });
    this.banner = this.edit.createDiv({ cls: 'tw-banner' });
    this.editor = new TwEditor(this.edit, {
      beforeChange: (before) => this.history.typed(before),
      changed: (text) => this.typed(text),
    });
    this.panel = new TwEditPanel(this, main);
    this.links();
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
    this.banner.empty();
    this.banner.toggleClass('tw-hidden', mine);
    if (!mine) {
      const what = this.cur.kind === 'shared' ? 'This model was opened from a link' : 'This is an example';
      this.banner.createSpan({ text: this.changed ? `You have changed ${this.cur.kind === 'shared' ? 'this model' : 'this example'}. Save a copy to keep your changes.` : `${what}. Change it as you like, then save a copy to keep it.` });
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
    const text = kind === 'mine' ? this.store.get(name) : (TW_EXAMPLES.find((e) => e.name === name) || {}).text;
    if (text === null || text === undefined) return;
    this.openText(kind, name, text);
  }

  /** Show a model's text: kind 'mine' (saved in this browser), 'example' or 'shared' (from a link). */
  openText(kind, name, text) {
    this.flush();
    if (this.cur && this.cur.kind === 'mine') this.store.keepVersion(this.cur.name);
    this.cur = { kind, name };
    this.text = text;
    this.changed = false;
    this.history.clear();
    this.editor.value = text;
    this.editor.top();
    this.draw();
    this.drawHeader();
    this.undoState();
    this.panel.close();
    if (kind !== 'shared') {
      this.store.setLast(kind, name);
      twClearShared();
    }
    document.title = `${name} – Threat Modelling`;
  }

  /** Replace the model's text (a form's change, undo or redo): kept in the history unless undoing, saved and redrawn. */
  setText(text, record = true) {
    if (text === this.text) return;
    if (record) this.history.record(this.text);
    this.text = text;
    this.editor.value = text;
    clearTimeout(this.timers.draw);
    this.draw();
    this.changedText();
  }

  /** After the text changed: saved, for the user's own; otherwise marked changed. */
  changedText() {
    this.undoState();
    if (this.cur.kind === 'mine') {
      clearTimeout(this.timers.save);
      this.timers.save = setTimeout(() => this.save(), TW_SAVE_DELAY);
    } else if (!this.changed) {
      this.changed = true;
      this.drawHeader();
    }
  }

  leaveChanges() {
    return twConfirm('Leave your changes?', `You have changed “${this.cur.name}”. Your changes will be lost unless you save a copy first.`, 'Leave them');
  }

  /** Draw the model with the plugin's own block, keeping the view's scroll position. */
  draw() {
    const top = this.view.scrollTop;
    if (this.block) this.life.removeChild(this.block);
    this.view.empty();
    const host = this.view.createDiv();
    this.block = this.life.addChild(new TmBlock(this.plugin, host, this.text, ''));
    this.view.scrollTop = top;
    this.countProblems();
  }

  typed(text) {
    this.text = text;
    clearTimeout(this.timers.draw);
    this.timers.draw = setTimeout(() => {
      this.draw();
      this.panel.redraw(); // what it shows may have changed with the text
    }, TW_DRAW_DELAY);
    this.changedText();
  }

  undo() {
    const text = this.history.undo(this.text);
    if (text === null) return this.say('Nothing to undo');
    this.setText(text, false);
    this.panel.redraw();
    this.say('Undone');
  }

  redo() {
    const text = this.history.redo(this.text);
    if (text === null) return this.say('Nothing to redo');
    this.setText(text, false);
    this.panel.redraw();
    this.say('Redone');
  }

  undoState() {
    this.undoBtn.disabled = !this.history.canUndo();
    this.redoBtn.disabled = !this.history.canRedo();
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

  /** The number of problems (errors, warnings, findings) on the problems button, which shows only when there are some. */
  countProblems() {
    const { errors, warnings, model } = tmBuildModel(this.text);
    const n = errors.length + warnings.length + (model ? model.findings.length : 0);
    this.problemsBtn.toggleClass('tw-hidden', !n);
    this.problemsBtn.toggleClass('is-error', errors.length > 0);
    const label = this.problemsBtn.querySelector('span') || this.problemsBtn.createSpan();
    label.setText(String(n));
  }

  fullScreen() {
    if (document.fullscreenElement) return document.exitFullscreen();
    if (this.view.requestFullscreen) this.view.requestFullscreen().then(() => this.draw(), () => this.say('The browser didn’t allow full screen', true));
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
