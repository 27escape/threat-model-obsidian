// New elements, flows and scenarios from the Add forms (add-forms.js), and scenarios changed or deleted. Each new
// statement goes where the model already keeps that kind of thing: an element inside its parent, or after the other
// elements; a flow after the other flows; a scenario at the end. Uses the edit engine (edit.js) and item-edits.js.

const twAttrsText = (pairs) => pairs.filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) => `${k} = ${tmFormatValue(v)}`);

/** "head { a  b }" for two short attributes or fewer, otherwise a block with one to a line. */
function twStatement(head, attrs, unit) {
  if (!attrs.length) return head;
  const one = `${head} { ${attrs.join('  ')} }`;
  if (attrs.length <= 2 && one.length <= 100) return one;
  return `${head} {\n${attrs.map((a) => unit + a).join('\n')}\n}`;
}

/** Whether a statement starts at the very start of its line, so is at the top level of the text. */
const twAtTop = (text, item) => item.src.from === tmLineStart(text, item.src.from);

/** Put a top-level statement after the last of `after` (written at the top level), or before the first of `before`, or at the end. */
function twPlace(text, statement, after, before) {
  const last = after.filter((x) => twAtTop(text, x)).pop();
  if (last) {
    const at = tmLineEnd(text, last.src.to);
    return tmSplice(text, at, at, `\n${statement}`);
  }
  const first = before.filter((x) => twAtTop(text, x))[0];
  if (first) {
    const at = tmLineStart(text, first.src.from);
    return tmSplice(text, at, at, `${statement}\n\n`);
  }
  return tmInsertInto(text, { type: 'model' }, statement);
}

/** A new element: { kind, title, id?, parent?, zone?, technology?, description?, icon? }. Returns { text, id }. */
function twAddElement(text, f) {
  const raw = tmEditParse(text);
  if (!TM_KINDS.includes(f.kind)) throw new TmEditError(`"${f.kind}" isn't a kind of element`);
  const title = String(f.title || '').trim();
  if (!title) throw new TmEditError('give it a name');
  const id = twNewId(raw, f.id, title, f.kind);
  const attrs = twAttrsText([
    ['technology', (f.technology || '').trim()],
    ['zone', f.zone ? { id: f.zone } : null],
    ['icon', (f.icon || '').trim()],
    ['description', (f.description || '').trim()],
  ]);
  const unit = tmIndentUnit(text);
  const statement = twStatement(`${f.kind} ${id} ${tmQuote(title)}`, attrs, unit);
  if (f.parent) {
    const parent = raw.elements.find((e) => e.id === f.parent);
    if (!parent) throw new TmEditError(`there is no element ${f.parent}`);
    if (!(TM_CONTAINS[parent.kind] || []).includes(f.kind)) throw new TmEditError(`a ${f.kind} can't go inside a ${parent.kind}`);
    return { text: twInsertChild(text, { type: 'element', id: f.parent }, statement), id };
  }
  return { text: twPlace(text, statement, raw.elements.filter((e) => !e.parent), raw.flows), id };
}

/**
 * A statement inside an element, on a line of its own: the edit engine's tmInsertInto keeps a short block on one
 * line, which suits an attribute but not an element, so a block that is missing, empty or on one line is opened out.
 */
function twInsertChild(text, ref, statement) {
  const item = tmEditFind(tmEditParse(text), ref);
  const block = item.src.block;
  const indent = tmIndentAt(text, item.src.from);
  const child = indent + tmIndentUnit(text);
  const lines = (...xs) => `{\n${xs.map((x) => child + x).join('\n')}\n${indent}}`;
  const it = tmIndentLines(statement, child);
  if (!block) return tmSplice(text, item.src.head, item.src.head, ` ${lines(it)}`);
  const inner = text.slice(block.open + 1, block.close).trim();
  if (!inner) return tmSplice(text, block.open, block.close + 1, lines(it));
  if (!text.slice(block.open + 1, block.close).includes('\n')) return tmSplice(text, block.open, block.close + 1, lines(inner, it));
  return tmInsertInto(text, ref, statement);
}

/** An ID given (checked) or made from the name. */
function twNewId(raw, given, title, fallback) {
  const id = String(given || '').trim() || twIdFrom(raw, title, fallback);
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) throw new TmEditError(`"${id}" can't be an ID: letters, digits, _ and -, starting with a letter`);
  if (TM_RESERVED.includes(id)) throw new TmEditError(`"${id}" is a keyword, so it can't be an ID`);
  if (twIdFrom(raw, id, id) !== id) throw new TmEditError(`the ID ${id} is already used`);
  return id;
}

