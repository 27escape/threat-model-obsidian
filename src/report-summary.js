// The parts of a saved report meant for people who won't read all of it: the note's properties (so Obsidian's
// Bases or Dataview can list and count reports), the summary at the top (the headline numbers, the top risks, and
// what needs doing), the scope and method, and the action plan (planned controls and undecided threats, by owner).
// Pure functions of the model: report.js puts them in place.

const TM_DOC_STATUSES = ['draft', 'in-review', 'approved'];

/** The risk an open threat has now: after its controls when that is known, otherwise as assessed. */
const tmRiskNow = (t) => t.residual || t.risk;

/** The open threats, most serious now first (then by rating and score). */
function tmTopRisks(model) {
  return model.threats
    .filter((t) => t.status === 'open')
    .sort((a, b) => tmRiskRank(tmRiskNow(a)) - tmRiskRank(tmRiskNow(b)) || (b.residualRating ?? b.rating ?? -1) - (a.residualRating ?? a.rating ?? -1) || tmRatingWeight(b) - tmRatingWeight(a));
}

/** Planned controls whose due date (YYYY-MM-DD) is before the report's date. */
const tmOverdue = (model, date) => model.controls.filter((c) => c.status === 'planned' && /^\d{4}-\d{2}-\d{2}$/.test(c.due) && date && c.due < date);

/** Open threats with no control and no mitigation. */
const tmUnaddressed = (model) => model.threats.filter((t) => t.status === 'open' && !t.controls.length && !t.mitigation);

/** The note's properties, as YAML front matter. opts: { date, source } (source: the model's note, as a path). */
function tmReportProperties(model, opts = {}) {
  const m = model.meta || {};
  const open = model.threats.filter((t) => t.status === 'open');
  const q = (v) => JSON.stringify(String(v)); // a JSON string is a valid YAML string
  const P = ['---', 'tags:', '  - threat-report', `model: ${q(model.title || 'Threat model')}`];
  if (opts.source) P.push(`source: ${q(`[[${opts.source.replace(/\.md$/, '')}]]`)}`);
  if (opts.date) P.push(`date: ${opts.date}`);
  if (m.version) P.push(`version: ${q(m.version)}`);
  if (m.author) P.push(`author: ${q(m.author)}`);
  if (m.owner) P.push(`owner: ${q(m.owner)}`);
  P.push(`status: ${m.status || 'draft'}`);
  if (m.reviewDate) P.push(`review_date: ${/^\d{4}-\d{2}-\d{2}$/.test(m.reviewDate) ? m.reviewDate : q(m.reviewDate)}`);
  P.push(`threats: ${model.threats.length}`, `open_threats: ${open.length}`);
  for (const r of TM_RISKS) P.push(`open_${r}: ${open.filter((t) => tmRiskNow(t) === r).length}`);
  const top = tmTopRisks(model)[0];
  P.push(`highest_risk: ${top ? tmRiskNow(top) || 'unrated' : 'none'}`);
  P.push(`controls: ${model.controls.length}`);
  for (const s of TM_CONTROL_STATUSES) P.push(`controls_${s}: ${model.controls.filter((c) => c.status === s).length}`);
  P.push(`unaddressed: ${tmUnaddressed(model).length}`, `overdue_controls: ${tmOverdue(model, opts.date).length}`, `findings: ${(model.findings || []).length}`, '---');
  return P;
}

/**
 * The summary at the top: one headline line, the top three risks, what needs doing, then the numbers.
 * link(t): a threat's ID as a link; opts.date: the report's date, for overdue controls.
 */
