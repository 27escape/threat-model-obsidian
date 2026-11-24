// The Threat model editor: the point-and-click panel (src/edit/) in the right sidebar, editing the threat block whose
// Edit switch is on (block.js). The view is the panel's host (see edit-panel.js): it gives the panel that block's
// text. One block is edited at a time; turning Edit on in another moves the editor there.
// Stage 2 of docs/editor-in-obsidian.md: everything is shown, but nothing is saved yet (readOnly says why).

const TM_EDITOR_VIEW = 'threat-model-editor';
const TM_EDITOR_READ_ONLY = 'Saving from here isn’t turned on yet in this version: change the model in its text for now.';

class TmEditorView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.block = null;
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
    return this.block ? this.block.source : '';
  }

  get readOnly() {
    return TM_EDITOR_READ_ONLY;
  }

  setText() {} // nothing is saved yet (readOnly)

  opened(on) {
    this.hint.toggleClass('tw-hidden', !!on);
  }

  // ---- what is being edited

  /** Edit this block (null: nothing). Keeps what the panel shows when it is the same model drawn again. */
  follow(block) {
    const same = this.block && block && this.block.state && block.state && this.block.state.key === block.state.key;
    this.block = block;
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
      this.hint.createEl('p', { cls: 'tw-note', text: 'Then click a box, a zone, an arrow or a threat on the diagram, or use Add above.' });
      return;
    }
    this.hint.createEl('p', { text: 'Click a box, a zone, an arrow or a threat on the diagram, or use Add above.' });
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
    const add = twButton(tools, 'Add', 'Add something to the model', (e) => this.addMenu(e), 'plus');
    add.addClass('mod-cta');
    twButton(tools, 'Zones', 'The model’s zones', () => this.panel.showZones(), 'square-dashed');
    twButton(tools, 'Controls', 'The model’s controls', () => this.panel.showControls(), 'shield-check');
    twButton(tools, 'Scenarios', 'The model’s scenarios', () => this.panel.showScenarios(), 'list-ordered');
    const n = this.problemCount();
    const problems = twButton(tools, n ? String(n) : '', n ? `${n} problem${n === 1 ? '' : 's'}: errors, warnings and findings` : 'No problems', () => this.panel.showProblems(), 'circle-alert');
    problems.addClass('tm-editor-problems');
    problems.toggleClass('is-error', block.errors.length > 0);
    problems.toggleClass('is-none', !n);
    bar.createDiv({ cls: 'tm-editor-readonly', text: TM_EDITOR_READ_ONLY });
  }

  problemCount() {
    const b = this.block;
    return b.errors.length + b.warnings.length + (b.model && b.model.findings ? b.model.findings.length : 0);
  }

  addMenu(e) {
    const menu = new Menu();
    const item = (title, icon, run) => menu.addItem((i) => i.setTitle(title).setIcon(icon).onClick(run));
    item('Element…', 'box', () => this.panel.newElement());
    item('Flow…', 'arrow-right', () => this.panel.newFlow());
    item('Zone…', 'square-dashed', () => this.panel.newZone());
    menu.addSeparator();
    item('Threat to the whole model…', 'triangle-alert', () => this.panel.newThreat({ type: 'model' }, 'Whole model', null));
    item('Control…', 'shield-check', () => this.panel.showControl(null));
    item('Scenario…', 'list-ordered', () => this.panel.showScenario(null));
    menu.showAtMouseEvent(e);
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
    // drawn again within a moment: editingRedrawn picks it up; otherwise editing stops
    window.setTimeout(() => {
      if (!this.editing && this.editingKey) this.stopEditing();
    }, 1500);
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
