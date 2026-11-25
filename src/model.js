// The raw model (parse.js) → the model the views draw: names resolved, zones worked out, threats scored,
// scenario steps matched to flows. Errors stop the drawing; warnings are shown under it. Both have line numbers.

const TM_VIEWS = ['structure', 'sequence', 'dataflow'];
const TM_LEVELS = ['context', 'container', 'component'];
const TM_ELEMENT_KEYS = ['title', 'description', 'technology', 'zone', 'link', ...TM_ICON_KEYS];

/** Any value as text: lists joined with ", ", tags with their "#". */
function tmValText(v) {
  if (!v) return '';
  if (v.type === 'list') return v.value.map(tmValText).join(', ');
  if (v.type === 'tag') return `#${v.value}`;
  return String(v.value);
}

/** A value as a list of strings (a single value is a list of one). */
const tmValList = (v) => (!v ? [] : v.type === 'list' ? v.value.map(tmValText) : [tmValText(v)]);

const tmRole = (kind) => (kind === 'person' || kind === 'external' ? 'external' : kind === 'store' || kind === 'queue' ? 'store' : 'process');

/** Source text → { model, errors, warnings }. model is null when the text can't be parsed. */
function tmBuildModel(src) {
  const errors = [];
  const warnings = [];
  const err = (line, message) => errors.push({ line, message });
  const warn = (line, message) => warnings.push({ line, message });
  let raw;
  try {
    raw = tmParse(src);
  } catch (e) {
    if (!(e instanceof TmError)) throw e;
    return { model: null, errors: [{ line: e.line, message: e.message }], warnings };
  }

  // ---- IDs: elements, zones and scenarios share one set; threats have their own
  const byId = new Map();
  const claim = (thing, what) => {
    const had = byId.get(thing.id);
    if (had) err(thing.line, `"${thing.id}" is used twice (first on line ${had.line})`);
    else byId.set(thing.id, { ...thing, what });
  };
  raw.elements.forEach((e) => claim(e, 'element'));
  raw.zones.forEach((z) => claim(z, 'zone'));
  raw.scenarios.forEach((s) => claim(s, 'scenario'));
  const isElement = (id) => byId.has(id) && byId.get(id).what === 'element';
  const isZone = (id) => byId.has(id) && byId.get(id).what === 'zone';
  const nameProblem = (id, wanted) => {
    if (!byId.has(id)) return `"${id}" isn't defined`;
    return `"${id}" is a ${byId.get(id).what}, not ${wanted}`;
  };

  // ---- zones
  const zones = raw.zones.map((z) => ({
    id: z.id,
    title: tmValText(z.attrs.title) || z.title || z.id,
    description: tmValText(z.attrs.description),
    trust: tmValText(z.attrs.trust),
    tags: [...z.tags, ...tmTagsIn(z.title), ...tmTagsIn(tmValText(z.attrs.description))],
    parent: z.parent,
    line: z.line,
  }));
  const zoneById = new Map(zones.map((z) => [z.id, z]));

  // ---- elements
  const elements = raw.elements.map((e) => {
    const extra = {};
    for (const [k, v] of Object.entries(e.attrs)) if (!TM_ELEMENT_KEYS.includes(k)) extra[k] = tmValText(v);
    const title = tmValText(e.attrs.title) || e.title || e.id;
    const description = tmValText(e.attrs.description);
    let zoneAttr = null;
    if (e.attrs.zone) {
      zoneAttr = tmValText(e.attrs.zone);
      if (!isZone(zoneAttr)) err(e.attrs.zone.line, `zone = ${zoneAttr}: ${nameProblem(zoneAttr, 'a zone')}`);
    }
    return {
      id: e.id,
      kind: e.kind,
      role: tmRole(e.kind),
      title,
      description,
      technology: tmValText(e.attrs.technology),
      link: tmValText(e.attrs.link),
      icon: tmIconOf(e, warn),
      tags: [...new Set([...e.tags, ...tmTagsIn(title), ...tmTagsIn(description)])],
      extra,
      parent: e.parent,
      children: [],
      zoneAttr: zoneAttr && isZone(zoneAttr) ? zoneAttr : null,
      zoneBlock: e.zoneBlock,
      zone: null,
      threats: [],
      line: e.line,
    };
  });
  const elById = new Map(elements.map((e) => [e.id, e]));
  for (const e of elements) if (e.parent && elById.has(e.parent)) elById.get(e.parent).children.push(e.id);
  const zoneOf = (e, seen = 0) => {
    if (e.zoneAttr) return e.zoneAttr;
    if (e.zoneBlock) return e.zoneBlock;
    if (e.parent && elById.has(e.parent) && seen < 50) return zoneOf(elById.get(e.parent), seen + 1);
    return null;
  };
  for (const e of elements) e.zone = zoneOf(e);

  // ---- flows
  const flows = raw.flows.map((f, i) => {
    for (const end of [f.from, f.to]) if (!isElement(end)) err(f.line, `flow ${f.from} -> ${f.to}: ${nameProblem(end, 'an element')}`);
    const label = f.label || tmValList(f.attrs.label || f.attrs.operation).join(' / ');
    const description = tmValText(f.attrs.description);
    const data = tmValList(f.attrs.data).map((text) => ({ text, tags: tmTagsIn(text) }));
    const a = elById.get(f.from);
    const b = elById.get(f.to);
    const protocol = tmValText(f.attrs.protocol || f.attrs.technology);
    return {
      n: i + 1,
      from: f.from,
      to: f.to,
      label,
      protocol,
      encrypted: tmFlowEncrypted(tmYesNo(f.attrs.encrypted, 'encrypted', warn), protocol),
      authenticated: tmYesNo(f.attrs.authenticated, 'authenticated', warn),
      description,
      data,
      tags: [...new Set([...f.tags, ...tmTagsIn(label), ...tmTagsIn(description)])],
      threats: [],
      // crossing a zone boundary: crossing.within is the zone both ends are inside (between us-west-1 and us-west-2,
      // inside AWS), or null when the flow goes out of or into a zone altogether
      ...tmFlowCrossing(a, b, zoneById),
      sensitive: data.some((d) => tmIsSensitive(d.tags)),
      line: f.line,
    };
  });
  const flowOfRaw = new Map(raw.flows.map((f, i) => [f, flows[i]]));

  // ---- threats
  const threatIds = new Map();
  const titleOf = (id) => (elById.get(id) ? elById.get(id).title : id);
  const threats = raw.threats.map((t) => {
    if (t.id) {
      if (threatIds.has(t.id)) err(t.line, `threat ${t.id} is used twice (first on line ${threatIds.get(t.id)})`);
      else threatIds.set(t.id, t.line);
    } else warn(t.line, `threat "${t.title}" has no ID: give it one (threat T01 "…") so it can be tracked`);
    const tags = [...new Set([...t.tags, ...tmTagsIn(t.title)])];
    const stride = tmStrideOf(tags);
    if (!stride.length) warn(t.line, `threat ${t.id || `"${t.title}"`} has no STRIDE category (#S #T #R #I #D #E)`);

    // how the threat is rated: one way, ideally (risk.js)
    const rating = tmThreatRating(t.attrs, warn);
    let cvss = '';
    let cvssScore = null;
    if (t.attrs.cvss) {
      cvss = tmValText(t.attrs.cvss);
      const c = tmCvss(cvss);
      if (c.error) warn(t.attrs.cvss.line, c.error);
      else cvssScore = c.score;
    }
    let oldScore = null; // "score = 7.5", from the .flow format: still read, but no longer one of the ways to rate
    if (t.attrs.score) {
      const s = Number(tmValText(t.attrs.score));
      if (isNaN(s) || s < 0 || s > 10) warn(t.attrs.score.line, `score ${tmValText(t.attrs.score)} should be a number from 0 to 10`);
      else {
        oldScore = s;
        warn(t.attrs.score.line, 'score is no longer used to rate threats: give likelihood and impact, or a risk tag such as #high (or a cvss vector for a known vulnerability)');
      }
    }
    const tagRisk = tmRiskOf(tags);
    const ways = [
      ['tag', 'a risk tag', tagRisk],
      ['rating', 'likelihood × impact', tmRiskFromRating(rating.rating)],
      ['cvss', 'a CVSS vector', tmRiskFromScore(cvssScore)],
      ['score', 'a score', tmRiskFromScore(oldScore)],
    ].filter(([, , risk]) => risk);
    if (ways.length > 1) {
      warn(t.line, `threat ${t.id || `"${t.title}"`} is rated ${ways.length} ways (${ways.map((w) => w[1]).join(', ')}): ${ways[0][1]} is used, so remove the others`);
    }
    const method = ways.length ? ways[0][0] : '';
    const score = cvssScore ?? oldScore;

    let status = tmStatusOf(tags) || 'open';
    if (t.attrs.status) {
      const s = tmValText(t.attrs.status).toLowerCase();
      if (TM_STATUSES.includes(s)) status = s;
      else warn(t.attrs.status.line, `status "${s}" isn't one of ${TM_STATUSES.join(', ')}`);
    }

    // what the threat is about: where it is written (unless that is the top level), and anything named in "on"
    const targets = [];
    if (t.target.type === 'flow') targets.push({ type: 'flow', n: flowOfRaw.get(t.target.flow).n });
    else if (t.target.type !== 'model') targets.push({ type: t.target.type, id: t.target.id });
    if (t.attrs.on) {
      const refs = t.attrs.on.type === 'list' ? t.attrs.on.value : [t.attrs.on];
      for (const r of refs) {
        if (r.type === 'flowref') {
          let match = flows.filter((f) => f.from === r.from && f.to === r.to);
          if (r.label) match = match.filter((f) => f.label.toLowerCase() === r.label.toLowerCase());
          if (!match.length) err(r.line, `on: there is no flow ${r.from} -> ${r.to}${r.label ? ` "${r.label}"` : ''}`);
          for (const f of match) targets.push({ type: 'flow', n: f.n });
        } else if (r.type === 'id' && (isElement(r.value) || isZone(r.value))) targets.push({ type: isZone(r.value) ? 'zone' : 'element', id: r.value });
        else err(r.line, `on: ${r.type === 'id' ? nameProblem(r.value, 'an element or zone') : `"${tmValText(r)}" isn't an element, zone or flow (a -> b)`}`);
      }
    }
    const seen = new Set();
    const unique = targets.filter((x) => {
      const k = `${x.type}:${x.n || x.id}`;
      return seen.has(k) ? false : seen.add(k);
    });
    const whereOf = (x) => {
      if (x.type === 'flow') {
        const f = flows[x.n - 1];
        return `(${f.n}) ${titleOf(f.from)} → ${titleOf(f.to)}`;
      }
      if (x.type === 'zone') return `${(zoneById.get(x.id) || {}).title || x.id} (zone)`;
      return titleOf(x.id);
    };
    const where = unique.length ? unique.map(whereOf).join('; ') : 'Whole model';
    const target = unique[0] || { type: 'model', id: null };

    return {
      id: t.id,
      title: t.title,
      tags,
      stride,
      risk: ways.length ? ways[0][2] : '',
      method,
      ...rating,
      status,
      score,
      cvss,
      mitigation: tmValText(t.attrs.mitigation),
      description: tmValText(t.attrs.description),
      owner: tmValText(t.attrs.owner),
      target,
      targets: unique,
      where,
      line: t.line,
    };
  });
  for (const t of threats) {
    for (const x of t.targets) {
      if (x.type === 'flow') flows[x.n - 1].threats.push(t);
      else if (x.type === 'element' && elById.has(x.id)) elById.get(x.id).threats.push(t);
      else if (x.type === 'zone' && zoneById.has(x.id)) (zoneById.get(x.id).threats ||= []).push(t);
    }
  }
  for (const z of zones) z.threats ||= [];

  // ---- controls: what is done (or planned) about threats, each covering threats named either way round
  const controls = tmBuildControls(raw.controls, raw.threats, threats, err, warn);

  // ---- scenarios
  const scenarios = raw.scenarios.map((s) => ({
    id: s.id,
    title: tmValText(s.attrs.title) || s.title || s.id,
    line: s.line,
    steps: s.steps.map((st) => {
      for (const end of [st.from, st.to]) if (!isElement(end)) err(st.line, `step ${st.from} -> ${st.to}: ${nameProblem(end, 'an element')}`);
      let options = flows.filter((f) => f.from === st.from && f.to === st.to);
      if (st.label) options = options.filter((f) => f.label.toLowerCase() === st.label.toLowerCase());
      const flow = options[0] || null;
      if (!flow && isElement(st.from) && isElement(st.to)) {
        warn(st.line, `step ${st.from} -> ${st.to}${st.label ? ` "${st.label}"` : ''} matches no flow: it is drawn dashed`);
      }
      return { from: st.from, to: st.to, label: st.label || (flow ? flow.label : ''), flow: flow ? flow.n : null, line: st.line };
    }),
  }));

  // ---- model settings
  const attrs = raw.attrs;
  const setting = (key, allowed) => {
    if (!attrs[key]) return '';
    const v = tmValText(attrs[key]).toLowerCase();
    if (allowed.includes(v)) return v;
    warn(raw.attrLines[key], `${key} = "${v}" should be one of ${allowed.join(', ')}`);
    return '';
  };
  const defaultView = setting('default_view', TM_VIEWS);
  const level = setting('level', TM_LEVELS);
  let scenarioId = attrs.scenario ? tmValText(attrs.scenario) : '';
  if (scenarioId && !scenarios.some((s) => s.id === scenarioId)) {
    warn(raw.attrLines.scenario, `scenario = ${scenarioId}: there is no scenario with that ID`);
    scenarioId = '';
  }

  // about the model itself, for the report: who, which version, how far reviewed, and what it covers
  const meta = {
    version: tmValText(attrs.version),
    author: tmValText(attrs.author),
    owner: tmValText(attrs.owner),
    status: setting('status', TM_DOC_STATUSES),
    reviewDate: tmValText(attrs.review_date),
    scope: tmValText(attrs.scope),
    outOfScope: tmValList(attrs.out_of_scope),
    assumptions: tmValList(attrs.assumptions),
  };

  const model = {
    title: tmValText(attrs.title),
    meta,
    description: tmValText(attrs.description),
    defaultView,
    level,
    scenarioId,
    elements,
    zones,
    flows,
    threats,
    controls,
    scenarios,
  };
  model.findings = errors.length ? [] : tmFindings(model);
  return { model, errors, warnings };
}

/** Lookups used by the views. */
const tmElement = (model, id) => model.elements.find((e) => e.id === id);
const tmZone = (model, id) => model.zones.find((z) => z.id === id);

/** { crosses, crossing } for a flow from element a to element b: crossing is null, or { within: a zone ID or null }. */
function tmFlowCrossing(a, b, zoneById) {
  if (!a || !b || a.zone === b.zone) return { crosses: false, crossing: null };
  const up = (id) => {
    const out = [];
    for (let z = zoneById.get(id), n = 0; z && n < 50; z = zoneById.get(z.parent), n++) out.push(z.id);
    return out;
  };
  const there = up(b.zone);
  return { crosses: true, crossing: { within: up(a.zone).find((z) => there.includes(z)) || null } };
}
