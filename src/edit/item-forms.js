// Forms for an element, a zone, a flow and a control, shown in the edit panel (edit-panel.js). Each is a list of
// fields drawn by twFormInto, filled from the model as written (the parser's raw items) and handed, as plain values,
// to the edits in item-edits.js. Styled by the plugin's own .tm-form styles, like the threat form.

/**
 * Draw a form: spec is a list of { key, label, type, value, help, options, placeholder }, where type is one of
 * text | textarea | lines (a list, one item to a line) | select ([value, label] options) | checks ([value, label]
 * options; value is a list) | date. o: { submit (button text), onSave(values) → '' or a problem, onCancel(),
 * onDelete() or null }. Returns the form.
 */
function twFormInto(el, spec, o) {
  el.empty();
  const form = el.createEl('form', { cls: 'tm-form' });
  const get = {};
  for (const f of spec) {
    const r = form.createDiv({ cls: 'tm-form-row' });
    r.createEl('label', { cls: 'tm-form-label', text: f.label });
    if (f.help) r.createDiv({ cls: 'tm-form-help', text: f.help });
    if (f.type === 'checks') {
      const box = r.createDiv({ cls: 'tm-form-checks' });
      const on = new Set(f.value || []);
      if (!f.options.length) box.createDiv({ cls: 'tm-form-help', text: f.none || 'None yet.' });
      for (const [value, label] of f.options) {
        const lab = box.createEl('label', { cls: 'tm-form-check' });
        const cb = lab.createEl('input', { type: 'checkbox' });
        cb.checked = on.has(value);
        lab.appendText(` ${label}`);
        cb.addEventListener('change', () => (cb.checked ? on.add(value) : on.delete(value)));
      }
      get[f.key] = () => f.options.map(([v]) => v).filter((v) => on.has(v));
      continue;
    }
    if (f.type === 'select') {
      const s = r.createEl('select', { cls: 'dropdown', attr: { 'aria-label': f.label } });
      for (const [value, label] of f.options) s.createEl('option', { value, text: label });
      s.value = f.value;
      get[f.key] = () => s.value;
      continue;
    }
    const multi = f.type === 'textarea' || f.type === 'lines';
    const input = multi
      ? r.createEl('textarea', { attr: { rows: f.type === 'lines' ? '4' : '3', 'aria-label': f.label, placeholder: f.placeholder || '' } })
      : r.createEl('input', { type: f.type === 'date' ? 'date' : 'text', attr: { 'aria-label': f.label, placeholder: f.placeholder || '' } });
    input.value = f.type === 'lines' ? (f.value || []).join('\n') : f.value || '';
    if (f.required) input.required = true;
    // suggestions as you type (icon names: edit/icon-suggest.js), where the build has them
    if (f.suggest === 'icon' && typeof twIconSuggest === 'function') twIconSuggest(input, () => (get.technology ? get.technology() : ''));
    get[f.key] = f.type === 'lines' ? () => input.value.split('\n').map((x) => x.trim()).filter(Boolean) : () => input.value;
  }
  const problem = form.createDiv({ cls: 'tm-form-problem', attr: { role: 'alert' } });
  const buttons = form.createDiv({ cls: 'tm-form-buttons' });
  if (o.onDelete) buttons.createEl('button', { type: 'button', cls: 'mod-warning tm-form-delete', text: 'Delete' }).addEventListener('click', () => o.onDelete());
  buttons.createEl('button', { type: 'button', text: 'Cancel' }).addEventListener('click', () => o.onCancel());
  buttons.createEl('button', { type: 'submit', cls: 'mod-cta', text: o.submit || 'Save' });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const values = {};
    for (const [k, g] of Object.entries(get)) values[k] = g();
    problem.setText(o.onSave(values) || '');
  });
  return form;
}

const twText = (v) => (v ? tmValText(v) : '');
const TW_YES_NO = [['', 'Not said'], ['true', 'Yes'], ['false', 'No']];
const twYesNo = (v) => (v ? (tmValText(v).toLowerCase() === 'true' ? 'true' : tmValText(v).toLowerCase() === 'false' ? 'false' : '') : '');
const twFromYesNo = (s) => (s === 'true' ? true : s === 'false' ? false : null);

