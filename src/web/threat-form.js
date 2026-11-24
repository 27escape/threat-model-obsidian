// The form for one threat: what it is (title, STRIDE), how serious (likelihood and impact, before and after its
// controls), where it stands (status, controls, owner) and what to do about it (mitigation, description). Built with
// Obsidian's DOM helpers (createEl …), so the plugin can show it later too (it lives in the web app until then). It
// only reads the model and hands the fields to onSave; writing them is the edit engine's job (edit-threat.js, and
// twSetRating in item-edits.js for the way it is rated: likelihood × impact, a risk tag or a CVSS vector).

// (the names of likelihood and impact from 1 to 5 are risk-matrix.js's TM_LIKELIHOOD_NAMES and TM_IMPACT_NAMES)
// the STRIDE categories that usually apply to each kind of thing ("STRIDE per element"), offered as a hint
const TM_STRIDE_USUAL = { external: ['S', 'R'], process: ['S', 'T', 'R', 'I', 'D', 'E'], store: ['T', 'R', 'I', 'D'], flow: ['T', 'I', 'D'] };

/** What the form shows for a threat as written (a raw threat from the parser), or the empty form for a new one. */
function tmThreatFields(raw) {
  if (!raw) return { title: '', stride: [], status: 'open', likelihood: null, impact: null, residual_likelihood: null, residual_impact: null, controls: [], owner: '', mitigation: '', description: '', cvss: '', riskTag: '' };
  const a = raw.attrs;
  const rating = (key) => (a[key] ? tmRatingOf(a[key]) : null);
  const status = a.status ? tmValText(a.status).toLowerCase() : tmStatusOf(raw.tags) || 'open';
  const controls = a.controls ? (a.controls.type === 'list' ? a.controls.value : [a.controls]).map(tmValText) : [];
  return {
    title: raw.title || '',
    stride: tmStrideOf(raw.tags),
    status: TM_STATUSES.includes(status) ? status : 'open',
    likelihood: rating('likelihood'),
    impact: rating('impact'),
    residual_likelihood: rating('residual_likelihood'),
    residual_impact: rating('residual_impact'),
    controls,
    owner: a.owner ? tmValText(a.owner) : '',
    mitigation: a.mitigation ? tmValText(a.mitigation) : '',
    description: a.description ? tmValText(a.description) : '',
    // how it is rated when not by likelihood and impact, which the form says rather than changes
    cvss: a.cvss ? tmValText(a.cvss) : '',
    riskTag: tmRiskOf(raw.tags),
  };
}

/**
 * Fill el with the form. o: { model (built), raw (the raw threat, or null for a new one), id (its ID, or the one a new
 * threat will get), where (what it is about, in words), usual (STRIDE letters usually found there, or null),
 * controlsOwn (control IDs that cover it through their own "covers"), onSave(fields) → '' or a problem to show,
 * onCancel(), onDelete() (or null) }.
 */
