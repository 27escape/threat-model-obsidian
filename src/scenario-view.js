// One scenario on the Structure and Data flow views: the model cut down to the flows its steps follow, the elements
// at their ends (with the systems and containers around them, so the nesting still draws) and the zones those are
// in. Diagram IDs are the whole model's, so clicks and footprints still find the right things.

/** The model as the views draw it for scenario `id` ('' or unknown: the whole model). */
function tmScenarioModel(model, id) {
  const s = id && model.scenarios.find((x) => x.id === id);
  if (!s) return model;
  const byId = new Map(model.elements.map((e) => [e.id, e]));
  const ns = new Set(s.steps.map((st) => st.flow).filter(Boolean)); // steps that match no flow aren't drawn here
  const flows = model.flows.filter((f) => ns.has(f.n));
  const keep = new Set(flows.flatMap((f) => [f.from, f.to]));
  for (const e of [...keep]) for (let p = byId.get(e) && byId.get(e).parent, n = 0; p && n < 50; p = byId.get(p) && byId.get(p).parent, n++) keep.add(p);
  const elements = model.elements.filter((e) => keep.has(e.id)).map((e) => ({ ...e, children: e.children.filter((c) => keep.has(c)) }));
  // the zones the elements are in, and the zones around those
  const zoneById = new Map(model.zones.map((z) => [z.id, z]));
  const zoneKeep = new Set();
  for (const e of elements) for (let z = zoneById.get(e.zone), n = 0; z && n < 50; z = zoneById.get(z.parent), n++) zoneKeep.add(z.id);
  const shown = new Set([...keep]);
  const threats = model.threats.filter(
    (t) => t.target.type === 'model' || t.targets.some((x) => (x.type === 'flow' && ns.has(x.n)) || (x.type === 'element' && shown.has(x.id)) || (x.type === 'zone' && zoneKeep.has(x.id)))
  );
  return {
    ...model,
    elements,
    zones: model.zones.filter((z) => zoneKeep.has(z.id)),
    flows,
    threats,
    findings: (model.findings || []).filter((f) => ns.has(f.flow)),
    mmIds: tmMmIds(model), // the whole model's diagram IDs
  };
}
