// Edits to elements, zones, flows and controls, from their forms in the web app (item-forms.js), made with the edit
// engine's own functions (edit.js): only what changed is written, in the way the model already writes it. Kept in
// the web app for now; they can join the engine when the plugin gets the same forms.
//
// fields hold what a form shows: strings ('' to take an attribute away), null for "not said", true or false, lists.

/** Change one attribute to `value` (null: take it away) unless what is written already means the same. */
function twPut(text, ref, key, value, same) {
  const item = tmEditFind(tmEditParse(text), ref);
  const now = item.attrs[key];
  if (value === null || value === '' || (Array.isArray(value) && !value.length)) return now ? tmSetAttr(text, ref, key, null) : text;
  if (now && same(now)) return text;
  return tmSetAttr(text, ref, key, value);
}
const twSameText = (v) => (now) => tmValText(now) === v;
const twSameList = (list) => (now) => JSON.stringify(tmValList(now)) === JSON.stringify(list);

/** The title in the header (or a title attribute), unless unchanged. */
function twPutTitle(text, ref, title) {
  const item = tmEditFind(tmEditParse(text), ref);
  const now = item.attrs.title ? tmValText(item.attrs.title) : ref.type === 'flow' ? item.label || (item.attrs.label ? tmValText(item.attrs.label) : '') : item.title || '';
  return title === now ? text : tmSetTitle(text, ref, title);
}

/** An element: title, technology, zone (an ID, or '' for none), icon, link, description. */
function twEditElement(text, id, f) {
  const ref = { type: 'element', id };
  if (f.title !== undefined && f.title.trim()) text = twPutTitle(text, ref, f.title.trim());
  for (const key of ['technology', 'icon', 'link', 'description']) if (f[key] !== undefined) text = twPut(text, ref, key, f[key].trim(), twSameText(f[key].trim()));
  if (f.zone !== undefined) text = twPut(text, ref, 'zone', f.zone ? { id: f.zone } : null, twSameText(f.zone));
  return text;
}

/** A zone: title, trust, description. */
function twEditZone(text, id, f) {
  const ref = { type: 'zone', id };
  if (f.title !== undefined && f.title.trim()) text = twPutTitle(text, ref, f.title.trim());
  for (const key of ['trust', 'description']) if (f[key] !== undefined) text = twPut(text, ref, key, f[key].trim(), twSameText(f[key].trim()));
  return text;
}

/** A flow: label, protocol, encrypted and authenticated (true, false or null), data (a list), description. */
function twEditFlow(text, n, f) {
  const ref = { type: 'flow', n };
  if (f.label !== undefined && f.label.trim()) text = twPutTitle(text, ref, f.label.trim());
  for (const key of ['protocol', 'description']) if (f[key] !== undefined) text = twPut(text, ref, key, f[key].trim(), twSameText(f[key].trim()));
  for (const key of ['encrypted', 'authenticated']) if (f[key] !== undefined) text = twPut(text, ref, key, f[key], (now) => tmValText(now).toLowerCase() === String(f[key]));
  if (f.data !== undefined) {
    const list = f.data.map((d) => d.trim()).filter(Boolean);
    text = twPut(text, ref, 'data', list, twSameList(list));
  }
  return text;
}

/** A control's status: in its status tag if it has one, otherwise as status = "…" (left out when planned). */
function twSetControlStatus(text, id, status) {
  if (!TM_CONTROL_STATUSES.includes(status)) throw new TmEditError(`"${status}" isn't a control's status`);
  const ref = { type: 'control', id };
  const c = tmEditFind(tmEditParse(text), ref);
  const tag = c.src.tags.find((t) => TM_CONTROL_STATUSES.includes(t.value.toLowerCase()));
  const attr = c.attrs.status ? tmValText(c.attrs.status).toLowerCase() : '';
  if ((attr || (tag ? tag.value.toLowerCase() : 'planned')) === status) return text;
  if (tag) return tmSetAttr(tmSplice(text, tag.from, tag.to, `#${status}`), ref, 'status', null);
  return tmSetAttr(text, ref, 'status', status === 'planned' && !attr ? null : status);
}