function tmThreatFormInto(el, o) {
  el.empty();
  const f = tmThreatFields(o.raw);
  const form = el.createEl('form', { cls: 'tm-form' });
  const row = (label, help) => {
    const r = form.createDiv({ cls: 'tm-form-row' });
    r.createEl('label', { cls: 'tm-form-label', text: label });
    if (help) r.createDiv({ cls: 'tm-form-help', text: help });
    return r;
  };

  const head = form.createDiv({ cls: 'tm-form-head' });
  head.createSpan({ cls: 'tm-form-id', text: o.id || 'No ID' });
  head.createSpan({ cls: 'tm-form-where', text: o.where });

  const title = row('Threat').createEl('input', { type: 'text', value: f.title, attr: { 'aria-label': 'Threat', placeholder: 'What could go wrong, in a few words' } });
  title.required = true;

  // STRIDE: a toggle for each letter, with the usual ones for this kind of thing pointed out
  const strideRow = row('STRIDE', o.usual ? 'Dashed: the ones usual here' : '');
  const strideBox = strideRow.createDiv({ cls: 'tm-form-stride' });
  const stride = new Set(f.stride);
  for (const l of TM_STRIDE_ORDER) {
    const b = strideBox.createEl('button', { type: 'button', cls: `tm-form-letter tm-chip-${l}`, text: l, attr: { title: TM_STRIDE_NAMES[l], 'aria-label': TM_STRIDE_NAMES[l] } });
    const show = () => {
      b.toggleClass('is-on', stride.has(l));
      b.setAttr('aria-pressed', String(stride.has(l)));
    };
    b.toggleClass('is-usual', !!(o.usual && o.usual.includes(l)));
    b.addEventListener('click', () => {
      if (stride.has(l)) stride.delete(l);
      else stride.add(l);
      show();
    });
    show();
  }

  // rating, one way: likelihood × impact (before and after controls), a risk tag, or a CVSS vector
  const method0 = f.cvss ? 'cvss' : f.riskTag && !f.likelihood && !f.impact ? 'tag' : 'li';
  const methodSel = row('Rated by', 'One way per threat: changing it takes the old rating away').createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Rated by' } });
  for (const [v, t] of [['li', 'Likelihood \u00d7 impact'], ['tag', 'A risk tag'], ['cvss', 'A CVSS vector (a known vulnerability)']]) methodSel.createEl('option', { value: v, text: t });
  methodSel.value = method0;
  const pick = (parent, label, names, value) => {
    const s = parent.createEl('select', { cls: 'dropdown', attr: { 'aria-label': label } });
    s.createEl('option', { value: '', text: '\u2014' });
    names.forEach((n, i) => s.createEl('option', { value: String(i + 1), text: `${i + 1} ${n}` }));
    s.value = value ? String(value) : '';
    return s;
  };
  const liBox = form.createDiv({ cls: 'tm-form-method' });
  const rateRow = liBox.createDiv({ cls: 'tm-form-row' });
  rateRow.createEl('label', { cls: 'tm-form-label', text: 'Likelihood \u00d7 impact' });
  const rate = rateRow.createDiv({ cls: 'tm-form-pair' });
  const likelihood = pick(rate, 'Likelihood', TM_LIKELIHOOD_NAMES, f.likelihood);
  rate.createSpan({ text: '\u00d7' });
  const impact = pick(rate, 'Impact', TM_IMPACT_NAMES, f.impact);
  const risk = rate.createSpan({ cls: 'tm-form-risk' });
  const afterRow = liBox.createDiv({ cls: 'tm-form-row' });
  afterRow.createEl('label', { cls: 'tm-form-label', text: 'After its controls' });
  afterRow.createDiv({ cls: 'tm-form-help', text: 'Leave empty if they make no difference' });
  const after = afterRow.createDiv({ cls: 'tm-form-pair' });
  const rLikelihood = pick(after, 'Likelihood after controls', TM_LIKELIHOOD_NAMES, f.residual_likelihood);
  after.createSpan({ text: '\u00d7' });
  const rImpact = pick(after, 'Impact after controls', TM_IMPACT_NAMES, f.residual_impact);
  const rRisk = after.createSpan({ cls: 'tm-form-risk' });
  const num = (s) => (s.value ? Number(s.value) : null);
  const showRisk = (span, l, i) => {
    span.empty();
    if (!l || !i) return;
    const r = tmRiskFromRating(l * i);
    span.createSpan({ cls: `tm-risk tm-risk-${r}`, text: `${l * i} ${r}` });
  };
  const rerate = () => {
    showRisk(risk, num(likelihood), num(impact));
    // after controls: what isn't given is the same as before
    const rl = num(rLikelihood);
    const ri = num(rImpact);
    showRisk(rRisk, rl || ri ? rl || num(likelihood) : null, rl || ri ? ri || num(impact) : null);
  };
  for (const s of [likelihood, impact, rLikelihood, rImpact]) s.addEventListener('change', rerate);
  rerate();

  const tagBox = form.createDiv({ cls: 'tm-form-method tm-form-row' });
  tagBox.createEl('label', { cls: 'tm-form-label', text: 'Risk' });
  tagBox.createDiv({ cls: 'tm-form-help', text: 'A quick rating, written as a tag such as #high' });
  const riskSel = tagBox.createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Risk' } });
  for (const r of TM_RISKS) riskSel.createEl('option', { value: r, text: r[0].toUpperCase() + r.slice(1) });
  riskSel.value = f.riskTag || 'medium';

  const cvssBox = form.createDiv({ cls: 'tm-form-method tm-form-row' });
  cvssBox.createEl('label', { cls: 'tm-form-label', text: 'CVSS vector' });
  cvssBox.createDiv({ cls: 'tm-form-help', text: 'For a known vulnerability, such as a published CVE: a CVSS 3.1 vector' });
  const cvss = cvssBox.createEl('input', { type: 'text', value: f.cvss, attr: { 'aria-label': 'CVSS vector', placeholder: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', spellcheck: 'false' } });
  const cvssSaid = cvssBox.createDiv({ cls: 'tm-form-help' });
  const cvssLink = cvssBox.createEl('a', { cls: 'external-link', text: 'Build or check a vector with FIRST\u2019s calculator', href: 'https://www.first.org/cvss/calculator/3.1', attr: { target: '_blank', rel: 'noopener' } });
  const recvss = () => {
    cvssSaid.empty();
    const v = cvss.value.trim();
    cvssLink.setAttr('href', tmCvssLink(v) || 'https://www.first.org/cvss/calculator/3.1');
    if (!v) return;
    const r = tmCvss(v);
    if (r.error) return cvssSaid.createSpan({ cls: 'tm-form-bad', text: r.error });
    const band = r.score >= 9 ? 'critical' : r.score >= 7 ? 'high' : r.score >= 4 ? 'medium' : 'low';
    cvssSaid.createSpan({ cls: `tm-risk tm-risk-${band}`, text: `${r.score} ${band}` });
    cvssSaid.appendText(` \u00b7 ${tmCvssExplain(v)}`);
  };
  cvss.addEventListener('input', recvss);
  recvss();
  const showMethod = () => {
    liBox.toggleClass('tw-hidden', methodSel.value !== 'li');
    tagBox.toggleClass('tw-hidden', methodSel.value !== 'tag');
    cvssBox.toggleClass('tw-hidden', methodSel.value !== 'cvss');
  };
  methodSel.addEventListener('change', showMethod);
  showMethod();

  const statusSel = row('Status').createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Status' } });
  for (const s of TM_STATUSES) statusSel.createEl('option', { value: s, text: s[0].toUpperCase() + s.slice(1) });
  statusSel.value = f.status;

  // controls: the model's own, ticked if this threat names them (those covering it from their side are shown, fixed)
  const controls = new Set(f.controls);
  const own = new Set(o.controlsOwn || []);
  if (o.model.controls.length) {
    const box = row('Controls').createDiv({ cls: 'tm-form-checks' });
    for (const c of o.model.controls) {
      const lab = box.createEl('label', { cls: 'tm-form-check' });
      const cb = lab.createEl('input', { type: 'checkbox' });
      cb.checked = controls.has(c.id) || own.has(c.id);
      cb.disabled = own.has(c.id);
      lab.appendText(` ${c.id} ${c.title} (${c.status})`);
      if (own.has(c.id)) lab.setAttr('title', `${c.id} says it covers this threat; change that on the control`);
      cb.addEventListener('change', () => (cb.checked ? controls.add(c.id) : controls.delete(c.id)));
    }
  }

  const owner = row('Owner').createEl('input', { type: 'text', value: f.owner, attr: { 'aria-label': 'Owner', placeholder: 'Who deals with it' } });
  const mitigation = row('Mitigation').createEl('textarea', { attr: { rows: '3', 'aria-label': 'Mitigation', placeholder: 'What is done, or should be done, about it' } });
  mitigation.value = f.mitigation;
  const description = row('Description').createEl('textarea', { attr: { rows: '3', 'aria-label': 'Description' } });
  description.value = f.description;

  const problem = form.createDiv({ cls: 'tm-form-problem', attr: { role: 'alert' } });
  const buttons = form.createDiv({ cls: 'tm-form-buttons' });
  if (o.onDelete) {
    const del = buttons.createEl('button', { type: 'button', cls: 'mod-warning tm-form-delete', text: 'Delete' });
    del.addEventListener('click', () => o.onDelete());
  }
  buttons.createEl('button', { type: 'button', text: 'Cancel' }).addEventListener('click', () => o.onCancel());
  buttons.createEl('button', { type: 'submit', cls: 'mod-cta', text: o.raw ? 'Save' : 'Add threat' });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!title.value.trim()) {
      problem.setText('Give the threat a title.');
      title.focus();
      return;
    }
    const method = methodSel.value;
    if (method === 'cvss') {
      const r = tmCvss(cvss.value.trim());
      if (r.error) {
        problem.setText(cvss.value.trim() ? r.error : 'Give the CVSS vector, or rate the threat another way.');
        cvss.focus();
        return;
      }
    }
    const fields = {
      method,
      risk: riskSel.value,
      cvss: cvss.value.trim(),
      title: title.value.trim(),
      stride: TM_STRIDE_ORDER.filter((l) => stride.has(l)),
      status: statusSel.value,
      likelihood: num(likelihood),
      impact: num(impact),
      residual_likelihood: num(rLikelihood),
      residual_impact: num(rImpact),
      controls: o.model.controls.map((c) => c.id).filter((id) => controls.has(id) && !own.has(id)),
      owner: owner.value,
      mitigation: mitigation.value,
      description: description.value,
    };
    if (method !== 'li') for (const k of ['likelihood', 'impact', 'residual_likelihood', 'residual_impact']) fields[k] = null;
    const said = o.onSave(fields);
    problem.setText(said || '');
  });
  setTimeout(() => (o.raw ? null : title.focus()));
  return form;
}
