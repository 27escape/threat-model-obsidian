// Edits to threats, from the edit engine's own (edit.js): the form for a threat hands over the fields it shows, and
// only what changed is written, in the way the model already writes it (a status as a #tag or as status = "…",
// STRIDE letters together as #STR or apart as #S #T #R).
//
// Fields (all optional): title, stride (letters, such as ['S', 'T']), likelihood, impact, residual_likelihood,
// residual_impact (1 to 5, or null to take away), status ('open', 'mitigated', 'accepted', 'transferred'), owner,
// mitigation, description (text, '' or null to take away), controls (control IDs), on (refs to elements, zones and
// flows: { id } or { flow: { from, to, label } }).

const TM_THREAT_TEXT_FIELDS = ['owner', 'mitigation', 'description'];
const TM_THREAT_RATINGS = ['likelihood', 'impact', 'residual_likelihood', 'residual_impact'];

/** The next free threat ID, following the model's own pattern: after T01, T02 comes T03; after SHOP-03, SHOP-04. */
function tmNextThreatId(raw) {
  const ids = raw.threats.map((t) => t.id).filter(Boolean);
  let prefix = 'T';
  let width = 2;
  let top = 0;
  for (const id of ids) {
    const m = /^(.*?)(\d+)$/.exec(id);
    if (!m) continue;
    const n = Number(m[2]);
    if (n >= top) {
      top = n;
      prefix = m[1];
      width = m[2].length;
    }
  }
  const used = new Set(ids);
  for (let n = top + 1; ; n++) {
    const id = `${prefix}${String(n).padStart(width, '0')}`;
    if (!used.has(id)) return id;
  }
}

/** Set a threat's STRIDE letters: written where the first STRIDE tag was, together if they were, else apart. */
function tmSetStride(text, ref, letters) {
  const want = TM_STRIDE_ORDER.filter((l) => letters.includes(l));
  const item = tmEditFind(tmEditParse(text), ref);
  const isStride = (tag) => tmIsStrideLetters(tag) || !!TM_STRIDE_WORDS[tag.toLowerCase()];
  const had = item.src.tags.filter((t) => isStride(t.value));
  if (tmStrideOf(had.map((t) => t.value)).join('') === want.join('')) return text;
  const together = had.length === 1 && had[0].value.length > 1 && tmIsStrideLetters(had[0].value);
  const tags = !want.length ? '' : together || !had.length ? `#${want.join('')}` : want.map((l) => `#${l}`).join(' ');
  if (!had.length) return tags ? tmSplice(text, item.src.title.to, item.src.title.to, ` ${tags}`) : text;
  // the new tags where the first STRIDE tag was; the others go
  const first = had[0];
  text = tmRemoveTags(text, ref, (tag) => isStride(tag) && tag !== first.value);
  const again = tmEditFind(tmEditParse(text), ref).src.tags.find((t) => t.value === first.value);
  if (tags) return tmSplice(text, again.from, again.to, tags);
  let from = again.from;
  while (from > 0 && (text[from - 1] === ' ' || text[from - 1] === '\t')) from--;
  return tmSplice(text, from, again.to, '');
}

/** Set a threat's status: in its status tag if it has one, otherwise as status = "…" (left out when open). */
function tmSetThreatStatus(text, ref, status) {
  if (!TM_STATUSES.includes(status)) throw new TmEditError(`"${status}" isn't a status (${TM_STATUSES.join(', ')})`);
  const item = tmEditFind(tmEditParse(text), ref);
  const tag = item.src.tags.find((t) => TM_STATUSES.includes(t.value.toLowerCase()));
  if (tag) {
    text = tmSplice(text, tag.from, tag.to, `#${status}`);
    return tmSetAttr(text, ref, 'status', null);
  }
  if (status === 'open' && !(item.attrSpans && item.attrSpans.status)) return text;
  return tmSetAttr(text, ref, 'status', status);
}

