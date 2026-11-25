// The threats a view shows, and the table of them under the diagram (as DOM in a block, as Markdown in a saved
// report). Threats about the whole model are in every view's table.

/** The threats one view shows, in register order (open first, then by score and risk). */
function tmViewThreats(model, view, opts = {}) {
  let list;
  if (view === 'sequence') {
    const steps = tmSteps(model, opts.scenario || '');
    const flows = new Set(steps.map((s) => s.flow).filter(Boolean));
    const ids = new Set(steps.flatMap((s) => [s.from, s.to]));
    list = model.threats.filter(
      (t) => t.target.type === 'model' || t.targets.some((x) => (x.type === 'flow' && flows.has(x.n)) || (x.type === 'element' && ids.has(x.id)))
    );
  } else list = tmScenarioModel(model, opts.scenario || '').threats; // the threats on what the view shows
  return tmSortThreats(list);
}

/** A STRIDE letter in a coloured box (HTML): in the table, the key and saved reports. */
function tmStrideChip(el, letter) {
  return el.createSpan({ cls: `tm-chip tm-chip-${letter}`, text: letter });
}

/** A STRIDE letter as a chip, written as HTML for a saved report (styles.css colours it). */
const tmChipHtml = (l) => `<span class="tm-chip tm-chip-${l}">${l}</span>`;

/** A threat's STRIDE letters as chips, written as HTML. */
const tmStrideChipsHtml = (t) => t.stride.map(tmChipHtml).join(' ');

/** The table under a diagram: a heading that opens and closes it, then one row per threat. model: for its controls. */
function tmThreatTableInto(el, threats, model = null) {
  el.empty();
  if (!threats.length) return;
  const d = el.createEl('details', { cls: 'tm-threats' });
  d.open = true;
  // the threat register, as in the report: the whole of it, or the part this view shows
  const total = model ? model.threats.length : threats.length;
  d.createEl('summary', { text: threats.length === total ? `Threat register (${total})` : `Threat register: ${threats.length} of ${total} threats in this view` });
  const table = d.createEl('table', { cls: 'tm-threat-table' });
  const head = table.createEl('thead').createEl('tr');
  for (const h of ['ID', 'STRIDE', 'Risk', 'Rating', 'Status', 'Threat', 'Applies to', 'Mitigation and controls']) head.createEl('th', { text: h });
  const body = table.createEl('tbody');
  for (const t of threats) {
    const tr = body.createEl('tr');
    tr.toggleClass('tm-closed', t.status !== 'open');
    if (t.id) tr.dataset.tmThreat = t.id; // for the IDs on the diagram (id-links.js)
    tr.createEl('td', { cls: 'tm-threat-id', text: t.id || '—' });
    const stride = tr.createEl('td', { cls: 'tm-nowrap' });
    for (const l of t.stride) tmStrideChip(stride, l);
    const risk = tr.createEl('td');
    const word = (r) => (t.status === 'open' && r === 'critical' ? 'CRITICAL' : tmCap(r));
    if (t.risk) risk.createSpan({ cls: t.status === 'open' ? `tm-risk-${t.risk}` : '', text: word(t.risk) });
    if (t.residual && t.residual !== t.risk) {
      risk.appendText(' → ');
      risk.createSpan({ cls: t.status === 'open' ? `tm-risk-${t.residual}` : '', text: word(t.residual), attr: { 'aria-label': 'after controls' } });
    }
    const rated = tr.createEl('td', { cls: 'tm-nowrap' });
    const link = t.method === 'cvss' ? tmCvssLink(t.cvss) : '';
    // a CVSS rating links to FIRST's calculator with its vector filled in, to see what it means
    if (link) rated.createEl('a', { cls: 'external-link', text: tmRatingText(t), href: link, attr: { target: '_blank', rel: 'noopener' } });
    else rated.setText(tmRatingText(t) || (t.method === 'tag' ? 'Tag' : ''));
    rated.setAttr('title', tmRatingTip(t) + (link ? '\nClick to see or change the vector in FIRST\u2019s CVSS calculator' : '')); // what the numbers mean
    risk.setAttr('title', tmRatingTip(t));
    const status = tr.createEl('td');
    status.createSpan({ cls: `tm-status tm-status-${t.status}${t.status === 'open' && t.risk ? ` tm-status-${t.risk}` : ''}`, text: tmCap(t.status) });
    const progress = tmControlProgress(model, t);
    if (progress) status.createDiv({ cls: 'tm-status-progress', text: progress }); // under the label, to keep the column narrow
    tr.createEl('td', { text: t.title });
    tr.createEl('td', { text: t.where });
    const fix = tr.createEl('td');
    if (t.mitigation) fix.createDiv({ text: t.mitigation });
    for (const line of model ? tmControlLines(model, t) : []) fix.createDiv({ cls: 'tm-control', text: line });
  }
}

/** The same table as Markdown, for a saved report. */
function tmThreatTableMarkdown(threats, model = null) {
  return tmTable(
    ['ID', 'STRIDE', 'Risk', 'Rating', 'Status', 'Threat', 'Applies to', 'Mitigation and controls'],
    threats.map((t) => [
      t.id || '—',
      tmStrideChipsHtml(t),
      tmCap(t.risk) + (t.residual && t.residual !== t.risk ? ` → ${tmCap(t.residual)}` : ''),
      tmRatingText(t),
      tmCap(t.status) + (tmControlProgress(model, t) ? ` · ${tmControlProgress(model, t)}` : ''),
      t.title,
      t.where,
      [t.mitigation, ...(model ? tmControlLines(model, t) : [])].filter(Boolean).join('; '),
    ])
  );
}

/** The findings from the model's own facts (rules.js), under the table: a heading that opens and closes them. */
function tmFindingsInto(el, findings) {
  el.empty();
  if (!findings || !findings.length) return;
  const d = el.createEl('details', { cls: 'tm-findings' });
  d.open = true;
  d.createEl('summary', { text: `Findings from the model (${findings.length})` });
  const list = d.createEl('ul');
  for (const f of findings) {
    const li = list.createEl('li');
    li.createSpan({ cls: `tm-risk-${f.risk}`, text: tmCap(f.risk) });
    li.appendText(` — ${f.message}`);
  }
}
