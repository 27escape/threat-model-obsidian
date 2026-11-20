// The Structure view: a Mermaid flowchart in C4 style, at one of three levels.
//   context    people, systems and external systems (what sits at the top level)
//   container  plus what is inside each system
//   component  everything
// A flow between hidden elements is drawn between their nearest visible parents; flows inside one box are left out.
// The threat overlay (opts.overlay, on unless false) puts boxed STRIDE letters and threat IDs on boxes and arrows (the IDs
// match the table under the diagram) and colours them by their most serious open threat. Threats on hidden elements, and on flows inside one box, show on the visible box holding
// them, so nothing drops out of sight at the Context level. opts.compact drops descriptions and keeps one short label per arrow.
// Colours: in Obsidian they come from styles.css, through the class on each node, so they follow the theme
// (Obsidian 1.15 draws Mermaid with Pele, where colours written in the diagram are fixed). With portable: true the
// colours are written into the diagram instead: for saved reports, which styles.css doesn't reach.

const TM_C4_CLASSES = [
  'classDef tmPerson fill:#08427b,stroke:#073b6f,color:#fff',
  'classDef tmSystem fill:#1168bd,stroke:#0b4884,color:#fff',
  'classDef tmContainer fill:#438dd5,stroke:#3c7fc0,color:#fff',
  'classDef tmComponent fill:#85bbf0,stroke:#78a8d8,color:#000',
  'classDef tmExternal fill:#999999,stroke:#8a8a8a,color:#fff',
  'classDef tmStore fill:#438dd5,stroke:#3c7fc0,color:#fff',
];

/** "[Container: React]" and so on. */
function tmC4Kind(e) {
  const tech = e.technology ? `: ${e.technology}` : '';
  switch (e.kind) {
    case 'person':
      return '[Person]';
    case 'external':
      return `[External system${tech}]`;
    case 'system':
      return '[Software system]';
    case 'component':
      return `[Component${tech}]`;
    case 'store':
      return `[Database${tech}]`;
    case 'queue':
      return `[Queue${tech}]`;
    default:
      return `[Container${tech}]`;
  }
}

const tmC4Class = (e) =>
  ({ person: 'tmPerson', external: 'tmExternal', system: 'tmSystem', component: 'tmComponent', store: 'tmStore', queue: 'tmStore' })[e.kind] || 'tmContainer';

const TM_C4_CLASS_NAMES = ['tmPerson', 'tmSystem', 'tmContainer', 'tmComponent', 'tmExternal', 'tmStore'];
// a box's outline when the overlay is on: tmRiskCritical and so on (colours in styles.css; written in when portable)
const tmRiskClass = (risk) => `tmRisk${tmCap(risk)}`;
const TM_RISK_CLASSES = TM_RISKS.map((r) => `classDef ${tmRiskClass(r)} stroke:${TM_RISK_COLOURS[r].line},stroke-width:3px`);

/** Threats in first-written order, each once. */
function tmUniqueThreats(list) {
  return [...new Set(list)];
}

/**
 * The levels that show something different for this model: Context always; Container only when something is
 * nested one deep (inside a system); Component only when something is nested two deep (inside a container).
 */
function tmLevels(model) {
  const byId = new Map(model.elements.map((e) => [e.id, e]));
  let deepest = 0;
  for (const e of model.elements) {
    let d = 0;
    for (let p = e.parent; p && byId.has(p) && d < 50; p = byId.get(p).parent) d++;
    deepest = Math.max(deepest, d);
  }
  return TM_LEVELS.slice(0, Math.min(deepest, 2) + 1);
}

/** The level to draw: the one asked for, or the deepest this model has when it has nothing that deep. */
function tmLevelFor(model, wanted) {
  const levels = tmLevels(model);
  return levels.includes(wanted) ? wanted : levels[levels.length - 1];
}