/** A control: title, status, covers (threat IDs), owner, due, description. */
function twEditControl(text, id, f) {
  const ref = { type: 'control', id };
  if (f.title !== undefined) {
    if (!f.title.trim()) throw new TmEditError('a control needs a title');
    text = twPutTitle(text, ref, f.title.trim());
  }
  if (f.status) text = twSetControlStatus(text, id, f.status);
  if (f.covers !== undefined) text = twPut(text, ref, 'covers', f.covers.map((x) => ({ id: x })), twSameList(f.covers));
  for (const key of ['owner', 'due', 'description']) if (f[key] !== undefined) text = twPut(text, ref, key, f[key].trim(), twSameText(f[key].trim()));
  return text;
}

/** The next free ID after the highest in a list that ends in a number, keeping its prefix and width ("C01" → "C02"). */
function twNextId(ids, prefix) {
  let width = 2;
  let top = 0;
  for (const id of ids) {
    const m = /^(.*?)(\d+)$/.exec(id || '');
    if (m && Number(m[2]) >= top) {
      prefix = m[1];
      top = Number(m[2]);
      width = m[2].length;
    }
  }
  const used = new Set(ids);
  for (let n = top + 1; ; n++) {
    const id = `${prefix}${String(n).padStart(width, '0')}`;
    if (!used.has(id)) return id;
  }
}

/** A new control at the end of the model: { text, id }. */
function twAddControl(text, f) {
  const raw = tmEditParse(text);
  const id = twNextId(raw.controls.map((c) => c.id), 'C');
  if (!f.title || !f.title.trim()) throw new TmEditError('a control needs a title');
  const lines = [];
  if (f.covers && f.covers.length) lines.push(`covers = ${tmFormatValue(f.covers.map((x) => ({ id: x })))}`);
  for (const key of ['owner', 'due', 'description']) if (f[key] && f[key].trim()) lines.push(`${key} = ${tmQuote(f[key].trim())}`);
  const unit = tmIndentUnit(text);
  const head = `control ${id} ${tmQuote(f.title.trim())}${f.status && f.status !== 'planned' ? ` #${f.status}` : ''}`;
  const statement = lines.length ? `${head} {\n${lines.map((l) => unit + l).join('\n')}\n}` : head;
  return { text: tmInsertInto(text, { type: 'model' }, statement), id };
}

/** Delete a control, and take its ID out of the threats that name it in "controls". */
function twDeleteControl(text, id) {
  text = tmRemoveStatement(text, { type: 'control', id });
  tmEditParse(text).threats.forEach((t, index) => {
    const now = t.attrs.controls;
    if (!now) return;
    const ids = tmValList(now);
    if (!ids.includes(id)) return;
    const left = ids.filter((x) => x !== id);
    const ref = t.id ? { type: 'threat', id: t.id } : { type: 'threat', index };
    text = tmSetAttr(text, ref, 'controls', left.length ? left.map((x) => ({ id: x })) : null);
  });
  return text;
}

/**
 * Rate a threat one way, taking away any other: fields.method is 'li' (likelihood × impact, written by tmEditThreat),
 * 'tag' (fields.risk as a #tag) or 'cvss' (fields.cvss, a vector). What already says the same is left alone.
 */
