// The report: the model as Markdown. Summary, threat register (each threat written out once; elsewhere threats are
// named by ID, linked to their entry in the register), diagrams (saved reports), flows that cross a zone boundary (and the sensitive data they carry),
// STRIDE categories not yet considered, elements, flows and warnings. Hashtags stay in the text.

// STRIDE per element: the categories that usually apply to each part of a data-flow diagram
const TM_STRIDE_PER = { external: ['S', 'R'], process: ['S', 'T', 'R', 'I', 'D', 'E'], store: ['T', 'I', 'D'], flow: ['T', 'I', 'D'] };
const TM_STATUS_ORDER = { open: 0, accepted: 1, transferred: 2, mitigated: 3 };

/** Text safe in a Markdown table cell. */
const tmCell = (s) => String(s == null ? '' : s).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim() || '—';

function tmTable(head, rows) {
  if (!rows.length) return [];
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(tmCell).join(' | ')} |`), ''];
}

/** Threats in register order: open first, then by risk, then by score (a threat without a score goes last in its risk). */
function tmSortThreats(threats) {
  return threats.slice().sort((a, b) => {
    const s = (TM_STATUS_ORDER[a.status] ?? 9) - (TM_STATUS_ORDER[b.status] ?? 9);
    if (s) return s;
    const r = tmRiskRank(a.risk) - tmRiskRank(b.risk);
    if (r) return r;
    return tmRatingWeight(b) - tmRatingWeight(a);
  });
}

/**
 * A block ID for each threat, so the rest of a report can link to its entry in the register: Obsidian links to a
 * list item by "^id" (letters, digits and dashes), and a hover over the link shows that one threat.
 */
function tmThreatAnchors(threats) {
  const anchors = new Map();
  const used = new Set();
  threats.forEach((t, i) => {
    let a = (t.id || `threat-${i + 1}`).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || `threat-${i + 1}`;
    while (used.has(a)) a += '-x';
    used.add(a);
    anchors.set(tmThreatKey(t), a);
  });
  return anchors;
}

/** "1 flow", "3 flows". */
const tmCount = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Block IDs for the controls in a report ("^c01"), never one a threat already has. */
function tmControlAnchors(controls, used) {
  const anchors = new Map();
  for (const c of controls) {
    let a = c.id.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'control';
    while (used.has(a)) a += '-x';
    used.add(a);
    anchors.set(c.id, a);
  }
  return anchors;
}

/** What identifies a threat when copies of it are compared: where it is written, its ID and its title. */
const tmThreatKey = (t) => `${t.line}\u0000${t.id || ''}\u0000${t.title}`;

/** "T01, T02" as links to the register (a threat without an ID is named by its title). */
const tmThreatIds = (threats, anchors) =>
  threats
    .map((t) => {
      const label = t.id || `"${t.title}"`;
      return anchors && anchors.has(tmThreatKey(t)) ? `[[#^${anchors.get(tmThreatKey(t))}|${label.replace(/[|\]\[]/g, '')}]]` : label;
    })
    .join(', ');

/** One threat in the register: a list item ending in its block ID, with where it applies and its mitigation under it. */
/** A threat's entry in the register; brief (for a closed threat) leaves out where it applies and its CVSS details. */
function tmRegisterItem(t, anchor, controls = [], brief = false) {
  const head = [`**${t.id || '—'}**`];
  if (t.stride.length) head.push(tmStrideChipsHtml(t));
  const risk = t.risk ? tmCap(t.risk) + (t.residual && t.residual !== t.risk ? ` → ${tmCap(t.residual)} after controls` : '') : '';
  const facts = [risk, tmRatingText(t), tmCap(t.status)].filter(Boolean).join(' · ');
  const lines = [`- ${head.join(' ')} ${facts} — ${t.title} ^${anchor}`];
  if (!brief) lines.push(`    - Applies to: ${t.where}`);
  if (t.method === 'cvss' && !brief) {
    const link = tmCvssLink(t.cvss);
    lines.push(`    - CVSS: ${tmCvssMeaning(t.score)}`);
    if (tmCvssExplain(t.cvss)) lines.push(`    - How it is attacked and what it does: ${tmCvssExplain(t.cvss)}`);
    lines.push(`    - Vector: \`${t.cvss}\`${link ? ` ([see it in FIRST\u2019s CVSS calculator](${link}))` : ''}`);
  }
  if (t.mitigation) lines.push(`    - Mitigation: ${t.mitigation}`);
  if (controls.length) lines.push(`    - Controls: ${controls.join('; ')}`);
  if (t.owner) lines.push(`    - Owner: ${t.owner}`);
  if (t.description && !brief) lines.push(`    - ${t.description.replace(/\s*\n\s*/g, ' ')}`);
  return lines;
}

