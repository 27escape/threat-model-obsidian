// The Threat model editor: the point-and-click panel (src/edit/) in the right sidebar, editing the threat block whose
// Edit switch is on (block.js). The view is the panel's host (see edit-panel.js): it gives the panel that block's
// text. One block is edited at a time; turning Edit on in another moves the editor there.
// A change saved in the panel is written into the note (writeModel, below, with note-write.js): through the note's
// editor when it is open there, so Obsidian's undo takes it back, otherwise into the file; a .threat file's view
// takes it itself (file-view.js). Until Obsidian draws the block again, the panel works from the new text.

const TM_EDITOR_VIEW = 'threat-model-editor';

class TmEditorView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.block = null;
    this.pending = null; // text written but not yet drawn again
    this.done = []; // the editor's changes, to undo (editor-undo.js)
    this.undone = [];
    this.scope = new Scope(this.app.scope); // Ctrl+Z and the like while this pane is active
    this.undoKeys();
  }

  getViewType() {
    return TM_EDITOR_VIEW;
  }

  getDisplayText() {
    return 'Threat model editor';
  }

  getIcon() {
    return 'shield-half';
  }

  async onOpen() {
    const root = this.contentEl;
    root.empty();
    root.addClass('tm-editor-view');
    root.addClass('tm-vars');
    this.bar = root.createDiv({ cls: 'tm-editor-bar' });
    this.hint = root.createDiv({ cls: 'tm-editor-hint' });
    this.panel = new TwEditPanel(this, root);
    this.follow(this.plugin.editing);
  }

  async onClose() {
    this.panel = null;
    this.plugin.stopEditing(); // the editor closed: nothing is being edited
  }

  // ---- the panel's host

  get text() {
    if (this.pending !== null) return this.pending;
    return this.block ? this.block.source : '';
  }

  /** Write the panel's change (editor-undo.js); if it can't be written, say why and show the model as it is. */
  setText(text) {
    this.write(text, 'change');
  }

  writeFailed(problem) {
    this.pending = null;
    new Notice(problem);
    if (this.panel) this.panel.redraw();
  }

  opened(on) {
    this.hint.toggleClass('tw-hidden', !!on);
  }

  // ---- what is being edited

  /** Edit this block (null: nothing). Keeps what the panel shows when it is the same model drawn again. */
  follow(block) {
    const same = this.block && block && this.block.state && block.state && this.block.state.key === block.state.key;
    this.block = block;
    if (!same || (block && this.pending !== null && tmSameCode(block.source, this.pending))) this.pending = null; // drawn with the change
    if (!same) this.forget(); // another model: nothing of this one's to undo
    if (!this.panel) return;
    this.drawBar();
    if (!block) this.panel.close();
    else if (same) this.panel.redraw();
    else this.panel.close();
    this.drawHint();
  }

  drawHint() {
    this.hint.empty();
    if (!this.block) {
      this.hint.createEl('p', { text: 'Turn on Edit in a threat diagram’s bar to change the model here.' });
      this.hint.createEl('p', { cls: 'tw-note', text: 'Then click a box, a zone, an arrow or a threat on the diagram, or use Add or Model above.' });
      return;
    }
    this.hint.createEl('p', { text: 'Click a box, a zone, an arrow or a threat on the diagram, or use Add or Model above.' });
  }

  drawBar() {
    const bar = this.bar;
    bar.empty();
    const block = this.block;
    if (!block) return;
    const where = bar.createDiv({ cls: 'tm-editor-where' });
    where.createSpan({ cls: 'tm-editor-title', text: block.model.title || 'Threat model' });
    const file = block.sourcePath ? block.sourcePath.replace(/^.*\//, '').replace(/\.md$/, '') : '';
    if (file && file !== block.model.title) where.createSpan({ cls: 'tm-editor-file', text: ` in ${file}` });
    const tools = bar.createDiv({ cls: 'tm-editor-tools' });
    // as in the web app's top bar: Add and Model menus, the problems count, and (here) the web editor
    const menuButton = (text, tip, icon, fill) => {
      const b = twButton(tools, text, tip, (e) => this.dropMenu(b, fill), icon);
      b.addClass('tm-editor-menu');
      const chevron = b.createSpan({ cls: 'tm-editor-chevron' });
      setIcon(chevron, 'chevron-down');
      return b;
    };
    menuButton('Add', 'Add something to the model', 'plus', (item, line) => this.addItems(item, line)).addClass('mod-cta');
    menuButton('Model', 'The model’s zones, controls, scenarios and problems', 'layers', (item) => {
      item('Zones', 'square-dashed', () => this.panel.showZones());
      item('Controls', 'shield-check', () => this.panel.showControls());
      item('Scenarios', 'list-ordered', () => this.panel.showScenarios());
      item('Problems', 'circle-alert', () => this.panel.showProblems());
    });
    this.undoBtn = twButton(tools, '', 'Undo the editor’s last change (Ctrl+Z)', () => this.undoChange(), 'undo-2');
    this.redoBtn = twButton(tools, '', 'Redo (Ctrl+Shift+Z)', () => this.redoChange(), 'redo-2');
    this.drawUndo();
    twButton(tools, '', 'Open this model in the web editor, in your browser (nothing is uploaded: the model travels in the link)', () => this.openInWebEditor(), 'external-link');
    const n = this.problemCount();
    const problems = twButton(tools, n ? String(n) : '', n ? `${n} problem${n === 1 ? '' : 's'}: errors, warnings and findings` : 'No problems', () => this.panel.showProblems(), 'circle-alert');
    problems.addClass('tm-editor-problems');
    problems.toggleClass('is-error', block.errors.length > 0);
    problems.toggleClass('is-none', !n);
  }

  problemCount() {
    const b = this.block;
    return b.errors.length + b.warnings.length + (b.model && b.model.findings ? b.model.findings.length : 0);
  }

  /** A menu dropping down from a button in the bar; fill(item, line) adds its items. Escape or a click away closes it. */
  dropMenu(button, fill) {
    const menu = new Menu();
    const item = (title, icon, run) => menu.addItem((i) => i.setTitle(title).setIcon(icon).onClick(run));
    fill(item, () => menu.addSeparator());
    const r = button.getBoundingClientRect();
    menu.showAtPosition({ x: r.left, y: r.bottom + 4 });
  }

  addItems(item, line) {
    item('Element…', 'box', () => this.panel.newElement());
    item('Flow…', 'arrow-right', () => this.panel.newFlow());
    item('Zone…', 'square-dashed', () => this.panel.newZone());
    line();
    item('Threat to the whole model…', 'triangle-alert', () => this.panel.newThreat({ type: 'model' }, 'Whole model', null));
    item('Control…', 'shield-check', () => this.panel.showControl(null));
    item('Scenario…', 'list-ordered', () => this.panel.showScenario(null));
  }
}

