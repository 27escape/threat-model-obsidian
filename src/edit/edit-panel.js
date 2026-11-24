// Point and click: the panel that edits a model, shared by the web app and (later) the plugin. Click a box, a zone or
// an arrow to change it and see its threats; click a threat to change it; it also lists the model's zones, controls,
// scenarios and problems, and adds new things (panel-more.js). Every change goes through the edit engine (edit.js,
// edit-threat.js, item-edits.js, add-edits.js), which changes only what it must in the text, and is refused if it
// would leave the model with errors it didn't have. Each build gives it twButton (a button with an icon) and
// twConfirm (asking before a deletion); the web app's are in app.js and dialogs.js.

class TwEditPanel {
  /**
   * host: what the panel edits, the web page or (later) a block in Obsidian. It gives the model's text and takes a
   * new one: { text, setText(text), showInText(ref), showLine(n), opened(on) }; opened(on) is told when the panel
   * opens or closes, to make room for it. Closing with Escape is the host's to arrange. A host without showInText or
   * showLine gets no buttons for them; one whose readOnly is a reason (text) saves nothing and says why.
   */
  constructor(host, parent) {
    this.host = host;
    this.el = parent.createEl('section', { cls: 'tw-panel tm-vars tw-hidden', attr: { 'aria-label': 'Edit' } });
    const head = this.el.createDiv({ cls: 'tw-panel-head' });
    this.heading = head.createEl('h2');
    twButton(head, '', 'Close', () => this.close(), 'x').addClass('tw-menu-close');
    this.body = this.el.createDiv({ cls: 'tw-panel-body' });
    this.showing = null; // what the panel shows, to show it again after a change
  }

  isOpen() {
    return !this.el.hasClass('tw-hidden');
  }

  open(heading, said) {
    this.heading.setText(heading);
    this.el.removeClass('tw-hidden');
    this.host.opened(true);
    this.body.empty();
    this.toTop(this.heading);
    if (said) this.body.createDiv({ cls: 'tw-panel-said', text: said });
  }

  close() {
    this.el.addClass('tw-hidden');
    this.host.opened(false);
    this.showing = null;
  }

  /** The model as written (with positions) and as built, or null with the reason shown when it can't be edited. */
  models() {
    try {
      const raw = tmEditParse(this.host.text);
      const built = tmBuildModel(this.host.text);
      if (built.errors.length) throw new TmEditError(`line ${built.errors[0].line}: ${built.errors[0].message}`);
      return { raw, model: built.model };
    } catch (e) {
      this.open('Can’t edit yet');
      this.body.createEl('p', { text: `The model has an error to put right in its text first (${e.line ? `line ${e.line}: ` : ''}${e.message}).` });
      return null;
    }
  }

  /** Show again what the panel shows, after the model changed. */
  redraw() {
    const s = this.showing;
    if (!s) return;
    if (s.kind === 'item') this.showItem(s.item);
    else if (s.kind === 'threat') this.showThreat(s.which);
    else if (s.kind === 'controls') this.showControls();
    else if (s.kind === 'control') this.showControl(s.id);
    else if (s.kind === 'zones') this.showZones();
    else if (s.kind === 'scenarios') this.showScenarios();
    else if (s.kind === 'scenario') this.showScenario(s.id);
    else if (s.kind === 'problems') this.showProblems();
  }

  /** Make an edit: refused, with the reason, if it fails or adds errors; otherwise the text changes and then() runs. */
  apply(edit, then) {
    if (this.host.readOnly) return this.host.readOnly;
    let text;
    try {
      text = edit();
    } catch (e) {
      return e.message;
    }
    const before = tmBuildModel(this.host.text).errors.length;
    const after = tmBuildModel(text).errors;
    if (after.length > before) return `That would leave the model with an error (line ${after[0].line}: ${after[0].message}).`;
    if (text !== this.host.text) this.host.setText(text); // saving a form with nothing changed changes nothing
    then();
    return '';
  }

  // ---- a box, a zone or an arrow: its form, its threats, and a button for a new one