function twSetRating(text, ref, fields) {
  const t = () => tmEditFind(tmEditParse(text), ref);
  const riskTags = () => t().src.tags.filter((x) => TM_RISKS.includes(x.value.toLowerCase()));
  const dropRiskTags = () => (text = tmRemoveTags(text, ref, (tag) => TM_RISKS.includes(tag.toLowerCase())));
  if (fields.method !== 'cvss') text = twPut(text, ref, 'cvss', null, () => false);
  if (fields.method === 'tag') {
    if (!TM_RISKS.includes(fields.risk)) throw new TmEditError(`"${fields.risk}" isn't a risk`);
    for (const key of ['likelihood', 'impact', 'residual_likelihood', 'residual_impact']) text = twPut(text, ref, key, null, () => false);
    const now = riskTags();
    if (now.length === 1 && now[0].value.toLowerCase() === fields.risk) return text;
    dropRiskTags();
    return tmAddTag(text, ref, fields.risk);
  }
  if (fields.method === 'cvss') {
    const r = tmCvss(fields.cvss);
    if (r.error) throw new TmEditError(r.error);
    // the vector first, so a block the old rating was in is kept for it
    text = twPut(text, ref, 'cvss', fields.cvss.trim(), twSameText(fields.cvss.trim()));
    for (const key of ['likelihood', 'impact', 'residual_likelihood', 'residual_impact']) text = twPut(text, ref, key, null, () => false);
    dropRiskTags();
    return text;
  }
  if (fields.likelihood || fields.impact) dropRiskTags();
  return text;
}

/** A threat changed from its form: its fields (tmEditThreat), then how it is rated. */
function twEditThreat(text, ref, fields) {
  return twSetRating(tmEditThreat(text, ref, fields), ref, fields);
}

/** A new threat from its form: { text, id }. */
function twAddThreat(text, ref, fields) {
  const added = tmAddThreat(text, ref, fields);
  return { text: twSetRating(added.text, { type: 'threat', id: added.id }, fields), id: added.id };
}

// ---- zones

/** An ID from a name, not yet used in the model: "Partner network" → "partner_network" (then partner_network2 …). */
function twIdFrom(raw, name, fallback) {
  const used = new Set([...raw.elements, ...raw.zones, ...raw.scenarios, ...raw.controls, ...raw.threats].map((x) => x.id).filter(Boolean));
  let base = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^[^a-z]+|_+$/g, '') || fallback;
  if (TM_RESERVED.includes(base)) base += '_zone';
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}${n}`)) return `${base}${n}`;
}

/** A new zone, after the other zones written at the top level (or before the first element): { text, id }. */
function twAddZone(text, f) {
  const raw = tmEditParse(text);
  const title = String(f.title || '').trim();
  if (!title) throw new TmEditError('a zone needs a name');
  const id = (f.id || '').trim() || twIdFrom(raw, title, 'zone');
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) throw new TmEditError(`"${id}" can't be an ID: letters, digits, _ and -, starting with a letter`);
  if (twIdFrom(raw, id, id) !== id) throw new TmEditError(`the ID ${id} is already used`);
  const attrs = [];
  if (f.trust && f.trust.trim()) attrs.push(`trust = ${tmQuote(f.trust.trim())}`);
  if (f.description && f.description.trim()) attrs.push(`description = ${tmQuote(f.description.trim())}`);
  const statement = `zone ${id} ${tmQuote(title)}${attrs.length ? ` { ${attrs.join('  ')} }` : ''}`;
  const top = raw.zones.filter((z) => !z.parent);
  if (top.length) {
    const at = tmLineEnd(text, top[top.length - 1].src.to);
    return { text: tmSplice(text, at, at, `\n${statement}`), id };
  }
  const first = raw.elements[0] || raw.flows[0];
  if (first) {
    const at = tmLineStart(text, first.src.from);
    return { text: tmSplice(text, at, at, `${statement}\n\n`), id };
  }
  return { text: tmInsertInto(text, { type: 'model' }, statement), id };
}

/** Delete a zone with nothing in it; refused while anything is written inside it, or names it. */
function twDeleteZone(text, id) {
  const raw = tmEditParse(text);
  const inside = [...raw.elements.filter((e) => e.zoneBlock === id && !e.parent), ...raw.zones.filter((z) => z.parent === id)];
  if (inside.length) throw new TmEditError(`move what is written inside it out first: ${inside.map((x) => x.title || x.id).join(', ')}`);
  const naming = raw.elements.filter((e) => e.attrs.zone && tmValText(e.attrs.zone) === id);
  if (naming.length) throw new TmEditError(`put these in another zone first: ${naming.map((e) => e.title || e.id).join(', ')}`);
  return tmRemoveStatement(text, { type: 'zone', id });
}