// ---- the plugin's side: which block is being edited, and the view to edit it in

Object.assign(ThreatModelPlugin.prototype, {
  /** Edit this block in the Threat model editor, opening it in the right sidebar if it isn't open. */
  async startEditing(block) {
    if (this.editing && this.editing !== block) this.editing.setEditing(false);
    this.editing = block;
    this.editingKey = block.state.key;
    block.setEditing(true);
    const view = await this.editorView();
    if (view) view.follow(block);
  },

  /** Stop editing (block: only if it is the one being edited). */
  stopEditing(block) {
    if (block && this.editing !== block) return;
    const was = this.editing;
    this.editing = null;
    this.editingKey = null;
    if (was) was.setEditing(false);
    const view = this.editorViewIfOpen();
    if (view) view.follow(null);
  },

  /**
   * A block was drawn again (the note changed, or Obsidian redrew it): if it is the model being edited, the new
   * block takes over, so the editor follows the model through changes. Only within a moment of the old one going.
   */
  editingRedrawn(block) {
    this.liveBlocks.add(block);
    if (!this.editingKey || block.state.key !== this.editingKey) return false;
    if (this.editing && this.editing.containerEl.isConnected && this.editing !== block) return false;
    this.editing = block;
    block.setEditing(true);
    const view = this.editorViewIfOpen();
    if (view) view.follow(block);
    return true;
  },

  /** The block being edited went (its note closed, or it was drawn again: the new one may already be there). */
  editingGone(block) {
    if (this.editing !== block) return;
    this.editing = null;
    const again = [...this.liveBlocks].find((b) => b !== block && b.state && b.state.key === this.editingKey);
    if (again) return this.editingRedrawn(again);
    // Not drawn now (in Live Preview, the cursor is in its code): the editor keeps working from the model as it was,
    // and a change is still written only if the code is still that; it picks the block up again when it is drawn.
    // Opening another file closes the editor (editingFileOpened).
  },

  /**
   * Another file opened (or none): the editor closes, so it never shows one file's model while another is in front.
   * Clicking into a sidebar opens no file, so the editor stays while you use it.
   */
  editingFileOpened(file) {
    const view = this.editorViewIfOpen();
    if (!this.editing && !view) return;
    const path = this.editing ? this.editing.sourcePath : view && view.block ? view.block.sourcePath : null;
    if (file && path && file.path === path) return;
    this.stopEditing();
    for (const leaf of this.app.workspace.getLeavesOfType(TM_EDITOR_VIEW)) leaf.detach();
  },

  /** A threat ID clicked on the diagram being edited opens the threat in the editor. */
  openThreat(id, block) {
    if (this.editing !== block) return;
    const view = this.editorViewIfOpen();
    if (view && view.panel) view.panel.showThreat({ id });
  },

  /**
   * Write `now` in place of `was` in the block's note (or .threat file). Changes go one after another, each checked
   * against the text it was made from. Resolves with a problem to show, or '' once written.
   */
  writeModel(block, was, now) {
    const run = () => (block.fileView ? block.fileView.setModelText(was, now) : this.writeNote(block, was, now));
    this.writing = (this.writing || Promise.resolve()).then(run, run);
    return this.writing;
  },

  async writeNote(block, was, now) {
    const file = this.app.vault.getAbstractFileByPath(block.sourcePath);
    if (!(file instanceof TFile)) return 'The note couldn’t be found: nothing was written.';
    const info = block.ctx && block.ctx.getSectionInfo ? block.ctx.getSectionInfo(block.containerEl) : null;
    const near = info ? info.lineStart : null;
    // open in an editor (Live Preview or Source mode): through it, on the block's own lines, so undo takes it back
    const view = this.app.workspace
      .getLeavesOfType('markdown')
      .map((l) => l.view)
      .find((v) => v && v.file && v.file.path === file.path && v.editor && v.getMode && v.getMode() === 'source');
    if (view) {
      const editor = view.editor;
      const plan = tmPlanBlockWrite(editor.getValue(), was, now, near);
      if (plan.problem) return plan.problem;
      editor.replaceRange(`${plan.lines.join('\n')}\n`, { line: plan.block.open + 1, ch: 0 }, { line: plan.block.close, ch: 0 });
      return '';
    }
    let problem = '';
    await this.app.vault.process(file, (text) => {
      const r = tmWriteBlock(text, was, now, near);
      if (r.problem) problem = r.problem;
      return r.problem ? text : r.text;
    });
    return problem;
  },

  editorViewIfOpen() {
    const leaf = this.app.workspace.getLeavesOfType(TM_EDITOR_VIEW)[0];
    return leaf && leaf.view instanceof TmEditorView ? leaf.view : null;
  },

  async editorView() {
    const ws = this.app.workspace;
    let leaf = ws.getLeavesOfType(TM_EDITOR_VIEW)[0];
    if (!leaf) {
      leaf = ws.getRightLeaf(false);
      if (!leaf) return null;
      await leaf.setViewState({ type: TM_EDITOR_VIEW, active: true });
    }
    await ws.revealLeaf(leaf);
    if (leaf.loadIfDeferred) await leaf.loadIfDeferred();
    return leaf.view instanceof TmEditorView ? leaf.view : null;
  },
});