/** A new flow: { from, to, label?, protocol?, encrypted?, authenticated?, data?, description? }. Returns { text, n }. */
function twAddFlow(text, f) {
  const raw = tmEditParse(text);
  for (const end of [f.from, f.to]) if (!raw.elements.some((e) => e.id === end)) throw new TmEditError(`choose where the flow ${end ? `ends (there is no ${end})` : 'starts and ends'}`);
  if (f.from === f.to) throw new TmEditError('a flow goes from one element to another');
  const attrs = twAttrsText([
    ['protocol', (f.protocol || '').trim()],
    ['encrypted', f.encrypted === null || f.encrypted === undefined ? null : f.encrypted],
    ['authenticated', f.authenticated === null || f.authenticated === undefined ? null : f.authenticated],
    ['data', (f.data || []).map((d) => d.trim()).filter(Boolean)],
    ['description', (f.description || '').trim()],
  ]);
  const label = String(f.label || '').trim();
  const statement = twStatement(`${f.from} -> ${f.to}${label ? ` ${tmQuote(label)}` : ''}`, attrs, tmIndentUnit(text));
  const out = twPlace(text, statement, raw.flows, [...raw.threats, ...raw.controls, ...raw.scenarios]);
  // its number: flows are numbered in the order written
  const after = tmEditParse(out).flows;
  const n = after.findIndex((x, i) => !raw.flows[i] || x.from !== raw.flows[i].from || x.to !== raw.flows[i].to || x.label !== raw.flows[i].label) + 1;
  return { text: out, n: n || after.length };
}

/** A scenario's text: its steps, one to a line. steps: [{ from, to, label }]. */
function twScenarioText(id, title, steps, unit) {
  const lines = steps.map((s) => `${unit}${s.from} -> ${s.to}${s.label ? ` ${tmQuote(s.label)}` : ''}`);
  return `scenario ${id} ${tmQuote(title)} {\n${lines.join('\n')}\n}`;
}

/** A new scenario at the end: { title, id?, steps }. Returns { text, id }. */
function twAddScenario(text, f) {
  const raw = tmEditParse(text);
  const title = String(f.title || '').trim();
  if (!title) throw new TmEditError('give the scenario a name');
  if (!f.steps || !f.steps.length) throw new TmEditError('a scenario needs at least one step');
  const id = twNewId(raw, f.id, title, 'scenario');
  return { text: tmInsertInto(text, { type: 'model' }, twScenarioText(id, title, f.steps, tmIndentUnit(text))), id };
}

/** A scenario's name and steps: the steps are written afresh (a comment among them goes), anything else is kept. */
function twEditScenario(text, id, f) {
  const ref = { type: 'scenario', id };
  const s = tmEditFind(tmEditParse(text), ref);
  const title = String(f.title || '').trim();
  if (title && title !== s.title) text = tmSetTitle(text, ref, title);
  if (!f.steps) return text;
  if (!f.steps.length) throw new TmEditError('a scenario needs at least one step');
  const same = f.steps.length === s.steps.length && f.steps.every((x, i) => x.from === s.steps[i].from && x.to === s.steps[i].to && (x.label || null) === (s.steps[i].label || null));
  if (same) return text;
  const now = tmEditFind(tmEditParse(text), ref);
  const indent = tmIndentAt(text, now.src.from) + tmIndentUnit(text);
  // the steps out, the new ones in where the first was (or before the "}")
  let out = text;
  for (const st of [...now.steps].reverse()) {
    const ls = tmLineStart(out, st.src.from);
    const le = tmLineEnd(out, st.src.to);
    out = tmOnlySpaceBefore(out, st.src.from) && !out.slice(st.src.to, le).trim() ? tmSplice(out, ls, Math.min(le + 1, out.length), '') : tmSplice(out, st.src.from, st.src.to, '');
  }
  const after = tmEditFind(tmEditParse(out), ref);
  const close = after.src.block.close;
  const steps = f.steps.map((x) => `${indent}${x.from} -> ${x.to}${x.label ? ` ${tmQuote(x.label)}` : ''}\n`).join('');
  const at = tmOnlySpaceBefore(out, close) ? tmLineStart(out, close) : close;
  return tmSplice(out, at, at, tmOnlySpaceBefore(out, close) ? steps : `\n${steps}${tmIndentAt(out, after.src.from)}`);
}

function twDeleteScenario(text, id) {
  return tmRemoveStatement(text, { type: 'scenario', id });
}
