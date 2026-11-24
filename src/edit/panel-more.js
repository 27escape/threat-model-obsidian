// More of the edit panel (edit-panel.js): new elements and flows, scenarios, and the list of problems.

Object.assign(TwEditPanel.prototype, {
  /** A small "Show in text" button at the top of the panel, selecting the statement in the editor. */
  inText(ref) {
    const row = this.body.createDiv({ cls: 'tw-panel-row' });
    twButton(row, 'Show in text', 'Select its statement in the model’s text', () => this.host.showInText(ref), 'text-cursor-input');
    return row;
  },

  /** A new element; o: { parent, zone } to start from. */
  newElement(o = {}) {
    const m = this.models();
    if (!m) return;
    const { model } = m;
    this.showing = null;
    this.open('New element');
    const parents = model.elements.filter((e) => TM_CONTAINS[e.kind]);
    const inside = o.parent ? parents.find((e) => e.id === o.parent) : null;
    const kind = inside ? TM_CONTAINS[inside.kind][0] : 'container';
    const spec = [
      { key: 'kind', label: 'Kind', type: 'select', value: kind, options: TM_KINDS.map((k) => [k, TW_KIND_NAMES[k]]) },
      { key: 'title', label: 'Name', type: 'text', value: '', required: true, placeholder: 'Such as Web app, Orders database' },
      { key: 'id', label: 'ID', type: 'text', value: '', placeholder: 'Made from the name if left empty', help: 'How flows name it: letters, digits, _ and -' },
      { key: 'parent', label: 'Inside', type: 'select', value: o.parent || '', options: [['', 'Nothing (at the top level)'], ...parents.map((e) => [e.id, `${e.title} (${e.kind})`])], help: 'A system holds containers, components, stores and queues; a container holds components, stores and queues' },
      { key: 'zone', label: 'Zone', type: 'select', value: o.zone || '', options: [['', 'None, or its parent’s'], ...model.zones.map((z) => [z.id, `${z.title}${z.trust ? ` (${z.trust})` : ''}`])] },
      { key: 'technology', label: 'Technology', type: 'text', value: '', placeholder: 'Such as React, Node.js or PostgreSQL' },
      { key: 'description', label: 'Description', type: 'textarea', value: '' },
    ];
    twFormInto(this.body.createDiv(), spec, {
      submit: 'Add element',
      onSave: (v) => {
        let added = null;
        return this.apply(
          () => {
            added = twAddElement(this.host.text, v);
            return added.text;
          },
          () => this.showItem({ type: 'element', id: added.id }, `Added ${v.title.trim()}`)
        );
      },
      onCancel: () => this.close(),
    });
  },

  /** A new flow; o: { from, to } to start from. */
  newFlow(o = {}) {
    const m = this.models();
    if (!m) return;
    const { model } = m;
    if (model.elements.length < 2) {
      this.open('New flow');
      this.body.createEl('p', { text: 'A flow goes from one element to another: add two elements first.' });
      return;
    }
    this.showing = null;
    this.open('New flow');
    const ends = model.elements.map((e) => [e.id, `${e.title} (${e.kind})`]);
    const spec = [
      { key: 'from', label: 'From', type: 'select', value: o.from || ends[0][0], options: ends },
      { key: 'to', label: 'To', type: 'select', value: o.to || ends.find(([id]) => id !== (o.from || ends[0][0]))[0], options: ends },
      ...twFlowSpec({ attrs: {}, label: '' }),
    ];
    twFormInto(this.body.createDiv(), spec, {
      submit: 'Add flow',
      onSave: (v) => {
        let added = null;
        return this.apply(
          () => {
            added = twAddFlow(this.host.text, { ...v, encrypted: twFromYesNo(v.encrypted), authenticated: twFromYesNo(v.authenticated) });
            return added.text;
          },
          () => this.showItem({ type: 'flows', ns: [added.n] }, `Added flow ${added.n}`)
        );
      },
      onCancel: () => this.close(),
    });
  },

  // ---- scenarios

  showScenarios(said) {
    const m = this.models();
    if (!m) return;
    const { model } = m;
    this.showing = { kind: 'scenarios' };
    this.open('Scenarios', said);
    this.body.createEl('p', { cls: 'tw-note', text: 'Ordered walks through some of the flows, drawn by the Sequence view.' });
    if (!model.scenarios.length) this.body.createEl('p', { cls: 'tw-note', text: 'No scenarios yet: the Sequence view shows every flow in order.' });
    const list = this.body.createEl('ul', { cls: 'tw-threats' });
    for (const s of model.scenarios) {
      const b = list.createEl('li').createEl('button', { type: 'button', cls: 'tw-threat' });
      b.createSpan({ cls: 'tm-threat-id', text: s.id });
      b.createSpan({ cls: 'tw-threat-title', text: s.title });
      b.createSpan({ cls: 'tw-panel-kind', text: `${s.steps.length} step${s.steps.length === 1 ? '' : 's'}` });
      b.addEventListener('click', () => this.showScenario(s.id));
    }
    twButton(this.body, 'New scenario', 'Add a scenario', () => this.showScenario(null), 'plus').addClass('mod-cta');
  },

  /** A scenario's form (null: a new one): its name and its steps, chosen from the flows, in order. */
  showScenario(id, said) {
    const m = this.models();
    if (!m) return;
    const { raw, model } = m;
    const s = id ? raw.scenarios.find((x) => x.id === id) : null;
    if (id && !s) return this.showScenarios();
    if (!model.flows.length) {
      this.open('New scenario');
      this.body.createEl('p', { text: 'A scenario walks through flows: add a flow first.' });
      return;
    }
    this.showing = id ? { kind: 'scenario', id } : null;
    this.open(id ? `Scenario ${id}` : 'New scenario', said);
    if (id) this.inText({ type: 'scenario', id });
    const flowName = (f) => `(${f.n}) ${tmTitleOf(model, f.from)} → ${tmTitleOf(model, f.to)}${f.label ? `: ${f.label}` : ''}`;
    const options = model.flows.map((f) => [String(f.n), flowName(f)]);
    // a step is the flow it matches (the first with those ends and label), or kept as written if it matches none
    const stepFlow = (st) => model.flows.find((f) => f.from === st.from && f.to === st.to && (!st.label || f.label.toLowerCase() === st.label.toLowerCase()));
    let steps = s ? s.steps.map((st) => ({ st, n: stepFlow(st) ? String(stepFlow(st).n) : '' })) : [{ n: options[0][0] }];
    const form = this.body.createEl('form', { cls: 'tm-form' });
    const row = (label, help) => {
      const r = form.createDiv({ cls: 'tm-form-row' });
      r.createEl('label', { cls: 'tm-form-label', text: label });
      if (help) r.createDiv({ cls: 'tm-form-help', text: help });
      return r;
    };
    const title = row('Name').createEl('input', { type: 'text', value: s ? s.title || '' : '', attr: { 'aria-label': 'Name', placeholder: 'Such as Customer signs in' } });
    const idIn = id ? null : row('ID', 'Made from the name if left empty').createEl('input', { type: 'text', attr: { 'aria-label': 'ID' } });
    const box = row('Steps', 'In order: each is one of the flows').createDiv({ cls: 'tw-steps' });
    const draw = () => {
      box.empty();
      steps.forEach((x, i) => {
        const r = box.createDiv({ cls: 'tw-step' });
        r.createSpan({ cls: 'tw-step-n', text: String(i + 1) });
        const sel = r.createEl('select', { cls: 'dropdown', attr: { 'aria-label': `Step ${i + 1}` } });
        if (!x.n) sel.createEl('option', { value: '', text: `${x.st.from} -> ${x.st.to} (matches no flow)` });
        for (const [v, t] of options) sel.createEl('option', { value: v, text: t });
        sel.value = x.n;
        sel.addEventListener('change', () => (steps[i] = { n: sel.value }));
        const move = (d) => {
          const j = i + d;
          if (j < 0 || j >= steps.length) return;
          [steps[i], steps[j]] = [steps[j], steps[i]];
          draw();
        };
        twButton(r, '', 'Move up', () => move(-1), 'arrow-up').disabled = i === 0;
        twButton(r, '', 'Move down', () => move(1), 'arrow-down').disabled = i === steps.length - 1;
        twButton(r, '', 'Remove this step', () => {
          steps.splice(i, 1);
          draw();
        }, 'x');
      });
      twButton(box, 'Add a step', 'Add a step at the end', () => {
        steps.push({ n: options[0][0] });
        draw();
      }, 'plus');
    };
    draw();
    const problem = form.createDiv({ cls: 'tm-form-problem', attr: { role: 'alert' } });
    const buttons = form.createDiv({ cls: 'tm-form-buttons' });
    if (id) {
      buttons.createEl('button', { type: 'button', cls: 'mod-warning tm-form-delete', text: 'Delete' }).addEventListener('click', async () => {
        if (!(await twConfirm(`Delete the scenario ${s.title || id}?`, 'Its steps go with it; the flows stay.', 'Delete'))) return;
        const said2 = this.apply(() => twDeleteScenario(this.host.text, id), () => this.showScenarios(`Deleted ${s.title || id}`));
        if (said2) this.say(said2);
      });
    }
    buttons.createEl('button', { type: 'button', text: 'Cancel' }).addEventListener('click', () => this.showScenarios());
    buttons.createEl('button', { type: 'submit', cls: 'mod-cta', text: id ? 'Save' : 'Add scenario' });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const list = steps.map((x) => {
        if (!x.n) return x.st;
        const f = model.flows[Number(x.n) - 1];
        // the label only when another flow joins the same two elements
        const twin = model.flows.some((g) => g !== f && g.from === f.from && g.to === f.to);
        return { from: f.from, to: f.to, label: twin ? f.label : null };
      });
      let added = null;
      problem.setText(
        id
          ? this.apply(() => twEditScenario(this.host.text, id, { title: title.value, steps: list }), () => this.showScenario(id, 'Saved'))
          : this.apply(
              () => {
                added = twAddScenario(this.host.text, { title: title.value, id: idIn.value, steps: list });
                return added.text;
              },
              () => this.showScenario(added.id, `Added ${title.value.trim()}`)
            )
      );
    });
  },

  // ---- problems

  showProblems() {
    const { errors, warnings, model } = tmBuildModel(this.host.text);
    this.showing = { kind: 'problems' };
    this.open('Problems');
    let raw = null;
    try {
      raw = tmEditParse(this.host.text);
    } catch {
      // with a syntax error there is no model to find a flow's line in
    }
    const section = (title, items, cls) => {
      if (!items.length) return;
      this.body.createEl('h3', { cls: 'tw-panel-sub', text: `${title} (${items.length})` });
      const list = this.body.createEl('ul', { cls: 'tw-threats' });
      for (const it of items) {
        const b = list.createEl('li').createEl('button', { type: 'button', cls: `tw-threat ${cls}` });
        if (it.line) b.createSpan({ cls: 'tm-threat-id', text: `Line ${it.line}` });
        b.createSpan({ cls: 'tw-threat-title', text: it.message });
        if (it.line) b.addEventListener('click', () => this.host.showLine(it.line));
        else b.disabled = true;
      }
    };
    const findings = (model ? model.findings : []).map((f) => ({ line: raw && raw.flows[f.flow - 1] ? raw.flows[f.flow - 1].line : null, message: `${f.risk[0].toUpperCase()}${f.risk.slice(1)}: ${f.message}` }));
    if (!errors.length && !warnings.length && !findings.length) {
      this.body.createEl('p', { text: 'None: the model has no errors or warnings, and nothing it says suggests a missing threat.' });
      return;
    }
    section('Errors', errors, 'tw-problem-error');
    section('Warnings', warnings, 'tw-problem-warning');
    section('Findings from the model', findings, 'tw-problem-finding');
    this.body.createEl('p', { cls: 'tw-note', text: 'Click one to go to its line in the text. Findings are prompts: write a threat for each that matters, or say on the flow what the model doesn’t (such as its protocol).' });
  },
});

const TW_KIND_NAMES = { person: 'Person', external: 'External system', system: 'Software system', container: 'Container', component: 'Component', store: 'Data store', queue: 'Queue' };