  /** item: { type: 'element' | 'zone', id } or { type: 'flows', ns: [numbers] } (an arrow can stand for several). */
  showItem(item, said) {
    const m = this.models();
    if (!m) return;
    const { raw, model } = m;
    this.showing = { kind: 'item', item };
    const again = (note) => () => this.showItem(item, note);
    if (item.type === 'flows') {
      const flows = item.ns.map((n) => model.flows[n - 1]).filter(Boolean);
      if (!flows.length) return this.close();
      this.open(flows.length === 1 ? 'Flow' : `${flows.length} flows`, said);
      for (const f of flows) {
        const box = this.body.createDiv({ cls: 'tw-panel-section' });
        box.createEl('h3', { text: `(${f.n}) ${tmTitleOf(model, f.from)} → ${tmTitleOf(model, f.to)}` });
        if (this.host.showInText) twButton(box, 'Show in text', 'Select its statement in the model’s text', () => this.host.showInText({ type: 'flow', n: f.n }), 'text-cursor-input').addClass('tw-small');
        this.details(box, 'Details', flows.length === 1, (el) =>
          twFormInto(el, twFlowSpec(raw.flows[f.n - 1]), {
            onSave: (v) => this.apply(() => twEditFlow(this.host.text, f.n, { ...v, encrypted: twFromYesNo(v.encrypted), authenticated: twFromYesNo(v.authenticated) }), again('Saved')),
            onCancel: () => this.close(),
            onDelete: () => this.removeFlow(f, model),
          })
        );
        this.threats(box, model, { type: 'flow', n: f.n }, `(${f.n}) ${f.label || 'flow'}`, f.threats, TM_STRIDE_USUAL.flow);
      }
      return;
    }
    const isZone = item.type === 'zone';
    const thing = isZone ? tmZone(model, item.id) : tmElement(model, item.id);
    const rawThing = (isZone ? raw.zones : raw.elements).find((x) => x.id === item.id);
    if (!thing || !rawThing) return this.close();
    this.open(thing.title || thing.id, said);
    this.body.createDiv({ cls: 'tw-panel-kind', text: isZone ? 'Zone (trust boundary)' : tmC4Kind(thing).replace(/^\[|\]$/g, '') });
    const row = this.inText({ type: item.type, id: thing.id });
    if (isZone) twButton(row, 'New element in it', 'Add an element in this zone', () => this.newElement({ zone: thing.id }), 'plus');
    else {
      twButton(row, 'New flow from it', 'Add a flow from this element', () => this.newFlow({ from: thing.id }), 'arrow-right');
      if (TM_CONTAINS[thing.kind]) twButton(row, 'New element inside', 'Add an element inside this one', () => this.newElement({ parent: thing.id }), 'plus');
    }
    const box = this.body.createDiv({ cls: 'tw-panel-section' });
    this.details(box, 'Details', true, (el) =>
      twFormInto(el, isZone ? twZoneSpec(rawThing) : twElementSpec(rawThing, model), {
        onSave: (v) => this.apply(() => (isZone ? twEditZone(this.host.text, item.id, v) : twEditElement(this.host.text, item.id, v)), again('Saved')),
        onCancel: () => this.close(),
        onDelete: isZone ? () => this.removeZone(thing) : () => this.removeElement(thing, model),
      })
    );
    this.threats(this.body.createDiv({ cls: 'tw-panel-section' }), model, { type: item.type, id: thing.id }, thing.title, thing.threats || [], isZone ? null : TM_STRIDE_USUAL[thing.role]);
  }

  /** A part of the panel that opens and closes, filled by fill(el). */
  details(parent, title, open, fill) {
    const d = parent.createEl('details', { cls: 'tw-panel-details' });
    d.open = open;
    d.createEl('summary', { text: title });
    fill(d.createDiv());
  }