/** Parts of the model whose threats leave STRIDE categories out: stores, external entities, flows that cross a zone
 *  boundary, and processes that receive one. [{ what, kind, missing }] */
function tmCoverageGaps(model) {
  const out = [];
  const byId = new Map(model.elements.map((e) => [e.id, e]));
  const crossingInto = new Set(model.flows.filter((f) => f.crosses).map((f) => f.to));
  const missing = (threats, wanted) => {
    const have = new Set(threats.flatMap((t) => t.stride));
    return wanted.filter((l) => !have.has(l));
  };
  const used = new Set(model.flows.flatMap((f) => [f.from, f.to]));
  for (const e of model.elements) {
    if (e.children.length && !used.has(e.id)) continue; // a box around other elements
    if (e.role === 'process' && !crossingInto.has(e.id)) continue;
    const m = missing(e.threats, TM_STRIDE_PER[e.role]);
    if (m.length) out.push({ what: e.title, kind: e.role === 'external' ? 'external entity' : e.role === 'store' ? 'data store' : 'process', missing: m });
  }
  for (const f of model.flows.filter((x) => x.crosses)) {
    const m = missing(f.threats, TM_STRIDE_PER.flow);
    const a = byId.get(f.from);
    const b = byId.get(f.to);
    if (m.length) out.push({ what: `(${f.n}) ${a ? a.title : f.from} → ${b ? b.title : f.to}`, kind: 'flow across a boundary', missing: m });
  }
  return out;
}

