// The Data flow view: a Mermaid flowchart grouped by zone (trust boundary). External entities are grey boxes,
// processes blue circles, stores red cylinders. Each flow is numbered as in the report, carries its data and
// STRIDE letters (boxed, in their colours) and threat IDs (as in the table under the diagram), and is coloured by its most serious open threat.
// Colours: in Obsidian they come from styles.css (node classes, and edge IDs that start with the risk, such as
// "tmcritical3"), so they follow the theme. With portable: true they are written into the diagram instead, for saved reports.

const TM_DFD_CLASSES = [
  'classDef tmExt fill:#989898,stroke:#CD3B48,stroke-width:2px,color:#fff',
  'classDef tmProc fill:#E2EAF9,stroke:#A9B8D6,color:#000',
  'classDef tmData fill:#CD3B48,stroke:#982C35,color:#fff',
  'classDef tmZone fill:none,stroke:#777,stroke-width:2px,stroke-dasharray:6 4',
];

function tmDataflow(model, opts = {}) {
  const portable = !!opts.portable;
  const compact = !!opts.compact; // labels shortened to the flow number and its threat marks
  const ids = tmMmIds(model);
  const used = new Set(model.flows.flatMap((f) => [f.from, f.to]));
  const nodes = model.elements.filter((e) => !e.children.length || used.has(e.id));
  const classes = portable ? TM_DFD_CLASSES : ['tmExt', 'tmProc', 'tmData'].map((c) => `classDef ${c} stroke-width:1px`);
  const lines = ['flowchart TB', ...classes.map((c) => `  ${c}`), ...tmIconClassDefs(nodes, opts)];
  // an untrusted zone gets a warning shield by its title (icon-draw.js), unless default icons are off
  const marks = opts.defaultIcons !== false;
  const untrusted = (z) => marks && /untrusted/i.test(z.trust || '');
  const zoneIcon = { name: TM_UNTRUSTED_ICON, fg: null, bg: null };
  if (model.zones.some(untrusted)) lines.push(...tmIconClassNames(zoneIcon).filter((c) => !lines.includes(`  classDef ${c} opacity:1`)).map((c) => `  classDef ${c} opacity:1`));
  const styles = [];

  const node = (e, pad) => {
    const id = ids.get(e.id);
    const icon = tmIconFor(e, opts);
    const t = `"${icon ? TM_ICON_LINE : ''}${tmMmText(e.title)}"`;
    if (e.role === 'external') lines.push(`${pad}${id}[${t}]`, `${pad}class ${id} tmExt`);
    else if (e.role === 'store') lines.push(`${pad}${id}[(${t})]`, `${pad}class ${id} tmData`);
    else lines.push(`${pad}${id}((${t}))`, `${pad}class ${id} tmProc`);
    lines.push(...tmIconClassLines(pad, id, icon));
  };
  const zone = (z, pad) => {
    const members = nodes.filter((e) => e.zone === z.id);
    const inner = model.zones.filter((c) => c.parent === z.id);
    const id = ids.get(`zone:${z.id}`);
    lines.push(`${pad}subgraph ${id} ["${tmMmText(z.title + (z.trust ? ` (${z.trust})` : ''))}${untrusted(z) ? TM_ZONE_ICON_ROOM : ''}"]`);
    for (const c of inner) zone(c, pad + '  ');
    for (const e of members) node(e, pad + '  ');
    lines.push(`${pad}end`);
    if (untrusted(z)) lines.push(...tmIconClassLines(pad, id, zoneIcon));
    // a class rather than "style": style on a subgraph drops its other classes, such as the zone's icon
    if (portable) lines.push(`${pad}class ${id} tmZone`);
  };
  for (const z of model.zones.filter((z) => !z.parent)) zone(z, '  ');
  for (const e of nodes.filter((e) => !e.zone)) node(e, '  ');
  if (!nodes.length) lines.push('  empty["Nothing to show yet: add elements and flows"]');

  model.flows.forEach((f, i) => {
    const parts = compact
      ? [`(${f.n})`]
      : [`(${f.n}) ${tmMmText(tmClip(f.label, 60))}`.trim()];
    const datum = (d) => (marks && tmIsSensitive(d.tags) ? `${TM_SENSITIVE_MARK} ` : '') + d.text;
    if (f.data.length && !compact) parts.push(tmMmText(tmClip(f.data.map(datum).join(', '), 80)));
    const badge = tmThreatMarks(f.threats);
    if (badge) parts.push(badge);
    const risk = tmWorstRisk(f.threats);
    const edgeId = risk && !portable ? ` tm${risk}${f.n}@` : ' ';
    const arrow = f.encrypted === false ? '-.->' : '-->'; // dashed: not encrypted (rules.js)
    lines.push(`  ${ids.get(f.from)}${edgeId}${arrow}|"${parts.join('<br/>')}"| ${ids.get(f.to)}`);
    if (risk && portable) styles.push(`  linkStyle ${i} stroke:${TM_RISK_COLOURS[risk].line},stroke-width:2px,color:${TM_RISK_COLOURS[risk].line}`);
  });
  return [...lines, ...styles].join('\n');
}