  /** The threats on one thing, each opening its form, and a button for a new one there. */
  threats(box, model, ref, where, threats, usual) {
    box.createEl('h3', { cls: 'tw-panel-sub', text: `Threats (${threats.length})` });
    const list = box.createEl('ul', { cls: 'tw-threats' });
    for (const t of threats) {
      const b = list.createEl('li').createEl('button', { type: 'button', cls: 'tw-threat' });
      b.toggleClass('tm-closed', t.status !== 'open');
      b.createSpan({ cls: 'tm-threat-id', text: t.id || '—' });
      b.createSpan({ cls: 'tw-threat-title', text: t.title });
      if (t.risk) b.createSpan({ cls: `tm-risk-${t.risk}`, text: t.status === 'open' ? t.risk : t.status });
      b.addEventListener('click', () => this.showThreat({ id: t.id, index: model.threats.indexOf(t) }));
    }
    twButton(box, 'New threat here', 'Add a threat to this', () => this.newThreat(ref, where, usual), 'plus').addClass('mod-cta');
  }

  async removeElement(e, model) {
    const inside = new Set([e.id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const x of model.elements) if (x.parent && inside.has(x.parent) && !inside.has(x.id)) grew = !!inside.add(x.id);
    }
    // its flows (to or from it, or anything inside it) go with it, as one change
    const flows = model.flows.filter((f) => inside.has(f.from) || inside.has(f.to));
    const parts = [
      inside.size > 1 ? `the ${inside.size - 1} element${inside.size > 2 ? 's' : ''} inside it` : '',
      flows.length ? `${flows.length === 1 ? 'its flow' : `its ${flows.length} flows`} (${flows.map((f) => `${f.n}: ${tmTitleOf(model, f.from)} → ${tmTitleOf(model, f.to)}`).join('; ')})` : '',
      e.threats.length ? `its ${e.threats.length} threat${e.threats.length > 1 ? 's' : ''}` : '',
    ].filter(Boolean);
    if (!(await twConfirm(`Delete ${e.title}?`, `It will be taken out of the model${parts.length ? `, with ${parts.join(', ')}` : ''}.`, 'Delete'))) return;
    const said = this.apply(() => twRemoveElement(this.host.text, e.id, flows.map((f) => f.n)), () => this.close());
    if (said) this.say(said);
  }

  async removeFlow(f) {
    const n = f.threats.length;
    if (!(await twConfirm(`Delete flow ${f.n}?`, `“${f.label || 'This flow'}” will be taken out of the model${n ? `, with the threats written inside it` : ''}. Scenarios that step along it will warn about it.`, 'Delete'))) return;
    const said = this.apply(() => tmRemoveStatement(this.host.text, { type: 'flow', n: f.n }), () => this.close());
    if (said) this.say(said);
  }

  /** Scroll to the top of the panel: the panel itself in the web app, the sidebar around it in Obsidian. */
  toTop(el) {
    this.el.scrollTop = 0;
    if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }

  /** A problem shown at the top of the panel. */
  say(text) {
    const old = this.body.querySelector('.tw-panel-problem');
    if (old) old.remove();
    const box = this.body.createDiv({ cls: 'tw-panel-problem', text, attr: { role: 'alert' }, prepend: true });
    this.toTop(box);
  }

  // ---- a threat's form

  /** which: { id } or { index } (the threat's place among all of them, for one without an ID). */
  showThreat(which, said) {
    const m = this.models();
    if (!m) return;
    const { raw, model } = m;
    const index = which.id ? raw.threats.findIndex((t) => t.id === which.id) : which.index;
    const rawT = raw.threats[index];
    const t = model.threats[index];
    if (!rawT || !t) return this.close();
    const ref = rawT.id ? { type: 'threat', id: rawT.id } : { type: 'threat', index };
    this.showing = { kind: 'threat', which: { id: rawT.id, index } };
    this.open(rawT.id ? `Threat ${rawT.id}` : 'Threat', said);
    this.inText(ref);
    const first = t.targets[0];
    const usual = first ? (first.type === 'flow' ? TM_STRIDE_USUAL.flow : first.type === 'element' ? TM_STRIDE_USUAL[tmElement(model, first.id).role] : null) : null;
    tmThreatFormInto(this.body.createDiv(), {
      model,
      raw: rawT,
      id: rawT.id,
      where: t.where,
      usual,
      controlsOwn: model.controls.filter((c) => (c.covers || []).includes(rawT.id) && !tmThreatFields(rawT).controls.includes(c.id)).map((c) => c.id),
      onSave: (fields) => this.apply(() => twEditThreat(this.host.text, ref, fields), () => this.showThreat({ id: rawT.id, index }, 'Saved')),
      onCancel: () => this.back(t),
      onDelete: () => this.removeThreat(ref, t),
    });
    twButton(this.body.createDiv({ cls: 'tw-panel-more' }), 'The model’s controls', 'Change the controls, or add one', () => this.showControls(), 'shield-check');
  }

