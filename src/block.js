// What a threat block shows: a bar with a list of the three diagrams (then the C4 level list or the scenario list,
// and the Threats and Compact switches) and, last, the Report button, then the chosen diagram, its threat register (the threats it
// shows: threat-table.js) and its key (legend.js). Diagrams are Mermaid, drawn by Obsidian's own Markdown renderer.
// The report is never shown in the block: its button saves it as a note and opens that in a new tab (report-note.js).
// In Obsidian, an Edit switch before Report opens the model in the Threat model editor (editor-view.js); while it is
// on, a click on a box, a zone, an arrow, a threat ID or a row of the threat register opens that there.
// Used for "threat" code blocks and, inside TmFileView, for .threat files.

class TmBlock extends MarkdownRenderChild {
  /** ctx: the code block's context in a note (to find its lines when the editor writes a change), if it is one. */
  constructor(plugin, el, source, sourcePath, ctx) {
    super(el);
    this.ctx = ctx || null;
    this.plugin = plugin;
    this.source = source;
    this.sourcePath = sourcePath || '';
    this.inner = null; // the Component holding what the renderer made for the current view
  }

  onload() {
    const built = tmBuildModel(this.source);
    this.model = built.model;
    this.errors = built.errors;
    this.warnings = built.warnings;
    const el = this.containerEl;
    el.empty();
    el.addClass('tm-block');
    if (!this.model || this.errors.length) return this.showErrors();

    const s = this.plugin.settings;
    const key = `${this.sourcePath}\u0000${this.model.title}`;
    const was = this.plugin.blockState.get(key) || {};
    this.state = {
      key,
      view: [was.view, this.model.defaultView, s.defaultView].find((v) => TM_DIAGRAM_VIEWS.includes(v)) || 'structure',
      level: was.level || this.model.level || s.defaultLevel,
      scenario: was.scenario !== undefined ? was.scenario : this.model.scenarioId || (this.model.scenarios[0] ? this.model.scenarios[0].id : ''),
      overlay: was.overlay !== undefined ? was.overlay : true, // threats on the Structure view
      compact: was.compact !== undefined ? was.compact : false, // short labels, the detail in the table
      zones: was.zones !== undefined ? was.zones : true, // zones on the Structure view
    };
    if (this.state.scenario && !this.model.scenarios.some((x) => x.id === this.state.scenario)) this.state.scenario = '';

    this.bar = el.createDiv({ cls: 'tm-bar' });
    if (this.model.title) this.bar.createSpan({ cls: 'tm-title', text: this.model.title });
    this.viewSelect = this.bar.createEl('select', { cls: 'dropdown tm-select tm-view-select' });
    this.viewSelect.setAttr('aria-label', 'Diagram');
    for (const id of TM_DIAGRAM_VIEWS) this.viewSelect.createEl('option', { value: id, text: TM_VIEW_NAMES[id] });
    this.registerDomEvent(this.viewSelect, 'change', () => this.choose({ view: this.viewSelect.value }));
    this.extra = this.bar.createDiv({ cls: 'tm-group tm-extra' });
    if (this.plugin.startEditing) {
      this.editBtn = this.bar.createEl('button', { cls: 'tm-btn tm-toggle tm-edit-btn', text: 'Edit' });
      this.editBtn.setAttr('aria-label', 'Change the model by clicking its diagram, in the Threat model editor (right sidebar)');
      this.registerDomEvent(this.editBtn, 'click', () => (this.editing ? this.plugin.stopEditing(this) : this.plugin.startEditing(this)));
      this.setEditing(false);
      this.registerDomEvent(el, 'click', (e) => this.clicked(e));
    }
    const report = this.bar.createEl('button', { cls: 'tm-btn tm-report-btn', text: TM_VIEW_NAMES.report });
    report.setAttr('aria-label', 'Open the report as a note in a new tab, ready to print or export to PDF');
    this.registerDomEvent(report, 'click', () => tmSaveReportNote(this.plugin, this.model, this.warnings, this.sourcePath));
    this.body = el.createDiv({ cls: 'tm-body' });
    this.table = el.createDiv({ cls: 'tm-table' });
    this.findings = el.createDiv({ cls: 'tm-findings-box' });
    this.legend = el.createDiv({ cls: 'tm-legend' });
    if (this.warnings.length && this.plugin.settings.showWarnings) this.showWarnings(el);
    this.draw();
    if (this.plugin.editingRedrawn) this.plugin.editingRedrawn(this);
  }

  onunload() {
    if (this.plugin.liveBlocks) this.plugin.liveBlocks.delete(this);
    if (this.plugin.editingGone) this.plugin.editingGone(this);
  }

  /** The Edit switch, on or off (the plugin keeps which block is being edited: editor-view.js). */
  setEditing(on) {
    this.editing = !!on;
    this.containerEl.toggleClass('tm-editing', this.editing);
    if (!this.editBtn) return;
    this.editBtn.toggleClass('is-active', this.editing);
    this.editBtn.setAttr('aria-pressed', String(this.editing));
  }