function tmStructure(model, level, opts = {}) {
  const portable = !!opts.portable;
  const overlay = opts.overlay !== false;
  const compact = !!opts.compact;
  const lvl = TM_LEVELS.includes(level) ? level : 'container';
  const ids = tmMmIds(model);
  const byId = new Map(model.elements.map((e) => [e.id, e]));
  const depth = (e) => {
    let d = 0;
    for (let p = e.parent; p && byId.has(p) && d < 50; p = byId.get(p).parent) d++;
    return d;
  };
  const visible = (e) => lvl === 'component' || depth(e) <= (lvl === 'container' ? 1 : 0);
  const shownChildren = (e) => e.children.map((c) => byId.get(c)).filter((c) => c && visible(c));
  const visibleOf = (id) => {
    let e = byId.get(id);
    while (e && !visible(e)) e = byId.get(e.parent);
    return e;
  };

  // threats each visible box shows: its own, those of hidden elements inside it, and those of flows hidden inside it
  const boxThreats = new Map();
  const addTo = (e, threats) => {
    if (!e || !threats.length) return;
    boxThreats.set(e.id, tmUniqueThreats([...(boxThreats.get(e.id) || []), ...threats]));
  };
  for (const e of model.elements) addTo(visibleOf(e.id), e.threats);
  for (const f of model.flows) {
    const a = visibleOf(f.from);
    if (a && a === visibleOf(f.to)) addTo(a, f.threats);
  }
  const badgeOf = (threats) => (overlay ? tmThreatMarks(threats) : '');

  const classes = portable ? TM_C4_CLASSES : TM_C4_CLASS_NAMES.map((c) => `classDef ${c} stroke-width:1px`);
  const riskClasses = portable ? TM_RISK_CLASSES : TM_RISKS.map((r) => `classDef ${tmRiskClass(r)} stroke-width:1px`);
  const lines = ['flowchart TB', ...[...classes, ...(overlay ? riskClasses : [])].map((c) => `  ${c}`), ...tmIconClassDefs(model.elements, opts)];
  const styles = [];
  const emit = (e, pad) => {
    const id = ids.get(e.id);
    const kids = shownChildren(e);
    const threats = boxThreats.get(e.id) || [];
    const badge = badgeOf(threats);
    if (kids.length) {
      lines.push(`${pad}subgraph ${id} ["${tmMmText(e.title)} ${tmMmText(tmC4Kind(e))}${badge ? ` ${badge}` : ''}"]`);
      for (const k of kids) emit(k, pad + '  ');
      lines.push(`${pad}end`);
      if (portable) styles.push(`  style ${id} fill:none,stroke:#888,stroke-dasharray:6 4`);
      return;
    }
    const icon = tmIconFor(e, opts);
    let label = `${icon ? TM_ICON_LINE : ''}<b>${tmMmText(e.title)}</b><br/>${tmMmText(tmC4Kind(e))}`;
    if (e.description && !compact) label += `<br/><i>${tmMmText(tmClip(e.description, 90))}</i>`;
    if (badge) label += `<br/>${badge}`;
    const shape = e.kind === 'person' ? ['(', ')'] : e.kind === 'store' ? ['[(', ')]'] : e.kind === 'queue' ? ['[[', ']]'] : ['[', ']'];
    lines.push(`${pad}${id}${shape[0]}"${label}"${shape[1]}`);
    lines.push(`${pad}class ${id} ${tmC4Class(e)}`);
    lines.push(...tmIconClassLines(pad, id, icon));
    const risk = overlay ? tmWorstRisk(threats) : '';
    if (risk) lines.push(`${pad}class ${id} ${tmRiskClass(risk)}`);
  };
  const roots = model.elements.filter((e) => !e.parent || !byId.has(e.parent));
  for (const e of roots) emit(e, '  ');
  if (!roots.length) lines.push('  empty["Nothing to show yet: add a person, system or container"]');

  // flows between the visible elements, one arrow per pair, labels gathered
  const pairs = new Map();
  for (const f of model.flows) {
    const a = visibleOf(f.from);
    const b = visibleOf(f.to);
    if (!a || !b || a === b) continue;
    const key = `${a.id}\u0000${b.id}`;
    if (!pairs.has(key)) pairs.set(key, { a, b, labels: [], threats: [], plain: false });
    const text = f.label + (f.protocol ? ` [${f.protocol}]` : '');
    const p = pairs.get(key);
    if (text && !p.labels.includes(text)) p.labels.push(text);
    p.threats = tmUniqueThreats([...p.threats, ...f.threats]);
    if (f.encrypted === false) p.plain = true; // dashed: something on this arrow isn't encrypted
  }
  let edge = 0;
  for (const { a, b, labels, threats, plain } of pairs.values()) {
    let text;
    if (compact) text = tmMmText(tmClip(labels[0] || '', 24));
    else {
      text = labels.slice(0, 2).map((l) => tmMmText(tmClip(l, 60))).join('<br/>');
      if (labels.length > 2) text += `<br/>+${labels.length - 2} more`;
    }
    const badge = badgeOf(threats);
    if (badge) text += `${text ? '<br/>' : ''}${badge}`;
    const risk = overlay ? tmWorstRisk(threats) : '';
    const edgeId = risk && !portable ? ` tm${risk}s${edge + 1}@` : ' ';
    const arrow = plain ? '-.->' : '-->';
    lines.push(text ? `  ${ids.get(a.id)}${edgeId}${arrow}|"${text}"| ${ids.get(b.id)}` : `  ${ids.get(a.id)}${edgeId}${arrow} ${ids.get(b.id)}`);
    if (risk && portable) styles.push(`  linkStyle ${edge} stroke:${TM_RISK_COLOURS[risk].line},stroke-width:2px,color:${TM_RISK_COLOURS[risk].line}`);
    edge++;
  }
  return [...lines, ...styles].join('\n');
}
