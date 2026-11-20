// The Sequence view: a Mermaid sequence diagram of one scenario (or of every flow in the order written).
// Participants are boxed by zone; threats are notes on a background tinted by risk.
// Pele (Obsidian's Mermaid renderer) can't colour part of a label, so in a threat note:
// - each STRIDE letter is a boxed letter (TM_STRIDE_MARKS), coloured once drawn (stride-colour.js)
// - an open threat's risk gets louder as it rises: Low in italics, Medium bold, High bold and underlined,
//   CRITICAL bold, italic, underlined and in capitals. styles.css also colours each of those from the theme
//   (it can tell them apart by their formatting). Closed threats (mitigated and so on) are left plain.
// - the tint behind the note is stronger the higher the risk

const TM_SEQ_TINTS = {
  critical: 'rgba(205,40,55,0.36)',
  high: 'rgba(236,117,0,0.28)',
  medium: 'rgba(224,172,0,0.20)',
  low: 'rgba(8,185,78,0.12)',
  none: 'rgba(128,128,128,0.10)',
};

/** The risk word, formatted to show how serious it is (only while the threat is open). */
function tmRiskMarkup(t) {
  if (!t.risk) return '';
  const word = tmMmText(tmCap(t.risk), false);
  return tmRiskStyled(t, t.status === 'open' && t.risk === 'critical' ? word.toUpperCase() : word);
}

/** First line of a threat in a note: "T01 🆂 🅸 <b><u>High</u></b> 7.5 (mitigated)". */
function tmSeqThreatHead(t) {
  const parts = [];
  if (t.id) parts.push(tmMmText(t.id, false));
  if (t.stride.length) parts.push(t.stride.map((l) => TM_STRIDE_MARKS[l]).join(' '));
  if (t.risk) parts.push(tmRiskMarkup(t));
  if (tmRatingShort(t)) parts.push(tmRatingShort(t));
  if (t.status !== 'open') parts.push(`(${t.status})`);
  return parts.join(' ');
}

/** The steps to draw: the scenario's, or one per flow. */
function tmSteps(model, scenarioId) {
  const s = scenarioId && model.scenarios.find((x) => x.id === scenarioId);
  if (s) return s.steps;
  return model.flows.map((f) => ({ from: f.from, to: f.to, label: f.label, flow: f.n }));
}

function tmSequence(model, scenarioId, opts = {}) {
  const compact = !!opts.compact; // messages without their data, threat notes without their titles
  const ids = tmMmIds(model);
  const byId = new Map(model.elements.map((e) => [e.id, e]));
  const steps = tmSteps(model, scenarioId).filter((s) => byId.has(s.from) && byId.has(s.to));
  const lines = ['sequenceDiagram'];
  if (!steps.length) {
    lines.push('  participant none as Nothing to show yet: add flows or a scenario');
    return lines.join('\n');
  }

  // participants in the order they first appear, each zone's together in one box
  const order = [];
  for (const s of steps) for (const id of [s.from, s.to]) if (!order.includes(id)) order.push(id);
  const shown = []; // in the order drawn
  const declare = (e, pad) => {
    shown.push(e.id);
    const kw = e.kind === 'person' ? 'actor' : 'participant';
    const extra = e.role === 'store' ? ` [${e.kind}]` : e.kind === 'external' ? ' [external]' : '';
    lines.push(`${pad}${kw} ${ids.get(e.id)} as ${tmMmText(e.title + extra, false)}`);
  };
  const boxed = new Set();
  for (const id of order) {
    const e = byId.get(id);
    if (!e.zone) declare(e, '  ');
    else if (!boxed.has(e.zone)) {
      boxed.add(e.zone);
      const z = model.zones.find((x) => x.id === e.zone);
      lines.push(`  box rgba(128,128,128,0.08) ${tmMmText(z ? z.title : e.zone, false)}`);
      for (const other of order) if (byId.get(other).zone === e.zone) declare(byId.get(other), '    ');
      lines.push('  end');
    }
  }
  lines.push('  autonumber');

  const note = (threats, a, b, about = '') => {
    const risk = tmWorstRisk(threats) || 'none';
    let text = threats.map((t) => tmSeqThreatHead(t) + (compact ? '' : `<br/>${tmMmText(tmClip(t.title, 80), false)}`)).join('<br/>');
    if (about) text = `On ${tmMmText(about, false)}:<br/>${text}`;
    lines.push(`  rect ${TM_SEQ_TINTS[risk]}`);
    lines.push(`    Note over ${a === b ? a : `${a},${b}`}: ${text}`);
    lines.push('  end');
  };
  const shownThreats = new Set();
  for (const s of steps) {
    const f = s.flow ? model.flows[s.flow - 1] : null;
    let text = tmMmText(s.label || (f && f.label) || '', false);
    if (f && f.data.length && !compact) text += `<br/>${tmMmText(tmClip(f.data.map((d) => d.text).join(', '), 80), false)}`;
    const a = ids.get(s.from);
    const b = ids.get(s.to);
    lines.push(`  ${a}${f ? '->>' : '-->>'}${b}: ${text || '(no label)'}`);
    if (f && f.threats.length) note(f.threats, a, b);
    // an element's own threats, the first time it takes part, in a note across this step (Obsidian wraps a note
    // over one participant to that participant's width, a narrow column), headed with the element's name
    for (const id of [s.from, s.to]) {
      const e = byId.get(id);
      if (e.threats.length && !shownThreats.has(id)) {
        shownThreats.add(id);
        const other = s.from !== s.to ? (id === s.from ? s.to : s.from) : shown[shown.indexOf(id) + 1] || shown[shown.indexOf(id) - 1] || id;
        const [x, y] = shown.indexOf(id) <= shown.indexOf(other) ? [id, other] : [other, id];
        note(e.threats, ids.get(x), ids.get(y), e.title);
      }
    }
  }
  return lines.join('\n');
}