  /** A click on the block while editing: a row of the threat register, or a box, zone or arrow on the diagram. */
  clicked(e) {
    if (!this.editing || !(e.target instanceof Element)) return;
    const view = this.plugin.editorViewIfOpen();
    if (!view || !view.panel) return;
    const row = e.target.closest('tr[data-tm-threat]');
    if (row) return view.panel.showThreat({ id: row.getAttribute('data-tm-threat') });
    if (!e.target.closest('.mermaid svg')) return;
    const item = twClickedItem(this.model, e.target);
    if (item) view.panel.showItem(item);
  }

  choose(change) {
    Object.assign(this.state, change);
    const { view, level, scenario, overlay, compact, zones } = this.state;
    this.plugin.blockState.set(this.state.key, { view, level, scenario, overlay, compact, zones });
    this.draw();
  }

  /** The Mermaid text of the current diagram (its colours come from styles.css and the theme). */
  text() {
    const { view, level, scenario, overlay, compact, zones } = this.state;
    if (view === 'sequence') return tmSequence(this.model, scenario, { compact });
    const defaultIcons = this.plugin.settings.defaultIcons;
    if (view === 'dataflow') return tmDataflow(this.model, { compact, defaultIcons });
    return tmStructure(this.model, tmLevelFor(this.model, level), { overlay, compact, zones, defaultIcons });
  }

  draw() {
    const { view, scenario, overlay, zones } = this.state;
    this.viewSelect.value = view;
    this.drawExtra();

    if (this.inner) this.removeChild(this.inner);
    this.inner = this.addChild(new Component());
    this.body.empty();
    const body = this.body;
    const inner = this.inner;
    // watched from the start, as Obsidian may draw the diagram only once it is scrolled into view; stops with this view
    const links = {
      ids: tmThreatIdInfo(this.model.threats),
      // the threat's footprint on the diagram, and its row in the table
      open: (id) => {
        if (tmShowFootprint(body, id)) tmShowTableRow(this.table, id);
        if (this.plugin.openThreat) this.plugin.openThreat(id, this); // the web app's form for it
      },
      clear: () => tmShowFootprint(body, null),
    };
    inner.register(tmColourStrideSoon(body, links, true));
    tmDrawMermaid(this.text(), body, { app: this.plugin.app, sourcePath: this.sourcePath, component: inner });
    tmThreatTableInto(this.table, view === 'structure' && !overlay ? [] : tmViewThreats(this.model, view, { scenario }), this.model);
    tmFindingsInto(this.findings, this.model.findings);
    tmLegendInto(this.legend, this.model, view, overlay, this.plugin.settings.defaultIcons !== false, zones);
  }

  /**
   * The C4 level list (Structure) or the scenario list (Sequence), then the Threats switch (Structure) and the
   * Compact switch. The level list offers only the levels that show something different, and isn't there when there
   * is only one (a model with nothing inside its systems).
   */
  drawExtra() {
    this.extra.empty(); // its controls are made afresh each time, so plain listeners go with them
    const levels = tmLevels(this.model);
    if (this.state.view === 'structure' && levels.length > 1) {
      const sel = this.extra.createEl('select', { cls: 'dropdown tm-select' });
      sel.setAttr('aria-label', 'C4 level');
      for (const id of levels) sel.createEl('option', { value: id, text: TM_LEVEL_NAMES[id] });
      sel.value = tmLevelFor(this.model, this.state.level);
      sel.addEventListener('change', () => this.choose({ level: sel.value }));
    } else if (this.state.view === 'sequence') {
      const sel = this.extra.createEl('select', { cls: 'dropdown tm-select' });
      sel.setAttr('aria-label', 'Scenario');
      for (const s of this.model.scenarios) sel.createEl('option', { value: s.id, text: s.title });
      sel.createEl('option', { value: '', text: 'Every flow, in order' });
      sel.value = this.state.scenario;
      sel.addEventListener('change', () => this.choose({ scenario: sel.value }));
    }
    const toggle = (name, key, tip) => {
      const b = this.extra.createEl('button', { cls: 'tm-btn tm-small tm-toggle', text: name });
      b.toggleClass('is-active', !!this.state[key]);
      b.setAttr('aria-label', tip);
      b.setAttr('aria-pressed', String(!!this.state[key]));
      b.addEventListener('click', () => this.choose({ [key]: !this.state[key] }));
    };
    if (this.state.view === 'structure' && this.model.threats.length) toggle('Threats', 'overlay', 'Show the threats on the boxes and arrows');
    if (this.state.view === 'structure' && this.model.zones.length) toggle('Zones', 'zones', 'Show the zones (trust boundaries) around the boxes');
    toggle('Compact', 'compact', 'Short labels: no descriptions or data, the detail in the threat register below');
  }


  showWarnings(el) {
    const d = el.createEl('details', { cls: 'tm-warnings' });
    d.createEl('summary', { text: `${this.warnings.length} warning${this.warnings.length === 1 ? '' : 's'}` });
    const ul = d.createEl('ul');
    for (const w of this.warnings) ul.createEl('li', { text: `Line ${w.line}: ${w.message}` });
  }

  showErrors() {
    const box = this.containerEl.createDiv({ cls: 'tm-errors' });
    box.createDiv({ cls: 'tm-errors-title', text: 'This threat model has errors' });
    const ul = box.createEl('ul');
    for (const e of this.errors) ul.createEl('li', { text: `Line ${e.line}: ${e.message}` });
  }
}