function tmReport(model, warnings = [], opts = {}) {
  const L = [];
  const el = new Map(model.elements.map((e) => [e.id, e]));
  const name = (id) => (el.get(id) ? el.get(id).title : id);
  const zoneName = (id) => (id ? (model.zones.find((z) => z.id === id) || {}).title || id : 'no zone');
  if (model.description) L.push(model.description, '');

  // every threat is written out once, in the register; the rest of the report links to it by ID
  const register = tmSortThreats(model.threats);
  const anchors = tmThreatAnchors(register);

  // the summary for readers in a hurry, then the numbers
  const link = (t) => tmThreatIds([t], anchors);
  if (opts.properties) L.unshift(...tmReportProperties(model, { date: opts.date, source: opts.source }), '');
  L.push(...tmExecutiveSummary(model, link, { date: opts.date }));
  const open = model.threats.filter((t) => t.status === 'open');
  const crossing = model.flows.filter((f) => f.crosses);
  const sensitive = crossing.filter((f) => f.sensitive);
  L.push('**In numbers**', '');
  L.push(`- ${tmCount(model.elements.length, 'element')} in ${tmCount(model.zones.length, 'zone')}, with ${tmCount(model.flows.length, 'flow')} (${crossing.length} ${crossing.length === 1 ? 'crosses' : 'cross'} a zone boundary)`);
  L.push(`- ${tmCount(model.threats.length, 'threat')}, ${open.length} open`);
  if (sensitive.length) L.push(`- ${tmCount(sensitive.length, 'flow')} ${sensitive.length === 1 ? 'carries' : 'carry'} sensitive data across a zone boundary`);
  if (model.controls.length) {
    const byStatus = TM_CONTROL_STATUSES.map((s) => [s, model.controls.filter((c) => c.status === s).length]).filter(([, n]) => n);
    const working = open.filter((t) => t.controlled === 'implemented' || t.controlled === 'verified').length;
    L.push(`- ${tmCount(model.controls.length, 'control')}: ${byStatus.map(([s, n]) => `${n} ${s}`).join(', ')}; ${working} of ${tmCount(open.length, 'open threat')} ${working === 1 ? 'has' : 'have'} one in place`);
  }
  L.push('');
  L.push(...tmScopeSection(model));

  // threat register: every threat, written out once; the rest of the report refers to threats by ID
  L.push('## Threat register', '');
  const cAnchors = tmControlAnchors(model.controls, new Set(anchors.values()));
  const controlLink = (id) => (cAnchors.has(id) ? `[[#^${cAnchors.get(id)}|${id}]]` : id);
  const threatLink = new Map(register.filter((t) => t.id).map((t) => [t.id, tmThreatIds([t], anchors)]));
  if (!register.length) L.push('No threats recorded yet.', '');
  const item = (t, brief) => {
    const cs = t.controls.map((id) => model.controls.find((c) => c.id === id)).filter(Boolean);
    return tmRegisterItem(t, anchors.get(tmThreatKey(t)), cs.map((c) => `${controlLink(c.id)} ${c.title} (${c.status})`), brief);
  };
  // open threats in full; closed ones (mitigated, accepted, transferred) briefly, with how they were closed
  const openOnes = register.filter((t) => t.status === 'open');
  const closedOnes = register.filter((t) => t.status !== 'open');
  if (openOnes.length) L.push('### Open', '', ...openOnes.flatMap((t) => item(t, false)), '');
  if (closedOnes.length) L.push('### Closed', '', 'Mitigated, accepted or transferred: how each was dealt with.', '', ...closedOnes.flatMap((t) => item(t, true)), '');

  // controls, each once, linked to the threats they cover
  if (model.controls.length) {
    L.push('## Controls', '');
    const order = (c) => TM_CONTROL_STATUSES.indexOf(c.status);
    for (const c of [...model.controls].sort((a, b) => order(a) - order(b))) {
      L.push(`- **${c.id}** ${tmCap(c.status)} — ${c.title} ^${cAnchors.get(c.id)}`);
      L.push(`    - Covers: ${c.covers.map((id) => threatLink.get(id) || id).join(', ') || 'nothing yet'}`);
      if (c.owner || c.due) L.push(`    - ${[c.owner && `Owner: ${c.owner}`, c.due && `Due: ${c.due}`].filter(Boolean).join(' · ')}`);
      if (c.description) L.push(`    - ${c.description.replace(/\s*\n\s*/g, ' ')}`);
    }
    L.push('');
  }

  L.push(...tmActionPlan(model, link, controlLink, { date: opts.date }));
  L.push(...tmFindingsSection(model));
  L.push(...tmRiskMatrixSection(model, link));
  if (L[L.length - 1] !== '') L.push('');

  // diagrams, for a saved report: opts.diagrams = [{ title, mermaid, threats }]. Under one that shows only some of
  // the threats, their IDs; one that shows them all needs nothing (the register is above)
  if (opts.diagrams && opts.diagrams.length) {
    L.push('## Diagrams', '');
    for (const d of opts.diagrams) {
      L.push(`### ${d.title}`, '', '```mermaid', d.mermaid, '```', '');
      const shown = d.threats || [];
      if (model.threats.length && shown.length < model.threats.length) {
        L.push(shown.length ? `Threats shown: ${tmThreatIds(shown, anchors)}.` : 'No threats are shown in this diagram.', '');
      }
    }
  }

  // boundaries
  L.push('## Flows across zone boundaries', '');
  if (!crossing.length) L.push('No flow crosses from one zone to another.', '');
  L.push(
    ...tmTable(
      ['#', 'From', 'To', 'Flow', 'Protocol', 'Sensitive data'],
      crossing.map((f) => [
        f.n,
        `${name(f.from)} (${zoneName(el.get(f.from) && el.get(f.from).zone)})`,
        `${name(f.to)} (${zoneName(el.get(f.to) && el.get(f.to).zone)})`,
        f.label,
        f.protocol || 'not stated',
        f.data.filter((d) => tmIsSensitive(d.tags)).map((d) => d.text).join(', '),
      ])
    )
  );

  // STRIDE gaps
  const gaps = tmCoverageGaps(model);
  L.push('## STRIDE categories not yet considered', '');
  if (!gaps.length) L.push('Every data store, external entity and boundary-crossing flow has threats for its usual STRIDE categories.', '');
  else {
    L.push('The usual STRIDE categories for each part of a data-flow diagram that no recorded threat covers yet:');
    L.push(`${TM_STRIDE_ORDER.map((l) => `${tmChipHtml(l)} ${TM_STRIDE_NAMES[l].toLowerCase()}`).join(', ')}.`, '');
  }
  L.push(...tmTable(['Part', 'Kind', 'Not yet considered'], gaps.map((g) => [g.what, g.kind, g.missing.map(tmChipHtml).join(' ')])));

  // elements
  L.push('## Elements', '');
  L.push(
    ...tmTable(
      ['ID', 'Name', 'Kind', 'Part of', 'Zone', 'Technology', 'Link', 'Other'],
      model.elements.map((e) => [
        e.id,
        e.title,
        e.kind,
        e.parent ? name(e.parent) : '',
        e.zone ? zoneName(e.zone) : '',
        e.technology,
        e.link,
        Object.entries(e.extra)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; '),
      ])
    )
  );

  // flows
  L.push('## Flows', '');
  if (!model.flows.length) L.push('No flows yet.', '');
  for (const f of model.flows) {
    L.push(`### ${f.n}. ${name(f.from)} → ${name(f.to)}${f.label ? `: ${f.label}` : ''}`, '');
    if (f.protocol) L.push(`- **Protocol:** ${f.protocol}`);
    if (f.data.length) L.push(`- **Data:** ${f.data.map((d) => d.text).join(', ')}`);
    if (f.threats.length) L.push(`- **Threats:** ${tmThreatIds(tmSortThreats(f.threats), anchors)}`);
    if (f.description) L.push('', f.description);
    L.push('');
  }

  if (warnings.length) {
    L.push('## Warnings', '');
    for (const w of warnings) L.push(`- Line ${w.line}: ${w.message}`);
    L.push('');
  }
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