function tmExecutiveSummary(model, link, opts = {}) {
  const L = ['## Summary', ''];
  const open = model.threats.filter((t) => t.status === 'open');
  const counts = (pick) => TM_RISKS.map((r) => [r, open.filter((t) => pick(t) === r).length]).filter(([, n]) => n).map(([r, n]) => `${n} ${r}`);
  if (!model.threats.length) L.push('No threats are recorded yet.', '');
  else {
    let head = `**${tmCount(open.length, 'open threat')}**${counts((t) => t.risk).length ? ` (${counts((t) => t.risk).join(', ')})` : ''}`;
    if (open.some((t) => t.residual)) head += `; once their controls are in place: ${counts(tmRiskNow).join(', ')}`;
    L.push(`${head}.`, '');
  }
  const top = tmTopRisks(model).slice(0, 3);
  if (top.length) {
    L.push('**Top risks**', '');
    top.forEach((t, i) => {
      const now = tmRiskNow(t);
      const was = t.residual && t.residual !== t.risk ? `, ${tmCap(t.risk)} before controls` : '';
      L.push(`${i + 1}. ${link(t)} ${now ? tmCap(now) : 'Unrated'}${was} — ${t.title}`);
    });
    L.push('');
  }
  const todo = [];
  const bare = tmSortThreats(tmUnaddressed(model));
  if (bare.length) todo.push(`${tmCount(bare.length, 'open threat')} ${bare.length === 1 ? 'has' : 'have'} no control or mitigation: ${bare.map(link).join(', ')}`);
  const planned = model.controls.filter((c) => c.status === 'planned');
  if (planned.length) todo.push(`${tmCount(planned.length, 'planned control')} to put in place`);
  const late = tmOverdue(model, opts.date);
  if (late.length) todo.push(`${late.length} of them overdue: ${late.map((c) => c.id).join(', ')}`);
  const found = model.findings || [];
  if (found.length) todo.push(`${tmCount(found.length, 'finding')} from the model to look at (see *Findings from the model*)`);
  const unverified = model.controls.filter((c) => c.status === 'implemented');
  if (unverified.length) todo.push(`${tmCount(unverified.length, 'implemented control')} still to verify`);
  if (todo.length) L.push('**Needs action**', '', ...todo.map((x) => `- ${x}`), '');
  return L;
}

/** Scope and method: what was modelled, what wasn't, what is assumed, and how threats were found and rated. */
function tmScopeSection(model) {
  const m = model.meta || {};
  const L = ['## Scope and method', ''];
  if (m.scope) L.push(m.scope, '');
  if (m.outOfScope && m.outOfScope.length) L.push('**Out of scope**', '', ...m.outOfScope.map((x) => `- ${x}`), '');
  if (m.assumptions && m.assumptions.length) L.push('**Assumptions**', '', ...m.assumptions.map((x) => `- ${x}`), '');
  const how = ['Threats were identified with STRIDE (spoofing, tampering, repudiation, information disclosure, denial of service, elevation of privilege), considered for each element and flow.'];
  const used = new Set(model.threats.map((t) => t.method));
  const ways = [used.has('rating') && 'likelihood × impact (each from 1 to 5)', used.has('tag') && 'a risk level given directly', used.has('cvss') && 'a CVSS 3.x vector, for known vulnerabilities', used.has('score') && 'a score'].filter(Boolean);
  if (ways.length) how.push(`Risks are rated by ${ways.length > 1 ? `${ways.slice(0, -1).join(', ')} or ${ways[ways.length - 1]}` : ways[0]}.`);
  if (model.zones.length) how.push(`Trust boundaries: ${model.zones.map((z) => z.title + (z.trust ? ` (${z.trust})` : '')).join(', ')}.`);
  L.push(how.join(' '), '');
  return L;
}

/** Findings from the model's own facts (rules.js): each with its risk. Empty when there are none. */
function tmFindingsSection(model) {
  const found = model.findings || [];
  if (!found.length) return [];
  return [
    '## Findings from the model',
    '',
    'What the model\u2019s own facts (sensitive data, zones, encryption and authentication) suggest, whether or not a threat has been written for it. Each is a prompt to add a threat or a control.',
    '',
    ...found.map((f) => `- **${tmCap(f.risk)}** — ${f.message}`),
    '',
  ];
}

/** The action plan: planned controls and threats with nothing in place, grouped by owner. Empty when nothing is due. */
function tmActionPlan(model, link, controlLink, opts = {}) {
  const groups = new Map();
  const add = (owner, line) => groups.set(owner || 'No owner yet', [...(groups.get(owner || 'No owner yet') || []), line]);
  const byId = new Map(model.threats.filter((t) => t.id).map((t) => [t.id, t]));
  for (const c of model.controls.filter((x) => x.status !== 'verified')) {
    const covers = c.covers.map((id) => link(byId.get(id))).join(', ');
    const owner = c.owner || (byId.get(c.covers[0]) || {}).owner;
    const late = tmOverdue(model, opts.date).includes(c) ? ' **overdue**' : '';
    const what = c.status === 'planned' ? 'Put in place' : 'Verify';
    add(owner, `${what} ${controlLink(c.id)} ${c.title}${c.due ? ` (due ${c.due})${late}` : ''}, for ${covers || 'no threat yet'}`);
  }
  for (const t of tmSortThreats(tmUnaddressed(model))) add(t.owner, `Decide what to do about ${link(t)}${t.risk ? ` (${t.risk})` : ''}`);
  if (!groups.size) return [];
  const L = ['## Action plan', ''];
  const owners = [...groups.keys()].sort((a, b) => (a === 'No owner yet') - (b === 'No owner yet') || a.localeCompare(b));
  for (const o of owners) L.push(`### ${o}`, '', ...groups.get(o).map((x) => `- ${x}`), '');
  return L;
}