  newThreat(ref, where, usual) {
    const m = this.models();
    if (!m) return;
    const { raw, model } = m;
    const id = tmNextThreatId(raw);
    this.open(`New threat ${id}`);
    tmThreatFormInto(this.body.createDiv(), {
      model,
      raw: null,
      id,
      where,
      usual,
      onSave: (fields) => {
        let added = null;
        return this.apply(
          () => {
            added = twAddThreat(this.host.text, ref, { ...fields, id });
            return added.text;
          },
          () => this.showThreat({ id: added.id }, `Added ${added.id}`)
        );
      },
      onCancel: () => (this.showing ? this.redraw() : this.close()),
    });
  }

  async removeThreat(ref, t) {
    const yes = await twConfirm(`Delete ${t.id || 'this threat'}?`, `“${t.title}” will be taken out of the model${t.id ? ', and out of any control that covers it' : ''}.`, 'Delete');
    if (!yes) return;
    const said = this.apply(() => tmDeleteThreat(this.host.text, ref), () => this.back(t));
    if (said) this.say(said);
  }

  /** After a threat: back to the thing it is on, or close. */
  back(t) {
    const x = t.targets[0];
    if (!x) return this.close();
    this.showItem(x.type === 'flow' ? { type: 'flows', ns: [x.n] } : { type: x.type, id: x.id });
  }

  async removeZone(z) {
    const n = (z.threats || []).length;
    if (!(await twConfirm(`Delete the zone ${z.title}?`, `It will be taken out of the model${n ? `, with the threats written inside it` : ''}.`, 'Delete'))) return;
    const said = this.apply(() => twDeleteZone(this.host.text, z.id), () => this.showZones(`Deleted ${z.title}`));
    if (said) this.say(said);
  }

  // ---- zones

  showZones(said) {
    const m = this.models();
    if (!m) return;
    const { model } = m;
    this.showing = { kind: 'zones' };
    this.open('Zones', said);
    this.body.createEl('p', { cls: 'tw-note', text: 'Trust boundaries: areas where everything is trusted to the same degree. The Data flow view draws them as boxes; click one there to change it. Put a box in a zone from the box\u2019s own form.' });
    const list = this.body.createEl('ul', { cls: 'tw-threats' });
    if (!model.zones.length) this.body.createEl('p', { cls: 'tw-note', text: 'No zones yet.' });
    for (const z of model.zones) {
      const b = list.createEl('li').createEl('button', { type: 'button', cls: 'tw-threat' });
      b.createSpan({ cls: 'tm-threat-id', text: z.id });
      b.createSpan({ cls: 'tw-threat-title', text: z.title });
      if (z.trust) b.createSpan({ cls: 'tw-panel-kind', text: z.trust });
      b.addEventListener('click', () => this.showItem({ type: 'zone', id: z.id }));
    }
    twButton(this.body, 'New zone', 'Add a zone', () => this.newZone(), 'plus').addClass('mod-cta');
  }

  newZone() {
    const m = this.models();
    if (!m) return;
    this.open('New zone');
    twFormInto(this.body.createDiv(), [{ key: 'id', label: 'ID', type: 'text', value: '', placeholder: 'Made from the name if left empty', help: 'How boxes name it (zone = …): letters, digits, _ and -' }, ...twZoneSpec({ attrs: {}, title: '' })], {
      submit: 'Add zone',
      onSave: (v) => {
        let added = null;
        return this.apply(
          () => {
            added = twAddZone(this.host.text, v);
            return added.text;
          },
          () => this.showItem({ type: 'zone', id: added.id }, `Added ${v.title.trim()}`)
        );
      },
      onCancel: () => this.showZones(),
    });
  }

