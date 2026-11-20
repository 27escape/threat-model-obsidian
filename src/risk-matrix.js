// The risk matrix in a saved report: likelihood (rows, most likely at the top) against impact (columns), with the
// open threats placed by their likelihood × impact, once as assessed and once more after controls (their residual
// likelihood and impact) when any threat has one. Each cell is shaded by the risk its rating gives.

const TM_LIKELIHOOD_NAMES = ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'];
const TM_IMPACT_NAMES = ['Negligible', 'Minor', 'Moderate', 'Major', 'Severe'];

/**
 * One matrix as Markdown lines. place(t) gives a threat's [likelihood, impact], or null to leave it out;
 * link(t) gives how to name it.
 */
function tmRiskMatrix(threats, place, link) {
  const cell = new Map();
  for (const t of threats) {
    const at = place(t);
    if (!at) continue;
    const k = `${at[0]},${at[1]}`;
    cell.set(k, [...(cell.get(k) || []), link(t)]);
  }
  const head = ['Likelihood \\ Impact', ...TM_IMPACT_NAMES.map((n, i) => `${i + 1} ${n}`)];
  const rows = [];
  for (let l = 5; l >= 1; l--) {
    const row = [`${l} ${TM_LIKELIHOOD_NAMES[l - 1]}`];
    for (let i = 1; i <= 5; i++) {
      const ids = cell.get(`${l},${i}`) || [];
      row.push(`<span class="tm-cell tm-cell-${tmRiskFromRating(l * i)}">${ids.length ? ids.join(', ') : '&nbsp;'}</span>`);
    }
    rows.push(row);
  }
  return tmTable(head, rows);
}

/** The report's risk matrix section, or [] when no open threat has a likelihood and impact. */
function tmRiskMatrixSection(model, link) {
  const open = tmSortThreats(model.threats.filter((t) => t.status === 'open'));
  const rated = open.filter((t) => t.likelihood && t.impact);
  if (!rated.length) return [];
  const L = ['## Risk matrix', ''];
  L.push(`Open threats by likelihood and impact (1 to 5 each; their product gives the risk: 20 and over critical, 10 high, 5 medium, otherwise low).${rated.length < open.length ? ` ${tmCount(open.length - rated.length, 'open threat')} ${open.length - rated.length === 1 ? 'has' : 'have'} no likelihood and impact, so ${open.length - rated.length === 1 ? 'isn\u2019t' : 'aren\u2019t'} placed.` : ''}`, '');
  L.push('### As assessed', '', ...tmRiskMatrix(rated, (t) => [t.likelihood, t.impact], link));
  const residual = open.filter((t) => t.residualLikelihood && t.residualImpact);
  if (residual.length) {
    L.push('### After controls', '');
    L.push('Where a threat has a residual likelihood and impact: what is left once its controls are in place.', '');
    L.push(...tmRiskMatrix(residual, (t) => [t.residualLikelihood, t.residualImpact], link));
  }
  return L;
}
