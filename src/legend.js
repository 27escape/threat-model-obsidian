// The key under a diagram: what the C4 colours and shapes mean (Structure), what the STRIDE letters' colours mean, and how
// risk is shown (louder words and threat IDs, and in the Structure and Data flow views coloured boxes and arrows).

const TM_KEY_KINDS = [
  ['person', 'Person'],
  ['system', 'Software system'],
  ['container', 'Container'],
  ['component', 'Component'],
  ['store', 'Database or queue'],
  ['external', 'External system'],
];

/** Fill el with the key for this view. overlay: whether the Structure view shows threats; marks: whether the Data flow
 *  view marks untrusted zones and sensitive data (the Default icons setting). */
function tmLegendInto(el, model, view, overlay, marks = true) {
  el.empty();
  if (view === 'structure') {
    const used = new Set(model.elements.map((e) => (e.kind === 'queue' ? 'store' : e.kind)));
    const kinds = el.createDiv({ cls: 'tm-legend-row' });
    for (const [kind, name] of TM_KEY_KINDS) if (used.has(kind)) kinds.createSpan({ cls: `tm-legend-item tm-key-chip tm-key-${kind}`, text: name });
    kinds.createSpan({ cls: 'tm-legend-item tm-key-chip tm-key-box', text: 'Inside a system or container' });
  }
  const plainFlows = view !== 'sequence' && model.flows.some((f) => f.encrypted === false);
  const untrusted = marks && view === 'dataflow' && model.zones.some((z) => /untrusted/i.test(z.trust || ''));
  const sensitive = marks && view === 'dataflow' && model.flows.some((f) => f.sensitive);
  if (plainFlows || untrusted || sensitive) {
    const row = el.createDiv({ cls: 'tm-legend-row' });
    if (plainFlows) row.createSpan({ cls: 'tm-legend-item tm-legend-dashed', text: 'Dashed arrows: not encrypted' });
    if (untrusted) {
      const item = row.createSpan({ cls: 'tm-legend-item tm-legend-icon' });
      const icon = tmLucide(TM_UNTRUSTED_ICON);
      if (icon) item.appendChild(icon);
      item.appendText(' Untrusted zone');
    }
    if (sensitive) row.createSpan({ cls: 'tm-legend-item', text: `${TM_SENSITIVE_MARK} Sensitive data` });
  }
  const showThreats = model.threats.length && (view !== 'structure' || overlay);
  if (!showThreats) return;
  const stride = el.createDiv({ cls: 'tm-legend-row' });
  for (const l of TM_STRIDE_ORDER) {
    const item = stride.createSpan({ cls: 'tm-legend-item' });
    tmStrideChip(item, l);
    item.appendText(` ${TM_STRIDE_NAMES[l].toLowerCase()}`);
  }
  const risk = el.createDiv({ cls: 'tm-legend-row' });
  risk.createSpan({ cls: 'tm-legend-label', text: view === 'sequence' ? 'Open threats:' : 'Threat IDs (as in the threat register), by open risk:' });
  for (const r of [...TM_RISKS].reverse()) risk.createSpan({ cls: `tm-legend-item tm-risk-${r}`, text: r === 'critical' && view === 'sequence' ? 'CRITICAL' : tmCap(r) });
  if (model.threats.some((t) => t.status !== 'open')) {
    const closed = el.createDiv({ cls: 'tm-legend-row' });
    closed.createSpan({ cls: 'tm-legend-item tm-legend-closed', text: 'T02' });
    closed.appendText(view === 'sequence' ? ' closed (mitigated, accepted or transferred): the risk isn\u2019t emphasised' : ' struck through: closed (mitigated, accepted or transferred), so it colours nothing');
  }
  if (view !== 'sequence') {
    const outline = el.createDiv({ cls: 'tm-legend-row' });
    const what = view === 'structure' ? 'Boxes and arrows' : 'Flows';
    outline.createSpan({ cls: 'tm-legend-label', text: `${what} coloured by their most serious open threat:` });
    for (const r of [...TM_RISKS].reverse()) outline.createSpan({ cls: `tm-legend-item tm-risk-colour-${r}`, text: tmCap(r) });
  }
}