/** Change a threat to match the fields given; only what differs from the text is written. */
function tmEditThreat(text, ref, fields) {
  if (ref.type !== 'threat') throw new TmEditError('only a threat can be edited this way');
  if (fields.title !== undefined) {
    if (!String(fields.title).trim()) throw new TmEditError('a threat needs a title');
    const t = tmEditFind(tmEditParse(text), ref);
    if (t.title !== fields.title) text = tmSetTitle(text, ref, fields.title);
  }
  if (fields.stride) text = tmSetStride(text, ref, fields.stride);
  if (fields.status) text = tmSetThreatStatus(text, ref, fields.status);
  // attributes the threat already has are changed (or taken away) where they are; new ones are added together, so a
  // threat given several at once gets a block with one to a line
  const adds = [];
  const put = (key, value, same) => {
    const t = tmEditFind(tmEditParse(text), ref);
    const now = t.attrs[key];
    if (value === null) {
      if (now) text = tmSetAttr(text, ref, key, null);
    } else if (!now) adds.push(`${key} = ${tmFormatValue(value)}`);
    else if (!same(now)) text = tmSetAttr(text, ref, key, value);
  };
  for (const key of TM_THREAT_RATINGS) {
    if (fields[key] === undefined) continue;
    const v = fields[key];
    if (v !== null && !(Number.isInteger(v) && v >= 1 && v <= 5)) throw new TmEditError(`${key} must be from 1 to 5`);
    put(key, v, (now) => tmRatingOf(now) === v);
  }
  // likelihood and impact rate the threat, so a risk tag rating it as well goes (one rating per threat)
  if (fields.likelihood || fields.impact) text = tmRemoveTags(text, ref, (tag) => TM_RISKS.includes(tag.toLowerCase()));
  for (const key of TM_THREAT_TEXT_FIELDS) {
    if (fields[key] === undefined) continue;
    const v = fields[key] === null ? '' : String(fields[key]).trim();
    put(key, v ? v : null, (now) => tmValText(now) === v);
  }
  for (const key of ['controls', 'on']) {
    if (fields[key] === undefined) continue;
    const list = fields[key].map((x) => (typeof x === 'string' ? { id: x } : x));
    put(key, list.length ? list : null, (now) => tmFormatValue(tmRawToValue(now)) === tmFormatValue(list));
  }
  if (adds.length) text = tmInsertInto(text, ref, adds.join('\n'));
  return text;
}

/** A likelihood or impact as written (a number or a word) as its number from 1 to 5, or null. */
function tmRatingOf(v) {
  const t = tmValText(v).toLowerCase();
  if (/^[1-5]$/.test(t)) return Number(t);
  return TM_LIKELIHOOD_WORDS[t] || TM_IMPACT_WORDS[t] || null;
}

/** A parsed value back as an edit value (for comparing what is written with what is wanted). */
function tmRawToValue(v) {
  if (v.type === 'list') return v.value.map(tmRawToValue);
  if (v.type === 'flowref') return { flow: { from: v.from, to: v.to, label: v.label } };
  if (v.type === 'id') return { id: v.value };
  if (v.type === 'tag') return { tag: v.value };
  return v.value;
}

/** A new threat as text: threat ID "Title" #STRIDE { attributes, one to a line }. */
function tmThreatStatement(fields, unit = '  ') {
  if (!fields.title || !String(fields.title).trim()) throw new TmEditError('a threat needs a title');
  const stride = TM_STRIDE_ORDER.filter((l) => (fields.stride || []).includes(l));
  let head = `threat ${fields.id ? `${fields.id} ` : ''}${tmQuote(String(fields.title).trim())}${stride.length ? ` #${stride.join('')}` : ''}`;
  if (fields.status && fields.status !== 'open') head += ` #${fields.status}`;
  const lines = [];
  for (const key of [...TM_THREAT_RATINGS]) if (fields[key]) lines.push(`${key} = ${fields[key]}`);
  for (const key of ['on', 'controls']) {
    const list = (fields[key] || []).map((x) => (typeof x === 'string' ? { id: x } : x));
    if (list.length) lines.push(`${key} = ${tmFormatValue(list)}`);
  }
  for (const key of TM_THREAT_TEXT_FIELDS) if (fields[key] && String(fields[key]).trim()) lines.push(`${key} = ${tmQuote(String(fields[key]).trim())}`);
  return lines.length ? `${head} {\n${lines.map((l) => unit + l).join('\n')}\n}` : head;
}

/**
 * Add a threat to an element, zone or flow (inside its block) or to the whole model (at the end). Gives it the next
 * free ID unless the fields name one. Returns { text, id }.
 */
function tmAddThreat(text, ref, fields) {
  const raw = tmEditParse(text);
  if (!['model', 'element', 'zone', 'flow'].includes(ref.type)) throw new TmEditError(`a threat can't be added to a ${ref.type}`);
  tmEditFind(raw, ref);
  const id = fields.id || tmNextThreatId(raw);
  if (raw.threats.some((t) => t.id === id)) throw new TmEditError(`there is already a threat ${id}`);
  return { text: tmInsertInto(text, ref, tmThreatStatement({ ...fields, id }, tmIndentUnit(text))), id };
}

/** Delete a threat, and take its ID out of the controls that cover it (a control left covering nothing keeps going). */
function tmDeleteThreat(text, ref) {
  const t = tmEditFind(tmEditParse(text), ref);
  text = tmRemoveStatement(text, ref);
  if (!t.id) return text;
  for (const c of tmEditParse(text).controls) {
    const covers = c.attrs.covers;
    if (!covers) continue;
    const ids = (covers.type === 'list' ? covers.value : [covers]).map((v) => tmValText(v));
    if (!ids.includes(t.id)) continue;
    const left = ids.filter((id) => id !== t.id);
    text = tmSetAttr(text, { type: 'control', id: c.id }, 'covers', left.length ? left.map((id) => ({ id })) : null);
  }
  return text;
}