/** An element's form. raw: the parser's element; model: the built model. */
function twElementSpec(raw, model) {
  const a = raw.attrs;
  return [
    { key: 'title', label: 'Name', type: 'text', value: a.title ? tmValText(a.title) : raw.title || '', placeholder: raw.id },
    { key: 'technology', label: 'Technology', type: 'text', value: twText(a.technology), placeholder: 'Such as React, Node.js or PostgreSQL', help: 'Its icon follows from this unless it has one of its own' },
    {
      key: 'zone',
      label: 'Zone',
      type: 'select',
      value: twText(a.zone),
      options: [['', raw.zoneBlock ? `The zone it is written in (${raw.zoneBlock})` : raw.parent ? 'Its parent’s' : 'None'], ...model.zones.map((z) => [z.id, `${z.title}${z.trust ? ` (${z.trust})` : ''}`])],
    },
    { key: 'description', label: 'Description', type: 'textarea', value: twText(a.description) },
    { key: 'icon', label: 'Icon', type: 'text', value: twText(a.icon), placeholder: 'A Lucide icon name, such as server; none for no icon', help: 'Start typing to see matching icons (from lucide.dev/icons)', suggest: 'icon' },
    { key: 'link', label: 'Link', type: 'text', value: twText(a.link), placeholder: '[[A note]] or a web address' },
  ];
}

function twZoneSpec(raw) {
  const a = raw.attrs;
  return [
    { key: 'title', label: 'Name', type: 'text', value: a.title ? tmValText(a.title) : raw.title || '', placeholder: raw.id },
    { key: 'trust', label: 'Trust', type: 'text', value: twText(a.trust), placeholder: 'Such as untrusted, restricted or trusted', help: '“untrusted” marks it with a warning shield and checks what is written to stores from it' },
    { key: 'description', label: 'Description', type: 'textarea', value: twText(a.description) },
  ];
}

function twFlowSpec(raw) {
  const a = raw.attrs;
  return [
    { key: 'label', label: 'What it does', type: 'text', value: raw.label || twText(a.label || a.operation), placeholder: 'Such as POST /login' },
    { key: 'protocol', label: 'Protocol', type: 'text', value: twText(a.protocol || a.technology), placeholder: 'Such as HTTPS, gRPC or SQL', help: 'HTTPS, TLS, SSH and the like count as encrypted; HTTP and FTP as not' },
    { key: 'encrypted', label: 'Encrypted', type: 'select', value: twYesNo(a.encrypted), options: TW_YES_NO, help: '“Not said” leaves it to the protocol' },
    { key: 'authenticated', label: 'Authenticated', type: 'select', value: twYesNo(a.authenticated), options: TW_YES_NO },
    { key: 'data', label: 'Data', type: 'lines', value: a.data ? tmValList(a.data) : [], placeholder: 'One to a line, such as\nPassword #secret\nEmail address #pii', help: 'Tag sensitive data #secret, #pii or #confidential' },
    { key: 'description', label: 'Description', type: 'textarea', value: twText(a.description) },
  ];
}

/** A control's form; raw is null for a new one. */
function twControlSpec(raw, model) {
  const a = raw ? raw.attrs : {};
  const status = raw ? (a.status ? tmValText(a.status).toLowerCase() : tmFirstOf(raw.tags, TM_CONTROL_STATUSES) || 'planned') : 'planned';
  const own = raw && a.covers ? tmValList(a.covers) : [];
  return [
    { key: 'title', label: 'Control', type: 'text', value: raw ? raw.title : '', required: true, placeholder: 'What is done about the threats' },
    { key: 'status', label: 'Status', type: 'select', value: status, options: TM_CONTROL_STATUSES.map((s) => [s, s[0].toUpperCase() + s.slice(1)]) },
    { key: 'covers', label: 'Covers', type: 'checks', value: own, options: model.threats.filter((t) => t.id).map((t) => [t.id, `${t.id} ${t.title}`]), none: 'The model has no threats with IDs yet.', help: 'Threats can also name it themselves, in their own form' },
    { key: 'owner', label: 'Owner', type: 'text', value: twText(a.owner) },
    { key: 'due', label: 'Due', type: 'date', value: twText(a.due) },
    { key: 'description', label: 'Description', type: 'textarea', value: twText(a.description) },
  ];
}