  // ---- controls

  showControls(said) {
    const m = this.models();
    if (!m) return;
    const { model } = m;
    this.showing = { kind: 'controls' };
    this.open('Controls', said);
    this.body.createEl('p', { cls: 'tw-note', text: 'What is done, or planned, about the threats. One control can cover several threats.' });
    const list = this.body.createEl('ul', { cls: 'tw-threats' });
    if (!model.controls.length) this.body.createEl('p', { cls: 'tw-note', text: 'No controls yet.' });
    for (const c of model.controls) {
      const b = list.createEl('li').createEl('button', { type: 'button', cls: 'tw-threat' });
      b.createSpan({ cls: 'tm-threat-id', text: c.id });
      b.createSpan({ cls: 'tw-threat-title', text: c.title });
      b.createSpan({ cls: `tm-status tm-status-${c.status}`, text: c.status });
      b.addEventListener('click', () => this.showControl(c.id));
    }
    twButton(this.body, 'New control', 'Add a control', () => this.showControl(null), 'plus').addClass('mod-cta');
  }

  /** A control's form; id null for a new one. */
  showControl(id, said) {
    const m = this.models();
    if (!m) return;
    const { raw, model } = m;
    const rawC = id ? raw.controls.find((c) => c.id === id) : null;
    if (id && !rawC) return this.showControls();
    this.showing = id ? { kind: 'control', id } : { kind: 'controls' };
    this.open(id ? `Control ${id}` : `New control ${twNextId(raw.controls.map((c) => c.id), 'C')}`, said);
    if (id) this.inText({ type: 'control', id });
    twFormInto(this.body.createDiv(), twControlSpec(rawC, model), {
      submit: id ? 'Save' : 'Add control',
      onSave: (v) => {
        if (id) return this.apply(() => twEditControl(this.host.text, id, v), () => this.showControl(id, 'Saved'));
        let added = null;
        return this.apply(
          () => {
            added = twAddControl(this.host.text, v);
            return added.text;
          },
          () => this.showControl(added.id, `Added ${added.id}`)
        );
      },
      onCancel: () => this.showControls(),
      onDelete: id
        ? async () => {
            if (!(await twConfirm(`Delete ${id}?`, `“${rawC.title}” will be taken out of the model, and out of the threats that name it.`, 'Delete'))) return;
            const said2 = this.apply(() => twDeleteControl(this.host.text, id), () => this.showControls(`Deleted ${id}`));
            if (said2) this.say(said2);
          }
        : null,
    });
  }
}

/** An element's title, or its ID. */
const tmTitleOf = (model, id) => (tmElement(model, id) || { title: id }).title;

/**
 * What a click on a diagram is about: { type: 'element' | 'zone', id } for a box or a zone, { type: 'flows', ns } for
 * an arrow, or null. The diagrams name boxes e1, e2 … and zones z1 … (tmMmIds), and arrows by their risk and flows
 * ("tmhighs2f3f7": flows 3 and 7 in the Structure view; "tmnone4": flow 4 in the Data flow view).
 */
function twClickedItem(model, target) {
  const part = target.closest('.pele-node, .pele-cluster, .pele-edge, .pele-edge-label');
  if (!part) return null;
  // a zone drawn more than once (the Structure view) has "r2" and so on after its ID
  const dataId = (part.getAttribute('data-id') || '').replace(/^(z\d+)r\d+$/, '$1');
  if (part.matches('.pele-edge, .pele-edge-label')) {
    const m = /^tm(?:none|critical|high|medium|low)(?:s\d+((?:f\d+)+)|(\d+))$/.exec(dataId);
    if (!m) return null;
    const ns = m[1] ? [...m[1].matchAll(/f(\d+)/g)].map((x) => Number(x[1])) : [Number(m[2])];
    return { type: 'flows', ns };
  }
  for (const [key, mm] of tmMmIds(model)) {
    if (mm !== dataId) continue;
    return key.startsWith('zone:') ? { type: 'zone', id: key.slice(5) } : { type: 'element', id: key };
  }
  return null;
}
